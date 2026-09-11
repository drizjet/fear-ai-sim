/**
 * packages/core/src/TraumaCrystallizationEngine.js
 *
 * Front B / Sections 12–14: Diachronic Persona Mutation & Trauma Crystallization Engine.
 *
 * Models long-horizon personality remodeling and phobic sensitization triggered by
 * catastrophic life-or-death existential crises (near-death survival, intimate ally betrayal,
 * massacres, and captivity).
 *
 * Capabilities:
 * 1. Diachronic Persona Remodeling:
 *    - Permanent/Semi-Permanent Neuroticism Drift: ΔN = η_N * Severity * (1 - N_0)
 *    - Resilience & Agreeableness Erosion: ΔR = -η_R * R_0, ΔA = -η_A * A_0 (betrayal paranoia)
 *    - Chronic Hyper-Vigilance Floor: F_quiescent ∈ [0.10, 0.35] (elevated baseline resting fear)
 *    - Recovery Retardation: Physiological recovery half-life τ_1/2 expanded by 1.5x - 4.0x
 *    - Panic Threshold Depression: Lowers panic trigger barrier (θ_panic drops by 0.10 - 0.30)
 * 2. Phobic Trigger Registry (PhobicTriggerRegistry):
 *    - Associates conditioned stimuli cues (damage types, predator archetypes, environmental cues,
 *      spatial hazard coordinates) with conditioned phobias.
 *    - Generates acute dread spikes and advisory avoidance vectors upon cue detection without active threats.
 * 3. 4-Stage Trauma Lifecycle:
 *    ACUTE_SHOCK -> SENSITIZATION_WINDOW -> CONSOLIDATION_LOCKING -> CRYSTALLIZED_MUTATION
 * 4. Solace Mitigation & Clinical Extinction Therapy:
 *    - Timely sanctuary debriefing or peer solace during SENSITIZATION_WINDOW defuses trauma locking.
 *    - Controlled calm desensitization over protracted horizons asymptotically restores trait baselines,
 *      preventing degenerate gameplay soft-locks.
 *
 * Architectural Invariant:
 * Strictly adheres to Host Game Authority Invariant and Core Freeze Invariant.
 * Operates as an affective evaluation and trait remodeling middleware without mutating
 * host game physics, combat damage, or entity transforms directly.
 */

export const TRAUMA_TYPES = Object.freeze({
    NEAR_DEATH_SURVIVAL: 'NEAR_DEATH_SURVIVAL',
    BETRAYAL_ABANDONMENT: 'BETRAYAL_ABANDONMENT',
    MASSACRE_HORROR: 'MASSACRE_HORROR',
    PROTRACTED_STARVATION: 'PROTRACTED_STARVATION',
    CATASTROPHIC_MUTILATION: 'CATASTROPHIC_MUTILATION'
});

export const TRAUMA_STAGES = Object.freeze({
    ACUTE_SHOCK: 'ACUTE_SHOCK',
    SENSITIZATION_WINDOW: 'SENSITIZATION_WINDOW',
    CONSOLIDATION_LOCKING: 'CONSOLIDATION_LOCKING',
    CRYSTALLIZED_MUTATION: 'CRYSTALLIZED_MUTATION',
    RESOLVED_WITHOUT_MUTATION: 'RESOLVED_WITHOUT_MUTATION',
    EXTINCTION_REHABILITATING: 'EXTINCTION_REHABILITATING'
});

export const PHOBIC_CATEGORIES = Object.freeze({
    DAMAGE_TYPE: 'DAMAGE_TYPE',
    PREDATOR_TYPE: 'PREDATOR_TYPE',
    ENVIRONMENT_CUE: 'ENVIRONMENT_CUE',
    SPATIAL_COORDINATE: 'SPATIAL_COORDINATE'
});

/**
 * Registry mapping conditioned stimulus cues to phobic avoidance profiles.
 */
export class PhobicTriggerRegistry {
    constructor() {
        /** @type {Map<string, Map<string, { category: string, cue: string, sensitivity: number, dreadGain: number, conditionedTick: number, extinctionTicks: number }>>} */
        this.agentPhobias = new Map();
    }

