/**
 * Group Behaviors System (T3.8)
 *
 * Implements emergent social dynamics:
 * - Mourning: React to dead companions
 * - Search Parties: Missing member triggers search
 * - Fear Propagation: One fleeing causes group panic
 * - Tribal Relations: Different families have hostility
 * - Formation behaviors: Group cohesion and movement
 */

export class GroupBehaviorSystem {
    constructor(config = {}) {
        // Group configuration
        this.config = {
            cohesionRadius: config.cohesionRadius || 80,
            alignmentRadius: config.alignmentRadius || 50,
            separationRadius: config.separationRadius || 30,
            maxCohesionForce: config.maxCohesionForce || 0.5,
            maxAlignmentForce: config.maxAlignmentForce || 0.3,
            maxSeparationForce: config.maxSeparationForce || 0.8,
            mourningDuration: config.mourningDuration || 300,  // Frames
            mourningFearBoost: config.mourningFearBoost || 0.1,
            mourningAngerBoost: config.mourningAngerBoost || 0.2,
            searchRadius: config.searchRadius || 150,
            searchDuration: config.searchDuration || 600,  // Frames
            panicPropagationRadius: config.panicPropagationRadius || 100,
            familyHostilityThreshold: config.familyHostilityThreshold || 0.3,
            tribalRelationDecay: config.tribalRelationDecay || 0.995
        };

        // Group state
        this.groups = new Map();  // familyName -> Group info
        this.agentGroups = new Map();  // agentId -> familyName

        // Mourning tracking
        this.mourningAgents = new Map();  // agentId -> { targetId, timer, type }

        // Search parties
        this.searchParties = new Map();  // missingId -> { searchers: [], timer, lastPos }

        // Tribal relations between families
        this.tribalRelations = new Map();  // "familyA:familyB" -> relationScore

        // Formation patterns
        this.formations = new Map();  // groupId -> formation type
    }

    /**
     * Register an agent with a group (family)
     * @param {Agent} agent - Agent to register
     * @param {string} familyName - Family/group name
     */
    registerAgent(agent, familyName) {
        this.agentGroups.set(agent.id, familyName);

        if (!this.groups.has(familyName)) {
            this.groups.set(familyName, {
                members: new Set(),
                leader: null,
                formation: 'loose',
                cohesion: 0.5,
                lastPanic: 0
            });
        }

        this.groups.get(familyName).members.add(agent.id);

        // Set leader if first member
        const group = this.groups.get(familyName);
        if (!group.leader) {
            group.leader = agent.id;
        }
    }

    /**
     * Remove an agent from group
     * @param {Agent} agent - Agent to remove
     */
    unregisterAgent(agent) {
        const familyName = this.agentGroups.get(agent.id);
        if (familyName) {
            const group = this.groups.get(familyName);
            if (group) {
                group.members.delete(agent.id);

                // Trigger mourning for remaining members
                this.triggerMourning(familyName, agent.id);

                // Update leader if needed
                if (group.leader === agent.id) {
                    const remaining = Array.from(group.members);
                    group.leader = remaining.length > 0 ? remaining[0] : null;
                }

                // Clean up empty groups
                if (group.members.size === 0) {
                    this.groups.delete(familyName);
                }
            }
        }

        this.agentGroups.delete(agent.id);
        this.mourningAgents.delete(agent.id);
    }

    /**
     * Trigger mourning behavior for a group
     * @param {string} familyName - Family name
     * @param {number} deadAgentId - ID of deceased agent
     */
    triggerMourning(familyName, deadAgentId) {
        const group = this.groups.get(familyName);
        if (!group) return;

        for (const memberId of group.members) {
            // Don't mourn if already mourning someone else
            if (this.mourningAgents.has(memberId)) continue;

            this.mourningAgents.set(memberId, {
                targetId: deadAgentId,
                timer: this.config.mourningDuration,
                type: 'mourning',
                fearBoost: this.config.mourningFearBoost,
                angerBoost: this.config.mourningAngerBoost
            });
        }
    }

    /**
     * Check if agent is mourning
     * @param {number} agentId - Agent ID
     * @returns {Object|null} Mourning info or null
     */
    getMourningState(agentId) {
        return this.mourningAgents.get(agentId) || null;
    }

    /**
     * Trigger search party for missing agent
     * @param {string} familyName - Family name
     * @param {number} missingId - Missing agent ID
     * @param {Object} lastKnownPos - Last known position {x, y}
     */
    triggerSearchParty(familyName, missingId, lastKnownPos) {
        const group = this.groups.get(familyName);
        if (!group) return;

        const searchers = [];
        for (const memberId of group.members) {
            if (memberId !== missingId && !this.mourningAgents.has(memberId)) {
                searchers.push(memberId);
            }
        }

        if (searchers.length > 0) {
            this.searchParties.set(missingId, {
                searchers: searchers,
                timer: this.config.searchDuration,
                lastPos: { ...lastKnownPos },
                familyName: familyName
            });
        }
    }

