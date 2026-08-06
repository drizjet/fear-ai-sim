import { Planner } from './planner.js';
import { getAvailableActions, createWorldState, createGoal } from './agentactions.js';
import { HybridBehaviorTree } from './behaviortree.js';

export class Brain {
    constructor(traits = null) {
        // Phase 8: OCEAN Personality Mapping (T8.3)
        this.traits = traits || {
            fear: Math.random(),
            skill: Math.random(),
            curiosity: Math.random(),
            leadership: Math.random(),
            resilience: Math.random(), // Added for compatibility
            // OCEAN Traits
            openness: Math.random(),
            conscientiousness: Math.random(),
            extraversion: Math.random(),
            agreeableness: Math.random(),
            neuroticism: Math.random()
        };
        
        // Phase 8: PAD Emotional Model (T8.1)
        this.currentFear = 0;
        this.currentAnger = 0;
        this.currentDominance = 0.5; // Starts neutral
        
        this.state = 'CALM'; // States: CALM, ALERT, ANXIOUS, PANIC, FREEZE, HIDE, RECOVER, AGGRESSIVE
        this.stateTimer = 0; // Timer for state transitions
        this.hideTarget = null; // Target obstacle to hide behind
        this.recoveryProgress = 0; // Progress in RECOVER state (0-1)
        this.morale = 1.0;
        this.adrenaline = 0;
        
        // Phase 6: Strategic Roles & Dynamic Costs (T6.2, T6.5)
        this.role = 'CITIZEN';
        this.roleData = null;
        this.actionSuccessStats = new Map(); // ActionName -> { success: 0, fail: 0 }
        this.uncertainty = 1.0; // Pavlovian uncertainty (T6.4)
        
        // GOAP Planning
        this.planner = new Planner();
        this.currentPlan = null;
        this.planStep = 0;
        this.lastPlanTime = 0;
        // Conscientiousness affects planning interval (T8.3)
        this.planInterval = Math.floor(15 + (1 - this.traits.conscientiousness) * 30); // 15 to 45 frames

        // Phase 8: Hybrid AI Architecture (T8.2)
        this.behaviorTree = new HybridBehaviorTree();

        // Phase 11: Epistemic Emotions & SGE (T11.1)
        this.lastVisuals = null;
        this.predictionError = 0;
        this.persistentError = 0;

        // Phase 2.2: Habituation System
        this.exposureCount = {}; // stimulus_type -> count
        this.habituationRate = 0.05; // 5% reduction per exposure

        // Phase 10/11: RTS Command Override
        this.manualTarget = null;
    }

    /**
     * Phase 2.2: Calculate effective fear after habituation
     */
    calculateHabituatedFear(baseFear, stimulusType = 'GENERAL') {
        const count = this.exposureCount[stimulusType] || 0;
        const habituation = Math.min(0.6, count * this.habituationRate); // Max 60% reduction
        return baseFear * (1 - habituation);
    }

    recordExposure(stimulusType = 'GENERAL') {
        this.exposureCount[stimulusType] = (this.exposureCount[stimulusType] || 0) + 1;
    }

    /**
     * Reset brain state for reuse in ObjectPool
     */
    reset(traits = null) {
        this.traits = traits || {
            fear: Math.random(),
            skill: Math.random(),
            curiosity: Math.random(),
            leadership: Math.random(),
            resilience: Math.random(),
            openness: Math.random(),
            conscientiousness: Math.random(),
            extraversion: Math.random(),
            agreeableness: Math.random(),
            neuroticism: Math.random()
        };
        this.currentFear = 0;
        this.currentAnger = 0;
        this.currentDominance = 0.5;
        this.state = 'CALM';
        this.stateTimer = 0;
        this.hideTarget = null;
        this.recoveryProgress = 0;
        this.morale = 1.0;
        this.adrenaline = 0;
        
        this.currentPlan = null;
        this.planStep = 0;
        this.lastPlanTime = 0;
        this.planInterval = Math.floor(15 + (1 - this.traits.conscientiousness) * 30);

        this.lastVisuals = null;
        this.predictionError = 0;
        this.persistentError = 0;
        this.manualTarget = null;
    }

