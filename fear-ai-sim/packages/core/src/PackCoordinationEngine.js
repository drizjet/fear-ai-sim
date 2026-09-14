/**
 * @file PackCoordinationEngine.js - Multi-Agent Pack Coordination & Collective Tactical Swarm Engine.
 *
 * Frontier C & D / Tactical Subsystem (Round 44).
 *
 * Provides deterministic, multi-agent tactical organization for squads, predator packs,
 * and roaming warbands. Key capabilities:
 * 1. Dynamic Role Allocation (ALPHA_LEADER, FLANKER_LEFT, FLANKER_RIGHT, CHASER, REAR_GUARD, BAIT, HARASSER)
 * 2. Vectorized Encirclement & Flanking Geometry (CIRCULAR_PINCER, V_FORMATION, CRESCENT_SURROUND, STAGGERED_LINE)
 * 3. Alpha Morale Damping / Alpha Shielding: Alpha suppresses panic in subordinates
 * 4. Alpha Fall Catastrophe: Alpha incapacitation / panic-lock triggers immediate SCATTER_DISPERSE collapse
 * 5. Phased Coordinated Strike & Feint Synchronization (STALKING, ENCIRCLING, FEINT_PROBE, SYNCHRONIZED_STRIKE, SCATTER_DISPERSE, REGROUPING)
 *
 * Host Game Authority Invariant:
 * Outputs purely advisory coordinates, suggested heading vectors, and tactical role tags.
 * The host engine retains 100% exclusive authority over physics, collisions, navmesh pathfinding, and damage.
 */

import { DeterministicRng } from './DeterministicRng.js';

export const PACK_ROLES = Object.freeze({
    ALPHA_LEADER: 'ALPHA_LEADER',
    FLANKER_LEFT: 'FLANKER_LEFT',
    FLANKER_RIGHT: 'FLANKER_RIGHT',
    CHASER: 'CHASER',
    REAR_GUARD: 'REAR_GUARD',
    BAIT: 'BAIT',
    HARASSER: 'HARASSER'
});

export const TACTICAL_PHASES = Object.freeze({
    STALKING: 'STALKING',
    ENCIRCLING: 'ENCIRCLING',
    FEINT_PROBE: 'FEINT_PROBE',
    SYNCHRONIZED_STRIKE: 'SYNCHRONIZED_STRIKE',
    SCATTER_DISPERSE: 'SCATTER_DISPERSE',
    REGROUPING: 'REGROUPING'
});

export const ENCIRCLEMENT_PATTERNS = Object.freeze({
    CIRCULAR_PINCER: 'CIRCULAR_PINCER',
    V_FORMATION: 'V_FORMATION',
    CRESCENT_SURROUND: 'CRESCENT_SURROUND',
    STAGGERED_LINE: 'STAGGERED_LINE'
});

export const DEFAULT_PACK_CONFIG = Object.freeze({
    defaultEngagementRadius: 15.0,     // Nominal encirclement radius in meters
    stalkingDistance: 30.0,            // Stand-off distance during stalking
    strikeDistance: 3.5,               // Close engagement distance during synchronized strike
    alphaDampingFactor: 0.40,          // Maximum subordinate fear attenuation (40% at max dominance)
    alphaPanicThreshold: 0.85,         // Fear level where Alpha panic triggers pack scatter
    strikeSynchronizationWindowTicks: 10, // Ticks window for synchronized attack
    feintOffsetAngle: Math.PI / 4      // 45 degree angular distraction offset for bait/harassers
});

