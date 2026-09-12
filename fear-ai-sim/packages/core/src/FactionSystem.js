/**
 * FactionSystem - Multi-faction diplomacy, military readiness, territorial appraisal,
 * and the 14-stage bilateral escalation matrix.
 *
 * Models strategic inter-faction interactions across 14 distinct escalation stages:
 * UNAWARE -> OBSERVE -> AVOID -> WARN -> NEGOTIATE -> TRADE -> SHADOW ->
 * THREATEN -> MOBILIZE -> SKIRMISH -> ATTACK -> RETREAT -> SURRENDER -> ALLY.
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Evaluates semantic faction stances, capability gates, and strategic recommendations,
 * while the host game engine executes unit movement, combat resolution, physics, and world state.
 */

import { RetaliationModel } from './RetaliationModel.js';
export const ESCALATION_STAGES = Object.freeze({
    UNAWARE: 'UNAWARE',
    OBSERVE: 'OBSERVE',
    AVOID: 'AVOID',
    WARN: 'WARN',
    NEGOTIATE: 'NEGOTIATE',
    TRADE: 'TRADE',
    SHADOW: 'SHADOW',
    THREATEN: 'THREATEN',
    MOBILIZE: 'MOBILIZE',
    SKIRMISH: 'SKIRMISH',
    ATTACK: 'ATTACK',
    RETREAT: 'RETREAT',
    SURRENDER: 'SURRENDER',
    ALLY: 'ALLY'
});

export const FACTION_CULTURES = Object.freeze({
    MILITARISTIC: 'MILITARISTIC',
    MERCANTILE: 'MERCANTILE',
    ISOLATIONIST: 'ISOLATIONIST',
    EXPANSIONIST: 'EXPANSIONIST',
    HONORABLE: 'HONORABLE',
    DEVOUT: 'DEVOUT'
});

export const INCIDENT_TYPES = Object.freeze({
    BORDER_TRESPASS: 'BORDER_TRESPASS',
    TRADE_ESTABLISHED: 'TRADE_ESTABLISHED',
    TREATY_OFFERED: 'TREATY_OFFERED',
    PROVOCATION: 'PROVOCATION',
    RUMOR_HEARSAY: 'RUMOR_HEARSAY',
    RUMOR_EXONERATED: 'RUMOR_EXONERATED',
    RAID_CONFIRMED: 'RAID_CONFIRMED',
    SKIRMISH_CASUALTY: 'SKIRMISH_CASUALTY',
    TRIBUTE_PAID: 'TRIBUTE_PAID',
    TREATY_BROKEN: 'TREATY_BROKEN',
    PEACE_OFFER: 'PEACE_OFFER',
    // R29: a fractured council steps its own war posture down. Cools the
    // deliberator's grievance without touching trust or casus belli.
    GOVERNANCE_STAND_DOWN: 'GOVERNANCE_STAND_DOWN'
});

export const DEFAULT_FACTION_CONFIG = Object.freeze({
    hysteresisDelta: 0.12,          // Upward escalation requires higher threshold than downward
    minMilitaryForMobilize: 0.25,   // Capability gate for MOBILIZE
    minMilitaryForAttack: 0.35,     // Capability gate for ATTACK
    minResourceStockpile: 0.10,     // Resource starvation threshold
    minInfoConfidence: 0.30,        // Uncertainty gate for escalating beyond OBSERVE/AVOID
    grievanceHalfLifeTicks: 60.0,   // Sticky historical grudges
    fearHalfLifeTicks: 25.0,        // Acute fear timescale
    maxIncidentsPerPair: 20         // Bounded history cap
});

// R14b: hostile incident -> retaliation provocation kinds. Only physical /
// diplomatic blows feed the exhaustion ledger; rumors, trade, tribute, and
// peace gestures do not tire armies.
const PROVOCATION_BY_INCIDENT = Object.freeze({
    BORDER_TRESPASS: 'TRESPASS',
    PROVOCATION: 'PROVOCATION',
    RAID_CONFIRMED: 'RAID',
    SKIRMISH_CASUALTY: 'SKIRMISH_DEATHS',
    TREATY_BROKEN: 'TREATY_BREACH'
});

function clamp01(v) {
    if (!Number.isFinite(v)) return 0.0;
    return Math.max(0.0, Math.min(1.0, v));
}

/**
 * NEXT-56: shared casualty-severity map (NEXT-48 fight-back and NEXT-55
 * border paths). Strength share 0 -> floor, share >= knee -> 1.0.
 * Defaults reproduce the shipped behavior exactly; the sweep varies them
 * to calibrate the designer-facing tradeoff surface.
 */
