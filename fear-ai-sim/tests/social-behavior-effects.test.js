/**
 * @file social-behavior-effects.test.js
 *
 * Section XXV: relationships alter decisions.
 */

import { scoreSocialDecisions, contagionGate, SOCIAL_DECISIONS } from '../packages/core/index.js';

const FRIEND = { trust: 0.8, fear: 0, respect: 0.6, affection: 0.7, grievance: 0, familiarity: 0.8, obligation: 0.3, dominance: 0 };
const RIVAL = { trust: -0.7, fear: 0.2, respect: 0.3, affection: -0.6, grievance: 0.8, familiarity: 0.6, obligation: 0, dominance: 0.2 };
const CAPTAIN = { trust: 0.7, fear: 0.3, respect: 0.9, affection: 0.4, grievance: 0, familiarity: 0.9, obligation: 0.2, dominance: 0.5 };

describe('Section XXV: Social Behavior Effects', () => {
    test('1. Friendship raises helping, rivalry vetoes it gradually', () => {
        const help = scoreSocialDecisions(FRIEND).help;
        const rivalHelp = scoreSocialDecisions(RIVAL).help;
        expect(help).toBeGreaterThan(0.4);
        expect(rivalHelp).toBeLessThan(0.2);
        const half = scoreSocialDecisions({ ...FRIEND, grievance: 0.5 }).help;
        expect(half).toBeGreaterThan(rivalHelp);
        expect(half).toBeLessThan(help);
        expect(SOCIAL_DECISIONS.length).toBe(8);
    });

    test('2. Asymmetry preserved: A helps B while B shuns A', () => {
        const aToB = scoreSocialDecisions(FRIEND);
        const bToA = scoreSocialDecisions(RIVAL);
        expect(aToB.help).toBeGreaterThan(bToA.help);
        expect(aToB.warn).toBeGreaterThan(bToA.warn);
    });

    test('3. Pressure taxes costly acts but rallies followers to leaders', () => {
        const calm = scoreSocialDecisions(CAPTAIN, { pressure: 0, isLeader: true });
        const lethal = scoreSocialDecisions(CAPTAIN, { pressure: 1, isLeader: true });
        expect(lethal.help).toBeLessThan(calm.help);
        expect(lethal.trade).toBeLessThan(calm.trade);
        expect(lethal.followLeader).toBeGreaterThanOrEqual(calm.followLeader);
        expect(lethal.retreatTogether).toBeGreaterThan(calm.retreatTogether);
    });

    test('4. Fear plus respect yields obedience-with-dread, not desertion', () => {
        const s = scoreSocialDecisions(CAPTAIN, { pressure: 0.6, isLeader: true });
        expect(s.followLeader).toBeGreaterThan(0.5);
        expect(s.desert).toBeLessThan(0.4);
        const abused = scoreSocialDecisions({ ...RIVAL, fear: 0.9 }, { pressure: 0.6 });
        expect(abused.desert).toBeGreaterThan(s.desert);
    });

    test('5. Contagion gates transmit through trust, alarm through fear', () => {
        const friendGate = contagionGate(FRIEND);
        const strangerGate = contagionGate({});
        expect(friendGate.susceptibility).toBeGreaterThan(strangerGate.susceptibility);
        const feared = contagionGate({ fear: 0.9, trust: -0.5 });
        expect(feared.alarmGain).toBeGreaterThan(friendGate.alarmGain);
        expect(feared.susceptibility).toBeLessThan(friendGate.susceptibility);
    });
});
