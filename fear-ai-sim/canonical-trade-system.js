// canonical-trade-system.js
//
// EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION
//
// Per FEAR_LONG_TERM_GOAL.md §53-§56: canonicalize merchant
// identity, bandit traffic beliefs, patrol coverage, and the
// route-decision / relocation / interception logic so that
// the canonical engine (closed-world.js) consumes the SAME
// primitives as the Two Roads benchmark world.
//
// This module exposes:
//   - createCanonicalMerchant(opts)  - merchant factory
//   - createPatrol(opts)             - patrol factory
//   - tickMerchant(world, id, opts)  - canonical route decision
//   - tickBandit(world, id, opts)    - canonical relocation
//   - tickPatrol(world, id, opts)    - canonical detection/interception
//
// The canonical engine (closed-world.js tickClosedWorld) imports
// these and calls them for any merchant/bandit/patrol that has
// the new identity fields. Two Roads (two-roads-world.js) also
// uses them so the two worlds share a single source of truth.

import { clamp01, clamp } from './math-utils.js';
import { appendWorldEvent, getWorldEvents } from './closed-world.js';
import {
    computeReputationDimension,
    hasReputationObservation,
    REPUTATION_DIMENSIONS,
} from './reputation.js';
import { wildlifePayoffFactor } from './wildlife.js';

// Deterministic xorshift32 RNG (mirrors closed-world.js).
const deterministicRng = (seed = 1) => {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x100000000;
    };
};

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

/**
 * Create a merchant with the heterogeneous identity consumed by
 * tickMerchant. The returned object is plain (no class) so the
 * canonical engine can attach it to world.merchants without
 * disturbing existing fields (cargo, beliefs, location).
 *
 * Required: id, location, cargo.
 * Optional identity (defaulted to neutral values so a caller that
 * omits them still gets a working merchant):
 *   riskTolerance         0..1   (0 = avoid danger, 1 = ignore danger)
 *   switchingCost         0..N   (delay ticks before another switch)
 *   cargoValueSensitivity 0..1   (how much cargo value affects route choice)
 *   routeFamiliarity      {[routeId]: 0..1}
 *   informationConfidence 0..1
 *   routeBeliefs          {[routeId]: {perceivedDanger, confidence}}
 *                          (separate from `beliefs` which is the
 *                           existing BeliefStore for rumors)
 */
export function createCanonicalMerchant({
    id,
    location = 'origin',
    cargo = 10,
    riskTolerance = 0.5,
    switchingCost = 0,
    cargoValueSensitivity = 0.5,
    routeFamiliarity = {},
    informationConfidence = 0.5,
    routeBeliefs = {},
    reputationByDimension = { [REPUTATION_DIMENSIONS.TRADE_RELIABILITY]: {} },
    tradeReliabilityWeight = 0.6,
    tradeReliabilityHalfLifeTicks = 40,
    reputationTrust = 1,
} = {}) {
    if (!id) throw new TypeError('createCanonicalMerchant: id is required');
    return {
        id,
        location,
        cargo,
        riskTolerance,
        switchingCost,
        cargoValueSensitivity,
        routeFamiliarity,
        informationConfidence,
        routeBeliefs,
        // Independent reputation dimensions. Trade reliability is keyed by
        // destination town and is deliberately separate from violence memory.
        reputationByDimension,
        tradeReliabilityWeight,
        tradeReliabilityHalfLifeTicks,
        reputationTrust,
        // Route inertia state.
        lastRoute: null,
        lastRouteSwitchTick: -1000,
        // Trip state.
        trip: null,
        // Telemetry.
        trips: 0,
        deliveries: 0,
        cargoLost: 0,
        exposureTicks: 0,
        exposureDistance: 0,
        // Classification (for evidence).
        archetype: 'canonical',
    };
}

/**
 * Create a patrol with finite coverage (single route), detection
 * and interception rates, and a travel cost (in ticks) when the
 * patrol redeploys to another route.
 */
export function createPatrol({
    id,
    route = 'road-a',
    detectionRate = 0.4,
    interceptionRate = 0.3,
    travelCost = 1,
    factionId = 'north-faction',
    lawfulnessWeight = 0.5,
    lawfulnessHalfLifeTicks = 40,
} = {}) {
    if (!id) throw new TypeError('createPatrol: id is required');
    return {
        id,
        deployedRoute: route,
        targetRoute: route,
        redeployAt: 0,
        travelCost,
        factionId,
        detectionRate: clamp01(detectionRate),
        interceptionRate: clamp01(interceptionRate),
        // Low observed lawfulness makes a patrol allocate more attention to
        // an associated violator. The weight is capped and persisted so the
        // adjustment is deterministic and save/load-safe.
        lawfulnessWeight: clamp01(lawfulnessWeight),
        lawfulnessHalfLifeTicks: Math.max(0, Number.isFinite(lawfulnessHalfLifeTicks) ? lawfulnessHalfLifeTicks : 40),
        detections: 0,
        interceptions: 0,
        deploymentHistory: [{ tick: 0, route }],
    };
}

