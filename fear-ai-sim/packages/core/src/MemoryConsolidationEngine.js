/**
 * MemoryConsolidationEngine - Cognitive Memory Consolidation, Pruning & Pathology Suite
 * 
 * Front B / Sections 23–24:
 * 1. Sleep/Downtime Memory Consolidation:
 *    Abstracts repeated episodic incidents into generalized semantic world knowledge
 *    (e.g. multiple ambush skirmishes in a region consolidate into a high-confidence HAZARD belief).
 * 2. Deterministic Pruning with Protection Classes:
 *    Guards critical survival anchors (flashbulb traumas, unresolved grievances, sanctuary keys)
 *    while pruning mundane memories via exponential age-weighted salience decay.
 * 3. Pavlovian Extinction Learning & Stale Threat Forgetting:
 *    Progressively diminishes unreinforced trauma dread when cues are experienced safely.
 * 4. Memory Pathology Detection & Remediation:
 *    Detects and cures dangling entity references, epistemic contradictions, hallucinated coordinates,
 *    and permanent stale threat panic.
 *
 * Strictly adheres to the Host Game Authority Invariant:
 * Evaluates and manages internal NPC cognitive state without mutating host world/physics state.
 */

import { SEMANTIC_CATEGORIES, EPISODIC_EVENT_TYPES } from './LayeredMemorySystem.js';

export const PROTECTION_CLASSES = Object.freeze({
    PERMANENT_ANCHOR: 'PERMANENT_ANCHOR',
    UNRESOLVED_GRIEVANCE: 'UNRESOLVED_GRIEVANCE',
    CRITICAL_SANCTUARY: 'CRITICAL_SANCTUARY',
    RECURRENT_TRAUMA: 'RECURRENT_TRAUMA',
    NONE: 'NONE'
});

export const MEMORY_PATHOLOGY_TYPES = Object.freeze({
    DANGLING_ENTITY_REFERENCE: 'DANGLING_ENTITY_REFERENCE',
    EPISTEMIC_CONTRADICTION: 'EPISTEMIC_CONTRADICTION',
    PERMANENT_STALE_THREAT_PANIC: 'PERMANENT_STALE_THREAT_PANIC',
    HALLUCINATED_COORDINATES: 'HALLUCINATED_COORDINATES',
    RUMOR_INFLATION_ECHO: 'RUMOR_INFLATION_ECHO'
});

export const DEFAULT_CONSOLIDATION_CONFIG = Object.freeze({
    spatialClusterRadius: 25.0,
    minClusterSizeForHazard: 3,
    minClusterSizeForSanctuary: 2,
    permanentAnchorSalienceThreshold: 0.85,
    pruneSalienceThreshold: 0.05,
    pruneDecayRate: 0.001,
    staleThreatTickThreshold: 3000,
    extinctionRate: 0.15,
    grievanceProtectionMaxAge: 2500
});

