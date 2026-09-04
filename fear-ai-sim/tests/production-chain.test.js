import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';

// E5 — production chains (ore -> metal -> tools). Tools are forged, not
// conjured: each unit of metal consumes a unit of ore, each unit of tools
// a unit of metal, from the same town market, in the same tick (topological
// kind order, no one-tick lag). Default rates match refining capacity to
// forge demand exactly, so legacy tools flows reproduce bit-for-bit until
// the ore is cut. Absent town.recipes means the legacy flat rate.

function toolsProduced(world, townId = 'north') {
    return world.events
        .filter(e => e.type === 'MARKET_TICK' && e.townId === townId && e.kind === 'tools')
        .reduce((s, e) => s + (e.flows?.produced ?? 0), 0);
}

function flowTotal(world, key, field) {
    return Number(world.marketFlows?.get(key)?.[field]) || 0;
}

function run(world, from, to) {
    for (let t = from; t <= to; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.2 });
}

describe('E5 production chain (ore -> metal -> tools)', () => {
    it('an ore blockade starves the forge: metal and tools collapse vs the control twin', () => {
        const control = createClosedWorldScenario({ season: 'SUMMER' });
        control.ticksPerSeason = 10000;
        const blockade = createClosedWorldScenario({ season: 'SUMMER' });
        blockade.ticksPerSeason = 10000;
        for (const town of blockade.towns.values()) town.produces.ore = 0;
        run(control, 1, 30);
        run(blockade, 1, 30);
        const ctrlTools = toolsProduced(control);
        const cutTools = toolsProduced(blockade);
        expect(ctrlTools).toBeGreaterThan(0);
        // The forge has no stockpile to live on (exact-balance chain):
        // cutting ore collapses tools output, not just trims it.
        expect(cutTools).toBeLessThan(ctrlTools * 0.5);
        const ctrlMetal = flowTotal(control, 'north:metal', 'produced');
        const cutMetal = flowTotal(blockade, 'north:metal', 'produced');
        expect(ctrlMetal).toBeGreaterThan(0);
        expect(cutMetal).toBeLessThan(ctrlMetal * 0.5);
    });

    it('the cascade runs same-tick: tools are forged on tick 1 from zero metal/ore stock', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        expect(world.towns.get('north').market.inventory.get('metal') ?? 0).toBe(0);
        expect(world.towns.get('north').market.inventory.get('ore') ?? 0).toBe(0);
        run(world, 1, 1);
        // A consumes-before-produce key order would forge nothing here:
        // tools are processed before ore/metal in insertion order.
        expect(toolsProduced(world)).toBeGreaterThan(0);
    });
    it('absent recipes mean the legacy flat rate (older saves behave exactly as before)', () => {
        const legacy = createClosedWorldScenario({ season: 'SUMMER' });
        legacy.ticksPerSeason = 10000;
        const modern = createClosedWorldScenario({ season: 'SUMMER' });
        modern.ticksPerSeason = 10000;
        for (const town of legacy.towns.values()) {
            delete town.recipes;
            town.produces.ore = 0;
            town.produces.metal = 0;
        }
        run(legacy, 1, 30);
        run(modern, 1, 30);
        // Audit trail, not the suppressive event log: kind iteration
        // order differs without recipes, which changes quote-change
        // suppression but must not change a single unit of flow.
        expect(flowTotal(legacy, 'north:tools', 'produced'))
            .toBeCloseTo(flowTotal(modern, 'north:tools', 'produced'), 5);
    });

    it('chain identity: ore consumed becomes metal, metal consumed becomes tools', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        run(world, 1, 30);
        // 1:1 recipes with matched rates: every unit consumed upstream
        // is a unit produced downstream, with no drift into stock.
        expect(flowTotal(world, 'north:ore', 'consumed'))
            .toBeCloseTo(flowTotal(world, 'north:metal', 'produced'), 5);
        expect(flowTotal(world, 'north:metal', 'consumed'))
            .toBeCloseTo(flowTotal(world, 'north:tools', 'produced'), 5);
        expect(world.towns.get('north').market.inventory.get('ore') ?? 0).toBeLessThan(1);
        expect(world.towns.get('north').market.inventory.get('metal') ?? 0).toBeLessThan(1);
    });

    it('merchant cargo stays food/tools: intermediates never enter the E3 kind auction', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        run(world, 1, 60);
        const commitments = world.events.filter(
            e => e.type === 'TRIP_COMMITMENT' && e.materialized !== false && e.cargo?.kind);
        expect(commitments.length).toBeGreaterThan(0);
        for (const c of commitments) {
            expect(['food', 'tools']).toContain(c.cargo.kind);
        }
    });

    it('the chain survives save/load with identical follow-up tools flow', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        run(world, 1, 10);
        const resumed = loadWorld(saveWorld(world));
        run(world, 11, 15);
        run(resumed, 11, 15);
        expect(toolsProduced(resumed)).toBeCloseTo(toolsProduced(world), 10);
        expect(flowTotal(resumed, 'north:metal', 'produced'))
            .toBeCloseTo(flowTotal(world, 'north:metal', 'produced'), 10);
    });
});
