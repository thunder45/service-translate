/**
 * Holyrics Integration Module
 * 
 * Handles integration with Holyrics display system for showing translations on church screens.
 * 
 * Dependencies:
 * - ui-manager.js (for showStatus)
 */

/**
 * Test connection to Holyrics API server
 * Verifies host, port, and token configuration
 */
async function testHolyricsConnection() {
    try {
        const result = await window.electronAPI.testHolyricsConnection();
        if (result.success) {
            window.uiManager.showStatus('Holyrics connection successful!', 'success');
        } else {
            window.uiManager.showStatus('Holyrics connection failed', 'error');
        }
    } catch (error) {
        window.uiManager.showStatus(`Holyrics test failed: ${error.message}`, 'error');
    }
}

/**
 * Clear the Holyrics display screen
 * Removes all text from the church display
 */
async function clearHolyrics() {
    try {
        await window.electronAPI.clearHolyrics();
        window.uiManager.showStatus('Holyrics screen cleared', 'success');
    } catch (error) {
        window.uiManager.showStatus(`Failed to clear Holyrics: ${error.message}`, 'error');
    }
}

/**
 * Load Holyrics configuration into the config form
 * 
 * @param {Object} config - Configuration object with holyrics settings
 */
function loadHolyricsConfig(config) {
    if (config.holyrics) {
        const enabledCheckbox = window.utils.getElement('holyricsEnabled');
        const hostInput = window.utils.getElement('holyricsHost');
        const portInput = window.utils.getElement('holyricsPort');
        const tokenInput = window.utils.getElement('holyricsToken');
        const languageSelect = window.utils.getElement('holyricsLanguage');
        const maxLinesInput = window.utils.getElement('holyricsMaxLines');
        
        if (enabledCheckbox) enabledCheckbox.checked = config.holyrics.enabled || false;
        if (hostInput) hostInput.value = config.holyrics.host || '127.0.0.1';
        if (portInput) portInput.value = config.holyrics.port || 8080;
        if (tokenInput) tokenInput.value = config.holyrics.token || '';
        if (languageSelect) languageSelect.value = config.holyrics.language || 'pt';
        if (maxLinesInput) maxLinesInput.value = config.holyrics.maxLines || 3;
    }
}

// Export functions via window namespace
window.holyricsIntegration = {
    testHolyricsConnection,
    clearHolyrics,
    loadHolyricsConfig
};
