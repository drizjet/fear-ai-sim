/**
 * ContagionGraph - Social emotional contagion and panic cascade engine.
 * Models viral fear transmission, screams, and leader reassurance damping.
 */

export class ContagionGraph {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = {
            contagionRadius: config.contagionRadius || 300,
            baseContagionStrength: config.baseContagionStrength || 0.4,
            screamMultiplier: config.screamMultiplier || 1.8,
            leaderDampingStrength: config.leaderDampingStrength || 0.35,
            leaderRadius: config.leaderRadius || 250,
            // NEXT-139 (audit candidate 15): crystallized-trauma peers
            // transmit harder. 0 (default) is legacy transmission.
            traumaAmplifier: config.traumaAmplifier || 0,
            // NEXT-155 (audit candidate 20): focal-agent trust in the peer
            // scales transmission. 0 (default) is legacy transmission.
            trustGain: config.trustGain || 0,
            // NEXT-166 (post-25 candidate 6): focal-agent trust in a calm
            // leader scales reassurance. 0 (default) is legacy damping.
            calmTrustGain: config.calmTrustGain || 0,
        };

        // Active panic/calm contagion transmission events
        this.activeEdges = [];
        this.maxEdges = config.maxEdges || 200;
    }

    /**
     * Calculate contagion impact on a focal agent from surrounding peer agents
     * @param {object} focalAgent - { id, x, y, z, traits: { extraversion, neuroticism } }
     * @param {Array<object>} peers - Array<{ id, x, y, z, fearBand, isPanicking, isScreaming, rawFear, leadership }>
     * @returns {{ contagionFear: number, leaderCalm: number, dominantSourceId: string|null }}
     */
    evaluateContagion(focalAgent, peers) {
        if (!peers || peers.length === 0) {
            return { contagionFear: 0, leaderCalm: 0, dominantSourceId: null };
        }

        let totalContagion = 0;
        let totalLeaderDamping = 0;
        let highestImpact = 0;
        let dominantSourceId = null;

        const focalX = Number(focalAgent.x) || 0;
        const focalY = Number(focalAgent.y) || 0;
        const focalZ = Number(focalAgent.z) || 0;

        const extraversion = focalAgent.traits?.extraversion ?? 0.5;
        const neuroticism = focalAgent.traits?.neuroticism ?? 0.5;

        // Susceptibility scales: high extraversion increases affective mirroring; neuroticism magnifies alarm
        const susceptibility = (0.5 + extraversion * 0.5) * (0.6 + neuroticism * 0.8);

        for (let i = 0; i < peers.length; i++) {
            const peer = peers[i];
            if (peer.id === focalAgent.id) continue;

            const px = Number(peer.x) || 0;
            const py = Number(peer.y) || 0;
            const pz = Number(peer.z) || 0;

            const dx = px - focalX;
            const dy = py - focalY;
            const dz = pz - focalZ;
            const distSq = dx * dx + dy * dy + dz * dz;

            // 1. Check Fear Contagion (from panicking / screaming / terrified peers)
            if (distSq < this.config.contagionRadius * this.config.contagionRadius) {
                const dist = Math.sqrt(distSq) || 0.001;
                const distanceFalloff = 1.0 - (dist / this.config.contagionRadius);

                let sourceFear = 0;
                if (peer.isPanicking || peer.fearBand === 'PANIC') {
                    sourceFear = 0.9;
                } else if (peer.fearBand === 'ANXIOUS') {
                    sourceFear = 0.4;
                } else if (typeof peer.rawFear === 'number') {
                    sourceFear = Math.min(1.0, peer.rawFear);
                }

                if (sourceFear > 0.2) {
                    const rawLoad = Number(peer.traumaLoad ?? 0);
                    const load = Number.isFinite(rawLoad) ? Math.max(0, Math.min(1, rawLoad)) : 0;
                    sourceFear = sourceFear * (1 + this.config.traumaAmplifier * load);
                    // NEXT-155: focal trust in this peer (RelationshipTensor
                    // trust in [-1, 1]; absent/non-finite reads as neutral 0).
                    // Trusted panickers transmit harder, distrusted ones weaker.
                    const rawTrust = Number(peer.trust ?? 0);
                    const trust = Number.isFinite(rawTrust) ? Math.max(-1, Math.min(1, rawTrust)) : 0;
                    sourceFear = sourceFear * (1 + this.config.trustGain * trust * 0.5);
                    let screamBonus = peer.isScreaming ? this.config.screamMultiplier : 1.0;
                    const impact = sourceFear * distanceFalloff * this.config.baseContagionStrength * screamBonus * susceptibility;
                    totalContagion += impact;

                    if (impact > highestImpact) {
                        highestImpact = impact;
                        dominantSourceId = peer.id;
                    }

                    // Record edge for telemetry
                    if (impact > 0.15 && this.activeEdges.length < this.maxEdges) {
                        this.activeEdges.push({
                            from: peer.id,
                            to: focalAgent.id,
                            strength: impact,
                            isScream: Boolean(peer.isScreaming)
                        });
                    }
                }
            }

            // 2. Check Calm Leader Reassurance (high leadership calm/alert peers suppress neighbor panic)
            const leadership = peer.leadership ?? peer.traits?.leadership ?? 0;
            const isCalmOrAlert = peer.fearBand === 'CALM' || peer.fearBand === 'ALERT' || (!peer.isPanicking && (peer.rawFear ?? 0) < 0.35);

            if (leadership > 0.05 && isCalmOrAlert && distSq < this.config.leaderRadius * this.config.leaderRadius) {
                const dist = Math.sqrt(distSq) || 0.001;
                const distanceFalloff = 1.0 - (dist / this.config.leaderRadius);
                // NEXT-166: focal trust in the calming leader scales
                // reassurance (absent/non-finite reads as neutral 0).
                const rawCalmTrust = Number(peer.trust ?? 0);
                const calmTrust = Number.isFinite(rawCalmTrust) ? Math.max(-1, Math.min(1, rawCalmTrust)) : 0;
                const calmImpact = leadership * distanceFalloff * this.config.leaderDampingStrength * (1 + this.config.calmTrustGain * calmTrust * 0.5);
                totalLeaderDamping += calmImpact;
            }
        }

        return {
            contagionFear: Math.min(1.0, totalContagion),
            leaderCalm: Math.min(0.8, totalLeaderDamping),
            dominantSourceId
        };
    }

    /**
     * Clear ephemeral frame edges
     */
    clearEdges() {
        this.activeEdges = [];
    }

    getActiveEdges() {
        return [...this.activeEdges];
    }

    getState() {
        return {
            config: { ...this.config },
            maxEdges: this.maxEdges,
            activeEdges: Array.isArray(this.activeEdges) ? JSON.parse(JSON.stringify(this.activeEdges)) : []
        };
    }

    setState(state) {
        if (!state || typeof state !== 'object') return;
        if (state.config && typeof state.config === 'object') {
            this.config = { ...this.config, ...state.config };
        }
        if (Number.isFinite(state.maxEdges) && state.maxEdges >= 1) {
            this.maxEdges = Math.floor(state.maxEdges);
        }
        if (Array.isArray(state.activeEdges)) {
            this.activeEdges = JSON.parse(JSON.stringify(state.activeEdges));
        }
    }
}

export default ContagionGraph;
