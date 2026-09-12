import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R39: variance-gated valley oracles (backlog #3). Closed-world A5
// findings already carry activity floors and frozen contrasts; the
// valley side did not. These gates prove valley soaks measure agency,
// not tick machinery: seeds must genuinely vary trajectories, and an
// agency-free world must complete cleanly while scoring structural
// zeros on every agency-requiring count.

const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;

function census(sim) {
    const m = sim.macroMetrics;
    let tradeEstablished = 0;
    for (const [, map] of sim.factionSystem.stances) {
        for (const st of map.values()) {
            tradeEstablished += st.incidents.filter((i) => i.type === 'TRADE_ESTABLISHED').length;
        }
    }
    return {
        encounters: m.totalEncounters,
        deliberations: m.governanceDeliberations || 0,
        migrations: m.migrations,
        tradeEstablished,
        cohesion: sim.factionSystem.getFaction(S).cohesion
    };
}

describe('R39: valley variance and frozen-world contrast', () => {
    it('1. Seeds genuinely vary valley trajectories (no measured constant)', () => {
        const rows = [];
        for (const seed of [11, 12, 13, 14]) {
            const sim = new FrontierValleySimulation({ seed });
            const summary = sim.advance(1000);
            expect(Number.isFinite(summary.meanPopulationFear)).toBe(true);
            rows.push(census(sim));
        }
        // Measured 942-1122 encounters, 122-212 deliberations: every
        // agency axis varies. A seed loop that silently ran identical
        // worlds would collapse every set below.
        expect(new Set(rows.map((r) => r.encounters)).size).toBeGreaterThan(1);
        expect(new Set(rows.map((r) => r.deliberations)).size).toBeGreaterThan(1);
        expect(new Set(rows.map((r) => r.migrations)).size).toBeGreaterThan(1);
    });

    it('2. Frozen valley completes cleanly but scores structural zeros', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        sim.worldSystem.groups.clear();
        let summary;
        expect(() => { summary = sim.advance(500); }).not.toThrow();
        expect(Number.isFinite(summary.meanPopulationFear)).toBe(true);
        const frozen = census(sim);
        expect(frozen.encounters).toBe(0);
        expect(frozen.deliberations).toBe(0);
        expect(frozen.migrations).toBe(0);
        expect(frozen.tradeEstablished).toBe(0);
        // No stress without groups: settler faith never moves.
        expect(frozen.cohesion).toBe(0.7);
    });

    it('3. Live twin of the frozen run shows agency on every axis', () => {
        const live = new FrontierValleySimulation({ seed: 11 });
        live.advance(500);
        const c = census(live);
        expect(c.encounters).toBeGreaterThan(0);
        expect(c.deliberations).toBeGreaterThan(0);
        expect(c.tradeEstablished).toBeGreaterThan(0);
    });

    it('4. Frozen contrast is deterministic', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 99 });
            sim.worldSystem.groups.clear();
            const summary = sim.advance(500);
            return { summary, census: census(sim) };
        };
        expect(run()).toEqual(run());
    });

    it('5. Encounter rates carry exposure denominators and stay finite', () => {
        for (const seed of [11, 12]) {
            const sim = new FrontierValleySimulation({ seed });
            sim.advance(1000);
            const c = census(sim);
            const rate = c.encounters / 1000;
            expect(Number.isFinite(rate)).toBe(true);
            expect(rate).toBeGreaterThan(0);
            expect(rate).toBeLessThan(10);
        }
    });
});
