/**
 * WebSocket Manager Module
 * Handles WebSocket server lifecycle, health monitoring, and session management
 * 
 * Dependencies: ui-manager.js, auth-manager.js
 */

(function() {
    'use strict';

    // WebSocket state
    let healthCheckInterval = null;
    let currentSessionView = 'my'; // 'my' or 'all'
    let allSessionsData = { owned: [], all: [] };

    /**
     * Check if WebSocket server is running and start it if needed
     * NOTE: This function ONLY checks and starts the server, it does NOT connect
     * Caller is responsible for connecting after calling this function
     */
    async function checkAndStartWebSocketServer() {
        console.info('Checking WebSocket server status, and start it if needed...');
        try {
            // Check if server is already running using existing health check
            const isRunning = await checkWebSocketServerStatus();
            
            if (isRunning) {
                updateStatus('running');
                window.uiManager.updateLastActivity('Server already running');
                window.uiManager.showStatus('WebSocket server is already running', 'success');
                console.info('✓ WebSocket server is already running');
                // REMOVED: connectToWebSocketServer() - caller will handle connection
            } else {
                // Start the server
                updateStatus('starting');
                window.uiManager.showStatus('Starting WebSocket server...', 'info');
                console.info('Starting WebSocket server...');
                window.uiManager.updateLastActivity('Starting server...');
                
                const result = await window.electronAPI.startWebSocketServer();
                
                if (result.success) {
                    updateStatus('running');
                    window.uiManager.updateLastActivity('Server started successfully');
                    window.uiManager.showStatus('WebSocket server started successfully', 'success');
                    console.info('✓ WebSocket server started successfully');
                    // REMOVED: connectToWebSocketServer() - caller will handle connection
                } else {
                    updateStatus('failed');
                    window.uiManager.updateLastActivity('Server start failed');
                    window.uiManager.showStatus(`Failed to start server: ${result.message}`, 'error');
                    console.error('Failed to start WebSocket server:', result.message);
                }
            }
        } catch (error) {
            console.error('Error checking/starting WebSocket server:', error);
            updateStatus('failed');
            window.uiManager.updateLastActivity('Server check failed');
            window.uiManager.showStatus(`Server check failed: ${error.message}`, 'error');
        }
    }

    /**
     * Check if WebSocket server is running via HTTP health endpoint
     */
    async function checkWebSocketServerStatus() {
        try {
            const config = await window.electronAPI.loadConfig();
            const host = config?.tts?.host || '127.0.0.1';
            const port = config?.tts?.port || 3001;
            
            console.info('Checking WebSocket server status at:', `http://${host}:${port}/health`);
            // Use HTTP health check instead of WebSocket (server uses Socket.IO, not native WebSocket)
            const response = await fetch(`http://${host}:${port}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            console.info('WebSocket server status response:', response);
            return response.ok;
        } catch (error) {
            console.error('Error checking WebSocket server status:', error);
            return false;
        }
    }

    /**
     * Connect to WebSocket server
     */
    async function connectToWebSocketServer() {
        try {
            const config = await window.electronAPI.loadConfig();
            const host = config?.tts?.host || '127.0.0.1';
            const port = config?.tts?.port || 3001;
            const url = `ws://${host}:${port}`;
            
            // Update UI with server URL
            const urlElement = window.utils.getElement('ws-server-url');
            if (urlElement) {
                urlElement.textContent = url;
            }
            
            // Set connecting status (not 'connected' yet!)
            updateStatus('connecting');
            window.uiManager.showStatus('Connecting to WebSocket server...', 'info');
            console.info('Connecting to WebSocket server at:', url);
            
            const result = await window.electronAPI.connectWebSocket();
            
            if (result.success) {
                // Don't set 'connected' here - it will be set after authentication succeeds
                window.uiManager.updateLastActivity('Connection initiated');
                console.info('WebSocket connection initiated (awaiting authentication)');
                
                // Start polling health endpoint for real-time data
                startHealthPolling(host, port);
            } else {
                updateStatus('failed');
                window.uiManager.updateLastActivity('Connection failed');
                window.uiManager.showStatus(`Failed to connect: ${result.error}`, 'error');
                console.error('Failed to connect to WebSocket server:', result.error);
            }
            
        } catch (error) {
            console.error('Failed to connect to WebSocket server:', error);
            updateStatus('failed');
            window.uiManager.updateLastActivity('Connection failed');
            window.uiManager.showStatus(`Connection error: ${error.message}`, 'error');
        }
    }

    /**
     * Start polling the health endpoint for real-time data
     */
    function startHealthPolling(host, port) {
        // Clear any existing interval
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
        }
        
        // Immediate first fetch
        fetchHealthData(host, port);
        
        // Poll every 5 seconds
        healthCheckInterval = setInterval(() => {
            fetchHealthData(host, port);
        }, 5000);
    }

    /**
     * Stop health polling
     */
    function stopHealthPolling() {
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = null;
        }
    }

    /**
     * Fetch health data from the server
     */
    async function fetchHealthData(host, port) {
        try {
            const response = await fetch(`http://${host}:${port}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            
            if (response.ok) {
                const healthData = await response.json();
                updateWidgetsFromHealthData(healthData);
            }
        } catch (error) {
            console.error('Health check failed:', error);
            // Don't show error to user for polling failures
        }
    }

    /**
     * Update UI widgets from health data
     */
    function updateWidgetsFromHealthData(healthData) {
        // Update client count
        const totalClients = healthData.connections || 0;
        const clientCountElement = window.utils.getElement('ws-client-count');
        if (clientCountElement) {
            clientCountElement.textContent = totalClients;
        }
        
        // Update active sessions count
        const activeSessions = healthData.activeSessions || 0;
        const sessionCountElement = window.utils.getElement('ws-session-count');
        if (sessionCountElement) {
            sessionCountElement.textContent = activeSessions;
        }
        
        // Update last activity timestamp
        if (healthData.timestamp) {
            window.uiManager.updateLastActivity('Data refreshed');
        }
        
        // Update Polly cost from health endpoint
        if (healthData.ttsCosts && window.costTracker) {
            window.costTracker.polly.cost = healthData.ttsCosts.totalCost || 0;
            window.costTracker.polly.characters = healthData.ttsCosts.characters || 0;
            window.costTracker.updateCostDisplay();
        }
    }


    /**
     * Stop WebSocket server
     */
    async function stopWebSocketServer() {
        updateStatus('stopping');
        window.uiManager.showStatus('Stopping WebSocket server...', 'info');
        window.uiManager.updateLastActivity('Server stop requested');
        
        // Stop streaming first if it's active
        if (window.isStreaming) {
            console.log('Stopping active streaming before server shutdown...');
            try {
                await window.stopStreaming();
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error('Error stopping streaming:', error);
            }
        }
        
        // Stop health polling
        stopHealthPolling();
        
        try {
            const result = await window.electronAPI.stopWebSocketServer();
            
            if (result.success) {
                updateStatus('stopped');
                window.uiManager.updateLastActivity('Server stopped');
                window.uiManager.showStatus('WebSocket server stopped', 'success');
            } else {
                updateStatus('failed');
                window.uiManager.showStatus(`Failed to stop server: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Failed to stop server:', error);
            updateStatus('failed');
            window.uiManager.showStatus(`Failed to stop server: ${error.message}`, 'error');
        }
    }

    /**
     * Update WebSocket status display
     */
    function updateStatus(status) {
        const statusElement = window.utils.getElement('ws-server-status');
        const refreshBtn = window.utils.getElement('refresh-sessions-btn');
        const createBtn = window.utils.getElement('create-session-btn');
        
        const statusMap = {
            'unknown': { text: 'Unknown', color: '#999' },
            'starting': { text: 'Starting...', color: '#FF9800' },
            'running': { text: 'Running', color: '#4CAF50' },
            'connecting': { text: 'Connecting...', color: '#2196F3' },
            'connected': { text: 'Connected', color: '#4CAF50' },
            'disconnected': { text: 'Disconnected', color: '#666' },
            'stopping': { text: 'Stopping...', color: '#FF9800' },
            'stopped': { text: 'Stopped', color: '#666' },
            'failed': { text: 'Failed', color: '#f44336' }
        };
        
        const statusInfo = statusMap[status] || statusMap['unknown'];
        if (statusElement) {
            statusElement.textContent = statusInfo.text;
            statusElement.style.color = statusInfo.color;
        }
        
        // Enable buttons only when connected
        const isConnected = status === 'connected';
        if (refreshBtn) refreshBtn.disabled = !isConnected;
        if (createBtn) createBtn.disabled = !isConnected;
    }

    /**
     * Refresh sessions list
     */
    async function refreshSessions() {
        try {
            const result = await window.electronAPI.listSessions();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to list sessions');
            }
            
            // Update sessions data
            updateSessionsList(result.ownedSessions || [], result.allSessions || result.sessions || []);
        } catch (error) {
            console.error('Failed to refresh sessions:', error);
            const sessionsListElement = window.utils.getElement('sessions-list');
            if (sessionsListElement) {
                sessionsListElement.innerHTML = 
                    '<div style="text-align: center; color: #f44336; padding: 20px;">Failed to load sessions</div>';
            }
        }
    }

    /**
     * Switch between 'my' and 'all' sessions view
     */
    function switchSessionView(view) {
        currentSessionView = view;
        
        // Update tab styling
        const myTab = window.utils.getElement('my-sessions-tab');
        const allTab = window.utils.getElement('all-sessions-tab');
        
        if (myTab) myTab.classList.toggle('active', view === 'my');
        if (allTab) allTab.classList.toggle('active', view === 'all');
        
        // Update title
        const titleElement = window.utils.getElement('sessions-list-title');
        if (titleElement) {
            titleElement.textContent = view === 'my' ? 'My Active Sessions:' : 'All Active Sessions:';
        }
        
        // Display appropriate sessions
        const sessionsToDisplay = view === 'my' ? allSessionsData.owned : allSessionsData.all;
        displaySessions(sessionsToDisplay);
    }

    /**
     * Update sessions data
     */
    function updateSessionsList(ownedSessions, allSessions) {
        allSessionsData = {
            owned: ownedSessions || [],
            all: allSessions || []
        };
        
        // Display based on current view
        switchSessionView(currentSessionView);
    }

    /**
     * Display sessions in the UI
     */
    function displaySessions(sessions) {
        const container = window.utils.getElement('sessions-list');
        const countSpan = window.utils.getElement('sessions-count');
        
        if (!container) return;
        
        if (countSpan) {
            countSpan.textContent = `(${sessions.length})`;
        }
        
        if (sessions.length === 0) {
            container.innerHTML = 
                '<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 20px;">No active sessions</div>';
            return;
        }
        
        container.innerHTML = sessions.map(session => {
            const isOwner = session.isOwner === true;
            const ownershipBadge = isOwner 
                ? '<span style="background: #4CAF50; padding: 2px 8px; border-radius: 3px; font-size: 10px; margin-right: 5px;">👤 OWNER</span>'
                : '<span style="background: #FF9800; padding: 2px 8px; border-radius: 3px; font-size: 10px; margin-right: 5px;">👁️ READ-ONLY</span>';
            
            const createdByText = session.createdBy ? `Created by: ${session.createdBy}` : '';
            
            return `
                <div style="background: rgba(255,255,255,0.05); padding: 10px; margin-bottom: 8px; border-radius: 4px; border-left: 3px solid ${isOwner ? '#4CAF50' : '#FF9800'};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                ${ownershipBadge}
                                <div style="font-weight: bold; color: #FFD700;">${session.sessionId}</div>
                            </div>
                            <div style="font-size: 11px; color: rgba(255,255,255,0.6);">
                                ${session.clientCount} clients • ${session.config?.ttsMode || 'unknown'} • ${session.status}
                            </div>
                            ${createdByText ? `<div style="font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 2px;">${createdByText}</div>` : ''}
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${isOwner ? `
                                <button onclick="window.websocketManager.reconnectToSession('${session.sessionId}')" style="padding: 4px 12px; font-size: 11px; background: #2196F3;">
                                    ↻ Reconnect
                                </button>
                                <button onclick="window.websocketManager.endSessionFromList('${session.sessionId}')" style="padding: 4px 12px; font-size: 11px; background: #f44336;">
                                    ✕ End
                                </button>
                            ` : `
                                <button onclick="window.websocketManager.viewSession('${session.sessionId}')" style="padding: 4px 12px; font-size: 11px; background: #2196F3;">
                                    👁️ View
                                </button>
                                <span style="font-size: 10px; color: rgba(255,255,255,0.5);">Read-only</span>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * View a read-only session
     */
    async function viewSession(sessionId) {
        window.uiManager.showStatus(`Viewing session ${sessionId} (read-only)`, 'info');
        // In a full implementation, this would show session details in a modal or panel
    }

    /**
     * End a session from the list
     */
    async function endSessionFromList(sessionId) {
        if (!confirm(`Are you sure you want to end session ${sessionId}?`)) {
            return;
        }
        
        try {
            window.uiManager.showStatus(`Ending session ${sessionId}...`, 'info');
            await window.electronAPI.endSession(sessionId);
            window.uiManager.showStatus(`Session ${sessionId} ended successfully`, 'success');
            await refreshSessions();
        } catch (error) {
            window.uiManager.showStatus(`Failed to end session: ${error.message}`, 'error');
        }
    }

    /**
     * Reconnect to an existing session
     */
    async function reconnectToSession(sessionId) {
        try {
            window.uiManager.showStatus(`Reconnecting to session ${sessionId}...`, 'info');
            
            // Set WebSocketManager's internal session state
            const config = await window.electronAPI.loadConfig();
            const sessionConfig = {
                sessionId,
                enabledLanguages: config?.targetLanguages || ['en', 'es', 'fr', 'de', 'it'],
                ttsMode: config?.tts?.mode || 'neural',
                audioQuality: (config?.tts?.mode === 'neural' ? 'high' : 'medium')
            };
            
            await window.electronAPI.setCurrentSession(sessionConfig);
            
            // Update local UI state
            const currentSessionElement = window.utils.getElement('current-session-id');
            const sessionIdInput = window.utils.getElement('sessionId');
            const createBtn = window.utils.getElement('create-session-btn');
            const endBtn = window.utils.getElement('end-session-btn');
            
            if (currentSessionElement) currentSessionElement.textContent = sessionId;
            if (sessionIdInput) sessionIdInput.value = sessionId;
            if (createBtn) createBtn.classList.add('hidden');
            if (endBtn) endBtn.classList.remove('hidden');
            
            // Enable Start Streaming button
            const startBtn = window.utils.getElement('start-btn');
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.title = '';
            }
            
            window.uiManager.showStatus(`Reconnected to session ${sessionId}`, 'success');
            await refreshSessions();
        } catch (error) {
            console.error('Failed to reconnect:', error);
            window.uiManager.showStatus(`Failed to reconnect: ${error.message}`, 'error');
        }
    }

    // Export public API
    window.websocketManager = {
        checkAndStartWebSocketServer,
        checkWebSocketServerStatus,
        connectToWebSocketServer,
        stopWebSocketServer,
        updateStatus,
        refreshSessions,
        switchSessionView,
        viewSession,
        endSessionFromList,
        reconnectToSession,
        stopHealthPolling
    };

    // Also export global functions for onclick handlers
    // Note: reconnectWebSocket is now handled by connectAndAuthenticate in auth-manager.js
    window.reconnectWebSocket = window.connectAndAuthenticate;
    window.stopWebSocketServer = stopWebSocketServer;
    window.refreshSessions = refreshSessions;
    window.switchSessionView = switchSessionView;

})();
