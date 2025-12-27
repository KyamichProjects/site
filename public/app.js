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

const micBtn = document.getElementById("micBtn");

const leaveBtn = document.getElementById("leaveBtn");
const mDot = document.getElementById("mDot");
const leaveBtnMobile = document.getElementById("leaveBtnMobile");

let socket = null;
let myNick = null;
let usersCache = [];

let isJoining = false;
let sendLock = false;

// voice record
let recorder = null;
let recording = false;
let chunks = [];
let recordStartedAt = 0;

// keep one playing voice at a time
let activeVoiceAudio = null;

function initials(name){
  const s = (name || "?").trim();
  return s.slice(0,1).toUpperCase();
}
function fmtTime(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString("ru-RU", { hour:"2-digit", minute:"2-digit" });
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
function scrollBottom(){
  // ✅ всегда вниз
  feedWrap.scrollTop = feedWrap.scrollHeight;
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
  el.innerHTML = `
    <div class="nick"></div>
    <div class="text"></div>
    <div class="time"></div>
  `;
  el.querySelector(".nick").textContent = nick;
  el.querySelector(".text").textContent = text;
  el.querySelector(".time").textContent = fmtTime(ts);
  feed.appendChild(el);
  scrollBottom();
}

function fmtClock(seconds){
  seconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2,"0")}`;
}

function addVoiceMessage({ nick, mime, data, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");

  // base64 -> blob url
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime || "audio/webm" });
  const url = URL.createObjectURL(blob);

  const audio = document.createElement("audio");
  audio.src = url;

  const voice = document.createElement("div");
  voice.className = "voice";

  const play = document.createElement("button");
  play.className = "v-play";
  play.type = "button";
  play.textContent = "▶";

  const bar = document.createElement("div");
  bar.className = "v-bar";
  const fill = document.createElement("div");
  fill.className = "v-fill";
  bar.appendChild(fill);

  voice.appendChild(play);
  voice.appendChild(bar);
  voice.appendChild(audio);

  const meta = document.createElement("div");
  meta.className = "v-meta";
  const cur = document.createElement("div");
  cur.className = "v-cur";
  cur.textContent = "0:00";
  const dur = document.createElement("div");
  dur.className = "v-dur";
  dur.textContent = "--:--";
  meta.appendChild(cur);
  meta.appendChild(dur);

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = fmtTime(ts);

  const nickEl = document.createElement("div");
  nickEl.className = "nick";
  nickEl.textContent = nick;

  el.appendChild(nickEl);
  el.appendChild(voice);
  el.appendChild(meta);
  el.appendChild(time);

  // events
  audio.addEventListener("loadedmetadata", () => {
    dur.textContent = fmtClock(audio.duration || 0);
  });

  function stopOther(){
    if (activeVoiceAudio && activeVoiceAudio !== audio){
      activeVoiceAudio.pause();
      activeVoiceAudio.currentTime = 0;
    }
    activeVoiceAudio = audio;
  }

  play.addEventListener("click", () => {
    stopOther();
    if (audio.paused){
      audio.play();
      play.textContent = "⏸";
    } else {
      audio.pause();
      play.textContent = "▶";
    }
  });

  audio.addEventListener("ended", () => {
    play.textContent = "▶";
    fill.style.width = "0%";
    cur.textContent = "0:00";
  });

  audio.addEventListener("timeupdate", () => {
    const d = audio.duration || 0;
    const t = audio.currentTime || 0;
    cur.textContent = fmtClock(t);
    if (d > 0) fill.style.width = `${(t/d)*100}%`;
  });

  // click on bar to seek
  bar.addEventListener("click", (e) => {
    stopOther();
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const p = Math.min(1, Math.max(0, x / rect.width));
    const d = audio.duration || 0;
    if (d > 0){
      audio.currentTime = d * p;
      if (audio.paused){
        audio.play();
        play.textContent = "⏸";
      }
    }
  });

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
    });
    scrollBottom();
  });

  socket.on("chat:system", (m) => addSystem(m.text));
  socket.on("chat:message", (m) => addTextMessage(m));
  socket.on("chat:voice", (m) => addVoiceMessage(m));

  socket.emit("user:join", { nick }, (res) => {
    isJoining = false;
    if (enterBtn) enterBtn.disabled = false;

    if (!res?.ok){
      showToast(res?.error || "Не удалось войти", true);
      cleanupSocket();
      localStorage.removeItem("nick");
      showAuthUI();
      return;
    }

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

/* ===== voice record ===== */
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
    addSystem("Нет доступа к микрофону (разреши в браузере)");
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
