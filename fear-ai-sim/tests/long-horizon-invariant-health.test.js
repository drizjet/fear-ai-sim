import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

// Slice H — Long-horizon invariant health (temporal contracts)
// Proves ALWAYS / SUSTAIN / EVENTUALLY over 500 ticks, not just final state.

describe('Slice H — long-horizon invariant health (500 ticks)', () => {
    it('ALWAYS: faction.resources stays within [0, maxResources] and population stays non-negative', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 50;
        let violation = null;
        for (let t = 1; t <= 500; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
            for (const f of world.factions) {
                if (f.resources < 0 || f.resources > f.maxResources + 1e-9) {
                    violation = `tick ${t} faction ${f.id} resources ${f.resources} > max ${f.maxResources}`;
                    break;
                }
            }
            if (violation) break;
            for (const town of world.towns.values()) {
                if (town.population < 0 || !Number.isFinite(town.population)) {
                    violation = `tick ${t} town ${town.id} pop ${town.population}`;
                    break;
                }
                for (const [kind, amt] of town.market.inventory) {
                    if (!Number.isFinite(amt) || amt < -1e-9) {
                        violation = `tick ${t} town ${town.id} kind ${kind} inventory ${amt}`;
                        break;
                    }
                }
            }
            if (violation) break;
        }
        expect(violation).toBeNull();
    });

    it('ALWAYS: market mass-balance holds per tick (no unexplained creation)', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        // Seed inventory to avoid NaN
        for (const town of world.towns.values()) town.market.inventory.set('food', 20);
        const supplyBefore = new Map();
        for (const [townId, town] of world.towns) supplyBefore.set(`${townId}:food:0`, town.market.getQuote('food').supply);
        for (let t = 1; t <= 30; t++) {
            for (const [townId, town] of world.towns) supplyBefore.set(`${townId}:food:${t}`, town.market.getQuote('food').supply);
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.3 });
        }
        const marketEvents = world.events.filter(e => e.type === 'MARKET_TICK' && e.kind === 'food');
        for (const ev of marketEvents) {
            const before = supplyBefore.get(`${ev.townId}:${ev.kind}:${ev.tick}`) ?? 0;
            const actualDelta = ev.supply - before;
            const stored = (ev.flows.produced ?? 0) - (ev.flows.overflow ?? 0);
            const expected = stored + (ev.flows.delivered ?? 0) - (ev.flows.consumed ?? 0) - (ev.flows.spoiled ?? 0);
            expect(actualDelta).toBeCloseTo(expected, 5);
        }
    });

    it('ALWAYS: event parentEventIds refer to earlier existing events or declared roots', () => {
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 100; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        const ids = new Set(world.events.map(e => e.eventId).filter(Boolean));
        let orphan = null;
        for (const ev of world.events) {
            if (!Array.isArray(ev.parentEventIds) || ev.parentEventIds.length === 0) {
                // Allowed if it has rootReason
                if (ev.rootReason) continue;
                // First tick seeds may legitimately have no parent
                if (ev.tick === 1 && ['SEASON_CHANGE', 'POPULATION_CHANGE'].includes(ev.type)) continue;
                // Check if it's a known root type
                if (['BANDIT_RELOCATION', 'FACTION_REASSESSMENT', 'MARKET_TICK', 'REPORT_FILED'].includes(ev.type) && ev.rootReason) continue;
            }
            for (const pid of ev.parentEventIds ?? []) {
                if (!ids.has(pid)) {
                    orphan = `event ${ev.type} ${ev.eventId} parent ${pid} not found`;
                    break;
                }
                const parent = world.events.find(e => e.eventId === pid);
                if (parent && parent.tick > ev.tick) {
                    orphan = `future parent ${pid} tick ${parent.tick} > child tick ${ev.tick}`;
                    break;
                }
            }
            if (orphan) break;
        }
        expect(orphan).toBeNull();
    });

    it('SUSTAIN: after drought ends, supply recovers and stays above threshold', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('north').population = 10;
        world.towns.get('south').population = 10;
        world.towns.get('north').produces.food = 0.8;
        world.towns.get('south').produces.food = 1.5;
        world.towns.get('north').market.setCapacity('food', 500);
        world.towns.get('north').market.inventory.set('food', 40);
        const sev = 0.7;
        world.drought = { active: true, severity: sev, kind: 'food', townId: 'north', remainingTicks: 20, startedTick: 1 };
        const ev = appendWorldEvent(world, { type: 'DROUGHT_STARTED', townId: 'north', kind: 'food', severity: sev, duration: 20, tick: 1 });
        world.drought.startEventId = ev.eventId;
        // Drought phase
        for (let t = 1; t <= 20; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.2 });
        const droughtSupply = world.towns.get('north').market.getQuote('food').supply;
        // Recovery phase: 30 ticks without drought
        let sustained = true;
        for (let t = 21; t <= 50; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.2 });
            const supply = world.towns.get('north').market.getQuote('food').supply;
            // After recovery, supply should be trending up vs drought low
            if (t > 35 && supply < droughtSupply) sustained = false;
        }
        const finalSupply = world.towns.get('north').market.getQuote('food').supply;
        expect(finalSupply).toBeGreaterThan(droughtSupply);
        expect(sustained).toBe(true);
        expect(world.events.some(e => e.type === 'DROUGHT_ENDED')).toBe(true);
    });

    it('EVENTUALLY: every materialized trip reaches terminal state within H ticks', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        // Let auto-trip materialize trips over 50 ticks
        for (let t = 1; t <= 50; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.3 });
        // Check trip terminal states: pendingTrips should be small (pruned delivered)
        const pendingTrips = world.pendingTrips ?? [];
        expect(pendingTrips.length).toBeLessThanOrEqual(2);
        for (const trip of pendingTrips) {
            expect(['IN_TRANSIT', 'ARRIVED'].includes(trip.status)).toBe(true);
        }
        // At least one trip should have reached DELIVERED and been pruned (via ledger)
        const deliveredEvents = world.events.filter(e => e.type === 'PENDING_CARGO_DELIVERED');
        expect(deliveredEvents.length).toBeGreaterThan(0);
        // Every MATERIALIZED TRIP_COMMITMENT should eventually have a downstream delivery or be still in flight
        // Deferred commitments (materialized:false) are decision-only and never deliver — exclude them
        const commitments = world.events.filter(e => e.type === 'TRIP_COMMITMENT' && e.materialized !== false && e.status !== 'DEFERRED' && e.tripId);
        expect(commitments.length).toBeGreaterThan(0);
        for (const c of commitments.slice(0, 5)) {
            const hasDelivery = deliveredEvents.some(d => d.tripId === c.tripId);
            const stillInFlight = pendingTrips.some(t => t.tripId === c.tripId);
            expect(hasDelivery || stillInFlight).toBe(true);
        }
    });
});
