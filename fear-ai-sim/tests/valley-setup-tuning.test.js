import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS,
    FRONTIER_VALLEY_SETTLEMENTS
} from '../packages/core/src/FrontierValleySimulation.js';

// R24: designer setup-stock tuning. Hardcoded stocks kept the
// migration-to-scarcity chain sub-threshold with no designer recourse
// (R23 negative finding); per-settlement population/wealth/resource
// overrides close the gap. Canonical defaults untouched.

const NW = FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH;
const RB = FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND;
const OH = FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN;

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

function blameCount(sim) {
    return sim.factionSystem
        .getBilateralStance(FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS)
        .incidents.filter((i) => i.details?.famineBlame === true).length;
}

describe('R24: tunable setup stocks drive the chain', () => {
    it('1. Canonical defaults intact without options', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        expect(sim.settlements.get(NW).population).toBe(45);
        expect(sim.settlements.get(NW).resources.food).toBe(20);
        expect(sim.settlements.get(RB).resources.food).toBe(95);
        expect(sim.settlements.get(OH).population).toBe(90);
    });

    it('2. Tuned low stocks trip the chain with no manual starving', () => {
        const sim = new FrontierValleySimulation({
            seed: 4242,
            settlements: {
                [NW]: { resources: { food: 5 } },
                [RB]: { resources: { food: 5 } },
                [OH]: { resources: { food: 5 } }
            }
        });
        expect(sim.settlements.get(NW).population).toBe(45);
        expect(sim.settlements.get(NW).resources.food).toBe(5);
        stokeWar(sim);
        sim.advance(60);
        expect(sim.macroMetrics.migrations).toBeGreaterThan(0);
        expect(blameCount(sim)).toBeGreaterThan(0);
    });

    it('3. Partial overrides preserve everything else', () => {
        const sim = new FrontierValleySimulation({
            seed: 4242,
            settlements: { [NW]: { population: 60 } }
        });
        expect(sim.settlements.get(NW).population).toBe(60);
        expect(sim.settlements.get(NW).resources.food).toBe(20);
        expect(sim.settlements.get(NW).wealth).toBe(50);
        expect(sim.settlements.get(RB).population).toBe(65);
    });

    it('4. Garbage clamps or ignores, never crashes', () => {
        const sim = new FrontierValleySimulation({
            seed: 4242,
            settlements: {
                [NW]: { population: -5, wealth: 'rich', resources: { food: NaN, timber: -3 } }
            }
        });
        expect(sim.settlements.get(NW).population).toBe(0);
        expect(sim.settlements.get(NW).wealth).toBe(50);
        expect(sim.settlements.get(NW).resources.food).toBe(20);
        expect(sim.settlements.get(NW).resources.timber).toBe(0);
    });

    it('5. Unknown settlement ids throw', () => {
        expect(() => new FrontierValleySimulation({
            seed: 4242,
            settlements: { Nope: { population: 10 } }
        })).toThrow('UNKNOWN_SETUP_SETTLEMENT');
    });

    it('6. Tuned stocks round-trip snapshots and replay', () => {
        const sim = new FrontierValleySimulation({
            seed: 4242,
            settlements: { [NW]: { resources: { food: 5 } } }
        });
        stokeWar(sim);
        sim.advance(30);
        const forked = sim.fork();
        expect(forked.settlements.get(NW).resources.food)
            .toBe(sim.settlements.get(NW).resources.food);
        const a = sim.advance(30);
        const b = forked.advance(30);
        expect(b.settlements).toEqual(a.settlements);
        const run = () => {
            const s = new FrontierValleySimulation({
                seed: 777,
                settlements: { [NW]: { resources: { food: 5 } } }
            });
            stokeWar(s);
            return s.advance(60).settlements;
        };
        expect(run()).toEqual(run());
    });
});
