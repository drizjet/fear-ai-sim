import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_SETTLEMENTS
} from '../packages/core/src/FrontierValleySimulation.js';

// R17: settlement scarcity stresses nearby groups. Food per mouth below
// threshold adds hunger-unrest dread to groups inside radius (existing
// threatPressure driver, capped at 1). Per-capita, deterministic, no RNG.

function parkGroups(sim, x, z) {
    const groups = [...sim.worldSystem.groups.values()];
    for (const g of groups) g.position = { x, y: 0, z };
    return groups;
}

function settlementAt(sim, id) {
    return sim.settlements.get(id);
}

describe('R17: scarcity unrest moves settlement fear', () => {
    it('1. Starving settlement stresses groups; stocked valley stresses none', () => {
        const sim = new FrontierValleySimulation({ seed: 31337 });
        const nw = settlementAt(sim, FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH);
        parkGroups(sim, nw.position.x, nw.position.z);
        expect(sim._applyScarcityUnrest()).toBe(0);
        nw.resources.food = 0;
        const stressed = sim._applyScarcityUnrest();
        expect(stressed).toBeGreaterThan(0);
        for (const g of sim.worldSystem.groups.values()) {
            expect(g.drivers.threatPressure).toBeGreaterThan(0);
        }
    });

    it('2. Per-capita, not absolute: sparse stocks stay calm', () => {
        const sim = new FrontierValleySimulation({ seed: 31337 });
        const nw = settlementAt(sim, FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH);
        // 10 food for 10 mouths (1.0 per mouth) is no famine.
        nw.resources.food = 10;
        nw.population = 10;
        // Other settlements abundant so only Northwatch is under test.
        for (const [id, s] of sim.settlements) {
            if (id !== nw.id) s.resources.food = 1000;
        }
        parkGroups(sim, nw.position.x, nw.position.z);
        expect(sim._applyScarcityUnrest()).toBe(0);
        // Same 10 food for 45 mouths (0.22) is famine.
        nw.population = 45;
        expect(sim._applyScarcityUnrest()).toBeGreaterThan(0);
    });

    it('3. Radius bound: distant groups feel nothing', () => {
        const sim = new FrontierValleySimulation({ seed: 31337 });
        const nw = settlementAt(sim, FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH);
        nw.resources.food = 0;
        parkGroups(sim, 99999, 99999);
        expect(sim._applyScarcityUnrest()).toBe(0);
    });

    it('4. Threshold boundary is strict: 0.25 calm, below stresses', () => {
        const sim = new FrontierValleySimulation({ seed: 31337 });
        const nw = settlementAt(sim, FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH);
        for (const [id, s] of sim.settlements) {
            if (id !== nw.id) s.resources.food = 1000;
        }
        nw.population = 100;
        nw.resources.food = 25; // exactly 0.25 per mouth
        parkGroups(sim, nw.position.x, nw.position.z);
        expect(sim._applyScarcityUnrest()).toBe(0);
        nw.resources.food = 24.9;
        expect(sim._applyScarcityUnrest()).toBeGreaterThan(0);
    });

    it('5. Dread caps at 1.0, never overflows', () => {
        const sim = new FrontierValleySimulation({ seed: 31337 });
        const nw = settlementAt(sim, FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH);
        nw.resources.food = 0;
        parkGroups(sim, nw.position.x, nw.position.z);
        for (let i = 0; i < 50; i++) sim._applyScarcityUnrest();
        for (const g of sim.worldSystem.groups.values()) {
            expect(g.drivers.threatPressure).toBeLessThanOrEqual(1.0);
        }
    });

    it('6. Live valley: starved settlement raises mean fear vs fed control', () => {
        const starved = new FrontierValleySimulation({ seed: 5150 });
        settlementAt(starved, FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH).resources.food = 0;
        settlementAt(starved, FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND).resources.food = 0;
        settlementAt(starved, FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN).resources.food = 0;
        const fed = new FrontierValleySimulation({ seed: 5150 });
        const sSummary = starved.advance(40);
        const fSummary = fed.advance(40);
        expect(sSummary.meanPopulationFear).toBeGreaterThanOrEqual(fSummary.meanPopulationFear);
        // Strictly greater somewhere: panic incidents or fear mass.
        expect(
            sSummary.panicIncidents > fSummary.panicIncidents ||
            sSummary.meanPopulationFear > fSummary.meanPopulationFear
        ).toBe(true);
    });

    it('7. Same inputs replay identical unrest', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            settlementAt(sim, FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH).resources.food = 0;
            sim.advance(25);
            return sim.getMacroSummary().meanPopulationFear;
        };
        expect(run()).toBe(run());
    });
});
