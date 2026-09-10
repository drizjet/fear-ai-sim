#!/usr/bin/env node
/**
 * NEXT-47: Above-threshold A urgency-slope utility test.
 *
 * WARN_GROUP fires only above the agreeableness gate (A > 0.65) with
 * urgency 0.65 + 0.15*A — a total slope width of 0.0525, below the
 * default stabilizer hysteresis margin (0.15). The question: is that
 * slope dead precision, or does it ever change a downstream decision?
 * This benchmark sweeps held-urgency rungs x warner agreeableness and
 * counts stabilizer OVERRIDE_DANGER flips. Measurement only; zero
 * behavior change. Fully deterministic (pure computation).
 */

import { fileURLToPath } from 'node:url';
import { IntentStabilizer } from '../../packages/core/src/IntentStabilizer.js';
// Shipped formula (not a copy): the pin guards prod behavior.
import { warnGroupUrgency, WARN_AGREEABLENESS_GATE, approachAllyUrgency } from '../../packages/core/src/IntentResolver.js';

export const WARN_GATE = WARN_AGREEABLENESS_GATE;
export const WARN_BASE = 0.65;
export const WARN_SLOPE = 0.15;
export const SWEEP_LO = 0.5;
export const SWEEP_HI = 0.9;
export const SWEEP_STEP = 0.005;
export function warnUrgency(a) {
    return warnGroupUrgency(a);
}
function overridesAt(a, heldU, margin, cooldown) {
    const s = new IntentStabilizer({ cooldownTicks: cooldown, hysteresisMargin: margin });
    s.update('x', 0, { type: 'FLEE_FROM', urgency: heldU });
    return s.update('x', 1, { type: 'WARN_GROUP', urgency: warnUrgency(a) }).reason === 'OVERRIDE_DANGER';
}

export function runWarnSlopeUtility(options = {}) {
    const margin = options.margin ?? 0.15;
    const cooldown = options.cooldown ?? 5;
    const lo = options.lo ?? SWEEP_LO;
    const hi = options.hi ?? SWEEP_HI;
    const step = options.step ?? SWEEP_STEP;
    const aLo = WARN_GATE + 0.01;
    const aHi = 1.0;
    let rungs = 0;
    let diffs = 0;
    let tipLo = null;
    let tipHi = null;
    for (let u = lo; u <= hi + 1e-9; u += step) {
        rungs++;
        if (overridesAt(aLo, u, margin, cooldown) !== overridesAt(aHi, u, margin, cooldown)) {
            diffs++;
            if (tipLo === null) tipLo = u;
            tipHi = u;
        }
    }
    const r4 = (v) => (v === null ? null : Math.round(v * 10000) / 10000);
    return {
        config: { margin, cooldown, lo, hi, step, aLo, aHi },
        warnUrgencyLo: warnUrgency(aLo),
        warnUrgencyHi: warnUrgency(aHi),
        rungs,
        diffs,
        tipLo: r4(tipLo),
        tipHi: r4(tipHi)
    };
}

export function printWarnSlopeUtility(r) {
    console.log('=== NEXT-47: above-threshold A urgency-slope utility ===');
    console.log(`  warn urgency A=${r.config.aLo}: ${r.warnUrgencyLo}  A=${r.config.aHi}: ${r.warnUrgencyHi}`);
    console.log(`  override flips on ${r.diffs}/${r.rungs} held-urgency rungs (tip band [${r.tipLo}, ${r.tipHi}])`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printWarnSlopeUtility(runWarnSlopeUtility());
}

// NEXT-61: ungated APPROACH_ALLY slope (width 0.20, full A range).
export function approachUrgency(a) {
    return approachAllyUrgency(a);
}
function approachOverridesAt(a, heldU, margin, cooldown) {
    const s = new IntentStabilizer({ cooldownTicks: cooldown, hysteresisMargin: margin });
    s.update('x', 0, { type: 'FLEE_FROM', urgency: heldU });
    return s.update('x', 1, { type: 'APPROACH_ALLY', urgency: approachUrgency(a) }).reason === 'OVERRIDE_DANGER';
}
export function runApproachSlopeUtility(options = {}) {
    const margin = options.margin ?? 0.15;
    const cooldown = options.cooldown ?? 5;
    const lo = options.lo ?? 0.3;
    const hi = options.hi ?? 0.9;
    const step = options.step ?? 0.005;
    const aLo = 0;
    const aHi = 1.0;
    let rungs = 0;
    let diffs = 0;
    let tipLo = null;
    let tipHi = null;
    for (let u = lo; u <= hi + 1e-9; u += step) {
        rungs++;
        if (approachOverridesAt(aLo, u, margin, cooldown) !== approachOverridesAt(aHi, u, margin, cooldown)) {
            diffs++;
            if (tipLo === null) tipLo = u;
            tipHi = u;
        }
    }
    const r4 = (v) => (v === null ? null : Math.round(v * 10000) / 10000);
    return {
        config: { margin, cooldown, lo, hi, step, aLo, aHi },
        approachUrgencyLo: approachUrgency(aLo),
        approachUrgencyHi: approachUrgency(aHi),
        rungs,
        diffs,
        tipLo: r4(tipLo),
        tipHi: r4(tipHi)
    };
}
export function printApproachSlopeUtility(r) {
    console.log('=== NEXT-61: APPROACH_ALLY slope utility ===');
    console.log(`  approach urgency A=${r.config.aLo}: ${r.approachUrgencyLo}  A=${r.config.aHi}: ${r.approachUrgencyHi}`);
    console.log(`  override flips on ${r.diffs}/${r.rungs} held-urgency rungs (tip band [${r.tipLo}, ${r.tipHi}])`);
}