    /**
     * Register or reinforce a conditioned phobic trigger for an agent.
     * @param {string|number} agentId
     * @param {object} phobia
     * @param {string} phobia.category Value from PHOBIC_CATEGORIES
     * @param {string} phobia.cue Stimulus identifier (e.g. 'FIRE', 'WOLF', 'DARKNESS')
     * @param {number} [phobia.sensitivity=0.60] Sensitivity multiplier in [0, 1]
     * @param {number} [phobia.dreadGain=0.45] Acute fear addition upon cue detection
     * @param {number} [conditionedTick=0]
     */
    registerTrigger(agentId, phobia, conditionedTick = 0) {
        const id = String(agentId);
        if (!this.agentPhobias.has(id)) {
            this.agentPhobias.set(id, new Map());
        }
        const phobiaMap = this.agentPhobias.get(id);
        const key = `${phobia.category}:${phobia.cue}`;

        const existing = phobiaMap.get(key);
        if (existing) {
            existing.sensitivity = Math.min(1.0, existing.sensitivity + 0.15);
            existing.dreadGain = Math.min(1.0, existing.dreadGain + 0.10);
            existing.extinctionTicks = 0; // reset extinction upon re-exposure
        } else {
            phobiaMap.set(key, {
                category: phobia.category,
                cue: phobia.cue,
                sensitivity: Math.max(0.1, Math.min(1.0, phobia.sensitivity ?? 0.60)),
                dreadGain: Math.max(0.05, Math.min(1.0, phobia.dreadGain ?? 0.45)),
                conditionedTick,
                extinctionTicks: 0
            });
        }
    }

    /**
     * Evaluate observations for phobic cues and calculate acute dread reactions.
     * @param {string|number} agentId
     * @param {Array<{ category: string, cue: string, intensity?: number, position?: { x: number, y: number, z: number } }>} sensoryCues
     * @param {object} [agentPosition]
     * @returns {{ totalPhobicDread: number, triggeredCues: Array<object>, avoidanceVector: { x: number, y: number, z: number }|null, hasFlashback: boolean }}
     */
    evaluatePhobicReaction(agentId, sensoryCues = [], agentPosition = null) {
        const id = String(agentId);
        const phobiaMap = this.agentPhobias.get(id);
        if (!phobiaMap || phobiaMap.size === 0 || sensoryCues.length === 0) {
            return {
                totalPhobicDread: 0,
                triggeredCues: [],
                avoidanceVector: null,
                hasFlashback: false
            };
        }

        let totalDread = 0;
        const triggeredCues = [];
        let avoidX = 0, avoidY = 0, avoidZ = 0;
        let cueVectorCount = 0;
        let hasFlashback = false;

        for (const sensory of sensoryCues) {
            const key = `${sensory.category}:${sensory.cue}`;
            const phobia = phobiaMap.get(key);
            if (phobia) {
                const cueIntensity = sensory.intensity ?? 1.0;
                const acuteDread = phobia.sensitivity * phobia.dreadGain * cueIntensity;
                totalDread += acuteDread;

                if (acuteDread >= 0.50 || phobia.sensitivity >= 0.80) {
                    hasFlashback = true;
                }

                triggeredCues.push({
                    category: phobia.category,
                    cue: phobia.cue,
                    sensitivity: phobia.sensitivity,
                    dreadAdded: Number(acuteDread.toFixed(4))
                });

                // Calculate repulsive deflection vector away from sensory cue position
                if (agentPosition && sensory.position) {
                    const dx = agentPosition.x - sensory.position.x;
                    const dy = (agentPosition.y ?? 0) - (sensory.position.y ?? 0);
                    const dz = agentPosition.z - sensory.position.z;
                    const dist = Math.hypot(dx, dy, dz);
                    if (dist > 0.001) {
                        avoidX += dx / dist;
                        avoidY += dy / dist;
                        avoidZ += dz / dist;
                        cueVectorCount++;
                    }
                }
            }
        }

        let avoidanceVector = null;
        if (cueVectorCount > 0) {
            const mag = Math.hypot(avoidX, avoidY, avoidZ);
            if (mag > 0.001) {
                avoidanceVector = {
                    x: Number((avoidX / mag).toFixed(4)),
                    y: Number((avoidY / mag).toFixed(4)),
                    z: Number((avoidZ / mag).toFixed(4))
                };
            }
        }

        return {
            totalPhobicDread: Number(Math.min(1.0, totalDread).toFixed(4)),
            triggeredCues,
            avoidanceVector,
            hasFlashback
        };
    }

