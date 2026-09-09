/**
 * @file anticipatory-fear.test.js
 *
 * Section XXI: fear from information without direct observation.
 */

import { AnticipatoryFearEngine } from '../packages/core/index.js';

describe('Section XXI: Anticipatory Fear', () => {
    test('1. Rumors create dread for never-observed roads', () => {
        const eng = new AnticipatoryFearEngine();
        expect(eng.dreadOf('ROAD', 'north_road')).toBe(0);
        eng.absorb('ROAD', 'north_road', { confidence: 0.8, observed: false, threatLevel: 0.8 });
        expect(eng.dreadOf('ROAD', 'north_road')).toBeGreaterThan(0.2);
    });

    test('2. Observation dominates hearsay for the same evidence weight', () => {
        const rumorOnly = new AnticipatoryFearEngine();
        rumorOnly.absorb('MONSTER', 'wolf', { confidence: 0.9, observed: false, threatLevel: 0.8 });
        const seen = new AnticipatoryFearEngine();
        seen.absorb('MONSTER', 'wolf', { confidence: 0.9, observed: true, threatLevel: 0.8 });
        expect(seen.dreadOf('MONSTER', 'wolf')).toBeGreaterThan(rumorOnly.dreadOf('MONSTER', 'wolf'));
        expect(() => rumorOnly.absorb('SPACESHIP', 'x', {})).toThrow(/UNKNOWN_DREAD_TARGET/);
    });

    test('3. Dread saturates under repeated identical rumors', () => {
        const eng = new AnticipatoryFearEngine();
        for (let i = 0; i < 20; i++) eng.absorb('FACTION', 'red_clan', { confidence: 0.8, observed: false, threatLevel: 0.8 });
        const d = eng.dreadOf('FACTION', 'red_clan');
        expect(d).toBeLessThanOrEqual(1);
        expect(d).toBeGreaterThan(0.3);
        // Ten more rumors barely move saturated dread.
        for (let i = 0; i < 10; i++) eng.absorb('FACTION', 'red_clan', { confidence: 0.8, observed: false, threatLevel: 0.8 });
        expect(eng.dreadOf('FACTION', 'red_clan') - d).toBeLessThan(0.05);
    });

    test('4. Unrefreshed dread extinguishes instead of locking', () => {
        const eng = new AnticipatoryFearEngine();
        eng.absorb('REGION', 'dark_forest', { confidence: 0.8, observed: false, threatLevel: 0.8 });
        expect(eng.dreadOf('REGION', 'dark_forest')).toBeGreaterThan(0);
        eng.advanceTick(200);
        expect(eng.dreadOf('REGION', 'dark_forest')).toBe(0);
        expect(eng.auditImmutability().targetsTracked).toBe(0);
    });

    test('5. Route ranking advises AVOID on dreaded roads', () => {
        const eng = new AnticipatoryFearEngine();
        eng.absorb('ROAD', 'north_road', { confidence: 0.9, observed: false, threatLevel: 0.95 });
        eng.absorb('ROAD', 'north_road', { confidence: 0.9, observed: false, threatLevel: 0.95 });
        const ranked = eng.rankRoutes([{ id: 'north_road' }, { id: 'south_road', danger: 0.1 }]);
        expect(ranked[0].id).toBe('south_road');
        expect(ranked.find((r) => r.id === 'north_road').advisory).not.toBe('USE');
        expect(() => eng.rankRoutes('nope')).toThrow();
        expect(eng.auditImmutability().isClean).toBe(true);
        expect(eng.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
