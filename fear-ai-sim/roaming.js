// Constitution §38-§48 (Nomadic / Roaming Factions) / §530
// (FIRST TRUE ROAMING FACTION) / §41-§42 (Destination Utility
// and Candidates) / §13 (Decision Stochasticity) / §121
// (Determinism).
//
// The §38 contract: "Do not implement wandering as: pick
// random direction every N ticks." A roaming faction should
// ask: what do we need, what do we know, where can we get
// it, what will it cost.
//
// The §41 contract: U(d) = resourceValue + safety - distance -
// danger. A weighted sum over normalized considerations.
//
// The §13 contract: "Use seeded stochastic choice over
// plausible actions."
//
// PHASE 3 + PHASE 4 (audit directive): ROAMING_MODE must
// affect behavior. Normalized considerations only — raw values
// like "distance = 100" must not dominate other factors
// silently. The audit's Game AI Pro / Utility AI reference:
// "the vast majority of the response curves used in the game
// are chosen from a small palette of preset curves."

/**
 * Roaming modes. The §39 contract: a roaming group can be in
 * one of these modes, and the mode influences which
 * destinations are useful.
 */
export const ROAMING_MODE = Object.freeze({
    SEASONAL_MIGRATION: 'SEASONAL_MIGRATION',
    FORAGE: 'FORAGE',
    HUNT: 'HUNT',
    TRADE: 'TRADE',
    SCOUT: 'SCOUT',
    PATROL: 'PATROL',
    RAID: 'RAID',
    RETREAT: 'RETREAT',
    PURSUE: 'PURSUE',
    ESCORT: 'ESCORT',
    RESETTLE: 'RESETTLE',
    REST: 'REST',
    WINTER_CAMP: 'WINTER_CAMP',
});

/**
 * Mode profiles. Each profile defines how a roaming group in
 * that mode values normalized considerations. The §41
 * weighted-sum equation uses these weights. The weights are
 * HEURISTIC provenance class per §145 — educated defaults,
 * not calibrated against real data.
 *
 * Each consideration is a weight in [0,1]. The final
 * destination utility is a weighted sum normalized to roughly
 * [-1, 1] so the softmax temperature has predictable behavior
 * across modes.
 *
 * Considerations:
 *   resource      — perceived resource value of the
 *                   destination (food, water, raw materials)
 *   distance      — travel cost (normalized 0..1)
 *   danger        — perceived danger of the route
 *   loot          — opportunity for raid-style gain
 *   routeSecurity — TRADE-specific: how safe the trade route is
 *   retaliation   — RAID-specific: expected retaliation cost
 *   information   — SCOUT-specific: information gain (high when
 *                   informationConfidence is LOW — the unknown
 *                   is interesting)
 *   rest          — REST-specific: bonus to staying put
 */
export const MODE_PROFILES = Object.freeze({
    [ROAMING_MODE.SEASONAL_MIGRATION]: Object.freeze({
        resource: 0.6, distance: 0.4, danger: 0.3, rest: 0.0
    }),
    [ROAMING_MODE.FORAGE]: Object.freeze({
        resource: 0.8, distance: 0.4, danger: 0.3, rest: 0.0
    }),
    [ROAMING_MODE.HUNT]: Object.freeze({
        resource: 0.7, distance: 0.3, danger: 0.2, rest: 0.0
    }),
    [ROAMING_MODE.TRADE]: Object.freeze({
        resource: 0.5, distance: 0.3, danger: 0.2, routeSecurity: 0.6, rest: 0.0
    }),
    [ROAMING_MODE.SCOUT]: Object.freeze({
        resource: 0.2, distance: 0.2, danger: 0.2, information: 0.7, rest: 0.0
    }),
    [ROAMING_MODE.PATROL]: Object.freeze({
        resource: 0.2, distance: 0.2, danger: 0.1, rest: 0.0
    }),
    [ROAMING_MODE.RAID]: Object.freeze({
        resource: 0.1, distance: 0.2, danger: 0.3, loot: 0.8, retaliation: 0.7, rest: 0.0
    }),
    [ROAMING_MODE.RETREAT]: Object.freeze({
        resource: 0.0, distance: 0.5, danger: 0.9, rest: 0.0
    }),
    [ROAMING_MODE.PURSUE]: Object.freeze({
        resource: 0.1, distance: 0.5, danger: 0.3, rest: 0.0
    }),
    [ROAMING_MODE.ESCORT]: Object.freeze({
        resource: 0.2, distance: 0.3, danger: 0.4, routeSecurity: 0.3, rest: 0.0
    }),
    [ROAMING_MODE.RESETTLE]: Object.freeze({
        resource: 0.5, distance: 0.4, danger: 0.3, rest: 0.0
    }),
    [ROAMING_MODE.REST]: Object.freeze({
        resource: 0.0, distance: 0.5, danger: 0.5, rest: 0.95
    }),
    [ROAMING_MODE.WINTER_CAMP]: Object.freeze({
        resource: 0.5, distance: 0.4, danger: 0.4, rest: 0.0
    }),
});

