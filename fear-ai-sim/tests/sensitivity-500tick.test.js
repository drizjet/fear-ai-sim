// Constitution §135, §138, §139, §142, §150, §207.
// Long-horizon + sensitivity + multi-seed + determinism
// audit. Runs 500 ticks across 5 seeds × 3 perceivedDanger
// values (15 runs total) and verifies the §121 / §138 /
// §207 contracts:
//
//   §121: same scenario + same seed → identical event log.
//   §138: different meaningful conditions → different
//         outcome distributions.
//   §207: world population is conserved; no degeneracy.
//
// The metrics are: invasions, bandit-ambushes, treaties
// formed, final faction state, final merchant cargo.
// Failing values signal either a regression in the
// determinism contract or a real parametric sensitivity
// issue that needs a follow-up slice.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

// R5 (V8 audit A5-F2): the seed loops below thread this stream into
// tickClosedWorld via encounterRng, so distinct seeds drive
// genuinely distinct trajectories. Previously the loop variable
// was never passed anywhere and all "seeds" ran identical worlds.
function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function summarize(world) {
    return {
        invasions: world.events.filter(e => e.type === 'INVASION').length,
        banditAmbushes: world.events.filter(e => e.type === 'ENCOUNTER' && e.encounterId === 'bandit-ambush').length,
        treatyFormed: world.events.filter(e => e.type === 'TREATY_FORMED').length,
        factionFinalGrievance: world.factions.map(f => f.grievance),
        finalCargo: world.merchants[0]?.cargo ?? 0,
        population: [...world.towns.values()].reduce((s, t) => s + t.population, 0),
        // PHASE §155: total delivered cargo that actually landed in
        // the destination markets. This is the production trade axis:
        // shipped volume responds to perceivedDanger (dangerous worlds
        // ship less), so different worlds must produce different
        // delivered distributions. The invasion axis alone can
        // saturate at the raid cooldown ceiling once grief peaks.
        deliveredTotal: [...(world.marketFlows?.values() ?? [])]
            .reduce((s, f) => s + (f.delivered ?? 0), 0),
    };
}

