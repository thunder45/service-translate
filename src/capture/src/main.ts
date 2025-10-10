import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CognitoAuth } from './auth';
import { DirectStreamingManager } from './direct-streaming-manager';
import { WebSocketManager } from './websocket-manager';
import { loadConfig, saveConfig } from './config';

let mainWindow: BrowserWindow | null = null;
let cognitoAuth: CognitoAuth | null = null;
let streamingManager: DirectStreamingManager | null = null;
let webSocketManager: WebSocketManager | null = null;

interface ServerConfig {
  host: string;
  port: number;
}

function getServerConfig(config: any): ServerConfig {
  let host = 'localhost';
  let port = 3001;
  
  if (config?.tts) {
    if (config.tts.host && config.tts.port) {
      host = config.tts.host;
      port = config.tts.port;
    } else if (config.tts.websocketUrl) {
      const match = config.tts.websocketUrl.match(/ws:\/\/([^:]+):(\d+)/);
      if (match) {
        host = match[1];
        port = parseInt(match[2]);
      }
    }
  }
  
  return { host, port };
}

interface StoredCredentials {
  username: string;
  token: string;
  expiresAt: number;
}

function storeCredentials(username: string, token: string): void {
  const credentials: StoredCredentials = {
    username,
    token,
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };
  
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
    const credentialsPath = path.join(app.getPath('userData'), 'credentials.dat');
    fs.writeFileSync(credentialsPath, encrypted);
  }
}

function loadStoredCredentials(): StoredCredentials | null {
  try {
    const credentialsPath = path.join(app.getPath('userData'), 'credentials.dat');
    if (!fs.existsSync(credentialsPath)) return null;
    
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(credentialsPath);
      const decrypted = safeStorage.decryptString(encrypted);
      const credentials: StoredCredentials = JSON.parse(decrypted);
      
      if (credentials.expiresAt > Date.now()) {
        return credentials;
      }
    }
  } catch (error) {
    console.error('Failed to load stored credentials:', error);
  }
  return null;
}

function clearStoredCredentials(): void {
  try {
    const credentialsPath = path.join(app.getPath('userData'), 'credentials.dat');
    if (fs.existsSync(credentialsPath)) {
      fs.unlinkSync(credentialsPath);
    }
  } catch (error) {
    console.error('Failed to clear stored credentials:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../index.html'));
  
  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Cleanup streaming manager
  if (streamingManager) {
    try {
      await streamingManager.cleanup();
      streamingManager = null;
    } catch (error) {
      console.error('Error cleaning up streaming manager:', error);
    }
  }
  
  // Cleanup WebSocket manager
  if (webSocketManager) {
    try {
      webSocketManager.disconnect();
      webSocketManager.removeAllListeners();
      webSocketManager = null;
    } catch (error) {
      console.error('Error cleaning up WebSocket manager:', error);
    }
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Configuration management
ipcMain.handle('load-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (_, config) => {
  saveConfig(config);
  return { success: true };
});

// Authentication
ipcMain.handle('check-stored-credentials', async () => {
  const stored = loadStoredCredentials();
  if (stored) {
    (global as any).authToken = stored.token;
    // Load config for stored credentials
    const config = loadConfig();
    if (config) {
      (global as any).config = config;
    }
    return { success: true, username: stored.username };
  }
  return { success: false };
});

ipcMain.handle('get-audio-devices', async () => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const { platform } = require('os');
    const execAsync = promisify(exec);
    
    const isWindows = platform() === 'win32';
    
    if (isWindows) {
      // Windows: Use PowerShell to enumerate audio devices
      const psCommand = `
        Get-WmiObject -Class Win32_SoundDevice | 
        Where-Object { $_.Status -eq 'OK' } | 
        Select-Object -ExpandProperty Name
      `;
      
      try {
        const { stdout } = await execAsync(`powershell -Command "${psCommand}"`);
        const devices = [{ id: 'default', name: 'Default System Input' }];
        
        const deviceNames = stdout.trim().split('\n').filter((line: string) => line.trim());
        deviceNames.forEach((name: string, index: number) => {
          devices.push({ 
            id: index.toString(), 
            name: name.trim() 
          });
        });
        
        return devices;
      } catch (error) {
        console.error('Windows audio device enumeration failed:', error);
        return [{ id: 'default', name: 'Default System Input' }];
      }
    } else {
      // macOS: Use system_profiler
      const { stdout } = await execAsync('system_profiler SPAudioDataType');
      const devices = [{ id: 'default', name: 'Default System Input' }];
      
      const lines = stdout.split('\n');
      let currentDevice = '';
      let hasInput = false;
      
      for (const line of lines) {
        if (line.match(/^\s{8}[^:\s]+.*:$/)) {
          if (currentDevice && hasInput) {
            devices.push({ 
              id: `coreaudio:${devices.length - 1}`, 
              name: currentDevice 
            });
          }
          
          currentDevice = line.trim().replace(':', '');
          hasInput = false;
        }
        
        if (line.includes('Input Channels:')) {
          const match = line.match(/Input Channels:\s*(\d+)/);
          if (match && parseInt(match[1]) > 0) {
            hasInput = true;
          }
        }
      }
      
      if (currentDevice && hasInput) {
        devices.push({ 
          id: `coreaudio:${devices.length - 1}`, 
          name: currentDevice 
        });
      }
      
      return devices;
    }
  } catch (error) {
    console.error('Audio device enumeration failed:', error);
    return [{ id: 'default', name: 'Default System Input' }];
  }
});

