/**
 * Predator System for Fear-AI Evolution Simulator
 * Phase 1: Core Tactical Logic (T1.5)
 * 
 * High-performance hunter AI with predictive interception, 
 * squad coordination, and adaptive learning patterns.
 */

// Global learning data storage for predator population
export const PredatorLearning = {
    // Hunt success tracking for adaptive behavior
    huntData: {
        successfulPursuits: 0,
        failedPursuits: 0,
        averageKillTime: 0,
        preyEscapePatterns: new Map(), // prey behavior -> escape direction probabilities
        packFormations: new Map(), // formation type -> success rate
        optimalApproachAngles: new Map() // prey type -> best angle
    },

    // Learn from successful kill
    recordKill(predatorType, huntDuration, preyState, approachAngle, packSize) {
        this.huntData.successfulPursuits++;

        // Update average kill time with exponential moving average
        const alpha = 0.1;
        this.huntData.averageKillTime = 
            (1 - alpha) * this.huntData.averageKillTime + alpha * huntDuration;

        // Record successful pack formation
        const formationKey = `pack_${packSize}`;
        const currentSuccess = this.huntData.packFormations.get(formationKey) || 0;
        this.huntData.packFormations.set(formationKey, currentSuccess + 1);

        // Record optimal approach angle for prey state
        if (!this.huntData.optimalApproachAngles.has(preyState)) {
            this.huntData.optimalApproachAngles.set(preyState, []);
        }
        this.huntData.optimalApproachAngles.get(preyState).push(approachAngle);
    },

    // Learn from failed pursuit
    recordEscape(preyState, escapeDirection) {
        this.huntData.failedPursuits++;

        if (!this.huntData.preyEscapePatterns.has(preyState)) {
            this.huntData.preyEscapePatterns.set(preyState, { count: 0, directions: [] });
        }
        const data = this.huntData.preyEscapePatterns.get(preyState);
        data.count++;
        data.directions.push(escapeDirection);

        // Keep only last 100 directions for memory efficiency
        if (data.directions.length > 100) data.directions.shift();
    },

    // Get learned prediction of where prey will flee
    predictEscapeDirection(preyState) {
        const data = this.huntData.preyEscapePatterns.get(preyState);
        if (!data || data.directions.length < 3) return null;

        // Average the last escape directions
        const recent = data.directions.slice(-10);
        const avgX = recent.reduce((s, d) => s + Math.cos(d), 0) / recent.length;
        const avgY = recent.reduce((s, d) => s + Math.sin(d), 0) / recent.length;
        return Math.atan2(avgY, avgX);
    },

    // Get optimal approach angle based on learned data
    getOptimalAngle(preyState) {
        const angles = this.huntData.optimalApproachAngles.get(preyState);
        if (!angles || angles.length < 5) return null;

        // Return most successful angle (circular mean)
        const recent = angles.slice(-20);
        const sinSum = recent.reduce((s, a) => s + Math.sin(a), 0);
        const cosSum = recent.reduce((s, a) => s + Math.cos(a), 0);
        return Math.atan2(sinSum / recent.length, cosSum / recent.length);
    },

    // Get best pack size from learned data
    getOptimalPackSize() {
        let bestSize = 3; // default
        let bestSuccess = 0;

        for (const [formation, success] of this.huntData.packFormations) {
            if (success > bestSuccess) {
                bestSuccess = success;
                bestSize = parseInt(formation.replace('pack_', ''));
            }
        }
        return bestSize;
    },

    // Export learning data for analysis
    exportData() {
        return {
            huntStats: {
                successfulPursuits: this.huntData.successfulPursuits,
                failedPursuits: this.huntData.failedPursuits,
                successRate: this.huntData.successfulPursuits / 
                    Math.max(1, this.huntData.successfulPursuits + this.huntData.failedPursuits),
                averageKillTime: this.huntData.averageKillTime
            },
            packFormations: Object.fromEntries(this.huntData.packFormations),
            preyEscapePatterns: Object.fromEntries(
                Array.from(this.huntData.preyEscapePatterns).map(([k, v]) => [k, v.count])
            )
        };
    },

    reset() {
        this.huntData.successfulPursuits = 0;
        this.huntData.failedPursuits = 0;
        this.huntData.averageKillTime = 0;
        this.huntData.preyEscapePatterns.clear();
        this.huntData.packFormations.clear();
        this.huntData.optimalApproachAngles.clear();
    }
};

