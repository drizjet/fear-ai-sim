import { describe, it, expect } from '@jest/globals';
import { FactionSystem } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';

// NEXT-143: persona-conditioned faction behavior (audit candidate 7).
// Opt-in context.leaderAggression in [-1,1] (host-derived from the
// leader's persona) bends composite hostility pressure by up to ±0.15,
// the same scale as faction culture. Absent input is legacy exactly.
describe('NEXT-143: leader temperament bends escalation', () => {
    function factions() {
        const f = new FactionSystem({});
        f.registerFaction({ id: 'A', culture: 'HONORABLE', militaryReadiness: 0.8, economicStockpile: 0.8 });
        f.registerFaction({ id: 'B', culture: 'HONORABLE', militaryReadiness: 0.8, economicStockpile: 0.8 });
        return f;
    }
    const base = { grievance: 0.9, trust: 0.2, territorialPressure: 0.3, informationConfidence: 0.8 };
    const stageOf = (agg) => factions().evaluateStance('A', 'B', { ...base, leaderAggression: agg }).toStage;

    // Host mapping: persona stand-vs-flee gap scaled into [-1,1].
    function aggressionOf(cia, id) {
        const t = cia.decide(id).tendencies;
        return Math.max(-1, Math.min(1, (t.stand - t.flee) * 2));
    }

    it('1. Absent input reproduces legacy pressure and stage exactly', () => {
        const plain = factions().evaluateStance('A', 'B', { ...base });
        const zero = factions().evaluateStance('A', 'B', { ...base, leaderAggression: 0 });
        expect(zero.compositePressure).toBe(plain.compositePressure);
        expect(zero.toStage).toBe(plain.toStage);
        expect(zero.leaderModifier).toBe(0);
    });

    it('2. Hawkish leaders escalate, dovish leaders restrain', () => {
        expect(stageOf(1)).toBe('MOBILIZE');
        expect(stageOf(0)).toBe('THREATEN');
        expect(stageOf(-1)).toBe('WARN');
    });

    it('3. Pressure moves monotonically with aggression', () => {
        const p = (a) => factions().evaluateStance('A', 'B', { ...base, leaderAggression: a }).compositePressure;
        expect(p(-1)).toBeLessThan(p(0));
        expect(p(0)).toBeLessThan(p(1));
        expect(p(1) - p(-1)).toBeCloseTo(0.3, 6);
    });

    it('4. End-to-end: brave persona mobilizes, fearful persona warns', () => {
        const cia = new CharacterIdentityArchitecture();
        cia.registerCharacter('hawk', { resilience: 0.9, neuroticism: 0.1 });
        cia.registerCharacter('dove', { resilience: 0.1, neuroticism: 0.9 });
        expect(aggressionOf(cia, 'hawk')).toBeGreaterThan(aggressionOf(cia, 'dove'));
        expect(stageOf(aggressionOf(cia, 'hawk'))).toBe('MOBILIZE');
        expect(stageOf(aggressionOf(cia, 'dove'))).toBe('WARN');
    });

    it('5. Out-of-range and invalid inputs clamp safely', () => {
        expect(stageOf(99)).toBe(stageOf(1));
        expect(stageOf(-99)).toBe(stageOf(-1));
        const bad = factions().evaluateStance('A', 'B', { ...base, leaderAggression: NaN });
        expect(bad.compositePressure).toBe(factions().evaluateStance('A', 'B', { ...base }).compositePressure);
    });

    it('6. Evaluations are exactly reproducible', () => {
        expect(stageOf(0.5)).toBe(stageOf(0.5));
    });
});