describe('long-horizon sensitivity audit (Constitution §135 / §138 / §207)', () => {
    it('§121 determinism: same scenario + same seed → identical invasion count', () => {
        // The §121 contract: a fresh run of the same
        // scenario must produce the same metric. We use
        // invasion count as the metric because it is
        // sensitive to the closed-world's stochastic
        // decision-making.
        const TICKS = 100;
        const pd = 0.5;
        const a = createClosedWorldScenario();
        for (let t = 1; t <= TICKS; t += 1) {
            tickClosedWorld(a, { tick: t, perceivedDanger: pd });
        }
        const b = createClosedWorldScenario();
        for (let t = 1; t <= TICKS; t += 1) {
            tickClosedWorld(b, { tick: t, perceivedDanger: pd });
        }
        const aSummary = summarize(a);
        const bSummary = summarize(b);
        expect(aSummary.invasions).toBe(bSummary.invasions);
        expect(aSummary.population).toBe(bSummary.population);
        expect(aSummary.finalCargo).toBe(bSummary.finalCargo);
    });

    it('§207 world resilience: population is conserved at 2 over 500 ticks', () => {
        // The §207 / §156 contract: world total population
        // is conserved across the MIGRATION step. Over 500
        // ticks the population should stay at 2 (north + south).
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 500; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        expect(world.towns.get('north').population).toBeGreaterThan(0);
        expect(world.towns.get('south').population).toBeGreaterThan(0);
        const totalPop = [...world.towns.values()].reduce((s, t) => s + t.population, 0);
        // R3: full identity — booked exogenous terms plus
        // event-summed births/deaths (massResidual pattern).
        const exo207 = world.exogenousPopulation ?? { inflow: 0, outflow: 0 };
        let births207 = 0, deaths207 = 0;
        for (const e of world.events) {
            if (e.type !== 'POPULATION_CHANGE' || e.immigrationKind) continue;
            births207 += Number(e.births) || 0;
            deaths207 += Number(e.deaths) || 0;
        }
        expect(totalPop - (exo207.inflow ?? 0) + (exo207.outflow ?? 0) - births207 + deaths207).toBe(2);
    });

    it('§138 behavioral diversity: different perceivedDanger produces different distributions', () => {
        // The §138 contract: same seed + same scenario →
        // same result; different meaningful conditions →
        // different distributions. We run 3 conditions
        // (perceivedDanger ∈ {0.0, 0.5, 0.9}) for 200
        // ticks and verify the mean invasion count
        // differs across at least 2 of the 3 conditions.
        const TICKS = 200;
        const SEEDS = [1, 7, 42];
        const PDS = [0.0, 0.5, 0.9];
        // §138 diversity across the live production axes. Each axis is
        // measured as the mean over the seeds for each perceivedDanger
        // regime. Two axes matter:
        //   1. invasions — the historical metric. It can saturate at the
        //      raid cooldown ceiling once faction grief peaks, so it must
        //      not be the only oracle.
        //   2. deliveredTotal (§155, production trade) — shipped volume
        //      responds to perceivedDanger (dangerous worlds ship less),
        //      so it differentiates the same runs even when the invasion
        //      axis saturates.
        // The contract: at least one axis must produce at least two
        // distinct rounded means across {0.0, 0.5, 0.9}.
        const cellValues = {};
        for (const pd of PDS) {
            cellValues[pd] = { invasions: [], deliveredTotal: [] };
            for (const seed of SEEDS) {
                const world = createClosedWorldScenario();
                const rng = mulberry32(seed);
                for (let t = 1; t <= TICKS; t += 1) {
                    tickClosedWorld(world, { tick: t, perceivedDanger: pd, encounterRng: rng });
                }
                cellValues[pd].invasions.push(world.events.filter(e => e.type === 'INVASION').length);
                cellValues[pd].deliveredTotal.push(summarize(world).deliveredTotal);
            }
        }
        const mean = (pd, metric) => cellValues[pd][metric].reduce((s, v) => s + v, 0) / SEEDS.length;
        // A5-F7: within-regime ranges are logged, not just means.
        // Probed 2026-09-05: invasions are cooldown-cadenced and
        // identical across seeds within a regime (38/38/38), while
        // deliveredTotal carries the seed variance (376/395/406).
        const roundedByAxis = {
            invasions: PDS.map(pd => Math.round(mean(pd, 'invasions') * 10) / 10),
            deliveredTotal: PDS.map(pd => Math.round(mean(pd, 'deliveredTotal') * 10) / 10),
        };
        const distinctByAxis = {};
        for (const [axis, values] of Object.entries(roundedByAxis)) {
            distinctByAxis[axis] = new Set(values).size;
        }
        const maxDistinct = Math.max(...Object.values(distinctByAxis));
        expect(maxDistinct).toBeGreaterThanOrEqual(2);
        // A5-F7: the trade axis is a DIRECTIONAL oracle, not an OR-axis
        // escape hatch. §155 production trade: dangerous worlds ship
        // less. Probed means: 392 (pd 0.0) / 275 (pd 0.5) / 188
        // (pd 0.9) — strictly decreasing with wide margin. Response
        // check: flattening all regimes to one pd fails this (and the
        // diversity gate). Zeroing one merchant danger channel does
        // NOT fail it — the response is multi-channel (routing fear
        // term, cargo risk, faction fear) by design, not single-point.
        if (distinctByAxis.invasions < 2) {
            expect(distinctByAxis.deliveredTotal).toBeGreaterThanOrEqual(2);
        }
        expect(mean(0.9, 'deliveredTotal')).toBeLessThan(mean(0.0, 'deliveredTotal'));
    });
    it('§138 multi-seed variance: 5 seeds at 500 ticks have bounded invasion spread', () => {
        // The §138 / §151 contract: a multi-seed run
        // should have a *bounded* distribution (not
        // degenerate, not chaotic). 5 seeds × 500 ticks
        // at perceivedDanger=0.5 should produce invasion
        // counts in a bounded range.
        const TICKS = 500;
        const SEEDS = [1, 7, 42, 100, 9999];
        const counts = [];
        const delivered = [];
        for (const seed of SEEDS) {
            const world = createClosedWorldScenario();
            const rng = mulberry32(seed * 1000 + 7);
            for (let t = 1; t <= TICKS; t += 1) {
                tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng });
            }
            counts.push(world.events.filter(e => e.type === 'INVASION').length);
            delivered.push(summarize(world).deliveredTotal);
        }
        // The invasion count is bounded (the §138
        // contract: behavior is conditional, not
        // chaotic). Regime notes (measured 5×500 ticks,
        // seeds 1/7/42/100/9999, deterministic streams):
        // pre-trade baseline 97/99/99/100/99 (mean ~99,
        // spread 3); E3 shuttle 34/2/2/13/1 (mean ~10);
        // E4 living demography 29/8/16/16/77 (mean ~29).
        // E4 growth outruns shuttle throughput at some seeds:
        // the south surplus (relief capacity) stays thin while
        // northern demand scales with headcount, so the deficit
        // re-opens and raids return — most sharply at seed 9999
        // (thin southern surplus, small loads, chronic shortage).
        // That is capacity economics, verified load-by-load, not
        // chaos: zero attacks in both extremes, deliveries equal.
        // The pins therefore compare against the UNMITIGATED
        // baseline regime (mean ~99, max 100), not last slice's
        // numbers — chasing per-slice absolutes is oracle decay.
        const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
        const spread = Math.max(...counts) - Math.min(...counts);
        // Mitigated mean: relief + exit must hold the average far
        // below the unmitigated baseline (~99). Disabling the E3
        // exchange returns the mean to ~99 and fails this.
        expect(mean).toBeLessThan(50);
        // No seed returns to baseline rage: the worst mitigated
        // seed stays below the unmitigated maximum (100). A broken
        // invasion gate explodes past this.
        expect(Math.max(...counts)).toBeLessThan(100);
        // Non-degenerate: threshold variance across seeds must
        // remain visible. Five identical worlds (spread 0) fail here.
        expect(spread).toBeGreaterThan(0);
        // A5-F7: the fraud-shaped failure (R5: one stream run 5x)
        // measures spread 0 and passes the bound above. The trade
        // axis carries genuine seed variance, so its spread must be
        // positive — five identical worlds fail here.
        const deliveredSpread = Math.max(...delivered) - Math.min(...delivered);
        // eslint-disable-next-line no-console
        console.log('MULTI-SEED-SPREAD invasions=' + counts.join('/') + ' delivered=' + delivered.map(d => d.toFixed(0)).join('/'));
        expect(deliveredSpread).toBeGreaterThan(0);
    });
});
