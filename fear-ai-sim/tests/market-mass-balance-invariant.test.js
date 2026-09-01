import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('per-good mass-balance invariant (Constitution §155 strict)', () => {
    // The audit: "Snapshots and events should make unexplained
    // creation/destruction detectable." The prior
    // market-tick-flows test had a 5-unit slack that masked
    // the exact reconciliation. This test proves the strict
    // per-good invariant: for each (town, kind) pair, the
    // *per-tick* supply change must equal the sum of per-flow
    // numbers in the event for that tick.

    it('per-tick supply change reconciles exactly with the per-tick flows', () => {
        // The strict invariant: for each MARKET_TICK event,
        // the supply change from before the tick to after the
        // tick equals the sum of flows in that event.
        // This is the audit's §155 mass-balance contract at
        // the per-tick granularity.
        const world = createClosedWorldScenario();
        // Pre-seed inventory so the market step has non-zero flows.
        for (const town of world.towns.values()) {
            town.market.deliverCargo('food', 20, { routeRisk: 0 });
        }
        // Record the supply before each tick.
        const supplyBefore = new Map();
        for (const [townId, town] of world.towns) {
            for (const kind of ['food', 'tools']) {
                supplyBefore.set(`${townId}:${kind}:0`, town.market.getQuote(kind).supply);
            }
        }
        // Run 10 ticks. For each tick, record the supply after.
        for (let t = 1; t <= 10; t += 1) {
            // Record supply before the tick.
            for (const [townId, town] of world.towns) {
                for (const kind of ['food', 'tools']) {
                    supplyBefore.set(`${townId}:${kind}:${t}`, town.market.getQuote(kind).supply);
                }
            }
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        }
        // For each MARKET_TICK event, assert the per-tick
        // supply change equals the per-tick flows.
        const marketEvents = world.events.filter(ev => ev.type === 'MARKET_TICK');
        for (const event of marketEvents) {
            const key = `${event.townId}:${event.kind}:${event.tick}`;
            const before = supplyBefore.get(key) ?? 0;
            const after = event.supply;
            const actualDelta = after - before;
            // The mass-balance invariant: the actual supply
            // change equals (produced - overflow) + delivered -
            // consumed - spoiled. `produced` is the *attempted*
            // amount; `overflow` is the capacity-rejected amount;
            // so `produced - overflow` is the *stored* amount.
            // `delivered` is pending-trip cargo that arrived this
            // tick (booked into tickFlow by the §155 delivery
            // merge); without it the identity violates by exactly
            // the delivered amount on delivery ticks.
            const stored = (event.flows.produced ?? 0) - (event.flows.overflow ?? 0);
            const expectedDelta = stored
                + (event.flows.delivered ?? 0)
                - (event.flows.consumed ?? 0)
                - (event.flows.spoiled ?? 0);
            // The per-tick invariant: the actual supply change
            // must equal the per-tick flows (no slack).
            expect(actualDelta).toBeCloseTo(expectedDelta, 5);
        }
    });
});
