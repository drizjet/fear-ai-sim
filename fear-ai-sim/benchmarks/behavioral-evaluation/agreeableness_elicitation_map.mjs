#!/usr/bin/env node
/**
 * NOW-34: Agreeableness-signature elicitation mapping (measurement only).
 *
 * CCI-14 probed a dead zone: at A=0.45 vs 0.55 the prosocial-intent term of
 * measureAgreeablenessSignature is exactly zero in both arms and the
 * (1-fear) baseline is identical, so the signature carries no A information
 * there. Code inspection shows why: WARN_GROUP requires agreeableness >
 * 0.65, and APPROACH_ALLY requires the ANXIOUS band with peers but no
 * visible threat.
 *
 * This benchmark maps the elicitation frontier WITHOUT changing any
 * behavior: grid over A x threat distance x intensity x peer presence x
 * leader calm, 20 ticks per cell (same horizon as the signature), recording
 * modal intent, prosocial urgency, and the per-scenario A-elasticity
 * (urgency range across A) plus the minimum A that elicits any prosocial
 * intent. Fully deterministic.
 */

import { fileURLToPath } from 'node:url';
import { AffectiveAgent } from '../../packages/core/index.js';

export const ELICIT_A = Object.freeze([0.30, 0.45, 0.55, 0.70, 0.85]);
export const ELICIT_THREAT_DIST = Object.freeze([null, 3, 8, 15]);
export const ELICIT_INTENSITY = Object.freeze([0.30, 0.60, 0.90]);
export const ELICIT_PEERS = Object.freeze([0, 1]);
export const ELICIT_CALM = Object.freeze([0.30, 0.60, 0.90]);
export const ELICIT_TICKS = 20;

function baseTraits(a) {
    return {
        neuroticism: 0.5, resilience: 0.5, openness: 0.5,
        extraversion: 0.5, agreeableness: a,
        conscientiousness: 0.5, leadership: 0.5
    };
}

export function elicitationCell(a, threatDist, intensity, peerCount, leaderCalm) {
    const agent = new AffectiveAgent('elicit', baseTraits(a));
    const threats = threatDist === null
        ? []
        : [{ id: 'creature', distance: threatDist, intensity }];
    const peers = peerCount > 0 ? [{ id: 'peer_1', x: 2.0, y: 0, z: 0 }] : [];
    const counts = {};
    let prosocialUrgency = 0;
    for (let t = 0; t < ELICIT_TICKS; t++) {
        const res = agent.tick(0.016, { threats, peers }, { leaderCalm });
        const ty = res.action_intent.type;
        counts[ty] = (counts[ty] || 0) + 1;
        if (ty === 'WARN_GROUP' || ty === 'APPROACH_ALLY') {
            prosocialUrgency += res.action_intent.urgency;
        }
    }
    let modal = null;
    let modalCount = -1;
    for (const [ty, n] of Object.entries(counts)) {
        if (n > modalCount) { modalCount = n; modal = ty; }
    }
    return {
        modalIntent: modal,
        prosocialUrgency: parseFloat(prosocialUrgency.toFixed(3)),
        elicited: prosocialUrgency > 0
    };
}

export function runElicitationMap(options = {}) {
    const aVals = options.aVals ?? ELICIT_A;
    const dists = options.dists ?? ELICIT_THREAT_DIST;
    const intensities = options.intensities ?? ELICIT_INTENSITY;
    const peerCounts = options.peerCounts ?? ELICIT_PEERS;
    const calms = options.calms ?? ELICIT_CALM;
    const scenarios = [];
    for (const dist of dists) {
        for (const intensity of intensities) {
            for (const peerCount of peerCounts) {
                for (const calm of calms) {
                    const perA = {};
                    for (const a of aVals) {
                        perA[String(a)] = elicitationCell(a, dist, intensity, peerCount, calm);
                    }
                    const urgencies = aVals.map(a => perA[String(a)].prosocialUrgency);
                    const elasticity = parseFloat((Math.max(...urgencies) - Math.min(...urgencies)).toFixed(3));
                    let thresholdA = null;
                    for (const a of aVals) {
                        if (perA[String(a)].elicited) { thresholdA = a; break; }
                    }
                    scenarios.push({
                        threatDist: dist, intensity, peerCount, leaderCalm: calm,
                        perA, elasticity, thresholdA
                    });
                }
            }
        }
    }
    const eliciting = scenarios.filter(s => s.thresholdA !== null);
    return {
        config: {
            aVals: [...aVals], dists: [...dists], intensities: [...intensities],
            peerCounts: [...peerCounts], calms: [...calms], ticks: ELICIT_TICKS
        },
        scenarioCount: scenarios.length,
        elicitingCount: eliciting.length,
        scenarios
    };
}

export function printElicitationReport(result) {
    console.log('=== NOW-34: Agreeableness Elicitation Map ===');
    console.log(`scenarios: ${result.scenarioCount}, eliciting (>=1 A elicits): ${result.elicitingCount}`);
    for (const s of result.scenarios) {
        if (s.thresholdA === null) continue;
        const label = `dist=${s.threatDist ?? 'none'} int=${s.intensity} peers=${s.peerCount} calm=${s.leaderCalm}`;
        const urgs = Object.entries(s.perA).map(([a, c]) => `A${a}=${c.prosocialUrgency}`).join(' ');
        console.log(`  ${label} thresholdA=${s.thresholdA} elasticity=${s.elasticity} | ${urgs}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printElicitationReport(runElicitationMap());
}
