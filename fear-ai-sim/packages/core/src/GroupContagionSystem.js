/**
 * GroupContagionSystem - Emergent group intelligence, panic cascades, and rally dynamics.
 *
 * Models collective social behavior for squads, patrols, caravans, crowds, and settlements:
 * 1. Panic Cascade Critical Mass (Bifurcation Point): viral tipping points when panic exceeds squad threshold
 * 2. Rally Dynamics & Heroic Stand: calm high-leadership agents suppress panic and rally wavering peers
 * 3. Leader Break Catastrophe: leader panic triggers amplified follower collapse (2.0x multiplier)
 * 4. Fragmentation & Desertion: cowardly/disloyal agents flee while disciplined core holds
 * 5. Cohesion & Morale Index: dynamic group-level metrics without static scalar fear
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Evaluates semantic group states and behavioral directives (STAND_GROUND, TACTICAL_FALLBACK,
 * SCATTER_AND_FLEE, RALLY_TO_LEADER) while host game retains authority over movement, physics, and damage.
 */

export const GROUP_TYPES = Object.freeze({
    SQUAD: 'SQUAD',
    PATROL: 'PATROL',
    CARAVAN: 'CARAVAN',
    CIVILIAN_CROWD: 'CIVILIAN_CROWD',
    SETTLEMENT_DEFENSE: 'SETTLEMENT_DEFENSE'
});

export const GROUP_DOCTRINES = Object.freeze({
    DISCIPLINED_STAND: 'DISCIPLINED_STAND',     // High threshold to break, fight together
    TACTICAL_RETREAT: 'TACTICAL_RETREAT',       // Coordinated fallback under pressure
    SELF_PRESERVATION: 'SELF_PRESERVATION',     // Low threshold, quick to scatter
    ESCORT: 'ESCORT'                            // Defend VIP/caravan asset at all costs
});

export const GROUP_STATES = Object.freeze({
    COHESIVE_CALM: 'COHESIVE_CALM',
    VIGILANT_ALERT: 'VIGILANT_ALERT',
    CONTESTED_STAND: 'CONTESTED_STAND',
    RALLYING: 'RALLYING',
    CASCADE_TRIGGERED: 'CASCADE_TRIGGERED',
    SCATTERED_STAMPEDE: 'SCATTERED_STAMPEDE',
    FRAGMENTED: 'FRAGMENTED'
});

export const GROUP_DIRECTIVES = Object.freeze({
    MAINTAIN_FORMATION: 'MAINTAIN_FORMATION',
    STAND_GROUND: 'STAND_GROUND',
    TACTICAL_FALLBACK: 'TACTICAL_FALLBACK',
    SCATTER_AND_FLEE: 'SCATTER_AND_FLEE',
    RALLY_TO_LEADER: 'RALLY_TO_LEADER',
    REGROUP: 'REGROUP'
});

export const DEFAULT_GROUP_CONFIG = Object.freeze({
    defaultBifurcationThreshold: 0.40, // 40% panicking triggers cascade in normal squad
    rallyRadius: 35,                   // Distance within which leader rally takes effect
    rallyMoraleBoost: 0.25,            // Fear reduction / morale recovery on successful rally
    leaderPanicMultiplier: 2.0,        // Panic magnification on followers when leader breaks
    cohesionDecayPerFleeing: 0.15,     // Loss of cohesion per fleeing member
    desertionThreshold: 0.70          // Fear level at which disloyal members desert
});

