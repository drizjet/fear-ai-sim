import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R31: contest-scaled raid fuel. RAID_CONFIRMED honors details.severity
// (default 1, legacy-exact); the valley passes the bandit's strength
// share through the shared casualty map (NEXT-55 precedent: fuel scales
// with the inflicter's share). Overmatching raids fuel fully (salient
// atrocity); raids broken on strong escorts fuel at the floor.
// Affective fuel scales; territorial/economic pressures are facts.

const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
const B = FRONTIER_VALLEY_FACTIONS.BANDITS;

function plantDuel(sim, victimStr, banditStr) {
    sim.worldSystem.groups.set('t-settler', {
        id: 't-settler',
        factionId: S,
        militaryStrength: victimStr,
        drivers: { threatPressure: 0 },
        position: { x: 0, y: 0, z: 0 }
    });
    sim.worldSystem.groups.set('t-bandit', {
        id: 't-bandit',
        factionId: B,
        militaryStrength: banditStr,
        drivers: { threatPressure: 0 },
        position: { x: 1, y: 0, z: 0 }
    });
    return {
        partyAId: 't-bandit',
        partyBId: 't-settler',
        encounterId: 't-enc',
        encounterType: 'AMBUSH_INTERCEPTION',
        advisoryResolution: 'COMBAT_ENGAGEMENT'
    };
}

function settlerView(sim) {
    return sim.factionSystem.getBilateralStance(S, B);
}

// Valley setup starts settlers at grievance 0.80 toward bandits; zero the
// affective stance before each duel so pins measure the raid fuel exactly.
function zeroAffect(sim) {
    const st = settlerView(sim);
    st.grievance = 0;
    st.fear = 0;
    st.trust = 0.5;
}
describe('R31: raid fuel scales with contest', () => {
    it('1. Parity raid fuels fully (legacy 0.65)', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        zeroAffect(sim);
        sim._recordEncounterConsequences([plantDuel(sim, 0.5, 0.5)]);
        expect(settlerView(sim).grievance).toBeCloseTo(0.65, 9);
    });

    it('2. Overmatching raid fuels fully (atrocity salient)', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        zeroAffect(sim);
        sim._recordEncounterConsequences([plantDuel(sim, 0.1, 0.9)]);
        expect(settlerView(sim).grievance).toBeCloseTo(0.65, 9);
    });

    it('3. Raid broken on strong escorts fuels at the floor map', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        zeroAffect(sim);
        sim._recordEncounterConsequences([plantDuel(sim, 0.8, 0.2)]);
        // Bandit share 0.2 -> 0.25 + 0.75 * (0.2/0.5) = 0.55 -> 0.3575.
        expect(settlerView(sim).grievance).toBeCloseTo(0.65 * 0.55, 9);
    });

    it('4. Facts stay unscaled while affect scales', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        zeroAffect(sim);
        sim._recordEncounterConsequences([plantDuel(sim, 0.8, 0.2)]);
        const facts = settlerView(sim);
        expect(facts.territorialPressure).toBeCloseTo(0.35, 9);
        expect(facts.economicPressure).toBeCloseTo(0.25, 9);
        expect(facts.casusBelli).toBe('Lethal border raid on assets');
    });

    it('5. Fear and trust scale with the same severity', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        zeroAffect(sim);
        sim._recordEncounterConsequences([plantDuel(sim, 0.8, 0.2)]);
        const st = settlerView(sim);
        expect(st.fear).toBeCloseTo(0.40 * 0.55, 9);
        // Trust reset to 0.5 so the scaled loss is exact.
        expect(st.trust).toBeCloseTo(0.5 - 0.50 * 0.55, 9);
    });
});
