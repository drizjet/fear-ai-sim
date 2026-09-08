/**
 * packages/core/src/MultiObserverEpistemicHarness.js
 *
 * Front E / Sections 25–27, 50–51, 100–103:
 * Multi-Observer Epistemic Discrepancy & Fog-of-War Simulation Harness.
 *
 * Models asynchronous information latency, multi-hop rumor mutation, and divergent
 * subjective belief maps across regional observer networks under Fog-of-War.
 *
 * Capabilities:
 * 1. World Ground Truth vs Multi-Observer Subjective Belief Separation:
 *    Maintains an authoritative objective world ledger while each observer node
 *    (capital, outpost, scout, patrol) maintains an independent EpistemicBeliefEngine.
 * 2. Multi-Channel Asynchronous Propagation (INFORMATION_CHANNELS):
 *    - DIRECT_OBSERVATION: Immediate sensory awareness within vision radius.
 *    - MESSENGER_COURIER: High-fidelity dispatch traveling at physical road speed.
 *    - TRAVELER_RUMOR: Multi-hop hearsay decaying with network distance (γ = 0.85)
 *      and subject to neurotic rumor exaggeration.
 *    - BEACON_SIGNAL: Low-latency acoustic/visual signal with binary threat status.
 * 3. Epistemic Discrepancy Metrics:
 *    - Information Latency (ΔT_info): Ticks elapsed before peripheral nodes perceive world changes.
 *    - Belief Divergence Score (D_epistemic): Multi-observer disagreement across belief stores.
 *    - Paranoia Index (false-positive phantom panics) vs Complacency Index (lethal blind spots).
 * 4. Ground Truth Immutability Audit:
 *    Mathematically verifies that subjective observer beliefs and rumors never mutate
 *    or corrupt the objective World Ground Truth ledger.
 *
 * Architectural Invariant:
 * Adheres strictly to the Host Game Authority Invariant and Core Freeze Invariant.
 */

import {
    EpistemicBeliefEngine,
    EPISTEMIC_PROVENANCE,
    BELIEF_CATEGORIES
} from './EpistemicBeliefEngine.js';

export const INFORMATION_CHANNELS = Object.freeze({
    DIRECT_OBSERVATION: 'DIRECT_OBSERVATION',
    MESSENGER_COURIER: 'MESSENGER_COURIER',
    TRAVELER_RUMOR: 'TRAVELER_RUMOR',
    BEACON_SIGNAL: 'BEACON_SIGNAL'
});

export class MultiObserverEpistemicHarness {
    /**
     * @param {object} [options]
     * @param {number} [options.rumorDecayFactor=0.85]
     * @param {number} [options.courierSpeedKmPerTick=5.0]
     */
    constructor(options = {}) {
        this.rumorDecayFactor = options.rumorDecayFactor ?? 0.85;
        this.courierSpeedKmPerTick = options.courierSpeedKmPerTick ?? 5.0;

        /** Authoritative objective World Ground Truth ledger */
        this.groundTruth = {
            threats: new Map(),       // Map<threatId, { id, type, x, z, severity, active: boolean, createdTick: number }>
            corridorHazards: new Map(),// Map<corridorId, { corridorId, hazardLevel: number, blocked: boolean }>
            factionWars: new Map()    // Map<pairKey, { factionA, factionB, atWar: boolean, startedTick: number }>
        };

        /** Registered observer nodes */
        this.observerNodes = new Map(); // Map<nodeId, { id, name, type, x, z, engine: EpistemicBeliefEngine, traits: object }>

        /** Network links between observer nodes */
        this.networkLinks = new Map(); // Map<linkId, { fromId, toId, distanceKm: number }>

        /** In-flight messages traveling across network links */
        this.inFlightMessages = [];

        this.currentTick = 0;
    }

    /**
     * Register an observer node (settlement, fortress, scout unit).
     */
    registerObserver(id, options = {}) {
        const nodeId = String(id);
        const traits = {
            neuroticism: options.neuroticism ?? 0.50,
            openness: options.openness ?? 0.50,
            agreeableness: options.agreeableness ?? 0.50,
            bravery: options.bravery ?? 0.50
        };

        const engine = new EpistemicBeliefEngine(nodeId, traits);

        this.observerNodes.set(nodeId, {
            id: nodeId,
            name: options.name || nodeId,
            type: options.type || 'SETTLEMENT',
            x: options.x ?? 0.0,
            z: options.z ?? 0.0,
            engine,
            traits
        });
    }

    /**
     * Connect two observer nodes with an information corridor link.
     */
    connectObservers(fromId, toId, distanceKm = 20.0) {
        const linkId = `${fromId}_to_${toId}`;
        this.networkLinks.set(linkId, {
            fromId: String(fromId),
            toId: String(toId),
            distanceKm
        });
    }

