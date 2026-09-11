/**
 * packages/core/src/SharedTraumaClock.js
 *
 * NEXT-131 (CCI-28 frontier 15): single-owner clock for a trauma engine
 * shared by many agents. Without it, N attached agents with
 * traumaAdvanceClock each advance the engine N times per world tick
 * (consolidation runs fast), while all-false freezes it. The host steps
 * this coordinator once per world tick; attached agents set
 * traumaAdvanceClock: false and only feed events plus read state.
 *
 * Idempotent per tick id: repeated step() calls with the same worldTick
 * advance once, so fan-out callers cannot double-step. Monotone guard:
 * a stale tick id is ignored, never rewound. Advisory-internal time
 * only; no host state is written.
 */
export class SharedTraumaClock {
    /**
     * @param {object} engine TraumaCrystallizationEngine (needs tick())
     */
    constructor(engine) {
        if (!engine || typeof engine.tick !== 'function') {
            throw new Error('SHARED_CLOCK_NEEDS_ENGINE');
        }
        this.engine = engine;
        this.owners = new Set();
        this.lastTickId = null;
        this.steps = 0;
    }

    /** Register an agent under shared-clock discipline. */
    claim(agentId) {
        const id = String(agentId);
        if (!id) throw new Error('INVALID_AGENT_ID');
        this.owners.add(id);
        return this.owners.size;
    }

    /** Release an agent; the clock keeps running while owners remain. */
    release(agentId) {
        this.owners.delete(String(agentId));
        return this.owners.size;
    }

    /**
     * Advance the shared engine once for worldTick. Repeated calls with
     * the same tick id are no-ops; stale ids are ignored.
     * @returns {{ advanced: boolean, engineTick: number }}
     */
    step(worldTick) {
        const id = Number(worldTick);
        if (!Number.isFinite(id)) throw new Error('INVALID_TICK_ID');
        if (this.lastTickId !== null && id <= this.lastTickId) {
            return { advanced: false, engineTick: this.engine.currentTick };
        }
        this.lastTickId = id;
        this.engine.tick(1);
        this.steps += 1;
        return { advanced: true, engineTick: this.engine.currentTick };
    }

    stats() {
        return { owners: this.owners.size, steps: this.steps, engineTick: this.engine.currentTick };
    }
}
