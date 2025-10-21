/**
 * Cost Tracker Module
 * Tracks AWS service costs (Transcribe, Translate, Polly)
 * Dependencies: ui-manager.js
 */

(function() {
    'use strict';

    // Cost tracking state
    let costTracker = {
        transcribe: { cost: 0, minutes: 0 },
        translate: { cost: 0, characters: 0 },
        polly: { cost: 0, characters: 0 },
        total: 0,
        hourlyRate: 0,
        sessionStart: new Date()
    };

    // Pricing constants (AWS pricing per service)
    const PRICING = {
        TRANSCRIBE_PER_MINUTE: 0.024,        // $0.024 per minute
        TRANSLATE_PER_MILLION_CHARS: 15,     // $15 per 1M characters
        POLLY_NEURAL_PER_MILLION_CHARS: 16,  // $16 per 1M characters (neural)
        POLLY_STANDARD_PER_MILLION_CHARS: 4, // $4 per 1M characters (standard)
        HOURLY_RATE_WARNING_THRESHOLD: 3.0   // $3/hour warning threshold
    };

    /**
     * Update the cost display in the UI
     */
    function updateCostDisplay() {
        // Update individual service costs
        const transcribeCost = document.getElementById('transcribe-cost');
        const translateCost = document.getElementById('translate-cost');
        const pollyCost = document.getElementById('polly-cost');
        const totalCost = document.getElementById('total-cost');
        const hourlyRate = document.getElementById('hourly-rate');
        
        if (transcribeCost) transcribeCost.textContent = `$${costTracker.transcribe.cost.toFixed(3)}`;
        if (translateCost) translateCost.textContent = `$${costTracker.translate.cost.toFixed(3)}`;
        if (pollyCost) pollyCost.textContent = `$${costTracker.polly.cost.toFixed(3)}`;
        if (totalCost) totalCost.textContent = `$${costTracker.total.toFixed(3)}`;
        if (hourlyRate) hourlyRate.textContent = `($${costTracker.hourlyRate.toFixed(2)}/hr)`;
        
        // Update usage details
        const transcribeUsage = document.getElementById('transcribe-usage');
        const translateUsage = document.getElementById('translate-usage');
        const pollyUsage = document.getElementById('polly-usage');
        
        if (transcribeUsage) transcribeUsage.textContent = `${costTracker.transcribe.minutes.toFixed(1)} min`;
        if (translateUsage) translateUsage.textContent = `${costTracker.translate.characters} chars`;
        if (pollyUsage) pollyUsage.textContent = `${costTracker.polly.characters} chars`;
        
        // Show warning if hourly rate exceeds threshold
        updateCostWarning();
    }

    /**
     * Update the cost warning display
     */
    function updateCostWarning() {
        const warningElement = document.getElementById('cost-warning');
        if (!warningElement) return;
        
        if (costTracker.hourlyRate > PRICING.HOURLY_RATE_WARNING_THRESHOLD) {
            warningElement.classList.remove('hidden');
            warningElement.textContent = `> $${PRICING.HOURLY_RATE_WARNING_THRESHOLD}/hr!`;
        } else {
            warningElement.classList.add('hidden');
        }
    }

    /**
     * Track AWS Transcribe usage
     * @param {number} minutes - Number of minutes transcribed
     */
    function trackTranscribeUsage(minutes) {
        costTracker.transcribe.minutes += minutes;
        costTracker.transcribe.cost += minutes * PRICING.TRANSCRIBE_PER_MINUTE;
        updateTotalCost();
    }

    /**
     * Track AWS Translate usage
     * @param {number} characters - Number of characters translated
     */
    function trackTranslateUsage(characters) {
        costTracker.translate.characters += characters;
        costTracker.translate.cost += characters * (PRICING.TRANSLATE_PER_MILLION_CHARS / 1000000);
        updateTotalCost();
    }

    /**
     * Track AWS Polly usage
     * @param {number} characters - Number of characters synthesized
     * @param {string} voiceType - Voice type ('neural' or 'standard')
     */
    function trackPollyUsage(characters, voiceType) {
        costTracker.polly.characters += characters;
        const rate = voiceType === 'neural' 
            ? (PRICING.POLLY_NEURAL_PER_MILLION_CHARS / 1000000)
            : (PRICING.POLLY_STANDARD_PER_MILLION_CHARS / 1000000);
        costTracker.polly.cost += characters * rate;
        updateTotalCost();
    }

    /**
     * Update total cost and hourly rate
     */
    function updateTotalCost() {
        costTracker.total = 
            costTracker.transcribe.cost + 
            costTracker.translate.cost + 
            costTracker.polly.cost;
        
        // Calculate hourly rate
        const sessionHours = (new Date() - costTracker.sessionStart) / (1000 * 60 * 60);
        costTracker.hourlyRate = sessionHours > 0 ? costTracker.total / sessionHours : 0;
        
        updateCostDisplay();
    }

    /**
     * Reset cost tracking (e.g., at start of new session)
     */
    function resetCostTracking() {
        costTracker = {
            transcribe: { cost: 0, minutes: 0 },
            translate: { cost: 0, characters: 0 },
            polly: { cost: 0, characters: 0 },
            total: 0,
            hourlyRate: 0,
            sessionStart: new Date()
        };
        updateCostDisplay();
    }

    /**
     * Get current cost tracking data
     * @returns {object} Current cost tracker state
     */
    function getCostData() {
        return { ...costTracker };
    }

    /**
     * Set cost tracking data (for restoring state)
     * @param {object} data - Cost tracking data to restore
     */
    function setCostData(data) {
        costTracker = { ...costTracker, ...data };
        if (data.sessionStart) {
            costTracker.sessionStart = new Date(data.sessionStart);
        }
        updateCostDisplay();
    }

    // Export functions to window namespace
    window.costTracker = {
        trackTranscribeUsage,
        trackTranslateUsage,
        trackPollyUsage,
        resetCostTracking,
        getCostData,
        setCostData,
        updateCostDisplay
    };

})();
