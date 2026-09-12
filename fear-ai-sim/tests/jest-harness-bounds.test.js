import { describe, it, expect } from '@jest/globals';

// R11: harness memory bounds. Unbounded parallel workers (CPUs-1 heavy
// jsdom environments) OOM-crashed Jest workers and the in-matrix dotnet
// build on large hosts (R8 flake autopsy: 4 worker OOMs plus 1 dotnet OOM
// in a single matrix, all passing isolated). These pins keep the bounds
// from being silently removed.
describe('R11: parallel harness memory bounds', () => {
    it('1. Jest config caps workers and recycles bloated ones', async () => {
        const config = (await import('../jest.config.js')).default;
        expect(config.maxWorkers).toBe('50%');
        expect(config.workerIdleMemoryLimit).toBe('1GB');
    });
});
