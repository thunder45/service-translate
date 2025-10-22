#!/usr/bin/env node

/**
 * PWA Client Server Startup Script
 * Starts the client PWA server with configurable port
 */

const { spawn } = require('child_process');
const path = require('path');

// Get PWA port from environment variable or default to 8080
const PWA_PORT = process.env.PWA_PORT || '8080';

console.log('📱 Starting PWA Client Server...');
console.log(`   Port: ${PWA_PORT}`);
console.log(`   Directory: ${path.join(process.cwd(), 'src', 'client-pwa')}`);
console.log('');

// Change to client-pwa directory
const clientPwaDir = path.join(__dirname, '..', 'src', 'client-pwa');

// Start http-server with configurable port
const child = spawn('npx', ['--yes', 'http-server', '-p', PWA_PORT], {
  cwd: clientPwaDir,
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('❌ Failed to start PWA server:', error);
  process.exit(1);
});

// Handle graceful shutdown
const shutdown = () => {
  console.log('\n🛑 Shutting down PWA client server...');
  child.kill('SIGTERM');
  setTimeout(() => {
    child.kill('SIGKILL');
    process.exit(0);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
