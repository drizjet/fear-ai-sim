import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R30: stand-down relief sensitivity. The R29 exhaustion loop is
// mechanically closed but quantitatively weak: sweeping relief 0 ->
// 0.30 barely moves raid-driven war trajectories (inflow dominates).
// This suite pins the knob plumbing, fork inheritance, and the
// measured insensitivity bounds so future tuning moves consciously.

const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
const B = FRONTIER_VALLEY_FACTIONS.BANDITS;

function stoke(sim) {
    sim.applySetupStance({
        source: S,
        target: B,
        patch: {
            grievance: 1, territorialPressure: 1, economicPressure: 1,
            trust: 0, fear: 0, informationConfidence: 1
        }
    });
}

function starve(sim) {
    for (const s of sim.settlements.values()) s.resources.food = 0;
}

function stance(sim) {
    return sim.factionSystem.getBilateralStance(S, B);
}

function warTicks(sim, ticks) {
    let war = 0;
    for (let t = 0; t < ticks; t++) {
        if (sim.advance(1).warsActive) war++;
    }
    return war;
}

describe('R30: exhaustion relief sensitivity', () => {
    it('1. Knob flows into cooling: custom relief lands exactly', () => {
        const sim = new FrontierValleySimulation({ seed: 4242, standDown: { relief: 0.25 } });
        sim.factionSystem.getFaction(S).cohesion = 0.2;
        const before = stance(sim).grievance;
        sim._deliberateGovernance(S, { type: 'RAID_CONFIRMED', severity: 1.0, targetFactionId: B });
        expect(stance(sim).grievance).toBeCloseTo(Math.max(0, before - 0.25), 9);
    });

    it('2. Ablation: relief 0 logs the stand-down but cools nothing', () => {
        const sim = new FrontierValleySimulation({ seed: 4242, standDown: { relief: 0 } });
        sim.factionSystem.getFaction(S).cohesion = 0.2;
        const before = stance(sim).grievance;
        const result = sim._deliberateGovernance(S, { type: 'RAID_CONFIRMED', severity: 1.0, targetFactionId: B });
        expect(result.steppedDown).toBe(true);
        expect(stance(sim).grievance).toBe(before);
        expect(stance(sim).incidents.at(-1).type).toBe('GOVERNANCE_STAND_DOWN');
    });

    it('3. Garbage relief falls back to the 0.10 rung', () => {
        const sim = new FrontierValleySimulation({ seed: 4242, standDown: { relief: NaN } });
        sim.factionSystem.getFaction(S).cohesion = 0.2;
        const before = stance(sim).grievance;
        sim._deliberateGovernance(S, { type: 'RAID_CONFIRMED', severity: 1.0, targetFactionId: B });
        expect(stance(sim).grievance).toBeCloseTo(Math.max(0, before - 0.10), 9);
    });

    it('4. Forks inherit the knob, counterfactuals can override it', () => {
        const sim = new FrontierValleySimulation({ seed: 4242, standDown: { relief: 0.25 } });
        starve(sim);
        stoke(sim);
        sim.advance(50);
        const forked = sim.fork();
        expect(forked.standDown.relief).toBe(0.25);
        forked.standDown.relief = 0;
        expect(sim.standDown.relief).toBe(0.25);
    });

    it('5. Insensitivity pin: 3x relief barely moves raid-driven wars', () => {
        // Measured seed 4242: 149/148 war ticks. Cooling exists but
        // cannot pacify raid-driven wars. Tight bound forces conscious
        // retuning. Pinned across seeds, not one lucky trajectory.
        for (const seed of [4242, 7, 1234]) {
            const run = (relief) => {
                const sim = new FrontierValleySimulation({ seed, standDown: { relief } });
                starve(sim);
                stoke(sim);
                const war = warTicks(sim, 400);
                return { war, grievance: stance(sim).grievance };
            };
            const none = run(0);
            const triple = run(0.30);
            expect(Math.abs(none.war - triple.war)).toBeLessThanOrEqual(8);
            expect(triple.grievance).toBeLessThanOrEqual(none.grievance);
        }
    });
});
