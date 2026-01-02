const socket = io();
let myData = null;
let currentAction = '';

// Авто-логин
window.onload = () => {
    const savedId = localStorage.getItem('bank_user_id');
    if (savedId) socket.emit('auth', { savedId });
};

function login() {
    const key = document.getElementById('auth-key').value;
    socket.emit('auth', { key });
}

socket.on('auth_success', ({ userData }) => {
    myData = userData;
    localStorage.setItem('bank_user_id', userData.id);
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    if (userData.role === 'admin') document.getElementById('nav-admin').classList.remove('hidden');
    updateUI();
});

function updateUI() {
    if (!myData) return;
    document.getElementById('user-balance').innerHTML = `${myData.balance.toFixed(2)} <span>₼</span>`;
    document.getElementById('card-num-display').innerText = myData.card;
    document.getElementById('display-name').innerText = myData.name;
}

// Работа с красивым окном
function openDrawer(mode) {
    currentAction = mode;
    document.getElementById('drawer-overlay').classList.remove('hidden');
    document.getElementById('drawer-title').innerText = mode === 'transfer' ? 'Перевод на карту' : 'Пополнить баланс';
}

function closeDrawer() {
    document.getElementById('drawer-overlay').classList.add('hidden');
}

function executeAction() {
    const card = document.getElementById('draw-card').value;
    const amount = document.getElementById('draw-amount').value;

    if (!card || !amount) return;

    if (currentAction === 'transfer') {
        socket.emit('send_transfer', { targetCard: card, amount });
    } else {
        // Пополнение (запрос другому пользователю)
        socket.emit('request_topup', { targetCard: card, amount });
    }
    closeDrawer();
}

// ПОЛУЧЕНИЕ ЗАПРОСА
socket.on('notification_request', ({ fromId, fromName, amount }) => {
    // Всплывающее окно браузера для подтверждения
    const ok = confirm(`Пользователь ${fromName} просит списать ${amount} ₼ с вашей карты. Разрешить?`);
    socket.emit('confirm_topup', { fromId, amount, status: ok ? 'yes' : 'no' });
});

socket.on('update_data', (data) => {
    myData = data;
    updateUI();
});

// Навигация
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + page).classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
}
