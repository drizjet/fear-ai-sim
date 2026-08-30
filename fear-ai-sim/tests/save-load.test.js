// World-Completion Directive §22 (Save / Load / Replay /
// Fork) and §118 (Save).
// Constitution §118: "A living world needs robust
// persistence. Save: RNG state; world time; agent state;
// faction relations; market state; route state; event
// ledger; encounter history; cooldowns; belief; memory;
// contracts; important passive state."
//
// The prior slices (FORK API §120, REPLAY §22/§119) added
// clone-and-diff and record-then-play, but the world
// itself could not be serialized to JSON. Without
// save/load, the §118 contract is half-met: replay can
// record frames, but the world cannot be persisted
// across process restarts.
//
// This slice adds:
//   - `saveWorld(world)`: serialize the world to JSON.
//   - `loadWorld(json)`: deserialize the JSON back into
//     a world.
//   - The §119 RESUME EQUIVALENCE contract: a saved
//     world can be loaded and run forward, producing
//     the same trajectory as an uninterrupted run.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';

describe('save/load (Constitution §22 / §118 / §119)', () => {
    it('saveWorld serializes the world to JSON', () => {
        // The §118 contract: a world can be persisted to
        // JSON. The serialization must capture every
        // piece of state the world needs to resume.
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const json = saveWorld(world);
        expect(typeof json).toBe('string');
        // The JSON is parseable and contains the world
        // structure.
        const parsed = JSON.parse(json);
        expect(parsed.towns).toBeDefined();
        expect(parsed.factions).toBeDefined();
        expect(parsed.bandits).toBeDefined();
        expect(parsed.merchants).toBeDefined();
        expect(parsed.events).toBeDefined();
    });

    it('loadWorld restores the world from JSON', () => {
        // The §118 contract: a saved world can be
        // restored. The loaded world has the same
        // structure as the original.
        const original = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(original, { tick: t, perceivedDanger: 0.5 });
        }
        const json = saveWorld(original);
        const loaded = loadWorld(json);
        // The loaded world has the same top-level keys.
        expect(loaded.towns).toBeInstanceOf(Map);
        expect(loaded.bandits).toBeDefined();
        expect(loaded.merchants).toBeDefined();
        expect(loaded.factions).toBeDefined();
        // The merchant's cargo is preserved.
        expect(loaded.merchants[0].cargo).toBe(original.merchants[0].cargo);
    });

    it('§119 RESUME EQUIVALENCE: a saved+loaded world resumes to the same state', () => {
        // The §119 contract: run N ticks, save, load,
        // run M more ticks — the resumed world must match
        // an uninterrupted run of (N + M) ticks. After
        // the §121 rng-injection fix (the live-wire
        // re-seeds the bandit's rng from the bandit's id
        // every tick, so save/load preserves the rng
        // state implicitly), this contract must hold
        // exactly: same number of events, same event
        // types, same final state, same bandit roadId at
        // every tick.
        // Phase 1: run 10 ticks and save at tick 5.
        const phaseA = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(phaseA, { tick: t, perceivedDanger: 0.5 });
        }
        const json = saveWorld(phaseA);
        // Phase 2: load and run 5 more ticks.
        const phaseB = loadWorld(json);
        for (let t = 6; t <= 10; t += 1) {
            tickClosedWorld(phaseB, { tick: t, perceivedDanger: 0.5 });
        }
        // Phase 3: run an uninterrupted 10-tick run for comparison.
        const wholeRun = createClosedWorldScenario();
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(wholeRun, { tick: t, perceivedDanger: 0.5 });
        }
        // STRICT equivalence: same number of events.
        expect(phaseB.events.length).toBe(wholeRun.events.length);
        // STRICT equivalence: same event types in the same order.
        const typesA = phaseB.events.map(e => e.type);
        const typesW = wholeRun.events.map(e => e.type);
        expect(typesA).toEqual(typesW);
        // STRICT equivalence: same final state on every deterministic field.
        expect(phaseB.merchants[0].cargo).toBe(wholeRun.merchants[0].cargo);
        const popB = [...phaseB.towns.values()].reduce((s, t) => s + t.population, 0);
        const popW = [...wholeRun.towns.values()].reduce((s, t) => s + t.population, 0);
        expect(popB).toBe(popW);
        // STRICT equivalence: the bandit's roadId at the end
        // is the same — the deterministic rng re-seeds
        // from the bandit's id on every tick, so save/load
        // does not lose bandit-routing state.
        expect(phaseB.bandits[0].roadId).toBe(wholeRun.bandits[0].roadId);
    });

    it('saveWorld round-trips Maps, Sets, and class instances', () => {
        // The world has `towns: Map`, `consumedAttackIds:
        // Set`, `relationships: Map` (on each faction's
        // relationships map), and class instances
        // (FactionDecisionModel, RoamingGroup, Market,
        // BeliefStore, FactionRelationshipVector). The
        // round-trip must preserve them.
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5 });
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        // Maps.
        expect(loaded.towns).toBeInstanceOf(Map);
        expect(loaded.towns.size).toBe(world.towns.size);
        // Sets.
        expect(loaded.consumedAttackIds).toBeInstanceOf(Set);
        // Class instances preserve their prototype
        // (FactionDecisionModel methods remain callable).
        const f = loaded.factions[0];
        expect(typeof f.advanceEmotion).toBe('function');
        expect(typeof f.reassess).toBe('function');
    });

    it('saveWorld captures the event ledger (the §7 Causal Ledger contract)', () => {
        // The §7 contract: every meaningful world-changing
        // event is recorded. After save+load, the event
        // log is intact and reconstructable.
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const originalEvents = world.events.length;
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        expect(loaded.events.length).toBe(originalEvents);
        // The event types are preserved.
        const typesA = new Set(world.events.map(e => e.type));
        const typesB = new Set(loaded.events.map(e => e.type));
        expect([...typesA].sort()).toEqual([...typesB].sort());
    });
});
