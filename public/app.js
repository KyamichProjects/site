 const SERVER_URL = window.location.origin;

const authScreen = document.getElementById("authScreen");
const mainApp = document.getElementById("mainApp");

const regForm = document.getElementById("regForm");
const nickInput = document.getElementById("nick");
const toast = document.getElementById("toast");
const enterBtn = document.getElementById("enterBtn");

const meName = document.getElementById("meName");
const meAvatar = document.getElementById("meAvatar");
const statusLine = document.getElementById("statusLine");
const chatSub = document.getElementById("chatSub");

const usersList = document.getElementById("usersList");
const onlineCount = document.getElementById("onlineCount");
const searchInput = document.getElementById("searchInput");

const feed = document.getElementById("feed");
const feedWrap = document.getElementById("feedWrap");

const msgForm = document.getElementById("msgForm");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("sendBtn");

const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");

const micBtn = document.getElementById("micBtn");

const leaveBtn = document.getElementById("leaveBtn");
const mDot = document.getElementById("mDot");
const leaveBtnMobile = document.getElementById("leaveBtnMobile");

let socket = null;
let myNick = null;
let usersCache = [];
let isJoining = false;
let sendLock = false;

// voice
let recorder = null;
let recording = false;
let chunks = [];
let recordStartedAt = 0;

function initials(name){
  const s = (name || "?").trim();
  return s.slice(0,1).toUpperCase();
}
function fmtTime(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString("ru-RU", { hour:"2-digit", minute:"2-digit" });
}
function scrollBottom(){
  feedWrap.scrollTop = feedWrap.scrollHeight;
}
function showToast(text, isError=false){
  toast.textContent = text;
  toast.classList.add("show");
  toast.style.borderColor = isError ? "rgba(239,68,68,.35)" : "rgba(255,255,255,.10)";
  toast.style.color = isError ? "rgba(255,210,210,.95)" : "var(--muted)";
  setTimeout(() => toast.classList.remove("show"), 2400);
}
function setConnected(ok){
  const s = ok ? "Онлайн" : "Оффлайн / переподключение…";
  statusLine.textContent = s;
  chatSub.textContent = s;
  if (mDot) mDot.classList.toggle("ok", ok);
}

function addSystem(text){
  const el = document.createElement("div");
  el.className = "sys";
  el.textContent = text;
  feed.appendChild(el);
  scrollBottom();
}

function addTextMessage({ nick, text, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");
  el.innerHTML = `<div class="nick"></div><div class="text"></div><div class="time"></div>`;
  el.querySelector(".nick").textContent = nick;
  el.querySelector(".text").textContent = text;
  el.querySelector(".time").textContent = fmtTime(ts);
  feed.appendChild(el);
  scrollBottom();
}

function addVoiceMessage({ nick, mime, data, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");
  el.innerHTML = `<div class="nick"></div><div class="time"></div>`;
  el.querySelector(".nick").textContent = nick;
  el.querySelector(".time").textContent = fmtTime(ts);

  const player = document.createElement("audio");
  player.controls = true;

  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime || "audio/webm" });
  player.src = URL.createObjectURL(blob);

  el.insertBefore(player, el.querySelector(".time"));
  feed.appendChild(el);
  scrollBottom();
}

function addMediaMessage({ nick, kind, url, mime, name, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");
  el.innerHTML = `<div class="nick"></div><div class="time"></div>`;
  el.querySelector(".nick").textContent = nick;
  el.querySelector(".time").textContent = fmtTime(ts);

  const wrap = document.createElement("div");
  wrap.className = "media";

  const fullUrl = new URL(url, window.location.origin).toString();

  if (kind === "image"){
    const img = document.createElement("img");
    img.src = fullUrl;
    img.alt = name || "image";
    wrap.appendChild(img);
  } else {
    const video = document.createElement("video");
    video.src = fullUrl;
    video.controls = true;
    video.playsInline = true;
    wrap.appendChild(video);
  }

  el.insertBefore(wrap, el.querySelector(".time"));
  feed.appendChild(el);
  scrollBottom();
}

function renderUsers(list){
  usersCache = list.slice();
  const q = (searchInput.value || "").trim().toLowerCase();
  const filtered = q ? list.filter(u => u.toLowerCase().includes(q)) : list;

  usersList.innerHTML = "";
  filtered.forEach(u => {
    const li = document.createElement("li");
    li.className = "user";
    li.innerHTML = `<div class="uav"></div><div class="uname"></div>`;
    li.querySelector(".uav").textContent = initials(u);
    li.querySelector(".uname").textContent = u;
    usersList.appendChild(li);
  });

  onlineCount.textContent = `${list.length} онлайн`;
}

function showChatUI(){
  authScreen.classList.add("hidden");
  mainApp.classList.remove("hidden");
  msgInput.focus();
}
function showAuthUI(){
  mainApp.classList.add("hidden");
  authScreen.classList.remove("hidden");
  nickInput.focus();
}

function cleanupSocket(){
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

function connectAndJoin(nick){
  if (isJoining) return;
  isJoining = true;
  if (enterBtn) enterBtn.disabled = true;

  cleanupSocket();
  feed.innerHTML = "";

  socket = io(SERVER_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 50
  });

  socket.on("connect", () => setConnected(true));
  socket.on("disconnect", () => setConnected(false));
  socket.on("connect_error", () => setConnected(false));

  socket.on("users:list", (payload) => renderUsers(payload?.users || []));

  socket.on("chat:history", (payload) => {
    const msgs = payload?.messages || [];
    feed.innerHTML = "";
    msgs.forEach(m => {
      if (m.type === "system") addSystem(m.text);
      if (m.type === "message") addTextMessage(m);
      if (m.type === "voice") addVoiceMessage(m);
      if (m.type === "media") addMediaMessage(m);
    });
    scrollBottom();
  });

  socket.on("chat:system", (m) => addSystem(m.text));
  socket.on("chat:message", (m) => addTextMessage(m));
  socket.on("chat:voice", (m) => addVoiceMessage(m));
  socket.on("chat:media", (m) => addMediaMessage(m));

  socket.emit("user:join", { nick }, (res) => {
  isJoining = false;
  if (enterBtn) enterBtn.disabled = false;

  // ✅ если сервер не ответил или ошибка — остаёмся на экране входа
  if (!res || !res.ok) {
    showToast((res && res.error) ? res.error : "Не удалось войти (проверь соединение)", true);
    cleanupSocket();

    // ❌ НЕ удаляем ник
    // ❌ НЕ вызываем showAuthUI()
    return;
  }

  // ✅ успех
  myNick = res.nick;
  meName.textContent = myNick;
  meAvatar.textContent = initials(myNick);
  localStorage.setItem("nick", myNick);
  showChatUI();
});

    myNick = res.nick;
    meName.textContent = myNick;
    meAvatar.textContent = initials(myNick);
    localStorage.setItem("nick", myNick);
    showChatUI();
  });
}