export const PREDATOR_TYPES = {
    TANK: {
        name: 'TANK',
        radius: 12,
        speed: 1.8,
        fearRadius: 150,
        fearIntensity: 0.8,
        color: '#ff0055',
        glowColor: '#ff0033',
        behavior: 'CHASE',
        signature: 'Relentless Juggernaut - Hard to escape, impossible to hide from'
    },
    STALKER: {
        name: 'STALKER',
        radius: 8,
        speed: 2.5,
        fearRadius: 120,
        fearIntensity: 1.0,
        color: '#9d00ff',
        glowColor: '#d800ff',
        behavior: 'AMBUSH',
        signature: 'The Shadow - Waits in silence, strikes with extreme speed'
    },
    SWARMER: {
        name: 'SWARMER',
        radius: 5,
        speed: 3.2,
        fearRadius: 80,
        fearIntensity: 0.6,
        color: '#00ff88',
        glowColor: '#00ffaa',
        behavior: 'PACK',
        signature: 'Death by 1000 Cuts - Many weak threats that overwhelm collectively'
    }
};

export class Predator {
    constructor(x, y, type = 'TANK') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.config = PREDATOR_TYPES[type] || PREDATOR_TYPES.TANK;

        this.radius = this.config.radius;
        this.maxSpeed = this.config.speed;
        this.vx = 0;
        this.vy = 0;

        this.id = Predator.nextId++;
        this.isPredator = true;

        // Behavior state
        this.state = 'IDLE';
        this.targetAgent = null;
        this.ambushTimer = 0;
        this.ambushWaitTime = 60 + Math.random() * 120;

        // Squad Coordination (Phase 16)
        this.squadRole = 'SOLO';
        this.squadLead = null;

