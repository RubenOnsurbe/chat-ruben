import express from 'express';
import logger from 'morgan';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config();
const port = process.env.PORT || 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {
        maxDisconnectionDuration: 60 * 60 * 1000 // 1 hour
    }
});

const db = createClient({
    url: "libsql://closing-sleeper-rubenonsurbe.turso.io",
    authToken: process.env.DB_TOKEN
});

(async () => {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT,
                user TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (error) {
        console.error('Database initialization error:', error);
    }
})();

io.on('connection', async (socket) => {
    console.log('Usuario conectado');

    socket.on('disconnect', () => {
        console.log('Usuario desconectado');
    });

    socket.on('chat message', async (msg) => {
        let result;
        const username = socket.handshake.auth.username || 'Anónimo';
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user) VALUES (:content, :username)',
                args: { content: msg, username: username }
            });
        } catch (error) {
            console.error('Message insert error:', error);
        }

        if (result && result.lastInsertRowid !== undefined) {
            io.emit('chat message', msg, result.lastInsertRowid.toString(), username);
        }
    });

    if (!socket.recovered) {
        try {
            const results = await db.execute({
                sql: 'SELECT * FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset || 0]
            });

            results.rows.forEach(row => {
                socket.emit('chat message', row.content, row.id.toString(), row.user, row.created_at.toString());
            });
        } catch (error) {
            console.error('Message fetch error:', error);
        }
    }
});

app.use(logger('dev'));

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/dist/index.html');
});
app.get('/favicon.ico', (req, res) => {
    res.sendFile(process.cwd() + '/javascript.svg');
});
server.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
