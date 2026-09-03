// reputation.js
//
// Independent reputation dimensions for the closed-world systems.
// Violence memory remains owned by escalation.js (`memoryByActor`) for
// backward compatibility. This module owns additional, dimension-specific
// observations so trade reliability cannot silently become violence memory.

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp01 = value => Math.max(0, Math.min(1, finite(value)));

export const REPUTATION_DIMENSIONS = Object.freeze({
    VIOLENCE: 'violence',
    TRADE_RELIABILITY: 'tradeReliability',
    TRADE_FAIRNESS: 'tradeFairness',
    HONESTY: 'honesty',
    LAWFULNESS: 'lawfulness',
});

export const TRADE_RELIABILITY = REPUTATION_DIMENSIONS.TRADE_RELIABILITY;
export const LAWFULNESS = REPUTATION_DIMENSIONS.LAWFULNESS;

const DEFAULT_NEUTRAL = 0.5;

function dimensionLedger(observer, dimension, { create = false } = {}) {
    if (!observer || typeof observer !== 'object' || !dimension) return null;
    let byDimension = observer.reputationByDimension;
    // These aliases make hand-authored/restored merchant fixtures readable
    // without creating a second source of truth. The canonical factory uses
    // `reputationByDimension[tradeReliability]`.
    let legacyLedger = null;
    if (dimension === TRADE_RELIABILITY) {
        legacyLedger = observer.tradeReliabilityByDestination ?? observer.tradeReliability;
    }
    if ((!byDimension || typeof byDimension !== 'object' || Array.isArray(byDimension)) && create) {
        byDimension = {};
        observer.reputationByDimension = byDimension;
    }
    if (!byDimension || typeof byDimension !== 'object' || Array.isArray(byDimension)) {
        return legacyLedger && typeof legacyLedger === 'object' && !Array.isArray(legacyLedger)
            ? legacyLedger
            : null;
    }

    let ledger = byDimension[dimension] ?? legacyLedger;
    if (ledger && !byDimension[dimension] && create) byDimension[dimension] = ledger;
    if ((!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) && create) {
        ledger = {};
        byDimension[dimension] = ledger;
    }
    return ledger && typeof ledger === 'object' && !Array.isArray(ledger) ? ledger : null;
}

function normalizeRecord(value) {
    if (Number.isFinite(value)) {
        return {
            score: clamp01(value),
            observations: 1,
            successes: 0,
            failures: 0,
            weight: 1,
            lastTick: null,
            lastOutcome: null,
        };
    }
    if (!value || typeof value !== 'object') return null;
    return {
        ...value,
        score: clamp01(value.score),
        observations: Math.max(0, Math.floor(finite(value.observations, 0))),
        successes: Math.max(0, Math.floor(finite(value.successes, 0))),
        failures: Math.max(0, Math.floor(finite(value.failures, 0))),
        weight: Math.max(0, finite(value.weight, 1)),
        lastTick: Number.isFinite(value.lastTick) ? value.lastTick : null,
    };
}

/** Ensure the observer has the plain JSON root used by all dimensions. */
export function ensureReputationState(observer) {
    if (!observer || typeof observer !== 'object') return observer;
    dimensionLedger(observer, TRADE_RELIABILITY, { create: true });
    dimensionLedger(observer, LAWFULNESS, { create: true });
    return observer;
}

/** Return a defensive copy of one dimension/subject observation. */
export function getReputationObservation(observer, dimension, subjectId) {
    if (!subjectId) return null;
    const ledger = dimensionLedger(observer, dimension);
    const record = ledger?.[subjectId];
    const normalized = normalizeRecord(record);
    return normalized ? { ...normalized } : null;
}

export function hasReputationObservation(observer, dimension, subjectId) {
    return getReputationObservation(observer, dimension, subjectId) !== null;
}

/**
 * Read a dimension score with optional half-life decay toward neutral.
 * The record itself is not mutated; querying reputation is deterministic and
 * does not turn observation into hidden state mutation.
 */
export function getReputationScore(
    observer,
    dimension,
    subjectId,
    { tick = 0, halfLifeTicks = Infinity, neutral = DEFAULT_NEUTRAL } = {},
) {
    const record = getReputationObservation(observer, dimension, subjectId);
    const baseline = clamp01(neutral);
    if (!record) return baseline;
    const age = Number.isFinite(tick) && Number.isFinite(record.lastTick)
        ? Math.max(0, tick - record.lastTick)
        : 0;
    let retention = 1;
    if (halfLifeTicks === 0) {
        retention = age > 0 ? 0 : 1;
    } else if (Number.isFinite(halfLifeTicks) && halfLifeTicks > 0) {
        retention = Math.pow(0.5, age / halfLifeTicks);
    }
    return clamp01(baseline + (record.score - baseline) * retention);
}

/**
 * Record one bounded observation in an independent reputation dimension.
 * `weight` is the observation confidence/trust and is persisted as numeric
 * state so save/load and forks do not depend on closures or global counters.
 */
