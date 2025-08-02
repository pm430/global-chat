const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' } // 개발용, 프로덕션에서는 제한
});

const PORT = process.env.PORT || 3000;
const MAX_USERS = 50; // 최대 동시 접속자
let currentUsers = 0;
const waitingQueue = []; // 대기열 (socket 배열)

// 정적 파일 서빙 (index.html)
app.use(express.static(__dirname));

io.on('connection', (socket) => {
  if (currentUsers >= MAX_USERS) {
    // 대기열 추가
    waitingQueue.push(socket);
    socket.emit('waiting', { position: waitingQueue.length });
    console.log(`User added to queue. Queue length: ${waitingQueue.length}`);
    return;
  }

  // 연결 허용
  currentUsers++;
  socket.emit('connected');
  console.log(`User connected. Current users: ${currentUsers}`);

  // 메시지 수신 및 브로드캐스트
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg); // 모든 클라이언트에 브로드캐스트
  });

  // 랜덤 문구 봇 (연결 시 랜덤으로 보내기, 확률 20%)
  if (Math.random() < 0.2) {
    const randomPhrases = ['Hello from the void!', 'Whispers in the wind...', 'Echoes of thoughts...'];
    const randomMsg = randomPhrases[Math.floor(Math.random() * randomPhrases.length)];
    io.emit('chat message', randomMsg);
  }

  // 연결 해제
  socket.on('disconnect', () => {
    currentUsers--;
    console.log(`User disconnected. Current users: ${currentUsers}`);

    // 대기열에서 다음 사용자 연결
    if (waitingQueue.length > 0) {
      const nextSocket = waitingQueue.shift();
      nextSocket.emit('connected');
      currentUsers++;
      console.log(`User from queue connected. Queue length: ${waitingQueue.length}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});