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
    RAID_CONFIRMED: 'RAID_CONFIRMED',
    SKIRMISH_CASUALTY: 'SKIRMISH_CASUALTY',
    TRIBUTE_PAID: 'TRIBUTE_PAID',
    TREATY_BROKEN: 'TREATY_BROKEN',
    PEACE_OFFER: 'PEACE_OFFER'
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

function clamp01(v) {
    if (!Number.isFinite(v)) return 0.0;
    return Math.max(0.0, Math.min(1.0, v));
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
     * Apply a SuccessionEngine.resolve() outcome (NOW-4 wiring).
     * Cohesion/morale deltas land on the faction record, clamped; the
     * successor id is recorded as leaderId. Returns the updated record.
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

        // Apply immediate impact on target's stance towards source
        switch (type) {
            case INCIDENT_TYPES.BORDER_TRESPASS:
                stanceTargetToSource.territorialPressure = clamp01(stanceTargetToSource.territorialPressure + 0.35);
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.20);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.10);
                stanceTargetToSource.casusBelli = 'Territorial sovereign encroachment';
                break;
            case INCIDENT_TYPES.PROVOCATION:
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.35);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.20);
                stanceTargetToSource.casusBelli = 'Direct diplomatic provocation';
                break;
            case INCIDENT_TYPES.RAID_CONFIRMED:
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.65);
                stanceTargetToSource.fear = clamp01(stanceTargetToSource.fear + 0.40);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.50);
                stanceTargetToSource.casusBelli = 'Lethal border raid on assets';
                break;
            case INCIDENT_TYPES.SKIRMISH_CASUALTY:
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.55);
                stanceTargetToSource.fear = clamp01(stanceTargetToSource.fear + 0.30);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.40);
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
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance + 0.75);
                stanceTargetToSource.trust = clamp01(stanceTargetToSource.trust - 0.70);
                stanceTargetToSource.casusBelli = 'Treacherous breach of signed treaty';
                break;
            case INCIDENT_TYPES.PEACE_OFFER:
                stanceTargetToSource.fear = clamp01(stanceTargetToSource.fear - 0.20);
                stanceTargetToSource.grievance = clamp01(stanceTargetToSource.grievance - 0.20);
                break;
        }
    }

    /**
     * Advance simulation time and decay slow-moving emotions
     * @param {number} [deltaTicks=1]
     */
    advanceTick(deltaTicks = 1) {
        this.tickCount += deltaTicks;
        const griefDecay = 1.0 - Math.pow(2, -deltaTicks / this.config.grievanceHalfLifeTicks);
        const fearDecay = 1.0 - Math.pow(2, -deltaTicks / this.config.fearHalfLifeTicks);

        for (const sourceMap of this.stances.values()) {
            for (const s of sourceMap.values()) {
                s.grievance = clamp01(s.grievance * (1.0 - griefDecay));
                s.fear = clamp01(s.fear * (1.0 - fearDecay));
                s.territorialPressure = clamp01(s.territorialPressure * (1.0 - fearDecay * 0.5));
                s.economicPressure = clamp01(s.economicPressure * (1.0 - fearDecay * 0.5));
            }
        }
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
        // P = 0.40 * grievance + 0.30 * territorial + 0.20 * economic - 0.35 * trust + culture
        const rawPressure = (
            0.40 * stance.grievance +
            0.30 * stance.territorialPressure +
            0.20 * stance.economicPressure -
            0.35 * stance.trust +
            cultureAggression
        );
        const compositePressure = clamp01(rawPressure);
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

        return {
            tickCount: this.tickCount,
            factions: serializedFactions,
            stances: serializedStances
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
    }
}

export default FactionSystem;