    /**
     * Apply Pavlovian extinction decay when phobic cues are experienced safely.
     * @param {string|number} agentId
     * @param {number} [decayRate=0.015]
     */
    applyExtinctionDecay(agentId, decayRate = 0.015) {
        const id = String(agentId);
        const phobiaMap = this.agentPhobias.get(id);
        if (!phobiaMap) return;

        for (const [key, phobia] of phobiaMap.entries()) {
            phobia.extinctionTicks++;
            phobia.sensitivity = Math.max(0.05, phobia.sensitivity * (1 - decayRate));
            phobia.dreadGain = Math.max(0.02, phobia.dreadGain * (1 - decayRate));

            if (phobia.sensitivity <= 0.06 && phobia.dreadGain <= 0.03) {
                phobiaMap.delete(key);
            }
        }
    }

    /**
     * Get all conditioned triggers for an agent.
     */
    getAgentTriggers(agentId) {
        const phobiaMap = this.agentPhobias.get(String(agentId));
        return phobiaMap ? Array.from(phobiaMap.values()) : [];
    }
}

/**
 * Diachronic Persona Mutation & Trauma Crystallization Engine.
 */
export class TraumaCrystallizationEngine {
    /**
     * @param {object} [options]
     * @param {number} [options.sensitizationWindowTicks=100] Duration of vulnerable consolidation window
     * @param {number} [options.solaceThreshold=0.65] Solace score required to defuse trauma before locking
     * @param {number} [options.extinctionRate=0.005] Asymptotic trait restoration rate during sanctuary
     */
    constructor(options = {}) {
        this.sensitizationWindowTicks = options.sensitizationWindowTicks || 100;
        this.solaceThreshold = options.solaceThreshold || 0.65;
        this.extinctionRate = options.extinctionRate || 0.005;

        this.phobicRegistry = new PhobicTriggerRegistry();

        /** @type {Map<string, {
         *   agentId: string,
         *   baselineTraits: object,
         *   currentTraits: object,
         *   quiescentFearFloor: number,
         *   recoveryHalfLifeMultiplier: number,
         *   panicOnsetOffset: number,
         *   activeTraumas: Array<object>,
         *   crystallizedTraumas: Array<object>,
         *   solaceAccumulator: number,
         *   calmSanctuaryTicks: number
         * }>} */
        this.agentRecords = new Map();

        this.currentTick = 0;
    }

    /**
     * Register or initialize an agent in the engine.
     * @param {string|number} agentId
     * @param {object} traits Initial Big-5 / affective traits
     */
    registerAgent(agentId, traits = {}) {
        const id = String(agentId);
        const base = {
            neuroticism: traits.neuroticism ?? 0.50,
            resilience: traits.resilience ?? 0.50,
            agreeableness: traits.agreeableness ?? 0.50,
            conscientiousness: traits.conscientiousness ?? 0.50,
            openness: traits.openness ?? 0.50,
            bravery: traits.bravery ?? 0.50,
            anger: traits.anger ?? 0.20,
            leadership: traits.leadership ?? 0.30
        };

        this.agentRecords.set(id, {
            agentId: id,
            baselineTraits: { ...base },
            currentTraits: { ...base },
            quiescentFearFloor: 0.0,
            recoveryHalfLifeMultiplier: 1.0,
            panicOnsetOffset: 0.0,
            activeTraumas: [],
            crystallizedTraumas: [],
            solaceAccumulator: 0.0,
            calmSanctuaryTicks: 0
        });
    }

