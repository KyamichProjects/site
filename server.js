const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_PATH = path.join(__dirname, 'database.json');

// Безопасная инициализация базы данных
let users = {};
try {
    if (fs.existsSync(DB_PATH)) {
        const fileContent = fs.readFileSync(DB_PATH, 'utf8').trim();
        users = fileContent ? JSON.parse(fileContent) : {};
    } else {
        fs.writeFileSync(DB_PATH, '{}');
    }
} catch (e) {
    console.error("Ошибка БД, сброс:", e);
    users = {};
}

function saveDB() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
    } catch (e) { console.error("Не удалось сохранить файл:", e); }
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('auth', ({ key, savedId }) => {
        let userId = savedId || socket.id;
        
        // Автоматический вход по сохраненному ID
        if (savedId && users[savedId]) {
            socket.join(savedId);
            socket.emit('auth_success', { userData: users[savedId] });
        } 
        // Вход по секретному ключу
        else if (key === 'ADMINER' || key === 'DOSTUP') {
            const role = key === 'ADMINER' ? 'admin' : 'user';
            const rand8 = Math.floor(10000000 + Math.random() * 90000000).toString();
            
            users[userId] = {
                id: userId,
                role: role,
                name: "Пользователь",
                balance: 0,
                card: `4098 5844 ${rand8.slice(0,4)} ${rand8.slice(4,8)}`
            };
            socket.join(userId);
            socket.emit('auth_success', { userData: users[userId] });
            saveDB();
        } else {
            socket.emit('auth_error', 'Неверный ключ доступа');
        }
        io.emit('update_admin_list', Object.values(users));
    });

    // ЛОГИКА ПЕРЕВОДА
    socket.on('send_transfer', ({ targetCard, amount }) => {
        const sender = users[socket.id] || Object.values(users).find(u => u.id === socket.id);
        const amountNum = parseFloat(amount);
        
        // Поиск получателя по номеру карты (убираем пробелы для точности)
        const target = Object.values(users).find(u => u.card.replace(/\s/g, '') === targetCard.replace(/\s/g, ''));

        if (sender && target && sender.balance >= amountNum && amountNum > 0) {
            sender.balance -= amountNum;
            target.balance += amountNum;
            saveDB();
            io.to(sender.id).emit('update_data', sender);
            io.to(target.id).emit('update_data', target);
            io.emit('update_admin_list', Object.values(users));
        }
    });

    // ЛОГИКА ЗАПРОСА ПОПОЛНЕНИЯ
    socket.on('request_topup', ({ targetCard, amount }) => {
        const target = Object.values(users).find(u => u.card.replace(/\s/g, '') === targetCard.replace(/\s/g, ''));
        if (target) {
            io.to(target.id).emit('notification_request', { 
                fromId: socket.id, 
                fromName: users[socket.id]?.name || "Клиент", 
                amount: amount 
            });
        }
    });

    socket.on('confirm_topup', ({ fromId, amount, status }) => {
        const owner = users[socket.id];
        const requester = users[fromId];
        const val = parseFloat(amount);

        if (status === 'yes' && owner && requester && owner.balance >= val) {
            owner.balance -= val;
            requester.balance += val;
            saveDB();
            io.to(owner.id).emit('update_data', owner);
            io.to(requester.id).emit('update_data', requester);
            io.emit('update_admin_list', Object.values(users));
        }
    });

    socket.on('admin_balance_manage', ({ targetId, amount, type }) => {
        const val = parseFloat(amount);
        if (users[targetId]) {
            users[targetId].balance = type === 'add' ? users[targetId].balance + val : users[targetId].balance - val;
            saveDB();
            io.to(targetId).emit('update_data', users[targetId]);
            io.emit('update_admin_list', Object.values(users));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
