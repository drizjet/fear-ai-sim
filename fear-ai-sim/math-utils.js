// math-utils.js
// Tiny shared math helpers.

export function clamp01(x) {
    if (!Number.isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
}

export function clamp(x, lo, hi) {
    if (!Number.isFinite(x)) return lo;
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
}
