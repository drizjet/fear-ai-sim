import { Brain } from './brain.js';
import { MemorySystem } from './memorysystem.js';

export class Agent {
    constructor(x, y, traits = null, isBigGuy = false, parentId = null) {
        this.x = x;
        this.y = y;
        this.radius = isBigGuy ? 15 : 4;
        this.isBigGuy = isBigGuy;
        this.id = Agent.nextId++;
        
        // Family Tree / Lineage
        this.parentId = parentId;
        this.generation = parentId ? 0 : 1; // Set during evolution
        this.children = [];
        this.familyName = this.generateFamilyName();
        
        this.brain = new Brain(traits);
        this.memory = new MemorySystem(); 
        this.lastFear = 0;
        
        // Phase 2.4: 6-State Emotion Model (V.A.I.L.)
        this.emotions = {
            fear: 0,      // Fight/flight
            anger: 0,     // Aggression
            energy: 100,  // Action capability
            hunger: 0,    // Foraging motivation
            thirst: 0,    // Water seeking
            boredom: 0    // Exploration drive
        };
        
        this.energy = 100; // Legacy support
        this.age = 0;
        this.dead = false;
        
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.maxSpeed = isBigGuy ? 1.5 : 3;
        this.baseMaxSpeed = this.maxSpeed;

        // Engagement Metrics
        this.engagementStartTime = 0;
        this.isEngaged = false;
        this.stressSurvivalTime = 0;
        this.panicSourceId = null;

        // Trauma Memory System
        this.traumaLevel = 0;           // 0-1 persistent fear from past events
        this.traumaDecayRate = 0.9995;  // Very slow recovery
        this.panicEventsSurvived = 0;   // Count of survived panic events
    }

    /**
     * Generate a procedural family name based on agent traits
     */
    generateFamilyName() {
        const prefixes = ['Fear', 'Brave', 'Swift', 'Wise', 'Bold', 'Keen', 'Iron', 'Silent', 'Shadow', 'Bright'];
        const suffixes = ['heart', 'mind', 'walker', 'seeker', 'guard', 'born', 'dweller', 'weaver', 'hunter', 'spirit'];
        
        // Deterministic based on ID for consistency
        const prefix = prefixes[this.id % prefixes.length];
        const suffix = suffixes[(this.id * 7) % suffixes.length];
        return `${prefix}${suffix}`;
    }

    /**
     * Get lineage information for display
     */
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
     * Helbing's Social Force Model implementation
     * F = F_goal + F_social + F_obstacle + F_cohesion (Herd Mentality)
     */
    applySocialForces(visuals, obstacles, safeHavens, traumaIntensity = 0, mirrorFear = 0, smartObjects = null, heatmap = null, worldEnv = null) {
        // 1. Goal Force (Driving force towards intended direction)
        const decision = this.brain.decide(visuals, this, this.globalMemory, safeHavens, traumaIntensity, mirrorFear, smartObjects, heatmap, this.socialDynamics, worldEnv);
        const goalForce = {
            ax: (decision.dx * this.maxSpeed - this.vx) * 0.5,
            ay: (decision.dy * this.maxSpeed - this.vy) * 0.5
        };

        // Phase 11: Fear Barrier Function (T11.2)
        // Pseudo-barrier around danger using heatmap gradient
        let fearBarrierForce = { ax: 0, ay: 0 };
        if (heatmap) {
            const sampleDist = heatmap.res;
            const tLeft = heatmap.getThreat(this.x - sampleDist, this.y);
            const tRight = heatmap.getThreat(this.x + sampleDist, this.y);
            const tUp = heatmap.getThreat(this.x, this.y - sampleDist);
            const tDown = heatmap.getThreat(this.x, this.y + sampleDist);

            // Negative gradient (move away from higher threat)
            fearBarrierForce.ax = (tLeft - tRight) * 5;
            fearBarrierForce.ay = (tUp - tDown) * 5;
        }

        // 2. Social Repulsion Force (Avoid bumping into others)

        let socialForce = { ax: 0, ay: 0 };
        let cohesionForce = { ax: 0, ay: 0 };  // Herd mentality - seek group center
        let neighborCount = 0;
        let centerX = 0, centerY = 0;

        visuals.neighbors.forEach(other => {
            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq) || 0.001;
            const minDist = this.radius + other.radius + 2;

            // Phase 7: Tribal Hostility (T7.5)
            // Rival tribes push each other away
            const hostility = this.socialDynamics?.getTribalHostility(this.id, other.id) || 0;
            if (hostility > 0.3 && dist < 100) {
                const tribalRepulsion = hostility * 2;
                socialForce.ax += (dx / dist) * tribalRepulsion;
                socialForce.ay += (dy / dist) * tribalRepulsion;
            }

            if (dist < 40) {
                // Exponential repulsion
                const repulsionScale = 2 * Math.exp((minDist - dist) / 5);
                socialForce.ax += (dx / dist) * repulsionScale;
                socialForce.ay += (dy / dist) * repulsionScale;

                // Physical body force (pushing) - only if touching
                if (dist < minDist) {
                    const pushK = 10;
                    socialForce.ax += (dx / dist) * (minDist - dist) * pushK;
                    socialForce.ay += (dy / dist) * (minDist - dist) * pushK;
                }
            }

            // Herd Mentality: Calculate neighbor center for cohesion
            if (dist < 100) {
                centerX += other.x;
                centerY += other.y;
                neighborCount++;
            }
        });

