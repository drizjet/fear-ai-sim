/**
 * Advanced Social Dynamics System (T4.8)
 *
 * Complex social behaviors including leadership, trust, betrayal,
 * culture formation, and emergent group dynamics.
 *
 * Features:
 * - Leadership emergence and succession
 * - Trust/betrayal mechanics with reputation tracking
 * - Cultural transmission between generations
 * - Social hierarchy formation
 * - In-group/out-group dynamics
 * - Social influence and conformity
 */

import { PLAYER_TYPES } from './playerclassification.js';

/**
 * Social relationship types
 */
export const RELATIONSHIP_TYPES = {
    ALLY: 'ALLY',
    RIVAL: 'RIVAL',
    NEUTRAL: 'NEUTRAL',
    FAMILY: 'FAMILY',
    MENTOR: 'MENTOR',
    PROTEGE: 'PROTEGE'
};

/**
 * Leadership styles
 */
export const LEADERSHIP_STYLES = {
    CHARISMATIC: 'CHARISMATIC',      // High influence, inspires loyalty
    TACTICAL: 'TACTICAL',            // Good at planning, resource management
    PROTECTIVE: 'PROTECTIVE',        // Prioritizes group safety
    DOMINANT: 'DOMINANT',            // Commands through strength
    DEMOCRATIC: 'DEMOCRATIC'         // Decisions by consensus
};

/**
 * Cultural traits that can be transmitted
 */
export const CULTURAL_TRAITS = {
    AGGRESSIVE: 'AGGRESSIVE',        // More likely to attack threats
    CAUTIOUS: 'CAUTIOUS',            // More likely to hide/flee
    COOPERATIVE: 'COOPERATIVE',      // Better group coordination
    INDEPENDENT: 'INDEPENDENT',      // Acts alone, less group influence
    TRADITIONAL: 'TRADITIONAL',      // Values family/social bonds
    INNOVATIVE: 'INNOVATIVE'         // Adapts quickly, experiments
};

/**
 * Manages advanced social dynamics
 */
export class SocialDynamicsEngine {
    constructor() {
        // Social networks
        this.relationships = new Map();      // agentId -> Map(targetId -> relationship)
        this.reputation = new Map();         // agentId -> reputation score
        this.trustNetwork = new Map();       // agentId -> Map(targetId -> trust level)

        // Leadership
        this.leaders = new Map();            // groupId -> leaderId
        this.leadershipQualities = new Map(); // agentId -> leadership scores
        this.successionChains = new Map();   // leaderId -> successorId

        // Culture
        this.cultures = new Map();           // groupId -> cultural traits
        this.culturalTransmission = new Map(); // trait -> transmission rate

        // Hierarchy
        this.hierarchies = new Map();        // groupId -> ranked agent list
        this.socialClasses = new Map();      // agentId -> class level

        // Group dynamics
        this.inGroups = new Map();           // agentId -> Set of allies
        this.outGroups = new Map();          // agentId -> Set of rivals
        
        // Phase 7: Tribal Relations (T7.5)
        this.tribeMap = new Map();           // agentId -> tribeId
        this.tribalHostility = new Map();    // tribeId -> Map(targetTribeId -> hostilityLevel)
        this.tribes = new Set();

        // Phase 11: Intrinsic Fear Conditioning (T11.4)
        this.tribalDangerMap = new Map();    // tribeId -> Map(markerType -> dangerLevel)

        // Event history for social memory
        this.socialMemory = [];              // List of significant social events
        this.maxMemorySize = 1000;
    }

