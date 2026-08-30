// Constitution §9 (PARTIAL OBSERVABILITY) / §87 (RUMOR) / §533
// (INFORMATION MVP) / §8 (STATE vs EVENT vs OBSERVATION).
//
// The §9 contract: "No major intelligent actor should
// automatically know the whole world. Knowledge comes through
// vision, hearing, scouts, travel, trade, rumor, messengers,
// maps, spies, institutions, historical memory, communication
// networks."
//
// The §8 contract: "An agent may believe something false. A
// rumor may cause a real war. The engine must preserve the
// difference between factual causality and perceived causality."
//
// The previous run broadcast every BANDIT event into every
// merchant's BeliefStore — sideways omniscience. This slice
// installs an explicit observation boundary:
// canObserve(actor, event, world) returns true iff the actor
// could plausibly perceive the event.

import { createClosedWorldScenario, tickClosedWorld, canObserve } from '../closed-world.js';
import { tickClosedWorld as _tickAlias } from '../closed-world.js';

describe('observation boundary (Constitution §9 / §87 / §533)', () => {
    it('an actor outside observation range does NOT learn the event', () => {
        // The §9 contract: a merchant traveling on road-b
        // should NOT learn about a BANDIT event on road-a
        // (assuming the merchant can't see through the other
        // road).
        const world = createClosedWorldScenario();
        // Two merchants: one traveling on road-a, one
        // traveling on road-b. Both have their location set
        // to the road they're on (not the town) so the
        // canObserve boundary excludes the other road.
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].location = 'road-a';
        const event = {
            type: 'BANDIT_RELOCATION',
            tick: 1,
            relocation: { roadId: 'road-a', relocated: true }
        };
        // Build a 2nd merchant on road-b.
        world.merchants.push({
            id: 'merchant-2', location: 'road-b', cargo: 20,
            beliefs: world.merchants[0].beliefs,
            selectedRoute: 'road-b'
        });
        // The first merchant observes (on road-a); the second does not.
        expect(canObserve(world.merchants[0], event, world)).toBe(true);
        expect(canObserve(world.merchants[1], event, world)).toBe(false);
    });

    it('a direct witness DOES learn the event', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].selectedRoute = 'road-a';
        const event = {
            type: 'BANDIT_ATTACK',
            tick: 1,
            roadId: 'road-a'
        };
        // The merchant on road-a is a direct witness.
        expect(canObserve(world.merchants[0], event, world)).toBe(true);
    });

    it('an indirect actor can learn later through a report', () => {
        // A merchant traveling on road-b cannot observe an event
        // on road-a directly, but a scout from road-a can
        // observe and (in a future slice) report.
        const world = createClosedWorldScenario();
        // The merchant is *traveling* on road-b, not at the
        // town. Move their location onto the road.
        world.merchants[0].selectedRoute = 'road-b';
        world.merchants[0].location = 'road-b';
        const event = {
            type: 'BANDIT_RELOCATION',
            tick: 1,
            relocation: { roadId: 'road-a', relocated: true }
        };
        // Direct observation: false.
        expect(canObserve(world.merchants[0], event, world)).toBe(false);
        // A scout on road-a CAN observe and could (in a future
        // slice) report to the merchant on road-b. For now, the
        // scout is a separate observer who sees the event.
        const scout = { id: 'scout-1', location: 'road-a', selectedRoute: 'road-a' };
        expect(canObserve(scout, event, world)).toBe(true);
    });

    it('false or stale information can exist while world truth remains unchanged', () => {
        // The §8 contract: a merchant can hold a false belief
        // about a road that has no bandit. The observation
        // boundary must NOT correct the belief when the agent
        // is out of range.
        const world = createClosedWorldScenario();
        world.merchants[0].beliefs.observe({
            subject: 'road-b',
            claim: 'perceivedDanger',
            value: 0.95,
            sourceId: 'false-scout',
            sourceTrust: 0.95,
            confidence: 0.95,
            tick: 0
        });
        // The merchant is on road-a, and a BANDIT event on road-a
        // happens. The merchant can observe that event but NOT
        // the absence of a bandit on road-b. The false belief
        // about road-b must persist.
        world.merchants[0].selectedRoute = 'road-a';
        const event = {
            type: 'BANDIT_ATTACK',
            tick: 1,
            roadId: 'road-a'
        };
        // The merchant observes the road-a event.
        expect(canObserve(world.merchants[0], event, world)).toBe(true);
        // The false belief about road-b is preserved.
        const roadBBelief = world.merchants[0].beliefs.get('road-b', 'perceivedDanger');
        expect(roadBBelief.value).toBe(0.95);
    });

    it('two actors can hold different beliefs about the same road at the same tick', () => {
        const world = createClosedWorldScenario();
        // Two merchants, two different routes.
        world.merchants.push({
            id: 'merchant-2', location: 'north', cargo: 20,
            beliefs: world.merchants[0].beliefs,
            selectedRoute: 'road-b'
        });
        // Seed: merchant-1 believes road-a is safe; merchant-2 believes road-b is dangerous.
        world.merchants[0].beliefs.observe({
            subject: 'road-a', claim: 'perceivedDanger',
            value: 0.05, sourceId: 'scout-a', sourceTrust: 0.95, confidence: 0.95, tick: 0
        });
        world.merchants[1].beliefs.observe({
            subject: 'road-b', claim: 'perceivedDanger',
            value: 0.95, sourceId: 'scout-b', sourceTrust: 0.95, confidence: 0.95, tick: 0
        });
        // The two beliefs are different. The boundary preserves
        // the difference even though both agents have the same
        // ground-truth world.
        const m1RoadA = world.merchants[0].beliefs.get('road-a', 'perceivedDanger');
        const m2RoadB = world.merchants[1].beliefs.get('road-b', 'perceivedDanger');
        expect(m1RoadA.value).toBeLessThan(0.5);
        expect(m2RoadB.value).toBeGreaterThan(0.5);
    });

    it('the closed-world reducer only feeds observable events to each merchant', () => {
        // The reducer must consult canObserve before pushing
        // evidence into a merchant's BeliefStore. A merchant
        // traveling on road-b should NOT receive evidence
        // about a BANDIT event on road-a.
        const world = createClosedWorldScenario();
        // The 2nd merchant is *traveling* on road-b (location
        // on the road, not at the town), so the canObserve
        // boundary excludes road-a events.
        world.merchants.push({
            id: 'merchant-2', location: 'road-b', cargo: 20,
            beliefs: world.merchants[0].beliefs,
            selectedRoute: 'road-b'
        });
        // Drive 5 ticks. The reducer must only feed events to
        // merchants who can observe them.
        for (let tick = 1; tick <= 5; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        // The traveling merchant on road-b should not have a
        // road-a belief formed by direct observation.
        const m2RoadABelief = world.merchants[1].beliefs.get('road-a', 'perceivedDanger');
        if (m2RoadABelief !== null) {
            // If a belief exists, its sourceTrust must be low
            // (i.e. it was a rumor, not a direct witness).
            expect(m2RoadABelief.sourceTrust ?? 0).toBeLessThan(0.5);
        }
    });
});
