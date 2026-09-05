import { describe, it, expect } from '@jest/globals';
import { FactionDecisionModel } from '../factioncore.js';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

// A5-F5 — faction recovery (no permanent lock).
//
// Finding: north sits at grievance 1.0 / RAID for thousands of ticks.
// Root cause (probed 2026-09-05, not guessed): the tools shortage is
// chronically 1.000 (supply 0.0 — produces.tools 0.1 cannot meet
// consumes.tools 0.2, and the food-only merchant cannot relieve it),
// so the mean shortage ~0.63 feeds flow 0.032/tick against decay 0.03
// and grievance pins at its 1.67 -> 1.0 equilibrium. That is a
// permanent STIMULUS correctly sustaining grievance (same shape as a
// never-ending drought), not a broken decay: relieve the shortage
// and the faction recovers. These detectors pin the recovery half;
// the calibration attractor (tools deficit with no trade relief) is
// documented here as breadth debt, not redesigned in this slice.

// Deterministic encounter stream (mulberry-style xorshift).
function makeRng(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5; state >>>= 0;
        return state / 0x100000000;
    };
}

describe('A5-F5 — shocked factions recover when the stimulus ends', () => {
    it('unit: grievance 1.0 with zero flows decays back to HOLD within 60 ticks', () => {
        const faction = new FactionDecisionModel({ id: 'test-faction', resources: 1, maxResources: 2 });
        faction.grievance = 1.0;
        let first = faction.reassess({});
        expect(first.decision).toBe('RAID');
        let flippedAt = -1;
        for (let t = 1; t <= 60; t++) {
            faction.advanceEmotion({ perceivedDanger: 0, supplyShortage: 0, confirmedLoss: 0, newMemoryLoss: 0 });
            const r = faction.reassess({});
            if (r.decision === 'HOLD') { flippedAt = t; break; }
        }
        // Mechanism math: score = grievance + 0.1 (milConf) + 0.015
        // (legitimacy) needs grievance < 0.435; 1.0 * 0.97^n gets
        // there in ~28 ticks. 60 is 2x margin.
        expect(flippedAt).toBeGreaterThan(0);
        expect(flippedAt).toBeLessThanOrEqual(60);
    });

    it('live: relieving the tools deficit clears the shortage and returns north to HOLD', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 100;
        world.towns.get('north').population = 100;
        world.towns.get('south').population = 100;
        const rng = makeRng(7);
        for (let t = 1; t <= 120; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng });
        }
        const north = world.factions.find(f => f.id === 'north-faction');
        // E4 equilibrium note (measured): exit drains the shock —
        // north falls 100 -> ~42 as people leave the tools famine,
        // so grievance settles ~0.6 instead of the frozen-pop 1.0.
        // The lock is the DECISION (still RAID), not the number.
        expect(north.grievance).toBeGreaterThan(0.5);
        expect(north.lastDecision).toBe('RAID');
        expect(world.towns.get('north').market.getQuote('tools').shortage).toBeCloseTo(1.0, 2);
        // Relief: fix the structural production deficit.
        world.towns.get('north').produces.tools = 1.5;
        let holdAt = -1;
        for (let t = 121; t <= 600; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng });
            if (north.lastDecision === 'HOLD') { holdAt = t; break; }
        }
        // Probed shape: shortage clears ~tick 134, HOLD follows as
        // grievance falls below the raid threshold. E13 stretches the
        // window (measured holdAt 442 at 0.02/head): tax-funded war
        // chests keep raiding affordable past the original grievance,
        // so richer factions take ~3x longer to stand down. The
        // recovery still lands; 600 keeps margin past it.
        expect(holdAt).toBeGreaterThan(0);
        expect(north.grievance).toBeLessThan(0.9);
    });
});
