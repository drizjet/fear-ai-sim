import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, canObserve } from '../closed-world.js';
import { tickMerchant, tickBandit, createCanonicalMerchant } from '../canonical-trade-system.js';

// R1 (V8 audit F1/F2) — OBS-BOUNDARY-001/002 twin detectors.
//
// OBS-BOUNDARY-001: with no legal observation source, changing hidden
// truth must not change beliefs or decisions.
// OBS-BOUNDARY-002: with legal visibility, changing visible truth may.

function merchantWorld({ accuracy = 1, merchantRoad = 'road-a', banditRoad = 'road-b' } = {}) {
    const world = createClosedWorldScenario();
    const merchant = world.merchants[0];
    merchant.perceptionAccuracy = accuracy;
    merchant.selectedRoute = merchantRoad;
    merchant.lastRoute = merchantRoad;
    merchant.routeBeliefs = {
        'road-a': { perceivedDanger: 0.2, confidence: 0.9 },
        'road-b': { perceivedDanger: 0.2, confidence: 0.9 },
        'road-c': { perceivedDanger: 0.2, confidence: 0.9 },
    };
    world.bandits[0].roadId = banditRoad;
    return { world, merchant };
}

function attackOn(world, roadId, tick) {
    return appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId, tick, banditId: 'bandit-1', merchantId: 'merchant-1' });
}

