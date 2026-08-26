import { Brain } from './brain.js';
import { MemorySystem } from './memorysystem.js';
import { PredatorLearning } from './predator.js';

/**
 * Self-Learning AI System for Prey Agents
 * Evolves survival strategies through experience and tribal knowledge sharing
 */
export const AgentLearning = {
    // Survival tracking
    survivalData: {
        totalEscapes: 0,
        totalDeaths: 0,
        averageSurvivalTime: 0,
        successfulStrategies: new Map(), // strategy -> success count
        predatorPatterns: new Map(), // predator type -> behavior patterns
        escapeRoutes: new Map(), // situation -> best direction
        hidingSpots: [], // successful hide locations
        dangerZones: new Map(), // location hash -> danger level
        tribalKnowledge: new Map() // shared learned data
    },
    
    // Strategy effectiveness tracking
    strategyStats: {
        fleeStraight: { uses: 0, successes: 0 },
        fleeZigzag: { uses: 0, successes: 0 },
        hide: { uses: 0, successes: 0 },
        groupDefense: { uses: 0, successes: 0 },
        splitRun: { uses: 0, successes: 0 },
        freezeThenFlee: { uses: 0, successes: 0 }
    },
    
    // Learn from successful escape
    recordEscape(agent, predatorType, strategyUsed, survivalTime, nearbyAgents) {
        this.survivalData.totalEscapes++;
        
        // Update average survival time
        const alpha = 0.05;
        this.survivalData.averageSurvivalTime = 
            (1 - alpha) * this.survivalData.averageSurvivalTime + alpha * survivalTime;
        
        // Record successful strategy
        if (!this.survivalData.successfulStrategies.has(strategyUsed)) {
            this.survivalData.successfulStrategies.set(strategyUsed, { 
                count: 0, 
                contexts: [],
                avgSurvivalTime: 0 
            });
        }
        const strategy = this.survivalData.successfulStrategies.get(strategyUsed);
        strategy.count++;
        strategy.contexts.push({
            predatorType,
            nearbyAgents: nearbyAgents.length,
            timestamp: Date.now()
        });
        
        // Update strategy stats
        if (this.strategyStats[strategyUsed]) {
            this.strategyStats[strategyUsed].successes++;
        }
        
        // Record predator pattern (what they do when we escape)
        if (!this.survivalData.predatorPatterns.has(predatorType)) {
            this.survivalData.predatorPatterns.set(predatorType, {
                chasePatterns: [],
                successRate: 0,
                avgChaseTime: 0
            });
        }
        
        // Learn hiding spots if we hid successfully
        if (strategyUsed === 'hide' && agent.lastHidingSpot) {
            this.survivalData.hidingSpots.push({
                x: agent.lastHidingSpot.x,
                y: agent.lastHidingSpot.y,
                successCount: 1,
                timestamp: Date.now()
            });
            // Keep only recent spots
            if (this.survivalData.hidingSpots.length > 50) {
                this.survivalData.hidingSpots.shift();
            }
        }
        
        // Share knowledge with nearby agents (tribal learning)
        this.shareTribalKnowledge(agent, nearbyAgents, {
            type: 'escape',
            predatorType,
            strategy: strategyUsed,
            location: { x: agent.x, y: agent.y }
        });
    },
    
    // Learn from death (what went wrong)
    recordDeath(agent, predatorType, survivalTime, deathLocation, lastStrategy) {
        this.survivalData.totalDeaths++;
        
        // Mark location as dangerous
        const locKey = `${Math.floor(deathLocation.x / 50)}_${Math.floor(deathLocation.y / 50)}`;
        const currentDanger = this.survivalData.dangerZones.get(locKey) || 0;
        this.survivalData.dangerZones.set(locKey, currentDanger + 1);
        
        // Record failed strategy
        if (this.strategyStats[lastStrategy]) {
            this.strategyStats[lastStrategy].uses++;
        }
        
        // Learn what NOT to do
        if (!this.survivalData.predatorPatterns.has(predatorType)) {
            this.survivalData.predatorPatterns.set(predatorType, {
                killLocations: [],
                killCount: 0
            });
        }
        const pattern = this.survivalData.predatorPatterns.get(predatorType);
        pattern.killCount = (pattern.killCount || 0) + 1;
        pattern.killLocations.push({
            x: deathLocation.x,
            y: deathLocation.y,
            timestamp: Date.now()
        });
    },
    
    // Share knowledge between agents
    shareTribalKnowledge(agent, nearbyAgents, knowledge) {
        nearbyAgents.forEach(other => {
            if (other.id === agent.id || other.dead) return;
            
            const tribeId = agent.familyName;
            if (!this.survivalData.tribalKnowledge.has(tribeId)) {
                this.survivalData.tribalKnowledge.set(tribeId, []);
            }
            
            const tribeKnowledge = this.survivalData.tribalKnowledge.get(tribeId);
            tribeKnowledge.push({
                ...knowledge,
                fromAgent: agent.id,
                timestamp: Date.now()
            });
            
            // Keep only recent knowledge
            if (tribeKnowledge.length > 100) {
                tribeKnowledge.shift();
            }
        });
    },
    
    // Get best strategy for current situation
    getBestStrategy(agent, predatorType, nearbyPredators, nearbyAgents) {
        const strategies = Object.keys(this.strategyStats);
        let bestStrategy = 'fleeStraight';
        let bestScore = -Infinity;
        
        strategies.forEach(strategy => {
            const stats = this.strategyStats[strategy];
            const successRate = stats.uses > 0 ? stats.successes / stats.uses : 0.5;
            
            // Context bonuses
            let contextBonus = 0;
            
            if (strategy === 'groupDefense' && nearbyAgents.length >= 3) {
                contextBonus += 0.3;
            }
            if (strategy === 'hide' && this.survivalData.hidingSpots.length > 0) {
                contextBonus += 0.2;
            }
            if (strategy === 'splitRun' && nearbyAgents.length >= 2) {
                contextBonus += 0.15;
            }
            
            // Against learned predator patterns
            const predatorPattern = this.survivalData.predatorPatterns.get(predatorType);
            if (predatorPattern && predatorPattern.killCount > 5) {
                // If predator has high kill count, favor zigzag/unpredictable
                if (strategy === 'fleeZigzag' || strategy === 'freezeThenFlee') {
                    contextBonus += 0.25;
                }
            }
            
            const score = successRate + contextBonus + (Math.random() * 0.1);
            if (score > bestScore) {
                bestScore = score;
                bestStrategy = strategy;
            }
        });
        
        // Record that we're trying this strategy
        if (this.strategyStats[bestStrategy]) {
            this.strategyStats[bestStrategy].uses++;
        }
        
        return bestStrategy;
    },
    
    // Get learned escape direction for a situation
    getEscapeDirection(agent, predatorX, predatorY, strategy) {
        const dx = agent.x - predatorX;
        const dy = agent.y - predatorY;
        const baseAngle = Math.atan2(dy, dx);
        
        switch (strategy) {
            case 'fleeStraight':
                return baseAngle;
                
            case 'fleeZigzag':
                // Zigzag with learned timing
                const time = Date.now() / 200;
                const zigzagOffset = Math.sin(time) * 0.8;
                return baseAngle + zigzagOffset;
                
            case 'splitRun':
                // Run perpendicular to create confusion
                return baseAngle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
                
            case 'freezeThenFlee':
                // Brief freeze then sudden escape
                if (agent.freezeTimer > 0) {
                    return null; // Don't move
                }
                return baseAngle + (Math.random() - 0.5) * 0.5;
                
            default:
                return baseAngle;
        }
    },
    
    // Get nearest safe hiding spot
    getHidingSpot(agent, maxDistance = 200) {
        let bestSpot = null;
        let bestScore = -Infinity;
        
        for (const spot of this.survivalData.hidingSpots) {
            const dx = spot.x - agent.x;
            const dy = spot.y - agent.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist > maxDistance) continue;
            
            const score = spot.successCount / (dist + 1);
            if (score > bestScore) {
                bestScore = score;
                bestSpot = spot;
            }
        }
        
        return bestSpot;
    },
    
    // Check if location is in learned danger zone
    isDangerousZone(x, y) {
        const locKey = `${Math.floor(x / 50)}_${Math.floor(y / 50)}`;
        const danger = this.survivalData.dangerZones.get(locKey) || 0;
        return danger > 2; // Dangerous if multiple deaths here
    },
    
    // Get tribal knowledge for agent's family
    getTribalKnowledge(agent) {
        return this.survivalData.tribalKnowledge.get(agent.familyName) || [];
    },
    
    // Adapt predator AI based on prey learning (co-evolution)
    adaptPredatorAI() {
        // If prey are escaping too much, predators learn counter-strategies
        const escapeRate = this.survivalData.totalEscapes / 
            Math.max(1, this.survivalData.totalEscapes + this.survivalData.totalDeaths);
        
        if (escapeRate > 0.7) {
            // Prey winning - predators need to adapt faster
            PredatorLearning.adaptationMultiplier = 1.5;
        } else if (escapeRate < 0.3) {
            // Predators winning - they can slow adaptation
            PredatorLearning.adaptationMultiplier = 0.8;
        }
        
        return escapeRate;
    },
    
    // Export learning data for research
    exportData() {
        const strategyAnalysis = {};
        for (const [name, stats] of Object.entries(this.strategyStats)) {
            strategyAnalysis[name] = {
                ...stats,
                effectiveness: stats.uses > 0 ? (stats.successes / stats.uses * 100).toFixed(1) + '%' : 'N/A'
            };
        }
        
        return {
            survivalStats: {
                totalEscapes: this.survivalData.totalEscapes,
                totalDeaths: this.survivalData.totalDeaths,
                survivalRate: (this.survivalData.totalEscapes / 
                    Math.max(1, this.survivalData.totalEscapes + this.survivalData.totalDeaths) * 100).toFixed(1) + '%',
                averageSurvivalTime: (this.survivalData.averageSurvivalTime / 1000).toFixed(2) + 's'
            },
            strategyEffectiveness: strategyAnalysis,
            learnedHidingSpots: this.survivalData.hidingSpots.length,
            dangerZones: this.survivalData.dangerZones.size,
            tribalKnowledgeSize: Array.from(this.survivalData.tribalKnowledge.values())
                .reduce((sum, arr) => sum + arr.length, 0)
        };
    },
    
    reset() {
        this.survivalData.totalEscapes = 0;
        this.survivalData.totalDeaths = 0;
        this.survivalData.averageSurvivalTime = 0;
        this.survivalData.successfulStrategies.clear();
        this.survivalData.predatorPatterns.clear();
        this.survivalData.escapeRoutes.clear();
        this.survivalData.hidingSpots = [];
        this.survivalData.dangerZones.clear();
        this.survivalData.tribalKnowledge.clear();
        
        for (const key of Object.keys(this.strategyStats)) {
            this.strategyStats[key] = { uses: 0, successes: 0 };
        }
    }
};

