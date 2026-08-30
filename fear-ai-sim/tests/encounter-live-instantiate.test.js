// World-Completion Directive §89 / §96 / §532.
// Constitution §89: "An encounter should usually be a LOCAL
// COLLISION OF REAL WORLD PROCESSES."
// Constitution §96: "Encounter outcomes must return to
// authoritative world state."
// Constitution §532: "Fourth Broad Milestone — World Encounters."
//
// The prior slice (EVID-2026-08-28-ENCOUNTER-INSTANTIATE)
// proved the `instantiateEncounter` function works for
// `bandit-ambush` in isolation. But the closed-world reducer
// only emitted a CANDIDATE_ENCOUNTER event and never called
// `instantiateEncounter` — so the world never actually changed
// in response to a plausible encounter. This slice wires the
// instantiation into the live reducer path so that
// CANDIDATE_ENCOUNTER → ENCOUNTER is a real transition that
// mutates authoritative world state.
//
// The contract:
//   Given bandit-ambush is eligible (bandit on a road, merchant
//   with cargo on the same road, both with `selectedRoute`
//   matching), the live `tickClosedWorld` reducer must:
//     1. Emit a CANDIDATE_ENCOUNTER event (existing behavior).
//     2. Pick one candidate via the deterministic selector.
//     3. Call `instantiateEncounter` for that candidate.
//     4. Emit an ENCOUNTER event with the result.
//     5. Mutate world state (merchant.cargo decreases).
//   The §121 determinism contract must hold: the same seed
//   produces the same encounter sequence.
//
// Failing-test-first: this test must fail for the right reason
// (the reducer does not yet emit an ENCOUNTER event in the
// bandit-ambush case) before the implementation lands.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { Evidence } from '../beliefs.js';

// Force the encounter selector to pick `bandit-ambush` (the
// first/highest-priority eligible template). The closed-world
// reducer shuffles eligible templates via selectEncounterCandidates;
// without a fixed rng, the selector may pick any eligible
// template (e.g. wildlife-encounter). The encounterRng option
// on tickClosedWorld exposes the selector's rng for tests.
//
// The Fisher-Yates swap uses j = Math.floor(rng() * (i+1)).
// Returning 0.999 ensures j = i for every iteration (the swap
// becomes a self-swap, a no-op), so the priority-sorted
// order is preserved and bandit-ambush (priority 5) stays
// at index 0.
function forceBanditAmbush() {
    return () => 0.999;
}

// Seed the merchant's belief store so it picks the road the
// bandit is on. The belief store keys beliefs as
// `${subject}:${claim}` and the closed-world's per-tick reroute
// reads `beliefs.get(routeId, 'perceivedDanger')` first.
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

// Pin the bandit to a specific road for the encounter check.
// The closed-world's per-tick relocation step (via
// `chooseRoamingDestination`) might move the bandit between
// ticks; for encounter tests we need a stable bandit position
// so the bandit-ambush precondition is met. The
// `pinBanditRoadId` option on `tickClosedWorld` is the
// test-only affordance that pins the bandit *just before*
// the encounter check. Production callers leave it null.

