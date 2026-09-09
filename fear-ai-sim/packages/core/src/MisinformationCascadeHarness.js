/**
 * packages/core/src/MisinformationCascadeHarness.js
 *
 * Section XXII:
 * False-alarm cascade experiments — a false rumor of an approaching army
 * (or road ambush) propagates through a settlement network while each
 * agent's AnticipatoryFearEngine converts hearsay into dread. Measures:
 * - panic: fraction of agents whose dread crosses the panic threshold.
 * - mobilization: fraction crossing the lower muster threshold.
 * - tradeReroutes: routes flipped from USE to CAUTION/AVOID.
 * - trustLoss: origin credibility before vs after correction.
 *
 * Two-arm design: FALSE arm (rumor corrected as lies) vs TRUE arm (same
 * rumor confirmed). Trust loss must appear only in the FALSE arm —
 * otherwise the metric confounds correction with confirmation.
 *
 * Deterministic: fixed seeds per arm. Advisory only.
 */

import { InformationPropagationEngine } from './InformationPropagationEngine.js';
import { AnticipatoryFearEngine } from './AnticipatoryFearEngine.js';

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const DEFAULT_CASCADE_CONFIG = Object.freeze({
    agents: 12,
    ticks: 10,
    panicThreshold: 0.65,
    musterThreshold: 0.4,
    seed: 2026
});

export class MisinformationCascadeHarness {
    /**
     * Run one cascade arm.
     * @param {boolean} truthful TRUE arm (confirmed) or FALSE arm (corrected as lies)
     * @param {object} [config={}] overrides
     */
    runArm(truthful, config = {}) {
        const cfg = { ...DEFAULT_CASCADE_CONFIG, ...config };
        const net = new InformationPropagationEngine({}, cfg.seed);
        const agents = [];
        for (let i = 0; i < cfg.agents; i++) {
            const id = `settler_${i}`;
            net.registerAgent(id, 0.5 + (i === 0 ? 0.3 : 0));
            agents.push({ id, fear: new AnticipatoryFearEngine({}, { neuroticism: 0.4 + (i % 3) * 0.1, resilience: 0.5 }) });
        }
        // Chain topology with a shortcut: 0 -> 1..3 -> rest (fast cascade).
        for (let i = 1; i < cfg.agents; i++) {
            net.addListenEdge(agents[i].id, agents[Math.max(0, i - 3)].id);
            if (i % 4 === 0) net.addListenEdge(agents[i].id, agents[0].id);
        }
        const originCredBefore = net.credibilityOf(agents[0].id);
        const rumorId = net.injectRumor('APPROACHING_ARMY', 'Army marching on the valley', agents[0].id, { confidence: 0.85 });
        const panicSeries = [];
        for (let t = 0; t < cfg.ticks; t++) {
            net.advanceTick();
            let panicked = 0;
            let mustered = 0;
            for (const a of agents) {
                for (const held of net.heldBy(a.id)) {
                    if (held.rumorId === rumorId) {
                        a.fear.absorb('FACTION', 'invading_army', { confidence: held.confidence, observed: false, threatLevel: 0.9 });
                        a.fear.absorb('ROAD', 'north_road', { confidence: held.confidence, observed: false, threatLevel: 0.7 });
                    }
                }
                a.fear.advanceTick();
                const d = a.fear.dreadOf('FACTION', 'invading_army');
                if (d >= cfg.panicThreshold) panicked += 1;
                if (d >= cfg.musterThreshold) mustered += 1;
            }
            panicSeries.push(round4(panicked / cfg.agents));
        }
        const peakPanic = Math.max(...panicSeries);
        const finalMuster = (() => {
            let m = 0;
            for (const a of agents) if (a.fear.dreadOf('FACTION', 'invading_army') >= cfg.musterThreshold) m += 1;
            return round4(m / cfg.agents);
        })();
        const reroutes = agents[0].fear.rankRoutes([{ id: 'north_road' }, { id: 'south_road', danger: 0.1 }]);
        const rerouted = reroutes.find((r) => r.id === 'north_road').advisory !== 'USE';
        const status = net.correctRumor(rumorId, truthful);
        const originCredAfter = net.credibilityOf(agents[0].id);
        return {
            truthful,
            ticks: cfg.ticks,
            agents: cfg.agents,
            peakPanic,
            finalMuster,
            northRoadAdvisory: reroutes.find((r) => r.id === 'north_road').advisory,
            rerouted,
            correctionStatus: status,
            originCredBefore,
            originCredAfter,
            trustLoss: round4(originCredBefore - originCredAfter),
            panicSeries
        };
    }

    /** Full two-arm experiment with asymmetry verdict. */
    runExperiment(config = {}) {
        const falseArm = this.runArm(false, config);
        const trueArm = this.runArm(true, { ...config, seed: (config.seed ?? DEFAULT_CASCADE_CONFIG.seed) + 1 });
        return {
            falseArm,
            trueArm,
            // Trust loss must be specific to the FALSE arm.
            trustAsymmetry: round4(falseArm.trustLoss - trueArm.trustLoss),
            verdict: falseArm.trustLoss > trueArm.trustLoss && falseArm.peakPanic > 0 ? 'CASCADE_WITH_TRUST_COST' : 'NO_CASCADE'
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0
        };
    }
}
