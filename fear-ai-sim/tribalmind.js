/**
 * Tribal Mind: LLM-Aided Multi-Agent Reinforcement Learning (LAMARL) (Visionary Pillar 1)
 * 
 * Simulates a "High-Level Tribal Mind" that provides semantic goals and 
 * bootstraps agent policies based on collective experience.
 */

export const TRIBAL_ETHOS = {
    PROTECTIVE: 'PROTECTIVE', // Values family over hunger
    EXPANSIVE: 'EXPANSIVE',   // Values curiosity and exploration
    STOIC: 'STOIC',           // High fear resistance, efficient resource gathering
    AGGRESSIVE: 'AGGRESSIVE'  // Seeks to eliminate threats
};

export class TribalMind {
    constructor(tribeId, ethos = TRIBAL_ETHOS.PROTECTIVE) {
        this.tribeId = tribeId;
        this.ethos = ethos;
        
        // Semantic Constraints (Pillar 1.2)
        this.constraints = this.generateInitialConstraints();
        
        // Collective Knowledge (Shared reward modifiers)
        this.rewardModifiers = {
            fleeSuccess: 1.0,
            gatherSuccess: 1.0,
            threatEncounter: -1.0
        };

        // Phase 15.2: Tribal Memory Consolidation (The "Shared Map")
        this.sharedDangerMap = new Map(); // key: "x,y" -> { threatIntensity, confidence, lastUpdated }
    }

    /**
     * Consolidate an individual's memory into the tribal mind
     */
    consolidateMemory(memoryEntry) {
        const gridX = Math.floor(memoryEntry.x / 100) * 100;
        const gridY = Math.floor(memoryEntry.y / 100) * 100;
        const key = `${gridX},${gridY}`;

        const current = this.sharedDangerMap.get(key) || { intensity: 0, confidence: 0 };
        
        // Bayesian-style update: weigh by individual's memory strength
        const weight = memoryEntry.strength * memoryEntry.confidence;
        const newIntensity = (current.intensity * current.confidence + memoryEntry.intensity * weight) / (current.confidence + weight + 0.1);
        const newConfidence = Math.min(1.0, current.confidence + weight * 0.1);

        this.sharedDangerMap.set(key, {
            intensity: newIntensity,
            confidence: newConfidence,
            lastUpdated: Date.now()
        });
    }

    /**
     * Get shared tribal fear for an agent at a specific position
     */
    getTribalFearAt(x, y) {
        const gridX = Math.floor(x / 100) * 100;
        const gridY = Math.floor(y / 100) * 100;
        const key = `${gridX},${gridY}`;
        const entry = this.sharedDangerMap.get(key);
        
        return entry ? entry.intensity * entry.confidence : 0;
    }

    generateInitialConstraints() {
        switch(this.ethos) {
            case TRIBAL_ETHOS.PROTECTIVE:
                return ["Always travel in pairs near high-risk zones", "Prioritize rescue over food"];
            case TRIBAL_ETHOS.EXPANSIVE:
                return ["Seek unexplored sectors", "Identify all safe havens"];
            case TRIBAL_ETHOS.STOIC:
                return ["Minimize adrenaline usage", "Gather food even under moderate threat"];
            case TRIBAL_ETHOS.AGGRESSIVE:
                return ["Track predator patterns", "Coordinated distraction maneuvers"];
            default:
                return [];
        }
    }

    /**
     * Bootstrap policies for a new agent (Pillar 1.3)
     * Returns a set of GOAP cost modifiers based on tribal ethos.
     */
    getPolicyBootstrap() {
        const modifiers = {};
        
        if (this.ethos === TRIBAL_ETHOS.PROTECTIVE) {
            modifiers.distract = 0.5; // Cheaper to protect
            modifiers.flee = 0.8;
        } else if (this.ethos === TRIBAL_ETHOS.AGGRESSIVE) {
            modifiers.attack = 0.4; // Very cheap to attack
            modifiers.flee = 1.2;   // More expensive to flee
        } else if (this.ethos === TRIBAL_ETHOS.STOIC) {
            modifiers.eat_food = 0.7;
            modifiers.hide = 0.8;
        }
        
        return modifiers;
    }

    /**
     * Evaluate tribal performance and update "Collective Knowledge"
     */
    updateKnowledge(successes, failures) {
        // In a real LAMARL system, this would be an LLM summarization step.
        // Here we adjust reward modifiers based on rates.
        if (successes.flee > failures.flee) {
            this.rewardModifiers.fleeSuccess += 0.01;
        } else {
            this.rewardModifiers.fleeSuccess -= 0.01;
        }
    }
}

export class GlobalTribalStrategist {
    constructor() {
        this.tribes = new Map(); // tribeId -> TribalMind
    }

    registerTribe(tribeId) {
        if (!this.tribes.has(tribeId)) {
            const ethosKeys = Object.keys(TRIBAL_ETHOS);
            const randomEthos = TRIBAL_ETHOS[ethosKeys[Math.floor(Math.random() * ethosKeys.length)]];
            this.tribes.set(tribeId, new TribalMind(tribeId, randomEthos));
            console.log(`[STRATEGIST] New Tribe Registered: ${tribeId} with Ethos: ${randomEthos}`);
        }
        return this.tribes.get(tribeId);
    }

    getTribe(tribeId) {
        return this.tribes.get(tribeId);
    }
}
