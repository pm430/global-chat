require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: process.env.NODE_ENV === 'production' ? 'https://global-chat-pkiu.onrender.com' : '*' } });

const PORT = process.env.PORT || 3000;
const MAX_USERS = 50;
let currentUsers = 0;
const waitingQueue = [];

// 인메모리 레이트 리미팅 (사용자별 1분당 5 메시지)
const rateLimitStore = new Map(); // { userId: { count: number, resetTime: timestamp } }
const RATE_LIMIT = 5; // 1분당 최대 메시지
const RATE_LIMIT_WINDOW = 60 * 1000; // 1분

function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  if (now > userLimit.resetTime) {
    userLimit.count = 0;
    userLimit.resetTime = now + RATE_LIMIT_WINDOW;
  }
  userLimit.count++;
  rateLimitStore.set(userId, userLimit);
  return userLimit.count <= RATE_LIMIT;
}

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

io.use(authMiddleware);

io.on('connection', (socket) => {
  if (currentUsers >= MAX_USERS) {
    waitingQueue.push(socket);
    socket.emit('waiting', { position: waitingQueue.length });
    console.log(`User added to queue. Queue length: ${waitingQueue.length}`);
    return;
  }

  currentUsers++;
  socket.emit('connected', { userId: socket.user.id });
  console.log(`User connected. Current users: ${currentUsers}`);

  // 메시지 처리
  socket.on('chat message', (msg) => {
    if (typeof msg !== 'string' || msg.length > 100) return; // 200자 → 100자 제한
    if (!checkRateLimit(socket.user.id)) {
      socket.emit('error', { message: 'Rate limit exceeded. Try again later.' });
      return;
    }
    const sanitizedMsg = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    io.emit('chat message', { content: sanitizedMsg, userId: socket.user.id });
  });

  // 랜덤 문구 (5% 확률)
  if (Math.random() < 0.05) {
    const randomPhrases = ['Echoes in the void...', 'Whispers of thoughts...', 'Lost in the stream...'];
    const randomMsg = randomPhrases[Math.floor(Math.random() * randomPhrases.length)];
    io.emit('chat message', { content: randomMsg, userId: 'bot' });
  }

  socket.on('disconnect', () => {
    currentUsers--;
    rateLimitStore.delete(socket.user.id); // 레이트 리미팅 데이터 정리
    console.log(`User disconnected. Current users: ${currentUsers}`);
    if (waitingQueue.length > 0) {
      const nextSocket = waitingQueue.shift();
      nextSocket.emit('connected', { userId: nextSocket.user.id });
      currentUsers++;
      console.log(`User from queue connected. Queue length: ${waitingQueue.length}`);
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