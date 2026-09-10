/**
 * @file information-propagation.test.js
 *
 * Section XX: rumor spread, mutation, decay, correction.
 */

import { InformationPropagationEngine, RUMOR_STATUS } from '../packages/core/index.js';

function chainNet(seed = 11) {
    const net = new InformationPropagationEngine({}, seed);
    for (const a of ['a', 'b', 'c', 'd']) net.registerAgent(a, 0.6);
    net.addListenEdge('b', 'a');
    net.addListenEdge('c', 'b');
    net.addListenEdge('d', 'c');
    return net;
}

describe('Section XX: Information Propagation', () => {
    test('1. Rumors spread along listen edges with hop decay', () => {
        const net = chainNet();
        const id = net.injectRumor('ROAD_AMBUSH', 'Ambush on north road', 'a', { confidence: 0.9 });
        net.advanceTick();
        net.advanceTick();
        net.advanceTick();
        const heldD = net.heldBy('d');
        expect(heldD.length).toBe(1);
        expect(heldD[0].confidence).toBeLessThan(0.9);
        expect(heldD[0].hops).toBe(3);
        expect(net.networkStats().totalReach).toBe(4);
    });

    test('2. Isolated agents never hear, unknown topics rejected', () => {
        const net = chainNet();
        net.registerAgent('hermit', 0.5);
        net.injectRumor('MONSTER_SIGHTING', 'Beast in the woods', 'a', { confidence: 0.8 });
        for (let t = 0; t < 5; t++) net.advanceTick();
        expect(net.heldBy('hermit')).toEqual([]);
        expect(() => net.injectRumor('ALIEN_INVASION', 'Nope', 'a')).toThrow(/UNKNOWN_RUMOR_TOPIC/);
    });

    test('3. Rumors decay without refresh and correct with trust cost', () => {
        const net = new InformationPropagationEngine({ tickDecay: 0.2 }, 5);
        net.registerAgent('a', 0.8);
        const id = net.injectRumor('LEADER_DEATH', 'Chief has fallen', 'a', { confidence: 0.3 });
        net.advanceTick();
        net.advanceTick();
        expect(net.rumors.get(id).status).toBe(RUMOR_STATUS.DECAYED);
        const net2 = chainNet();
        const id2 = net2.injectRumor('APPROACHING_ARMY', 'Army comes', 'a', { confidence: 0.8 });
        expect(net2.correctRumor(id2, false)).toBe(RUMOR_STATUS.CORRECTED);
        expect(net2.credibilityOf('a')).toBeLessThan(0.6);
        expect(() => net2.correctRumor('rumor_999', false)).toThrow(/UNKNOWN_RUMOR/);
    });

    test('4. Propagation deterministic under same seed', () => {
        const run = () => {
            const net = new InformationPropagationEngine({ mutationRate: 0.5 }, 77);
            for (const a of ['a', 'b', 'c']) net.registerAgent(a, 0.6);
            net.addListenEdge('b', 'a');
            net.addListenEdge('c', 'b');
            net.injectRumor('TRADE_OPPORTUNITY', 'Cheap grain', 'a', { confidence: 0.9 });
            for (let t = 0; t < 4; t++) net.advanceTick();
            return { c: net.heldBy('c'), stats: net.networkStats() };
        };
        expect(run()).toEqual(run());
    });

    test('5. Max hops bound reach and audits stay clean', () => {
        const net = new InformationPropagationEngine({ maxHops: 1 }, 9);
        for (const a of ['a', 'b', 'c', 'd']) net.registerAgent(a, 0.6);
        net.addListenEdge('b', 'a');
        net.addListenEdge('c', 'b');
        net.addListenEdge('d', 'c');
        net.injectRumor('SAFE_SANCTUARY', 'Cave is safe', 'a', { confidence: 0.9 });
        for (let t = 0; t < 6; t++) net.advanceTick();
        expect(net.heldBy('d')).toEqual([]);
        expect(net.heldBy('b').length).toBe(1);
        expect(net.auditImmutability().isClean).toBe(true);
        expect(net.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});

describe('Sibling-bound sweep: rumor retention', () => {
    test('6. Flood retains newest, keeps lifetime injected count, prunes inboxes', () => {
        const net = new InformationPropagationEngine({ maxRetainedRumors: 10 }, 7);
        net.registerAgent('a', 0.6);
        net.registerAgent('b', 0.6);
        net.addListenEdge('b', 'a');
        for (let i = 0; i < 15; i++) net.injectRumor('ROAD_AMBUSH', `c${i}`, 'a');
        expect(net.rumors.size).toBe(10);
        expect(net.networkStats().rumorsInjected).toBe(15);
        expect([...net.rumors.values()][0].claim).toBe('c5');
        for (const inbox of net.inboxes.values()) {
            for (const id of inbox.keys()) expect(net.rumors.has(id)).toBe(true);
        }
    });

    test('7. Terminal rumors evict before active ones', () => {
        const net = new InformationPropagationEngine({ maxRetainedRumors: 10 }, 7);
        net.registerAgent('a', 0.6);
        const decayedIds = [];
        for (let i = 0; i < 3; i++) {
            decayedIds.push(net.injectRumor('ROAD_AMBUSH', `doomed${i}`, 'a', { confidence: 0.06 }));
        }
        net.advanceTick();
        net.advanceTick();
        for (const id of decayedIds) expect(net.rumors.get(id).status).toBe(RUMOR_STATUS.DECAYED);
        for (let i = 0; i < 10; i++) net.injectRumor('ROAD_AMBUSH', `fresh${i}`, 'a');
        expect(net.rumors.size).toBe(10);
        for (const id of decayedIds) expect(net.rumors.has(id)).toBe(false);
        expect([...net.rumors.values()].every(r => r.status === RUMOR_STATUS.ACTIVE)).toBe(true);
    });
});

describe('NEXT-42: post-cap flood dynamics', () => {
    test('8. Flood preserves spread, fresh rumors propagate, terminal evicts first', async () => {
        const tiny = { cap: 500, sizes: [10, 600], spreadTicks: 10 };
        const { runFloodDynamics } = await import('../benchmarks/behavioral-evaluation/rumor_flood_dynamics.mjs');
        const a = runFloodDynamics(tiny);
        // Deterministic modulo wall clock: strip timing before comparing.
        const strip = (r) => ({ ...r, loads: r.loads.map(({ wallMs, ...rest }) => rest) });
        expect(strip(runFloodDynamics(tiny))).toEqual(strip(a));
        const [control, flood] = a.loads;
        expect(control.retained).toBe(10);
        expect(flood.retained).toBe(500);
        // Spread machinery intact under flood: per-rumor throughput holds.
        expect(flood.heardPerRumor).toBe(control.heardPerRumor);
        expect(a.freshReached).toBe(true);
        // Terminal-first eviction with oldest-active FIFO behind it.
        expect(a.terminalFirst.decayedBefore).toBe(30);
        expect(a.terminalFirst.decayedRetained).toBe(0);
        expect(a.terminalFirst.oldestRetained).toBe('new20');
    });
});

describe('NEXT-59/60: dense topology and spread budget', () => {
    test('9. Dense flood spreads wide; budget caps per-tick work and defers losslessly', async () => {
        const { runDenseFlood } = await import('../benchmarks/behavioral-evaluation/rumor_flood_dynamics.mjs');
        const open = runDenseFlood({});
        expect(runDenseFlood({})).toEqual(open);
        // Dense n=8: 10x the chain work for proportional spread; fresh reaches all.
        expect(open.retained).toBe(500);
        expect(open.heard).toBe(3500);
        expect(open.freshHolders).toBe(8);
        // Budget 100: exactly 100/tick, deferred fresh (3/8 in 3 ticks).
        const capped = runDenseFlood({ budget: 100 });
        expect(runDenseFlood({ budget: 100 })).toEqual(capped);
        expect(capped.heard).toBe(1000);
        expect(capped.peakPerTick).toBe(100);
        expect(capped.freshHolders).toBe(3);
        expect(capped.freshHolders).toBeLessThan(open.freshHolders);
        // Budget 0 is a kill switch: nothing spreads, origin keeps its rumor.
        const off = runDenseFlood({ budget: 0 });
        expect(off.heard).toBe(0);
        expect(off.peakPerTick).toBe(0);
        expect(off.freshHolders).toBe(1);
    });
});
