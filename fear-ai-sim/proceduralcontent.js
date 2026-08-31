/**
 * Procedural Content Generation System (T4.6)
 * 
 * Algorithmic generation of scenarios, threats, and environments
 * based on player type, session arc, and real-time metrics.
 * 
 * Features:
 * - Dynamic threat placement based on fear levels
 * - Adaptive difficulty scaling
 * - Environment generation with fear modifiers
 * - Resource distribution algorithms
 * - Safe zone generation
 */

import { PLAYER_TYPES } from './playerclassification.js';
import { SESSION_PHASES } from './fearpacing.js';

/**
 * Configuration for procedural generation
 */
export const PCG_CONFIG = {
    // Map dimensions
    mapWidth: 2400,
    mapHeight: 1600,
    
    // Threat settings
    maxThreats: 10,
    threatSpacing: 200,     // Minimum distance between threats
    safeZoneRadius: 150,    // Safe haven size
    
    // Difficulty scaling
    difficultySteps: 5,
    minIntensity: 0.2,
    maxIntensity: 1.0,
    
    // Environment modifiers
    darknessLevels: 3,
    weatherTypes: ['clear', 'fog', 'storm'],
    
    // Resource settings
    foodDensity: 0.001,     // Food per unit area
    obstacleDensity: 0.0005 // Obstacles per unit area
};

/**
 * Generates procedural scenarios based on player state
 */
export class ScenarioGenerator {
    constructor(config = {}) {
        this.config = { ...PCG_CONFIG, ...config };
        this.scenarios = [];
        this.activeThreats = [];
        this.safeZones = [];
        this.generatedCount = 0;
    }

    /**
     * Generate a complete scenario for current session state
     * @param {Object} sessionState - Current session arc state
     * @param {string} playerType - PLAYER_TYPES value
     * @param {Object} metrics - Current simulation metrics
     * @returns {Object} Generated scenario
     */
    generateScenario(sessionState, playerType, metrics) {
        const intensity = sessionState.intensityMultiplier;
        const phase = sessionState.phase;
        
        // Generate scenario based on phase and player type
        const scenario = {
            id: `scenario_${this.generatedCount++}`,
            phase: phase,
            intensity: intensity,
            playerType: playerType,
            timestamp: Date.now(),
            
            threats: this.generateThreats(intensity, playerType, metrics),
            safeZones: this.generateSafeZones(intensity, playerType),
            environment: this.generateEnvironment(phase, intensity),
            resources: this.generateResources(intensity),
            objectives: this.generateObjectives(phase, playerType),
            
            // Spatial indexing for efficient queries
            spatialIndex: null
        };
        
        // Build spatial index
        scenario.spatialIndex = this.buildSpatialIndex(scenario);
        
        this.scenarios.push(scenario);
        this.activeThreats = scenario.threats;
        this.safeZones = scenario.safeZones;
        
        return scenario;
    }

    /**
     * Generate threats based on intensity and player type
     */
    generateThreats(intensity, playerType, metrics) {
        const threats = [];
        const count = this.calculateThreatCount(intensity, playerType);
        
        for (let i = 0; i < count; i++) {
            const threat = this.createThreat(i, intensity, playerType, threats);
            threats.push(threat);
        }
        
        return threats;
    }

    /**
     * Calculate number of threats based on parameters
     */
    calculateThreatCount(intensity, playerType) {
        let baseCount = Math.floor(2 + intensity * 6); // 2-8 threats
        
        // Adjust for player type
        const typeModifiers = {
            [PLAYER_TYPES.THRILL_SEEKER]: 1.5,
            [PLAYER_TYPES.CHALLENGE_SEEKER]: 1.3,
            [PLAYER_TYPES.CASUAL_EXPLORER]: 0.7,
            [PLAYER_TYPES.ANXIOUS_AVOIDER]: 0.5,
            [PLAYER_TYPES.SOCIAL_PLAYER]: 0.9,
            [PLAYER_TYPES.STORY_IMMERSIVE]: 0.8
        };
        
        baseCount *= typeModifiers[playerType] || 1.0;
        
        return Math.min(Math.floor(baseCount), this.config.maxThreats);
    }

