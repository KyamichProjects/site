const socket = io();
let myData = null;

// Пытаемся зайти автоматически при загрузке, если есть данные
window.onload = () => {
    const savedId = localStorage.getItem('bank_user_id');
    const savedKey = localStorage.getItem('bank_key');
    if (savedId && savedKey) {
        socket.emit('auth', { savedId, key: savedKey });
    }
};

function login() {
    const key = document.getElementById('auth-key').value;
    if (!key) return alert("Введите ключ");
    
    // Отправляем ключ на сервер
    socket.emit('auth', { key: key });
}

socket.on('auth_success', ({ userData, allUsers }) => {
    myData = userData;
    // Сохраняем сессию
    localStorage.setItem('bank_user_id', userData.id);
    localStorage.setItem('bank_key', userData.role === 'admin' ? 'ADMINER' : 'DOSTUP');

    // Скрываем вход, показываем приложение
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    if (userData.role === 'admin') {
        document.getElementById('nav-admin').classList.remove('hidden');
    }
    
    updateUI();
    if (allUsers) renderAdminList(allUsers);
});

socket.on('auth_error', (msg) => {
    alert(msg);
});

function updateUI() {
    document.getElementById('user-balance').innerHTML = `${myData.balance.toFixed(2)} <span>₼</span>`;
    document.getElementById('card-num-display').innerText = myData.card;
    document.getElementById('card-holder-display').innerText = myData.name.toUpperCase();
    document.getElementById('display-name').innerText = myData.name;
}

function switchPage(pageId) {
    // Скрываем все страницы
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    // Показываем нужную
    document.getElementById(`page-${pageId}`).classList.remove('hidden');
    
    // Обновляем иконки в навигации
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`nav-${pageId}`).classList.add('active');
}

function toggleCardAnim() {
    document.querySelector('.card-preview').classList.toggle('active');
}

function promptRename() {
    const newName = prompt("Введите новое имя:");
    if (newName) {
        socket.emit('update_name', { userId: myData.id, name: newName });
    }
}

// При получении новых данных от сервера
socket.on('update_data', (data) => {
    myData = data;
    updateUI();
});

// Обновление списка для админа
socket.on('update_admin_list', (users) => {
    if (myData && myData.role === 'admin') {
        renderAdminList(users);
    }
});

function renderAdminList(users) {
    const list = document.getElementById('admin-user-list');
    list.innerHTML = '';
    users.forEach(user => {
        const div = document.createElement('div');
        div.style.cssText = "background:#111; margin:10px; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;";
        div.innerHTML = `
            <div>
                <div style="font-weight:bold">${user.name} ${user.id === myData.id ? '(Вы)' : ''}</div>
                <div style="font-size:12px; color:#888">${user.card}</div>
                <div style="color:var(--primary)">${user.balance.toFixed(2)} ₼</div>
            </div>
            <div>
                <button onclick="adminAction('${user.id}', 'add')" style="background:var(--primary); border:none; padding:8px; border-radius:5px; margin-right:5px;">+</button>
                <button onclick="adminAction('${user.id}', 'sub')" style="background:#ff4444; border:none; padding:8px; border-radius:5px;">-</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function adminAction(userId, type) {
    const amount = prompt("Сумма:");
    if (amount) {
        socket.emit('admin_balance_manage', { targetId: userId, amount, type });
    }
}
