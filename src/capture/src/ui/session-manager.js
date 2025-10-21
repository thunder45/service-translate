/**
 * Session Manager Module
 * Handles session creation, ending, and state management
 * 
 * Dependencies: ui-manager.js, utils.js, config-manager.js, websocket-manager.js
 */

(function() {
    'use strict';

    /**
     * Create a new session
     */
    async function createSession() {
        const sessionIdInput = window.utils.getElement('sessionId');
        const sessionId = sessionIdInput?.value;
        
        if (!sessionId) {
            window.uiManager.showStatus('Please enter a session ID first', 'error');
            return;
        }
        
        try {
            window.uiManager.showStatus('Creating session...', 'info');
            
            // Load current config to pass to backend
            const config = await window.electronAPI.loadConfig();
            
            // Call backend to create session (this will connect WebSocket and create session)
            const result = await window.electronAPI.createSession(sessionId, config);
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to create session');
            }
            
            // Update UI
            const currentSessionElement = window.utils.getElement('current-session-id');
            const createBtn = window.utils.getElement('create-session-btn');
            const endBtn = window.utils.getElement('end-session-btn');
            const sessionPanel = window.utils.getElement('session-panel');
            
            if (currentSessionElement) currentSessionElement.textContent = sessionId;
            if (createBtn) createBtn.classList.add('hidden');
            if (endBtn) endBtn.classList.remove('hidden');
            if (sessionPanel) sessionPanel.classList.remove('hidden');
            
            // Enable Start Streaming button
            const startBtn = window.utils.getElement('start-btn');
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.title = '';
            }
            
            window.uiManager.showStatus(`Session ${sessionId} created successfully`, 'success');
            
            // Refresh sessions list
            if (window.websocketManager) {
                await window.websocketManager.refreshSessions();
            }
        } catch (error) {
            console.error('Failed to create session:', error);
            window.uiManager.showStatus(`Failed to create session: ${error.message}`, 'error');
        }
    }

    /**
     * End the current session
     */
    async function endCurrentSession() {
        try {
            const result = await window.electronAPI.endSession();
            
            if (result.success) {
                // Update UI
                const currentSessionElement = window.utils.getElement('current-session-id');
                const createBtn = window.utils.getElement('create-session-btn');
                const endBtn = window.utils.getElement('end-session-btn');
                
                if (currentSessionElement) currentSessionElement.textContent = 'Not Connected';
                if (createBtn) createBtn.classList.remove('hidden');
                if (endBtn) endBtn.classList.add('hidden');
                
                // Disable Start Streaming button
                const startBtn = window.utils.getElement('start-btn');
                if (startBtn) {
                    startBtn.disabled = true;
                    startBtn.title = 'Create a session first';
                }
                
                window.uiManager.showStatus('Session ended', 'success');
                
                // Refresh sessions list
                if (window.websocketManager) {
                    await window.websocketManager.refreshSessions();
                }
            } else {
                window.uiManager.showStatus(`Failed to end session: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Failed to end session:', error);
            window.uiManager.showStatus(`Failed to end session: ${error.message}`, 'error');
        }
    }

    /**
     * Generate a new session ID
     */
    function generateSessionId() {
        const sessionId = window.utils.generateSessionId();
        const sessionIdInput = window.utils.getElement('sessionId');
        if (sessionIdInput) {
            sessionIdInput.value = sessionId;
        }
        window.uiManager.showStatus(`Generated session ID: ${sessionId}`, 'success');
    }

    // Export public API
    window.sessionManager = {
        createSession,
        endCurrentSession,
        generateSessionId
    };

    // Also export global functions for onclick handlers
    window.createSession = createSession;
    window.endCurrentSession = endCurrentSession;
    window.generateSessionId = generateSessionId;

})();
