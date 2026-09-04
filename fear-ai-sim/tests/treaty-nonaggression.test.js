// World-Completion Directive §12 (Diplomacy) + §395
// (Relationship Vector) + §28 (Diplomacy).
//
// The prior slice (EVID-2026-08-28-TREATY-ENFORCEMENT) wired
// `checkTreatyCompliance` into the encounter reducer for
// passage treaties. This slice adds the §12 "non-aggression"
// treaty kind and wires it into the closed-world's invasion
// gate: a faction with a non-aggression treaty with another
// faction must NOT raid that faction's bandits.
//
// The contract:
//   - `requestNonAggression(actor, target, world, tick)` forms
//     a non-aggression treaty and emits a TREATY_FORMED event.
//   - The closed-world's invasion step (step 7) consults
//     `activeTreatiesFor(faction.id, world)` filtered by
//     `terms.kind === 'non-aggression'`. If the target
//     bandit is associated with a faction that is a
//     participant in a non-aggression treaty, the invasion
//     is suppressed and a `TREATY_BLOCKED_RAID` event is
//     emitted (the raid is *observed* but not executed —
//     a §12 contract that treaties constrain action).
//   - The §121 determinism contract must hold: same scenario
//     + same treaty state → same invasion outcome.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { requestNonAggression, activeTreatiesFor } from '../treaty.js';
import { Evidence } from '../beliefs.js';

function seedMerchantBelief(merchant, routeId, value) {
    merchant.beliefs.observe(new Evidence({
        subject: routeId,
        claim: 'perceivedDanger',
        value,
        sourceId: 'seed',
        sourceTrust: 1.0,
        confidence: 1.0,
        tick: 0,
    }));
}

