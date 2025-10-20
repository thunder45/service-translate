// Error Message Handler for new WebSocket server error format
class ErrorMessageHandler {
  constructor() {
    // Error code registry with user-friendly messages as fallback
    this.errorCodeInfo = {
      // Session Management Errors
      'SESSION_1201': { severity: 'error', category: 'session' },
      'SESSION_1202': { severity: 'warning', category: 'session' },
      'SESSION_1203': { severity: 'error', category: 'validation' },
      'SESSION_1204': { severity: 'error', category: 'system' },
      'SESSION_1205': { severity: 'error', category: 'system' },
      'SESSION_1206': { severity: 'error', category: 'system' },
      'SESSION_1207': { severity: 'warning', category: 'session' },
      
      // System Errors
      'SYSTEM_1401': { severity: 'error', category: 'system' },
      'SYSTEM_1402': { severity: 'error', category: 'system' },
      'SYSTEM_1403': { severity: 'warning', category: 'network' },
      'SYSTEM_1404': { severity: 'warning', category: 'rate-limit' },
      'SYSTEM_1405': { severity: 'info', category: 'maintenance' },
      'SYSTEM_1406': { severity: 'warning', category: 'capacity' },
      
      // Validation Errors
      'VALIDATION_1501': { severity: 'error', category: 'validation' },
      'VALIDATION_1502': { severity: 'error', category: 'validation' },
      'VALIDATION_1503': { severity: 'error', category: 'validation' },
      'VALIDATION_1504': { severity: 'error', category: 'validation' },
      'VALIDATION_1505': { severity: 'error', category: 'validation' }
    };
  }

  /**
   * Parse error message from server
   * Handles both new format (with errorCode) and legacy format (with code)
   */
  parseError(errorMessage) {
    // New format check
    if (errorMessage.errorCode) {
      return {
        isNewFormat: true,
        errorCode: errorMessage.errorCode,
        message: errorMessage.message || 'An error occurred',
        userMessage: errorMessage.userMessage || errorMessage.message || 'An error occurred',
        retryable: errorMessage.retryable !== undefined ? errorMessage.retryable : false,
        retryAfter: errorMessage.retryAfter || null,
        details: errorMessage.details || {},
        timestamp: errorMessage.timestamp || new Date().toISOString(),
        severity: this.getErrorSeverity(errorMessage.errorCode),
        category: this.getErrorCategory(errorMessage.errorCode)
      };
    }
    
    // Legacy format (backward compatibility)
    return {
      isNewFormat: false,
      errorCode: `LEGACY_${errorMessage.code || 'UNKNOWN'}`,
      message: errorMessage.message || 'An error occurred',
      userMessage: errorMessage.message || 'An error occurred',
      retryable: false,
      retryAfter: null,
      details: errorMessage.details || {},
      timestamp: new Date().toISOString(),
      severity: 'error',
      category: 'unknown'
    };
  }

  /**
   * Get error severity from error code
   */
  getErrorSeverity(errorCode) {
    const info = this.errorCodeInfo[errorCode];
    return info ? info.severity : 'error';
  }

  /**
   * Get error category from error code
   */
  getErrorCategory(errorCode) {
    const info = this.errorCodeInfo[errorCode];
    return info ? info.category : 'unknown';
  }

  /**
   * Check if error is retryable
   */
  isRetryable(parsedError) {
    return parsedError.retryable === true;
  }

  /**
   * Get retry delay in milliseconds
   */
  getRetryDelay(parsedError) {
    if (parsedError.retryAfter) {
      return parsedError.retryAfter * 1000; // Convert seconds to milliseconds
    }
    return 0;
  }

  /**
   * Format error for display
   */
  formatForDisplay(parsedError) {
    return {
      message: parsedError.userMessage,
      type: parsedError.severity,
      canRetry: parsedError.retryable,
      retryAfter: parsedError.retryAfter,
      details: parsedError.details
    };
  }

  /**
   * Log error for debugging
   */
  logError(parsedError) {
    console.error('[Error]', {
      code: parsedError.errorCode,
      message: parsedError.message,
      userMessage: parsedError.userMessage,
      retryable: parsedError.retryable,
      category: parsedError.category,
      timestamp: parsedError.timestamp,
      details: parsedError.details
    });
  }
}

// Audio Player for cloud-generated audio (Polly)
class AudioPlayer {
  constructor() {
    this.audioQueue = [];
    this.currentAudio = null;
    this.isPlaying = false;
    this.volume = 0.8;
    this.muted = false;
  }

  async playAudio(audioUrl, options = {}) {
    return new Promise((resolve, reject) => {
      // Stop current audio if playing
      this.stop();

      const audio = new Audio();
      this.currentAudio = audio;

      // Configure audio
      audio.volume = this.muted ? 0 : (options.volume || this.volume);
      audio.preload = 'auto';

      // Event handlers
      audio.onloadstart = () => {
        console.log('Audio loading started');
      };

      audio.oncanplay = () => {
        console.log('Audio can start playing');
      };

      audio.onplay = () => {
        console.log('Audio playback started');
        this.isPlaying = true;
      };

      audio.onended = () => {
        console.log('Audio playback ended');
        this.isPlaying = false;
        this.currentAudio = null;
        resolve();
      };

      audio.onerror = (event) => {
        console.error('Audio playback error:', event);
        this.isPlaying = false;
        this.currentAudio = null;
        reject(new Error(`Audio playback failed: ${audio.error?.message || 'Unknown error'}`));
      };

      audio.onabort = () => {
        console.log('Audio playback aborted');
        this.isPlaying = false;
        this.currentAudio = null;
        resolve(); // Resolve rather than reject for user-initiated stops
      };

      // Load and play
      try {
        audio.src = audioUrl;
        audio.load();
        
        // Play when ready
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Audio play promise rejected:', error);
            reject(error);
          });
        }
      } catch (error) {
        console.error('Audio setup error:', error);
        reject(error);
      }
    });
  }

  async queueAudio(audioUrl, options = {}) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        audioUrl,
        options,
        resolve,
        reject
      };

      this.audioQueue.push(queueItem);
      
      // Start playing if not currently playing
      if (!this.isPlaying) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    if (this.audioQueue.length === 0 || this.isPlaying) {
      return;
    }

    const item = this.audioQueue.shift();
    
    try {
      await this.playAudio(item.audioUrl, item.options);
      item.resolve();
    } catch (error) {
      item.reject(error);
    }

    // Process next item in queue
    if (this.audioQueue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }

  pause() {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
      this.isPlaying = false;
    }
  }

  resume() {
    if (this.currentAudio && this.currentAudio.paused) {
      const playPromise = this.currentAudio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          this.isPlaying = true;
        }).catch(error => {
          console.error('Resume failed:', error);
        });
      }
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.currentAudio) {
      this.currentAudio.volume = this.muted ? 0 : this.volume;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.currentAudio) {
      this.currentAudio.volume = muted ? 0 : this.volume;
    }
  }

  clearQueue() {
    // Reject all queued items
    this.audioQueue.forEach(item => {
      item.reject(new Error('Audio queue cleared'));
    });
    this.audioQueue = [];
  }

  getStatus() {
    return {
      isPlaying: this.isPlaying,
      queueLength: this.audioQueue.length,
      volume: this.volume,
      muted: this.muted,
      currentTime: this.currentAudio?.currentTime || 0,
      duration: this.currentAudio?.duration || 0
    };
  }
}

// Local TTS Service using Web Speech API
class LocalTTSService {
  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.availableVoices = new Map();
    this.isSupported = 'speechSynthesis' in window;
    this.isLoading = false;
    