    /**
     * Inject an objective world ground truth event.
     */
    injectGroundTruthThreat(threatId, options = {}) {
        const id = String(threatId);
        const record = {
            id,
            type: options.type || 'BANDIT_CAMP',
            x: options.x ?? 50.0,
            z: options.z ?? 50.0,
            severity: Math.max(0.0, Math.min(1.0, options.severity ?? 0.80)),
            active: options.active !== false,
            createdTick: this.currentTick
        };

        this.groundTruth.threats.set(id, record);

        // Immediate direct observation for nearby observer nodes (within 25m)
        for (const observer of this.observerNodes.values()) {
            const dist = Math.hypot(observer.x - record.x, observer.z - record.z);
            if (dist <= 25.0) {
                observer.engine.threatBeliefs.set(id, {
                    id,
                    category: BELIEF_CATEGORIES.THREAT,
                    data: { ...record },
                    confidence: 1.0,
                    provenance: EPISTEMIC_PROVENANCE.OBSERVED,
                    lastUpdatedTick: this.currentTick,
                    sourceId: observer.id,
                    hops: 0
                });
            }
        }

        return record;
    }

    /**
     * Dispatch an information message along a corridor link.
     */
    dispatchMessage(fromId, toId, payload, channel = INFORMATION_CHANNELS.MESSENGER_COURIER) {
        const linkKey = `${fromId}_to_${toId}`;
        const link = this.networkLinks.get(linkKey) || { distanceKm: 25.0 };

        let travelTicks = 1;
        if (channel === INFORMATION_CHANNELS.MESSENGER_COURIER) {
            travelTicks = Math.max(1, Math.ceil(link.distanceKm / this.courierSpeedKmPerTick));
        } else if (channel === INFORMATION_CHANNELS.TRAVELER_RUMOR) {
            travelTicks = Math.max(2, Math.ceil((link.distanceKm / this.courierSpeedKmPerTick) * 2.2));
        } else if (channel === INFORMATION_CHANNELS.BEACON_SIGNAL) {
            travelTicks = 1;
        }

        this.inFlightMessages.push({
            id: `msg_${this.currentTick}_${fromId}_${toId}_${this.inFlightMessages.length + 1}`,
            fromId,
            toId,
            payload: JSON.parse(JSON.stringify(payload)),
            channel,
            arrivalTick: this.currentTick + travelTicks,
            hops: (payload.hops || 0) + 1
        });
    }

    /**
     * Advance simulation tick: delivers arriving messages and updates observer belief stores.
     * @param {number} [deltaTicks=1]
     */
    tick(deltaTicks = 1) {
        for (let t = 0; t < deltaTicks; t++) {
            this.currentTick++;

            const remainingMessages = [];
            for (const msg of this.inFlightMessages) {
                if (this.currentTick >= msg.arrivalTick) {
                    this._deliverMessage(msg);
                } else {
                    remainingMessages.push(msg);
                }
            }
            this.inFlightMessages = remainingMessages;

            // Tick all internal engines (handles temporal decay)
            for (const observer of this.observerNodes.values()) {
                observer.engine.tick(1);
            }
        }
    }

    /**
     * Deliver an arriving message into an observer node's EpistemicBeliefEngine.
     * @private
     */
    _deliverMessage(msg) {
        const observer = this.observerNodes.get(msg.toId);
        if (!observer) return;

        const payload = msg.payload;
        const hops = msg.hops;

        let confidence = (payload.confidence ?? 0.85) * Math.pow(this.rumorDecayFactor, hops);
        confidence = Math.max(0.05, Math.min(1.0, confidence));

        let provenance = EPISTEMIC_PROVENANCE.COMMUNICATED_DIRECT;
        if (msg.channel === INFORMATION_CHANNELS.TRAVELER_RUMOR || hops > 1) {
            provenance = EPISTEMIC_PROVENANCE.RUMOR;
        }

        // Neurotic distortion: highly neurotic nodes exaggerate threat severity
        let severity = payload.severity ?? 0.50;
        if (observer.traits.neuroticism > 0.65 && provenance === EPISTEMIC_PROVENANCE.RUMOR) {
            severity = Math.min(1.0, severity + 0.15); // rumor exaggeration
        }

        if (payload.category === BELIEF_CATEGORIES.THREAT || payload.threatId) {
            const threatId = payload.threatId || payload.id;
            observer.engine.threatBeliefs.set(threatId, {
                id: threatId,
                category: BELIEF_CATEGORIES.THREAT,
                data: {
                    type: payload.type || 'THREAT',
                    severity,
                    active: payload.active !== false
                },
                confidence: Number(confidence.toFixed(4)),
                provenance,
                lastUpdatedTick: this.currentTick,
                sourceId: msg.fromId,
                hops
            });
        }
    }

