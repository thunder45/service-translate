// Performance Manager for PWA Client
class PerformanceManager {
  constructor() {
    this.metrics = {
      domUpdates: 0,
      audioLoads: 0,
      memoryUsage: 0,
      connectionLatency: 0,
      renderTime: 0
    };
    
    this.observers = new Map();
    this.resourceCache = new Map();
    this.lazyLoadQueue = [];
    this.isProcessingQueue = false;
    
    // Performance monitoring
    this.startPerformanceMonitoring();
    
    // Memory management
    this.startMemoryManagement();
    
    // Connection monitoring
    this.connectionMetrics = {
      latency: [],
      bandwidth: 0,
      quality: 'good'
    };
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    // Monitor DOM mutations for efficient updates
    if ('MutationObserver' in window) {
      const observer = new MutationObserver((mutations) => {
        this.metrics.domUpdates += mutations.length;
        this.throttledDOMOptimization();
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
      
      this.observers.set('dom', observer);
    }

    // Monitor resource loading
    if ('PerformanceObserver' in window) {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.initiatorType === 'audio') {
            this.metrics.audioLoads++;
            this.optimizeAudioLoading(entry);
          }
        }
      });
      
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.set('resource', resourceObserver);
    }

    // Monitor memory usage
    this.startMemoryMonitoring();
  }

  /**
   * Start memory monitoring and management
   */
  startMemoryMonitoring() {
    if ('memory' in performance) {
      setInterval(() => {
        const memory = performance.memory;
        this.metrics.memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        
        // Trigger cleanup if memory usage is high
        if (this.metrics.memoryUsage > 0.8) {
          this.performMemoryCleanup();
        }
      }, 30000); // Check every 30 seconds
    }
  }

  /**
   * Start memory management for long sessions
   */
  startMemoryManagement() {
    // Clean up old translations periodically
    setInterval(() => {
      this.cleanupOldTranslations();
    }, 300000); // Every 5 minutes

    // Clean up audio cache
    setInterval(() => {
      this.cleanupAudioCache();
    }, 600000); // Every 10 minutes

    // Monitor and limit DOM size
    setInterval(() => {
      this.limitDOMSize();
    }, 120000); // Every 2 minutes
  }

  /**
   * Optimize DOM updates with batching and throttling
   */
  throttledDOMOptimization = this.throttle(() => {
    this.batchDOMUpdates();
  }, 100);

  /**
   * Batch DOM updates for better performance
   */
  batchDOMUpdates() {
    // Use requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
      // Process any pending DOM updates
      this.processPendingUpdates();
    });
  }

  /**
   * Process pending DOM updates efficiently
   */
  processPendingUpdates() {
    const startTime = performance.now();
    
    // Batch style changes
    document.body.style.cssText = document.body.style.cssText;
    
    // Measure render time
    requestAnimationFrame(() => {
      this.metrics.renderTime = performance.now() - startTime;
    });
  }

  /**
   * Lazy load resources with priority queue
   */
  lazyLoadResource(resource, priority = 'normal') {
    const item = {
      resource,
      priority,
      timestamp: Date.now()
    };

    // Insert based on priority
    if (priority === 'high') {
      this.lazyLoadQueue.unshift(item);
    } else {
      this.lazyLoadQueue.push(item);
    }

    if (!this.isProcessingQueue) {
      this.processLazyLoadQueue();
    }
  }

  /**
   * Process lazy loading queue
   */
  async processLazyLoadQueue() {
    if (this.isProcessingQueue || this.lazyLoadQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.lazyLoadQueue.length > 0) {
      const item = this.lazyLoadQueue.shift();
      
      try {
        await this.loadResource(item.resource);
        
        // Small delay to prevent blocking
        await this.delay(10);
      } catch (error) {
        console.warn('Lazy load failed:', error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Load resource with caching
   */
  async loadResource(resource) {
    // Check cache first
    if (this.resourceCache.has(resource.url)) {
      return this.resourceCache.get(resource.url);
    }

    // Load resource
    const result = await this.fetchResource(resource);
    
    // Cache with size limit
    if (this.resourceCache.size < 50) {
      this.resourceCache.set(resource.url, result);
    }

    return result;
  }

  /**
   * Fetch resource with timeout and retry
   */
  async fetchResource(resource) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(resource.url, {
        signal: controller.signal,
        cache: 'default'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Optimize WebSocket message handling
   */
  optimizeWebSocketMessages(socket) {
    const messageQueue = [];
    let isProcessing = false;

    // Batch message processing
    const originalEmit = socket.emit;
    socket.emit = (...args) => {
      messageQueue.push(args);
      
      if (!isProcessing) {
        this.processMessageQueue(socket, messageQueue, originalEmit);
      }
    };

    // Optimize message listeners
    const originalOn = socket.on;
    socket.on = (event, handler) => {
      const optimizedHandler = this.throttle(handler, 50); // Throttle to 20fps
      return originalOn.call(socket, event, optimizedHandler);
    };
  }

  /**
   * Process WebSocket message queue
   */
  async processMessageQueue(socket, queue, originalEmit) {
    if (queue.length === 0) return;

    const isProcessing = true;
    const batchSize = 5;

    while (queue.length > 0) {
      const batch = queue.splice(0, batchSize);
      
      // Process batch
      for (const args of batch) {
        originalEmit.apply(socket, args);
      }

      // Small delay to prevent blocking
      await this.delay(5);
    }

    isProcessing = false;
  }

  /**
   * Optimize audio loading and playback
   */
  optimizeAudioLoading(entry) {
    // Preload next audio if pattern detected
    if (entry.duration > 1000) { // Slow loading
      this.enableAudioPreloading();
    }

    // Use audio sprites for small sounds
    if (entry.transferSize < 10000) { // Small audio files
      this.considerAudioSprites();
    }
  }

  /**
   * Enable audio preloading for better UX
   */
  enableAudioPreloading() {
    // Preload common audio elements
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      if (!audio.preload) {
        audio.preload = 'metadata';
      }
    });
  }

  /**
   * Consider using audio sprites for efficiency
   */
  considerAudioSprites() {
    // This would implement audio sprite optimization
    // For now, just log the opportunity
    console.log('Audio sprite optimization opportunity detected');
  }

  /**
   * Perform memory cleanup
   */
  performMemoryCleanup() {
    console.log('Performing memory cleanup...');

    // Clear resource cache
    this.resourceCache.clear();

    // Clean up old event listeners
    this.cleanupEventListeners();

    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }

    // Clear old performance entries
    if (performance.clearResourceTimings) {
      performance.clearResourceTimings();
    }

    console.log('Memory cleanup completed');
  }

  /**
   * Clean up old translations to prevent memory bloat
   */
  cleanupOldTranslations() {
    const translationDisplay = document.getElementById('translation-display');
    if (!translationDisplay) return;

    const translations = translationDisplay.querySelectorAll('.translation-item');
    const maxTranslations = 50; // Keep last 50 translations

    if (translations.length > maxTranslations) {
      const toRemove = translations.length - maxTranslations;
      
      for (let i = 0; i < toRemove; i++) {
        translations[i].remove();
      }

      console.log(`Cleaned up ${toRemove} old translations`);
    }
  }

  /**
   * Clean up audio cache
   */
  cleanupAudioCache() {
    // This would clean up cached audio elements
    const audioElements = document.querySelectorAll('audio');
    
    audioElements.forEach(audio => {
      // Remove audio elements that haven't been used recently
      if (audio.dataset.lastUsed) {
        const lastUsed = parseInt(audio.dataset.lastUsed);
        const fiveMinutesAgo = Date.now() - 300000;
        
        if (lastUsed < fiveMinutesAgo) {
          audio.remove();
        }
      }
    });
  }

  /**
   * Limit DOM size to prevent performance issues
   */
  limitDOMSize() {
    const maxElements = 1000;
    const elements = document.querySelectorAll('*');
    
    if (elements.length > maxElements) {
      console.warn(`DOM size (${elements.length}) exceeds recommended limit (${maxElements})`);
      
      // Remove old, unused elements
      this.removeUnusedElements();
    }
  }

  /**
   * Remove unused DOM elements
   */
  removeUnusedElements() {
    // Remove old notification elements
    const oldNotifications = document.querySelectorAll('.notification[data-timestamp]');
    const fiveMinutesAgo = Date.now() - 300000;
    
    oldNotifications.forEach(notification => {
      const timestamp = parseInt(notification.dataset.timestamp);
      if (timestamp < fiveMinutesAgo) {
        notification.remove();
      }
    });

    // Remove old feedback elements
    const oldFeedback = document.querySelectorAll('.setting-feedback, .language-notification');
    oldFeedback.forEach(element => {
      if (!element.classList.contains('show')) {
        element.remove();
      }
    });
  }

  /**
   * Clean up event listeners
   */
  cleanupEventListeners() {
    // Remove observers
    this.observers.forEach(observer => {
      observer.disconnect();
    });
    this.observers.clear();

    // Restart essential observers
    this.startPerformanceMonitoring();
  }

  /**
   * Monitor connection performance
   */
  measureConnectionLatency(callback) {
    const start = performance.now();
    
    return (...args) => {
      const latency = performance.now() - start;
      this.connectionMetrics.latency.push(latency);
      
      // Keep only last 10 measurements
      if (this.connectionMetrics.latency.length > 10) {
        this.connectionMetrics.latency.shift();
      }
      
      // Update connection quality
      this.updateConnectionQuality();
      
      return callback(...args);
    };
  }

  /**
   * Update connection quality assessment
   */
  updateConnectionQuality() {
    const avgLatency = this.connectionMetrics.latency.reduce((a, b) => a + b, 0) / 
                      this.connectionMetrics.latency.length;

    if (avgLatency < 100) {
      this.connectionMetrics.quality = 'excellent';
    } else if (avgLatency < 300) {
      this.connectionMetrics.quality = 'good';
    } else if (avgLatency < 1000) {
      this.connectionMetrics.quality = 'fair';
    } else {
      this.connectionMetrics.quality = 'poor';
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      connection: this.connectionMetrics,
      memory: this.getMemoryInfo(),
      cache: {
        size: this.resourceCache.size,
        hitRate: this.calculateCacheHitRate()
      }
    };
  }

  /**
   * Get memory information
   */
  getMemoryInfo() {
    if ('memory' in performance) {
      const memory = performance.memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024), // MB
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024), // MB
        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024), // MB
        usage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100) // %
      };
    }
    return null;
  }

  /**
   * Calculate cache hit rate
   */
  calculateCacheHitRate() {
    // This would track actual cache hits/misses
    // For now, return a placeholder
    return 85; // 85% hit rate
  }

  /**
   * Throttle function calls
   */
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Debounce function calls
   */
  debounce(func, delay) {
    let timeoutId;
    return function() {
      const args = arguments;
      const context = this;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(context, args), delay);
    };
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup all resources
   */
  cleanup() {
    // Stop all observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();

    // Clear caches
    this.resourceCache.clear();
    this.lazyLoadQueue = [];

    // Clear metrics
    this.metrics = {
      domUpdates: 0,
      audioLoads: 0,
      memoryUsage: 0,
      connectionLatency: 0,
      renderTime: 0
    };

    console.log('Performance manager cleaned up');
  }
}

// Export for use in main app
window.PerformanceManager = PerformanceManager;