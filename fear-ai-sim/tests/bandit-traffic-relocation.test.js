import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    relocateBanditViaRoaming,
    getWorldEvents,
} from '../closed-world.js';

// E2 — travel-driven relocation: the roaming synthesis consumes
// co-located traffic observations.
//
// relocateBanditViaRoaming built beliefs from staged
// lootExpectation alone, ignoring bandit.trafficBelief (the
// R1-gated co-location history tickBandit maintains). The loot
// channel (weight 0.8) sat at 0 for every road, so relocation ran
// on resource/distance/danger crumbs. Now observed traffic refines
// the per-road loot opportunity via max(): strong fresh traffic
// beats an empty prior past the switch margin; stale traces fade
// back to it. Same lawful source tickBandit consumes.

function trafficFixture({ loot = 0, roadC = { estimatedTraffic: 4, recency: 0.9 } } = {}) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 100000;
    const bandit = world.bandits[0];
    bandit.roadId = 'road-a';
    bandit.lootExpectation = loot;
    bandit.locationAge = 0;
    bandit._lastRelocationTick = -100;
    bandit.relocationCooldownTicks = 10;
    bandit.trafficBelief = {
        'road-a': { estimatedTraffic: 0, recency: 0.5, lastDecayTick: 1 },
        'road-b': { estimatedTraffic: 0, recency: 0.5, lastDecayTick: 1 },
        'road-c': { ...roadC, lastDecayTick: 1 },
    };
    return { world, bandit };
}

describe('E2 — traffic observations drive roaming relocation', () => {
    it('strong fresh traffic pulls the bandit to the observed road', () => {
        const { world, bandit } = trafficFixture();
        const r = relocateBanditViaRoaming(bandit, world.routes, { tick: 20 });
        expect(r.relocated).toBe(true);
        expect(r.to).toBe('road-c');
        expect(r.reason).toBe('chooseRoamingDestination');
    });

    it('stale traffic fades back to the prior: no relocation', () => {
        const { world, bandit } = trafficFixture({
            roadC: { estimatedTraffic: 4, recency: 0.05 },
        });
        const r = relocateBanditViaRoaming(bandit, world.routes, { tick: 20 });
        expect(r.to).toBe('road-a');
        expect(r.reason).toBe('stay');
    });

    it('no traffic anywhere: the empty prior holds still', () => {
        const { world, bandit } = trafficFixture({
            roadC: { estimatedTraffic: 0, recency: 0 },
        });
        const r = relocateBanditViaRoaming(bandit, world.routes, { tick: 20 });
        expect(r.to).toBe('road-a');
        expect(r.reason).toBe('stay');
    });

    it('live ticks agree: staged traffic memory ends on the observed road', () => {
        // Both relocation paths enabled; tickBandit's payoff path
        // reads the same trafficBelief, so this proves the paths
        // AGREE live, not that the bridge is necessary — necessity
        // is proven by the unit tests above plus the mutation below
        // (removing the bridge fails the first test while this one
        // still passes via tickBandit).
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 100000;
        const bandit = world.bandits[0];
        bandit.roadId = 'road-a';
        bandit.lootExpectation = 0.5;
        bandit.locationAge = 40;
        bandit._lastRelocationTick = -100;
        bandit.trafficBelief = {
            'road-a': { estimatedTraffic: 0, recency: 0.5, lastDecayTick: 1 },
            'road-b': { estimatedTraffic: 0, recency: 0.5, lastDecayTick: 1 },
            'road-c': { estimatedTraffic: 5, recency: 1.0, lastDecayTick: 1 },
        };
        for (let t = 1; t <= 12; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        expect(bandit.roadId).toBe('road-c');
        expect(getWorldEvents(world, { types: ['BANDIT_RELOCATION'] }).length)
            .toBeGreaterThanOrEqual(1);
    });
});
