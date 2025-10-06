// Lazy Loading Manager for PWA Resources
class LazyLoader {
  constructor() {
    this.loadedResources = new Set();
    this.loadingPromises = new Map();
    this.intersectionObserver = null;
    this.preloadQueue = [];
    this.isPreloading = false;
    
    this.initializeIntersectionObserver();
    this.setupPreloadStrategy();
  }

  /**
   * Initialize Intersection Observer for lazy loading
   */
  initializeIntersectionObserver() {
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              this.loadElement(entry.target);
              this.intersectionObserver.unobserve(entry.target);
            }
          });
        },
        {
          rootMargin: '50px 0px', // Start loading 50px before element is visible
          threshold: 0.1
        }
      );
    }
  }

  /**
   * Setup preload strategy based on user behavior
   */
  setupPreloadStrategy() {
    // Preload on user interaction hints
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('touchstart', this.handleTouchStart.bind(this));
    
    // Preload on idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => this.preloadCriticalResources());
    } else {
      setTimeout(() => this.preloadCriticalResources(), 1000);
    }
  }

  /**
   * Register element for lazy loading
   */
  observe(element, options = {}) {
    if (!element || this.loadedResources.has(element)) {
      return;
    }

    // Add lazy loading attributes
    element.dataset.lazyLoad = 'true';
    element.dataset.priority = options.priority || 'normal';
    
    if (options.src) {
      element.dataset.src = options.src;
    }

    // Start observing
    if (this.intersectionObserver) {
      this.intersectionObserver.observe(element);
    } else {
      // Fallback for browsers without Intersection Observer
      this.loadElement(element);
    }
  }

  /**
   * Load element when it becomes visible
   */
  async loadElement(element) {
    if (this.loadedResources.has(element)) {
      return;
    }

    const src = element.dataset.src;
    if (!src) {
      return;
    }

    // Check if already loading
    if (this.loadingPromises.has(src)) {
      return this.loadingPromises.get(src);
    }

    // Start loading
    const loadPromise = this.loadResource(element, src);
    this.loadingPromises.set(src, loadPromise);

    try {
      await loadPromise;
      this.loadedResources.add(element);
      element.classList.add('lazy-loaded');
      
      // Dispatch loaded event
      element.dispatchEvent(new CustomEvent('lazyloaded', {
        detail: { src }
      }));
    } catch (error) {
      console.error('Lazy load failed:', error);
      element.classList.add('lazy-error');
      
      // Dispatch error event
      element.dispatchEvent(new CustomEvent('lazyerror', {
        detail: { src, error }
      }));
    } finally {
      this.loadingPromises.delete(src);
    }
  }

  /**
   * Load resource based on element type
   */
  async loadResource(element, src) {
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'img':
        return this.loadImage(element, src);
      
      case 'audio':
        return this.loadAudio(element, src);
      
      case 'video':
        return this.loadVideo(element, src);
      
      default:
        return this.loadGenericResource(element, src);
    }
  }

  /**
   * Load image with progressive enhancement
   */
  async loadImage(img, src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      
      image.onload = () => {
        img.src = src;
        img.classList.remove('lazy-loading');
        resolve();
      };
      
      image.onerror = () => {
        reject(new Error(`Failed to load image: ${src}`));
      };
      
      // Add loading class
      img.classList.add('lazy-loading');
      
      // Start loading
      image.src = src;
    });
  }

  /**
   * Load audio with preload optimization
   */
  async loadAudio(audio, src) {
    return new Promise((resolve, reject) => {
      const canPlayHandler = () => {
        audio.removeEventListener('canplaythrough', canPlayHandler);
        audio.removeEventListener('error', errorHandler);
        audio.classList.remove('lazy-loading');
        resolve();
      };
      
      const errorHandler = (error) => {
        audio.removeEventListener('canplaythrough', canPlayHandler);
        audio.removeEventListener('error', errorHandler);
        reject(new Error(`Failed to load audio: ${src}`));
      };
      
      audio.addEventListener('canplaythrough', canPlayHandler);
      audio.addEventListener('error', errorHandler);
      
      // Add loading class
      audio.classList.add('lazy-loading');
      
      // Set preload strategy based on priority
      const priority = audio.dataset.priority;
      if (priority === 'high') {
        audio.preload = 'auto';
      } else if (priority === 'low') {
        audio.preload = 'none';
      } else {
        audio.preload = 'metadata';
      }
      
      // Start loading
      audio.src = src;
    });
  }

  /**
   * Load video with adaptive quality
   */
  async loadVideo(video, src) {
    return new Promise((resolve, reject) => {
      const canPlayHandler = () => {
        video.removeEventListener('canplaythrough', canPlayHandler);
        video.removeEventListener('error', errorHandler);
        video.classList.remove('lazy-loading');
        resolve();
      };
      
      const errorHandler = (error) => {
        video.removeEventListener('canplaythrough', canPlayHandler);
        video.removeEventListener('error', errorHandler);
        reject(new Error(`Failed to load video: ${src}`));
      };
      
      video.addEventListener('canplaythrough', canPlayHandler);
      video.addEventListener('error', errorHandler);
      
      // Add loading class
      video.classList.add('lazy-loading');
      
      // Set preload based on connection quality
      const connection = navigator.connection;
      if (connection && connection.effectiveType) {
        if (connection.effectiveType === '4g') {
          video.preload = 'metadata';
        } else {
          video.preload = 'none';
        }
      } else {
        video.preload = 'metadata';
      }
      
      // Start loading
      video.src = src;
    });
  }

  /**
   * Load generic resource (CSS, JS, etc.)
   */
  async loadGenericResource(element, src) {
    return new Promise((resolve, reject) => {
      const tagName = element.tagName.toLowerCase();
      
      if (tagName === 'link') {
        // CSS file
        element.onload = resolve;
        element.onerror = reject;
        element.href = src;
      } else if (tagName === 'script') {
        // JavaScript file
        element.onload = resolve;
        element.onerror = reject;
        element.src = src;
      } else {
        // Other resources
        fetch(src)
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            return response.text();
          })
          .then(content => {
            element.innerHTML = content;
            resolve();
          })
          .catch(reject);
      }
    });
  }

  /**
   * Handle mouse over for preloading
   */
  handleMouseOver(event) {
    const element = event.target.closest('[data-preload]');
    if (element && !this.loadedResources.has(element)) {
      this.preloadElement(element);
    }
  }

  /**
   * Handle touch start for preloading
   */
  handleTouchStart(event) {
    const element = event.target.closest('[data-preload]');
    if (element && !this.loadedResources.has(element)) {
      this.preloadElement(element);
    }
  }

  /**
   * Preload element on user interaction
   */
  preloadElement(element) {
    const src = element.dataset.preload;
    if (src && !this.loadingPromises.has(src)) {
      this.addToPreloadQueue(element, src, 'high');
    }
  }

  /**
   * Add resource to preload queue
   */
  addToPreloadQueue(element, src, priority = 'normal') {
    this.preloadQueue.push({
      element,
      src,
      priority,
      timestamp: Date.now()
    });

    // Sort by priority
    this.preloadQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    if (!this.isPreloading) {
      this.processPreloadQueue();
    }
  }

  /**
   * Process preload queue
   */
  async processPreloadQueue() {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }

    this.isPreloading = true;

    while (this.preloadQueue.length > 0) {
      const item = this.preloadQueue.shift();
      
      try {
        await this.loadElement(item.element);
        
        // Small delay to prevent blocking
        await this.delay(50);
      } catch (error) {
        console.warn('Preload failed:', error);
      }

      // Check if we should pause preloading
      if (this.shouldPausePreloading()) {
        break;
      }
    }

    this.isPreloading = false;

    // Continue if there are more items
    if (this.preloadQueue.length > 0) {
      setTimeout(() => this.processPreloadQueue(), 1000);
    }
  }

  /**
   * Check if preloading should be paused
   */
  shouldPausePreloading() {
    // Pause if user is actively interacting
    if (Date.now() - this.lastUserInteraction < 1000) {
      return true;
    }

    // Pause if connection is slow
    const connection = navigator.connection;
    if (connection && connection.effectiveType === 'slow-2g') {
      return true;
    }

    // Pause if battery is low
    if (navigator.getBattery) {
      navigator.getBattery().then(battery => {
        if (battery.level < 0.2 && !battery.charging) {
          return true;
        }
      });
    }

    return false;
  }

  /**
   * Preload critical resources
   */
  async preloadCriticalResources() {
    const criticalResources = [
      // Audio files that are likely to be used
      { selector: 'audio[data-critical="true"]', priority: 'high' },
      
      // Images above the fold
      { selector: 'img[data-critical="true"]', priority: 'high' },
      
      // Next likely content
      { selector: '[data-preload-next="true"]', priority: 'normal' }
    ];

    for (const resource of criticalResources) {
      const elements = document.querySelectorAll(resource.selector);
      
      for (const element of elements) {
        if (!this.loadedResources.has(element)) {
          const src = element.dataset.src || element.dataset.preload;
          if (src) {
            this.addToPreloadQueue(element, src, resource.priority);
          }
        }
      }
    }
  }

  /**
   * Progressive image loading with blur effect
   */
  setupProgressiveImages() {
    const images = document.querySelectorAll('img[data-src]');
    
    images.forEach(img => {
      // Create low-quality placeholder
      const placeholder = img.dataset.placeholder;
      if (placeholder) {
        img.src = placeholder;
        img.classList.add('lazy-placeholder');
      }
      
      // Observe for lazy loading
      this.observe(img, {
        src: img.dataset.src,
        priority: img.dataset.priority || 'normal'
      });
      
      // Add loaded event listener for smooth transition
      img.addEventListener('lazyloaded', () => {
        img.classList.add('lazy-fade-in');
        setTimeout(() => {
          img.classList.remove('lazy-placeholder', 'lazy-fade-in');
        }, 300);
      });
    });
  }

  /**
   * Setup responsive image loading
   */
  setupResponsiveImages() {
    const images = document.querySelectorAll('img[data-srcset]');
    
    images.forEach(img => {
      const srcset = img.dataset.srcset;
      const sizes = img.dataset.sizes;
      
      this.observe(img, {
        src: this.getBestImageSrc(srcset, sizes),
        priority: img.dataset.priority || 'normal'
      });
    });
  }

  /**
   * Get best image source based on device capabilities
   */
  getBestImageSrc(srcset, sizes) {
    // Simple implementation - in production, use more sophisticated logic
    const sources = srcset.split(',').map(src => {
      const [url, descriptor] = src.trim().split(' ');
      return { url, width: parseInt(descriptor) || 1 };
    });

    // Sort by width and pick appropriate size
    sources.sort((a, b) => a.width - b.width);
    
    const viewportWidth = window.innerWidth;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const targetWidth = viewportWidth * devicePixelRatio;

    for (const source of sources) {
      if (source.width >= targetWidth) {
        return source.url;
      }
    }

    // Fallback to largest image
    return sources[sources.length - 1].url;
  }

  /**
   * Track user interaction for preloading optimization
   */
  trackUserInteraction() {
    this.lastUserInteraction = Date.now();
  }

  /**
   * Get loading statistics
   */
  getStats() {
    return {
      loadedResources: this.loadedResources.size,
      loadingPromises: this.loadingPromises.size,
      preloadQueue: this.preloadQueue.length,
      isPreloading: this.isPreloading
    };
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    this.loadedResources.clear();
    this.loadingPromises.clear();
    this.preloadQueue = [];
    this.isPreloading = false;

    // Remove event listeners
    document.removeEventListener('mouseover', this.handleMouseOver);
    document.removeEventListener('touchstart', this.handleTouchStart);
  }
}

// Export for use in main app
window.LazyLoader = LazyLoader;