// Simple test client for WebSocket server
const { io } = require('socket.io-client');

const socket = io('ws://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

socket.on('connected', (data) => {
  console.log('Welcome message:', data);
  
  // Test session creation
  console.log('Testing session creation...');
  socket.emit('start-session', {
    type: 'start-session',
    sessionId: 'CHURCH-2025-001',
    config: {
      sessionId: 'CHURCH-2025-001',
      enabledLanguages: ['en', 'es', 'fr'],
      ttsMode: 'neural',
      audioQuality: 'high'
    }
  });
});

socket.on('session-started', (data) => {
  console.log('Session started:', data);
  
  // Test joining session as client
  console.log('Testing client join...');
  socket.emit('join-session', {
    type: 'join-session',
    sessionId: 'CHURCH-2025-001',
    preferredLanguage: 'en',
    audioCapabilities: {
      supportsPolly: true,
      localTTSLanguages: ['en'],
      audioFormats: ['mp3', 'wav']
    }
  });
});

socket.on('session-joined', (data) => {
  console.log('Session joined:', data);
  
  // Test translation broadcast
  console.log('Testing translation broadcast...');
  socket.emit('broadcast-translation', {
    type: 'translation',
    sessionId: 'CHURCH-2025-001',
    text: 'Hello, this is a test translation',
    language: 'en',
    timestamp: Date.now(),
    audioUrl: 'http://localhost:3001/audio/test.mp3'
  });
});

socket.on('translation', (data) => {
  console.log('Received translation:', data);
});

socket.on('error', (error) => {
  console.error('Server error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing connection...');
  socket.disconnect();
  process.exit(0);
});