    // Phase 13.8: Differential Entropy (DE) scaling (SEED-IV/V research)
    // dR = 0.5 * log(2 * PI * e * variance)
    calculateStimulusResponse(threatCount, neighborPanicLevel) {
        if (threatCount === 0 && neighborPanicLevel === 0) return 0;
        
        // Variance of the environment (Information Entropy)
        const variance = (threatCount * 1.5) + (neighborPanicLevel * 2.0) + 0.1;
        const deValue = 0.5 * Math.log(2 * Math.PI * Math.E * variance);
        
        // Normalize for simulation PAD model
        return Math.max(0, deValue * 0.2);
    }

    /**
     * Set a strategic role from the Director (T6.2)
     */
    setRole(role, data) {
        this.role = role;
        this.roleData = data;
        this.stateTimer = 0;
        console.log(`[BRAIN] Agent assigned role: ${role}`);
    }

    /**
     * Handle specialized logic for strategic roles (T6.2)
     */
    handleRoleDecision(visuals, agent) {
        let moveX = 0;
        let moveY = 0;

        switch(this.role) {
            case 'LEAD_INVESTIGATOR':
                const target = this.roleData.target;
                const distToTarget = Math.hypot(agent.x - target.x, agent.y - target.y);
                if (distToTarget > 10) {
                    moveX = target.x - agent.x;
                    moveY = target.y - agent.y;
                } else {
                    // Reached target, role complete
                    this.role = 'CITIZEN';
                }
                break;

            case 'BACK_WATCHER':
                // Follow leader but look outwards
                const leader = visuals.neighbors.find(n => n.id === this.roleData.leaderId);
                if (leader) {
                    const distToLeader = Math.hypot(agent.x - leader.x, agent.y - leader.y);
                    if (distToLeader > 40) {
                        moveX = leader.x - agent.x;
                        moveY = leader.y - agent.y;
                    } else {
                        // Circle the leader or just stay near
                        moveX = (Math.random() - 0.5);
                        moveY = (Math.random() - 0.5);
                    }
                } else {
                    this.role = 'CITIZEN'; // Leader lost
                }
                break;
        }

        return { dx: moveX, dy: moveY };
    }

    /**
     * Record success/failure of an action for dynamic GOAP costs (T6.5)
     */
    recordActionSuccess(actionName, success) {
        if (!this.actionSuccessStats.has(actionName)) {
            this.actionSuccessStats.set(actionName, { success: 0, fail: 0 });
        }
        const stats = this.actionSuccessStats.get(actionName);
        if (success) stats.success++;
        else stats.fail++;
    }

    /**
     * SGE: Self-Generating Evaluation (T11.1)
     * Prediction error evaluation drives curiosity vs fear.
     */
    updateEpistemicEmotions(visuals) {
        if (!this.lastVisuals) {
            this.lastVisuals = this.summarizeVisuals(visuals);
            return;
        }

        // Calculate prediction error
        this.predictionError = this.calculatePredictionError(visuals);
        
        // Persistent error tracking
        this.persistentError = this.persistentError * 0.9 + this.predictionError * 0.1;

        // Epistemic Emotional Adjustment:
        // Transient high error (novelty) -> increase curiosity/openness
        if (this.predictionError > 0.5 && this.persistentError < 0.3) {
            this.traits.openness = Math.min(1.0, this.traits.openness + 0.05);
        }
        
        // Persistent high error (unpredictability/danger) -> increase fear/neuroticism
        if (this.persistentError > 0.5) {
            this.traits.neuroticism = Math.min(1.0, this.traits.neuroticism + 0.02);
            this.traits.fear = Math.min(1.0, this.traits.fear + 0.01);
        }

        this.lastVisuals = this.summarizeVisuals(visuals);
    }