    /**
     * Incur an acute existential trauma event.
     * @param {string|number} agentId
     * @param {object} incident
     * @param {string} incident.traumaType Value from TRAUMA_TYPES
     * @param {number} incident.severity Severity in [0, 1]
     * @param {Array<object>} [incident.associatedCues] Phobic cues conditioned by the incident
     * @param {string} [incident.description] Contextual description
     * @returns {object} Trauma record
     */
    incurTrauma(agentId, incident) {
        const id = String(agentId);
        if (!this.agentRecords.has(id)) {
            this.registerAgent(id);
        }
        const record = this.agentRecords.get(id);

        const trauma = {
            id: `trauma_${id}_${this.currentTick}_${record.activeTraumas.length + record.crystallizedTraumas.length + 1}`,
            type: incident.traumaType,
            severity: Math.max(0.10, Math.min(1.0, incident.severity ?? 0.80)),
            onsetTick: this.currentTick,
            stage: TRAUMA_STAGES.ACUTE_SHOCK,
            stageTick: 0,
            solaceReceived: 0.0,
            description: incident.description || 'Traumatic shock incident',
            associatedCues: incident.associatedCues || []
        };

        record.activeTraumas.push(trauma);
        record.calmSanctuaryTicks = 0; // reset calm ticks upon new trauma

        // Condition associated cues into phobic registry
        if (Array.isArray(incident.associatedCues)) {
            for (const cue of incident.associatedCues) {
                this.phobicRegistry.registerTrigger(id, {
                    category: cue.category || PHOBIC_CATEGORIES.DAMAGE_TYPE,
                    cue: cue.cue,
                    sensitivity: Math.min(1.0, trauma.severity * 1.1),
                    dreadGain: Math.min(1.0, trauma.severity * 0.70)
                }, this.currentTick);
            }
        }

        return trauma;
    }

    /**
     * Administer solace or safe sanctuary relief to an agent.
     * @param {string|number} agentId
     * @param {number} solaceAmount Quality/potency of solace in [0, 1]
     * @param {string} [source='SANCTUARY'] E.g. 'PEER_SOLACE', 'TEMPLE_SANCTUARY', 'CAMPFIRE'
     */
    administerSolace(agentId, solaceAmount = 0.30, source = 'SANCTUARY') {
        const id = String(agentId);
        const record = this.agentRecords.get(id);
        if (!record) return;

        record.solaceAccumulator += solaceAmount;

        // Betrayal-path rule: a social wound is not dissolved by mere calm.
        // BETRAYAL_ABANDONMENT traumas ignore passive sanctuary sources and
        // accrue solace only from interpersonal repair (e.g. SOCIAL_REPAIR_*).
        // Without this, the runtime's per-calm-tick sanctuary solace defuses
        // every betrayal within ~3 ticks and the agreeableness-erosion path
        // below can never fire.
        const isPassiveSanctuary = typeof source === 'string' && source.startsWith('SANCTUARY');
        for (const trauma of record.activeTraumas) {
            if (trauma.stage === TRAUMA_STAGES.SENSITIZATION_WINDOW || trauma.stage === TRAUMA_STAGES.ACUTE_SHOCK) {
                if (trauma.type === TRAUMA_TYPES.BETRAYAL_ABANDONMENT && isPassiveSanctuary) continue;
                trauma.solaceReceived += solaceAmount;
            }
        }
    }

    /**
     * Advance engine simulation tick for all registered agents.
     * Evaluates stage transitions, crystallization, trait mutation, and extinction decay.
     * @param {number} [deltaTicks=1]
     */
    tick(deltaTicks = 1) {
        const steps = Math.max(1, Math.floor(deltaTicks));
        for (let s = 0; s < steps; s++) {
            this._tickSingle(1);
        }
    }

    /**
     * @private
     */
    _tickSingle(deltaTicks = 1) {
        this.currentTick += deltaTicks;

        for (const [id, record] of this.agentRecords.entries()) {
            // 1. Process active traumas lifecycle
            const remainingActive = [];

            for (const trauma of record.activeTraumas) {
                trauma.stageTick += deltaTicks;

                // Stage transitions
                if (trauma.stage === TRAUMA_STAGES.ACUTE_SHOCK) {
                    if (trauma.stageTick >= 20) {
                        trauma.stage = TRAUMA_STAGES.SENSITIZATION_WINDOW;
                        trauma.stageTick = 0;
                    }
                    remainingActive.push(trauma);
                } else if (trauma.stage === TRAUMA_STAGES.SENSITIZATION_WINDOW) {
                    // Check if solace defused the trauma
                    if (trauma.solaceReceived >= this.solaceThreshold) {
                        trauma.stage = TRAUMA_STAGES.RESOLVED_WITHOUT_MUTATION;
                        // Successfully defused without permanent personality alteration
                    } else if (trauma.stageTick >= this.sensitizationWindowTicks) {
                        // Unresolved shock advances to consolidation locking
                        trauma.stage = TRAUMA_STAGES.CONSOLIDATION_LOCKING;
                        trauma.stageTick = 0;
                        remainingActive.push(trauma);
                    } else {
                        remainingActive.push(trauma);
                    }
                } else if (trauma.stage === TRAUMA_STAGES.CONSOLIDATION_LOCKING) {
                    if (trauma.stageTick >= 30) {
                        // Traumatic neuroplastic lock: crystallize into permanent mutation
                        trauma.stage = TRAUMA_STAGES.CRYSTALLIZED_MUTATION;
                        record.crystallizedTraumas.push(trauma);
                        this._applyPersonalityMutation(record, trauma);
                    } else {
                        remainingActive.push(trauma);
                    }
                }
            }

            record.activeTraumas = remainingActive;

            // 2. Extinction therapy under prolonged calm sanctuary
            if (record.activeTraumas.length === 0 && record.crystallizedTraumas.length > 0) {
                record.calmSanctuaryTicks += deltaTicks;
                if (record.calmSanctuaryTicks >= 100) {
                    this._applyExtinctionTherapy(record, deltaTicks);
                }
            }
        }
    }

