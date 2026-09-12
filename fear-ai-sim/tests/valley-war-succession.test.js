import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R19: war attrition. Consecutive SKIRMISH/ATTACK ticks accumulate; at
// threshold the weaker side loses its leader (DEATH_IN_BATTLE):
// SuccessionEngine resolves deterministic candidates and applySuccession
// lands cohesion/morale/successor/splinter-risk/policy-shift advisories.
// One succession per hot episode; cold ticks reset and re-arm.

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

function bilateral(sim) {
    return sim.factionSystem.getBilateralStance(
        FRONTIER_VALLEY_FACTIONS.SETTLERS,
        FRONTIER_VALLEY_FACTIONS.BANDITS
    );
}

describe('R19: war attrition lands succession state', () => {
    it('1. Cold bilateral never attrites: counter resets, nothing fires', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.advance(10);
        bilateral(sim).stage = 'OBSERVE';
        expect(sim._attriteLeadership()).toBe(false);
        expect(sim.attrition.hotTicks).toBe(0);
        expect(sim.attrition.rearmed).toBe(true);
        expect(sim.macroMetrics.successions || 0).toBe(0);
    });

    it('2. Threshold not reached: 20 hot ticks, no succession', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(20);
        expect(sim.macroMetrics.successions || 0).toBe(0);
    });

    it('3. Stoked war resolves exactly one succession with landed state', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(120);
        expect(sim.macroMetrics.successions).toBe(1);
        // Weaker side (bandits 0.55 < settlers 0.70) lost its leader.
        const bandits = sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS);
        expect(bandits.leaderId).toBe(`${FRONTIER_VALLEY_FACTIONS.BANDITS}.heir`);
        expect(bandits.splinterRisk).toBeGreaterThan(0);
        expect(bandits.lastPolicyShift).toBeGreaterThan(0);
    });

    it('4. One shot per episode: hot ticks after firing do not re-fire', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(60);
        expect(sim.macroMetrics.successions).toBe(1);
        // Force hot and grind: rearmed is false, nothing more fires.
        for (let i = 0; i < 40; i++) {
            bilateral(sim).stage = 'ATTACK';
            sim._attriteLeadership();
        }
        expect(sim.macroMetrics.successions).toBe(1);
        // A cold tick re-arms; the next hot episode fires again.
        bilateral(sim).stage = 'OBSERVE';
        sim._attriteLeadership();
        expect(sim.attrition.rearmed).toBe(true);
        bilateral(sim).stage = 'ATTACK';
        for (let i = 0; i < 25; i++) sim._attriteLeadership();
        expect(sim.macroMetrics.successions).toBe(2);
    });

    it('5. Fork preserves attrition: snapshot round-trips episode state', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(60);
        const forked = sim.fork();
        expect(forked.attrition).toEqual(sim.attrition);
        expect(forked.macroMetrics.successions).toBe(sim.macroMetrics.successions);
        const a = sim.advance(60);
        const b = forked.advance(60);
        expect(b.settlements).toEqual(a.settlements);
        expect(forked.macroMetrics.successions).toBe(sim.macroMetrics.successions);
    });

    it('6. Same inputs replay identical succession', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            stokeWar(sim);
            sim.advance(120);
            return {
                successions: sim.macroMetrics.successions,
                leader: sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS).leaderId
            };
        };
        expect(run()).toEqual(run());
    });
});
