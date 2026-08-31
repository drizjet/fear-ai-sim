/**
 * Strategic Director System
 * Phase 6: Research-Driven Advanced Systems (T6.1, T6.2)
 * 
 * Inspired by Alien: Isolation and Left 4 Dead
 * Manages high-level orchestration, job assignment, and coordination roles.
 */

export class StrategicDirector {
    constructor(simulation) {
        this.simulation = simulation;
        this.activeJobs = new Map(); // JobID -> { agents: Set, target: obj, type: string }
        this.pacingState = 'BUILDUP'; // BuildUp, Peak, Relax, Fade
        this.pacingTimer = 0;
        
        // Phase 10/11: Native Backend Integration (Tauri)
        this.isNative = !!window.__TAURI__;
        this.tauriMultipliers = null;

        // Learning Illusion Tracking (T7.4)
        this.strategyStats = {
            HIDE: { usage: 0, success: 0 },
            FLEE: { usage: 0, success: 0 }
        };
        this.counterMeasures = {
            ANTI_HIDE: 0, // 0-1 intensity
            ANTI_FLEE: 0
        };

        this.pacingConfig = {
            BUILDUP: 600, // 10 seconds at 60fps
            PEAK: 300,
            RELAX: 600,
            FADE: 300
        };
    }

    async update() {
        this.pacingTimer++;
        this.updatePacing();
        this.processJobs();
        this.cleanupJobs();

        // Phase 10/11: Native Command Invoke (Tauri)
        // Only attempt invoke if we are running in a verified Tauri context
        if (this.isNative && this.pacingTimer % 60 === 0) {
            try {
                if (window.__TAURI__ && window.__TAURI__.invoke) {
                    this.tauriMultipliers = await window.__TAURI__.invoke('get_rust_multipliers', { pacingState: this.pacingState });
                }
            } catch (e) {
                // Silently disable native mode on first failure to prevent loop hang
                this.isNative = false;
                console.warn('[DIRECTOR] Native environment detected but call failed. Falling back to Software Mode.', e);
            }
        }
    }

    /**
     * Update high-level session pacing (L4D style)
     */
    updatePacing() {
        const threshold = this.pacingConfig[this.pacingState];
        if (this.pacingTimer > threshold) {
            this.pacingTimer = 0;
            switch(this.pacingState) {
                case 'BUILDUP': this.pacingState = 'PEAK'; break;
                case 'PEAK': this.pacingState = 'RELAX'; break;
                case 'RELAX': this.pacingState = 'FADE'; break;
                case 'FADE': this.pacingState = 'BUILDUP'; break;
            }
            console.log(`[DIRECTOR] Pacing shifted to: ${this.pacingState}`);
        }
    }

    /**
     * Assign roles to a group of agents for a specific event (T6.2)
     */
    assignRoleBasedInvestigation(eventLocation, nearAgents) {
        if (nearAgents.length === 0) return;

        // Sort by distance
        nearAgents.sort((a, b) => {
            const distA = Math.hypot(a.x - eventLocation.x, a.y - eventLocation.y);
            const distB = Math.hypot(b.x - eventLocation.x, b.y - eventLocation.y);
            return distA - distB;
        });

        const jobId = `investigate_${Date.now()}`;
        const job = {
            id: jobId,
            type: 'INVESTIGATION',
            location: eventLocation,
            agents: new Set()
        };

        // Lead Investigator (Closest)
        const leader = nearAgents[0];
        leader.brain.setRole('LEAD_INVESTIGATOR', { target: eventLocation, jobId });
        job.agents.add(leader.id);

        // Back-Watchers (Next 2 closest)
        for (let i = 1; i < Math.min(3, nearAgents.length); i++) {
            const watcher = nearAgents[i];
            watcher.brain.setRole('BACK_WATCHER', { leaderId: leader.id, jobId });
            job.agents.add(watcher.id);
        }

        this.activeJobs.set(jobId, job);
        return jobId;
    }

    /**
     * Strategic control over simulation parameters based on pacing
     */
    getStrategicMultipliers() {
        // Favor Rust-calculated multipliers if available (Native Performance)
        if (this.tauriMultipliers) {
            return {
                intensity: this.tauriMultipliers.intensity,
                spawnRate: this.tauriMultipliers.spawn_rate,
                fearDecay: this.tauriMultipliers.fear_decay
            };
        }

        switch(this.pacingState) {
            case 'PEAK': return { intensity: 1.5, spawnRate: 2.0, fearDecay: 0.98 };
            case 'RELAX': return { intensity: 0.5, spawnRate: 0.2, fearDecay: 0.90 };
            default: return { intensity: 1.0, spawnRate: 1.0, fearDecay: 0.95 };
        }
    }

