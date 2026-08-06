/**
 * A/B Testing Framework Tests
 * Phase 2: Metrics & Analytics (T2.8)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ABTestingFramework } from '../abtesting.js';

describe('ABTestingFramework', () => {
    let abTest;

    beforeEach(() => {
        abTest = new ABTestingFramework();
    });

    it('should initialize with two groups', () => {
        expect(abTest.groupA).toBeDefined();
        expect(abTest.groupB).toBeDefined();
        expect(abTest.isActive).toBe(false);
    });

    it('should setup test with configurations', () => {
        const configA = { spawnRate: 1.0 };
        const configB = { spawnRate: 2.0 };
        
        abTest.setupTest(configA, configB, 'Control', 'High Spawn');
        
        expect(abTest.groupA.config.spawnRate).toBe(1.0);
        expect(abTest.groupB.config.spawnRate).toBe(2.0);
        expect(abTest.groupA.name).toBe('Control');
        expect(abTest.groupB.name).toBe('High Spawn');
        expect(abTest.isActive).toBe(true);
    });

    it('should compare results between groups', () => {
        abTest.setupTest({}, {});
        
        // Mock some metrics for Group A
        abTest.groupA.metrics.metrics.avgFear = [0.1, 0.2, 0.3];
        abTest.groupA.metrics.metrics.survivalTime = [100, 200];
        abTest.groupA.metrics.runningStats.totalPanicEvents = 5;
        
        // Mock some metrics for Group B
        abTest.groupB.metrics.metrics.avgFear = [0.4, 0.5, 0.6];
        abTest.groupB.metrics.metrics.survivalTime = [300, 400];
        abTest.groupB.metrics.runningStats.totalPanicEvents = 10;
        
        const comparison = abTest.compareResults();
        
        expect(parseFloat(comparison.comparison.fearDifference)).toBeGreaterThan(0);
        expect(parseFloat(comparison.comparison.survivalDifference)).toBeGreaterThan(0);
        expect(comparison.comparison.panicEventDifference).toBe(5);
        expect(comparison.comparison.significance).toBe('High');
    });

    it('should calculate significance correctly', () => {
        expect(abTest.calculateSignificance(0.1, 0.25)).toBe('High');
        expect(abTest.calculateSignificance(0.1, 0.17)).toBe('Medium');
        expect(abTest.calculateSignificance(0.1, 0.12)).toBe('Low');
        expect(abTest.calculateSignificance(0.1, 0.101)).toBe('Insignificant');
    });

    it('should export report as JSON', () => {
        abTest.setupTest({}, {});
        const report = abTest.exportReport();
        const parsed = JSON.parse(report);
        
        expect(parsed.groups).toBeDefined();
        expect(parsed.comparison).toBeDefined();
    });
});
