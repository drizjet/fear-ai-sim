import { describe, it, expect } from '@jest/globals';
import { SettlementMigrationSystem } from '../packages/core/index.js';

// R12 (audit candidate): migration-to-settlement pressure loop. Arrival
// already moved population, labor, and friction — but destination food
// scarcity never noticed the new mouths. The arrival meal closes the loop:
// influx dilutes food security, so migration can raise downstream scarcity
// pressure (and, at the margin, seed second-order waves).

function starvingSource(sys, pop = 200) {
    sys.registerSettlement('source', { population: pop, housingCapacity: pop + 50, foodStock: 5.0, threatLevel: 0.1, garrisonStrength: 0.5 });
}

function tightDest(sys, pop = 60, food = 32.0) {
    sys.registerSettlement('dest', { population: pop, housingCapacity: pop + 60, foodStock: food, threatLevel: 0.1, garrisonStrength: 0.5 });
}

function runWave(sys, tick = 0, arriveAt = 5) {
    const party = sys.evaluateMigrationWave('source', 'dest', 0.0, tick);
    expect(party).not.toBeNull();
    sys.tick(arriveAt);
    return party;
}

describe('R12: migration influx moves settlement scarcity', () => {
    it('1. Arrival deducts one per-capita meal per survivor', () => {
        const sys = new SettlementMigrationSystem();
        starvingSource(sys);
        tightDest(sys);
        const before = sys.settlements.get('dest').foodStock;
        const party = runWave(sys);
        const after = sys.settlements.get('dest').foodStock;
        expect(after).toBeCloseTo(before - party.headcount * 0.5, 6);
    });

    it('2. Influx raises destination famine pressure (loop closed)', () => {
        const sys = new SettlementMigrationSystem();
        starvingSource(sys);
        tightDest(sys);
        const pushBefore = sys.evaluatePushPressure(sys.settlements.get('dest'));
        expect(pushBefore.factors.famine).toBe(0);
        runWave(sys);
        const pushAfter = sys.evaluatePushPressure(sys.settlements.get('dest'));
        expect(pushAfter.factors.famine).toBeGreaterThan(0);
        expect(pushAfter.netPush).toBeGreaterThan(pushBefore.netPush);
    });

    it('3. Larger influx dilutes more: scarcity scales with headcount', () => {
        const small = new SettlementMigrationSystem();
        starvingSource(small, 100);
        tightDest(small);
        const pSmall = runWave(small);
        const famineSmall = small.evaluatePushPressure(small.settlements.get('dest')).factors.famine;
        const big = new SettlementMigrationSystem();
        starvingSource(big, 400);
        tightDest(big);
        const pBig = runWave(big);
        expect(pBig.headcount).toBeGreaterThan(pSmall.headcount);
        const famineBig = big.evaluatePushPressure(big.settlements.get('dest')).factors.famine;
        expect(famineBig).toBeGreaterThan(famineSmall);
    });

    it('4. Abundant destination absorbs a wave without famine (no phantom scarcity)', () => {
        const sys = new SettlementMigrationSystem();
        starvingSource(sys, 60);
        tightDest(sys, 100, 100.0);
        runWave(sys);
        const push = sys.evaluatePushPressure(sys.settlements.get('dest'));
        expect(push.factors.famine).toBe(0);
    });

    it('5. Mouths conserved: source loss and dest gain reconcile with survivors', () => {
        const sys = new SettlementMigrationSystem();
        starvingSource(sys);
        tightDest(sys);
        const srcBefore = sys.settlements.get('source').population;
        const dstBefore = sys.settlements.get('dest').population;
        const party = sys.evaluateMigrationWave('source', 'dest', 0.0, 0);
        sys.tick(5);
        expect(sys.settlements.get('source').population).toBe(srcBefore - party.headcount);
        expect(sys.settlements.get('dest').population).toBe(dstBefore + party.survivors);
    });

    it('6. Same wave replays identical scarcity', () => {
        const run = () => {
            const sys = new SettlementMigrationSystem();
            starvingSource(sys);
            tightDest(sys);
            runWave(sys);
            return sys.evaluatePushPressure(sys.settlements.get('dest')).factors.famine;
        };
        expect(run()).toBe(run());
    });
});
