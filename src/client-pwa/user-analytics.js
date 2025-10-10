// User Analytics for PWA Client
class UserAnalytics {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.events = [];
    this.userBehavior = {
      interactions: 0,
      languageChanges: 0,
      settingsChanges: 0,
      audioInteractions: 0,
      translationsReceived: 0,
      sessionDuration: 0,
      deviceInfo: this.getDeviceInfo(),
      connectionQuality: 'unknown'
    };
    
    this.isTrackingEnabled = this.getTrackingPreference();
    this.batchSize = 10;
    this.flushInterval = 30000; // 30 seconds
    
    if (this.isTrackingEnabled) {
      this.startTracking();
    }
  }

  /**
   * Track user interaction event
   */
  trackEvent(eventType, data = {}) {
    if (!this.isTrackingEnabled) return;

    const event = {
      id: this.generateEventId(),
      sessionId: this.sessionId,
      type: eventType,
      timestamp: Date.now(),
      data: this.sanitizeData(data),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    this.events.push(event);
    this.updateUserBehavior(eventType, data);

    // Auto-flush if batch is full
    if (this.events.length >= this.batchSize) {
      this.flushEvents();
    }

    console.log('Analytics event tracked:', eventType, data);
  }

  /**
   * Track session start
   */
  trackSessionStart(sessionData) {
    this.trackEvent('session_start', {
      sessionId: sessionData.sessionId,
      language: sessionData.language,
      deviceType: this.userBehavior.deviceInfo.type,
      connectionType: this.getConnectionType(),
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  /**
   * Track session end
   */
  trackSessionEnd() {
    const sessionDuration = Date.now() - this.startTime;
    
    this.trackEvent('session_end', {
      duration: sessionDuration,
      interactions: this.userBehavior.interactions,
      languageChanges: this.userBehavior.languageChanges,
      translationsReceived: this.userBehavior.translationsReceived,
      settingsChanges: this.userBehavior.settingsChanges,
      audioInteractions: this.userBehavior.audioInteractions
    });

    // Flush remaining events
    this.flushEvents();
  }

  /**
   * Track language change
   */
  trackLanguageChange(fromLanguage, toLanguage) {
    this.trackEvent('language_change', {
      from: fromLanguage,
      to: toLanguage,
      timestamp: Date.now()
    });
  }

  /**
   * Track translation received
   */
  trackTranslationReceived(translation) {
    this.trackEvent('translation_received', {
      language: translation.language,
      textLength: translation.text.length,
      hasAudio: !!translation.audioUrl,
      timestamp: translation.timestamp
    });
  }

  /**
   * Track audio interaction
   */
  trackAudioInteraction(action, data = {}) {
    this.trackEvent('audio_interaction', {
      action, // play, pause, mute, volume_change
      ...data
    });
  }

  /**
   * Track settings change
   */
  trackSettingsChange(setting, oldValue, newValue) {
    this.trackEvent('settings_change', {
      setting,
      oldValue,
      newValue,
      timestamp: Date.now()
    });
  }

  /**
   * Track error occurrence
   */
  trackError(error, context = {}) {
    this.trackEvent('error', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });
  }

  /**
   * Track performance metrics
   */
  trackPerformance(metrics) {
    this.trackEvent('performance', {
      loadTime: metrics.loadTime,
      renderTime: metrics.renderTime,
      memoryUsage: metrics.memoryUsage,
      connectionLatency: metrics.connectionLatency,
      timestamp: Date.now()
    });
  }

  /**
   * Track user engagement
   */
  trackEngagement(action, data = {}) {
    this.trackEvent('engagement', {
      action, // scroll, click, focus, blur, visibility_change
      ...data,
      timestamp: Date.now()
    });
  }

  /**
   * Track accessibility usage
   */
  trackAccessibility(feature, data = {}) {
    this.trackEvent('accessibility', {
      feature, // screen_reader, high_contrast, large_font, keyboard_navigation
      ...data,
      timestamp: Date.now()
    });
  }

  /**
   * Track connection quality
   */
  trackConnectionQuality(quality, metrics = {}) {
    this.userBehavior.connectionQuality = quality;
    
    this.trackEvent('connection_quality', {
      quality, // excellent, good, fair, poor
      latency: metrics.latency,
      bandwidth: metrics.bandwidth,
      timestamp: Date.now()
    });
  }

  /**
   * Get user behavior summary
   */
  getUserBehaviorSummary() {
    const sessionDuration = Date.now() - this.startTime;
    
    return {
      ...this.userBehavior,
      sessionDuration,
      eventsCount: this.events.length,
      averageInteractionRate: this.userBehavior.interactions / (sessionDuration / 60000), // per minute
      engagementScore: this.calculateEngagementScore()
    };
  }

  /**
   * Get analytics data for export
   */
  getAnalyticsData() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      events: this.events,
      userBehavior: this.getUserBehaviorSummary(),
      deviceInfo: this.userBehavior.deviceInfo,
      timestamp: Date.now()
    };
  }

  /**
   * Enable or disable tracking
   */
  setTrackingEnabled(enabled) {
    this.isTrackingEnabled = enabled;
    localStorage.setItem('analytics_enabled', enabled.toString());
    
    if (enabled && !this.flushTimer) {
      this.startTracking();
    } else if (!enabled && this.flushTimer) {
      this.stopTracking();
    }

    this.trackEvent('tracking_preference_change', { enabled });
  }

  /**
   * Flush events to server
   */
  async flushEvents() {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      // Send to analytics endpoint (would be implemented)
      await this.sendAnalyticsData(eventsToSend);
      console.log(`Sent ${eventsToSend.length} analytics events`);
    } catch (error) {
      console.error('Failed to send analytics data:', error);
      
      // Re-queue events on failure (with limit to prevent memory issues)
      if (this.events.length < 100) {
        this.events.unshift(...eventsToSend);
      }
    }
  }

  /**
   * Clear all analytics data
   */
  clearData() {
    this.events = [];
    this.userBehavior = {
      interactions: 0,
      languageChanges: 0,
      settingsChanges: 0,
      audioInteractions: 0,
      translationsReceived: 0,
      sessionDuration: 0,
      deviceInfo: this.getDeviceInfo(),
      connectionQuality: 'unknown'
    };
    
    this.trackEvent('data_cleared');
  }

  // Private methods

  /**
   * Start tracking
   */
  startTracking() {
    // Set up periodic flushing
    this.flushTimer = setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.trackEngagement('visibility_change', {
        hidden: document.hidden
      });
    });

    // Track user interactions
    this.setupInteractionTracking();

    // Track performance metrics
    this.trackInitialPerformance();
  }

  /**
   * Stop tracking
   */
  stopTracking() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining events
    this.flushEvents();
  }

  /**
   * Setup interaction tracking
   */
  setupInteractionTracking() {
    // Track clicks
    document.addEventListener('click', (event) => {
      this.userBehavior.interactions++;
      
      this.trackEngagement('click', {
        element: event.target.tagName,
        id: event.target.id,
        className: event.target.className
      });
    });

    // Track keyboard usage
    document.addEventListener('keydown', (event) => {
      this.userBehavior.interactions++;
      
      // Track accessibility keyboard navigation
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === 'Space') {
        this.trackAccessibility('keyboard_navigation', {
          key: event.key,
          element: event.target.tagName
        });
      }
    });

    // Track touch interactions
    document.addEventListener('touchstart', () => {
      this.userBehavior.interactions++;
      this.trackEngagement('touch');
    });

    // Track scroll behavior
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.trackEngagement('scroll', {
          scrollY: window.scrollY,
          scrollHeight: document.documentElement.scrollHeight
        });
      }, 250);
    });
  }

  /**
   * Track initial performance metrics
   */
  trackInitialPerformance() {
    if ('performance' in window) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          
          this.trackPerformance({
            loadTime: navigation.loadEventEnd - navigation.loadEventStart,
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            firstPaint: this.getFirstPaint(),
            memoryUsage: this.getMemoryUsage()
          });
        }, 1000);
      });
    }
  }

  /**
   * Update user behavior metrics
   */
  updateUserBehavior(eventType, data) {
    switch (eventType) {
      case 'language_change':
        this.userBehavior.languageChanges++;
        break;
      case 'translation_received':
        this.userBehavior.translationsReceived++;
        break;
      case 'settings_change':
        this.userBehavior.settingsChanges++;
        break;
      case 'audio_interaction':
        this.userBehavior.audioInteractions++;
        break;
    }
  }

  /**
   * Calculate engagement score
   */
  calculateEngagementScore() {
    const sessionDuration = Date.now() - this.startTime;
    const minutes = sessionDuration / 60000;
    
    if (minutes < 1) return 0;
    
    // Score based on interactions per minute, translations received, and session duration
    const interactionScore = Math.min(this.userBehavior.interactions / minutes, 10) * 10;
    const translationScore = Math.min(this.userBehavior.translationsReceived / minutes, 5) * 20;
    const durationScore = Math.min(minutes / 10, 1) * 20;
    
    return Math.round(interactionScore + translationScore + durationScore);
  }

  /**
   * Get device information
   */
  getDeviceInfo() {
    const userAgent = navigator.userAgent;
    
    return {
      type: this.getDeviceType(),
      os: this.getOperatingSystem(),
      browser: this.getBrowser(),
      screenSize: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1,
      touchSupport: 'ontouchstart' in window,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onlineStatus: navigator.onLine
    };
  }

  /**
   * Get device type
   */
  getDeviceType() {
    const userAgent = navigator.userAgent;
    
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
      return 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
      return 'mobile';
    } else {
      return 'desktop';
    }
  }

  /**
   * Get operating system
   */
  getOperatingSystem() {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    
    return 'Unknown';
  }

  /**
   * Get browser information
   */
  getBrowser() {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    
    return 'Unknown';
  }

  /**
   * Get connection type
   */
  getConnectionType() {
    if ('connection' in navigator) {
      return navigator.connection.effectiveType || 'unknown';
    }
    return 'unknown';
  }

  /**
   * Get first paint timing
   */
  getFirstPaint() {
    if ('performance' in window) {
      const paintEntries = performance.getEntriesByType('paint');
      const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
      return firstPaint ? firstPaint.startTime : 0;
    }
    return 0;
  }

  /**
   * Get memory usage
   */
  getMemoryUsage() {
    if ('memory' in performance) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * Get tracking preference
   */
  getTrackingPreference() {
    const stored = localStorage.getItem('analytics_enabled');
    return stored !== null ? stored === 'true' : true; // Default to enabled
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generate event ID
   */
  generateEventId() {
    return 'event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Sanitize data to remove sensitive information
   */
  sanitizeData(data) {
    // Remove or mask sensitive data
    const sanitized = { ...data };
    
    // Remove potential PII
    if (sanitized.sessionId && typeof sanitized.sessionId === 'string') {
      sanitized.sessionId = sanitized.sessionId.substring(0, 10) + '...';
    }
    
    return sanitized;
  }

  /**
   * Send analytics data to server
   */
  async sendAnalyticsData(events) {
    // This would send data to the analytics endpoint
    // For now, just log to console
    console.log('Analytics data to send:', {
      sessionId: this.sessionId,
      events,
      userBehavior: this.getUserBehaviorSummary()
    });
    
    // In a real implementation, this would be:
    // return fetch('/api/analytics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ sessionId: this.sessionId, events })
    // });
  }
}

// Export for use in main app
window.UserAnalytics = UserAnalytics;