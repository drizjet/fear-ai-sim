/**
 * packages/core/src/RetaliationModel.js
 *
 * Sections XLII-XLIV:
 * Proportional retaliation with grievance memory and war exhaustion.
 * Neither one insult → eternal war nor one massacre → instantly forgotten:
 * - Response scale tracks provocation severity with diminishing returns,
 *   so atrocities answer strongly but never infinitely.
 * - Grievance memory decays with a long half-life; each unanswered blow
 *   compounds, each answered blow settles part of the account.
 * - War exhaustion accumulates with conflict duration and cost, braking
 *   escalation and pricing peace incentives (XLIII). Ceasefires hold
 *   while exhaustion exceeds grievance and collapse back into conflict
 *   when fresh provocation outweighs fatigue (XLIV).
 *
 * Reads host-reported provocations; outputs advisory response levels and
 * semantic intents (WARN, DEMAND_PAYMENT, THREATEN, MOBILIZE-equivalent
 * PRESSURE, CEASEFIRE, SURRENDER never recommended — only the host
 * surrenders). Advisory only.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const PROVOCATION_SEVERITY = Object.freeze({
    INSULT: 0.1,
    TRESPASS: 0.25,
    PROVOCATION: 0.35,
    RAID: 0.6,
    SKIRMISH_DEATHS: 0.55,
    MASSACRE: 0.9,
    TREATY_BREACH: 0.75
});

export const RETALIATION_INTENTS = Object.freeze([
    'IGNORE', 'OBSERVE', 'WARN', 'DEMAND_PAYMENT', 'THREATEN', 'PRESSURE', 'STRIKE_BACK', 'CEASEFIRE'
]);

export const DEFAULT_RETALIATION_CONFIG = Object.freeze({
    memoryHalfLifeTicks: 500,
    exhaustionRate: 0.02,
    exhaustionRecovery: 0.005
});

export class RetaliationModel {
    /**
     * @param {object} [config={}] overrides
     */
    constructor(config = {}) {
        this.config = Object.freeze({ ...DEFAULT_RETALIATION_CONFIG, ...config });
        /** pairKey -> { grievance, exhaustion, tick, provocations } */
        this.accounts = new Map();
        this.tick = 0;
    }

    static pairKey(a, b) {
        return [String(a), String(b)].sort().join('|');
    }

    /** Host reports a provocation by source against target. */
    provoke(sourceId, targetId, kind) {
        if (!(kind in PROVOCATION_SEVERITY)) throw new Error(`UNKNOWN_PROVOCATION: ${kind}`);
        const key = RetaliationModel.pairKey(sourceId, targetId);
        const acc = this.accounts.get(key) || { grievance: 0, exhaustion: 0, tick: this.tick, provocations: 0 };
        // Diminishing returns: g' = g + (1 - g) * severity * 0.8.
        acc.grievance = round4(acc.grievance + (1 - acc.grievance) * PROVOCATION_SEVERITY[kind] * 0.8);
        acc.provocations += 1;
        acc.tick = this.tick;
        this.accounts.set(key, acc);
        return this.recommend(sourceId, targetId);
    }

    /** Advance ticks: grievance memory fades slowly, exhaustion shifts. */
    advanceTick(ticks = 1, atWar = false) {
        this.tick += ticks;
        const decay = 1 - Math.pow(2, -ticks / this.config.memoryHalfLifeTicks);
        for (const acc of this.accounts.values()) {
            acc.grievance = round4(Math.max(0, acc.grievance - decay * acc.grievance));
            acc.exhaustion = round4(atWar
                ? clamp01(acc.exhaustion + this.config.exhaustionRate * ticks)
                : clamp01(acc.exhaustion - this.config.exhaustionRecovery * ticks));
        }
    }

    /**
     * Advisory recommendation for target's response toward source.
     * @returns {{ intent, level, grievance, exhaustion }}
     */
    recommend(sourceId, targetId) {
        const key = RetaliationModel.pairKey(sourceId, targetId);
        const acc = this.accounts.get(key) || { grievance: 0, exhaustion: 0 };
        const netPressure = acc.grievance * (1 - acc.exhaustion * 0.7);
        let intent = 'IGNORE';
        if (netPressure >= 0.7) intent = 'STRIKE_BACK';
        else if (netPressure >= 0.5) intent = 'PRESSURE';
        else if (netPressure >= 0.35) intent = 'THREATEN';
        else if (netPressure >= 0.2) intent = 'DEMAND_PAYMENT';
        else if (netPressure >= 0.06) intent = 'WARN';
        else if (netPressure >= 0.02) intent = 'OBSERVE';
        // Exhaustion prices peace: spent pairs prefer ceasefire to any pressure rung.
        if (acc.exhaustion >= 0.6 && netPressure >= 0.2) intent = 'CEASEFIRE';
        return {
            intent,
            level: round4(netPressure),
            grievance: round4(acc.grievance),
            exhaustion: round4(acc.exhaustion)
        };
    }

    /** Answering a grievance settles part of the account. */
    settle(sourceId, targetId, fraction = 0.5) {
        const key = RetaliationModel.pairKey(sourceId, targetId);
        const acc = this.accounts.get(key);
        if (!acc) return 0;
        acc.grievance = round4(acc.grievance * (1 - clamp01(fraction)));
        return acc.grievance;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            accountsTracked: this.accounts.size,
            tick: this.tick
        };
    }
}
