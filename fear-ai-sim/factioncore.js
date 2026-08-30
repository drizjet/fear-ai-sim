import { Evidence, INFORMATION_LAYERS } from './beliefs.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

export const ESCALATION_LEVELS = Object.freeze({
    NORMAL: 0,
    WATCHFUL: 1,
    DEFENSIVE: 2,
    DETERRENT: 3,
    COERCIVE: 4,
    RAIDING: 5,
    RETALIATORY: 6,
    LIMITED_WAR: 7,
    TOTAL_WAR: 8
});

export class FactionIntelligence {
    constructor(factionId) {
        this.factionId = factionId;
        this.estimates = new Map();
        this.evidence = [];
    }

    observe(evidenceLike) {
        const evidence = evidenceLike instanceof Evidence ? evidenceLike : new Evidence(evidenceLike);
        this.evidence.push(evidence);
        const prior = this.estimates.get(evidence.subject);
        const weight = evidence.weight();
        const estimate = prior === undefined || weight === 0
            ? evidence.value
            : typeof prior === 'number' && typeof evidence.value === 'number'
                ? prior + (evidence.value - prior) * clamp(weight)
                : evidence.value;
        this.estimates.set(evidence.subject, estimate);
        return { layer: INFORMATION_LAYERS.FACTION_INTELLIGENCE, subject: evidence.subject, value: estimate, confidence: clamp(weight), sourceId: evidence.sourceId };
    }

    get(subject) {
        return this.estimates.get(subject);
    }
}

// Pure helper: compute the multiplicative decay rate from a configurable
// half-life (in ticks). Returns a value in (0, 1] representing the
// fraction of `previous` retained per tick. `decay = 1 - 2^(-1/halfLife)`.
// halfLife = Infinity → decay = 0 (no decay). halfLife <= 0 → decay = 1
// (instant collapse). This is the stock-flow split for emotion variables:
// the half-life is the parameter, the per-tick decay is derived.
export function decayFromHalfLife(halfLifeTicks) {
    if (!Number.isFinite(halfLifeTicks)) return 0;
    if (halfLifeTicks <= 0) return 1;
    return 1 - Math.pow(2, -1 / halfLifeTicks);
}

export class FactionDecisionModel {
    constructor({ id, fear = 0, grievance = 0, militaryConfidence = 0.5, riskTolerance = 0.5, townId = null, resources = 1, maxResources = 1, memoryOfLoss = 0, fearHalfLifeTicks = 6.6, griefHalfLifeTicks = 22.8, lastRaidTick = null, informationConfidence = 1.0 } = {}) {
        this.id = id;
        this.fear = clamp(fear);
        this.grievance = clamp(grievance);
        this.militaryConfidence = clamp(militaryConfidence);
        this.riskTolerance = clamp(riskTolerance);
        this.escalation = ESCALATION_LEVELS.NORMAL;
        this.intelligence = new FactionIntelligence(id);
        this.lastDecision = null;
        // Tick on which this faction last executed a raid. Used by
        // the closed-world reducer to enforce a per-faction raid
        // cooldown (default 5 ticks). The audit's long-horizon
        // trace showed that without a cooldown, factions oscillated
        // `res=0 ↔ res=1, dec=RAID ↔ HOLD` every other tick, which
        // is unrealistic for a fear simulation. A raid campaign in
        // any real-world system takes time to organize, and the
        // cooldown models that preparation cost. `null` means the
        // faction has never raided in this run; the reducer
        // accepts that as "no cooldown applies yet".
        this.lastRaidTick = Number.isFinite(lastRaidTick) ? lastRaidTick : null;
        // Resource pool consumed by `executeRetaliation` and refilled by the
        // closed-world reducer. Default of 1 keeps legacy single-shot usage
        // working; the closed-world scenario seeds `resources: 2` so a
        // faction can retaliate, recover, and retaliate again.
        this.townId = townId;
        this.resources = Math.max(0, Number.isFinite(resources) ? resources : 1);
        this.maxResources = Math.max(this.resources, Number.isFinite(maxResources) ? maxResources : this.resources);
        // Slow-moving historical trauma: a faction that has been hit before
        // remembers it, but the memory decays more slowly than current
        // grievance. Used as a separate input to raidScore so the
        // stock-and-flow distinction is preserved (current stimulus drives
        // current behavior, not cumulative history).
        this.memoryOfLoss = clamp(memoryOfLoss);
        // Slice EVID-2026-08-28-PERSPECTIVE-AWARE-CHOOSE-STANCE-LIVE:
        // per-faction information confidence drives the
        // chooseStance uncertainty gate (cannot escalate
        // from TOLERANT with low confidence). Default 1.0
        // is the legacy "fully informed" assumption; a
        // future slice can model observational limits by
        // reducing this as a function of distance to the
        // last observation.
        this.informationConfidence = clamp(informationConfidence);
        // Half-lives (in ticks) for the slow-moving emotion states. The
        // reducer computes the per-tick decay from these. Defaults are
        // 6.6 ticks for fear (10% per tick, matches the "shock" timescale
        // the audit suggested) and 22.8 ticks for grievance (3% per tick,
        // historical grudges are sticky). Callers can tune by passing
        // different values in the constructor.
        this.fearHalfLifeTicks = fearHalfLifeTicks;
        this.griefHalfLifeTicks = griefHalfLifeTicks;
    }

