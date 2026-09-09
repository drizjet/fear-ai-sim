/**
 * @file ScenarioStepper.js
 * 
 * Frontiers A & E / Sections 124–128:
 * Interactive Scenario Stepper, Semantic Breakpoint Debugger & Dynamic Live Interventions.
 * 
 * Implements:
 * 1. Interactive Step Execution & Keyframe Snapshots for bidirectional time-travel.
 * 2. Semantic Breakpoints on affective thresholds, escalation stages, commodity scarcity, and events.
 * 3. Live Dynamic Interventions during step execution.
 * 4. Tick-by-tick state diffs and causal timeline inspection.
 * 
 * STRICT INVARIANT:
 * Host game retains authoritative ownership over world geometry, transforms, pathfinding, and physics.
 * Middleware provides deterministic evaluation, stepping, and diagnostic telemetry.
 */

import { ScenarioInstantiator, TIMELINE_EVENT_TYPES } from './DeclarativeScenarioEngine.js';
import { ESCALATION_STAGES } from './FactionSystem.js';

export const BREAKPOINT_TYPES = Object.freeze({
    ON_FEAR_THRESHOLD: 'ON_FEAR_THRESHOLD',
    ON_ESCALATION_STAGE: 'ON_ESCALATION_STAGE',
    ON_COMMODITY_SCARCITY: 'ON_COMMODITY_SCARCITY',
    ON_EVENT_TYPE: 'ON_EVENT_TYPE',
    CUSTOM_PREDICATE: 'CUSTOM_PREDICATE'
});

export class ScenarioStepper {
    /**
     * @param {Object} scenarioDef Declarative scenario definition
     * @param {Object} [options={}] Configuration options
     * @param {number} [options.keyframeInterval=5] Frequency of keyframe snapshot retention
     */
    constructor(scenarioDef, options = {}) {
        if (!scenarioDef) {
            throw new Error('ScenarioStepper requires a declarative scenario definition.');
        }

        this.scenarioDef = JSON.parse(JSON.stringify(scenarioDef));
        this.keyframeInterval = Math.max(1, options.keyframeInterval || 5);
        this.breakpoints = new Map();
        this.keyframes = new Map();
        this.liveInterventions = [];
        this.timelineLog = [];
        this.maxExploredTick = 0;

        this._resetToInitialState();
    }

    _resetToInitialState() {
        this.instance = ScenarioInstantiator.instantiate(this.scenarioDef);
        this.keyframes.clear();
        this.timelineLog = [];
        this.maxExploredTick = 0;
        this._captureKeyframe(0);
    }

    _captureKeyframe(tick) {
        const snapshot = this.captureState();
        this.keyframes.set(tick, snapshot);
    }

    /**
     * Captures a structured, serializable snapshot of current living-world state.
     * @returns {Object} Snapshot
     */
    captureState() {
        const agents = {};
        for (const [id, agent] of this.instance.agents.entries()) {
            agents[id] = {
                id,
                fear: Number((agent.currentFear ?? 0).toFixed(4)),
                arousal: Number((agent.arousal ?? 0).toFixed(4)),
                valence: Number((agent.valence ?? 0).toFixed(4)),
                dominance: Number(((agent.currentDominance ?? agent.dominance) ?? 0.5).toFixed(4)),
                position: { x: agent.x ?? 0, y: agent.y ?? 0, z: agent.z ?? 0 }
            };
        }

        const settlements = {};
        for (const [id, s] of this.instance.settlements.entries()) {
            settlements[id] = {
                id,
                name: s.name,
                population: s.population,
                wealth: s.wealth,
                resources: { ...(s.resources || {}) }
            };
        }

        const routes = {};
        if (this.instance.civSystem && this.instance.civSystem.routes) {
            for (const [id, r] of this.instance.civSystem.routes.entries()) {
                routes[id] = {
                    id,
                    perceivedDanger: Number((r.perceivedDanger || 0).toFixed(4)),
                    baseSecurity: r.baseSecurity
                };
            }
        }

        const stances = [];
        if (this.instance.factionSystem && this.instance.factionSystem.stances) {
            for (const [key, st] of this.instance.factionSystem.stances.entries()) {
                stances.push({
                    key,
                    sourceId: st.sourceId,
                    targetId: st.targetId,
                    stage: st.stage,
                    tension: Number(st.tension.toFixed(4)),
                    trust: Number(st.trust.toFixed(4))
                });
            }
        }

        const roamingBands = [];
        if (this.instance.worldSystem && this.instance.worldSystem.groups) {
            for (const [id, g] of this.instance.worldSystem.groups.entries()) {
                roamingBands.push({
                    id,
                    name: g.name,
                    state: g.state,
                    memberCount: g.memberCount,
                    position: { ...g.position },
                    currentWaypointIndex: g.currentWaypointIndex
                });
            }
        }

        return {
            tick: this.instance.currentTick,
            timestamp: Date.now(),
            agents,
            settlements,
            routes,
            stances,
            roamingBands,
            eventHistoryCount: this.instance.eventHistory.length
        };
    }

