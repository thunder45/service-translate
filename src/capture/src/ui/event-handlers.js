/**
 * Event Handlers Module
 * 
 * Manages all Electron IPC event listeners for:
 * - Transcription results (partial and final)
 * - Translation results (all languages)
 * - Streaming errors
 * - Cost tracking events (Polly usage, cost updates, alerts)
 * - WebSocket events (connection, disconnection, clients)
 * - Server events (stopping)
 */

(function() {
    'use strict';

    /**
     * Initialize all event handlers
     * Sets up listeners for Electron IPC events
     */
    function initializeEventHandlers() {
        setupTranscriptionHandlers();
        setupTranslationHandlers();
        setupStreamingHandlers();
        setupCostTrackingHandlers();
        setupWebSocketHandlers();
        setupServerHandlers();
        
        console.log('✓ Event handlers initialized');
    }

    /**
     * Setup transcription result handlers
     * Transcriptions are displayed in the Portuguese tab
     */
    function setupTranscriptionHandlers() {
        window.electronAPI.onTranscription((result) => {
            const content = window.utils.getElement('translation-pt');
            if (!content) {
                console.warn('Portuguese tab not found for transcription display');
                return;
            }

            if (result.isPartial) {
                // Update partial result (shown in italics)
                content.innerHTML = content.innerHTML.split('<br><em>')[0] + '<br><em>' + result.text + '</em>';
            } else {
                // Add final result (remove partial, add new line)
                content.innerHTML = content.innerHTML.replace(/<br><em>.*<\/em>/, '') + '<br>' + result.text;
                
                // Track transcription usage for cost calculation
                if (result.text && result.text.trim()) {
                    const estimatedMinutes = result.text.split(' ').length / 150; // ~150 words per minute
                    window.costTracker.trackTranscribeUsage(estimatedMinutes);
                }
            }
            
            // Auto-scroll to bottom
            content.scrollTop = content.scrollHeight;
        });
    }

    /**
     * Setup translation result handlers
     * Handles translation data from broadcast-translation messages
     * Format: { original: string, translations: { en: string, es: string, ... } }
     */
    function setupTranslationHandlers() {
        console.log('🔍 [DEBUG] Setting up translation handlers');
        
        window.electronAPI.onTranslation((result) => {
            console.log('🔍 [DEBUG] Translation event received in event-handlers.js:', result);
            console.log('🔍 [DEBUG] Result type:', typeof result);
            console.log('🔍 [DEBUG] Result keys:', Object.keys(result));
            
            // Handle translations object (keys are language codes, values are translated text)
            if (result.translations && typeof result.translations === 'object') {
                console.log('🔍 [DEBUG] Processing translations object');
                console.log('🔍 [DEBUG] Translation keys:', Object.keys(result.translations));
                
                Object.entries(result.translations).forEach(([lang, text]) => {
                    console.log(`🔍 [DEBUG] Processing translation for ${lang}: ${text}`);
                    const tabContent = window.utils.getElement(`translation-${lang}`);
                    console.log(`🔍 [DEBUG] Tab element for ${lang}:`, tabContent ? 'FOUND' : 'NOT FOUND');
                    
                    if (!tabContent) {
                        console.warn(`Translation tab not found: translation-${lang}`);
                        return;
                    }

                    // Add translation text (always final, no partial updates from broadcast)
                    const currentContent = tabContent.innerHTML.trim();
                    console.log(`🔍 [DEBUG] Current content length: ${currentContent.length}`);
                    const newContent = currentContent + (currentContent ? '<br>' : '') + text;
                    console.log(`🔍 [DEBUG] New content: ${newContent}`);
                    tabContent.innerHTML = newContent;
                    console.log(`🔍 [DEBUG] Content updated for ${lang}`);
                    
                    // Auto-scroll to bottom
                    tabContent.scrollTop = tabContent.scrollHeight;
                });
                
                // Track translation usage for cost calculation
                if (result.original && result.translations) {
                    const totalCharacters = result.original.length * Object.keys(result.translations).length;
                    window.costTracker.trackTranslateUsage(totalCharacters);
                }
            } else {
                console.error('🔍 [DEBUG] No translations object found or wrong type');
            }
        });
        
        console.log('🔍 [DEBUG] Translation handler setup complete');
    }

    /**
     * Setup streaming error handlers
     */
    function setupStreamingHandlers() {
        window.electronAPI.onStreamingError((error) => {
            console.error('Streaming error:', error);
            window.uiManager.showStatus(`Streaming error: ${error.error}`, 'error');
        });
    }

    /**
     * Setup cost tracking event handlers
     */
    function setupCostTrackingHandlers() {
        // Handle Polly TTS usage events
        window.electronAPI.onPollyUsage((usage) => {
            console.log('Polly usage event received:', usage);
            window.costTracker.trackPollyUsage(usage.characters, usage.voiceType);
        });

        // Handle cost update events
        window.electronAPI.onCostsUpdated((costs) => {
            console.log('Costs updated event received:', costs);
            
            // Update cost tracker with new data
            const costData = window.costTracker.getCostData();
            const updatedData = { ...costData, ...costs };
            window.costTracker.setCostData(updatedData);
            window.costTracker.updateCostDisplay();
        });

        // Handle cost alert events
        window.electronAPI.onCostAlert((alert) => {
            console.log('Cost alert event received:', alert);
            window.uiManager.showStatus(`Cost Alert: ${alert.message}`, 'error');
        });
    }

    /**
     * Setup WebSocket event handlers
     */
    function setupWebSocketHandlers() {
        // WebSocket connected - just log it, UI is updated by connectAndAuthenticate()
        window.electronAPI.onWebSocketConnected(async () => {
            console.log('✓ WebSocket connected event received');
        });

        // WebSocket disconnected - just log it, reconnection is handled manually
        window.electronAPI.onWebSocketDisconnected(() => {
            console.log('⚠️ WebSocket disconnected event received');
        });

        // Client connected to WebSocket server
        window.electronAPI.onClientConnected((clientInfo) => {
            console.log('Client connected:', clientInfo);
            window.uiManager.updateLastActivity('Client connected');
        });

        // Client disconnected from WebSocket server
        window.electronAPI.onClientDisconnected((clientInfo) => {
            console.log('Client disconnected:', clientInfo);
            window.uiManager.updateLastActivity('Client disconnected');
        });
    }

    /**
     * Setup server event handlers
     */
    function setupServerHandlers() {
        // Handle server-stopping event
        window.electronAPI.onServerStopping((data) => {
            console.log('Server stopping event received:', data);
            window.uiManager.showStatus('WebSocket server stopped. Session preserved.', 'info');
        });
    }

    // Export module interface
    window.eventHandlers = {
        initializeEventHandlers
    };

    console.log('✓ Event Handlers module loaded');
})();
