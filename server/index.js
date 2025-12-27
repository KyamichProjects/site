import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));

// ====== STATIC FRONTEND ======
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/", (_, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/health", (_, res) => res.json({ ok: true }));

// ====== UPLOADS DIR ======
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Раздаём загруженные файлы: /uploads/<file>
app.use("/uploads", express.static(uploadsDir));

// Multer: сохраняем на диск (в Render может быть временно, но работает)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadsDir),
    filename: (_, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const ext = path.extname(safe) || "";
      const base = path.basename(safe, ext).slice(0, 40) || "file";
      cb(null, `${Date.now()}_${Math.random().toString(16).slice(2)}_${base}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/");
    cb(ok ? null : new Error("Only image/video allowed"), ok);
  },
});

// upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "No file" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ ok: true, url, mime: req.file.mimetype, name: req.file.originalname, size: req.file.size });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ====== USERS ======
const users = new Map(); // socket.id -> { nick }

// ====== HISTORY ======
const HISTORY_LIMIT = 300;
const HISTORY_FILE = path.join(__dirname, "history.json");

// voice limits
const VOICE_MAX_SECONDS = 60;
const VOICE_MAX_BASE64_LEN = 2_000_000;

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveHistory(hist) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist, null, 2), "utf-8");
  } catch {}
}

let history = loadHistory();

function safeNick(raw) {
  const nick = String(raw ?? "").trim().slice(0, 20);
  if (!nick) return null;
  return nick.replace(/[<>]/g, "");
}

function safeText(raw) {
  const text = String(raw ?? "").trim().slice(0, 500);
  if (!text) return null;
  return text.replace(/[<>]/g, "");
}

function pushHistory(item) {
  history.push(item);
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  saveHistory(history);
}

io.on("connection", (socket) => {
  socket.on("user:join", (payload, ack) => {
    const nick = safeNick(payload?.nick);
    if (!nick) return ack?.({ ok: false, error: "Неверный ник" });

    users.set(socket.id, { nick });
    ack?.({ ok: true, nick });

    socket.emit("chat:history", { messages: history });

    const sys = { type: "system", text: `@${nick} присоединился`, ts: Date.now() };
    pushHistory(sys);
    socket.broadcast.emit("chat:system", sys);

    io.emit("users:list", { users: [...users.values()].map(u => u.nick) });
  });

  socket.on("chat:message", (payload) => {
    const user = users.get(socket.id);
    if (!user) return;

    const text = safeText(payload?.text);
    if (!text) return;

    const msg = { type: "message", nick: user.nick, text, ts: Date.now() };
    pushHistory(msg);
    io.emit("chat:message", msg);
  });

  // ✅ voice
  socket.on("chat:voice", (payload) => {
    const user = users.get(socket.id);
    if (!user) return;

    const mime = String(payload?.mime || "");
    const b64 = String(payload?.data || "");
    const duration = Number(payload?.seconds || 0);

    if (!mime.startsWith("audio/")) return;
    if (!b64 || b64.length > VOICE_MAX_BASE64_LEN) return;
    if (duration > VOICE_MAX_SECONDS) return;

    const msg = { type: "voice", nick: user.nick, mime, data: b64, ts: Date.now() };
    pushHistory(msg);
    io.emit("chat:voice", msg);
  });

  // ✅ media (image/video)
  socket.on("chat:media", (payload) => {
    const user = users.get(socket.id);
    if (!user) return;

    const kind = String(payload?.kind || ""); // "image" | "video"
    const url = String(payload?.url || "");
    const mime = String(payload?.mime || "");
    const name = String(payload?.name || "").slice(0, 80);

    if (!url.startsWith("/uploads/")) return;
    if (kind !== "image" && kind !== "video") return;
    if (!(mime.startsWith("image/") || mime.startsWith("video/"))) return;

    const msg = { type: "media", kind, url, mime, name, nick: user.nick, ts: Date.now() };
    pushHistory(msg);
    io.emit("chat:media", msg);
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (!user) return;
    users.delete(socket.id);

    const sys = { type: "system", text: `@${user.nick} вышел`, ts: Date.now() };
    pushHistory(sys);
    socket.broadcast.emit("chat:system", sys);

    io.emit("users:list", { users: [...users.values()].map(u => u.nick) });
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
