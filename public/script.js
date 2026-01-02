const socket = io();
let myData = null;
let currentModalMode = '';

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
    document.getElementById('user-balance').innerHTML = `${myData.balance.toFixed(2)} <span>₼</span>`;
    document.getElementById('card-num-display').innerText = myData.card;
    document.getElementById('display-name').innerText = myData.name;
    document.getElementById('card-holder-display').innerText = myData.name.toUpperCase();
}

// УПРАВЛЕНИЕ МОДАЛКОЙ
function showModal(mode) {
    currentModalMode = mode;
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const inputCard = document.getElementById('modal-input-1');
    
    overlay.classList.remove('hidden');
    inputCard.value = '';
    document.getElementById('modal-input-2').value = '';

    if (mode === 'transfer') {
        title.innerText = "Перевод на карту";
        inputCard.placeholder = "Номер карты получателя";
    } else {
        title.innerText = "Пополнить с карты";
        inputCard.placeholder = "Номер карты списания";
    }
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

document.getElementById('modal-confirm-btn').onclick = () => {
    const card = document.getElementById('modal-input-1').value;
    const amount = document.getElementById('modal-input-2').value;

    if (!card || !amount) return alert("Заполните поля");

    if (currentModalMode === 'transfer') {
        socket.emit('send_transfer', { targetCard: card, amount });
    } else {
        socket.emit('request_topup', { targetCard: card, amount });
    }
    closeModal();
};

// Уведомление о запросе (Да/Нет)
socket.on('notification_request', ({ fromId, fromName, amount }) => {
    const res = confirm(`Пользователь ${fromName} просит снять с вашей карты ${amount} ₼. Разрешить?`);
    socket.emit('confirm_topup', { fromId, amount, status: res ? 'yes' : 'no' });
});

socket.on('update_data', (data) => { myData = data; updateUI(); });

// Остальные функции (switchPage, toggleCardAnim, adminAction) остаются как были
function switchPage(p) {
    document.querySelectorAll('.page').forEach(pg => pg.classList.add('hidden'));
    document.getElementById(`page-${p}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`nav-${p}`).classList.add('active');
}

function toggleCardAnim() { document.querySelector('.card-preview').classList.toggle('active'); }

function promptRename() {
    const n = prompt("Новое имя:");
    if(n) socket.emit('update_name', { userId: myData.id, name: n });
}

socket.on('update_admin_list', (list) => renderAdminList(list));

function renderAdminList(users) {
    const container = document.getElementById('admin-user-list');
    if (!container) return;
    container.innerHTML = '';
    users.forEach(u => {
        const d = document.createElement('div');
        d.className = 'user-item';
        d.style.background = '#111'; d.style.margin = '10px'; d.style.padding = '15px'; d.style.borderRadius = '12px';
        d.innerHTML = `<div><b>${u.name}</b><br><small>${u.card}</small><br>${u.balance}₼</div>
        <button onclick="adminAction('${u.id}', 'add')">+</button> <button onclick="adminAction('${u.id}', 'sub')">-</button>`;
        container.appendChild(d);
    });
}

function adminAction(id, type) {
    const a = prompt("Сумма:");
    if(a) socket.emit('admin_balance_manage', { targetId: id, amount: a, type });
}
