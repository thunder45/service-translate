import { app, BrowserWindow, ipcMain, safeStorage, systemPreferences } from 'electron';
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
  let host = '127.0.0.1';
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 1200,
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

ipcMain.handle('request-microphone-permission', async () => {
  try {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      console.log('Current microphone permission status:', status);
      
      if (status === 'not-determined') {
        // This will trigger the permission dialog
        const granted = await systemPreferences.askForMediaAccess('microphone');
        return { success: true, granted, status: granted ? 'granted' : 'denied' };
      }
      
      return { success: true, granted: status === 'granted', status };
    }
    
    // Windows doesn't have the same permission system
    return { success: true, granted: true, status: 'granted' };
  } catch (error: any) {
    console.error('Failed to request microphone permission:', error);
    return { success: false, error: error.message };
  }
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

    // Authenticate with Cognito
    const tokens = await cognitoAuth.login(credentials.username, credentials.password);
    
    // Store config and token globally for streaming manager
    (global as any).config = config;
    (global as any).authToken = tokens.idToken; // Identity Pool needs ID token
    
    // Store tokens in SecureTokenStorage for WebSocket reconnection
    // This must happen even if WebSocket is not connected yet
    const { SecureTokenStorage } = require('./secure-token-storage');
    const tokenStorage = new SecureTokenStorage(app.getPath('userData'));
    
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    tokenStorage.storeTokens({
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      username: credentials.username
    });
    
    console.log('Tokens stored in SecureTokenStorage for future reconnection');
    
    return {
      success: true,
      username: credentials.username,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: expiresAt.getTime(),
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

ipcMain.handle('store-admin-tokens', async (_, data: { token: string; refreshToken: string; tokenExpiry: any; adminId?: string; username: string }) => {
  try {
    const { SecureTokenStorage } = require('./secure-token-storage');
    const tokenStorage = new SecureTokenStorage(app.getPath('userData'));
    
    const expiresAt = data.tokenExpiry ? new Date(data.tokenExpiry) : new Date(Date.now() + 3600 * 1000);
    tokenStorage.storeTokens({
      accessToken: data.token,
      idToken: data.token, // Use access token as ID token for now
      refreshToken: data.refreshToken,
      expiresAt,
      username: data.username
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to store admin tokens:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-stored-admin-tokens', async () => {
  try {
    const { SecureTokenStorage } = require('./secure-token-storage');
    const tokenStorage = new SecureTokenStorage(app.getPath('userData'));
    
    if (tokenStorage.hasStoredTokens()) {
      const tokens = tokenStorage.loadTokens();
      if (tokens) {
        return {
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry: tokens.expiresAt.toISOString(),
          adminId: tokens.username,
          username: tokens.username
        };
      }
    }
    return null;
  } catch (error: any) {
    console.error('Failed to load stored admin tokens:', error);
    return null;
  }
});

ipcMain.handle('clear-admin-tokens', async () => {
  try {
    const { SecureTokenStorage } = require('./secure-token-storage');
    const tokenStorage = new SecureTokenStorage(app.getPath('userData'));
    tokenStorage.clearTokens();
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
    
    // STEP 1: Check for stored tokens BEFORE connecting (fail fast)
    const { SecureTokenStorage } = require('./secure-token-storage');
    const tokenStorage = new SecureTokenStorage(app.getPath('userData'));
    
    let validatedTokens: {
      accessToken: string;
      idToken: string;
      expiresIn: number;
      username: string;
      expiresAt: Date;
    } | null = null;
    let shouldAutoAuthenticate = false;
    
    if (tokenStorage.hasStoredTokens()) {
      console.log('Found stored tokens, validating before connection...');
      
      try {
        const storedTokens = tokenStorage.loadTokens();
        
        if (storedTokens) {
          // Token is valid (loadTokens returns null for expired tokens)
          console.log('Access token is valid, ready to connect');
          validatedTokens = storedTokens;
          shouldAutoAuthenticate = true;
          
          // CRITICAL: Set global config and token for streaming manager
          // These are required by start-local-streaming handler
          (global as any).config = config;
          (global as any).authToken = storedTokens.idToken;
          console.log('Global config and auth token set from stored tokens');
        } else {
          // Tokens were expired and cleared by loadTokens
          console.log('Stored tokens were expired and cleared');
          mainWindow?.webContents.send('admin-auth-required', {
            reason: 'Stored credentials expired - please login again'
          });
        }
      } catch (tokenError: any) {
        console.error('Error validating stored tokens:', tokenError);
        // Clear corrupted tokens
        try {
          tokenStorage.clearTokens();
        } catch (clearError) {
          console.error('Error clearing corrupted tokens:', clearError);
        }
        mainWindow?.webContents.send('admin-auth-required', {
          reason: 'Stored credentials corrupted - please login again'
        });
      }
    } else {
      console.log('No stored tokens found - user needs to login');
      mainWindow?.webContents.send('admin-auth-required', {
        reason: 'No stored credentials'
      });
    }
    
    // STEP 3: Initialize WebSocketManager if not already created
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
      
      // Listen for session expired events
      webSocketManager.on('session-expired', (notification) => {
        console.log('Session expired notification:', notification);
        mainWindow?.webContents.send('session-expired', notification);
      });
      
      // Listen for admin auth failed events
      webSocketManager.on('admin-auth-failed', (error) => {
        console.log('Admin auth failed:', error);
        mainWindow?.webContents.send('admin-auth-failed', error);
      });
      
      // Listen for translation events from WebSocketManager
      webSocketManager.on('translation', (data) => {
        console.log('Translation event from WebSocketManager:', data);
        mainWindow?.webContents.send('translation', data);
      });
    } else {
      console.log('WebSocketManager already exists, reusing');
    }
    
    // STEP 4: Only connect if webSocketManager doesn't already have a connection
    // This prevents race conditions where UI layer is starting the server
    if (!webSocketManager.isConnectedToServer()) {
      console.log('Attempting to connect to WebSocket server...');
      await webSocketManager.connect();
      console.log('WebSocket connected successfully');
      
      // NOTE: Authentication removed from here to prevent duplicate authentication
      // UI layer will handle authentication via auth-manager.js
      console.log('Connection established, UI layer will handle authentication');
    } else {
      console.log('WebSocketManager already connected or connecting, skipping connection attempt');
    }
    
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
  // Request microphone permission before starting
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    console.log('Microphone permission status:', status);
    
    if (status !== 'granted') {
      console.log('Requesting microphone permission...');
      const granted = await systemPreferences.askForMediaAccess('microphone');
      if (!granted) {
        throw new Error('Microphone permission denied. Please grant microphone access in System Settings > Privacy & Security > Microphone and try again.');
      }
    }
  }
  
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
      host: '127.0.0.1',
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

  // Transcription restart notifications
  streamingManager.on('transcription-restarting', (info) => {
    console.log('Transcription restarting:', info);
    mainWindow?.webContents.send('transcription-restarting', info);
  });

  streamingManager.on('transcription-restarted', (info) => {
    console.log('Transcription restarted:', info);
    mainWindow?.webContents.send('transcription-restarted', info);
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
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const config = loadConfig();
    const { port } = getServerConfig(config);
    
    // Detect platform
    const isWindows = os.platform() === 'win32';
    
    // Get the websocket server path relative to the project root
    // When compiled, __dirname is dist/capture/src, so we go up to project root
    const serverPath = path.join(__dirname, '../../../src/websocket-server');
    
    // Choose appropriate startup script based on platform
    const scriptName = isWindows ? 'start.ps1' : 'start.sh';
    const startScript = path.join(serverPath, scriptName);
    
    // Verify the script exists
    if (!fs.existsSync(startScript)) {
      console.error(`${scriptName} not found at:`, startScript);
      return { 
        success: false, 
        message: `Server start script not found at: ${startScript}` 
      };
    }
    
    console.log('Starting WebSocket server using:', startScript);
    
    return new Promise((resolve, reject) => {
      // Start the WebSocket server using appropriate command for the platform
      let serverProcess;
      
      if (isWindows) {
        // Windows: Use PowerShell to run start.ps1
        serverProcess = spawn('powershell.exe', [
          '-ExecutionPolicy', 'Bypass',
          '-File', './start.ps1'
        ], { 
          cwd: serverPath,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } else {
        // macOS/Linux: Use bash to run start.sh
        serverProcess = spawn('./start.sh', [], { 
          cwd: serverPath,
          detached: true,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      }
      
      let hasResolved = false;
      let outputBuffer = '';
      
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;
        console.log('WebSocket Server:', output);
        
        // Look for success indicators
        if ((output.includes('running on port') || 
             output.includes('Server running') ||
             output.includes('WebSocket Server running')) && !hasResolved) {
          hasResolved = true;
          // Unref so the parent process can exit
          serverProcess.unref();
          resolve({ success: true, message: 'Server started successfully' });
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;
        console.error('WebSocket Server Error:', output);
        
        if (output.includes('EADDRINUSE') && !hasResolved) {
          hasResolved = true;
          resolve({ success: true, message: `Server already running on port ${port}` });
        }
      });
      
      serverProcess.on('error', (error) => {
        if (!hasResolved) {
          hasResolved = true;
          reject(error);
        }
      });
      
      serverProcess.on('exit', (code) => {
        if (!hasResolved) {
          hasResolved = true;
          if (code === 0) {
            resolve({ success: true, message: 'Server started successfully' });
          } else {
            reject(new Error(`Server process exited with code ${code}. Output: ${outputBuffer}`));
          }
        }
      });
      
      // Timeout after 30 seconds (increased to allow for npm install if needed)
      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          // Server might still be starting, so don't kill it
          serverProcess.unref();
          resolve({ 
            success: true, 
            message: 'Server is starting (this may take a moment for first run)' 
          });
        }
      }, 30000);
    });
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

ipcMain.handle('stop-websocket-server', async () => {
  try {
    const { exec } = require('child_process');
    const os = require('os');
    const config = loadConfig();
    const { port } = getServerConfig(config);
    
    console.log(`Stopping WebSocket server on port ${port}...`);
    
    // FIRST: Stop streaming if active
    if (streamingManager) {
      console.log('Stopping active streaming...');
      try {
        await streamingManager.stopStreaming();
        streamingManager = null;
        console.log('Streaming stopped');
      } catch (error) {
        console.error('Error stopping streaming:', error);
      }
    }
    
    // SECOND: Disconnect the WebSocket client to prevent reconnection attempts
    // NOTE: We do NOT end the session - it will resume when server restarts
    if (webSocketManager && webSocketManager.isConnectedToServer()) {
      console.log('Disconnecting WebSocket client before stopping server...');
      webSocketManager.disconnect();
      // Give it a moment to clean up
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // THIRD: Notify UI to gray out buttons but keep session info
    mainWindow?.webContents.send('server-stopping', {
      streamingStopped: true,
      sessionPreserved: true,
      disconnected: true
    });
    
    // Detect platform
    const isWindows = os.platform() === 'win32';
    
    return new Promise((resolve) => {
      if (isWindows) {
        // Windows: Use netstat and taskkill
        const command = `netstat -ano | findstr :${port} | findstr LISTENING`;
        exec(command, (error, stdout, stderr) => {
          if (error || !stdout) {
            console.log('No server process found on port', port);
            resolve({ success: true, message: 'Server stopped (was not running)' });
            return;
          }
          
          // Extract PID from netstat output (last column)
          const lines = stdout.trim().split('\n');
          const pids = new Set<string>();
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') {
              pids.add(pid);
            }
          }
          
          if (pids.size === 0) {
            console.log('No server process found on port', port);
            resolve({ success: true, message: 'Server stopped (was not running)' });
            return;
          }
          
          // Kill each PID
          const pidArray = Array.from(pids);
          exec(`taskkill /F /PID ${pidArray.join(' /PID ')}`, (killError) => {
            if (killError) {
              console.error('Error killing process:', killError);
              resolve({ success: false, message: 'Failed to stop server process' });
            } else {
              console.log('Server process killed on port', port);
              resolve({ success: true, message: 'Server stopped successfully' });
            }
          });
        });
      } else {
        // macOS/Linux: Use lsof
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
      }
    });
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});


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
