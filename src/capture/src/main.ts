import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { AudioCapture } from './audio-capture';
import { WebSocketClient } from './websocket-client';
import { CognitoAuth } from './auth';
import { loadConfig, saveConfig } from './config';

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

// IPC handlers
ipcMain.handle('load-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-config', async (_, config) => {
  saveConfig(config);
  return { success: true };
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

ipcMain.handle('start-session', async (_, sessionConfig) => {
  // Connect WebSocket when starting session
  if (!wsClient) {
    const config = (global as any).wsConfig;
    const token = (global as any).authToken;
    
    wsClient = new WebSocketClient({
      endpoint: config.endpoint,
      token,
      deviceId: config.deviceId,
    });
    
    await wsClient.connect();
  }
  
  const session = await wsClient.startSession(sessionConfig);
  
  // Start audio capture
  audioCapture = new AudioCapture(sessionConfig.audioConfig);
  audioCapture.on('data', (audioData) => {
    wsClient?.sendAudio(session.sessionId, audioData);
  });
  audioCapture.start();
  
  return session;
});

ipcMain.handle('list-sessions', async () => {
  if (!wsClient) {
    const config = (global as any).wsConfig;
    const token = (global as any).authToken;
    
    wsClient = new WebSocketClient({
      endpoint: config.endpoint,
      token,
      deviceId: config.deviceId,
    });
    
    await wsClient.connect();
  }
  
  return await wsClient.listSessions();
});

ipcMain.handle('join-session', async (_, sessionId) => {
  if (!wsClient) {
    const config = (global as any).wsConfig;
    const token = (global as any).authToken;
    
    wsClient = new WebSocketClient({
      endpoint: config.endpoint,
      token,
      deviceId: config.deviceId,
    });
    
    await wsClient.connect();
  }
  
  const session = await wsClient.joinSession(sessionId);
  
  // Start audio capture with session's audio config
  audioCapture = new AudioCapture(session.audioConfig);
  audioCapture.on('data', (audioData) => {
    wsClient?.sendAudio(sessionId, audioData);
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
