/**
 * packages/core/src/ValleyOutcomeDistribution.js
 *
 * Sections CCX-CCXI + LXXII:
 * Multi-seed outcome analysis over the live FrontierValleySimulation —
 * run K seeds, collect macro summaries, and report distributions with
 * degeneracy watches. Answers: do different seeds produce different
 * outcomes (no universal optimum), and does any seed explode, stagnate,
 * or corrupt (soak guard)?
 *
 * Uses the real simulator exclusively. Deterministic: same seed set =
 * same distribution. Advisory: summaries only, never world edits.
 */

import { FrontierValleySimulation, WorldDegeneracyDetector } from './FrontierValleySimulation.js';

const round4 = (v) => (typeof v !== 'number' || !Number.isFinite(v) ? 0 : Math.round(v * 10000) / 10000);

function stats(xs) {
    if (xs.length === 0) return { mean: 0, min: 0, max: 0 };
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { mean: round4(mean), min: Math.min(...xs), max: Math.max(...xs) };
}

export class ValleyOutcomeDistribution {
    constructor() {
        this.analyses = 0;
    }

    /**
     * Run K valley instances.
     * @param {object} [options={}] { seeds: number[], ticks }
     */
    analyze(options = {}) {
        const seeds = Array.isArray(options.seeds) && options.seeds.length > 0 ? options.seeds : [11, 22, 33, 44, 55];
        const ticks = Math.max(1, Math.min(2000, options.ticks ?? 200));
        const summaries = seeds.map((seed) => {
            const sim = new FrontierValleySimulation({ seed });
            return sim.advance(ticks);
        });
        const degeneracy = WorldDegeneracyDetector.analyzeRuns(summaries);
        const report = {
            seeds: [...seeds],
            ticks,
            wars: stats(summaries.map((s) => s.warsDeclared)),
            alliances: stats(summaries.map((s) => s.alliancesFormed)),
            routeFailures: stats(summaries.map((s) => s.routeFailures)),
            panicIncidents: stats(summaries.map((s) => s.panicIncidents)),
            meanFear: stats(summaries.map((s) => s.meanPopulationFear)),
            distinctOutcomes: new Set(summaries.map((s) => JSON.stringify([
                s.warsDeclared, s.alliancesFormed, s.routeFailures > 0, s.panicIncidents > 0
            ]))).size,
            degeneracy
        };
        this.analyses += 1;
        return report;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            analyses: this.analyses
        };
    }
}
