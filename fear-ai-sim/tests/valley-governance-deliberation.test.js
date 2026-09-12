import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R20: valley governments deliberate live incidents through live faction
// state. Settlers/nomads deliberate by council, the bandit warlord rules
// alone: cohesion collapse steps bandit directives down (R15 fracture),
// and a fallen throne with no heir falls to OBSERVE until succession.

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

function banditEntries(sim) {
    return sim.governanceTrail.filter((e) => e.factionId === FRONTIER_VALLEY_FACTIONS.BANDITS);
}

describe('R20: valley governments deliberate live faction state', () => {
    it('1. Raids deliberate: trail records shaped advisory entries', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        expect(sim.governanceTrail).toEqual([]);
        stokeWar(sim);
        sim.advance(120);
        expect(sim.governanceTrail.length).toBeGreaterThan(0);
        // Counter counts every deliberation; the trail keeps the last 100.
        expect(sim.macroMetrics.governanceDeliberations).toBeGreaterThanOrEqual(sim.governanceTrail.length);
        for (const e of sim.governanceTrail) {
            expect(typeof e.tick).toBe('number');
            expect(typeof e.factionId).toBe('string');
            expect(typeof e.directive).toBe('string');
            expect(typeof e.rationale).toBe('string');
            expect(typeof e.fractured).toBe('boolean');
        }
    });

    it('2. Early war deliberates whole: no fracture before cohesion collapses', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(100);
        expect(sim.governanceTrail.length).toBeGreaterThan(0);
        expect(sim.macroMetrics.governanceFractures || 0).toBe(0);
    });

    it('3. Long war fractures the warlord: directives step down', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(1500);
        const fractured = banditEntries(sim).filter((e) => e.fractured);
        expect(fractured.length).toBeGreaterThan(0);
        // Stepped-down directives only: no ATTACK commits from a
        // fractured throne in the retained window.
        for (const e of fractured) {
            expect(['MOBILIZE', 'WARN', 'OBSERVE', 'RETREAT']).toContain(e.directive);
        }
        const bandits = sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS);
        expect(bandits.cohesion).toBeLessThanOrEqual(0.35);
    });

    it('4. Fallen throne with no heir falls to OBSERVE until succession', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        const bandits = sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS);
        bandits.leaderId = null;
        const result = sim._deliberateGovernance(FRONTIER_VALLEY_FACTIONS.BANDITS, {
            type: 'SKIRMISH_CASUALTY', severity: 0.8, targetFactionId: FRONTIER_VALLEY_FACTIONS.SETTLERS
        });
        expect(result.directive).toBe('OBSERVE');
        expect(result.rationale).toContain('Headless autocracy');
        // Succession enthrones the heir: the throne speaks again.
        bandits.leaderId = `${FRONTIER_VALLEY_FACTIONS.BANDITS}.heir`;
        const after = sim._deliberateGovernance(FRONTIER_VALLEY_FACTIONS.BANDITS, {
            type: 'SKIRMISH_CASUALTY', severity: 0.8, targetFactionId: FRONTIER_VALLEY_FACTIONS.SETTLERS
        });
        expect(after.directive).not.toBe('OBSERVE');
    });

    it('5. Wildlife hunger deliberates nothing: no government, null trail effect', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        const before = sim.governanceTrail.length;
        expect(sim._deliberateGovernance(FRONTIER_VALLEY_FACTIONS.WILDLIFE, {
            type: 'RAID_CONFIRMED', severity: 0.9, targetFactionId: FRONTIER_VALLEY_FACTIONS.SETTLERS
        })).toBeNull();
        expect(sim.governanceTrail.length).toBe(before);
    });

    it('6. Fork preserves governments and trail; replay identical', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(120);
        const forked = sim.fork();
        expect(forked.governanceTrail).toEqual(sim.governanceTrail);
        const a = sim.advance(60);
        const b = forked.advance(60);
        expect(b.settlements).toEqual(a.settlements);
        expect(forked.governanceTrail).toEqual(sim.governanceTrail);
        const run = () => {
            const s = new FrontierValleySimulation({ seed: 777 });
            stokeWar(s);
            s.advance(120);
            return s.governanceTrail;
        };
        expect(run()).toEqual(run());
    });
});