export class GroupContagionSystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_GROUP_CONFIG, ...config };
        // Map<groupId, GroupRecord>
        this.groups = new Map();
        this.tickCount = 0;
    }

    /**
     * Create and register a structured group
     * @param {string} id
     * @param {string} type - GROUP_TYPES
     * @param {string} doctrine - GROUP_DOCTRINES
     * @param {string|null} leaderId
     * @param {Array<string>} [members=[]]
     * @param {object} [metadata={}]
     * @returns {object} group record
     */
    createGroup(id, type = GROUP_TYPES.SQUAD, doctrine = GROUP_DOCTRINES.DISCIPLINED_STAND, leaderId = null, members = [], metadata = {}) {
        if (!id) return null;

        const group = {
            id: String(id),
            type: String(type || GROUP_TYPES.SQUAD),
            doctrine: String(doctrine || GROUP_DOCTRINES.DISCIPLINED_STAND),
            leaderId: leaderId ? String(leaderId) : null,
            members: Array.isArray(members) ? [...new Set(members.map(String))] : [],
            state: GROUP_STATES.COHESIVE_CALM,
            directive: GROUP_DIRECTIVES.MAINTAIN_FORMATION,
            cohesion: 1.0,
            morale: 1.0,
            meanFear: 0.0,
            panickingCount: 0,
            panickingRatio: 0.0,
            deserters: [],
            lastStateChangeTick: this.tickCount,
            metadata: { ...metadata }
        };

        if (group.leaderId && !group.members.includes(group.leaderId)) {
            group.members.push(group.leaderId);
        }

        this.groups.set(group.id, group);
        return group;
    }

    /**
     * Add a member to an existing group
     * @param {string} groupId
     * @param {string} agentId
     */
    addMember(groupId, agentId) {
        const group = this.groups.get(groupId);
        if (group && agentId && !group.members.includes(agentId)) {
            group.members.push(String(agentId));
            group.deserters = group.deserters.filter(id => id !== agentId);
        }
    }

    /**
     * Remove a member from a group (e.g. death or reassignment)
     * @param {string} groupId
     * @param {string} agentId
     */
    removeMember(groupId, agentId) {
        const group = this.groups.get(groupId);
        if (group && agentId) {
            group.members = group.members.filter(id => id !== agentId);
            group.deserters = group.deserters.filter(id => id !== agentId);
            if (group.leaderId === agentId) {
                group.leaderId = group.members.length > 0 ? group.members[0] : null;
            }
        }
    }

    /**
     * Reassign leader of a group
     * @param {string} groupId
     * @param {string} newLeaderId
     */
    setLeader(groupId, newLeaderId) {
        const group = this.groups.get(groupId);
        if (group) {
            group.leaderId = newLeaderId ? String(newLeaderId) : null;
            if (newLeaderId && !group.members.includes(newLeaderId)) {
                group.members.push(String(newLeaderId));
            }
        }
    }

    /**
     * Evaluate group contagion, rally dynamics, morale, and directives
     * @param {string} groupId
     * @param {Map<string, object>|Array<object>} agentStates - Map of agentId -> { id, fear, fearBand, isPanicking, traits, position }
     * @param {object} [relationshipSystem=null] - RelationshipTensorSystem instance
     * @param {number} [deltaTicks=1]
     * @returns {object} group evaluation report
     */
    evaluateGroup(groupId, agentStates, relationshipSystem = null, deltaTicks = 1) {
        const group = this.groups.get(groupId);
        if (!group) return null;

        this.tickCount += deltaTicks;

        // Convert array to map if necessary
        const stateMap = agentStates instanceof Map
            ? agentStates
            : new Map(Array.isArray(agentStates) ? agentStates.map(a => [a.id, a]) : []);

        const activeMembers = group.members.filter(id => !group.deserters.includes(id));
        if (activeMembers.length === 0) {
            group.state = GROUP_STATES.FRAGMENTED;
            group.directive = GROUP_DIRECTIVES.SCATTER_AND_FLEE;
            group.cohesion = 0.0;
            return { group, rallied: [], newlyDeserted: [] };
        }

        let totalFear = 0;
        let panickingCount = 0;
        let highestFear = 0;
        let leaderState = null;

        // 1. Gather member affective status
        for (const memberId of activeMembers) {
            const memberData = stateMap.get(memberId) || {};
            const fear = Number(memberData.currentFear ?? memberData.fear ?? 0.0);
            const isPanicking = Boolean(memberData.isPanicking || memberData.fearBand === 'PANIC' || fear >= 0.70);

            totalFear += fear;
            if (fear > highestFear) highestFear = fear;
            if (isPanicking) panickingCount++;

            if (memberId === group.leaderId) {
                leaderState = {
                    id: memberId,
                    fear,
                    isPanicking,
                    leadership: memberData.traits?.leadership ?? 0.5,
                    resilience: memberData.traits?.resilience ?? 0.5,
                    position: memberData.position || { x: 0, y: 0, z: 0 }
                };
            }
        }

        const memberCount = activeMembers.length;
        group.meanFear = totalFear / memberCount;
        group.panickingCount = panickingCount;
        group.panickingRatio = panickingCount / memberCount;

        // 2. Compute dynamic bifurcation threshold conditioned on doctrine & leader
        let bifurcationThreshold = this.config.defaultBifurcationThreshold;
        if (group.doctrine === GROUP_DOCTRINES.DISCIPLINED_STAND) bifurcationThreshold += 0.15;
        if (group.doctrine === GROUP_DOCTRINES.SELF_PRESERVATION) bifurcationThreshold -= 0.15;
        if (leaderState && !leaderState.isPanicking && leaderState.leadership > 0.6) {
            bifurcationThreshold += 0.10 * leaderState.leadership;
        }

        // 3. Compute group cohesion
        // Loss of cohesion per fleeing/panicking member
        let rawCohesion = 1.0 - (group.panickingRatio * this.config.cohesionDecayPerFleeing * 4.0);
        if (leaderState?.isPanicking) {
            rawCohesion *= 0.5; // Leader panic shatters cohesion
        }
        group.cohesion = Math.max(0.0, Math.min(1.0, rawCohesion));
        group.morale = Math.max(0.0, Math.min(1.0, (1.0 - group.meanFear * 0.7) * (0.4 + 0.6 * group.cohesion)));

        const rallied = [];
        const newlyDeserted = [];

        // 4. State Transitions & Rally Logic
        const prevGroupState = group.state;

        // Catastrophic Leader Collapse Trigger
        const isLeaderBroken = Boolean(leaderState?.isPanicking && leaderState.fear > 0.75);

        if (group.panickingRatio >= bifurcationThreshold || isLeaderBroken) {
            // Cascade Triggered: tipping point breached
            if (group.cohesion < 0.25 || group.meanFear > 0.75) {
                group.state = GROUP_STATES.SCATTERED_STAMPEDE;
                group.directive = GROUP_DIRECTIVES.SCATTER_AND_FLEE;
            } else {
                group.state = GROUP_STATES.CASCADE_TRIGGERED;
                group.directive = (group.doctrine === GROUP_DOCTRINES.DISCIPLINED_STAND)
                    ? GROUP_DIRECTIVES.TACTICAL_FALLBACK
                    : GROUP_DIRECTIVES.SCATTER_AND_FLEE;
            }
        } else if (leaderState && !leaderState.isPanicking && leaderState.leadership >= 0.5 && leaderState.fear < 0.35 && group.panickingCount >= 2) {
            // Leader Active Rally: Heroic calming stand when multiple members waver
            group.state = GROUP_STATES.RALLYING;
            group.directive = GROUP_DIRECTIVES.RALLY_TO_LEADER;

            // Attempt to rally panicking members near leader
            for (const memberId of activeMembers) {
                if (memberId === leaderState.id) continue;
                const memberData = stateMap.get(memberId) || {};
                const mPos = memberData.position || { x: 0, y: 0, z: 0 };
                const lPos = leaderState.position;
                const distSq = (mPos.x - lPos.x) ** 2 + (mPos.y - lPos.y) ** 2 + ((mPos.z || 0) - (lPos.z || 0)) ** 2;

                if (distSq <= this.config.rallyRadius * this.config.rallyRadius) {
                    // Check respect & relationship toward leader
                    let respect = 0.5;
                    let grievance = 0.0;
                    if (relationshipSystem) {
                        const rel = relationshipSystem.getRelationship(memberId, leaderState.id);
                        if (rel) {
                            respect = rel.respect;
                            grievance = rel.grievance;
                        }
                    }

                    if (respect >= 0.30 && grievance <= 0.40) {
                        // Rally succeeds for this agent
                        rallied.push({
                            agentId: memberId,
                            fearDamping: this.config.rallyMoraleBoost * (0.5 + 0.5 * leaderState.leadership)
                        });
                    }
                }
            }
        } else if (highestFear > 0.40) {
            group.state = (group.doctrine === GROUP_DOCTRINES.DISCIPLINED_STAND)
                ? GROUP_STATES.CONTESTED_STAND
                : GROUP_STATES.VIGILANT_ALERT;
            group.directive = (group.doctrine === GROUP_DOCTRINES.DISCIPLINED_STAND)
                ? GROUP_DIRECTIVES.STAND_GROUND
                : GROUP_DIRECTIVES.MAINTAIN_FORMATION;
        } else {
            group.state = GROUP_STATES.COHESIVE_CALM;
            group.directive = GROUP_DIRECTIVES.MAINTAIN_FORMATION;
        }

        if (group.state !== prevGroupState) {
            group.lastStateChangeTick = this.tickCount;
        }

        // 5. Desertion and Fragmentation Check
        if (group.state === GROUP_STATES.CASCADE_TRIGGERED || group.state === GROUP_STATES.SCATTERED_STAMPEDE) {
            for (const memberId of activeMembers) {
                if (memberId === group.leaderId) continue;
                const memberData = stateMap.get(memberId) || {};
                const mFear = Number(memberData.currentFear ?? memberData.fear ?? 0.0);
                const mConscientiousness = memberData.traits?.conscientiousness ?? 0.5;
                const mResilience = memberData.traits?.resilience ?? 0.5;

                // Cowardly / disloyal members defect when terror is high and discipline is low
                const desertionScore = mFear * 0.7 - mConscientiousness * 0.4 - mResilience * 0.3;
                if (desertionScore > 0.45 && mFear >= this.config.desertionThreshold) {
                    group.deserters.push(memberId);
                    newlyDeserted.push(memberId);

                    // Record grievance across remaining loyal members toward deserter
                    if (relationshipSystem) {
                        for (const loyalId of activeMembers) {
                            if (loyalId !== memberId && !group.deserters.includes(loyalId)) {
                                relationshipSystem.recordInteraction(loyalId, memberId, 'ABANDONMENT', { weight: 1.0 });
                            }
                        }
                    }
                }
            }

            if (group.deserters.length >= memberCount * 0.5) {
                group.state = GROUP_STATES.FRAGMENTED;
            }
        }

        return {
            groupId: group.id,
            state: group.state,
            directive: group.directive,
            cohesion: group.cohesion,
            morale: group.morale,
            meanFear: group.meanFear,
            panickingRatio: group.panickingRatio,
            bifurcationThreshold,
            rallied,
            newlyDeserted,
            activeMemberCount: group.members.length - group.deserters.length,
            desertersCount: group.deserters.length
        };
    }

    /**
     * Compute contagious panic multiplier for a specific agent based on group state
     * @param {string} groupId
     * @param {string} agentId
     * @param {boolean} [isLeaderBroken=false]
     * @returns {number} multiplier on received contagion
     */
    getContagionMultiplier(groupId, agentId, isLeaderBroken = false) {
        const group = this.groups.get(groupId);
        if (!group) return 1.0;

        let mult = 1.0;
        if (group.state === GROUP_STATES.CASCADE_TRIGGERED) mult = 1.4;
        if (group.state === GROUP_STATES.SCATTERED_STAMPEDE) mult = 1.8;
        if (group.state === GROUP_STATES.RALLYING) mult = 0.5;
        if (isLeaderBroken) mult *= this.config.leaderPanicMultiplier;

        return mult;
    }

    /**
     * Disband an entire group
     * @param {string} groupId
     */
    disbandGroup(groupId) {
        this.groups.delete(groupId);
    }

    /**
     * Serialize complete state for snapshot persistence
     * @returns {object}
     */
    getState() {
        const serialized = [];
        for (const g of this.groups.values()) {
            serialized.push({
                ...g,
                members: [...g.members],
                deserters: [...g.deserters],
                metadata: { ...g.metadata }
            });
        }
        return {
            tickCount: this.tickCount,
            groups: serialized
        };
    }

    /**
     * Restore group state from snapshot
     * @param {object} snapshot
     */
    setState(snapshot) {
        if (!snapshot) return;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.groups.clear();

        if (Array.isArray(snapshot.groups)) {
            for (const g of snapshot.groups) {
                if (!g || !g.id) continue;
                this.groups.set(g.id, {
                    ...g,
                    members: Array.isArray(g.members) ? [...g.members] : [],
                    deserters: Array.isArray(g.deserters) ? [...g.deserters] : [],
                    metadata: g.metadata ? { ...g.metadata } : {}
                });
            }
        }
    }
}

export default GroupContagionSystem;