function leave(){
  cleanupSocket();
  setConnected(false);
  usersList.innerHTML = "";
  onlineCount.textContent = "0 онлайн";
  myNick = null;
  localStorage.removeItem("nick");
  showAuthUI();
}

/* send text */
msgForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = (msgInput.value || "").trim();
  if (!text || !socket) return;
  if (sendLock) return;
  sendLock = true;

  socket.emit("chat:message", { text });
  msgInput.value = "";
  setTimeout(() => (sendLock = false), 120);
});

/* ===== upload image/video ===== */
attachBtn.addEventListener("click", () => {
  if (!socket){
    addSystem("Сначала войди в чат");
    return;
  }
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  // лимит на клиенте тоже
  const MAX = 15 * 1024 * 1024;
  if (file.size > MAX){
    addSystem("Файл слишком большой (макс 15MB)");
    return;
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo){
    addSystem("Можно отправлять только фото или видео");
    return;
  }

  addSystem(`Загрузка: ${file.name}…`);

  try{
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "upload failed");

    const kind = isImage ? "image" : "video";
    socket.emit("chat:media", { kind, url: data.url, mime: data.mime, name: data.name });

  } catch (e){
    addSystem("Не удалось загрузить файл");
  }
});

/* ===== voice ===== */
function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

async function startRecording(){
  if (recording) return;
  if (!navigator.mediaDevices?.getUserMedia){
    addSystem("Браузер не поддерживает запись аудио");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferred = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/ogg"];
  const mime = preferred.find(t => MediaRecorder.isTypeSupported(t)) || "";

  chunks = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  recorder.onstop = async () => {
    try{
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const seconds = Math.round((Date.now() - recordStartedAt) / 1000);

      if (seconds > 60){
        addSystem("Голосовое слишком длинное (макс 60 сек)");
        return;
      }

      const b64 = await blobToBase64(blob);
      const pure = (b64.split(",")[1] || "");
      if (socket) socket.emit("chat:voice", { mime: blob.type || "audio/webm", data: pure, seconds });
    } catch {
      addSystem("Не удалось отправить голосовое");
    }
  };

  recordStartedAt = Date.now();
  recording = true;
  micBtn.classList.add("rec");
  addSystem("🎙️ Запись… нажми ещё раз чтобы отправить");
  recorder.start();
}

function stopRecording(){
  if (!recording || !recorder) return;
  recording = false;
  micBtn.classList.remove("rec");
  recorder.stop();
}

micBtn.addEventListener("click", async () => {
  try{
    if (!socket){
      addSystem("Сначала войди в чат");
      return;
    }
    if (!recording) await startRecording();
    else stopRecording();
  } catch {
    addSystem("Нет доступа к микрофону");
    micBtn.classList.remove("rec");
    recording = false;
  }
});

/* misc */
leaveBtn.addEventListener("click", leave);
leaveBtnMobile?.addEventListener("click", leave);
searchInput.addEventListener("input", () => renderUsers(usersCache));

regForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const nick = (nickInput.value || "").trim().slice(0, 20);
  if (!nick) return showToast("Введите ник", true);
  if (nick.length < 2) return showToast("Ник слишком короткий", true);
  connectAndJoin(nick);
});

/* auto login */
const savedNick = localStorage.getItem("nick");
if (savedNick && savedNick.trim().length >= 2){
  connectAndJoin(savedNick.trim().slice(0, 20));
} else {
  showAuthUI();
}

