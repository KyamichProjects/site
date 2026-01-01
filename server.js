const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// База данных в оперативной памяти (сбросится после перезагрузки сервера)
let users = {}; 

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('auth', (key) => {
        let role = null;
        if (key === 'ADMINER') role = 'admin';
        else if (key === 'DOSTUP') role = 'user';

        if (role) {
            // Генерация номера карты 4098 5844 XXXX XXXX
            const random8 = Math.floor(10000000 + Math.random() * 90000000).toString();
            const fullCard = `4098 5844 ${random8.slice(0,4)} ${random8.slice(4,8)}`;
            
            users[socket.id] = {
                id: socket.id,
                role: role,
                name: "Пользователь",
                balance: 0,
                card: fullCard,
                history: []
            };
            
            socket.emit('auth_success', { 
                userData: users[socket.id], 
                allUsers: role === 'admin' ? Object.values(users) : null 
            });
            // Обновляем список для всех админов
            io.emit('update_admin_list', Object.values(users));
        } else {
            socket.emit('auth_error', 'Неверный ключ!');
        }
    });

    socket.on('update_name', (newName) => {
        if (users[socket.id]) {
            users[socket.id].name = newName;
            io.emit('update_admin_list', Object.values(users));
        }
    });

    // Логика пополнения (запрос пользователю)
    socket.on('request_topup', ({ targetCard, amount }) => {
        const target = Object.values(users).find(u => u.card === targetCard);
        if (target) {
            io.to(target.id).emit('topup_request_received', { 
                fromId: socket.id, 
                amount: parseFloat(amount) 
            });
        }
    });

    socket.on('confirm_topup', ({ fromId, amount, status }) => {
        if (status === 'yes' && users[socket.id].balance >= amount) {
            users[socket.id].balance -= amount;
            users[fromId].balance += amount;
            
            io.to(socket.id).emit('update_data', users[socket.id]);
            io.to(fromId).emit('update_data', users[fromId]);
            io.emit('update_admin_list', Object.values(users));
        }
    });

    // Админ-действия
    socket.on('admin_change_balance', ({ userId, amount, type }) => {
        if (users[socket.id]?.role === 'admin' && users[userId]) {
            const val = parseFloat(amount);
            if (type === 'add') users[userId].balance += val;
            else users[userId].balance -= val;
            
            io.to(userId).emit('update_data', users[userId]);
            io.emit('update_admin_list', Object.values(users));
        }
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('update_admin_list', Object.values(users));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
