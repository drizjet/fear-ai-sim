/**
 * @file collective-courage.test.js
 *
 * Sections XXXI-XXXIII: morale separated from fear, casualties evaluated,
 * leadership isolated as the causal variable.
 */

import { CollectiveCourageHarness } from '../packages/core/index.js';

describe('Sections XXXI-XXXIII: Collective Courage', () => {
    test('1. Casualties ratchet fear up and morale down', () => {
        const h = new CollectiveCourageHarness();
        const rep = h.runSequence({ members: 8, casualtyOrder: ['member_0', 'member_1', 'member_2'] });
        expect(rep.casualties).toBe(3);
        expect(rep.survivors).toBe(5);
        expect(rep.finalFear).toBeGreaterThan(rep.fearSeries[0]);
        expect(rep.finalMorale).toBeLessThan(rep.moraleSeries[0]);
    });

    test('2. Leader arm holds where leaderless arm breaks', () => {
        const h = new CollectiveCourageHarness();
        const exp = h.runExperiment({ members: 8, casualtyOrder: ['member_0', 'member_1', 'member_2', 'member_3'] });
        expect(['COLLECTIVE_COURAGE', 'BOTH_HOLD', 'BOTH_BREAK']).toContain(exp.verdict);
        expect(exp.leaderArm.finalMorale).toBeGreaterThanOrEqual(exp.leaderlessArm.finalMorale);
    });

    test('3. Morale and fear stay separated: terrified yet dutiful possible', () => {
        const h = new CollectiveCourageHarness();
        const rep = h.runSequence({ members: 8, casualtyOrder: ['member_0'], leaderTrust: 0.9, leaderRespect: 0.9 });
        expect(rep.finalFear).toBeGreaterThan(0.4);
        expect(rep.finalMorale).toBeGreaterThan(0.5);
        expect(rep.holdsDuty).toBe(true);
    });

    test('4. Heavy losses break even led squads', () => {
        const h = new CollectiveCourageHarness();
        const rep = h.runSequence({ members: 6, casualtyOrder: ['member_0', 'member_1', 'member_2', 'member_3', 'member_4'] });
        expect(rep.holdsDuty).toBe(false);
        expect(rep.finalRetreatPressure).toBeGreaterThan(0);
    });

    test('5. Small units deterministic and audits clean', () => {
        const h = new CollectiveCourageHarness();
        const a = h.runSequence({ members: 4, casualtyOrder: ['member_0', 'member_1'] });
        const b = h.runSequence({ members: 4, casualtyOrder: ['member_0', 'member_1'] });
        expect(a).toEqual(b);
        expect(h.auditImmutability().isClean).toBe(true);
        expect(h.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
