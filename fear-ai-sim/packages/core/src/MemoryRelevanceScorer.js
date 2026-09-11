/**
 * @file MemoryRelevanceScorer.js — Section XVI: deterministic memory relevance.
 *
 * NPCs must not use every memory every tick. This module ranks candidate
 * memories from a LayeredMemorySystem against the agent's current context
 * with a deterministic, fully inspectable weighted-factor score.
 *
 * Factors (weights frozen; see RELEVANCE_WEIGHTS):
 * - recency: exponential decay on (nowTick - memory.tick)
 * - importance: salience (episodic) / confidence (semantic) / dread (trauma)
 * - emotionalSalience: arousal x |valence| (episodic only; 0 elsewhere)
 * - entityMatch: 1 if any candidate entity id appears in memory participants
 *   (episodic), cue value (trauma ENTITY), or details.entityId (semantic)
 * - locationMatch: 1 - min(1, dist / radius) against memory location
 * - goalRelevance: 1 if any goal tag matches memory type/category/cue
 *   (case-insensitive substring), else 0
 *
 * Pure advisory helper: reads memory stores, never mutates host state.
 */

export const RELEVANCE_WEIGHTS = Object.freeze({
    recency: 0.25,
    importance: 0.25,
    emotionalSalience: 0.15,
    entityMatch: 0.15,
    locationMatch: 0.10,
    goalRelevance: 0.10
});

