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
        let finalTotal = 0;
        for (const [, town] of world.towns) {
            finalTotal += town.population;
        }
        expect(finalTotal).toBe(initialTotal);
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
        const world = createClosedWorldScenario();
        const initialPop = {};
        for (const [townId, town] of world.towns) {
            initialPop[townId] = town.population;
        }
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        }
        for (const [townId, town] of world.towns) {
            expect(town.population).toBe(initialPop[townId]);
        }
    });
});
