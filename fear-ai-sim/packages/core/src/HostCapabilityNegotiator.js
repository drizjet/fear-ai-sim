/**
 * packages/core/src/HostCapabilityNegotiator.js
 *
 * Section 73 / Front D: Host Capability Negotiation & Graceful Advisory Intent Downgrade.
 *
 * Different game engines and game architectures support different action primitives.
 * For example:
 * - A simple 2D game may not have dynamic cover points (lacks `supports_cover_points`).
 * - A single-unit action game may lack squad formation slots (lacks `supports_group_formation`).
 * - A silent horror game may not support NPC speech or vocal barking (lacks `supports_dialogue`).
 *
 * HostCapabilityNegotiator allows host adapters to advertise supported capabilities,
 * and ensures Fear AI never requests unsupported semantics blindly, gracefully
 * downgrading intents to universally supported fallback primitives.
 *
 * Strictly adheres to the Host Game Authority Invariant:
 * Evaluates semantic intents and provides sanitized advice without directly
 * executing movement or mutating host state.
 */

export const HOST_CAPABILITIES = Object.freeze({
    SUPPORTS_COVER_POINTS: 'supports_cover_points',
    SUPPORTS_GROUP_FORMATION: 'supports_group_formation',
    SUPPORTS_DIALOGUE: 'supports_dialogue',
    SUPPORTS_NAVIGATION_QUERY: 'supports_navigation_query',
    SUPPORTS_AUDIO_DIRECTIVES: 'supports_audio_directives',
    SUPPORTS_DYNAMIC_REROUTING: 'supports_dynamic_rerouting',
    SUPPORTS_TACTICAL_RETREAT: 'supports_tactical_retreat',
    SUPPORTS_SURRENDER: 'supports_surrender'
});

export const INTENT_CAPABILITY_REQUIREMENTS = Object.freeze({
    TAKE_COVER: HOST_CAPABILITIES.SUPPORTS_COVER_POINTS,
    FORM_PHALANX: HOST_CAPABILITIES.SUPPORTS_GROUP_FORMATION,
    DEFENSIVE_SCREEN: HOST_CAPABILITIES.SUPPORTS_GROUP_FORMATION,
    BROADCAST_WARNING: HOST_CAPABILITIES.SUPPORTS_DIALOGUE,
    REQUEST_CEASEFIRE: HOST_CAPABILITIES.SUPPORTS_DIALOGUE,
    REROUTE_TRADE: HOST_CAPABILITIES.SUPPORTS_DYNAMIC_REROUTING,
    TACTICAL_RETREAT: HOST_CAPABILITIES.SUPPORTS_TACTICAL_RETREAT,
    SURRENDER: HOST_CAPABILITIES.SUPPORTS_SURRENDER,
    // R36: runtime ACTION_INTENTS (IntentResolver vocabulary) gated the
    // same way. Unmapped runtime intents need no structural capability
    // and always pass (e.g. APPROACH_ALLY needs no formation slots,
    // INVESTIGATE_SOUND needs no dialogue channel).
    SEEK_COVER: HOST_CAPABILITIES.SUPPORTS_COVER_POINTS,
    WARN_GROUP: HOST_CAPABILITIES.SUPPORTS_DIALOGUE
});

export const DEFAULT_FALLBACK_CHAIN = Object.freeze({
    TAKE_COVER: 'HIDE',
    FORM_PHALANX: 'HOLD_LINE',
    DEFENSIVE_SCREEN: 'HOLD_LINE',
    BROADCAST_WARNING: 'FLEE_FROM',
    REQUEST_CEASEFIRE: 'AVOID',
    REROUTE_TRADE: 'AVOID_DANGER',
    TACTICAL_RETREAT: 'FLEE_FROM',
    SURRENDER: 'FLEE_FROM'
});

/**
 * R36: fallback chain in runtime ACTION_INTENTS vocabulary. The legacy
 * DEFAULT_FALLBACK_CHAIN speaks directive vocabulary (HIDE, HOLD_LINE);
 * server tick filtering must only ever emit intents the runtime itself
 * produces, so capped hosts get FLEE_FROM (universal movement primitive)
 * instead of cover/dialogue intents they cannot honor.
 */
