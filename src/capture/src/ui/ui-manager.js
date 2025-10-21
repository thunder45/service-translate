/**
 * UI Manager Module
 * Handles all UI state management and visual updates
 * Dependencies: utils.js
 */

(function() {
    'use strict';

    // Active tab state
    let activeTab = 'pt-BR';

    /**
     * Switch between language tabs in the translation panel
     * @param {string} language - Language code (e.g., 'pt-BR', 'en-US')
     */
    function switchTab(language) {
        // Update active tab button
        document.querySelectorAll('.translation-panel .tab-button').forEach(btn => 
            btn.classList.remove('active')
        );
        event.target.classList.add('active');
        
        // Update active tab content
        document.querySelectorAll('.translation-panel .tab-content').forEach(content => 
            content.classList.remove('active')
        );
        document.getElementById(`tab-${language}`).classList.add('active');
        
        activeTab = language;
    }

    /**
     * Switch between tabs in the configuration panel
     * @param {string} tabName - Tab name (e.g., 'languages', 'audio', 'tts')
     */
    function switchConfigTab(tabName) {
        // Update active tab button
        document.querySelectorAll('#config-panel .tab-button').forEach(btn => 
            btn.classList.remove('active')
        );
        event.target.classList.add('active');
        
        // Update active tab content
        document.querySelectorAll('#config-panel .tab-content').forEach(content => 
            content.classList.remove('active')
        );
        document.getElementById(`config-${tabName}`).classList.add('active');
    }

    /**
     * Show a status message to the user
     * @param {string} message - Status message text
     * @param {string} type - Message type ('success', 'error', 'info')
     */
    function showStatus(message, type) {
        const status = window.utils.getElement('status');
        if (!status) return;
        
        status.textContent = message;
        status.className = `status ${type}`;
        status.classList.remove('hidden');
        
        setTimeout(() => {
            status.classList.add('hidden');
        }, 5000);
    }

    /**
     * Show a login-specific status message
     * @param {string} message - Status message text
     * @param {string} type - Message type ('success', 'error', 'info')
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
     * Update WebSocket server status display
     * @param {string} status - Status value ('unknown', 'starting', 'running', 'connected', etc.)
     */
    function updateWebSocketStatus(status) {
        const statusElement = window.utils.getElement('ws-server-status');
        const refreshBtn = window.utils.getElement('refresh-sessions-btn');
        const createBtn = window.utils.getElement('create-session-btn');
        
        if (!statusElement) return;
        
        const statusMap = {
            'unknown': { text: 'Unknown', color: '#999' },
            'starting': { text: 'Starting...', color: '#FF9800' },
            'running': { text: 'Running', color: '#4CAF50' },
            'connected': { text: 'Connected', color: '#4CAF50' },
            'disconnected': { text: 'Disconnected', color: '#666' },
            'stopping': { text: 'Stopping...', color: '#FF9800' },
            'stopped': { text: 'Stopped', color: '#666' },
            'failed': { text: 'Failed', color: '#f44336' }
        };
        
        const statusInfo = statusMap[status] || statusMap['unknown'];
        statusElement.textContent = statusInfo.text;
        statusElement.style.color = statusInfo.color;
        
        // Enable buttons only when connected
        const isConnected = status === 'connected';
        if (refreshBtn) refreshBtn.disabled = !isConnected;
        if (createBtn) createBtn.disabled = !isConnected;
    }

    /**
     * Update last activity timestamp display
     * @param {string} activity - Description of the activity
     */
    function updateLastActivity(activity) {
        const lastActivityElement = window.utils.getElement('ws-last-activity');
        if (!lastActivityElement) return;
        
        const timeStr = window.utils.formatTime(new Date());
        lastActivityElement.textContent = `${activity} at ${timeStr}`;
    }

    /**
     * Update audio gain slider display value
     */
    function updateGainDisplay() {
        const gainSlider = window.utils.getElement('inputGain');
        const gainValue = window.utils.getElement('gainValue');
        
        if (!gainSlider || !gainValue) return;
        
        gainValue.textContent = gainSlider.value + '%';
    }

    // Export functions to window namespace
    window.uiManager = {
        switchTab,
        switchConfigTab,
        showStatus,
        showLoginStatus,
        updateWebSocketStatus,
        updateLastActivity,
        updateGainDisplay,
        getActiveTab: () => activeTab
    };

})();
