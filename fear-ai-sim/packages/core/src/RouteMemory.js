/**
 * @file RouteMemory.js — Section XV (route memory class): per-agent
 * learned route familiarity, distinct from the civilization system's
 * global perceived danger.
 *
 * Familiarity rises with safe traversals, collapses on incidents, and
 * decays without use. Entries: creation (traversal/incident), update,
 * reinforcement (safe runs), decay, conflict (incident vs familiarity),
 * forgetting (eviction of unused faint traces), persistence
 * (getState/setState), migration (state transfer), retrieval
 * (familiarity/danger recall + scorer candidates).
 *
 * Deterministic, bounded, advisory-only. Never touches host state.
 */

export const DEFAULT_ROUTE_MEMORY_CONFIG = Object.freeze({
    maxEntries: 40,
    safeGain: 0.12,           // familiarity gain per safe traversal
    incidentPenalty: 0.45,    // familiarity loss per incident (plus danger rise)
    dangerOnIncident: 0.65,   // perceived danger floor after an incident
    dangerDecayPerTick: 0.002,// own danger estimate relaxes without incidents
    familiarityDecayPerTick: 0.001,
    forgetThreshold: 0.04     // familiarity below this with no danger -> evict
});

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

export class RouteMemory {
    constructor(config = {}) {
        this.config = { ...DEFAULT_ROUTE_MEMORY_CONFIG, ...config };
        this.routes = new Map(); // routeId -> entry
        this.tickCount = 0;
    }

    _ensure(routeId, tick) {
        const id = String(routeId);
        let e = this.routes.get(id);
        if (!e) {
            e = {
                id,
                traversals: 0,
                safeTraversals: 0,
                incidents: 0,
                familiarity: 0,
                perceivedDanger: 0.5,
                lastTraversedTick: Number(tick) || 0,
                lastIncidentTick: null
            };
            this.routes.set(id, e);
            this._enforceBound();
        }
        return e;
    }

    /** Record a traversal; safe runs build familiarity and calm danger. */
    recordTraversal(routeId, { safe = true, tick = this.tickCount } = {}) {
        const e = this._ensure(routeId, tick);
        const now = Number(tick) || 0;
        e.traversals += 1;
        e.lastTraversedTick = now;
        if (safe) {
            e.safeTraversals += 1;
            e.familiarity = clamp01(e.familiarity + this.config.safeGain * (1.0 - e.familiarity));
            e.perceivedDanger = clamp01(e.perceivedDanger * 0.92);
        } else {
            this.recordIncident(routeId, 0.5, now);
        }
        return { ...e };
    }

    /** Record an incident: familiarity collapses, danger spikes. */
    recordIncident(routeId, severity = 0.5, tick = this.tickCount) {
        const e = this._ensure(routeId, tick);
        const now = Number(tick) || 0;
        const sev = clamp01(severity);
        e.incidents += 1;
        e.lastIncidentTick = now;
        e.lastTraversedTick = now;
        e.familiarity = clamp01(e.familiarity - this.config.incidentPenalty * (0.5 + sev));
        e.perceivedDanger = clamp01(Math.max(e.perceivedDanger, this.config.dangerOnIncident * (0.5 + sev)));
        return { ...e };
    }

    /** Familiarity of a route now (0 when unknown). */
    familiarity(routeId) {
        const e = this.routes.get(String(routeId));
        return e ? e.familiarity : 0;
    }

    /** Own danger estimate of a route (0.5 prior when unknown). */
    danger(routeId) {
        const e = this.routes.get(String(routeId));
        return e ? e.perceivedDanger : 0.5;
    }

    /** Advance time: familiarity fades without use; danger relaxes. */
    tick(deltaTicks = 1) {
        if (deltaTicks <= 0) return [];
        this.tickCount += deltaTicks;
        const evicted = [];
        for (const [id, e] of this.routes) {
            e.familiarity *= Math.pow(1.0 - this.config.familiarityDecayPerTick, deltaTicks);
            e.perceivedDanger = 0.5 + (e.perceivedDanger - 0.5) * Math.pow(1.0 - this.config.dangerDecayPerTick, deltaTicks);
            if (e.familiarity < this.config.forgetThreshold && e.perceivedDanger < 0.55) {
                this.routes.delete(id);
                evicted.push(id);
            }
        }
        return evicted;
    }

    /** Normalized candidates for MemoryRelevanceScorer extra stores. */
    recallCandidates() {
        const out = [];
        for (const e of this.routes.values()) {
            const salience = clamp01(Math.max(e.familiarity, Math.abs(e.perceivedDanger - 0.5) * 2));
            out.push({
                id: `route:${e.id}`,
                type: 'ROUTE_FAMILIARITY',
                tick: e.lastTraversedTick,
                salience,
                location: null,
                tags: [e.id]
            });
        }
        return out;
    }

    get size() {
        return this.routes.size;
    }

    getState() {
        return {
            tickCount: this.tickCount,
            routes: [...this.routes.values()].map((e) => ({ ...e }))
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.routes.clear();
        if (Array.isArray(snapshot.routes)) {
            for (const e of snapshot.routes) {
                if (e && e.id) this.routes.set(String(e.id), { ...e });
            }
        }
    }

    clear() {
        this.routes.clear();
    }

    _enforceBound() {
        while (this.routes.size > this.config.maxEntries) {
            let lowestId = null;
            let lowest = Infinity;
            for (const [id, e] of this.routes) {
                const key = e.familiarity + Math.abs(e.perceivedDanger - 0.5);
                if (key < lowest) {
                    lowest = key;
                    lowestId = id;
                }
            }
            if (lowestId == null) break;
            this.routes.delete(lowestId);
        }
    }
}

export default RouteMemory;
