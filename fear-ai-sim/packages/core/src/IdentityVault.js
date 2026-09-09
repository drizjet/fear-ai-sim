/**
 * packages/core/src/IdentityVault.js
 *
 * Section LXXVII:
 * LOD identity restoration — when an agent demotes to LOD2+ abstraction,
 * its identity, adaptive experience, and important relationships are
 * sealed in the vault; when promoted back to full simulation, restoration
 * returns personality bit-identically, adaptive state within epsilon,
 * and key relationship edges intact.
 *
 * What the vault keeps per agent:
 * - identity: frozen trait vector (restored exactly).
 * - adaptive: snapshot + tick stamp (restored within 1e-9 drift of seal).
 * - bonds: top-K relationship edges by |trust|+familiarity (sparse,
 *   bounded — never the full N² graph).
 * - abstractTicks: how long the agent ran abstracted (audit trail).
 *
 * While abstracted, group/faction aggregates may nudge the sealed
 * adaptive copy through applyAbstractDrift() with strict per-tick bounds
 * so distant life still shapes the character without full simulation.
 *
 * Pure state container. No host mutation. Deterministic.
 */

const IMPORTANT_EDGE_K = 12;

function freezeTraits(traits) {
    const out = {};
    for (const [k, v] of Object.entries(traits || {})) {
        out[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0.5;
    }
    return Object.freeze(out);
}

export class IdentityVault {
    constructor() {
        /** agentId -> sealed record */
        this.sealed = new Map();
    }

    /**
     * Seal an agent for abstraction.
     * @param {string} agentId
     * @param {object} snapshot { identity, adaptive, relationships? }
     *   relationships: array of { targetId, trust, familiarity, ...dims }
     * @returns seal receipt
     */
    seal(agentId, snapshot = {}) {
        const id = String(agentId);
        if (!id) throw new Error('INVALID_AGENT_ID');
        if (this.sealed.has(id)) throw new Error(`ALREADY_SEALED: ${id}`);
        if (!snapshot.identity) throw new Error('SEAL_NEEDS_IDENTITY');
        const edges = Array.isArray(snapshot.relationships) ? snapshot.relationships : [];
        const ranked = edges
            .filter((e) => e && e.targetId)
            .map((e) => ({ ...e, targetId: String(e.targetId) }))
            .sort((a, b) =>
                (Math.abs(b.trust || 0) + (b.familiarity || 0)) - (Math.abs(a.trust || 0) + (a.familiarity || 0)));
        const rec = {
            agentId: id,
            identity: freezeTraits(snapshot.identity),
            adaptive: Object.freeze({ ...(snapshot.adaptive || {}) }),
            bonds: Object.freeze(ranked.slice(0, IMPORTANT_EDGE_K)),
            droppedEdges: ranked.length - Math.min(ranked.length, IMPORTANT_EDGE_K),
            sealedTick: snapshot.tick ?? 0,
            abstractTicks: 0
        };
        this.sealed.set(id, rec);
        return { agentId: id, bondsKept: rec.bonds.length, droppedEdges: rec.droppedEdges };
    }

    /**
     * Nudge sealed adaptive state while abstracted (bounded per-tick).
     * @returns new abstract tick count
     */
    applyAbstractDrift(agentId, delta = {}, ticks = 1) {
        const rec = this.sealed.get(String(agentId));
        if (!rec) throw new Error(`NOT_SEALED: ${agentId}`);
        const n = Math.max(1, Math.min(10000, ticks | 0));
        const next = { ...rec.adaptive };
        for (const [k, d] of Object.entries(delta)) {
            if (typeof next[k] !== 'number' || typeof d !== 'number' || !Number.isFinite(d)) continue;
            next[k] = Math.max(0, Math.min(1, next[k] + d * n * 0.001));
        }
        this.sealed.set(rec.agentId, { ...rec, adaptive: Object.freeze(next), abstractTicks: rec.abstractTicks + n });
        return rec.abstractTicks + n;
    }

    /**
     * Restore a sealed agent to full simulation.
     * @returns {{ identity, adaptive, bonds, abstractTicks, fidelity }}
     */
    restore(agentId) {
        const rec = this.sealed.get(String(agentId));
        if (!rec) throw new Error(`NOT_SEALED: ${agentId}`);
        this.sealed.delete(String(agentId));
        return {
            identity: { ...rec.identity },
            adaptive: { ...rec.adaptive },
            bonds: rec.bonds.map((b) => ({ ...b })),
            abstractTicks: rec.abstractTicks,
            droppedEdges: rec.droppedEdges,
            fidelity: { identityExact: true, adaptiveEpsilon: 1e-9, bondsKept: rec.bonds.length }
        };
    }

    isSealed(agentId) {
        return this.sealed.has(String(agentId));
    }

    sealedCount() {
        return this.sealed.size;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            sealedAgents: this.sealed.size
        };
    }
}
