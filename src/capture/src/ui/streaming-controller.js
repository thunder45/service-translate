/**
 * Streaming Controller Module
 * 
 * Manages audio streaming operations including:
 * - Starting/stopping audio streaming
 * - Streaming state management
 * - UI button state transitions
 * - Session configuration updates
 * - Translation panel clearing
 */

(function() {
    'use strict';

    // Internal streaming state
    let isStreaming = false;

    /**
     * Start audio streaming
     * Validates login, updates session config, starts streaming, and updates UI
     */
    async function startStreaming() {
        // Check authentication
        if (!window.isLoggedIn) {
            window.uiManager.showStatus('Please login first', 'error');
            return;
        }

        const startBtn = window.utils.getElement('start-btn');
        const stopBtn = window.utils.getElement('stop-btn');

        if (!startBtn) {
            console.error('Start button not found');
            return;
        }

        startBtn.disabled = true;
        startBtn.textContent = '🎤 Starting...';

        try {
            // Update session config with current app settings before streaming
            const currentSessionId = window.utils.getElement('current-session-id')?.textContent;
            if (currentSessionId && currentSessionId !== 'Not Connected') {
                window.uiManager.showStatus('Updating session configuration...', 'info');
                const config = await window.electronAPI.loadConfig();
                
                const sessionConfig = {
                    sessionId: currentSessionId,
                    enabledLanguages: config?.targetLanguages || ['en', 'es', 'fr', 'de', 'it'],
                    ttsMode: config?.tts?.mode || 'neural',
                    voiceGender: config?.tts?.voiceGender || 'female',
                    audioQuality: (config?.tts?.mode === 'neural' ? 'high' : 'medium')
                };
                
                await window.electronAPI.updateSessionConfig(sessionConfig);
            }
            
            // Start streaming
            await window.electronAPI.startLocalStreaming();
            
            // Update state and UI
            isStreaming = true;
            startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-block';
            
            window.uiManager.showStatus('🎤 Local streaming active - Speak into your microphone', 'info');
            
            // Clear previous translation results
            clearTranslationPanels();
            
        } catch (error) {
            console.error('Failed to start streaming:', error);
            window.uiManager.showStatus(`Failed to start streaming: ${error.message}`, 'error');
            startBtn.disabled = false;
            startBtn.textContent = '🎤 Start Streaming';
        }
    }

    /**
     * Stop audio streaming
     * Stops streaming and resets UI state
     */
    async function stopStreaming() {
        const startBtn = window.utils.getElement('start-btn');
        const stopBtn = window.utils.getElement('stop-btn');

        try {
            await window.electronAPI.stopLocalStreaming();
            
            // Update state and UI
            isStreaming = false;
            if (stopBtn) stopBtn.style.display = 'none';
            if (startBtn) {
                startBtn.style.display = 'inline-block';
                startBtn.disabled = false;
                startBtn.textContent = '🎤 Start Streaming';
            }
            
            window.uiManager.showStatus('Streaming stopped', 'info');
            
        } catch (error) {
            console.error('Failed to stop streaming:', error);
            window.uiManager.showStatus(`Failed to stop streaming: ${error.message}`, 'error');
        }
    }

    /**
     * Clear all translation panels
     * Resets content in all language tabs to waiting state
     */
    function clearTranslationPanels() {
        const panels = [
            { id: 'tab-pt-BR', text: 'Listening...' },
            { id: 'tab-en-US', text: 'Waiting for English translations...' },
            { id: 'tab-es-ES', text: 'Waiting for Spanish translations...' },
            { id: 'tab-fr-FR', text: 'Waiting for French translations...' },
            { id: 'tab-de-DE', text: 'Waiting for German translations...' },
            { id: 'tab-it-IT', text: 'Waiting for Italian translations...' }
        ];

        panels.forEach(panel => {
            const element = window.utils.getElement(panel.id);
            if (element) {
                element.textContent = panel.text;
            }
        });
    }

    // Export module interface
    window.streamingController = {
        startStreaming,
        stopStreaming,
        clearTranslationPanels
    };

    // Export global functions for onclick handlers
    window.startStreaming = startStreaming;
    window.stopStreaming = stopStreaming;

    console.log('✓ Streaming Controller module loaded');
})();