    /**
     * Get search party info for an agent
     * @param {number} agentId - Agent ID
     * @returns {Object|null} Search party info
     */
    getSearchParty(agentId) {
        // Check if this agent is searching for someone
        for (const [missingId, party] of this.searchParties) {
            if (party.searchers.includes(agentId)) {
                return {
                    role: 'searcher',
                    targetId: missingId,
                    searchCenter: party.lastPos,
                    radius: this.config.searchRadius
                };
            }
        }

        // Check if someone is searching for this agent
        if (this.searchParties.has(agentId)) {
            const party = this.searchParties.get(agentId);
            return {
                role: 'target',
                searchers: party.searchers,
                searchCenter: party.lastPos
            };
        }

        return null;
    }

    /**
     * Propagate panic through group
     * @param {number} panickingAgentId - Agent that started panicking
     * @param {Object} agent - The panicking agent
     * @returns {Array} IDs of affected agents
     */
    propagatePanic(panickingAgentId, agent) {
        const familyName = this.agentGroups.get(panickingAgentId);
        if (!familyName) return [];

        const group = this.groups.get(familyName);
        if (!group) return [];

        const affectedAgents = [];
        const panicRadius = this.config.panicPropagationRadius;

        for (const memberId of group.members) {
            if (memberId === panickingAgentId) continue;

            // Check distance (would need agent positions in real implementation)
            // For now, assume all group members are affected based on cohesion
            const distanceFactor = group.cohesion;

            if (distanceFactor > 0.5) {
                affectedAgents.push({
                    agentId: memberId,
                    fearIncrease: 0.3 * distanceFactor,
                    reason: 'group_panic_propagation'
                });
            }
        }

        group.lastPanic = Date.now();
        return affectedAgents;
    }

    /**
     * Calculate group forces for an agent (cohesion, alignment, separation)
     * @param {Agent} agent - Agent to calculate for
     * @param {Array} neighbors - Nearby agents
     * @returns {Object} Forces { cohesion, alignment, separation }
     */
    calculateGroupForces(agent, neighbors) {
        const forces = {
            cohesion: { x: 0, y: 0 },
            alignment: { x: 0, y: 0 },
            separation: { x: 0, y: 0 }
        };

        if (neighbors.length === 0) return forces;

        const familyName = this.agentGroups.get(agent.id);

        // Filter neighbors by same group (stronger forces) and proximity
        const groupNeighbors = neighbors.filter(n => {
            const dist = Math.sqrt((agent.x - n.x) ** 2 + (agent.y - n.y) ** 2);
            return this.agentGroups.get(n.id) === familyName && dist < this.config.cohesionRadius;
        });

        // Cohesion - steer towards center of mass
        if (groupNeighbors.length > 0) {
            const centerX = groupNeighbors.reduce((sum, n) => sum + n.x, 0) / groupNeighbors.length;
            const centerY = groupNeighbors.reduce((sum, n) => sum + n.y, 0) / groupNeighbors.length;

            const dx = centerX - agent.x;
            const dy = centerY - agent.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0) {
                forces.cohesion.x = (dx / dist) * this.config.maxCohesionForce;
                forces.cohesion.y = (dy / dist) * this.config.maxCohesionForce;
            }
        }

        // Alignment - match velocity with neighbors
        const alignmentNeighbors = groupNeighbors.filter(n => {
            const dist = Math.sqrt((agent.x - n.x) ** 2 + (agent.y - n.y) ** 2);
            return dist < this.config.alignmentRadius;
        });

        if (alignmentNeighbors.length > 0) {
            const avgVx = alignmentNeighbors.reduce((sum, n) => sum + (n.vx || 0), 0) / alignmentNeighbors.length;
            const avgVy = alignmentNeighbors.reduce((sum, n) => sum + (n.vy || 0), 0) / alignmentNeighbors.length;

            forces.alignment.x = avgVx * this.config.maxAlignmentForce;
            forces.alignment.y = avgVy * this.config.maxAlignmentForce;
        }

