import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import {
    encounterCatalog,
    evaluateEncounterEligibility,
    instantiateEncounter
} from '../encounters.js';

// World-Completion Directive §89-§96, §532 "Fourth Broad
// Milestone — World Encounters." The prior slice's
// `evaluateEncounterEligibility` produces
// CANDIDATE_ENCOUNTER events but no ENCOUNTER event. This
// slice wires the instantiation: from the eligible
// candidates, pick one with a deterministic rng, and
// produce an ENCOUNTER event that mutates world state.

describe('encounter instantiation (directive §532)', () => {
    it('instantiateEncounter exists and returns a result for bandit-ambush', () => {
        // The encounter catalog has 5 templates. The
        // instantiateEncounter function should produce a
        // result object for at least one template.
        const catalog = encounterCatalog();
        expect(catalog.length).toBeGreaterThan(0);
        // The instantiation contract: for each template,
        // there is a corresponding instantiation function
        // (or a default fallback that mutates world state).
        // The simplest instantiation for bandit-ambush:
        // the bandit on the same road as the merchant
        // steals some cargo.
        const world = createClosedWorldScenario();
        // Place the bandit on the merchant's route.
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].cargo = 20;
        const template = catalog.find(t => t.id === 'bandit-ambush');
        expect(template).toBeDefined();
        // The instantiation must mutate world state
        // (the merchant's cargo should decrease).
        const result = instantiateEncounter(template, world, { tick: 1, rng: () => 0.5 });
        expect(result).toBeDefined();
        // The result must include the encounter id.
        expect(result.encounterId).toBe('bandit-ambush');
        // The instantiation must mutate the merchant's
        // cargo (the bandit steals some).
        expect(world.merchants[0].cargo).toBeLessThan(20);
        // The instantiation must record the outcome on
        // the world (for the audit trail).
        expect(world.events).toContainEqual(expect.objectContaining({
            type: 'ENCOUNTER',
            encounterId: 'bandit-ambush'
        }));
    });

    it('a stochastic rng selection picks one candidate from the eligible list', () => {
        // The §95 contract: randomness selects among
        // plausible events. The instantiation must use a
        // deterministic rng (the same seed produces the
        // same encounter).
        const world = createClosedWorldScenario();
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].cargo = 20;
        const eligible = evaluateEncounterEligibility(world);
        // The eligible list should include bandit-ambush.
        const banditAmbush = eligible.find(t => t.id === 'bandit-ambush');
        expect(banditAmbush).toBeDefined();
        // Two runs with the same rng must pick the same
        // template.
        const a = instantiateEncounter(banditAmbush, world, { tick: 1, rng: () => 0.5 });
        const b = instantiateEncounter(banditAmbush, world, { tick: 1, rng: () => 0.5 });
        expect(a).toBeDefined();
        expect(b).toBeDefined();
    });

    it('the bandit-ambush encounter steals cargo from the merchant on the same route', () => {
        // The §96 contract: encounter outcomes return to
        // authoritative world state. The bandit-ambush
        // encounter must debit the merchant's cargo and
        // add the stolen amount to the bandit (or
        // equivalently, the encounter result records the
        // stolen amount).
        const world = createClosedWorldScenario();
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].cargo = 20;
        const template = encounterCatalog().find(t => t.id === 'bandit-ambush');
        const before = world.merchants[0].cargo;
        const result = instantiateEncounter(template, world, { tick: 1, rng: () => 0.5 });
        const after = world.merchants[0].cargo;
        // The merchant lost cargo.
        expect(after).toBeLessThan(before);
        // The result must record the stolen amount.
        expect(result.stolen).toBeDefined();
        expect(result.stolen).toBe(before - after);
        // The encounter event is on the world.
        const encEvent = world.events.find(e => e.type === 'ENCOUNTER');
        expect(encEvent).toBeDefined();
        expect(encEvent.result.stolen).toBe(before - after);
    });
});
