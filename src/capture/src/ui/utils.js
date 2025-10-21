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

// Export functions for use in other modules
window.utils = {
    generateSessionId,
    formatTime,
    getElement
};
