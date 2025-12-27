import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
app.get("/", (_req, res) => res.send("OK"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

const PORT = process.env.PORT || 10000;

// === Настройки ===
const QUESTION_TEXT = "Да или нет?"; // <-- Поменяй на свой нейтральный вопрос
const OPTIONS = ["Да", "Нет"];
const SPIN_DURATION_MS = 4500;

// === Состояние ===
let queue = []; // массив socket.id
let spinning = false;
let spinEndsAt = 0;

function getCurrentTurn() {
  return queue.length ? queue[0] : null;
}

function broadcastState() {
  const current = getCurrentTurn();
  io.emit("state", {
    question: QUESTION_TEXT,
    options: OPTIONS,
    queueLength: queue.length,
    currentTurnId: current,
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
  // добавляем в очередь (если вдруг переподключение/дубликаты — защищаемся)
  removeFromQueue(socket.id);
  queue.push(socket.id);

  socket.emit("hello", { id: socket.id });
  broadcastState();

  socket.on("spin", () => {
    const current = getCurrentTurn();
    if (!current) return;
    if (spinning) return;
    if (socket.id !== current) {
      socket.emit("error_msg", { error: "not_your_turn" });
      return;
    }

    spinning = true;
    spinEndsAt = Date.now() + SPIN_DURATION_MS;

    // Сервер выбирает результат (авторитетно)
    const pick = randomChoice(OPTIONS);

    // Сообщаем всем старт вращения
    io.emit("spin_start", {
      by: socket.id,
      endsAt: spinEndsAt,
      durationMs: SPIN_DURATION_MS,
      // результат заранее можно не слать, но для честности сервер и так выбирает
    });

    // Через время — сообщаем результат всем
    setTimeout(() => {
      io.emit("spin_result", {
        by: socket.id,
        resultIndex: pick.idx,
        resultValue: pick.value,
      });

      // Меняем очередь
      moveTurnToBack();

      spinning = false;
      spinEndsAt = 0;
      broadcastState();
    }, SPIN_DURATION_MS);
  });

  socket.on("disconnect", () => {
    const wasCurrent = socket.id === getCurrentTurn();
    removeFromQueue(socket.id);

    // Если текущий игрок ушёл во время ожидания — передаём ход следующему
    // Если ушёл во время спина — спин всё равно завершится (можно усложнить, но MVP ок)
    if (wasCurrent && !spinning) {
      // просто обновим состояние — текущим станет следующий
    }
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log("Listening on", PORT);
});
