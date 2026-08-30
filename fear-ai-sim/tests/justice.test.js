import { describe, expect, it } from '@jest/globals';
import { JusticeSystem } from '../justice.js';

describe('justice feedback', () => {
    it('turns corrupt failed justice into grievance and migration pressure', () => {
        const result = new JusticeSystem().resolve({ legitimacy: 0.8, grievance: 0.1, reportedCrime: true, investigationQuality: 0.1, corruption: 0.9 });
        expect(result.legitimacy).toBeLessThan(0.8);
        expect(result.grievance).toBeGreaterThan(0.1);
        expect(result.migrationPressure).toBeGreaterThan(0);
    });
});
