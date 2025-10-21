/**
 * Application Initialization Module
 * 
 * Manages application startup sequence:
 * - Global state initialization
 * - DOM ready event handling
 * - Module initialization order
 * - Authentication restoration
 * - Configuration loading
 * - Event handler setup
 */

(function() {
    'use strict';

    // Global application state
    window.isLoggedIn = false;

    /**
     * Initialize the application on DOM content loaded
     */
    async function initializeApp() {
        console.log('Initializing application...');

        try {
            // 1. Setup event handlers first (must be ready before any events fire)
            if (window.eventHandlers && typeof window.eventHandlers.initializeEventHandlers === 'function') {
                window.eventHandlers.initializeEventHandlers();
                console.log('Event handlers initialized');
            } else {
                console.error('Event handlers module not loaded');
            }

            // 2. Check for stored admin tokens and restore session if valid
            const hasValidTokens = await checkStoredAdminTokens();
            
            // 3. If no valid tokens, setup login form
            if (!hasValidTokens) {
                setupLoginForm();
            }

            // 4. Load initial configuration
            await loadInitialConfiguration();

            // 5. Setup input gain slider event listener
            setupGainSlider();

            console.log('Application initialized successfully');

        } catch (error) {
            console.error('Application initialization failed:', error);
            window.uiManager.showStatus('Application initialization failed', 'error');
        }
    }

    /**
     * Setup login form event listeners
     */
    function setupLoginForm() {
        const adminUsername = document.getElementById('admin-username');
        const adminPassword = document.getElementById('admin-password');
        const adminLoginBtn = document.getElementById('admin-login-btn');

        if (!adminUsername || !adminPassword || !adminLoginBtn) {
            console.error('Login form elements not found');
            return;
        }

        // Username field - Enter key submits
        adminUsername.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adminLoginBtn.click();
            }
        });

        // Password field - Enter key submits
        adminPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adminLoginBtn.click();
            }
        });

        // Login button click handler
        adminLoginBtn.addEventListener('click', async () => {
            if (window.authManager && typeof window.authManager.adminLogin === 'function') {
                await window.authManager.adminLogin();
            } else {
                console.error('Auth manager not available');
            }
        });

        console.log('Login form setup complete');
    }

    /**
     * Check for stored admin tokens and restore session
     * @returns {Promise<boolean>} True if valid tokens were found and restored
     */
    async function checkStoredAdminTokens() {
        if (!window.authManager || typeof window.authManager.checkStoredAdminTokens !== 'function') {
            console.error('Auth manager not available for token check');
            return false;
        }

        try {
            const hasTokens = await window.authManager.checkStoredAdminTokens();
            return hasTokens;
        } catch (error) {
            console.error('Failed to check stored tokens:', error);
            return false;
        }
    }

    /**
     * Load initial configuration
     */
    async function loadInitialConfiguration() {
        if (!window.configManager || typeof window.configManager.loadConfiguration !== 'function') {
            console.error('Config manager not available');
            return;
        }

        try {
            await window.configManager.loadConfiguration();
            console.log('Initial configuration loaded');
        } catch (error) {
            console.error('Failed to load initial configuration:', error);
        }
    }

    /**
     * Setup input gain slider event listener
     */
    function setupGainSlider() {
        const gainSlider = document.getElementById('inputGain');
        if (gainSlider) {
            gainSlider.addEventListener('input', () => {
                if (window.uiManager && typeof window.uiManager.updateGainDisplay === 'function') {
                    window.uiManager.updateGainDisplay();
                }
            });
            console.log('Gain slider setup complete');
        }
    }

    /**
     * Show configuration panel
     */
    function showConfig() {
        if (window.configManager && typeof window.configManager.toggleConfigPanel === 'function') {
            window.configManager.toggleConfigPanel();
        }
    }

    // Export functions to window for onclick handlers
    window.showConfig = showConfig;

    // Initialize app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        // DOM already loaded, initialize immediately
        initializeApp();
    }

    console.log('App initialization module loaded');
})();
