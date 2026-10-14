/**
 * MASAC Integration - Fixed for Dynamic Predator Spawning
 */

import { WorkingMASAC, getPredatorState, getPreyState } from './working_masac.js';

export class MASACIntegration {
    constructor(simulation) {
        this.simulation = simulation;
        this.enabled = false;
        this.trainingPaused = false;
        
        this.predatorMASAC = null;
        this.preyMASAC = null;
        
        this.predatorMetrics = {
            totalReward: 0,
            episodes: 0,
            kills: 0
        };
        
        this.preyMetrics = {
            totalReward: 0,
            episodes: 0,
            survivals: 0,
            deaths: 0
        };
        
        this.frameCount = 0;
        
        // Track which agents are managed
        this.managedPredators = new Set();
        this.managedPrey = new Set();
    }

    initialize() {
        const numPredators = this.simulation.predators.length;
        const numPrey = this.simulation.agents.length;
        
        if (numPredators > 0) {
            this.predatorMASAC = new WorkingMASAC(numPredators, 8, 2, {
                lr: 0.15,
                gamma: 0.95
            });
            
            // Mark predators as MASAC-controlled
            this.simulation.predators.forEach((p, i) => {
                p.masacControlled = true;
                p.masacIndex = i;
                this.managedPredators.add(p.id);
            });
        }
        
        if (numPrey > 0) {
            this.preyMASAC = new WorkingMASAC(numPrey, 7, 2, {
                lr: 0.15,
                gamma: 0.95
            });
            
            // Mark prey as MASAC-controlled
            this.simulation.agents.forEach((a, i) => {
                a.masacControlled = true;
                a.masacIndex = i;
                this.managedPrey.add(a.id);
            });
        }
        
        this.enabled = true;
        console.log('[MASAC] Initialized:', {
            predators: numPredators,
            prey: numPrey
        });
        
        return true;
    }

    // Check for new predators/prey and add them to MASAC
    syncAgents() {
        // Check for new predators
        this.simulation.predators.forEach((p, i) => {
            if (!this.managedPredators.has(p.id)) {
                // New predator spawned!
                p.masacControlled = true;
                p.masacIndex = this.predatorMASAC ? this.predatorMASAC.numAgents : i;
                this.managedPredators.add(p.id);
                
                // Add to MASAC if possible
                if (this.predatorMASAC) {
                    this.predatorMASAC.agents.push({
                        qTable: this.predatorMASAC.agents[0].qTable, // Share knowledge
                        lastState: null,
                        lastAction: null,
                        totalReward: 0,
                        episodeSteps: 0,
                        kills: 0
                    });
                    this.predatorMASAC.numAgents++;
                }
                
                console.log('[MASAC] New predator added:', p.id);
            }
        });
        
        // Check for new prey
        this.simulation.agents.forEach((a, i) => {
            if (!a.dead && !this.managedPrey.has(a.id)) {
                a.masacControlled = true;
                a.masacIndex = this.preyMASAC ? this.preyMASAC.numAgents : i;
                this.managedPrey.add(a.id);
                
                if (this.preyMASAC) {
                    this.preyMASAC.agents.push({
                        qTable: this.preyMASAC.agents[0].qTable,
                        lastState: null,
                        lastAction: null,
                        totalReward: 0,
                        episodeSteps: 0
                    });
                    this.preyMASAC.numAgents++;
                }
                
                console.log('[MASAC] New prey added:', a.id);
            }
        });
    }