    /**
     * Crystallize a trauma into structural trait mutations.
     * @private
     */
    _applyPersonalityMutation(record, trauma) {
        const sev = trauma.severity;
        const cur = record.currentTraits;

        // Permanent/Semi-Permanent Neuroticism Drift: ΔN = η_N * sev * (1 - N_0)
        const etaN = 0.40;
        const deltaN = etaN * sev * (1.0 - cur.neuroticism);
        cur.neuroticism = Math.min(0.98, cur.neuroticism + deltaN);

        // Resilience Erosion: ΔR = -η_R * sev * R_0
        const etaR = 0.35;
        const deltaR = etaR * sev * cur.resilience;
        cur.resilience = Math.max(0.08, cur.resilience - deltaR);

        // Agreeableness Erosion for betrayal/abandonment: ΔA = -η_A * sev * A_0
        if (trauma.type === TRAUMA_TYPES.BETRAYAL_ABANDONMENT || trauma.type === TRAUMA_TYPES.MASSACRE_HORROR) {
            const etaA = 0.45;
            const deltaA = etaA * sev * cur.agreeableness;
            cur.agreeableness = Math.max(0.10, cur.agreeableness - deltaA);
        }

        // Chronic Hyper-Vigilance Floor: F_quiescent ∈ [0.10, 0.35]
        // NEXT-23: the floor scales with baseline resilience — hardy agents
        // settle lower, fragile agents higher — pivoted so the reference
        // agent (R = 0.5) is unchanged. Sibling mutations above all scale
        // with identity; the floor was the only trait-blind term. Slope is
        // gentle by constraint: steeper damping breaks the pinned floor
        // inequalities for high-resilience engine fixtures. Baseline (not
        // post-erosion current) resilience keeps same-tick identity
        // semantics consistent with the sibling formulas.
        const baseR = Number.isFinite(record.baselineTraits.resilience)
            ? record.baselineTraits.resilience : 0.5;
        const floorShift = 0.25 * sev * (1 + (0.5 - baseR) / 4);
        record.quiescentFearFloor = Math.min(0.40, Math.max(record.quiescentFearFloor, floorShift));

        // Recovery Half-Life Multiplier (2x - 4x recovery elongation)
        record.recoveryHalfLifeMultiplier = Math.min(4.5, record.recoveryHalfLifeMultiplier + 1.2 * sev);

        // Panic Onset Offset: panic triggers earlier (e.g. -0.15 to -0.30)
        record.panicOnsetOffset = Math.min(0.35, record.panicOnsetOffset + 0.18 * sev);
    }

    /**
     * Progressively restore trait baselines during prolonged safe exposure therapy.
     * @private
     */
    _applyExtinctionTherapy(record, deltaTicks) {
        const rate = this.extinctionRate * deltaTicks;
        const cur = record.currentTraits;
        const base = record.baselineTraits;

        // Asymptotic drift back towards baseline
        cur.neuroticism += (base.neuroticism - cur.neuroticism) * rate;
        cur.resilience += (base.resilience - cur.resilience) * rate;
        cur.agreeableness += (base.agreeableness - cur.agreeableness) * rate;

        // Extinguish hyper-vigilance floor and half-life multiplier
        record.quiescentFearFloor = Math.max(0.0, record.quiescentFearFloor * (1 - rate));
        record.recoveryHalfLifeMultiplier = Math.max(1.0, 1.0 + (record.recoveryHalfLifeMultiplier - 1.0) * (1 - rate));
        record.panicOnsetOffset = Math.max(0.0, record.panicOnsetOffset * (1 - rate));

        // Progress phobic trigger extinction
        this.phobicRegistry.applyExtinctionDecay(record.agentId, rate * 2);
    }