describe('encounter live instantiation (Constitution §89 / §96 / §532)', () => {
    it('tickClosedWorld emits an ENCOUNTER event when bandit-ambush is eligible', () => {
        // Setup: bandit is on road-a, merchant at north with
        // cargo and a false belief that road-a is safe (so the
        // reroute picks road-a — the §407 false-belief
        // scenario). The encounter rng is forced to select
        // bandit-ambush. The bandit is pinned to road-a via
        // the `pinBanditRoadId` option so the per-tick
        // relocation step doesn't move it. After one tick, an
        // ENCOUNTER event must be present on the world and
        // the merchant's cargo must decrease.
        const world = createClosedWorldScenario();
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].location = 'north';
        world.merchants[0].cargo = 20;
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        tickClosedWorld(world, {
            tick: 1,
            perceivedDanger: 0.5,
            relationshipGate: false,
            encounterRng: forceBanditAmbush(),
            pinBanditRoadId: 'road-a',
        });
        // The reducer must produce at least one ENCOUNTER event.
        const encounterEvents = world.events.filter(event => event.type === 'ENCOUNTER');
        expect(encounterEvents.length).toBeGreaterThanOrEqual(1);
        // The ENCOUNTER event must be a bandit-ambush with
        // the result attached.
        const ambushEvent = encounterEvents.find(event => event.encounterId === 'bandit-ambush');
        expect(ambushEvent).toBeDefined();
        expect(ambushEvent.result).toBeDefined();
        // The §96 contract: the encounter outcome must return
        // to authoritative world state.
        expect(world.merchants[0].cargo).toBeLessThan(20);
    });

    it('tickClosedWorld is deterministic across two runs of the encounter sequence (§121)', () => {
        // Two runs of tickClosedWorld with the same world shape
        // must produce identical ENCOUNTER event sequences.
        const buildWorld = () => {
            const w = createClosedWorldScenario();
            w.bandits[0].roadId = 'road-a';
            w.merchants[0].location = 'north';
            w.merchants[0].cargo = 20;
            w.merchants[0].selectedRoute = 'road-a';
            seedMerchantBelief(w.merchants[0], 'road-a', 0.01);
            return w;
        };
        const a = buildWorld();
        const b = buildWorld();
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(a, { tick: t, perceivedDanger: 0.5, relationshipGate: false, encounterRng: forceBanditAmbush(), pinBanditRoadId: 'road-a' });
            tickClosedWorld(b, { tick: t, perceivedDanger: 0.5, relationshipGate: false, encounterRng: forceBanditAmbush(), pinBanditRoadId: 'road-a' });
        }
        // Compare the ENCOUNTER event sequences.
        const encA = a.events.filter(e => e.type === 'ENCOUNTER');
        const encB = b.events.filter(e => e.type === 'ENCOUNTER');
        expect(encA.length).toBe(encB.length);
        for (let i = 0; i < encA.length; i += 1) {
            expect(encA[i].encounterId).toBe(encB[i].encounterId);
            expect(encA[i].tick).toBe(encB[i].tick);
            expect(encA[i].result.stolen ?? null).toBe(encB[i].result.stolen ?? null);
        }
    });

    it('merchant cargo decreases cumulatively across multiple ticks with bandit on the same route', () => {
        // The §89 contract: an encounter is a LOCAL COLLISION
        // OF REAL WORLD PROCESSES. Over 50 ticks with a bandit
        // pinned to road-a and a merchant falsely believing
        // road-a is safe, the merchant's cargo should decrease
        // (multiple bandit-ambush encounters fire).
        const world = createClosedWorldScenario();
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].location = 'north';
        world.merchants[0].cargo = 100;
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        for (let t = 1; t <= 50; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, relationshipGate: false, encounterRng: forceBanditAmbush(), pinBanditRoadId: 'road-a' });
        }
        // The merchant must have lost cargo to bandit-ambush
        // encounters over the 50 ticks.
        expect(world.merchants[0].cargo).toBeLessThan(100);
        // The world event log must contain at least one
        // bandit-ambush ENCOUNTER event.
        const ambushEvents = world.events.filter(
            event => event.type === 'ENCOUNTER' && event.encounterId === 'bandit-ambush'
        );
        expect(ambushEvents.length).toBeGreaterThan(0);
    });

    it('the ENCOUNTER event includes the merchantId and stolen amount in the result', () => {
        // The §96 contract: the audit trail must be
        // reconstructable. The ENCOUNTER event must carry the
        // merchantId (which merchant was hit) and the stolen
        // amount (how much cargo was lost).
        const world = createClosedWorldScenario();
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].location = 'north';
        world.merchants[0].cargo = 20;
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        const before = world.merchants[0].cargo;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5, relationshipGate: false, encounterRng: forceBanditAmbush(), pinBanditRoadId: 'road-a' });
        const ambushEvent = world.events.find(
            event => event.type === 'ENCOUNTER' && event.encounterId === 'bandit-ambush'
        );
        expect(ambushEvent).toBeDefined();
        expect(ambushEvent.result.merchantId).toBe('merchant-1');
        expect(ambushEvent.result.stolen).toBeGreaterThan(0);
        // The cargo delta is at least the stolen amount
        // (multiple encounters can fire in a tick, each
        // taking a share).
        expect(before - world.merchants[0].cargo).toBeGreaterThanOrEqual(ambushEvent.result.stolen);
    });
});