ipcMain.handle('logout', async () => {
  clearStoredCredentials();
  (global as any).authToken = null;
  (global as any).config = null;
  return { success: true };
});

// Admin authentication handlers
ipcMain.handle('admin-authenticate', async (_, credentials: { username: string; password: string }) => {
  try {
    // Load config to get Cognito settings
    const config = await loadConfig();
    
    if (!config || !config.userPoolId || !config.clientId || !config.region) {
      throw new Error('Cognito not configured. Please configure User Pool ID and Client ID in Advanced settings.');
    }
    
    // Initialize cognitoAuth if not already done
    if (!cognitoAuth) {
      cognitoAuth = new CognitoAuth({
        userPoolId: config.userPoolId,
        clientId: config.clientId,
        region: config.region,
      });
    }

    // Authenticate directly with Cognito
    const tokens = await cognitoAuth.login(credentials.username, credentials.password);
    
    // Store config and token globally for streaming manager
    (global as any).config = config;
    (global as any).authToken = tokens.idToken; // Identity Pool needs ID token
    
    return {
      success: true,
      username: credentials.username,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: Date.now() + (tokens.expiresIn * 1000),
      adminId: credentials.username
    };
  } catch (error: any) {
    console.error('Admin authentication error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin-authenticate-with-token', async (_, data: { token: string }) => {
  try {
    if (!webSocketManager) {
      throw new Error('WebSocket manager not initialized. Please connect to server first.');
    }

    const result = await webSocketManager.adminAuthenticateWithToken(data.token);
    return result;
  } catch (error: any) {
    console.error('Admin token authentication error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('store-admin-tokens', async (_, data: AdminTokenData) => {
  try {
    storeAdminTokensSecurely(data);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to store admin tokens:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-stored-admin-tokens', async () => {
  try {
    const tokens = loadStoredAdminTokens();
    return tokens;
  } catch (error: any) {
    console.error('Failed to load stored admin tokens:', error);
    return null;
  }
});

ipcMain.handle('clear-admin-tokens', async () => {
  try {
    clearStoredAdminTokens();
    return { success: true };
  } catch (error: any) {
    console.error('Failed to clear admin tokens:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('refresh-admin-token', async (_, data: { refreshToken: string; adminId?: string }) => {
  try {
    if (!webSocketManager) {
      throw new Error('WebSocket manager not initialized. Please connect to server first.');
    }

    const result = await webSocketManager.refreshCognitoToken();
    return result;
  } catch (error: any) {
    console.error('Token refresh error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('login', async (_, credentials) => {
  if (!cognitoAuth) {
    cognitoAuth = new CognitoAuth({
      userPoolId: credentials.userPoolId,
      clientId: credentials.clientId,
      region: credentials.region,
    });
  }

  const tokens = await cognitoAuth.login(credentials.username, credentials.password);
  
  // Store credentials securely
  storeCredentials(credentials.username, tokens.accessToken);
  
  // Store token globally for streaming manager
  (global as any).authToken = tokens.accessToken;
  (global as any).config = credentials;
  
  return { success: true, token: tokens.accessToken };
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

  (global as any).authToken = token;
  (global as any).config = credentials;
  
  return { success: true, token };
});

// TTS and WebSocket handlers
ipcMain.handle('connect-websocket', async () => {
  try {
    const config = loadConfig();
    const { host, port } = getServerConfig(config);
    
    console.log(`Using host: ${host}, port: ${port}`);
    
    // Initialize WebSocketManager if not already created
    if (!webSocketManager) {
      const serverUrl = `ws://${host}:${port}`;
      console.log('Creating WebSocketManager with URL:', serverUrl);
      webSocketManager = new WebSocketManager({
        serverUrl,
        reconnectAttempts: 5,
        reconnectDelay: 1000
      }, app.getPath('userData'));
      
      // Setup event listeners for UI updates
      webSocketManager.on('connected', () => {
        console.log('WebSocketManager: connected event');
        mainWindow?.webContents.send('websocket-connected');
      });
      
      webSocketManager.on('disconnected', (reason) => {
        console.log('WebSocketManager: disconnected event, reason:', reason);
        mainWindow?.webContents.send('websocket-disconnected');
      });
      
      webSocketManager.on('error', (error) => {
        console.log('WebSocketManager: error event:', error);
      });
    } else {
      console.log('WebSocketManager already exists, reusing');
    }
    
    await webSocketManager.connect();
    console.log('WebSocket connected successfully');
    
    return { success: true };
  } catch (error: any) {
    console.error('WebSocket connection error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disconnect-websocket', async () => {
  if (webSocketManager) {
    try {
      webSocketManager.disconnect();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'WebSocket manager not initialized' };
});

ipcMain.handle('create-session', async (_, sessionId, providedConfig) => {
  if (webSocketManager) {
    try {
      // Use provided config or load from disk as fallback
      const config = providedConfig || await loadConfig();
      
      const sessionConfig = {
        sessionId,
        enabledLanguages: (config?.targetLanguages || ['en', 'es', 'fr', 'de', 'it']) as any,
        ttsMode: config?.tts?.mode || 'neural',
        audioQuality: (config?.tts?.mode === 'neural' ? 'high' : 'medium') as 'high' | 'medium'
      };

      await webSocketManager.createSession(sessionId, sessionConfig);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'WebSocket manager not initialized' };
});

ipcMain.handle('end-session', async () => {
  if (webSocketManager) {
    try {
      await webSocketManager.endSession();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'WebSocket manager not initialized' };
});

ipcMain.handle('list-sessions', async () => {
  if (webSocketManager) {
    try {
      const sessions = await webSocketManager.listSessions();
      
      // Separate owned and all sessions based on isOwner flag
      const ownedSessions = sessions.filter((s: any) => s.isOwner);
      
      return { 
        success: true, 
        sessions,
        ownedSessions,
        allSessions: sessions
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'WebSocket manager not initialized' };
});

ipcMain.handle('set-current-session', async (_, sessionConfig) => {
  if (webSocketManager) {
    try {
      // Directly set the current session without sending a message
      // This is used when reconnecting to an existing session
      (webSocketManager as any).currentSession = sessionConfig;
      (webSocketManager as any).sessionStateBackup = { ...sessionConfig };
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'WebSocket manager not initialized' };
});

ipcMain.handle('update-session-config', async (_, sessionConfig) => {
  if (webSocketManager) {
    try {
      await webSocketManager.updateSessionConfig(sessionConfig);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'WebSocket manager not initialized' };
});

ipcMain.handle('update-tts-config', async (_, config) => {
  if (streamingManager) {
    try {
      streamingManager.updateTTSConfig(config);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Streaming manager not initialized' };
});

ipcMain.handle('get-current-costs', async () => {
  if (streamingManager) {
    return streamingManager.getCurrentCosts();
  }
  return null;
});

ipcMain.handle('reset-cost-tracking', async () => {
  if (streamingManager) {
    streamingManager.resetCostTracking();
    return { success: true };
  }
  return { success: false, error: 'Streaming manager not initialized' };
});

// Local streaming (enhanced with TTS and WebSocket)
ipcMain.handle('start-local-streaming', async (_, options = {}) => {
  const config = (global as any).config;
  const token = (global as any).authToken;
  
  if (!config || !token) {
    throw new Error('Configuration or authentication not found. Please login first.');
  }
  
  streamingManager = new DirectStreamingManager({
    region: config.region,
    identityPoolId: config.identityPoolId,
    userPoolId: config.userPoolId,
    jwtToken: token,
    sourceLanguage: config.sourceLanguage || 'pt-BR',
    targetLanguages: config.targetLanguages || ['en', 'es', 'fr', 'de', 'it'],
    sampleRate: config.sampleRate || 16000,
    audioDevice: options.audioDevice || 'default',
    holyrics: config.holyrics,
    tts: config.tts || {
      mode: 'neural',
      host: 'localhost',
      port: 3001
    },
  }, webSocketManager);

  // Setup event handlers for local display
  streamingManager.on('transcription', (result) => {
    mainWindow?.webContents.send('transcription', result);
  });

  streamingManager.on('translation', (result) => {
    mainWindow?.webContents.send('translation', result);
  });

  streamingManager.on('error', (error) => {
    mainWindow?.webContents.send('streaming-error', error);
  });

  streamingManager.on('audio-level', (level) => {
    mainWindow?.webContents.send('audio-level', level);
  });

  // TTS and WebSocket event handlers
  streamingManager.on('polly-usage', (usage) => {
    mainWindow?.webContents.send('polly-usage', usage);
  });

  streamingManager.on('costs-updated', (costs) => {
    mainWindow?.webContents.send('costs-updated', costs);
  });

  streamingManager.on('cost-alert', (alert) => {
    mainWindow?.webContents.send('cost-alert', alert);
  });

  streamingManager.on('websocket-connected', () => {
    mainWindow?.webContents.send('websocket-connected');
  });

  streamingManager.on('websocket-disconnected', () => {
    mainWindow?.webContents.send('websocket-disconnected');
  });

  streamingManager.on('client-connected', (clientInfo) => {
    mainWindow?.webContents.send('client-connected', clientInfo);
  });

  streamingManager.on('client-disconnected', (clientInfo) => {
    mainWindow?.webContents.send('client-disconnected', clientInfo);
  });

  await streamingManager.startStreaming();
  return { success: true };
});

ipcMain.handle('stop-local-streaming', async () => {
  if (streamingManager) {
    await streamingManager.stopStreaming();
    streamingManager = null;
  }
  return { success: true };
});

ipcMain.handle('start-websocket-server', async () => {
  try {
    const { exec } = require('child_process');
    const path = require('path');
    const config = loadConfig();
    const { port } = getServerConfig(config);
    
    // Get the websocket server path
    const serverPath = path.join(__dirname, '../../websocket-server');
    
    return new Promise((resolve, reject) => {
      // Start the WebSocket server
      const serverProcess = exec('npm start', { 
        cwd: serverPath,
        detached: true
      });
      
      let hasResolved = false;
      
      serverProcess.stdout.on('data', (data) => {
        console.log('WebSocket Server:', data);
        if ((data.includes('running on port') || data.includes('Server running')) && !hasResolved) {
          hasResolved = true;
          resolve({ success: true, message: 'Server started successfully' });
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        console.error('WebSocket Server Error:', data);
        if (data.includes('EADDRINUSE') && !hasResolved) {
          hasResolved = true;
          resolve({ success: true, message: `Server already running on port ${port}` });
        } else if (!hasResolved) {
          hasResolved = true;
          reject(new Error(data.toString()));
        }
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          resolve({ success: false, message: 'Server start timeout - check manually' });
        }
      }, 10000);
    });
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('stop-websocket-server', async () => {
  try {
    const { exec } = require('child_process');
    const config = loadConfig();
    const { port } = getServerConfig(config);
    
    console.log(`Stopping WebSocket server on port ${port}...`);
    
    return new Promise((resolve) => {
      // Kill only LISTEN processes on the specified port
      exec(`lsof -ti:${port} -sTCP:LISTEN | xargs kill -9`, (error, stdout, stderr) => {
        if (error) {
          // Process might not be running, which is fine
          console.log('No server process found on port', port);
          resolve({ success: true, message: 'Server stopped (was not running)' });
        } else {
          console.log('Server process killed on port', port);
          resolve({ success: true, message: 'Server stopped successfully' });
        }
      });
    });
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

// Admin token storage helpers
interface AdminTokenData {
  token: string;
  refreshToken: string;
  tokenExpiry: string;
  adminId: string;
  username: string;
  timestamp: number;
}

function storeAdminTokensSecurely(data: AdminTokenData): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify({ ...data, timestamp: Date.now() }));
    const tokenPath = path.join(app.getPath('userData'), 'admin-tokens.dat');
    fs.writeFileSync(tokenPath, encrypted);
  }
}

function loadStoredAdminTokens(): AdminTokenData | null {
  try {
    const tokenPath = path.join(app.getPath('userData'), 'admin-tokens.dat');
    if (!fs.existsSync(tokenPath)) return null;
    
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(tokenPath);
      const decrypted = safeStorage.decryptString(encrypted);
      const data: AdminTokenData = JSON.parse(decrypted);
      
      // Check if stored within 4 hours
      // This ensures refresh tokens are still valid (Cognito refresh tokens valid for 30 days)
      const withinStorageWindow = Date.now() - data.timestamp < 4 * 60 * 60 * 1000;
      
      if (withinStorageWindow) {
        // Return tokens even if access token expired - refresh token will be used
        return data;
      }
    }
  } catch (error) {
    console.error('Failed to load stored admin tokens:', error);
  }
  return null;
}

function clearStoredAdminTokens(): void {
  try {
    const tokenPath = path.join(app.getPath('userData'), 'admin-tokens.dat');
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  } catch (error) {
    console.error('Failed to clear stored admin tokens:', error);
  }
}

// Token storage helpers (legacy Cognito)
function saveAuthToken(token: string, config: any) {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify({ token, config, timestamp: Date.now() }));
    const tokenPath = path.join(app.getPath('userData'), 'auth-token');
    fs.writeFileSync(tokenPath, encrypted);
  }
}

// Holyrics control handlers
ipcMain.handle('clear-holyrics', async () => {
  try {
    const config = loadConfig();
    if (!config || !config.holyrics?.enabled) {
      throw new Error('Holyrics not enabled in configuration');
    }

    // Use static method if streaming manager not initialized
    if (streamingManager) {
      await streamingManager.clearHolyrics();
    } else {
      const { HolyricsIntegration } = require('./holyrics-integration');
      const url = `http://${config.holyrics.host}:${config.holyrics.port}/api/SetTextCP?token=${config.holyrics.token}`;
      const axios = require('axios');
      await axios.post(url, { text: '', show: false, display_ahead: false }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
    }
    return { success: true };
  } catch (error: any) {
    console.error('Clear Holyrics failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-holyrics-connection', async () => {
  try {
    console.log('[Main] Test Holyrics connection requested');
    const config = loadConfig();
    if (!config || !config.holyrics?.enabled) {
      throw new Error('Holyrics not enabled in configuration');
    }

    console.log('[Main] Holyrics config:', {
      host: config.holyrics.host,
      port: config.holyrics.port,
      enabled: config.holyrics.enabled,
      hasToken: !!config.holyrics.token
    });

    // Use static method if streaming manager not initialized
    if (streamingManager) {
      console.log('[Main] Using streaming manager test method');
      const success = await streamingManager.testHolyricsConnection();
      return { success };
    } else {
      console.log('[Main] Using static test method');
      const { HolyricsIntegration } = require('./holyrics-integration');
      const success = await HolyricsIntegration.testConnectionStatic(config.holyrics);
      console.log('[Main] Test result:', success);
      return { success };
    }
  } catch (error: any) {
    console.error('[Main] Test Holyrics connection failed:', error);
    return { success: false, error: error.message };
  }
});

function loadAuthToken() {
  try {
    const tokenPath = path.join(app.getPath('userData'), 'auth-token');
    if (fs.existsSync(tokenPath)) {
      const encrypted = fs.readFileSync(tokenPath);
      const decrypted = safeStorage.decryptString(encrypted);
      const data = JSON.parse(decrypted);
      
      // Check if token is less than 6 hours old
      if (Date.now() - data.timestamp < 6 * 60 * 60 * 1000) {
        return data;
      }
    }
  } catch (error) {
    console.error('Failed to load auth token:', error);
  }
  return null;
}
