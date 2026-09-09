/**
 * @file PlaceMemory.js — Section XV (place memory class): per-agent
 * learned place attachment, the one XV class with no adjacent coverage.
 *
 * Why this module earns its place: trauma zones are global dread fields,
 * semantic SANCTUARY entries are factual claims, route memory covers paths.
 * None expresses "this place comforts (or haunts) ME because of MY
 * history there" — personal, valenced, and location-bound. PlaceMemory is
 * exactly that: attachment in [-1, 1] per known place, reinforced by safe
 * stays, imprinted by fear events, decaying without visits.
 *
 * Lifecycle: creation (visit/event), update, reinforcement, decay,
 * conflict (fear event vs fond attachment), forgetting (eviction),
 * persistence (getState/setState), migration (state transfer), retrieval
 * (attachment query + scorer candidates).
 *
 * Deterministic, bounded, advisory-only. Never touches host state.
 */

export const DEFAULT_PLACE_MEMORY_CONFIG = Object.freeze({
    maxEntries: 40,
    safeGain: 0.08,            // attachment gain per safe visit
    fearImprint: 0.35,         // attachment loss per fear event (scaled by severity)
    decayPerTick: 0.001,       // attachment relaxes toward 0 without visits
    forgetThreshold: 0.05      // |attachment| below this with few visits -> evict
});

function clamp11(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-1, Math.min(1, n));
}

export class PlaceMemory {
    constructor(config = {}) {
        this.config = { ...DEFAULT_PLACE_MEMORY_CONFIG, ...config };
        this.places = new Map(); // placeId -> entry
        this.tickCount = 0;
    }

    _ensure(placeId, location, tick) {
        const id = String(placeId);
        let e = this.places.get(id);
        if (!e) {
            e = {
                id,
                location: location ? {
                    x: Number(location.x) || 0,
                    y: Number(location.y) || 0,
                    z: Number(location.z) || 0
                } : null,
                attachment: 0,
                visits: 0,
                fearEvents: 0,
                lastVisitTick: Number(tick) || 0
            };
            this.places.set(id, e);
            this._enforceBound();
        }
        return e;
    }

    /** Record a safe stay: fondness grows with diminishing returns. */
    recordVisit(placeId, { location = null, tick = this.tickCount } = {}) {
        const e = this._ensure(placeId, location, tick);
        e.visits += 1;
        e.lastVisitTick = Number(tick) || 0;
        if (location) {
            e.location = {
                x: Number(location.x) || 0,
                y: Number(location.y) || 0,
                z: Number(location.z) || 0
            };
        }
        e.attachment = clamp11(e.attachment + this.config.safeGain * (1.0 - Math.abs(e.attachment)));
        return { ...e };
    }

    /** Record a fear event at a place: attachment drops toward dread. */
    recordFearEvent(placeId, severity = 0.5, { location = null, tick = this.tickCount } = {}) {
        const e = this._ensure(placeId, location, tick);
        const sev = Math.max(0, Math.min(1, Number(severity) || 0.5));
        e.fearEvents += 1;
        e.lastVisitTick = Number(tick) || 0;
        e.attachment = clamp11(e.attachment - this.config.fearImprint * (0.5 + sev));
        return { ...e };
    }

    /** Attachment of a place now (0 when unknown). */
    attachment(placeId) {
        const e = this.places.get(String(placeId));
        return e ? e.attachment : 0;
    }

    /** Advance time: attachment relaxes toward 0; faint traces evicted. */
    tick(deltaTicks = 1) {
        if (deltaTicks <= 0) return [];
        this.tickCount += deltaTicks;
        const evicted = [];
        for (const [id, e] of this.places) {
            e.attachment *= Math.pow(1.0 - this.config.decayPerTick, deltaTicks);
            if (Math.abs(e.attachment) < this.config.forgetThreshold && e.visits < 3) {
                this.places.delete(id);
                evicted.push(id);
            }
        }
        return evicted;
    }

    /** Normalized candidates for MemoryRelevanceScorer extra stores. */
    recallCandidates() {
        const out = [];
        for (const e of this.places.values()) {
            out.push({
                id: `place:${e.id}`,
                type: 'PLACE_ATTACHMENT',
                tick: e.lastVisitTick,
                salience: Math.min(1, Math.abs(e.attachment)),
                location: e.location ? { ...e.location } : null,
                tags: [e.id]
            });
        }
        return out;
    }

    get size() {
        return this.places.size;
    }

    getState() {
        return {
            tickCount: this.tickCount,
            places: [...this.places.values()].map((e) => ({
                ...e,
                location: e.location ? { ...e.location } : null
            }))
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.places.clear();
        if (Array.isArray(snapshot.places)) {
            for (const e of snapshot.places) {
                if (e && e.id) this.places.set(String(e.id), { ...e });
            }
        }
    }

    clear() {
        this.places.clear();
    }

    _enforceBound() {
        while (this.places.size > this.config.maxEntries) {
            let lowestId = null;
            let lowest = Infinity;
            for (const [id, e] of this.places) {
                const key = Math.abs(e.attachment) + e.visits * 0.01;
                if (key < lowest) {
                    lowest = key;
                    lowestId = id;
                }
            }
            if (lowestId == null) break;
            this.places.delete(lowestId);
        }
    }
}

export default PlaceMemory;