    /**
     * Create a single threat
     */
    createThreat(index, intensity, playerType, existingThreats) {
        let x, y;
        let attempts = 0;
        const maxAttempts = 100;
        
        // Find valid position (not too close to other threats)
        do {
            x = Math.random() * this.config.mapWidth;
            y = Math.random() * this.config.mapHeight;
            attempts++;
        } while (attempts < maxAttempts && this.isTooCloseToThreats(x, y, existingThreats));
        
        // Calculate threat parameters
        const difficulty = this.calculateThreatDifficulty(intensity, playerType);
        const type = this.selectThreatType(intensity, playerType);
        
        return {
            id: `threat_${index}`,
            x: x,
            y: y,
            type: type,
            difficulty: difficulty,
            radius: 30 + difficulty * 50,
            speed: 0.5 + difficulty * 1.5,
            detectionRange: 100 + difficulty * 200,
            
            // Behavioral modifiers
            aggression: difficulty,
            patrolRadius: 100 + difficulty * 200,
            stalkTime: 2000 + (1 - difficulty) * 3000,
            
            // State
            active: true,
            awareness: 0,
            lastSeen: null
        };
    }

    /**
     * Check if position is too close to existing threats
     */
    isTooCloseToThreats(x, y, threats) {
        for (const threat of threats) {
            const dx = x - threat.x;
            const dy = y - threat.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < this.config.threatSpacing) {
                return true;
            }
        }
        return false;
    }

    /**
     * Calculate difficulty for a threat
     */
    calculateThreatDifficulty(intensity, playerType) {
        let difficulty = intensity;
        
        // Player type adjustments
        switch (playerType) {
            case PLAYER_TYPES.THRILL_SEEKER:
                difficulty = Math.min(difficulty * 1.2, 1.0);
                break;
            case PLAYER_TYPES.ANXIOUS_AVOIDER:
                difficulty = Math.max(difficulty * 0.7, this.config.minIntensity);
                break;
            case PLAYER_TYPES.CASUAL_EXPLORER:
                difficulty = Math.max(difficulty * 0.8, this.config.minIntensity);
                break;
        }
        
        // Add some variance
        difficulty += (Math.random() - 0.5) * 0.2;
        return Math.max(this.config.minIntensity, Math.min(1.0, difficulty));
    }

    /**
     * Select threat type based on intensity and player type
     */
    selectThreatType(intensity, playerType) {
        const types = ['STALKER', 'HUNTER', 'AMBUSH', 'SWARM'];
        
        // Weight by intensity
        const weights = {
            'STALKER': 0.3 + intensity * 0.2,
            'HUNTER': 0.2 + intensity * 0.3,
            'AMBUSH': 0.2 + (1 - intensity) * 0.2,
            'SWARM': Math.max(0, intensity - 0.7) * 1.5
        };
        
        // Player type preferences
        if (playerType === PLAYER_TYPES.THRILL_SEEKER) {
            weights['HUNTER'] += 0.2;
            weights['STALKER'] += 0.1;
        } else if (playerType === PLAYER_TYPES.ANXIOUS_AVOIDER) {
            weights['AMBUSH'] += 0.2;
        }
        
        // Weighted random selection
        const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        
        for (const type of types) {
            random -= weights[type];
            if (random <= 0) return type;
        }
        
        return types[0];
    }

    /**
     * Generate safe zones
     */
    generateSafeZones(intensity, playerType) {
        const zones = [];
        const count = this.calculateSafeZoneCount(intensity, playerType);
        
        for (let i = 0; i < count; i++) {
            // Place away from threats
            let x, y, attempts = 0;
            do {
                x = Math.random() * this.config.mapWidth;
                y = Math.random() * this.config.mapHeight;
                attempts++;
            } while (attempts < 50 && this.isTooCloseToThreats(x, y, this.activeThreats));
            
            zones.push({
                id: `safe_${i}`,
                x: x,
                y: y,
                radius: this.config.safeZoneRadius,
                comfort: 1.0 - intensity * 0.5,
                resources: ['rest', 'food', 'healing'],
                active: true
            });
        }
        
        return zones;
    }

    /**
     * Calculate number of safe zones
     */
    calculateSafeZoneCount(intensity, playerType) {
        let count = Math.max(1, 3 - Math.floor(intensity * 2));
        
        if (playerType === PLAYER_TYPES.ANXIOUS_AVOIDER) {
            count += 1;
        } else if (playerType === PLAYER_TYPES.THRILL_SEEKER) {
            count = Math.max(1, count - 1);
        }
        
        return count;
    }

    /**
     * Generate environment modifiers
     */
    generateEnvironment(phase, intensity) {
        const weather = this.selectWeather(phase, intensity);
        const darkness = this.calculateDarkness(phase, intensity);
        
        return {
            weather: weather,
            darkness: darkness,
            visibility: this.calculateVisibility(weather, darkness),
            temperature: this.calculateTemperature(phase),
            windSpeed: weather === 'storm' ? 20 + Math.random() * 30 : 0,
            
            // Ambient sound modifiers
            ambientVolume: 0.3 + darkness * 0.4,
            reverbAmount: weather === 'fog' ? 0.6 : 0.3,
            
            // Fear modifiers
            fearMultiplier: 1.0 + darkness * 0.3 + (weather === 'storm' ? 0.2 : 0)
        };
    }

    /**
     * Select weather based on phase and intensity
     */
    selectWeather(phase, intensity) {
        if (intensity > 0.8) return 'storm';
        if (intensity > 0.5) return Math.random() > 0.5 ? 'fog' : 'clear';
        
        // Recovery phases have better weather
        if (phase === SESSION_PHASES.RECOVERY) return 'clear';
        if (phase === SESSION_PHASES.BUILDUP) return 'fog';
        
        return 'clear';
    }

    /**
     * Calculate darkness level (0-1)
     */
    calculateDarkness(phase, intensity) {
        // Night/dark phases
        const nightPhases = [SESSION_PHASES.TENSION, SESSION_PHASES.CLIMAX];
        let baseDarkness = nightPhases.includes(phase) ? 0.6 : 0.2;
        
        // Intensity increases darkness
        baseDarkness += intensity * 0.3;
        
        return Math.min(1.0, baseDarkness);
    }

    /**
     * Calculate visibility based on environment
     */
    calculateVisibility(weather, darkness) {
        let visibility = 1.0 - darkness * 0.5;
        
        if (weather === 'fog') visibility *= 0.6;
        if (weather === 'storm') visibility *= 0.4;
        
        return Math.max(0.1, visibility);
    }

    /**
     * Calculate temperature for ambience
     */
    calculateTemperature(phase) {
        const baseTemp = 20; // Celsius
        
        switch (phase) {
            case SESSION_PHASES.RECOVERY:
                return baseTemp + 2;
            case SESSION_PHASES.TENSION:
                return baseTemp - 3;
            case SESSION_PHASES.CLIMAX:
                return baseTemp - 5;
            default:
                return baseTemp;
        }
    }

    /**
     * Generate resources (food, health, etc.)
     */
    generateResources(intensity) {
        const area = this.config.mapWidth * this.config.mapHeight;
        const foodCount = Math.floor(area * this.config.foodDensity * (1 - intensity * 0.3));
        const resources = [];
        
        for (let i = 0; i < foodCount; i++) {
            resources.push({
                id: `food_${i}`,
                type: 'food',
                x: Math.random() * this.config.mapWidth,
                y: Math.random() * this.config.mapHeight,
                value: 20 + Math.random() * 30,
                respawnTime: 30000
            });
        }
        
        return resources;
    }

    /**
     * Generate scenario objectives based on phase
     */
    generateObjectives(phase, playerType) {
        const objectives = [];
        
        switch (phase) {
            case SESSION_PHASES.EXPOSITION:
                objectives.push({
                    type: 'EXPLORE',
                    description: 'Explore the environment safely',
                    target: null,
                    optional: true
                });
                break;
                
            case SESSION_PHASES.BUILDUP:
                objectives.push({
                    type: 'SURVIVE',
                    description: 'Survive increasing tension',
                    duration: 60,
                    optional: false
                });
                break;
                
            case SESSION_PHASES.TENSION:
                objectives.push({
                    type: 'EVADE',
                    description: 'Evade threats without detection',
                    target: 'all_threats',
                    optional: false
                });
                break;
                
            case SESSION_PHASES.CLIMAX:
            case 'climax':
                objectives.push({
                    type: 'ESCAPE',
                    description: 'Reach the safe zone',
                    target: 'nearest_safe',
                    optional: false
                });
                break;
                
            case SESSION_PHASES.RESOLUTION:
                objectives.push({
                    type: 'RECOVER',
                    description: 'Recover in safe zone',
                    target: 'safe_zone',
                    optional: true
                });
                break;
        }
        
        // Player-specific objectives
        if (playerType === PLAYER_TYPES.CHALLENGE_SEEKER) {
            objectives.push({
                type: 'CHALLENGE',
                description: 'Face a threat directly',
                optional: true,
                bonus: 100
            });
        }
        
        return objectives;
    }

    /**
     * Build spatial index for efficient queries
     */
    buildSpatialIndex(scenario) {
        // Simple grid-based spatial index
        const cellSize = 200;
        const cols = Math.ceil(this.config.mapWidth / cellSize);
        const rows = Math.ceil(this.config.mapHeight / cellSize);
        const grid = new Array(cols * rows).fill(null).map(() => []);
        
        // Insert threats
        for (const threat of scenario.threats) {
            const col = Math.floor(threat.x / cellSize);
            const row = Math.floor(threat.y / cellSize);
            const idx = row * cols + col;
            if (idx >= 0 && idx < grid.length) {
                grid[idx].push({ type: 'threat', obj: threat });
            }
        }
        
        // Insert safe zones
        for (const zone of scenario.safeZones) {
            const col = Math.floor(zone.x / cellSize);
            const row = Math.floor(zone.y / cellSize);
            const idx = row * cols + col;
            if (idx >= 0 && idx < grid.length) {
                grid[idx].push({ type: 'safe', obj: zone });
            }
        }
        
        return {
            cellSize,
            cols,
            rows,
            grid
        };
    }

    /**
     * Query threats near a position
     */
    queryThreatsNear(x, y, radius, scenario = null) {
        const scn = scenario || this.scenarios[this.scenarios.length - 1];
        if (!scn || !scn.spatialIndex) return [];
        
        const { cellSize, cols, rows, grid } = scn.spatialIndex;
        const cellRadius = Math.ceil(radius / cellSize);
        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        
        const threats = [];
        const radiusSq = radius * radius;
        
        for (let r = row - cellRadius; r <= row + cellRadius; r++) {
            for (let c = col - cellRadius; c <= col + cellRadius; c++) {
                if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
                
                const idx = r * cols + c;
                for (const item of grid[idx]) {
                    if (item.type === 'threat') {
                        const dx = item.obj.x - x;
                        const dy = item.obj.y - y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq <= radiusSq) {
                            threats.push(item.obj);
                        }
                    }
                }
            }
        }
        
        return threats;
    }

    /**
     * Adapt scenario based on real-time metrics
     */
    adaptScenario(scenario, metrics) {
        const adapted = { ...scenario };
        
        // Adjust threat aggression based on player performance
        if (metrics.deathCount > 3) {
            // Make it slightly easier
            for (const threat of adapted.threats) {
                threat.aggression *= 0.9;
                threat.speed *= 0.95;
            }
        } else if (metrics.averageFear < 0.3) {
            // Make it harder
            for (const threat of adapted.threats) {
                threat.aggression = Math.min(1.0, threat.aggression * 1.1);
            }
        }
        
        // Adjust safe zones if player is struggling
        if (metrics.deathCount > 5) {
            adapted.safeZones.push({
                id: `safe_emergency_${Date.now()}`,
                x: metrics.playerX || this.config.mapWidth / 2,
                y: metrics.playerY || this.config.mapHeight / 2,
                radius: this.config.safeZoneRadius * 1.5,
                comfort: 0.9,
                resources: ['rest', 'food', 'healing'],
                active: true,
                emergency: true
            });
        }
        
        return adapted;
    }

    /**
     * Get generator statistics
     */
    getStats() {
        return {
            scenariosGenerated: this.generatedCount,
            activeThreats: this.activeThreats.length,
            safeZones: this.safeZones.length,
            averageThreatsPerScenario: this.scenarios.length > 0 
                ? this.scenarios.reduce((sum, s) => sum + s.threats.length, 0) / this.scenarios.length 
                : 0
        };
    }

    /**
     * Reset generator state
     */
    reset() {
        this.scenarios = [];
        this.activeThreats = [];
        this.safeZones = [];
        this.generatedCount = 0;
    }

    /**
     * Serialize generator state
     */
    serialize() {
        return {
            config: this.config,
            scenarios: this.scenarios,
            generatedCount: this.generatedCount
        };
    }

    /**
     * Deserialize generator state
     */
    deserialize(data) {
        this.config = { ...PCG_CONFIG, ...data.config };
        this.scenarios = data.scenarios || [];
        this.generatedCount = data.generatedCount || 0;
        
        if (this.scenarios.length > 0) {
            const last = this.scenarios[this.scenarios.length - 1];
            this.activeThreats = last.threats;
            this.safeZones = last.safeZones;
        }
    }
}

