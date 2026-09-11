/**
 * IntentResolver - Resolves internal affective state into actionable semantic behavioral intents.
 * Strictly respects host game authority: provides recommendations, urgency, and directional hints
 * for the host game's navigation/animation system to execute.
 */

export const ACTION_INTENTS = Object.freeze([
    'IDLE_VIGILANT',
    'CAUTIOUS_EXPLORE',
    'INVESTIGATE_SOUND',
    'FLEE_FROM',
    'SEEK_COVER',
    'FREEZE',
    'CONFRONT_THREAT',
    'APPROACH_ALLY',
    'WARN_GROUP',
    'DESPERATE_FLAIL',
    'COLLAPSE_EXHAUSTED',
    'RECOVERING'
]);

// NEXT-47: above-threshold agreeableness urgency slope, extracted so the
// utility benchmark measures the shipped formula instead of a copy.
// Gate: WARN_GROUP fires only for agreeableness > WARN_AGREEABLENESS_GATE.
export const WARN_AGREEABLENESS_GATE = 0.65;
export function warnGroupUrgency(agreeableness) {
    const a = Number.isFinite(agreeableness) ? agreeableness : 0.5;
    return Math.min(1.0, 0.65 + a * 0.15);
}
// NEXT-61: ungated ally-approach slope (width 0.20 over the full A range),
// extracted for the same shipped-formula measurement.
export function approachAllyUrgency(agreeableness) {
    const a = Number.isFinite(agreeableness) ? agreeableness : 0.5;
    return Math.min(1.0, 0.45 + a * 0.2);
}
// NEXT-150 (audit candidate 14): trusted-peer selection. Host passes
// observations.peerTrust as { peerId: trustInAgent } (e.g. from the
// relationship tensor); WARN_GROUP and APPROACH_ALLY target the most
// trusted visible peer instead of peers[0]. Absent map: peers[0] exactly.
export function pickTrustedPeer(peers = [], peerTrust = null) {
    if (!Array.isArray(peers) || peers.length === 0) return null;
    if (!peerTrust || typeof peerTrust !== 'object') return peers[0];
    let best = peers[0];
    let bestTrust = -Infinity;
    for (const p of peers) {
        const t = Number(peerTrust?.[p?.id]);
        const trust = Number.isFinite(t) ? t : 0;
        if (trust > bestTrust) {
            bestTrust = trust;
            best = p;
        }
    }
    return best;
}

