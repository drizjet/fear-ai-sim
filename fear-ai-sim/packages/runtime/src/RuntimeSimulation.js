/**
 * RuntimeSimulation - Multi-agent simulation orchestrator for the Fear AI runtime.
 * Manages registered agents, spatial contagion, trauma memory, pacing, and determinism.
 */

import {
    DeterministicRng,
    AffectiveAgent,
    TraumaZoneSystem,
    ContagionGraph,
    PacingDirector
} from '../../core/index.js';

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
        this.contagion = new ContagionGraph(options.contagionConfig || {});
        this.pacing = new PacingDirector(options.pacingConfig || {});
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
     * Execute one simulation tick across all registered agents
     * @param {number} [dt=0.0166] - Elapsed delta time in seconds
     * @returns {Array<object>} array of AgentStateOutput
     */
    tick(dt = 0.0166) {
        this.tickCount++;
        this.contagion.clearEdges();

        // 1. Gather peer states for contagion calculation
        const peers = [];
        let totalFear = 0;
        let panickingCount = 0;

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
                leadership: agent.traits.leadership
            });
            totalFear += agent.currentFear;
            if (isPanicking) panickingCount++;
        }

        const agentCount = this.agents.size;
        const avgFear = agentCount > 0 ? totalFear / agentCount : 0;

        // 2. Advance Pacing & DDA
        this.pacing.tick(1, {
            averageFear: avgFear,
            panickingCount
        });
        const pacingIntensity = this.pacing.getTargetIntensity();

        // 3. Advance Trauma Decay
        this.trauma.tick(1);

        // 4. Tick each agent with contagion, trauma, and pacing context
        const outputs = [];
        for (const agent of this.agents.values()) {
            const obs = this.pendingObservations.get(agent.id) || {};
            this.pendingObservations.delete(agent.id);

            // Contagion evaluation from surrounding peers
            const contagionResult = this.contagion.evaluateContagion(agent, peers);

            // Spatial trauma evaluation at agent coordinates
            const traumaDread = this.trauma.getTraumaAt(agent.x, agent.y, agent.z);

            const context = {
                contagionFear: contagionResult.contagionFear,
                leaderCalm: contagionResult.leaderCalm,
                traumaDread,
                pacingIntensity,
                rng: () => this.rng.random()
            };

            const output = agent.tick(dt, obs, context);
            outputs.push(output);
        }

        return outputs;
    }

    /**
     * Batch tick with observations supplied in a single payload
     * @param {Array<object>} observations
     * @param {number} [dt=0.0166]
     * @returns {Array<object>}
     */
    batchTick(observations = [], dt = 0.0166) {
        if (Array.isArray(observations)) {
            for (const obs of observations) {
                if (obs && obs.agent_id) {
                    this.queueObservation(obs.agent_id, obs);
                }
            }
        }
        return this.tick(dt);
    }

    /**
     * Reset simulation to initial baseline
     */
    reset() {
        this.rng = new DeterministicRng(this.seed);
        this.tickCount = 0;
        this.pendingObservations.clear();
        this.trauma.clear();
        this.contagion.clearEdges();
        this.pacing.reset();
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
            seed: this.seed,
            tickCount: this.tickCount,
            rng: this.rng.getState(),
            pacing: this.pacing.getState(),
            trauma: this.trauma.getState(),
            agents: agentsSnapshot
        };
    }

    /**
     * Restore simulation from snapshot
     * @param {object} snapshot
     */
    loadSnapshot(snapshot) {
        if (!snapshot) return;
        this.seed = snapshot.seed ?? this.seed;
        this.tickCount = snapshot.tickCount ?? 0;
        if (snapshot.rng) this.rng.setState(snapshot.rng);
        if (snapshot.pacing) this.pacing.setState(snapshot.pacing);
        if (snapshot.trauma) this.trauma.setState(snapshot.trauma);

        this.agents.clear();
        this.pendingObservations.clear();

        if (Array.isArray(snapshot.agents)) {
            for (const aData of snapshot.agents) {
                const agent = new AffectiveAgent(aData.id, aData.traits, {
                    name: aData.name,
                    rng: () => this.rng.random()
                });
                agent.setState(aData);
                this.agents.set(agent.id, agent);
            }
        }
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