    // Advance slow-moving emotion states one tick. `fear` tracks a
    // *stimulus* (perceivedDanger) using a leaky integrator: previous
    // fear decays toward the stimulus at the configured rate. When the
    // stimulus drops, fear lingers; when it rises, fear tracks up at
    // the same rate. Default 6.6 ticks ≈ 10%/tick.
    //
    // `grievance` accumulates *flows* (supplyShortage, confirmedLoss) and
    // decays toward 0. The contribution of one tick's flow is the full
    // amount (not scaled by decay), and the running total decays at the
    // configured rate. This is the audit's stock-flow split: a flow is
    // "the amount added during the current interval," not "the fraction
    // of the stimulus that contributes this tick." Default 22.8 ticks ≈
    // 3%/tick.
    //
    // `memoryOfLoss` is also additive-with-decay: a new flow is added
    // fully, the running total decays. Caller controls the per-tick
    // memory decay; the existing test contract is 5%/tick
    // (≈ 13.5-tick half-life).
    //
    // The function mutates `this.fear`, `this.grievance`, and
    // `this.memoryOfLoss` in place. Callers can override the per-tick
    // decay rates via the named arguments; a value of `null` falls back
    // to the configured half-life. `null` for `memoryDecayPerTick` means
    // "no decay, just accumulate" (preserves the original
    // memoryOfLoss = additive contract for legacy callers).
    advanceEmotion({
        perceivedDanger = 0,
        supplyShortage = 0,
        confirmedLoss = 0,
        newMemoryLoss = 0,
        fearDecayPerTick = null,
        griefDecayPerTick = null,
        memoryDecayPerTick = null
    } = {}) {
        // Fear: leaky integrator. The decay fraction comes from the
        // configured half-life unless the caller passes an explicit
        // per-tick rate.
        const fearDecay = fearDecayPerTick === null
            ? decayFromHalfLife(this.fearHalfLifeTicks)
            : clamp(fearDecayPerTick);
        const stimulus = clamp(perceivedDanger);
        const previous = clamp(this.fear);
        this.fear = clamp(previous * (1 - fearDecay) + stimulus * fearDecay);
        // Grievance: additive-with-decay. The current tick's full flow
        // is added, the running total decays. The first tick of an
        // attack contributes `confirmedLoss * 0.2` (matches the old
        // formula) but the stock then decays each tick, so repeated
        // attacks compound up to a saturation that depends on the
        // stimulus, not the historical count.
        const griefDecay = griefDecayPerTick === null
            ? decayFromHalfLife(this.griefHalfLifeTicks)
            : clamp(griefDecayPerTick);
        const griefBefore = clamp(this.grievance);
        // Coefficients calibrated against the audit's quantitative
        // finding: with the prior `0.4 * supplyShortage`, a chronic
        // 100% shortage saturated grievance to 1.0 in <50 ticks
        // because equilibrium = 0.4 / 0.03 ≈ 13.3, clamped. The new
        // coefficients split the responsibility: chronic shortage is
        // a *gentle* dissatisfaction signal (low coefficient) and
        // witnessed attacks are the *acute* driver (high coefficient).
        // With griefDecay ≈ 0.03 (22.8-tick half-life), a chronic
        // 100% shortage now settles at 0.05 / 0.03 ≈ 1.67 → 1.0 in
        // ~50 ticks but the saturation is *gentle*, not explosive.
        // A single attack adds 0.4 (its full flow), then decays at
        // 3%/tick, so a single attack by itself cannot push grievance
        // to saturation.
        const griefFlow = (supplyShortage * 0.05 + confirmedLoss * 0.4);
        this.grievance = clamp(griefBefore * (1 - griefDecay) + griefFlow);
        // Memory: additive-with-decay. Same shape as grievance.
        if (memoryDecayPerTick === null) {
            if (newMemoryLoss > 0) {
                this.memoryOfLoss = clamp(clamp(this.memoryOfLoss) + newMemoryLoss);
            }
        } else {
            const memDecay = clamp(memoryDecayPerTick);
            const memBefore = clamp(this.memoryOfLoss);
            this.memoryOfLoss = clamp(memBefore * (1 - memDecay) + (newMemoryLoss || 0));
        }
        return { fear: this.fear, grievance: this.grievance, memoryOfLoss: this.memoryOfLoss };
    }