export class MemoryPathologyDetector {
    /**
     * Inspects a LayeredMemorySystem for cognitive pathologies
     * @param {object} memorySystem - LayeredMemorySystem instance
     * @param {object} [context={}]
     * @param {Array<string>} [context.validEntityIds=null]
     * @param {number} [context.currentTick=0]
     * @param {number} [context.staleThreatTickThreshold=3000]
     * @returns {object} Pathology report
     */
    static detect(memorySystem, context = {}) {
        const pathologies = [];
        const currentTick = Number(context.currentTick ?? memorySystem.tickCount ?? 0);
        const staleThreshold = Number(context.staleThreatTickThreshold ?? DEFAULT_CONSOLIDATION_CONFIG.staleThreatTickThreshold);
        const validIds = Array.isArray(context.validEntityIds) ? new Set(context.validEntityIds) : null;

        // 1. Check Dangling Entity References
        if (validIds) {
            for (const ep of memorySystem.episodic) {
                for (const pid of ep.participants) {
                    if (!validIds.has(pid)) {
                        pathologies.push({
                            type: MEMORY_PATHOLOGY_TYPES.DANGLING_ENTITY_REFERENCE,
                            severity: 'MEDIUM',
                            layer: 'episodic',
                            memoryId: ep.id,
                            entityId: pid,
                            description: `Episodic memory #${ep.id} (${ep.type}) references non-existent or deleted entity "${pid}".`
                        });
                    }
                }
            }
            for (const tr of memorySystem.trauma) {
                if (tr.cueType === 'ENTITY' && !validIds.has(tr.cueValue)) {
                    pathologies.push({
                        type: MEMORY_PATHOLOGY_TYPES.DANGLING_ENTITY_REFERENCE,
                        severity: 'HIGH',
                        layer: 'trauma',
                        memoryId: tr.id,
                        entityId: tr.cueValue,
                        description: `Trauma memory #${tr.id} conditions dread on deleted entity "${tr.cueValue}".`
                    });
                }
            }
        }

        // 2. Check Hallucinated Coordinates (NaN, infinite, or missing numbers)
        for (const ep of memorySystem.episodic) {
            if (ep.location && (!Number.isFinite(ep.location.x) || !Number.isFinite(ep.location.y) || (ep.location.z !== undefined && !Number.isFinite(ep.location.z)))) {
                pathologies.push({
                    type: MEMORY_PATHOLOGY_TYPES.HALLUCINATED_COORDINATES,
                    severity: 'HIGH',
                    layer: 'episodic',
                    memoryId: ep.id,
                    description: `Episodic memory #${ep.id} contains non-finite spatial coordinates.`
                });
            }
        }
        for (const tr of memorySystem.trauma) {
            if (tr.location && (!Number.isFinite(tr.location.x) || !Number.isFinite(tr.location.y) || (tr.location.z !== undefined && !Number.isFinite(tr.location.z)))) {
                pathologies.push({
                    type: MEMORY_PATHOLOGY_TYPES.HALLUCINATED_COORDINATES,
                    severity: 'HIGH',
                    layer: 'trauma',
                    memoryId: tr.id,
                    description: `Trauma memory #${tr.id} contains non-finite spatial coordinates.`
                });
            }
        }
        for (const [key, sem] of memorySystem.semantic.entries()) {
            if (sem.location && (!Number.isFinite(sem.location.x) || !Number.isFinite(sem.location.y) || (sem.location.z !== undefined && !Number.isFinite(sem.location.z)))) {
                pathologies.push({
                    type: MEMORY_PATHOLOGY_TYPES.HALLUCINATED_COORDINATES,
                    severity: 'HIGH',
                    layer: 'semantic',
                    key,
                    description: `Semantic entry "${key}" contains non-finite spatial coordinates.`
                });
            }
        }

        // 3. Check Epistemic Contradictions (e.g. proximate HAZARD and SANCTUARY with dual high confidence)
        const semanticEntries = Array.from(memorySystem.semantic.values());
        for (let i = 0; i < semanticEntries.length; i++) {
            for (let j = i + 1; j < semanticEntries.length; j++) {
                const s1 = semanticEntries[i];
                const s2 = semanticEntries[j];

                if (s1.location && s2.location) {
                    const dx = s1.location.x - s2.location.x;
                    const dy = s1.location.y - s2.location.y;
                    const dz = (s1.location.z || 0) - (s2.location.z || 0);
                    const distSq = dx * dx + dy * dy + dz * dz;

                    // Within 20 meters
                    if (distSq <= 400) {
                        const isOpposite = (s1.category === SEMANTIC_CATEGORIES.HAZARD && s2.category === SEMANTIC_CATEGORIES.SANCTUARY) ||
                                           (s1.category === SEMANTIC_CATEGORIES.SANCTUARY && s2.category === SEMANTIC_CATEGORIES.HAZARD);
                        if (isOpposite && s1.confidence >= 0.60 && s2.confidence >= 0.60) {
                            pathologies.push({
                                type: MEMORY_PATHOLOGY_TYPES.EPISTEMIC_CONTRADICTION,
                                severity: 'HIGH',
                                layer: 'semantic',
                                key1: s1.key,
                                key2: s2.key,
                                description: `Direct epistemic contradiction between "${s1.key}" (${s1.category}, conf ${s1.confidence.toFixed(2)}) and "${s2.key}" (${s2.category}, conf ${s2.confidence.toFixed(2)}) within ${(Math.sqrt(distSq)).toFixed(1)}m.`
                            });
                        }
                    }
                }
            }
        }

        // 4. Check Permanent Stale Threat Panic
        for (const tr of memorySystem.trauma) {
            const unreinforcedTicks = currentTick - (tr.lastReinforcedTick ?? tr.createdTick ?? 0);
            if (unreinforcedTicks > staleThreshold && tr.dreadIntensity >= 0.70) {
                pathologies.push({
                    type: MEMORY_PATHOLOGY_TYPES.PERMANENT_STALE_THREAT_PANIC,
                    severity: 'MEDIUM',
                    layer: 'trauma',
                    memoryId: tr.id,
                    cueType: tr.cueType,
                    cueValue: tr.cueValue,
                    unreinforcedTicks,
                    description: `Trauma #${tr.id} (${tr.cueType}:${tr.cueValue}) retains high dread (${tr.dreadIntensity.toFixed(2)}) despite ${unreinforcedTicks} ticks without reinforcement.`
                });
            }
        }

        return {
            healthy: pathologies.length === 0,
            pathologyCount: pathologies.length,
            pathologies
        };
    }
}