    if (this.isSupported) {
      this.loadVoices();
      
      // Handle voice loading on some browsers
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (this.isLoading) return;
    this.isLoading = true;
    
    try {
      const voices = this.speechSynthesis.getVoices();
      console.log('Available TTS voices:', voices.length);
      
      // Clear existing voices
      this.availableVoices.clear();
      
      // Group voices by language
      voices.forEach(voice => {
        const lang = voice.lang.substring(0, 2).toLowerCase();
        if (['en', 'es', 'fr', 'de', 'it'].includes(lang)) {
          if (!this.availableVoices.has(lang)) {
            this.availableVoices.set(lang, []);
          }
          this.availableVoices.get(lang).push(voice);
        }
      });
      
      // Sort voices by quality (prefer local, then network)
      this.availableVoices.forEach((voiceList, lang) => {
        voiceList.sort((a, b) => {
          // Prefer local voices
          if (a.localService && !b.localService) return -1;
          if (!a.localService && b.localService) return 1;
          
          // Prefer default voices
          if (a.default && !b.default) return -1;
          if (!a.default && b.default) return 1;
          
          return 0;
        });
      });
      
      console.log('TTS voices loaded:', Object.fromEntries(this.availableVoices));
    } catch (error) {
      console.error('Error loading TTS voices:', error);
    } finally {
      this.isLoading = false;
    }
  }

  isLanguageSupported(language) {
    return this.isSupported && this.availableVoices.has(language);
  }

  getBestVoiceForLanguage(language) {
    if (!this.isLanguageSupported(language)) {
      return null;
    }
    
    const voices = this.availableVoices.get(language);
    return voices && voices.length > 0 ? voices[0] : null;
  }

  getVoiceQuality(language) {
    if (!this.isLanguageSupported(language)) {
      return 'none';
    }
    
    const voice = this.getBestVoiceForLanguage(language);
    if (!voice) return 'none';
    
    // Determine quality based on voice characteristics
    if (voice.localService) {
      return 'high';
    } else if (voice.default) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  async speak(text, language, options = {}) {
    if (!this.isSupported) {
      throw new Error('Speech synthesis not supported');
    }

    if (!text || !text.trim()) {
      return;
    }

    // Stop any current speech
    this.stop();

    const voice = this.getBestVoiceForLanguage(language);
    if (!voice) {
      throw new Error(`No voice available for language: ${language}`);
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Configure utterance
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.volume = (options.volume || 80) / 100;
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;
      
      // Event handlers
      utterance.onend = () => {
        console.log('TTS finished speaking');
        resolve();
      };
      
      utterance.onerror = (event) => {
        console.error('TTS error:', event.error);
        reject(new Error(`TTS error: ${event.error}`));
      };
      
      utterance.onstart = () => {
        console.log('TTS started speaking');
      };
      
      // Speak the text
      try {
        this.speechSynthesis.speak(utterance);
      } catch (error) {
        reject(error);
      }
    });
  }

  stop() {
    if (this.isSupported && this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }
  }

  pause() {
    if (this.isSupported && this.speechSynthesis.speaking) {
      this.speechSynthesis.pause();
    }
  }

  resume() {
    if (this.isSupported && this.speechSynthesis.paused) {
      this.speechSynthesis.resume();
    }
  }

  getSupportedLanguages() {
    return Array.from(this.availableVoices.keys());
  }

  getVoiceInfo(language) {
    const voice = this.getBestVoiceForLanguage(language);
    if (!voice) return null;
    
    return {
      name: voice.name,
      lang: voice.lang,
      localService: voice.localService,
      default: voice.default,
      quality: this.getVoiceQuality(language)
    };
  }
}