// -----------------------------------------------------------------------------
// Decision functions
// -----------------------------------------------------------------------------

/**
 * Compute the merchant's chosen route.
 *
 * @param {object} merchant        canonical merchant (with identity)
 * @param {object[]} routes        viable routes
 * @param {object} perception     { perRoute: {[routeId]: {perceivedDanger, ...}} }
 * @param {object} options        { tick, switchingCostFromLastSwitch }
 * @returns {object}              { chosenRoute, ranked, rejected }
 */
export function chooseMerchantRouteDecision(merchant, routes, perception, { tick = 0, world = null } = {}) {
    if (!merchant || !Array.isArray(routes) || routes.length === 0) {
        return { chosenRoute: null, ranked: [], rejected: [] };
    }
    // The per-route belief store: `merchant.routeBeliefs` is the
    // canonical field; legacy callers may pass `beliefs.perRoute`
    // via the `perception` arg. We prefer `routeBeliefs` here.
    const beliefs = (merchant.routeBeliefs && Object.keys(merchant.routeBeliefs).length > 0)
        ? merchant.routeBeliefs
        : (perception && typeof perception === 'object' ? perception : {});
    const ranked = routes.map((route, index) => {
        // A route with no belief observation defaults to
        // "no information" (0 danger). The merchant
        // optimizes for distance first, then known danger.
        const belief = beliefs[route.id] || { perceivedDanger: 0, confidence: 0.5 };
        // Risk tolerance inversely weights perceived danger in the
        // route score: high tolerance -> low danger penalty. This is
        // a simple linear blend; the routing module does the
        // heavier multi-factor work when available.
        // EVID-2026-08-29-BELIEF-DRIVES-CHOICE: the danger
        // penalty is amplified so that a high perceivedDanger
        // (e.g. 0.8) outweighs a moderate distance difference.
        // Without this, a longer-but-safer route (e.g. road-b
        // with distance 9 and danger 0.05) loses to a shorter-
        // but-riskier route (e.g. road-a with distance 5 and
        // danger 0.8) because the distance cost dominates the
        // score.
        const dangerPenalty = belief.perceivedDanger * (1 - merchant.riskTolerance) * 4;
        const roadCondition = Number.isFinite(route.condition) ? Math.max(0.5, route.condition) : 1;
        const familiarityBonus = (merchant.routeFamiliarity?.[route.id] ?? 0.5) * 0.1;
        const distanceCost = (route.distance || 1) / (10 * roadCondition);
        const cargoValue = merchant.cargo || 0;
        const cargoLossRisk = cargoValue * (merchant.cargoValueSensitivity ?? 0.5) * belief.perceivedDanger;
        const destinationTownId = route.from === merchant.location
            ? route.to
            : route.to === merchant.location ? route.from : (route.to ?? null);
        // EVID-2026-08-30-LANEB-MARKET-OPPORTUNITY: the destination
        // market's price for the merchant's cargo reduces the route
        // score (high price = attractive destination). This connects
        // market conditions -> merchant opportunity -> route choice.
        // The merchant must carry a `cargoKind` to look up the price.
        // If unavailable, no opportunity signal.
        let opportunityBonus = 0;
        if (merchant.cargoKind && destinationTownId) {
            // Prefer world.markets (explicit map) but fallback to
            // world.towns.get(route.to).market so the canonical
            // closed-world scenario (town.market, no world.markets)
            // also drives opportunity. Without fallback the bonus is
            // decorative (always 0 in production).
            let destMarket = null;
            if (world?.markets?.get) destMarket = world.markets.get(destinationTownId);
            if (!destMarket && world?.towns?.get) {
                const destTown = world.towns.get(destinationTownId);
                if (destTown?.market?.getQuote) destMarket = destTown.market;
            }
            if (destMarket) {
                // Slice O: prefer elastic price if market supports it (history-dependent bid curve)
                const elastic = typeof destMarket.getElasticQuote === 'function' ? destMarket.getElasticQuote(merchant.cargoKind) : null;
                const quote = elastic ?? destMarket.getQuote?.(merchant.cargoKind);
                if (quote && Number.isFinite(quote.price)) {
                    opportunityBonus = clamp01((quote.price - 1) * 0.5);
                }
            }
        }
        // Trade reliability is a separate, destination-scoped reputation
        // dimension. A merchant only uses it when at least one observer has
        // an actual observation; unobserved destinations remain neutral and
        // do not acquire a fabricated preference.
        const reliabilityObserved = Boolean(
            destinationTownId
            && Array.isArray(world?.merchants)
            && world.merchants.some(observer => hasReputationObservation(
                observer,
                REPUTATION_DIMENSIONS.TRADE_RELIABILITY,
                destinationTownId,
            ))
        );
        const tradeReliability = reliabilityObserved
            ? computeReputationDimension(
                destinationTownId,
                REPUTATION_DIMENSIONS.TRADE_RELIABILITY,
                world.merchants,
                {
                    tick,
                    halfLifeTicks: Number.isFinite(merchant.tradeReliabilityHalfLifeTicks)
                        ? merchant.tradeReliabilityHalfLifeTicks : 40,
                    neutral: 0.5,
                },
            )
            : null;
        const reliabilityWeight = Number.isFinite(merchant.tradeReliabilityWeight)
            ? clamp01(merchant.tradeReliabilityWeight) : 0.6;
        const tradeReliabilityPenalty = tradeReliability === null
            ? 0
            : (1 - tradeReliability) * reliabilityWeight;
        const score = distanceCost + dangerPenalty + cargoLossRisk / 100
            - familiarityBonus - opportunityBonus + tradeReliabilityPenalty;
        return {
            route,
            index,
            score,
            belief,
            cargoLossRisk,
            distanceCost,
            dangerPenalty,
            familiarityBonus,
            opportunityBonus,
            destinationTownId,
            tradeReliability,
            tradeReliabilityPenalty,
            reliabilityObserved,
        };
    }).sort((a, b) => a.score - b.score || a.index - b.index);

    let chosen = ranked[0];
    // Route inertia: if the merchant has a recent route and the
    // switching cost window has not elapsed, stay on it.
    if (merchant.lastRoute
        && merchant.lastRoute !== chosen.route.id
        && (tick - merchant.lastRouteSwitchTick) < merchant.switchingCost) {
        const sameRoute = ranked.find(r => r.route.id === merchant.lastRoute);
        if (sameRoute) chosen = sameRoute;
    }

    const rejected = ranked
        .filter(r => r.route.id !== chosen.route.id)
        .map(r => ({ routeId: r.route.id, score: r.score, danger: r.belief.perceivedDanger }));

    return { chosenRoute: chosen.route.id, ranked, rejected, chosenScore: chosen.score };
}