export const RUNTIME_SAFE_FALLBACKS = Object.freeze({
    SEEK_COVER: 'FLEE_FROM',
    WARN_GROUP: 'FLEE_FROM'
});

export class HostCapabilityNegotiator {
    /**
     * @param {Object} [advertisedCapabilities={}] - Map of capability flags { [HOST_CAPABILITIES.*]: boolean }
     */
    constructor(advertisedCapabilities = {}) {
        this.capabilities = new Set();
        this.setCapabilities(advertisedCapabilities);
    }

    /**
     * Set or update host advertised capabilities.
     * @param {Object|Array<string>} capabilities
     */
    setCapabilities(capabilities) {
        this.capabilities.clear();
        if (Array.isArray(capabilities)) {
            for (const cap of capabilities) {
                if (typeof cap === 'string') {
                    this.capabilities.add(cap);
                }
            }
        } else if (capabilities && typeof capabilities === 'object') {
            for (const [key, enabled] of Object.entries(capabilities)) {
                if (enabled) {
                    this.capabilities.add(key);
                }
            }
        }
    }

    /**
     * Check whether a specific capability is advertised by the host.
     * @param {string} capability
     * @returns {boolean}
     */
    hasCapability(capability) {
        return this.capabilities.has(capability);
    }

    /**
     * Returns an array of all active advertised capabilities.
     * @returns {Array<string>}
     */
    getActiveCapabilities() {
        return Array.from(this.capabilities);
    }

    /**
     * Filters and downgrades an intent if the host does not support its required capability.
     * @param {string} intent - Proposed semantic intent (e.g. 'TAKE_COVER')
     * @param {Object} [customFallbacks={}] - Optional custom fallback override map
     * @returns {{
     *   intent: string,
     *   downgraded: boolean,
     *   originalIntent: string,
     *   requiredCapability: string|null,
     *   reason: string|null
     * }}
     */
    filterIntent(intent, customFallbacks = {}) {
        if (!intent || typeof intent !== 'string') {
            return {
                intent: 'NONE',
                downgraded: false,
                originalIntent: intent,
                requiredCapability: null,
                reason: 'Invalid or null intent provided'
            };
        }

        const requiredCap = INTENT_CAPABILITY_REQUIREMENTS[intent];
        if (!requiredCap || this.hasCapability(requiredCap)) {
            return {
                intent,
                downgraded: false,
                originalIntent: intent,
                requiredCapability: requiredCap || null,
                reason: null
            };
        }

        // Capability required but not supported: find fallback
        const fallback = customFallbacks[intent] || DEFAULT_FALLBACK_CHAIN[intent] || 'FLEE_FROM';

        // Recursively check if the fallback itself requires a capability
        const subCheck = this.filterIntent(fallback, customFallbacks);

        return {
            intent: subCheck.intent,
            downgraded: true,
            originalIntent: intent,
            requiredCapability: requiredCap,
            reason: `Host does not advertise '${requiredCap}'; gracefully downgraded to '${subCheck.intent}'`
        };
    }

    /**
     * Filters a ranked list of candidate intents, downgrading any unsupported intents
     * while deduplicating and maintaining score ordering.
     * @param {Array<{ intent: string, score: number }>} rankedIntents
     * @param {Object} [customFallbacks={}]
     * @returns {Array<{ intent: string, score: number, downgraded?: boolean, originalIntent?: string }>}
     */
    filterIntentRanking(rankedIntents, customFallbacks = {}) {
        if (!Array.isArray(rankedIntents)) return [];

        const seen = new Set();
        const results = [];

        for (const item of rankedIntents) {
            if (!item || !item.intent) continue;

            const resolution = this.filterIntent(item.intent, customFallbacks);
            if (!seen.has(resolution.intent)) {
                seen.add(resolution.intent);
                results.push({
                    intent: resolution.intent,
                    score: item.score,
                    downgraded: resolution.downgraded,
                    originalIntent: resolution.originalIntent
                });
            }
        }

        return results.sort((a, b) => b.score - a.score);
    }
}
