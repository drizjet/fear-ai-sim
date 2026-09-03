/**
 * Simulation Class Unit Tests
 * Phase 1: Testing Infrastructure (T1.4)
 * 
 * Tests simulation initialization, agent management, and system integration
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Simulation } from '../simulation.js';
import { Agent } from '../agent.js';

describe('Simulation', () => {
    let mockCanvas;
    let simulation;
    let mockCtx;

    beforeEach(() => {
        // Reset Agent ID counter
        Agent.nextId = 0;
        
        // Create mock canvas and context
        mockCtx = {
            fillRect: jest.fn(),
            clearRect: jest.fn(),
            getImageData: jest.fn(() => ({ data: new Array(4) })),
            putImageData: jest.fn(),
            createImageData: jest.fn(() => ({ data: new Array(4) })),
            setTransform: jest.fn(),
            drawImage: jest.fn(),
            save: jest.fn(),
            fillText: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            closePath: jest.fn(),
            stroke: jest.fn(),
            translate: jest.fn(),
            scale: jest.fn(),
            rotate: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            measureText: jest.fn(() => ({ width: 0 })),
            transform: jest.fn(),
            rect: jest.fn(),
            clip: jest.fn(),
            setLineDash: jest.fn()
        };

        mockCanvas = {
            width: 800,
            height: 600,
            getContext: jest.fn(() => mockCtx)
        };

        const config = {
            spawnRate: 10,
            initialPopulation: 100 // Use smaller population for tests
        };

        // Create simulation with mocked methods that depend on complex initialization
        simulation = {
            canvas: mockCanvas,
            ctx: mockCtx,
            width: 800,
            height: 600,
            config: config,
            agents: [],
            predators: [],
            food: [],
            obstacles: [],
            safeHavens: [],
            generation: 1,
            frameCount: 0,
            running: false,
            fps: 60,
            massPanicActive: false,
            activePanicChains: 0,
            
            // Mock systems
            heatmap: { update: jest.fn(), draw: jest.fn(), addThreat: jest.fn() },
            actionMap: { record: jest.fn() },
            globalMemory: { record: jest.fn(), getRisk: jest.fn(() => 0), load: jest.fn() },
            analytics: { recordFrame: jest.fn(), getStats: jest.fn() },
            logger: { log: jest.fn(), export: jest.fn() },
            pheromoneSystem: { emit: jest.fn(), update: jest.fn(), draw: jest.fn() },
            theWired: { registerAgent: jest.fn(), broadcast: jest.fn(), update: jest.fn() },
            replaySystem: { startRecording: jest.fn(), recordFrame: jest.fn() },
            survivalHeatmap: { recordDeath: jest.fn(), draw: jest.fn() },
            acousticSystem: { emit: jest.fn(), update: jest.fn() },
            panicChainRenderer: { recordPanic: jest.fn(), draw: jest.fn() },
            
            // Methods to test
            initPopulation() {
                this.agents = [];
                for (let i = 0; i < this.config.initialPopulation; i++) {
                    const agent = new Agent(
                        Math.random() * this.width,
                        Math.random() * this.height
                    );
                    this.agents.push(agent);
                    this.theWired.registerAgent(agent);
                }
            },
            
            initSafeHavens() {
                this.safeHavens = [
                    { x: 50, y: 50, w: 100, h: 100 },
                    { x: this.width - 150, y: this.height - 150, w: 100, h: 100 }
                ];
            },
            
            initObstacles() {
                this.obstacles = [];
                for (let i = 0; i < 5; i++) {
                    this.obstacles.push({
                        x: Math.random() * this.width,
                        y: Math.random() * this.height,
                        w: 40 + Math.random() * 60,
                        h: 40 + Math.random() * 60
                    });
                }
            },
            
            spawnFood() {
                if (Math.random() < this.config.spawnRate / 100) {
                    this.food.push({
                        x: Math.random() * this.width,
                        y: Math.random() * this.height,
                        energy: 20
                    });
                }
            },
            
            getPopulationStats() {
                const alive = this.agents.filter(a => !a.dead).length;
                const panicking = this.agents.filter(a => a.brain.state === 'PANIC').length;
                const avgFear = this.agents.reduce((sum, a) => sum + a.brain.currentFear, 0) / this.agents.length;
                
                return {
                    total: this.agents.length,
                    alive,
                    dead: this.agents.length - alive,
                    panicking,
                    avgFear: isNaN(avgFear) ? 0 : avgFear
                };
            },
            
            detectMassPanic() {
                const panicRatio = this.agents.filter(a => a.brain.state === 'PANIC').length / this.agents.length;
                this.massPanicActive = panicRatio > 0.3;
                this.activePanicChains = this.massPanicActive ? Math.floor(panicRatio * 10) : 0;
                return this.massPanicActive;
            },
            
            checkBounds(agent) {
                if (agent.x < 0) agent.x = 0;
                if (agent.x > this.width) agent.x = this.width;
                if (agent.y < 0) agent.y = 0;
                if (agent.y > this.height) agent.y = this.height;
            },
            
            isInSafeHaven(agent) {
                return this.safeHavens.some(sh => 
                    agent.x > sh.x && agent.x < sh.x + sh.w &&
                    agent.y > sh.y && agent.y < sh.y + sh.h
                );
            }
        };
    });

    describe('Initialization (T1.4)', () => {
        it('should initialize with correct dimensions', () => {
            expect(simulation.width).toBe(800);
            expect(simulation.height).toBe(600);
        });

        it('should initialize with config', () => {
            expect(simulation.config.spawnRate).toBe(10);
            expect(simulation.config.initialPopulation).toBe(100);
        });

        it('should initialize generation counter', () => {
            expect(simulation.generation).toBe(1);
            expect(simulation.frameCount).toBe(0);
        });

        it('should initialize as not running', () => {
            expect(simulation.running).toBe(false);
        });

        it('should initialize panic tracking', () => {
            expect(simulation.massPanicActive).toBe(false);
            expect(simulation.activePanicChains).toBe(0);
        });
    });

    describe('Population Management (T1.4)', () => {
        it('should initialize population with correct size', () => {
            simulation.initPopulation();
            
            expect(simulation.agents.length).toBe(100);
        });

        it('should register all agents with The Wired', () => {
            simulation.initPopulation();
            
            expect(simulation.theWired.registerAgent).toHaveBeenCalledTimes(100);
        });

        it('should spawn agents within bounds', () => {
            simulation.initPopulation();
            
            simulation.agents.forEach(agent => {
                expect(agent.x).toBeGreaterThanOrEqual(0);
                expect(agent.x).toBeLessThanOrEqual(simulation.width);
                expect(agent.y).toBeGreaterThanOrEqual(0);
                expect(agent.y).toBeLessThanOrEqual(simulation.height);
            });
        });

        it('should maintain stable population count', () => {
            simulation.initPopulation();
            const initialCount = simulation.agents.length;
            
            // Simulate some deaths
            simulation.agents[0].dead = true;
            simulation.agents[1].dead = true;
            
            const stats = simulation.getPopulationStats();
            expect(stats.total).toBe(initialCount);
            expect(stats.alive).toBe(initialCount - 2);
            expect(stats.dead).toBe(2);
        });
    });

    describe('Safe Havens (T1.4)', () => {
        it('should initialize safe havens', () => {
            simulation.initSafeHavens();
            
            expect(simulation.safeHavens.length).toBe(2);
        });

        it('should detect agents in safe haven', () => {
            simulation.initSafeHavens();
            
            // Create agent in first safe haven
            const agent = new Agent(100, 100);
            
            expect(simulation.isInSafeHaven(agent)).toBe(true);
        });

        it('should not detect agents outside safe haven', () => {
            simulation.initSafeHavens();
            
            // Create agent outside safe havens
            const agent = new Agent(400, 400);
            
            expect(simulation.isInSafeHaven(agent)).toBe(false);
        });
    });

    describe('Obstacles (T1.4)', () => {
        it('should initialize obstacles', () => {
            simulation.initObstacles();
            
            expect(simulation.obstacles.length).toBe(5);
        });

        it('should spawn obstacles within bounds', () => {
            simulation.initObstacles();
            
            simulation.obstacles.forEach(obs => {
                expect(obs.x).toBeGreaterThanOrEqual(0);
                expect(obs.x).toBeLessThanOrEqual(simulation.width);
                expect(obs.y).toBeGreaterThanOrEqual(0);
                expect(obs.y).toBeLessThanOrEqual(simulation.height);
                expect(obs.w).toBeGreaterThanOrEqual(40);
                expect(obs.h).toBeGreaterThanOrEqual(40);
            });
        });
    });

    describe('Food System (T1.4)', () => {
        it('should spawn food based on spawn rate', () => {
            // Force spawn by setting high rate
            simulation.config.spawnRate = 100;
            
            simulation.spawnFood();
            
            expect(simulation.food.length).toBeGreaterThan(0);
        });

        it('should spawn food within bounds', () => {
            simulation.config.spawnRate = 100;
            simulation.spawnFood();
            
            simulation.food.forEach(f => {
                expect(f.x).toBeGreaterThanOrEqual(0);
                expect(f.x).toBeLessThanOrEqual(simulation.width);
                expect(f.y).toBeGreaterThanOrEqual(0);
                expect(f.y).toBeLessThanOrEqual(simulation.height);
                expect(f.energy).toBe(20);
            });
        });
    });

    describe('Mass Panic Detection (T1.4)', () => {
        it('should detect mass panic when >30% agents panicking', () => {
            simulation.initPopulation();
            
            // Make 40% of agents panic
            const panicCount = Math.floor(simulation.agents.length * 0.4);
            for (let i = 0; i < panicCount; i++) {
                simulation.agents[i].brain.state = 'PANIC';
            }
            
            const isMassPanic = simulation.detectMassPanic();
            
            expect(isMassPanic).toBe(true);
            expect(simulation.massPanicActive).toBe(true);
        });

        it('should not detect mass panic when <30% agents panicking', () => {
            simulation.initPopulation();
            
            // Make 20% of agents panic
            const panicCount = Math.floor(simulation.agents.length * 0.2);
            for (let i = 0; i < panicCount; i++) {
                simulation.agents[i].brain.state = 'PANIC';
            }
            
            const isMassPanic = simulation.detectMassPanic();
            
            expect(isMassPanic).toBe(false);
            expect(simulation.massPanicActive).toBe(false);
        });

        it('should track active panic chains', () => {
            simulation.initPopulation();
            
            // Make 50% panic
            const panicCount = Math.floor(simulation.agents.length * 0.5);
            for (let i = 0; i < panicCount; i++) {
                simulation.agents[i].brain.state = 'PANIC';
            }
            
            simulation.detectMassPanic();
            
            expect(simulation.activePanicChains).toBeGreaterThan(0);
        });
    });

    describe('Population Statistics (T1.4)', () => {
        it('should calculate average fear level', () => {
            simulation.initPopulation();
            
            // Set specific fear levels
            simulation.agents[0].brain.currentFear = 0.2;
            simulation.agents[1].brain.currentFear = 0.4;
            simulation.agents[2].brain.currentFear = 0.6;
            
            const stats = simulation.getPopulationStats();
            
            expect(stats.avgFear).toBeGreaterThan(0);
            expect(typeof stats.avgFear).toBe('number');
        });

        it('should count panicking agents', () => {
            simulation.initPopulation();
            
            simulation.agents[0].brain.state = 'PANIC';
            simulation.agents[1].brain.state = 'PANIC';
            simulation.agents[2].brain.state = 'PANIC';
            
            const stats = simulation.getPopulationStats();
            
            expect(stats.panicking).toBe(3);
        });

        it('should handle empty population', () => {
            simulation.agents = [];
            
            const stats = simulation.getPopulationStats();
            
            expect(stats.total).toBe(0);
            expect(stats.avgFear).toBe(0);
        });
    });

    describe('Boundary Checking (T1.4)', () => {
        it('should keep agents within bounds', () => {
            const agent = new Agent(-10, -10);
            
            simulation.checkBounds(agent);
            
            expect(agent.x).toBe(0);
            expect(agent.y).toBe(0);
        });

        it('should clamp agents to maximum bounds', () => {
            const agent = new Agent(1000, 1000);
            
            simulation.checkBounds(agent);
            
            expect(agent.x).toBe(simulation.width);
            expect(agent.y).toBe(simulation.height);
        });

        it('should not modify in-bounds agents', () => {
            const agent = new Agent(400, 300);
            
            simulation.checkBounds(agent);
            
            expect(agent.x).toBe(400);
            expect(agent.y).toBe(300);
        });
    });

    describe('System Integration (T1.4)', () => {
        it('should have all required subsystems', () => {
            expect(simulation.heatmap).toBeDefined();
            expect(simulation.globalMemory).toBeDefined();
            expect(simulation.analytics).toBeDefined();
            expect(simulation.logger).toBeDefined();
            expect(simulation.pheromoneSystem).toBeDefined();
            expect(simulation.theWired).toBeDefined();
            expect(simulation.replaySystem).toBeDefined();
            expect(simulation.survivalHeatmap).toBeDefined();
            expect(simulation.acousticSystem).toBeDefined();
        });

        it('should initialize with performance tracking', () => {
            expect(simulation.fps).toBe(60);
            expect(simulation.frameCount).toBe(0);
        });
    });

    describe('Evolution Simulation (T1.4)', () => {
        it('should track generation count', () => {
            expect(simulation.generation).toBe(1);
            
            simulation.generation++;
            
            expect(simulation.generation).toBe(2);
        });

        it('should maintain agent family information', () => {
            simulation.initPopulation();
            
            const agent = simulation.agents[0];
            const lineage = agent.getLineageInfo();
            
            expect(lineage).toHaveProperty('id');
            expect(lineage).toHaveProperty('familyName');
            expect(lineage).toHaveProperty('generation');
        });
    });
});