    /**
     * Initialize social dynamics for an agent
     */
    initializeAgent(agentId, traits = {}) {
        // Initialize relationship map
        this.relationships.set(agentId, new Map());

        // Initialize trust network
        this.trustNetwork.set(agentId, new Map());

        // Initialize reputation
        this.reputation.set(agentId, {
            score: 0.5,                      // 0-1, starts neutral
            reliability: 0.5,                // How consistent is their behavior
            altruism: traits.altruism || 0.5, // Tendency to help others
            aggression: traits.aggression || 0.3 // Tendency to attack
        });

        // Initialize leadership qualities
        this.leadershipQualities.set(agentId, {
            charisma: traits.charisma !== undefined ? traits.charisma : 0.5,
            tacticalSkill: traits.intelligence !== undefined ? traits.intelligence : 0.5,
            protectiveInstinct: traits.nurturing !== undefined ? traits.nurturing : 0.5,
            dominance: traits.aggression !== undefined ? traits.aggression : 0.5,
            consensusBuilding: traits.sociality !== undefined ? traits.sociality : 0.5,
            overall: 0 // Calculated later
        });

        // Calculate overall leadership
        this.updateLeadershipScore(agentId);

        // Initialize in/out groups
        this.inGroups.set(agentId, new Set());
        this.outGroups.set(agentId, new Set());

        // Initialize social class
        this.socialClasses.set(agentId, 0);
    }

    /**
     * Update leadership score based on qualities
     */
    updateLeadershipScore(agentId) {
        const qualities = this.leadershipQualities.get(agentId);
        if (!qualities) return;

        // Weighted average of leadership qualities
        qualities.overall = (
            qualities.charisma * 0.25 +
            qualities.tacticalSkill * 0.25 +
            qualities.protectiveInstinct * 0.2 +
            qualities.dominance * 0.15 +
            qualities.consensusBuilding * 0.15
        );
    }

    /**
     * Set relationship between two agents
     */
    setRelationship(agentId, targetId, type, strength = 0.5) {
        // Ensure agents are initialized
        if (!this.relationships.has(agentId)) {
            this.initializeAgent(agentId);
        }
        if (!this.relationships.has(targetId)) {
            this.initializeAgent(targetId);
        }

        const agentRels = this.relationships.get(agentId);
        const existing = agentRels.get(targetId);

        // Create or update relationship
        const relationship = {
            type: type,
            strength: strength,
            history: existing ? existing.history : [],
            formed: existing ? existing.formed : Date.now(),
            lastInteraction: Date.now()
        };

        agentRels.set(targetId, relationship);

        // Bidirectional relationships (not always symmetric)
        if (type === RELATIONSHIP_TYPES.FAMILY || type === RELATIONSHIP_TYPES.RIVAL) {
            const targetRels = this.relationships.get(targetId);
            if (!targetRels.has(agentId) || targetRels.get(agentId).type !== type) {
                targetRels.set(agentId, {
                    ...relationship,
                    strength: type === RELATIONSHIP_TYPES.RIVAL ? strength : strength * 0.9
                });
            }
        }

        // Update in/out groups
        if (type === RELATIONSHIP_TYPES.ALLY || type === RELATIONSHIP_TYPES.FAMILY) {
            this.inGroups.get(agentId).add(targetId);
        } else if (type === RELATIONSHIP_TYPES.RIVAL) {
            this.outGroups.get(agentId).add(targetId);
        }

        // Record event
        this.recordSocialEvent('RELATIONSHIP_FORMED', {
            agentId, targetId, type, strength
        });
    }

    /**
     * Get relationship between two agents
     */
    getRelationship(agentId, targetId) {
        const agentRels = this.relationships.get(agentId);
        if (!agentRels) return null;

        return agentRels.get(targetId) || {
            type: RELATIONSHIP_TYPES.NEUTRAL,
            strength: 0
        };
    }

    /**
     * Update trust between agents
     */
    updateTrust(agentId, targetId, delta, reason = '') {
        const agentTrust = this.trustNetwork.get(agentId);
        if (!agentTrust) return;

        const currentTrust = agentTrust.get(targetId) || 0.5;
        const newTrust = Math.max(0, Math.min(1, currentTrust + delta));

        agentTrust.set(targetId, newTrust);

        // Record significant trust changes
        if (Math.abs(delta) > 0.2) {
            this.recordSocialEvent(delta > 0 ? 'TRUST_GAINED' : 'TRUST_LOST', {
                agentId, targetId, delta, reason, newTrust
            });
        }

        // Betrayal detection
        if (delta < -0.3 && currentTrust > 0.7) {
            this.handleBetrayal(agentId, targetId, reason);
        }

        return newTrust;
    }