/**
 * Default distance range for normalization. A future slice can
 * make this dynamic (e.g. per-actor scout radius). The audit's
 * units contract: raw distance must be normalized to [0,1]
 * before combining with other considerations.
 */
const DEFAULT_DISTANCE_RANGE = 100;

/**
 * Normalize a value to [0, 1].
 */
function normalize(value, max = 1) {
    if (value == null || !Number.isFinite(value)) return 0;
    if (max <= 0) return 0;
    return Math.max(0, Math.min(1, value / max));
}

/**
 * Clamp a value to [0, 1].
 */
function clamp01(value) {
    if (value == null || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

/**
 * Create a roaming group record. The group has:
 *   - id: unique identifier
 *   - currentLocation: where the group is now
 *   - needs: a map of need-type -> pressure (0..1)
 *   - beliefs: a map of location-id -> normalized belief
 *   - mode: current roaming mode (default SEASONAL_MIGRATION)
 *   - explorationTemperature: 0..1, controls how often the
 *     group picks a worse destination. Higher = more
 *     exploration.
 *   - distanceRange: the max raw distance used for
 *     normalization. Defaults to 100.
 *   - rng: injected deterministic RNG
 */
export function createRoamingGroup({
    id,
    currentLocation = 'origin',
    needs = { food: 0.5 },
    beliefs = {},
    observations = [],
    mode = ROAMING_MODE.SEASONAL_MIGRATION,
    explorationTemperature = 0.2,
    distanceRange = DEFAULT_DISTANCE_RANGE,
    switchMargin = 0,
    rng = Math.random
} = {}) {
    return {
        id,
        currentLocation,
        needs,
        beliefs,
        observations,
        mode,
        explorationTemperature,
        distanceRange,
        switchMargin,
        rng,
        // PHASE 11: travel state. `AT_LOCATION` is the default;
        // `IN_TRANSIT` means the group is moving toward
        // `travelDestination` with `travelRemaining` ticks left.
        travelState: 'AT_LOCATION',
        travelDestination: null,
        travelRemaining: 0,
        // PHASE 19 fix: how many ticks the group has been at
        // `currentLocation`. Used to decay the rest bonus so
        // the group doesn't lock in to one location forever
        // (the long-horizon degeneracy the audit caught).
        locationAge: 0
    };
}

/**
 * PHASE 11: start travelling to a destination.
 *
 * The audit: "Do not set `bandit.location = chosenDestination`
 * instantaneously if the world model represents distance.
 * Represent: decision; departure; inTransit; route edge;
 * travel progress; arrival."
 *
 * The group enters the IN_TRANSIT state with travelRemaining
 * ticks. The actual currentLocation does NOT change until
 * arrival — this is the property the audit demands.
 *
 * @param {object} group
 * @param {object} options
 *   - destination: the target location id
 *   - travelTime: number of ticks the journey will take
 */
export function startTravel(group, { destination, travelTime } = {}) {
    if (!group) throw new TypeError('startTravel requires a group');
    if (!destination) throw new TypeError('startTravel requires a destination');
    if (typeof travelTime !== 'number' || travelTime < 0) {
        throw new TypeError('startTravel requires a non-negative travelTime');
    }
    if (group.travelState === 'IN_TRANSIT') {
        // Already in transit: refuse to start a new journey.
        // The audit (PHASE 11) and (PHASE 5) both require
        // idempotent travel transitions.
        return false;
    }
    group.travelState = 'IN_TRANSIT';
    group.travelDestination = destination;
    group.travelRemaining = travelTime;
    return true;
}

/**
 * PHASE 11: advance travel by some number of ticks. If
 * `exposure` is provided, the group records an observation
 * about the path-segment location (a midway camp, a pass,
 * an intersection). This is the audit's "travel creates
 * exposure to encounters, patrols, other travelers,
 * information acquisition" property.
 *
 * When `travelRemaining` reaches zero, the group arrives:
 * travelState returns to AT_LOCATION, currentLocation is
 * updated to the destination. Arriving at an unknown
 * destination does NOT auto-add a belief (§9 invariant).
 *
 * @param {object} group
 * @param {number} ticks
 * @param {object} options
 *   - exposure: { locationId, resourceEstimate, dangerEstimate, confidence }
 * @returns {string} the resulting state: 'AT_LOCATION' or 'IN_TRANSIT'
 */
export function advanceTravel(group, ticks, { exposure } = {}) {
    if (!group) throw new TypeError('advanceTravel requires a group');
    if (typeof ticks !== 'number' || ticks < 0) {
        throw new TypeError('advanceTravel requires a non-negative number of ticks');
    }
    if (group.travelState !== 'IN_TRANSIT') return group.travelState;
    if (exposure) {
        const obs = scoutDestination(group, {
            locationId: exposure.locationId,
            tick: 0, // exposure tick is recorded relative to arrival
            resourceEstimate: exposure.resourceEstimate ?? 0,
            dangerEstimate: exposure.dangerEstimate ?? 0,
            confidence: exposure.confidence ?? 0.6
        });
        recordObservation(group, obs);
    }
    if (ticks >= group.travelRemaining) {
        group.currentLocation = group.travelDestination;
        group.travelState = 'AT_LOCATION';
        group.travelDestination = null;
        group.travelRemaining = 0;
        // PHASE 19 fix: arrival at a new location resets the
        // location age. The rest bonus is at full strength
        // when the group first arrives.
        group.locationAge = 0;
        return 'AT_LOCATION';
    }
    group.travelRemaining -= ticks;
    return 'IN_TRANSIT';
}

/**
 * PHASE 19 fix: advance the group's age-at-current-location
 * by one tick. The caller (the reducer) is responsible for
 * calling this every tick. The rest bonus in
 * `destinationUtility` decays with `locationAge`, so the
 * group eventually gets restless after staying at one
 * location too long.
 *
 * @param {object} group
 * @returns {number} the new locationAge
 */
export function tickRoamingGroup(group) {
    if (!group) return 0;
    if (group.travelState === 'AT_LOCATION') {
        group.locationAge = (group.locationAge ?? 0) + 1;
    }
    return group.locationAge;
}

/**
 * PHASE 7: scouting. A scout action produces an observation
 * (the audit's required shape) and stores it in the group's
 * belief store + observation list. The §9 partial-observability
 * invariant is preserved: locations without an observation have
 * a belief value of `null` and a utility of -Infinity.
 *
 * The audit's required observation fields:
 *   observerId, locationId, tick, resourceEstimate,
 *   dangerEstimate, confidence, sourceType = 'DIRECT_SCOUT'.
 *
 * @param {object} group - the roaming group
 * @param {object} options
 *   - locationId
 *   - tick
 *   - resourceEstimate (0..1)
 *   - dangerEstimate (0..1)
 *   - confidence (0..1)
 * @returns {object} the observation
 */
export function scoutDestination(group, {
    locationId,
    tick = 0,
    resourceEstimate = 0,
    dangerEstimate = 0,
    confidence = 0.9
} = {}) {
    if (!group) throw new TypeError('scoutDestination requires a group');
    if (!locationId) throw new TypeError('scoutDestination requires a locationId');
    return {
        observerId: group.id,
        locationId,
        tick,
        resourceEstimate: clamp01(resourceEstimate),
        dangerEstimate: clamp01(dangerEstimate),
        confidence: clamp01(confidence),
        sourceType: 'DIRECT_SCOUT',
        observedTick: tick
    };
}

/**
 * Record an observation in the group's belief store. The
 * observation is appended to `group.observations` (the audit
 * trail) and the group's `beliefs[locationId]` is updated to
 * the most recent observation. A future slice can implement
 * confidence decay across multiple observations of the same
 * location; for now, the most recent observation wins.
 *
 * The audit: "Do not write ground-truth world values directly
 * into faction beliefs except through explicit observation
 * adapters." `recordObservation` is the explicit adapter.
 *
 * @param {object} group
 * @param {object} observation - the observation from
 *   scoutDestination
 * @returns {object} the updated belief record
 */
export function recordObservation(group, observation) {
    if (!group) throw new TypeError('recordObservation requires a group');
    if (!observation) throw new TypeError('recordObservation requires an observation');
    const { locationId, resourceEstimate, dangerEstimate, confidence, observedTick, sourceType, observerId } = observation;
    // The belief shape used by destinationUtility. The
    // observation's resourceEstimate becomes the resource
    // value, the dangerEstimate becomes the danger, and the
    // confidence becomes the informationConfidence.
    const belief = {
        resourceValue: resourceEstimate,
        danger: dangerEstimate,
        distance: 0, // unknown until scouted or set explicitly
        informationConfidence: confidence,
        // The audit expects a `confidence` field on the belief
        // for direct inspection. The two are the same value
        // for now; a future slice can implement decay that
        // differentiates them.
        confidence,
        observedTick,
        source: sourceType ?? 'DIRECT_SCOUT',
        observerId: observerId ?? group.id
    };
    group.beliefs[locationId] = belief;
    if (!group.observations) group.observations = [];
    group.observations.push(observation);
    return belief;
}

/**
 * PHASE 13: rumor and report propagation. A direct observation
 * can be shared between actors; the recipient's confidence
 * is lower than the sender's. This implements the audit's
 * "DIRECT_OBSERVATION > SCOUT_REPORT > MERCHANT_REPORT > RUMOR"
 * hierarchy: hearsay is strictly less reliable than direct
 * observation.
 *
 * The share decays the original confidence by a factor
 * (default 0.5) and tags the new observation with the
 * source actor and a non-DIRECT sourceType.
 *
 * @param {object} sender - the actor sharing
 * @param {object} recipient - the actor receiving
 * @param {object} observation - the original observation
 * @param {object} options
 *   - tick: the tick at which sharing happens
 *   - decayFactor: confidence multiplier (default 0.5)
 * @returns {object} the derived observation
 */
export function shareObservation(sender, recipient, observation, { tick = 0, decayFactor = 0.5 } = {}) {
    if (!observation) throw new TypeError('shareObservation requires an observation');
    return {
        observerId: sender.id,
        locationId: observation.locationId,
        tick,
        resourceEstimate: observation.resourceEstimate,
        dangerEstimate: observation.dangerEstimate,
        confidence: clamp01(observation.confidence * decayFactor),
        sourceType: 'TRUSTED_REPORT',
        observedTick: tick,
        // Provenance: the original observation's id or
        // fingerprint so the audit trail is reconstructable.
        derivedFrom: observation,
        senderId: sender.id
    };
}

/**
 * PHASE 13: propagate a rumor along a chain of actors. Each
 * link in the chain decays confidence further. The audit:
 * "A tells B. B tells C. C has lower confidence than A."
 *
 * @param {Array<object>} chain - the actors in order (e.g. [A, B, C])
 * @param {object} observation - the original observation
 * @param {Array<object>} hops - { from, to, tick } for each hop
 * @returns {object} the final observation stored on the last
 *   actor
 */
export function propagateRumor(chain, observation, hops) {
    if (!Array.isArray(chain) || chain.length < 2) {
        throw new TypeError('propagateRumor requires at least 2 actors');
    }
    let current = observation;
    for (let i = 0; i < hops.length; i += 1) {
        const hop = hops[i];
        const sender = chain.find(a => a.id === hop.from);
        const recipient = chain.find(a => a.id === hop.to);
        if (!sender || !recipient) continue;
        const shared = shareObservation(sender, recipient, current, { tick: hop.tick });
        recordObservation(recipient, shared);
        current = shared;
    }
    return current;
}

/**
 * Generate candidate destinations for a roaming group.
 *
 * The audit (PHASE 10): "Do not pass arbitrary omniscient
 * destination arrays forever. Generate candidates from
 * actor knowledge and capabilities. ... Normal modes must
 * not evaluate unknown world locations."
 *
 * The default implementation: union of `group.beliefs` keys
 * and `group.currentLocation`, deduped. The §9 invariant
 * holds — only locations with a recorded belief are
 * eligible. A future slice can layer a world-aware
 * generator (e.g. "forage mode considers current cell
 * resources" or "SCOUT mode adds frontier candidates").
 *
 * @param {object} group
 * @returns {string[]} deduped list of candidate ids
 */
export function generateCandidates(group) {
    if (!group) return [];
    const fromBeliefs = Object.keys(group.beliefs ?? {});
    const all = new Set([...fromBeliefs, group.currentLocation]);
    return Array.from(all);
}

/**
 * PHASE 8: route memory decay. A belief that has not been
 * refreshed should lose confidence over time so the group
 * prefers fresh information when it exists.
 *
 * The audit: "Do not make all historical observations
 * permanent at full strength. Introduce age or confidence
 * decay."
 *
 * Default half-life is 30 ticks. The decay is multiplicative:
 * `confidence * 2^(-age/halfLife)`. After one half-life the
 * confidence is approximately half. After two, a quarter.
 *
 * A belief that falls below `minConfidence` (default 0.1) is
 * pruned so the group reverts to the §9 unknown-destination
 * state for that location.
 *
 * @param {object} group
 * @param {number} currentTick
 * @param {object} options
 *   - halfLifeTicks (default 30)
 *   - minConfidence (default 0.1)
 */
export function decayBeliefs(group, currentTick, { halfLifeTicks = 30, minConfidence = 0.1 } = {}) {
    if (!group || !group.beliefs) return;
    for (const [locationId, belief] of Object.entries(group.beliefs)) {
        if (!belief || typeof belief.observedTick !== 'number') continue;
        const age = Math.max(0, currentTick - belief.observedTick);
        const factor = Math.pow(0.5, age / halfLifeTicks);
        belief.confidence = clamp01(belief.confidence * factor);
        belief.informationConfidence = clamp01(belief.informationConfidence * factor);
        if (belief.confidence < minConfidence) {
            delete group.beliefs[locationId];
        }
    }
}

/**
 * PHASE 8: a repeated visit increases the belief's confidence
 * (a fresh observation is more reliable than an old one) and
 * merges the new estimate into the resource/danger values via
 * a confidence-weighted average.
 *
 * The audit: "Repeated successful visits may increase
 * confidence. Unexpected outcomes update the memory."
 *
 * The cap at 1 prevents unbounded confidence growth.
 *
 * @param {object} group
 * @param {string} locationId
 * @param {object} options
 *   - tick
 *   - resourceEstimate
 *   - dangerEstimate
 * @returns {object|null} the updated belief, or null if no
 *   belief exists
 */
export function repeatVisit(group, locationId, { tick, resourceEstimate, dangerEstimate } = {}) {
    if (!group || !group.beliefs) return null;
    const belief = group.beliefs[locationId];
    if (!belief) return null;
    const newConfidence = clamp01(belief.confidence + 0.1);
    belief.confidence = newConfidence;
    belief.informationConfidence = newConfidence;
    if (typeof resourceEstimate === 'number') {
        const w = newConfidence;
        belief.resourceValue = clamp01((belief.resourceValue * (1 - w) + resourceEstimate * w) || resourceEstimate);
    }
    if (typeof dangerEstimate === 'number') {
        const w = newConfidence;
        belief.danger = clamp01((belief.danger * (1 - w) + dangerEstimate * w) || dangerEstimate);
    }
    if (typeof tick === 'number') belief.observedTick = tick;
    return belief;
}

/**
 * Compute the destination utility for a candidate. The §41
 * contract: the utility is a weighted sum of *normalized*
 * considerations. The mode profile (§13) selects the weights.
 *
 * All input considerations are normalized to [0, 1] before
 * being combined. Raw values (e.g. distance = 100) cannot
 * dominate the function — the audit's Game AI Pro /
 * Utility AI warning.
 *
 * @param {string} destinationId
 * @param {object} belief - normalized belief about the
 *   destination, or null if unknown
 * @param {object} group - the roaming group
 * @param {object} options
 *   - season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' (PHASE 20)
 * @returns {number} the utility (higher = preferred), in
 *   roughly [-1, 1]
 */
export function destinationUtility(destinationId, belief, group, options = {}) {
    if (belief == null) return -Infinity; // §9: unknown destinations cannot influence the choice
    // PHASE 20: season-aware resource adjustment. The audit
    // demands that season actually changes behavior. WINTER
    // halves the effective resource; SUMMER passes it through.
    // The factor is a HEURISTIC (calibration is future work).
    const seasonFactors = { SPRING: 1.0, SUMMER: 1.0, AUTUMN: 0.8, WINTER: 0.5 };
    const seasonFactor = seasonFactors[options.season] ?? 1.0;
    // Normalize all considerations to [0, 1].
    const rawResource = clamp01(belief.resourceValue);
    const resourceScore = clamp01(rawResource * seasonFactor);
    const distanceScore = normalize(belief.distance, group.distanceRange);
    const dangerScore = clamp01(belief.danger);
    const lootScore = clamp01(belief.lootOpportunity);
    const routeSecurityScore = clamp01(belief.routeSecurity);
    const retaliationScore = clamp01(belief.retaliationRisk);
    // SCOUT: information gain is the inverse of confidence —
    // the LESS the group knows, the MORE interesting the
    // destination.
    const informationScore = 1 - clamp01(belief.informationConfidence);
    // Look up the mode profile. Missing weights default to 0.
    const profile = MODE_PROFILES[group.mode] ?? MODE_PROFILES[ROAMING_MODE.SEASONAL_MIGRATION];
    const w = (k) => profile[k] ?? 0;
    // Weighted sum. Each weight is in [0,1]; the sum is
    // roughly in [-1, 1].
    const needPressure = clamp01(group.needs?.food ?? 0.5);
    const utility =
        w('resource') * resourceScore * needPressure
        - w('distance') * distanceScore
        - w('danger') * dangerScore
        + w('loot') * lootScore
        + w('routeSecurity') * routeSecurityScore
        - w('retaliation') * retaliationScore
        + w('information') * informationScore;
    // REST: the current location gets a strong rest bonus,
    // but the bonus decays with `locationAge` (how many ticks
    // the group has been at the current location). Without
    // this decay, the group would never leave (the long-
    // horizon degeneracy that PHASE 19 detected). After many
    // ticks, the rest bonus drops to a small fraction, so
    // the group is motivated to seek new opportunities.
    // The decay is multiplicative: `rest * 0.5^(age/halfLife)`
    // with a default half-life of 30 ticks.
    const isCurrent = destinationId === group.currentLocation;
    let restBonus = 0;
    if (isCurrent) {
        const age = Math.max(0, group.locationAge ?? 0);
        const restDecayFactor = Math.pow(0.5, age / 30);
        restBonus = profile.rest * restDecayFactor;
    }
    return utility + restBonus;
}

/**
 * Choose a destination for a roaming group. The §13 contract:
 * "Use seeded stochastic choice over plausible actions."
 *
 * The function uses a softmax over the destination utilities,
 * with the group's `explorationTemperature` as the temperature
 * parameter. Lower temperature = more exploitative; higher =
 * more exploratory.
 *
 * The "STAY" candidate is always available: it represents
 * staying in the current location. Its utility is computed
 * with the same pipeline (the current location's belief + the
 * mode's rest profile).
 *
 * @param {object} group - the roaming group
 * @param {object} options
 *   - candidates: list of destination ids to consider
 *   - rng: deterministic rng (defaults to Math.random)
 * @returns {string} the chosen destination id, or 'STAY' if
 *   the group chooses to remain in place
 */
export function chooseRoamingDestination(group, options = {}) {
    // Constitution §121: every stochastic consumer must
    // use an *explicit* rng supplied by the caller. The
    // previous `?? group.rng` fallback created a silent
    // shared-mutable-state hazard: a forked branch that
    // shared a `group.rng` closure would couple its
    // randomness to the other branch, breaking §120 fork
    // independence. The `?? Math.random` fallback was
    // similarly non-deterministic. Callers MUST pass an
    // `options.rng`; if they do not, this is a programmer
    // error and we throw a clear error instead of
    // silently degrading.
    if (typeof options.rng !== 'function') {
        throw new TypeError(
            'chooseRoamingDestination requires options.rng to be a function. ' +
            'This is required for §121 determinism and §120 fork independence. ' +
            'Callers should seed the rng from the group identity (e.g. FNV-1a hash of group.id) ' +
            'and the world tick so the same (group, tick) yields the same choice.'
        );
    }
    const rng = options.rng;
    const candidates = options.candidates ?? [];
    // Always include STAY as a candidate (§45, §9). The audit:
    // STAY is a real decision meaning "remain at currentLocation".
    // We model it internally as a synthetic 'STAY' candidate but
    // the return value is the actual location (currentLocation),
    // not the magic string 'STAY' itself. This makes the API
    // honest: chooseRoamingDestination returns where the group
    // ends up, not a label.
    const allCandidates = [...candidates, '__STAY__'];
    // Compute utilities for each candidate.
    const utilities = allCandidates.map(destinationId => {
        if (destinationId === '__STAY__') {
            // STAY's belief is the current location's belief.
            // If the current location is unknown, STAY yields
            // -Infinity (the group doesn't know its own home).
            const homeBelief = group.beliefs?.[group.currentLocation] ?? null;
            return destinationUtility(group.currentLocation, homeBelief, group);
        }
        const belief = group.beliefs?.[destinationId];
        return destinationUtility(destinationId, belief, group);
    });
    // Softmax selection. Numerically stable (subtract max).
    const temperature = Math.max(0.01, group.explorationTemperature ?? 0.2);
    const maxU = Math.max(...utilities);
    if (maxU === -Infinity) {
        // No destination is known. The group stays put.
        return group.currentLocation;
    }
    const exps = utilities.map(u => {
        if (u === -Infinity) return 0;
        return Math.exp((u - maxU) / temperature);
    });
    const sum = exps.reduce((a, b) => a + b, 0);
    if (sum === 0) {
        // Degenerate: all utilities are -Infinity or the same.
        return 'STAY';
    }
    const probs = exps.map(e => e / sum);
    // The §45 decision-inertia / anti-thrashing property. The
    // current location's utility is the "baseline" against
    // which a switch is measured. The switch margin is
    // group.switchMargin (default 0 = no margin). A switch
    // to destination d fires only if u(d) - u(current) >
    // switchMargin. The softmax is computed over the
    // remaining eligible candidates, and a synthetic
    // "STAY" candidate with utility = u(current) is added
    // so the softmax naturally prefers STAY when the new
    // destination's softmax-mass is small.
    const switchMargin = group.switchMargin ?? 0;
    const currentUtility = utilities[allCandidates.indexOf('__STAY__')];
    const eligibleCandidates = [];
    const eligibleUtilities = [];
    for (let i = 0; i < allCandidates.length; i += 1) {
        const destId = allCandidates[i];
        const u = utilities[i];
        if (destId === '__STAY__') continue;
        if (u === -Infinity) continue;
        // Anti-thrashing: a switch must beat the current
        // utility by more than the margin.
        if (u - currentUtility > switchMargin) {
            eligibleCandidates.push(destId);
            eligibleUtilities.push(u);
        }
    }
    if (eligibleCandidates.length === 0) {
        // No destination beats the current utility by the
        // required margin. The group stays put.
        return group.currentLocation;
    }
    // The eligible set is non-empty. The current location is
    // a strong default. We use a softmax over the eligible
    // candidates AND the current location (with the
    // current utility, since we're deciding to stay or
    // switch). This is the §45 exploration-vs-exploitation
    // dial.
    const candidateSet = [...eligibleCandidates, '__STAY__'];
    const candidateUtilities = [...eligibleUtilities, currentUtility];
    const maxEU = Math.max(...candidateUtilities);
    if (maxEU === -Infinity) return group.currentLocation;
    const expsE = candidateUtilities.map(u => Math.exp((u - maxEU) / temperature));
    const sumE = expsE.reduce((a, b) => a + b, 0);
    if (sumE === 0) return group.currentLocation;
    const probsE = expsE.map(e => e / sumE);
    // Sample.
    const r = rng();
    let cumulative = 0;
    for (let i = 0; i < candidateSet.length; i += 1) {
        cumulative += probsE[i];
        if (r <= cumulative) {
            // Translate the synthetic STAY back to the real
            // current location name. This is the §9 honesty
            // contract: the return value is where the group
            // is, not a label.
            return candidateSet[i] === '__STAY__' ? group.currentLocation : candidateSet[i];
        }
    }
    const lastChoice = candidateSet[candidateSet.length - 1];
    return lastChoice === '__STAY__' ? group.currentLocation : lastChoice;
}

// =============================================================================
// §121 Deterministic PRNG — single source of truth
// =============================================================================
//
// Constitution §121: "Same seed + same initial state + same
// inputs + same code should reproduce relevant outputs.
// Randomness must be injected."
//
// Every stochastic consumer in the closed-world and the
// roaming subsystem must use this PRNG. Centralizing it
// here ensures no caller can silently fall back to
// `Math.random` (which would break the §121 determinism
// contract and the §120 fork-independence contract).
//
// The function is intentionally minimal: a 32-bit
// xorshift with a single state variable. It's fast, the
// state is fully serializable as a single uint32, and the
// stream is deterministic given the seed.
//
// USAGE: `const rng = makeXorShift32(seed);` and then
// `rng()` returns a float in [0, 1). The seed is typically
// derived from a hash of the group id (so a (group, tick)
// pair yields a unique stream) and the world tick (so
// repeated calls within a single tick are reproducible).

/**
 * Construct a deterministic xorshift32 PRNG.
 *
 * @param {number} seed - 32-bit unsigned integer
 * @returns {function(): number} a function that returns
 *   the next float in [0, 1)
 */
export function makeXorShift32(seed) {
    let state = (seed >>> 0) || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) / 4294967296);
    };
}
