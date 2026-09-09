/**
 * @file movement-motives.test.js
 *
 * Section LVI: why-move ranking per band snapshot.
 */

import { MovementMotiveRanker, MOVEMENT_MOTIVES } from '../packages/core/index.js';

describe('Section LVI: Movement Motives', () => {
    test('1. Starving caravans rank food first, rich ones trade', () => {
        const r = new MovementMotiveRanker();
        const hungry = r.topMotive({ hunger: 0.95, archetype: 'TRADE_CARAVAN', wealth: 20 });
        expect(hungry.motive).toBe('FOOD');
        const rich = r.topMotive({ hunger: 0.1, fear: 0.1, archetype: 'TRADE_CARAVAN', wealth: 90 });
        expect(rich.motive).toBe('TRADE');
        expect(MOVEMENT_MOTIVES.length).toBe(11);
    });

    test('2. Refugees flee, patrols patrol, raiders raid', () => {
        const r = new MovementMotiveRanker();
        expect(r.topMotive({ fear: 0.9, rumorDread: 0.7, archetype: 'DISPLACED_REFUGEES' }).motive).toBe('SAFETY');
        expect(r.topMotive({ fear: 0.1, archetype: 'PATROL_GUARD' }).motive).toBe('TERRITORIAL_PATROL');
        expect(r.topMotive({ hunger: 0.5, archetype: 'BANDIT_RAIDERS' }).motive).toBe('RAIDING');
    });

    test('3. Exhaustion damps movement toward camp logic', () => {
        const r = new MovementMotiveRanker();
        const fresh = r.topMotive({ hunger: 0.6, fatigue: 0, archetype: 'NOMADIC_TRIBE' });
        const spent = r.rank({ hunger: 0.6, fatigue: 1, archetype: 'NOMADIC_TRIBE' });
        expect(spent[0].weight).toBeLessThan(fresh.weight);
    });

    test('4. Rumor dread moves the fearful without any sighting', () => {
        const r = new MovementMotiveRanker();
        const calm = r.topMotive({ fear: 0.1, rumorDread: 0, archetype: 'NOMADIC_TRIBE', hunger: 0.3 });
        const spooked = r.topMotive({ fear: 0.1, rumorDread: 0.9, archetype: 'NOMADIC_TRIBE', hunger: 0.3 });
        expect(spooked.ranked.find((m) => m.motive === 'RUMOR').weight)
            .toBeGreaterThan(calm.ranked.find((m) => m.motive === 'RUMOR').weight);
    });

    test('5. Rankings deterministic with decisiveness margins', () => {
        const r = new MovementMotiveRanker();
        const band = { hunger: 0.7, fear: 0.4, archetype: 'HERD_BEASTS' };
        expect(r.topMotive(band)).toEqual(r.topMotive({ ...band }));
        expect(r.topMotive(band).margin).toBeGreaterThanOrEqual(0);
        expect(r.auditImmutability().isClean).toBe(true);
        expect(r.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
