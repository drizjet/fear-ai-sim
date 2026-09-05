import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';
import { createPatrol, tickPatrol, tickBandit } from '../canonical-trade-system.js';
// (0.95/tick). Notoriety follows the bandit; road familiarity (E6)
// stays with the patrol. rng 0.45 splits the 0.4 base from a hot
// 0.7 exactly like the E6 draw.

function hotWorld(raids = 5) {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.factions.find(f => f.id === 'north-faction').resources = 1000;
    // Factionless raider: staged attacks must not earn a lawfulness
    // attention bonus (Slice V), or detection would be attributable
    // to faction memory instead of bandit heat. Heat lives on the
    // bandit object and needs no faction.
    world.bandits[0].factionId = null;
    const merchant = world.merchants[0];
    for (let t = 1; t <= raids; t++) {
        merchant.cargo = 20;
        merchant.cargoKind = 'food';
        merchant.selectedRoute = 'road-a';
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: t });
    }
    return world;
}
function freshPatrolOn(world, road) {
    world.patrols = [createPatrol({
        id: 'p1', route: road, detectionRate: 0.4,
        interceptionRate: 0, travelCost: 0,
    })];
}

function stageAttack(world, tick, road, banditId = 'bandits-1') {
    return appendWorldEvent(world, {
        type: 'BANDIT_ATTACK', roadId: road, banditId,
        merchantId: 'm1', lost: 5, tick, attackOpportunityId: `heat-${road}-${banditId}-${tick}`,
    });
}

const HOT_RNG = () => 0.45;

describe('E10 bandit heat', () => {
    it('notoriety follows the bandit to a fresh road and patrol', () => {
        const world = hotWorld();
        expect(world.bandits[0].heat).toBeCloseTo(1, 10);
        world.bandits[0].roadId = 'road-b';
        freshPatrolOn(world, 'road-b');
        stageAttack(world, 100, 'road-b');
        const r = tickPatrol(world, 'p1', { tick: 100, rng: HOT_RNG });
        expect(world.patrols[0].detections).toBe(1);
        expect(r.events[0]?.enforcementWhy.heatBonus).toBeCloseTo(0.3, 10);
    });

    it('a fresh bandit misses at the same draw (negative control)', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.factions.find(f => f.id === 'north-faction').resources = 1000;
        expect(world.bandits[0].heat ?? 0).toBe(0);
        freshPatrolOn(world, 'road-a');
        stageAttack(world, 1, 'road-a');
        tickPatrol(world, 'p1', { tick: 1, rng: HOT_RNG });
        expect(world.patrols[0].detections).toBe(0);
    });

    it('heat caps at 1 and cools when quiet', () => {
        const world = hotWorld(20);
        expect(world.bandits[0].heat).toBeCloseTo(1, 10);
        for (let t = 101; t <= 160; t++) {
            tickBandit(world, 'bandits-1', { tick: t, rng: () => 1 });
        }
        // 0.95^60 ≈ 0.046: the bonus drops below the marginal draw.
        expect(world.bandits[0].heat).toBeLessThan(0.1);
        freshPatrolOn(world, 'road-a');
        stageAttack(world, 200, 'road-a');
        const r = tickPatrol(world, 'p1', { tick: 200, rng: HOT_RNG });
        expect(world.patrols[0].detections).toBe(0);
        expect(r.events[0]?.enforcementWhy.heatBonus).toBeLessThan(0.05);
    });

    it('heat is per-bandit: the hot one is seen, the unknown one is not', () => {
        const world = hotWorld();
        freshPatrolOn(world, 'road-a');
        stageAttack(world, 100, 'road-a', 'bandits-1');
        stageAttack(world, 100, 'road-a', 'bandits-2');
        tickPatrol(world, 'p1', { tick: 100, rng: HOT_RNG });
        // First attack (hot) detects and teaches the road (+1
        // familiarity, still far below the E6 flip); the second
        // (unknown, heat 0, familiarity 0.02) misses.
        expect(world.patrols[0].detections).toBe(1);
    });

    it('heat survives save/load with identical follow-up detection', () => {
        const world = hotWorld();
        const resumed = loadWorld(saveWorld(world));
        expect(resumed.bandits[0].heat).toBe(world.bandits[0].heat);
        for (const twin of [world, resumed]) {
            twin.bandits[0].roadId = 'road-b';
            freshPatrolOn(twin, 'road-b');
            stageAttack(twin, 100, 'road-b');
        }
        const a = tickPatrol(world, 'p1', { tick: 100, rng: HOT_RNG });
        const b = tickPatrol(resumed, 'p1', { tick: 100, rng: HOT_RNG });
        expect(b.events.map(e => e.type)).toEqual(a.events.map(e => e.type));
        // Absolute anchor: heat must actually flip the draw on both
        // twins (twin-equality alone passes vacuously when both miss).
        expect(world.patrols[0].detections).toBe(1);
        expect(resumed.patrols[0].detections).toBe(1);
    });
});
