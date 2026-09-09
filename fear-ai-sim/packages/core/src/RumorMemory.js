/**
 * @file RumorMemory.js — Section XV (rumor memory class): per-agent
 * persistent store of heard rumors with full lifecycle.
 *
 * The propagation network spreads rumors; this store remembers them:
 * creation (hear), update (rehearing reinforcement scaled by source trust),
 * reinforcement cap, decay, contradiction (correction invalidation),
 * forgetting (below-threshold eviction with audit list), persistence
 * (getState/setState), migration (state transfer), retrieval (recall).
 *
 * Deterministic, bounded, advisory-only. Never touches host state.
 */

export const RUMOR_BELIEF_STATUS = Object.freeze({
    BELIEVED: 'BELIEVED',
    DOUBTED: 'DOUBTED',
    CORRECTED: 'CORRECTED'
});

export const DEFAULT_RUMOR_MEMORY_CONFIG = Object.freeze({
    maxEntries: 30,
    reinforceGain: 0.15,      // confidence gain per rehearing at trust 1.0
    decayPerTick: 0.004,      // confidence loss per tick unheard
    doubtThreshold: 0.35,     // below this a belief reads as DOUBTED
    forgetThreshold: 0.05,    // below this the entry is forgotten
    correctionFloor: 0.0      // corrected confidence (never negative)
});

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

export class RumorMemory {
    constructor(config = {}) {
        this.config = { ...DEFAULT_RUMOR_MEMORY_CONFIG, ...config };
        this.entries = new Map(); // rumorId -> entry
        this.tickCount = 0;
        this.forgottenLog = [];   // audit trail of forgotten rumor ids (bounded)
    }

    /**
     * Hear a rumor (first hearing creates, rehearing reinforces).
     * @param {object} rumor - { id, topic, claim, source, origin, confidence }
     * @param {number} [sourceTrust=0.5] - trust in the immediate source
     * @param {number} [tick] - defaults to internal clock
     * @returns {object} entry
     */
    hear(rumor, sourceTrust = 0.5, tick = this.tickCount) {
        if (!rumor || !rumor.id) return null;
        const now = Number(tick) || 0;
        const trust = clamp01(sourceTrust);
        const id = String(rumor.id);
        const existing = this.entries.get(id);
        if (existing) {
            if (existing.status === RUMOR_BELIEF_STATUS.CORRECTED) return existing;
            existing.confidence = clamp01(existing.confidence + this.config.reinforceGain * trust);
            existing.lastHeardTick = now;
            existing.hearCount += 1;
            if (trust > existing.sourceTrust) {
                existing.source = rumor.source ?? existing.source;
                existing.sourceTrust = trust;
            }
            this._updateStatus(existing);
            return existing;
        }
        const entry = {
            id,
            topic: String(rumor.topic ?? 'UNKNOWN'),
            claim: String(rumor.claim ?? ''),
            source: rumor.source != null ? String(rumor.source) : null,
            origin: rumor.origin != null ? String(rumor.origin) : null,
            confidence: clamp01(rumor.confidence ?? 0.5) * (0.5 + 0.5 * trust),
            sourceTrust: trust,
            heardTick: now,
            lastHeardTick: now,
            hearCount: 1,
            status: RUMOR_BELIEF_STATUS.BELIEVED,
            correctedBy: null
        };
        this._updateStatus(entry);
        this.entries.set(id, entry);
        this._enforceBound();
        return entry;
    }

    /**
     * Contradict a held rumor with a correction (invalidation, not deletion:
     * the agent remembers it was fooled).
     */
    correct(rumorId, correction = {}) {
        const entry = this.entries.get(String(rumorId));
        if (!entry) return false;
        entry.status = RUMOR_BELIEF_STATUS.CORRECTED;
        entry.confidence = this.config.correctionFloor;
        entry.correctedBy = correction.source != null ? String(correction.source) : 'unknown';
        entry.lastHeardTick = this.tickCount;
        return true;
    }

    /** Direct observation disconfirms (weaker than correction: doubt, not burial). */
    disconfirm(rumorId) {
        const entry = this.entries.get(String(rumorId));
        if (!entry || entry.status === RUMOR_BELIEF_STATUS.CORRECTED) return false;
        entry.confidence = clamp01(entry.confidence * 0.4);
        this._updateStatus(entry);
        return true;
    }

    /** Advance decay; returns ids forgotten this tick. */
    tick(deltaTicks = 1) {
        if (deltaTicks <= 0) return [];
        this.tickCount += deltaTicks;
        const forgotten = [];
        for (const [id, e] of this.entries) {
            if (e.status === RUMOR_BELIEF_STATUS.CORRECTED) continue; // corrections are sticky
            e.confidence *= Math.pow(1.0 - this.config.decayPerTick, deltaTicks);
            if (e.confidence < this.config.forgetThreshold) {
                this.entries.delete(id);
                forgotten.push(id);
            }
        }
        for (const id of forgotten) {
            this.forgottenLog.push({ id, tick: this.tickCount });
        }
        while (this.forgottenLog.length > 50) this.forgottenLog.shift();
        return forgotten;
    }

    /** Recall live beliefs (corrected excluded), optionally filtered by topic. */
    recall(topic = null) {
        const out = [];
        for (const e of this.entries.values()) {
            if (e.status === RUMOR_BELIEF_STATUS.CORRECTED) continue;
            if (topic && e.topic !== topic) continue;
            out.push({ ...e });
        }
        out.sort((a, b) => b.confidence - a.confidence || a.heardTick - b.heardTick);
        return out;
    }

    /** Normalized candidates for MemoryRelevanceScorer extra stores. */
    recallCandidates() {
        return this.recall().map((e) => ({
            id: e.id,
            type: `RUMOR:${e.topic}`,
            tick: e.lastHeardTick,
            salience: e.confidence,
            location: null,
            tags: [e.topic, e.claim.split(/\s+/).slice(0, 4).join(' ')].filter(Boolean)
        }));
    }

    get size() {
        return this.entries.size;
    }

    getState() {
        return {
            tickCount: this.tickCount,
            entries: [...this.entries.values()].map((e) => ({ ...e })),
            forgottenLog: this.forgottenLog.map((f) => ({ ...f }))
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.entries.clear();
        if (Array.isArray(snapshot.entries)) {
            for (const e of snapshot.entries) {
                if (e && e.id) this.entries.set(String(e.id), { ...e });
            }
        }
        this.forgottenLog = Array.isArray(snapshot.forgottenLog)
            ? snapshot.forgottenLog.map((f) => ({ ...f }))
            : [];
    }

    clear() {
        this.entries.clear();
        this.forgottenLog = [];
    }

    _updateStatus(entry) {
        entry.status = entry.confidence >= this.config.doubtThreshold
            ? RUMOR_BELIEF_STATUS.BELIEVED
            : RUMOR_BELIEF_STATUS.DOUBTED;
    }

    _enforceBound() {
        while (this.entries.size > this.config.maxEntries) {
            let lowestId = null;
            let lowest = Infinity;
            for (const [id, e] of this.entries) {
                const key = e.status === RUMOR_BELIEF_STATUS.CORRECTED ? e.confidence + 1.0 : e.confidence;
                if (key < lowest) {
                    lowest = key;
                    lowestId = id;
                }
            }
            if (lowestId == null) break;
            this.entries.delete(lowestId);
        }
    }
}

export default RumorMemory;
