#!/usr/bin/env node

// Test script to discover Holyrics API endpoints
// Usage: node test-holyrics-api.js <IP_ADDRESS> [TOKEN]
// Example: node test-holyrics-api.js 192.168.1.100
// Example with token: node test-holyrics-api.js 192.168.1.100 abc123def456

const http = require('http');

const commonPorts = [8091, 8080, 8081, 3000, 5000, 7000, 9000];
const commonEndpoints = [
  '/api/status',
  '/api/stage/text',
  '/api/presentations',
  '/status',
  '/remote',
  '/control'
];

async function testPort(hostname, port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname,
      port,
      path: '/',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      console.log(`✅ Port ${port} is active (Status: ${res.statusCode})`);
      resolve(true);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
    req.end();
  });
}

async function testEndpoint(hostname, port, endpoint, token) {
  return new Promise((resolve) => {
    const path = token ? `${endpoint}?token=${token}` : endpoint;
    const req = http.request({
      hostname,
      port,
      path,
      method: 'GET',
      timeout: 2000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✅ ${endpoint} on port ${port}: ${res.statusCode}`);
        if (data) console.log(`   Response: ${data.substring(0, 100)}...`);
        resolve(true);
      });
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
    req.end();
  });
}

async function testSetTextCP(hostname, port, token) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      text: 'Test from Service Translate',
      show: true,
      display_ahead: true
    });

    const req = http.request({
      hostname,
      port,
      path: `/api/ShowQuickPresentation?token=${token}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 2000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`\n🎯 ShowQuickPresentation Test: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('   ✅ Successfully sent text to Holyrics!');
        } else {
          console.log(`   ⚠️  Response: ${data}`);
        }
        resolve(true);
      });
    });
    
    req.on('error', (err) => {
      console.log(`   ❌ Error: ${err.message}`);
      resolve(false);
    });
    req.on('timeout', () => {
      console.log('   ❌ Request timeout');
      resolve(false);
    });
    
    req.write(postData);
    req.end();
  });
}

async function discoverHolyricsAPI(hostname, token) {
  console.log(`🔍 Discovering Holyrics API on ${hostname}...`);
  if (token) console.log(`🔑 Using token: ${token.substring(0, 8)}...`);
  console.log();
  
  // Test common ports
  console.log('Testing common ports:');
  const activePorts = [];
  for (const port of commonPorts) {
    if (await testPort(hostname, port)) {
      activePorts.push(port);
    }
  }
  
  if (activePorts.length === 0) {
    console.log(`❌ No active ports found on ${hostname}. Make sure Holyrics is running.`);
    return;
  }
  
  console.log('\nTesting API endpoints:');
  for (const port of activePorts) {
    for (const endpoint of commonEndpoints) {
      await testEndpoint(hostname, port, endpoint, token);
    }
    
    // Test SetTextCP with token if provided
    if (token) {
      await testSetTextCP(hostname, port, token);
    }
  }
}

// Parse command line arguments
const hostname = process.argv[2];
const token = process.argv[3];

if (!hostname) {
  console.log('Usage: node test-holyrics-api.js <IP_ADDRESS> [TOKEN]');
  console.log('');
  console.log('Examples:');
  console.log('  node test-holyrics-api.js 192.168.1.100');
  console.log('  node test-holyrics-api.js 192.168.1.100 abc123def456');
  console.log('');
  console.log('The token is optional for discovery, but required for SetTextCP test.');
  process.exit(1);
}

discoverHolyricsAPI(hostname, token);