    summarizeVisuals(visuals) {
        return {
            threatCount: visuals.threats.length,
            foodCount: visuals.food.length,
            nearestThreatDist: visuals.threats.length > 0 ? visuals.threats[0].dist : Infinity,
            neighborCount: visuals.neighbors.length
        };
    }

    calculatePredictionError(visuals) {
        let error = 0;
        
        // Error in threat count
        const threatDiff = Math.abs(visuals.threats.length - this.lastVisuals.threatCount);
        error += threatDiff * 0.2;

        // Error in food count
        const foodDiff = Math.abs(visuals.food.length - this.lastVisuals.foodCount);
        error += foodDiff * 0.1;

        // Error in nearest threat distance
        if (visuals.threats.length > 0 && this.lastVisuals.nearestThreatDist !== Infinity) {
            const distDiff = Math.abs(visuals.threats[0].dist - this.lastVisuals.nearestThreatDist);
            error += (distDiff / 100) * 0.3;
        }

        return Math.min(1.0, error);
    }

    /**
     * Intrinsic Fear Conditioning (T11.4)
     * Check if any nearby predator types are known to be dangerous to the tribe.
     */
    calculateIntrinsicDanger(visuals, agent, socialDynamics) {
        if (!socialDynamics || visuals.threats.length === 0) return 0;
        
        let maxDanger = 0;
        visuals.threats.forEach(t => {
            const danger = socialDynamics.getTribalDanger(agent.id, t.type);
            if (danger > maxDanger) maxDanger = danger;
        });
        
        return maxDanger;
    }

    decide(visuals, agent, globalMemory, safeHavens, traumaIntensity = 0, mirrorFear = 0, smartObjects = null, heatmap = null, socialDynamics = null, worldEnv = null) {
        // Phase 11: Update Epistemic Emotions (T11.1)
        this.updateEpistemicEmotions(visuals);

        const { threats, food, neighbors } = visuals;
        let moveX = 0;
        let moveY = 0;

        // Phase 10/11: Environment Biome Sampling
        const biome = worldEnv ? worldEnv.getBiomeAt(agent.x, agent.y) : null;
        const biomeFearMult = biome ? biome.fearMult : 1.0;
        const biomeSpeedMult = biome ? (1.0 / biome.cost) : 1.0;

        // Phase 10/11: RTS Manual Command Override
        if (this.manualTarget) {
            const dx = this.manualTarget.x - agent.x;
            const dy = this.manualTarget.y - agent.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 10) {
                moveX = dx / dist;
                moveY = dy / dist;
                // Still allow some jitter and uncertainty but move mainly toward target
            } else {
                this.manualTarget = null;
                console.log(`[BRAIN] Manual target reached.`);
            }
        }

        // Phase 6: VR Presence Break Detection (T6.6)
        if (this.currentFear > 0.95 && this.state === 'PANIC') {
            if (this.stateTimer > 200) {
                this.state = 'PRESENCE_BREAK';
                this.stateTimer = 0;
            }
        }

        // 1. Perception Step
        const localRisk = globalMemory ? globalMemory.getRisk(agent.x, agent.y) : 0;
        
        // Pavlovian Uncertainty (T6.4)
        this.uncertainty = Math.min(1.0, this.uncertainty * 0.99 + localRisk * 0.1);
        
        const panickingNeighbors = neighbors.filter(n => n.brain.state === 'PANIC').length;
        
        // Phase 11: Intrinsic Fear (T11.4)
        const intrinsicDanger = this.calculateIntrinsicDanger(visuals, agent, socialDynamics);

        // Phase 8: OCEAN trait adjustments (T8.3)
        const extraversionScale = 0.5 + this.traits.extraversion;
        const neuroticismScale = 0.5 + this.traits.neuroticism;

