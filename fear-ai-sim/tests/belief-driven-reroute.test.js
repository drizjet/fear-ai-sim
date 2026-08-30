// Constitution §9 (Partial Observability) / §87 (Rumor) / §161 (Bandit Adaptation)
// + §538 (Vertical Slice) / §533 (Information MVP).
//
// The merchant must reroute based on its own BELIEFS, not on direct
// observation of bandit positions. The constitution's information
// contract says: "No major intelligent actor should automatically know
// the whole world. Knowledge comes through vision, hearing, scouts,
// travel, trade, rumor, messengers, maps, spies, institutions,
// historical memory, communication networks."

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { BeliefStore, Evidence } from '../beliefs.js';
import { createRouteBelief, routeCost } from '../routing.js';

describe('belief-driven merchant rerouting (Constitution §9 / §87 / §161 / §533 / §538)', () => {
    it('merchant reroute consults its own BeliefStore, not the bandit position', () => {
        // The §9 contract: the merchant must not "see" the bandit
        // position directly. Its route choice must be driven by the
        // belief store's recorded "perceivedDanger" for each road.
        const world = createClosedWorldScenario();
        // Inject a BeliefStore into the merchant (the closed-world
        // seed does not include one yet — this slice adds it).
        world.merchants[0].beliefs = new BeliefStore();
        // Seed: a belief that road-a is dangerous (perceivedDanger
        // 0.8) and road-b is safe (perceivedDanger 0.05). The
        // bandit is actually on road-a, but the belief is what the
        // merchant uses.
        for (const roadId of ['road-a', 'road-b']) {
            world.merchants[0].beliefs.observe(new Evidence({
                subject: roadId,
                claim: 'perceivedDanger',
                value: roadId === 'road-a' ? 0.8 : 0.05,
                sourceId: 'scout-report',
                sourceTrust: 0.9,
                confidence: 0.9,
                tick: 1
            }));
        }
        // Drive one tick. The merchant's reroute must consult its
        // own beliefs, not the bandit position.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        // The merchant should pick the road with the lower belief
        // about danger (road-b), regardless of where the bandit
        // actually is.
        const selectedRoute = world.merchants[0].selectedRoute;
        // The belief is what drives the choice. The merchant's
        // own beliefs say road-a is dangerous and road-b is safe.
        // So the merchant picks road-b.
        // (This is the §9 invariant: beliefs drive choice.)
        const roadABelief = world.merchants[0].beliefs.get('road-a', 'perceivedDanger');
        const roadBBelief = world.merchants[0].beliefs.get('road-b', 'perceivedDanger');
        if (roadABelief.value > roadBBelief.value) {
            expect(selectedRoute).toBe('road-b');
        } else {
            expect(selectedRoute).toBe('road-a');
        }
    });

    it('belief store is updated when a bandit attack or relocation is observed', () => {
        // The §87 contract: when a BANDIT_ATTACK or BANDIT_RELOCATION
        // event fires, an observer's belief store must be updated.
        // The closed-world chain emits these events, and the
        // merchant's belief store must reflect them.
        const world = createClosedWorldScenario();
        world.merchants[0].beliefs = new BeliefStore();
        // Drive 5 ticks. After the run, the merchant's belief
        // store should contain beliefs for both roads (the §87
        // "no rumor equal to fact" requires the observer to form
        // its own belief from events).
        for (let tick = 1; tick <= 5; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        // The merchant's belief store should have at least one
        // belief recorded for one of the roads (the event
        // observation step must have written to it).
        const hasRoadABelief = world.merchants[0].beliefs.get('road-a', 'perceivedDanger') !== undefined;
        const hasRoadBBelief = world.merchants[0].beliefs.get('road-b', 'perceivedDanger') !== undefined;
        expect(hasRoadABelief || hasRoadBBelief).toBe(true);
    });

    it('the merchant does not know the ground truth bandit position', () => {
        // The §9 partial-observability contract: the merchant's
        // belief store should NOT contain the ground truth bandit
        // position. Instead, it contains a "perceivedDanger" value
        // that may or may not match reality. The merchant's route
        // choice is driven by its belief, not by ground truth.
        const world = createClosedWorldScenario();
        world.merchants[0].beliefs = new BeliefStore();
        // Seed beliefs that disagree with reality: tell the
        // merchant that road-b (which has no bandit) is dangerous
        // and road-a (which has a bandit) is safe. The merchant
        // should pick road-a based on its belief, even though
        // that's the wrong choice in reality.
        for (const roadId of ['road-a', 'road-b']) {
            world.merchants[0].beliefs.observe(new Evidence({
                subject: roadId,
                claim: 'perceivedDanger',
                value: roadId === 'road-b' ? 0.95 : 0.01,
                sourceId: 'false-scout',
                sourceTrust: 0.95,
                confidence: 0.95,
                tick: 1
            }));
        }
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        // The merchant picks based on belief: road-a (low belief
        // danger), even though the bandit is actually on road-a.
        expect(world.merchants[0].selectedRoute).toBe('road-a');
    });
});
