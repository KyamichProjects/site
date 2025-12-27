import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
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

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ====== USERS ======
const users = new Map(); // socket.id -> { nick }

// ====== HISTORY PERSISTENCE ======
const HISTORY_LIMIT = 300;
const HISTORY_FILE = path.join(__dirname, "history.json");

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("History load error:", e);
    return [];
  }
}

function saveHistory(hist) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist, null, 2), "utf-8");
  } catch (e) {
    console.error("History save error:", e);
  }
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

    // отправить историю только вошедшему
    socket.emit("chat:history", { messages: history });

    // системное (в историю)
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
// Render сам выставляет PORT. 0.0.0.0 обязательно.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
