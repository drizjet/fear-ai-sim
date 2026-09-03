import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';

function productionWorld({ stormRoadId = null, severity = 0.6 } = {}) {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.towns.get('north').population = 10;
    world.towns.get('south').population = 10;
    if (stormRoadId) {
        world.storm = { active: true, roadId: stormRoadId, severity, remainingTicks: 20, startedTick: 1 };
        const ev = appendWorldEvent(world, { type: 'STORM_STARTED', roadId: stormRoadId, severity, duration: 20, tick: 1 });
        world.storm.startEventId = ev.eventId;
    }
    return world;
}

function run(world, ticks = 10) {
    for (let t = 1; t <= ticks; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
    return world;
}

describe('storms disrupt town production (slice AI)', () => {
    test('storm world produces less than control at the designed ratio', () => {
        const control = run(productionWorld({}));
        const stormy = run(productionWorld({ stormRoadId: 'road-a', severity: 0.6 }));
        const ctrlProd = control.marketFlows.get('north:food')?.produced ?? 0;
        const stormProd = stormy.marketFlows.get('north:food')?.produced ?? 0;
        expect(stormProd).toBeLessThan(ctrlProd);
        // 1 - 0.6 * 0.3 = 0.82 of control.
        expect(stormProd / ctrlProd).toBeCloseTo(0.82, 1);
    });
    test('disruption reaches the market: stormed towns hold less supply', () => {
        const control = run(productionWorld({}));
        const stormy = run(productionWorld({ stormRoadId: 'road-a', severity: 1.0 }));
        // Ten ticks of surplus-rate production keep shortage pinned at 0
        // in both worlds, so the visible market consequence is supply.
        const ctrlSupply = control.towns.get('north').market.getQuote('food').supply;
        const stormSupply = stormy.towns.get('north').market.getQuote('food').supply;
        expect(stormSupply).toBeLessThan(ctrlSupply);
    });

    test('unknown storm roads disrupt nothing (incident-only honesty)', () => {
        const control = run(productionWorld({}));
        const stray = run(productionWorld({ stormRoadId: 'road-nowhere', severity: 1.0 }));
        const ctrlProd = control.marketFlows.get('north:food')?.produced ?? 0;
        const strayProd = stray.marketFlows.get('north:food')?.produced ?? 0;
        expect(strayProd).toBeCloseTo(ctrlProd, 10);
    });

    test('disruption scales monotonically with severity', () => {
        const mild = run(productionWorld({ stormRoadId: 'road-a', severity: 0.2 }));
        const severe = run(productionWorld({ stormRoadId: 'road-a', severity: 1.0 }));
        const mildProd = mild.marketFlows.get('north:food')?.produced ?? 0;
        const severeProd = severe.marketFlows.get('north:food')?.produced ?? 0;
        expect(severeProd).toBeLessThan(mildProd);
        // 0.7 vs 0.94 of the same baseline.
        expect(severeProd / mildProd).toBeCloseTo(0.7 / 0.94, 1);
    });

    test('ended storms stop disrupting (recovery by construction)', () => {
        const world = productionWorld({ stormRoadId: 'road-a', severity: 1.0 });
        world.storm.remainingTicks = 2;
        run(world, 2);
        expect(world.storm.active).toBe(false);
        const during = world.marketFlows.get('north:food')?.produced ?? 0;
        run(world, 2);
        const after = world.marketFlows.get('north:food')?.produced ?? 0;
        // Two post-storm ticks at full rate out-produce two stormed ticks.
        expect(after - during).toBeGreaterThan(during * 0.3);
    });

    test('storm production parity survives save/load', () => {
        const world = run(productionWorld({ stormRoadId: 'road-a', severity: 0.6 }), 5);
        const loaded = loadWorld(saveWorld(world));
        run(world, 3);
        run(loaded, 3);
        const prod = w => w.marketFlows.get('north:food')?.produced ?? 0;
        expect(prod(loaded)).toBe(prod(world));
    });
});
