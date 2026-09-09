/**
 * @file blockade.test.js
 *
 * Section LIII: denial as strategy, priced for both sides.
 */

import { BlockadeEngine } from '../packages/core/index.js';

describe('Section LIII: Blockade', () => {
    test('1. Declared blockades throttle corridors without touching them', () => {
        const eng = new BlockadeEngine();
        const id = eng.declare('red_clan', 'blue_hold', ['north_road', 'east_pass'], { commitment: 0.8 });
        const table = eng.throttleTable();
        expect(table.north_road).toBeLessThan(1);
        expect(table.north_road).toBeGreaterThanOrEqual(0);
        expect(eng.assess(id).advisory).toBe('STRANGLEHOLD');
    });

    test('2. More corridors dilute sealing power', () => {
        const eng = new BlockadeEngine();
        const one = eng.declare('a', 'b', ['r1'], { commitment: 0.8 });
        const many = eng.declare('a', 'c', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'], { commitment: 0.8 });
        expect(eng.assess(many).deprivation).toBeLessThan(eng.assess(one).deprivation);
        expect(() => eng.declare('a', 'a', ['r1'])).toThrow(/INVALID_BLOCKADE_PARTIES/);
        expect(() => eng.declare('a', 'b', [])).toThrow(/BLOCKADE_NEEDS_CORRIDORS/);
    });

    test('3. Runners erode, recommitment restores, lifting ends upkeep', () => {
        const eng = new BlockadeEngine();
        const id = eng.declare('a', 'b', ['r1'], { commitment: 0.6 });
        const fresh = eng.assess(id).deprivation;
        eng.advanceTick(30);
        expect(eng.assess(id).deprivation).toBeLessThan(fresh);
        eng.recommit(id, 0.9);
        expect(eng.assess(id).deprivation).toBeGreaterThan(0.5);
        const closed = eng.lift(id);
        expect(closed.upkeepPaid).toBeGreaterThan(0);
        expect(eng.throttleTable()).toEqual({});
        expect(() => eng.recommit('blockade_999', 0.5)).toThrow(/UNKNOWN_BLOCKADE/);
    });

    test('4. Starved blockades advise lifting when costs exceed pain', () => {
        const eng = new BlockadeEngine({ upkeepPerTick: 0.5, leakageRate: 0.05 });
        const id = eng.declare('a', 'b', ['r1'], { commitment: 0.3 });
        eng.advanceTick(10);
        const a = eng.assess(id);
        expect(['LIFT_NOT_WORTH_IT', 'PRESSURE', 'COLLAPSED']).toContain(a.advisory);
        expect(a.runnerIncentive).toBeGreaterThanOrEqual(0);
    });

    test('5. Audits stay clean', () => {
        const eng = new BlockadeEngine();
        eng.declare('a', 'b', ['r1']);
        expect(eng.auditImmutability().isClean).toBe(true);
        expect(eng.auditImmutability().blockadesActive).toBe(1);
        expect(eng.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
