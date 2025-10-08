import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';

export type TargetLanguage = 'en-US' | 'es-ES' | 'fr-FR' | 'de-DE' | 'it-IT';
export type TTSMode = 'neural' | 'standard' | 'local' | 'disabled';

export interface SessionConfig {
  sessionId: string;
  enabledLanguages: TargetLanguage[];
  ttsMode: TTSMode;
  audioQuality: 'high' | 'medium' | 'low';
}

export interface ConnectionHealthStatus {
  connected: boolean;
  lastPing: number;
  latency: number;
  reconnectAttempts: number;
  ttsCapabilities: {
    polly: boolean;
    local: boolean;
    textOnly: boolean;
  };
}

export interface TranslationMessage {
  type: 'translation';
  text: string;
  language: TargetLanguage;
  timestamp: number;
  audioUrl?: string;
  useLocalTTS?: boolean;
}

export interface SessionMetadataMessage {
  type: 'session-metadata';
  config: SessionConfig;
  availableLanguages: TargetLanguage[];
  ttsAvailable: boolean;
  audioQuality: string;
}

export interface StartSessionMessage {
  type: 'start-session';
  sessionId: string;
  config: SessionConfig;
}

export interface ConfigUpdateMessage {
  type: 'config-update';
  sessionId: string;
  config: SessionConfig;
}

export interface WebSocketConfig {
  serverUrl: string;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export class WebSocketManager extends EventEmitter {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private currentSession: SessionConfig | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private connectionHealth: ConnectionHealthStatus;
  private sessionStateBackup: SessionConfig | null = null;

  constructor(config: WebSocketConfig) {
    super();
    this.config = config;
    this.connectionHealth = {
      connected: false,
      lastPing: 0,
      latency: 0,
      reconnectAttempts: 0,
      ttsCapabilities: {
        polly: false,
        local: false,
        textOnly: true
      }
    };
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.socket && this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.config.serverUrl, {
          transports: ['websocket'],
          timeout: 10000,
          reconnection: false, // We handle reconnection manually
        });

        this.setupEventHandlers();

        this.socket.on('connect', () => {
          console.log('Connected to WebSocket server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.connectionHealth.connected = true;
          this.connectionHealth.reconnectAttempts = 0;
          
          // Start health monitoring
          this.startHealthMonitoring();
          
          // Test TTS capabilities after connection
          this.testTTSCapabilities();
          
          this.emit('connected');
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          this.isConnected = false;
          this.emit('connection-error', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.connectionHealth.connected = false;
    this.currentSession = null;
    this.emit('disconnected');
  }

  /**
   * Create a new session
   */
  async createSession(sessionId: string, config: SessionConfig): Promise<void> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to WebSocket server');
    }

    const message: StartSessionMessage = {
      type: 'start-session',
      sessionId,
      config
    };

    this.socket.emit('admin-message', message);
    this.currentSession = config;
    this.sessionStateBackup = { ...config }; // Backup for recovery
    this.persistActiveSession(sessionId);
    this.emit('session-created', sessionId, config);
  }

  async reconnectToSession(sessionId: string): Promise<boolean> {
    if (!this.isConnected || !this.socket) {
      return false;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);

      this.socket!.once('session-joined', (metadata: any) => {
        clearTimeout(timeout);
        this.currentSession = {
          sessionId,
          enabledLanguages: metadata.availableLanguages,
          ttsMode: metadata.config.ttsMode,
          audioQuality: metadata.config.audioQuality
        };
        this.sessionStateBackup = { ...this.currentSession };
        this.emit('session-reconnected', this.currentSession);
        resolve(true);
      });

      this.socket!.once('session-join-failed', () => {
        clearTimeout(timeout);
        this.clearActiveSession();
        resolve(false);
      });

      this.socket!.emit('join-session', {
        sessionId,
        preferredLanguage: 'en-US',
        audioCapabilities: { supportsPolly: true, localTTSLanguages: [], audioFormats: ['mp3'] }
      });
    });
  }

  private persistActiveSession(sessionId: string): void {
    try {
      const { loadConfig, saveConfig } = require('./config');
      const config = loadConfig();
      if (config && config.tts) {
        config.tts.activeSessionId = sessionId;
        saveConfig(config);
      }
    } catch (error) {
      console.error('Failed to persist active session:', error);
    }
  }