export function recordReputationObservation(
    observer,
    subjectId,
    dimension,
    {
        score,
        tick = 0,
        weight = 1,
        success = null,
        outcome = null,
        metadata = null,
    } = {},
) {
    if (!observer || typeof observer !== 'object' || !subjectId || !dimension) return null;
    const ledger = dimensionLedger(observer, dimension, { create: true });
    if (!ledger) return null;
    const prior = normalizeRecord(ledger[subjectId]);
    const observedScore = clamp01(
        Number.isFinite(score)
            ? score
            : success === true ? 1 : success === false ? 0 : DEFAULT_NEUTRAL,
    );
    const observationWeight = Math.max(0, finite(weight, 1));
    const priorWeight = prior ? Math.max(0, finite(prior.weight, 1)) : 0;
    const totalWeight = priorWeight + observationWeight;
    const nextScore = prior && totalWeight > 0
        ? clamp01((prior.score * priorWeight + observedScore * observationWeight) / totalWeight)
        : observedScore;
    const succeeded = success === null || success === undefined
        ? observedScore >= 1 - Number.EPSILON
        : Boolean(success);
    const next = {
        ...(prior ?? {}),
        score: nextScore,
        observations: (prior?.observations ?? 0) + 1,
        successes: (prior?.successes ?? 0) + (succeeded ? 1 : 0),
        failures: (prior?.failures ?? 0) + (succeeded ? 0 : 1),
        weight: totalWeight > 0 ? totalWeight : priorWeight,
        lastTick: Number.isFinite(tick) ? tick : (prior?.lastTick ?? null),
        lastOutcome: outcome ?? (succeeded ? 'COMPLETED' : 'FAILED'),
        lastObservationScore: observedScore,
    };
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        next.lastMetadata = { ...metadata };
    }
    ledger[subjectId] = next;
    return { ...next };
}

/**
 * Convert a shipment result into the trade-reliability dimension. Reliability
 * is the fraction of the committed shipment that reached usable destination
 * storage, so capacity overflow and transit loss are visible as failures.
 */
export function recordTradeReliability(
    observer,
    destinationTownId,
    {
        shipped = 0,
        stored,
        delivered,
        overflow = 0,
        lost = 0,
        score,
        success,
        tick = 0,
        observerTrust = 1,
        tripId = null,
    } = {},
) {
    const shippedAmount = Math.max(0, finite(shipped));
    const storedAmount = Number.isFinite(stored)
        ? Math.max(0, stored)
        : Number.isFinite(delivered) ? Math.max(0, delivered) : 0;
    const computedScore = shippedAmount > 0
        ? clamp01(storedAmount / shippedAmount)
        : (success === true ? 1 : 0);
    const reliabilityScore = Number.isFinite(score) ? clamp01(score) : computedScore;
    const completed = success === undefined || success === null
        ? shippedAmount > 0 && reliabilityScore >= 1 - Number.EPSILON
        : Boolean(success);
    const outcome = reliabilityScore >= 1 - Number.EPSILON
        ? 'COMPLETED'
        : reliabilityScore <= 0 ? 'FAILED' : 'PARTIAL';
    return recordReputationObservation(observer, destinationTownId, TRADE_RELIABILITY, {
        score: reliabilityScore,
        tick,
        weight: observerTrust,
        success: completed,
        outcome,
        metadata: {
            shipped: shippedAmount,
            stored: storedAmount,
            delivered: Math.max(0, finite(delivered)),
            overflow: Math.max(0, finite(overflow)),
            lost: Math.max(0, finite(lost)),
            ...(tripId ? { tripId } : {}),
        },
    });
}

export function getTradeReliability(observer, destinationTownId, options = {}) {
    return getReputationScore(observer, TRADE_RELIABILITY, destinationTownId, options);
}

/**
 * Record an observed treaty violation as low lawfulness for the violator.
 * The observer is the treaty participant that witnessed the breach; the
 * resulting record is intentionally separate from relationship harm and
 * violence memory so institutions can use it without changing retaliation.
 */
export function recordLawfulnessViolation(
    observer,
    violatorId,
    {
        tick = 0,
        weight = 1,
        treatyId = null,
        reason = null,
    } = {},
) {
    if (!violatorId) return null;
    return recordReputationObservation(observer, violatorId, LAWFULNESS, {
        score: 0,
        tick,
        weight,
        success: false,
        outcome: 'VIOLATION',
        metadata: {
            ...(treatyId ? { treatyId } : {}),
            ...(reason ? { reason } : {}),
        },
    });
}

export function getLawfulness(observer, violatorId, options = {}) {
    return getReputationScore(observer, LAWFULNESS, violatorId, options);
}

/**
 * Aggregate a dimension across observers with persisted observation weight,
 * optional observer trust, and elapsed-tick half-life decay. Missing observers
 * are omitted by default: no observation is not evidence of either reliability
 * or unreliability. Callers that need a zero/neutral prior can pass
 * `includeUnobserved: true`.
 */
export function computeReputationDimension(
    subjectId,
    dimension,
    observers = [],
    {
        tick = 0,
        halfLifeTicks = 40,
        neutral = DEFAULT_NEUTRAL,
        includeUnobserved = false,
        observerTrust = null,
    } = {},
) {
    if (!subjectId || !Array.isArray(observers) || observers.length === 0) return clamp01(neutral);
    let weightedScore = 0;
    let totalWeight = 0;
    for (const observer of observers) {
        const record = getReputationObservation(observer, dimension, subjectId);
        if (!record && !includeUnobserved) continue;
        const trustValue = typeof observerTrust === 'function'
            ? observerTrust(observer, subjectId, dimension)
            : observerTrust === null
                ? observer?.reputationTrust ?? 1
                : observerTrust;
        const trust = clamp01(trustValue);
        if (trust <= 0) continue;
        const observationWeight = record ? Math.max(0, finite(record.weight, 1)) : 1;
        const weight = observationWeight * trust;
        if (weight <= 0) continue;
        const score = record
            ? getReputationScore(observer, dimension, subjectId, { tick, halfLifeTicks, neutral })
            : clamp01(neutral);
        weightedScore += score * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? clamp01(weightedScore / totalWeight) : clamp01(neutral);
}
