let myId = localStorage.getItem('bank_user_id');

// При загрузке страницы пробуем войти автоматически
if (myId) {
    socket.emit('auth', { savedId: myId, key: localStorage.getItem('bank_key') });
}

function login() {
    const key = document.getElementById('auth-key').value;
    localStorage.setItem('bank_key', key);
    socket.emit('auth', { key: key });
}

socket.on('auth_success', ({ userData }) => {
    myData = userData;
    localStorage.setItem('bank_user_id', userData.id);
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    if (userData.role === 'admin') {
        document.getElementById('nav-admin').classList.remove('hidden');
    }
    updateUI();
});

function promptRename() {
    const newName = prompt("Введите новое имя:");
    if (newName) {
        socket.emit('update_name', { userId: myData.id, name: newName });
    }
}

// Функции админа теперь включают пополнение себя
function renderAdminList(users) {
    const list = document.getElementById('admin-user-list');
    list.innerHTML = '<h4>Управление (включая вас)</h4>';
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #333;">
                <div>
                    <div>${user.name} ${user.id === myData.id ? '(Вы)' : ''}</div>
                    <small style="color:#888">${user.card}</small>
                    <div>${user.balance.toFixed(2)} ₼</div>
                </div>
                <div>
                    <button onclick="adminAction('${user.id}', 'add')" style="background:var(--primary); border:none; padding:5px 10px; border-radius:5px;">+</button>
                    <button onclick="adminAction('${user.id}', 'sub')" style="background:#ff4444; border:none; padding:5px 10px; border-radius:5px;">-</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}
