import { describe, expect, it } from '@jest/globals';
import { Simulation } from '../simulation.js';

function canvas() {
    return { width: 40, height: 40, parentElement: null, getContext: () => ({}) };
}

describe('Simulation social consequence wiring', () => {
    it('routes interaction validation and justice through Simulation', () => {
        const simulation = new Simulation(canvas(), { initialPopulation: 0, spawnRate: 0, mutationRate: 0 });
        const actor = { id: 'guard', factionId: 'north', canFight: true, resources: 1, canReport: true };
        const target = { id: 'criminal', factionId: 'south', resources: 2 };
        expect(simulation.executeInteraction('Rob', actor, target, {}, 1).ok).toBe(true);
        expect(simulation.executeInteraction('Rob', actor, target, {}, 1).errors).toContain('COOLDOWN');
        const justice = simulation.resolveJustice({ legitimacy: 0.8, grievance: 0.1, reportedCrime: true, investigationQuality: 0.1, corruption: 0.9 });
        expect(justice.legitimacy).toBeLessThan(0.8);
        expect(justice.migrationPressure).toBeGreaterThan(0);
    });
});
