import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CognitoAuth } from './auth';
import { DirectStreamingManager } from './direct-streaming-manager';
import { loadConfig, saveConfig } from './config';

let mainWindow: BrowserWindow | null = null;
let cognitoAuth: CognitoAuth | null = null;
let streamingManager: DirectStreamingManager | null = null;

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
      webSecurity: false, // Disable for local development to allow localhost requests
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

ipcMain.handle('login', async (_, credentials) => {
  if (!cognitoAuth) {
    cognitoAuth = new CognitoAuth({
      userPoolId: credentials.userPoolId,
      clientId: credentials.clientId,
      region: credentials.region,
    });
  }

  const token = await cognitoAuth.login(credentials.username, credentials.password);
  
  // Store credentials securely
  storeCredentials(credentials.username, token);
  
  // Store token globally for streaming manager
  (global as any).authToken = token;
  (global as any).config = credentials;
  
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

  (global as any).authToken = token;
  (global as any).config = credentials;
  
  return { success: true, token };
});

// TTS and WebSocket handlers
ipcMain.handle('connect-websocket', async () => {
  if (streamingManager) {
    try {
      await streamingManager.connectWebSocket();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Streaming manager not initialized' };
});

ipcMain.handle('create-session', async (_, sessionId) => {
  if (streamingManager) {
    try {
      await streamingManager.createSession(sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Streaming manager not initialized' };
});

ipcMain.handle('end-session', async () => {
  if (streamingManager) {
    try {
      await streamingManager.endSession();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Streaming manager not initialized' };
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
    languageCode: 'pt-BR',
    sourceLanguage: 'pt-BR',
    targetLanguages: ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'],
    sampleRate: config.sampleRate || 16000,
    audioDevice: options.audioDevice || 'default',
    holyrics: config.holyrics,
    tts: config.tts || {
      mode: 'neural',
      enabledLanguages: ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'],
      websocketUrl: 'ws://localhost:3001'
    },
  });

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
        if ((data.includes('listening on port') || data.includes('Server running')) && !hasResolved) {
          hasResolved = true;
          resolve({ success: true, message: 'Server started successfully' });
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        console.error('WebSocket Server Error:', data);
        if (data.includes('EADDRINUSE') && !hasResolved) {
          hasResolved = true;
          resolve({ success: true, message: 'Server already running on port 3001' });
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
    
    return new Promise((resolve) => {
      // Kill any process running on port 3001
      exec('lsof -ti:3001 | xargs kill -9', (error, stdout, stderr) => {
        if (error) {
          // Process might not be running, which is fine
          resolve({ success: true, message: 'Server stopped (was not running)' });
        } else {
          resolve({ success: true, message: 'Server stopped successfully' });
        }
      });
    });
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

// Token storage helpers
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
