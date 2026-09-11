/**
 * packages/core/src/LodVaultCycle.js
 *
 * NEXT-116 (wire-or-retire triage execution): automatic seal/restore cycle
 * between LodDirector tier transitions and the IdentityVault.
 *
 * The director emits demotions/promotions; the vault preserves identity,
 * adaptive state, bonds, and memory across abstraction. This coordinator
 * closes that loop: demotions into abstract tiers (LOD3/LOD4 by default)
 * seal the agent via a host-supplied snapshot; promotions back out restore
 * it to a host-supplied consumer.
 *
 * Host-authority design: Fear AI never reaches into game objects. The host
 * provides snapshotProvider(agentId, transition) -> snapshot|null and
 * restoreConsumer(agentId, restored, transition). A null snapshot skips the
 * seal without throwing (recorded as skipped). All state written is
 * advisory-internal (vault records); no movement, damage, or inventory.
 */

/** Tiers at or below which an agent counts as abstracted (sealed). */
export const ABSTRACT_TIERS = Object.freeze(['LOD3', 'LOD4']);

export class LodVaultCycle {
    /**
     * @param {object} deps
     * @param {object} deps.director LodDirector instance
     * @param {object} deps.vault IdentityVault instance
     * @param {Function} deps.snapshotProvider (agentId, transition) => snapshot|null
     * @param {Function} [deps.restoreConsumer] (agentId, restored, transition) => void
     * @param {Array<string>} [deps.abstractTiers] tiers treated as abstracted
     */
    constructor(deps = {}) {
        if (!deps.director || typeof deps.director.direct !== 'function') {
            throw new Error('LOD_VAULT_CYCLE_NEEDS_DIRECTOR');
        }
        if (!deps.vault || typeof deps.vault.seal !== 'function') {
            throw new Error('LOD_VAULT_CYCLE_NEEDS_VAULT');
        }
        if (typeof deps.snapshotProvider !== 'function') {
            throw new Error('LOD_VAULT_CYCLE_NEEDS_SNAPSHOT_PROVIDER');
        }
        this.director = deps.director;
        this.vault = deps.vault;
        this.snapshotProvider = deps.snapshotProvider;
        this.restoreConsumer = typeof deps.restoreConsumer === 'function'
            ? deps.restoreConsumer
            : null;
        this.abstractTiers = new Set(deps.abstractTiers || ABSTRACT_TIERS);
        this.sealed = 0;
        this.restored = 0;
        this.skipped = 0;
    }

    _isAbstract(tier) {
        return this.abstractTiers.has(tier);
    }

    /**
     * Run one director step and apply seal/restore on transitions.
     * @param {object} [budgets] director budgets ({ lod0Cap, lod1Cap })
     * @returns {{ assignments, demotions, promotions, sealed, restored, skipped, tick }}
     */
    step(budgets = {}) {
        const outcome = this.director.direct(budgets);
        const sealed = [];
        const restored = [];
        const skipped = [];
        for (const tr of outcome.demotions || []) {
            if (!this._isAbstract(tr.to)) continue;
            if (this.vault.isSealed(tr.agentId)) continue;
            let snapshot = null;
            try {
                snapshot = this.snapshotProvider(tr.agentId, tr);
            } catch {
                snapshot = null;
            }
            if (!snapshot || !snapshot.identity) {
                skipped.push({ agentId: tr.agentId, reason: 'NO_SNAPSHOT' });
                this.skipped += 1;
                continue;
            }
            try {
                const receipt = this.vault.seal(tr.agentId, snapshot);
                sealed.push({ agentId: tr.agentId, ...receipt });
                this.sealed += 1;
            } catch {
                skipped.push({ agentId: tr.agentId, reason: 'SEAL_REJECTED' });
                this.skipped += 1;
            }
        }
        for (const tr of outcome.promotions || []) {
            if (!this.vault.isSealed(tr.agentId)) continue;
            try {
                const restoredState = this.vault.restore(tr.agentId);
                if (this.restoreConsumer) {
                    this.restoreConsumer(tr.agentId, restoredState, tr);
                }
                restored.push({ agentId: tr.agentId, abstractTicks: restoredState.abstractTicks });
                this.restored += 1;
            } catch {
                skipped.push({ agentId: tr.agentId, reason: 'RESTORE_FAILED' });
                this.skipped += 1;
            }
        }
        return {
            assignments: outcome.assignments,
            demotions: outcome.demotions,
            promotions: outcome.promotions,
            sealed,
            restored,
            skipped,
            tick: outcome.tick
        };
    }

    stats() {
        return { sealed: this.sealed, restored: this.restored, skipped: this.skipped };
    }
}
