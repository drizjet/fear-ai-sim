// scripts/breadth-slice-long-horizon.mjs
//
// Quantitative check for the faction-relationship breadth slice
// (Constitution §529, §407, §23, §344).
//
// Drives the §407 scenario across 5 seeds × 3 horizons and reports:
//   - tick at which the passive faction first leaves TOLERANT
//   - peak stance reached
//   - tick at which the stance drops back below HOSTILE after the
//     stimulus ends (hysteresis proof)
//   - the explanation returned at the peak
//
// Per §142 (sensitivity) and §135 (causal integrity) this script is the
// evidence that the relationship vector + ladder produce the patterns
// the constitution demands.

import {
    FactionRelationshipVector,
    StanceLadder,
    evaluateStance,
    explainStance,
} from '../factionrelationship.js';

const STANCE_NAMES = {
    0: 'TOLERANT',
    1: 'WATCHFUL',
    2: 'DEFENSIVE',
    3: 'HOSTILE',
    4: 'MOBILIZING',
    5: 'LIMITED_CONFLICT',
    6: 'WAR',
    7: 'CEASEFIRE',
};

function seedRng(seed) {
    // Deterministic LCG so the scenario is reproducible across runs.
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x1_0000_0000;
    };
}

function runScenario({ seed, ticks, trespassUntilTick, trespassRate, initialTrust }) {
    const rng = seedRng(seed);
    const vector = new FactionRelationshipVector({ id: `seed-${seed}`, trust: initialTrust });

    const history = [];
    let firstEscalationTick = null;
    let peakStance = StanceLadder.TOLERANT;
    let peakTick = 0;
    let calmedDownBelowHostileAt = null;
    let explanationAtPeak = null;

    for (let tick = 1; tick <= ticks; tick += 1) {
        if (tick <= trespassUntilTick && trespassRate > 0) {
            for (let i = 0; i < trespassRate; i += 1) {
                const severity = 0.4 + rng() * 0.3;
                vector.recordTrespass({ severity, tick });
            }
        }
        const stance = evaluateStance({
            pressure: vector.pressure(),
            trust: vector.trust,
            previous: history.length > 0 ? history[history.length - 1] : StanceLadder.TOLERANT,
        });
        if (history.length === 0 || stance !== history[history.length - 1]) {
            history.push(stance);
        }
        if (firstEscalationTick === null && stance > StanceLadder.TOLERANT) {
            firstEscalationTick = tick;
        }
        if (stance > peakStance) {
            peakStance = stance;
            peakTick = tick;
            explanationAtPeak = explainStance({
                pressure: vector.pressure(),
                trust: vector.trust,
                tradeDependency: vector.tradeDependency,
                territorialPressure: vector.territorialPressure,
                fear: vector.fear,
            });
        }
        if (
            calmedDownBelowHostileAt === null
            && tick > trespassUntilTick
            && stance < StanceLadder.HOSTILE
        ) {
            calmedDownBelowHostileAt = tick;
        }
        vector.advance(tick, { newEvents: [] });
    }

    return {
        firstEscalationTick,
        peakStance,
        peakStanceName: STANCE_NAMES[peakStance],
        peakTick,
        calmedDownBelowHostileAt,
        ticksBelowHostile: calmedDownBelowHostileAt === null
            ? null
            : ticks - calmedDownBelowHostileAt,
        explanationAtPeak,
        finalTrust: vector.trust,
        finalGrievance: vector.grievance,
        finalFear: vector.fear,
        finalTerritorialPressure: vector.territorialPressure,
    };
}

const scenarios = [
    { ticks: 30, trespassUntilTick: 30, trespassRate: 1, initialTrust: 0.5, label: '30-tick continuous trespass' },
    { ticks: 60, trespassUntilTick: 60, trespassRate: 1, initialTrust: 0.5, label: '60-tick continuous trespass' },
    { ticks: 60, trespassUntilTick: 30, trespassRate: 1, initialTrust: 0.5, label: '60-tick with 30-tick trespass + 30-tick calm' },
    { ticks: 100, trespassUntilTick: 50, trespassRate: 2, initialTrust: 0.3, label: '100-tick, double-rate, low trust' },
    { ticks: 100, trespassUntilTick: 50, trespassRate: 2, initialTrust: 0.9, label: '100-tick, double-rate, high trust' },
];

const seeds = [1, 7, 42, 1337, 90210];

console.log('seed\\tscenario\\tfirstEsc\\tpeakStance\\tcalmBelowHostile\\tfinalTrust\\tfinalGrievance');
for (const seed of seeds) {
    for (const scenario of scenarios) {
        const r = runScenario({ seed, ...scenario });
        console.log([
            seed,
            scenario.label,
            r.firstEscalationTick,
            r.peakStanceName,
            r.calmedDownBelowHostileAt,
            r.finalTrust.toFixed(3),
            r.finalGrievance.toFixed(3),
        ].join('\\t'));
    }
}