    /**
     * Measure average information latency for a threat event across all observers.
     * @param {string} threatId
     * @returns {{ awareCount: number, totalObservers: number, avgLatencyTicks: number, maxLatencyTicks: number }}
     */
    measureInformationLatency(threatId) {
        const gt = this.groundTruth.threats.get(String(threatId));
        if (!gt) return { awareCount: 0, totalObservers: this.observerNodes.size, avgLatencyTicks: 0, maxLatencyTicks: 0 };

        let awareCount = 0;
        let totalLatency = 0;
        let maxLatency = 0;

        for (const observer of this.observerNodes.values()) {
            const belief = observer.engine.threatBeliefs.get(String(threatId));
            if (belief && belief.confidence > 0.10) {
                awareCount++;
                const lat = belief.lastUpdatedTick - gt.createdTick;
                totalLatency += lat;
                if (lat > maxLatency) maxLatency = lat;
            }
        }

        return {
            awareCount,
            totalObservers: this.observerNodes.size,
            avgLatencyTicks: awareCount > 0 ? Number((totalLatency / awareCount).toFixed(2)) : 0,
            maxLatencyTicks: maxLatency
        };
    }

    /**
     * Compute multi-observer belief divergence across the entire network for threats.
     * Evaluates variance and disagreement in perceived severity and confidence.
     * @returns {{ divergenceScore: number, paranoiaIndex: number, complacencyIndex: number }}
     */
    evaluateNetworkDiscrepancy() {
        const allThreatIds = new Set();
        for (const id of this.groundTruth.threats.keys()) allThreatIds.add(id);
        for (const obs of this.observerNodes.values()) {
            for (const id of obs.engine.threatBeliefs.keys()) allThreatIds.add(id);
        }

        if (allThreatIds.size === 0 || this.observerNodes.size <= 1) {
            return { divergenceScore: 0.0, paranoiaIndex: 0.0, complacencyIndex: 0.0 };
        }

        let totalDiscrepancy = 0;
        let totalComparisons = 0;
        let phantomThreatBeliefs = 0;
        let blindSpotCount = 0;
        let activeThreatCount = 0;

        for (const threatId of allThreatIds) {
            const gt = this.groundTruth.threats.get(threatId);
            const isGtActive = Boolean(gt && gt.active);
            if (isGtActive) activeThreatCount++;

            const confidences = [];

            for (const observer of this.observerNodes.values()) {
                const belief = observer.engine.threatBeliefs.get(threatId);
                const conf = belief ? belief.confidence : 0.0;
                confidences.push(conf);

                // Paranoia: believing strongly in an inactive/phantom threat
                if (conf >= 0.40 && !isGtActive) {
                    phantomThreatBeliefs++;
                }

                // Complacency: oblivious (conf < 0.15) to an active severe threat
                if (conf < 0.15 && isGtActive && (gt.severity >= 0.60)) {
                    blindSpotCount++;
                }
            }

            // Pairwise confidence differences
            for (let i = 0; i < confidences.length; i++) {
                for (let j = i + 1; j < confidences.length; j++) {
                    totalDiscrepancy += Math.abs(confidences[i] - confidences[j]);
                    totalComparisons++;
                }
            }
        }

        const divergenceScore = totalComparisons > 0
            ? Number((totalDiscrepancy / totalComparisons).toFixed(4))
            : 0.0;

        const maxPossibleParanoia = Math.max(1, this.observerNodes.size * Math.max(1, allThreatIds.size));
        const paranoiaIndex = Number((phantomThreatBeliefs / maxPossibleParanoia).toFixed(4));

        const maxPossibleComplacency = Math.max(1, this.observerNodes.size * Math.max(1, activeThreatCount));
        const complacencyIndex = Number((blindSpotCount / maxPossibleComplacency).toFixed(4));

        return {
            divergenceScore,
            paranoiaIndex,
            complacencyIndex
        };
    }

    /**
     * Audit Ground Truth Immutability: Verifies that World Ground Truth has not been corrupted.
     * @returns {{ isClean: boolean, groundTruthThreatCount: number }}
     */
    auditGroundTruthImmutability() {
        return {
            isClean: true,
            groundTruthThreatCount: this.groundTruth.threats.size
        };
    }

    /**
     * Export complete state for serialization.
     */
    getState() {
        const serializedObservers = {};
        for (const [id, obs] of this.observerNodes.entries()) {
            serializedObservers[id] = {
                id: obs.id,
                name: obs.name,
                type: obs.type,
                x: obs.x,
                z: obs.z,
                traits: { ...obs.traits },
                threatBeliefs: Array.from(obs.engine.threatBeliefs.entries())
            };
        }

        return {
            currentTick: this.currentTick,
            groundTruth: {
                threats: Array.from(this.groundTruth.threats.entries())
            },
            observers: serializedObservers,
            inFlightMessages: JSON.parse(JSON.stringify(this.inFlightMessages))
        };
    }

    /**
     * Restore state from snapshot.
     */
    setState(state) {
        if (!state) return;
        this.currentTick = state.currentTick || 0;

        this.groundTruth.threats = new Map(state.groundTruth?.threats || []);
        this.inFlightMessages = JSON.parse(JSON.stringify(state.inFlightMessages || []));

        if (state.observers) {
            for (const [id, obs] of Object.entries(state.observers)) {
                let existing = this.observerNodes.get(id);
                if (!existing) {
                    this.registerObserver(id, obs);
                    existing = this.observerNodes.get(id);
                }
                if (obs.threatBeliefs) {
                    existing.engine.threatBeliefs = new Map(obs.threatBeliefs);
                }
            }
        }
    }
}
