/**
 * @file dependency-restraint-interaction.test.js
 *
 * CCV edge closure + CCII red-team regression:
 * TradeDependencyEngine restraint flows into RetaliationModel
 * recommendations, and adversarial storms cannot produce eternal war
 * from trivia or collapse identity under maximum trauma.
 */

import {
    TradeDependencyEngine, RetaliationModel,
    CharacterIdentityArchitecture
} from '../packages/core/index.js';

const GRAIN_LEDGER = [
    { sourceId: 'granary', destId: 'mill_town', commodity: 'food', amount: 80, tick: 5 },
    { sourceId: 'forest', destId: 'mill_town', commodity: 'timber', amount: 20, tick: 6 }
];

describe('CCV: dependency restrains retaliation', () => {
    test('1. Restrained recommendation softens the answer in one call', () => {
        const eng = new TradeDependencyEngine();
        const model = new RetaliationModel();
        model.provoke('granary', 'mill_town', 'RAID');
        const plain = model.recommend('granary', 'mill_town');
        const composed = eng.restrainedRecommend(GRAIN_LEDGER, model, 'mill_town', 'granary', 'granary', 'mill_town', 100);
        expect(composed.recommendation.level).toBeLessThan(plain.level);
        expect(composed.advisory).toBe('AVOID_CONFLICT');
        expect(() => eng.restrainedRecommend(GRAIN_LEDGER, {}, 'a', 'b', 'a', 'b')).toThrow(/MODEL_MUST_RECOMMEND/);
    });

    test('2. Independent factions answer at full strength', () => {
        const eng = new TradeDependencyEngine();
        const model = new RetaliationModel();
        model.provoke('granary', 'mill_town', 'RAID');
        const composed = eng.restrainedRecommend([], model, 'mill_town', 'granary', 'granary', 'mill_town');
        expect(composed.recommendation.level).toBe(model.recommend('granary', 'mill_town').level);
        expect(composed.advisory).toBe('NO_RESTRAINT');
    });

    test('NEXT-36. Default basis damps through the composed call, not just the primitive', () => {
        // NOW-31 fixed dependencyOf; restrainedRecommend forwards its own
        // nowTick default, so the composed path needs its own pin: with no
        // explicit tick, a dependent importer must still get restraint.
        const eng = new TradeDependencyEngine();
        const model = new RetaliationModel();
        model.provoke('granary', 'mill_town', 'RAID');
        const plain = model.recommend('granary', 'mill_town');
        const composed = eng.restrainedRecommend(GRAIN_LEDGER, model, 'mill_town', 'granary', 'granary', 'mill_town');
        expect(composed.recommendation.level).toBeLessThan(plain.level);
        expect(composed.advisory).toBe('AVOID_CONFLICT');
        expect(composed.dependency.ratio).toBeCloseTo(0.8, 4);
    });
});

describe('CCII red-team: no eternal war, no identity collapse', () => {
    test('3. Insult storm with settlement never exceeds WARN', () => {
        const model = new RetaliationModel();
        let maxLevel = 0;
        let maxIntent = 'IGNORE';
        for (let t = 0; t < 2000; t++) {
            const rec = model.provoke('a', 'b', 'INSULT');
            model.settle('a', 'b', 0.5);
            model.advanceTick(1, false);
            if (rec.level > maxLevel) { maxLevel = rec.level; maxIntent = rec.intent; }
        }
        expect(maxLevel).toBeLessThan(0.2);
        expect(['IGNORE', 'OBSERVE', 'WARN']).toContain(maxIntent);
    });

    test('4. Massacre storm saturates bounded and recovers with peace', () => {
        const model = new RetaliationModel();
        for (let t = 0; t < 500; t++) model.provoke('a', 'b', 'MASSACRE');
        const peak = model.recommend('a', 'b');
        expect(peak.level).toBeLessThanOrEqual(1);
        expect(peak.intent).toBe('STRIKE_BACK');
        model.advanceTick(3000, false);
        expect(model.recommend('a', 'b').level).toBeLessThan(0.1);
    });

    test('5. Ten thousand max-trauma ticks bound drift without collapse', () => {
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('victim', { neuroticism: 0.9, resilience: 0.05 });
        for (let t = 0; t < 10000; t++) {
            arch.tick('victim',
                { trauma: 0.05, learnedDanger: 0.05, confidence: -0.05 },
                { fear: 1, perceivedDanger: 1, urgency: 1 });
        }
        expect(arch.drift('victim')).toBeLessThan(0.6);
        expect(arch.adaptiveFor('victim').trauma).toBeLessThanOrEqual(1);
        expect(arch.auditImmutability().isClean).toBe(true);
    });
});
