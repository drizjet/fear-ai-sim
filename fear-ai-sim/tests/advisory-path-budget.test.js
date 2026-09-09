/**
 * @file advisory-path-budget.test.js
 *
 * Sections CCXXI-CCXXII + CXLI-CXLII:
 * Performance regression budgets measured before any optimization:
 * per-link advisory costs, full-chain ceiling, and heap growth bounds
 * across repeated runs (leak detection). Budgets that fail are data
 * for LOD demotion, never silent corruption.
 */

import { ValleyChainScenario } from '../packages/core/index.js';
import { EncounterConsequenceEngine } from '../packages/core/index.js';
import { InformationPropagationEngine } from '../packages/core/index.js';
import { AnticipatoryFearEngine } from '../packages/core/index.js';
import { ScarcityPressureHarness } from '../packages/core/index.js';
import { EconomicFeedbackSystem } from '../packages/core/index.js';
import { RetaliationModel } from '../packages/core/index.js';

function timed(fn) {
    const t0 = performance.now();
    const out = fn();
    return { out, ms: performance.now() - t0 };
}
const BUDGETS = Object.freeze({
    fullChainMs: 500,
    singleLinkMs: 200
});

describe('Sections CCXXI-CCXXII + CXLI-CXLII: Advisory Path Budget', () => {
    test('1. Full canonical chain runs inside budget', () => {
        const scenario = new ValleyChainScenario();
        const { out, ms } = timed(() => scenario.run({ seed: 424242 }));
        expect(out.unbroken).toBe(true);
        expect(ms).toBeLessThan(BUDGETS.fullChainMs);
    });

    test('2. Every link resolves inside the single-link budget', () => {
        const consequence = new EncounterConsequenceEngine();
        const net = new InformationPropagationEngine({}, 7);
        net.registerAgent('a', 0.6);
        net.registerAgent('b', 0.6);
        net.addListenEdge('b', 'a');
        const dread = new AnticipatoryFearEngine();
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('hold', { population: 40 });
        const scarcity = new ScarcityPressureHarness();
        const retaliation = new RetaliationModel();
        const links = [
            () => consequence.process({ category: 'HIGHWAY_AMBUSH', resolution: 'COMBAT_ENGAGEMENT', corridorId: 'r1' }),
            () => { const id = net.injectRumor('ROAD_AMBUSH', 'Ambush', 'a', { confidence: 0.8 }); net.advanceTick(); return net.heldBy('b'); },
            () => dread.absorb('ROAD', 'r1', { confidence: 0.8, observed: false, threatLevel: 0.8 }),
            () => { econ.tick(5); return scarcity.score(econ, 'hold'); },
            () => { retaliation.provoke('x', 'y', 'RAID'); return retaliation.recommend('x', 'y'); }
        ];
        for (const link of links) {
            const { ms } = timed(link);
            expect(ms).toBeLessThan(BUDGETS.singleLinkMs);
        }
    });
    test('3. Repeated chains retain no per-run state (leak detection)', () => {
        const scenario = new ValleyChainScenario();
        for (let i = 0; i < 100; i++) {
            const rep = scenario.run({ seed: i });
            expect(rep.unbroken).toBe(true);
        }
        // Structural bound: the scenario keeps a run counter, never run data.
        expect(scenario.auditImmutability().runs).toBe(100);
        expect(Object.keys(scenario).length).toBeLessThanOrEqual(2);
        // Loose heap guard catches true leaks while tolerating GC scheduling noise.
        global.gc?.();
        const before = process.memoryUsage().heapUsed;
        for (let i = 0; i < 50; i++) scenario.run({ seed: i });
        global.gc?.();
        const after = process.memoryUsage().heapUsed;
        expect(after - before).toBeLessThan(64 * 1024 * 1024);
    });

    test('4. Rumor network bounds memory under injection load', () => {
        const net = new InformationPropagationEngine({}, 3);
        net.registerAgent('a', 0.6);
        for (let i = 0; i < 200; i++) {
            const id = net.injectRumor('TRADE_OPPORTUNITY', `Deal ${i}`, 'a', { confidence: 0.9 });
            void id;
        }
        for (let t = 0; t < 300; t++) net.advanceTick();
        const stats = net.networkStats();
        expect(stats.rumorsActive).toBe(0);
        expect(stats.rumorsInjected).toBe(200);
    });
});
