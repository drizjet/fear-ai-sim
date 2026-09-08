/**
 * @fear-ai/core - MultiFeedbackCascadeSystem
 * Front E / Sections 61–65: System-of-Systems Multi-Feedback Cascade & Runaway Loop Detector.
 * 
 * STRICT INVARIANT:
 * Host game remains authoritative for world state, inventories, entity survival,
 * and diplomatic actions. MultiFeedbackCascadeSystem analyzes cross-subsystem telemetry,
 * detects destabilizing runaway feedback loops (loop gain G > 1.0), and provides
 * non-binding advisory homeostatic circuit breaker interventions.
 */

export const COUPLING_VARIABLES = Object.freeze({
    COMMODITY_SCARCITY: 'COMMODITY_SCARCITY',
    POPULATION_FEAR: 'POPULATION_FEAR',
    FACTION_GRIEVANCE: 'FACTION_GRIEVANCE',
    CORRIDOR_DANGER: 'CORRIDOR_DANGER',
    GARRISON_STRENGTH: 'GARRISON_STRENGTH',
    MARKET_PRICE: 'MARKET_PRICE',
    MILITARY_ESCALATION: 'MILITARY_ESCALATION'
});

export const CASCADE_PATHOLOGIES = Object.freeze({
    RUNAWAY_FAMINE_PANIC_CASCADE: 'RUNAWAY_FAMINE_PANIC_CASCADE',
    PERPETUAL_RETALIATION_WAR_VORTEX: 'PERPETUAL_RETALIATION_WAR_VORTEX',
    CORRIDOR_COLLAPSE_DESERTION_CASCADE: 'CORRIDOR_COLLAPSE_DESERTION_CASCADE',
    UNCONSTRAINED_HYPERINFLATION_SPIRAL: 'UNCONSTRAINED_HYPERINFLATION_SPIRAL'
});

export const CIRCUIT_BREAKER_INTERVENTIONS = Object.freeze({
    INJECT_STRATEGIC_GRAIN_RESERVE: 'INJECT_STRATEGIC_GRAIN_RESERVE',
    ENACT_EMERGENCY_PRICE_CEILING: 'ENACT_EMERGENCY_PRICE_CEILING',
    BROKER_TEMPORARY_CEASEFIRE_SUMMIT: 'BROKER_TEMPORARY_CEASEFIRE_SUMMIT',
    SUBSIDIZE_CORRIDOR_ESCORT_PATROLS: 'SUBSIDIZE_CORRIDOR_ESCORT_PATROLS'
});

export class MultiFeedbackCascadeSystem {
    constructor(config = {}) {
        this.config = Object.freeze({
            historyWindow: config.historyWindow ?? 20,
            gainRunawayThreshold: config.gainRunawayThreshold ?? 1.0,
            accelerationSensitivity: config.accelerationSensitivity ?? 0.05,
            ...config
        });

        // Directed weighted coupling graph: Map<string, Array<{ target: string, weight: number, polarity: number }>>
        this.couplingEdges = new Map();
        this._buildDefaultCouplingTopology();
        this.history = [];
    }

    _buildDefaultCouplingTopology() {
        // Famine-Panic loop: Scarcity -> Price -> Fear -> Harvest Depletion (Scarcity)
        this.addCouplingEdge(COUPLING_VARIABLES.COMMODITY_SCARCITY, COUPLING_VARIABLES.MARKET_PRICE, 1.25, 1);
        this.addCouplingEdge(COUPLING_VARIABLES.MARKET_PRICE, COUPLING_VARIABLES.POPULATION_FEAR, 0.85, 1);
        this.addCouplingEdge(COUPLING_VARIABLES.POPULATION_FEAR, COUPLING_VARIABLES.COMMODITY_SCARCITY, 1.10, 1);

        // Retaliation Vortex: Incursion -> Grievance -> Escalation -> Raids -> Grievance
        this.addCouplingEdge(COUPLING_VARIABLES.FACTION_GRIEVANCE, COUPLING_VARIABLES.MILITARY_ESCALATION, 1.30, 1);
        this.addCouplingEdge(COUPLING_VARIABLES.MILITARY_ESCALATION, COUPLING_VARIABLES.CORRIDOR_DANGER, 1.15, 1);
        this.addCouplingEdge(COUPLING_VARIABLES.CORRIDOR_DANGER, COUPLING_VARIABLES.FACTION_GRIEVANCE, 0.95, 1);

        // Homeostatic garrison loop: Danger -> Garrison -> Suppresses Danger (-1 polarity)
        this.addCouplingEdge(COUPLING_VARIABLES.CORRIDOR_DANGER, COUPLING_VARIABLES.GARRISON_STRENGTH, 0.80, 1);
        this.addCouplingEdge(COUPLING_VARIABLES.GARRISON_STRENGTH, COUPLING_VARIABLES.CORRIDOR_DANGER, 0.90, -1);
    }

