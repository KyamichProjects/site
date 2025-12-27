const SERVER_URL = window.location.origin;

/* ===== elements ===== */
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
const leaveBtnMobile = document.getElementById("leaveBtnMobile");
const mDot = document.getElementById("mDot");

/* ===== state ===== */
let socket = null;
let myNick = null;
let usersCache = [];
let isJoining = false;
let sendLock = false;

/* ===== helpers ===== */
function initials(name){
  return (name || "?").trim().slice(0,1).toUpperCase();
}
function fmtTime(ts){
  return new Date(ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
}
function scrollBottom(){
  feedWrap.scrollTop = feedWrap.scrollHeight;
}
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

/* ===== UI ===== */
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

/* ===== messages ===== */
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
function addMediaMessage({ nick, kind, url, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");
  const full = new URL(url, window.location.origin).toString();

  let media;
  if (kind === "image"){
    media = document.createElement("img");
    media.src = full;
    media.style.maxWidth = "320px";
    media.style.borderRadius = "12px";
  } else {
    media = document.createElement("video");
    media.src = full;
    media.controls = true;
    media.style.maxWidth = "320px";
    media.style.borderRadius = "12px";
  }

  el.innerHTML = `<div class="nick">${nick}</div>`;
  el.appendChild(media);
  el.innerHTML += `<div class="time">${fmtTime(ts)}</div>`;
  feed.appendChild(el);
  scrollBottom();
}

/* ===== users ===== */
function renderUsers(list){
  usersCache = list.slice();
  usersList.innerHTML = "";
  list.forEach(u=>{
    const li = document.createElement("li");
    li.className = "user";
    li.innerHTML = `<div class="uav">${initials(u)}</div><div class="uname">${u}</div>`;
    usersList.appendChild(li);
  });
  onlineCount.textContent = `${list.length} онлайн`;
}

/* ===== socket ===== */
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

  socket.on("users:list", p=>renderUsers(p.users||[]));
  socket.on("chat:system", m=>addSystem(m.text));
  socket.on("chat:message", m=>addTextMessage(m));
  socket.on("chat:media", m=>addMediaMessage(m));

  socket.on("chat:history", p=>{
    feed.innerHTML = "";
    (p.messages||[]).forEach(m=>{
      if (m.type==="system") addSystem(m.text);
      if (m.type==="message") addTextMessage(m);
      if (m.type==="media") addMediaMessage(m);
    });
  });

  /* join with timeout */
  let timeout = setTimeout(()=>{
    isJoining=false;
    enterBtn.disabled=false;
    showToast("Сервер не ответил. Попробуй ещё раз.", true);
    cleanupSocket();
  },5000);

  socket.emit("user:join", { nick }, (res)=>{
    clearTimeout(timeout);
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

/* ===== events ===== */
regForm.addEventListener("submit", e=>{
  e.preventDefault();
  const nick = (nickInput.value||"").trim().slice(0,20);
  nickInput.value = nick;
  if (nick.length < 2) return showToast("Ник слишком короткий", true);
  connectAndJoin(nick);
});

msgForm.addEventListener("submit", e=>{
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !socket || sendLock) return;
  sendLock=true;
  socket.emit("chat:message",{text});
  msgInput.value="";
  setTimeout(()=>sendLock=false,150);
});

leaveBtn.addEventListener("click", leave);
leaveBtnMobile?.addEventListener("click", leave);

function leave(){
  cleanupSocket();
  localStorage.removeItem("nick");
  showAuthUI();
}

/* ===== auto login ===== */
const savedNick = localStorage.getItem("nick");
if (savedNick && savedNick.trim().length>=2){
  nickInput.value = savedNick;
  connectAndJoin(savedNick.trim().slice(0,20));
} else {
  showAuthUI();
}