// Service Translate Client PWA - Main Application
class ServiceTranslateClient {
  constructor() {
    this.socket = null;
    this.currentSession = null;
    this.isConnected = false;
    this.offlineMode = false;
    this.reconnectionTimer = null;
    this.settings = this.loadSettings();
    this.localTTS = new LocalTTSService();
    this.audioPlayer = new AudioPlayer();
    this.errorHandler = new ErrorMessageHandler();
    
    // Performance optimization components
    this.performanceManager = new PerformanceManager();
    this.lazyLoader = new LazyLoader();
    this.userAnalytics = new UserAnalytics();
    
    // Message processing optimization
    this.messageQueue = [];
    this.isProcessingMessages = false;
    this.domUpdateQueue = [];
    this.isUpdatingDOM = false;
    
    // Initialize app when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    console.log('Service Translate Client initializing...');
    
    // Register service worker
    this.registerServiceWorker();
    
    // Initialize UI components
    this.initializeUI();
    
    // Apply saved settings
    this.applySettings();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Start connection health monitoring
    this.startConnectionHealthMonitoring();
    
    console.log('Service Translate Client initialized');
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
        
        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              this.showUpdateAvailable();
            }
          });
        });
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  initializeUI() {
    // Get DOM elements
    this.elements = {
      // Screens
      joinScreen: document.getElementById('join-screen'),
      translationScreen: document.getElementById('translation-screen'),
      
      // Join form
      joinForm: document.getElementById('join-form'),
      sessionIdInput: document.getElementById('session-id'),
      joinStatus: document.getElementById('join-status'),
      
      // Session info
      currentSessionId: document.getElementById('current-session-id'),
      connectionIndicator: document.getElementById('connection-indicator'),
      connectionText: document.getElementById('connection-text'),
      
      // Language selection
      languageSelect: document.getElementById('language-select'),
      
      // Audio controls
      muteBtn: document.getElementById('mute-btn'),
      volumeSlider: document.getElementById('volume-slider'),
      volumeDisplay: document.getElementById('volume-display'),
      
      // Translation display
      translationDisplay: document.getElementById('translation-display'),
      
      // Settings
      settingsPanel: document.getElementById('settings-panel'),
      settingsCloseBtn: document.getElementById('settings-close-btn'),
      fontSizeSelect: document.getElementById('font-size'),
      fontFamilySelect: document.getElementById('font-family'),
      bgColorSelect: document.getElementById('bg-color'),
      textColorSelect: document.getElementById('text-color'),
      
      // Buttons
      fullscreenBtn: document.getElementById('fullscreen-btn'),
      settingsBtn: document.getElementById('settings-btn'),
      leaveBtn: document.getElementById('leave-btn'),
      
      // Overlays
      loadingOverlay: document.getElementById('loading-overlay')
    };
    
    // Initialize touch tracking for swipe gestures
    this.touchStartY = 0;
    this.touchEndY = 0;
  }

  setupEventListeners() {
    // Join form
    this.elements.joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinSession();
    });

    // Language selection
    this.elements.languageSelect.addEventListener('change', (e) => {
      const selectedLanguage = e.target.value;
      if (selectedLanguage) {
        this.changeLanguage(selectedLanguage);
        this.showLanguageSelectedFeedback(selectedLanguage);
        
        // Update TTS capability display for new language
        const existingInfo = document.querySelector('.tts-capability-info');
        if (existingInfo) {
          // Get current TTS mode from the existing display or default
          this.updateTTSCapabilityDisplay('local', 'medium');
        }
      } else {
        this.showLanguageSelectionPrompt();
      }
    });

    // Audio controls
    this.elements.muteBtn.addEventListener('click', () => {
      this.toggleMute();
    });

    this.elements.volumeSlider.addEventListener('input', (e) => {
      this.setVolume(parseInt(e.target.value));
    });

    // Settings button
    this.elements.settingsBtn.addEventListener('click', () => {
      this.toggleSettings();
    });

    // Settings close button
    this.elements.settingsCloseBtn.addEventListener('click', () => {
      this.closeSettings();
    });

    // Click outside settings panel to close
    document.addEventListener('click', (e) => {
      if (this.elements.settingsPanel.classList.contains('open')) {
        // Check if click is outside settings panel and not on settings button
        if (!this.elements.settingsPanel.contains(e.target) && 
            !this.elements.settingsBtn.contains(e.target)) {
          this.closeSettings();
        }
      }
    });

    // Touch gestures for settings panel (swipe down to close on mobile)
    this.elements.settingsPanel.addEventListener('touchstart', (e) => {
      this.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    this.elements.settingsPanel.addEventListener('touchmove', (e) => {
      this.touchEndY = e.touches[0].clientY;
    }, { passive: true });

    this.elements.settingsPanel.addEventListener('touchend', () => {
      this.handleSwipeGesture();
    }, { passive: true });

    // Setting changes
    this.elements.fontSizeSelect.addEventListener('change', (e) => {
      this.updateSetting('fontSize', e.target.value);
    });

    this.elements.fontFamilySelect.addEventListener('change', (e) => {
      this.updateSetting('fontFamily', e.target.value);
    });

    this.elements.bgColorSelect.addEventListener('change', (e) => {
      this.updateSetting('backgroundColor', e.target.value);
    });

    this.elements.textColorSelect.addEventListener('change', (e) => {
      this.updateSetting('textColor', e.target.value);
    });

    // Fullscreen
    this.elements.fullscreenBtn.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    // Leave session
    this.elements.leaveBtn.addEventListener('click', () => {
      this.leaveSession();
    });

    // Handle visibility changes for reconnection
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.currentSession && !this.isConnected) {
        this.reconnectToSession();
      }
    });

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', () => this.updateFullscreenButton());
    document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenButton());
    document.addEventListener('msfullscreenchange', () => this.updateFullscreenButton());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    
    // Show target screen
    const targetScreen = document.getElementById(`${screenName}-screen`);
    if (targetScreen) {
      targetScreen.classList.add('active');
    }
  }

  showLoading(show = true, text = 'Loading...') {
    const overlay = this.elements.loadingOverlay;
    const textElement = overlay.querySelector('.loading-text');
    
    if (textElement) {
      textElement.textContent = text;
    }
    
    if (show) {
      overlay.classList.add('show');
    } else {
      overlay.classList.remove('show');
    }
  }

  showStatus(message, type = 'info') {
    const statusElement = this.elements.joinStatus;
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    
    // Auto-clear success and info messages after 5 seconds
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (statusElement.textContent === message) {
          statusElement.textContent = '';
          statusElement.className = 'status-message';
        }
      }, 5000);
    }
  }

  async joinSession() {
    const sessionId = this.elements.sessionIdInput.value.trim();
    
    if (!sessionId) {
      this.showStatus('Please enter a session ID', 'error');
      return;
    }

    this.showLoading(true, 'Connecting to server...');
    this.showStatus('Connecting to session...', 'info');

    try {
      await this.connectToWebSocket();
      await this.sendJoinSessionMessage(sessionId);
    } catch (error) {
      console.error('Failed to join session:', error);
      this.showLoading(false);
      
      if (error.message.includes('Session not found')) {
        this.showStatus('Session not found. Please check the session ID and try again.', 'error');
      } else if (error.message.includes('timeout')) {
        this.showStatus('Connection timeout. Please check your network and try again.', 'error');
      } else {
        this.showStatus('Failed to connect. Please check your connection and try again.', 'error');
      }
      
      this.updateConnectionStatus(false);
    }
  }

  validateSessionId(sessionId) {
    // Accept various session ID formats:
    // - CHURCH-2025-001 (human readable)
    // - SESSION-123 (simple format)
    // - ABC123 (short format)
    // - Any alphanumeric with dashes
    const sessionIdPattern = /^[A-Z0-9][A-Z0-9\-]*[A-Z0-9]$|^[A-Z0-9]+$/;
    return sessionIdPattern.test(sessionId) && sessionId.length >= 3 && sessionId.length <= 50;
  }

  leaveSession() {
    // Send leave message to server
    if (this.socket && this.socket.connected && this.currentSession) {
      const message = {
        type: 'leave-session',
        sessionId: this.currentSession
      };
      this.socket.emit('leave-session', message);
    }
    
    // Stop all audio playback
    this.audioPlayer.stop();
    this.audioPlayer.clearQueue();
    this.localTTS.stop();
    
    // Disconnect WebSocket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Reset UI state
    this.currentSession = null;
    this.isConnected = false;
    this.elements.leaveBtn.style.display = 'none';
    this.elements.sessionIdInput.value = '';
    this.elements.languageSelect.innerHTML = '<option value="">Select Language...</option>';
    this.showStatus('', '');
    this.showScreen('join');
    this.updateConnectionStatus(false);
    
    // Clear translation display
    const welcomeMessage = '<div class="welcome-message"><p>Welcome! Select your language and wait for translations to begin.</p></div>';
    this.elements.translationDisplay.innerHTML = welcomeMessage;
    
    // Remove any notifications
    document.querySelectorAll('.language-notification, .tts-capability-info').forEach(el => el.remove());
  }

  changeLanguage(language) {
    if (!language) return;
    
    this.settings.preferredLanguage = language;
    this.saveSettings();
    
    // Send language change to server
    if (this.socket && this.socket.connected && this.currentSession) {
      const message = {
        type: 'change-language',
        sessionId: this.currentSession,
        newLanguage: language
      };
      
      this.socket.emit('change-language', message);
      console.log('Language change sent to server:', language);
    } else {
      console.log('Language preference saved locally:', language);
    }
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.saveSettings();
    this.updateAudioControls();
    
    // Update audio player mute state
    this.audioPlayer.setMuted(this.settings.muted);
    
    // Stop current audio if muting
    if (this.settings.muted) {
      this.localTTS.stop();
      this.audioPlayer.stop();
    }
    
    console.log('Mute toggled:', this.settings.muted);
  }

  setVolume(volume) {
    this.settings.volume = volume;
    this.saveSettings();
    this.updateAudioControls();
    
    // Update audio player volume immediately
    this.audioPlayer.setVolume(volume / 100);
    
    // Volume changes will apply to next TTS utterance
    // Current TTS cannot be adjusted mid-speech with Web Speech API
    console.log('Volume set to:', volume);
  }

  updateAudioControls() {
    const muteIcon = this.elements.muteBtn.querySelector('.icon');
    muteIcon.textContent = this.settings.muted ? '🔇' : '🔊';
    
    this.elements.volumeSlider.value = this.settings.volume;
    this.elements.volumeDisplay.textContent = `${this.settings.volume}%`;
  }

  toggleSettings() {
    this.elements.settingsPanel.classList.toggle('open');
  }

  closeSettings() {
    this.elements.settingsPanel.classList.remove('open');
  }

  /**
   * Handle swipe gesture on settings panel
   * Swipe down to close on mobile devices
   */
  handleSwipeGesture() {
    const swipeDistance = this.touchEndY - this.touchStartY;
    const minSwipeDistance = 50; // Minimum pixels to trigger swipe
    
    // Swipe down (touch end is below touch start)
    if (swipeDistance > minSwipeDistance) {
      console.log('Swipe down detected, closing settings');
      this.closeSettings();
    }
    
    // Reset touch coordinates
    this.touchStartY = 0;
    this.touchEndY = 0;
  }

  updateSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    this.applySettings();
    
    // Provide visual feedback for setting changes
    this.showSettingChangeFeedback(key, value);
  }

  showSettingChangeFeedback(key, value) {
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.className = 'setting-feedback';
    feedback.textContent = `${this.getSettingDisplayName(key)}: ${this.getSettingDisplayValue(key, value)}`;
    
    // Position it near the settings panel
    const settingsPanel = this.elements.settingsPanel;
    settingsPanel.appendChild(feedback);
    
    // Animate in
    setTimeout(() => feedback.classList.add('show'), 10);
    
    // Remove after 2 seconds
    setTimeout(() => {
      feedback.classList.remove('show');
      setTimeout(() => feedback.remove(), 300);
    }, 2000);
  }

  getSettingDisplayName(key) {
    const names = {
      fontSize: 'Font Size',
      fontFamily: 'Font Family',
      backgroundColor: 'Background',
      textColor: 'Text Color'
    };
    return names[key] || key;
  }

  getSettingDisplayValue(key, value) {
    if (key === 'fontSize') {
      return value.charAt(0).toUpperCase() + value.slice(1);
    } else if (key === 'fontFamily') {
      return value === 'sans-serif' ? 'Sans Serif' : 
             value === 'serif' ? 'Serif' : 'Monospace';
    } else if (key === 'backgroundColor' || key === 'textColor') {
      return value.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    }
    return value;
  }

  handleKeyboardShortcuts(event) {
    // Don't handle shortcuts when typing in inputs
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
      return;
    }

    switch (event.key) {
      case 'f':
      case 'F':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.toggleFullscreen();
        }
        break;
      
      case 'm':
      case 'M':
        event.preventDefault();
        this.toggleMute();
        break;
      
      case 's':
      case 'S':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          this.toggleSettings();
        }
        break;
      
      case 'Escape':
        // Close settings panel
        if (this.elements.settingsPanel.classList.contains('open')) {
          this.toggleSettings();
        }
        break;
      
      case 'ArrowUp':
        if (event.ctrlKey) {
          event.preventDefault();
          this.adjustVolume(5);
        }
        break;
      
      case 'ArrowDown':
        if (event.ctrlKey) {
          event.preventDefault();
          this.adjustVolume(-5);
        }
        break;
      
      case '?':
        if (event.shiftKey) {
          event.preventDefault();
          this.showKeyboardShortcuts();
        }
        break;
    }
  }

  adjustVolume(delta) {
    const newVolume = Math.max(0, Math.min(100, this.settings.volume + delta));
    this.setVolume(newVolume);
  }

  showKeyboardShortcuts() {
    const overlay = document.createElement('div');
    overlay.className = 'keyboard-shortcuts-overlay';
    overlay.innerHTML = `
      <div class="shortcuts-content">
        <h3>Keyboard Shortcuts</h3>
        <div class="shortcuts-list">
          <div class="shortcut-item">
            <kbd>M</kbd>
            <span>Toggle mute/unmute</span>
          </div>
          <div class="shortcut-item">
            <kbd>S</kbd>
            <span>Toggle settings panel</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>F</kbd>
            <span>Toggle fullscreen</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>↑</kbd>
            <span>Increase volume</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>↓</kbd>
            <span>Decrease volume</span>
          </div>
          <div class="shortcut-item">
            <kbd>Esc</kbd>
            <span>Close settings/dialogs</span>
          </div>
          <div class="shortcut-item">
            <kbd>?</kbd>
            <span>Show this help</span>
          </div>
        </div>
        <button class="close-shortcuts-btn">Close</button>
      </div>
    `;
    
    // Add event listeners
    const closeBtn = overlay.querySelector('.close-shortcuts-btn');
    closeBtn.addEventListener('click', () => overlay.remove());
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    document.addEventListener('keydown', function escapeHandler(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escapeHandler);
      }
    });
    
    document.body.appendChild(overlay);
    
    // Focus the close button for accessibility
    setTimeout(() => closeBtn.focus(), 100);
  }

  applySettings() {
    const body = document.body;
    
    // Remove existing theme classes
    body.className = body.className.replace(/theme-\w+-\w+/g, '');
    
    // Apply new theme classes
    body.classList.add(`theme-font-${this.settings.fontSize}`);
    body.classList.add(`theme-font-${this.settings.fontFamily}`);
    body.classList.add(`theme-bg-${this.settings.backgroundColor}`);
    body.classList.add(`theme-text-${this.settings.textColor}`);
    
    // Update form values
    this.elements.fontSizeSelect.value = this.settings.fontSize;
    this.elements.fontFamilySelect.value = this.settings.fontFamily;
    this.elements.bgColorSelect.value = this.settings.backgroundColor;
    this.elements.textColorSelect.value = this.settings.textColor;
    
    // Auto-fill last session ID if available
    if (this.settings.lastSessionId && !this.elements.sessionIdInput.value) {
      this.elements.sessionIdInput.value = this.settings.lastSessionId;
      this.elements.sessionIdInput.placeholder = `Last used: ${this.settings.lastSessionId}`;
    }
    
    // Initialize audio player settings
    this.audioPlayer.setVolume(this.settings.volume / 100);
    this.audioPlayer.setMuted(this.settings.muted);
    
    // Update audio controls
    this.updateAudioControls();
    
    // Update accessibility attributes
    this.updateAccessibilityAttributes();
  }

  updateAccessibilityAttributes() {
    // Update ARIA labels based on current settings
    this.elements.muteBtn.setAttribute('aria-label', 
      this.settings.muted ? 'Unmute audio' : 'Mute audio'
    );
    
    this.elements.volumeSlider.setAttribute('aria-label', 
      `Volume: ${this.settings.volume}%`
    );
    
    this.elements.fullscreenBtn.setAttribute('aria-label',
      document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'
    );
    
    // Update live region for screen readers
    const liveRegion = document.getElementById('live-region') || this.createLiveRegion();
    if (this.currentSession) {
      liveRegion.textContent = `Connected to session ${this.currentSession}`;
    }
  }

  createLiveRegion() {
    const liveRegion = document.createElement('div');
    liveRegion.id = 'live-region';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
    return liveRegion;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      // Try different fullscreen methods for browser compatibility
      const element = document.documentElement;
      
      if (element.requestFullscreen) {
        element.requestFullscreen().catch(err => {
          console.error('Error attempting to enable fullscreen:', err);
          this.showStatus('Fullscreen not supported on this device', 'error');
        });
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      } else {
        console.warn('Fullscreen API not supported');
        this.showStatus('Fullscreen not supported on this browser', 'error');
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  updateConnectionStatus(connected) {
    this.isConnected = connected;
    
    const indicator = this.elements.connectionIndicator;
    const text = this.elements.connectionText;
    
    if (connected) {
      indicator.classList.remove('offline');
      indicator.classList.add('online');
      text.textContent = 'Connected';
    } else {
      indicator.classList.remove('online');
      indicator.classList.add('offline');
      text.textContent = 'Disconnected';
    }
  }

  loadSettings() {
    const defaultSettings = {
      fontSize: 'medium',
      fontFamily: 'sans-serif',
      backgroundColor: 'white',
      textColor: 'black',
      volume: 80,
      muted: false,
      preferredLanguage: '',
      lastSessionId: '',
      autoReconnect: true
    };

    try {
      const saved = localStorage.getItem('st-client-settings');
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch (error) {
      console.error('Error loading settings:', error);
      return defaultSettings;
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('st-client-settings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  showUpdateAvailable() {
    // Simple update notification
    if (confirm('A new version is available. Reload to update?')) {
      window.location.reload();
    }
  }

  // WebSocket Connection Management
  async connectToWebSocket() {
    return new Promise((resolve, reject) => {
      // Try different possible server URLs
      const serverUrls = this.getServerUrls();
      let urlIndex = 0;
      let connectionTimeout;
      
      const tryConnection = () => {
        if (urlIndex >= serverUrls.length) {
          reject(new Error('Could not connect to WebSocket server. Please ensure the admin application is running and you are connected to the same network.'));
          return;
        }

        const url = serverUrls[urlIndex];
        console.log(`Attempting to connect to: ${url}`);
        
        // Clean up previous socket if exists
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
        }
        
        this.socket = io(url, {
          timeout: 8000,
          transports: ['websocket', 'polling'],
          forceNew: true,
          reconnection: false // We handle reconnection manually
        });

        // Set connection timeout
        connectionTimeout = setTimeout(() => {
          console.warn(`Connection timeout for ${url}`);
          this.socket.disconnect();
          urlIndex++;
          tryConnection();
        }, 8000);

        this.socket.on('connect', () => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket connected to:', url);
          this.connectedServerUrl = url;
          this.setupWebSocketListeners();
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(connectionTimeout);
          console.warn(`Failed to connect to ${url}:`, error.message);
          this.socket.disconnect();
          urlIndex++;
          setTimeout(tryConnection, 1000);
        });
      };

      tryConnection();
    });
  }

  getServerUrls() {
    const urls = [];
    
    // If we previously connected successfully, try that URL first
    if (this.connectedServerUrl) {
      urls.push(this.connectedServerUrl);
    }
    
    // PRIORITY 1: Use the same hostname as the current page
    // This ensures when accessing via IP, we connect to WebSocket on same IP
    const currentHostname = window.location.hostname;
    const websocketPort = 3001;
    
    if (currentHostname && currentHostname !== 'localhost' && currentHostname !== '127.0.0.1') {
      // Use current hostname first (most likely to work)
      urls.push(`http://${currentHostname}:${websocketPort}`);
      console.log(`Primary WebSocket URL: http://${currentHostname}:${websocketPort}`);
    }
    
    // PRIORITY 2: Try localhost
    urls.push(`ws://localhost:${websocketPort}`);
    urls.push(`http://localhost:${websocketPort}`);
    urls.push(`http://127.0.0.1:${websocketPort}`);
    
    // PRIORITY 3: Try common local network IPs (if not already added)
    const commonIPs = [
      '192.168.1.100', '192.168.1.101', '192.168.1.102',
      '192.168.0.100', '192.168.0.101', '192.168.0.102',
      '192.168.178.100', '192.168.178.101', '192.168.178.129',
      '10.0.0.100', '10.0.0.101', '10.0.0.102'
    ];
    
    commonIPs.forEach(ip => {
      if (ip !== currentHostname) {
        urls.push(`http://${ip}:${websocketPort}`);
      }
    });
    
    // Remove duplicates
    return [...new Set(urls)];
  }

  setupWebSocketListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.updateConnectionStatus(false);
      
      if (this.currentSession && this.settings.autoReconnect) {
        // Use enhanced reconnection with backoff
        this.attemptReconnectionWithBackoff();
      }
    });

    this.socket.on('reconnect', () => {
      console.log('WebSocket reconnected');
      this.updateConnectionStatus(true);
      
      if (this.currentSession) {
        this.sendJoinSessionMessage(this.currentSession);
      }
    });

    // Session events
    this.socket.on('session-metadata', (data) => {
      console.log('Received session metadata:', data);
      this.handleSessionMetadata(data);
    });

    this.socket.on('translation', (data) => {
      console.log('Received translation:', data);
      this.displayTranslation(data);
    });

    this.socket.on('config-update', (data) => {
      console.log('Received config update:', data);
      this.handleConfigUpdate(data);
    });

    // Error handling with new error message format
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleServerError(error);
    });

    this.socket.on('admin-error', (error) => {
      console.error('WebSocket admin error:', error);
      this.handleServerError(error);
    });

    // Custom session events
    this.socket.on('session-joined', (data) => {
      console.log('Successfully joined session:', data);
      this.handleSessionJoined(data);
    });

    this.socket.on('session-not-found', (data) => {
      console.log('Session not found:', data);
      this.showLoading(false);
      
      // Check if it's new error format
      if (data.errorCode) {
        this.handleServerError(data);
      } else {
        this.showStatus('Session not found. Please check the session ID.', 'error');
      }
    });

    this.socket.on('session-ended', (data) => {
      console.log('Session ended by admin:', data);
      this.handleSessionEnded(data);
    });

    this.socket.on('language-removed', (data) => {
      console.log('Language removed from session:', data);
      this.handleLanguageRemoved(data);
    });
  }

  /**
   * Handle server error messages with new format
   */
  handleServerError(errorMessage) {
    // Parse error using error handler
    const parsedError = this.errorHandler.parseError(errorMessage);
    
    // Log for debugging
    this.errorHandler.logError(parsedError);
    
    // Format for display
    const displayInfo = this.errorHandler.formatForDisplay(parsedError);
    
    // Show error to user
    if (displayInfo.canRetry && displayInfo.retryAfter) {
      // Show error with countdown and retry button
      this.showErrorWithRetry(displayInfo.message, displayInfo.type, displayInfo.retryAfter);
    } else if (displayInfo.canRetry) {
      // Show error with retry button (no countdown)
      this.showErrorWithRetry(displayInfo.message, displayInfo.type);
    } else {
      // Show error without retry option
      this.showStatus(displayInfo.message, displayInfo.type);
    }
    
    // Handle specific error categories
    switch (parsedError.category) {
      case 'session':
        this.handleSessionError(parsedError);
        break;
      case 'capacity':
        this.handleCapacityError(parsedError);
        break;
      case 'maintenance':
        this.handleMaintenanceError(parsedError);
        break;
      case 'network':
        this.handleNetworkError(parsedError);
        break;
    }
  }

  /**
   * Show error message with retry button
   */
  showErrorWithRetry(message, type, retryAfter = null) {
    const statusElement = this.elements.joinStatus;
    statusElement.className = `status-message ${type}`;
    
    if (retryAfter) {
      // Show countdown
      let remainingSeconds = retryAfter;
      statusElement.innerHTML = `
        ${message}
        <div class="retry-countdown">Retry available in <span class="countdown">${remainingSeconds}</span>s</div>
      `;
      
      const countdownElement = statusElement.querySelector('.countdown');
      const countdown = setInterval(() => {
        remainingSeconds--;
        if (countdownElement) {
          countdownElement.textContent = remainingSeconds;
        }
        
        if (remainingSeconds <= 0) {
          clearInterval(countdown);
          // Add retry button
          statusElement.innerHTML = `
            ${message}
            <button class="retry-btn" onclick="app.joinSession()">Retry Now</button>
          `;
        }
      }, 1000);
    } else {
      // Show immediate retry button
      statusElement.innerHTML = `
        ${message}
        <button class="retry-btn" onclick="app.joinSession()">Retry</button>
      `;
    }
  }

  /**
   * Handle session-specific errors
   */
  handleSessionError(parsedError) {
    if (parsedError.errorCode === 'SESSION_1201') {
      // Session not found - may need to refresh session list
      this.currentSession = null;
    } else if (parsedError.errorCode === 'SESSION_1207') {
      // Session full - suggest trying again later
      setTimeout(() => {
        this.showStatus('The session is currently full. Try again in a few minutes.', 'warning');
      }, 5000);
    }
  }

  /**
   * Handle capacity errors
   */
  handleCapacityError(parsedError) {
    // Server at capacity - show appropriate message
    this.showStatus(parsedError.userMessage + ' Please try again later.', 'warning');
  }

  /**
   * Handle maintenance errors
   */
  handleMaintenanceError(parsedError) {
    // System in maintenance mode
    this.showStatus(parsedError.userMessage, 'info');
  }

  /**
   * Handle network errors
   */
  handleNetworkError(parsedError) {
    // Network error - may trigger auto-reconnect
    if (this.currentSession && this.settings.autoReconnect) {
      this.attemptReconnectionWithBackoff();
    }
  }

  /**
   * Handle session ended notification
   */
  handleSessionEnded(data) {
    console.log('Session ended:', data);
    
    // Show notification
    const notification = document.createElement('div');
    notification.className = 'session-ended-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <span class="icon">⚠️</span>
        <div class="text">
          <strong>Session Ended</strong>
          <p>The admin has ended this session.</p>
        </div>
        <button class="ok-btn" onclick="app.leaveSession(); this.parentElement.parentElement.remove();">
          OK
        </button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-leave after 10 seconds if user doesn't respond
    setTimeout(() => {
      if (notification.parentElement) {
        this.leaveSession();
        notification.remove();
      }
    }, 10000);
  }

  /**
   * Escape HTML to prevent XSS attacks
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async sendJoinSessionMessage(sessionId) {
    if (!this.socket || !this.socket.connected) {
      throw new Error('WebSocket not connected');
    }

    const audioCapabilities = await this.detectAudioCapabilities();
    
    const message = {
      type: 'join-session',
      sessionId: sessionId,
      preferredLanguage: this.settings.preferredLanguage || 'en', // Default to 'en' if not set
      audioCapabilities: audioCapabilities
    };

    return new Promise((resolve, reject) => {
      // Set up one-time listeners for response
      const timeout = setTimeout(() => {
        reject(new Error('Join session timeout'));
      }, 10000);

      this.socket.once('session-joined', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this.socket.once('session-not-found', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Session not found'));
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(error.message || 'Join session failed'));
      });

      // Send the message with type field and event name
      this.socket.emit('join-session', message);
    });
  }

  async detectAudioCapabilities() {
    const capabilities = {
      supportsPolly: true, // PWA can play audio URLs
      localTTSLanguages: [],
      audioFormats: this.detectSupportedAudioFormats()
    };

    // Detect Web Speech API support using our LocalTTSService
    if (this.localTTS.isSupported) {
      try {
        // Wait a bit for voices to load on some browsers
        await this.waitForVoices();
        capabilities.localTTSLanguages = this.localTTS.getSupportedLanguages();
      } catch (error) {
        console.warn('Error detecting speech synthesis voices:', error);
      }
    }

    return capabilities;
  }

  detectSupportedAudioFormats() {
    const audio = document.createElement('audio');
    const formats = [];
    
    // Test common audio formats
    const testFormats = [
      { format: 'mp3', mime: 'audio/mpeg' },
      { format: 'wav', mime: 'audio/wav' },
      { format: 'ogg', mime: 'audio/ogg' },
      { format: 'aac', mime: 'audio/aac' },
      { format: 'webm', mime: 'audio/webm' }
    ];
    
    testFormats.forEach(({ format, mime }) => {
      if (audio.canPlayType(mime) !== '') {
        formats.push(format);
      }
    });
    
    console.log('Supported audio formats:', formats);
    return formats;
  }

  updateFullscreenButton() {
    const button = this.elements.fullscreenBtn;
    const icon = button.querySelector('.icon');
    
    if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
      icon.textContent = '⛶'; // Exit fullscreen icon
      button.title = 'Exit Fullscreen';
      document.body.classList.add('fullscreen-mode');
    } else {
      icon.textContent = '⛶'; // Enter fullscreen icon  
      button.title = 'Enter Fullscreen';
      document.body.classList.remove('fullscreen-mode');
    }
  }

  async waitForVoices(maxWait = 3000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkVoices = () => {
        if (this.localTTS.availableVoices.size > 0 || Date.now() - startTime > maxWait) {
          resolve();
        } else {
          setTimeout(checkVoices, 100);
        }
      };
      
      checkVoices();
    });
  }

  handleSessionJoined(data) {
    this.showLoading(false);
    this.showStatus('Connected successfully!', 'success');
    this.currentSession = data.sessionId || this.elements.sessionIdInput.value.trim();
    this.elements.currentSessionId.textContent = this.currentSession;
    
    // Save session for reconnection
    this.settings.lastSessionId = this.currentSession;
    this.saveSettings();
    
    this.showScreen('translation');
    this.elements.leaveBtn.style.display = 'flex';
    this.updateConnectionStatus(true);

    // Handle session metadata - check if data IS the metadata or has metadata field
    if (data.type === 'session-metadata' || data.config || data.availableLanguages) {
      // Data is the metadata itself
      this.handleSessionMetadata(data);
    } else if (data.metadata) {
      // Data has metadata field (legacy format)
      this.handleSessionMetadata(data.metadata);
    } else {
      // Show language selection prompt if no metadata yet
      this.showLanguageSelectionPrompt();
    }
  }

  handleSessionMetadata(metadata) {
    console.log('Processing session metadata:', metadata);
    
    // Update available languages
    this.updateAvailableLanguages(metadata.availableLanguages || metadata.config?.enabledLanguages || []);
    
    // Update TTS availability info
    const ttsMode = metadata.config?.ttsMode || 'disabled';
    const audioQuality = metadata.audioQuality || metadata.config?.audioQuality || 'medium';
    
    // Show TTS capability info
    this.updateTTSCapabilityDisplay(ttsMode, audioQuality);
    
    console.log(`TTS Mode: ${ttsMode}, Audio Quality: ${audioQuality}`);
  }

  updateTTSCapabilityDisplay(ttsMode, audioQuality) {
    // Remove existing TTS info
    const existingInfo = document.querySelector('.tts-capability-info');
    if (existingInfo) {
      existingInfo.remove();
    }
    
    // Create TTS capability info
    const info = document.createElement('div');
    info.className = 'tts-capability-info';
    
    let cloudStatus, localStatus;
    
    // Cloud TTS status
    if (ttsMode === 'neural') {
      cloudStatus = '☁️ High Quality Audio Available';
    } else if (ttsMode === 'standard') {
      cloudStatus = '☁️ Standard Audio Available';
    } else if (ttsMode === 'disabled') {
      cloudStatus = '☁️ Cloud Audio Disabled';
    } else {
      cloudStatus = '☁️ Local Audio Only';
    }
    
    // Local TTS status
    const selectedLanguage = this.elements.languageSelect.value;
    if (selectedLanguage && this.localTTS.isLanguageSupported(selectedLanguage)) {
      const voiceInfo = this.localTTS.getVoiceInfo(selectedLanguage);
      localStatus = `📱 Local Audio: ${voiceInfo.quality} quality`;
    } else if (selectedLanguage) {
      localStatus = '📱 Local Audio: Not available';
    } else {
      localStatus = '📱 Local Audio: Select language to check';
    }
    
    info.innerHTML = `
      <div class="tts-info-content">
        <div class="tts-cloud-status">${cloudStatus}</div>
        <div class="tts-local-status">${localStatus}</div>
      </div>
    `;
    
    // Insert after audio controls
    const audioControls = document.querySelector('.audio-controls');
    audioControls.insertAdjacentElement('afterend', info);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
      if (info.parentElement) {
        info.remove();
      }
    }, 8000);
  }

  handleConfigUpdate(data) {
    console.log('Processing config update:', data);
    
    if (data.config) {
      // Update available languages
      this.updateAvailableLanguages(data.config.enabledLanguages || []);
      
      // Check if current language is still available
      const currentLang = this.elements.languageSelect.value;
      if (currentLang && !data.config.enabledLanguages.includes(currentLang)) {
        this.showStatus('Your selected language is no longer available. Please select a new language.', 'warning');
        this.elements.languageSelect.value = '';
      }
    }
  }

  handleLanguageRemoved(data) {
    const removedLanguage = data.language;
    const currentLanguage = this.elements.languageSelect.value;
    
    if (currentLanguage === removedLanguage) {
      this.showLanguageRemovedNotification(removedLanguage);
      this.elements.languageSelect.value = '';
      
      // Clear translation display and show selection prompt
      this.clearTranslationDisplay();
      this.showLanguageSelectionPrompt();
    }
    
    // Remove from dropdown
    const option = this.elements.languageSelect.querySelector(`option[value="${removedLanguage}"]`);
    if (option) {
      option.remove();
    }
  }

  showLanguageRemovedNotification(language) {
    const notification = document.createElement('div');
    notification.className = 'language-notification warning';
    notification.innerHTML = `
      <div class="notification-content">
        <span class="icon">⚠️</span>
        <span class="message">${this.getLanguageName(language)} is no longer available. Please select a new language.</span>
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    // Insert after session info
    const sessionInfo = document.querySelector('.session-info');
    sessionInfo.insertAdjacentElement('afterend', notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }

  showLanguageSelectionPrompt() {
    const display = this.elements.translationDisplay;
    display.innerHTML = `
      <div class="language-prompt">
        <div class="prompt-icon">🌐</div>
        <h3>Select Your Language</h3>
        <p>Please choose your preferred language from the dropdown above to start receiving translations.</p>
      </div>
    `;
  }

  clearTranslationDisplay() {
    this.elements.translationDisplay.innerHTML = '';
  }

  updateAvailableLanguages(languages) {
    const select = this.elements.languageSelect;
    const currentValue = select.value;
    
    // Clear existing options except the first one
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }
    
    // Add new language options
    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = this.getLanguageName(lang);
      select.appendChild(option);
    });
    
    // Handle language selection logic
    let selectedLanguage = null;
    
    // Priority 1: Keep current selection if still available
    if (currentValue && languages.includes(currentValue)) {
      selectedLanguage = currentValue;
    }
    // Priority 2: Use saved preference if available
    else if (this.settings.preferredLanguage && languages.includes(this.settings.preferredLanguage)) {
      selectedLanguage = this.settings.preferredLanguage;
    }
    // Priority 3: Auto-select if only one language available
    else if (languages.length === 1) {
      selectedLanguage = languages[0];
    }
    
    if (selectedLanguage) {
      select.value = selectedLanguage;
      this.changeLanguage(selectedLanguage);
      this.showLanguageSelectedFeedback(selectedLanguage);
    } else {
      select.value = '';
      this.showLanguageSelectionPrompt();
    }
    
    // Show available languages notification
    this.showAvailableLanguagesNotification(languages);
  }

  showLanguageSelectedFeedback(language) {
    const display = this.elements.translationDisplay;
    display.innerHTML = `
      <div class="language-selected">
        <div class="selected-icon">✅</div>
        <h3>Language Selected: ${this.getLanguageName(language)}</h3>
        <p>You will now receive translations in ${this.getLanguageName(language)}. Waiting for translations to begin...</p>
      </div>
    `;
  }

  showAvailableLanguagesNotification(languages) {
    // Remove any existing language notifications
    const existingNotifications = document.querySelectorAll('.language-notification');
    existingNotifications.forEach(n => n.remove());
    
    if (languages.length === 0) {
      const notification = document.createElement('div');
      notification.className = 'language-notification error';
      notification.innerHTML = `
        <div class="notification-content">
          <span class="icon">❌</span>
          <span class="message">No languages are currently available. Please wait for the admin to configure languages.</span>
        </div>
      `;
      
      const sessionInfo = document.querySelector('.session-info');
      sessionInfo.insertAdjacentElement('afterend', notification);
    } else if (languages.length > 1) {
      const languageList = languages.map(lang => this.getLanguageName(lang)).join(', ');
      const notification = document.createElement('div');
      notification.className = 'language-notification info';
      notification.innerHTML = `
        <div class="notification-content">
          <span class="icon">ℹ️</span>
          <span class="message">Available languages: ${languageList}</span>
          <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
      `;
      
      const sessionInfo = document.querySelector('.session-info');
      sessionInfo.insertAdjacentElement('afterend', notification);
      
      // Auto-remove after 8 seconds
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 8000);
    }
  }

  getLanguageName(code) {
    const names = {
      'en': 'English',
      'es': 'Español',
      'fr': 'Français', 
      'de': 'Deutsch',
      'it': 'Italiano'
    };
    return names[code] || code.toUpperCase();
  }

  async reconnectToSession() {
    if (!this.currentSession) return;
    
    console.log('Reconnecting to session...');
    this.showStatus('Reconnecting...', 'info');
    
    try {
      if (!this.socket || !this.socket.connected) {
        await this.connectToWebSocket();
      }
      
      // Restore session state
      await this.sendJoinSessionMessage(this.currentSession);
      
      // Restore language preference if it was set
      if (this.settings.preferredLanguage) {
        this.changeLanguage(this.settings.preferredLanguage);
      }
      
      console.log('Session reconnected successfully');
      this.showStatus('Reconnected successfully', 'success');
      
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.showStatus('Reconnection failed. Please try joining again.', 'error');
      
      // Enter offline mode if reconnection fails
      this.enterOfflineMode();
    }
  }

  /**
   * Enhanced connection recovery with exponential backoff
   */
  async attemptReconnectionWithBackoff(maxAttempts = 5) {
    let attempts = 0;
    let delay = 1000; // Start with 1 second
    
    while (attempts < maxAttempts && this.currentSession && this.settings.autoReconnect) {
      attempts++;
      
      console.log(`Reconnection attempt ${attempts}/${maxAttempts} in ${delay}ms`);
      this.showStatus(`Reconnecting... (${attempts}/${maxAttempts})`, 'info');
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        await this.reconnectToSession();
        return true; // Success
      } catch (error) {
        console.error(`Reconnection attempt ${attempts} failed:`, error);
        
        if (attempts < maxAttempts) {
          delay = Math.min(delay * 2, 30000); // Exponential backoff, max 30 seconds
        }
      }
    }
    
    // All attempts failed
    console.log('All reconnection attempts failed');
    this.showStatus('Connection lost. Operating in offline mode.', 'error');
    this.enterOfflineMode();
    return false;
  }

  /**
   * Enter offline mode with cached audio support
   */
  enterOfflineMode() {
    console.log('Entering offline mode');
    
    // Update UI to show offline status
    this.updateConnectionStatus(false);
    this.showOfflineModeNotification();
    
    // Enable local TTS as primary method
    this.offlineMode = true;
    
    // Show cached translations if available
    this.showCachedTranslations();
    
    // Set up periodic reconnection attempts
    this.startPeriodicReconnectionAttempts();
  }

  /**
   * Exit offline mode when connection is restored
   */
  exitOfflineMode() {
    console.log('Exiting offline mode');
    
    this.offlineMode = false;
    this.updateConnectionStatus(true);
    this.hideOfflineModeNotification();
    
    // Stop periodic reconnection attempts
    if (this.reconnectionTimer) {
      clearInterval(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
  }

  /**
   * Show offline mode notification
   */
  showOfflineModeNotification() {
    // Remove existing notification
    const existing = document.querySelector('.offline-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'offline-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <span class="icon">📡</span>
        <div class="text">
          <strong>Offline Mode</strong>
          <p>Connection lost. Using local text-to-speech and cached content.</p>
        </div>
        <button class="retry-btn" onclick="app.attemptReconnectionWithBackoff()">
          Retry Connection
        </button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
      }
    }, 10000);
  }

  /**
   * Hide offline mode notification
   */
  hideOfflineModeNotification() {
    const notification = document.querySelector('.offline-notification');
    if (notification) {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }
  }

  /**
   * Start periodic reconnection attempts in offline mode
   */
  startPeriodicReconnectionAttempts() {
    if (this.reconnectionTimer) {
      clearInterval(this.reconnectionTimer);
    }
    
    // Try to reconnect every 30 seconds in offline mode
    this.reconnectionTimer = setInterval(async () => {
      if (this.offlineMode && this.currentSession && navigator.onLine) {
        console.log('Attempting periodic reconnection...');
        
        try {
          await this.reconnectToSession();
          this.exitOfflineMode();
        } catch (error) {
          console.log('Periodic reconnection failed, staying in offline mode');
        }
      }
    }, 30000);
  }

  /**
   * Show cached translations from localStorage
   */
  showCachedTranslations() {
    const cachedTranslations = this.getCachedTranslations();
    
    if (cachedTranslations.length > 0) {
      const cacheNotification = document.createElement('div');
      cacheNotification.className = 'cache-notification';
      cacheNotification.innerHTML = `
        <div class="notification-content">
          <span class="icon">💾</span>
          <div class="text">
            <strong>Cached Content Available</strong>
            <p>Showing ${cachedTranslations.length} recent translations</p>
          </div>
        </div>
      `;
      
      document.body.appendChild(cacheNotification);
      
      // Show cached translations in the display
      const display = this.elements.translationDisplay;
      display.innerHTML = '<div class="cached-header">Recent Translations (Cached)</div>';
      
      cachedTranslations.forEach(translation => {
        this.displayCachedTranslation(translation);
      });
      
      // Auto-hide notification after 5 seconds
      setTimeout(() => {
        cacheNotification.classList.add('fade-out');
        setTimeout(() => cacheNotification.remove(), 300);
      }, 5000);
    }
  }

  /**
   * Get cached translations from localStorage
   */
  getCachedTranslations() {
    try {
      const cached = localStorage.getItem('cachedTranslations');
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      console.error('Failed to load cached translations:', error);
      return [];
    }
  }

  /**
   * Cache translation for offline use
   */
  cacheTranslation(translation) {
    try {
      const cached = this.getCachedTranslations();
      
      // Add new translation
      cached.unshift({
        ...translation,
        cachedAt: Date.now()
      });
      
      // Keep only last 20 translations
      const trimmed = cached.slice(0, 20);
      
      localStorage.setItem('cachedTranslations', JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to cache translation:', error);
    }
  }

  /**
   * Display cached translation
   */
  displayCachedTranslation(translation) {
    const display = this.elements.translationDisplay;
    
    const translationElement = document.createElement('div');
    translationElement.className = 'translation-item cached';
    
    const timestamp = new Date(translation.timestamp || translation.cachedAt);
    
    translationElement.innerHTML = `
      <div class="translation-header">
        <span class="timestamp">${this.formatTime(timestamp)}</span>
        <span class="cached-indicator">📱 Cached</span>
      </div>
      <div class="translation-text">${this.escapeHtml(translation.text)}</div>
      ${translation.useLocalTTS ? 
        '<button class="replay-tts-btn" onclick="app.replayLocalTTS(\'' + 
        translation.text.replace(/'/g, "\\'") + '\', \'' + 
        (translation.language || this.settings.preferredLanguage) + '\')">🔊 Replay</button>' : 
        ''
      }
    `;
    
    display.appendChild(translationElement);
  }

  /**
   * Replay local TTS for cached translation
   */
  async replayLocalTTS(text, language) {
    if (!text || this.settings.muted) return;
    
    try {
      await this.speakWithLocalTTS(text, language);
    } catch (error) {
      console.error('Failed to replay TTS:', error);
      this.showStatus('TTS replay failed', 'error');
    }
  }

  /**
   * Enhanced connection health monitoring
   */
  startConnectionHealthMonitoring() {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      console.log('Network connection restored');
      if (this.offlineMode && this.currentSession) {
        this.attemptReconnectionWithBackoff();
      }
    });
    
    window.addEventListener('offline', () => {
      console.log('Network connection lost');
      if (this.isConnected) {
        this.enterOfflineMode();
      }
    });
    
    // Monitor page visibility for reconnection
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.currentSession && !this.isConnected && navigator.onLine) {
        console.log('Page became visible, attempting reconnection');
        this.attemptReconnectionWithBackoff();
      }
    });
  }

  // Translation Display and Management
  async displayTranslation(translation) {
    console.log('Displaying translation:', translation);
    
    // Cache translation for offline use
    this.cacheTranslation(translation);
    
    // Only display if it matches the selected language
    const selectedLanguage = this.elements.languageSelect.value;
    if (!selectedLanguage || translation.language !== selectedLanguage) {
      return;
    }

    // Create translation item element
    const translationItem = this.createTranslationElement(translation);
    
    // Add to display
    this.addTranslationToDisplay(translationItem);
    
    // Handle audio with fallback chain
    if (!this.settings.muted) {
      await this.handleTranslationAudio(translation, translationItem);
    }
  }

  async handleTranslationAudio(translation, translationElement) {
    try {
      // Primary: Cloud audio (Polly)
      if (translation.audioUrl) {
        console.log('Using cloud audio');
        this.updateAudioStatus(translationElement, 'cloud', 'loading');
        
        try {
          await this.playAudio(translation.audioUrl);
          this.updateAudioStatus(translationElement, 'cloud', 'completed');
          return;
        } catch (cloudError) {
          console.warn('Cloud audio failed, trying fallback:', cloudError);
          // Continue to fallback
        }
      }
      
      // Secondary: Local TTS
      if (this.localTTS.isLanguageSupported(translation.language)) {
        console.log('Using local TTS');
        this.updateAudioStatus(translationElement, 'local', 'loading');
        
        try {
          await this.speakWithLocalTTS(translation.text, translation.language);
          this.updateAudioStatus(translationElement, 'local', 'completed');
          return;
        } catch (localError) {
          console.warn('Local TTS failed:', localError);
          // Continue to text-only
        }
      }
      
      // Tertiary: Text-only
      console.log('Text-only mode');
      this.updateAudioStatus(translationElement, 'text', 'completed');
      
    } catch (error) {
      console.error('Audio handling failed:', error);
      this.updateAudioStatus(translationElement, 'text', 'error');
    }
  }

  updateAudioStatus(translationElement, audioType, status) {
    const audioElement = translationElement.querySelector('.audio-status');
    if (!audioElement) return;
    
    let icon, text;
    
    switch (audioType) {
      case 'cloud':
        if (status === 'loading') {
          icon = '⏳';
          text = 'Loading Audio';
        } else if (status === 'playing') {
          icon = '🔊';
          text = 'Playing Cloud Audio';
        } else if (status === 'completed') {
          icon = '☁️';
          text = 'Cloud Audio';
        } else {
          icon = '❌';
          text = 'Cloud Audio Failed';
        }
        break;
      case 'local':
        if (status === 'loading') {
          icon = '⏳';
          text = 'Preparing Audio';
        } else if (status === 'playing') {
          icon = '🔊';
          text = 'Playing Local Audio';
        } else if (status === 'completed') {
          icon = '📱';
          text = 'Local Audio';
        } else {
          icon = '❌';
          text = 'Local Audio Failed';
        }
        break;
      case 'text':
        icon = status === 'error' ? '❌' : '📝';
        text = status === 'error' ? 'Audio Failed' : 'Text Only';
        break;
    }
    
    audioElement.innerHTML = `<span class="icon">${icon}</span> ${text}`;
    
    // Add status class for styling
    audioElement.className = `audio-status ${audioType} ${status}`;
  }

  createTranslationElement(translation) {
    const item = document.createElement('div');
    item.className = 'translation-item';
    item.setAttribute('data-timestamp', translation.timestamp);
    
    // Translation text
    const textElement = document.createElement('div');
    textElement.className = 'translation-text';
    textElement.textContent = translation.text;
    item.appendChild(textElement);
    
    // Metadata
    const metaElement = document.createElement('div');
    metaElement.className = 'translation-meta';
    
    // Timestamp
    const timeElement = document.createElement('span');
    timeElement.className = 'translation-time';
    timeElement.textContent = this.formatTime(new Date(translation.timestamp));
    metaElement.appendChild(timeElement);
    
    // Audio status
    const audioElement = document.createElement('span');
    audioElement.className = 'audio-status';
    
    if (translation.audioUrl) {
      audioElement.innerHTML = '<span class="icon">🔊</span> Cloud Audio';
    } else if (translation.useLocalTTS) {
      audioElement.innerHTML = '<span class="icon">📱</span> Local Audio';
    } else {
      audioElement.innerHTML = '<span class="icon">📝</span> Text Only';
    }
    
    metaElement.appendChild(audioElement);
    item.appendChild(metaElement);
    
    return item;
  }

  addTranslationToDisplay(translationItem) {
    const display = this.elements.translationDisplay;
    
    // Remove welcome message if present
    const welcomeMessage = display.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    // Add new translation at the top
    display.insertBefore(translationItem, display.firstChild);
    
    // Limit number of displayed translations (keep last 20)
    const items = display.querySelectorAll('.translation-item');
    if (items.length > 20) {
      for (let i = 20; i < items.length; i++) {
        items[i].remove();
      }
    }
    
    // Scroll to top to show new translation
    display.scrollTop = 0;
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  }

  async speakWithLocalTTS(text, language) {
    if (!text || this.settings.muted) {
      return;
    }

    try {
      console.log(`Speaking with local TTS: "${text}" in ${language}`);
      
      const options = {
        volume: this.settings.volume,
        rate: 1.0,
        pitch: 1.0
      };
      
      await this.localTTS.speak(text, language, options);
    } catch (error) {
      console.error('Local TTS failed:', error);
      // Fallback to text-only (already displayed)
    }
  }

  async handleTTSFallback(text, language) {
    // TTS Fallback Chain: Cloud Audio → Local TTS → Text-only
    
    try {
      // Primary: Cloud audio (handled in displayTranslation)
      // This method is called when cloud audio is not available
      
      // Secondary: Local TTS
      if (this.localTTS.isLanguageSupported(language)) {
        console.log('Using local TTS fallback');
        await this.speakWithLocalTTS(text, language);
        return 'local-tts';
      }
      
      // Tertiary: Text-only (already displayed)
      console.log('Using text-only fallback');
      return 'text-only';
      
    } catch (error) {
      console.error('TTS fallback failed:', error);
      return 'text-only';
    }
  }

  getTTSCapabilityInfo() {
    const info = {
      localTTSSupported: this.localTTS.isSupported,
      supportedLanguages: this.localTTS.getSupportedLanguages(),
      voiceInfo: {}
    };
    
    // Get voice info for each supported language
    info.supportedLanguages.forEach(lang => {
      info.voiceInfo[lang] = this.localTTS.getVoiceInfo(lang);
    });
    
    return info;
  }

  async playAudio(audioUrl) {
    if (!audioUrl || this.settings.muted) {
      return;
    }

    try {
      console.log('Playing cloud audio:', audioUrl);
      
      const options = {
        volume: this.settings.volume / 100
      };
      
      // Use queue for sequential playback
      await this.audioPlayer.queueAudio(audioUrl, options);
    } catch (error) {
      console.error('Cloud audio playback failed:', error);
      throw error; // Re-throw for fallback handling
    }
  }
}

// Initialize the application
const app = new ServiceTranslateClient();