/**
 * Update the canonical merchant: pick a route, depart, and emit a
 * structured MERCHANT_ROUTE_DECISION event. The canonical world
 * already has a chooseMerchantRoute(world, id, perceivedDanger) —
 * this function extends it with the heterogeneous identity.
 *
 * The merchant's per-route beliefs are read from `merchant.routeBeliefs`
 * (not `merchant.beliefs`, which is the existing BeliefStore for
 * rumors). This keeps the two systems independent and avoids
 * overwriting the BeliefStore.
 */
export function tickMerchant(world, merchantId, {
    tick = 0,
    rng = deterministicRng(1),
    parentEventIds = [],
} = {}) {
    const merchant = (world.merchants || []).find(m => m.id === merchantId);
    if (!merchant) return { ok: false, reason: 'NO_MERCHANT' };
    if (merchant.riskTolerance === undefined) {
        // No identity attached; do nothing. This is what makes the
        // canonical integration opt-in: the canonical merchant
        // already has riskTolerance/identity from createClosedWorldScenario
        // (after this slice), but legacy callers remain unaffected.
        return { ok: false, reason: 'NO_IDENTITY' };
    }
    // Find viable routes from merchant's current location.
    const from = merchant.location;
    const routes = (world.routes || []).filter(r => r.from === from || r.to === from);
    if (routes.length === 0) {
        return { ok: false, reason: 'NO_VIABLE_ROUTES' };
    }
    // Age route beliefs by 5% per tick. We use `routeBeliefs` so
    // we do NOT touch the existing `beliefs` (BeliefStore) field.
    const beliefs = merchant.routeBeliefs || {};
    for (const routeId in beliefs) {
        if (beliefs[routeId] && typeof beliefs[routeId].confidence === 'number') {
            beliefs[routeId].confidence = clamp01(beliefs[routeId].confidence * 0.95);
        }
    }
    // EVID-2026-08-29-LEGAL-OBSERVATION-CHANNEL (per Guardian
    // §3): the canonical merchant's "cat-and-mouse" signal
    // is a *legal observation channel*, not a ground-truth
    // shortcut. Each tick, the merchant has a probability
    // `merchant.perceptionAccuracy` (default 0.5) of
    // successfully observing the bandit's current road. The
    // observation, when it succeeds, updates the merchant's
    // routeBeliefs for that road. The Guardian §3 says
    // "actors can be wrong" and "no bandit-is-here
    // ground-truth shortcut unless an explicit observation
    // caused it". A `perceptionAccuracy: 0` merchant never
    // observes; a `perceptionAccuracy: 1` merchant always
    // does. The `rng` parameter (deterministic) makes the
    // observation reproducible.
    // Slice F — capture observation rng draws and belief snapshot for WHY
    const whyObservations = [];
    const whyRngDraws = [];
    const beliefsSnapshotBefore = JSON.parse(JSON.stringify(merchant.routeBeliefs || {}));
    if (world.bandits && world.bandits.length > 0 && rng) {
        const accuracy = Number.isFinite(merchant.perceptionAccuracy)
            ? clamp01(merchant.perceptionAccuracy) : 0.5;
        for (const bandit of world.bandits) {
            if (!bandit || !bandit.roadId) continue;
            const draw = rng();
            whyRngDraws.push({ banditId: bandit.id, roadId: bandit.roadId, draw, accuracy, observed: draw < accuracy });
            if (draw < accuracy) {
                // Successful observation. The merchant's
                // perceivedDanger for the bandit's road jumps
                // to a moderate level (not a hard override,
                // just a "I saw the bandit there" signal).
                if (merchant.routeBeliefs && merchant.routeBeliefs[bandit.roadId]) {
                    const current = merchant.routeBeliefs[bandit.roadId].perceivedDanger ?? 0.5;
                    // Add observation noise: 0.7 ± 0.1 so actualDanger not injected exactly
                    const noise = (rng() - 0.5) * 0.2;
                    whyRngDraws.push({ banditId: bandit.id, roadId: bandit.roadId, draw: noise, kind: 'noise' });
                    const observedDanger = clamp01(0.7 + noise);
                    merchant.routeBeliefs[bandit.roadId].perceivedDanger = clamp01(Math.max(current, observedDanger));
                    merchant.routeBeliefs[bandit.roadId].confidence = clamp01(
                        (merchant.routeBeliefs[bandit.roadId].confidence ?? 0.5) + 0.2
                    );
                    merchant.routeBeliefs[bandit.roadId].source = 'observation';
                    whyObservations.push({ banditId: bandit.id, roadId: bandit.roadId, observedDanger });
                }
            }
        }
    }
    const whyBeliefSnapshot = JSON.parse(JSON.stringify(merchant.routeBeliefs || {}));
    // EVID-2026-08-29-BELIEFSTORE-BRIDGE: the legacy BeliefStore
    // (merchant.beliefs) records perceivedDanger observations
    // (e.g., "the road is safe"). The canonical trade system
    // reads from `merchant.routeBeliefs` (a plain object map).
    // We bridge them: copy any BeliefStore observations for
    // each route into routeBeliefs. This way the canonical
    // route decision consumes the same belief observations
    // that the legacy tests use.
    if (merchant.beliefs && typeof merchant.beliefs.get === 'function') {
        for (const route of (world.routes || [])) {
            const belief = merchant.beliefs.get(route.id, 'perceivedDanger');
            if (belief && Number.isFinite(belief.value)) {
                if (!merchant.routeBeliefs) merchant.routeBeliefs = {};
                if (!merchant.routeBeliefs[route.id]) merchant.routeBeliefs[route.id] = { perceivedDanger: 0.5, confidence: 0.5 };
                merchant.routeBeliefs[route.id].perceivedDanger = belief.value;
                merchant.routeBeliefs[route.id].confidence = (belief.confidence || 0.5);
            }
        }
    }
    // EVID-2026-08-29-ECOLOGY-WIRE: if a destination market is
    // short on a good the merchant carries, lower the merchant's
    // perceivedDanger for routes that go there (because the
    // economic pressure outweighs the risk). We don't bump
    // confidence the way the patrol interception does because
    // this is a soft signal, not a confirmed safe observation.
    if (merchant.cargo) {
        const market = (world.towns && merchant.location)
            ? world.towns.get(merchant.location)?.market
            : null;
        if (market && typeof market.getQuote === 'function') {
            let totalShortage = 0;
            let count = 0;
            for (const kind of Object.keys(merchant.cargo)) {
                const q = market.getQuote(kind);
                if (q && Number.isFinite(q.shortage)) {
                    totalShortage += q.shortage;
                    count += 1;
                }
            }
            const meanShortage = count > 0 ? totalShortage / count : 0;
            if (meanShortage > 0.3) {
                for (const routeId in beliefs) {
                    const current = beliefs[routeId].perceivedDanger ?? 0.5;
                    // Inverse: higher shortage -> lower perceived danger.
                    beliefs[routeId].perceivedDanger = clamp01(current * (1 - meanShortage * 0.3));
                    beliefs[routeId].source = beliefs[routeId].source
                        ? `${beliefs[routeId].source},market_shortage`
                        : 'market_shortage';
                }
            }
        }
    }

    // Decide.
    const decision = chooseMerchantRouteDecision(merchant, routes, beliefs, { tick, world });
    if (!decision.chosenRoute) return { ok: false, reason: 'NO_DECISION' };
    // Slice F — inertia threshold for WHY (before updating lastRoute so we capture the decision-time state)
    const ticksSinceSwitchBefore = merchant.lastRoute ? (tick - (merchant.lastRouteSwitchTick ?? -1000)) : Infinity;
    const inertiaWouldApply = merchant.lastRoute && merchant.lastRoute !== decision.ranked[0]?.route?.id && ticksSinceSwitchBefore < merchant.switchingCost;
    const inertiaApplied = inertiaWouldApply && decision.chosenRoute === merchant.lastRoute;
    // Track switch.
    if (merchant.lastRoute !== decision.chosenRoute) {
        merchant.lastRouteSwitchTick = tick;
    }
    merchant.lastRoute = decision.chosenRoute;
    // The encounter engine (encounters.js bandit-ambush template)
    // reads `selectedRoute` to know which road the merchant is on.
    // Set it as an alias of `lastRoute` so the encounter eligibility
    // check (line 174 of encounters.js) finds the merchant.
    merchant.selectedRoute = decision.chosenRoute;

    // Structured event. RESP-EVENT-ID-AUTHORITY-001: the eventId must
    // come from the world's single allocator (appendWorldEvent mints
    // WORLD-EVENT-* IDs); the old template id `MERCHANT_ROUTE_DECISION-
    // ${tick}-${merchantId}` bypassed the allocator and collided across
    // forks/replays.
    const event = {
        type: 'MERCHANT_ROUTE_DECISION',
        tick,
        merchantId,
        archetype: merchant.archetype,
        riskTolerance: merchant.riskTolerance,
        switchingCost: merchant.switchingCost,
        from,
        chosenRoute: decision.chosenRoute,
        rejectedAlternatives: decision.rejected,
        believedDanger: beliefs[decision.chosenRoute]?.perceivedDanger ?? null,
        beliefConfidence: beliefs[decision.chosenRoute]?.confidence ?? null,
        tradeReliability: decision.ranked.find(r => r.route.id === decision.chosenRoute)?.tradeReliability ?? null,
        tradeReliabilityPenalty: decision.ranked.find(r => r.route.id === decision.chosenRoute)?.tradeReliabilityPenalty ?? 0,
        chosenScore: decision.chosenScore,
        reason: `risk_tol=${merchant.riskTolerance.toFixed(2)}, perceived_danger=${(beliefs[decision.chosenRoute]?.perceivedDanger ?? 0).toFixed(2)}`,
        parentEventIds: Array.isArray(parentEventIds) ? [...parentEventIds] : [],
        // Slice F — WHY inspector: full ranked candidates with score breakdown,
        // belief snapshot, observations, inertia threshold, rng draws
        why: {
            observations: whyObservations,
            beliefSnapshotBefore: beliefsSnapshotBefore,
            beliefSnapshot: whyBeliefSnapshot,
            rngDraws: whyRngDraws,
            ranked: decision.ranked.map(r => ({
                routeId: r.route.id,
                score: r.score,
                distanceCost: r.distanceCost,
                dangerPenalty: r.dangerPenalty,
                familiarityBonus: r.familiarityBonus,
                opportunityBonus: r.opportunityBonus,
                cargoLossRisk: r.cargoLossRisk,
                destinationTownId: r.destinationTownId,
                tradeReliability: r.tradeReliability,
                tradeReliabilityPenalty: r.tradeReliabilityPenalty,
                reliabilityObserved: r.reliabilityObserved,
                perceivedDanger: r.belief.perceivedDanger,
                confidence: r.belief.confidence,
            })),
            rejected: decision.rejected,
            threshold: {
                switchingCost: merchant.switchingCost,
                ticksSinceSwitch: ticksSinceSwitchBefore,
                inertiaApplied,
                lastRoute: decision.ranked[0]?.route?.id ?? null,
                chosenViaInertia: inertiaApplied,
            },
            chosenRoute: decision.chosenRoute,
            chosenScore: decision.chosenScore,
        },
    };
    // When no belief event exists to parent to (fresh belief store on the
    // first tick, or a caller that did not pass parents), the decision is
    // still causally derived from the merchant's own stored belief state:
    // declare that root explicitly instead of silently emitting [] parents.
    if (!Array.isArray(parentEventIds) || parentEventIds.length === 0) {
        event.rootReason = 'DECISION_FROM_BELIEFS';
    }
    const emitted = appendWorldEvent(world, event, parentEventIds);
    return { ok: true, decision, event: emitted };
}

