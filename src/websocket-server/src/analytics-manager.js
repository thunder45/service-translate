"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsManager = void 0;
const events_1 = require("events");
class AnalyticsManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.usagePatterns = new Map();
        this.sessionData = new Map();
        this.requestHistory = [];
        this.initializeAnalytics();
        this.startAnalyticsCollection();
    }
    /**
     * Record TTS request
     */
    recordTTSRequest(data) {
        // Add to request history
        this.requestHistory.push({
            timestamp: new Date(),
            type: 'tts',
            language: data.language,
            voiceType: data.voiceType,
            characters: data.characters,
            latency: data.latency,
            success: data.success,
            cost: data.cost
        });
        // Update TTS analytics
        this.updateTTSAnalytics(data);
        // Update cost analytics
        this.updateCostAnalytics(data);
        // Emit event for real-time monitoring
        this.emit('tts-request-recorded', data);
    }
    /**
     * Record client connection
     */
    recordClientConnection(data) {
        this.sessionData.set(data.sessionId, {
            startTime: new Date(),
            language: data.language,
            translationCount: 0,
            deviceType: data.deviceType,
            connectionQuality: data.connectionQuality
        });
        this.updateClientAnalytics('connection', data);
        this.emit('client-connected', data);
    }
    /**
     * Record client disconnection
     */
    recordClientDisconnection(sessionId) {
        const session = this.sessionData.get(sessionId);
        if (session) {
            session.endTime = new Date();
            this.updateClientAnalytics('disconnection', { sessionId, session });
            this.sessionData.delete(sessionId);
        }
        this.emit('client-disconnected', { sessionId });
    }
    /**
     * Record translation event
     */
    recordTranslation(data) {
        const session = this.sessionData.get(data.sessionId);
        if (session) {
            session.translationCount++;
        }
        this.requestHistory.push({
            timestamp: new Date(),
            type: 'translation',
            language: data.language,
            characters: data.characters,
            success: true
        });
        this.emit('translation-recorded', data);
    }
    /**
     * Get comprehensive analytics report
     */
    getAnalyticsReport() {
        const summary = this.generateSummary();
        return {
            tts: this.ttsAnalytics,
            clients: this.clientAnalytics,
            costs: this.costAnalytics,
            performance: this.performanceAnalytics,
            usagePatterns: Array.from(this.usagePatterns.values()),
            summary
        };
    }
    /**
     * Get cost optimization recommendations
     */
    getCostOptimizationRecommendations() {
        const recommendations = [];
        // Analyze voice type usage
        const neuralCost = this.ttsAnalytics.voiceTypeBreakdown.neural.cost;
        const standardCost = this.ttsAnalytics.voiceTypeBreakdown.standard.cost;
        if (neuralCost > standardCost * 2) {
            recommendations.push({
                type: 'voice_selection',
                description: 'Consider using Standard voices for non-critical content',
                potentialSavings: neuralCost * 0.3,
                priority: 'high',
                implementation: 'Switch 30% of neural voice usage to standard voices'
            });
        }
        // Analyze language usage patterns
        const languageUsage = Object.entries(this.ttsAnalytics.languageBreakdown);
        const lowUsageLanguages = languageUsage.filter(([, data]) => data.requests < 10);
        if (lowUsageLanguages.length > 0) {
            const potentialSavings = lowUsageLanguages.reduce((sum, [, data]) => sum + (data.characters * 0.000016), 0); // Estimate based on neural voice cost
            recommendations.push({
                type: 'language_optimization',
                description: `Consider disabling ${lowUsageLanguages.length} low-usage languages`,
                potentialSavings,
                priority: 'medium',
                implementation: 'Disable languages with <10 requests per day'
            });
        }
        // Analyze caching effectiveness
        if (this.ttsAnalytics.performanceMetrics.cacheHitRate < 60) {
            recommendations.push({
                type: 'caching',
                description: 'Improve caching strategy to reduce duplicate TTS requests',
                potentialSavings: this.costAnalytics.totalCost * 0.2,
                priority: 'high',
                implementation: 'Implement smarter caching and preloading strategies'
            });
        }
        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }
    /**
     * Get capacity planning metrics
     */
    getCapacityPlanningMetrics() {
        const currentHour = new Date().getHours();
        const recentRequests = this.requestHistory.filter(r => Date.now() - r.timestamp.getTime() < 60000 // Last minute
        ).length;
        const activeSessions = this.sessionData.size;
        // Calculate growth trends
        const dailyGrowth = this.calculateGrowthRate('daily');
        const weeklyGrowth = this.calculateGrowthRate('weekly');
        return {
            currentCapacity: {
                concurrentClients: activeSessions,
                requestsPerMinute: recentRequests,
                resourceUtilization: this.performanceAnalytics.systemMetrics.cpuUsage
            },
            projectedGrowth: {
                nextMonth: Math.round(activeSessions * (1 + dailyGrowth * 30)),
                nextQuarter: Math.round(activeSessions * (1 + weeklyGrowth * 12)),
                nextYear: Math.round(activeSessions * (1 + weeklyGrowth * 52))
            },
            recommendations: this.generateCapacityRecommendations(activeSessions, recentRequests)
        };
    }
    /**
     * Detect usage patterns
     */
    detectUsagePatterns() {
        const patterns = [];
        // Analyze time-based patterns
        const hourlyUsage = this.analyzeHourlyUsage();
        const dailyUsage = this.analyzeDailyUsage();
        // Detect peak usage patterns
        const peakHours = hourlyUsage
            .filter(h => h.usage > hourlyUsage.reduce((sum, h) => sum + h.usage, 0) / hourlyUsage.length * 1.5)
            .map(h => h.hour);
        if (peakHours.length > 0) {
            patterns.push({
                id: 'peak-hours',
                name: 'Peak Usage Hours',
                description: `High usage during hours: ${peakHours.join(', ')}`,
                frequency: peakHours.length / 24,
                languages: this.getTopLanguages(3),
                timePattern: {
                    dayOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
                    hoursOfDay: peakHours
                },
                averageDuration: this.clientAnalytics.averageSessionDuration,
                clientCount: Math.round(this.clientAnalytics.activeConnections * 1.5)
            });
        }
        // Detect weekend vs weekday patterns
        const weekendUsage = this.getWeekendUsage();
        const weekdayUsage = this.getWeekdayUsage();
        if (weekendUsage > weekdayUsage * 1.2) {
            patterns.push({
                id: 'weekend-heavy',
                name: 'Weekend Heavy Usage',
                description: 'Higher usage on weekends compared to weekdays',
                frequency: 2 / 7, // 2 days out of 7
                languages: this.getTopLanguages(5),
                timePattern: {
                    dayOfWeek: [0, 6], // Sunday and Saturday
                    hoursOfDay: Array.from({ length: 24 }, (_, i) => i)
                },
                averageDuration: this.clientAnalytics.averageSessionDuration * 1.2,
                clientCount: Math.round(weekendUsage)
            });
        }
        // Store detected patterns
        patterns.forEach(pattern => {
            this.usagePatterns.set(pattern.id, pattern);
        });
        return patterns;
    }
    /**
     * Export analytics data
     */
    async exportAnalyticsData(format = 'json') {
        const data = this.getAnalyticsReport();
        if (format === 'csv') {
            return this.convertToCSV(data);
        }
        return JSON.stringify(data, null, 2);
    }
    // Private methods
    initializeAnalytics() {
        this.ttsAnalytics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageLatency: 0,
            characterCount: 0,
            costEstimate: 0,
            languageBreakdown: {},
            voiceTypeBreakdown: {
                neural: { requests: 0, characters: 0, cost: 0 },
                standard: { requests: 0, characters: 0, cost: 0 }
            },
            hourlyStats: [],
            performanceMetrics: {
                cacheHitRate: 0,
                fallbackRate: 0,
                averageAudioSize: 0,
                compressionRatio: 0
            }
        };
        this.clientAnalytics = {
            totalConnections: 0,
            activeConnections: 0,
            averageSessionDuration: 0,
            languagePreferences: {},
            deviceTypes: {},
            connectionQuality: {
                excellent: 0,
                good: 0,
                fair: 0,
                poor: 0
            },
            userBehavior: {
                averageTranslationsPerSession: 0,
                mostActiveHours: [],
                sessionDurations: []
            }
        };
        this.costAnalytics = {
            totalCost: 0,
            costByService: {
                transcribe: 0,
                translate: 0,
                polly: 0
            },
            costByLanguage: {},
            costTrends: [],
            projectedMonthlyCost: 0,
            costOptimizationRecommendations: []
        };
        this.performanceAnalytics = {
            systemMetrics: {
                cpuUsage: 0,
                memoryUsage: 0,
                networkLatency: 0,
                diskUsage: 0
            },
            applicationMetrics: {
                requestThroughput: 0,
                errorRate: 0,
                averageResponseTime: 0,
                concurrentUsers: 0
            },
            capacityMetrics: {
                maxConcurrentClients: 0,
                peakRequestsPerMinute: 0,
                resourceUtilization: 0,
                scalabilityScore: 0
            }
        };
    }
    startAnalyticsCollection() {
        // Update analytics every minute
        setInterval(() => {
            this.updatePerformanceMetrics();
            this.pruneOldData();
            this.detectUsagePatterns();
        }, 60000);
        // Generate hourly reports
        setInterval(() => {
            this.generateHourlyReport();
        }, 3600000); // Every hour
    }
    updateTTSAnalytics(data) {
        this.ttsAnalytics.totalRequests++;
        if (data.success) {
            this.ttsAnalytics.successfulRequests++;
        }
        else {
            this.ttsAnalytics.failedRequests++;
        }
        // Update running averages
        this.ttsAnalytics.averageLatency =
            (this.ttsAnalytics.averageLatency * (this.ttsAnalytics.totalRequests - 1) + data.latency) /
                this.ttsAnalytics.totalRequests;
        this.ttsAnalytics.characterCount += data.characters;
        this.ttsAnalytics.costEstimate += data.cost;
        // Update language breakdown
        if (!this.ttsAnalytics.languageBreakdown[data.language]) {
            this.ttsAnalytics.languageBreakdown[data.language] = {
                requests: 0,
                characters: 0,
                averageLatency: 0,
                successRate: 0
            };
        }
        const langData = this.ttsAnalytics.languageBreakdown[data.language];
        langData.requests++;
        langData.characters += data.characters;
        langData.averageLatency = (langData.averageLatency * (langData.requests - 1) + data.latency) / langData.requests;
        langData.successRate = (langData.successRate * (langData.requests - 1) + (data.success ? 1 : 0)) / langData.requests;
        // Update voice type breakdown
        const voiceData = this.ttsAnalytics.voiceTypeBreakdown[data.voiceType];
        voiceData.requests++;
        voiceData.characters += data.characters;
        voiceData.cost += data.cost;
    }
    updateClientAnalytics(type, data) {
        if (type === 'connection') {
            this.clientAnalytics.totalConnections++;
            this.clientAnalytics.activeConnections = this.sessionData.size;
            // Update language preferences
            if (!this.clientAnalytics.languagePreferences[data.language]) {
                this.clientAnalytics.languagePreferences[data.language] = 0;
            }
            this.clientAnalytics.languagePreferences[data.language]++;
            // Update device types
            if (!this.clientAnalytics.deviceTypes[data.deviceType]) {
                this.clientAnalytics.deviceTypes[data.deviceType] = 0;
            }
            this.clientAnalytics.deviceTypes[data.deviceType]++;
            // Update connection quality
            this.clientAnalytics.connectionQuality[data.connectionQuality]++;
        }
    }
    updateCostAnalytics(data) {
        this.costAnalytics.totalCost += data.cost;
        this.costAnalytics.costByService.polly += data.cost;
        if (!this.costAnalytics.costByLanguage[data.language]) {
            this.costAnalytics.costByLanguage[data.language] = 0;
        }
        this.costAnalytics.costByLanguage[data.language] += data.cost;
    }
    updatePerformanceMetrics() {
        // Update system metrics (would integrate with actual system monitoring)
        this.performanceAnalytics.systemMetrics = {
            cpuUsage: Math.random() * 100, // Placeholder
            memoryUsage: Math.random() * 100, // Placeholder
            networkLatency: Math.random() * 100, // Placeholder
            diskUsage: Math.random() * 100 // Placeholder
        };
        // Update application metrics
        const recentRequests = this.requestHistory.filter(r => Date.now() - r.timestamp.getTime() < 60000);
        this.performanceAnalytics.applicationMetrics = {
            requestThroughput: recentRequests.length,
            errorRate: recentRequests.filter(r => !r.success).length / Math.max(recentRequests.length, 1),
            averageResponseTime: recentRequests.reduce((sum, r) => sum + (r.latency || 0), 0) / Math.max(recentRequests.length, 1),
            concurrentUsers: this.sessionData.size
        };
    }
    generateSummary() {
        const topLanguages = Object.entries(this.ttsAnalytics.languageBreakdown)
            .sort(([, a], [, b]) => b.requests - a.requests)
            .slice(0, 5)
            .map(([language, data]) => ({ language: language, usage: data.requests }));
        return {
            totalSessions: this.clientAnalytics.totalConnections,
            totalRequests: this.ttsAnalytics.totalRequests,
            totalCost: this.costAnalytics.totalCost,
            averageSessionDuration: this.clientAnalytics.averageSessionDuration,
            topLanguages
        };
    }
    calculateGrowthRate(period) {
        // Simplified growth calculation - would use actual historical data
        return Math.random() * 0.1; // 0-10% growth
    }
    generateCapacityRecommendations(activeSessions, requestsPerMinute) {
        const recommendations = [];
        if (activeSessions > 40) {
            recommendations.push({
                metric: 'Concurrent Clients',
                currentValue: activeSessions,
                recommendedValue: 50,
                reasoning: 'Approaching maximum recommended concurrent client limit'
            });
        }
        if (requestsPerMinute > 100) {
            recommendations.push({
                metric: 'Requests Per Minute',
                currentValue: requestsPerMinute,
                recommendedValue: 120,
                reasoning: 'High request rate may require additional server capacity'
            });
        }
        return recommendations;
    }
    analyzeHourlyUsage() {
        // Analyze request patterns by hour
        const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            usage: this.requestHistory.filter(r => r.timestamp.getHours() === hour).length
        }));
        return hourlyData;
    }
    analyzeDailyUsage() {
        // Analyze request patterns by day of week
        const dailyData = Array.from({ length: 7 }, (_, day) => ({
            day,
            usage: this.requestHistory.filter(r => r.timestamp.getDay() === day).length
        }));
        return dailyData;
    }
    getTopLanguages(count) {
        return Object.entries(this.ttsAnalytics.languageBreakdown)
            .sort(([, a], [, b]) => b.requests - a.requests)
            .slice(0, count)
            .map(([language]) => language);
    }
    getWeekendUsage() {
        return this.requestHistory.filter(r => {
            const day = r.timestamp.getDay();
            return day === 0 || day === 6; // Sunday or Saturday
        }).length;
    }
    getWeekdayUsage() {
        return this.requestHistory.filter(r => {
            const day = r.timestamp.getDay();
            return day >= 1 && day <= 5; // Monday to Friday
        }).length;
    }
    generateHourlyReport() {
        const hour = new Date().toISOString().substring(0, 13); // YYYY-MM-DDTHH
        const hourlyRequests = this.requestHistory.filter(r => r.timestamp.toISOString().substring(0, 13) === hour);
        const hourlyStats = {
            hour,
            requests: hourlyRequests.length,
            characters: hourlyRequests.reduce((sum, r) => sum + (r.characters || 0), 0),
            cost: hourlyRequests.reduce((sum, r) => sum + (r.cost || 0), 0)
        };
        this.ttsAnalytics.hourlyStats.push(hourlyStats);
        // Keep only last 24 hours
        if (this.ttsAnalytics.hourlyStats.length > 24) {
            this.ttsAnalytics.hourlyStats = this.ttsAnalytics.hourlyStats.slice(-24);
        }
    }
    pruneOldData() {
        // Keep only last 24 hours of request history
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        this.requestHistory = this.requestHistory.filter(r => r.timestamp.getTime() > cutoff);
    }
    convertToCSV(data) {
        // Simple CSV conversion - would implement proper CSV formatting
        return JSON.stringify(data);
    }
}
exports.AnalyticsManager = AnalyticsManager;
