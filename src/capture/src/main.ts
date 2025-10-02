import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AudioCapture } from './audio-capture';
import { WebSocketClient } from './websocket-client';
import { CognitoAuth } from './auth';
import { loadConfig, saveConfig } from './config';

const TOKEN_FILE = path.join(app.getPath('userData'), 'auth-token.enc');

let mainWindow: BrowserWindow | null = null;
let audioCapture: AudioCapture | null = null;
let wsClient: WebSocketClient | null = null;
let cognitoAuth: CognitoAuth | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function saveAuthToken(token: string, config: any) {
  const data = {
    token,
    config,
    expiresAt: Date.now() + (6 * 60 * 60 * 1000), // 6 hours
  };
  const encrypted = safeStorage.encryptString(JSON.stringify(data));
  fs.writeFileSync(TOKEN_FILE, encrypted);
}

function loadAuthToken(): { token: string; config: any } | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    const encrypted = fs.readFileSync(TOKEN_FILE);
    const decrypted = safeStorage.decryptString(encrypted);
    const data = JSON.parse(decrypted);
    
    if (Date.now() > data.expiresAt) {
      fs.unlinkSync(TOKEN_FILE);
      return null;
    }
    
    return { token: data.token, config: data.config };
  } catch {
    return null;
  }
}

// IPC handlers
ipcMain.handle('load-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-config', async (_, config) => {
  saveConfig(config);
  return { success: true };
});

ipcMain.handle('check-auth', async () => {
  const auth = loadAuthToken();
  if (auth) {
    (global as any).authToken = auth.token;
    (global as any).wsConfig = auth.config;
    return { authenticated: true, config: auth.config };
  }
  return { authenticated: false };
});

ipcMain.handle('login', async (_, credentials) => {
  cognitoAuth = new CognitoAuth({
    userPoolId: credentials.userPoolId,
    clientId: credentials.clientId,
    region: credentials.region,
  });

  const token = await cognitoAuth.login(credentials.username, credentials.password);
  
  // Store config for later WebSocket connection
  (global as any).authToken = token;
  (global as any).wsConfig = {
    endpoint: credentials.endpoint,
    deviceId: credentials.deviceId,
  };
  
  // Save encrypted token for 6 hours
  saveAuthToken(token, (global as any).wsConfig);
  
  return { success: true, token };
});

ipcMain.handle('change-password', async (_, credentials) => {
  if (!cognitoAuth) {
    cognitoAuth = new CognitoAuth({
      userPoolId: credentials.userPoolId,
      clientId: credentials.clientId,
      region: credentials.region,
    });
  }

  const token = await cognitoAuth.changePassword(
    credentials.username,
    credentials.oldPassword,
    credentials.newPassword
  );

  // Store config for later WebSocket connection
  (global as any).authToken = token;
  (global as any).wsConfig = {
    endpoint: credentials.endpoint,
    deviceId: credentials.deviceId,
  };
  
  return { success: true, token };
});

async function ensureWebSocketClient() {
  if (!wsClient) {
    const config = (global as any).wsConfig;
    const token = (global as any).authToken;
    
    wsClient = new WebSocketClient({
      endpoint: config.endpoint,
      token,
      deviceId: config.deviceId,
    });
    
    wsClient.setMessageCallback((message) => {
      mainWindow?.webContents.send('translation', message);
    });
    
    await wsClient.connect();
  }
}

ipcMain.handle('start-session', async (_, sessionConfig) => {
  await ensureWebSocketClient();
  
  if (!wsClient) throw new Error('WebSocket not initialized');
  const session = await wsClient.startSession(sessionConfig);
  
  // Start audio capture
  audioCapture = new AudioCapture(sessionConfig.audioConfig);
  
  audioCapture.on('data', (audioData) => {
    wsClient?.sendAudio(session.sessionId, audioData);
  });
  
  audioCapture.on('level', (level) => {
    mainWindow?.webContents.send('audio-level', level);
  });
  
  audioCapture.on('stats', (stats) => {
    mainWindow?.webContents.send('audio-stats', stats);
  });
  
  audioCapture.start();
  
  return session;
});

ipcMain.handle('list-sessions', async () => {
  await ensureWebSocketClient();
  
  if (!wsClient) throw new Error('WebSocket not initialized');
  return await wsClient.listSessions();
});

ipcMain.handle('join-session', async (_, sessionId) => {
  await ensureWebSocketClient();
  
  if (!wsClient) throw new Error('WebSocket not initialized');
  const session = await wsClient.joinSession(sessionId);
  
  // Start audio capture with session's audio config
  audioCapture = new AudioCapture(session.audioConfig);
  
  audioCapture.on('data', (audioData) => {
    wsClient?.sendAudio(sessionId, audioData);
  });
  
  audioCapture.on('level', (level) => {
    mainWindow?.webContents.send('audio-level', level);
  });
  
  audioCapture.on('stats', (stats) => {
    mainWindow?.webContents.send('audio-stats', stats);
  });
  
  audioCapture.start();
  
  return session;
});

ipcMain.handle('stop-session', async (_, sessionId) => {
  audioCapture?.stop();
  audioCapture = null;
  await wsClient?.endSession(sessionId);
  return { success: true };
});

ipcMain.handle('disconnect', async () => {
  audioCapture?.stop();
  wsClient?.disconnect();
  audioCapture = null;
  wsClient = null;
  return { success: true };
});
