/**
 * tools/verification/verify_backpressure_failure_telemetry.mjs
 *
 * Verifies that AdaptiveBudgetBackpressureController.processBatch counts what
 * happened instead of what was hoped: a tickRunner that throws for one agent
 * still must not stop the batch or crash the frame (defensive isolation is the
 * existing contract), but the failed update must NOT be counted as processed —
 * it is surfaced in the frame report (`failedCount`) and cumulative telemetry
 * (`totalTickFailures`), and its queue entry is cleared like any other's.
 * Before this pin, a throwing agent and a succeeding one were indistinguishable:
 * both incremented `processedCount` / `totalProcessed` and no failure counter
 * existed anywhere.
 *
 * Also pins the neighbouring accounting that must not drift: the empty-queue
 * early return keeps the same shape, coalescing still counts, the frame report
 * is frozen and recorded in `frameHistory`, and the host-authority invariant
 * still passes.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { AdaptiveBudgetBackpressureController } from '../../packages/core/src/AdaptiveBudgetBackpressureController.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

console.log('============================================================');
console.log('VERIFY BACKPRESSURE FAILURE TELEMETRY (a failed tick is not a processed one)');
console.log('============================================================\n');

// ---------------------------------------------------------------- Section A
console.log('--- A. a throwing tick is isolated AND not counted as processed ---');
{
    const c = new AdaptiveBudgetBackpressureController();
    c.enqueueAgentUpdate('bad', { fear: 0.9, urgency: 0.9 }, 0);

    const report = c.processBatch(() => { throw new Error('boom'); }, 1, 50);
    assert(report.processedCount === 0, 'A throwing tick must not count as processed.');
    assert(report.failedCount === 1, 'A throwing tick must be counted as a failure.');
    assert(c.queue.size === 0, "The failed agent's queue entry must still be cleared.");
    assert(c.getTelemetry().totalProcessed === 0, 'Cumulative processed must exclude the failure.');
    assert(c.getTelemetry().totalTickFailures === 1, 'Cumulative failures must include the throwing tick.');
    console.log('  * failure isolation and honest counting: PASS');
}

// ---------------------------------------------------------------- Section B
console.log('\n--- B. a mixed batch keeps the successes and surfaces the failure ---');
{
    const c = new AdaptiveBudgetBackpressureController();
    c.enqueueAgentUpdate('ok-1', { fear: 0.5 }, 0);
    c.enqueueAgentUpdate('bad-1', { fear: 0.9 }, 0);
    c.enqueueAgentUpdate('ok-2', { fear: 0.1 }, 0);

    const seen = [];
    const report = c.processBatch((id, telemetry) => {
        if (id === 'bad-1') throw new Error('boom');
        seen.push({ id, fear: telemetry.fear });
    }, 1, 50);

    assert(report.processedCount === 2, 'The two healthy ticks must count as processed.');
    assert(report.failedCount === 1, 'The one throwing tick must count as a failure.');
    assert(report.remainingQueueDepth === 0, 'Every entry must be dequeued in both outcomes.');
    assert(seen.length === 2, 'The runner must have been invoked exactly once per healthy agent.');
    assert(seen.every((s) => (s.id === 'ok-1' && s.fear === 0.5) || (s.id === 'ok-2' && s.fear === 0.1)),
        'Healthy ticks must receive their own telemetry, untouched.');
    const tele = c.getTelemetry();
    assert(tele.totalProcessed === 2, 'Cumulative processed must match the healthy count.');
    assert(tele.totalTickFailures === 1, 'Cumulative failures must match the throwing count.');
    console.log('  * mixed batch accounting: PASS');
}

// ---------------------------------------------------------------- Section C
console.log('\n--- C. the empty-queue early return keeps its shape (now with failedCount 0) ---');
{
    const c = new AdaptiveBudgetBackpressureController();
    const report = c.processBatch(() => { throw new Error('never runs'); }, 5, 50);
    assert(report.processedCount === 0, 'An empty queue processes nothing.');
    assert(report.failedCount === 0, 'An empty queue fails nothing.');
    assert(report.elapsedMs === 0, 'An empty queue reports 0 ms, as before.');
    assert(report.mode === 'FULL_FIDELITY', 'An empty queue stays in FULL_FIDELITY.');
    console.log('  * empty-queue shape: PASS');
}

// ---------------------------------------------------------------- Section D
console.log('\n--- D. the frame report is frozen, recorded, and cumulative across batches ---');
{
    const c = new AdaptiveBudgetBackpressureController();
    c.enqueueAgentUpdate('bad-1', { fear: 0.9 }, 0);
    const first = c.processBatch(() => { throw new Error('boom'); }, 1, 50);
    assert(Object.isFrozen(first), 'The frame report must stay frozen.');
    assert(c.metrics.frameHistory[c.metrics.frameHistory.length - 1].failedCount === 1,
        'The recorded frame must carry the failure.');

    c.enqueueAgentUpdate('ok-1', { fear: 0.2 }, 1);
    const second = c.processBatch(() => {}, 2, 50);
    assert(second.processedCount === 1 && second.failedCount === 0,
        'A later healthy batch must report only its own outcome.');
    const tele = c.getTelemetry();
    assert(tele.totalProcessed === 1 && tele.totalTickFailures === 1,
        'Cumulative counters must add across batches, one each.');
    console.log('  * frame history and cumulative counters: PASS');
}

// ---------------------------------------------------------------- Section E
console.log('\n--- E. success-only batches, coalescing, and host authority are unchanged ---');
{
    const c = new AdaptiveBudgetBackpressureController();
    c.enqueueAgentUpdate('a', { fear: 0.1 }, 0);
    c.enqueueAgentUpdate('b', { fear: 0.2 }, 0);
    const coalesced = c.enqueueAgentUpdate('a', { fear: 0.3 }, 0);
    assert(coalesced.action === 'COALESCED', 'Repeat updates must still coalesce.');
    assert(coalesced.queueDepth === 2, 'Coalescing must not duplicate the queue entry.');

    const report = c.processBatch(() => {}, 1, 50);
    assert(report.processedCount === 2 && report.failedCount === 0,
        'A success-only batch must report zero failures.');
    assert(c.getTelemetry().totalTickFailures === 0, 'Success-only batches must keep failures at zero.');

    const hostAgent = { fear: 0.7, position: { x: 1, y: 2 } };
    assert(c.validateHostAuthorityInvariant(hostAgent) === true,
        'The host-authority invariant must still hold.');
    console.log('  * unchanged surfaces: PASS');
}

console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} backpressure failure-telemetry assertions passed.`);
console.log('============================================================');
