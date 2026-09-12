import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R29: close the exhaustion loop. A council that steps its own war
// posture down (R15) cools its grudge a rung via GOVERNANCE_STAND_DOWN,
// so the war -> famine -> erosion (R28) -> fracture chain feeds back
// into war posture. Honest limit pinned below: at canonical
// calibration raid (+0.65) plus famine-blame (+0.10) inflow dominates
// the -0.10 cooling, so fracture cools without pacifying.

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

function standDowns(sim) {
    return stance(sim).incidents.filter((i) => i.type === 'GOVERNANCE_STAND_DOWN');
}

describe('R29: fracture cools war posture live', () => {
    it('1. Starved war emits stand-downs; fed war emits none', () => {
        const starved = new FrontierValleySimulation({ seed: 4242 });
        starve(starved);
        stoke(starved);
        starved.advance(200);
        expect(standDowns(starved).length).toBeGreaterThan(0);
        const fed = new FrontierValleySimulation({ seed: 4242 });
        stoke(fed);
        fed.advance(200);
        expect(standDowns(fed).length).toBe(0);
    });

    // Calibration note: fresh tribal-consensus govs deliberate severity
    // 0.9 raids to WARN directly (nothing to step down); 1.0 reaches
    // MOBILIZE so fracture visibly steps it down. Gov grievanceLevel is
    // stateful across deliberations, so live runs step at lower severity.
    it('2. Mechanism: fractured deliberation cools exactly one rung', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.factionSystem.getFaction(S).cohesion = 0.2;
        const before = stance(sim).grievance;
        const result = sim._deliberateGovernance(S, { type: 'RAID_CONFIRMED', severity: 1.0, targetFactionId: B });
        expect(result.steppedDown).toBe(true);
        expect(stance(sim).grievance).toBeCloseTo(Math.max(0, before - 0.10), 9);
        expect(standDowns(sim).length).toBe(1);
    });

    it('3. Control: whole governments deliberate without cooling', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        const before = stance(sim).grievance;
        const result = sim._deliberateGovernance(S, { type: 'RAID_CONFIRMED', severity: 0.9, targetFactionId: B });
        expect(result.steppedDown).toBe(false);
        expect(stance(sim).grievance).toBe(before);
        expect(standDowns(sim).length).toBe(0);
    });

    it('4. Guard: fractured deliberation without a target only trails', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.factionSystem.getFaction(S).cohesion = 0.1;
        let result;
        expect(() => {
            result = sim._deliberateGovernance(S, { type: 'RAID_CONFIRMED', severity: 1.0 });
        }).not.toThrow();
        expect(result.steppedDown).toBe(true);
        expect(standDowns(sim).length).toBe(0);
        expect(sim.governanceTrail.at(-1).steppedDown).toBe(true);
    });

    it('5. Same inputs replay identical cooling', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            starve(sim);
            stoke(sim);
            sim.advance(120);
            return {
                grievance: stance(sim).grievance,
                standDowns: standDowns(sim).length,
                trail: sim.governanceTrail
            };
        };
        expect(run()).toEqual(run());
    });
});