    /**
     * Record usage and success of agent strategies (T7.4)
     */
    recordStrategyEvent(strategy, success) {
        if (!this.strategyStats[strategy]) return;
        
        this.strategyStats[strategy].usage++;
        if (success) this.strategyStats[strategy].success++;
        
        // Periodically update counter-measures
        if ((this.strategyStats.HIDE.usage + this.strategyStats.FLEE.usage) % 50 === 0) {
            this.updateCounterMeasures();
        }
    }

    /**
     * Apply the "Learning Illusion" (T7.4)
     * If agents are succeeding too much with one strategy, increase counter-measures
     */
    updateCounterMeasures() {
        const hideSuccessRate = this.strategyStats.HIDE.usage > 0 ? 
            this.strategyStats.HIDE.success / this.strategyStats.HIDE.usage : 0;
        
        const fleeSuccessRate = this.strategyStats.FLEE.usage > 0 ? 
            this.strategyStats.FLEE.success / this.strategyStats.FLEE.usage : 0;

        // Increase ANTI_HIDE if HIDE is too effective (>70%)
        if (hideSuccessRate > 0.7) {
            this.counterMeasures.ANTI_HIDE = Math.min(1.0, this.counterMeasures.ANTI_HIDE + 0.1);
            console.log(`[DIRECTOR] Agents hiding too effectively. Increasing ANTI_HIDE: ${this.counterMeasures.ANTI_HIDE.toFixed(2)}`);
        } else {
            this.counterMeasures.ANTI_HIDE *= 0.95; // Decay
        }

        // Increase ANTI_FLEE if FLEE is too effective
        if (fleeSuccessRate > 0.7) {
            this.counterMeasures.ANTI_FLEE = Math.min(1.0, this.counterMeasures.ANTI_FLEE + 0.1);
            console.log(`[DIRECTOR] Agents fleeing too effectively. Increasing ANTI_FLEE: ${this.counterMeasures.ANTI_FLEE.toFixed(2)}`);
        } else {
            this.counterMeasures.ANTI_FLEE *= 0.95; // Decay
        }
    }

    /**
     * Get active counter-measures for simulation logic
     */
    getCounterMeasures() {
        return this.counterMeasures;
    }

    /**
     * Generative Scenario Evolution (T9.4)
     * Evaluates tribe performance and mutates the environment to challenge them.
     */
    evaluateGenerativeEvolution(generation, agents) {
        if (generation < 3) return; // Need history

        // Calculate survival rate per tribe
        const tribeCounts = new Map();
        agents.forEach(a => {
            const tribe = this.simulation.socialDynamics.tribeMap.get(a.id);
            if (tribe) {
                tribeCounts.set(tribe, (tribeCounts.get(tribe) || 0) + 1);
            }
        });

        // Find over-performing tribes
        tribeCounts.forEach((count, tribe) => {
            // Arbitrary threshold for "over-performing" in a population of 2000
            if (count > 800) {
                console.log(`[DIRECTOR] Tribe ${tribe} is over-performing. Triggering environmental evolution.`);
                this.evolveEnvironment();
            }
        });
    }

    /**
     * Mutates the environment based on performance (T9.4)
     */
    evolveEnvironment() {
        const eventType = Math.random();
        if (eventType < 0.5) {
            console.log(`[DIRECTOR] Event: Resource Drought`);
            // Halve the food
            this.simulation.food.length = Math.floor(this.simulation.food.length / 2);
            // Decrease spawn rate temporarily
            this.pacingState = 'PEAK'; 
        } else {
            console.log(`[DIRECTOR] Event: Path Blockade`);
            // Add a large obstacle in the center
            this.simulation.obstacles.push({
                x: this.simulation.width / 2 - 100,
                y: this.simulation.height / 2 - 100,
                w: 200,
                h: 200,
                isDynamic: true
            });
        }
    }

    processJobs() {
        // Logic to update active jobs if needed
    }

    cleanupJobs() {
        // Remove completed or abandoned jobs
        for (const [id, job] of this.activeJobs) {
            if (job.agents.size === 0) {
                this.activeJobs.delete(id);
            }
        }
    }

    notifyAgentIdle(agentId, jobId) {
        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId).agents.delete(agentId);
        }
    }
}