    /**
     * Evaluate effective affective parameters for an agent incorporating crystallized trauma.
     * @param {string|number} agentId
     * @param {object} sensoryContext
     * @param {Array<object>} [sensoryContext.sensoryCues] Observable stimuli
     * @param {object} [sensoryContext.position] Agent coordinates
     * @returns {{
     *   traits: object,
     *   effectiveRestingFear: number,
     *   effectiveRecoveryMultiplier: number,
     *   effectivePanicThresholdOffset: number,
     *   phobicDread: number,
     *   triggeredPhobias: Array<object>,
     *   avoidanceVector: object|null,
     *   hasFlashback: boolean,
     *   isTraumatized: boolean
     * }}
     */
    evaluateAgentState(agentId, sensoryContext = {}) {
        const id = String(agentId);
        const record = this.agentRecords.get(id);
        if (!record) {
            return {
                traits: {},
                effectiveRestingFear: 0.0,
                effectiveRecoveryMultiplier: 1.0,
                effectivePanicThresholdOffset: 0.0,
                phobicDread: 0.0,
                triggeredPhobias: [],
                avoidanceVector: null,
                hasFlashback: false,
                isTraumatized: false
            };
        }

        const phobicReaction = this.phobicRegistry.evaluatePhobicReaction(
            id,
            sensoryContext.sensoryCues || [],
            sensoryContext.position
        );

        const isTraumatized = record.crystallizedTraumas.length > 0 || record.activeTraumas.length > 0;

        return {
            traits: { ...record.currentTraits },
            effectiveRestingFear: Number(record.quiescentFearFloor.toFixed(4)),
            effectiveRecoveryMultiplier: Number(record.recoveryHalfLifeMultiplier.toFixed(3)),
            effectivePanicThresholdOffset: Number(record.panicOnsetOffset.toFixed(4)),
            phobicDread: phobicReaction.totalPhobicDread,
            triggeredPhobias: phobicReaction.triggeredCues,
            avoidanceVector: phobicReaction.avoidanceVector,
            hasFlashback: phobicReaction.hasFlashback,
            isTraumatized
        };
    }

    /**
     * NEXT-119 (CCI-28 frontier 3): per-agent trauma snapshot for vault
     * seal/restore. Returns a JSON-safe clone { record, phobias } or null
     * when the agent has no trauma history worth preserving.
     */
    agentTraumaSnapshot(agentId) {
        const id = String(agentId);
        const rec = this.agentRecords.get(id);
        if (!rec) return null;
        if (rec.activeTraumas.length === 0 && rec.crystallizedTraumas.length === 0) return null;
        const phobiaMap = this.phobicRegistry.agentPhobias.get(id);
        const phobias = {};
        if (phobiaMap) {
            for (const [key, p] of phobiaMap.entries()) phobias[key] = { ...p };
        }
        return {
            record: JSON.parse(JSON.stringify({
                agentId: rec.agentId,
                baselineTraits: { ...rec.baselineTraits },
                currentTraits: { ...rec.currentTraits },
                quiescentFearFloor: rec.quiescentFearFloor,
                recoveryHalfLifeMultiplier: rec.recoveryHalfLifeMultiplier,
                panicOnsetOffset: rec.panicOnsetOffset,
                activeTraumas: rec.activeTraumas,
                crystallizedTraumas: rec.crystallizedTraumas,
                solaceAccumulator: rec.solaceAccumulator,
                calmSanctuaryTicks: rec.calmSanctuaryTicks
            })),
            phobias
        };
    }

