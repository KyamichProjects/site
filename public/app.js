const SERVER_URL = window.location.origin;

// auth
const authScreen = document.getElementById("authScreen");
const mainApp = document.getElementById("mainApp");
const nickInput = document.getElementById("nick");
const enterBtn = document.getElementById("enterBtn");
const toast = document.getElementById("toast");

// chat ui
const meName = document.getElementById("meName");
const meAvatar = document.getElementById("meAvatar");
const statusLine = document.getElementById("statusLine");
const chatSub = document.getElementById("chatSub");

const feed = document.getElementById("feed");
const feedWrap = document.getElementById("feedWrap");

const msgForm = document.getElementById("msgForm");
const msgInput = document.getElementById("msg");

const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const micBtn = document.getElementById("micBtn");

const leaveBtn = document.getElementById("leaveBtn");
const leaveBtnMobile = document.getElementById("leaveBtnMobile");
const mDot = document.getElementById("mDot");

let socket = null;
let myNick = null;
let isJoining = false;

// voice record
let recorder = null;
let recording = false;
let chunks = [];
let recordStartedAt = 0;

function initials(name){ return (name||"?").trim().slice(0,1).toUpperCase(); }
function fmtTime(ts){ return new Date(ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}); }
function scrollBottom(){ feedWrap.scrollTop = feedWrap.scrollHeight; }

function showToast(text, isError=false){
  toast.textContent = text;
  toast.classList.add("show");
  toast.style.color = isError ? "#ffd6d6" : "#d6e6ff";
  setTimeout(()=>toast.classList.remove("show"), 3000);
}