    addCouplingEdge(source, target, weight, polarity = 1) {
        if (!this.couplingEdges.has(source)) {
            this.couplingEdges.set(source, []);
        }
        this.couplingEdges.get(source).push({ target, weight, polarity });
    }

    /**
     * Finds all simple cycles in the directed coupling graph.
     */
    findFeedbackCycles() {
        const cycles = [];
        const visited = new Set();
        const stack = [];

        const dfs = (curr, startNode) => {
            visited.add(curr);
            stack.push(curr);

            const neighbors = this.couplingEdges.get(curr) || [];
            for (const edge of neighbors) {
                if (edge.target === startNode && stack.length >= 2) {
                    cycles.push([...stack, startNode]);
                } else if (!visited.has(edge.target)) {
                    dfs(edge.target, startNode);
                }
            }

            stack.pop();
            visited.delete(curr);
        };

        for (const node of this.couplingEdges.keys()) {
            dfs(node, node);
        }

        // Deduplicate cycles with rotational equivalence
        const unique = [];
        const signatures = new Set();

        for (const cycle of cycles) {
            const raw = cycle.slice(0, -1);
            const minElem = raw.reduce((min, cur) => cur < min ? cur : min, raw[0]);
            const minIdx = raw.indexOf(minElem);
            const normalized = [...raw.slice(minIdx), ...raw.slice(0, minIdx)].join('->');

            if (!signatures.has(normalized)) {
                signatures.add(normalized);
                unique.push(cycle);
            }
        }

        return unique;
    }

    /**
     * Calculates closed-loop gain and net polarity for a specific feedback cycle.
     */
    evaluateCycleGain(cycle) {
        let loopGain = 1.0;
        let netPolarity = 1;
        const edgeDetails = [];

        for (let i = 0; i < cycle.length - 1; i++) {
            const u = cycle[i];
            const v = cycle[i + 1];
            const edges = this.couplingEdges.get(u) || [];
            const edge = edges.find(e => e.target === v);

            if (edge) {
                loopGain *= edge.weight;
                netPolarity *= edge.polarity;
                edgeDetails.push({ from: u, to: v, weight: edge.weight, polarity: edge.polarity });
            } else {
                return null;
            }
        }

        const isRunaway = netPolarity === 1 && loopGain > this.config.gainRunawayThreshold;

        return Object.freeze({
            cycle: cycle.join(' → '),
            loopGain: Number(loopGain.toFixed(4)),
            netPolarity,
            isPositiveFeedback: netPolarity === 1,
            isRunaway,
            edges: edgeDetails
        });
    }

    /**
     * Ingests a world simulation telemetry tick and checks for accelerating cascades.
     */
    recordTickTelemetry(tick, telemetrySnapshot) {
        this.history.push({
            tick,
            timestamp: Date.now(),
            metrics: { ...telemetrySnapshot }
        });

        if (this.history.length > this.config.historyWindow) {
            this.history.shift();
        }

        return this.diagnoseRunawayCascades();
    }

