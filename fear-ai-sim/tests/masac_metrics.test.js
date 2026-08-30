import { describe, expect, it } from '@jest/globals';
import {
    computeTrainingMetric,
    DEFAULT_BUFFER_SIZE,
    ALPHA_FLOOR
} from '../masac_metrics.js';

describe('computeTrainingMetric', () => {
    it('returns zero losses for empty batch and buffers', () => {
        const result = computeTrainingMetric([], { predators: [], prey: [] });
        expect(result.criticLoss).toBe(0);
        expect(result.actorLoss).toBe(0);
        expect(result.samples).toBe(0);
        expect(result.bufferSize).toBe(0);
    });

    it('is deterministic for the same inputs', () => {
        const batch = [
            { tdError: 0.5, actorAdvantage: 0.1 },
            { tdError: -0.25, actorAdvantage: -0.4 }
        ];
        const buffers = {
            predators: [{ tdError: 0.75 }],
            prey: [{ tdError: -0.5, actorAdvantage: 0.2 }]
        };
        const a = computeTrainingMetric(batch, buffers);
        const b = computeTrainingMetric(batch, buffers);
        expect(a).toEqual(b);
    });

    it('averages absolute TD-errors and advantages across batch and buffers', () => {
        const batch = [
            { tdError: 1.0, actorAdvantage: 0.5 },
            { tdError: -1.0, actorAdvantage: -0.5 }
        ];
        const buffers = {
            predators: [{ tdError: 0.0 }],
            prey: []
        };
        // |1.0| + |-1.0| + |0.0| = 2.0 over 3 records => 2/3
        // |0.5| + |-0.5| = 1.0 over 2 records => 0.5
        const result = computeTrainingMetric(batch, buffers);
        expect(result.criticLoss).toBeCloseTo(2 / 3, 8);
        expect(result.actorLoss).toBeCloseTo(0.5, 8);
        expect(result.samples).toBe(5);
        expect(result.bufferSize).toBe(1);
    });

    it('skips records with non-numeric fields rather than producing NaN', () => {
        const batch = [
            { tdError: 'oops', actorAdvantage: null },
            { tdError: 0.5 }
        ];
        const result = computeTrainingMetric(batch, { predators: [], prey: [] });
        expect(Number.isFinite(result.criticLoss)).toBe(true);
        expect(result.criticLoss).toBe(0.5);
    });

    it('schedules alpha downward as the buffer fills', () => {
        const small = computeTrainingMetric([], { predators: [], prey: [] }, { bufferSize: 1000 });
        const big = computeTrainingMetric([], {
            predators: new Array(500).fill({ tdError: 0.1 }),
            prey: new Array(500).fill({ tdError: 0.1 })
        }, { bufferSize: 1000 });
        expect(small.alpha).toBeGreaterThan(big.alpha);
        expect(big.alpha).toBeGreaterThanOrEqual(ALPHA_FLOOR);
    });

    it('respects the default buffer size constant when no config is provided', () => {
        const result = computeTrainingMetric([], { predators: [], prey: [] });
        // With an empty buffer, alpha = ALPHA_CEILING (0.5).
        expect(result.alpha).toBe(0.5);
        expect(DEFAULT_BUFFER_SIZE).toBe(1000);
    });

    it('accepts a batch wrapped in { records: [...] }', () => {
        const result = computeTrainingMetric({ records: [{ tdError: 0.4 }] }, { predators: [], prey: [] });
        expect(result.criticLoss).toBe(0.4);
        expect(result.samples).toBe(1);
    });
});
