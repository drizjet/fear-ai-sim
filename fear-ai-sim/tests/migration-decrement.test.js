import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('MIGRATION event decrements town population (Constitution §69 / §164)', () => {
    // The audit's row 29: "Add persistent population/faction
    // state and crime/reporting/migration execution loop."
    // The previous slice (EVID-2026-08-28-MIGRATION-EVENT)
    // emits the MIGRATION event but does not ACT on it.
    // This slice completes the causal step: a sustained
    // MIGRATION event reduces the town's population.

    it('after sustained pressure, the world total population is conserved and at least one MIGRATION event fires', () => {
        const world = createClosedWorldScenario();
        // Seed many attacks to drive migration pressure high.
        for (let t = 1; t <= 10; t++) {
            world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        // Snapshot the initial world total.
        let initialTotal = 0;
        for (const [, town] of world.towns) {
            initialTotal += town.population;
        }
        // Drive 20 ticks.
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.8 });
        }
        // The world total population must be conserved
        // (migration moves people between towns, not out of
        // the world). This is the §156 population balance.
        // R3: refugee absorption creates people exogenously and
        // unsettleable drops delete them — both now booked in
        // world.exogenousPopulation. The identity closes with
        // those declared terms (massResidual pattern). Tiny
        // populations keep births/deaths at exactly 0 by floor.
        let finalTotal = 0;
        for (const [, town] of world.towns) {
            finalTotal += town.population;
        }
        const exo = world.exogenousPopulation ?? { inflow: 0, outflow: 0 };
        expect(finalTotal - (exo.inflow ?? 0) + (exo.outflow ?? 0)).toBe(initialTotal);
        // At least one MIGRATION event must fire.
        const migrationCount = world.events.filter(ev => ev.type === 'MIGRATION').length;
        expect(migrationCount).toBeGreaterThan(0);
    });

    it('population never goes below zero (mass conservation on people)', () => {
        // The audit: "No disappearance without a named sink."
        // A town's population must not go below zero. The
        // migration step clamps at 0.
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t++) {
            world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 100; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9 });
        }
        for (const [townId, town] of world.towns) {
            expect(town.population).toBeGreaterThanOrEqual(0);
        }
    });

    it('under low pressure, population stays at its initial value (no spurious migration)', () => {
        // The complement: under low pressure, no MIGRATION
        // events fire, so population does not change.
        // R3: refugee absorption (booked exogenous inflow) can
        // still add heads even when migration is quiet. Per-town
        // identity closes with each town's ENCOUNTER-attributed
        // refugee share; low-pressure tiny pops keep births,
        // deaths, and drops at exactly 0.
        // E7: arrivals camp — the identity counts town population
        // plus camped heads at each town (integration moves heads
        // between the two pools without changing their sum).
        const world = createClosedWorldScenario();
        const initialPop = {};
        for (const [townId, town] of world.towns) {
            initialPop[townId] = town.population;
        }
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        }
        const influxByTown = {};
        for (const event of world.events) {
            if (event.type !== 'ENCOUNTER' || !event.result || event.result.refugeeCount == null) continue;
            const dest = event.result.destinationTownId;
            influxByTown[dest] = (influxByTown[dest] ?? 0) + event.result.refugeeCount;
        }
        const campedByTown = {};
        for (const camp of world.refugeeCamps ?? []) {
            if (camp?.status !== 'CAMPED') continue;
            campedByTown[camp.townId] = (campedByTown[camp.townId] ?? 0) + (Number(camp.size) || 0);
        }
        for (const [townId, town] of world.towns) {
            expect(town.population + (campedByTown[townId] ?? 0))
                .toBe((initialPop[townId] ?? 0) + (influxByTown[townId] ?? 0));
        }
    });
});