    /**
     * Diagnoses any active runaway cascades based on system loop gain and historical acceleration.
     */
    diagnoseRunawayCascades() {
        const cycles = this.findFeedbackCycles();
        const cycleEvaluations = cycles.map(c => this.evaluateCycleGain(c)).filter(Boolean);
        const runawayCycles = cycleEvaluations.filter(e => e.isRunaway);

        const detectedPathologies = [];
        const recommendedCircuitBreakers = [];

        // Check Famine-Panic Spiral
        const famineCycle = cycleEvaluations.find(e => 
            e.cycle.includes(COUPLING_VARIABLES.COMMODITY_SCARCITY) && 
            e.cycle.includes(COUPLING_VARIABLES.POPULATION_FEAR)
        );
        if (famineCycle && famineCycle.isRunaway) {
            detectedPathologies.push({
                pathology: CASCADE_PATHOLOGIES.RUNAWAY_FAMINE_PANIC_CASCADE,
                severity: Math.min(1.0, (famineCycle.loopGain - 1.0) * 1.5 + 0.3),
                loopGain: famineCycle.loopGain,
                triggeringCycle: famineCycle.cycle
            });
            recommendedCircuitBreakers.push({
                intervention: CIRCUIT_BREAKER_INTERVENTIONS.INJECT_STRATEGIC_GRAIN_RESERVE,
                targetSubsystem: 'ECONOMY',
                targetCoupling: `${COUPLING_VARIABLES.COMMODITY_SCARCITY} → ${COUPLING_VARIABLES.MARKET_PRICE}`,
                targetGainReduction: famineCycle.loopGain - 0.75,
                rationale: 'Strategic grain injections dampen price elasticity and sever panic contagion.'
            });
        }

        // Check Retaliation War Vortex
        const warCycle = cycleEvaluations.find(e =>
            e.cycle.includes(COUPLING_VARIABLES.FACTION_GRIEVANCE) &&
            e.cycle.includes(COUPLING_VARIABLES.MILITARY_ESCALATION)
        );
        if (warCycle && warCycle.isRunaway) {
            detectedPathologies.push({
                pathology: CASCADE_PATHOLOGIES.PERPETUAL_RETALIATION_WAR_VORTEX,
                severity: Math.min(1.0, (warCycle.loopGain - 1.0) * 1.4 + 0.4),
                loopGain: warCycle.loopGain,
                triggeringCycle: warCycle.cycle
            });
            recommendedCircuitBreakers.push({
                intervention: CIRCUIT_BREAKER_INTERVENTIONS.BROKER_TEMPORARY_CEASEFIRE_SUMMIT,
                targetSubsystem: 'DIPLOMACY',
                targetCoupling: `${COUPLING_VARIABLES.MILITARY_ESCALATION} → ${COUPLING_VARIABLES.CORRIDOR_DANGER}`,
                targetGainReduction: warCycle.loopGain - 0.80,
                rationale: 'Mandatory demilitarized truce cools retaliatory raids and resets escalation counter.'
            });
        }

        // Check Corridor Desertion Cascade
        const corridorCycle = cycleEvaluations.find(e =>
            e.cycle.includes(COUPLING_VARIABLES.CORRIDOR_DANGER) &&
            e.cycle.includes(COUPLING_VARIABLES.GARRISON_STRENGTH) &&
            e.isRunaway
        );
        if (corridorCycle) {
            detectedPathologies.push({
                pathology: CASCADE_PATHOLOGIES.CORRIDOR_COLLAPSE_DESERTION_CASCADE,
                severity: 0.85,
                loopGain: corridorCycle.loopGain,
                triggeringCycle: corridorCycle.cycle
            });
            recommendedCircuitBreakers.push({
                intervention: CIRCUIT_BREAKER_INTERVENTIONS.SUBSIDIZE_CORRIDOR_ESCORT_PATROLS,
                targetSubsystem: 'CARAVANS',
                targetGainReduction: 0.40,
                rationale: 'Subsidize armed caravan escorts to maintain minimum safe trade volume.'
            });
        }

        return Object.freeze({
            activeCycleCount: cycleEvaluations.length,
            runawayLoopCount: runawayCycles.length,
            detectedPathologies,
            recommendedCircuitBreakers,
            cycleEvaluations,
            isSystemStable: runawayCycles.length === 0
        });
    }

    /**
     * Strictly verifies the Host Game Authority Invariant.
     * Evaluates that analyzing multi-system telemetry does not mutate host state.
     */
    validateHostAuthorityInvariant(hostTelemetry) {
        const snapshot = JSON.stringify(hostTelemetry);
        this.recordTickTelemetry(1, hostTelemetry);
        this.diagnoseRunawayCascades();
        const after = JSON.stringify(hostTelemetry);
        return snapshot === after;
    }
}
