const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_PATH = path.join(__dirname, 'database.json');

// Загрузка данных
let users = {};
if (fs.existsSync(DB_PATH)) {
    try {
        users = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) { users = {}; }
}

function saveDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    // Авторизация по ключу или восстановление сессии
    socket.on('auth', ({ key, savedId }) => {
        let userId = savedId || socket.id;
        let role = key === 'ADMINER' ? 'admin' : (key === 'DOSTUP' ? 'user' : null);

        if (role) {
            if (!users[userId] || key) { // Новый вход
                const random8 = Math.floor(10000000 + Math.random() * 90000000).toString();
                users[userId] = {
                    id: userId,
                    role: role,
                    name: "Пользователь",
                    balance: 0,
                    card: `4098 5844 ${random8.slice(0,4)} ${random8.slice(4,8)}`
                };
            }
            socket.join(userId);
            socket.emit('auth_success', { userData: users[userId], allUsers: Object.values(users) });
            io.emit('update_admin_list', Object.values(users));
            saveDB();
        } else {
            socket.emit('auth_error', 'Неверный ключ');
        }
    });

    socket.on('update_name', ({ userId, name }) => {
        if (users[userId]) {
            users[userId].name = name;
            io.to(userId).emit('update_data', users[userId]);
            io.emit('update_admin_list', Object.values(users));
            saveDB();
        }
    });

    socket.on('admin_balance_manage', ({ targetId, amount, type }) => {
        if (users[targetId]) {
            const val = parseFloat(amount);
            users[targetId].balance = type === 'add' ? users[targetId].balance + val : users[targetId].balance - val;
            io.to(targetId).emit('update_data', users[targetId]);
            io.emit('update_admin_list', Object.values(users));
            saveDB();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