/**
 * Enhanced Agent class with self-learning capabilities
 */
export class LearningAgent {
    constructor(x, y, traits = null, isBigGuy = false, parentId = null) {
        this.x = x;
        this.y = y;
        this.radius = isBigGuy ? 15 : 4;
        this.isBigGuy = isBigGuy;
        this.id = LearningAgent.nextId++;
        
        this.parentId = parentId;
        this.generation = parentId ? 0 : 1;
        this.children = [];
        this.familyName = this.generateFamilyName();
        
        this.brain = new Brain(traits);
        this.memory = new MemorySystem();
        this.lastFear = 0;
        
        this.emotions = {
            fear: 0,
            anger: 0,
            energy: 100,
            hunger: 0,
            thirst: 0,
            boredom: 0
        };
        
        this.energy = 100;
        this.age = 0;
        this.dead = false;
        
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.baseMaxSpeed = isBigGuy ? 1.5 : 3;
        this.maxSpeed = this.baseMaxSpeed;

        this.engagementStartTime = 0;
        this.isEngaged = false;
        this.stressSurvivalTime = 0;
        this.panicSourceId = null;

        this.traumaLevel = 0;
        this.traumaDecayRate = 0.9995;
        this.panicEventsSurvived = 0;
        
        // Learning state
        this.currentStrategy = 'fleeStraight';
        this.strategyTimer = 0;
        this.lastHidingSpot = null;
        this.escapeCount = 0;
        this.freezeTimer = 0;
        this.learningEnabled = true;
    }
    