  private clearActiveSession(): void {
    try {
      const { loadConfig, saveConfig } = require('./config');
      const config = loadConfig();
      if (config && config.tts) {
        delete config.tts.activeSessionId;
        saveConfig(config);
      }
    } catch (error) {
      console.error('Failed to clear active session:', error);
    }
  }

  /**
   * Update session configuration
   */
  async updateSessionConfig(config: SessionConfig): Promise<void> {
    if (!this.isConnected || !this.socket || !this.currentSession) {
      throw new Error('No active session to update');
    }

    const message: ConfigUpdateMessage = {
      type: 'config-update',
      sessionId: this.currentSession.sessionId,
      config
    };

    this.socket.emit('admin-message', message);
    this.currentSession = config;
    this.sessionStateBackup = { ...config }; // Update backup
    this.emit('session-updated', config);
  }

  /**
   * Send translations to TTS server for processing
   */
  async sendTranslations(data: {
    original: string;
    translations: Record<string, string>;
    generateTTS?: boolean;
    voiceType?: 'neural' | 'standard';
  }): Promise<void> {
    if (!this.isConnected || !this.socket || !this.currentSession) {
      console.warn('Cannot send translations: not connected or no active session');
      return;
    }

    this.socket.emit('broadcast-translation', {
      sessionId: this.currentSession.sessionId,
      original: data.original,
      translations: data.translations,
      generateTTS: data.generateTTS ?? true,
      voiceType: data.voiceType ?? 'neural'
    });
  }

  /**
   * Broadcast translation to clients (legacy method - kept for compatibility)
   */
  broadcastTranslation(originalText: string, translations: Array<{targetLanguage: TargetLanguage; text: string}>, audioUrls?: Map<TargetLanguage, string>): void {
    if (!this.isConnected || !this.socket || !this.currentSession) {
      console.warn('Cannot broadcast translation: not connected or no active session');
      return;
    }

    // Send translation for each enabled language
    for (const translation of translations) {
      if (this.currentSession.enabledLanguages.includes(translation.targetLanguage)) {
        const message: TranslationMessage = {
          type: 'translation',
          text: translation.text,
          language: translation.targetLanguage,
          timestamp: Date.now(),
          audioUrl: audioUrls?.get(translation.targetLanguage),
          useLocalTTS: this.currentSession.ttsMode === 'local'
        };

        this.socket.emit('admin-message', message);
      }
    }

    this.emit('translation-broadcast', {
      originalText,
      translations,
      audioUrls
    });
  }

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    if (!this.isConnected || !this.socket || !this.currentSession) {
      return;
    }

    this.socket.emit('end-session', {
      sessionId: this.currentSession.sessionId
    });

