const SERVER_URL = window.location.origin;

const authScreen = document.getElementById("authScreen");
const mainApp = document.getElementById("mainApp");

const regForm = document.getElementById("regForm");
const nickInput = document.getElementById("nick");
const toast = document.getElementById("toast");

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

const leaveBtn = document.getElementById("leaveBtn");

// mobile
const mDot = document.getElementById("mDot");
const leaveBtnMobile = document.getElementById("leaveBtnMobile");

let socket = null;
let myNick = null;
let usersCache = [];

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

function addMessage({ nick, text, ts }){
  const el = document.createElement("div");
  el.className = "msg" + (nick === myNick ? " me" : "");

  const n = document.createElement("div");
  n.className = "nick";
  n.textContent = nick;

  const t = document.createElement("div");
  t.className = "text";
  t.textContent = text;

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = fmtTime(ts);

  el.appendChild(n);
  el.appendChild(t);
  el.appendChild(time);

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

    const av = document.createElement("div");
    av.className = "uav";
    av.textContent = initials(u);

    const nm = document.createElement("div");
    nm.className = "uname";
    nm.textContent = u;

    li.appendChild(av);
    li.appendChild(nm);
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

function connectAndJoin(nick){
  feed.innerHTML = "";

  socket = io(SERVER_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 50
  });

  socket.on("connect", () => setConnected(true));
  socket.on("disconnect", () => setConnected(false));
  socket.on("connect_error", () => setConnected(false));

  socket.on("users:list", (payload) => {
    renderUsers(payload?.users || []);
  });

  socket.on("chat:history", (payload) => {
    const msgs = payload?.messages || [];
    feed.innerHTML = "";
    msgs.forEach(m => {
      if (m.type === "system") addSystem(m.text);
      if (m.type === "message") addMessage(m);
    });
  });

  socket.on("chat:system", (m) => addSystem(m.text));
  socket.on("chat:message", (m) => addMessage(m));

  socket.emit("user:join", { nick }, (res) => {
    if (!res?.ok){
      showToast(res?.error || "Не удалось войти", true);
      socket.disconnect();
      socket = null;
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
  if (socket){
    socket.disconnect();
    socket = null;
  }
  setConnected(false);
  usersList.innerHTML = "";
  onlineCount.textContent = "0 онлайн";
  myNick = null;
  localStorage.removeItem("nick");
  showAuthUI();
}

/* отправка */
msgForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = (msgInput.value || "").trim();
  if (!text || !socket) return;
  socket.emit("chat:message", { text });
  msgInput.value = "";
});

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

/* автологин после F5 */
const savedNick = localStorage.getItem("nick");
if (savedNick && savedNick.trim().length >= 2){
  connectAndJoin(savedNick.trim().slice(0, 20));
} else {
  showAuthUI();
}
