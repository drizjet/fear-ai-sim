/**
 * packages/core/src/EpistemicBeliefEngine.js
 *
 * Front B / Sections 25–27: Epistemic State & Layered Belief Discrepancy Engine.
 *
 * Implements:
 * 1. World Ground Truth vs. Subjective Agent Belief separation:
 *    - Agents make fear appraisals and tactical decisions based strictly on their subjective
 *      epistemic state, rather than omniscient access to host world truth.
 * 2. Epistemic Provenance Tracking:
 *    - OBSERVED: Direct sensory perception (confidence 0.90..1.0).
 *    - COMMUNICATED_DIRECT: Direct communication from proximate ally (scaled by trust).
 *    - RUMOR: Multi-hop hearsay decaying with network hop distance (gamma = 0.85).
 *    - INFERRED: Contextual deduction from environmental markers.
 *    - OUTDATED: Stale historical beliefs suffering temporal confidence decay.
 * 3. Belief Dissonance & Contradiction Resolution:
 *    - Reconciles conflicting information between hearsay and direct sensory observation.
 *    - Personality modulation: High neuroticism resists disconfirming negative threat rumors.
 * 4. Epistemic Discrepancy Metrics:
 *    - Measures Paranoia (false-positive threats) vs. Complacency (false-negative blind spots).
 * 5. Host Game Authority Invariant:
 *    - Strictly advisory internal epistemic oracle; never alters host transforms, physics, or entity lifecycles.
 */

export const EPISTEMIC_PROVENANCE = Object.freeze({
    OBSERVED: 'OBSERVED',
    COMMUNICATED_DIRECT: 'COMMUNICATED_DIRECT',
    RUMOR: 'RUMOR',
    INFERRED: 'INFERRED',
    OUTDATED: 'OUTDATED'
});

export const BELIEF_CATEGORIES = Object.freeze({
    THREAT: 'THREAT',
    ROUTE_SAFETY: 'ROUTE_SAFETY',
    FACTION_STANCE: 'FACTION_STANCE',
    SANCTUARY: 'SANCTUARY'
});

export const DEFAULT_EPISTEMIC_CONFIG = Object.freeze({
    temporalDecayRate: 0.005,       // Confidence loss per tick for unrefreshed beliefs
    rumorHopDecayFactor: 0.85,      // Multiplier per rumor transmission hop
    minBeliefConfidence: 0.05,      // Below this, beliefs are pruned / forgotten
    directObservationWeight: 0.90,  // Weight for direct observation when resolving contradiction
    staleHorizonTicks: 40           // Ticks before unrefreshed observation becomes OUTDATED
});

export class EpistemicBeliefEngine {
    /**
     * @param {string} agentId
     * @param {object} [traits={}] Big-Five and behavioral personality traits
     * @param {object} [config={}] Configuration overrides
     */
    constructor(agentId, traits = {}, config = {}) {
        this.agentId = String(agentId || 'agent_0');
        this.traits = Object.freeze({
            neuroticism: traits?.neuroticism ?? 0.5,
            openness: traits?.openness ?? 0.5,
            agreeableness: traits?.agreeableness ?? 0.5,
            conscientiousness: traits?.conscientiousness ?? 0.5,
            bravery: traits?.bravery ?? 0.5
        });
        this.config = Object.freeze({ ...DEFAULT_EPISTEMIC_CONFIG, ...config });

        // Subjective belief stores:
        // Key -> { id, category, data, confidence, provenance, lastUpdatedTick, sourceId, hops }
        this.threatBeliefs = new Map();
        this.routeBeliefs = new Map();
        this.factionBeliefs = new Map();
        this.sanctuaryBeliefs = new Map();

        this.currentTick = 0;
        this.contradictionLog = [];
    }

    /**
     * Advance simulation tick: apply temporal confidence decay to unrefreshed beliefs.
     * @param {number} [ticks=1]
     */
    tick(ticks = 1) {
        this.currentTick += ticks;

        const decayBeliefMap = (map) => {
            for (const [key, belief] of map.entries()) {
                const age = this.currentTick - belief.lastUpdatedTick;
                if (age > this.config.staleHorizonTicks && belief.provenance !== EPISTEMIC_PROVENANCE.OUTDATED) {
                    belief.provenance = EPISTEMIC_PROVENANCE.OUTDATED;
                }

                // Confidence decays over time
                belief.confidence = Math.max(0.0, belief.confidence - this.config.temporalDecayRate * ticks);
                if (belief.confidence < this.config.minBeliefConfidence) {
                    map.delete(key);
                }
            }
        };

        decayBeliefMap(this.threatBeliefs);
        decayBeliefMap(this.routeBeliefs);
        decayBeliefMap(this.factionBeliefs);
        decayBeliefMap(this.sanctuaryBeliefs);
    }