        // Visual pulse
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.personalSuccessCount = 0;
        this.huntStartTime = Date.now();
    }

    /**
     * Update predator behavior
     */
    update(agents, width, height, allPredators = [], spatialHash = null) {
        this.pulsePhase += 0.1;
        
        // Phase 16: Squad Coordination
        this.updateSquadLogic(allPredators);

        // Use spatial hash for O(1) target queries
        const detectionRange = this.config.fearRadius * 2;
        const targets = spatialHash ? spatialHash.query(this.x, this.y, detectionRange) : agents;

        switch (this.config.behavior) {
            case 'CHASE':
                this.updateChase(targets);
                break;
            case 'AMBUSH':
                this.updateAmbush(targets);
                break;
            case 'PACK':
                this.updatePackOptimized(targets);
                break;
        }

        // Apply velocity
        this.x += this.vx;
        this.y += this.vy;

        // Damping
        this.vx *= 0.92;
        this.vy *= 0.92;

        // Bounds checking
        if (this.x < this.radius || this.x > width - this.radius) {
            this.vx *= -1;
            this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
        }
        if (this.y < this.radius || this.y > height - this.radius) {
            this.vy *= -1;
            this.y = Math.max(this.radius, Math.min(height - this.radius, this.y));
        }
    }

    updateSquadLogic(allPredators) {
        let nearestPred = null;
        let minDistSq = 40000; // 200px limit
        
        for (const other of allPredators) {
            if (other === this) continue;
            const dSq = (other.x - this.x)**2 + (other.y - this.y)**2;
            if (dSq < minDistSq) {
                minDistSq = dSq;
                nearestPred = other;
            }
        }

        if (nearestPred) {
            if (this.id < nearestPred.id) {
                this.squadRole = 'LEAD';
                this.squadLead = null;
            } else {
                this.squadRole = 'FLANKER';
                this.squadLead = nearestPred;
            }
        } else {
            this.squadRole = 'SOLO';
            this.squadLead = null;
        }
    }

    updateChase(targets) {
        let nearest = this.findNearestTarget(targets);

        if (nearest) {
            const dx = nearest.x - this.x;
            const dy = nearest.y - this.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // PREDICTIVE INTERCEPTION
            const predictedEscape = PredatorLearning.predictEscapeDirection(nearest.brain?.state || 'CALM');
            let targetX = nearest.x;
            let targetY = nearest.y;
            
            if (predictedEscape !== null && dist > 50) {
                const interceptDistance = Math.min(dist * 0.3, 30);
                targetX += Math.cos(predictedEscape) * interceptDistance;
                targetY += Math.sin(predictedEscape) * interceptDistance;
            }

            // Squad Flanking
            if (this.squadRole === 'FLANKER' && this.squadLead) {
                const angle = Math.atan2(targetY - this.squadLead.y, targetX - this.squadLead.x);
                const flankAngle = angle + (this.id % 2 === 0 ? 0.6 : -0.6);
                targetX = this.squadLead.x + Math.cos(flankAngle) * dist;
                targetY = this.squadLead.y + Math.sin(flankAngle) * dist;
            }
            
            const adx = targetX - this.x;
            const ady = targetY - this.y;
            const adist = Math.sqrt(adx*adx + ady*ady);
            
            if (adist > 0) {
                const speedMultiplier = this.personalSuccessCount > 5 ? 0.25 : 0.15;
                this.vx += (adx / adist) * speedMultiplier;
                this.vy += (ady / adist) * speedMultiplier;
            }

            this.state = dist < 100 ? 'CHARGING' : 'CHASING';
        } else {
            this.state = 'IDLE';
        }
    }

    updateAmbush(targets) {
        let nearest = this.findNearestTarget(targets);
        const distSq = nearest ? (nearest.x - this.x)**2 + (nearest.y - this.y)**2 : Infinity;

        if (this.state === 'AMBUSH_WAIT') {
            this.vx *= 0.5;
            this.vy *= 0.5;
            this.ambushTimer++;
            
            if (nearest && distSq < 10000 && this.ambushTimer > this.ambushWaitTime) {
                this.state = 'CHARGING';
                this.ambushTimer = 0;
            }
        } else {
            this.updateChase(targets);
            if (!nearest || distSq > 40000) {
                this.state = 'AMBUSH_WAIT';
            }
        }
    }

    updatePackOptimized(targets) {
        this.updateChase(targets);
        // Add minor pack cohesion
        if (this.squadLead) {
            const dx = this.squadLead.x - this.x;
            const dy = this.squadLead.y - this.y;
            const dSq = dx*dx + dy*dy;
            if (dSq > 2500) {
                this.vx += (dx / Math.sqrt(dSq)) * 0.05;
                this.vy += (dy / Math.sqrt(dSq)) * 0.05;
            }
        }
    }

    findNearestTarget(targets) {
        let nearest = null;
        let minDistSq = Infinity;
        for (let i = 0; i < targets.length; i++) {
            const a = targets[i];
            if (!a || a.isPredator || a.dead) continue;
            const dSq = (a.x - this.x)**2 + (a.y - this.y)**2;
            if (dSq < minDistSq) {
                minDistSq = dSq;
                nearest = a;
            }
        }
        return nearest;
    }

    checkKills(agents, analytics, logger, spatialHash) {
        const killRadius = this.radius + 10;
        const targets = spatialHash ? spatialHash.query(this.x, this.y, killRadius) : agents;

        for (let i = 0; i < targets.length; i++) {
            const agent = targets[i];
            if (!agent || agent.isPredator || agent.dead) continue;

            const dx = agent.x - this.x;
            const dy = agent.y - this.y;
            if (dx*dx + dy*dy < killRadius * killRadius) {
                // Record learning data
                const huntDuration = (Date.now() - this.huntStartTime) / 1000;
                const preyState = agent.brain?.state || 'CALM';
                const angle = Math.atan2(dy, dx);
                const packSize = 1 + (this.squadLead ? 1 : 0);
                
                PredatorLearning.recordKill(this.type, huntDuration, preyState, angle, packSize);
                
                agent.dead = true;
                agent.deathCause = 'predation';
                agent.deathBy = this.type;
                this.personalSuccessCount++;
                this.huntStartTime = Date.now(); // Reset for next hunt
                
                analytics.history.deathCauses.predation++;
                logger.log('PREDATOR_KILL', {
                    predatorId: this.id,
                    predatorType: this.type,
                    agentId: agent.id,
                    x: Math.floor(agent.x),
                    y: Math.floor(agent.y)
                });
            }
        }
    }

    static calculatePackData(predators) {
        // Shared pack state for coordination
    }

    getFearProperties() {
        return {
            radius: this.config.fearRadius,
            intensity: this.config.fearIntensity,
            type: this.config.name
        };
    }
}

Predator.nextId = 0;
