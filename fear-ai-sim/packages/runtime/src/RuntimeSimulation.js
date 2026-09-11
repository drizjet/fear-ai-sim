/**
 * RuntimeSimulation - Multi-agent simulation orchestrator for the Fear AI runtime.
 * Manages registered agents, spatial contagion, trauma memory, pacing, and determinism.
 */

import {
    DeterministicRng,
    AffectiveAgent,
    TraumaZoneSystem,
    TraumaCrystallizationEngine,
    TRAUMA_TYPES,
    ContagionGraph,
    PacingDirector,
    RelationshipTensorSystem,
    SocialEventEngine,
    SOCIAL_EVENTS
} from '../../core/index.js';
// NEXT-139: normalized crystallized-trauma load for contagion sourcing.
// Severity sums across crystallized traumas, halved into [0,1] so a
// single full-severity trauma reads 0.5 and two read as saturated.
function traumaLoadFor(coreTrauma, enabled, agentId) {
    if (!enabled || !coreTrauma) return 0;
    const rec = coreTrauma.agentRecords?.get(String(agentId));
    if (!rec || !Array.isArray(rec.crystallizedTraumas)) return 0;
    let sum = 0;
    for (const t of rec.crystallizedTraumas) {
        const s = Number(t?.severity);
        if (Number.isFinite(s)) sum += Math.max(0, Math.min(1, s));
    }
    return Math.max(0, Math.min(1, sum / 2));
}
 export class RuntimeSimulation {
    /**
     * @param {object} [options={}]
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 1337;
        this.rng = new DeterministicRng(this.seed);
        this.agents = new Map(); // agentId -> AffectiveAgent
        this.pendingObservations = new Map(); // agentId -> observation
        this.trauma = new TraumaZoneSystem(options.traumaConfig || {});
        // NOW-13: core per-agent trauma memory. NEXT-20 feeds crystallized
        // drift back into live agents behind enableTraumaFeedback.
        this.coreTrauma = new TraumaCrystallizationEngine(options.coreTraumaConfig || {});
        this.contagion = new ContagionGraph(options.contagionConfig || {});
        this.pacing = new PacingDirector(options.pacingConfig || {});
        this.enableTrauma = options.enableTrauma ?? true;
        this.enableCoreTrauma = options.enableCoreTrauma ?? true;
        // NEXT-20: crystallized trauma feeds back into live agent traits
        // and resting fear. Opt-out preserves the observe-only behavior.
        this.enableTraumaFeedback = options.enableTraumaFeedback ?? true;
        this.enableContagion = options.enableContagion ?? true;
        this.enablePacing = options.enablePacing ?? true;
        // Betrayal-path chunk: host-reported semantic social events land on
        // advisory relationship state. Opt-out preserves observe-only runs.
        this.social = new RelationshipTensorSystem(options.socialConfig || {});
        this.socialEvents = new SocialEventEngine();
        this.enableSocial = options.enableSocial ?? true;
        this.tickCount = 0;
    }

    /**
     * Register a new agent
     * @param {string} agentId
     * @param {object} [traits={}]
     * @param {object} [options={}]
     * @returns {AffectiveAgent}
     */
    registerAgent(agentId, traits = {}, options = {}) {
        const id = String(agentId);
        if (this.agents.has(id)) {
            // Update traits if already registered
            const existing = this.agents.get(id);
            if (traits && Object.keys(traits).length > 0) {
                existing.traits = { ...existing.traits, ...traits };
            }
            return existing;
        }

        const agent = new AffectiveAgent(id, traits, {
            ...options,
            rng: () => this.rng.random()
        });

        if (options.initial_position) {
            agent.x = options.initial_position.x ?? agent.x;
            agent.y = options.initial_position.y ?? agent.y;
            agent.z = options.initial_position.z ?? agent.z;
        }

        this.agents.set(id, agent);
        // Observe-only trauma record; skip when present so re-registration
        // with fresh traits never wipes an agent's trauma history.
        if (this.enableCoreTrauma && !this.coreTrauma.agentRecords.has(id)) {
            this.coreTrauma.registerAgent(id, traits);
        }
        return agent;
    }

    /**
     * Unregister agent
     * @param {string} agentId
     * @returns {boolean}
     */
    unregisterAgent(agentId) {
        const id = String(agentId);
        this.pendingObservations.delete(id);
        // NEXT-20: core trauma records are keyed by agent; drop them with
        // the agent so long worlds cannot accumulate the dead.
        this.coreTrauma.agentRecords.delete(id);
        if (this.enableSocial) this.social.purgeAgent(id);
        return this.agents.delete(id);
    }

    /**
     * Queue observation for an agent
     * @param {string} agentId
     * @param {object} observation
     */
    queueObservation(agentId, observation) {
        const id = String(agentId);
        if (this.agents.has(id)) {
            this.pendingObservations.set(id, observation);
        }
    }

    /**
     * Add environmental trauma zone (e.g. at player death or monster ambush location)
     * @param {number} x
     * @param {number} y
     * @param {number} [z=0]
     * @param {number} [intensity=1.0]
     * @param {number} [radius=150]
     * @param {number} [lifetimeTicks=1800]
     * @returns {number}
     */
    addTraumaZone(x, y, z = 0, intensity = 1.0, radius = 150, lifetimeTicks = 1800) {
        return this.trauma.addZone(x, y, z, intensity, radius, lifetimeTicks);
    }

    /**
     * Report a host-observed semantic social event (betrayal-path chunk).
     * The host owns world truth; Fear AI updates advisory relationship
     * state, and betrayal-path events additionally incur BETRAYAL_ABANDONMENT
     * trauma on the victim so the agreeableness-erosion loop runs end to
     * end (previously only NEAR_DEATH_SURVIVAL was ever incurred).
     * @param {object} [report={}]
     * @param {string} report.event SOCIAL_EVENTS value
     * @param {string} report.actorId who acted
     * @param {string} report.targetId who experienced it
     * @param {number} [report.weight=1.0] interaction weight in [0.1, 2.0]
     * @param {Array<string>} [report.witnesses=[]] observing third parties
     * @param {boolean} [report.exposed=false] deception-exposure flag
     * @param {number|null} [report.severity=null] trauma severity in [0, 1]; defaults to weight/2
     * @returns {object|null} engine result plus trauma id, or null when social is disabled
     */
    reportSocialEvent(report = {}) {
        if (!this.enableSocial) return null;
        const { event, actorId, targetId } = report;
        if (!SOCIAL_EVENTS.includes(event)) throw new Error(`UNKNOWN_SOCIAL_EVENT: ${event}`);
        const actor = String(actorId);
        const target = String(targetId);
        if (!this.agents.has(actor) || !this.agents.has(target)) throw new Error('UNKNOWN_SOCIAL_AGENT');
        const result = this.socialEvents.applyEvent(this.social, event, actor, target, {
            weight: report.weight,
            witnesses: report.witnesses,
            exposed: report.exposed === true
        });
        // Betrayal path: events whose direct pass carries a BETRAYAL or
        // ABANDONMENT interaction wound the victim's social trust store.
        const exposed = report.exposed === true;
        const isBetrayalPath = event === 'BETRAYAL' || event === 'ABANDONMENT'
            || event === 'LEADERSHIP_FAILURE' || (event === 'DECEPTION' && exposed);
        let traumaId = null;
        if (isBetrayalPath && this.enableCoreTrauma) {
            const w = typeof report.weight === 'number' && Number.isFinite(report.weight) ? report.weight : 1.0;
            const sev = typeof report.severity === 'number' && Number.isFinite(report.severity)
                ? Math.max(0.1, Math.min(1.0, report.severity))
                : Math.max(0.1, Math.min(1.0, w / 2));
            traumaId = this.coreTrauma.incurTrauma(target, {
                traumaType: TRAUMA_TYPES.BETRAYAL_ABANDONMENT,
                severity: sev,
                description: `Host-reported ${event} by ${actor}`
            }).id;
        }
        // Social repair: genuine aid, rescue, or shared danger directed at
        // the target counts as interpersonal solace toward betrayal-path
        // wounds (passive sanctuary calm explicitly does not; see engine).
        const isRepair = event === 'AID' || event === 'RESCUE' || event === 'SHARED_DANGER';
        if (isRepair && this.enableCoreTrauma) {
            this.coreTrauma.administerSolace(target, 0.30, `SOCIAL_REPAIR_${event}`);
        }
        return { ...result, traumaId };
    }

    /**
     * Execute one simulation tick across all registered agents
     * @param {number} [dt=0.0166] - Elapsed delta time in seconds
     * @returns {Array<object>} array of AgentStateOutput
     */
    tick(dt = 0.0166, { hooks = null } = {}) {
        this.tickCount++;
        this.contagion.clearEdges();

        // 1. Gather peer states for contagion calculation (if enabled)
        const peers = [];
        let totalFear = 0;
        let panickingCount = 0;

        if (this.enableContagion || this.enablePacing) {
            for (const agent of this.agents.values()) {
                const isPanicking = agent.fearCore.state === 'PANIC' || agent.currentFear > 0.8;
                const isScreaming = agent.lastResult?.audio_hints?.vocalization_hint === 'SCREAM';
                peers.push({
                    id: agent.id,
                    x: agent.x,
                    y: agent.y,
                    z: agent.z,
                    fearBand: agent.fearCore.state,
                    isPanicking,
                    isScreaming,
                    rawFear: agent.currentFear,
                    leadership: agent.traits.leadership,
                    // NEXT-139: crystallized-trauma load amplifies this
                    // peer as a contagion source (0 when core trauma off).
                    traumaLoad: traumaLoadFor(this.coreTrauma, this.enableCoreTrauma, agent.id)
                });
                totalFear += agent.currentFear;
                if (isPanicking) panickingCount++;
            }
        }

        const agentCount = this.agents.size;
        const avgFear = agentCount > 0 ? totalFear / agentCount : 0;

        // 2. Advance Pacing & DDA (if enabled)
        let pacingIntensity = 1.0;
        if (this.enablePacing) {
            this.pacing.tick(1, {
                averageFear: avgFear,
                panickingCount
            });
            pacingIntensity = this.pacing.getTargetIntensity();
        }

        // 3. Advance Trauma Decay (if enabled)
        if (this.enableTrauma) {
            this.trauma.tick(1);
        }

        // 4. Tick each agent with contagion, trauma, and pacing context
        const outputs = [];
        for (const agent of this.agents.values()) {
            const obs = this.pendingObservations.get(agent.id) || {};
            this.pendingObservations.delete(agent.id);

            // Contagion evaluation from surrounding peers
            const contagionResult = this.enableContagion
                ? this.contagion.evaluateContagion(agent, peers)
                : { contagionFear: 0.0, leaderCalm: 0.0 };

            // Spatial trauma evaluation at agent coordinates
            const traumaDread = this.enableTrauma
                ? this.trauma.getTraumaAt(agent.x, agent.y, agent.z)
                : 0.0;

            // NOW-17: crystallized panic-onset offset from last tick's
            // record (no extra evaluation cost; Map lookup only).
            const coreRec = this.enableCoreTrauma
                ? this.coreTrauma.agentRecords.get(agent.id)
                : undefined;
            const context = {
                contagionFear: contagionResult.contagionFear,
                leaderCalm: contagionResult.leaderCalm,
                traumaDread,
                pacingIntensity,
                panicFearBias: (this.enableTraumaFeedback && coreRec) ? coreRec.panicOnsetOffset : 0,
                rng: () => this.rng.random()
            };

            const output = agent.tick(dt, obs, context);
            outputs.push(output);
            // NOW-13: trauma recording. A fresh panic episode incurs one
            // acute trauma; the engine lifecycle runs below. Panic read from
            // post-tick agent state, same as the peer survey above.
            const agentPanicking = agent.fearCore.state === 'PANIC' || agent.currentFear > 0.8;
            if (this.enableCoreTrauma && agentPanicking) {
                // coreRec is the pre-tick record (incur auto-registers, so a
                // missing record here means the engine is disabled mid-run).
                const rec = coreRec ?? this.coreTrauma.agentRecords.get(agent.id);
                if (rec && rec.activeTraumas.length === 0) {
                    this.coreTrauma.incurTrauma(agent.id, {
                        traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                        severity: Math.max(0.1, Math.min(1.0, agent.currentFear)),
                        description: 'Runtime panic episode'
                    });
                }
            }
        }
        // NEXT-20: trauma-to-behavior feedback. The engine lifecycle runs
        // first; then crystallized trait drift syncs back onto live agents
        // (their own fear machinery responds: higher N, lower R), the
        // hyper-vigilance floor applies, and calm agents accrue solace that
        // can defuse traumas inside the sensitization window.
        let coreActive = 0;
        let coreCrystallized = 0;
        // NEXT-148: per-agent crystallized load distribution for telemetry.
        let coreLoadSum = 0;
        let coreLoadMax = 0;
        let coreLoadedAgents = 0;
        if (this.enableCoreTrauma) {
            this.coreTrauma.tick(1);
            for (const agent of this.agents.values()) {
                const rec = this.coreTrauma.agentRecords.get(agent.id);
                if (!rec) continue;
                coreActive += rec.activeTraumas.length;
                coreCrystallized += rec.crystallizedTraumas.length;
                let sev = 0;
                for (const t of rec.crystallizedTraumas) {
                    const s = Number(t?.severity);
                    if (Number.isFinite(s)) sev += Math.max(0, Math.min(1, s));
                }
                // Same normalization as contagion sourcing (NEXT-139).
                const load = Math.max(0, Math.min(1, sev / 2));
                coreLoadSum += load;
                if (load > coreLoadMax) coreLoadMax = load;
                if (rec.crystallizedTraumas.length > 0) coreLoadedAgents += 1;
                if (!this.enableTraumaFeedback) continue;
                const state = this.coreTrauma.evaluateAgentState(agent.id);
                if (!state.isTraumatized) continue;
                for (const k of ['neuroticism', 'resilience', 'agreeableness']) {
                    if (Number.isFinite(state.traits[k])) agent.traits[k] = state.traits[k];
                }
                // Quiescent floor skipped while RECOVERing: recovery
                // completion needs near-zero fear, and any floor would lock
                // RECOVER permanently (convalescence is not vigilance).
                if (state.effectiveRestingFear > 0 && agent.fearCore.state !== 'RECOVER') {
                    agent.currentFear = Math.max(agent.currentFear, state.effectiveRestingFear);
                }
                if (rec.activeTraumas.length > 0 && agent.currentFear < 0.2) {
                    this.coreTrauma.administerSolace(agent.id, 0.30, 'SANCTUARY');
                }
            }
        }
        // Relationship decay (grievance forgiveness, obligation expiry).
        // No-op while the tensor is empty, so observe-only runs are untouched.
        if (this.enableSocial) this.social.tick(1);

        // CVII sink: read-only post-tick metrics; fault-isolated.
        if (hooks && typeof hooks.emit === 'function') {
            try {
                hooks.emit('sim_tick', this.tickCount, { tick: this.tickCount });
                hooks.emit('sim_agents', this.agents.size, { tick: this.tickCount });
                hooks.emit('sim_mean_fear', avgFear, { tick: this.tickCount });
                hooks.emit('sim_panicking', panickingCount, { tick: this.tickCount });
                // NOW-8: trauma plus pacing telemetry on the same
                // fault-isolated block. Read-only; subsystems already ticked.
                // Numeric-only: ObservabilityHooks drops non-finite values,
                // so session phase travels as progress ratio, not name.
                hooks.emit('sim_trauma_zones', this.trauma.zones.length, { tick: this.tickCount });
                hooks.emit('sim_pacing_intensity', pacingIntensity, { tick: this.tickCount });
                hooks.emit('sim_pacing_progress', this.pacing.getProgress(), { tick: this.tickCount });
                // NOW-13: core per-agent trauma memory counts.
                hooks.emit('sim_core_traumas_active', coreActive, { tick: this.tickCount });
                hooks.emit('sim_core_traumas_crystallized', coreCrystallized, { tick: this.tickCount });
                // NEXT-148: crystallized load distribution (who carries
                // what, not just totals). Read-only post-tick gauges.
                hooks.emit('sim_core_trauma_max_load', coreLoadMax, { tick: this.tickCount });
                hooks.emit('sim_core_trauma_mean_load', this.agents.size > 0 ? coreLoadSum / this.agents.size : 0, { tick: this.tickCount });
                hooks.emit('sim_core_trauma_loaded_agents', coreLoadedAgents, { tick: this.tickCount });
            } catch {
                // A broken sink must never break the tick.
            }
        }

        return outputs;
    }

    /**
     * Batch tick with observations supplied in a single payload
     * @param {Array<object>} observations
     * @param {number} [dt=0.0166]
     * @returns {Array<object>}
     */
    batchTick(observations = [], dt = 0.0166, { hooks = null } = {}) {
        if (Array.isArray(observations)) {
            for (const obs of observations) {
                if (obs && obs.agent_id) {
                    this.queueObservation(obs.agent_id, obs);
                }
            }
        }
        return this.tick(dt, { hooks });
    }

    /**
     * Reset simulation to initial baseline
     */
    reset(options = {}) {
        this.rng = new DeterministicRng(this.seed);
        this.tickCount = 0;
        this.pendingObservations.clear();
        this.trauma.clear();
        this.contagion.clearEdges();
        this.pacing.reset();
        if (options.clearAgents) {
            this.agents.clear();
            return;
        }
        for (const agent of this.agents.values()) {
            agent.fearCore.reset('CALM');
            agent.currentFear = 0;
            agent.currentAnger = 0;
            agent.arousal = 0.1;
            agent.valence = 0.5;
            agent.morale = 1.0;
            agent.adrenaline = 0;
        }
    }

    /**
     * Save complete reproducible simulation snapshot
     * @returns {object}
     */
    saveSnapshot() {
        const agentsSnapshot = [];
        for (const agent of this.agents.values()) {
            agentsSnapshot.push(agent.getState());
        }

        return {
            version: 1,
            seed: this.seed,
            tickCount: this.tickCount,
            rng: this.rng.getState(),
            pacing: this.pacing.getState(),
            trauma: this.trauma.getState(),
            agents: agentsSnapshot,
            customMetadata: this.customMetadata ? { ...this.customMetadata } : {}
        };
    }

    /**
     * Restore simulation from snapshot with automatic migration and schema safety
     * @param {object} snapshot
     * @returns {{ success: boolean, version?: number, agentCount?: number, error?: string }}
     */
    loadSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            return { success: false, error: 'Snapshot must be a non-null object' };
        }

        // Schema versioning & migration
        const version = typeof snapshot.version === 'number' ? snapshot.version : 1;
        if (version > 1) {
            return {
                success: false,
                error: `UNSUPPORTED_SNAPSHOT_VERSION: Snapshot version ${version} is newer than current supported version 1`
            };
        }
        let migrated = snapshot;
        if (version < 1) {
            migrated = { ...snapshot, version: 1 };
        }

        this.seed = migrated.seed ?? this.seed;
        this.tickCount = migrated.tickCount ?? 0;
        if (migrated.rng) this.rng.setState(migrated.rng);
        if (migrated.pacing) this.pacing.setState(migrated.pacing);
        if (migrated.trauma) this.trauma.setState(migrated.trauma);
        if (migrated.customMetadata && typeof migrated.customMetadata === 'object') {
            this.customMetadata = { ...migrated.customMetadata };
        }

        this.agents.clear();
        this.pendingObservations.clear();

        if (Array.isArray(migrated.agents)) {
            for (const aData of migrated.agents) {
                if (!aData || typeof aData !== 'object' || !aData.id) continue;
                const agent = new AffectiveAgent(aData.id, aData.traits, {
                    name: aData.name,
                    rng: () => this.rng.random()
                });
                agent.setState(aData);
                this.agents.set(agent.id, agent);
            }
        }

        return { success: true, version, agentCount: this.agents.size };
    }

    getStatus() {
        return {
            tickCount: this.tickCount,
            agentCount: this.agents.size,
            pacing: this.pacing.getState(),
            traumaZones: this.trauma.zones.length,
            activeContagionEdges: this.contagion.activeEdges.length
        };
    }
}

export default RuntimeSimulation;