export class IntentResolver {
    /**
     * Resolve semantic intent from affective state and sensory observations
     * @param {object} agent - AffectiveAgent
     * @param {object} observations - Per-tick sensory observations
     * @returns {object} ActionIntent
     */
    static resolveIntent(agent, observations = {}) {
        if (!agent || typeof agent !== 'object') {
            return {
                type: 'CAUTIOUS_EXPLORE',
                target_id: null,
                urgency: 0.10,
                vector_hint: { x: 0, y: 0, z: 0 },
                suggested_posture: 'UPRIGHT'
            };
        }
        const band = agent.fearCore?.state || 'CALM';
        const fear = Number.isFinite(agent.currentFear) ? agent.currentFear : 0;
        const dominance = Number.isFinite(agent.currentDominance) ? agent.currentDominance : 0.5;
        const anger = Number.isFinite(agent.currentAnger) ? agent.currentAnger : 0;
        const energy = Number.isFinite(agent.energy) ? agent.energy : 1.0;
        const threats = observations.threats || [];
        const sounds = observations.sounds || [];
        const peers = observations.peers || [];
        const nearestCover = observations.nearestCover || null;

        // 1. Extreme Physical Exhaustion Check
        if (energy <= 0.05 && band !== 'PANIC') {
            return {
                type: 'COLLAPSE_EXHAUSTED',
                target_id: null,
                urgency: 0.95,
                vector_hint: { x: 0, y: 0, z: 0 },
                suggested_posture: 'PRONE'
            };
        }

        // 2. Tonic Immobility / Freezing
        if (band === 'FREEZE' || band === 'PRESENCE_BREAK') {
            return {
                type: 'FREEZE',
                target_id: threats[0]?.id || null,
                urgency: 1.0,
                vector_hint: { x: 0, y: 0, z: 0 },
                suggested_posture: band === 'PRESENCE_BREAK' ? 'COLLAPSED' : 'TREMBLING'
            };
        }

        // 3. Crawling / Hiding
        if (band === 'HIDE' || band === 'CRAWLING') {
            let vector = { x: 0, y: 0, z: 0 };
            let targetId = null;

            if (nearestCover) {
                targetId = nearestCover.id || 'cover';
                vector = IntentResolver._normalizeVector({
                    x: (nearestCover.x ?? 0) - (agent.x ?? 0),
                    y: (nearestCover.y ?? 0) - (agent.y ?? 0),
                    z: (nearestCover.z ?? 0) - (agent.z ?? 0)
                });
            } else if (threats.length > 0) {
                targetId = threats[0].id;
                // Move away from threat cautiously
                const t = threats[0];
                vector = IntentResolver._normalizeVector({
                    x: -((t.x ?? 0) - (agent.x ?? 0)),
                    y: -((t.y ?? 0) - (agent.y ?? 0)),
                    z: -((t.z ?? 0) - (agent.z ?? 0))
                });
            }

            return {
                type: 'SEEK_COVER',
                target_id: targetId,
                urgency: Math.min(1.0, 0.4 + fear * 0.5),
                vector_hint: vector,
                suggested_posture: band === 'CRAWLING' ? 'PRONE' : 'CROUCHING'
            };
        }

        // 4. Aggressive Confrontation (high anger or very high dominance)
        if (band === 'AGGRESSIVE' || (anger > 0.75 && dominance > 0.65)) {
            let vector = { x: 0, y: 0, z: 0 };
            let targetId = null;

            if (threats.length > 0) {
                targetId = threats[0].id;
                const t = threats[0];
                // Advance toward threat or rival
                vector = IntentResolver._normalizeVector({
                    x: (t.x ?? 0) - (agent.x ?? 0),
                    y: (t.y ?? 0) - (agent.y ?? 0),
                    z: (t.z ?? 0) - (agent.z ?? 0)
                });
            }

            return {
                type: 'CONFRONT_THREAT',
                target_id: targetId,
                urgency: Math.min(1.0, 0.6 + anger * 0.4),
                vector_hint: vector,
                suggested_posture: 'DEFENSIVE_STANCE'
            };
        }

        // 5. Acute Panic / Flight
        if (band === 'PANIC') {
            let vector = { x: 0, y: 0, z: 0 };
            let targetId = null;

            if (threats.length > 0) {
                targetId = threats[0].id;
                const t = threats[0];
                // Flee in opposite direction of primary threat
                vector = IntentResolver._normalizeVector({
                    x: -((t.x ?? 0) - (agent.x ?? 0)),
                    y: -((t.y ?? 0) - (agent.y ?? 0)),
                    z: -((t.z ?? 0) - (agent.z ?? 0))
                });
            } else {
                // Blind panicked forward sprint in current velocity direction or random
                vector = agent.lastVelocity
                    ? IntentResolver._normalizeVector(agent.lastVelocity)
                    : { x: 1, y: 0, z: 0 };
            }

            // Check if trapped: if threat is extremely close (< 2 units) and health is critical, flail
            const conscientiousness = agent.traits?.conscientiousness ?? 0.5;
            if (threats[0]?.distance !== undefined && threats[0].distance < 1.5) {
                // Highly conscientious agents maintain tactical discipline instead of blind desperate flailing
                if (conscientiousness > 0.65) {
                    return {
                        type: 'CONFRONT_THREAT',
                        target_id: threats[0].id,
                        urgency: 0.95,
                        vector_hint: vector,
                        suggested_posture: 'DEFENSIVE_STANCE'
                    };
                }
                return {
                    type: 'DESPERATE_FLAIL',
                    target_id: threats[0].id,
                    urgency: 1.0,
                    vector_hint: vector,
                    suggested_posture: conscientiousness < 0.35 ? 'PRONE' : 'STUMBLING'
                };
            }

            const flightPosture = conscientiousness < 0.3 ? 'STUMBLING' : 'SPRINTING';

            return {
                type: 'FLEE_FROM',
                target_id: targetId,
                urgency: Math.min(1.0, 0.75 + fear * 0.25),
                vector_hint: vector,
                suggested_posture: flightPosture
            };
        }

        // 6. High Anxiety - Cautious Backing or Ally Clustering / Group Warning
        if (band === 'ANXIOUS') {
            const agreeableness = agent.traits?.agreeableness ?? 0.5;

            // Highly agreeable agents prioritize warning nearby peers under threat
            if (peers.length > 0 && threats.length > 0 && agreeableness > WARN_AGREEABLENESS_GATE) {
                const warned = pickTrustedPeer(peers, observations.peerTrust);
                return {
                    type: 'WARN_GROUP',
                    target_id: warned.id,
                    urgency: warnGroupUrgency(agreeableness),
                    vector_hint: { x: 0, y: 0, z: 0 },
                    suggested_posture: 'DEFENSIVE_STANCE'
                };
            }

            // If threat is visible, back away cautiously
            if (threats.length > 0) {
                const t = threats[0];
                const awayVector = IntentResolver._normalizeVector({
                    x: -((t.x ?? 0) - (agent.x ?? 0)),
                    y: -((t.y ?? 0) - (agent.y ?? 0)),
                    z: -((t.z ?? 0) - (agent.z ?? 0))
                });

                return {
                    type: 'FLEE_FROM',
                    target_id: t.id,
                    urgency: 0.65,
                    vector_hint: awayVector,
                    suggested_posture: 'CROUCHING'
                };
            }
            // If allies are nearby, seek safety in numbers
            if (peers.length > 0) {
                const ally = pickTrustedPeer(peers, observations.peerTrust);
                const towardsAlly = IntentResolver._normalizeVector({
                    x: (ally.x ?? 0) - (agent.x ?? 0),
                    y: (ally.y ?? 0) - (agent.y ?? 0),
                    z: (ally.z ?? 0) - (agent.z ?? 0)
                });

                return {
                    type: 'APPROACH_ALLY',
                    target_id: ally.id,
                    urgency: approachAllyUrgency(agreeableness),
                    vector_hint: towardsAlly,
                    suggested_posture: 'UPRIGHT'
                };
            }

            return {
                type: 'CAUTIOUS_EXPLORE',
                target_id: null,
                urgency: 0.45,
                vector_hint: { x: 0, y: 0, z: 0 },
                suggested_posture: 'CROUCHING'
            };
        }

        // 7. Alert - Sound Investigation or Vigilance
        if (band === 'ALERT') {
            const openness = agent.traits?.openness ?? (agent.traits?.curiosity ?? 0.5);
            // Openness modulates auditory curiosity vs defensive vigilance
            // At neutral 0.5: threshold is 0.4 * 1.0 = 0.4 (identical to baseline)
            const investigateThreshold = 0.4 * (1.5 - openness);
            if (sounds.length > 0 && openness > investigateThreshold) {
                const s = sounds[0];
                const towardsSound = IntentResolver._normalizeVector({
                    x: (s.x ?? 0) - (agent.x ?? 0),
                    y: (s.y ?? 0) - (agent.y ?? 0),
                    z: (s.z ?? 0) - (agent.z ?? 0)
                });

                return {
                    type: 'INVESTIGATE_SOUND',
                    target_id: s.id || 'sound',
                    urgency: Math.min(1.0, 0.25 + openness * 0.3),
                    vector_hint: towardsSound,
                    suggested_posture: 'UPRIGHT'
                };
            }

            return {
                type: 'IDLE_VIGILANT',
                target_id: null,
                urgency: 0.30,
                vector_hint: { x: 0, y: 0, z: 0 },
                suggested_posture: 'UPRIGHT'
            };
        }

        // 8. Recovery
        if (band === 'RECOVER') {
            return {
                type: 'RECOVERING',
                target_id: null,
                urgency: 0.20,
                vector_hint: { x: 0, y: 0, z: 0 },
                suggested_posture: 'UPRIGHT'
            };
        }

        // 9. Default Calm - Idle / Explore / Sound Curiosity
        if (sounds.length > 0) {
            const openness = agent.traits?.openness ?? (agent.traits?.curiosity ?? 0.5);
            const investigateThreshold = 0.45 * (1.5 - openness);
            if (openness > investigateThreshold) {
                const s = sounds[0];
                const towardsSound = IntentResolver._normalizeVector({
                    x: (s.x ?? 0) - (agent.x ?? 0),
                    y: (s.y ?? 0) - (agent.y ?? 0),
                    z: (s.z ?? 0) - (agent.z ?? 0)
                });

                return {
                    type: 'INVESTIGATE_SOUND',
                    target_id: s.id || 'sound',
                    urgency: Math.min(1.0, 0.20 + openness * 0.25),
                    vector_hint: towardsSound,
                    suggested_posture: 'UPRIGHT'
                };
            }
        }

        return {
            type: 'CAUTIOUS_EXPLORE',
            target_id: null,
            urgency: 0.10,
            vector_hint: { x: 0, y: 0, z: 0 },
            suggested_posture: 'UPRIGHT'
        };
    }

    static _normalizeVector(v) {
        const x = Number(v.x) || 0;
        const y = Number(v.y) || 0;
        const z = Number(v.z) || 0;
        const mag = Math.hypot(x, y, z);
        if (mag < 0.0001) {
            return { x: 0, y: 0, z: 0 };
        }
        return {
            x: parseFloat((x / mag).toFixed(4)),
            y: parseFloat((y / mag).toFixed(4)),
            z: parseFloat((z / mag).toFixed(4))
        };
    }
}

export default IntentResolver;
