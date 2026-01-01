const socket = io();
let myData = null;

function login() {
    const key = document.getElementById('auth-key').value;
    socket.emit('auth', key);
}

socket.on('auth_success', ({ userData, allUsers }) => {
    myData = userData;
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    if (userData.role === 'admin') {
        document.getElementById('nav-admin').classList.remove('hidden');
        renderAdminList(allUsers);
    }
    updateUI();
});

socket.on('update_data', (data) => {
    myData = data;
    updateUI();
});

function updateUI() {
    document.getElementById('user-balance').innerHTML = `${myData.balance.toFixed(2)} <span>₼</span>`;
    document.getElementById('card-num-display').innerText = myData.card;
    document.getElementById('display-name').innerText = myData.name;
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${pageId}`).classList.remove('hidden');
}

function updateName() {
    const name = document.getElementById('new-name').value;
    if (name) {
        socket.emit('update_name', name);
        alert("Имя обновлено");
    }
}

function toggleCardAnim() {
    document.querySelector('.card-preview').classList.toggle('active');
}

// Пополнение / Перевод
function showModal(type) {
    const overlay = document.getElementById('modal-overlay');
    const input1 = document.getElementById('modal-input-1');
    const btn = document.getElementById('modal-confirm-btn');
    overlay.classList.remove('hidden');

    if (type === 'topup') {
        document.getElementById('modal-title').innerText = "Пополнить с чужой карты";
        input1.placeholder = "Номер чужой карты";
        btn.onclick = () => {
            socket.emit('request_topup', { targetCard: input1.value, amount: document.getElementById('modal-input-2').value });
            closeModal();
        };
    }
}

socket.on('topup_request_received', ({ fromId, amount }) => {
    if (confirm(`Запрос на снятие: ${amount} ₼. Разрешить?`)) {
        socket.emit('confirm_topup', { fromId, amount, status: 'yes' });
    }
});

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// Админ функции
socket.on('update_admin_list', (users) => {
    if (myData?.role === 'admin') renderAdminList(users);
});

function renderAdminList(users) {
    const list = document.getElementById('admin-user-list');
    list.innerHTML = '';
    users.forEach(user => {
        if (user.id === socket.id) return;
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <p><b>${user.name}</b> (${user.card})</p>
            <p>Баланс: ${user.balance} ₼</p>
            <button onclick="adminAction('${user.id}', 'add')">+</button>
            <button onclick="adminAction('${user.id}', 'sub')" style="background:red">-</button>
        `;
        list.appendChild(div);
    });
}

function adminAction(userId, type) {
    const amount = prompt("Введите сумму:");
    if (amount) socket.emit('admin_change_balance', { userId, amount, type });
}
