/**
 * WorldSimulationSystem - World-scale simulation middleware, roaming/nomadic groups,
 * systemic emergent encounters, rumor/belief propagation, and world history ledger.
 *
 * Implements:
 * 1. Roaming & Nomadic Groups Engine (Patrols, Caravans, Refugees, Bandits, Tribes, Mercenaries)
 * 2. Motivational Driver Vectors (Hunger, Fatigue, Wealth, Threat Pressure, Loyalty)
 * 3. Camp Lifecycle Management (Establishment upon fatigue/threat, abandonment upon recovery/danger)
 * 4. Systemic Emergent Encounters (Fallout-style contextual intersection, proximity, and stance checks)
 * 5. Information, Rumor & Belief Propagation (Truth vs Observation vs Rumor with fidelity decay & trust gating)
 * 6. Misinformation Cascades & Diplomatic Alert Escalation
 * 7. Causally Linked World History Ledger (Wars, battles, ambushes, agreements, migrations)
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Middleware evaluates behavioral intents, recommended waypoints, advisory encounter resolutions,
 * and belief states. The host game engine maintains absolute authority over entity physical movement,
 * collision, transforms, combat damage execution, and inventory.
 */

import { DeterministicRng } from './DeterministicRng.js';

export const ROAMING_PARTY_TYPES = Object.freeze({
    PATROL: 'PATROL',
    CARAVAN: 'CARAVAN',
    REFUGEES: 'REFUGEES',
    BANDITS: 'BANDITS',
    NOMAD_TRIBE: 'NOMAD_TRIBE',
    MERCENARIES: 'MERCENARIES',
    WILDLIFE_PACK: 'WILDLIFE_PACK'
});

export const ROAMING_STATES = Object.freeze({
    TRAVELING: 'TRAVELING',
    FORAGING: 'FORAGING',
    CAMPED: 'CAMPED',
    RAIDING: 'RAIDING',
    FLEEING: 'FLEEING',
    ENGAGED: 'ENGAGED'
});

export const ENCOUNTER_TYPES = Object.freeze({
    AMBUSH_INTERCEPTION: 'AMBUSH_INTERCEPTION',
    BORDER_SKIRMISH: 'BORDER_SKIRMISH',
    REFUGEE_ENCOUNTER: 'REFUGEE_ENCOUNTER',
    PEACEFUL_CONVERGENCE: 'PEACEFUL_CONVERGENCE',
    WILDLIFE_AMBUSH: 'WILDLIFE_AMBUSH',
    DESERTER_APPREHENSION: 'DESERTER_APPREHENSION'
});

export const ENCOUNTER_RESOLUTIONS = Object.freeze({
    COMBAT_ENGAGEMENT: 'COMBAT_ENGAGEMENT',
    EXTORTION_PAID: 'EXTORTION_PAID',
    MUTUAL_AVOIDANCE: 'MUTUAL_AVOIDANCE',
    AID_PROVIDED: 'AID_PROVIDED',
    FLED_IN_TERROR: 'FLED_IN_TERROR',
    PEACEFUL_TRADE: 'PEACEFUL_TRADE'
});

export const RUMOR_TOPICS = Object.freeze({
    WAR_DECLARED: 'WAR_DECLARED',
    FAMINE_ALERT: 'FAMINE_ALERT',
    AMBUSH_HOTSPOT: 'AMBUSH_HOTSPOT',
    TRADE_EMBARGO: 'TRADE_EMBARGO',
    ALLIANCE_FORMED: 'ALLIANCE_FORMED',
    FACTION_BETRAYAL: 'FACTION_BETRAYAL'
});

export const WORLD_EVENT_TYPES = Object.freeze({
    ENCOUNTER_OCCURRED: 'ENCOUNTER_OCCURRED',
    BATTLE_FOUGHT: 'BATTLE_FOUGHT',
    CAMP_ESTABLISHED: 'CAMP_ESTABLISHED',
    CAMP_ABANDONED: 'CAMP_ABANDONED',
    MIGRATION_COMPLETED: 'MIGRATION_COMPLETED',
    RUMOR_SPREAD: 'RUMOR_SPREAD',
    RUMOR_CORRECTED: 'RUMOR_CORRECTED',
    AMBUSH_LOGGED: 'AMBUSH_LOGGED',
    TREATY_NOTED: 'TREATY_NOTED',
    TRADE_DELIVERY: 'TRADE_DELIVERY'
});

export const DEFAULT_WORLD_CONFIG = Object.freeze({
    encounterProximityRadius: 40.0, // Distance within which parties can encounter each other
    fatigueAccumulationRate: 0.005,  // Per tick travel fatigue
    fatigueRestRecoveryRate: 0.02,   // Per tick recovery while camped
    hungerAccumulationRate: 0.003,   // Per tick hunger growth
    hungerForageRate: 0.03,          // Per tick hunger reduction while foraging
    rumorFidelityDecayPerHop: 0.12,  // 12% fidelity loss per transmission hop
    rumorDistortionRate: 0.10,       // Max random distortion in perceived severity per hop
    maxHistoryEvents: 1000,          // Bounded ring buffer for world history
    maxRumors: 500,                  // Sibling-bound sweep: oldest-origin eviction + group-copy purge
    seed: 1337
});