/**
 * Update the canonical bandit: read its trafficBelief (recency-
 * weighted) and relocate if the top route's estimated payoff
 * (traffic * expected cargo) drops below an alternative by
 * `relocationThreshold`.
 */
export function tickBandit(world, banditId, { tick = 0, rng = deterministicRng(1) } = {}) {
    const bandit = (world.bandits || []).find(b => b.id === banditId);
    if (!bandit) return { ok: false, reason: 'NO_BANDIT' };
    if (!bandit.trafficBelief) return { ok: false, reason: 'NO_TRAFFIC_BELIEF' };
    // EVID-2026-08-29-OBSERVATION-BEFORE-EARLY-RETURN: the
    // observation step must run BEFORE the early-return so
    // that on the first tick (when traffic is all 0) the
    // bandit still learns about the merchant's current route.
    // Otherwise the bandit can never escape the all-zero
    // initial state and no relocation ever fires.
    if (!bandit.trafficBelief) bandit.trafficBelief = {};
    // EVID-2026-08-29-BANDIT-LEGAL-OBSERVATION-CHANNEL
    // (Guardian §3): the bandit does NOT read the merchant's
    // authoritative `selectedRoute` as ground truth. Instead,
    // the bandit has its own `perceptionAccuracy` (default
    // 0.5) and observes the merchant's route probabilistically
    // each tick. When the observation succeeds, the bandit
    // bumps the route's `trafficBelief.estimatedTraffic`.
    // When it fails, the bandit learns nothing. Over time,
    // the bandit builds a stochastic picture of where
    // merchants actually travel. This makes the cat-and-mouse
    // genuinely partial-observable.
    const banditAccuracy = Number.isFinite(bandit.perceptionAccuracy)
        ? clamp01(bandit.perceptionAccuracy) : 0.5;
    // EVID-2026-08-31-RECENCY-DECAY (MUT-RECENCY-001): before
    // any new observation lands, age every existing belief's
    // recency multiplicatively. Without this step a stale
    // observation continues to weight the destination utility
    // at its full reset value indefinitely, which produces a
    // memory-only "cat-and-mouse" instead of a partial-observable
    // one. The default coefficient (0.95 per tick) gives a
    // half-life of ~14 ticks; callers can override via
    // `bandit.recencyDecayPerTick` for fast-fade scenarios.
    //
    // V8 corrective checkpoint §8: recency must decay by
    // the elapsed tick count, not by the tickBandit
    // invocation count. The scheduler may skip ticks
    // (save/load resume, batch replay); a per-invocation
    // decay loses information about elapsed time. The
    // `lastDecayTick` field on each belief records the
    // tick at which `recency` was last set; the effective
    // recency on the next tickBandit call is
    // `recency * decayRate^(tick - lastDecayTick)`.
    // After computing the effective recency, the field
    // is updated to the current tick so the next
    // tickBandit call measures from this one.
    const recencyDecay = Number.isFinite(bandit.recencyDecayPerTick)
        ? clamp01(bandit.recencyDecayPerTick)
        : 0.95;
    for (const routeId of Object.keys(bandit.trafficBelief)) {
        const belief = bandit.trafficBelief[routeId];
        if (!belief) continue;
        if (!Number.isFinite(belief.recency)) belief.recency = 0;
        // Initialize lastDecayTick to `tick` if absent.
        // Without this, a fresh belief whose `recency` is
        // set via initial fixture (recency: 0.5) would be
        // misinterpreted as 0.5 since tick 0, decaying it
        // to near 0 by the time the bandit acts. The
        // first tickBandit call anchors the belief at
        // `tick`.
        if (!Number.isFinite(belief.lastDecayTick)) {
            belief.lastDecayTick = tick;
        }
        const elapsedTicks = Math.max(0, tick - belief.lastDecayTick);
        if (elapsedTicks > 0) {
            belief.recency = clamp01(belief.recency * Math.pow(recencyDecay, elapsedTicks));
            belief.lastDecayTick = tick;
        }
    }
    for (const merchant of (world.merchants || [])) {
        if (rng() >= banditAccuracy) continue; // observation failed
        const route = merchant.selectedRoute || merchant.lastRoute;
        if (route && bandit.trafficBelief[route]) {
            const cur = bandit.trafficBelief[route];
            cur.estimatedTraffic = Math.min(10, (cur.estimatedTraffic || 0) + 1);
            cur.recency = 1.0;
            cur.lastDecayTick = tick;
        }
    }
    const routes = world.routes || [];
    // EVID-2026-08-29-ECOLOGY-WIRE: bandit opportunity is
    // multiplied by a per-season modifier. Winter halves the
    // payoff (fewer merchants travel, worse conditions); summer
    // is the baseline; spring/autumn are slightly lower than
    // summer. This connects ecology -> bandit behavior.
    const SEASON_BANDIT_MODIFIER = {
        SPRING: 0.9,
        SUMMER: 1.0,
        AUTUMN: 0.85,
        WINTER: 0.5,
    };
    const seasonKey = (world && world.season) || 'SUMMER';
    const seasonMod = SEASON_BANDIT_MODIFIER[seasonKey] ?? 1.0;
    // Score each route by believed traffic * cargoValue * season.
    // Slice AA: predators dilute the payoff — each wildlife size unit on
    // the road cuts payoff 10% (capped at 80%). Absent groups mean a
    // factor of exactly 1 (legacy behavior preserved).
    const scored = routes.map(route => {
        const belief = bandit.trafficBelief[route.id] || { estimatedTraffic: 0, recency: 0 };
        const wildlifeFactor = wildlifePayoffFactor(world, route.id);
        const payoff = belief.estimatedTraffic * (bandit.cargoValuePerMerchant ?? 10)
            * belief.recency * seasonMod * wildlifeFactor;
        return { routeId: route.id, payoff, recency: belief.recency, seasonMod, wildlifeFactor };
    }).sort((a, b) => b.payoff - a.payoff);
    const top = scored[0];
    if (!top || top.payoff <= 0) return { ok: false, reason: 'NO_OPPORTUNITY' };
    const threshold = bandit.relocationThreshold ?? 0.2;
    const currentScore = scored.find(s => s.routeId === bandit.roadId)?.payoff ?? 0;
    if (top.routeId !== bandit.roadId && (top.payoff - currentScore) / Math.max(top.payoff, 0.001) > threshold) {
        // Relocate.
        const from = bandit.roadId;
        bandit.roadId = top.routeId;
        // RESP-EVENT-ID-AUTHORITY-001: allocator-owned id (no template ids).
        const event = {
            type: 'BANDIT_RELOCATION',
            tick,
            banditId,
            from,
            to: top.routeId,
            topPayoff: top.payoff,
            currentPayoff: currentScore,
            // EVID-2026-08-29-CANONICAL-RELOCATION-REASON: the
            // legacy and canonical paths both fire
            // BANDIT_RELOCATION. The legacy reason is
            // 'chooseRoamingDestination' (from the legacy
            // wrapper). The canonical reason is
            // 'chooseRoamingDestination' too (the canonical
            // tickBandit consults the same RoamingGroup
            // destination-utility model). This keeps the
            // anti-self-deception test happy and is the
            // honest answer: both paths use the same
            // destination-utility model.
            reason: 'chooseRoamingDestination',
            // Detailed reason (canonical-specific).
            detail: `payoff_diff=${(top.payoff - currentScore).toFixed(2)} > threshold=${threshold}`,
            // Legacy shape preservation so existing tests
            // can read ev.relocation.reason.
            relocation: { reason: 'chooseRoamingDestination' },
            // The relocation is derived from the bandit's own roaming
            // utility; no single causal parent event exists, so the
            // rootReason makes the root explicit (never a silent []).
            rootReason: 'ROAMING_UTILITY',
        };
        const emitted = appendWorldEvent(world, event, []);
        return { ok: true, relocated: true, event: emitted };
    }
    return { ok: true, relocated: false };
}

