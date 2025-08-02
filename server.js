require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { RateLimiter } = require('socketio-rate-limiter');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: process.env.NODE_ENV === 'production' ? 'https://global-chat-pkiu.onrender.com' : '*' } });

const PORT = process.env.PORT || 3000;
const MAX_USERS = 50;
let currentUsers = 0;
const waitingQueue = [];

// 레이트 리미팅 (1분당 5 메시지)
const rateLimiter = RateLimiter({ points: 5, duration: 60 });

// 인증 미들웨어
const authMiddleware = (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
};

io.use(authMiddleware).use(rateLimiter);

io.on('connection', (socket) => {
  if (currentUsers >= MAX_USERS) {
    waitingQueue.push(socket);
    socket.emit('waiting', { position: waitingQueue.length });
    return;
  }

  currentUsers++;
  socket.emit('connected', { userId: socket.user.id });

  // 메시지 처리
  socket.on('chat message', (msg) => {
    if (typeof msg !== 'string' || msg.length > 200) return;
    const sanitizedMsg = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    io.emit('chat message', { content: sanitizedMsg, userId: socket.user.id });
  });

  // 랜덤 문구 (10% 확률)
  if (Math.random() < 0.1) {
    const randomPhrases = ['Echoes in the void...', 'Whispers of thoughts...', 'Lost in the stream...'];
    const randomMsg = randomPhrases[Math.floor(Math.random() * randomPhrases.length)];
    io.emit('chat message', { content: randomMsg, userId: 'bot' });
  }

  socket.on('disconnect', () => {
    currentUsers--;
    if (waitingQueue.length > 0) {
      const nextSocket = waitingQueue.shift();
      nextSocket.emit('connected', { userId: nextSocket.user.id });
      currentUsers++;
    }
  });
});

app.use(express.json());
app.use(express.static('public'));
app.post('/login', (req, res) => {
  const { nickname } = req.body;
  if (!nickname || nickname.length > 20) return res.status(400).json({ error: 'Invalid nickname' });
  const token = jwt.sign({ id: nickname }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));