        // Combined threat includes trauma zones (T7.3), affective mirroring (T7.2) and intrinsic fear (T11.4)
        const percievedThreat = this.calculateStimulusResponse(threats.length, panickingNeighbors / 5) 
            + (localRisk * 0.5) 
            + (traumaIntensity * 0.8 * neuroticismScale)
            + (mirrorFear * 0.4 * extraversionScale)
            + (intrinsicDanger * 0.6);

        // Phase 8: PAD Emotional Model - Dominance Calculation (T8.1)
        const agentPower = (agent.energy / 100) + (neighbors.length * 0.2);
        const threatPower = threats.length * 1.5 + (traumaIntensity * 2) + localRisk + 0.1;
        
        this.currentDominance = agentPower / (agentPower + threatPower);

        // 2. State Transition Logic (PAD Model with Hysteresis)
        const fearDecayRate = 0.95 + (this.traits.neuroticism * 0.04);
        
        // Apply Habituation to the perceived threat
        const habituatedThreat = this.calculateHabituatedFear(percievedThreat);
        if (percievedThreat > 0.5) this.recordExposure(); // Record exposure to high threats

        this.currentFear = Math.max(this.currentFear * fearDecayRate, habituatedThreat * this.traits.fear);
        
        // Prey should always flee from predators, never fight
        // Only get aggressive if there's no actual threat (predator) nearby
        if (this.currentDominance > 0.7 && threats.length === 0) {
            // Aggressive toward rivals, not predators
            this.currentAnger = Math.min(1.0, this.currentAnger + 0.1);
        } else if (threats.length > 0) {
            // Always flee from predators - no fight response
            this.currentAnger *= 0.8;
            this.currentFear = Math.min(1.0, this.currentFear * 1.2);
        } else {
            this.currentAnger *= 0.95;
        }

        let inSafeHaven = false;
        if (safeHavens) {
            safeHavens.forEach(sh => {
                if (agent.x > sh.x && agent.x < sh.x + sh.w &&
                    agent.y > sh.y && agent.y < sh.y + sh.h) {
                    inSafeHaven = true;
                }
            });
        }

        // Handle specialized Role Decision (T6.2)
        if (this.role !== 'CITIZEN') {
            const roleMove = this.handleRoleDecision(visuals, agent);
            moveX = roleMove.dx;
            moveY = roleMove.dy;
        } else if (this.traits.skill > 0.4) {
            // Phase 8: Hybrid AI Architecture (T8.2)
            if (this.state === 'PRESENCE_BREAK') {
                this.currentFear *= 0.95;
                if (this.currentFear < 0.5) this.state = 'RECOVER';
                return { dx: 0, dy: 0 };
            }
            
            if (this.stateTimer % this.planInterval === 0 || this.currentPlan) {
                this.behaviorTree.tick(agent, visuals, globalMemory, safeHavens);
            }
        } else {
            // Standard Reactive State Machine Logic with Hysteresis (Phase 2.1)
            const f = this.currentFear * 100; // Convert to 0-100 for roadmap alignment
            
            if (this.state === 'PRESENCE_BREAK') {
                this.currentFear *= 0.95;
                if (this.currentFear < 0.5) this.state = 'RECOVER';
                return { dx: 0, dy: 0 };
            }

            if (this.currentAnger > 0.6) {
                this.state = 'AGGRESSIVE';
            } else if (this.state === 'RECOVER') {
                if (f < 20 && this.recoveryProgress > 0.8) {
                    this.state = 'CALM';
                    this.recoveryProgress = 0;
                }
            } else if (this.state === 'HIDE') {
                if (threats.length === 0) {
                    this.state = 'RECOVER';
                } else if (f > 85) {
                    this.state = 'PANIC';
                }
            } else {
                // Hysteresis State Transitions (T2.1)
                switch(this.state) {
                    case 'CALM':
                        if (f > 30) this.state = 'ANXIOUS';
                        else if (f > 20) this.state = 'ALERT';
                        break;
                    case 'ALERT':
                        if (f > 30) this.state = 'ANXIOUS';
                        else if (f < 10) this.state = 'CALM';
                        break;
                    case 'ANXIOUS':
                        if (f > 80) this.state = 'PANIC';
                        else if (f < 20) this.state = 'CALM';
                        break;
                    case 'PANIC':
                        if (f < 70) this.state = 'ANXIOUS';
                        break;
                }

                // Chance to HIDE if skilled
                if (this.state === 'PANIC' && this.traits.skill > 0.6 && threats.length > 0 && Math.random() < 0.3) {
                    this.state = 'HIDE';
                }
            }

            if (this.state === 'PANIC' && this.morale < 0.4 && Math.random() < 0.05) {
                this.state = 'FREEZE';
            }
            if (this.state === 'FREEZE' && Math.random() < 0.02) {
                this.state = 'RECOVER';
            }
        }