    /**
     * Ingest direct sensory observations from the host game.
     * High confidence (0.90..1.0) and primary source of truth for the agent.
     * @param {object} observations Per-tick sensory snapshot
     */
    observeDirect(observations = {}) {
        const threats = observations.threats || [];
        const observedIds = new Set();

        for (const t of threats) {
            const threatId = String(t.id || 'threat_unknown');
            observedIds.add(threatId);

            const existing = this.threatBeliefs.get(threatId);
            if (existing && existing.provenance === EPISTEMIC_PROVENANCE.RUMOR) {
                // Verified rumor by direct observation
                this.contradictionLog.push({
                    tick: this.currentTick,
                    type: 'RUMOR_VERIFIED_BY_OBSERVATION',
                    threatId,
                    detail: `Rumored threat ${threatId} confirmed by direct sensory observation.`
                });
            }

            this.threatBeliefs.set(threatId, {
                id: threatId,
                category: BELIEF_CATEGORIES.THREAT,
                data: {
                    x: t.x ?? 0,
                    y: t.y ?? 0,
                    z: t.z ?? 0,
                    distance: t.distance ?? 10.0,
                    intensity: Math.max(0.0, Math.min(1.0, t.intensity ?? 0.5)),
                    type: t.type || 'PREDATOR'
                },
                confidence: 0.98,
                provenance: EPISTEMIC_PROVENANCE.OBSERVED,
                lastUpdatedTick: this.currentTick,
                sourceId: 'SELF',
                hops: 0
            });
        }

        // Check if previously believed proximate threats are now disconfirmed (empty room)
        if (observations.clearZoneRadius && observations.clearZoneRadius > 0) {
            const agentX = observations.agentX ?? 0;
            const agentY = observations.agentY ?? 0;

            for (const [threatId, belief] of this.threatBeliefs.entries()) {
                if (!observedIds.has(threatId)) {
                    const dist = Math.hypot((belief.data.x ?? 0) - agentX, (belief.data.y ?? 0) - agentY);
                    if (dist <= observations.clearZoneRadius) {
                        // Threat was believed here, but area is visually clear!
                        const disconfirmRate = this.config.directObservationWeight * (1.2 - this.traits.neuroticism * 0.5);
                        belief.confidence = Math.max(0.0, belief.confidence * (1.0 - disconfirmRate));

                        this.contradictionLog.push({
                            tick: this.currentTick,
                            type: 'BELIEF_DISCONFIRMED_BY_CLEAR_SIGHT',
                            threatId,
                            detail: `Area around (${belief.data.x}, ${belief.data.y}) inspected; believed threat ${threatId} not found.`
                        });

                        if (belief.confidence < this.config.minBeliefConfidence) {
                            this.threatBeliefs.delete(threatId);
                        }
                    }
                }
            }
        }
    }

    /**
     * Ingest information received from another agent or social rumor network.
     * @param {object} message
     * @param {string} message.category Category from BELIEF_CATEGORIES
     * @param {string} message.id Subject ID
     * @param {object} message.data Payload
     * @param {string} message.senderId Identifier of communicating peer
     * @param {number} [message.initialConfidence=0.8] Base confidence of message
     * @param {number} [message.hops=1] Number of transmission hops
     * @param {number} [senderTrust=0.5] Directed trust toward sender in [0, 1]
     */
    receiveCommunication(message, senderTrust = 0.5) {
        if (!message || !message.category || !message.id) return;

        const effectiveTrust = Math.max(0.0, Math.min(1.0, senderTrust));
        const hops = Math.max(1, message.hops || 1);
        const hopAttenuation = Math.pow(this.config.rumorHopDecayFactor, hops - 1);
        const baseConf = message.initialConfidence ?? 0.8;

        // Effective confidence combines base confidence, sender trust, and hop attenuation
        let effectiveConfidence = baseConf * effectiveTrust * hopAttenuation;

        // Neurotic agents give higher credence to threatening rumors
        if (message.category === BELIEF_CATEGORIES.THREAT) {
            effectiveConfidence = Math.min(1.0, effectiveConfidence * (0.8 + this.traits.neuroticism * 0.4));
        }

        if (effectiveConfidence < this.config.minBeliefConfidence) {
            // Discard uncredible rumor
            return;
        }

        const provenance = hops === 1
            ? EPISTEMIC_PROVENANCE.COMMUNICATED_DIRECT
            : EPISTEMIC_PROVENANCE.RUMOR;

        const beliefRecord = {
            id: message.id,
            category: message.category,
            data: { ...message.data },
            confidence: Number(effectiveConfidence.toFixed(4)),
            provenance,
            lastUpdatedTick: this.currentTick,
            sourceId: message.senderId || 'UNKNOWN',
            hops
        };

        switch (message.category) {
            case BELIEF_CATEGORIES.THREAT:
                this._integrateThreatBelief(message.id, beliefRecord);
                break;
            case BELIEF_CATEGORIES.ROUTE_SAFETY:
                this.routeBeliefs.set(message.id, beliefRecord);
                break;
            case BELIEF_CATEGORIES.FACTION_STANCE:
                this.factionBeliefs.set(message.id, beliefRecord);
                break;
            case BELIEF_CATEGORIES.SANCTUARY:
                this.sanctuaryBeliefs.set(message.id, beliefRecord);
                break;
        }
    }