    generateFamilyName() {
        const prefixes = ['Fear', 'Brave', 'Swift', 'Wise', 'Bold', 'Keen', 'Iron', 'Silent', 'Shadow', 'Bright'];
        const suffixes = ['heart', 'mind', 'walker', 'seeker', 'guard', 'born', 'dweller', 'weaver', 'hunter', 'spirit'];
        
        const prefix = prefixes[this.id % prefixes.length];
        const suffix = suffixes[(this.id * 7) % suffixes.length];
        return `${prefix}${suffix}`;
    }
    
    getLineageInfo() {
        return {
            id: this.id,
            familyName: this.familyName,
            generation: this.generation,
            parentId: this.parentId,
            childrenCount: this.children.length,
            children: this.children
        };
    }
    
    /**
     * Apply social forces with learned behaviors
     */
    applySocialForces(visuals, obstacles, safeHavens, traumaIntensity = 0, mirrorFear = 0, smartObjects = null, heatmap = null, worldEnv = null) {
        // Get AI-recommended strategy
        const predatorType = this.detectPredatorType(visuals.threats);
        const nearbyAgents = visuals.neighbors;
        
        if (this.learningEnabled && this.brain.state === 'PANIC' && visuals.threats.length > 0) {
            this.currentStrategy = AgentLearning.getBestStrategy(
                this, 
                predatorType, 
                visuals.threats,
                nearbyAgents
            );
        }
        
        // Apply learned escape direction
        if (this.brain.state === 'PANIC' && visuals.threats.length > 0) {
            const threat = visuals.threats[0];
            const escapeAngle = AgentLearning.getEscapeDirection(
                this,
                this.x + threat.dx * threat.dist,
                this.y + threat.dy * threat.dist,
                this.currentStrategy
            );
            
            if (escapeAngle !== null) {
                // Apply learned evasion
                const evasionStrength = 2.0;
                this.vx += Math.cos(escapeAngle) * evasionStrength;
                this.vy += Math.sin(escapeAngle) * evasionStrength;
            }
            
            // Handle freeze strategy
            if (this.currentStrategy === 'freezeThenFlee') {
                if (this.freezeTimer === 0) {
                    this.freezeTimer = 30; // Freeze for 30 frames
                }
                if (this.freezeTimer > 0) {
                    this.freezeTimer--;
                    this.vx *= 0.1;
                    this.vy *= 0.1;
                    return; // Skip normal movement
                }
            }
        }
        
        // Check for learned danger zones
        if (AgentLearning.isDangerousZone(this.x + this.vx * 10, this.y + this.vy * 10)) {
            // Steer away from known danger
            this.vx *= -0.5;
            this.vy *= -0.5;
        }
        
        // Standard social forces (goal seeking)
        const decision = this.brain.decide(visuals, this, null, safeHavens, traumaIntensity, mirrorFear, smartObjects, heatmap, null, worldEnv);
        const goalForce = {
            ax: (decision.dx * this.maxSpeed - this.vx) * 0.5,
            ay: (decision.dy * this.maxSpeed - this.vy) * 0.5
        };

        // Fear barrier from heatmap
        let fearBarrierForce = { ax: 0, ay: 0 };
        if (heatmap) {
            const sampleDist = heatmap.res;
            const tLeft = heatmap.getThreat(this.x - sampleDist, this.y);
            const tRight = heatmap.getThreat(this.x + sampleDist, this.y);
            const tUp = heatmap.getThreat(this.x, this.y - sampleDist);
            const tDown = heatmap.getThreat(this.x, this.y + sampleDist);
            fearBarrierForce.ax = (tLeft - tRight) * 5;
            fearBarrierForce.ay = (tUp - tDown) * 5;
        }

        // Social repulsion
        let socialForce = { ax: 0, ay: 0 };
        let cohesionForce = { ax: 0, ay: 0 };
        let neighborCount = 0;
        let centerX = 0, centerY = 0;

        visuals.neighbors.forEach(other => {
            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq) || 0.001;
            const minDist = this.radius + other.radius + 2;

            if (dist < 40) {
                const repulsionScale = 2 * Math.exp((minDist - dist) / 5);
                socialForce.ax += (dx / dist) * repulsionScale;
                socialForce.ay += (dy / dist) * repulsionScale;

                if (dist < minDist) {
                    const pushK = 10;
                    socialForce.ax += (dx / dist) * (minDist - dist) * pushK;
                    socialForce.ay += (dy / dist) * (minDist - dist) * pushK;
                }
            }

            if (dist < 100) {
                centerX += other.x;
                centerY += other.y;
                neighborCount++;
            }
        });

