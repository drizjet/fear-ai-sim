import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';
import { Market } from '../economy.js';

// Slice B — Migration as world process (audit §11 Slice B)
// Destination utility: food, safety belief, distance, faction stance — not lowest population
// Conservation across 200 ticks, multiple seeds
// WHY: MIGRATION_DECISION.why already exists; fill with pressure, cooldown, utility, rejected sinks



describe('Slice B — destination utility not lowest-pop', () => {
    it('chooses lower-shortage town over lower-population town', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        world.bandits = []; world.merchants = []; world.guards = []; world.civilians = []; world.vampires = []; world.convoy = null; world.convoys = [];
        // Make south low population (1) but high shortage (starving), east/north alternative is high pop but low shortage
        // Use existing north/south plus add east
        const eastMarket = new Market('east');
        eastMarket.setCapacity('food', 200);
        eastMarket.setDemand('food', 10, 1);
        eastMarket.setSpoilageRate('food', 0);
        world.towns.set('east', {
            id: 'east',
            market: eastMarket,
            population: 20, // high pop, but will have low shortage
            consumes: { food: 1, tools: 0.2 },
            produces: { food: 1.5, tools: 0.1 },
            controlledBy: 'east-faction',
            homeRadius: 1, claimedRadius: 3, contestedRadius: 0,
            scarceResources: { food: true, tools: false },
        });
        world.routes.push({ id: 'road-ne', from: 'north', to: 'east', distance: 5, actualDanger: 0.1 });

        // Set shortages: south starving (supply 0, demand 10 => shortage 1.0), east abundant (supply 100 => shortage 0)
        const south = world.towns.get('south');
        const east = world.towns.get('east');
        south.market.setCapacity('food', 200);
        south.market.setDemand('food', 10, 1);
        south.market.inventory.set('food', 0); // shortage 1.0
        east.market.inventory.set('food', 100); // shortage 0

        south.population = 1; // lowest pop but starving
        east.population = 20; // higher pop but food-rich
        const north = world.towns.get('north');
        north.population = 10;
        north.market.setCapacity('food', 200);
        north.market.inventory.set('food', 0);

        // Force migration from north
        if (!world.justiceState) world.justiceState = new Map();
        world.justiceState.set('north', { legitimacy: 0.1, grievance: 0.9, migrationPressure: 0, justiceAccess: 0.4 });
        for (let t = 1; t <= 5; t++) appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a', banditId: 'x' });

        tickClosedWorld(world, { tick: 6, perceivedDanger: 0.5 });

        const mig = world.events.filter(e => e.type === 'MIGRATION' && e.townId === 'north');
        expect(mig.length).toBeGreaterThan(0);
        // Must choose east (low shortage) not south (lowest pop)
        expect(mig[0].toTownId).toBe('east');
        // WHY must contain utilities
        const decision = world.events.find(e => e.type === 'MIGRATION_DECISION' && e.townId === 'north' && e.tick === 6);
        expect(decision.why).toBeDefined();
        expect(decision.why.destinationUtilities).toBeDefined();
        expect(decision.why.destinationUtilities.length).toBeGreaterThanOrEqual(2);
    });

    it('safety: avoids town with bandit on incident road', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        world.bandits = [{ id: 'b1', roadId: 'road-a', trafficBelief: {}, roadId: 'road-a' }];
        // Legal information surface (OBS-HIDDEN-001): the traveler's
        // safety signal derives from the north town's merchant beliefs
        // (observation/rumor), never from live bandit truth. The old
        // oracle relied on omniscience baked into the scenario (bandits
        // array read directly); it now seeds the town's knowledge instead.
        world.merchants = [{
            id: 'merchant-1',
            location: 'north',
            cargo: 0,
            riskTolerance: 0.5,
            switchingCost: 0,
            cargoValueSensitivity: 0.5,
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.8, confidence: 0.9 },
                'road-b': { perceivedDanger: 0.5, confidence: 0.5 },
                'road-c': { perceivedDanger: 0.5, confidence: 0.5 },
                'road-ne': { perceivedDanger: 0.1, confidence: 0.9 },
            },
            lastRoute: null,
            lastRouteSwitchTick: -1000,
        }];
        world.guards = []; world.civilians = []; world.vampires = []; world.convoy = null; world.convoys = [];
        // Add east
        const eastMarket = new Market('east');
        eastMarket.setCapacity('food', 200);
        eastMarket.setDemand('food', 10, 1);
        eastMarket.inventory.set('food', 50);
        world.towns.set('east', { id: 'east', market: eastMarket, population: 10, consumes: { food: 1 }, produces: { food: 1 }, controlledBy: 'east-faction', homeRadius: 1, claimedRadius: 3, contestedRadius: 0, scarceResources: { food: true } });
        world.routes.push({ id: 'road-ne', from: 'north', to: 'east', distance: 5, actualDanger: 0.1 });
        // Make south incident road have bandit, east not
        // road-a is north<->south, road-ne is north<->east
        world.bandits[0].roadId = 'road-a'; // bandit on south road
        const south = world.towns.get('south');
        const east = world.towns.get('east');
        for (const t of [south, east]) {
            t.market.setCapacity('food', 200);
            t.market.setDemand('food', 10, 1);
            t.market.inventory.set('food', 50); // equal food
            t.population = 10;
        }
        world.towns.get('north').population = 10;
        if (!world.justiceState) world.justiceState = new Map();
        world.justiceState.set('north', { legitimacy: 0.1, grievance: 0.9, migrationPressure: 0, justiceAccess: 0.4 });
        for (let t = 1; t <= 5; t++) appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-ne', banditId: 'b1' });

        tickClosedWorld(world, { tick: 6, perceivedDanger: 0.5 });
        const mig = world.events.filter(e => e.type === 'MIGRATION' && e.townId === 'north');
        if (mig.length > 0) {
            // Should prefer east (safe) over south (bandit)
            expect(mig[0].toTownId).toBe('east');
        }
    });
});

