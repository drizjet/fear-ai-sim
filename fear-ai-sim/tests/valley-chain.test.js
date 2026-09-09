/**
 * @file valley-chain.test.js
 *
 * Sections CCVII-CCIX: the canonical ambush-to-retaliation chain holds.
 */

import { ValleyChainScenario, CHAIN_LINKS } from '../packages/core/index.js';

describe('Sections CCVII-CCIX: Valley Chain', () => {
    test('1. Canonical chain runs unbroken end to end', () => {
        const scenario = new ValleyChainScenario();
        const rep = scenario.run({ seed: 424242 });
        expect(rep.unbroken).toBe(true);
        expect(rep.summary).toContain('AMBUSH:OK');
        expect(rep.summary).toContain('RETALIATION:OK');
        expect(CHAIN_LINKS.length).toBe(7);
    });

    test('2. Chain deterministic under same seed', () => {
        const scenario = new ValleyChainScenario();
        expect(scenario.run({ seed: 7 })).toEqual(scenario.run({ seed: 7 }));
    });

    test('3. Rumor reaches the valley and dread avoids the pass', () => {
        const scenario = new ValleyChainScenario();
        const rep = scenario.run({ seed: 99 });
        expect(rep.links.RUMOR.reach).toBeGreaterThanOrEqual(3);
        expect(rep.links.AVOIDANCE.avoidsHighland).toBe(true);
        expect(rep.links.AVOIDANCE.ranked[0].id).toBe('low_road');
    });

    test('4. Scarcity and retaliation close the chain', () => {
        const scenario = new ValleyChainScenario();
        const rep = scenario.run({ seed: 424242 });
        expect(rep.links.SCARCITY.advisory).not.toBe('STABLE');
        expect(rep.links.RETALIATION.grievance).toBeGreaterThan(0);
    });

    test('5. Audits stay clean', () => {
        const scenario = new ValleyChainScenario();
        scenario.run({});
        expect(scenario.auditImmutability().isClean).toBe(true);
        expect(scenario.auditImmutability().runs).toBe(1);
        expect(scenario.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