export const RELEVANCE_HALF_LIFE_TICKS = 200;

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function dist3(a, b) {
    if (!a || !b) return Infinity;
    const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
    const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
    const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function normStr(v) {
    return String(v ?? '').toLowerCase();
}
// NEXT-142 (audit candidate 6): identity-tinted salience gain.
// Neurotic agents relive hot memories; calm agents file them away.
// Absent/invalid identity or neutral 0.5 returns exactly 1.0 (legacy).
function identitySalienceGain(identity) {
    const n = Number(identity?.neuroticism);
    if (!Number.isFinite(n)) return 1.0;
    return Math.max(0, Math.min(2, 0.5 + Math.max(0, Math.min(1, n))));
}
export class MemoryRelevanceScorer {
    /**
     * @param {object} [weights={}] - override frozen defaults (recorded in output)
     */
    constructor(weights = {}) {
        this.weights = { ...RELEVANCE_WEIGHTS, ...weights };
    }

    /**
     * Score one episodic entry against context.
     * @param {object} mem - episodic entry
     * @param {object} ctx - { nowTick, entityIds, position, locationRadius, goalTags, identity }
     * identity (opt-in { neuroticism }): high-neuroticism agents uprank
     * emotionally hot memories, calm agents downrank them; absent or
     * neutral (0.5) identity reproduces legacy scores exactly.
     * @returns {{ score: number, factors: object }}
     */
    scoreEpisodic(mem, ctx = {}) {
        const now = Number(ctx.nowTick ?? mem.tick ?? 0);
        const age = Math.max(0, now - (Number(mem.tick) || 0));
        const recency = Math.pow(0.5, age / RELEVANCE_HALF_LIFE_TICKS);
        const rawSalience = clamp01(mem.arousal) * Math.min(1, Math.abs(Number(mem.valence) || 0));
        const emotionalSalience = rawSalience * identitySalienceGain(ctx.identity);
        const importance = clamp01(mem.salience);
        const entityMatch = this._entityMatch(
            ctx.entityIds,
            [...(Array.isArray(mem.participants) ? mem.participants : []), mem.details?.entityId].filter(Boolean)
        );
        const locationMatch = this._locationMatch(ctx.position, mem.location, ctx.locationRadius ?? 50);
        const goalRelevance = this._goalMatch(ctx.goalTags, [mem.type, mem.details?.goal, mem.details?.topic].filter(Boolean));
        const factors = { recency, importance, emotionalSalience, entityMatch, locationMatch, goalRelevance };
        return { score: this._combine(factors), factors };
    }

    /**
     * Score one semantic entry against context.
     */
    scoreSemantic(mem, ctx = {}) {
        const now = Number(ctx.nowTick ?? mem.lastSeenTick ?? 0);
        const age = Math.max(0, now - (Number(mem.lastSeenTick) || 0));
        const recency = Math.pow(0.5, age / RELEVANCE_HALF_LIFE_TICKS);
        const importance = clamp01(mem.confidence);
        const entityMatch = this._entityMatch(ctx.entityIds, [mem.details?.entityId].filter(Boolean));
        const locationMatch = this._locationMatch(ctx.position, mem.location, ctx.locationRadius ?? 50);
        const goalRelevance = this._goalMatch(ctx.goalTags, [mem.category, mem.key, mem.details?.topic].filter(Boolean));
        const factors = { recency, importance, emotionalSalience: 0, entityMatch, locationMatch, goalRelevance };
        return { score: this._combine(factors), factors };
    }

    /**
     * Rank episodic + semantic memories plus optional extra stores
     * (RumorMemory, RouteMemory via recallCandidates()); return top-K.
     * Deterministic: ties broken by (tick asc, id/key asc).
     * @param {object} memorySystem - LayeredMemorySystem
     * @param {object} ctx - query context
     * @param {number} [topK=5]
     * @param {Array} [extraStores=[]] - stores with recallCandidates()
     */
    rank(memorySystem, ctx = {}, topK = 5, extraStores = []) {
        const k = Math.max(1, Math.min(50, Math.floor(Number(topK) || 5)));
        const scored = [];
        const episodic = Array.isArray(memorySystem?.episodic) ? memorySystem.episodic : [];
        const semantic = memorySystem?.semantic instanceof Map
            ? [...memorySystem.semantic.values()]
            : (Array.isArray(memorySystem?.semantic) ? memorySystem.semantic : []);
        for (const mem of episodic) {
            const { score, factors } = this.scoreEpisodic(mem, ctx);
            scored.push({ layer: 'episodic', id: mem.id ?? null, type: mem.type ?? null, tick: Number(mem.tick) || 0, score, factors });
        }
        for (const mem of semantic) {
            const { score, factors } = this.scoreSemantic(mem, ctx);
            scored.push({ layer: 'semantic', id: mem.key ?? null, type: mem.category ?? null, tick: Number(mem.lastSeenTick) || 0, score, factors });
        }
        for (const store of Array.isArray(extraStores) ? extraStores : []) {
            const layer = store?.storeLayer || 'auxiliary';
            let candidates = [];
            try {
                candidates = typeof store?.recallCandidates === 'function' ? store.recallCandidates() : [];
            } catch {
                candidates = [];
            }
            for (const c of Array.isArray(candidates) ? candidates : []) {
                const pseudo = {
                    salience: c.salience ?? 0,
                    tick: c.tick ?? 0,
                    arousal: 0,
                    valence: 0,
                    participants: [],
                    location: c.location ?? null,
                    type: c.type ?? null,
                    details: { topic: (c.tags || []).join(' ') }
                };
                const { score, factors } = this.scoreEpisodic(pseudo, ctx);
                scored.push({ layer, id: c.id ?? null, type: c.type ?? null, tick: Number(c.tick) || 0, score, factors });
            }
        }
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.tick !== b.tick) return a.tick - b.tick;
            return String(a.id).localeCompare(String(b.id));
        });
        return { ranked: scored.slice(0, k), evaluated: scored.length, topK: k };
    }

    _combine(factors) {
        let s = 0;
        for (const [k, w] of Object.entries(this.weights)) {
            s += (Number(w) || 0) * (Number(factors[k]) || 0);
        }
        return clamp01(s);
    }

    _entityMatch(wanted, present) {
        if (!Array.isArray(wanted) || wanted.length === 0) return 0;
        const set = new Set(present.map(normStr));
        return wanted.some((w) => set.has(normStr(w))) ? 1 : 0;
    }

    _locationMatch(position, memLoc, radius) {
        if (!position || !memLoc) return 0;
        const r = Math.max(1, Number(radius) || 50);
        const d = dist3(position, memLoc);
        if (!Number.isFinite(d)) return 0;
        return clamp01(1 - d / r);
    }

    _goalMatch(goalTags, haystacks) {
        if (!Array.isArray(goalTags) || goalTags.length === 0) return 0;
        const hay = haystacks.map(normStr).join(' | ');
        if (!hay.trim()) return 0;
        return goalTags.some((g) => g && hay.includes(normStr(g))) ? 1 : 0;
    }
}

export default MemoryRelevanceScorer;