describe('non-aggression treaties and the invasion gate (Constitution §12 / §28)', () => {
    it('requestNonAggression forms a non-aggression treaty and emits TREATY_FORMED', () => {
        // The §12 contract: a non-aggression pact is a
        // treaty with terms.kind === 'non-aggression'.
        const world = createClosedWorldScenario();
        const result = requestNonAggression({
            actor: 'north-faction',
            target: 'south-faction',
            world,
            tick: 1,
        });
        expect(result.ok).toBe(true);
        expect(result.treaty.terms.kind).toBe('non-aggression');
        expect(result.treaty.participants).toContain('north-faction');
        expect(result.treaty.participants).toContain('south-faction');
        const formed = world.events.find(e => e.type === 'TREATY_FORMED');
        expect(formed).toBeDefined();
        expect(formed.treaty.terms.kind).toBe('non-aggression');
    });

    it('activeTreatiesFor filters by kind when given a kind parameter', () => {
        // A faction can have multiple active treaties of
        // different kinds. The activeTreatiesFor helper
        // should accept an optional kind filter so the
        // invasion gate can check for non-aggression
        // treaties specifically.
        const world = createClosedWorldScenario();
        requestNonAggression({ actor: 'north-faction', target: 'south-faction', world, tick: 1 });
        const all = activeTreatiesFor('north-faction', world);
        const nonAggression = activeTreatiesFor('north-faction', world, { kind: 'non-aggression' });
        expect(all.length).toBe(1);
        expect(nonAggression.length).toBe(1);
        expect(nonAggression[0].terms.kind).toBe('non-aggression');
    });

    it('the invasion gate suppresses a raid when a non-aggression treaty exists', () => {
        // Set up: north-faction has a non-aggression treaty
        // with south-faction. The bandit is associated with
        // south-faction. The north-faction's invasion
        // should NOT fire against the bandit (it would
        // violate the non-aggression pact). A
        // `TREATY_BLOCKED_RAID` event is emitted instead.
        const world = createClosedWorldScenario();
        // E3 staging: the merchant shuttle now covers a pop-1 tools
        // deficit faster than raid pressure builds (pacified fixture:
        // grievance 0.30, nothing to block). At pop 100 the deficit
        // drain outruns shuttle throughput, so chronic pressure
        // persists and the gate has raids to block. The scale stages
        // pressure honestly; the gate logic is untouched.
        for (const [, town] of world.towns) town.population = 100;
        // Form the non-aggression treaty at tick 1.
        requestNonAggression({ actor: 'north-faction', target: 'south-faction', world, tick: 1 });
        // The bandit is associated with south-faction.
        world.bandits[0].factionId = 'south-faction';
        // The bandit is on a road that touches north-faction's
        // home town.
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        // Run 30 ticks to give the invasion step multiple
        // opportunities to fire. At pop 100 the tools deficit
        // persists (shortage 1.0) despite the shuttle, so north
        // keeps attempting raids and the gate keeps blocking them.
        let invasionCount = 0;
        let blockedCount = 0;
        for (let t = 2; t <= 30; t += 1) {
            tickClosedWorld(world, {
                tick: t,
                perceivedDanger: 0.9,
                relationshipGate: false,
                encounterRng: () => 0.999,
                pinBanditRoadId: 'road-a',
            });
            invasionCount += world.events.filter(e => e.type === 'INVASION' && e.tick === t && e.factionId === 'north-faction').length;
            blockedCount += world.events.filter(e => e.type === 'TREATY_BLOCKED_RAID' && e.tick === t).length;
        }
        // No NORTH INVASION events should have fired (the
        // non-aggression treaty blocks them). South-faction raids
        // against the bandit are out of this pact's scope and are
        // not counted here.
        // At least one TREATY_BLOCKED_RAID event should have fired.
        expect(invasionCount).toBe(0);
        expect(blockedCount).toBeGreaterThan(0);
    });

    it('the invasion gate still fires when no non-aggression treaty exists', () => {
        // Control case: without a treaty, the invasion gate
        // should fire as before. The §12 enforcement is
        // conditional, not universal.
        const world = createClosedWorldScenario();
        // E3 staging (same as above): pop 100 so deficit pressure
        // outruns the merchant shuttle and raids still fire.
        for (const [, town] of world.towns) town.population = 100;
        world.bandits[0].factionId = 'south-faction';
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        for (let t = 2; t <= 30; t += 1) {
            tickClosedWorld(world, {
                tick: t,
                perceivedDanger: 0.9,
                relationshipGate: false,
                encounterRng: () => 0.999,
                pinBanditRoadId: 'road-a',
            });
        }
        const invasionCount = world.events.filter(e => e.type === 'INVASION').length;
        const blockedCount = world.events.filter(e => e.type === 'TREATY_BLOCKED_RAID').length;
        expect(invasionCount).toBeGreaterThan(0);
        expect(blockedCount).toBe(0);
    });

    it('a non-aggression treaty between two factions does not block raids against unaligned bandits', () => {
        // The treaty blocks raids only against bandits whose
        // associated faction is a treaty participant. An
        // unaligned bandit (no factionId) is fair game.
        const world = createClosedWorldScenario();
        // E3 staging (same regime note as above): pop 100 so raid
        // pressure outruns the merchant shuttle.
        for (const [, town] of world.towns) town.population = 100;
        requestNonAggression({ actor: 'north-faction', target: 'south-faction', world, tick: 1 });
        // The default bandit has factionId='south-faction'
        // (EVID-2026-08-28-SENSITIVITY-500TICK audit
        // finding). For this test we want the unaligned case,
        // so explicitly null the factionId.
        world.bandits[0].factionId = null;
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        for (let t = 2; t <= 30; t += 1) {
            tickClosedWorld(world, {
                tick: t,
                perceivedDanger: 0.9,
                relationshipGate: false,
                encounterRng: () => 0.999,
                pinBanditRoadId: 'road-a',
            });
        }
        const invasionCount = world.events.filter(e => e.type === 'INVASION').length;
        // The invasion should still fire (the bandit is unaligned).
        expect(invasionCount).toBeGreaterThan(0);
    });
});
