/**
 * Utility Functions Module
 * 
 * Provides common helper functions used throughout the application.
 * These utilities are foundational and have no dependencies on other modules.
 */

/**
 * Generates a unique session ID based on the current timestamp
 * Format: CHURCH-YYYYMMDD-HHMM
 * 
 * @returns {string} Generated session ID
 */
function generateSessionId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    
    return `CHURCH-${year}${month}${day}-${hour}${minute}`;
}

/**
 * Formats a date object to a locale time string
 * 
 * @param {Date} date - Date object to format
 * @returns {string} Formatted time string
 */
function formatTime(date) {
    return date.toLocaleTimeString();
}

/**
 * Safely gets an element by ID with error handling
 * 
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null if not found
 */
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with ID '${id}' not found`);
    }
    return element;
}

/**
 * Switch between translation tabs
 * 
 * @param {string} lang - Language code (pt, en, es, fr, de, it)
 */
function switchTab(lang) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.translation-tabs .tab-button');
    tabs.forEach(tab => {
        if (tab.getAttribute('data-lang') === lang) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Update tab content
    const contents = document.querySelectorAll('.translation-tabs + div[data-lang], .translation-tabs ~ .tab-content[data-lang]');
    contents.forEach(content => {
        if (content.getAttribute('data-lang') === lang) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

// Export functions for use in other modules
window.utils = {
    generateSessionId,
    formatTime,
    getElement
};

// Export switchTab globally for onclick handlers
window.switchTab = switchTab;
