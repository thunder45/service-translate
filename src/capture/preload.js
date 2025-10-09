const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  
  // Authentication (legacy Cognito)
  checkStoredCredentials: () => ipcRenderer.invoke('check-stored-credentials'),
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  logout: () => ipcRenderer.invoke('logout'),
  changePassword: (credentials) => ipcRenderer.invoke('change-password', credentials),
  
  // Admin authentication
  adminAuthenticate: (credentials) => ipcRenderer.invoke('admin-authenticate', credentials),
  adminAuthenticateWithToken: (data) => ipcRenderer.invoke('admin-authenticate-with-token', data),
  refreshAdminToken: (data) => ipcRenderer.invoke('refresh-admin-token', data),
  storeAdminTokens: (data) => ipcRenderer.invoke('store-admin-tokens', data),
  loadStoredAdminTokens: () => ipcRenderer.invoke('load-stored-admin-tokens'),
  clearAdminTokens: () => ipcRenderer.invoke('clear-admin-tokens'),
  
  // Local streaming
  startLocalStreaming: () => ipcRenderer.invoke('start-local-streaming'),
  stopLocalStreaming: () => ipcRenderer.invoke('stop-local-streaming'),
  
  // Holyrics integration
  clearHolyrics: () => ipcRenderer.invoke('clear-holyrics'),
  testHolyricsConnection: () => ipcRenderer.invoke('test-holyrics-connection'),
  
  // TTS and WebSocket
  connectWebSocket: () => ipcRenderer.invoke('connect-websocket'),
  disconnectWebSocket: () => ipcRenderer.invoke('disconnect-websocket'),
  createSession: (sessionId) => ipcRenderer.invoke('create-session', sessionId),
  endSession: () => ipcRenderer.invoke('end-session'),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  updateTTSConfig: (config) => ipcRenderer.invoke('update-tts-config', config),
  getCurrentCosts: () => ipcRenderer.invoke('get-current-costs'),
  resetCostTracking: () => ipcRenderer.invoke('reset-cost-tracking'),
  startWebSocketServer: () => ipcRenderer.invoke('start-websocket-server'),
  stopWebSocketServer: () => ipcRenderer.invoke('stop-websocket-server'),
  
  // Event listeners
  onTranscription: (callback) => ipcRenderer.on('transcription', (_, data) => callback(data)),
  onTranslation: (callback) => ipcRenderer.on('translation', (_, data) => callback(data)),
  onStreamingError: (callback) => ipcRenderer.on('streaming-error', (_, data) => callback(data)),
  onAudioLevel: (callback) => ipcRenderer.on('audio-level', (_, data) => callback(data)),
  
  // TTS and WebSocket events
  onPollyUsage: (callback) => ipcRenderer.on('polly-usage', (_, data) => callback(data)),
  onCostsUpdated: (callback) => ipcRenderer.on('costs-updated', (_, data) => callback(data)),
  onCostAlert: (callback) => ipcRenderer.on('cost-alert', (_, data) => callback(data)),
  onWebSocketConnected: (callback) => ipcRenderer.on('websocket-connected', () => callback()),
  onWebSocketDisconnected: (callback) => ipcRenderer.on('websocket-disconnected', () => callback()),
  onClientConnected: (callback) => ipcRenderer.on('client-connected', (_, data) => callback(data)),
  onClientDisconnected: (callback) => ipcRenderer.on('client-disconnected', (_, data) => callback(data)),
});