    // `confirmedLoss` is the **flow** for this tick (new attacks * loss),
    // not the cumulative historical count. `supplyShortage` is the current
    // market-derived value (0..1) and should also be a flow. `memoryOfLoss`
    // is read-only here; decay is applied by `advanceEmotion` / the reducer.
    // The reducer should call `advanceEmotion` first, then `reassess`.
    reassess({ perceivedDanger = 0, supplyShortage = 0, enemyWeakness = 0, confirmedLoss = 0 } = {}) {
        const memoryBias = clamp(this.memoryOfLoss) * 0.1;
        const raidScore = clamp(this.grievance + enemyWeakness * 0.4 + this.militaryConfidence * 0.2 - this.fear * (1 - this.riskTolerance) * 0.5 + memoryBias);
        this.escalation = raidScore >= 0.75 ? ESCALATION_LEVELS.RETALIATORY : raidScore >= 0.55 ? ESCALATION_LEVELS.RAIDING : raidScore >= 0.35 ? ESCALATION_LEVELS.DEFENSIVE : ESCALATION_LEVELS.NORMAL;
        // Resource gate: a faction that has exhausted its resources
        // cannot enter RAID state. Without this gate, the previous
        // model produced a death spiral where a faction with high
        // grievance but zero resources stayed in RAID forever,
        // locked out of the refill rule that only fires for
        // non-RAIDing factions. With the gate, an empty faction
        // automatically returns to HOLD, regains resources, and can
        // re-enter RAID when the gates (grievance + resources) align.
        const hasResources = (this.resources || 0) > 0;
        this.lastDecision = (this.escalation >= ESCALATION_LEVELS.RAIDING && hasResources) ? 'RAID' : 'HOLD';
        return { factionId: this.id, decision: this.lastDecision, escalation: this.escalation, raidScore, fear: this.fear, grievance: this.grievance, memoryOfLoss: this.memoryOfLoss, hasResources };
    }
}