        // Cohesion (herd mentality)
        if (neighborCount > 0 && this.brain.state !== 'PANIC') {
            centerX /= neighborCount;
            centerY /= neighborCount;
            
            const dx = centerX - this.x;
            const dy = centerY - this.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
            
            let cohesionStrength = 0.02;
            if (this.brain.state === 'ANXIOUS') cohesionStrength = 0.05;
            if (this.brain.state === 'ALERT') cohesionStrength = 0.03;
            cohesionStrength *= (1 - this.brain.traits.resilience * 0.3);
            
            cohesionForce.ax = (dx / dist) * cohesionStrength * dist;
            cohesionForce.ay = (dy / dist) * cohesionStrength * dist;
        }

        // Obstacle avoidance
        let obstacleForce = { ax: 0, ay: 0 };
        obstacles.forEach(obs => {
            const nx = Math.max(obs.x, Math.min(this.x, obs.x + obs.w));
            const ny = Math.max(obs.y, Math.min(this.y, obs.y + obs.h));
            const dx = this.x - nx;
            const dy = this.y - ny;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq) || 0.001;
            
            if (dist < this.radius + 10) {
                const repulsionScale = 5 * Math.exp((this.radius - dist) / 2);
                obstacleForce.ax += (dx / dist) * repulsionScale;
                obstacleForce.ay += (dy / dist) * repulsionScale;
            }
            
            // Record as hiding spot if we successfully hid
            if (this.brain.state === 'HIDE' && dist < 5) {
                this.lastHidingSpot = { x: nx, y: ny };
            }
        });

        // Apply all forces
        this.vx += goalForce.ax + socialForce.ax + obstacleForce.ax + cohesionForce.ax + fearBarrierForce.ax;
        this.vy += goalForce.ay + socialForce.ay + obstacleForce.ay + cohesionForce.ay + fearBarrierForce.ay;
    }
    
    detectPredatorType(threats) {
        if (threats.length === 0) return 'UNKNOWN';
        return threats[0].type || 'UNKNOWN';
    }

    getThermalSignature(worldEnv = null) {
        if (this.dead) return 0;
        
        const arousal = (this.brain.currentFear * 1.5) + (this.brain.currentAnger * 1.2);
        let signature = 1.0 + arousal;
        
        if (this.brain.state === 'PANIC' || this.brain.state === 'AGGRESSIVE') signature *= 1.5;
        if (Math.abs(this.vx) + Math.abs(this.vy) < 0.1) signature *= 0.8;
        
        // Hiding reduces thermal signature
        if (this.brain.state === 'HIDE') signature *= 0.6;
        
        const biome = worldEnv ? worldEnv.getBiomeAt(this.x, this.y) : null;
        let masking = 1.0;
        
        if (biome) {
            if (biome.type === 'FOREST') masking = 0.4;
            if (biome.type === 'WATER') masking = 0.1;
        }
        
        return signature * masking;
    }

    update(width, height, visuals, globalMemory, obstacles, safeHavens, traumaIntensity = 0, mirrorFear = 0, smartObjects = null, heatmap = null, socialDynamics = null, worldEnv = null, calibration = null, lodSystem = null, emotionMap = null, counterMeasures = null, tribalMind = null) {
        if (this.dead) return;

        // Apply Strategic Director Sabotage (ANTI_FLEE)
        // GUARD: emotions.maxSpeed is never initialized (only this.maxSpeed is), so a
        // missing value would produce NaN and make the agent vanish. Fall back to baseMaxSpeed.
        const baseMax = isFinite(this.emotions.maxSpeed) ? this.emotions.maxSpeed : this.baseMaxSpeed;
        if (counterMeasures && counterMeasures.ANTI_FLEE > 0) {
            this.maxSpeed = baseMax * (1 - (counterMeasures.ANTI_FLEE * 0.4));
        } else {
            this.maxSpeed = baseMax;
        }

        // Apply Tribal Knowledge (Shared Danger Map)
        if (tribalMind) {
            const tribalFear = tribalMind.getTribalFearAt(this.x, this.y);
            if (tribalFear > 0.5) {
                // Shared caution: Increase fear awareness
                this.brain.currentFear = Math.min(1.0, this.brain.currentFear + (tribalFear * 0.1));
            }
        }
        
        // LOD check
        const profile = lodSystem ? lodSystem.getIntelligenceProfile(this) : 'HIGH_FIDELITY';
        
        if (profile === 'CROWD' && emotionMap) {
            const grad = emotionMap.getFearGradient(this.x, this.y);
            
            const jitter = 0.8;
            const jx = (Math.random() - 0.5) * jitter;
            const jy = (Math.random() - 0.5) * jitter;

            this.vx = (this.vx * 0.98) + (grad.dx * 5.0) + jx;
            this.vy = (this.vy * 0.98) + (grad.dy * 5.0) + jy;
            
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed < 0.2) {
                this.vx += (Math.random() - 0.5) * 0.5;
                this.vy += (Math.random() - 0.5) * 0.5;
            }

            if (speed > this.maxSpeed) {
                this.vx = (this.vx / speed) * this.maxSpeed;
                this.vy = (this.vy / speed) * this.maxSpeed;
            }

            this.x += this.vx;
            this.y += this.vy;
            
            this.emotions.energy -= 0.01;
            const e = emotionMap.getEmotionAt(this.x, this.y);
            this.brain.currentFear = e.fear;
            
            const margin = 80;
            const repulsionStrength = 2.0;
            if (this.x < margin) this.vx += repulsionStrength * (1 - this.x/margin);
            if (this.x > width - margin) this.vx -= repulsionStrength * (1 - (width-this.x)/margin);
            if (this.y < margin) this.vy += repulsionStrength * (1 - this.y/margin);
            if (this.y > height - margin) this.vy -= repulsionStrength * (1 - (height-this.y)/margin);

            this.x = Math.max(0, Math.min(width, this.x));
            this.y = Math.max(0, Math.min(height, this.y));
            return;
        }

        this.globalMemory = globalMemory;
        this.socialDynamics = socialDynamics;
        
        const skipPlanning = (profile === 'TACTICAL');
        if (skipPlanning) {
            this.brain.currentPlan = null;
        }

        this.emotions.energy -= 0.05 + (this.brain.adrenaline * 0.1);
        this.emotions.hunger += 0.02;
        this.emotions.thirst += 0.03;
        this.emotions.boredom += 0.01;
        this.energy = this.emotions.energy;

        if (this.emotions.energy <= 0 || this.emotions.hunger > 100 || this.emotions.thirst > 100) {
            this.dead = true;
            // Record death for learning
            if (this.learningEnabled) {
                AgentLearning.recordDeath(
                    this,
                    this.panicSourceId || 'UNKNOWN',
                    this.stressSurvivalTime,
                    { x: this.x, y: this.y },
                    this.currentStrategy
                );
            }
        }

        const fearDelta = this.brain.currentFear - this.lastFear;
        if (Math.abs(fearDelta) > 0.1) {
            this.memory.inferCausality(fearDelta, visuals, traumaIntensity);
        }
        this.lastFear = this.brain.currentFear;

        this.emotions.fear = this.brain.currentFear;
        this.emotions.anger = this.brain.currentAnger;

        this.highGammaArousal = 30 + (this.brain.currentFear * 70);
        
        const tribeId = socialDynamics ? socialDynamics.tribeMap.get(this.id) : null;
        if (tribeId && globalMemory && globalMemory.getTribalFearAt) {
            const tribalFear = globalMemory.getTribalFearAt(this.x, this.y);
            this.brain.currentFear = Math.max(this.brain.currentFear, tribalFear * 0.8);
            
            const strongestMemory = this.memory.getStrongestMemory();
            if (strongestMemory && strongestMemory.strength > 0.8) {
                const tribe = globalMemory.tribalStrategist.getTribe(tribeId);
                if (tribe) tribe.consolidateMemory(strongestMemory);
            }
        }

        // Track engagement
        const wasEngaged = this.isEngaged;
        this.applySocialForces(visuals, obstacles, safeHavens, traumaIntensity, mirrorFear, smartObjects, heatmap, worldEnv);

        this.x += this.vx;
        this.y += this.vy;

        this.vx *= 0.95;
        this.vy *= 0.95;

        const margin = 80;
        const repulsionStrength = 2.0;
        if (this.x < margin) this.vx += repulsionStrength * (1 - this.x/margin);
        if (this.x > width - margin) this.vx -= repulsionStrength * (1 - (width-this.x)/margin);
        if (this.y < margin) this.vy += repulsionStrength * (1 - this.y/margin);
        if (this.y > height - margin) this.vy -= repulsionStrength * (1 - (height-this.y)/margin);

        this.x = Math.max(0, Math.min(width, this.x));
        this.y = Math.max(0, Math.min(height, this.y));

        if (this.isEngaged && !this.dead) {
            this.stressSurvivalTime++;
        }
        
        // Record successful escape
        if (wasEngaged && !this.isEngaged && this.learningEnabled) {
            this.escapeCount++;
            AgentLearning.recordEscape(
                this,
                this.panicSourceId || 'UNKNOWN',
                this.currentStrategy,
                this.stressSurvivalTime,
                visuals.neighbors
            );
        }

        // Trauma
        if (this.brain.state === 'PANIC' && this.traumaLevel < this.brain.currentFear) {
            this.traumaLevel = Math.min(1, this.brain.currentFear * 0.8);
        }
        
        if (this.traumaLevel > 0) {
            this.traumaLevel *= this.traumaDecayRate;
            if (this.traumaLevel < 0.001) this.traumaLevel = 0;
        }
        
        if (this.traumaLevel > 0.3 && !this.dead) {
            this.brain.currentFear = Math.max(this.brain.currentFear, this.traumaLevel * 0.3);
        }
        
        // Track panic source
        if (visuals.threats.length > 0) {
            this.panicSourceId = visuals.threats[0].type;
        }
    }

    reset(x, y, traits = null, isBigGuy = false, parentId = null) {
        this.x = Number.isNaN(x) ? 0 : x;
        this.y = Number.isNaN(y) ? 0 : y;
        this.radius = isBigGuy ? 15 : 4;
        this.isBigGuy = isBigGuy;
        this.id = LearningAgent.nextId++;
        
        this.parentId = parentId;
        this.generation = parentId ? 0 : 1;
        this.children = [];
        this.familyName = this.generateFamilyName();
        
        this.brain.reset(traits);
        this.energy = 100;
        this.age = 0;
        this.dead = false;
        
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.baseMaxSpeed = isBigGuy ? 1.5 : 3;
        this.maxSpeed = this.baseMaxSpeed;

        this.engagementStartTime = 0;
        this.isEngaged = false;
        this.stressSurvivalTime = 0;
        this.panicSourceId = null;

        this.traumaLevel = 0;
        this.panicEventsSurvived = 0;
        
        // Reset learning state
        this.currentStrategy = 'fleeStraight';
        this.strategyTimer = 0;
        this.lastHidingSpot = null;
        this.escapeCount = 0;
        this.freezeTimer = 0;
    }

    setEngaged() {
        if (!this.isEngaged) {
            this.isEngaged = true;
            this.engagementStartTime = Date.now();
            this.stressSurvivalTime = 0;
        }
    }

    endEngagement() {
        this.isEngaged = false;
    }
}

LearningAgent.nextId = 0;