export class MemoryConsolidationEngine {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONSOLIDATION_CONFIG, ...config };
    }

    /**
     * Assigns a protection class to an episodic memory
     * @param {object} entry - EpisodicEntry
     * @param {number} currentTick
     * @returns {string} PROTECTION_CLASSES
     */
    classifyProtection(entry, currentTick = 0) {
        if (!entry) return PROTECTION_CLASSES.NONE;

        // Flashbulb / critical survival memories
        if (entry.salience >= this.config.permanentAnchorSalienceThreshold) {
            return PROTECTION_CLASSES.PERMANENT_ANCHOR;
        }

        // Unresolved social grievances (abandonment, betrayal) within age limit
        if (entry.type === EPISODIC_EVENT_TYPES.ABANDONED_BY_PEER) {
            const age = currentTick - (entry.tick || 0);
            if (age <= this.config.grievanceProtectionMaxAge) {
                return PROTECTION_CLASSES.UNRESOLVED_GRIEVANCE;
            }
        }

        if (entry.type === EPISODIC_EVENT_TYPES.SAFE_SANCTUARY_DISCOVERED && entry.salience >= 0.70) {
            return PROTECTION_CLASSES.CRITICAL_SANCTUARY;
        }

        return PROTECTION_CLASSES.NONE;
    }

    /**
     * Consolidates episodic memories into semantic knowledge during calm downtime
     * @param {object} memorySystem - LayeredMemorySystem
     * @param {object} [options={}]
     * @returns {object} Consolidation report
     */
    consolidate(memorySystem, options = {}) {
        const currentTick = Number(options.currentTick ?? memorySystem.tickCount ?? 0);
        const radius = Number(options.spatialClusterRadius ?? this.config.spatialClusterRadius);
        const radiusSq = radius * radius;

        let hazardsConsolidated = 0;
        let sanctuariesConsolidated = 0;
        let prunedEpisodes = 0;

        // 1. Group episodic memories by spatial clusters and affinity
        const hazardEvents = [];
        const sanctuaryEvents = [];

        for (const ep of memorySystem.episodic) {
            if (!ep.location) continue;

            if ([EPISODIC_EVENT_TYPES.SURVIVED_AMBUSH, EPISODIC_EVENT_TYPES.NEAR_DEATH_PANIC, EPISODIC_EVENT_TYPES.COMBAT_CONFRONTATION].includes(ep.type)) {
                hazardEvents.push(ep);
            } else if ([EPISODIC_EVENT_TYPES.ALLIED_EXTRACTION, EPISODIC_EVENT_TYPES.SAFE_SANCTUARY_DISCOVERED, EPISODIC_EVENT_TYPES.REASSURED_BY_LEADER].includes(ep.type)) {
                sanctuaryEvents.push(ep);
            }
        }

        // Helper to cluster events spatially
        const clusterEvents = (events) => {
            const clusters = [];
            const visited = new Set();

            for (let i = 0; i < events.length; i++) {
                if (visited.has(events[i].id)) continue;
                const cluster = [events[i]];
                visited.add(events[i].id);

                for (let j = i + 1; j < events.length; j++) {
                    if (visited.has(events[j].id)) continue;
                    const dx = events[i].location.x - events[j].location.x;
                    const dy = events[i].location.y - events[j].location.y;
                    const dz = (events[i].location.z || 0) - (events[j].location.z || 0);
                    if (dx * dx + dy * dy + dz * dz <= radiusSq) {
                        cluster.push(events[j]);
                        visited.add(events[j].id);
                    }
                }
                clusters.push(cluster);
            }
            return clusters;
        };

        // 2. Consolidate hazard clusters
        const hazardClusters = clusterEvents(hazardEvents);
        for (const cluster of hazardClusters) {
            if (cluster.length >= this.config.minClusterSizeForHazard) {
                // Compute centroid
                let sumX = 0, sumY = 0, sumZ = 0;
                let unreliabilityProduct = 1.0;

                for (const ev of cluster) {
                    sumX += ev.location.x;
                    sumY += ev.location.y;
                    sumZ += (ev.location.z || 0);
                    unreliabilityProduct *= (1.0 - ev.salience * 0.5);
                }

                const K = cluster.length;
                const centroid = { x: sumX / K, y: sumY / K, z: sumZ / K };
                const confidence = Math.min(1.0, 1.0 - unreliabilityProduct);

                const key = `consolidated_hazard_${Math.round(centroid.x)}_${Math.round(centroid.y)}`;
                memorySystem.recordSemantic(key, SEMANTIC_CATEGORIES.HAZARD, centroid, confidence, {
                    source: 'EPISODIC_CONSOLIDATION',
                    incidentCount: K,
                    consolidatedTick: currentTick
                }, currentTick);

                hazardsConsolidated++;

                // Mark episodes or prune non-anchors
                for (const ev of cluster) {
                    if (this.classifyProtection(ev, currentTick) === PROTECTION_CLASSES.NONE) {
                        ev.salience = Math.max(0.01, ev.salience * 0.4); // Demote consolidated detail
                    }
                }
            }
        }

        // 3. Consolidate sanctuary clusters
        const sanctuaryClusters = clusterEvents(sanctuaryEvents);
        for (const cluster of sanctuaryClusters) {
            if (cluster.length >= this.config.minClusterSizeForSanctuary) {
                let sumX = 0, sumY = 0, sumZ = 0;
                let unreliabilityProduct = 1.0;

                for (const ev of cluster) {
                    sumX += ev.location.x;
                    sumY += ev.location.y;
                    sumZ += (ev.location.z || 0);
                    unreliabilityProduct *= (1.0 - ev.salience * 0.5);
                }

                const K = cluster.length;
                const centroid = { x: sumX / K, y: sumY / K, z: sumZ / K };
                const confidence = Math.min(1.0, 1.0 - unreliabilityProduct);

                const key = `consolidated_sanctuary_${Math.round(centroid.x)}_${Math.round(centroid.y)}`;
                memorySystem.recordSemantic(key, SEMANTIC_CATEGORIES.SANCTUARY, centroid, confidence, {
                    source: 'EPISODIC_CONSOLIDATION',
                    incidentCount: K,
                    consolidatedTick: currentTick
                }, currentTick);

                sanctuariesConsolidated++;

                for (const ev of cluster) {
                    if (this.classifyProtection(ev, currentTick) === PROTECTION_CLASSES.NONE) {
                        ev.salience = Math.max(0.01, ev.salience * 0.4);
                    }
                }
            }
        }

        // 4. Prune demoted/mundane episodic items
        for (let i = memorySystem.episodic.length - 1; i >= 0; i--) {
            const ep = memorySystem.episodic[i];
            const pClass = this.classifyProtection(ep, currentTick);
            if (pClass === PROTECTION_CLASSES.NONE && ep.salience < this.config.pruneSalienceThreshold) {
                memorySystem.episodic.splice(i, 1);
                prunedEpisodes++;
            }
        }

        return {
            currentTick,
            hazardsConsolidated,
            sanctuariesConsolidated,
            prunedEpisodes,
            remainingEpisodicCount: memorySystem.episodic.length,
            totalSemanticCount: memorySystem.semantic.size
        };
    }

    /**
     * Selectively prunes unprotected memories based on exponential age decay
     * @param {object} memorySystem - LayeredMemorySystem
     * @param {object} [options={}]
     * @returns {object} Pruning report
     */
    prune(memorySystem, options = {}) {
        const currentTick = Number(options.currentTick ?? memorySystem.tickCount ?? 0);
        const decayRate = Number(options.decayRate ?? this.config.pruneDecayRate);
        const threshold = Number(options.threshold ?? this.config.pruneSalienceThreshold);

        let protectedCount = 0;
        let prunedEpisodic = 0;

        for (let i = memorySystem.episodic.length - 1; i >= 0; i--) {
            const ep = memorySystem.episodic[i];
            const pClass = this.classifyProtection(ep, currentTick);

            if (pClass !== PROTECTION_CLASSES.NONE) {
                protectedCount++;
                continue;
            }

            const age = Math.max(0, currentTick - (ep.tick || 0));
            const effectiveSalience = ep.salience * Math.exp(-decayRate * age);

            if (effectiveSalience < threshold) {
                memorySystem.episodic.splice(i, 1);
                prunedEpisodic++;
            } else {
                ep.salience = effectiveSalience;
            }
        }

        return {
            currentTick,
            protectedCount,
            prunedEpisodic,
            remainingEpisodic: memorySystem.episodic.length
        };
    }

    /**
     * Applies Pavlovian extinction learning to conditioned trauma dread memories
     * @param {object} memorySystem - LayeredMemorySystem
     * @param {Array<object>} safeExposures - Array<{ cueType, cueValue, location, currentTick }>
     * @param {number} [extinctionRate=0.15]
     * @returns {object} Extinction report
     */
    applyExtinction(memorySystem, safeExposures = [], extinctionRate = null) {
        const rate = Number(extinctionRate ?? this.config.extinctionRate);
        let extinguishedTraumaCount = 0;
        let extinguishedCompletely = 0;

        for (const exp of safeExposures) {
            const currentTick = Number(exp.currentTick ?? memorySystem.tickCount ?? 0);

            for (let i = memorySystem.trauma.length - 1; i >= 0; i--) {
                const tr = memorySystem.trauma[i];
                let isMatch = false;

                if (exp.cueType && exp.cueValue && tr.cueType === exp.cueType && tr.cueValue === exp.cueValue) {
                    isMatch = true;
                } else if (tr.cueType === 'SPATIAL' && tr.location && exp.location) {
                    const dx = tr.location.x - exp.location.x;
                    const dy = tr.location.y - exp.location.y;
                    const dz = (tr.location.z || 0) - (exp.location.z || 0);
                    if (dx * dx + dy * dy + dz * dz <= tr.radius * tr.radius) {
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    tr.dreadIntensity *= (1.0 - rate);
                    tr.lastReinforcedTick = currentTick;
                    extinguishedTraumaCount++;

                    if (tr.dreadIntensity < 0.03) {
                        memorySystem.trauma.splice(i, 1);
                        extinguishedCompletely++;
                    }
                }
            }
        }

        return {
            extinguishedTraumaCount,
            extinguishedCompletely,
            remainingTraumaCount: memorySystem.trauma.length
        };
    }

    /**
     * Remediates cognitive pathologies found by MemoryPathologyDetector
     * @param {object} memorySystem - LayeredMemorySystem
     * @param {object} pathologyReport - Output of MemoryPathologyDetector.detect
     * @returns {object} Remediation summary
     */
    remediate(memorySystem, pathologyReport) {
        if (!pathologyReport || !Array.isArray(pathologyReport.pathologies)) {
            return { remediatedCount: 0 };
        }

        let remediatedCount = 0;

        for (const p of pathologyReport.pathologies) {
            switch (p.type) {
                case MEMORY_PATHOLOGY_TYPES.DANGLING_ENTITY_REFERENCE: {
                    if (p.layer === 'episodic') {
                        const ep = memorySystem.episodic.find(e => e.id === p.memoryId);
                        if (ep) {
                            ep.participants = ep.participants.filter(id => id !== p.entityId);
                            remediatedCount++;
                        }
                    } else if (p.layer === 'trauma') {
                        const idx = memorySystem.trauma.findIndex(t => t.id === p.memoryId);
                        if (idx !== -1) {
                            memorySystem.trauma.splice(idx, 1);
                            remediatedCount++;
                        }
                    }
                    break;
                }

                case MEMORY_PATHOLOGY_TYPES.HALLUCINATED_COORDINATES: {
                    if (p.layer === 'episodic') {
                        const idx = memorySystem.episodic.findIndex(e => e.id === p.memoryId);
                        if (idx !== -1) {
                            memorySystem.episodic.splice(idx, 1);
                            remediatedCount++;
                        }
                    } else if (p.layer === 'trauma') {
                        const idx = memorySystem.trauma.findIndex(t => t.id === p.memoryId);
                        if (idx !== -1) {
                            memorySystem.trauma.splice(idx, 1);
                            remediatedCount++;
                        }
                    } else if (p.layer === 'semantic' && p.key) {
                        memorySystem.semantic.delete(p.key);
                        remediatedCount++;
                    }
                    break;
                }

                case MEMORY_PATHOLOGY_TYPES.EPISTEMIC_CONTRADICTION: {
                    const s1 = memorySystem.semantic.get(p.key1);
                    const s2 = memorySystem.semantic.get(p.key2);
                    if (s1 && s2) {
                        // Keep newer or higher confidence; demote older or lower confidence
                        if (s1.lastSeenTick > s2.lastSeenTick || (s1.lastSeenTick === s2.lastSeenTick && s1.confidence >= s2.confidence)) {
                            s2.confidence = Math.max(0.1, s2.confidence * 0.3);
                        } else {
                            s1.confidence = Math.max(0.1, s1.confidence * 0.3);
                        }
                        remediatedCount++;
                    }
                    break;
                }

                case MEMORY_PATHOLOGY_TYPES.PERMANENT_STALE_THREAT_PANIC: {
                    const tr = memorySystem.trauma.find(t => t.id === p.memoryId);
                    if (tr) {
                        // Extinguish stale dread
                        tr.dreadIntensity = Math.min(0.05, tr.dreadIntensity * 0.1);
                        remediatedCount++;
                    }
                    break;
                }

                default:
                    break;
            }
        }

        return {
            remediatedCount,
            remainingPathologies: MemoryPathologyDetector.detect(memorySystem).pathologyCount
        };
    }
}

export default MemoryConsolidationEngine;
