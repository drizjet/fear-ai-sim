#!/usr/bin/env node
/**
 * NOW-35: APPROACH_ALLY recovery-window A-slope mapping (measurement only).
 *
 * CCI-15 probed the live regime: lingering fear after threat removal with
 * peers present elicits APPROACH_ALLY (20/20 ticks), urgency 0.45 + 0.20A.
 * This benchmark maps the full post-removal window (60 ticks, no
 * leading-run truncation): total APPROACH urgency and tick count per
 * (N x A x threat-ticks x peer distance), first-APPROACH latency, and the
 * per-N A-elasticity of total urgency. Fully deterministic.
 *
 * Notable structure it must report honestly: window length is N-driven
 * (fear persistence); high-N low-A agents overshoot ANXIOUS into PANIC and
 * FLEE first; peer distance is presence-only in this grid.
 */

import { fileURLToPath } from 'node:url';
import { AffectiveAgent } from '../../packages/core/index.js';

export const REC_N = Object.freeze([0.30, 0.60, 0.90]);
export const REC_A = Object.freeze([0.30, 0.45, 0.55, 0.70, 0.85]);
export const REC_THREAT_TICKS = Object.freeze([3, 10]);
export const REC_PEER_DIST = Object.freeze([2, 8]);
export const REC_HORIZON = 60;

function baseTraits(n, a) {
    return {
        neuroticism: n, resilience: 0.5, openness: 0.5,
        extraversion: 0.5, agreeableness: a,
        conscientiousness: 0.5, leadership: 0.5
    };
}

export function recoveryCell(n, a, threatTicks, peerDist) {
    const agent = new AffectiveAgent('recover', baseTraits(n, a));
    const peers = [{ id: 'peer_1', x: peerDist, y: 0, z: 0 }];
    for (let t = 0; t < threatTicks; t++) {
        agent.tick(0.016, { threats: [{ id: 'creature', distance: 6, intensity: 0.8 }], peers }, { leaderCalm: 0.3 });
    }
    let approachTicks = 0;
    let totalUrgency = 0;
    let firstApproach = -1;
    for (let t = 0; t < REC_HORIZON; t++) {
        const res = agent.tick(0.016, { threats: [], peers }, { leaderCalm: 0.3 });
        if (res.action_intent.type === 'APPROACH_ALLY') {
            if (firstApproach < 0) firstApproach = t;
            approachTicks++;
            totalUrgency += res.action_intent.urgency;
        }
    }
    return {
        approachTicks,
        totalUrgency: parseFloat(totalUrgency.toFixed(3)),
        firstApproach
    };
}

export function runRecoveryMap(options = {}) {
    const nVals = options.nVals ?? REC_N;
    const aVals = options.aVals ?? REC_A;
    const threatTicksVals = options.threatTicksVals ?? REC_THREAT_TICKS;
    const peerDists = options.peerDists ?? REC_PEER_DIST;
    const cells = [];
    for (const n of nVals) {
        for (const tt of threatTicksVals) {
            for (const pd of peerDists) {
                const perA = {};
                for (const a of aVals) perA[String(a)] = recoveryCell(n, a, tt, pd);
                const urgs = aVals.map(a => perA[String(a)].totalUrgency);
                cells.push({
                    n, threatTicks: tt, peerDist: pd, perA,
                    elasticity: parseFloat((Math.max(...urgs) - Math.min(...urgs)).toFixed(3))
                });
            }
        }
    }
    return {
        config: {
            nVals: [...nVals], aVals: [...aVals],
            threatTicksVals: [...threatTicksVals], peerDists: [...peerDists],
            horizon: REC_HORIZON
        },
        cellCount: cells.length,
        cells
    };
}

export function printRecoveryReport(result) {
    console.log('=== NOW-35: APPROACH_ALLY recovery-window map ===');
    for (const c of result.cells) {
        const urgs = Object.entries(c.perA)
            .map(([a, r]) => `A${a}=${r.totalUrgency}(${r.approachTicks}t${r.firstApproach < 0 ? '' : '@' + r.firstApproach})`)
            .join(' ');
        console.log(`  N=${c.n} threat=${c.threatTicks} peerDist=${c.peerDist} elasticity=${c.elasticity} | ${urgs}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printRecoveryReport(runRecoveryMap());
}