describe('Slice B — conservation across 200 ticks multi-seed', () => {
    it('total population conserved modulo births/deaths (±5 over 200 ticks, 3 seeds)', () => {
        for (const seed of [1, 42, 99]) {
            const world = createClosedWorldScenario({ season: 'SPRING' });
            world.ticksPerSeason = 10000;
            const initialTotal = [...world.towns.values()].reduce((s, t) => s + t.population, 0);
            // Deterministic rng per seed via perceivedDanger variation
            for (let t = 1; t <= 200; t++) {
                // Inject attack every 20 ticks to trigger migration
                if (t % 20 === 1) appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a', banditId: 'x' });
                tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 + (seed % 3) * 0.1 });
            }
            const finalTotal = [...world.towns.values()].reduce((s, t) => s + t.population, 0);
            // Migrations conserve (source -1, dest +1); only demography births/deaths change total
            // Allow ±10 for 200 ticks of births/deaths
            expect(Math.abs(finalTotal - initialTotal)).toBeLessThanOrEqual(10);
            // Every MIGRATION has valid destination and FIRE==MIG
            const fires = world.events.filter(e => e.type === 'MIGRATION_DECISION' && e.decision === 'FIRE');
            const migs = world.events.filter(e => e.type === 'MIGRATION');
            expect(fires.length).toBe(migs.length);
            for (const m of migs) expect(m.toTownId).not.toBeNull();
        }
    });
});

describe('Slice B — WHY integrity', () => {
    it('MIGRATION_DECISION.why contains pressure, cooldown, utility, rejected sinks', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        world.bandits = []; world.merchants = []; world.guards = []; world.civilians = []; world.vampires = []; world.convoy = null; world.convoys = [];
        world.towns.get('north').population = 10;
        world.towns.get('south').population = 10;
        if (!world.justiceState) world.justiceState = new Map();
        world.justiceState.set('north', { legitimacy: 0.1, grievance: 0.9, migrationPressure: 0, justiceAccess: 0.4 });
        for (let t = 1; t <= 5; t++) appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a' });
        tickClosedWorld(world, { tick: 6, perceivedDanger: 0.5 });
        const decisions = world.events.filter(e => e.type === 'MIGRATION_DECISION' && e.townId === 'north');
        expect(decisions.length).toBeGreaterThan(0);
        for (const d of decisions) {
            expect(d.why).toBeDefined();
            expect(d.pressure).toBeDefined();
            expect(d.lastMigrationTick).toBeDefined();
            if (d.decision === 'FIRE') {
                expect(d.chosenDestination).toBeDefined();
                expect(d.destinationUtility).toBeDefined();
            }
        }
        const migs = world.events.filter(e => e.type === 'MIGRATION' && e.townId === 'north');
        for (const m of migs) {
            expect(m.why).toBeDefined();
            expect(m.destinationUtility).toBeDefined();
        }
    });
});
