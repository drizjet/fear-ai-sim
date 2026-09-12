import { describe, it, expect } from '@jest/globals';
import { InformationPropagationEngine } from '../packages/core/index.js';
import { AnticipatoryFearEngine } from '../packages/core/index.js';
import { ValleyChainScenario } from '../packages/core/index.js';

// R13: misinformation-to-avoidance chain (probe, no production change).
// The valley scenario proves the TRUE-encounter chain (ambush -> danger ->
// rumor -> dread -> avoidance). This probe runs the same downstream links
// from a FABRICATED rumor with no encounter anywhere: a liar injects a
// ROAD_AMBUSH claim about highland_pass that never happened. It measures
// how far the false chain travels versus the true chain, and whether
// authoritative correction retracts the dread.

const SEED = 424242;

function valleyNet(net) {
    for (const a of ['survivor', 'elder', 'merchant', 'guard', 'smith']) {
        net.registerAgent(a, a === 'elder' ? 0.8 : 0.5);
    }
    net.addListenEdge('elder', 'survivor');
    net.addListenEdge('merchant', 'elder');
    net.addListenEdge('guard', 'elder');
    net.addListenEdge('smith', 'merchant');
}

function falseChain() {
    // No encounter, no hazard, no escort: pure fabrication by 'liar'.
    const net = new InformationPropagationEngine({}, SEED);
    valleyNet(net);
    net.registerAgent('liar', 0.5);
    net.addListenEdge('elder', 'liar');
    const rumorId = net.injectRumor(
        'ROAD_AMBUSH',
        'HIGHWAY_AMBUSH resolved as COMBAT_ENGAGEMENT near highland_pass',
        'liar',
        { confidence: 0.8 }
    );
    for (let t = 0; t < 6; t++) net.advanceTick();
    const dread = new AnticipatoryFearEngine();
    for (const held of net.heldBy('merchant')) {
        if (held.rumorId === rumorId) {
            dread.absorb('ROAD', 'highland_pass', { confidence: held.confidence, observed: false, threatLevel: 0.85 });
        }
    }
    const ranked = dread.rankRoutes([{ id: 'highland_pass' }, { id: 'low_road', danger: 0.15 }]);
    return {
        net, dread, rumorId,
        reach: net.networkStats().totalReach,
        status: net.rumors.get(rumorId).status,
        highlandDread: dread.dreadOf('ROAD', 'highland_pass'),
        ranked,
        avoidsHighland: ranked[0].id !== 'highland_pass',
    };
}

describe('R13: false-rumor cascade versus the true valley chain', () => {
    it('1. Fabrication travels every link at identical magnitude', () => {
        const truth = new ValleyChainScenario().run({ seed: SEED });
        expect(truth.unbroken).toBe(true);
        const lie = falseChain();
        // The false rumor propagates and forms real dread without any
        // encounter: hearsay is hearsay to the dread engine.
        expect(lie.reach).toBeGreaterThanOrEqual(3);
        expect(lie.highlandDread).toBeGreaterThan(0.15);
        expect(lie.avoidsHighland).toBe(true);
        // Corrected assumption (first draft wrongly expected less): at
        // EQUAL nominal confidence the false rumor forms IDENTICAL dread —
        // the merchant absorbs hearsay in both chains (only the survivor
        // observed anything, and the survivor is not the merchant). The
        // engine cannot tell truth from lies at equal confidence; truth
        // wins only through higher-confidence or observed channels.
        expect(lie.highlandDread).toBe(truth.links.DREAD.highlandDread);
        expect(lie.status).toBe('ACTIVE');
    });

    it('2. Correction marks the rumor and taxes the liar, but dread lingers', () => {
        const lie = falseChain();
        const before = lie.highlandDread;
        const status = lie.net.correctRumor(lie.rumorId, false);
        expect(status).toBe('CORRECTED');
        expect(lie.net.credibilityOf('liar')).toBeCloseTo(0.35, 10);
        // Finding: nothing retracts absorbed dread — the merchant keeps
        // avoiding highland_pass after the debunk. Correction stops spread
        // (status flip) but not the fear it already caused.
        const ranked = lie.dread.rankRoutes([{ id: 'highland_pass' }, { id: 'low_road', danger: 0.15 }]);
        expect(ranked[0].id).not.toBe('highland_pass');
        expect(lie.dread.dreadOf('ROAD', 'highland_pass')).toBe(before);
    });

    it('3. A taxed liar reaches the same ears with weaker copies', () => {
        const first = falseChain();
        first.net.correctRumor(first.rumorId, false);
        // Corrected premise (first draft wrongly expected smaller reach):
        // delivery is topological, so the taxed liar reaches the same ears;
        // credibility taxes the RECEIVED confidence instead.
        const rumorId2 = first.net.injectRumor('ROAD_AMBUSH', 'another ambush near highland_pass', 'liar', { confidence: 0.8 });
        for (let t = 0; t < 6; t++) first.net.advanceTick();
        const reach1 = first.net.rumors.get(first.rumorId).recipients.size;
        const reach2 = first.net.rumors.get(rumorId2).recipients.size;
        expect(reach2).toBe(reach1);
        const conf1 = first.net.heldBy('merchant').find((h) => h.rumorId === first.rumorId)?.confidence ?? 0;
        const conf2 = first.net.heldBy('merchant').find((h) => h.rumorId === rumorId2)?.confidence ?? 0;
        expect(conf2).toBeLessThan(conf1);
        expect(first.net.credibilityOf('liar')).toBeCloseTo(0.35, 10);
    });

    it('4. False chain replays exactly under the same seed', () => {
        const a = falseChain();
        const b = falseChain();
        expect(b.reach).toBe(a.reach);
        expect(b.highlandDread).toBe(a.highlandDread);
        expect(JSON.stringify(b.ranked)).toBe(JSON.stringify(a.ranked));
    });
});