describe('OBS-BOUNDARY panopticon closure (R1)', () => {
    test('twin worlds differing only in distant bandit road hold identical beliefs', () => {
        const a = merchantWorld({ accuracy: 1, merchantRoad: 'road-a', banditRoad: 'road-b' });
        const b = merchantWorld({ accuracy: 1, merchantRoad: 'road-a', banditRoad: 'road-c' });
        tickMerchant(a.world, a.merchant.id, { tick: 1, rng: () => 0 });
        tickMerchant(b.world, b.merchant.id, { tick: 1, rng: () => 0 });
        // Neither distant road may enter beliefs: the stores stay identical.
        expect(JSON.stringify(a.merchant.routeBeliefs)).toBe(JSON.stringify(b.merchant.routeBeliefs));
        expect(a.merchant.routeBeliefs['road-b'].perceivedDanger).toBe(0.2);
        expect(a.merchant.routeBeliefs['road-c'].perceivedDanger).toBe(0.2);
    });


    test('accuracy 0 learns nothing even from a legal attack event', () => {
        const { world, merchant } = merchantWorld({ accuracy: 0, merchantRoad: 'road-a' });
        attackOn(world, 'road-a', 1);
        tickMerchant(world, merchant.id, { tick: 1, rng: () => 0 });
        expect(merchant.routeBeliefs['road-a'].perceivedDanger).toBe(0.2);
    });

    test('accuracy 1 learns from a BANDIT_ATTACK on its own road', () => {
        const { world, merchant } = merchantWorld({ accuracy: 1, merchantRoad: 'road-a' });
        attackOn(world, 'road-a', 1);
        tickMerchant(world, merchant.id, { tick: 1, rng: () => 0 });
        expect(merchant.routeBeliefs['road-a'].perceivedDanger).toBeGreaterThan(0.5);
        expect(merchant.routeBeliefs['road-a'].source).toContain('observation');
    });

    test('attack on another road teaches nothing', () => {
        const { world, merchant } = merchantWorld({ accuracy: 1, merchantRoad: 'road-a' });
        attackOn(world, 'road-b', 1);
        tickMerchant(world, merchant.id, { tick: 1, rng: () => 0 });
        expect(merchant.routeBeliefs['road-b'].perceivedDanger).toBe(0.2);
    });

    test('bandit learns merchants on its own road, never distant ones', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.perceptionAccuracy = 1;
        bandit.roadId = 'road-a';
        bandit.trafficBelief = {
            'road-a': { estimatedTraffic: 0, recency: 0.5 },
            'road-b': { estimatedTraffic: 0, recency: 0.5 },
        };
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].lastRoute = 'road-a';
        // Second merchant travels a distant road the bandit cannot see.
        const far = createCanonicalMerchant({ id: 'merchant-far', location: 'south' });
        far.selectedRoute = 'road-b';
        far.lastRoute = 'road-b';
        world.merchants.push(far);
        tickBandit(world, bandit.id, { tick: 1, rng: () => 0 });
        expect(bandit.trafficBelief['road-a'].estimatedTraffic).toBeGreaterThan(0);
        expect(bandit.trafficBelief['road-b'].estimatedTraffic).toBe(0);
    });

    test('bandit accuracy 0 learns nothing even co-located', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.perceptionAccuracy = 0;
        bandit.roadId = 'road-a';
        bandit.trafficBelief = { 'road-a': { estimatedTraffic: 0, recency: 0.5 } };
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].lastRoute = 'road-a';
        tickBandit(world, bandit.id, { tick: 1, rng: () => 0 });
        expect(bandit.trafficBelief['road-a'].estimatedTraffic).toBe(0);
    });

    test('reducer: attack on merchant road elevates belief next tick, distant attack does not', () => {
        const { world, merchant } = merchantWorld({ accuracy: 1, merchantRoad: 'road-a' });
        attackOn(world, 'road-a', 1);
        attackOn(world, 'road-b', 1);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const m = world.merchants[0];
        expect(m.routeBeliefs['road-a'].perceivedDanger).toBeGreaterThan(
            m.routeBeliefs['road-b'].perceivedDanger);
    });

    test('evidence window: fresh attacks on the current road are learned, stale ones are not', () => {
        // Fresh-evidence semantics (R1b review): the [tick-1, tick]
        // window lets a merchant consume recent attacks on its CURRENT
        // road. Anything older stays unknown — no deep-history learning.
        // Separate worlds: a tickMerchant call re-decides the route,
        // so sequential calls would move the merchant off-road.
        const stale = merchantWorld({ accuracy: 1, merchantRoad: 'road-b' });
        attackOn(stale.world, 'road-b', 1);
        attackOn(stale.world, 'road-c', 1);
        tickMerchant(stale.world, stale.merchant.id, { tick: 5, rng: () => 0 });
        expect(stale.merchant.routeBeliefs['road-b'].perceivedDanger).toBe(0.2);
        expect(stale.merchant.routeBeliefs['road-c'].perceivedDanger).toBe(0.2);
        const fresh = merchantWorld({ accuracy: 1, merchantRoad: 'road-b' });
        attackOn(fresh.world, 'road-b', 1);
        attackOn(fresh.world, 'road-c', 1);
        tickMerchant(fresh.world, fresh.merchant.id, { tick: 2, rng: () => 0 });
        expect(fresh.merchant.routeBeliefs['road-b'].perceivedDanger).toBeGreaterThan(0.5);
        expect(fresh.merchant.routeBeliefs['road-c'].perceivedDanger).toBe(0.2);
    });
    test('reducer: accuracy-0 merchant is blind everywhere across 5 ticks', () => {
        // Pins R1b finding 3: perceptionAccuracy governs the step-2.4
        // BeliefStore channel too, not just the canonical one.
        const world = createClosedWorldScenario();
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.8, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.8, confidence: 0.5 },
        };
        world.merchants[0].perceptionAccuracy = 0;
        world.bandits[0].perceptionAccuracy = 0;
        world.bandits[0].roadId = 'road-a';
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, relationshipGate: true });
        }
        expect(world.merchants[0].selectedRoute).toBe('road-a');
    });
});

// ---- Restored pre-R1 boundary oracles (V8 audit finding 4) ----
// These six tests were overwritten during R1 detector work and are
// restored verbatim: they pin canObserve + BeliefStore semantics the
// new tests do not cover.
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
