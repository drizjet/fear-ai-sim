import { DataBridge } from './databridge.js';
import { PhysicsWorkerManager } from './physicsworker-manager.js';
import 'pixi.js/unsafe-eval';
import * as PIXI from 'pixi.js';
import { Agent } from './agent.js';
import { LearningAgent, AgentLearning } from './learningagent.js';
import { QuadTree, Boundary, Point } from './quadtree.js';
import { SpatialHash } from './spatialhash.js';
import { ObjectPool } from './objectpool.js';
import { LODSystem } from './lodsystem.js';
import { BrainWorkerManager } from './brainworker-manager.js';
import { ThreatHeatmap, ActionHeatmap } from './heatmap.js';
import { DangerMap } from './memory.js';
import { Analytics } from './analytics.js';
import { Logger } from './logger.js';
import { PanicChainRenderer } from './panicchains.js';
import { Predator, PREDATOR_TYPES, PredatorLearning } from './predator.js';
import { FearPheromoneSystem } from './pheromones.js';
import { SurvivalHeatmap } from './survivalheatmap.js';
import { AcousticSystem } from './sound.js';
import { TheWired } from './network.js';
import { ReplaySystem } from './replay.js';
import { MetricsCollector } from './metrics.js';
import { RealTimeDashboard } from './dashboard.js';
import { NeuralFearSystem } from './neuralfear.js';
import { ProceduralContentManager } from './proceduralcontent.js';
import { AdaptiveLearningManager } from './adaptivelearning.js';
import { SocialDynamicsEngine } from './socialdynamics.js';
import { StrategicDirector } from './director.js';
import { TraumaZoneSystem } from './traumazone.js';
import { MarkovPredictionEngine } from './markovprediction.js';
import { SmartObjectSystem, SMART_OBJECT_TYPES } from './smartobject.js';
import { NavMesh } from './navmesh.js';
import { WorldEnvironment, BIOMES } from './worldenv.js';
import { View3D } from './view3d.js';
import { FearAudioEngine } from './audioengine.js';
import { UserCalibrationSystem } from './calibration.js';
import { GlobalTribalStrategist } from './tribalmind.js';
import { EmotionMap } from './emotionmap.js';
import { FogOfWar } from './fogofwar.js';
import { MASACIntegration } from './masac_integration_v3.js';
import { profiler } from './profiler.js';
import { getTauriExporter } from './tauri-bridge.js';

export class Simulation {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config;
        
        this.width = canvas.width;
        this.height = canvas.height;
        
        // PERFORMANCE: Cache reusable objects to reduce GC pressure
        this._visualCenter = { x: this.width/2, y: this.height/2 };
        this._tempVector = { x: 0, y: 0 }; // Reusable temp vector
        
        // Phase 10/11 Omniverse Extension
        this.viewMode = 'RTS'; // Modes: 'DOTS', 'RTS', '3D'
        this.isThermalVision = false; // Phase 14: Infrared Mode
        this.worldEnv = new WorldEnvironment(this.width, this.height);
        this.selectionBox = null; // { x1, y1, x2, y2 }
        this.selectedAgents = new Set();
        
        // Phase 11: Affective Audio Synthesis
        this.audioEngine = new FearAudioEngine();
        this.audioStarted = false;

        // Phase 13 Nuance: User Calibration (MSDA)
        this.calibration = new UserCalibrationSystem();

        // Visionary Pillar 1: LAMARL Tribal Strategist
        this.tribalStrategist = new GlobalTribalStrategist();

        // Phase 15: Mass Scaling (Emotion Map)
        this.emotionMap = new EmotionMap(this.width, this.height, 20);

        // Phase 14: Fog of War (T14.2)
        this.fogOfWar = new FogOfWar(this.width, this.height, 40);
        
        // Create 3D container (hidden by default unless viewMode is 3D)
        this.container3D = document.createElement('div');
        this.container3D.id = 'container-3d';
        this.container3D.style.position = 'absolute';
        this.container3D.style.top = '0';
        this.container3D.style.left = '0';
        this.container3D.style.width = '100%';
        this.container3D.style.height = '100%';
        this.container3D.style.display = 'none';
        if (this.canvas.parentElement) {
            this.canvas.parentElement.appendChild(this.container3D);
        }
        
        this.view3D = new View3D(this.container3D, this.worldEnv);
        
        this.agents = [];
        this.predators = [];
        this.food = [];
        this.obstacles = [];
        this.safeHavens = [];
        this.selectedAgent = null;
        this.heatmap = new ThreatHeatmap(this.width, this.height);
        this.actionMap = new ActionHeatmap(this.width, this.height);
        this.globalMemory = new DangerMap(this.width, this.height);
        this.globalMemory.load();
        this.analytics = new Analytics();
        this.logger = new Logger();
        this.panicChainRenderer = new PanicChainRenderer();
        
        // Phase 2: Metrics & Analytics (T2.1, T2.2, T2.6)
        this.metricsCollector = new MetricsCollector();
        this.dashboard = null; // Initialized in initDashboard()
        this.pheromoneSystem = new FearPheromoneSystem(this.width, this.height);
        this.survivalHeatmap = new SurvivalHeatmap(this.width, this.height);
        this.acousticSystem = new AcousticSystem();
        this.theWired = new TheWired(80); // 80px connection range
        this.replaySystem = new ReplaySystem();
        
        // Phase 4: Advanced Systems (Integration)
        this.neuralFear = new NeuralFearSystem();
        this.proceduralContent = new ProceduralContentManager();
        this.adaptiveLearning = new AdaptiveLearningManager();
        
        // Phase 6-9: Deep Intelligence Systems
        this.socialDynamics = new SocialDynamicsEngine();
        this.director = new StrategicDirector(this);
        this.traumaZones = new TraumaZoneSystem();
        this.markovEngine = new MarkovPredictionEngine(this.width, this.height, 100);
        
        // Phase 10: Environmental Interaction (T10.1, T10.2)
        this.smartObjects = new SmartObjectSystem();
        this.navMesh = new NavMesh(this.width, this.height, 20);
        
        this.generation = 1;
        this.frameCount = 0;
        this.running = false;
        this.massPanicActive = false;
        this.activePanicChains = 0;
        
        // Phase 5: Optimization Systems (T5.2, T5.3, T5.4, T5.5)
        this.spatialHash = new SpatialHash(this.width, this.height, 100);
        // Use LearningAgent for self-learning AI competition
        this.agentPool = new ObjectPool(() => new LearningAgent(0, 0), this.config.initialPopulation || 2000);
        this.lodSystem = new LODSystem({ x: this.width / 2, y: this.height / 2 });
        this.brainWorkerManager = new BrainWorkerManager(4);
        
        // Phase 12: Adaptive AI Quality (T12.3)
        this.aiQualityScale = 1.0; // 1.0 = Full, < 1.0 = Reduced
        
        // AI Evolution tracking
        this.aiEvolutionStats = {
            lastEscapeRate: 0.5,
            adaptationCycle: 0
        };
        
        // Performance monitoring
        this.fps = 60;
        this.lastFrameTime = performance.now();
        this.frameTimeHistory = [];
        this.targetFrameTime = 1000 / 60; // 60fps target
        
        // Start auto-recording interesting moments
        this.replaySystem.startRecording();
        
        // Phase 2: High-Performance Data Bridge
        this.dataBridge = new DataBridge(this);
        
        this.initPopulation();
        this.initObstacles();
        this.initSafeHavens();
        
        this.masacIntegration = new MASACIntegration(this);
        this.masacIntegration.enabled = false;

