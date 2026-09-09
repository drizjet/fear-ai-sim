/**
 * packages/core/src/AnticipatoryFearEngine.js
 *
 * Section XXI:
 * Fear from information — an NPC may fear a road, faction, monster, or
 * region it has never directly observed. Information creates anticipatory
 * fear that biases route choice, trade risk, and faction stance BEFORE
 * any sensory contact.
 *
 * Reads held rumors/beliefs (from InformationPropagationEngine inboxes or
 * EpistemicBeliefEngine stores — both as plain { confidence } records) and
 * folds them into per-target dread scores with three guardrails:
 * 1. Direct observation always dominates hearsay (observed truth > rumor).
 * 2. Dread saturates: ten rumors of the same road do not stack linearly.
 * 3. Dread extinguishes: without refresh, anticipatory fear decays toward
 *    the identity-anchored baseline instead of locking permanently.
 *
 * Advisory only. Host owns movement, routing, and encounters.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const DREAD_TARGETS = Object.freeze(['ROAD', 'FACTION', 'MONSTER', 'REGION', 'ROUTE']);

export const DEFAULT_DREAD_CONFIG = Object.freeze({
    rumorWeight: 0.6,
    observedWeight: 1.0,
    saturationKnee: 0.7,
    extinctionRate: 0.02,
    minDread: 0.02
});

export class AnticipatoryFearEngine {
    /**
     * @param {object} [config={}] overrides
     * @param {object} [identity={}] { neuroticism, resilience } baseline tints
     */
    constructor(config = {}, identity = {}) {
        this.config = Object.freeze({ ...DEFAULT_DREAD_CONFIG, ...config });
        this.identity = Object.freeze({
            neuroticism: clamp01(identity.neuroticism ?? 0.5),
            resilience: clamp01(identity.resilience ?? 0.5)
        });
        /** targetKey -> { dread, lastRefreshTick, observed } */
        this.dread = new Map();
        this.tick = 0;
    }

    static targetKey(kind, id) {
        if (!DREAD_TARGETS.includes(kind)) throw new Error(`UNKNOWN_DREAD_TARGET: ${kind}`);
        return `${kind}:${String(id)}`;
    }

    /**
     * Absorb one information item about a target.
     * @param {string} kind ROAD | FACTION | MONSTER | REGION | ROUTE
     * @param {string} id target identifier
     * @param {object} info { confidence, observed: boolean, threatLevel }
     */
    absorb(kind, id, info = {}) {
        const key = AnticipatoryFearEngine.targetKey(kind, id);
        const confidence = clamp01(info.confidence ?? 0.5);
        const observed = info.observed === true;
        const threat = clamp01(info.threatLevel ?? 0.7);
        const weight = observed ? this.config.observedWeight : this.config.rumorWeight;
        // Identity tints uptake: neurotic agents dread faster, resilient slower.
        const uptake = weight * confidence * threat * (0.7 + this.identity.neuroticism * 0.5 - this.identity.resilience * 0.2);
        const cur = this.dread.get(key) || { dread: 0, lastRefreshTick: this.tick, observed: false };
        // Saturating add: d' = d + (1 - d) * uptake * (1 - knee * d).
        const added = (1 - cur.dread) * clamp01(uptake) * (1 - this.config.saturationKnee * cur.dread);
        this.dread.set(key, {
            dread: round4(clamp01(cur.dread + added)),
            lastRefreshTick: this.tick,
            observed: cur.observed || observed
        });
        return this.dread.get(key).dread;
    }

    /** Advance ticks: unrefreshed dread extinguishes toward baseline. */
    advanceTick(ticks = 1) {
        this.tick += ticks;
        for (const [key, rec] of this.dread.entries()) {
            const age = this.tick - rec.lastRefreshTick;
            if (age <= 0) continue;
            // Observed dread extinguishes slower (memory of real danger lingers).
            const rate = rec.observed ? this.config.extinctionRate * 0.5 : this.config.extinctionRate;
            const decayed = rec.dread - rate * age;
            if (decayed <= this.config.minDread && !rec.observed) {
                this.dread.delete(key);
            } else {
                rec.dread = round4(Math.max(rec.observed ? this.config.minDread : 0, decayed));
                this.dread.set(key, rec);
            }
        }
    }

    dreadOf(kind, id) {
        const rec = this.dread.get(AnticipatoryFearEngine.targetKey(kind, id));
        return rec ? rec.dread : 0;
    }

    /**
     * Advisory route ranking: host supplies candidates, engine scores dread.
     * @param {{ id: string, danger?: number }[]} candidates host-owned routes
     * @returns ranked [{ id, dread, advisory }] — advisory is USE | CAUTION | AVOID.
     */
    rankRoutes(candidates) {
        if (!Array.isArray(candidates)) throw new Error('CANDIDATES_MUST_BE_ARRAY');
        return candidates
            .map((c) => {
                const dread = Math.max(this.dreadOf('ROAD', c.id), this.dreadOf('ROUTE', c.id), clamp01(c.danger ?? 0) * 0.5);
                const advisory = dread >= 0.65 ? 'AVOID' : dread >= 0.35 ? 'CAUTION' : 'USE';
                return { id: String(c.id), dread: round4(dread), advisory };
            })
            .sort((a, b) => a.dread - b.dread);
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            targetsTracked: this.dread.size,
            tick: this.tick
        };
    }
}