    /**
     * Handle betrayal event
     */
    handleBetrayal(betrayedId, betrayerId, reason) {
        // Update relationship to rival
        this.setRelationship(betrayedId, betrayerId, RELATIONSHIP_TYPES.RIVAL, 0.9);

        // Damage reputation of betrayer
        const betrayerRep = this.reputation.get(betrayerId);
        if (betrayerRep) {
            betrayerRep.reliability *= 0.7; // Lose reliability
            betrayerRep.score = Math.max(0, betrayerRep.score - 0.3);
        }

        // Propagate betrayal info to allies of betrayed
        const allies = this.getAllies(betrayedId);
        for (const ally of allies) {
            if (ally !== betrayerId) {
                this.updateTrust(ally, betrayerId, -0.2, `betrayed our ally ${betrayedId}`);
            }
        }

        this.recordSocialEvent('BETRAYAL', {
            betrayedId, betrayerId, reason
        });
    }

    /**
     * Get all allies of an agent
     */
    getAllies(agentId) {
        const allies = [];
        const agentRels = this.relationships.get(agentId);
        if (!agentRels) return allies;

        for (const [targetId, rel] of agentRels) {
            if (rel.type === RELATIONSHIP_TYPES.ALLY ||
                rel.type === RELATIONSHIP_TYPES.FAMILY) {
                allies.push(targetId);
            }
        }

        return allies;
    }

    /**
     * Elect a leader for a group
     */
    electLeader(groupId, memberIds) {
        if (!memberIds || memberIds.length === 0) return null;

        // Ensure leadership scores are updated for all members
        memberIds.forEach(id => {
            if (!this.leadershipQualities.has(id)) {
                this.initializeAgent(id);
            } else {
                this.updateLeadershipScore(id);
            }
        });

        // Calculate leadership scores for all members
        const candidates = memberIds.map(id => ({
            id,
            score: this.leadershipQualities.get(id)?.overall || 0
        }));

        // Sort by score
        candidates.sort((a, b) => b.score - a.score);

        // Top candidate becomes leader
        const leader = candidates[0];
        this.leaders.set(groupId, leader.id);

        // Set succession chain
        if (candidates.length > 1) {
            this.successionChains.set(leader.id, candidates[1].id);
        }

        // Update hierarchy
        this.hierarchies.set(groupId, candidates.map(c => c.id));

        // Assign social classes based on hierarchy
        candidates.forEach((candidate, index) => {
            this.socialClasses.set(candidate.id, candidates.length - index);
        });

        this.recordSocialEvent('LEADER_ELECTED', {
            groupId, leaderId: leader.id, memberCount: memberIds.length
        });

        return leader.id;
    }

    /**
     * Handle leader death - succession
     */
    handleLeaderDeath(leaderId, groupId) {
        const successor = this.successionChains.get(leaderId);

        if (successor && this.hierarchies.get(groupId)?.includes(successor)) {
            // Promote successor
            this.leaders.set(groupId, successor);

            this.recordSocialEvent('LEADER_SUCCEED', {
                groupId, deadLeader: leaderId, newLeader: successor
            });

            return successor;
        }

        // Need new election
        const members = this.hierarchies.get(groupId) || [];
        const remainingMembers = members.filter(id => id !== leaderId);

        if (remainingMembers.length > 0) {
            return this.electLeader(groupId, remainingMembers);
        }

        return null;
    }

    /**
     * Initialize culture for a group
     */
    initializeCulture(groupId, initialTraits = {}) {
        const culture = {
            traits: new Map(),
            traditions: [],
            taboos: [],
            formed: Date.now()
        };

        // Set initial traits with random variations
        for (const [trait, baseRate] of Object.entries(initialTraits)) {
            culture.traits.set(trait, {
                prevalence: baseRate,
                strength: 0.5 + Math.random() * 0.5,
                lastTransmission: Date.now()
            });
        }

        this.cultures.set(groupId, culture);

        return culture;
    }

