import { describe, expect, it, jest } from '@jest/globals';
import { Simulation } from '../simulation.js';
import { Agent } from '../agent.js';

describe('Simulation trade scenario wiring', () => {
    it('runs towns, merchants, routes, and markets through the concrete Simulation', () => {
        const ctx = {
            getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
            createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
            putImageData: jest.fn(), clearRect: jest.fn(), fillRect: jest.fn()
        };
        const canvas = { width: 320, height: 240, getContext: () => ctx, parentElement: null };
        const simulation = new Simulation(canvas, { initialPopulation: 0, spawnRate: 0, mutationRate: 0 });
        simulation.configureTradeScenario({
            routes: [{ id: 'road-a', distance: 20 }],
            demand: { grain: { value: 50, basePrice: 2 } },
            merchants: [{ id: 'merchant-1', cargo: { grain: 10 } }]
        });
        const result = simulation.runTradeScenario({ perceivedDanger: 0, confidence: 1 });
        expect(result.results[0].ok).toBe(true);
        expect(simulation.tradeScenario.towns.get('destination').market.getQuote('grain').supply).toBe(10);
    });

    it('rejects an unconfigured trade scenario safely', () => {
        const simulation = Object.create(Simulation.prototype);
        simulation.tradeScenario = null;
        expect(simulation.runTradeScenario()).toEqual({ ok: false, reason: 'NO_TRADE_SCENARIO' });
    });
});