export class PackCoordinationEngine {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_PACK_CONFIG, ...config };
        this.rng = new DeterministicRng(config.seed !== undefined ? config.seed : 1337);
        this.packs = new Map(); // packId -> PackRecord
        this.tickCount = 0;
    }

    /**
     * Create or register a coordinated pack
     * @param {string} packId
     * @param {object} [options={}]
     * @returns {object} PackRecord
     */
    createPack(packId, options = {}) {
        if (!packId) return null;
        const id = String(packId);
        const record = {
            id,
            phase: options.phase || TACTICAL_PHASES.STALKING,
            pattern: options.pattern || ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER,
            targetThreat: options.targetThreat || { x: 0, y: 0, z: 0, id: null },
            engagementRadius: typeof options.engagementRadius === 'number' ? options.engagementRadius : this.config.defaultEngagementRadius,
            members: new Map(), // memberId -> MemberProfile
            alphaId: null,
            alphaDominance: 0.8,
            alphaFear: 0.0,
            packCohesion: 1.0,
            packMorale: 1.0,
            strikeCadenceTick: 0,
            formationAngleOffset: 0.0,
            lastPhaseTransitionTick: this.tickCount,
            metadata: { ...(options.metadata || {}) }
        };
        this.packs.set(id, record);
        return record;
    }

    /**
     * Register or update a member in a pack
     * @param {string} packId
     * @param {string} memberId
     * @param {object} traits - { dominance, courage, fear, aggression, speed, resilience }
     * @param {object} [position={x: 0, y: 0, z: 0}]
     * @returns {object|null}
     */
    registerMember(packId, memberId, traits = {}, position = { x: 0, y: 0, z: 0 }) {
        const pack = this.packs.get(String(packId));
        if (!pack || !memberId) return null;

        const mId = String(memberId);
        const member = {
            id: mId,
            traits: {
                dominance: Math.max(0, Math.min(1, typeof traits.dominance === 'number' ? traits.dominance : 0.5)),
                courage: Math.max(0, Math.min(1, typeof traits.courage === 'number' ? traits.courage : 0.5)),
                fear: Math.max(0, Math.min(1, typeof traits.fear === 'number' ? traits.fear : 0.0)),
                aggression: Math.max(0, Math.min(1, typeof traits.aggression === 'number' ? traits.aggression : 0.5)),
                speed: Math.max(0.1, typeof traits.speed === 'number' ? traits.speed : 1.0),
                resilience: Math.max(0, Math.min(1, typeof traits.resilience === 'number' ? traits.resilience : 0.5))
            },
            position: {
                x: Number(position.x) || 0,
                y: Number(position.y) || 0,
                z: Number(position.z) || 0
            },
            role: PACK_ROLES.CHASER,
            effectiveFear: 0.0,
            advisoryPosition: { x: 0, y: 0, z: 0 },
            headingVector: { x: 0, y: 0, z: 0 },
            targetDistance: 0.0,
            isFeinting: false
        };

        pack.members.set(mId, member);
        this.reassignRoles(packId);
        return member;
    }

    /**
     * Remove a member from the pack (e.g. host reported death or despawn)
     * @param {string} packId
     * @param {string} memberId
     * @returns {boolean}
     */
    removeMember(packId, memberId) {
        const pack = this.packs.get(String(packId));
        if (!pack || !memberId) return false;
        const mId = String(memberId);
        const wasRemoved = pack.members.delete(mId);
        if (wasRemoved) {
            if (pack.alphaId === mId) {
                pack.alphaId = null;
                // Alpha loss triggers immediate scatter dispersal!
                this.triggerAlphaLoss(packId);
            } else {
                this.reassignRoles(packId);
            }
        }
        return wasRemoved;
    }

    /**
     * Trigger Alpha loss catastrophe (death, despawn, or severe panic)
     * @param {string} packId
     */
    triggerAlphaLoss(packId) {
        const pack = this.packs.get(String(packId));
        if (!pack) return;

        pack.phase = TACTICAL_PHASES.SCATTER_DISPERSE;
        pack.packCohesion = Math.max(0.1, pack.packCohesion * 0.25);
        pack.packMorale = Math.max(0.1, pack.packMorale * 0.30);
        pack.lastPhaseTransitionTick = this.tickCount;

        // Spread panic to subordinates whose alpha has fallen
        for (const member of pack.members.values()) {
            member.traits.fear = Math.min(1.0, member.traits.fear + 0.45);
        }
    }

    /**
     * Dynamic Role Allocation:
     * Evaluates member traits (dominance, courage, fear, aggression, speed)
     * to deterministically assign optimal tactical roles.
     * @param {string} packId
     */
    reassignRoles(packId) {
        const pack = this.packs.get(String(packId));
        if (!pack || pack.members.size === 0) return;

        const members = Array.from(pack.members.values());

        // If in SCATTER_DISPERSE, all subordinates act as fleeing deserters
        if (pack.phase === TACTICAL_PHASES.SCATTER_DISPERSE) {
            for (const m of members) {
                m.role = PACK_ROLES.REAR_GUARD;
            }
            return;
        }

        // 0. If there is an incumbent alpha, check if the alpha has panicked first
        if (pack.alphaId) {
            const currentAlpha = pack.members.get(pack.alphaId);
            if (currentAlpha && currentAlpha.traits.fear >= this.config.alphaPanicThreshold) {
                this.triggerAlphaLoss(packId);
                return;
            }
        }

        // 1. Determine Alpha Leader: highest composite leadership score = 0.5 * dominance + 0.3 * courage + 0.2 * aggression - 0.4 * fear
        members.sort((a, b) => {
            const scoreA = (a.traits.dominance * 0.5) + (a.traits.courage * 0.3) + (a.traits.aggression * 0.2) - (a.traits.fear * 0.4);
            const scoreB = (b.traits.dominance * 0.5) + (b.traits.courage * 0.3) + (b.traits.aggression * 0.2) - (b.traits.fear * 0.4);
            if (scoreB !== scoreA) return scoreB - scoreA;
            return a.id.localeCompare(b.id);
        });

        const alpha = members[0];
        pack.alphaId = alpha.id;
        pack.alphaDominance = alpha.traits.dominance;
        pack.alphaFear = alpha.traits.fear;
        alpha.role = PACK_ROLES.ALPHA_LEADER;

        // Check if Alpha has broken in panic
        if (alpha.traits.fear >= this.config.alphaPanicThreshold) {
            this.triggerAlphaLoss(packId);
            return;
        }

        const subordinates = members.slice(1);
        if (subordinates.length === 0) return;

        // 2. Fast / aggressive members become Flankers
        subordinates.sort((a, b) => {
            const speedA = a.traits.speed * 0.6 + a.traits.aggression * 0.4;
            const speedB = b.traits.speed * 0.6 + b.traits.aggression * 0.4;
            if (speedB !== speedA) return speedB - speedA;
            return a.id.localeCompare(b.id);
        });

        if (subordinates.length >= 1) {
            subordinates[0].role = PACK_ROLES.FLANKER_LEFT;
        }
        if (subordinates.length >= 2) {
            subordinates[1].role = PACK_ROLES.FLANKER_RIGHT;
        }

        // 3. High resilience / low fear members become Chasers / Bait / Harasser
        const remaining = subordinates.slice(2);
        for (let i = 0; i < remaining.length; i++) {
            const m = remaining[i];
            if (m.traits.speed >= 1.2) {
                m.role = PACK_ROLES.BAIT;
            } else if (i === 0) {
                m.role = PACK_ROLES.CHASER;
            } else if (i === 1) {
                m.role = PACK_ROLES.HARASSER;
            } else if (i === 2) {
                m.role = PACK_ROLES.REAR_GUARD;
            } else {
                m.role = (i % 2 === 0) ? PACK_ROLES.CHASER : PACK_ROLES.HARASSER;
            }
        }
    }

    /**
     * Compute Alpha Morale Damping (Alpha Shielding):
     * While Alpha has fear < 0.40 and high dominance, subordinates experience
     * fear attenuation: F_eff = F * (1.0 - alphaDampingFactor * AlphaDominance)
     * @param {string} packId
     */
    applyAlphaDamping(packId) {
        const pack = this.packs.get(String(packId));
        if (!pack || !pack.alphaId) return;

        const alpha = pack.members.get(pack.alphaId);
        if (!alpha) return;

        pack.alphaDominance = alpha.traits.dominance;
        pack.alphaFear = alpha.traits.fear;

        const isDampingActive = (alpha.traits.fear < 0.40 && pack.phase !== TACTICAL_PHASES.SCATTER_DISPERSE);
        const dampingMultiplier = isDampingActive
            ? Math.max(0.1, 1.0 - (this.config.alphaDampingFactor * alpha.traits.dominance))
            : 1.0;

        let totalFear = 0;
        for (const member of pack.members.values()) {
            if (member.id === alpha.id) {
                member.effectiveFear = member.traits.fear;
            } else {
                member.effectiveFear = Number((member.traits.fear * dampingMultiplier).toFixed(4));
            }
            totalFear += member.effectiveFear;
        }

        const avgFear = pack.members.size > 0 ? totalFear / pack.members.size : 0;
        if (pack.phase !== TACTICAL_PHASES.SCATTER_DISPERSE) {
            pack.packMorale = Number((1.0 - (avgFear * 0.8)).toFixed(3));
            pack.packCohesion = Number((Math.max(0.1, 1.0 - (avgFear * 0.6))).toFixed(3));
        } else {
            pack.packMorale = Math.min(pack.packMorale, Number((Math.max(0.05, 1.0 - (avgFear * 0.8))).toFixed(3)));
            pack.packCohesion = Math.min(pack.packCohesion, 0.35);
        }
    }

    /**
     * Calculate advisory geometric positions and headings for pack members
     * around the target threat based on current tactical phase and pattern.
     * @param {string} packId
     * @param {object} [targetThreat]
     * @returns {Array<object>} array of member advisory vectors
     */
    calculateEncirclementGeometry(packId, targetThreat = null) {
        const pack = this.packs.get(String(packId));
        if (!pack) return [];

        if (targetThreat) {
            pack.targetThreat = {
                x: Number(targetThreat.x) || 0,
                y: Number(targetThreat.y) || 0,
                z: Number(targetThreat.z) || 0,
                id: targetThreat.id || null
            };
        }

        const target = pack.targetThreat;
        const members = Array.from(pack.members.values());
        const count = members.length;
        if (count === 0) return [];

        let baseRadius = pack.engagementRadius;
        if (pack.phase === TACTICAL_PHASES.STALKING) {
            baseRadius = Math.max(pack.engagementRadius, this.config.stalkingDistance);
        } else if (pack.phase === TACTICAL_PHASES.SYNCHRONIZED_STRIKE) {
            baseRadius = this.config.strikeDistance;
        } else if (pack.phase === TACTICAL_PHASES.SCATTER_DISPERSE) {
            baseRadius = pack.engagementRadius * 3.0; // Scatter outward
        }

        const advisories = [];

        if (pack.phase === TACTICAL_PHASES.SCATTER_DISPERSE) {
            // Radial outward flight away from threat
            for (let i = 0; i < count; i++) {
                const member = members[i];
                const angle = (2 * Math.PI * i) / count;
                const advX = target.x + Math.cos(angle) * baseRadius;
                const advZ = target.z + Math.sin(angle) * baseRadius;
                const advY = target.y;

                const headingX = Math.cos(angle);
                const headingZ = Math.sin(angle);

                member.advisoryPosition = { x: Number(advX.toFixed(2)), y: Number(advY.toFixed(2)), z: Number(advZ.toFixed(2)) };
                member.headingVector = { x: Number(headingX.toFixed(3)), y: 0.0, z: Number(headingZ.toFixed(3)) };
                member.targetDistance = Number(baseRadius.toFixed(2));
                member.isFeinting = false;

                advisories.push({
                    memberId: member.id,
                    role: member.role,
                    advisoryPosition: member.advisoryPosition,
                    headingVector: member.headingVector,
                    targetDistance: member.targetDistance,
                    effectiveFear: member.effectiveFear,
                    phase: pack.phase,
                    isFeinting: member.isFeinting
                });
            }
            return advisories;
        }

        // Tactical Formations
        switch (pack.pattern) {
            case ENCIRCLEMENT_PATTERNS.V_FORMATION: {
                // V-Formation: Alpha at apex, flankers descending left/right
                const apexAngle = pack.formationAngleOffset || 0.0;
                const forwardX = Math.cos(apexAngle);
                const forwardZ = Math.sin(apexAngle);
                const lateralX = -forwardZ;
                const lateralZ = forwardX;

                const apexX = target.x - forwardX * baseRadius;
                const apexZ = target.z - forwardZ * baseRadius;

                for (let i = 0; i < count; i++) {
                    const member = members[i];
                    let advX, advZ;
                    if (member.role === PACK_ROLES.ALPHA_LEADER) {
                        advX = apexX;
                        advZ = apexZ;
                    } else {
                        const side = (i % 2 === 1) ? -1 : 1;
                        const rank = Math.ceil(i / 2);
                        const wingSpacing = 6.0;
                        const depthSpacing = 5.0;
                        advX = apexX - forwardX * (rank * depthSpacing) + lateralX * (side * rank * wingSpacing);
                        advZ = apexZ - forwardZ * (rank * depthSpacing) + lateralZ * (side * rank * wingSpacing);
                    }

                    const dx = target.x - advX;
                    const dz = target.z - advZ;
                    const dist = Math.hypot(dx, dz) || 1.0;

                    member.advisoryPosition = { x: Number(advX.toFixed(2)), y: Number(target.y.toFixed(2)), z: Number(advZ.toFixed(2)) };
                    member.headingVector = { x: Number((dx / dist).toFixed(3)), y: 0.0, z: Number((dz / dist).toFixed(3)) };
                    member.targetDistance = Number(dist.toFixed(2));
                    member.isFeinting = (pack.phase === TACTICAL_PHASES.FEINT_PROBE && member.role === PACK_ROLES.BAIT);

                    advisories.push({
                        memberId: member.id,
                        role: member.role,
                        advisoryPosition: member.advisoryPosition,
                        headingVector: member.headingVector,
                        effectiveFear: member.effectiveFear,
                        phase: pack.phase
                    });
                }
                break;
            }

            case ENCIRCLEMENT_PATTERNS.CRESCENT_SURROUND: {
                // Crescent / Arc surround around target: spread from -120 deg to +120 deg
                const baseAngle = pack.formationAngleOffset || 0.0;
                const arcSpan = (4 * Math.PI) / 3; // 240 degrees total surround arc
                const angleStep = count > 1 ? arcSpan / (count - 1) : 0;
                const startAngle = baseAngle - (arcSpan / 2);

                for (let i = 0; i < count; i++) {
                    const member = members[i];
                    const angle = startAngle + (i * angleStep);
                    const advX = target.x + Math.cos(angle) * baseRadius;
                    const advZ = target.z + Math.sin(angle) * baseRadius;

                    const dx = target.x - advX;
                    const dz = target.z - advZ;
                    const dist = Math.hypot(dx, dz) || 1.0;

                    member.advisoryPosition = { x: Number(advX.toFixed(2)), y: Number(target.y.toFixed(2)), z: Number(advZ.toFixed(2)) };
                    member.headingVector = { x: Number((dx / dist).toFixed(3)), y: 0.0, z: Number((dz / dist).toFixed(3)) };
                    member.targetDistance = Number(dist.toFixed(2));
                    member.isFeinting = (pack.phase === TACTICAL_PHASES.FEINT_PROBE && (member.role === PACK_ROLES.BAIT || member.role === PACK_ROLES.HARASSER));

                    advisories.push({
                        memberId: member.id,
                        role: member.role,
                        advisoryPosition: member.advisoryPosition,
                        headingVector: member.headingVector,
                        effectiveFear: member.effectiveFear,
                        phase: pack.phase
                    });
                }
                break;
            }

            case ENCIRCLEMENT_PATTERNS.STAGGERED_LINE: {
                // Staggered frontline and backline
                const baseAngle = pack.formationAngleOffset || 0.0;
                const perpAngle = baseAngle + Math.PI / 2;
                const lineSpacing = 5.0;

                for (let i = 0; i < count; i++) {
                    const member = members[i];
                    const offset = (i - (count - 1) / 2) * lineSpacing;
                    const depth = (i % 2 === 0) ? 0 : 4.0;
                    const advX = target.x - Math.cos(baseAngle) * (baseRadius + depth) + Math.cos(perpAngle) * offset;
                    const advZ = target.z - Math.sin(baseAngle) * (baseRadius + depth) + Math.sin(perpAngle) * offset;

                    const dx = target.x - advX;
                    const dz = target.z - advZ;
                    const dist = Math.hypot(dx, dz) || 1.0;

                    member.advisoryPosition = { x: Number(advX.toFixed(2)), y: Number(target.y.toFixed(2)), z: Number(advZ.toFixed(2)) };
                    member.headingVector = { x: Number((dx / dist).toFixed(3)), y: 0.0, z: Number((dz / dist).toFixed(3)) };
                    member.targetDistance = Number(dist.toFixed(2));
                    member.isFeinting = false;

                    advisories.push({
                        memberId: member.id,
                        role: member.role,
                        advisoryPosition: member.advisoryPosition,
                        headingVector: member.headingVector,
                        effectiveFear: member.effectiveFear,
                        phase: pack.phase
                    });
                }
                break;
            }

            case ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER:
            default: {
                // Full circular equidistant pincer:
                // Alpha at front (angle 0), Flankers at +90 and -90 deg, Rear guards at 180 deg
                for (let i = 0; i < count; i++) {
                    const member = members[i];
                    let angle;

                    if (member.role === PACK_ROLES.ALPHA_LEADER) {
                        angle = pack.formationAngleOffset || 0.0;
                    } else if (member.role === PACK_ROLES.FLANKER_LEFT) {
                        angle = (pack.formationAngleOffset || 0.0) + (Math.PI / 2);
                    } else if (member.role === PACK_ROLES.FLANKER_RIGHT) {
                        angle = (pack.formationAngleOffset || 0.0) - (Math.PI / 2);
                    } else if (member.role === PACK_ROLES.REAR_GUARD) {
                        angle = (pack.formationAngleOffset || 0.0) + Math.PI;
                    } else {
                        // Equidistant distribution for remaining
                        angle = (pack.formationAngleOffset || 0.0) + (2 * Math.PI * i) / count;
                    }

                    // In Feint phase, bait approaches closer while flankers hold back
                    let memberRadius = baseRadius;
                    if (pack.phase === TACTICAL_PHASES.FEINT_PROBE) {
                        if (member.role === PACK_ROLES.BAIT || member.role === PACK_ROLES.HARASSER) {
                            memberRadius = Math.max(this.config.strikeDistance * 1.5, baseRadius * 0.4);
                            member.isFeinting = true;
                        } else {
                            memberRadius = baseRadius * 1.2;
                            member.isFeinting = false;
                        }
                    } else {
                        member.isFeinting = false;
                    }

                    const advX = target.x + Math.cos(angle) * memberRadius;
                    const advZ = target.z + Math.sin(angle) * memberRadius;

                    const dx = target.x - advX;
                    const dz = target.z - advZ;
                    const dist = Math.hypot(dx, dz) || 1.0;

                    member.advisoryPosition = { x: Number(advX.toFixed(2)), y: Number(target.y.toFixed(2)), z: Number(advZ.toFixed(2)) };
                    member.headingVector = { x: Number((dx / dist).toFixed(3)), y: 0.0, z: Number((dz / dist).toFixed(3)) };
                    member.targetDistance = Number(dist.toFixed(2));

                    advisories.push({
                        memberId: member.id,
                        role: member.role,
                        advisoryPosition: member.advisoryPosition,
                        headingVector: member.headingVector,
                        targetDistance: member.targetDistance,
                        effectiveFear: member.effectiveFear,
                        phase: pack.phase,
                        isFeinting: member.isFeinting
                    });
                }
                break;
            }
        }

        return advisories;
    }

    /**
     * Advance pack tactical simulation tick:
     * Evaluates roles, applies alpha damping, and computes advisory formation vectors.
     * @param {string} packId
     * @param {object} [targetThreat=null]
     * @returns {object} PackTickEvaluation
     */
    tickPack(packId, targetThreat = null) {
        const pack = this.packs.get(String(packId));
        if (!pack) return null;

        this.tickCount++;

        // 1. Reassign roles based on updated states/traits
        this.reassignRoles(packId);

        // 2. Apply Alpha shielding/damping
        this.applyAlphaDamping(packId);

        // 3. Automated Phase Transitions if in hunting loop
        this._updateTacticalPhases(pack);

        // 4. Calculate formation geometry
        const memberAdvisories = this.calculateEncirclementGeometry(packId, targetThreat);

        return {
            packId: pack.id,
            tick: this.tickCount,
            phase: pack.phase,
            pattern: pack.pattern,
            alphaId: pack.alphaId,
            alphaDominance: pack.alphaDominance,
            packCohesion: pack.packCohesion,
            packMorale: pack.packMorale,
            targetThreat: pack.targetThreat,
            members: memberAdvisories,
            host_authority: 'ADVISORY_ONLY'
        };
    }

    /**
     * Internal phase progression logic
     * @private
     */
    _updateTacticalPhases(pack) {
        if (pack.phase === TACTICAL_PHASES.SCATTER_DISPERSE) {
            // Remain in scatter unless explicitly regrouped
            return;
        }

        pack.strikeCadenceTick++;

        // Automated cadence transitions:
        // STALKING (15 ticks) -> ENCIRCLING (20 ticks) -> FEINT_PROBE (15 ticks) -> SYNCHRONIZED_STRIKE (10 ticks) -> REGROUPING
        const phaseDuration = this.tickCount - pack.lastPhaseTransitionTick;

        if (pack.phase === TACTICAL_PHASES.STALKING && phaseDuration >= 15) {
            pack.phase = TACTICAL_PHASES.ENCIRCLING;
            pack.lastPhaseTransitionTick = this.tickCount;
        } else if (pack.phase === TACTICAL_PHASES.ENCIRCLING && phaseDuration >= 20) {
            pack.phase = TACTICAL_PHASES.FEINT_PROBE;
            pack.lastPhaseTransitionTick = this.tickCount;
        } else if (pack.phase === TACTICAL_PHASES.FEINT_PROBE && phaseDuration >= 15) {
            pack.phase = TACTICAL_PHASES.SYNCHRONIZED_STRIKE;
            pack.lastPhaseTransitionTick = this.tickCount;
        } else if (pack.phase === TACTICAL_PHASES.SYNCHRONIZED_STRIKE && phaseDuration >= this.config.strikeSynchronizationWindowTicks) {
            pack.phase = TACTICAL_PHASES.REGROUPING;
            pack.lastPhaseTransitionTick = this.tickCount;
        } else if (pack.phase === TACTICAL_PHASES.REGROUPING && phaseDuration >= 12) {
            pack.phase = TACTICAL_PHASES.ENCIRCLING;
            pack.lastPhaseTransitionTick = this.tickCount;
        }
    }

    /**
     * Explicitly set tactical phase
     * @param {string} packId
     * @param {string} phase - TACTICAL_PHASES
     */
    setPhase(packId, phase) {
        const pack = this.packs.get(String(packId));
        if (!pack || !TACTICAL_PHASES[phase]) return false;
        pack.phase = phase;
        pack.lastPhaseTransitionTick = this.tickCount;
        if (phase === TACTICAL_PHASES.SCATTER_DISPERSE) {
            this.triggerAlphaLoss(packId);
        }
        return true;
    }

    /**
     * Explicitly set encirclement pattern
     * @param {string} packId
     * @param {string} pattern - ENCIRCLEMENT_PATTERNS
     */
    setPattern(packId, pattern) {
        const pack = this.packs.get(String(packId));
        if (!pack || !ENCIRCLEMENT_PATTERNS[pattern]) return false;
        pack.pattern = pattern;
        return true;
    }

    /**
     * Generate an ASCII radar visualization of the pack and target
     * @param {string} packId
     * @param {number} [gridSize=15]
     * @returns {string} ASCII grid
     */
    renderAsciiRadar(packId, gridSize = 15) {
        const pack = this.packs.get(String(packId));
        if (!pack) return 'Pack not found.';

        const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(' . '));
        const center = Math.floor(gridSize / 2);

        // Center is Target Threat [ T ]
        grid[center][center] = '[T]';

        const scale = pack.engagementRadius / (center - 1);

        for (const member of pack.members.values()) {
            const relX = member.advisoryPosition.x - pack.targetThreat.x;
            const relZ = member.advisoryPosition.z - pack.targetThreat.z;

            const gridX = Math.round(center + (relX / scale));
            const gridZ = Math.round(center + (relZ / scale));

            if (gridX >= 0 && gridX < gridSize && gridZ >= 0 && gridZ < gridSize) {
                let symbol = ' M ';
                if (member.role === PACK_ROLES.ALPHA_LEADER) symbol = '👑A';
                else if (member.role === PACK_ROLES.FLANKER_LEFT) symbol = '◀L';
                else if (member.role === PACK_ROLES.FLANKER_RIGHT) symbol = 'R▶';
                else if (member.role === PACK_ROLES.BAIT) symbol = '🎯B';
                else if (member.role === PACK_ROLES.CHASER) symbol = '⚔C';
                else if (member.role === PACK_ROLES.HARASSER) symbol = '⚡H';
                else if (member.role === PACK_ROLES.REAR_GUARD) symbol = '🛡G';

                grid[gridZ][gridX] = symbol;
            }
        }

        const lines = [
            '┌' + '───'.repeat(gridSize) + '┐',
            ...grid.map(row => '│' + row.join('') + '│'),
            '└' + '───'.repeat(gridSize) + '┘',
            'Legend: [T] Target Threat | 👑A Alpha | ◀L/R▶ Flankers | ⚔C Chaser | 🎯B Bait | 🛡G Rear Guard'
        ];
        return lines.join('\n');
    }
}

export default PackCoordinationEngine;