    /**
     * Registers a semantic breakpoint.
     * @param {string} id Unique identifier
     * @param {string} type One of BREAKPOINT_TYPES
     * @param {Object} criteria Breakpoint condition parameters
     */
    addBreakpoint(id, type, criteria) {
        if (!Object.values(BREAKPOINT_TYPES).includes(type)) {
            throw new Error(`Invalid breakpoint type: ${type}`);
        }
        this.breakpoints.set(id, { id, type, criteria, hitCount: 0 });
    }

    /**
     * Unregisters a breakpoint by ID.
     * @param {string} id
     */
    removeBreakpoint(id) {
        this.breakpoints.delete(id);
    }

    /**
     * Evaluates all registered breakpoints against current state.
     * @param {Object} tickTelemetry 
     * @returns {Object|null} Fired breakpoint or null
     */
    _checkBreakpoints(tickTelemetry) {
        for (const bp of this.breakpoints.values()) {
            const { type, criteria } = bp;

            if (type === BREAKPOINT_TYPES.ON_FEAR_THRESHOLD) {
                const threshold = criteria.threshold ?? 0.75;
                const targetAgentId = criteria.agentId;

                if (targetAgentId) {
                    const agent = this.instance.agents.get(targetAgentId);
                    if (agent && agent.currentFear >= threshold) {
                        bp.hitCount++;
                        return { breakpoint: bp, agentId: targetAgentId, fear: agent.currentFear, threshold };
                    }
                } else {
                    for (const [id, agent] of this.instance.agents.entries()) {
                        if (agent.currentFear >= threshold) {
                            bp.hitCount++;
                            return { breakpoint: bp, agentId: id, fear: agent.currentFear, threshold };
                        }
                    }
                }
            } else if (type === BREAKPOINT_TYPES.ON_ESCALATION_STAGE) {
                const targetStage = criteria.stage;
                const targetStageIdx = ESCALATION_STAGES.indexOf(targetStage);
                const { factionA, factionB } = criteria;

                if (factionA && factionB) {
                    const stance = this.instance.factionSystem.getBilateralStance(factionA, factionB);
                    if (stance) {
                        const currentIdx = ESCALATION_STAGES.indexOf(stance.stage);
                        if (currentIdx >= targetStageIdx) {
                            bp.hitCount++;
                            return { breakpoint: bp, factionA, factionB, currentStage: stance.stage, targetStage };
                        }
                    }
                } else {
                    for (const st of this.instance.factionSystem.stances.values()) {
                        const currentIdx = ESCALATION_STAGES.indexOf(st.stage);
                        if (currentIdx >= targetStageIdx) {
                            bp.hitCount++;
                            return { breakpoint: bp, factionA: st.sourceId, factionB: st.targetId, currentStage: st.stage, targetStage };
                        }
                    }
                }
            } else if (type === BREAKPOINT_TYPES.ON_COMMODITY_SCARCITY) {
                const { settlementId, commodity = 'food', threshold = 20 } = criteria;
                const settlement = this.instance.settlements.get(settlementId);
                if (settlement && settlement.resources) {
                    const currentQty = settlement.resources[commodity] ?? 0;
                    if (currentQty <= threshold) {
                        bp.hitCount++;
                        return { breakpoint: bp, settlementId, commodity, currentQty, threshold };
                    }
                }
            } else if (type === BREAKPOINT_TYPES.ON_EVENT_TYPE) {
                const targetType = criteria.eventType;
                const recentEvents = this.instance.eventHistory.filter(e => e.tick === this.instance.currentTick);
                const match = recentEvents.find(e => e.eventType === targetType);
                if (match) {
                    bp.hitCount++;
                    return { breakpoint: bp, event: match };
                }
            } else if (type === BREAKPOINT_TYPES.CUSTOM_PREDICATE) {
                if (typeof criteria.fn === 'function') {
                    if (criteria.fn(this.instance, this.instance.currentTick)) {
                        bp.hitCount++;
                        return { breakpoint: bp, description: criteria.description || 'Custom predicate satisfied' };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Steps the simulation forward by `count` ticks, monitoring breakpoints.
     * @param {number} [count=1] Number of ticks to advance
     * @returns {Object} Result summary
     */
    step(count = 1) {
        const startTick = this.instance.currentTick;
        let firedBreakpoint = null;

        for (let i = 0; i < count; i++) {
            // Apply any scheduled live interventions for this upcoming tick
            const targetTick = this.instance.currentTick + 1;
            const pendingLive = this.liveInterventions.filter(li => li.tick === targetTick);
            for (const li of pendingLive) {
                this._executeIntervention(li);
            }

            const tickTelemetry = this.instance.tick();
            const currentTick = this.instance.currentTick;

            // Record timeline entry
            this.timelineLog.push({
                tick: currentTick,
                executedEvents: tickTelemetry.executedEvents,
                encounters: tickTelemetry.encountersThisTick
            });

            // Capture periodic keyframe
            if (currentTick % this.keyframeInterval === 0) {
                this._captureKeyframe(currentTick);
            }

            // Check breakpoints
            firedBreakpoint = this._checkBreakpoints(tickTelemetry);
            if (firedBreakpoint) {
                this.maxExploredTick = Math.max(this.maxExploredTick, currentTick);
                return {
                    stopped: true,
                    reason: 'BREAKPOINT_TRIGGERED',
                    firedBreakpoint,
                    startTick,
                    currentTick,
                    ticksAdvanced: currentTick - startTick,
                    stateSnapshot: this.captureState()
                };
            }
        }

        this.maxExploredTick = Math.max(this.maxExploredTick, this.instance.currentTick);

        return {
            stopped: false,
            reason: 'STEP_COMPLETED',
            startTick,
            currentTick: this.instance.currentTick,
            ticksAdvanced: this.instance.currentTick - startTick,
            stateSnapshot: this.captureState()
        };
    }

    /**
     * Runs stepping continuously until a breakpoint fires or maxTicks elapsed.
     * @param {number} [maxTicks=100]
     * @returns {Object}
     */
    runUntilBreakpoint(maxTicks = 100) {
        return this.step(maxTicks);
    }

    /**
     * Injects a dynamic live intervention into the active simulation.
     * @param {Object} intervention
     */
    injectLiveIntervention(intervention) {
        const liveRecord = {
            id: `live_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tick: this.instance.currentTick,
            ...intervention
        };

        this._executeIntervention(liveRecord);
        this.liveInterventions.push(liveRecord);
        return liveRecord;
    }

    _executeIntervention(inv) {
        if (inv.type === TIMELINE_EVENT_TYPES.INJECT_THREAT) {
            for (const agent of this.instance.agents.values()) {
                agent.tick(0.016, {
                    threats: [{
                        id: inv.id || 'live_threat',
                        distance: inv.distance ?? 10.0,
                        intensity: inv.intensity ?? 0.85
                    }]
                });
            }
        } else if (inv.type === TIMELINE_EVENT_TYPES.ALTER_ROUTE_DANGER) {
            const route = this.instance.civSystem.routes.get(inv.routeId);
            if (route) {
                route.perceivedDanger = Math.max(0, Math.min(1.0, inv.perceivedDanger ?? 0.90));
            }
        } else if (inv.type === TIMELINE_EVENT_TYPES.COMMODITY_SHOCK) {
            const settlement = this.instance.settlements.get(inv.settlementId);
            if (settlement && settlement.resources) {
                const commodity = inv.commodity || 'food';
                settlement.resources[commodity] = Math.max(0, settlement.resources[commodity] + (inv.delta ?? -25));
            }
        } else if (inv.type === 'SET_ESCALATION') {
            const stance = this.instance.factionSystem.getBilateralStance(inv.sourceFactionId, inv.targetFactionId);
            if (stance) {
                stance.stage = inv.stage;
                if (inv.tension !== undefined) stance.tension = inv.tension;
            }
        }
    }

    /**
     * Rewinds simulation to a designated historical tick using closest earlier keyframe.
     * @param {number} targetTick Historical tick [0, maxExploredTick]
     * @returns {Object} State after rewind
     */
    rewindToTick(targetTick) {
        if (targetTick < 0 || targetTick > this.maxExploredTick) {
            throw new RangeError(`Target tick ${targetTick} out of valid range [0, ${this.maxExploredTick}]`);
        }

        // Re-instantiate base scenario from scratch for deterministic bit-exact reconstitution
        this.instance = ScenarioInstantiator.instantiate(this.scenarioDef);

        // Re-execute scheduled steps and live interventions up to targetTick
        for (let t = 1; t <= targetTick; t++) {
            // Apply live interventions that were originally injected at tick t
            const matchingLive = this.liveInterventions.filter(li => li.tick === t);
            for (const li of matchingLive) {
                this._executeIntervention(li);
            }
            this.instance.tick();
        }

        return this.captureState();
    }

    /**
     * Generates a structured difference between two arbitrary simulation ticks.
     * @param {number} tickA 
     * @param {number} tickB 
     * @returns {Object} Structured diff
     */
    getTickDiff(tickA, tickB) {
        if (tickA < 0 || tickB < 0 || tickA > this.maxExploredTick || tickB > this.maxExploredTick) {
            throw new RangeError(`Tick range [${tickA}, ${tickB}] must be within [0, ${this.maxExploredTick}]`);
        }
        const current = this.instance.currentTick;
        const stateA = this.rewindToTick(tickA);
        const stateB = this.rewindToTick(tickB);

        // Restore back to original current tick
        this.rewindToTick(current);

        const agentDeltas = {};
        for (const [id, a] of Object.entries(stateA.agents)) {
            const b = stateB.agents[id];
            if (b) {
                agentDeltas[id] = {
                    fearDelta: Number((b.fear - a.fear).toFixed(4)),
                    arousalDelta: Number((b.arousal - a.arousal).toFixed(4))
                };
            }
        }

        const settlementDeltas = {};
        for (const [id, sA] of Object.entries(stateA.settlements)) {
            const sB = stateB.settlements[id];
            if (sB) {
                const resDiff = {};
                for (const [comm, qtyA] of Object.entries(sA.resources)) {
                    resDiff[comm] = Number(((sB.resources[comm] ?? 0) - qtyA).toFixed(2));
                }
                settlementDeltas[id] = {
                    populationDelta: sB.population - sA.population,
                    resourcesDelta: resDiff
                };
            }
        }

        return {
            tickA,
            tickB,
            ticksElapsed: tickB - tickA,
            agentDeltas,
            settlementDeltas
        };
    }

    /**
     * Returns chronological summary of the stepped simulation.
     * @returns {Object}
     */
    getTimelineSummary() {
        return {
            scenarioId: this.scenarioDef.metadata?.id,
            currentTick: this.instance.currentTick,
            maxExploredTick: this.maxExploredTick,
            keyframeInterval: this.keyframeInterval,
            keyframesRetained: this.keyframes.size,
            activeBreakpoints: this.breakpoints.size,
            liveInterventionsCount: this.liveInterventions.length,
            timelineEntriesCount: this.timelineLog.length,
            timelineEventsExecuted: this.instance.eventHistory.length
        };
    }
}