    /**
     * Transmit culture from parent to child
     */
    transmitCulture(parentId, childId, groupId) {
        const culture = this.cultures.get(groupId);
        if (!culture) return;

        const transmittedTraits = [];

        for (const [trait, data] of culture.traits) {
            // Transmission probability based on trait strength
            const transmitProb = data.strength * 0.7; // 70% max transmission rate

            if (Math.random() < transmitProb) {
                transmittedTraits.push(trait);
            }
        }

        if (transmittedTraits.length > 0) {
            this.recordSocialEvent('CULTURE_TRANSMITTED', {
                parentId, childId, groupId, traits: transmittedTraits
            });
        }

        return transmittedTraits;
    }

    /**
     * Evolve culture over time
     */
    evolveCulture(groupId) {
        const culture = this.cultures.get(groupId);
        if (!culture) return;

        // Small random changes to traits
        for (const [trait, data] of culture.traits) {
            const drift = (Math.random() - 0.5) * 0.05; // ±2.5% drift
            data.prevalence = Math.max(0, Math.min(1, data.prevalence + drift));

            // Traits can strengthen or weaken
            const strengthChange = (Math.random() - 0.5) * 0.02;
            data.strength = Math.max(0.1, Math.min(1, data.strength + strengthChange));
        }
    }

    /**
     * Calculate social influence of an agent
     */
    calculateInfluence(agentId) {
        const reputation = this.reputation.get(agentId);
        const leadership = this.leadershipQualities.get(agentId);
        const allies = this.getAllies(agentId);

        if (!reputation || !leadership) return 0;

        // Factors affecting influence
        const reputationFactor = reputation.score * 0.3;
        const leadershipFactor = leadership.overall * 0.3;
        const networkFactor = Math.min(1, allies.length / 10) * 0.2; // Max at 10 allies
        const classFactor = (this.socialClasses.get(agentId) || 0) / 10 * 0.2;

        return reputationFactor + leadershipFactor + networkFactor + classFactor;
    }

    /**
     * Assign an agent to a tribe (T7.5)
     */
    setTribe(agentId, tribeId) {
        this.tribeMap.set(agentId, tribeId);
        this.tribes.add(tribeId);
        if (!this.tribalHostility.has(tribeId)) {
            this.tribalHostility.set(tribeId, new Map());
        }
    }

    /**
     * Get hostility level between two agents' tribes
     */
    getTribalHostility(agentId, targetId) {
        const tribeA = this.tribeMap.get(agentId);
        const tribeB = this.tribeMap.get(targetId);
        
        if (!tribeA || !tribeB || tribeA === tribeB) return 0;
        
        const hostilityMap = this.tribalHostility.get(tribeA);
        return hostilityMap.get(tribeB) || 0.1; // Baseline small hostility for strangers
    }

    /**
     * Record conflict event between tribes
     */
    recordTribalConflict(agentA, agentB, intensity = 0.1) {
        const tribeA = this.tribeMap.get(agentA);
        const tribeB = this.tribeMap.get(agentB);
        
        if (!tribeA || !tribeB || tribeA === tribeB) return;
        
        // Increase mutual hostility
        const mapA = this.tribalHostility.get(tribeA);
        const mapB = this.tribalHostility.get(tribeB);
        
        const currentH = mapA.get(tribeB) || 0.1;
        const newH = Math.min(1.0, currentH + intensity);
        
        mapA.set(tribeB, newH);
        mapB.set(tribeA, newH);
        
        this.recordSocialEvent('TRIBAL_CONFLICT', { tribeA, tribeB, intensity });
    }

    /**
     * Record a dangerous marker type for a tribe (T11.4)
     */
    recordTribalDanger(agentId, markerType, intensity = 0.1) {
        const tribeId = this.tribeMap.get(agentId);
        if (!tribeId) return;

        if (!this.tribalDangerMap.has(tribeId)) {
            this.tribalDangerMap.set(tribeId, new Map());
        }

        const dangerMap = this.tribalDangerMap.get(tribeId);
        const currentD = dangerMap.get(markerType) || 0;
        dangerMap.set(markerType, Math.min(1.0, currentD + intensity));
    }