/**
 * Environment generator for terrain and obstacles
 */
export class EnvironmentGenerator {
    constructor(config = {}) {
        this.config = {
            width: 2400,
            height: 1600,
            obstacleDensity: 0.0005,
            ...config
        };
        this.obstacles = [];
        this.terrain = [];
    }

    /**
     * Generate terrain with fear modifiers
     */
    generateTerrain(seed = Date.now()) {
        this.obstacles = [];
        this.terrain = [];
        
        const area = this.config.width * this.config.height;
        const obstacleCount = Math.floor(area * this.config.obstacleDensity);
        
        // Generate obstacles (cover, hiding spots, choke points)
        for (let i = 0; i < obstacleCount; i++) {
            this.obstacles.push({
                id: `obstacle_${i}`,
                type: Math.random() > 0.5 ? 'cover' : 'hiding',
                x: Math.random() * this.config.width,
                y: Math.random() * this.config.height,
                width: 20 + Math.random() * 60,
                height: 20 + Math.random() * 60,
                fearModifier: Math.random() > 0.7 ? -0.2 : 0, // Some reduce fear (cover)
                blocksVision: Math.random() > 0.3,
                blocksMovement: Math.random() > 0.1
            });
        }
        
        // Generate terrain zones with fear modifiers
        const zoneCount = 8;
        for (let i = 0; i < zoneCount; i++) {
            this.terrain.push({
                id: `terrain_${i}`,
                type: this.selectTerrainType(),
                x: Math.random() * this.config.width,
                y: Math.random() * this.config.height,
                radius: 100 + Math.random() * 200,
                fearModifier: this.calculateTerrainFear(i),
                description: this.generateTerrainDescription(i)
            });
        }
        
        return {
            obstacles: this.obstacles,
            terrain: this.terrain
        };
    }

