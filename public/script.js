const socket = io();
let myData = null;
let currentModalMode = ''; // 'transfer' или 'topup'

// 1. АВТОМАТИЧЕСКИЙ ВХОД ПРИ ЗАГРУЗКЕ
window.addEventListener('load', () => {
    const savedId = localStorage.getItem('bank_user_id');
    if (savedId) {
        // Если ID найден, сервер узнает нас без ввода ключа
        socket.emit('auth', { savedId: savedId });
    }
});

// 2. ФУНКЦИЯ ВХОДА ПО КНОПКЕ
function login() {
    const keyInput = document.getElementById('auth-key');
    const key = keyInput.value.trim();
    
    if (!key) {
        alert("Пожалуйста, введите ключ доступа");
        return;
    }
    
    socket.emit('auth', { key: key });
}

// 3. ОБРАБОТКА УСПЕШНОГО ВХОДА
socket.on('auth_success', ({ userData }) => {
    myData = userData;
    
    // Сохраняем ID в браузере, чтобы не вводить ключ снова
    localStorage.setItem('bank_user_id', userData.id);

    // Переключаем экраны
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    // Если админ — показываем кнопку в навигации
    if (userData.role === 'admin') {
        document.getElementById('nav-admin').classList.remove('hidden');
    }
    
    updateUI();
});

socket.on('auth_error', (msg) => {
    alert(msg);
});

// 4. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (Баланс, Имя, Карта)
function updateUI() {
    if (!myData) return;
    
    document.getElementById('user-balance').innerHTML = `${myData.balance.toFixed(2)} <span>₼</span>`;
    document.getElementById('card-num-display').innerText = myData.card;
    document.getElementById('display-name').innerText = myData.name;
    document.getElementById('card-holder-display').innerText = myData.name.toUpperCase();
}

// 5. НАВИГАЦИЯ МЕЖДУ ВКЛАДКАМИ
function switchPage(pageId) {
    // Скрываем все страницы
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    // Снимаем выделение со всех иконок
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    
    // Показываем нужную
    document.getElementById(`page-${pageId}`).classList.remove('hidden');
    // Выделяем текущую иконку
    document.getElementById(`nav-${pageId}`).classList.add('active');
}

// 6. АНИМАЦИЯ КАРТЫ
function toggleCardAnim() {
    const card = document.querySelector('.card-preview');
    card.classList.toggle('active');
}

// 7. РАБОТА С МОДАЛЬНЫМИ ОКНАМИ (Перевод / Пополнение)
function showModal(mode) {
    currentModalMode = mode;
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const inputCard = document.getElementById('modal-input-1');
    
    overlay.classList.remove('hidden');
    
    if (mode === 'transfer') {
        title.innerHTML = '<i class="fas fa-paper-plane"></i> Перевод на карту';
        inputCard.placeholder = "Номер карты получателя";
    } else {
        title.innerHTML = '<i class="fas fa-wallet"></i> Пополнить с карты';
        inputCard.placeholder = "Номер карты списания";
    }
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

// Кнопка подтверждения в модалке
document.getElementById('modal-confirm-btn').onclick = () => {
    const cardValue = document.getElementById('modal-input-1').value;
    const amountValue = document.getElementById('modal-input-2').value;

    if (!cardValue || !amountValue || amountValue <= 0) {
        alert("Введите корректные данные");
        return;
    }

    if (currentModalMode === 'transfer') {
        socket.emit('send_transfer', { targetCard: cardValue, amount: amountValue });
    } else {
        socket.emit('request_topup', { targetCard: cardValue, amount: amountValue });
    }
    closeModal();
};

// 8. УВЕДОМЛЕНИЕ О ЗАПРОСЕ СРЕДСТВ (Да / Нет)
socket.on('notification_request', ({ fromId, fromName, amount }) => {
    const confirmAction = confirm(`Пользователь ${fromName} просит списать ${amount} ₼ с вашей карты. Разрешить?`);
    socket.emit('confirm_topup', { 
        fromId: fromId, 
        amount: amount, 
        status: confirmAction ? 'yes' : 'no' 
    });
});

// 9. ПРОФИЛЬ (Смена имени)
function promptRename() {
    const newName = prompt("Введите ваше имя:");
    if (newName && newName.trim().length > 0) {
        socket.emit('update_name', { userId: myData.id, name: newName.trim() });
    }
}

// 10. АДМИН-ПАНЕЛЬ (Список пользователей)
socket.on('update_admin_list', (usersList) => {
    const container = document.getElementById('admin-user-list');
    if (!container) return;
    
    container.innerHTML = '';
    usersList.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.style.cssText = "background:#111; margin:10px; padding:15px; border-radius:15px; display:flex; justify-content:space-between; align-items:center; border: 1px solid #222;";
        
        userDiv.innerHTML = `
            <div>
                <div style="font-weight:bold; color:#fff;">${user.name} ${user.id === myData.id ? '<span style="color:var(--primary)">(Вы)</span>' : ''}</div>
                <div style="font-size:12px; color:#888; font-family:monospace;">${user.card}</div>
                <div style="color:var(--primary); font-weight:bold; margin-top:5px;">${user.balance.toFixed(2)} ₼</div>
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="adminAction('${user.id}', 'add')" style="background:var(--primary); border:none; width:35px; height:35px; border-radius:10px; font-weight:bold;">+</button>
                <button onclick="adminAction('${user.id}', 'sub')" style="background:#ff4444; border:none; width:35px; height:35px; border-radius:10px; font-weight:bold; color:white;">-</button>
            </div>
        `;
        container.appendChild(userDiv);
    });
});

function adminAction(targetId, type) {
    const amount = prompt(type === 'add' ? "Сколько добавить?" : "Сколько снять?");
    if (amount && !isNaN(amount)) {
        socket.emit('admin_balance_manage', { targetId, amount, type });
    }
}

// 11. СЛУШАТЕЛЬ ОБНОВЛЕНИЙ ДАННЫХ
socket.on('update_data', (newData) => {
    myData = newData;
    updateUI();
});
