import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R32: nomad trade participation. Nomad-caravan meetings now resolve
// PEACEFUL_TRADE, and cross-faction peaceful trade builds trust per
// trading season (one TRADE_ESTABLISHED per pair per 100 ticks), so the
// valley's only cross-faction peaceful contact compounds gradually
// instead of maxing trust in a dozen ticks.

const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
const N = FRONTIER_VALLEY_FACTIONS.NOMADS;

function stance(sim, a, b) {
    return sim.factionSystem.getBilateralStance(a, b);
}

function tradeEncounters(sim, aId, bId) {
    return [{
        partyAId: aId,
        partyBId: bId,
        encounterId: 't-trade',
        encounterType: 'PEACEFUL_CONVERGENCE',
        advisoryResolution: 'PEACEFUL_TRADE'
    }];
}

describe('R32: peaceful trade builds trust per season', () => {
    it('1. Cross-faction trade records one establishment and builds trust', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        const before = stance(sim, N, S).incidents.length;
        sim._recordEncounterConsequences(tradeEncounters(sim, 'caravan_merchant_2', 'nomad_clan_1'));
        const nView = stance(sim, N, S);
        const sView = stance(sim, S, N);
        expect(nView.incidents.length).toBe(before + 1);
        expect(nView.incidents.at(-1).type).toBe('TRADE_ESTABLISHED');
        expect(nView.trust).toBeCloseTo(0.30, 9);
        // Settler view starts at 0.60 neutral; the +0.30 trade would reach
        // 0.90, but the commerce ceiling holds trade-grown trust at 0.70.
        expect(sView.trust).toBeCloseTo(0.70, 9);
    });

    it('2. Same-tick repeat trade does not duplicate establishment', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim._recordEncounterConsequences(tradeEncounters(sim, 'caravan_merchant_2', 'nomad_clan_1'));
        const count = stance(sim, N, S).incidents.length;
        sim._recordEncounterConsequences(tradeEncounters(sim, 'caravan_merchant_2', 'nomad_clan_1'));
        expect(stance(sim, N, S).incidents.length).toBe(count);
        expect(stance(sim, N, S).trust).toBeCloseTo(0.30, 9);
    });

    it('3. Intra-faction caravan trade is ignored (shared ledger)', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim._recordEncounterConsequences(tradeEncounters(sim, 'caravan_merchant_1', 'caravan_merchant_2'));
        expect(sim.tradeSeasons.size).toBe(0);
    });

    it('4. Live run: nomad-settler trade compounds gradually, not instantly', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.advance(1000);
        const st = stance(sim, N, S);
        const trades = st.incidents.filter((i) => i.type === 'TRADE_ESTABLISHED');
        expect(trades.length).toBeGreaterThanOrEqual(1);
        expect(trades.length).toBeLessThanOrEqual(12);
        expect(st.trust).toBeGreaterThan(0);
    });

    it('5. Same inputs replay identical trade trust', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 4242 });
            sim.advance(1000);
            const st = stance(sim, N, S);
            return {
                trust: st.trust,
                trades: st.incidents.filter((i) => i.type === 'TRADE_ESTABLISHED').length,
                seasons: Array.from(sim.tradeSeasons.entries())
            };
        };
        expect(run()).toEqual(run());
    });

    it('6. Forks inherit the season clock; garbage restores safely', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.tradeSeasons.set('A~B', 42);
        const forked = sim.fork();
        expect(forked.tradeSeasons.get('A~B')).toBe(42);
        const fresh = new FrontierValleySimulation({ seed: 4242 });
        expect(() => fresh.setState({ tradeSeasons: [['A~B', 'nope'], null, ['C~D', 7]] })).not.toThrow();
        expect(fresh.tradeSeasons.get('C~D')).toBe(7);
        expect(fresh.tradeSeasons.has('A~B')).toBe(false);
    });

    it('7. Commerce ceiling: trade-grown trust stops at 0.70, setup above survives', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        const pair = [S, N].sort().join('~');
        // Backdate the season clock instead of advancing: advancing runs
        // live nomad-caravan meetings that would pollute the clock.
        for (let season = 0; season < 4; season++) {
            sim.tradeSeasons.set(pair, sim.currentTick - 100);
            sim._recordEncounterConsequences(tradeEncounters(sim, 'caravan_merchant_2', 'nomad_clan_1'));
        }
        // Raw increments would reach 1.20; the ceiling holds both at 0.70,
        // below the 0.75 ALLY gate: commerce makes partners, never allies.
        expect(stance(sim, N, S).trust).toBeCloseTo(0.70, 9);
        expect(stance(sim, S, N).trust).toBeCloseTo(0.70, 9);
        // Designer setup above the ceiling is never clamped down.
        sim.tradeSeasons.set(pair, sim.currentTick - 100);
        stance(sim, S, N).trust = 0.80;
        sim._recordEncounterConsequences(tradeEncounters(sim, 'caravan_merchant_2', 'nomad_clan_1'));
        expect(stance(sim, S, N).trust).toBeCloseTo(1.00, 9);
    });
});
