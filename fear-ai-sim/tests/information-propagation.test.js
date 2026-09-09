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