    /**
     * Get intrinsic danger level of a marker for an agent's tribe
     */
    getTribalDanger(agentId, markerType) {
        const tribeId = this.tribeMap.get(agentId);
        if (!tribeId) return 0;

        const dangerMap = this.tribalDangerMap.get(tribeId);
        return dangerMap ? (dangerMap.get(markerType) || 0) : 0;
    }

    /**
     * Decay tribal relations and danger memories over time
     */
    decayTribalRelations() {
        this.tribalHostility.forEach(hostilityMap => {
            hostilityMap.forEach((hostility, targetTribe) => {
                hostilityMap.set(targetTribe, hostility * 0.999);
            });
        });

        this.tribalDangerMap.forEach(dangerMap => {
            dangerMap.forEach((danger, markerType) => {
                dangerMap.set(markerType, danger * 0.9995); // Memories decay even slower
            });
        });
    }

    /**
     * Affective Mirroring (T7.2)
     * NPCs mirror agent/player emotions based on social influence
     */
    getMirrorFear(agentId, neighbors) {
        if (!neighbors || neighbors.length === 0) return 0;

        let totalFear = 0;
        let totalInfluence = 0;

        neighbors.forEach(neighbor => {
            const influence = this.calculateInfluence(neighbor.id) || 0.1;
            totalFear += neighbor.brain.currentFear * influence;
            totalInfluence += influence;
        });

        // Return weighted average fear of group
        return totalInfluence > 0 ? totalFear / totalInfluence : 0;
    }

    /**
     * Apply social conformity pressure
     */
    applyConformity(agentId, groupOpinion, strength = 0.3) {
        const agentTrust = this.trustNetwork.get(agentId);
        if (!agentTrust) return groupOpinion;

        // Calculate average trust in group
        const allies = this.getAllies(agentId);
        if (allies.length === 0) return groupOpinion;

        let avgTrust = 0;
        for (const ally of allies) {
            avgTrust += agentTrust.get(ally) || 0.5;
        }
        avgTrust /= allies.length;

        // Conformity strength based on trust in group
        const conformity = avgTrust * strength;

        // Move opinion toward group opinion
        return agentOpinion => {
            return agentOpinion + (groupOpinion - agentOpinion) * conformity;
        };
    }

    /**
     * Record social event for memory
     */
    recordSocialEvent(type, data) {
        this.socialMemory.push({
            type,
            data,
            timestamp: Date.now()
        });

        // Trim old memories
        if (this.socialMemory.length > this.maxMemorySize) {
            this.socialMemory.shift();
        }
    }

    /**
     * Get social dynamics stats
     */
    getStats() {
        const totalRelationships = [...this.relationships.values()]
            .reduce((sum, rels) => sum + rels.size, 0);

        const totalLeaders = this.leaders.size;
        const totalCultures = this.cultures.size;

        // Calculate average reputation
        let avgReputation = 0;
        for (const rep of this.reputation.values()) {
            avgReputation += rep.score;
        }
        avgReputation /= this.reputation.size || 1;

        return {
            agentsInSystem: this.relationships.size,
            totalRelationships,
            totalLeaders,
            totalCultures,
            averageReputation: avgReputation,
            socialMemorySize: this.socialMemory.length
        };
    }

    /**
     * Serialize social dynamics state
     */
    serialize() {
        return {
            relationships: Array.from(this.relationships.entries()).map(
                ([id, rels]) => [id, Array.from(rels.entries())]
            ),
            reputation: Array.from(this.reputation.entries()),
            trustNetwork: Array.from(this.trustNetwork.entries()).map(
                ([id, trusts]) => [id, Array.from(trusts.entries())]
            ),
            leaders: Array.from(this.leaders.entries()),
            leadershipQualities: Array.from(this.leadershipQualities.entries()),
            successionChains: Array.from(this.successionChains.entries()),
            cultures: Array.from(this.cultures.entries()).map(
                ([id, culture]) => [id, {
                    ...culture,
                    traits: Array.from(culture.traits.entries())
                }]
            ),
            hierarchies: Array.from(this.hierarchies.entries()),
            socialClasses: Array.from(this.socialClasses.entries()),
            socialMemory: this.socialMemory
        };
    }

