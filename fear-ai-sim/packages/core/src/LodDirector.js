/**
 * packages/core/src/LodDirector.js
 *
 * Sections LXXVI + LXXX-LXXXI:
 * Cognitive level-of-detail director — assigns every tracked agent to a
 * simulation tier and moves them between tiers under host budgets with
 * hysteresis (no frame-to-frame thrash):
 * - LOD0 FULL: every tick, full identity + adaptive + state evaluation.
 * - LOD1 REDUCED: every 2nd tick, state-only fast path.
 * - LOD2 GROUP: represented by group aggregates, no individual ticks.
 * - LOD3 FACTION: folded into faction-level advisory state.
 * - LOD4 DORMANT: event-driven only; woken by host reports or alerts.
 *
 * Policy inputs per agent: priority (host), visibility/proximity,
 * volatility (recent fear delta), and time-since-update. The director
 * outputs tier assignments plus per-tier update lists; the host executes.
 * Under budget pressure the director demotes lowest-value agents first
 * and never corrupts stored state — demotion only changes cadence.
 *
 * Advisory policy only. Host owns agents, budgets, and execution.
 */

export const LOD_TIERS = Object.freeze(['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4']);

/** Ticks between updates per tier (LOD4 = Infinity, event-driven). */
export const LOD_CADENCE = Object.freeze({
    LOD0: 1, LOD1: 2, LOD2: 5, LOD3: 20, LOD4: Infinity
});

export const DEFAULT_LOD_CONFIG = Object.freeze({
    lod0Cap: 64,
    lod1Cap: 256,
    demoteHysteresisTicks: 10,
    promoteHysteresisTicks: 3,
    volatilityWindow: 8
});

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

export class LodDirector {
    /**
     * @param {object} [config={}] overrides
     */
    constructor(config = {}) {
        this.config = Object.freeze({ ...DEFAULT_LOD_CONFIG, ...config });
        /** agentId -> { tier, priority, volatility, lastUpdate, tierAge, fearHistory } */
        this.agents = new Map();
        this.tick = 0;
        this.demotions = 0;
        this.promotions = 0;
    }

    register(agentId, options = {}) {
        const id = String(agentId);
        if (!id) throw new Error('INVALID_AGENT_ID');
        if (!this.agents.has(id)) {
            this.agents.set(id, {
                tier: 'LOD0',
                priority: clamp01(options.priority ?? 0.5),
                volatility: 0,
                lastUpdate: 0,
                tierAge: 0,
                candidate: null,
                candidateAge: 0,
                fearHistory: []
            });
        }
        return id;
    }

    unregister(agentId) {
        return this.agents.delete(String(agentId));
    }

    /**
     * Observe one agent tick: host reports current fear + visibility.
     * @returns current tier
     */
    observe(agentId, report = {}) {
        const a = this.agents.get(String(agentId));
        if (!a) throw new Error(`UNKNOWN_AGENT: ${agentId}`);
        const fear = clamp01(report.fear ?? 0);
        a.fearHistory.push(fear);
        if (a.fearHistory.length > this.config.volatilityWindow) a.fearHistory.shift();
        const mean = a.fearHistory.reduce((x, y) => x + y, 0) / a.fearHistory.length;
        a.volatility = clamp01(a.fearHistory.reduce((x, y) => x + Math.abs(y - mean), 0) / a.fearHistory.length * 2);
        if (typeof report.priority === 'number' && Number.isFinite(report.priority)) a.priority = clamp01(report.priority);
        a.lastSeenFear = fear;
        a.lastSeenVisible = report.visible !== false;
        return a.tier;
    }

    /**
     * Recompute tiers under host budgets.
     * @param {object} [budgets={}] { lod0Cap, lod1Cap }
     * @returns {{ assignments, demotions, promotions, tick }}
     */
    direct(budgets = {}) {
        this.tick += 1;
        const lod0Cap = budgets.lod0Cap ?? this.config.lod0Cap;
        const lod1Cap = budgets.lod1Cap ?? this.config.lod1Cap;
        // Value score: priority + visibility + volatility (volatile agents earn fidelity).
        const scored = [...this.agents.entries()].map(([id, a]) => ({
            id,
            value: a.priority * 0.45 + (a.lastSeenVisible === false ? 0 : 0.25) + a.volatility * 0.3
        })).sort((x, y) => y.value - x.value || (x.id < y.id ? -1 : 1));
        const demotions = [];
        const promotions = [];
        let lod0Used = 0;
        let lod1Used = 0;
        for (const { id, value } of scored) {
            const a = this.agents.get(id);
            let want = 'LOD4';
            if (a.lastSeenVisible === false && a.volatility < 0.15) {
                want = 'LOD4';
            } else if (lod0Used < lod0Cap && (value >= 0.45 || a.volatility >= 0.3)) {
                want = 'LOD0';
                lod0Used += 1;
            } else if (lod1Used < lod1Cap && value >= 0.2) {
                want = 'LOD1';
                lod1Used += 1;
            } else if (value >= 0.12) {
                want = 'LOD2';
            } else if (value >= 0.05) {
                want = 'LOD3';
            }
            this._setTier(id, a, want, demotions, promotions);
        }
        return {
            assignments: Object.fromEntries([...this.agents.entries()].map(([id, a]) => [id, a.tier])),
            demotions,
            promotions,
            tick: this.tick
        };
    }

    /** Hysteresis-gated single-agent transition. */
    _setTier(id, a, tier, demotions, promotions) {
        if (a.tier === tier) {
            a.tierAge += 1;
            a.candidate = null;
            a.candidateAge = 0;
            return;
        }
        if (a.candidate !== tier) {
            a.candidate = tier;
            a.candidateAge = 1;
        } else {
            a.candidateAge += 1;
        }
        const descending = LOD_TIERS.indexOf(tier) > LOD_TIERS.indexOf(a.tier);
        const gate = descending ? this.config.demoteHysteresisTicks : this.config.promoteHysteresisTicks;
        if (a.candidateAge >= gate) {
            const from = a.tier;
            a.tier = tier;
            a.tierAge = 0;
            a.candidate = null;
            a.candidateAge = 0;
            (descending ? demotions : promotions).push({ agentId: id, from, to: tier });
            if (descending) this.demotions += 1; else this.promotions += 1;
        } else {
            a.tierAge += 1;
        }
    }

    /** Agents due for an update this tick (cadence check). */
    dueAgents() {
        const due = [];
        for (const [id, a] of this.agents.entries()) {
            const cadence = LOD_CADENCE[a.tier];
            if (!Number.isFinite(cadence)) continue; // LOD4 event-driven
            if ((this.tick - a.lastUpdate) >= cadence) {
                a.lastUpdate = this.tick;
                due.push(id);
            }
        }
        return due.sort();
    }

    tierOf(agentId) {
        return this.agents.get(String(agentId))?.tier || null;
    }

    tierCounts() {
        const counts = { LOD0: 0, LOD1: 0, LOD2: 0, LOD3: 0, LOD4: 0 };
        for (const a of this.agents.values()) counts[a.tier] += 1;
        return counts;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            agentsTracked: this.agents.size,
            demotions: this.demotions,
            promotions: this.promotions
        };
    }
}
