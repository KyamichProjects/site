const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_PATH = './database.json';

// Загрузка базы данных при старте
let users = {};
if (fs.existsSync(DB_PATH)) {
    users = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveToDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('auth', ({ key, savedId }) => {
        // Если заходим по сохраненному ID
        if (savedId && users[savedId]) {
            socket.join(savedId);
            users[savedId].socketId = socket.id; // Обновляем актуальный socketId
            socket.emit('auth_success', { userData: users[savedId] });
        } 
        // Если заходим по ключу
        else if (key === 'ADMINER' || key === 'DOSTUP') {
            const role = key === 'ADMINER' ? 'admin' : 'user';
            const id = socket.id;
            const rand = Math.floor(10000000 + Math.random() * 90000000).toString();
            
            users[id] = {
                id: id,
                role: role,
                name: "Пользователь",
                balance: 0,
                card: `4098 5844 ${rand.slice(0,4)} ${rand.slice(4,8)}`
            };
            
            socket.emit('auth_success', { userData: users[id] });
            saveToDB();
        } else {
            socket.emit('auth_error', 'Неверный ключ!');
        }
        io.emit('update_admin_list', Object.values(users));
    });

    // Обработка остальных событий (перевод, баланс и т.д.)
    socket.on('update_name', ({ userId, name }) => {
        if (users[userId]) {
            users[userId].name = name;
            saveToDB();
            io.to(userId).emit('update_data', users[userId]);
            io.emit('update_admin_list', Object.values(users));
        }
    });

    socket.on('admin_balance_manage', ({ targetId, amount, type }) => {
        if (users[targetId]) {
            const val = parseFloat(amount);
            users[targetId].balance = type === 'add' ? users[targetId].balance + val : users[targetId].balance - val;
            saveToDB();
            io.to(targetId).emit('update_data', users[targetId]);
            io.emit('update_admin_list', Object.values(users));
        }
    });
});

server.listen(process.env.PORT || 3000);