    /**
     * Select terrain type
     */
    selectTerrainType() {
        const types = ['open', 'forest', 'ruins', 'corridor', 'elevated', 'depression'];
        const weights = [0.2, 0.2, 0.15, 0.15, 0.15, 0.15];
        
        const random = Math.random();
        let cumulative = 0;
        
        for (let i = 0; i < types.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) return types[i];
        }
        
        return types[0];
    }

    /**
     * Calculate fear modifier for terrain
     */
    calculateTerrainFear(index) {
        const modifiers = {
            'open': -0.1,
            'forest': 0.1,
            'ruins': 0.2,
            'corridor': 0.15,
            'elevated': -0.05,
            'depression': 0.1
        };
        
        return modifiers[this.terrain[index]?.type] || 0;
    }

    /**
     * Generate terrain description
     */
    generateTerrainDescription(index) {
        const descriptions = {
            'open': 'An open area with clear sightlines',
            'forest': 'Dense vegetation providing cover',
            'ruins': 'Crumbling structures with hidden dangers',
            'corridor': 'Narrow passage with limited escape routes',
            'elevated': 'High ground with tactical advantage',
            'depression': 'Low area with limited visibility'
        };
        
        return descriptions[this.terrain[index]?.type] || 'Unknown terrain';
    }

    /**
     * Query obstacles at position
     */
    queryObstaclesAt(x, y, radius = 50) {
        const radiusSq = radius * radius;
        return this.obstacles.filter(obs => {
            const dx = obs.x - x;
            const dy = obs.y - y;
            return dx * dx + dy * dy <= radiusSq;
        });
    }

    /**
     * Get terrain fear modifier at position
     */
    getFearModifierAt(x, y) {
        let modifier = 0;
        
        for (const zone of this.terrain) {
            const dx = zone.x - x;
            const dy = zone.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < zone.radius) {
                const influence = 1 - (dist / zone.radius);
                modifier += zone.fearModifier * influence;
            }
        }
        
        return modifier;
    }

    /**
     * Serialize environment
     */
    serialize() {
        return {
            config: this.config,
            obstacles: this.obstacles,
            terrain: this.terrain
        };
    }

    /**
     * Deserialize environment
     */
    deserialize(data) {
        this.config = { ...this.config, ...data.config };
        this.obstacles = data.obstacles || [];
        this.terrain = data.terrain || [];
    }
}

