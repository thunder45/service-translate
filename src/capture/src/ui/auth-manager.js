/**
 * Authentication Manager Module - Handles admin authentication, token management, and session state
 * 
 * Key responsibilities:
 * - Admin login/logout
 * - Token storage and refresh
 * - Session state management
 * - Authentication state tracking
 */

(function() {
    'use strict';

    // Authentication state
    let adminAuthState = {
        isAuthenticated: false,
        adminId: null,
        username: null,
        accessToken: null,
        idToken: null,
        refreshToken: null,
        tokenExpiry: null,
        tokenRefreshTimer: null,
        expiryWarningTimer: null
    };

    /**
     * Perform admin login with credentials
     */
    async function adminLogin() {
        const usernameInput = window.utils.getElement('admin-username');
        const passwordInput = window.utils.getElement('admin-password');
        const loginBtn = window.utils.getElement('admin-login-btn');

        const username = usernameInput?.value?.trim();
        const password = passwordInput?.value;

        if (!username || !password) {
            showLoginStatus('Please enter username and password', 'error');
            return;
        }

        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = '🔄 Authenticating...';
        }

        try {
            const result = await window.electronAPI.adminAuthenticate({ username, password });

            if (result.success) {
                // Update auth state
                adminAuthState = {
                    isAuthenticated: true,
                    adminId: result.adminId,
                    username: result.username,
                    accessToken: result.accessToken,
                    idToken: result.idToken,
                    refreshToken: result.refreshToken,
                    tokenExpiry: result.tokenExpiry ? new Date(result.tokenExpiry) : null,
                    tokenRefreshTimer: null,
                    expiryWarningTimer: null
                };

                // Set global authentication flag
                window.isLoggedIn = true;

                // Store auth result
                window.adminAuthResult = result;

                // Setup token management
                setupTokenManagement();

                // Update UI
                window.utils.getElement('login-panel')?.classList.add('hidden');
                window.utils.getElement('main-app')?.classList.remove('hidden');
                window.utils.getElement('admin-logout-btn')?.classList.remove('hidden');

                window.uiManager.showStatus(`✅ Authenticated as ${result.username}`, 'success');

                // Auto-connect to WebSocket
                setTimeout(async () => {
                    try {
                        const connectResult = await window.electronAPI.connectWebSocket();
                        if (connectResult.success) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                            const wsAuthResult = await window.electronAPI.adminAuthenticateWithToken({ 
                                token: result.accessToken 
                            });
                            
                            if (wsAuthResult.success) {
                                if (window.websocketManager) {
                                    window.websocketManager.updateStatus('connected');
                                    await window.websocketManager.refreshSessions();
                                }
                                window.uiManager.showStatus('✅ Connected to WebSocket server', 'success');
                            } else {
                                console.error('WS auth failed:', wsAuthResult);
                                window.uiManager.showStatus('⚠️ WebSocket auth failed. Click Reconnect.', 'warning');
                            }
                        } else {
                            console.error('WS connect failed:', connectResult);
                            window.uiManager.showStatus('⚠️ WebSocket connection failed. Click Reconnect.', 'warning');
                        }
                    } catch (error) {
                        console.error('WebSocket connection/auth error:', error);
                        window.uiManager.showStatus('⚠️ Click Reconnect to connect to WebSocket', 'warning');
                    }
                }, 100);

                // Store tokens securely
                await storeAdminTokens(result.accessToken, result.idToken, result.refreshToken, result.tokenExpiry);

            } else {
                showLoginStatus(result.error || 'Authentication failed', 'error');
            }
        } catch (error) {
            console.error('Admin login error:', error);
            showLoginStatus(`Authentication failed: ${error.message}`, 'error');
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = '🔑 Login';
            }
        }
    }

    /**
     * Perform admin logout
     */
    async function adminLogout() {
        try {
            // Stop health polling
            if (window.websocketManager) {
                window.websocketManager.stopHealthPolling();
            }

            // Clear timers
            if (adminAuthState.tokenRefreshTimer) {
                clearTimeout(adminAuthState.tokenRefreshTimer);
            }
            if (adminAuthState.expiryWarningTimer) {
                clearTimeout(adminAuthState.expiryWarningTimer);
            }

            // Clear stored tokens
            await clearAdminTokens();

            // Disconnect WebSocket
            await window.electronAPI.disconnectWebSocket();

            // Reset state
            adminAuthState = {
                isAuthenticated: false,
                adminId: null,
                username: null,
                accessToken: null,
                idToken: null,
                refreshToken: null,
                tokenExpiry: null,
                tokenRefreshTimer: null,
                expiryWarningTimer: null
            };

            // Clear global flags
            window.isLoggedIn = false;
            window.adminAuthResult = null;

            // Update UI
            window.utils.getElement('main-app')?.classList.add('hidden');
            window.utils.getElement('login-panel')?.classList.remove('hidden');
            window.utils.getElement('admin-logout-btn')?.classList.add('hidden');
            window.utils.getElement('token-expiry-warning')?.classList.add('hidden');

            // Clear form
            const usernameInput = window.utils.getElement('admin-username');
            const passwordInput = window.utils.getElement('admin-password');
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';

            // Re-setup login form event handlers after logout
            setupLoginForm();

            showLoginStatus('Logged out successfully', 'info');
        } catch (error) {
            console.error('Logout error:', error);
            window.uiManager.showStatus(`Logout error: ${error.message}`, 'error');
        }
    }

    /**
     * Refresh admin authentication token
     */
    async function refreshAdminToken() {
        if (!adminAuthState.refreshToken) {
            window.uiManager.showStatus('No refresh token available. Please log in again.', 'error');
            await adminLogout();
            return;
        }

        try {
            const result = await window.electronAPI.refreshAdminToken({
                refreshToken: adminAuthState.refreshToken,
                adminId: adminAuthState.adminId
            });

            if (result.success) {
                // Update tokens (refresh returns new access and ID tokens)
                adminAuthState.accessToken = result.accessToken;
                adminAuthState.idToken = result.idToken;
                adminAuthState.refreshToken = result.refreshToken || adminAuthState.refreshToken;
                adminAuthState.tokenExpiry = result.tokenExpiry ? new Date(result.tokenExpiry) : null;

                // Update global auth result
                if (window.adminAuthResult) {
                    window.adminAuthResult.accessToken = result.accessToken;
                    window.adminAuthResult.idToken = result.idToken;
                    window.adminAuthResult.refreshToken = result.refreshToken || adminAuthState.refreshToken;
                    window.adminAuthResult.tokenExpiry = result.tokenExpiry;
                }

                // Store refreshed tokens
                await storeAdminTokens(result.accessToken, result.idToken, adminAuthState.refreshToken, result.tokenExpiry);

                // Update WebSocket server with new ID token for AWS services
                try {
                    console.log('Updating WebSocket server with refreshed ID token...');
                    await window.electronAPI.updateServerCredentials({
                        idToken: result.idToken
                    });
                    console.log('WebSocket server credentials updated successfully');
                } catch (serverUpdateError) {
                    console.error('Failed to update server credentials:', serverUpdateError);
                    // Don't fail the entire refresh process - server will handle expired tokens
                }

                // Reset timers
                setupTokenManagement();

                // Hide warning
                window.utils.getElement('token-expiry-warning')?.classList.add('hidden');

                window.uiManager.showStatus('✅ Session refreshed successfully', 'success');
            } else {
                window.uiManager.showStatus('Failed to refresh session. Please log in again.', 'error');
                await adminLogout();
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            window.uiManager.showStatus('Failed to refresh session. Please log in again.', 'error');
            await adminLogout();
        }
    }

    /**
     * Setup token refresh and expiry warning timers
     */
    function setupTokenManagement() {
        // Clear existing timers
        if (adminAuthState.tokenRefreshTimer) {
            clearTimeout(adminAuthState.tokenRefreshTimer);
        }
        if (adminAuthState.expiryWarningTimer) {
            clearTimeout(adminAuthState.expiryWarningTimer);
        }

        if (!adminAuthState.tokenExpiry) {
            return;
        }

        const now = Date.now();
        const expiryTime = adminAuthState.tokenExpiry.getTime();
        const timeUntilExpiry = expiryTime - now;

        // Show warning 5 minutes before expiry
        const warningTime = timeUntilExpiry - (5 * 60 * 1000);
        if (warningTime > 0) {
            adminAuthState.expiryWarningTimer = setTimeout(() => {
                showTokenExpiryWarning(5);
            }, warningTime);
        }

        // Auto-refresh 2 minutes before expiry
        const refreshTime = timeUntilExpiry - (2 * 60 * 1000);
        if (refreshTime > 0) {
            adminAuthState.tokenRefreshTimer = setTimeout(() => {
                refreshAdminToken();
            }, refreshTime);
        }
    }

    /**
     * Show token expiry warning with countdown
     */
    function showTokenExpiryWarning(minutesRemaining) {
        const warningDiv = window.utils.getElement('token-expiry-warning');
        const messageDiv = window.utils.getElement('token-expiry-message');

        if (!warningDiv || !messageDiv) return;

        const timeString = minutesRemaining + (minutesRemaining === 1 ? ' minute' : ' minutes');
        messageDiv.textContent = `Your session will expire in ${timeString}. Click to refresh.`;
        warningDiv.classList.remove('hidden');

        // Update countdown
        let remaining = minutesRemaining;
        const countdownInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(countdownInterval);
                messageDiv.textContent = 'Your session has expired. Please log in again.';
                setTimeout(() => adminLogout(), 3000);
            } else {
                const timeStr = remaining + (remaining === 1 ? ' minute' : ' minutes');
                messageDiv.textContent = `Your session will expire in ${timeStr}. Click to refresh.`;
            }
        }, 60000);
    }

    /**
     * Store admin tokens securely
     */
    async function storeAdminTokens(accessToken, idToken, refreshToken, tokenExpiry) {
        try {
            await window.electronAPI.storeAdminTokens({
                accessToken,
                idToken,
                refreshToken,
                tokenExpiry,
                adminId: adminAuthState.adminId,
                username: adminAuthState.username
            });
        } catch (error) {
            console.error('Failed to store admin tokens:', error);
        }
    }

    /**
     * Clear stored admin tokens
     */
    async function clearAdminTokens() {
        try {
            await window.electronAPI.clearAdminTokens();
        } catch (error) {
            console.error('Failed to clear admin tokens:', error);
        }
    }

    /**
     * Check for stored admin tokens on startup
     */
    async function checkStoredAdminTokens() {
        try {
            const stored = await window.electronAPI.loadStoredAdminTokens();
            
            if (stored && stored.accessToken && stored.refreshToken) {
                console.log('✓ Found stored tokens for:', stored.username);

                const expiry = stored.tokenExpiry ? new Date(stored.tokenExpiry) : null;

                // Update state
                adminAuthState = {
                    isAuthenticated: true,
                    adminId: stored.adminId,
                    username: stored.username,
                    accessToken: stored.accessToken,
                    idToken: stored.idToken,
                    refreshToken: stored.refreshToken,
                    tokenExpiry: expiry,
                    tokenRefreshTimer: null,
                    expiryWarningTimer: null
                };

                // Set global auth flags
                window.isLoggedIn = true;
                window.adminAuthResult = {
                    success: true,
                    username: stored.username,
                    accessToken: stored.accessToken,
                    idToken: stored.idToken,
                    refreshToken: stored.refreshToken,
                    tokenExpiry: expiry ? expiry.getTime() : null,
                    adminId: stored.adminId
                };

                // Update UI
                window.utils.getElement('login-panel')?.classList.add('hidden');
                window.utils.getElement('main-app')?.classList.remove('hidden');
                window.utils.getElement('admin-logout-btn')?.classList.remove('hidden');

                // Setup token management
                setupTokenManagement();

                // Show status
                window.uiManager.showStatus(`✅ Reconnected as ${stored.username}`, 'success');

                // Start WebSocket connection flow (use access token for WebSocket auth)
                if (window.websocketManager) {
                    await connectAndAuthenticate(stored.accessToken);
                }

                return true;
            }
        } catch (error) {
            console.error('Failed to check stored tokens:', error);
        }
        
        return false;
    }

    /**
     * Single method to handle connection and authentication
     * Used for both startup (with stored tokens) and manual reconnection
     * Uses existing checkWebSocketServerStatus() - does not reimplement health check
     * 
     * @param {string} accessToken - Optional access token for WebSocket auth, if not provided will use current auth state
     */
    async function connectAndAuthenticate(accessToken) {
        try {
            // If no access token provided, get it from current auth state
            if (!accessToken) {
                if (!adminAuthState.accessToken) {
                    console.error('No access token available for WebSocket authentication');
                    window.uiManager.showStatus('⚠️ Please login first', 'warning');
                    return;
                }
                accessToken = adminAuthState.accessToken;
            }

            window.uiManager.showStatus('Connecting to WebSocket server...', 'info');
            window.uiManager.updateLastActivity('Connection requested');

            // Check if server is running using existing health check
            console.log('Checking WebSocket server health...');
            const isServerRunning = await window.websocketManager.checkWebSocketServerStatus();

            if (!isServerRunning) {
                console.log('Server not running, starting it...');
                // This will check health and start server, but NOT connect
                await window.websocketManager.checkAndStartWebSocketServer();
                
                // Wait for server to be fully ready
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                console.log('✓ Server already running');
            }

            // Now connect to the server
            console.log('Connecting to WebSocket server...');
            await window.websocketManager.connectToWebSocketServer();
            
            // Wait for connection to establish
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Authenticate with access token for WebSocket server
            console.log('Authenticating with access token...');
            const wsAuthResult = await window.electronAPI.adminAuthenticateWithToken({ 
                token: accessToken  // WebSocket server expects access token
            });

            if (wsAuthResult.success) {
                window.websocketManager.updateStatus('connected');
                await window.websocketManager.refreshSessions();
                window.uiManager.showStatus('✅ Connected and authenticated', 'success');
                console.log('✓ Connection and authentication successful');
            } else {
                console.error('Authentication failed:', wsAuthResult);
                window.websocketManager.updateStatus('disconnected');
                window.uiManager.showStatus('⚠️ Authentication failed. Please reconnect.', 'warning');
            }
        } catch (error) {
            console.error('Connection/authentication error:', error);
            window.websocketManager.updateStatus('disconnected');
            window.uiManager.showStatus('⚠️ Connection failed. Click Reconnect.', 'warning');
        }
    }

    /**
     * Show login status message
     */
    function showLoginStatus(message, type) {
        const statusDiv = window.utils.getElement('login-status');
        if (!statusDiv) return;

        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.classList.remove('hidden');

        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                statusDiv.classList.add('hidden');
            }, 3000);
        }
    }

    /**
     * Setup login form event listeners
     */
    function setupLoginForm() {
        const adminUsername = window.utils.getElement('admin-username');
        const adminPassword = window.utils.getElement('admin-password');
        const adminLoginBtn = window.utils.getElement('admin-login-btn');

        if (!adminUsername || !adminPassword || !adminLoginBtn) {
            console.warn('Login form elements not found');
            return;
        }

        // Remove existing event listeners to avoid duplicates
        adminUsername.onkeypress = null;
        adminPassword.onkeypress = null;
        adminLoginBtn.onclick = null;

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
            await adminLogin();
        });

        console.log('Login form event handlers reset');
    }

    // Export public API
    window.authManager = {
        adminLogin,
        adminLogout,
        refreshAdminToken: refreshAdminToken,
        checkStoredAdminTokens,
        connectAndAuthenticate
    };

    // Export functions globally for onclick handlers
    window.adminLogin = adminLogin;
    window.adminLogout = adminLogout;
    window.refreshAdminToken = refreshAdminToken;
    window.connectAndAuthenticate = connectAndAuthenticate;

    console.log('✓ Authentication Manager loaded');

})();
