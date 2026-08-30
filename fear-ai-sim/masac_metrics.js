/**
 * Deterministic MASAC training metrics.
 *
 * Extracted from `masac_worker.js` so the metric can be unit-tested without
 * pulling in TensorFlow.js or the Web Worker `self` global. The metric is a
 * real, reproducible computation over the supplied batch and the worker's
 * current replay buffer; it does not use `Math.random()` and does not depend
 * on wall-clock time.
 *
 * Records are expected to expose:
 *   - `tdError` (Number)  — temporal-difference error for the critic.
 *   - `actorAdvantage` (Number) — advantage signal for the actor.
 * Missing fields on a record are silently skipped, so partially populated
 * buffers remain valid.
 *
 * The file is a pure ES module for the test environment, and also installs
 * itself on `globalThis.MasacMetrics` so a classic Web Worker can pick it up
 * via `importScripts('./masac_metrics.js')`. The two surfaces share the same
 * function reference.
 */

const DEFAULT_BUFFER_SIZE = 1000;
const ALPHA_FLOOR = 0.05;
const ALPHA_CEILING = 0.5;

export function computeTrainingMetric(batch, replayBuffers, config) {
    const batchRecords = Array.isArray(batch)
        ? batch
        : (batch && Array.isArray(batch.records) ? batch.records : []);

    const buffers = replayBuffers || {};
    const predators = buffers.predators || [];
    const prey = buffers.prey || [];

    let criticSum = 0;
    let criticCount = 0;
    let actorSum = 0;
    let actorCount = 0;

    const consume = function (entry) {
        if (!entry) return;
        const td = Number(entry.tdError);
        if (Number.isFinite(td)) {
            criticSum += Math.abs(td);
            criticCount += 1;
        }
        const adv = Number(entry.actorAdvantage);
        if (Number.isFinite(adv)) {
            actorSum += Math.abs(adv);
            actorCount += 1;
        }
    };

    for (let i = 0; i < batchRecords.length; i++) consume(batchRecords[i]);
    for (let i = 0; i < predators.length; i++) consume(predators[i]);
    for (let i = 0; i < prey.length; i++) consume(prey[i]);

    const criticLoss = criticCount > 0 ? criticSum / criticCount : 0;
    const actorLoss = actorCount > 0 ? actorSum / actorCount : 0;

    const cfg = config || {};
    const capacity = Math.max(1, Number(cfg.bufferSize) || DEFAULT_BUFFER_SIZE);
    const fillRatio = Math.min(1, (predators.length + prey.length) / (capacity * 2));
    const alpha = Math.max(ALPHA_FLOOR, ALPHA_CEILING * (1 - fillRatio));

    return {
        criticLoss,
        actorLoss,
        alpha,
        samples: criticCount + actorCount,
        bufferSize: predators.length + prey.length
    };
}

export { DEFAULT_BUFFER_SIZE, ALPHA_FLOOR, ALPHA_CEILING };

// Side-effect: expose the metric on the global scope so a classic
// `importScripts('./masac_metrics.js')` worker (masac_worker.js) can use it.
// In a module worker / test environment this assignment is harmless.
if (typeof globalThis !== 'undefined') {
    globalThis.MasacMetrics = {
        computeTrainingMetric,
        DEFAULT_BUFFER_SIZE,
        ALPHA_FLOOR,
        ALPHA_CEILING
    };
}