/**
 * Main procedural content manager
 */
export class ProceduralContentManager {
    constructor() {
        this.scenarioGenerator = new ScenarioGenerator();
        this.environmentGenerator = new EnvironmentGenerator();
        this.currentScenario = null;
        this.currentEnvironment = null;
        this.history = [];
    }

    /**
     * Generate complete content for current session state
     */
    generateContent(sessionState, playerType, metrics) {
        // Generate scenario
        this.currentScenario = this.scenarioGenerator.generateScenario(
            sessionState, playerType, metrics
        );
        
        // Generate environment
        this.currentEnvironment = this.environmentGenerator.generateTerrain();
        
        // Store in history
        this.history.push({
            scenario: this.currentScenario,
            environment: this.currentEnvironment,
            timestamp: Date.now()
        });
        
        return {
            scenario: this.currentScenario,
            environment: this.currentEnvironment
        };
    }

    /**
     * Adapt content based on real-time feedback
     */
    adaptContent(metrics) {
        if (!this.currentScenario) return null;
        
        this.currentScenario = this.scenarioGenerator.adaptScenario(
            this.currentScenario, metrics
        );
        
        return this.currentScenario;
    }

    /**
     * Get threats near position
     */
    getThreatsNear(x, y, radius) {
        return this.scenarioGenerator.queryThreatsNear(x, y, radius, this.currentScenario);
    }