        // Phase 3: Hardware-Level Physics Integration
        this.rustPhysicsEnabled = false;
        this.workerPhysicsEnabled = false;
        this.tauriExporter = getTauriExporter();
        this.physicsWorkerManager = new PhysicsWorkerManager(this, 4); // Use 4 CPU cores
    }

    /**
     * Phase 3.5: Toggle Parallel Worker Physics
     */
    toggleWorkerPhysics(enabled) {
        this.workerPhysicsEnabled = enabled;
        console.log(`[SIM] PARALLEL WORKER PHYSICS: ${enabled ? 'ACTIVE' : 'OFF'}`);
    }

    /**
     * Phase 3: Toggle Rust-powered physics
     */
    async toggleRustPhysics(enabled) {
        if (!isTauri()) {
            console.warn('[SIM] Rust physics only available in native software mode.');
            return;
        }
        
        this.rustPhysicsEnabled = enabled;
        if (enabled) {
            await this.syncToRust();
            console.log('[SIM] RUST PHYSICS ENGINE ACTIVE');
        } else {
            console.log('[SIM] Falling back to JavaScript physics');
        }
    }

    async syncToRust() {
        const rustAgents = this.agents.map(a => ({
            id: a.id,
            x: a.x,
            y: a.y,
            vx: a.vx,
            vy: a.vy,
            radius: a.radius,
            fear: a.brain.currentFear,
            dead: a.dead
        }));
        await this.tauriExporter.syncAgentsToRust(rustAgents);
    }

    initSafeHavens() {
        // Safe havens are green zones where morale recovery is boosted
        this.safeHavens.push({
            x: 50, y: 50, w: 100, h: 100
        });
        this.safeHavens.push({
            x: this.width - 150, y: this.height - 150, w: 100, h: 100
        });
    }

    initObstacles() {
        // Add random "cover" obstacles and register them as Smart Objects (T10.1)
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            const w = 40 + Math.random() * 60;
            const h = 40 + Math.random() * 60;
            
            const obj = { x, y, w, h };
            this.obstacles.push(obj);
            
            // Randomly assign smart object types
            const rand = Math.random();
            const type = rand < 0.5 ? SMART_OBJECT_TYPES.COVER : 
                         (rand < 0.75 ? SMART_OBJECT_TYPES.VAULT : SMART_OBJECT_TYPES.CRAWL);
            
            this.smartObjects.registerObject(x, y, w, h, type);
        }

        // Phase 10: Build NavMesh (T10.2)
        this.navMesh.buildFromObstacles(this.obstacles);
    }

    initPopulation(count = null) {
        console.log(`[INIT] Starting population initialization, current agents: ${this.agents.length}`);
        
        // Release existing agents back to pool
        this.agents.forEach(a => this.agentPool.release(a));
        this.agents = [];
        
        const safeWidth = this.width || 800;
        const safeHeight = this.height || 600;
        const targetCount = count !== null ? count : (this.config.initialPopulation || 500);
        console.log(`[INIT] Creating ${targetCount} agents in ${safeWidth}x${safeHeight} world`);

        for (let i = 0; i < targetCount; i++) {
            const agent = this.agentPool.acquire(
                Math.random() * safeWidth,
                Math.random() * safeHeight
            );
            if (!agent) {
                console.error(`[INIT] Failed to acquire agent ${i}! Pool may be empty.`);
                continue;
            }
            if (Number.isNaN(agent.x)) agent.x = Math.random() * safeWidth;
            if (Number.isNaN(agent.y)) agent.y = Math.random() * safeHeight;
            
            // Phase 7: Tribal Assignment (T7.5)
            this.socialDynamics.setTribe(agent.id, agent.familyName);

            this.agents.push(agent);
            this.theWired.registerAgent(agent);
        }
        console.log(`[INIT] Population complete: ${this.agents.length} agents created`);
    }

    /**
     * Live Population Scaling (T13 refinement)
     */
    setPopulation(targetCount) {
        const currentCount = this.agents.length;
        const diff = targetCount - currentCount;

        if (diff > 0) {
            // Spawn more
            for (let i = 0; i < diff; i++) {
                const agent = this.agentPool.acquire(
                    Math.random() * this.width,
                    Math.random() * this.height
                );
                this.socialDynamics.setTribe(agent.id, agent.familyName);
                this.agents.push(agent);
                this.theWired.registerAgent(agent);
            }
            console.log(`[SIM] Spawned ${diff} agents live.`);
        } else if (diff < 0) {
            // Remove some (start with oldest or random)
            const toRemove = Math.abs(diff);
            for (let i = 0; i < toRemove; i++) {
                const agent = this.agents.pop();
                if (agent) this.agentPool.release(agent);
            }
            console.log(`[SIM] Released ${toRemove} agents live.`);
        }
        
        this.config.initialPopulation = targetCount;
    }

    /**
     * Initialize the real-time dashboard (T2.6)
     * Call this after the simulation is created and DOM is ready
     */
    initDashboard(containerId = 'dashboard-container') {
        // Create container if it doesn't exist
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            document.body.appendChild(container);
        }
        
        this.dashboard = new RealTimeDashboard(containerId, this);
        console.log('📊 Real-time dashboard initialized');
        return this.dashboard;
    }

    spawnFood() {
        if (Math.random() < this.config.spawnRate / 100) {
            this.food.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                energy: 30
            });
        }
    }

    async update() {
        this.frameCount++;

        // FPS Tracking
        const now = performance.now();
        let delta = 16.66; // default 60fps
        if (this.lastFrameTime) {
            delta = now - this.lastFrameTime;
            this.currentFPS = 1000 / delta;

            // Track average FPS
            if (!this.fpsHistory) this.fpsHistory = [];
            this.fpsHistory.push(this.currentFPS);
            if (this.fpsHistory.length > 60) this.fpsHistory.shift();

            // Log FPS drops
            if (this.frameCount % 60 === 0 && this.currentFPS < 30) {
                const avgFPS = this.fpsHistory.reduce((a,b) => a+b, 0) / this.fpsHistory.length;
                console.warn(`⚠️  FPS DROP: ${this.currentFPS.toFixed(1)} (avg: ${avgFPS.toFixed(1)}) | Agents: ${this.agents.filter(a => !a.dead).length} | Predators: ${this.predators.length}`);
            }
        }
        this.lastFrameTime = now;        
        // Phase 15: Mass Scaling (Emotion Map Update)
        this.emotionMap.update();

        // Phase 16: Tribal Wavefront Synchronization (Visionary Pillar 1.2)
        // Group individual units into tribal centroids for "Quantum-Inspired" entangled movement
        const tribeGroups = new Map();
        this.agents.forEach(agent => {
            // LOD Gating for Tribal Sync (Only HIGH and TACTICAL sync)
            if (this.lodSystem.getIntelligenceProfile(agent) === 'CROWD') return;

            const tribeId = this.socialDynamics.tribeMap.get(agent.id) || 'default';
            if (!tribeGroups.has(tribeId)) tribeGroups.set(tribeId, { agents: [], avgX: 0, avgY: 0, avgVX: 0, avgVY: 0 });
            const group = tribeGroups.get(tribeId);
            group.agents.push(agent);
            group.avgX += agent.x;
            group.avgY += agent.y;
            group.avgVX += agent.vx;
            group.avgVY += agent.vy;
        });

        tribeGroups.forEach(group => {
            const n = group.agents.length;
            if (n === 0) return;
            group.avgX /= n;
            group.avgY /= n;
            group.avgVX /= n;
            group.avgVY /= n;
            
            // Apply wavefront alignment to the tribe (Entangled movement)
            group.agents.forEach(agent => {
                // High skill/leadership agents influence the wavefront more
                const influence = 0.05 + (agent.brain.traits.leadership * 0.1);
                agent.vx = (agent.vx * (1 - influence)) + (group.avgVX * influence);
                agent.vy = (agent.vy * (1 - influence)) + (group.avgVY * influence);
            });
        });

        // Phase 6: Strategic Director Update (T6.1)
        await this.director.update();
        const strategicMap = this.director.getStrategicMultipliers();
        
        // Phase 15: Enhanced Performance Monitoring (T15.4)
        // Use the same 'now' from the start of update()
        const frameTime = now - this.lastFrameTime;
        this.frameTimeHistory.push(frameTime);
        if (this.frameTimeHistory.length > 60) this.frameTimeHistory.shift();
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
        this.fps = Math.round(1000 / avgFrameTime);
        
        // Memory monitoring (if available)
        if (performance.memory) {
            this.memoryUsage = performance.memory.usedJSHeapSize / 1048576; // MB
            if (this.memoryUsage > 500 && this.frameCount % 60 === 0) {
                console.warn(`[PERF] High memory usage: ${this.memoryUsage.toFixed(1)}MB`);
            }
        }
        
        // Emergency performance mode: Force minimum LOD if FPS drops critically
        // FIXED: Now agents always move, just with reduced AI fidelity
        if (avgFrameTime > 50) { // Less than 20 FPS
            this.emergencyLOD = true;
            if (this.frameCount % 60 === 0) {
                console.warn(`[PERF] Emergency LOD activated: ${this.fps} FPS`);
            }
        } else if (avgFrameTime < 33) { // Back to 30+ FPS
            this.emergencyLOD = false;
        }
        
        // Phase 12: Adaptive AI Quality (T12.3)
        this.adjustAIQuality();
        
        this.spawnFood();
        this.globalMemory.decay();
        this.pheromoneSystem.update();
        this.acousticSystem.update();
        this.theWired.update();
        this.traumaZones.update();

        // Data Collection Loop (Every 1 second at 60fps)
        if (this.frameCount % 60 === 0) {
            const stats = this.getStats();
            this.analytics.record({
                population: stats.count,
                fearIndex: parseFloat(stats.avgFear),
                avgMorale: parseFloat(stats.avgMorale),
                avgEnergy: stats.avgEnergy
            });

            // Phase 13 Nuance: User Calibration Sampling (MSDA)
            if (this.calibration.isCalibrating) {
                this.calibration.recordSample('fearLevels', parseFloat(stats.avgFear));
                // Mock pupil data for headless research
                this.calibration.recordSample('pupilDiameter', 3.0 + Math.random() * 2.0);
            }
        }

        // Save persistent memory every 5 seconds
        if (this.frameCount % 300 === 0) {
            this.globalMemory.save();
        }

        // Build Spatial Hash (T5.4) - Faster than QuadTree for dynamic updates
        this.spatialHash.clear();
        this.agents.forEach(agent => {
            if (!agent.dead) {
                this.spatialHash.insert(agent.x, agent.y, agent);
            }
        });

        // Phase 3: Hardware-Level Physics Engines
        if (this.rustPhysicsEnabled) {
            // Option A: Rust Backend (Tauri)
            const updatedAgents = await this.tauriExporter.tickRustEngine();
            if (updatedAgents) {
                const agentMap = new Map(this.agents.map(a => [a.id, a]));
                for (const updated of updatedAgents) {
                    const agent = agentMap.get(updated.id);
                    if (agent) {
                        agent.x = updated.x;
                        agent.y = updated.y;
                        agent.vx = updated.vx;
                        agent.vy = updated.vy;
                    }
                }
            }
        } else if (this.workerPhysicsEnabled) {
            // Option B: Multithreaded Web Workers (Electron/Browser)
            // Parallelize movement and basic threat avoidance across 4 CPU cores
            await this.physicsWorkerManager.updateParallel(
                this.agents, 
                this.predators, 
                this.width, 
                this.height
            );
        }

        // Update LOD System (T5.5) focus point
        const focusX = this.selectedAgent ? this.selectedAgent.x : this.width / 2;
        const focusY = this.selectedAgent ? this.selectedAgent.y : this.height / 2;
        this.lodSystem.updateFocus(focusX, focusY);

        // MASAC Deep RL - Pre-step (select actions)
        if (this.masacIntegration?.enabled) {
            this.masacIntegration.preStep();
        }

        // Update heatmaps with predator positions
        this.heatmap.update(this.predators);
        this.actionMap.update(this.agents);
        
        // OPTIMIZED: Pre-calculate pack data once per frame (O(N) instead of O(N²))
        Predator.calculatePackData(this.predators);
        
        // Update all predators (pass allPredators for pack coordination)
        this.predators.forEach(predator => {
            // Skip MASAC-controlled predators if MASAC is active
            if (this.masacIntegration?.enabled && predator.masacControlled) {
                // MASAC already set velocity in preStep
                predator.x += predator.vx;
                predator.y += predator.vy;
                
                // Bounds checking
                if (predator.x < predator.radius || predator.x > this.width - predator.radius) {
                    predator.vx *= -1;
                    predator.x = Math.max(predator.radius, Math.min(this.width - predator.radius, predator.x));
                }
                if (predator.y < predator.radius || predator.y > this.height - predator.radius) {
                    predator.vy *= -1;
                    predator.y = Math.max(predator.radius, Math.min(this.height - predator.radius, predator.y));
                }
            } else {
                predator.update(this.agents, this.width, this.height, this.predators, this.spatialHash);
            }
            
            predator.checkKills(this.agents, this.analytics, this.logger, this.spatialHash);
            
            // Phase 9: Record predator movement for Markov prediction (T9.3)
            this.markovEngine.recordMovement(predator.id, predator.x, predator.y);

            // Emit predator sounds
            if (predator.state === 'CHARGING' || predator.state === 'CHASING') {
                this.acousticSystem.emit(predator.x, predator.y, 0.8, 'predator', 'ROAR');
            } else if (predator.state === 'AMBUSH_WAIT') {
                // Occasional footsteps
                if (this.frameCount % 60 === 0) {
                    this.acousticSystem.emit(predator.x, predator.y, 0.3, 'predator', 'FOOTSTEP');
                }
            }
        });
        
        let totalPanic = 0;
        let agentsProcessed = 0;
        
        // OPTIMIZED: Process agents with tiered LOD
        // REAL PERFORMANCE FIX: Pre-allocate arrays, cache properties, reduce GC
        
        // Cache predator properties once per frame (not per agent)
        const predatorCache = [];
        for (const p of this.predators) {
            const props = p.getFearProperties();
            predatorCache.push({
                id: p.id,
                x: p.x,
                y: p.y,
                fearRadius: props.radius,
                fearIntensity: props.intensity,
                type: props.type,
                // Pre-calculate squared radius for faster checks
                fearRadiusSq: props.radius * props.radius
            });
        }
        
        // Build spatial hash for O(1) nearby predator lookup
        const cellSize = 200;
        const predatorSpatialHash = new Map();
        
        for (const p of predatorCache) {
            const cellX = Math.floor(p.x / cellSize);
            const cellY = Math.floor(p.y / cellSize);
            const key = `${cellX},${cellY}`;
            
            if (!predatorSpatialHash.has(key)) {
                predatorSpatialHash.set(key, []);
            }
            predatorSpatialHash.get(key).push(p);
        }
        
        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            if (agent.dead) continue;

            // Get LOD profile
            const lodProfile = this.lodSystem.getIntelligenceProfile(agent);
            const shouldFullUpdate = this.lodSystem.shouldUpdate(agent);
            
            if (agent.brain.state === 'PANIC') totalPanic++;
            
            // PERFORMANCE: Query spatial hash ONLY for close agents
            let neighbors = [];
            if (lodProfile !== 'CROWD' || shouldFullUpdate) {
                neighbors = this.spatialHash.query(agent.x, agent.y, 100)
                    .filter(a => a !== agent);
            }

            // OPTIMIZED: Reuse visuals object structure to reduce GC pressure
            const visuals = {
                threats: [],
                food: [],
                neighbors: neighbors,
                center: this._visualCenter  // Reuse cached center object
            };

            // OPTIMIZED THREAT DETECTION - Full quality, faster execution
            // Uses spatial hash to only check nearby predators (not all of them)
            let nearestThreatDist = Infinity;
            
            const agentCellX = Math.floor(agent.x / cellSize);
            const agentCellY = Math.floor(agent.y / cellSize);
            
            // Check neighboring cells (3x3 grid) - still checks ALL nearby predators
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = `${agentCellX + dx},${agentCellY + dy}`;
                    const predatorsInCell = predatorSpatialHash.get(key);
                    
                    if (predatorsInCell) {
                        for (let pi = 0; pi < predatorsInCell.length; pi++) {
                            const p = predatorsInCell[pi];
                            const pdx = p.x - agent.x;
                            const pdy = p.y - agent.y;
                            const distSq = pdx*pdx + pdy*pdy;
                            
                            // Only process if within fear radius (not skipping, just filtering)
                            if (distSq > p.fearRadiusSq) continue;
                            
                            const dist = Math.sqrt(distSq);
                            
                            // FULL Markov predictions for ALL agents in range
                            const prediction = this.markovEngine.predictNextZone(p.id);
                            const intent = this.markovEngine.inferIntent(p.id);
                            
                            visuals.threats.push({ 
                                dx: pdx/dist, 
                                dy: pdy/dist, 
                                dist,
                                intensity: p.fearIntensity,
                                type: p.type,
                                predictedNextPos: prediction,
                                intent: intent
                            });
                            
                            if (dist < nearestThreatDist) nearestThreatDist = dist;
                        }
                    }
                }
            }
            
            visuals.threats.sort((a,b) => a.dist - b.dist);

            // Update Engagement State
            if (nearestThreatDist < 100) {
                agent.setEngaged();
            } else {
                agent.endEngagement();
            }
            
            // TIER 1: CROWD LOD - Minimal AI but still react to threats
            if (!shouldFullUpdate && lodProfile === 'CROWD') {
                if (visuals.threats.length > 0) {
                    const t = visuals.threats[0];
                    agent.vx -= t.dx * 2;
                    agent.vy -= t.dy * 2;
                    agent.brain.currentFear = Math.min(1, agent.brain.currentFear + 0.1);
                    if (agent.brain.currentFear > 0.5) {
                        agent.brain.state = 'PANIC';
                    }
                }
                
                // Simple physics update
                agent.x += agent.vx;
                agent.y += agent.vy;
                agent.vx *= 0.95;
                agent.vy *= 0.95;
                
                // Bounds check
                if (agent.x < 0) { agent.x = 0; agent.vx *= -0.5; }
                if (agent.x > this.width) { agent.x = this.width; agent.vx *= -0.5; }
                if (agent.y < 0) { agent.y = 0; agent.vy *= -0.5; }
                if (agent.y > this.height) { agent.y = this.height; agent.vy *= -0.5; }
                
                agent.brain.currentFear *= 0.995;
                continue;
            }
            
            // TIER 2: TACTICAL - Half-rate AI
            if (lodProfile === 'TACTICAL' && this.frameCount % 2 !== 0) {
                if (visuals.threats.length > 0) {
                    const t = visuals.threats[0];
                    agent.vx -= t.dx * 1.5;
                    agent.vy -= t.dy * 1.5;
                    agent.brain.currentFear = Math.min(1, agent.brain.currentFear + 0.05);
                }
                
                agent.x += agent.vx;
                agent.y += agent.vy;
                agent.vx *= 0.95;
                agent.vy *= 0.95;
                continue;
            }
            
            agentsProcessed++;

            // TIER 3: FULL UPDATE - Complete AI processing (HIGH_FIDELITY or regular update frame)
            // Phase 15: Deposit emotion into global map (O(1) scaling prep)
            this.emotionMap.deposit(agent.x, agent.y, agent.brain.currentFear, agent.brain.currentAnger);

            // Detect food (visuals object with threats and neighbors already prepared above)
            this.food.forEach((f, idx) => {
                const dx = f.x - agent.x;
                const dy = f.y - agent.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 150) {
                    visuals.food.push({ dx: dx/dist, dy: dy/dist, dist, idx });
                }
            });

            // Sort by distance
            visuals.threats.sort((a,b) => a.dist - b.dist);
            visuals.food.sort((a,b) => a.dist - b.dist);

            // Phase 7: Affective Mirroring (T7.2)
            const mirrorFear = this.socialDynamics.getMirrorFear(agent.id, neighbors);

            // Visionary Pillar 1: Tribal Mind Integration
            const tribeId = this.socialDynamics.tribeMap.get(agent.id) || 'default';
            const tribalMind = this.tribalStrategist.registerTribe(tribeId);

            // Phase 12.3: LOD 2.0 Intelligence Gating
            const counterMeasures = this.director.getCounterMeasures();

            // LOD 2.0: Pass new scaling systems to agent update
            agent.update(this.width, this.height, visuals, this.globalMemory, this.obstacles, this.safeHavens, this.traumaZones.getTraumaAt(agent.x, agent.y), mirrorFear, this.smartObjects, this.heatmap, this.socialDynamics, this.worldEnv, this.calibration, this.lodSystem, this.emotionMap, counterMeasures, tribalMind);
            
            // Deposit fear pheromones based on agent state
            this.pheromoneSystem.deposit(agent.x, agent.y, agent.brain.currentFear, agent.brain.state);
            
            // Broadcast panic to network if panicking
            // Phase 15: Pass spatial hash for O(1) proximity queries (T15.4)
            if (agent.brain.state === 'PANIC') {
                this.theWired.broadcast(agent.id, 'PANIC', agent.brain.currentFear, this.spatialHash);
                // Emit panic scream sound occasionally
                if (this.frameCount % 10 === 0 && Math.random() < 0.3) {
                    this.acousticSystem.emit(agent.x, agent.y, 0.5, 'agent', 'PANIC_SCREAM');
                }
            }
            
            // Record survival data for heatmap
            this.survivalHeatmap.record(agent);
            
            // Phase 7: Learning Illusion Tracking (T7.4)
            if (this.frameCount % 120 === 0) {
                this.checkStrategySuccess(agent);
            }

            if (agent.brain.state === 'PANIC') totalPanic++;
            
            // Interaction with obstacles
            this.obstacles.forEach(obs => {
                if (agent.x > obs.x && agent.x < obs.x + obs.w &&
                    agent.y > obs.y && agent.y < obs.y + obs.h) {
                    // Push out
                    const dx1 = agent.x - obs.x;
                    const dx2 = obs.x + obs.w - agent.x;
                    const dy1 = agent.y - obs.y;
                    const dy2 = obs.y + obs.h - agent.y;
                    const min = Math.min(dx1, dx2, dy1, dy2);
                    if (min === dx1) agent.x = obs.x;
                    else if (min === dx2) agent.x = obs.x + obs.w;
                    else if (min === dy1) agent.y = obs.y;
                    else if (min === dy2) agent.y = obs.y + obs.h;
                    agent.vx *= -0.5;
                    agent.vy *= -0.5;
                }
            });

            // Check if food eaten
            // Fix: Mark food as eaten instead of splicing immediately to avoid index shifting bugs
            if (visuals.food.length > 0 && visuals.food[0].dist < agent.radius + 5) {
                const foodRef = visuals.food[0];
                const foodIdx = foodRef.idx;
                // Extra safety: validate index, food exists, and hasn't been eaten
                if (foodIdx >= 0 && foodIdx < this.food.length && foodRef.dist !== undefined) {
                    const foodItem = this.food[foodIdx];
                    // Only eat if food exists, has energy, and hasn't been eaten yet
                    if (foodItem && typeof foodItem.energy === 'number' && !foodItem._eaten) {
                        agent.energy = Math.min(100, agent.energy + foodItem.energy);
                        foodItem._eaten = true; // Mark for deletion at end of frame
                    }
                }
            }

            // Check starvation
            if (agent.energy <= 0 && !agent.dead) {
                agent.dead = true;
                agent.deathCause = 'starvation';
                this.analytics.history.deathCauses.starvation++;
                this.logger.log('AGENT_DEATH', { cause: 'starvation', x: Math.floor(agent.x), y: Math.floor(agent.y) });
                
                // Record Trauma Zone (T7.3)
                this.traumaZones.addZone(agent.x, agent.y, 0.5);

                // Phase 11: Intrinsic Fear Conditioning (T11.4)
                if (agent.deathCause === 'predation') {
                    this.socialDynamics.recordTribalDanger(agent.id, agent.deathBy, 0.3);
                }

                // Phase 2: Record death in metrics (T2.1)
                if (this.metricsCollector) {
                    this.metricsCollector.recordDeath('starvation', agent);
                }
            }
        }
        
        // MASAC Deep RL - Post-step (store transitions and train)
        if (this.masacIntegration?.enabled) {
            this.masacIntegration.postStep();
        }
        
        // High-performance position logging
        this.logger.recordPositions(this.agents);

        // Phase 2: High-Performance Data Bridge Capture
        if (this.dataBridge) {
            this.dataBridge.captureFrame();
        }

        // Clean up eaten food (do this once after all agents have eaten)
        // Fix: Filter out marked food to prevent index shifting crashes
        this.food = this.food.filter(f => !f._eaten);

        // Detect Panic Spikes (Mass Panic)
        if (totalPanic > this.agents.length * 0.4 && !this.massPanicActive) {
            this.massPanicActive = true;
            this.logger.log('MASS_PANIC', { count: totalPanic, intensity: (totalPanic / this.agents.length).toFixed(2) });
        } else if (totalPanic < this.agents.length * 0.1) {
            this.massPanicActive = false;
        }

        // Update panic chains during mass panic
        // Phase 15: Build agent map once for O(1) lookups in panic chains
        if (this.massPanicActive) {
            // Build Map once for all O(1) id->agent lookups this frame
            if (!this._agentMap) this._agentMap = new Map();
            this._agentMap.clear();
            for (const agent of this.agents) {
                this._agentMap.set(agent.id, agent);
            }
            this.panicChainRenderer.updateFromAgents(this.agents, this._agentMap);
            // Mark mass panic as interesting event for replay
            if (this.frameCount % 60 === 0) {
                this.replaySystem.markEvent('MASS_PANIC', {
                    panicCount: this.agents.filter(a => a.brain.state === 'PANIC').length
                });
            }
        }
        this.panicChainRenderer.update(); // Always update to fade old chains

        // Update panic chain count for UI
        this.activePanicChains = this.panicChainRenderer.getActiveChainCount();
        
        // Capture frame for replay (every 2nd frame for 30fps recording)
        if (this.frameCount % 2 === 0) {
            const stats = this.getStats();
            this.replaySystem.captureFrame(this.agents, this.predators, stats);
        }

        // Periodic trait sampling for fingerprinting
        if (this.frameCount % 60 === 0) {
            this.agents.forEach(agent => {
                this.analytics.recordAgentTraits(agent.brain.traits, !agent.dead, agent.age);
            });
        }
        
        // Phase 2: Record comprehensive metrics every 30 frames (T2.1, T2.2)
        if (this.frameCount % 30 === 0) {
            this.metricsCollector.recordFrame(this.agents, this.predators, this);
        }
        
        // AI CO-EVOLUTION: Adapt both systems every 300 frames (~5 seconds)
        if (this.frameCount % 300 === 0) {
            this.runAICoevolutionCycle();
        }

        // Phase 4: Advanced Systems Periodic Updates
        if (this.frameCount % 60 === 0) {
            // Predict global fear level using Neural Network (T4.5)
            if (this.neuralFear && this.neuralFear.isTrained) {
                const features = [
                    totalPanic / Math.max(1, this.agents.length),
                    this.predators.length / 10,
                    this.food.length / 100,
                    0, 0, 0, 0, 0, 0, 0, 0, 0 // Pad the rest of the 12 features
                ];
                const predictedFear = this.neuralFear.predict(features);
                if (predictedFear > 0.8 && !this.massPanicActive) {
                    // Neural net predicts extreme fear - preemptively trigger storm
                    this.triggerStorm();
                }
            }

            // Update Social Dynamics (T4.8)
            if (this.socialDynamics && this.agents.length > 0) {
                // Periodically elect a leader from a random subset of agents
                const subset = this.agents.slice(0, Math.min(10, this.agents.length)).map(a => a.id);
                this.socialDynamics.electLeader('global_group', subset);
            }
            
            // Adaptive Learning / PCG Integration (T4.6, T4.7)
            if (this.adaptiveLearning && this.proceduralContent) {
                const stats = this.getStats();
                this.adaptiveLearning.recordInteraction('global_player', {
                    fearLevel: parseFloat(stats.avgFear),
                    engagement: 0.5,
                    performance: this.agents.length / 2000
                });
                
                // If population drops too low, generate a recovery scenario
                if (this.agents.length < 500 && Math.random() < 0.1) {
                    const scenario = this.proceduralContent.scenarioGenerator.generateScenario({ phase: 'recovery', intensityMultiplier: 0.2 }, 'SOCIAL_PLAYER', stats);
                    if (scenario && scenario.resources && scenario.resources.length > 0) {
                        this.triggerResourceBoom();
                    }
                }
            }
        }

        // Evolution step: reproduce successful agents
        const generationChanged = this.evolve(); 

        // If generation changed, trigger endGeneration analytics
        if (generationChanged) {
            this.analytics.endGeneration(this.generation, this.agents);
            // Phase 9: Generative Scenario Evolution (T9.4)
            this.director.evaluateGenerativeEvolution(this.generation, this.agents);
        }

        // Cleanup dead agents (predators are stored separately)
        this.agents.forEach(a => {
            if (a.dead) this.agentPool.release(a);
        });
        this.agents = this.agents.filter(a => !a.dead);
        
        // Limit population (T1.4 integration compatibility)
        const maxPop = this.config.initialPopulation || 2000;
        if (this.agents.length > maxPop) {
            const excess = this.agents.splice(maxPop);
            excess.forEach(a => this.agentPool.release(a));
        }
        
        // Limit food
        if (this.food.length > 100) this.food.length = 100;

        // T6.2: Listen for acoustic events to trigger investigations
        const newEvents = this.acousticSystem.getNewEvents ? this.acousticSystem.getNewEvents() : [];
        newEvents.forEach(event => {
            if (event.type === 'predator' || event.intensity > 0.7) {
                this.handleAcousticEvent(event);
            }
        });
    }

    /**
     * Handle high-intensity sounds by assigning investigation roles (T6.2)
     */
    handleAcousticEvent(event) {
        // Find nearby agents not currently panicking
        const neighbors = this.spatialHash.query(event.x, event.y, 200)
            .filter(a => !a.dead && a.brain.state !== 'PANIC' && a.brain.role === 'CITIZEN');
        
        if (neighbors.length > 0) {
            this.director.assignRoleBasedInvestigation({ x: event.x, y: event.y }, neighbors);
            console.log(`[SIM] Sound at (${Math.round(event.x)}, ${Math.round(event.y)}) triggered role-based investigation with ${neighbors.length} agents`);
        }
    }

    /**
     * Check if current agent strategy is succeeding (T7.4)
     */
    checkStrategySuccess(agent) {
        const strategy = agent.brain.state === 'HIDE' ? 'HIDE' : 
                         (agent.brain.state === 'PANIC' ? 'FLEE' : null);
        
        if (!strategy) return;

        // Success if no predators are nearby
        const nearPredators = this.predators.filter(p => {
            const dx = p.x - agent.x;
            const dy = p.y - agent.y;
            return dx*dx + dy*dy < 150*150;
        });

        const success = nearPredators.length === 0;
        this.director.recordStrategyEvent(strategy, success);
    }

    evolve() {
        // If population low, spawn new generation from best survivors
        if (this.agents.length < 20) {
            this.generation++;
            this.logger.log('EVOLUTION_START', { generation: this.generation });
            const survivors = this.agents.sort((a,b) => b.age - a.age);
            const parent = survivors[0] || new Agent(0,0);
            
            for (let i = 0; i < 30; i++) {
                const offspringTraits = JSON.parse(JSON.stringify(parent.brain.traits));
                const offspring = this.agentPool.acquire(
                    Math.random() * this.width,
                    Math.random() * this.height,
                    offspringTraits,
                    false, // isBigGuy
                    parent.id // parentId
                );
                offspring.generation = this.generation;
                offspring.familyName = parent.familyName; // Inherit family name
                offspring.brain.mutate(this.config.mutationRate / 100);

                // Track parent-child relationship
                parent.children.push(offspring.id);

                this.agents.push(offspring);
                this.theWired.registerAgent(offspring);

                // Phase 7: Inherit Tribe (T7.5)
                const parentTribe = this.socialDynamics.tribeMap.get(parent.id);
                if (parentTribe) {
                    this.socialDynamics.setTribe(offspring.id, parentTribe);
                }

                // Log family tree growth
                this.logger.log('BIRTH', { 
                    childId: offspring.id, 
                    parentId: parent.id,
                    familyName: offspring.familyName,
                    generation: this.generation
                });
                
                // Phase 2: Record birth in metrics (T2.1)
                if (this.metricsCollector) {
                    this.metricsCollector.recordBirth(parent.id);
                }
            }
            return true; // Generation changed
        }
        return false;
    }

    // Environmental Events
    triggerStorm() {
        // Create lightning strikes that panic all agents in random areas
        const strikes = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < strikes; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            
            // Panic all agents near the strike
            this.agents.forEach(agent => {
                const dx = agent.x - x;
                const dy = agent.y - y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 150) {
                    agent.brain.currentFear = 1.0;
                    agent.brain.state = 'PANIC';
                }
            });
            
            // Emit thunder sound
            this.acousticSystem.emit(x, y, 1.0, 'environment', 'ROAR');
        }
    }

    triggerResourceBoom() {
        // Spawn a large amount of food
        for (let i = 0; i < 50; i++) {
            this.food.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                energy: 50 + Math.random() * 50
            });
        }
        // Boost morale of all agents
        this.agents.forEach(agent => {
            agent.brain.morale = Math.min(2.0, agent.brain.morale + 0.3);
        });
    }

    triggerQuarantine() {
        // Create a dangerous zone that agents should avoid
        const qx = Math.random() * (this.width - 200);
        const qy = Math.random() * (this.height - 200);
        
        // Mark area in global memory as high risk
        for (let x = qx; x < qx + 200; x += 10) {
            for (let y = qy; y < qy + 200; y += 10) {
                this.globalMemory.record(x, y, 1.0);
            }
        }
        
        // Add visual obstacle
        this.obstacles.push({
            x: qx, y: qy, w: 200, h: 200,
            isQuarantine: true
        });
    }

    /**
     * Save current simulation state to JSON
     */
    saveState() {
        const state = {
            version: '1.0',
            timestamp: Date.now(),
            generation: this.generation,
            frameCount: this.frameCount,
            agents: this.agents.map(a => ({
                x: a.x,
                y: a.y,
                traits: a.brain.traits,
                energy: a.energy,
                age: a.age,
                id: a.id,
                familyName: a.familyName,
                generation: a.generation,
                parentId: a.parentId,
                children: a.children,
                traumaLevel: a.traumaLevel
            })),
            predators: this.predators.map(p => ({
                x: p.x,
                y: p.y,
                type: p.type,
                state: p.state
            })),
            globalMemory: Array.from(this.globalMemory.grid),
            analytics: this.analytics.history,
            replay: this.replaySystem.exportRecording()
        };
        
        return JSON.stringify(state);
    }

    /**
     * Load simulation state from JSON
     */
    loadState(jsonString) {
        try {
            const state = JSON.parse(jsonString);
            
            // Restore basic state
            this.generation = state.generation || 1;
            this.frameCount = state.frameCount || 0;
            
            // Restore agents
            this.agents = [];
            state.agents.forEach(a => {
                const agent = new Agent(a.x, a.y, a.traits, false, a.parentId);
                agent.id = a.id;
                agent.energy = a.energy;
                agent.age = a.age;
                agent.familyName = a.familyName;
                agent.generation = a.generation;
                agent.children = a.children || [];
                agent.traumaLevel = a.traumaLevel || 0;
                this.agents.push(agent);
                this.theWired.registerAgent(agent);
            });
            
            // Restore predators
            this.predators = state.predators.map(p => {
                const pred = new Predator(p.x, p.y, p.type);
                pred.state = p.state;
                return pred;
            });
            
            // Restore global memory
            if (state.globalMemory) {
                this.globalMemory.grid = new Float32Array(state.globalMemory);
            }
            
            // Restore analytics
            if (state.analytics) {
                this.analytics.history = state.analytics;
            }
            
            // Restore replay
            if (state.replay) {
                this.replaySystem.loadRecording(state.replay);
            }
            
            console.log('[SIMULATION] State loaded successfully');
            return true;
        } catch (e) {
            console.error('[SIMULATION] Failed to load state:', e);
            return false;
        }
    }

    /**
     * Export replay as downloadable file
     */
    exportReplay() {
        const replayData = this.replaySystem.exportRecording();
        const blob = new Blob([replayData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fear_ai_replay_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    toggleViewMode(mode) {
        this.viewMode = mode;
        if (this.logger) this.logger.currentContext.viewMode = mode;
        
        if (mode === '3D') {
            this.container3D.style.display = 'block';
            this.canvas.style.display = 'none';
        } else {
            this.container3D.style.display = 'none';
            this.canvas.style.display = 'block';
        }
        console.log(`[SIM] View mode shifted to: ${mode}`);
    }

    async initPixi() {
        this.pixiApp = new PIXI.Application();
        await this.pixiApp.init({
            width: this.width,
            height: this.height,
            backgroundAlpha: 0,
            antialias: false,
            resolution: window.devicePixelRatio || 1,
            preference: 'webgl' // Will fallback gracefully to canvas on integrated graphics like Intel UHD
        });

        // Overlay canvas
        this.pixiApp.canvas.style.position = 'absolute';
        this.pixiApp.canvas.style.top = '0';
        this.pixiApp.canvas.style.left = '0';
        this.pixiApp.canvas.style.pointerEvents = 'none'; // click-through
        this.pixiApp.canvas.style.zIndex = '5';
        
        if (this.canvas.parentElement) {
            this.canvas.parentElement.appendChild(this.pixiApp.canvas);
        }

        this.pixiAgentContainer = new PIXI.Container();
        this.pixiPredatorContainer = new PIXI.Container();
        
        this.pixiApp.stage.addChild(this.pixiAgentContainer);
        this.pixiApp.stage.addChild(this.pixiPredatorContainer);

        // Graphics pools
        this.agentGraphicsMap = new Map();
        this.predatorGraphicsMap = new Map();
        
        this.pixiReady = true;
        console.log('[SIM] PixiJS High-Performance Renderer Initialized');
    }

    updatePixiAgent(agent) {
        if (!this.pixiReady || !this.agentGraphicsMap) return;
        let gfx = this.agentGraphicsMap.get(agent.id);
        if (!gfx) {
            gfx = new PIXI.Graphics();
            this.pixiAgentContainer.addChild(gfx);
            this.agentGraphicsMap.set(agent.id, gfx);
        }
        
        gfx.x = agent.x;
        gfx.y = agent.y;
        gfx.rotation = Math.atan2(agent.vy, agent.vx);
        
        if (gfx._lastState !== agent.brain.state || gfx._lastRadius !== agent.radius) {
            gfx.clear();
            
            let color = 0xffffff;
            if (agent.brain.state === 'PANIC') color = 0xff3333;
            else if (agent.brain.state === 'AGGRESSIVE') color = 0xffaa00;
            else if (agent.brain.state === 'HIDE') color = 0x555555;
            
            // PixiJS v8 path drawing
            gfx.moveTo(agent.radius * 1.5, 0);
            gfx.lineTo(-agent.radius, -agent.radius);
            gfx.lineTo(-agent.radius * 0.5, 0);
            gfx.lineTo(-agent.radius, agent.radius);
            gfx.lineTo(agent.radius * 1.5, 0);
            gfx.fill(color);
            
            gfx._lastState = agent.brain.state;
            gfx._lastRadius = agent.radius;
        }
    }

    updatePixiPredator(predator) {
        if (!this.pixiReady || !this.predatorGraphicsMap) return;
        let gfx = this.predatorGraphicsMap.get(predator.id);
        if (!gfx) {
            gfx = new PIXI.Graphics();
            this.pixiPredatorContainer.addChild(gfx);
            this.predatorGraphicsMap.set(predator.id, gfx);
        }
        
        gfx.x = predator.x;
        gfx.y = predator.y;
        
        if (gfx._lastState !== predator.state) {
            gfx.clear();
            let color = 0xff0055; // TANK
            if (predator.type === 'STALKER') color = 0x9d00ff;
            else if (predator.type === 'SWARMER') color = 0x00ff88;
            
            gfx.circle(0, 0, predator.radius);
            gfx.fill(color);
            gfx._lastState = predator.state;
        }
    }

    draw() {
        if (this.viewMode === '3D') {
            this.view3D.update(this.agents, this.predators);
            return;
        }

        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw World Environment (Biomes) in RTS mode (T10/11)
        this.worldEnv.draw(this.ctx);

        // Phase 15: Draw Emotion Map (Global fear/anger diffusion)
        this.emotionMap.draw(this.ctx);

        // Draw heatmaps
        this.heatmap.draw(this.ctx);
        this.actionMap.draw(this.ctx);
        
        // Draw trauma zones
        this.traumaZones.draw(this.ctx);
        
        // Draw acoustic sound waves
        this.acousticSystem.draw(this.ctx);

        // Draw panic chains (on top of heatmaps, below agents)
        this.panicChainRenderer.draw(this.ctx);

        // Draw Smart Objects (T10.1)
        this.smartObjects.draw(this.ctx);
        
        // Draw selection box (T10/11 RTS)
        if (this.selectionBox) {
            this.ctx.strokeStyle = '#00f2ff';
            this.ctx.fillStyle = 'rgba(0, 242, 255, 0.1)';
            const x = this.selectionBox.x1;
            const y = this.selectionBox.y1;
            const w = this.selectionBox.x2 - x;
            const h = this.selectionBox.y2 - y;
            this.ctx.fillRect(x, y, w, h);
            this.ctx.strokeRect(x, y, w, h);
        }
        
        // Draw Safe Havens
        this.ctx.fillStyle = 'rgba(0, 255, 100, 0.1)';
        this.ctx.strokeStyle = 'rgba(0, 255, 100, 0.3)';
        this.safeHavens.forEach(sh => {
            this.ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
            this.ctx.strokeRect(sh.x, sh.y, sh.w, sh.h);
        });

        // Draw pheromone trails (under everything)
        this.pheromoneSystem.draw(this.ctx);
        
        // Draw network connections (The Wired visualization)
        this.drawNetworkConnections();

        if (this.pixiApp) {
            // Use high-performance PIXI WebGL renderer
            const usedAgents = new Set();
            this.agents.forEach(a => {
                usedAgents.add(a.id);
                this.updatePixiAgent(a);
            });
            
            // Cleanup dead agent graphics
            if (this.agentGraphicsMap) {
                for (const [id, gfx] of this.agentGraphicsMap.entries()) {
                    if (!usedAgents.has(id)) {
                        this.pixiAgentContainer.removeChild(gfx);
                        gfx.destroy();
                        this.agentGraphicsMap.delete(id);
                    }
                }
            }

            const usedPreds = new Set();
            this.predators.forEach(p => {
                usedPreds.add(p.id);
                this.updatePixiPredator(p);
            });
            
            // Cleanup dead predator graphics
            if (this.predatorGraphicsMap) {
                for (const [id, gfx] of this.predatorGraphicsMap.entries()) {
                    if (!usedPreds.has(id)) {
                        this.pixiPredatorContainer.removeChild(gfx);
                        gfx.destroy();
                        this.predatorGraphicsMap.delete(id);
                    }
                }
            }

            // Draw selection ring on 2D canvas
            if (this.selectedAgent) {
                this.ctx.beginPath();
                this.ctx.arc(this.selectedAgent.x, this.selectedAgent.y, this.selectedAgent.radius + 5, 0, Math.PI * 2);
                this.ctx.strokeStyle = '#00f2ff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
        }
        
        // Draw minimap
        this.drawMinimap();
    }

    drawNetworkConnections() {
        if (!this.config.networkViz) return;
        
        // Visualize The Wired network connections
        // Phase 15: Spatial-Optimized Visualization (T15.4)
        const ctx = this.ctx;
        const maxConnectionsToDraw = 30; // Reduced for performance
        let drawn = 0;
        
        ctx.save();
        
        // Use spatial hash instead of O(N²) nested iteration
        this.theWired.nodes.forEach((node, id) => {
            if (drawn >= maxConnectionsToDraw) return;
            
            // Check if this node has panic signals
            const panicSignal = node.signals.get('PANIC');
            if (panicSignal && panicSignal > 0.3) {
                const source = node.agent;
                
                // Use spatial hash for O(1) proximity query instead of O(N) scan
                const nearbyAgents = this.spatialHash.query(
                    source.x, source.y, this.theWired.maxDistance
                );
                
                for (const target of nearbyAgents) {
                    if (drawn >= maxConnectionsToDraw) break;
                    if (target.id === source.id || target.isPredator) continue;
                    
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const distSq = dx*dx + dy*dy;
                    
                    if (distSq < this.theWired.maxDistance * this.theWired.maxDistance) {
                        const dist = Math.sqrt(distSq);
                        const strength = 1 - (dist / this.theWired.maxDistance);
                        
                        // Draw connection line
                        ctx.beginPath();
                        ctx.moveTo(source.x, source.y);
                        ctx.lineTo(target.x, target.y);
                        ctx.strokeStyle = `rgba(255, 0, 100, ${panicSignal * strength * 0.5})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        
                        drawn++;
                    }
                }
                
                // Draw signal pulse around panicking agent (limit to first 10)
                if (drawn < maxConnectionsToDraw) {
                    ctx.beginPath();
                    ctx.arc(source.x, source.y, 15, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 0, 100, ${panicSignal * 0.2})`;
                    ctx.fill();
                }
            }
        });
        
        ctx.restore();
    }

    drawMinimap() {
        const ctx = this.ctx;
        const mapSize = 120;
        const mapX = this.width - mapSize - 10;
        const mapY = 10;
        const scaleX = mapSize / this.width;
        const scaleY = mapSize / this.height;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(mapX, mapY, mapSize, mapSize);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mapX, mapY, mapSize, mapSize);
        
        // Safe havens
        ctx.fillStyle = 'rgba(0, 255, 100, 0.3)';
        this.safeHavens.forEach(sh => {
            ctx.fillRect(
                mapX + sh.x * scaleX,
                mapY + sh.y * scaleY,
                sh.w * scaleX,
                sh.h * scaleY
            );
        });
        
        // Agents (sample for performance)
        const sampleRate = Math.max(1, Math.floor(this.agents.length / 100));
        for (let i = 0; i < this.agents.length; i += sampleRate) {
            const a = this.agents[i];
            if (a.dead) continue;
            
            const px = mapX + a.x * scaleX;
            const py = mapY + a.y * scaleY;
            
            // Color by state
            switch (a.brain.state) {
                case 'PANIC':
                    ctx.fillStyle = '#ff0000';
                    break;
                case 'HIDE':
                    ctx.fillStyle = '#888888';
                    break;
                case 'RECOVER':
                    ctx.fillStyle = '#00ff88';
                    break;
                default:
                    ctx.fillStyle = `rgba(100, 150, 255, 0.5)`;
            }
            
            ctx.fillRect(px, py, 2, 2);
        }
        
        // Predators
        this.predators.forEach(p => {
            const px = mapX + p.x * scaleX;
            const py = mapY + p.y * scaleY;
            ctx.fillStyle = p.type === 'TANK' ? '#ff0055' : 
                           p.type === 'STALKER' ? '#9d00ff' : '#00ff88';
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // Title
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px monospace';
        ctx.fillText('MINIMAP', mapX + 5, mapY + 12);
    }

    selectAgent(x, y) {
        let nearest = null;
        let minDist = 20;
        this.agents.forEach(a => {
            const d = Math.sqrt((a.x - x)**2 + (a.y - y)**2);
            if (d < minDist) {
                minDist = d;
                nearest = a;
            }
        });
        this.selectedAgent = nearest;
        if (nearest) {
            this.selectedAgents.clear();
            this.selectedAgents.add(nearest);
        }
        return nearest;
    }

    /**
     * Handle window/container resizing (T13 refinement)
     */
    handleResize() {
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Update spatial systems
        if (this.spatialHash) {
            this.spatialHash.width = this.width;
            this.spatialHash.height = this.height;
        }
        
        // Re-init grids if resolution needs to change or bounds shift
        this.heatmap = new ThreatHeatmap(this.width, this.height);
        this.actionMap = new ActionHeatmap(this.width, this.height);
        this.globalMemory = new DangerMap(this.width, this.height);
        this.pheromoneSystem = new FearPheromoneSystem(this.width, this.height);
        this.worldEnv = new WorldEnvironment(this.width, this.height);
        this.navMesh = new NavMesh(this.width, this.height, 20);
        this.navMesh.buildFromObstacles(this.obstacles);
        
        if (this.view3D) this.view3D.handleResize();
        
        // Update PixiJS renderer size
        if (this.pixiApp && this.pixiApp.renderer) {
            this.pixiApp.renderer.resize(this.width, this.height);
        }
        
        console.log(`[SIM] Internal dimensions updated: ${this.width}x${this.height}`);
    }

    // RTS Selection & Commands (T10/11)
    startSelection(x, y) {
        this.selectionBox = { x1: x, y1: y, x2: x, y2: y };
    }

    updateSelection(x, y) {
        if (this.selectionBox) {
            this.selectionBox.x2 = x;
            this.selectionBox.y2 = y;
        }
    }

    endSelection() {
        if (!this.selectionBox) return;
        
        const { x1, y1, x2, y2 } = this.selectionBox;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);

        this.selectedAgents.clear();
        this.agents.forEach(a => {
            if (!a.dead && a.x >= left && a.x <= right && a.y >= top && a.y <= bottom) {
                this.selectedAgents.add(a);
            }
        });

        // Set the first one as selectedAgent for inspector
        this.selectedAgent = this.selectedAgents.size > 0 ? [...this.selectedAgents][0] : null;
        this.selectionBox = null;
    }

    issueCommand(x, y) {
        console.log(`[SIM] Command issued to ${this.selectedAgents.size} units: Move to (${Math.round(x)}, ${Math.round(y)})`);
        this.selectedAgents.forEach(a => {
            if (!a.dead) {
                a.brain.manualTarget = { x, y };
                a.brain.state = 'CALM'; // Override panic temporarily
            }
        });
    }

    getStats() {
        // Use alive-only population for all gameplay metrics (dead agents stay resident in array)
        const totalCount = this.agents.length;
        let aliveCount = 0;
        let sumFear = 0, sumSkill = 0, sumMorale = 0, sumEnergy = 0;
        let panicCount = 0;
        for (const a of this.agents) {
            if (a.dead) continue;
            aliveCount++;
            sumFear += a.brain.currentFear;
            sumSkill += a.brain.traits.skill;
            sumMorale += a.brain.morale;
            sumEnergy += a.energy;
            if (a.brain.state === 'PANIC') panicCount++;
        }
        if (aliveCount === 0) {
            return {
                count: 0,
                totalCount,
                aliveCount: 0,
                deadCount: totalCount,
                avgFear: 0,
                avgSkill: 0,
                avgMorale: 0,
                avgEnergy: 0,
                panicCount: 0,
                panicRatio: 0,
                panicLevel: 0
            };
        }
        const panicRatio = panicCount / aliveCount;
        return {
            count: aliveCount,
            totalCount,
            aliveCount,
            deadCount: totalCount - aliveCount,
            avgFear: sumFear / aliveCount,
            avgSkill: sumSkill / aliveCount,
            avgMorale: sumMorale / aliveCount,
            avgEnergy: sumEnergy / aliveCount,
            panicCount,
            panicRatio,
            panicLevel: panicRatio
        };
    }

    /**
     * MASAC Helper: Find nearest prey for a predator
     */
    findNearestPrey(predator) {
        let nearest = null;
        let minDistSq = Infinity;
        
        // Use spatial hash for efficiency
        const nearby = this.spatialHash.query(predator.x, predator.y, 500);
        for (const agent of nearby) {
            if (agent.dead) continue;
            const dx = agent.x - predator.x;
            const dy = agent.y - predator.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = agent;
            }
        }
        return nearest;
    }

    /**
     * MASAC Helper: Get center of the predator pack
     */
    getPredatorPackCenter(predator) {
        if (this.predators.length <= 1) return { x: predator.x, y: predator.y };
        
        let sumX = 0, sumY = 0, count = 0;
        for (const p of this.predators) {
            if (p === predator) continue;
            sumX += p.x;
            sumY += p.y;
            count++;
        }
        return { x: sumX / count, y: sumY / count };
    }

    /**
     * MASAC Helper: Count nearby predators
     */
    countNearbyPredators(entity, radius) {
        let count = 0;
        for (const p of this.predators) {
            if (p === entity) continue;
            const dx = p.x - entity.x;
            const dy = p.y - entity.y;
            if (dx * dx + dy * dy < radius * radius) {
                count++;
            }
        }
        return count;
    }

    /**
     * MASAC Helper: Count nearby prey
     */
    countNearbyPrey(entity, radius) {
        // Use spatial hash
        return this.spatialHash.query(entity.x, entity.y, radius)
            .filter(a => !a.dead && a !== entity).length;
    }

    /**
     * MASAC Helper: Get average fear of nearby prey
     */
    getAveragePreyFearNear(predator, radius) {
        const nearby = this.spatialHash.query(predator.x, predator.y, radius)
            .filter(a => !a.dead);
        if (nearby.length === 0) return 0;
        
        const sumFear = nearby.reduce((sum, a) => sum + a.brain.currentFear, 0);
        return sumFear / nearby.length;
    }

    /**
     * MASAC Helper: Time since last kill
     */
    getTimeSinceLastKill(predator) {
        // Mock implementation if predator doesn't track this
        return predator.timeSinceLastKill || 1000;
    }

    /**
     * MASAC Helper: Nearest safe zone
     */
    getNearestSafeZone(entity) {
        return this.getNearestSafeHaven(entity);
    }

    /**
     * MASAC Helper: Find nearest predator
     */
    findNearestPredator(prey) {
        let nearest = null;
        let minDistSq = Infinity;
        for (const p of this.predators) {
            const dx = p.x - prey.x;
            const dy = p.y - prey.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = p;
            }
        }
        return nearest;
    }

    /**
     * MASAC Helper: Find nearest prey (optionally exclude self)
     */
    findNearestPreyEx(prey, excludeSelf = true) {
        let nearest = null;
        let minDistSq = Infinity;
        const nearby = this.spatialHash.query(prey.x, prey.y, 200);
        for (const agent of nearby) {
            if (agent.dead || (excludeSelf && agent === prey)) continue;
            const dx = agent.x - prey.x;
            const dy = agent.y - prey.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = agent;
            }
        }
        return nearest;
    }

    /**
     * MASAC Helper: Nearest safe haven
     */
    getNearestSafeHaven(entity) {
        if (this.safeHavens.length === 0) return null;
        let nearest = null;
        let minDistSq = Infinity;
        for (const sh of this.safeHavens) {
            const cx = sh.x + sh.w / 2;
            const cy = sh.y + sh.h / 2;
            const dx = cx - entity.x;
            const dy = cy - entity.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = { x: cx, y: cy };
            }
        }
        return nearest;
    }

    addPredator(type = 'TANK') {
        const predator = new Predator(this.width/2, this.height/2, type);
        
        // If MASAC is active, mark new predator as MASAC-controlled
        if (this.masacIntegration?.enabled) {
            predator.masacControlled = true;
        }
        
        this.predators.push(predator);
        this.logger.log('THREAT_DEPLOYED', { 
            x: this.width/2, 
            y: this.height/2, 
            type: type,
            signature: predator.config.signature
        });
    }

    addBigGuy() {
        this.addPredator('TANK');
    }

    addStalker() {
        this.addPredator('STALKER');
    }

    addSwarmer() {
        this.addPredator('SWARMER');
    }

    spawnSwarm(count = 5) {
        // Spawn multiple swarmers at once for pack effect
        for (let i = 0; i < count; i++) {
            const offsetX = (Math.random() - 0.5) * 100;
            const offsetY = (Math.random() - 0.5) * 100;
            const predator = new Predator(this.width/2 + offsetX, this.height/2 + offsetY, 'SWARMER');
            this.predators.push(predator);
        }
        this.logger.log('THREAT_DEPLOYED', { 
            x: this.width/2, 
            y: this.height/2, 
            type: 'SWARMER_PACK',
            count: count,
            signature: 'Death by 1000 cuts - Pack of coordinated swarmers'
        });
    }

    reset() {
        this.initPopulation();
        this.predators = [];
        this.food = [];
        this.generation = 1;
        this.activePanicChains = 0;
        if (this.panicChainRenderer) {
            this.panicChainRenderer.clear();
        }
        if (this.pheromoneSystem) {
            this.pheromoneSystem.clear();
        }
        if (this.survivalHeatmap) {
            this.survivalHeatmap.clear();
        }
    } 

    getSurvivalStats() {
        return this.survivalHeatmap ? this.survivalHeatmap.getStats() : null;
    } 

    /**
     * Get comprehensive metrics from the metrics collector (T2.1, T2.2)
     */
    getMetricsSummary() {
        if (!this.metricsCollector) return null;
        return this.metricsCollector.generateSummary();
    }

    /**
     * Export all metrics to JSON (T2.1)
     */
    exportMetrics() {
        if (!this.metricsCollector) return null;
        return this.metricsCollector.exportMetrics();
    }

    /**
     * Get current fear distribution percentages (T2.2)
     */
    getFearDistribution() {
        if (!this.metricsCollector) return null;
        return this.metricsCollector.getFearDistributionPercentages();
    }

    /**
     * Capture a lightweight visual state for regression testing (T1.7)
     */
    getVisualState() {
        return {
            agents: this.agents.map(a => ({
                id: a.id,
                x: Math.round(a.x),
                y: Math.round(a.y),
                state: a.brain.state,
                isEngaged: a.isEngaged
            })),
            predators: this.predators.map(p => ({
                x: Math.round(p.x),
                y: Math.round(p.y),
                state: p.state
            })),
            foodCount: this.food.length,
            massPanicActive: this.massPanicActive
        };
    }

    /**
     * Compare two visual states with a tolerance (T1.7)
     */
    static compareVisualStates(state1, state2, tolerance = 2) {
        if (!state1 || !state2) return false;
        if (state1.agents.length !== state2.agents.length) return false;
        
        // Compare agents (assuming same order for deterministic tests)
        for (let i = 0; i < state1.agents.length; i++) {
            const a1 = state1.agents[i];
            const a2 = state2.agents[i];
            
            // Check for NaN - visual regression fails if state becomes NaN
            if (Number.isNaN(a1.x) || Number.isNaN(a2.x) || 
                Number.isNaN(a1.y) || Number.isNaN(a2.y)) {
                return false; 
            }
            
            const dx = Math.abs(a1.x - a2.x);
            const dy = Math.abs(a1.y - a2.y);
            
            if (dx > tolerance || dy > tolerance) return false;
            if (a1.state !== a2.state) return false;
        }
        
        return true;
    }

    /**
     * AI CO-EVOLUTION: Run adaptation cycle for both predator and prey AI
     * This creates an evolutionary arms race between the two systems
     */
    runAICoevolutionCycle() {
        // Get survival rate from prey learning system
        const preyData = AgentLearning.exportData();
        const survivalRate = parseFloat(preyData.survivalStats.survivalRate) / 100;
        
        // Get predator success rate
        const predatorData = PredatorLearning.exportData();
        const killRate = predatorData.huntStats.successRate;
        
        // Log the competition state
        this.aiEvolutionStats.adaptationCycle++;
        
        // Balance check - if one side is dominating too much, boost the other
        if (survivalRate > 0.75) {
            // Prey winning - predators adapt faster
            PredatorLearning.huntData.adaptationMultiplier = 1.5;
            if (this.logger) {
                this.logger.log('AI_ADAPTATION', { 
                    cycle: this.aiEvolutionStats.adaptationCycle,
                    event: 'PREDATOR_BOOST',
                    survivalRate: survivalRate.toFixed(2),
                    reason: 'Prey survival too high'
                });
            }
        } else if (survivalRate < 0.25) {
            // Predators winning - prey adapt faster (reset some death records to encourage exploration)
            AgentLearning.survivalData.dangerZones.clear();
            if (this.logger) {
                this.logger.log('AI_ADAPTATION', { 
                    cycle: this.aiEvolutionStats.adaptationCycle,
                    event: 'PREY_BOOST',
                    survivalRate: survivalRate.toFixed(2),
                    reason: 'Predator kill rate too high'
                });
            }
        } else {
            // Balanced - normal adaptation
            PredatorLearning.huntData.adaptationMultiplier = 1.0;
        }
        
        this.aiEvolutionStats.lastEscapeRate = survivalRate;
    }
    
    getAIEvolutionStats() {
        return {
            cycle: this.aiEvolutionStats.adaptationCycle,
            preyLearning: AgentLearning.exportData(),
            predatorLearning: PredatorLearning.exportData(),
            balance: this.aiEvolutionStats.lastEscapeRate
        };
    }

    getLineageData() {
        // Export generational lineage data
        return {
            generations: this.analytics.generationalData.map(g => ({
                generation: g.generation,
                population: g.population,
                timestamp: g.timestamp,
                fingerprint: g.fingerprint,
                traitSnapshot: g.rawData ? {
                    avgFear: g.rawData.survivors.reduce((sum, s) => sum + s.fear, 0) / (g.rawData.survivors.length || 1),
                    avgSkill: g.rawData.survivors.reduce((sum, s) => sum + s.skill, 0) / (g.rawData.survivors.length || 1),
                    avgLeadership: g.rawData.survivors.reduce((sum, s) => sum + s.leadership, 0) / (g.rawData.survivors.length || 1),
                    avgResilience: g.rawData.survivors.reduce((sum, s) => sum + s.resilience, 0) / (g.rawData.survivors.length || 1),
                } : null
            })),
            survivalStats: this.getSurvivalStats()
        };
    }

    /**
     * Adaptive AI Quality (T12.3)
     */
    adjustAIQuality() {
        if (this.fps < 30) {
            this.aiQualityScale = Math.max(0.2, this.aiQualityScale - 0.01);
        } else if (this.fps > 55) {
            this.aiQualityScale = Math.min(1.0, this.aiQualityScale + 0.01);
        }

        // Apply scale to non-critical systems
        this.config.metricsInterval = Math.floor(60 / this.aiQualityScale);
        this.config.saveInterval = Math.floor(300 / this.aiQualityScale);
        
        // Dynamic LOD adjustments (T5.5 extension)
        if (this.lodSystem) {
            this.lodSystem.thresholds.HIGH = 300 * this.aiQualityScale;
            this.lodSystem.thresholds.MEDIUM = 700 * this.aiQualityScale;
        }
    }

    /**
     * MASAC Deep RL Integration
     */
    initializeMASAC() {
        if (this.masacIntegration?.isInitialized) {
            console.log('[Simulation] MASAC already initialized');
            return false;
        }
        
        // Mark all current predators and agents as MASAC-controlled
        this.predators.forEach(p => {
            p.masacControlled = true;
        });
        this.agents.forEach(a => {
            a.masacControlled = true;
        });
        
        // Initialize MASAC (it was created in constructor, now initialize it)
        if (!this.masacIntegration) {
            this.masacIntegration = new MASACIntegration(this);
        }
        this.masacIntegration.initialize();
        
        console.log('[Simulation] MASAC initialized:', {
            predators: this.predators.length,
            prey: this.agents.length
        });
        
        return true;
    }

    getMASACMetrics() {
        if (!this.masacIntegration) {
            return null;
        }
        return this.masacIntegration.getMetrics();
    }

    exportMASACData() {
        if (!this.masacIntegration) {
            return null;
        }
        return this.masacIntegration.exportResearchData();
    }

    saveMASACModels() {
        if (!this.masacIntegration) {
            return null;
        }
        return this.masacIntegration.saveModels();
    }

    /**
     * Phase 2: High-Performance Logging Control
     */
    async startDataLogging(prefix) {
        await this.dataBridge.startSession(prefix);
    }

    async stopDataLogging() {
        await this.dataBridge.stopSession();
    }
}