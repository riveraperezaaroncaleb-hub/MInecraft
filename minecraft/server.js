import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('dist')); // Serve the built game

const players = {};
const modifiedBlocks = []; 

io.on('connection', (socket) => {
    console.log('Player connected: ' + socket.id);
    players[socket.id] = { x: 0, y: 100, z: 0, r: 0 };

    // Send existing state to the new player
    socket.emit('init', { id: socket.id, players, modifiedBlocks });
    
    // Broadcast new player
    socket.broadcast.emit('playerJoined', socket.id);

    socket.on('move', (data) => {
        players[socket.id] = data;
        socket.broadcast.emit('playerMoved', { id: socket.id, data });
    });

    socket.on('setBlock', (data) => {
        modifiedBlocks.push(data);
        socket.broadcast.emit('blockUpdate', data);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected: ' + socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🌍 Mincraft Multiplayer Server Running!`);
    console.log(`👉 Play locally: http://localhost:${PORT}`);
    console.log(`👉 Deploy this project online to play with friends!`);
    console.log(`=================================================\n`);
});