    /**
     * Get safe zones
     */
    getSafeZones() {
        return this.currentScenario?.safeZones || [];
    }

    /**
     * Get environment fear modifier at position
     */
    getEnvironmentFearAt(x, y) {
        return this.environmentGenerator.getFearModifierAt(x, y);
    }

    /**
     * Get manager statistics
     */
    getStats() {
        return {
            scenarios: this.scenarioGenerator.getStats(),
            historyCount: this.history.length,
            hasActiveScenario: !!this.currentScenario
        };
    }

    /**
     * Reset all content
     */
    reset() {
        this.scenarioGenerator.reset();
        this.currentScenario = null;
        this.currentEnvironment = null;
        this.history = [];
    }

    /**
     * Serialize state
     */
    serialize() {
        return {
            scenarioGenerator: this.scenarioGenerator.serialize(),
            environmentGenerator: this.environmentGenerator.serialize(),
            currentScenario: this.currentScenario,
            currentEnvironment: this.currentEnvironment,
            history: this.history
        };
    }

    /**
     * Deserialize state
     */
    deserialize(data) {
        this.scenarioGenerator.deserialize(data.scenarioGenerator || {});
        this.environmentGenerator.deserialize(data.environmentGenerator || {});
        this.currentScenario = data.currentScenario;
        this.currentEnvironment = data.currentEnvironment;
        this.history = data.history || [];
    }
}

export default ProceduralContentManager;