        // Action Logic
        switch (this.state) {
            case 'AGGRESSIVE':
                this.adrenaline = Math.min(1, this.adrenaline + 0.2);
                // AGGRESSIVE is for rival tribes, NEVER charge at predators
                if (threats.length > 0) {
                    const t = threats[0];
                    // ALWAYS flee from predators, even when angry
                    moveX = -t.dx * 1.5; // Run away faster
                    moveY = -t.dy * 1.5;
                }
                break;
            case 'PANIC':
                this.adrenaline = Math.min(1, this.adrenaline + 0.1);
                if (threats.length > 0) {
                    const t = threats[0];
                    // T9.3: Predator Sequence Learning (Markov Chains) - evade prediction
                    if (t.predictedNextPos && this.traits.skill > 0.5) {
                        const pdx = t.predictedNextPos.x - agent.x;
                        const pdy = t.predictedNextPos.y - agent.y;
                        const pdist = Math.hypot(pdx, pdy) || 0.001;
                        moveX = -(t.dx * 0.5 + (pdx / pdist) * 0.5);
                        moveY = -(t.dy * 0.5 + (pdy / pdist) * 0.5);
                    } else {
                        moveX = -t.dx;
                        moveY = -t.dy;
                    }
                } else {
                    moveX = agent.vx;
                    moveY = agent.vy;
                }
                break;
            case 'ANXIOUS':
                if (threats.length > 0) {
                    const t = threats[0];
                    if (t.predictedNextPos && this.traits.skill > 0.5) {
                        const pdx = t.predictedNextPos.x - agent.x;
                        const pdy = t.predictedNextPos.y - agent.y;
                        const pdist = Math.hypot(pdx, pdy) || 0.001;
                        moveX -= (t.dx * 0.7 + (pdx / pdist) * 0.3);
                        moveY -= (t.dy * 0.7 + (pdy / pdist) * 0.3);
                    } else {
                        moveX -= t.dx;
                        moveY -= t.dy;
                    }
                }
                break;
            case 'ALERT':
                if (food.length > 0) {
                    moveX += food[0].dx;
                    moveY += food[0].dy;
                }
                if (threats.length > 0) {
                    moveX -= threats[0].dx * 0.5;
                    moveY -= threats[0].dy * 0.5;
                }
                break;
            case 'CALM':
                if (food.length > 0) {
                    moveX += food[0].dx;
                    moveY += food[0].dy;
                } else {
                    const exploreFactor = this.traits.curiosity * (0.5 + this.traits.openness);
                    moveX += (Math.random() - 0.5) * exploreFactor;
                    moveY += (Math.random() - 0.5) * exploreFactor;
                }
                break;
            case 'HIDE':
                if (threats.length > 0) {
                    // Phase 10: Environmental Interaction (T10.1)
                    if (smartObjects) {
                        const coverObj = smartObjects.findNearest(agent.x, agent.y, 'COVER', 200);
                        if (coverObj) {
                            const threatAbsX = agent.x + threats[0].dx * threats[0].dist;
                            const threatAbsY = agent.y + threats[0].dy * threats[0].dist;
                            const bestPoint = smartObjects.getBestCoverPoint(coverObj, threatAbsX, threatAbsY);
                            
                            if (bestPoint) {
                                moveX = bestPoint.x - agent.x;
                                moveY = bestPoint.y - agent.y;
                                break;
                            }
                        }
                    }
                    
                    // Fallback hide logic
                    moveX = -threats[0].dx * 0.3;
                    moveY = -threats[0].dy * 0.3;
                }
                break;
            case 'RECOVER':
                this.recoveryProgress += 0.02;
                moveX = (Math.random() - 0.5) * 0.5;
                moveY = (Math.random() - 0.5) * 0.5;
                break;
            case 'FREEZE':
                moveX = 0;
                moveY = 0;
                this.currentFear *= 1.01;
                break;
        }