    /**
     * Deserialize social dynamics state
     */
    deserialize(data) {
        this.relationships = new Map(data.relationships.map(
            ([id, rels]) => [id, new Map(rels)]
        ));
        this.reputation = new Map(data.reputation);
        this.trustNetwork = new Map(data.trustNetwork.map(
            ([id, trusts]) => [id, new Map(trusts)]
        ));
        this.leaders = new Map(data.leaders);
        this.leadershipQualities = new Map(data.leadershipQualities);
        this.successionChains = new Map(data.successionChains);
        this.cultures = new Map(data.cultures.map(
            ([id, culture]) => [id, {
                ...culture,
                traits: new Map(culture.traits)
            }]
        ));
        this.hierarchies = new Map(data.hierarchies);
        this.socialClasses = new Map(data.socialClasses);
        this.socialMemory = data.socialMemory || [];
    }

    /**
     * Reset all social dynamics
     */
    reset() {
        this.relationships.clear();
        this.reputation.clear();
        this.trustNetwork.clear();
        this.leaders.clear();
        this.leadershipQualities.clear();
        this.successionChains.clear();
        this.cultures.clear();
        this.hierarchies.clear();
        this.socialClasses.clear();
        this.inGroups.clear();
        this.outGroups.clear();
        this.socialMemory = [];
    }
}

/**
 * Manages social influence and conformity at the group level
 */
export class SocialInfluenceManager {
    constructor(socialEngine) {
        this.engine = socialEngine;
        this.influenceCache = new Map();
        this.cacheTimeout = 5000; // 5 seconds
    }

    /**
     * Get group consensus on a decision
     */
    getGroupConsensus(groupMembers, opinions) {
        if (!groupMembers || groupMembers.length === 0) return null;

        // Weight opinions by influence
        let weightedSum = 0;
        let totalWeight = 0;

        for (const memberId of groupMembers) {
            const influence = this.getCachedInfluence(memberId);
            const opinion = opinions.get(memberId) || 0.5;

            weightedSum += opinion * influence;
            totalWeight += influence;
        }

        return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
    }

    /**
     * Get cached influence or calculate
     */
    getCachedInfluence(agentId) {
        const cached = this.influenceCache.get(agentId);
        const now = Date.now();

        if (cached && now - cached.timestamp < this.cacheTimeout) {
            return cached.value;
        }

        const influence = this.engine.calculateInfluence(agentId);
        this.influenceCache.set(agentId, { value: influence, timestamp: now });
        return influence;
    }

    /**
     * Identify opinion leaders (high influence agents)
     */
    identifyOpinionLeaders(groupMembers, threshold = 0.7) {
        const leaders = [];

        for (const memberId of groupMembers) {
            const influence = this.getCachedInfluence(memberId);
            if (influence >= threshold) {
                leaders.push({ id: memberId, influence });
            }
        }

        return leaders.sort((a, b) => b.influence - a.influence);
    }

    /**
     * Calculate social pressure on a member
     */
    calculateSocialPressure(agentId, groupMembers) {
        const agentOpinions = [];
        const othersOpinions = [];

        // Get opinions on agent from group members
        for (const memberId of groupMembers) {
            if (memberId === agentId) continue;

            const relationship = this.engine.getRelationship(memberId, agentId);
            const opinion = relationship.strength * (
                relationship.type === RELATIONSHIP_TYPES.RIVAL ? -1 : 1
            );

            othersOpinions.push({
                memberId,
                opinion,
                influence: this.getCachedInfluence(memberId)
            });
        }

        // Calculate weighted pressure
        let totalPressure = 0;
        let totalInfluence = 0;

        for (const other of othersOpinions) {
            totalPressure += other.opinion * other.influence;
            totalInfluence += other.influence;
        }

        return totalInfluence > 0 ? totalPressure / totalInfluence : 0;
    }

    /**
     * Clear influence cache
     */
    clearCache() {
        this.influenceCache.clear();
    }
}

export default SocialDynamicsEngine;
