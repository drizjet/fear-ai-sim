/**
 * A/B Testing Framework for Fear-AI Evolution Simulator
 * Phase 2: Metrics & Analytics (T2.8)
 * 
 * Allows comparing two different simulation configurations
 */

import { MetricsCollector } from './metrics.js';

export class ABTestingFramework {
    constructor() {
        this.groupA = {
            config: {},
            metrics: new MetricsCollector(),
            name: 'Control (A)'
        };
        
        this.groupB = {
            config: {},
            metrics: new MetricsCollector(),
            name: 'Variant (B)'
        };
        
        this.startTime = Date.now();
        this.isActive = false;
    }

    /**
     * Initialize an A/B test with two configurations
     */
    setupTest(configA, configB, nameA = 'Control (A)', nameB = 'Variant (B)') {
        this.groupA.config = { ...configA };
        this.groupB.config = { ...configB };
        this.groupA.name = nameA;
        this.groupB.name = nameB;
        
        this.groupA.metrics.reset();
        this.groupB.metrics.reset();
        this.groupA.metrics.metrics.abTestGroup = 'A';
        this.groupB.metrics.metrics.abTestGroup = 'B';
        
        this.isActive = true;
        this.startTime = Date.now();
    }

    /**
     * Compare the results of the two groups
     */
    compareResults() {
        const statsA = this.groupA.metrics.generateSummary();
        const statsB = this.groupB.metrics.generateSummary();
        
        const survivalA = this.groupA.metrics.getSurvivalTimeStats();
        const survivalB = this.groupB.metrics.getSurvivalTimeStats();
        
        const groupA_avgFear = this.calculateAverage(this.groupA.metrics.metrics.avgFear);
        const groupB_avgFear = this.calculateAverage(this.groupB.metrics.metrics.avgFear);
        
        return {
            testDuration: ((Date.now() - this.startTime) / 1000).toFixed(1) + 's',
            groups: {
                A: { name: this.groupA.name, summary: statsA, survival: survivalA },
                B: { name: this.groupB.name, summary: statsB, survival: survivalB }
            },
            comparison: {
                fearDifference: (groupB_avgFear - groupA_avgFear).toFixed(4),
                survivalDifference: (survivalB.avg - survivalA.avg).toFixed(2),
                panicEventDifference: statsB.session.totalPanicEvents - statsA.session.totalPanicEvents,
                significance: this.calculateSignificance(groupA_avgFear, groupB_avgFear)
            }
        };
    }

    /**
     * Helper to calculate average of an array
     */
    calculateAverage(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Simple significance calculation (placeholder for more complex t-test)
     */
    calculateSignificance(valA, valB) {
        const diff = Math.abs(valA - valB);
        if (diff > 0.1) return 'High';
        if (diff > 0.05) return 'Medium';
        if (diff > 0.01) return 'Low';
        return 'Insignificant';
    }

    /**
     * Export comparison report
     */
    exportReport() {
        const comparison = this.compareResults();
        return JSON.stringify(comparison, null, 2);
    }
}
