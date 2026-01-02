const socket = io();
let myData = null;
let currentMode = '';

// Авто-вход
window.onload = () => {
    const sid = localStorage.getItem('bank_user_id');
    if (sid) socket.emit('auth', { savedId: sid });
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
    document.getElementById('user-balance').innerHTML = `${myData.balance.toFixed(2).replace('.', ',')} <span>₼</span>`;
    document.getElementById('card-num-display').innerText = myData.card;
    document.getElementById('display-name').innerText = myData.name;
    document.getElementById('card-holder-display').innerText = myData.name.toUpperCase();
}

// ОТКРЫТИЕ ОКНА ОПЕРАЦИЙ (Вместо того, что на фотке)
function showModal(mode) {
    currentMode = mode;
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    modal.classList.remove('hidden');
    
    document.getElementById('modal-input-1').value = '';
    document.getElementById('modal-input-2').value = '';

    if (mode === 'transfer') {
        title.innerText = "Перевести на карту";
        document.getElementById('modal-input-1').placeholder = "Номер карты получателя";
    } else {
        title.innerText = "Пополнить баланс";
        document.getElementById('modal-input-1').placeholder = "Номер карты списания";
    }
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function confirmAction() {
    const card = document.getElementById('modal-input-1').value;
    const amount = document.getElementById('modal-input-2').value;

    if (!card || !amount) return alert("Заполните все поля");

    if (currentMode === 'transfer') {
        socket.emit('send_transfer', { targetCard: card, amount });
    } else {
        socket.emit('request_topup', { targetCard: card, amount });
    }
    closeModal();
}

socket.on('notification_request', ({ fromId, fromName, amount }) => {
    if (confirm(`Разрешить списание ${amount} ₼ для ${fromName}?`)) {
        socket.emit('confirm_topup', { fromId, amount, status: 'yes' });
    } else {
        socket.emit('confirm_topup', { fromId, amount, status: 'no' });
    }
});

socket.on('update_data', (data) => { myData = data; updateUI(); });

socket.on('update_admin_list', (list) => {
    const cont = document.getElementById('admin-user-list');
    if (!cont) return;
    cont.innerHTML = '';
    list.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div style="padding:15px; background:#111; margin:10px; border-radius:15px; border:1px solid #222">
                <p><b>${u.name}</b></p>
                <p style="font-size:12px; color:#888">${u.card}</p>
                <p style="color:var(--primary)">${u.balance.toFixed(2)} ₼</p>
                <button onclick="adminAction('${u.id}', 'add')">+</button>
                <button onclick="adminAction('${u.id}', 'sub')">-</button>
            </div>
        `;
        cont.appendChild(div);
    });
});

function adminAction(tid, type) {
    const val = prompt("Сумма:");
    if (val) socket.emit('admin_balance_manage', { targetId: tid, amount: val, type });
}

function switchPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + id).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-' + id).classList.add('active');
}