function setConnected(ok){
  const s = ok ? "Онлайн" : "Оффлайн";
  statusLine.textContent = s;
  chatSub.textContent = s;
  if (mDot) mDot.classList.toggle("ok", ok);
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
    <div class="nick">${nick}</div>
    <div class="text"></div>
    <div class="time">${fmtTime(ts)}</div>
  `;
  el.querySelector(".text").textContent = text;
  feed.appendChild(el);
  scrollBottom();
}

function addVoiceMessage({ nick, mime, data, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");
  el.innerHTML = `<div class="nick">${nick}</div><div class="time">${fmtTime(ts)}</div>`;

  const audio = document.createElement("audio");
  audio.controls = true;

  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime || "audio/webm" });
  audio.src = URL.createObjectURL(blob);

  el.insertBefore(audio, el.querySelector(".time"));
  feed.appendChild(el);
  scrollBottom();
}

function addMediaMessage({ nick, kind, url, name, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");
  el.innerHTML = `<div class="nick">${nick}</div><div class="time">${fmtTime(ts)}</div>`;

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

function cleanupSocket(){
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

function connectAndJoin(nick){
  if (isJoining) return;
  isJoining = true;
  enterBtn.disabled = true;

  cleanupSocket();
  feed.innerHTML = "";

  socket = io(SERVER_URL, { transports:["websocket","polling"] });

  socket.on("connect", ()=>setConnected(true));
  socket.on("disconnect", ()=>setConnected(false));
  socket.on("connect_error", ()=>setConnected(false));

  socket.on("chat:system", m=>addSystem(m.text));
  socket.on("chat:message", m=>addTextMessage(m));
  socket.on("chat:voice", m=>addVoiceMessage(m));
  socket.on("chat:media", m=>addMediaMessage(m));

  socket.on("chat:history", p=>{
    feed.innerHTML = "";
    (p.messages||[]).forEach(m=>{
      if (m.type==="system") addSystem(m.text);
      if (m.type==="message") addTextMessage(m);
      if (m.type==="voice") addVoiceMessage(m);
      if (m.type==="media") addMediaMessage(m);
    });
  });

  let timedOut = false;
  const timer = setTimeout(()=>{
    timedOut = true;
    isJoining=false;
    enterBtn.disabled=false;
    showToast("Сервер не ответил. Нажми «Войти» ещё раз.", true);
    cleanupSocket();
  }, 5000);

  socket.emit("user:join", { nick }, (res)=>{
    if (timedOut) return;
    clearTimeout(timer);

    isJoining=false;
    enterBtn.disabled=false;

    if (!res || !res.ok){
      showToast(res?.error || "Не удалось войти", true);
      cleanupSocket();
      return;
    }

    myNick = res.nick;
    meName.textContent = myNick;
    meAvatar.textContent = initials(myNick);
    localStorage.setItem("nick", myNick);
    showChatUI();
  });
}

/* ===== login (NO submit) ===== */
enterBtn.addEventListener("click", ()=>{
  const nick = (nickInput.value || "").trim().slice(0, 20);
  nickInput.value = nick;
  if (nick.length < 2) return showToast("Ник слишком короткий", true);
  connectAndJoin(nick);
});
nickInput.addEventListener("keydown", (e)=>{
  if (e.key === "Enter"){ e.preventDefault(); enterBtn.click(); }
});

/* ===== send text ===== */
msgForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !socket) return;
  socket.emit("chat:message", { text });
  msgInput.value = "";
});

/* ===== file upload (photo/video) ===== */
attachBtn?.addEventListener("click", ()=>{
  if (!socket) return addSystem("Сначала войди в чат");
  fileInput.value = "";
  fileInput.click();
});

fileInput?.addEventListener("change", async ()=>{
  const file = fileInput.files?.[0];
  if (!file) return;

  const MAX = 15 * 1024 * 1024;
  if (file.size > MAX) return addSystem("Файл слишком большой (макс 15MB)");

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return addSystem("Можно только фото или видео");

  addSystem(`Загрузка: ${file.name}…`);

  try{
    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch("/upload", { method:"POST", body: fd });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "upload failed");

    socket.emit("chat:media", {
      kind: isImage ? "image" : "video",
      url: data.url,
      mime: data.mime,
      name: data.name
    });

  } catch {
    addSystem("Не удалось загрузить файл");
  }
});

/* ===== voice record ===== */
function blobToBase64(blob){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onerror = reject;
    r.onload = ()=>resolve(r.result);
    r.readAsDataURL(blob);
  });
}

async function startRecording(){
  if (recording) return;
  if (!socket) return addSystem("Сначала войди в чат");
  if (!navigator.mediaDevices?.getUserMedia) return addSystem("Запись аудио не поддерживается");

  const stream = await navigator.mediaDevices.getUserMedia({ audio:true });

  const preferred = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/ogg"];
  const mime = preferred.find(t => MediaRecorder.isTypeSupported(t)) || "";

  chunks = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType:mime } : undefined);

  recorder.ondataavailable = (e)=>{ if (e.data && e.data.size>0) chunks.push(e.data); };

  recorder.onstop = async ()=>{
    try{
      stream.getTracks().forEach(t=>t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const seconds = Math.round((Date.now() - recordStartedAt) / 1000);
      if (seconds > 60) return addSystem("Голосовое слишком длинное (макс 60 сек)");

      const b64 = await blobToBase64(blob);
      const pure = (b64.split(",")[1] || "");
      socket.emit("chat:voice", { mime: blob.type || "audio/webm", data: pure, seconds });
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

micBtn?.addEventListener("click", async ()=>{
  try{
    if (!recording) await startRecording();
    else stopRecording();
  } catch {
    addSystem("Нет доступа к микрофону (разреши в браузере)");
    micBtn.classList.remove("rec");
    recording = false;
  }
});

/* ===== leave ===== */
function leave(){
  cleanupSocket();
  localStorage.removeItem("nick");
  showAuthUI();
}
leaveBtn?.addEventListener("click", leave);
leaveBtnMobile?.addEventListener("click", leave);

/* ===== autologin ===== */
const savedNick = localStorage.getItem("nick");
if (savedNick && savedNick.trim().length >= 2){
  nickInput.value = savedNick.trim().slice(0,20);
  connectAndJoin(nickInput.value);
} else {
  showAuthUI();
}
