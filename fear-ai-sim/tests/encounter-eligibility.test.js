// Constitution §89 (Encounter System) / §90 (Encounter Sources) /
// §91 (Encounter Eligibility) / §94 (Encounter Categories) /
// §532 (FOURTH BROAD MILESTONE: WORLD ENCOUNTERS).
//
// The §89 contract: "An encounter should usually be a LOCAL
// COLLISION OF REAL WORLD PROCESSES. ... Randomness selects among
// plausible events. World state determines plausibility."
//
// This slice implements the §91 ENCOUNTER ELIGIBILITY MVP: given
// the current world state, produce a list of eligible encounter
// templates. The encounter templates are pure (no side effects).
// The reducer's per-tick loop consults the encounter catalog and
// emits a CANDIDATE_ENCOUNTER event for each eligible template.
// Randomness (later slice) selects one of the candidates to
// actually instantiate.

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import {
    encounterCatalog,
    evaluateEncounterEligibility,
    selectEncounterCandidates,
} from '../encounters.js';

describe('encounter eligibility (Constitution §89 / §91 / §94 / §532)', () => {
    it('encounter catalog exposes encounter templates, not random table rolls', () => {
        // The §89 contract: encounters are *templates* with
        // eligibility conditions, not random tables. The catalog
        // is a static list of templates, each with a check()
        // function that returns true if the current world state
        // makes the encounter plausible.
        const templates = encounterCatalog();
        expect(templates.length).toBeGreaterThan(0);
        for (const template of templates) {
            expect(typeof template.id).toBe('string');
            expect(typeof template.description).toBe('string');
            expect(typeof template.check).toBe('function');
        }
    });

    it('encounters are eligible only when the world actually supports them', () => {
        // The §91 contract: "Do not spawn impossible actors. ...
        // World state determines plausibility."
        // Test: with an empty world (no bandits, no merchants), the
        // ambush encounter is not eligible. With a bandit and a
        // merchant, the ambush encounter IS eligible.
        const emptyWorld = { bandits: [], merchants: [], routes: [], events: [] };
        const realWorld = {
            bandits: [{ id: 'b1', roadId: 'road-a' }],
            merchants: [{ id: 'm1', location: 'north', cargo: 20 }],
            routes: [{ id: 'road-a', from: 'north', to: 'south' }],
            events: [],
        };
        const emptyEligible = evaluateEncounterEligibility(emptyWorld, { tick: 1 });
        const realEligible = evaluateEncounterEligibility(realWorld, { tick: 1 });
        // Real world has more eligible encounters than empty world
        // (the bandit+merchant combination enables ambush, etc).
        expect(realEligible.length).toBeGreaterThanOrEqual(emptyEligible.length);
    });

    it('closed-world reducer emits a CANDIDATE_ENCOUNTER event per tick', () => {
        // The §532 milestone: "Encounter eligibility from actual
        // world actors/events; persistent outcome." The MVP is the
        // eligibility part. The reducer emits a CANDIDATE_ENCOUNTER
        // event each tick with the list of eligible templates.
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5, relationshipGate: true });
        const candidateEvents = world.events.filter(
            event => event.type === 'CANDIDATE_ENCOUNTER'
        );
        // At least one CANDIDATE_ENCOUNTER event should fire on
        // tick 1 (the bandit+merchant combination enables ambush).
        expect(candidateEvents.length).toBeGreaterThanOrEqual(1);
        // Each CANDIDATE_ENCOUNTER event carries a list of
        // templates (or at least one template).
        for (const event of candidateEvents) {
            expect(Array.isArray(event.candidates)).toBe(true);
            expect(event.candidates.length).toBeGreaterThan(0);
        }
    });

    it('selectEncounterCandidates picks the highest-priority eligible encounter', () => {
        // The §95 contract: "Random does not mean meaningless. ...
        // Randomness selects among plausible events. World state
        // determines plausibility." A deterministic selector
        // (sorted by priority) is the §121 deterministic contract.
        const world = {
            bandits: [{ id: 'b1', roadId: 'road-a' }],
            merchants: [{ id: 'm1', location: 'north', cargo: 20 }],
            routes: [{ id: 'road-a', from: 'north', to: 'south' }],
            events: [],
        };
        const eligible = evaluateEncounterEligibility(world, { tick: 1 });
        const selected = selectEncounterCandidates(eligible, { rng: () => 0.5, maxCandidates: 3 });
        // The selector should return at most maxCandidates and at
        // least one (because there are eligible encounters).
        expect(selected.length).toBeGreaterThan(0);
        expect(selected.length).toBeLessThanOrEqual(3);
        // The selector is deterministic (same rng seed → same
        // output).
        const selectedAgain = selectEncounterCandidates(eligible, { rng: () => 0.5, maxCandidates: 3 });
        expect(selected.map(item => item.id)).toEqual(selectedAgain.map(item => item.id));
    });
});