    this.currentSession = null;
    this.clearActiveSession();
    this.emit('session-ended');
  }

  async listSessions(): Promise<any[]> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to WebSocket server');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('List sessions timeout'));
      }, 5000);

      this.socket!.once('sessions-list', (data: any) => {
        clearTimeout(timeout);
        resolve(data.sessions || []);
      });

      this.socket!.emit('list-sessions');
    });
  }

  /**
   * Get current session configuration
   */
  getCurrentSession(): SessionConfig | null {
    return this.currentSession;
  }

  /**
   * Check if connected to server
   */
  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    // This would be received from server in a real implementation
    return 0;
  }

  /**
   * Update WebSocket configuration
   */
  updateConfig(newConfig: Partial<WebSocketConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Start connection health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Perform connection health check
   */
  private performHealthCheck(): void {
    if (!this.socket || !this.isConnected) {
      return;
    }

    const pingStart = Date.now();
    this.connectionHealth.lastPing = pingStart;

    this.socket.emit('ping', { timestamp: pingStart });

    // Set timeout for pong response
    const pongTimeout = setTimeout(() => {
      console.warn('Health check timeout - connection may be unstable');
      this.emit('connection-unstable');
    }, 5000);

    this.socket.once('pong', (data) => {
      clearTimeout(pongTimeout);
      const latency = Date.now() - pingStart;
      this.connectionHealth.latency = latency;
      
      if (latency > 2000) {
        console.warn(`High latency detected: ${latency}ms`);
        this.emit('high-latency', latency);
      }
    });
  }

  /**
   * Test TTS capabilities
   */
  private async testTTSCapabilities(): Promise<void> {
    if (!this.socket || !this.isConnected) {
      return;
    }

    try {
      // Request TTS capabilities from server
      this.socket.emit('test-tts-capabilities', { language: 'en' });

      // Listen for response
      this.socket.once('tts-capabilities-result', (result) => {
        this.connectionHealth.ttsCapabilities = {
          polly: result.polly || false,
          local: result.local || false,
          textOnly: result.textOnly !== false // Default to true
        };

        console.log('TTS capabilities updated:', this.connectionHealth.ttsCapabilities);
        this.emit('tts-capabilities-updated', this.connectionHealth.ttsCapabilities);
      });
    } catch (error) {
      console.error('Failed to test TTS capabilities:', error);
      // Set safe defaults
      this.connectionHealth.ttsCapabilities = {
        polly: false,
        local: false,
        textOnly: true
      };
    }
  }

  /**
   * Get connection health status
   */
  getConnectionHealth(): ConnectionHealthStatus {
    return { ...this.connectionHealth };
  }

  /**
   * Force reconnection
   */
  async forceReconnect(): Promise<void> {
    console.log('Forcing reconnection...');
    this.disconnect();
    this.reconnectAttempts = 0;
    await this.connect();
  }

  /**
   * Check if TTS is available
   */
  isTTSAvailable(): boolean {
    return this.connectionHealth.ttsCapabilities.polly || 
           this.connectionHealth.ttsCapabilities.local;
  }

  /**
   * Get TTS capabilities
   */
  getTTSCapabilities() {
    return { ...this.connectionHealth.ttsCapabilities };
  }

  // Private methods

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('disconnect', (reason) => {
      console.log('=== WebSocket Disconnected ===');
      console.log('Reason:', reason);
      console.log('Was connected:', this.isConnected);
      console.log('Current session:', this.currentSession?.sessionId || 'none');
      this.isConnected = false;
      this.connectionHealth.connected = false;
      this.emit('disconnected', reason);
      
      // Attempt reconnection if not manually disconnected
      if (reason !== 'io client disconnect') {
        console.log('Attempting automatic reconnection...');
        this.attemptReconnection();
      } else {
        console.log('Manual disconnect - not reconnecting');
      }
    });

    this.socket.on('error', (error) => {
      console.error('=== WebSocket Error ===');
      console.error('Error:', error);
      this.emit('error', error);
    });

    // Handle server messages
    this.socket.on('server-message', (message) => {
      this.handleServerMessage(message);
    });

    // Handle client connection updates
    this.socket.on('client-connected', (clientInfo) => {
      this.emit('client-connected', clientInfo);
    });

    this.socket.on('client-disconnected', (clientInfo) => {
      this.emit('client-disconnected', clientInfo);
    });

    // Handle session events
    this.socket.on('session-created', (sessionInfo) => {
      this.emit('session-confirmed', sessionInfo);
    });

    this.socket.on('session-error', (error) => {
      this.emit('session-error', error);
    });
  }

  private handleServerMessage(message: any): void {
    switch (message.type) {
      case 'session-metadata':
        this.emit('session-metadata', message as SessionMetadataMessage);
        break;
      
      case 'client-count-update':
        this.emit('client-count-update', message.count);
        break;
      
      case 'error':
        this.emit('server-error', message.error);
        break;
      
      default:
        console.log('Unknown server message:', message);
    }
  }

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.config.reconnectAttempts) {
      console.log('Max reconnection attempts reached');
      this.connectionHealth.reconnectAttempts = this.reconnectAttempts;
      this.emit('reconnection-failed');
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts); // Exponential backoff
    this.reconnectAttempts++;
    this.connectionHealth.reconnectAttempts = this.reconnectAttempts;

    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.config.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        
        // Restore session state if it existed
        await this.recoverSessionState();
        
        this.emit('reconnected');
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.attemptReconnection();
      }
    }, delay);
  }

  /**
   * Recover session state after reconnection
   */
  private async recoverSessionState(): Promise<void> {
    if (this.sessionStateBackup) {
      try {
        console.log('Recovering session state after reconnection...');
        
        // Recreate session with backed up configuration
        await this.createSession(this.sessionStateBackup.sessionId, this.sessionStateBackup);
        
        // Test TTS capabilities after recovery
        await this.testTTSCapabilities();
        
        console.log('Session state recovered successfully');
        this.emit('session-recovered', this.sessionStateBackup);
      } catch (error) {
        console.error('Failed to recover session state:', error);
        this.emit('session-recovery-failed', error);
      }
    }
  }
}