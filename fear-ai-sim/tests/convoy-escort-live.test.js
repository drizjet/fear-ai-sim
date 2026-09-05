import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';

// E11 live chain: risky beliefs → paid escort → protected travel →
// ambush/heat/beliefs → later decisions. Plus the matched safe
// control that hires nothing.

function riskyWorld() {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    const merchant = world.merchants[0];
    merchant.cargo = 20;
    merchant.cargoKind = 'food';
    merchant.capital = 100;
    merchant.routeBeliefs['road-a'] = { perceivedDanger: 0.9, confidence: 0.9 };
    merchant.routeBeliefs['road-b'] = { perceivedDanger: 1, confidence: 0.9 };
    merchant.routeBeliefs['road-c'] = { perceivedDanger: 1, confidence: 0.9 };
    world.bandits[0].roadId = 'road-a';
    world.bandits[0]._lastRelocationTick = 0;
    world.bandits[0].relocationCooldownTicks = 10000;
    return world;
}

function runTicks(world, from, to) {
    for (let t = from; t <= to; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, encounterRng: () => 0.999 });
    }
}

describe('E11 live escort chain', () => {
    it('risky beliefs hire a paid escort on a real trip', () => {
        const world = riskyWorld();
        runTicks(world, 1, 6);
        const hires = world.events.filter(e =>
            e.type === 'CONVOY_DECISION' && e.decision === 'HIRE');
        expect(hires.length).toBeGreaterThan(0);
        expect(hires[0].escortCost).toBe(5);
        expect(hires[0].chosenEscortIds).toEqual(['guard-1']);
        const formed = world.events.filter(e =>
            e.type === 'CONVOY_FORMED' && (e.escortIds ?? []).length > 0);
        expect(formed.length).toBeGreaterThan(0);
    });

    it('F: every escort fee debits merchant capital exactly once', () => {
        const world = riskyWorld();
        runTicks(world, 1, 10);
        const formed = world.events.filter(e =>
            e.type === 'CONVOY_FORMED' && (e.escortIds ?? []).length > 0);
        expect(formed.length).toBeGreaterThan(0);
        for (const f of formed) expect(f.escortCost).toBe(5);
        const feeTotal = formed.reduce((s, e) => s + (e.escortCost ?? 0), 0);
        // Full capital walk: every booked delta is audited on events
        // (capitalDelta, including convoy hits); each formation fee
        // is the only unaudited booking, so it falls out exactly —
        // no double-charge, no free escort.
        let audited = 0;
        for (const e of world.events) {
            if (typeof e.capitalDelta === 'number') audited += e.capitalDelta;
        }
        expect(world.merchants[0].capital).toBeCloseTo(100 + audited - feeTotal, 8);
    });

    it('G: save/load never double-charges the escort fee', () => {
        const world = riskyWorld();
        runTicks(world, 1, 4);
        const resumed = loadWorld(saveWorld(world));
        runTicks(world, 5, 10);
        runTicks(resumed, 5, 10);
        const fees = w => w.events
            .filter(e => e.type === 'CONVOY_FORMED' && (e.escortIds ?? []).length > 0)
            .reduce((s, e) => s + (e.escortCost ?? 0), 0);
        expect(fees(resumed)).toBe(fees(world));
        expect(resumed.merchants[0].capital).toBeCloseTo(world.merchants[0].capital, 8);
    });

    it('I: a convoy ambush marks bandit heat through the live pass', () => {
        const world = riskyWorld();
        runTicks(world, 1, 12);
        const ambushes = world.events.filter(e =>
            e.type === 'CONVOY_AMBUSH' && e.derived !== true);
        expect(ambushes.length).toBeGreaterThan(0);
        expect(world.bandits[0].heat).toBeGreaterThan(0);
    });

    it('safe beliefs never hire under matched live conditions', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        const merchant = world.merchants[0];
        merchant.cargo = 20;
        merchant.capital = 100;
        for (const road of ['road-a', 'road-b', 'road-c']) {
            merchant.routeBeliefs[road] = { perceivedDanger: 0.05, confidence: 0.9 };
        }
        runTicks(world, 1, 10);
        const hires = world.events.filter(e =>
            e.type === 'CONVOY_DECISION' && e.decision === 'HIRE');
        expect(hires.length).toBe(0);
        expect(world.merchants[0].capital).toBeGreaterThanOrEqual(100);
    });
});