    /**
     * Restore one agent's trauma snapshot (from agentTraumaSnapshot or a
     * vault `trauma` blob). Registers the agent when unknown.
     */
    restoreAgentTrauma(agentId, snap) {
        const id = String(agentId);
        if (!snap || !snap.record) return false;
        if (!this.agentRecords.has(id)) this.registerAgent(id, snap.record.baselineTraits || {});
        const rec = this.agentRecords.get(id);
        const src = snap.record;
        rec.baselineTraits = { ...src.baselineTraits };
        rec.currentTraits = { ...src.currentTraits };
        rec.quiescentFearFloor = src.quiescentFearFloor || 0;
        rec.recoveryHalfLifeMultiplier = src.recoveryHalfLifeMultiplier || 1.0;
        rec.panicOnsetOffset = src.panicOnsetOffset || 0;
        rec.activeTraumas = JSON.parse(JSON.stringify(src.activeTraumas || []));
        rec.crystallizedTraumas = JSON.parse(JSON.stringify(src.crystallizedTraumas || []));
        rec.solaceAccumulator = src.solaceAccumulator || 0;
        rec.calmSanctuaryTicks = src.calmSanctuaryTicks || 0;
        if (snap.phobias) {
            const phobiaMap = new Map();
            for (const [key, p] of Object.entries(snap.phobias)) phobiaMap.set(key, { ...p });
            this.phobicRegistry.agentPhobias.set(id, phobiaMap);
        }
        return true;
    }

    /**
     * Export complete state for serialization and replay determinism.
     */
    getState() {
        const serializedRecords = {};
        for (const [id, rec] of this.agentRecords.entries()) {
            serializedRecords[id] = {
                agentId: rec.agentId,
                baselineTraits: { ...rec.baselineTraits },
                currentTraits: { ...rec.currentTraits },
                quiescentFearFloor: rec.quiescentFearFloor,
                recoveryHalfLifeMultiplier: rec.recoveryHalfLifeMultiplier,
                panicOnsetOffset: rec.panicOnsetOffset,
                activeTraumas: JSON.parse(JSON.stringify(rec.activeTraumas)),
                crystallizedTraumas: JSON.parse(JSON.stringify(rec.crystallizedTraumas)),
                solaceAccumulator: rec.solaceAccumulator,
                calmSanctuaryTicks: rec.calmSanctuaryTicks
            };
        }
        // NEXT-117: conditioned phobic triggers round-trip too; without them
        // a restored engine forgets every cue association (dread reads zero).
        const serializedPhobias = {};
        for (const [id, phobiaMap] of this.phobicRegistry.agentPhobias.entries()) {
            serializedPhobias[id] = {};
            for (const [key, p] of phobiaMap.entries()) {
                serializedPhobias[id][key] = { ...p };
            }
        }

        return {
            currentTick: this.currentTick,
            sensitizationWindowTicks: this.sensitizationWindowTicks,
            solaceThreshold: this.solaceThreshold,
            extinctionRate: this.extinctionRate,
            agentRecords: serializedRecords,
            agentPhobias: serializedPhobias
        };
    }

    /**
     * Restore state from serialized snapshot.
     */
    setState(state) {
        if (!state) return;
        this.currentTick = state.currentTick || 0;
        this.sensitizationWindowTicks = state.sensitizationWindowTicks || 100;
        this.solaceThreshold = state.solaceThreshold || 0.65;
        this.extinctionRate = state.extinctionRate || 0.005;

        this.agentRecords = new Map();
        if (state.agentRecords) {
            for (const [id, rec] of Object.entries(state.agentRecords)) {
                this.agentRecords.set(id, {
                    agentId: rec.agentId,
                    baselineTraits: { ...rec.baselineTraits },
                    currentTraits: { ...rec.currentTraits },
                    quiescentFearFloor: rec.quiescentFearFloor,
                    recoveryHalfLifeMultiplier: rec.recoveryHalfLifeMultiplier,
                    panicOnsetOffset: rec.panicOnsetOffset,
                    activeTraumas: JSON.parse(JSON.stringify(rec.activeTraumas || [])),
                    crystallizedTraumas: JSON.parse(JSON.stringify(rec.crystallizedTraumas || [])),
                    solaceAccumulator: rec.solaceAccumulator || 0,
                    calmSanctuaryTicks: rec.calmSanctuaryTicks || 0
                });
            }
        }
        this.phobicRegistry.agentPhobias = new Map();
        if (state.agentPhobias) {
            for (const [id, keys] of Object.entries(state.agentPhobias)) {
                const phobiaMap = new Map();
                for (const [key, p] of Object.entries(keys || {})) {
                    phobiaMap.set(key, { ...p });
                }
                this.phobicRegistry.agentPhobias.set(id, phobiaMap);
            }
        }
    }
}