    preStep() {
        if (!this.enabled || this.trainingPaused) return;
        
        this.frameCount++;
        
        // Sync any new agents
        this.syncAgents();
        
        // Get actions for predators
        if (this.predatorMASAC && this.simulation.predators.length > 0) {
            const states = [];
            const validPredators = [];
            
            this.simulation.predators.forEach((p, i) => {
                if (!p.dead) {
                    states.push(getPredatorState(p, this.simulation.agents, 
                        this.simulation.predators, this.simulation.width, this.simulation.height));
                    validPredators.push({ predator: p, index: i });
                }
            });
            
            if (states.length === 0) return;
            
            // Ensure MASAC has right number of agents
            while (this.predatorMASAC.numAgents < states.length) {
                this.predatorMASAC.agents.push({
                    qTable: this.predatorMASAC.agents[0]?.qTable || new this.predatorMASAC.agents[0].qTable.constructor(8, 2),
                    lastState: null,
                    lastAction: null,
                    totalReward: 0,
                    episodeSteps: 0,
                    kills: 0
                });
                this.predatorMASAC.numAgents++;
            }
            
            const actions = this.predatorMASAC.selectActions(states);
            
            // Apply actions
            validPredators.forEach((vp, i) => {
                const p = vp.predator;
                const [steerX, steerY] = actions[i];
                const accel = 0.3;
                p.vx += steerX * accel;
                p.vy += steerY * accel;
                
                const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (speed > p.maxSpeed) {
                    p.vx = (p.vx / speed) * p.maxSpeed;
                    p.vy = (p.vy / speed) * p.maxSpeed;
                }
            });
        }
        
        // Get actions for prey
        if (this.preyMASAC && this.simulation.agents.length > 0) {
            const states = [];
            const validPrey = [];
            
            this.simulation.agents.forEach((a, i) => {
                if (!a.dead) {
                    states.push(getPreyState(a, this.simulation.predators, 
                        this.simulation.agents, this.simulation.width, this.simulation.height));
                    validPrey.push({ agent: a, index: i });
                }
            });
            
            if (states.length === 0) return;
            
            // Ensure MASAC has right number of agents
            while (this.preyMASAC.numAgents < states.length) {
                this.preyMASAC.agents.push({
                    qTable: this.preyMASAC.agents[0]?.qTable || new this.preyMASAC.agents[0].qTable.constructor(7, 2),
                    lastState: null,
                    lastAction: null,
                    totalReward: 0,
                    episodeSteps: 0
                });
                this.preyMASAC.numAgents++;
            }
            
            const actions = this.preyMASAC.selectActions(states);
            
            validPrey.forEach((vp, i) => {
                const a = vp.agent;
                const [steerX, steerY] = actions[i];
                const accel = 0.4;
                a.vx += steerX * accel;
                a.vy += steerY * accel;
                
                const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
                if (speed > a.maxSpeed) {
                    a.vx = (a.vx / speed) * a.maxSpeed;
                    a.vy = (a.vy / speed) * a.maxSpeed;
                }
            });
        }
    }

    postStep() {
        if (!this.enabled || this.trainingPaused) return;
        
        // Process predator transitions
        if (this.predatorMASAC && this.simulation.predators.length > 0) {
            const states = [];
            const nextStates = [];
            const rewards = [];
            const dones = [];
            
            this.simulation.predators.forEach((p, i) => {
                if (p.dead) return;
                
                const state = getPredatorState(p, this.simulation.agents, 
                    this.simulation.predators, this.simulation.width, this.simulation.height);
                states.push(state);
                
                // Apply velocity
                p.x += p.vx;
                p.y += p.vy;
                
                // Bounds
                if (p.x < p.radius || p.x > this.simulation.width - p.radius) {
                    p.vx *= -1;
                    p.x = Math.max(p.radius, Math.min(this.simulation.width - p.radius, p.x));
                }
                if (p.y < p.radius || p.y > this.simulation.height - p.radius) {
                    p.vy *= -1;
                    p.y = Math.max(p.radius, Math.min(this.simulation.height - p.radius, p.y));
                }
                
                const nextState = getPredatorState(p, this.simulation.agents,
                    this.simulation.predators, this.simulation.width, this.simulation.height);
                nextStates.push(nextState);
                
                // Compute reward
                let reward = 0.1;
                
                let nearestDist = Infinity;
                for (const agent of this.simulation.agents) {
                    if (agent.dead) continue;
                    const dx = agent.x - p.x;
                    const dy = agent.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    nearestDist = Math.min(nearestDist, dist);
                }
                
                if (nearestDist < 100) reward += 0.5;
                if (nearestDist < 50) reward += 1.0;
                
                const prevKills = this.predatorMetrics.kills;
                this.predatorMetrics.kills = p.personalSuccessCount || 0;
                if (this.predatorMetrics.kills > prevKills) {
                    reward += 10;
                }
                
                rewards.push(reward);
                dones.push(p.dead);
                
                this.predatorMetrics.totalReward += reward;
            });
            
            if (states.length > 0 && this.predatorMASAC) {
                this.predatorMASAC.storeTransitions(states, [], rewards, nextStates, dones);
            }
        }
        
        // Process prey transitions
        if (this.preyMASAC && this.simulation.agents.length > 0) {
            const states = [];
            const nextStates = [];
            const rewards = [];
            const dones = [];
            
            this.simulation.agents.forEach((a, i) => {
                if (a.dead) return;
                
                const state = getPreyState(a, this.simulation.predators,
                    this.simulation.agents, this.simulation.width, this.simulation.height);
                states.push(state);
                
                a.x += a.vx;
                a.y += a.vy;
                
                if (a.x < 0 || a.x > this.simulation.width) {
                    a.vx *= -1;
                    a.x = Math.max(0, Math.min(this.simulation.width, a.x));
                }
                if (a.y < 0 || a.y > this.simulation.height) {
                    a.vy *= -1;
                    a.y = Math.max(0, Math.min(this.simulation.height, a.y));
                }
                
                const nextState = getPreyState(a, this.simulation.predators,
                    this.simulation.agents, this.simulation.width, this.simulation.height);
                nextStates.push(nextState);
                
                let reward = 0.1;
                
                let nearestDist = Infinity;
                for (const predator of this.simulation.predators) {
                    const dx = predator.x - a.x;
                    const dy = predator.y - a.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    nearestDist = Math.min(nearestDist, dist);
                }
                
                if (nearestDist > 300) reward += 0.5;
                if (nearestDist < 100) reward -= 1.0;
                if (nearestDist < 50) reward -= 2.0;
                
                if (a.dead) {
                    reward -= 10;
                    this.preyMetrics.deaths++;
                } else {
                    this.preyMetrics.survivals++;
                }
                
                rewards.push(reward);
                dones.push(a.dead);
                
                this.preyMetrics.totalReward += reward;
            });
            
            if (states.length > 0 && this.preyMASAC) {
                this.preyMASAC.storeTransitions(states, [], rewards, nextStates, dones);
            }
        }
    }