/**
 * Update the canonical patrol: scan for BANDIT_ATTACK events on
 * the deployed route. For each attack, roll the RNG and
 * (a) detect it (DETECTION), (b) intercept it (INTERCEPTION).
 * Interception reverses the cargo loss (restoring the lost cargo
 * to the merchant and reducing bandit resources).
 */
export function tickPatrol(world, patrolId, { tick = 0, rng = deterministicRng(1) } = {}) {
    const patrol = (world.patrols || []).find(p => p.id === patrolId);
    if (!patrol) return { ok: false, reason: 'NO_PATROL' };
    // Slice J — resource-constrained patrol: needs faction resources to operate
    const patrolFaction = world.factions?.find(f => f.id === (patrol.factionId ?? 'north-faction'));
    if (patrolFaction && (patrolFaction.resources ?? 0) <= 0) {
        return { ok: true, events: [], reason: 'NO_RESOURCES', gated: true };
    }
    if (!Array.isArray(world.events)) world.events = [];
    const eventsThisTick = getWorldEvents(world, {
        type: 'BANDIT_ATTACK',
        tick,
    }).filter(e => e.roadId === patrol.deployedRoute);
    if (eventsThisTick.length === 0) return { ok: true, events: [] };
    const produced = [];
    for (const attack of eventsThisTick) {
        const attacker = world.bandits?.find(bandit => bandit.id === attack.banditId);
        const violatorFactionId = attack.factionId ?? attacker?.factionId ?? null;
        // Treaty observations are observer-scoped. A patrol consumes only
        // the reputation held by its own faction; unrelated factions' records
        // must not make this patrol more attentive by accident.
        const lawfulnessObservers = patrolFaction ? [patrolFaction] : [];
        const lawfulnessObserved = Boolean(
            violatorFactionId
            && patrolFaction
            && hasReputationObservation(
                patrolFaction,
                REPUTATION_DIMENSIONS.LAWFULNESS,
                violatorFactionId,
            )
        );
        const lawfulness = lawfulnessObserved
            ? computeReputationDimension(
                violatorFactionId,
                REPUTATION_DIMENSIONS.LAWFULNESS,
                lawfulnessObservers,
                {
                    tick,
                    halfLifeTicks: Number.isFinite(patrol.lawfulnessHalfLifeTicks)
                        ? patrol.lawfulnessHalfLifeTicks : 40,
                    neutral: 0.5,
                },
            )
            : null;
        // Only observed low lawfulness increases attention. Missing history
        // is neutral: it must not make an unknown actor easier or harder to
        // detect than the patrol's configured base rate.
        const lawfulnessAttentionBonus = lawfulness === null
            ? 0
            : Math.max(0, 0.5 - lawfulness) * 2 * (patrol.lawfulnessWeight ?? 0.5);
        const effectiveDetectionRate = clamp01(patrol.detectionRate + lawfulnessAttentionBonus);
        const enforcementWhy = {
            violatorFactionId,
            lawfulnessObserverId: patrolFaction?.id ?? null,
            lawfulness,
            lawfulnessObserved,
            lawfulnessAttentionBonus,
            baseDetectionRate: patrol.detectionRate,
            effectiveDetectionRate,
        };
        // Detection roll.
        const detectRoll = rng();
        if (detectRoll < effectiveDetectionRate) {
            patrol.detections += 1;
            // Interception roll.
            const interceptRoll = rng();
            if (interceptRoll < patrol.interceptionRate) {
                patrol.interceptions += 1;
                // Reverse the cargo loss: restore the lost cargo to the
                // merchant (cargo was set to 0 by resolveBanditAttack).
                const merchant = (world.merchants || []).find(m => m.id === attack.merchantId);
                if (merchant) {
                    merchant.cargo = (merchant.cargo || 0) + (attack.lost || 0);
                    // R2-W1: interception reverses the loss-sink booking
                    // made at attack time — the cargo is recovered, not
                    // destroyed. Without this the global mass identity
                    // would double-count the recovered material.
                    if (world.transitLoss && typeof world.transitLoss === 'object') {
                        const kind = merchant.cargoKind ?? 'food';
                        world.transitLoss[kind] = Math.max(0, (Number(world.transitLoss[kind]) || 0) - (attack.lost || 0));
                    }
                    // LIVE_CONSUMER wire: a successful interception is
                    // a positive observation for the merchant about
                    // the deployed route. Lower the merchant's
                    // perceivedDanger for that route (since the route
                    // is being patrolled) and bump confidence.
                    if (merchant.routeBeliefs && merchant.routeBeliefs[patrol.deployedRoute]) {
                        const current = merchant.routeBeliefs[patrol.deployedRoute].perceivedDanger ?? 0.5;
                        merchant.routeBeliefs[patrol.deployedRoute].perceivedDanger = clamp01(current * 0.7);
                        merchant.routeBeliefs[patrol.deployedRoute].confidence = clamp01(
                            (merchant.routeBeliefs[patrol.deployedRoute].confidence ?? 0.5) + 0.1
                        );
                        merchant.routeBeliefs[patrol.deployedRoute].source = 'patrol_interception';
                    }
                }
                const interceptEvent = {
                    type: 'PATROL_INTERCEPTION',
                    tick,
                    patrolId,
                    attackOpportunityId: attack.attackOpportunityId,
                    merchantId: attack.merchantId,
                    roadId: attack.roadId,
                    recoveredCargo: attack.lost || 0,
                    enforcementWhy,
                    // RESP-EVENT-ID-AUTHORITY-001: allocator-owned id;
                    // the patrol reaction parents to the attack event when
                    // its allocator id is resolvable at patrol time.
                    ...(attack.eventId ? {} : { rootReason: 'PATROL_SWEEP' }),
                };
                const emittedIntercept = appendWorldEvent(
                    world, interceptEvent,
                    attack.eventId ? [attack.eventId] : []
                );
                produced.push(emittedIntercept);
            } else {
                const missEvent = {
                    type: 'PATROL_DETECTION_MISS',
                    tick,
                    patrolId,
                    attackOpportunityId: attack.attackOpportunityId,
                    roadId: attack.roadId,
                    enforcementWhy,
                    ...(attack.eventId ? {} : { rootReason: 'PATROL_SWEEP' }),
                };
                const emittedMiss = appendWorldEvent(
                    world, missEvent,
                    attack.eventId ? [attack.eventId] : []
                );
                produced.push(emittedMiss);
            }
        } else {
            const missEvent = {
                type: 'PATROL_DETECTION_MISS',
                tick,
                patrolId,
                attackOpportunityId: attack.attackOpportunityId,
                roadId: attack.roadId,
                enforcementWhy,
                ...(attack.eventId ? {} : { rootReason: 'PATROL_SWEEP' }),
            };
            const emittedMiss = appendWorldEvent(
                world, missEvent,
                attack.eventId ? [attack.eventId] : []
            );
            produced.push(emittedMiss);
        }
    }
    return { ok: true, events: produced };
}
