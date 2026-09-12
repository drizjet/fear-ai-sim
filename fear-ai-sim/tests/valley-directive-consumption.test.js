import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R21: deliberated directives are consumed, not just recorded. Casualty
// fuel scales by the inflicter's governance composure: whole governments
// fight at full strength, split councils at half, headless autocracies
// at a quarter. A kill-switch preserves legacy behavior for ablation.

function plantDuel(sim) {
    sim.worldSystem.groups.set('t-bandit', {
        id: 't-bandit',
        factionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
        militaryStrength: 0.5,
        drivers: { threatPressure: 0 },
        position: { x: 0, y: 0, z: 0 }
    });
    sim.worldSystem.groups.set('t-settler', {
        id: 't-settler',
        factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
        militaryStrength: 0.5,
        drivers: { threatPressure: 0 },
        position: { x: 0, y: 0, z: 0 }
    });
    return {
        partyAId: 't-bandit',
        partyBId: 't-settler',
        encounterId: 't-enc',
        encounterType: 'AMBUSH_INTERCEPTION',
        advisoryResolution: 'COMBAT_ENGAGEMENT'
    };
}

function banditView(sim) {
    return sim.factionSystem.getBilateralStance(
        FRONTIER_VALLEY_FACTIONS.BANDITS,
        FRONTIER_VALLEY_FACTIONS.SETTLERS
    );
}

function stokeWar(sim) {
    sim.applySetupStance({
        source: FRONTIER_VALLEY_FACTIONS.SETTLERS,
        target: FRONTIER_VALLEY_FACTIONS.BANDITS,
        patch: {
            grievance: 1, territorialPressure: 1, economicPressure: 1,
            trust: 0, fear: 0, informationConfidence: 1
        }
    });
}

describe('R21: fractured conviction damps casualty fuel', () => {
    it('1. Composure reads live faction state: whole 1, split 0.5, headless 0.25', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        expect(sim._composureScale(FRONTIER_VALLEY_FACTIONS.BANDITS)).toBe(1.0);
        const bandits = sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS);
        bandits.cohesion = 0.2;
        expect(sim._composureScale(FRONTIER_VALLEY_FACTIONS.BANDITS)).toBe(0.5);
        bandits.cohesion = 0.7;
        bandits.leaderId = null;
        expect(sim._composureScale(FRONTIER_VALLEY_FACTIONS.BANDITS)).toBe(0.25);
        // No government (wildlife) and garbage read whole, never NaN.
        expect(sim._composureScale(FRONTIER_VALLEY_FACTIONS.WILDLIFE)).toBe(1.0);
        expect(sim._composureScale('nope')).toBe(1.0);
    });

    it('2. Kill-switch forces full conviction under fracture', () => {
        const sim = new FrontierValleySimulation({ seed: 4242, directiveConsumption: false });
        const bandits = sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS);
        bandits.cohesion = 0.1;
        bandits.leaderId = null;
        expect(sim._composureScale(FRONTIER_VALLEY_FACTIONS.BANDITS)).toBe(1.0);
    });

    it('3. Synthetic raid: fractured victims fight back at exactly half fuel', () => {
        const whole = new FrontierValleySimulation({ seed: 4242 });
        const encW = plantDuel(whole);
        whole._recordEncounterConsequences([encW]);
        const wholeFuel = banditView(whole).grievance;
        expect(wholeFuel).toBeGreaterThan(0);
        const split = new FrontierValleySimulation({ seed: 4242 });
        simFractureSettlers(split);
        const encS = plantDuel(split);
        split._recordEncounterConsequences([encS]);
        const splitFuel = banditView(split).grievance;
        expect(splitFuel).toBeCloseTo(wholeFuel * 0.5, 9);
    });

    it('4. Whole early war is untouched: consumption on matches off', () => {
        const on = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(on);
        const off = new FrontierValleySimulation({ seed: 4242, directiveConsumption: false });
        stokeWar(off);
        const a = on.advance(100);
        const b = off.advance(100);
        expect(a).toEqual(b);
    });

    it('5. Long war damps fuel monotonically: on never exceeds off', () => {
        const on = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(on);
        on.advance(1500);
        const off = new FrontierValleySimulation({ seed: 4242, directiveConsumption: false });
        stokeWar(off);
        off.advance(1500);
        const grievOn = on.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS
        ).grievance;
        const grievOff = off.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS
        ).grievance;
        expect(grievOn).toBeLessThanOrEqual(grievOff);
    });

    it('6. Switch survives fork; replay identical either way', () => {
        const sim = new FrontierValleySimulation({ seed: 4242, directiveConsumption: false });
        stokeWar(sim);
        sim.advance(60);
        const forked = sim.fork();
        expect(forked.directiveConsumption).toBe(false);
        const a = sim.advance(60);
        const b = forked.advance(60);
        expect(b.settlements).toEqual(a.settlements);
        const run = (flag) => {
            const s = new FrontierValleySimulation({ seed: 777, directiveConsumption: flag });
            stokeWar(s);
            return s.advance(120);
        };
        expect(run(true)).toEqual(run(true));
        expect(run(false)).toEqual(run(false));
    });
});

function simFractureSettlers(sim) {
    sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.SETTLERS).cohesion = 0.2;
}
