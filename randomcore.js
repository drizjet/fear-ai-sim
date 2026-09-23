// Shared deterministic, serializable randomness for the Fear AI runtime.
// RESPs-RNG-OWNERSHIP-001: every module draws randomness from an injectable
// source whose state fully determines its stream (getState/setState), so the
// whole world can be replayed, saved, loaded, and forked.
export const DEFAULT_SEED = 0x9e3779b9;

// Deterministic, serializable seeded RNG (mulberry32). The internal state fully
// determines the stream, so getState/setState make the generator save/load-safe.
export function mulberry32(seed = DEFAULT_SEED) {
    let a = seed >>> 0;
    return {
        next() { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
        getState() { return a; },
        setState(s) { a = s >>> 0; },
    };
}

// Normalize any accepted injection (seed, function, or { next }) into a single
// { next, getState?, setState? } source. Defaults to a seeded deterministic stream
// so fresh instances are reproducible unless the caller injects otherwise.
export function randomSource(rng, seed = DEFAULT_SEED) {
    if (rng == null) return mulberry32(seed == null ? DEFAULT_SEED : seed);
    if (typeof rng === 'function') return { next: rng };
    return rng;
}