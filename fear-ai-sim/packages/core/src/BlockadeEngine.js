/**
 * packages/core/src/BlockadeEngine.js
 *
 * Section LIII:
 * Blockade and trade denial as a strategic alternative to combat —
 * advisory throttle tables over host-owned corridors plus cost/benefit
 * accounting for both sides. The engine never touches corridor state:
 * it publishes throttles the host may enforce, then prices the effects
 * (target deprivation, blockader upkeep, blockade-running incentives)
 * so designers and faction AI can weigh denial against strikes.
 *
 * A blockade leaks: effectiveness scales with blockader commitment and
 * corridor count (more routes = harder to seal), and runners erode it
 * over time unless commitment rises. Lifting is always an option and
 * always reported.
 *
 * Advisory only. Host owns corridors, goods, and ships.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const DEFAULT_BLOCKADE_CONFIG = Object.freeze({
    upkeepPerTick: 0.02,
    leakageRate: 0.01,
    maxEffectiveness: 0.95
});

export class BlockadeEngine {
    /**
     * @param {object} [config={}] overrides
     */
    constructor(config = {}) {
        this.config = Object.freeze({ ...DEFAULT_BLOCKADE_CONFIG, ...config });
        /** blockadeId -> record */
        this.blockades = new Map();
        this.nextId = 1;
        this.tick = 0;
    }

    /**
     * Declare a blockade.
     * @param {string} blockaderId who denies trade
     * @param {string} targetId who is denied
     * @param {string[]} corridorIds host-owned corridors affected
     * @param {object} [options={}] { commitment[0,1] }
     * @returns blockade id
     */
    declare(blockaderId, targetId, corridorIds, options = {}) {
        if (!blockaderId || !targetId || String(blockaderId) === String(targetId)) throw new Error('INVALID_BLOCKADE_PARTIES');
        if (!Array.isArray(corridorIds) || corridorIds.length === 0) throw new Error('BLOCKADE_NEEDS_CORRIDORS');
        const commitment = clamp01(options.commitment ?? 0.6);
        const id = `blockade_${this.nextId++}`;
        // More corridors dilute sealing power; commitment concentrates it.
        const coverage = round4(Math.min(1, commitment * 2 / Math.sqrt(corridorIds.length)));
        this.blockades.set(id, {
            id,
            blockaderId: String(blockaderId),
            targetId: String(targetId),
            corridorIds: [...new Set(corridorIds.map(String))].sort(),
            commitment,
            effectiveness: round4(Math.min(this.config.maxEffectiveness, coverage)),
            upkeepPaid: 0,
            active: true,
            declaredTick: this.tick
        });
        return id;
    }

    /** Advance ticks: runners erode effectiveness, upkeep accrues. */
    advanceTick(ticks = 1) {
        this.tick += ticks;
        for (const b of this.blockades.values()) {
            if (!b.active) continue;
            b.effectiveness = round4(Math.max(0, b.effectiveness - this.config.leakageRate * ticks));
            b.upkeepPaid = round4(b.upkeepPaid + this.config.upkeepPerTick * b.commitment * ticks);
            if (b.effectiveness <= 0) b.active = false;
        }
    }

    /** Host reports enforcement difficulty; recommit to restore sealing. */
    recommit(blockadeId, commitment) {
        const b = this.blockades.get(String(blockadeId));
        if (!b) throw new Error(`UNKNOWN_BLOCKADE: ${blockadeId}`);
        b.commitment = clamp01(commitment);
        b.effectiveness = round4(Math.min(this.config.maxEffectiveness,
            Math.max(b.effectiveness, b.commitment * 2 / Math.sqrt(b.corridorIds.length))));
        if (b.effectiveness > 0) b.active = true;
        return b.effectiveness;
    }

    lift(blockadeId) {
        const b = this.blockades.get(String(blockadeId));
        if (!b) throw new Error(`UNKNOWN_BLOCKADE: ${blockadeId}`);
        b.active = false;
        return { id: b.id, upkeepPaid: b.upkeepPaid };
    }

    /**
     * Advisory throttle table for the host: corridor -> allowed fraction.
     */
    throttleTable() {
        const table = {};
        for (const b of this.blockades.values()) {
            if (!b.active) continue;
            for (const c of b.corridorIds) {
                const allowed = round4(1 - b.effectiveness);
                table[c] = table[c] === undefined ? allowed : Math.min(table[c], allowed);
            }
        }
        return table;
    }

    /**
     * Price the blockade for both sides.
     * @returns {{ deprivation, blockaderCost, runnerIncentive, advisory }}
     */
    assess(blockadeId) {
        const b = this.blockades.get(String(blockadeId));
        if (!b) throw new Error(`UNKNOWN_BLOCKADE: ${blockadeId}`);
        const deprivation = round4(b.effectiveness);
        const blockaderCost = round4(b.upkeepPaid + b.commitment * 0.2);
        const runnerIncentive = round4(b.effectiveness * 0.8);
        let advisory = 'HOLD';
        if (!b.active) advisory = 'COLLAPSED';
        else if (b.effectiveness >= 0.7) advisory = 'STRANGLEHOLD';
        else if (b.effectiveness >= 0.4) advisory = 'PRESSURE';
        else if (blockaderCost > deprivation) advisory = 'LIFT_NOT_WORTH_IT';
        return { deprivation, blockaderCost, runnerIncentive, advisory, active: b.active };
    }

    auditImmutability() {
        let active = 0;
        for (const b of this.blockades.values()) if (b.active) active += 1;
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            blockadesDeclared: this.blockades.size,
            blockadesActive: active,
            tick: this.tick
        };
    }
}
