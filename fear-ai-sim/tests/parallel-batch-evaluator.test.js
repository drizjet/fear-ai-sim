/**
 * @file parallel-batch-evaluator.test.js
 * Unit and integration tests for Frontier D / Sections 136–140:
 * Multi-Threaded Parallel Batch Evaluator & Shared-Memory Buffer Striping.
 */

import {
    ParallelBatchEvaluator,
    SharedMemoryEntityBuffer,
    ENTITY_FIELD_OFFSETS,
    INTENT_CODES,
    INTENT_NAMES
} from '../packages/core/index.js';

describe('Frontier D / Sections 136–140: Parallel Batch Evaluator & Shared Memory', () => {
    let evaluator;

    afterEach(async () => {
        if (evaluator && !evaluator.isTerminated) {
            await evaluator.terminate();
        }
    });

    test('1. SharedMemoryEntityBuffer validates capacity, bounds, and layout', () => {
        expect(() => new SharedMemoryEntityBuffer(0)).toThrow();
        expect(() => new SharedMemoryEntityBuffer(-5)).toThrow();
        expect(() => new SharedMemoryEntityBuffer(3.14)).toThrow();

        const count = 10;
        const buf = new SharedMemoryEntityBuffer(count, { shared: false });
        expect(buf.capacity).toBe(10);
        expect(buf.byteLength).toBe(10 * ENTITY_FIELD_OFFSETS.STRIDE * 4);

        buf.setEntity(0, {
            id: 42,
            posX: 12.5,
            posY: 0.0,
            posZ: -3.5,
            threatX: 10.0,
            threatY: 0.0,
            threatZ: 0.0,
            threatSeverity: 0.9,
            fear: 0.2,
            arousal: 0.1
        });

        const e = buf.getEntity(0);
        expect(e.id).toBe(42);
        expect(e.posX).toBeCloseTo(12.5, 4);
        expect(e.posZ).toBeCloseTo(-3.5, 4);
        expect(e.threatSeverity).toBeCloseTo(0.9, 4);
        expect(e.fear).toBeCloseTo(0.2, 4);
        expect(e.arousal).toBeCloseTo(0.1, 4);

        expect(() => buf.getEntity(-1)).toThrow(RangeError);
        expect(() => buf.getEntity(10)).toThrow(RangeError);
        expect(() => buf.setEntity(15, {})).toThrow(RangeError);
    });

    test('2. Synchronous evaluation obeys threat attenuation, hysteresis, and intent codes', () => {
        evaluator = new ParallelBatchEvaluator({ useWorkers: false });

        const buf = new SharedMemoryEntityBuffer(4, { shared: false });
        
        // Entity 0: Close to high threat -> PANIC_FLEE
        buf.setEntity(0, {
            id: 1, posX: 0, posY: 0, posZ: 0,
            threatX: 0, threatY: 0, threatZ: 2,
            threatSeverity: 0.95, fear: 0.65, arousal: 0.5
        });

        // Entity 1: Moderate distance -> ALERT_INVESTIGATE
        buf.setEntity(1, {
            id: 2, posX: 0, posY: 0, posZ: 0,
            threatX: 0, threatY: 0, threatZ: 30,
            threatSeverity: 0.70, fear: 0.10, arousal: 0.1
        });

        // Entity 2: Distant threat with existing fear -> Recovery Decay
        buf.setEntity(2, {
            id: 3, posX: 0, posY: 0, posZ: 0,
            threatX: 0, threatY: 0, threatZ: 500,
            threatSeverity: 0.50, fear: 0.60, arousal: 0.4
        });

        // Entity 3: Zero threat -> Natural baseline decay -> CALM_IDLE
        buf.setEntity(3, {
            id: 4, posX: 0, posY: 0, posZ: 0,
            threatX: 0, threatY: 0, threatZ: 0,
            threatSeverity: 0.0, fear: 0.08, arousal: 0.05
        });

        evaluator.evaluateSync(buf, 0, 4);

        const e0 = buf.getEntity(0);
        expect(e0.outFear).toBeGreaterThanOrEqual(0.70);
        expect(e0.outIntent).toBe(INTENT_CODES.PANIC_FLEE);
        expect(e0.intentName).toBe('PANIC_FLEE');

        const e1 = buf.getEntity(1);
        expect(e1.outFear).toBeGreaterThanOrEqual(0.15);
        expect(e1.outFear).toBeLessThan(0.45);
        expect(e1.outIntent).toBe(INTENT_CODES.ALERT_INVESTIGATE);
        expect(e1.intentName).toBe('ALERT_INVESTIGATE');

        const e2 = buf.getEntity(2);
        expect(e2.outFear).toBeLessThan(0.60); // Recovering down

        const e3 = buf.getEntity(3);
        expect(e3.outFear).toBeLessThanOrEqual(0.05); // Decayed
        expect(e3.outIntent).toBe(INTENT_CODES.CALM_IDLE);
    });

    test('3. Multi-worker evaluation guarantees bit-exact parity with synchronous evaluation', async () => {
        const count = 4000;
        const syncBuf = SharedMemoryEntityBuffer.createProcedural(count, { shared: false });
        const parBuf = SharedMemoryEntityBuffer.createProcedural(count, { shared: true });

        // Run synchronous
        const syncEval = new ParallelBatchEvaluator({ useWorkers: false });
        syncEval.evaluateSync(syncBuf, 0, count);

        // Run multi-worker parallel
        evaluator = new ParallelBatchEvaluator({ workerCount: 4, chunkSize: 1000, useWorkers: true });
        const telemetry = await evaluator.evaluateBatch(parBuf, count);

        expect(telemetry.mode).toBe('PARALLEL_WORKER_POOL');
        expect(telemetry.workerCount).toBeGreaterThanOrEqual(2);

        // Verify bit-exact equality across all 4,000 entities
        let maxDeviation = 0.0;
        let mismatchedIntents = 0;

        for (let i = 0; i < count; i++) {
            const s = syncBuf.getEntity(i);
            const p = parBuf.getEntity(i);

            const diff = Math.abs(s.outFear - p.outFear);
            if (diff > maxDeviation) maxDeviation = diff;
            if (s.outIntent !== p.outIntent) mismatchedIntents++;
        }

        expect(maxDeviation).toBe(0.0);
        expect(mismatchedIntents).toBe(0);
    });

    test('4. High-scale 50,000 entity cohort evaluates within real-time budget', async () => {
        const count = 50000;
        const buf = SharedMemoryEntityBuffer.createProcedural(count, { shared: true });

        evaluator = new ParallelBatchEvaluator({ workerCount: 4, chunkSize: 5000, useWorkers: true });
        
        // Warm up
        await evaluator.evaluateBatch(buf, count);

        // Measured run
        const telemetry = await evaluator.evaluateBatch(buf, count);

        expect(telemetry.entityCount).toBe(50000);
        expect(telemetry.elapsedMs).toBeLessThan(100.0); // Strict real-time threshold
        expect(telemetry.throughput).toBeGreaterThan(1_000_000); // > 1M ent/sec
        expect(telemetry.mode).toBe('PARALLEL_WORKER_POOL');

        // Check sample outputs
        const first = buf.getEntity(0);
        const middle = buf.getEntity(25000);
        const last = buf.getEntity(49999);

        expect(first.outFear).toBeGreaterThanOrEqual(0.0);
        expect(middle.outFear).toBeGreaterThanOrEqual(0.0);
        expect(last.outFear).toBeGreaterThanOrEqual(0.0);
    });

    test('5. Clean lifecycle management and termination error handling', async () => {
        evaluator = new ParallelBatchEvaluator({ workerCount: 2, useWorkers: true });
        expect(evaluator.isTerminated).toBe(false);

        await evaluator.terminate();
        expect(evaluator.isTerminated).toBe(true);
        expect(evaluator.workers.length).toBe(0);

        const buf = new SharedMemoryEntityBuffer(10, { shared: true });
        await expect(evaluator.evaluateBatch(buf, 10)).rejects.toThrow('ParallelBatchEvaluator has been terminated.');
    });
});