    /**
     * Internal integration of threat beliefs with conflict resolution.
     * @private
     */
    _integrateThreatBelief(threatId, newBelief) {
        const existing = this.threatBeliefs.get(threatId);
        if (!existing) {
            this.threatBeliefs.set(threatId, newBelief);
            return;
        }

        // Direct observation always supersedes hearsay unless observation is very old
        if (existing.provenance === EPISTEMIC_PROVENANCE.OBSERVED && existing.confidence > 0.40) {
            if (newBelief.provenance === EPISTEMIC_PROVENANCE.RUMOR) {
                // Reject weaker rumor in favor of direct observation
                return;
            }
        }

        // If new belief has higher confidence, adopt it
        if (newBelief.confidence > existing.confidence) {
            this.threatBeliefs.set(threatId, newBelief);
        } else {
            // Blend position and retain highest confidence
            existing.lastUpdatedTick = this.currentTick;
        }
    }

    /**
     * Synthesize subjective sensory observations to pass into AffectiveAgent.
     * The agent experiences fear according to its BELIEF, not host ground truth!
     * @returns {object} Subjective sensory observation snapshot
     */
    synthesizeSubjectiveObservations() {
        const subjectiveThreats = [];

        for (const belief of this.threatBeliefs.values()) {
            if (belief.confidence >= this.config.minBeliefConfidence) {
                subjectiveThreats.push({
                    id: belief.id,
                    x: belief.data.x,
                    y: belief.data.y,
                    z: belief.data.z,
                    distance: belief.data.distance,
                    // Perceived intensity modulated by epistemic confidence
                    intensity: Number((belief.data.intensity * belief.confidence).toFixed(4)),
                    type: belief.data.type,
                    epistemicConfidence: belief.confidence,
                    provenance: belief.provenance
                });
            }
        }

        return {
            threats: subjectiveThreats,
            sounds: [],
            peers: [],
            hasBeliefContradictions: this.contradictionLog.length > 0
        };
    }

    /**
     * Compare Agent Epistemic Belief against objective World Ground Truth.
     * Computes Paranoia (false alarms), Complacency (unseen threats), and positional error.
     * @param {object} worldGroundTruth
     * @param {Array<object>} worldGroundTruth.activeThreats Real threats in world
     * @param {Map<string, object>} [worldGroundTruth.routes] Real route statuses
     * @returns {object} EpistemicDiscrepancyReport
     */
    evaluateDiscrepancyAgainstTruth(worldGroundTruth = {}) {
        const realThreats = worldGroundTruth.activeThreats || [];
        const realThreatMap = new Map(realThreats.map(t => [String(t.id), t]));

        const falsePositives = []; // Believed by agent, but non-existent in world truth (Paranoia / Ghost)
        const truePositives = [];  // Accurately tracked threats
        let totalPositionalError = 0.0;
        let matchedCount = 0;

        for (const [id, belief] of this.threatBeliefs.entries()) {
            if (belief.confidence < this.config.minBeliefConfidence) continue;

            const real = realThreatMap.get(id);
            if (!real) {
                falsePositives.push({
                    id,
                    perceivedIntensity: belief.data.intensity,
                    confidence: belief.confidence,
                    provenance: belief.provenance
                });
            } else {
                truePositives.push(id);
                const dx = (belief.data.x ?? 0) - (real.x ?? 0);
                const dy = (belief.data.y ?? 0) - (real.y ?? 0);
                totalPositionalError += Math.hypot(dx, dy);
                matchedCount++;
            }
        }

        const falseNegatives = []; // Active in world truth, but completely unknown to agent (Complacency)
        for (const real of realThreats) {
            const realId = String(real.id);
            if (!this.threatBeliefs.has(realId) || this.threatBeliefs.get(realId).confidence < this.config.minBeliefConfidence) {
                falseNegatives.push({
                    id: realId,
                    realIntensity: real.intensity,
                    distance: real.distance
                });
            }
        }

        const paranoiaScore = falsePositives.reduce((acc, p) => acc + p.confidence * p.perceivedIntensity, 0);
        const complacencyScore = falseNegatives.reduce((acc, n) => acc + (n.realIntensity ?? 0.5), 0);
        const meanPositionalError = matchedCount > 0 ? Number((totalPositionalError / matchedCount).toFixed(4)) : 0.0;

        return {
            agentId: this.agentId,
            tick: this.currentTick,
            totalBelievedThreats: this.threatBeliefs.size,
            realThreatCount: realThreats.length,
            truePositivesCount: truePositives.length,
            falsePositives, // Ghost threats (Paranoia)
            falseNegatives, // Blind spots (Complacency)
            paranoiaScore: Number(paranoiaScore.toFixed(4)),
            complacencyScore: Number(complacencyScore.toFixed(4)),
            meanPositionalError,
            isOmniscient: falsePositives.length === 0 && falseNegatives.length === 0 && meanPositionalError === 0.0
        };
    }
}
