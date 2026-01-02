const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let users = {}; 

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('auth', ({ key, savedId }) => {
        let role = key === 'ADMINER' ? 'admin' : (key === 'DOSTUP' ? 'user' : null);
        if (role) {
            const sid = savedId || socket.id;
            if (!users[sid]) {
                const rand = Math.floor(10000000 + Math.random() * 90000000).toString();
                users[sid] = { id: sid, role, name: "Пользователь", balance: 0, card: `4098 5844 ${rand.slice(0,4)} ${rand.slice(4,8)}` };
            }
            socket.join(sid);
            socket.emit('auth_success', { userData: users[sid] });
            io.emit('update_admin_list', Object.values(users));
        }
    });

    // ЛОГИКА ПЕРЕВОДА
    socket.on('send_transfer', ({ targetCard, amount }) => {
        const sender = users[socket.id];
        const target = Object.values(users).find(u => u.card.replace(/\s/g, '') === targetCard.replace(/\s/g, ''));
        const val = parseFloat(amount);

        if (sender && target && sender.balance >= val && val > 0) {
            sender.balance -= val;
            target.balance += val;
            io.to(sender.id).emit('update_data', sender);
            io.to(target.id).emit('update_data', target);
            io.emit('update_admin_list', Object.values(users));
        }
    });

    // ЛОГИКА ПОПОЛНЕНИЯ (Запрос другому)
    socket.on('request_topup', ({ targetCard, amount }) => {
        const target = Object.values(users).find(u => u.card.replace(/\s/g, '') === targetCard.replace(/\s/g, ''));
        if (target) {
            io.to(target.id).emit('notification_request', { fromId: socket.id, fromName: users[socket.id].name, amount });
        }
    });

    socket.on('confirm_topup', ({ fromId, amount, status }) => {
        if (status === 'yes' && users[socket.id].balance >= amount) {
            users[socket.id].balance -= parseFloat(amount);
            users[fromId].balance += parseFloat(amount);
            io.to(socket.id).emit('update_data', users[socket.id]);
            io.to(fromId).emit('update_data', users[fromId]);
            io.emit('update_admin_list', Object.values(users));
        }
    });

    socket.on('update_name', ({ userId, name }) => {
        if (users[userId]) { users[userId].name = name; io.to(userId).emit('update_data', users[userId]); io.emit('update_admin_list', Object.values(users)); }
    });

    socket.on('admin_balance_manage', ({ targetId, amount, type }) => {
        const val = parseFloat(amount);
        users[targetId].balance = type === 'add' ? users[targetId].balance + val : users[targetId].balance - val;
        io.to(targetId).emit('update_data', users[targetId]);
        io.emit('update_admin_list', Object.values(users));
    });
});

server.listen(process.env.PORT || 3000);