        // 2b. Cohesion Force (Herd Mentality)
        if (neighborCount > 0 && this.brain.state !== 'PANIC') {
            // In panic, agents scatter; otherwise they seek safety in groups
            centerX /= neighborCount;
            centerY /= neighborCount;
            
            const dx = centerX - this.x;
            const dy = centerY - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq) || 0.001;
            
            if (dist > 0) {
                // Cohesion strength varies by state
                let cohesionStrength = 0.02; // Base cohesion
                if (this.brain.state === 'ANXIOUS') cohesionStrength = 0.05; // More cohesion when anxious
                if (this.brain.state === 'ALERT') cohesionStrength = 0.03;
                
                // Resilient agents are more independent
                cohesionStrength *= (1 - this.brain.traits.resilience * 0.3);
                
                cohesionForce.ax = (dx / dist) * cohesionStrength * dist; // Stronger when farther
                cohesionForce.ay = (dy / dist) * cohesionStrength * dist;
            }
        } else if (neighborCount === 0 && this.brain.state !== 'PANIC') {
            // Isolation anxiety - seek any neighbor when alone
            cohesionForce.ax = (Math.random() - 0.5) * 0.1;
            cohesionForce.ay = (Math.random() - 0.5) * 0.1;
        } else if (this.brain.state === 'PANIC') {
            // In panic, agents scatter (negative cohesion)
            if (neighborCount > 0) {
                centerX /= neighborCount;
                centerY /= neighborCount;
                const dx = this.x - centerX;
                const dy = this.y - centerY;
                const distSq = dx*dx + dy*dy;
                const dist = Math.sqrt(distSq) || 0.001;
                if (dist > 0) {
                    cohesionForce.ax = (dx / dist) * 0.1; // Scatter from group
                    cohesionForce.ay = (dy / dist) * 0.1;
                }
            }
        }

        // 3. Obstacle Force
        let obstacleForce = { ax: 0, ay: 0 };
        obstacles.forEach(obs => {
            // Find nearest point on rectangle
            const nx = Math.max(obs.x, Math.min(this.x, obs.x + obs.w));
            const ny = Math.max(obs.y, Math.min(this.y, obs.y + obs.h));
            const dx = this.x - nx;
            const dy = this.y - ny;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq) || 0.001;
            
            // Phase 10: Logical Animation States (T10.4)
            // Agents vaulting or crawling bypass standard obstacle repulsion
            if (dist < this.radius + 10 && this.brain.state !== 'VAULTING' && this.brain.state !== 'CRAWLING') {
                const repulsionScale = 5 * Math.exp((this.radius - dist) / 2);
                obstacleForce.ax += (dx / dist) * repulsionScale;
                obstacleForce.ay += (dy / dist) * repulsionScale;
            }
        });

        // Apply all forces (including cohesion/herd mentality)
        this.vx += goalForce.ax + socialForce.ax + obstacleForce.ax + cohesionForce.ax;
        this.vy += goalForce.ay + socialForce.ay + obstacleForce.ay + cohesionForce.ay;
    }

    /**
     * Phase 14: Tactical Thermal Signature (Metabolic Heat)
     * Calculates signature based on arousal (Fear + Anger) and environment.
     */
    getThermalSignature(worldEnv = null, counterMeasures = null) {
        if (this.dead) return 0;

        // Base metabolic heat from arousal
        const arousal = (this.brain.currentFear * 1.5) + (this.brain.currentAnger * 1.2);
        let signature = 1.0 + arousal;

        // Apply Strategic Director Sabotage (ANTI_HIDE)
        // If agents are hiding too well, the director forces their thermal signature up
        if (counterMeasures && counterMeasures.ANTI_HIDE > 0) {
            signature += counterMeasures.ANTI_HIDE * 2.0;
        }

        // State multipliers
        if (this.brain.state === 'PANIC' || this.brain.state === 'AGGRESSIVE') signature *= 1.5;
        if (Math.abs(this.vx) + Math.abs(this.vy) < 0.1) signature *= 0.8; // Idle cooling

        // Environmental Masking (M)
        const biome = worldEnv ? worldEnv.getBiomeAt(this.x, this.y) : null;
        let masking = 1.0;

        if (biome) {
            if (biome.type === 'FOREST') masking = 0.4; // 60% occlusion
            if (biome.type === 'WATER') masking = 0.1;  // Thermal sink
        }

        return signature * masking;
    }

    update(width, height, visuals, globalMemory, obstacles, safeHavens, traumaIntensity = 0, mirrorFear = 0, smartObjects = null, heatmap = null, socialDynamics = null, worldEnv = null, calibration = null, lodSystem = null, emotionMap = null, counterMeasures = null, tribalMind = null) {
        if (this.dead) return;

        // Apply Tribal Knowledge (Shared Danger Map)
        if (tribalMind) {
            const tribalFear = tribalMind.getTribalFearAt(this.x, this.y);
            if (tribalFear > 0.5) {
                // Shared caution: Slow down and increase fear awareness
                this.brain.currentFear = Math.min(1.0, this.brain.currentFear + (tribalFear * 0.1));
            }
        }
        
        // Apply Strategic Director Sabotage (ANTI_FLEE)
        // If agents are fleeing too well, the director artificially slows them down via fatigue
        if (counterMeasures && counterMeasures.ANTI_FLEE > 0) {
            // Guard: emotions has no maxSpeed field — fall back to the agent's own maxSpeed to avoid NaN poisoning
            const baseMaxSpeed = (typeof this.emotions?.maxSpeed === 'number' && isFinite(this.emotions.maxSpeed))
                ? this.emotions.maxSpeed
                : (isFinite(this.maxSpeed) ? this.maxSpeed : 3);
            this.maxSpeed = baseMaxSpeed * (1 - (counterMeasures.ANTI_FLEE * 0.4));
        } else {
            this.maxSpeed = this.baseMaxSpeed;
        }

        // Phase 12.3: LOD 2.0 Intelligence Gating
        const profile = lodSystem ? lodSystem.getIntelligenceProfile(this) : 'HIGH_FIDELITY';
        
        if (profile === 'CROWD' && emotionMap) {
            // Mean-Field Fluid Movement (O(1))
            const grad = emotionMap.getFearGradient(this.x, this.y);
            
            // Add Base Forward Momentum + Kinetic Jitter
            // This ensures they don't spin/stuck when trying to move
            const jitter = 0.8;
            const jx = (Math.random() - 0.5) * jitter;
            const jy = (Math.random() - 0.5) * jitter;

            // Apply forces with momentum retention (0.98)
            this.vx = (this.vx * 0.98) + (grad.dx * 5.0) + jx;
            this.vy = (this.vy * 0.98) + (grad.dy * 5.0) + jy;
            
            // Ensure they always have a tiny bit of speed to prevent spinning
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed < 0.2) {
                this.vx += (Math.random() - 0.5) * 0.5;
                this.vy += (Math.random() - 0.5) * 0.5;
            }

            // Cap at maxSpeed
            if (speed > this.maxSpeed) {
                this.vx = (this.vx / speed) * this.maxSpeed;
                this.vy = (this.vy / speed) * this.maxSpeed;
            }

            // Move Position (ALWAYS happens every frame)
            this.x += this.vx;
            this.y += this.vy;
            
            // Minimal metabolic update
            this.emotions.energy -= 0.01;
            const e = emotionMap.getEmotionAt(this.x, this.y);
            this.brain.currentFear = e.fear;
            // Bounds check with Soft Repulsion (Prevent bunching)
            // Phase 15: Strengthened repulsion forces (T15.4)
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

        this.globalMemory = globalMemory; // Context for brain
        this.socialDynamics = socialDynamics; // Context for tribal check
        
        // TACTICAL LOD skips planning
        const skipPlanning = (profile === 'TACTICAL');
        if (skipPlanning) {
            this.brain.currentPlan = null; // Flush complex plans
        }

        // Update 6-State Metabolism (Phase 2.4)
        this.emotions.energy -= 0.05 + (this.brain.adrenaline * 0.1);
        this.emotions.hunger += 0.02;
        this.emotions.thirst += 0.03;
        this.emotions.boredom += 0.01;
        this.energy = this.emotions.energy; // Sync legacy

        if (this.emotions.energy <= 0 || this.emotions.hunger > 100 || this.emotions.thirst > 100) {
            this.dead = true;
        }

        // Phase 13 Nuance: Causal Reasoning (T13.7)
        const fearDelta = this.brain.currentFear - this.lastFear;
        if (Math.abs(fearDelta) > 0.1) {
            this.memory.inferCausality(fearDelta, visuals, traumaIntensity);
        }
        this.lastFear = this.brain.currentFear;

        // Sync Brain PAD states to V.A.I.L. emotions
        this.emotions.fear = this.brain.currentFear;
        this.emotions.anger = this.brain.currentAnger;

        // Phase 15.1: Right Temporal High Gamma Sync (30-100Hz)
        // Map arousal directly to the neuro-spectral "Ground Truth"
        this.highGammaArousal = 30 + (this.brain.currentFear * 70);
        
        // Phase 15.2: Shared Tribal Memory Access
        const tribeId = socialDynamics ? socialDynamics.tribeMap.get(this.id) : null;
        if (tribeId && globalMemory && globalMemory.getTribalFearAt) {
            const tribalFear = globalMemory.getTribalFearAt(this.x, this.y);
            this.brain.currentFear = Math.max(this.brain.currentFear, tribalFear * 0.8);
            
            // Consolidate current individual memory into the tribe
            const strongestMemory = this.memory.getStrongestMemory();
            if (strongestMemory && strongestMemory.strength > 0.8) {
                const tribe = globalMemory.tribalStrategist.getTribe(tribeId);
                if (tribe) tribe.consolidateMemory(strongestMemory);
            }
        }

        // Physical Update (Goal seeking + Social Forces)
        this.applySocialForces(visuals, obstacles, safeHavens, traumaIntensity, mirrorFear, smartObjects, heatmap, worldEnv);

        // Move Position (ALWAYS happens every frame)
        this.x += this.vx;
        this.y += this.vy;

        // Friction / Damping (less friction when fleeing so they can actually escape)
        const fleeMultiplier = (this.brain.state === 'PANIC' || this.brain.state === 'AGGRESSIVE') ? 0.98 : 0.95;
        this.vx *= fleeMultiplier;
        this.vy *= fleeMultiplier;
        
        // Prevent spinning - ensure minimum speed when threatened
        if (this.brain.currentFear > 0.3) {
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed < 0.5 && speed > 0) {
                this.vx = (this.vx / speed) * 0.5;
                this.vy = (this.vy / speed) * 0.5;
            }
        }

        // Phase 15: Soft Wall Repulsion (Prevent border bunching)
        // Strengthened gradient-based repulsion (T15.4)
        const margin = 80;
        const repulsionStrength = 2.0;
        if (this.x < margin) this.vx += repulsionStrength * (1 - this.x/margin);
        if (this.x > width - margin) this.vx -= repulsionStrength * (1 - (width-this.x)/margin);
        if (this.y < margin) this.vy += repulsionStrength * (1 - this.y/margin);
        if (this.y > height - margin) this.vy -= repulsionStrength * (1 - (height-this.y)/margin);

        // Hard Bounds Clamp
        this.x = Math.max(0, Math.min(width, this.x));
        this.y = Math.max(0, Math.min(height, this.y));

        // Increment survival ticker if engaged
        if (this.isEngaged && !this.dead) {
            this.stressSurvivalTime++;
        }

        // Trauma Memory System
        // If agent was in panic and is now recovering, accumulate trauma
        if (this.brain.state === 'PANIC' && this.traumaLevel < this.brain.currentFear) {
            this.traumaLevel = Math.min(1, this.brain.currentFear * 0.8);
        }
        
        // Slowly decay trauma over time (very slow - PTSD-like persistence)
        if (this.traumaLevel > 0) {
            this.traumaLevel *= this.traumaDecayRate;
            if (this.traumaLevel < 0.001) this.traumaLevel = 0;
        }
        
        // Trauma affects baseline fear - traumatized agents startle more easily
        if (this.traumaLevel > 0.3 && !this.dead) {
            this.brain.currentFear = Math.max(this.brain.currentFear, this.traumaLevel * 0.3);
        }
    }

    /**
     * Reset agent state for reuse in ObjectPool
     */
    reset(x, y, traits = null, isBigGuy = false, parentId = null) {
        this.x = Number.isNaN(x) ? 0 : x;
        this.y = Number.isNaN(y) ? 0 : y;
        this.radius = isBigGuy ? 15 : 4;
        this.isBigGuy = isBigGuy;
        this.id = Agent.nextId++;
        
        this.parentId = parentId;
        this.generation = parentId ? 0 : 1;
        this.children = [];
        this.familyName = this.generateFamilyName();
        
        this.brain.reset(traits);
        this.energy = 100;
        this.age = 0;
        this.dead = false;
        
        const rx = Math.random() - 0.5;
        const ry = Math.random() - 0.5;
        this.vx = rx * 2;
        this.vy = ry * 2;
        this.maxSpeed = isBigGuy ? 1.5 : 3;
        this.baseMaxSpeed = this.maxSpeed;

        this.engagementStartTime = 0;
        this.isEngaged = false;
        this.stressSurvivalTime = 0;
        this.panicSourceId = null;

        this.traumaLevel = 0;
        this.panicEventsSurvived = 0;
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

Agent.nextId = 0;