export function casualtySeverityScale(share, floor = 0.25, knee = 0.5) {
    const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0.5;
    const f = Number.isFinite(floor) ? Math.min(1, Math.max(0, floor)) : 0.25;
    const k = Number.isFinite(knee) && knee > 0 ? knee : 0.5;
    return f + (1 - f) * Math.min(1, s / k);
}

export class FactionSystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_FACTION_CONFIG, ...config };
        // Map<factionId, FactionProfile>
        this.factions = new Map();
        // Map<sourceId, Map<targetId, BilateralStance>>
        this.stances = new Map();
        // R14b: internal retaliation ledger. recordIncident feeds it,
        // advanceTick ages it, evaluateStance brakes on it — no host
        // wiring needed. Fresh ledgers read exhaustion 0 (legacy-exact).
        this.retaliation = new RetaliationModel();
        this.tickCount = 0;
    }

    /**
     * Register a faction profile
     * @param {object} profile
     * @returns {object} registered faction
     */
    registerFaction({
        id,
        name = null,
        culture = FACTION_CULTURES.HONORABLE,
        militaryReadiness = 0.5,
        economicStockpile = 0.5,
        legitimacy = 0.8,
        riskTolerance = 0.5,
        territories = [],
        metadata = {}
    } = {}) {
        if (!id) return null;
        const faction = {
            id: String(id),
            name: name ? String(name) : String(id),
            culture: String(culture || FACTION_CULTURES.HONORABLE),
            militaryReadiness: clamp01(militaryReadiness),
            economicStockpile: clamp01(economicStockpile),
            legitimacy: clamp01(legitimacy),
            riskTolerance: clamp01(riskTolerance),
            cohesion: 0.7,
            morale: 0.7,
            // R11: succession advisory state. splinterRisk is the current
            // breakaway risk level (0 = none); lastPolicyShift records the
            // magnitude of the most recent leadership break (0 = continuity).
            splinterRisk: 0,
            lastPolicyShift: 0,
            territories: Array.isArray(territories) ? [...new Set(territories.map(String))] : [],
        };
        this.factions.set(faction.id, faction);
        return faction;
    }

    /**
     * Retrieve faction by id
     * @param {string} id
     * @returns {object|null}
     */
    getFaction(id) {
        return this.factions.get(id) || null;
    }
    /**
     * Apply a SuccessionEngine.resolve() outcome (NOW-4 wiring, R11 risk
     * state). Cohesion/morale deltas land on the faction record, clamped;
     * the successor id is recorded as leaderId; the splinterRisk level and
     * last policy-shift magnitude land as readable advisory state (finite
     * numbers only, clamped — garbage leaves prior state). Returns the
     * updated record, or null for unknown factions.
     */
    applySuccession(result = {}) {
        const faction = result && result.factionId ? this.factions.get(String(result.factionId)) : null;
        if (!faction) return null;
        const clamp = (v) => Math.max(0, Math.min(1, Number(v)));
        if (Number.isFinite(Number(result.cohesionDelta))) {
            faction.cohesion = clamp(faction.cohesion + Number(result.cohesionDelta));
        }
        if (Number.isFinite(Number(result.moraleDelta))) {
            faction.morale = clamp(faction.morale + Number(result.moraleDelta));
        }
        if (result.successorId) faction.leaderId = String(result.successorId);
        if (typeof result.splinterRisk === 'number' && Number.isFinite(result.splinterRisk)) {
            faction.splinterRisk = clamp(result.splinterRisk);
        }
        if (typeof result.policyShift === 'number' && Number.isFinite(result.policyShift)) {
            faction.lastPolicyShift = clamp(result.policyShift);
        }
        return faction;
    }

    /**
     * Retrieve all registered factions
     * @returns {Array<object>}
     */
    getAllFactions() {
        return Array.from(this.factions.values());
    }

    /**
     * Disband and unregister faction
     * @param {string} id
     */
    disbandFaction(id) {
        this.factions.delete(id);
        this.stances.delete(id);
        for (const m of this.stances.values()) {
            m.delete(id);
        }
    }

    /**
     * Get or initialize directed bilateral stance from source to target
     * @param {string} sourceId
     * @param {string} targetId
     * @returns {object} bilateral stance
     */
    getBilateralStance(sourceId, targetId) {
        if (!sourceId || !targetId || sourceId === targetId) return null;
        let sourceMap = this.stances.get(sourceId);
        if (!sourceMap) {
            sourceMap = new Map();
            this.stances.set(sourceId, sourceMap);
        }
        let stance = sourceMap.get(targetId);
        if (!stance) {
            stance = {
                sourceId: String(sourceId),
                targetId: String(targetId),
                stage: ESCALATION_STAGES.UNAWARE,
                previousStage: ESCALATION_STAGES.UNAWARE,
                compositePressure: 0.0,
                trust: 0.0,
                grievance: 0.0,
                fear: 0.0,
                territorialPressure: 0.0,
                economicPressure: 0.0,
                informationConfidence: 0.0,
                lastTransitionTick: this.tickCount,
                casusBelli: null,
                incidents: []
            };
            sourceMap.set(targetId, stance);
        }
        return stance;
    }

    /**
     * Record a discrete incident between two factions
     * @param {string} sourceId - Actor committing the incident
     * @param {string} targetId - Recipient / victim
     * @param {string} type - INCIDENT_TYPES
     * @param {object} [details={}]
     */
    recordIncident(sourceId, targetId, type, details = {}) {
        const stanceTargetToSource = this.getBilateralStance(targetId, sourceId);
        const stanceSourceToTarget = this.getBilateralStance(sourceId, targetId);
        if (!stanceTargetToSource) return;

        // Any incident creates mutual awareness
        stanceTargetToSource.informationConfidence = Math.max(stanceTargetToSource.informationConfidence, 0.50);
        if (stanceSourceToTarget) {
            stanceSourceToTarget.informationConfidence = Math.max(stanceSourceToTarget.informationConfidence, 0.50);
        }

        const incident = {
            tick: this.tickCount,
            type: String(type),
            sourceId,
            targetId,
            details: { ...details }
        };

        // Target's view of Source
        stanceTargetToSource.incidents.push(incident);
        if (stanceTargetToSource.incidents.length > this.config.maxIncidentsPerPair) {
            stanceTargetToSource.incidents.shift();
        }

        // NEXT-16: trade-dependency restraint (details.restraint in [0,1],
        // default 0). A victim that depends on the provocateur cools its
        // grudge without denying the facts: grievance increments scale down,
        // trust/fear/territorial pressure are untouched, and positive-event
        // forgiveness below never deepens. Zero restraint is bitwise-identical
        // to the old behavior.
        const restraint = Math.min(1, Math.max(0, Number(details.restraint) || 0));
        const grievanceScale = 1 - restraint;
        // Apply immediate impact on target's stance towards source
        switch (type) {
            case INCIDENT_TYPES.BORDER_TRESPASS:
                stanceTargetToSource.territorialPressure = clamp01(stanceTargetToSource.territorialPressure + 0.35);
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.20 * grievanceScale);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.10);
                stanceTargetToSource.casusBelli = 'Territorial sovereign encroachment';
                break;
            case INCIDENT_TYPES.PROVOCATION:
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.35 * grievanceScale);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.20);
                stanceTargetToSource.casusBelli = 'Direct diplomatic provocation';
                break;
            case INCIDENT_TYPES.RUMOR_HEARSAY:
                // NEXT-93: heard-about hostility, not observed hostility.
                // Small grievance only: no trust loss, no casus belli.
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.10 * grievanceScale);
                break;
            case INCIDENT_TYPES.RUMOR_EXONERATED:
                // NEXT-95: a refuted subject rumor retracts the hearsay it
                // caused. NEXT-97: decay-aware relief. details.relief carries
                // the undecayed residual (bias decayed since); default 0.10
                // preserves the symmetric case. Floored at zero by clamp01.
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance - (Number.isFinite(Number(details.relief)) ? Number(details.relief) : 0.10) * grievanceScale);
                break;
            case INCIDENT_TYPES.RAID_CONFIRMED:
                // NOW-14: a raid is inherently a territorial violation as
                // well as a grievance (matches BORDER_TRESPASS pressure).
                // NEXT-39: raids also burn the economic base (fields,
                // stockpiles, caravans). Without this fuel the ATTACK rung
                // (P >= 0.75) was unreachable at any raid rate: grievance +
                // territorial cap at 0.70 and no incident type produced
                // economicPressure (verified by rate sweep: daily raids
                // peaked at SKIRMISH). Chronic raiding must be able to
                // totalize; sparse raids still simmer via decay.
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.65 * grievanceScale);
                stanceTargetToSource.fear = clamp01(stanceTargetToSource.fear + 0.40);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.50);
                stanceTargetToSource.territorialPressure = clamp01(stanceTargetToSource.territorialPressure + 0.35);
                stanceTargetToSource.economicPressure = clamp01(stanceTargetToSource.economicPressure + 0.25);
                stanceTargetToSource.casusBelli = 'Lethal border raid on assets';
                break;
            case INCIDENT_TYPES.SKIRMISH_CASUALTY:
                // NEXT-48: mauling-vs-scuffle differentiation. Callers may
                // pass details.severity in [0,1] (default 1, NaN-safe):
                // a mauling inflicts full grievance/fear/trust-loss, a
                // scuffle only a fraction. Default is identical to the old
                // undifferentiated behavior.
                const rawSev = Number(details.severity);
                const sev = Number.isFinite(rawSev) ? clamp01(rawSev) : 1;
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.55 * sev * grievanceScale);
                stanceTargetToSource.fear = clamp01(stanceTargetToSource.fear + 0.30 * sev);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.40 * sev);
                stanceTargetToSource.casusBelli = 'Hostile skirmish engagement';
                break;
            case INCIDENT_TYPES.TRADE_ESTABLISHED:
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust + 0.30);
                stanceTargetToSource.economicPressure = clamp01(stanceTargetToSource.economicPressure - 0.20);
                if (stanceSourceToTarget) {
                    stanceSourceToTarget.trust = clamp01(stanceSourceToTarget.trust + 0.30);
                    stanceSourceToTarget.economicPressure = clamp01(stanceSourceToTarget.economicPressure - 0.20);
                }
                break;
            case INCIDENT_TYPES.TREATY_OFFERED:
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust + 0.25);
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance - 0.15);
                if (stanceSourceToTarget) {
                    stanceSourceToTarget.trust = clamp01(stanceSourceToTarget.trust + 0.15);
                }
                break;
            case INCIDENT_TYPES.TRIBUTE_PAID:
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance - 0.40);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust + 0.15);
                break;
            case INCIDENT_TYPES.TREATY_BROKEN:
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.75 * grievanceScale);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.70);
                stanceTargetToSource.casusBelli = 'Treacherous breach of signed treaty';
                break;
            case INCIDENT_TYPES.PEACE_OFFER:
                stanceTargetToSource.fear = clamp01(stanceTargetToSource.fear - 0.20);
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance - 0.20);
                break;
            case INCIDENT_TYPES.GOVERNANCE_STAND_DOWN: {
                // R29: war-weariness made visible. A council that cannot
                // commit to its own mobilization cools its grudge a rung
                // (mirrors the RUMOR_HEARSAY +0.10 rung). Facts kept:
                // trust, fear, pressures, and casus belli untouched, and
                // the retaliation ledger ignores non-hostile types.
                const rawRelief = Number(details.relief);
                const relief = Number.isFinite(rawRelief) ? clamp01(rawRelief) : 0.10;
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance - relief * grievanceScale);
                break;
            }
        }
        // R14b: feed hostile acts into the retaliation ledger (same
        // direction: actor provokes against victim). Non-hostile types
        // map to nothing and leave the ledger untouched.
        const provocationKind = PROVOCATION_BY_INCIDENT[type];
        if (provocationKind) this.retaliation.provoke(sourceId, targetId, provocationKind);
    }

    /**
     * Advance simulation time and decay slow-moving emotions
     * @param {number} [deltaTicks=1]
     */
    advanceTick(deltaTicks = 1) {
        this.tickCount += deltaTicks;
        const griefDecay = 1.0 - Math.pow(2, -deltaTicks / this.config.grievanceHalfLifeTicks);
        const fearDecay = 1.0 - Math.pow(2, -deltaTicks / this.config.fearHalfLifeTicks);

        // R14b: exhaustion accrues only during ATTACK-stage warfare.
        // SKIRMISH and below cost nothing: verified NEXT-39 behavior
        // requires chronic raiding to still totalize, so the brake must
        // culminate offensives, not forbid them. Peacetime recovers.
        let totalWar = false;
        for (const sourceMap of this.stances.values()) {
            for (const s of sourceMap.values()) {
                s.grievance = clamp01(s.grievance * (1.0 - griefDecay));
                s.fear = clamp01(s.fear * (1.0 - fearDecay));
                s.territorialPressure = clamp01(s.territorialPressure * (1.0 - fearDecay * 0.5));
                s.economicPressure = clamp01(s.economicPressure * (1.0 - fearDecay * 0.5));
                if (s.stage === ESCALATION_STAGES.ATTACK) totalWar = true;
            }
        }
        this.retaliation.advanceTick(deltaTicks, totalWar);
    }

    /**
     * Evaluate the bilateral stance of source faction towards target faction
     * @param {string} sourceId
     * @param {string} targetId
     * @param {object} [context={}]
     * @param {object} [relationshipSystem=null] - Optional RelationshipTensorSystem for agent-level aggregation
     * @returns {object} detailed evaluation report
     */
    evaluateStance(sourceId, targetId, context = {}, relationshipSystem = null) {
        const sourceFaction = this.factions.get(sourceId);
        const targetFaction = this.factions.get(targetId);
        if (!sourceFaction || !targetFaction) return null;

        const stance = this.getBilateralStance(sourceId, targetId);
        const prevStage = stance.stage;

        // Context overrides
        if (Number.isFinite(context.informationConfidence)) {
            stance.informationConfidence = clamp01(context.informationConfidence);
        }
        if (Number.isFinite(context.territorialPressure)) {
            stance.territorialPressure = clamp01(context.territorialPressure);
        }
        if (Number.isFinite(context.economicPressure)) {
            stance.economicPressure = clamp01(context.economicPressure);
        }
        if (Number.isFinite(context.trust)) {
            stance.trust = clamp01(context.trust);
        }
        if (Number.isFinite(context.grievance)) {
            stance.grievance = clamp01(context.grievance);
        }
        if (Number.isFinite(context.fear)) {
            stance.fear = clamp01(context.fear);
        }

        // Cultural modifier adjustments
        let cultureAggression = 0.0;
        let cultureTradeAffinity = 0.0;
        switch (sourceFaction.culture) {
            case FACTION_CULTURES.MILITARISTIC:
                cultureAggression = 0.15;
                break;
            case FACTION_CULTURES.EXPANSIONIST:
                cultureAggression = 0.20;
                break;
            case FACTION_CULTURES.MERCANTILE:
                cultureTradeAffinity = 0.25;
                cultureAggression = -0.10;
                break;
            case FACTION_CULTURES.ISOLATIONIST:
                cultureAggression = -0.05;
                break;
            case FACTION_CULTURES.HONORABLE:
                if (stance.trust > 0.5) cultureAggression = -0.15;
                break;
            case FACTION_CULTURES.DEVOUT:
                if (stance.grievance > 0.3) cultureAggression = 0.10;
                break;
        }

        // Composite hostility pressure
        // P = 0.40 * grievance + 0.30 * territorial + 0.20 * economic - 0.35 * trust + culture + leader
        // NEXT-143 (audit candidate 7): leader temperament conditions the
        // faction's pressure. Host derives leaderAggression in [-1,1] from
        // the leader's persona (e.g. CIA stand-vs-flee tendencies or
        // neuroticism); 0/absent reproduces legacy pressure exactly.
        const rawAgg = Number(context.leaderAggression);
        const leaderModifier = Number.isFinite(rawAgg)
            ? 0.15 * Math.max(-1, Math.min(1, rawAgg))
            : 0;
        const rawPressure = (
            0.40 * stance.grievance +
            0.30 * stance.territorialPressure +
            0.20 * stance.economicPressure -
            0.35 * stance.trust +
            cultureAggression +
            leaderModifier
        );
        // R14 (audit candidate): war-exhaustion brake. The host may supply
        // context.warExhaustion in [0,1]; R14b falls back to the internal
        // retaliation ledger (fed by recordIncident, aged by advanceTick)
        // when context is absent/non-finite — explicit host values win.
        // Pressure scales by (1 - 0.5*exhaustion): zero stays zero
        // (exhaustion invents no calm), total exhaustion halves pressure
        // (weariness, not pacifism). Fresh ledgers read exhaustion 0,
        // reproducing legacy pressure exactly (also not stored on stance).
        const rawExh = Number(context.warExhaustion);
        const warExhaustion = Number.isFinite(rawExh)
            ? Math.max(0, Math.min(1, rawExh))
            : this.retaliation.recommend(sourceId, targetId).exhaustion;
        const compositePressure = clamp01(rawPressure * (1 - 0.5 * warExhaustion));
        stance.compositePressure = compositePressure;

        // Capability Gates
        const hasMilitaryForMobilize = sourceFaction.militaryReadiness >= this.config.minMilitaryForMobilize;
        const hasMilitaryForAttack = sourceFaction.militaryReadiness >= this.config.minMilitaryForAttack;
        const hasEconomicStockpile = sourceFaction.economicStockpile >= this.config.minResourceStockpile;
        const isMilitarilyCapable = hasMilitaryForAttack && hasEconomicStockpile;
        // Uncertainty Gate
        const isSufficientlyInformed = stance.informationConfidence >= this.config.minInfoConfidence;

        let nextStage = prevStage;
        let reason = 'Stable stance';
        let explanation = 'No threshold crossed.';
        let blockedByCapability = false;
        let blockedByUncertainty = false;

        // State Machine Decision Tree
        if (stance.informationConfidence < 0.10 && stance.incidents.length === 0 && compositePressure === 0.0) {
            // Completely unaware of each other
            nextStage = ESCALATION_STAGES.UNAWARE;
            reason = 'Zero awareness or contact';
            explanation = 'No perceptual sightings or intelligence reports on target faction.';
        } else if (!isSufficientlyInformed) {
            // Low confidence (< 0.30) forces OBSERVE or AVOID
            blockedByUncertainty = true;
            if (stance.fear > 0.4 || compositePressure > 0.4) {
                nextStage = ESCALATION_STAGES.AVOID;
                reason = 'Uncertainty gate: cautious avoidance under elevated threat';
            } else {
                nextStage = ESCALATION_STAGES.OBSERVE;
                reason = 'Uncertainty gate: remote reconnaissance without provocation';
            }
            explanation = `Information confidence (${stance.informationConfidence.toFixed(2)}) is below minimum threshold (${this.config.minInfoConfidence}). Escalation blocked.`;
        } else if (stance.fear > 0.70 && sourceFaction.militaryReadiness < 0.20) {
            // Involuntary Capitulation / Rout (Bypasses Hostility Hysteresis)
            if (sourceFaction.militaryReadiness < 0.15 || stance.fear > 0.85) {
                nextStage = ESCALATION_STAGES.SURRENDER;
                reason = 'Forces shattered under terror, suing for terms';
            } else {
                nextStage = ESCALATION_STAGES.RETREAT;
                reason = 'Overwhelmed by enemy superiority, tactical withdrawal';
            }
            explanation = `Critical fear (${stance.fear.toFixed(2)}) and depleted military readiness (${sourceFaction.militaryReadiness.toFixed(2)}) trigger capitulation/retreat.`;
        } else if (stance.trust >= 0.75 && stance.grievance <= 0.10) {
            // Mutual high trust: Alliance
            nextStage = ESCALATION_STAGES.ALLY;
            reason = 'Deep mutual trust and absence of grievance solidify alliance';
            explanation = `Trust (${stance.trust.toFixed(2)}) >= 0.75 and grievance (${stance.grievance.toFixed(2)}) <= 0.10.`;
        } else if (stance.trust >= 0.40 && stance.grievance <= 0.25 && (cultureTradeAffinity > 0 || stance.economicPressure < 0.4)) {
            // Commercial exchange
            nextStage = ESCALATION_STAGES.TRADE;
            reason = 'Peaceful economic incentives and viable trust establish open trade';
            explanation = `Constructive trade relations established.`;
        } else if (stance.trust >= 0.25 && stance.grievance <= 0.35 && compositePressure < 0.40) {
            // Diplomatic dialogue
            nextStage = ESCALATION_STAGES.NEGOTIATE;
            reason = 'Moderate tensions addressable via diplomatic dialogue';
            explanation = `Negotiation channel open.`;
        } else if (compositePressure >= 0.75) {
            // Severe pressure: War / Attack
            if (isMilitarilyCapable) {
                nextStage = ESCALATION_STAGES.ATTACK;
                reason = 'Overwhelming hostility and adequate military capability initiate offensive war';
                explanation = `Composite pressure (${compositePressure.toFixed(2)}) breaches attack threshold. Casus belli: ${stance.casusBelli || 'Cumulative existential threats'}.`;
            } else {
                blockedByCapability = true;
                nextStage = ESCALATION_STAGES.RETREAT;
                reason = 'Capability gate: offensive war blocked by resource/military exhaustion';
                explanation = `Military readiness (${sourceFaction.militaryReadiness.toFixed(2)}) or economy (${sourceFaction.economicStockpile.toFixed(2)}) insufficient for ATTACK.`;
            }
        } else if (compositePressure >= 0.60) {
            // High pressure: Skirmish
            if (hasMilitaryForAttack && hasEconomicStockpile) {
                nextStage = ESCALATION_STAGES.SKIRMISH;
                reason = 'Border skirmishes and probing armed clashes';
                explanation = `Armed clashes on the frontier.`;
            } else {
                blockedByCapability = true;
                nextStage = ESCALATION_STAGES.SHADOW;
                reason = 'Capability gate: skirmish blocked, falling back to covert surveillance';
                explanation = `Insufficient readiness for open clash; tracking from shadows.`;
            }
        } else if (compositePressure >= 0.45) {
            // Elevated pressure: Mobilize
            if (hasMilitaryForMobilize) {
                nextStage = ESCALATION_STAGES.MOBILIZE;
                reason = 'Muster garrisons and stage offensive battle formations';
                explanation = `Readiness raised to war footing.`;
            } else {
                blockedByCapability = true;
                nextStage = ESCALATION_STAGES.WARN;
                reason = 'Capability gate: mobilization blocked, resorting to verbal/border warning';
                explanation = `Lacks reserves to muster; issuing formal ultimatum.`;
            }
        } else if (compositePressure >= 0.32) {
            nextStage = ESCALATION_STAGES.THREATEN;
            reason = 'Formal diplomatic ultimatum and coercive posturing';
            explanation = `Ultimatum delivered.`;
        } else if (compositePressure >= 0.22) {
            nextStage = ESCALATION_STAGES.WARN;
            reason = 'Border warnings and posturing against encroachment';
            explanation = `Border alert issued.`;
        } else if (compositePressure >= 0.12) {
            nextStage = ESCALATION_STAGES.SHADOW;
            reason = 'Covert reconnaissance of target movements';
            explanation = `Scouts deployed to monitor movements.`;
        } else if (compositePressure > 0.0) {
            nextStage = ESCALATION_STAGES.OBSERVE;
            reason = 'Passive observation of target faction';
            explanation = `Remote monitoring active.`;
        } else {
            nextStage = ESCALATION_STAGES.UNAWARE;
            reason = 'No active tension, awareness, or interaction';
            explanation = `Coexisting without friction.`;
        }

        // Apply Hysteresis: prevent rapid peaceful de-escalation oscillation
        // Capitulation states (SURRENDER, RETREAT) are involuntary and bypass hysteresis
        const isCapitulation = (nextStage === ESCALATION_STAGES.SURRENDER || nextStage === ESCALATION_STAGES.RETREAT);
        if (!isCapitulation && prevStage !== nextStage && this._isDeescalating(prevStage, nextStage)) {
            const hDelta = this.config.hysteresisDelta;
            if (compositePressure > (this._getStageMinThreshold(prevStage) - hDelta)) {
                // Hold previous stage due to hysteresis
                nextStage = prevStage;
                reason = `Hysteresis hold: pressure (${compositePressure.toFixed(2)}) has not fallen below de-escalation barrier`;
                explanation = `Hysteresis prevents premature de-escalation back from ${prevStage}.`;
            }
        }

        if (nextStage !== prevStage) {
            stance.previousStage = prevStage;
            stance.stage = nextStage;
            stance.lastTransitionTick = this.tickCount;
        }

        return {
            sourceId,
            targetId,
            fromStage: prevStage,
            toStage: nextStage,
            compositePressure,
            leaderModifier,
            stageChanged: prevStage !== nextStage,
            capability: {
                militaryReadiness: sourceFaction.militaryReadiness,
                economicStockpile: sourceFaction.economicStockpile,
                isMilitarilyCapable,
                blockedByCapability
            },
            uncertainty: {
                informationConfidence: stance.informationConfidence,
                blockedByUncertainty
            },
            reason,
            explanation,
            casusBelli: stance.casusBelli
        };
    }

    /**
     * Helper to determine if a transition is a downward de-escalation
     */
    _isDeescalating(fromStage, toStage) {
        const severityRank = {
            [ESCALATION_STAGES.UNAWARE]: 0,
            [ESCALATION_STAGES.OBSERVE]: 1,
            [ESCALATION_STAGES.AVOID]: 1,
            [ESCALATION_STAGES.NEGOTIATE]: 2,
            [ESCALATION_STAGES.TRADE]: 2,
            [ESCALATION_STAGES.ALLY]: 2,
            [ESCALATION_STAGES.SHADOW]: 3,
            [ESCALATION_STAGES.WARN]: 4,
            [ESCALATION_STAGES.THREATEN]: 5,
            [ESCALATION_STAGES.MOBILIZE]: 6,
            [ESCALATION_STAGES.SKIRMISH]: 7,
            [ESCALATION_STAGES.ATTACK]: 8,
            [ESCALATION_STAGES.RETREAT]: 5,
            [ESCALATION_STAGES.SURRENDER]: 0
        };
        return (severityRank[toStage] || 0) < (severityRank[fromStage] || 0);
    }

    /**
     * Helper for minimum pressure threshold to hold a stage
     */
    _getStageMinThreshold(stage) {
        switch (stage) {
            case ESCALATION_STAGES.ATTACK: return 0.75;
            case ESCALATION_STAGES.SKIRMISH: return 0.60;
            case ESCALATION_STAGES.MOBILIZE: return 0.45;
            case ESCALATION_STAGES.THREATEN: return 0.32;
            case ESCALATION_STAGES.WARN: return 0.22;
            case ESCALATION_STAGES.SHADOW: return 0.12;
            case ESCALATION_STAGES.OBSERVE: return 0.05;
            default: return 0.0;
        }
    }

    /**
     * Serialize full state for 100% snapshot replay determinism
     * @returns {object} snapshot
     */
    getState() {
        const serializedFactions = [];
        for (const f of this.factions.values()) {
            serializedFactions.push({
                ...f,
                territories: [...f.territories],
                metadata: { ...f.metadata }
            });
        }

        const serializedStances = [];
        for (const [sId, targetMap] of this.stances.entries()) {
            for (const [tId, st] of targetMap.entries()) {
                serializedStances.push({
                    ...st,
                    incidents: st.incidents.map(inc => ({ ...inc, details: { ...inc.details } }))
                });
            }
        }
        // R14b: retaliation ledger accounts are plain data; snapshots
        // carry them so restore keeps the exhaustion brake continuous.
        const serializedRetaliation = [];
        if (this.retaliation) {
            for (const [key, acc] of this.retaliation.accounts.entries()) {
                serializedRetaliation.push({ key, grievance: acc.grievance, exhaustion: acc.exhaustion, tick: acc.tick, provocations: acc.provocations });
            }
        }

        return {
            tickCount: this.tickCount,
            factions: serializedFactions,
            stances: serializedStances,
            retaliationTick: this.retaliation ? this.retaliation.tick : 0,
            retaliationAccounts: serializedRetaliation
        };
    }

    /**
     * Restore full state from snapshot
     * @param {object} snapshot
     */
    setState(snapshot) {
        if (!snapshot) return;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.factions.clear();
        this.stances.clear();

        if (Array.isArray(snapshot.factions)) {
            for (const f of snapshot.factions) {
                if (!f || !f.id) continue;
                this.factions.set(f.id, {
                    ...f,
                    territories: Array.isArray(f.territories) ? [...f.territories] : [],
                    metadata: f.metadata ? { ...f.metadata } : {}
                });
            }
        }

        if (Array.isArray(snapshot.stances)) {
            for (const st of snapshot.stances) {
                if (!st || !st.sourceId || !st.targetId) continue;
                let sourceMap = this.stances.get(st.sourceId);
                if (!sourceMap) {
                    sourceMap = new Map();
                    this.stances.set(st.sourceId, sourceMap);
                }
                sourceMap.set(st.targetId, {
                    ...st,
                    incidents: Array.isArray(st.incidents) ? st.incidents.map(i => ({ ...i, details: { ...i.details } })) : []
                });
            }
        }

        // R14b: restore the exhaustion ledger; pre-R14b snapshots carry
        // no retaliation fields and keep a fresh ledger (garbage-safe).
        if (this.retaliation) {
            this.retaliation.accounts.clear();
            this.retaliation.tick = Number(snapshot.retaliationTick) || 0;
            if (Array.isArray(snapshot.retaliationAccounts)) {
                for (const saved of snapshot.retaliationAccounts) {
                    if (!saved || typeof saved.key !== 'string') continue;
                    this.retaliation.accounts.set(saved.key, {
                        grievance: Number.isFinite(Number(saved.grievance)) ? Number(saved.grievance) : 0,
                        exhaustion: Number.isFinite(Number(saved.exhaustion)) ? Number(saved.exhaustion) : 0,
                        tick: Number.isFinite(Number(saved.tick)) ? Number(saved.tick) : 0,
                        provocations: Number.isFinite(Number(saved.provocations)) ? Number(saved.provocations) : 0
                    });
                }
            }
        }
    }
}

export default FactionSystem;
