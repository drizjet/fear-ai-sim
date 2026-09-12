import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS,
    FRONTIER_VALLEY_SETTLEMENTS
} from '../packages/core/src/FrontierValleySimulation.js';
import { INCIDENT_TYPES, FactionSystem } from '../packages/core/src/FactionSystem.js';

// R18: famine blame (CCVIII: faction leaders blame rivals). Stressed
// settler settlements convert to RUMOR_HEARSAY blame toward bandits on
// cadence: small grievance, no trust loss, no casus belli, no exhaustion.

function starve(sim) {
    for (const s of sim.settlements.values()) s.resources.food = 0;
}

function settlerView(sim) {
    return sim.factionSystem.getBilateralStance(
        FRONTIER_VALLEY_FACTIONS.SETTLERS,
        FRONTIER_VALLEY_FACTIONS.BANDITS
    );
}

function blameIncidents(sim) {
    return settlerView(sim).incidents.filter((i) =>
        i.type === INCIDENT_TYPES.RUMOR_HEARSAY && i.details?.famineBlame === true);
}

describe('R18: famine blame moves faction grievance', () => {
    it('1. Starved valley blames rivals; fed valley does not', () => {
        const starved = new FrontierValleySimulation({ seed: 818 });
        starve(starved);
        starved.advance(30);
        expect(blameIncidents(starved).length).toBeGreaterThan(0);
        const fed = new FrontierValleySimulation({ seed: 818 });
        fed.advance(30);
        expect(blameIncidents(fed).length).toBe(0);
    });

    it('2. Blame is hearsay-weight: small grievance, trust and cause untouched', () => {
        const sim = new FrontierValleySimulation({ seed: 818 });
        starve(sim);
        const before = settlerView(sim);
        const trustBefore = before.trust;
        sim.advance(10);
        const after = settlerView(sim);
        expect(blameIncidents(sim).length).toBeGreaterThan(0);
        expect(after.trust).toBe(trustBefore);
        expect(after.casusBelli).toBe(before.casusBelli);
    });

    it('3. Cadence bound: no blame before tick 10', () => {
        const sim = new FrontierValleySimulation({ seed: 818 });
        starve(sim);
        sim.advance(9);
        expect(blameIncidents(sim).length).toBe(0);
        sim.advance(1);
        expect(blameIncidents(sim).length).toBeGreaterThan(0);
    });

    it('4. Blame simmers posture: exact hearsay weight plus live wiring', () => {
        // Unit weight: one blame incident adds exactly 0.10 grievance.
        const sys = new FactionSystem();
        sys.registerFaction({ id: 'a' });
        sys.registerFaction({ id: 'b' });
        const stance = sys.getBilateralStance('b', 'a');
        stance.grievance = 0.5;
        sys.recordIncident('a', 'b', INCIDENT_TYPES.RUMOR_HEARSAY, { famineBlame: true });
        expect(stance.grievance).toBeCloseTo(0.6, 9);
        // Live wiring: starved valley carries blame fuel the fed
        // control lacks, and never sits below it (clamp saturation is
        // honest valley behavior under raid load).
        const starved = new FrontierValleySimulation({ seed: 4242 });
        starve(starved);
        starved.advance(60);
        const fed = new FrontierValleySimulation({ seed: 4242 });
        fed.advance(60);
        expect(blameIncidents(starved).length).toBeGreaterThan(0);
        expect(settlerView(starved).grievance).toBeGreaterThanOrEqual(settlerView(fed).grievance);
    });

    it('5. Same inputs replay identical blame', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            starve(sim);
            sim.advance(40);
            return blameIncidents(sim).length;
        };
        const first = run();
        expect(first).toBeGreaterThan(0);
        expect(run()).toBe(first);
    });
});
