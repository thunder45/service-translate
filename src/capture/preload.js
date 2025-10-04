const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  
  // Authentication
  checkStoredCredentials: () => ipcRenderer.invoke('check-stored-credentials'),
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  logout: () => ipcRenderer.invoke('logout'),
  changePassword: (credentials) => ipcRenderer.invoke('change-password', credentials),
  
  // Local streaming
  startLocalStreaming: () => ipcRenderer.invoke('start-local-streaming'),
  stopLocalStreaming: () => ipcRenderer.invoke('stop-local-streaming'),
  
  // Holyrics integration
  clearHolyrics: () => ipcRenderer.invoke('clear-holyrics'),
  testHolyricsConnection: () => ipcRenderer.invoke('test-holyrics-connection'),
  
  // Event listeners
  onTranscription: (callback) => ipcRenderer.on('transcription', (_, data) => callback(data)),
  onTranslation: (callback) => ipcRenderer.on('translation', (_, data) => callback(data)),
  onStreamingError: (callback) => ipcRenderer.on('streaming-error', (_, data) => callback(data)),
  onAudioLevel: (callback) => ipcRenderer.on('audio-level', (_, data) => callback(data)),
});