        // Separation - avoid crowding
        for (const neighbor of neighbors) {
            const dx = agent.x - neighbor.x;
            const dy = agent.y - neighbor.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.config.separationRadius && dist > 0) {
                forces.separation.x += (dx / dist) * this.config.maxSeparationForce;
                forces.separation.y += (dy / dist) * this.config.maxSeparationForce;
            }
        }

        return forces;
    }

    /**
     * Get tribal relation between two families
     * @param {string} familyA - First family
     * @param {string} familyB - Second family
     * @returns {number} Relation score (-1 to 1, negative = hostile)
     */
    getTribalRelation(familyA, familyB) {
        if (familyA === familyB) return 1.0;

        const key = [familyA, familyB].sort().join(':');
        return this.tribalRelations.get(key) || 0.0;
    }

    /**
     * Set tribal relation between two families
     * @param {string} familyA - First family
     * @param {string} familyB - Second family
     * @param {number} value - Relation value (-1 to 1)
     */
    setTribalRelation(familyA, familyB, value) {
        if (familyA === familyB) return;

        const key = [familyA, familyB].sort().join(':');
        this.tribalRelations.set(key, Math.max(-1, Math.min(1, value)));
    }

    /**
     * Modify tribal relation
     * @param {string} familyA - First family
     * @param {string} familyB - Second family
     * @param {number} delta - Change in relation
     */
    modifyTribalRelation(familyA, familyB, delta) {
        const current = this.getTribalRelation(familyA, familyB);
        this.setTribalRelation(familyA, familyB, current + delta);
    }

    /**
     * Check if two agents are hostile to each other
     * @param {number} agentAId - First agent ID
     * @param {number} agentBId - Second agent ID
     * @returns {boolean} True if hostile
     */
    areHostile(agentAId, agentBId) {
        const familyA = this.agentGroups.get(agentAId);
        const familyB = this.agentGroups.get(agentBId);

        if (!familyA || !familyB) return false;

        const relation = this.getTribalRelation(familyA, familyB);
        return relation < -this.config.familyHostilityThreshold;
    }

    /**
     * Update group behaviors
     * @param {Array} agents - All agents in simulation
     * @returns {Object} Update results
     */
    update(agents) {
        const updates = {
            mourningEnded: [],
            searchesEnded: [],
            panicPropagations: []
        };

        // Update mourning timers
        for (const [agentId, mourning] of this.mourningAgents) {
            mourning.timer--;
            if (mourning.timer <= 0) {
                this.mourningAgents.delete(agentId);
                updates.mourningEnded.push(agentId);
            }
        }

        // Update search parties
        for (const [missingId, party] of this.searchParties) {
            party.timer--;
            if (party.timer <= 0) {
                this.searchParties.delete(missingId);
                updates.searchesEnded.push(missingId);
            }
        }

        // Decay tribal relations over time (move toward neutral)
        for (const [key, value] of this.tribalRelations) {
            if (value !== 0) {
                const newValue = value * this.config.tribalRelationDecay;
                this.tribalRelations.set(key, Math.abs(newValue) < 0.01 ? 0 : newValue);
            }
        }

        return updates;
    }

    /**
     * Get group info for a family
     * @param {string} familyName - Family name
     * @returns {Object|null} Group info
     */
    getGroupInfo(familyName) {
        const group = this.groups.get(familyName);
        if (!group) return null;

        return {
            name: familyName,
            memberCount: group.members.size,
            members: Array.from(group.members),
            leader: group.leader,
            cohesion: group.cohesion,
            formation: group.formation,
            isMourning: this.isGroupMourning(familyName)
        };
    }

    /**
     * Check if a group is mourning
     * @param {string} familyName - Family name
     * @returns {boolean} True if mourning
     */
    isGroupMourning(familyName) {
        const group = this.groups.get(familyName);
        if (!group) return false;

        for (const memberId of group.members) {
            if (this.mourningAgents.has(memberId)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get all groups info
     * @returns {Array} Array of group info
     */
    getAllGroups() {
        const result = [];
        for (const [name, group] of this.groups) {
            result.push(this.getGroupInfo(name));
        }
        return result;
    }

    /**
     * Get statistics
     * @returns {Object} Statistics
     */
    getStats() {
        let totalMourning = 0;
        let totalSearching = 0;

        for (const group of this.groups.values()) {
            for (const memberId of group.members) {
                if (this.mourningAgents.has(memberId)) totalMourning++;
            }
        }

        for (const party of this.searchParties.values()) {
            totalSearching += party.searchers.length;
        }

        return {
            groupCount: this.groups.size,
            totalMembers: Array.from(this.groups.values())
                .reduce((sum, g) => sum + g.members.size, 0),
            mourningAgents: totalMourning,
            activeSearches: this.searchParties.size,
            searchingAgents: totalSearching,
            tribalRelations: this.tribalRelations.size
        };
    }

    /**
     * Serialize group behavior state
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            groups: Array.from(this.groups.entries()).map(([name, group]) => ({
                name,
                members: Array.from(group.members),
                leader: group.leader,
                cohesion: group.cohesion,
                formation: group.formation
            })),
            mourningAgents: Array.from(this.mourningAgents.entries()),
            searchParties: Array.from(this.searchParties.entries()),
            tribalRelations: Array.from(this.tribalRelations.entries())
        };
    }

    /**
     * Deserialize group behavior state
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        if (data.groups) {
            for (const groupData of data.groups) {
                this.groups.set(groupData.name, {
                    members: new Set(groupData.members),
                    leader: groupData.leader,
                    cohesion: groupData.cohesion,
                    formation: groupData.formation,
                    lastPanic: 0
                });
            }
        }

        if (data.mourningAgents) {
            for (const [agentId, mourning] of data.mourningAgents) {
                this.mourningAgents.set(agentId, mourning);
            }
        }

        if (data.searchParties) {
            for (const [missingId, party] of data.searchParties) {
                this.searchParties.set(missingId, party);
            }
        }

        if (data.tribalRelations) {
            for (const [key, value] of data.tribalRelations) {
                this.tribalRelations.set(key, value);
            }
        }
    }

    /**
     * Reset group behavior system
     */
    reset() {
        this.groups.clear();
        this.agentGroups.clear();
        this.mourningAgents.clear();
        this.searchParties.clear();
        this.tribalRelations.clear();
        this.formations.clear();
    }
}

export default GroupBehaviorSystem;
