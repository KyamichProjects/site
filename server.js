import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "public"))); // <-- сайт тут

// чтобы / всегда отдавал index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

// === Настройки ===
const QUESTION_TEXT = "Да или нет?"; // <-- поменяй на свой нормальный текст
const OPTIONS = ["Да", "Нет"];
const SPIN_DURATION_MS = 4500;

// === Состояние ===
let queue = []; // socket.id
let spinning = false;
let spinEndsAt = 0;

function getCurrentTurn() {
  return queue.length ? queue[0] : null;
}

function broadcastState() {
  io.emit("state", {
    question: QUESTION_TEXT,
    options: OPTIONS,
    queueLength: queue.length,
    currentTurnId: getCurrentTurn(),
    spinning,
    spinEndsAt,
  });
}

function removeFromQueue(id) {
  queue = queue.filter((x) => x !== id);
}

function moveTurnToBack() {
  if (queue.length <= 1) return;
  const first = queue.shift();
  queue.push(first);
}

function randomChoice(arr) {
  const idx = Math.floor(Math.random() * arr.length);
  return { idx, value: arr[idx] };
}

io.on("connection", (socket) => {
  // добавляем в очередь
  removeFromQueue(socket.id);
  queue.push(socket.id);

  socket.emit("hello", { id: socket.id });
  broadcastState();

  socket.on("spin", () => {
    const current = getCurrentTurn();
    if (!current || spinning) return;

    if (socket.id !== current) {
      socket.emit("error_msg", { error: "not_your_turn" });
      return;
    }

    spinning = true;
    spinEndsAt = Date.now() + SPIN_DURATION_MS;

    const pick = randomChoice(OPTIONS);

    io.emit("spin_start", {
      by: socket.id,
      endsAt: spinEndsAt,
      durationMs: SPIN_DURATION_MS,
    });

    setTimeout(() => {
      io.emit("spin_result", {
        by: socket.id,
        resultIndex: pick.idx,
        resultValue: pick.value,
      });

      moveTurnToBack();
      spinning = false;
      spinEndsAt = 0;
      broadcastState();
    }, SPIN_DURATION_MS);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    broadcastState();
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Listening on", PORT));