function clamp01(v) {
    if (!Number.isFinite(v)) return 0.0;
    return Math.max(0.0, Math.min(1.0, v));
}

function euclideanDistance(a, b) {
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class WorldSimulationSystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_WORLD_CONFIG, ...config };
        this.rng = new DeterministicRng(this.config.seed);
        this.groups = new Map();         // Map<groupId, RoamingGroup>
        this.camps = new Map();          // Map<campId, CampSite>
        this.rumors = new Map();         // Map<rumorId, Rumor>
        this.historyLedger = [];         // Array<HistoryEvent>
        this.activeEncounters = [];      // Array<ActiveEncounter>
        this.tickCount = 0;
        this.nextEventId = 1;
        this.nextRumorId = 1;
    }

    /**
     * Register a roaming or nomadic party
     * @param {string} id
     * @param {object} options
     * @returns {object}
     */
    registerGroup(id, {
        name = null,
        type = ROAMING_PARTY_TYPES.PATROL,
        factionId = null,
        memberCount = 5,
        position = { x: 0, y: 0, z: 0 },
        waypoints = [],
        militaryStrength = 0.5,
        wealth = 0.5,
        leaderId = null,
        traits = {},
        tradeRun = null
    } = {}) {
        if (!id) return null;
        const group = {
            id: String(id),
            name: name ? String(name) : String(id),
            type: ROAMING_PARTY_TYPES[type] || ROAMING_PARTY_TYPES.PATROL,
            factionId: factionId ? String(factionId) : null,
            memberCount: Math.max(1, parseInt(memberCount, 10) || 5),
            position: {
                x: Number(position.x) || 0,
                y: Number(position.y) || 0,
                z: Number(position.z) || 0
            },
            waypoints: Array.isArray(waypoints) ? waypoints.map(w => ({
                x: Number(w.x) || 0,
                y: Number(w.y) || 0,
                z: Number(w.z) || 0,
                name: w.name ? String(w.name) : 'waypoint'
            })) : [],
            currentWaypointIndex: 0,
            militaryStrength: clamp01(militaryStrength),
            wealth: clamp01(wealth),
            leaderId: leaderId ? String(leaderId) : null,
            traits: {
                neuroticism: clamp01(traits.neuroticism ?? 0.5),
                aggression: clamp01(traits.aggression ?? 0.5),
                resilience: clamp01(traits.resilience ?? 0.5),
                ...traits
            },
            state: ROAMING_STATES.TRAVELING,
            drivers: {
                fatigue: 0.0,
                hunger: 0.0,
                threatPressure: 0.0,
                morale: 0.8
            },
            campId: null,
            // NEXT-33: standing autonomous trade run (valley fiction, not a
            // host report): { fromSettlement, toSettlement, commodity, amount }
            tradeRun: tradeRun ? { ...tradeRun } : null,
            knownRumors: new Map(), // Map<rumorId, KnownRumorInstance>
            knownCorrections: new Set(), // NEXT-75: rumorIds whose host-truth correction this group has applied
            lastIntent: null
        };
        this.groups.set(group.id, group);
        return group;
    }

    /**
     * Get a registered group by ID
     * @param {string} id
     * @returns {object|null}
     */
    getGroup(id) {
        return this.groups.get(String(id)) || null;
    }

    /**
     * Record a ground-truth event or historical action into the ledger
     * @param {string} eventType
     * @param {object} details
     * @returns {object} History event
     */
    recordHistoryEvent(eventType, {
        primaryId = null,
        secondaryId = null,
        location = null,
        cause = null,
        consequences = {},
        causalEventId = null
    } = {}) {
        const event = {
            id: `evt_${this.nextEventId++}`,
            tick: this.tickCount,
            eventType: WORLD_EVENT_TYPES[eventType] || eventType,
            primaryId: primaryId ? String(primaryId) : null,
            secondaryId: secondaryId ? String(secondaryId) : null,
            location: location ? { x: Number(location.x) || 0, y: Number(location.y) || 0, z: Number(location.z) || 0 } : null,
            cause: cause ? String(cause) : 'SIMULATION_UPDATE',
            consequences: { ...consequences },
            causalEventId: causalEventId ? String(causalEventId) : null
        };

        this.historyLedger.push(event);
        if (this.historyLedger.length > this.config.maxHistoryEvents) {
            this.historyLedger.shift();
        }
        return event;
    }

    /**
     * Create a novel rumor originated by a truth event or spontaneous misinformation
     * @param {string} topic
     * @param {object} details
     * @returns {object} Created rumor
     */
    createRumor(topic, {
        truthEventId = null,
        originLocation = { x: 0, y: 0, z: 0 },
        sourceEntityId = null,
        severity = 0.5,
        description = ''
    } = {}) {
        const rumor = {
            id: `rumor_${this.nextRumorId++}`,
            topic: RUMOR_TOPICS[topic] || topic,
            truthEventId: truthEventId ? String(truthEventId) : null,
            originTick: this.tickCount,
            originLocation: {
                x: Number(originLocation.x) || 0,
                y: Number(originLocation.y) || 0,
                z: Number(originLocation.z) || 0
            },
            sourceEntityId: sourceEntityId ? String(sourceEntityId) : null,
            severity: clamp01(severity),
            description: String(description || topic),
            correction: null, // NEXT-75: { confirmed, tick, byGroupId } once host truth adjudicates
        };
        this.rumors.set(rumor.id, rumor);
        this._enforceRumorBound();

        // Seed into source entity's known rumors if specified
        if (sourceEntityId && this.groups.has(sourceEntityId)) {
            this.groups.get(sourceEntityId).knownRumors.set(rumor.id, {
                rumorId: rumor.id,
                fidelity: 1.0,
                perceivedSeverity: rumor.severity,
                credibility: 1.0,
                hops: 0,
                receivedTick: this.tickCount,
                passedBy: null
            });
        }
        return rumor;
    }
    /**
     * Sibling-bound sweep: evict oldest-origin rumors beyond maxRumors
     * and purge their per-group copies. Readers already skip missing
     * masters, so pruning is behavior-invisible below the cap.
     */
    _enforceRumorBound() {
        const cap = this.config.maxRumors ?? 500;
        while (this.rumors.size > cap) {
            let oldestId = null;
            let oldestTick = Infinity;
            for (const [id, r] of this.rumors) {
                if (r.originTick < oldestTick) { oldestTick = r.originTick; oldestId = id; }
            }
            if (oldestId === null) break;
            this.rumors.delete(oldestId);
            for (const group of this.groups.values()) {
                group.knownRumors?.delete(oldestId);
            }
        }
    }

    /**
     * Spread rumors between two interacting groups (e.g. during an encounter or camp meeting)
     * @param {string} senderGroupId
     * @param {string} receiverGroupId
     * @param {number} [trust=0.5] Directed trust R(receiver -> sender)
     * @returns {Array<object>} Rumors transmitted
     */
    transmitRumors(senderGroupId, receiverGroupId, trust = 0.5) {
        const sender = this.groups.get(String(senderGroupId));
        const receiver = this.groups.get(String(receiverGroupId));
        if (!sender || !receiver) return [];

        const transmitted = [];
        const normalizedTrust = clamp01(trust);

        for (const [rId, instance] of sender.knownRumors.entries()) {
            const masterRumor = this.rumors.get(rId);
            if (!masterRumor) continue;

            const nextHops = instance.hops + 1;
            const decayedFidelity = Math.max(0.05, instance.fidelity * (1.0 - this.config.rumorFidelityDecayPerHop));

            // Distortion logic: Random jitter modulated by noise
            const distortionJitter = (this.rng.random() - 0.5) * 2.0 * this.config.rumorDistortionRate;
            const distortedSeverity = clamp01(instance.perceivedSeverity + distortionJitter);

            // Credibility modulated by receiver's trust in sender and receiver's neuroticism
            // High neuroticism increases credulity toward alarming / threatening rumors
            const neuroticismBoost = receiver.traits.neuroticism * (distortedSeverity > 0.6 ? 0.25 : 0.0);
            const calculatedCredibility = clamp01((0.35 + 0.65 * normalizedTrust) * decayedFidelity + neuroticismBoost);

            // Check if receiver already knows rumor
            const existing = receiver.knownRumors.get(rId);
            if (!existing || calculatedCredibility > existing.credibility) {
                const newInstance = {
                    rumorId: rId,
                    fidelity: decayedFidelity,
                    perceivedSeverity: distortedSeverity,
                    credibility: calculatedCredibility,
                    hops: nextHops,
                    receivedTick: this.tickCount,
                    passedBy: sender.id
                };
                receiver.knownRumors.set(rId, newInstance);
                if (masterRumor.correction) this._applyCorrection(receiver, masterRumor);
                transmitted.push(newInstance);

                // Record historical event for significant rumor spread
                if (decayedFidelity > 0.4 && calculatedCredibility > 0.5) {
                    this.recordHistoryEvent(WORLD_EVENT_TYPES.RUMOR_SPREAD, {
                        primaryId: sender.id,
                        secondaryId: receiver.id,
                        location: receiver.position,
                        cause: `RUMOR_HEARD_${masterRumor.topic}`,
                        consequences: {
                            rumorTopic: masterRumor.topic,
                            perceivedSeverity: distortedSeverity,
                            credibility: calculatedCredibility
                        }
                    });
                }
            }
        }
        return transmitted;
    }
    /**
     * NEXT-74: fear-from-information. A group that newly hears a severe
     * threat-topic rumor gains credibility-scaled advisory threat pressure.
     * Truth status (truthEventId) is metadata only - no correction path yet.
     * @param {object} receiver Receiving group
     * @param {Array<object>} transmitted Instances transmitRumors just delivered
     */
    _applyHeardThreatPressure(receiver, transmitted) {
        if (!receiver?.drivers || !Array.isArray(transmitted)) return;
        for (const inst of transmitted) {
            const master = this.rumors.get(inst.rumorId);
            if (!master) continue;
            if (master.correction && !master.correction.confirmed) continue;
            if (master.topic !== RUMOR_TOPICS.AMBUSH_HOTSPOT && master.topic !== RUMOR_TOPICS.WAR_DECLARED) continue;
            if (inst.perceivedSeverity < 0.5) continue;
            receiver.drivers.threatPressure = clamp01(receiver.drivers.threatPressure + 0.15 * (inst.credibility ?? 0.5));
        }
    }
    /**
     * NEXT-75: host-truth adjudication of a rumor (world truth vs belief).
     * The host owns truth; Fear AI only updates advisory belief. A refutation
     * deletes the instance and symmetrically relieves heard-threat pressure;
     * a confirmation pins credibility and fidelity to 1. Corrections spread
     * between groups on encounters via transmitCorrections.
     * @param {string} rumorId Master rumor id
     * @param {object} [opts] { confirmed:boolean, byGroupId:string|null }
     * @returns {object|null} Correction record or null when unknown
     */
    correctRumor(rumorId, { confirmed = false, byGroupId = null } = {}) {
        const master = this.rumors.get(String(rumorId));
        if (!master) return null;
        master.correction = {
            confirmed: Boolean(confirmed),
            tick: this.tickCount,
            byGroupId: byGroupId ? String(byGroupId) : null
        };
        if (byGroupId && this.groups.has(String(byGroupId))) {
            this._applyCorrection(this.groups.get(String(byGroupId)), master);
        }
        this.recordHistoryEvent(WORLD_EVENT_TYPES.RUMOR_CORRECTED, {
            primaryId: master.correction.byGroupId,
            secondaryId: master.id,
            location: { ...(this.groups.get(master.correction.byGroupId)?.position ?? { x: 0, y: 0, z: 0 }) },
            cause: master.correction.confirmed ? 'RUMOR_CONFIRMED' : 'RUMOR_REFUTED',
            consequences: { rumorTopic: master.topic, confirmed: master.correction.confirmed }
        });
        return master.correction;
    }
    /**
     * NEXT-75: apply a master correction to one group's belief.
     * @param {object} group Receiving group
     * @param {object} master Master rumor carrying .correction
     * @returns {string} 'refuted' | 'confirmed' | 'unheard' | 'no-correction'
     */
    _applyCorrection(group, master) {
        if (!group || !master?.correction) return 'no-correction';
        if (group.knownCorrections) group.knownCorrections.add(master.id);
        const inst = group.knownRumors?.get(master.id);
        if (!inst) return 'unheard';
        if (master.correction.confirmed) {
            inst.credibility = 1.0;
            inst.fidelity = 1.0;
            return 'confirmed';
        }
        group.knownRumors.delete(master.id);
        if ((master.topic === RUMOR_TOPICS.AMBUSH_HOTSPOT || master.topic === RUMOR_TOPICS.WAR_DECLARED)
            && inst.perceivedSeverity >= 0.5 && group.drivers) {
            group.drivers.threatPressure = clamp01(group.drivers.threatPressure - 0.15 * (inst.credibility ?? 0.5));
        }
        return 'refuted';
    }
    /**
     * NEXT-75: spread host-truth corrections the sender has applied to a
     * receiver that has not. Acceptance is unconditional (host truth is not
     * a trust vote); trust-gated acceptance is an open gap.
     * @param {string} senderGroupId Correcting group
     * @param {string} receiverGroupId Learning group
     * @returns {Array<object>} Applied { rumorId, result } records
     */
    transmitCorrections(senderGroupId, receiverGroupId) {
        const sender = this.groups.get(String(senderGroupId));
        const receiver = this.groups.get(String(receiverGroupId));
        if (!sender || !receiver) return [];
        const applied = [];
        for (const cid of sender.knownCorrections ?? []) {
            if (receiver.knownCorrections?.has(cid)) continue;
            const master = this.rumors.get(cid);
            if (!master?.correction) continue;
            applied.push({ rumorId: cid, result: this._applyCorrection(receiver, master) });
        }
        return applied;
    }

    /**
     * Evaluate bilateral systemic encounters between roaming parties within proximity
     * @param {object} [externalHooks={}] Optional factionSystem or relationshipTensorSystem
     * @returns {Array<object>} Triggered encounters
     */
    evaluateEncounters({ factionSystem = null, relationshipTensorSystem = null } = {}) {
        const groupList = Array.from(this.groups.values());
        const encounters = [];

        for (let i = 0; i < groupList.length; i++) {
            for (let j = i + 1; j < groupList.length; j++) {
                const gA = groupList[i];
                const gB = groupList[j];

                // Skip if already in engaged combat with someone else
                if (gA.state === ROAMING_STATES.ENGAGED || gB.state === ROAMING_STATES.ENGAGED) {
                    continue;
                }

                const dist = euclideanDistance(gA.position, gB.position);
                if (dist <= this.config.encounterProximityRadius) {
                    const encounter = this._generateSystemicEncounter(gA, gB, {
                        distance: dist,
                        factionSystem,
                        relationshipTensorSystem
                    });
                    if (encounter) {
                        encounters.push(encounter);
                    }
                }
            }
        }
        this.activeEncounters = encounters;
        return encounters;
    }

    /**
     * Internal systemic encounter generator adhering to Host Game Authority
     * @private
     */
    _generateSystemicEncounter(gA, gB, { distance, factionSystem, relationshipTensorSystem }) {
        // Determine bilateral faction stage if available
        let escalationStage = 'NEUTRAL';
        let bilateralTrust = 0.5;
        let bilateralGrievance = 0.0;

        if (factionSystem && gA.factionId && gB.factionId) {
            const stanceAB = factionSystem.getBilateralStance(gA.factionId, gB.factionId);
            const stanceBA = factionSystem.getBilateralStance(gB.factionId, gA.factionId);
            if (stanceAB && ['SKIRMISH', 'ATTACK', 'MOBILIZE', 'THREATEN'].includes(stanceAB.stage)) {
                escalationStage = stanceAB.stage;
            } else if (stanceBA && ['SKIRMISH', 'ATTACK', 'MOBILIZE', 'THREATEN'].includes(stanceBA.stage)) {
                escalationStage = stanceBA.stage;
            } else if (stanceAB) {
                escalationStage = stanceAB.stage;
            }
        }

        // NEXT-58: trust-NaN review. Non-finite store reads fall back to
        // the neutral defaults (identical effective behavior: clamp01 and
        // comparisons already treated NaN as no-trust), but the encounter
        // now knows the reading was indeterminate instead of claiming low
        // trust it never measured.
        let trustIndeterminate = false;
        if (relationshipTensorSystem && gA.leaderId && gB.leaderId) {
            const relAB = relationshipTensorSystem.getRelationship(gA.leaderId, gB.leaderId);
            if (relAB) {
                if (Number.isFinite(relAB.trust)) bilateralTrust = relAB.trust;
                else { bilateralTrust = 0.0; trustIndeterminate = true; }
                bilateralGrievance = Number.isFinite(relAB.grievance) ? relAB.grievance : 0.0;
            }
        }

        let encounterType = ENCOUNTER_TYPES.PEACEFUL_CONVERGENCE;
        let advisoryResolution = ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE;
        let urgency = 0.2;
        let diagnosticRationale = '';
        // NEXT-28: advisory suggested tribute (victim-wealth share), set on
        // the extortion path only; null everywhere else.
        let suggestedTribute = null;

        // Context 1: Predatory Bandits vs Caravan or Refugees
        if (gA.type === ROAMING_PARTY_TYPES.BANDITS || gB.type === ROAMING_PARTY_TYPES.BANDITS) {
            const bandit = gA.type === ROAMING_PARTY_TYPES.BANDITS ? gA : gB;
            const victim = gA.type === ROAMING_PARTY_TYPES.BANDITS ? gB : gA;

            encounterType = ENCOUNTER_TYPES.AMBUSH_INTERCEPTION;

            // NEXT-46: NaN-basis strictness. Non-finite strengths previously
            // fell through to the avoidance branch with a FALSE rationale
            // ("victim's superior escort defense"). Corrupt readings now
            // hold with an honest rationale; the resolution (safe-default
            // avoidance) is unchanged. All finite paths are untouched.
            const bStr = Number(bandit.militaryStrength);
            const vStr = Number(victim.militaryStrength);
            if (!Number.isFinite(bStr) || !Number.isFinite(vStr)) {
                advisoryResolution = ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE;
                urgency = 0.5;
                diagnosticRationale = `Bandits (${bandit.id}) hold: force-strength readings indeterminate, declining ambush as a safe default.`;
            } else {
            // Power ratio comparison
            const powerRatio = bStr / Math.max(0.05, vStr);
            // NEXT-57: non-finite wealth can never select extortion (the
            // tribute quantity would be fiction). It falls to combat exactly
            // as before; only the rationale now says the wealth reading was
            // skipped, instead of silently presenting a contested fight.
            const wealth = Number(victim.wealth);
            if (powerRatio > 1.4 && wealth > 0.3) {
                advisoryResolution = ENCOUNTER_RESOLUTIONS.EXTORTION_PAID;
                urgency = 0.85;
                // 35% victim-wealth share mirrors the RoamingBandSystem
                // doctrine for the same situation (pay to avoid slaughter);
                // advisory only — the host moves no goods.
                suggestedTribute = Math.round(wealth * 0.35 * 10000) / 10000;
                diagnosticRationale = `Bandits (${bandit.id}) intercept wealthy group (${victim.id}); demand tribute under power imbalance (${powerRatio.toFixed(2)}x).`;
            } else if (powerRatio > 0.9) {
                advisoryResolution = ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT;
                urgency = 0.95;
                diagnosticRationale = `Bandits (${bandit.id}) assault caravan (${victim.id}) in contested transit zone.`
                    + (!Number.isFinite(wealth) && powerRatio > 1.4 ? ' Victim wealth unreadable; tribute skipped as a safe default.' : '');
            } else {
                advisoryResolution = ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE;
                urgency = 0.5;
                diagnosticRationale = `Bandits (${bandit.id}) decline ambush due to victim's superior escort defense.`;
            }
            }
        }
        // Context 2: Rival Faction Mobilization or War
        else if (['SKIRMISH', 'ATTACK', 'MOBILIZE'].includes(escalationStage)) {
            encounterType = ENCOUNTER_TYPES.BORDER_SKIRMISH;
            advisoryResolution = ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT;
            urgency = 0.9;
            diagnosticRationale = `Hostile border encounter between ${gA.factionId} and ${gB.factionId} at escalation stage ${escalationStage}.`;
        }
        // Context 3: Refugees seeking aid from patrol or settlement
        else if (gA.type === ROAMING_PARTY_TYPES.REFUGEES || gB.type === ROAMING_PARTY_TYPES.REFUGEES) {
            encounterType = ENCOUNTER_TYPES.REFUGEE_ENCOUNTER;
            const hostGroup = gA.type !== ROAMING_PARTY_TYPES.REFUGEES ? gA : gB;
            const refugees = gA.type === ROAMING_PARTY_TYPES.REFUGEES ? gA : gB;

            if (bilateralTrust > 0.4 && hostGroup.wealth > 0.25) {
                advisoryResolution = ENCOUNTER_RESOLUTIONS.AID_PROVIDED;
                urgency = 0.4;
                diagnosticRationale = `Patrol/traders (${hostGroup.id}) provide food and safe passage to refugees (${refugees.id}).`;
            } else {
                advisoryResolution = ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE;
                urgency = 0.3;
                diagnosticRationale = `Refugees (${refugees.id}) turned away due to low trust or scarce rations.`
                    + (trustIndeterminate ? ' Trust readings indeterminate; no trust claimed.' : '');
            }
        }
        // Context 4: Wildlife Pack attack
        else if (gA.type === ROAMING_PARTY_TYPES.WILDLIFE_PACK || gB.type === ROAMING_PARTY_TYPES.WILDLIFE_PACK) {
            encounterType = ENCOUNTER_TYPES.WILDLIFE_AMBUSH;
            advisoryResolution = ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT;
            urgency = 0.8;
            diagnosticRationale = `Predator pack stalks vulnerable travelers.`;
        }
        // Context 5: Peaceful commercial convergence
        else {
            encounterType = ENCOUNTER_TYPES.PEACEFUL_CONVERGENCE;
            advisoryResolution = (gA.type === ROAMING_PARTY_TYPES.CARAVAN && gB.type === ROAMING_PARTY_TYPES.CARAVAN)
                ? ENCOUNTER_RESOLUTIONS.PEACEFUL_TRADE
                : ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE;
            urgency = 0.2;
            diagnosticRationale = `Peaceful crossing of travel corridors; shared situational intelligence.`;
        }

        // Exchange rumors upon convergence; hearing a severe threat rumor raises
        // advisory threat pressure (fear-from-information, credibility-scaled).
        // Matches the extortion-pressure precedent (+0.15 scale); combat (+0.35).
        const heardAB = this.transmitRumors(gA.id, gB.id, bilateralTrust);
        const heardBA = this.transmitRumors(gB.id, gA.id, bilateralTrust);
        this._applyHeardThreatPressure(gB, heardAB);
        this._applyHeardThreatPressure(gA, heardBA);
        this.transmitCorrections(gA.id, gB.id);
        this.transmitCorrections(gB.id, gA.id);

        // Record historical ledger entry
        const historyEvent = this.recordHistoryEvent(WORLD_EVENT_TYPES.ENCOUNTER_OCCURRED, {
            primaryId: gA.id,
            secondaryId: gB.id,
            location: { ...gA.position },
            cause: encounterType,
            consequences: {
                resolution: advisoryResolution,
                urgency,
                distance
            }
        });

        return {
            id: `enc_${this.nextEventId++}`,
            partyAId: gA.id,
            partyBId: gB.id,
            encounterType,
            advisoryResolution,
            urgency,
            distance,
            diagnosticRationale,
            suggestedTribute,
            historyEventId: historyEvent.id
        };
    }

    /**
     * Advance world simulation by one tick
     * Evaluates group drivers, camp transitions, waypoints, and rumors
     * @param {number} [deltaTime=1.0]
     * @param {object} [externalSystems={}]
     */
    tick(deltaTime = 1.0, { factionSystem = null, relationshipTensorSystem = null } = {}) {
        this.tickCount++;

        for (const group of this.groups.values()) {
            this._tickGroupDriversAndState(group, deltaTime);
        }

        // Evaluate proximity encounters
        this.evaluateEncounters({ factionSystem, relationshipTensorSystem });
    }

    /**
     * Internal group driver and motivational state updater
     * @private
     */
    _tickGroupDriversAndState(group, deltaTime) {
        const dt = Math.max(0.1, Number(deltaTime) || 1.0);

        // Update fatigue & hunger according to state
        if (group.state === ROAMING_STATES.TRAVELING || group.state === ROAMING_STATES.RAIDING) {
            group.drivers.fatigue = clamp01(group.drivers.fatigue + this.config.fatigueAccumulationRate * dt);
            group.drivers.hunger = clamp01(group.drivers.hunger + this.config.hungerAccumulationRate * dt);
        } else if (group.state === ROAMING_STATES.CAMPED) {
            group.drivers.fatigue = clamp01(group.drivers.fatigue - this.config.fatigueRestRecoveryRate * dt);
            group.drivers.hunger = clamp01(group.drivers.hunger + (this.config.hungerAccumulationRate * 0.5) * dt);
        } else if (group.state === ROAMING_STATES.FORAGING) {
            group.drivers.hunger = clamp01(group.drivers.hunger - this.config.hungerForageRate * dt);
            group.drivers.fatigue = clamp01(group.drivers.fatigue + (this.config.fatigueAccumulationRate * 0.3) * dt);
        }

        // State Transition 1: Exhaustion -> Establish Camp
        if (group.drivers.fatigue >= 0.80 && group.state !== ROAMING_STATES.CAMPED && group.state !== ROAMING_STATES.ENGAGED) {
            group.state = ROAMING_STATES.CAMPED;
            const campId = `camp_${group.id}_${this.tickCount}`;
            group.campId = campId;
            this.camps.set(campId, {
                id: campId,
                ownerGroupId: group.id,
                position: { ...group.position },
                establishedTick: this.tickCount,
                fortification: group.type === ROAMING_PARTY_TYPES.PATROL ? 0.4 : 0.1
            });
            this.recordHistoryEvent(WORLD_EVENT_TYPES.CAMP_ESTABLISHED, {
                primaryId: group.id,
                location: group.position,
                cause: 'FATIGUE_EXHAUSTION'
            });
            group.lastIntent = {
                intent: 'INTENT_ESTABLISH_CAMP',
                campId,
                targetCoordinates: { ...group.position },
                urgency: 0.85,
                confidence: 0.95,
                rationale: 'Party exhausted; establishing defensive bivouac to recover stamina.'
            };
            return;
        }

        // State Transition 2: Recovery -> Break Camp & Resume March
        if (group.state === ROAMING_STATES.CAMPED && group.drivers.fatigue <= 0.10) {
            group.state = ROAMING_STATES.TRAVELING;
            const abandonedCampId = group.campId;
            group.campId = null;
            if (abandonedCampId) {
                this.camps.delete(abandonedCampId);
            }
            this.recordHistoryEvent(WORLD_EVENT_TYPES.CAMP_ABANDONED, {
                primaryId: group.id,
                location: group.position,
                cause: 'STAMINA_RESTORED'
            });
            group.lastIntent = {
                intent: 'INTENT_BREAK_CAMP',
                campId: abandonedCampId,
                targetCoordinates: this._getCurrentTargetWaypoint(group),
                urgency: 0.5,
                confidence: 0.9,
                rationale: 'Party fully rested; breaking camp to resume route traversal.'
            };
            return;
        }

        // State Transition 3: Starvation -> Forage
        if (group.drivers.hunger >= 0.75 && group.state === ROAMING_STATES.TRAVELING) {
            group.state = ROAMING_STATES.FORAGING;
            group.lastIntent = {
                intent: 'INTENT_FORAGE',
                targetCoordinates: { ...group.position },
                urgency: 0.7,
                confidence: 0.8,
                rationale: 'Rations depleted; party halted to forage local wilderness resources.'
            };
            return;
        }

        // State Transition 4: Hunger sated -> Resume Travel
        if (group.state === ROAMING_STATES.FORAGING && group.drivers.hunger <= 0.15) {
            group.state = ROAMING_STATES.TRAVELING;
            group.lastIntent = {
                intent: 'INTENT_MARCH',
                targetCoordinates: this._getCurrentTargetWaypoint(group),
                urgency: 0.5,
                confidence: 0.85,
                rationale: 'Foraged sufficient sustenance; resuming journey.'
            };
            return;
        }

        // Normal Travel Waypoint intent
        if (group.state === ROAMING_STATES.TRAVELING) {
            const targetWp = this._getCurrentTargetWaypoint(group);
            group.lastIntent = {
                intent: 'INTENT_MARCH',
                targetCoordinates: targetWp,
                recommendedSpeed: 1.0 - (group.drivers.fatigue * 0.4),
                urgency: 0.4 + (group.drivers.threatPressure * 0.5),
                confidence: 0.9,
                rationale: `Advancing along patrol/travel route toward waypoint ${group.currentWaypointIndex}.`
            };
        }
    }

    /**
     * Retrieve the current target waypoint coordinates for a traveling group
     * @private
     */
    _getCurrentTargetWaypoint(group) {
        if (!group.waypoints || group.waypoints.length === 0) {
            return { ...group.position };
        }
        const wp = group.waypoints[group.currentWaypointIndex % group.waypoints.length];
        return { x: wp.x, y: wp.y, z: wp.z };
    }

    /**
     * Advance a group's waypoint index (called when host game signals waypoint reached)
     * @param {string} groupId
     * @returns {number} New waypoint index
     */
    advanceWaypoint(groupId) {
        const group = this.groups.get(String(groupId));
        if (!group || group.waypoints.length === 0) return 0;
        group.currentWaypointIndex = (group.currentWaypointIndex + 1) % group.waypoints.length;
        return group.currentWaypointIndex;
    }

    /**
     * Query world history ledger
     * @param {object} filter
     * @returns {Array<object>}
     */
    queryHistory({ primaryId = null, eventType = null, limit = 50, sinceTick = 0 } = {}) {
        let results = this.historyLedger.filter(e => e.tick >= sinceTick);
        if (primaryId) {
            results = results.filter(e => e.primaryId === String(primaryId) || e.secondaryId === String(primaryId));
        }
        if (eventType) {
            results = results.filter(e => e.eventType === eventType);
        }
        if (limit > 0 && results.length > limit) {
            results = results.slice(results.length - limit);
        }
        return results;
    }

    /**
     * Export pure deterministic state snapshot
     * @returns {object}
     */
    exportState() {
        return {
            tickCount: this.tickCount,
            nextEventId: this.nextEventId,
            nextRumorId: this.nextRumorId,
            rngState: this.rng.getState(),
            groups: Array.from(this.groups.entries()).map(([id, g]) => ({
                id,
                name: g.name,
                type: g.type,
                factionId: g.factionId,
                memberCount: g.memberCount,
                position: { ...g.position },
                waypoints: g.waypoints.map(w => ({ ...w })),
                currentWaypointIndex: g.currentWaypointIndex,
                militaryStrength: g.militaryStrength,
                wealth: g.wealth,
                leaderId: g.leaderId,
                traits: { ...g.traits },
                state: g.state,
                drivers: { ...g.drivers },
                campId: g.campId,
                tradeRun: g.tradeRun ? { ...g.tradeRun } : null,
                knownRumors: Array.from(g.knownRumors.entries()).map(([rId, inst]) => ({ ...inst })),
                knownCorrections: Array.from(g.knownCorrections ?? [])
            })),
            camps: Array.from(this.camps.entries()).map(([id, c]) => ({ ...c })),
            rumors: Array.from(this.rumors.entries()).map(([id, r]) => ({ ...r })),
            historyLedger: this.historyLedger.map(e => ({ ...e })),
            activeEncounters: this.activeEncounters.map(enc => ({ ...enc }))
        };
    }

    /**
     * Restore deterministic state snapshot
     * @param {object} snapshot
     */
    importState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        this.tickCount = snapshot.tickCount || 0;
        this.nextEventId = snapshot.nextEventId || 1;
        this.nextRumorId = snapshot.nextRumorId || 1;
        if (snapshot.rngState) {
            this.rng.setState(snapshot.rngState);
        }

        this.groups.clear();
        if (Array.isArray(snapshot.groups)) {
            for (const g of snapshot.groups) {
                const group = {
                    id: g.id,
                    name: g.name,
                    type: g.type,
                    factionId: g.factionId,
                    memberCount: g.memberCount,
                    position: { ...g.position },
                    waypoints: g.waypoints.map(w => ({ ...w })),
                    currentWaypointIndex: g.currentWaypointIndex,
                    militaryStrength: g.militaryStrength,
                    wealth: g.wealth,
                    leaderId: g.leaderId,
                    traits: { ...g.traits },
                    state: g.state,
                    drivers: { ...g.drivers },
                    campId: g.campId,
                    tradeRun: g.tradeRun ? { ...g.tradeRun } : null,
                    knownRumors: new Map(),
                    knownCorrections: new Set(Array.isArray(g.knownCorrections) ? g.knownCorrections : []),
                    lastIntent: null
                };
                if (Array.isArray(g.knownRumors)) {
                    for (const inst of g.knownRumors) {
                        group.knownRumors.set(inst.rumorId, { ...inst });
                    }
                }
                this.groups.set(group.id, group);
            }
        }

        this.camps.clear();
        if (Array.isArray(snapshot.camps)) {
            for (const c of snapshot.camps) {
                this.camps.set(c.id, { ...c });
            }
        }

        this.rumors.clear();
        if (Array.isArray(snapshot.rumors)) {
            for (const r of snapshot.rumors) {
                this.rumors.set(r.id, { ...r });
            }
        }
        this._enforceRumorBound();

        this.historyLedger = Array.isArray(snapshot.historyLedger)
            ? snapshot.historyLedger.map(e => ({ ...e }))
            : [];

        this.activeEncounters = Array.isArray(snapshot.activeEncounters)
            ? snapshot.activeEncounters.map(enc => ({ ...enc }))
            : [];
    }
}
