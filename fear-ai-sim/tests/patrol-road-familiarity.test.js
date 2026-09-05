import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { createPatrol, tickPatrol } from '../canonical-trade-system.js';

// E6 — patrol road familiarity. A patrol that keeps working the same
// road learns it: every attack exposure on the deployed route counts
// toward a per-road familiarity (10 exposures to full), worth up to
// +0.2 detection. Lawfulness (who) and familiarity (where) are
// independent channels; redeploying starts over on the new road.

function exposedWorld() {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.patrols = [createPatrol({
        id: 'p1', route: 'road-a', detectionRate: 0.4,
        interceptionRate: 0, travelCost: 0,
    })];
    world.factions.find(f => f.id === 'north-faction').resources = 1000;
    return world;
}

function stageAttack(world, tick, road = 'road-a') {
    appendWorldEvent(world, {
        type: 'BANDIT_ATTACK', roadId: road, banditId: 'b1',
        merchantId: 'm1', lost: 5, tick, attackOpportunityId: `atk-${road}-${tick}`,
    });
}

// rng 0.55 needs a 0.15 bonus to flip: the first 8 attacks miss
// (bonus <= 0.14), attack 9 onward hits (bonus >= 0.16). The draw
// is fixed, so any detection delta is learning, not luck.
const MARGINAL_RNG = () => 0.55;

describe('E6 patrol road familiarity', () => {
    it('exposure sharpens detection: 8 misses then hits at the same draw', () => {
        const world = exposedWorld();
        for (let t = 1; t <= 8; t++) {
            stageAttack(world, t);
            tickPatrol(world, 'p1', { tick: t, rng: MARGINAL_RNG });
            expect(world.patrols[0].detections).toBe(0);
        }
        expect(world.patrols[0].roadFamiliarity?.['road-a']).toBe(8);
        for (let t = 9; t <= 16; t++) {
            stageAttack(world, t);
            tickPatrol(world, 'p1', { tick: t, rng: MARGINAL_RNG });
            expect(world.patrols[0].detections).toBe(t - 8);
        }
    });

    it('the bonus is bounded, audited, and independent of the lawfulness channel', () => {
        const world = exposedWorld();
        let why = null;
        for (let t = 1; t <= 30; t++) {
            stageAttack(world, t);
            const r = tickPatrol(world, 'p1', { tick: t, rng: MARGINAL_RNG });
            why = r.events[0]?.enforcementWhy ?? why;
        }
        expect(why.familiarityBonus).toBeCloseTo(0.2, 10);
        expect(why.baseDetectionRate).toBe(0.4);
        expect(why.lawfulnessAttentionBonus).toBe(0);
        expect(why.effectiveDetectionRate).toBeCloseTo(0.6, 10);
    });
    it('familiarity is per-road: redeploying starts over', () => {
        const world = exposedWorld();
        for (let t = 1; t <= 10; t++) {
            stageAttack(world, t);
            tickPatrol(world, 'p1', { tick: t, rng: MARGINAL_RNG });
        }
        // Attacks 9-10 already hit on road-a (bonus 0.16+ beats 0.55).
        expect(world.patrols[0].detections).toBe(2);
        world.patrols[0].deployedRoute = 'road-b';
        stageAttack(world, 11, 'road-b');
        const r = tickPatrol(world, 'p1', { tick: 11, rng: MARGINAL_RNG });
        expect(world.patrols[0].detections).toBe(2);
        expect(r.events[0]?.enforcementWhy.familiarityBonus).toBe(0);
    });

    it('familiarity survives save/load with identical follow-up detection', () => {
        const world = exposedWorld();
        for (let t = 1; t <= 5; t++) {
            stageAttack(world, t);
            tickPatrol(world, 'p1', { tick: t, rng: MARGINAL_RNG });
        }
        const resumed = loadWorld(saveWorld(world));
        expect(resumed.patrols[0].roadFamiliarity?.['road-a']).toBe(5);
        for (let t = 6; t <= 10; t++) {
            stageAttack(world, t);
            stageAttack(resumed, t);
            const a = tickPatrol(world, 'p1', { tick: t, rng: MARGINAL_RNG });
            const b = tickPatrol(resumed, 'p1', { tick: t, rng: MARGINAL_RNG });
            expect(b.events.map(e => e.type)).toEqual(a.events.map(e => e.type));
        }
    });
});
