/**
 * Configuration Manager Module
 * Handles loading, saving, and managing application configuration
 */

(function() {
    'use strict';

    /**
     * Load audio input devices into the device selector
     */
    async function loadAudioDevices() {
        try {
            const devices = await window.electronAPI.getAudioDevices();
            const deviceSelect = window.utils.getElement('inputDevice');
            if (!deviceSelect) return;
            
            const currentValue = deviceSelect.value;
            
            // Clear existing options
            deviceSelect.innerHTML = '';
            
            // Add device options
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = device.name;
                deviceSelect.appendChild(option);
            });
            
            // Restore previous selection if it exists
            if (currentValue && [...deviceSelect.options].some(opt => opt.value === currentValue)) {
                deviceSelect.value = currentValue;
            }
        } catch (error) {
            console.error('Failed to load audio devices:', error);
            window.uiManager.showStatus('Failed to load audio devices', 'error');
        }
    }

    /**
     * Get selected target languages from checkboxes
     * @returns {string[]} Array of selected language codes
     */
    function getTargetLanguages() {
        const languages = [];
        ['pt', 'en', 'es', 'fr', 'de', 'it'].forEach(lang => {
            const checkbox = window.utils.getElement(`target-${lang}`);
            if (checkbox && checkbox.checked) {
                languages.push(lang);
            }
        });
        return languages;
    }

    /**
     * Load TTS configuration into form fields
     * @param {Object} config - Configuration object
     */
    function loadTTSConfig(config) {
        if (!config || !config.tts) return;
        
        const modeSelect = window.utils.getElement('ttsMode');
        const genderSelect = window.utils.getElement('ttsVoiceGender');
        const hostInput = window.utils.getElement('ttsHost');
        const portInput = window.utils.getElement('ttsPort');
        
        if (modeSelect) modeSelect.value = config.tts.mode || 'neural';
        if (genderSelect) genderSelect.value = config.tts.voiceGender || 'female';
        if (hostInput) hostInput.value = config.tts.host || '127.0.0.1';
        if (portInput) portInput.value = config.tts.port || 3001;
    }

    /**
     * Load configuration from file and populate form fields
     */
    async function loadConfiguration() {
        try {
            const config = await window.electronAPI.loadConfig();
            if (!config) return;
            
            // Advanced tab - Cognito settings
            const userPoolIdInput = window.utils.getElement('userPoolId');
            const clientIdInput = window.utils.getElement('clientId');
            const identityPoolIdInput = window.utils.getElement('identityPoolId');
            const regionInput = window.utils.getElement('region');
            
            if (userPoolIdInput) userPoolIdInput.value = config.userPoolId || '';
            if (clientIdInput) clientIdInput.value = config.clientId || '';
            if (identityPoolIdInput) identityPoolIdInput.value = config.identityPoolId || '';
            if (regionInput) regionInput.value = config.region || 'us-east-1';
            
            // Languages tab - Source language
            const sourceLanguage = config.sourceLanguage || 'pt-BR';
            const sourceRadio = document.querySelector(`input[name="sourceLanguage"][value="${sourceLanguage}"]`);
            if (sourceRadio) sourceRadio.checked = true;
            
            // Languages tab - Target languages
            const targetLanguages = config.targetLanguages || ['en', 'es', 'fr', 'de', 'it'];
            ['pt', 'en', 'es', 'fr', 'de', 'it'].forEach(lang => {
                const checkbox = window.utils.getElement(`target-${lang}`);
                if (checkbox) checkbox.checked = targetLanguages.includes(lang);
            });
            
            // Audio tab
            const inputDeviceSelect = window.utils.getElement('inputDevice');
            const sampleRateSelect = window.utils.getElement('sampleRate');
            const encodingSelect = window.utils.getElement('encoding');
            const channelsSelect = window.utils.getElement('channels');
            const gainSlider = window.utils.getElement('inputGain');
            
            if (inputDeviceSelect) inputDeviceSelect.value = config.inputDevice || 'default';
            if (sampleRateSelect) sampleRateSelect.value = config.sampleRate || '16000';
            if (encodingSelect) encodingSelect.value = config.encoding || 'signed-integer';
            if (channelsSelect) channelsSelect.value = config.channels || '1';
            if (gainSlider) {
                gainSlider.value = config.inputGain || '100';
                window.uiManager.updateGainDisplay();
            }
            
            // Holyrics tab - use holyrics-integration module
            if (window.holyricsIntegration) {
                window.holyricsIntegration.loadHolyricsConfig(config);
            }
            
            // TTS tab
            loadTTSConfig(config);
            
        } catch (error) {
            console.error('Failed to load configuration:', error);
            window.uiManager.showStatus('Failed to load configuration', 'error');
        }
    }

    /**
     * Save configuration to file
     */
    async function saveConfig() {
        const config = {
            // Advanced settings
            userPoolId: window.utils.getElement('userPoolId')?.value || '',
            clientId: window.utils.getElement('clientId')?.value || '',
            identityPoolId: window.utils.getElement('identityPoolId')?.value || '',
            region: window.utils.getElement('region')?.value || 'us-east-1',
            deviceId: 'macos-capture-local',
            
            // Language settings
            sourceLanguage: document.querySelector('input[name="sourceLanguage"]:checked')?.value || 'pt-BR',
            targetLanguages: getTargetLanguages(),
            
            // Audio settings
            inputDevice: window.utils.getElement('inputDevice')?.value || 'default',
            sampleRate: parseInt(window.utils.getElement('sampleRate')?.value || '16000'),
            encoding: window.utils.getElement('encoding')?.value || 'signed-integer',
            channels: parseInt(window.utils.getElement('channels')?.value || '1'),
            inputGain: parseInt(window.utils.getElement('inputGain')?.value || '100'),
            
            // Holyrics settings
            holyrics: {
                enabled: window.utils.getElement('holyricsEnabled')?.checked || false,
                host: window.utils.getElement('holyricsHost')?.value || '127.0.0.1',
                port: parseInt(window.utils.getElement('holyricsPort')?.value || '8080'),
                token: window.utils.getElement('holyricsToken')?.value || '',
                language: window.utils.getElement('holyricsLanguage')?.value || 'pt',
                maxLines: parseInt(window.utils.getElement('holyricsMaxLines')?.value || '3')
            },
            
            // TTS settings
            tts: {
                mode: window.utils.getElement('ttsMode')?.value || 'neural',
                voiceGender: window.utils.getElement('ttsVoiceGender')?.value || 'female',
                host: window.utils.getElement('ttsHost')?.value || '127.0.0.1',
                port: parseInt(window.utils.getElement('ttsPort')?.value || '3001')
            }
        };

        try {
            await window.electronAPI.saveConfig(config);
            
            // If a session is running, update its configuration
            const currentSessionId = window.utils.getElement('current-session-id')?.textContent;
            if (currentSessionId && currentSessionId !== 'Not Connected') {
                window.uiManager.showStatus('Updating active session configuration...', 'info');
                
                const sessionConfig = {
                    sessionId: currentSessionId,
                    enabledLanguages: config.targetLanguages,
                    ttsMode: config.tts.mode,
                    voiceGender: config.tts.voiceGender,
                    audioQuality: (config.tts.mode === 'neural' ? 'high' : 'medium')
                };
                
                await window.electronAPI.updateSessionConfig(sessionConfig);
                window.uiManager.showStatus('Configuration saved and session updated', 'success');
            } else {
                window.uiManager.showStatus('Configuration saved successfully', 'success');
            }
            
            // Hide config panel
            const configPanel = window.utils.getElement('config-panel');
            if (configPanel) configPanel.classList.add('hidden');
            
        } catch (error) {
            console.error('Failed to save configuration:', error);
            window.uiManager.showStatus(`Failed to save configuration: ${error.message}`, 'error');
        }
    }

    /**
     * Show/hide configuration panel and load devices when opened
     */
    function toggleConfigPanel() {
        const panel = window.utils.getElement('config-panel');
        if (!panel) return;
        
        panel.classList.toggle('hidden');
        
        // Load audio devices when config panel is opened
        if (!panel.classList.contains('hidden')) {
            loadAudioDevices();
        }
    }

    /**
     * Switch between configuration tabs
     */
    function switchConfigTab(tabName) {
        // Update tab buttons
        const buttons = document.querySelectorAll('#config-panel .tab-button');
        buttons.forEach(btn => {
            if (btn.textContent.toLowerCase().includes(tabName.toLowerCase())) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update tab content
        const contents = document.querySelectorAll('#config-panel .tab-content');
        contents.forEach(content => {
            if (content.id === `config-${tabName}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }

    // Export public API
    window.configManager = {
        loadAudioDevices,
        getTargetLanguages,
        loadTTSConfig,
        loadConfiguration,
        saveConfig,
        toggleConfigPanel
    };

    // Export global functions for onclick handlers  
    window.switchConfigTab = switchConfigTab;
    window.saveConfig = saveConfig;
    window.showConfig = toggleConfigPanel;

    // Auto-load configuration on module initialization
    loadConfiguration();

})();
