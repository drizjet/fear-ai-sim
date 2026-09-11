import { describe, it, expect } from '@jest/globals';
import {
    InformationPropagationEngine,
    AnticipatoryFearEngine,
    susceptibilityFromTraits,
} from '../packages/core/index.js';

// NEXT-165 (post-25 candidate 5): identity-conditioned rumor
// susceptibility. Listeners take rumors at received confidence scaled
// by an opt-in susceptibility multiplier (e.g. from
// susceptibilityFromTraits over neuroticism/openness); absent
// multipliers behave exactly as before. Combined with the
// identity-tinted dread uptake, the same rumor frightens hot
// identities more than guarded ones through live machinery.
const HOT = { neuroticism: 0.9, openness: 0.9 };
const NEUTRAL = { neuroticism: 0.5, openness: 0.5 };
const COLD = { neuroticism: 0.1, openness: 0.1 };

function hear(traits, seed = 2026) {
    const net = new InformationPropagationEngine({}, seed);
    net.registerAgent('alarmist', 0.8);
    net.registerAgent('listener', 0.5);
    net.addListenEdge('listener', 'alarmist');
    net.setSusceptibility('listener', susceptibilityFromTraits(traits));
    const rumorId = net.injectRumor('APPROACHING_ARMY', 'Army marching', 'alarmist', { confidence: 0.85 });
    const fear = new AnticipatoryFearEngine({}, traits);
    for (let t = 0; t < 6; t++) {
        net.advanceTick();
        for (const held of net.heldBy('listener')) {
            if (held.rumorId === rumorId) {
                fear.absorb('FACTION', 'invading_army', { confidence: held.confidence, observed: false, threatLevel: 0.9 });
            }
        }
        fear.advanceTick();
    }
    return { net, rumorId, fear };
}

describe('NEXT-165: identity-conditioned rumor susceptibility', () => {
    it('1. Trait mapping is neutral at 0.5 and bounded', () => {
        expect(susceptibilityFromTraits(NEUTRAL)).toBe(1);
        expect(susceptibilityFromTraits(HOT)).toBeCloseTo(1.2, 10);
        expect(susceptibilityFromTraits(COLD)).toBeCloseTo(0.8, 10);
        expect(susceptibilityFromTraits({})).toBe(1);
        expect(susceptibilityFromTraits({ neuroticism: 9, openness: 9 })).toBe(1.25);
        expect(susceptibilityFromTraits({ neuroticism: -9, openness: -9 })).toBe(0.75);
    });

    it('2. Legacy listeners hold identical copies', () => {
        const mk = () => {
            const net = new InformationPropagationEngine({}, 2026);
            net.registerAgent('a', 0.8);
            net.registerAgent('b', 0.5);
            net.addListenEdge('b', 'a');
            net.injectRumor('APPROACHING_ARMY', 'Army marching', 'a', { confidence: 0.85 });
            for (let t = 0; t < 3; t++) net.advanceTick();
            return net.heldBy('b')[0].confidence;
        };
        expect(mk()).toBe(mk());
    });

    it('3. Hot listeners hold hotter copies than guarded ones', () => {
        const hot = hear(HOT).net.heldBy('listener')[0].confidence;
        const cold = hear(COLD).net.heldBy('listener')[0].confidence;
        const neutral = hear(NEUTRAL).net.heldBy('listener')[0].confidence;
        expect(hot).toBeGreaterThan(neutral);
        expect(neutral).toBeGreaterThan(cold);
    });

    it('4. End-to-end dread orders hot above guarded through live machinery', () => {
        const dreadOf = (traits) => hear(traits).fear.dreadOf('FACTION', 'invading_army');
        const hot = dreadOf(HOT);
        const neutral = dreadOf(NEUTRAL);
        const cold = dreadOf(COLD);
        expect(hot).toBeGreaterThan(neutral);
        expect(neutral).toBeGreaterThan(cold);
        expect(hot).toBeGreaterThanOrEqual(0.6);
    });

    it('5. Malformed susceptibility degrades to legacy', () => {
        const net = new InformationPropagationEngine({}, 2026);
        expect(net.setSusceptibility('x', NaN)).toBe(1.0);
        expect(net.setSusceptibility('x', 99)).toBe(1.5);
        expect(net.setSusceptibility('x', -99)).toBe(0.5);
    });

    it('6. Susceptible runs replay exactly', () => {
        const run = () => hear(HOT).fear.dreadOf('FACTION', 'invading_army');
        expect(run()).toBe(run());
    });
});