    getMetrics() {
        const metrics = {
            step: this.frameCount,
            predator: null,
            prey: null
        };
        
        if (this.predatorMASAC) {
            metrics.predator = {
                ...this.predatorMASAC.getMetrics(),
                totalReward: this.predatorMetrics.totalReward,
                kills: this.predatorMetrics.kills
            };
        }
        
        if (this.preyMASAC) {
            metrics.prey = {
                ...this.preyMASAC.getMetrics(),
                totalReward: this.preyMetrics.totalReward,
                survivals: this.preyMetrics.survivals,
                deaths: this.preyMetrics.deaths
            };
        }
        
        if (metrics.predator && metrics.prey) {
            const totalEncounters = this.preyMetrics.deaths + this.preyMetrics.survivals;
            const killRate = totalEncounters > 0 ? this.preyMetrics.deaths / totalEncounters : 0;
            
            metrics.coevolution = {
                killRate: killRate.toFixed(2),
                predatorAvgReward: (this.predatorMetrics.totalReward / Math.max(1, this.frameCount)).toFixed(3),
                preyAvgReward: (this.preyMetrics.totalReward / Math.max(1, this.frameCount)).toFixed(3)
            };
        }
        
        return metrics;
    }

    exportResearchData() {
        return {
            metadata: {
                timestamp: new Date().toISOString(),
                totalSteps: this.frameCount,
                numPredators: this.simulation.predators.length,
                numPrey: this.simulation.agents.length
            },
            metrics: this.getMetrics(),
            predatorStats: this.predatorMetrics,
            preyStats: this.preyMetrics
        };
    }

    saveModels() {
        return {
            predator: this.predatorMASAC?.save(),
            prey: this.preyMASAC?.save(),
            frameCount: this.frameCount,
            predatorMetrics: this.predatorMetrics,
            preyMetrics: this.preyMetrics
        };
    }

    loadModels(checkpoint) {
        if (checkpoint.predator && this.predatorMASAC) {
            this.predatorMASAC.load(checkpoint.predator);
        }
        if (checkpoint.prey && this.preyMASAC) {
            this.preyMASAC.load(checkpoint.prey);
        }
        this.frameCount = checkpoint.frameCount || 0;
        this.predatorMetrics = checkpoint.predatorMetrics || this.predatorMetrics;
        this.preyMetrics = checkpoint.preyMetrics || this.preyMetrics;
    }
}
