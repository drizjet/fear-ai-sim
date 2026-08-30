// World-Completion Directive §12 (Diplomacy).
// The treaty system can form, violate, and terminate treaties,
// but it does not yet *enforce* its terms. This slice adds a
// `checkTreatyCompliance(world, action, { tick })` predicate
// that runs in the closed-world reducer and emits a
// `TREATY_VIOLATED` event when an action (e.g. a
// `bandit-ambush` encounter) violates an active passage
// treaty.
//
// The contract:
//   - Given an active passage treaty between two factions
//     covering a road scope, a `bandit-ambush` encounter
//     on that road is a treaty violation by the faction
//     that "owns" the bandit (or, in the MVP, the violator
//     is the bandit itself — bandit is a free agent).
//   - The `TREATY_VIOLATED` event carries the treaty id,
//     the violator, the reason, and the tick.
//   - The treaty is NOT auto-terminated by a violation —
//     the violation is observed, not auto-punitive.
//
// For the MVP, the violator is the faction that the
// bandit is associated with (or `null` if the bandit is
// unaligned). When the violator is the other treaty
// participant, the violation is recorded.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { checkTreatyCompliance, requestPassage, activeTreatiesFor, violateTreaty } from '../treaty.js';
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

describe('treaty enforcement (Constitution §12)', () => {
    it('checkTreatyCompliance returns null when no action is provided', () => {
        // The predicate is null-safe.
        const world = createClosedWorldScenario();
        const result = checkTreatyCompliance({ world });
        expect(result).toBeNull();
    });

    it('checkTreatyCompliance does not violate when there is no active treaty', () => {
        // No active treaty → no violation. The predicate
        // returns null (no violation record).
        const world = createClosedWorldScenario();
        const result = checkTreatyCompliance({
            world,
            action: { type: 'bandit-ambush', roadId: 'road-a', tick: 1 },
            tick: 1,
        });
        expect(result).toBeNull();
    });

    it('checkTreatyCompliance does not violate when the treaty scope does not match', () => {
        // A treaty on road-b does not protect against an
        // action on road-a. No violation.
        const world = createClosedWorldScenario();
        requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-b', world, tick: 1 });
        const result = checkTreatyCompliance({
            world,
            action: { type: 'bandit-ambush', roadId: 'road-a', tick: 2 },
            tick: 2,
        });
        expect(result).toBeNull();
    });

    it('checkTreatyCompliance returns a violation when an action violates an active treaty', () => {
        // A passage treaty on road-a is violated by a
        // bandit-ambush on road-a. The violation is
        // recorded on the treaty and a TREATY_VIOLATED
        // event is emitted.
        const world = createClosedWorldScenario();
        const { treaty } = requestPassage({
            actor: 'north-faction',
            target: 'south-faction',
            scope: 'road-a',
            world,
            tick: 1,
        });
        const result = checkTreatyCompliance({
            world,
            action: { type: 'bandit-ambush', roadId: 'road-a', violator: 'south-faction', tick: 5 },
            tick: 5,
        });
        expect(result).toBeDefined();
        expect(result.treatyId).toBe(treaty.id);
        expect(result.violator).toBe('south-faction');
        expect(result.reason).toBe('bandit-ambush');
        // The treaty was updated with the violation.
        expect(treaty.violations.length).toBe(1);
        // The event log carries the violation.
        const violationEvent = world.events.find(e => e.type === 'TREATY_VIOLATED');
        expect(violationEvent).toBeDefined();
    });

    it('the reducer wires checkTreatyCompliance into the bandit-ambush encounter path', () => {
        // The closed-world reducer runs
        // checkTreatyCompliance after the bandit-ambush
        // encounter. A bandit-ambush on a road covered by
        // an active passage treaty emits a TREATY_VIOLATED
        // event with the treaty id and the violator.
        const world = createClosedWorldScenario();
        const { treaty } = requestPassage({
            actor: 'north-faction',
            target: 'south-faction',
            scope: 'road-a',
            world,
            tick: 1,
        });
        world.bandits[0].roadId = 'road-a';
        // The bandit is associated with the south faction
        // (a heuristic; real bandits would have a factionId).
        world.bandits[0].factionId = 'south-faction';
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        tickClosedWorld(world, {
            tick: 2,
            perceivedDanger: 0.5,
            relationshipGate: false,
            encounterRng: () => 0.999,
            pinBanditRoadId: 'road-a',
        });
        // The bandit-ambush fired, and the treaty was
        // violated by the south-faction (the bandit's
        // associated faction).
        const violationEvent = world.events.find(e => e.type === 'TREATY_VIOLATED');
        expect(violationEvent).toBeDefined();
        expect(violationEvent.treatyId).toBe(treaty.id);
        expect(violationEvent.violator).toBe('south-faction');
        // The treaty was updated.
        expect(treaty.violations.length).toBeGreaterThan(0);
    });

    it('treaty violations are recorded on the treaty but do not auto-terminate', () => {
        // The §12 contract: a violation is observed, not
        // auto-punitive. The treaty remains ACTIVE after
        // the violation.
        const world = createClosedWorldScenario();
        const { treaty } = requestPassage({
            actor: 'north-faction',
            target: 'south-faction',
            scope: 'road-a',
            world,
            tick: 1,
        });
        checkTreatyCompliance({
            world,
            action: { type: 'bandit-ambush', roadId: 'road-a', violator: 'south-faction', tick: 5 },
            tick: 5,
        });
        expect(treaty.status).toBe('ACTIVE');
        expect(treaty.violations.length).toBe(1);
    });
});