        const jitterScale = this.currentFear * 0.5;
        moveX += (Math.random() - 0.5) * jitterScale;
        moveY += (Math.random() - 0.5) * jitterScale;

        // T6.4: Pavlovian Uncertainty Gating
        const uncertaintyMultiplier = 1.0 - (this.uncertainty * 0.5);
        moveX *= uncertaintyMultiplier;
        moveY *= uncertaintyMultiplier;

        // Update morale (Phase 16: Pillar 2 - Prospect Theory)
        if (inSafeHaven) {
            this.morale = Math.min(2.0, this.morale + 0.05);
            this.currentFear *= 0.8;
            this.uncertainty *= 0.95;
        } else {
            // Pillar 2: Prospect Theory - Asymmetrical weighting of loss vs gain
            const gain = food.length > 0 ? 0.01 : 0;
            const loss = 0.001; // Base loss over time
            
            // Utility loss is weighted 2x more heavily than utility gain
            this.morale = Math.max(0.2, Math.min(2.0, this.morale + gain - (loss * 2))); 
            
            // If energy is low, fear of death (loss) spikes exponentially
            if (agent.energy < 30) {
                this.currentFear = Math.min(1.0, this.currentFear + (30 - agent.energy) * 0.01);
            }
        }

        // Normalize and safety
        const mag = Math.hypot(moveX, moveY);
        if (mag > 0) {
            moveX /= mag;
            moveY /= mag;
        }
        
        this.stateTimer++;
        return { dx: moveX, dy: moveY };
    }

    mutate(rate) {
        for (let trait in this.traits) {
            if (Math.random() < rate) {
                this.traits[trait] += (Math.random() - 0.5) * 0.2;
                this.traits[trait] = Math.max(0, Math.min(1, this.traits[trait]));
            }
        }
    }

    /**
     * GOAP Planning - Update current plan based on world state
     */
    updatePlan(agent, visuals, safeHavens, inSafeHaven) {
        const worldState = createWorldState(agent, visuals, safeHavens, inSafeHaven);
        const goal = createGoal(agent, visuals);
        const actions = getAvailableActions(agent, visuals); // Pass visuals for target positions
        
        const agentPos = { x: agent.x, y: agent.y };
        const plan = this.planner.plan(worldState, goal, actions, this.actionSuccessStats, agentPos, this.uncertainty);
        
        if (plan && plan.length > 0) {
            this.currentPlan = plan;
            this.planStep = 0;
            this.lastPlanTime = Date.now();
        }
    }

    /**
     * Get current action from plan
     */
    getCurrentPlanAction() {
        if (!this.currentPlan || this.planStep >= this.currentPlan.length) {
            return null;
        }
        return this.currentPlan[this.planStep];
    }

    /**
     * Advance to next plan step
     */
    advancePlan() {
        if (this.currentPlan && this.planStep < this.currentPlan.length) {
            this.planStep++;
        }
    }
}
