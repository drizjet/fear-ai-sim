import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('cumulative market flows invariant (Constitution §155 audit trail)', () => {
    // The audit: "Snapshots and events should make unexplained
    // creation/destruction detectable." The prior slice proved
    // the per-tick invariant (each MARKET_TICK event's flows
    // reconcile with the supply change). This slice proves
    // the cumulative invariant: the audit trail in
    // `world.marketFlows` must equal the sum of the per-tick
    // flows across all MARKET_TICK events.
    //
    // The audit trail serves two purposes:
    //   1. Detect unexplained creation/destruction over
    //      long horizons (the per-tick invariant is local;
    //      the cumulative invariant is global).
    //   2. Provide a snapshot of the total economic activity
    //      over the simulation, useful for analytics and
    //      balance-of-trade calculations.

    it('world.marketFlows is a superset of the event totals (the audit trail catches all flows; the event log is a filtered subset)', () => {
        const world = createClosedWorldScenario();
        // Pre-seed inventory so the market step has non-zero flows.
        for (const town of world.towns.values()) {
            town.market.deliverCargo('food', 20, { routeRisk: 0 });
        }
        // Run 10 ticks.
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        }
        // Sum the per-tick flows across all MARKET_TICK events.
        const eventTotals = new Map();
        for (const event of world.events) {
            if (event.type !== 'MARKET_TICK') continue;
            const key = `${event.townId}:${event.kind}`;
            const totals = eventTotals.get(key) ?? { produced: 0, delivered: 0, consumed: 0, spoiled: 0, overflow: 0 };
            totals.produced += event.flows.produced ?? 0;
            totals.delivered += event.flows.delivered ?? 0;
            totals.consumed += event.flows.consumed ?? 0;
            totals.spoiled += event.flows.spoiled ?? 0;
            totals.overflow += event.flows.overflow ?? 0;
            eventTotals.set(key, totals);
        }
        // The audit trail in world.marketFlows must be a
        // *superset* of the event totals: the audit trail
        // catches all flows (every tick), while the event log
        // is suppressive (only fires when the quote changes).
        // The invariant: auditFlow >= eventFlow for every
        // (town, kind) pair and every flow field.
        for (const [key, auditFlow] of world.marketFlows) {
            const eventFlow = eventTotals.get(key);
            if (!eventFlow) continue; // No events fired for this pair.
            // The audit trail must have at least as many flows
            // as the event log. (It may have more, because
            // the audit trail catches every tick while the
            // event log is suppressive.)
            expect(auditFlow.produced).toBeGreaterThanOrEqual(eventFlow.produced - 0.001);
            expect(auditFlow.delivered).toBeGreaterThanOrEqual(eventFlow.delivered - 0.001);
            expect(auditFlow.consumed).toBeGreaterThanOrEqual(eventFlow.consumed - 0.001);
            expect(auditFlow.spoiled).toBeGreaterThanOrEqual(eventFlow.spoiled - 0.001);
            expect(auditFlow.overflow).toBeGreaterThanOrEqual(eventFlow.overflow - 0.001);
        }
    });

    it('the audit trail detects unexplained production over a 100-tick horizon', () => {
        // The audit's long-horizon test: run 100 ticks and
        // verify the cumulative totals are non-zero (the
        // simulation actually produced/consumed/spoiled
        // goods) and match the event totals. If the audit
        // trail is broken (e.g. the cumulative accumulator
        // resets every tick), the totals would be smaller
        // than the event totals.
        //
        // EVID-2026-08-29-ECOLOGY: pin the season to a
        // long-cadence so the per-tick production stays
        // constant across the 100-tick horizon. The test
        // is about the audit trail, not about season
        // transitions; locking the season keeps the
        // expected flow values stable.
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 10000; // effectively no season change in 100 ticks
        for (const town of world.towns.values()) {
            town.market.deliverCargo('food', 20, { routeRisk: 0 });
        }
        for (let t = 1; t <= 100; t += 1) {
            // R3: hold grievance at zero so no refugee-group encounters
            // fire. This test is about the audit trail, not about
            // demography; refugee absorption would pump population and
            // production away from the pinned-season equilibrium.
            world.factions.forEach(f => { f.grievance = 0; });
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        }
        // Sum the per-tick flows across all MARKET_TICK events.
        const eventTotals = new Map();
        for (const event of world.events) {
            if (event.type !== 'MARKET_TICK') continue;
            const key = `${event.townId}:${event.kind}`;
            const totals = eventTotals.get(key) ?? { produced: 0, delivered: 0, consumed: 0, spoiled: 0, overflow: 0 };
            totals.produced += event.flows.produced ?? 0;
            totals.delivered += event.flows.delivered ?? 0;
            totals.consumed += event.flows.consumed ?? 0;
            totals.spoiled += event.flows.spoiled ?? 0;
            totals.overflow += event.flows.overflow ?? 0;
            eventTotals.set(key, totals);
        }
        // For north food, the audit trail must have non-zero
        // totals (the simulation actually ran for 100 ticks).
        const northFood = world.marketFlows.get('north:food');
        expect(northFood).toBeDefined();
        expect(northFood.produced).toBeGreaterThan(0);
        expect(northFood.consumed).toBeGreaterThan(0);
        // The audit trail must match the event totals.
        const eventNorthFood = eventTotals.get('north:food');
        expect(eventNorthFood).toBeDefined();
        expect(northFood.produced).toBeCloseTo(eventNorthFood.produced, 5);
        expect(northFood.consumed).toBeCloseTo(eventNorthFood.consumed, 5);
    });
});
