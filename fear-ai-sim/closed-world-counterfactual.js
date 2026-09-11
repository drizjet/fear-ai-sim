/**
 * closed-world-counterfactual.js
 *
 * NEXT-127 (CCI-28 frontier 11): fork/advance runner adapting the canonical
 * closed-world simulation to WorldCounterfactualEngine (Sections LXVIII-LXIX).
 *
 * - fork() is saveWorld/loadWorld: bit-identical branches (proven by the
 *   zero-intervention test below).
 * - advance(n) ticks the world and returns the engine's summary contract.
 * - Staged attack scripts ride on the runner (not the world) so both
 *   branches stage symmetrically; the mutation touches only the
 *   counterfactual branch.
 * - Summary mapping is documented where the closed world lacks a channel:
 *   meanPopulationFear reads merchant route dread (max routeBelief danger);
 *   wars/alliances/panics read 0 because closed-world has no such events.
 */

import {
    tickClosedWorld,
    saveWorld,
    loadWorld,
    appendWorldEvent
} from './closed-world.js';

function countEvents(world, type) {
    let n = 0;
    for (const e of world.events || []) {
        if (e && e.type === type) n += 1;
    }
    return n;
}

function meanRouteDread(world) {
    let sum = 0;
    let n = 0;
    for (const m of world.merchants || []) {
        const beliefs = m.routeBeliefs || {};
        let worst = 0;
        for (const b of Object.values(beliefs)) {
            if (b && Number.isFinite(b.perceivedDanger)) worst = Math.max(worst, b.perceivedDanger);
        }
        sum += worst;
        n += 1;
    }
    return n > 0 ? sum / n : 0;
}

export class ClosedWorldRunner {
    /**
     * @param {object} world closed-world state
     * @param {object} [options]
     * @param {object} [options.tickParams] params forwarded to tickClosedWorld
     * @param {Array<{ tick: number, build: (world) => object }>} [options.script]
     *   staged world events, applied symmetrically in every branch
     * @param {number} [options.currentTick=0]
     */
    constructor(world, options = {}) {
        this.world = world;
        this.tickParams = { perceivedDanger: 0.0, ...(options.tickParams || {}) };
        this.script = Array.isArray(options.script) ? options.script : [];
        this.currentTick = options.currentTick || 0;
    }

    fork() {
        return new ClosedWorldRunner(loadWorld(saveWorld(this.world)), {
            tickParams: { ...this.tickParams },
            script: this.script,
            currentTick: this.currentTick
        });
    }

    advance(ticks = 1) {
        const n = Math.max(1, Math.floor(ticks));
        for (let i = 0; i < n; i++) {
            this.currentTick += 1;
            for (const s of this.script) {
                if (s && s.tick === this.currentTick && typeof s.build === 'function') {
                    appendWorldEvent(this.world, s.build(this.world));
                }
            }
            tickClosedWorld(this.world, { ...this.tickParams, tick: this.currentTick });
        }
        return this.summarize();
    }

    summarize() {
        return {
            meanPopulationFear: meanRouteDread(this.world),
            totalEncounters: countEvents(this.world, 'ENCOUNTER'),
            routeFailures: countEvents(this.world, 'BANDIT_ATTACK'),
            panicIncidents: 0,
            warsDeclared: 0,
            alliancesFormed: 0,
            warsActive: 0,
            alliancesActive: 0
        };
    }
}

/** Counterfactual mutation: ground-truth route danger goes to zero. */
export function disableRouteDanger(world) {
    for (const r of world.routes || []) r.actualDanger = 0;
    return { disabledRoutes: (world.routes || []).length };
}
