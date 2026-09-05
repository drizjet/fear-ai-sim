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
import { appendWorldEvent, getWorldEvents, canObserve } from './closed-world.js';
import {
    computeReputationDimension,
    hasReputationObservation,
    REPUTATION_DIMENSIONS,
} from './reputation.js';
import { wildlifePayoffFactor } from './wildlife.js';
// Slice AD: routing.js owns route costing. The canonical decision maps
// its identity/belief terms onto a routing perception and consumes
// routeCost as the base score instead of maintaining a parallel blend.
import { routeCost } from './routing.js';
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
        // E6: per-road exposure memory (roadId -> attacks seen).
        // Plain JSON, save/load-safe. Familiarity is scoped to the
        // deployed road: redeploying starts over on the new road.
        roadFamiliarity: {},
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
        // Slice AD: the base cost comes from routing.routeCost — the
        // single owner of distance/condition/danger/cargo/familiarity
        // pricing. The canonical identity terms map onto a routing
        // perception 1:1 (fearSensitivity carries the risk-tolerance
        // blend, expectedCargoLoss carries the value-at-risk blend,
        // routeFamiliarity carries the familiarity bonus). routing
        // prices distance in whole units while this decision scores in
        // distance/10 units, so perception weights are scaled by 10
        // and the routing cost is normalized back — the ranking is
        // identical to the legacy blend by construction, and the
        // component fields below stay exact for the WHY audit.
        // Risk tolerance inversely weights perceived danger in the
        // route score: high tolerance -> low danger penalty.
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
        const routingBaseCost = routeCost(route, {
            perceivedDanger: belief.perceivedDanger,
            fearSensitivity: (1 - merchant.riskTolerance) * 40,
            expectedCargoLoss: cargoLossRisk / 10,
            routeFamiliarity: familiarityBonus * 10,
            confidence: 1,
        }) / 10;
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
            let destAbandoned = false;
            if (world?.markets?.get) destMarket = world.markets.get(destinationTownId);
            if (!destMarket && world?.towns?.get) {
                const destTown = world.towns.get(destinationTownId);
                // E4: abandoned towns are rubble with haunting
                // shortage quotes but nobody to buy. Serving ghost
                // demand would pile goods into a husk forever, so
                // the opportunity signal is cut, not the route.
                destAbandoned = Boolean(destTown?.abandoned);
                if (destTown?.market?.getQuote) destMarket = destTown.market;
            }
            if (destMarket && !destAbandoned) {
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
        // Slice AD: the ranking score is the routing-owned base plus
        // the canonical market/reputation adjustments (opportunity and
        // reliability have no routing equivalent and stay here).
        const score = routingBaseCost - opportunityBonus + tradeReliabilityPenalty;
        return {
            route,
            index,
            score,
            // R7 (V8 audit F4): the ranking carries a snapshot, not
            // a live handle into merchant.routeBeliefs. Readers of
            // the decision (WHY audit, rejected list) must not be
            // able to mutate the merchant's belief store.
            belief: { perceivedDanger: belief.perceivedDanger, confidence: belief.confidence },
            cargoLossRisk,
            distanceCost,
            dangerPenalty,
            familiarityBonus,
            opportunityBonus,
            destinationTownId,
            tradeReliability,
            tradeReliabilityPenalty,
            reliabilityObserved,
            routingBaseCost,
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
 * E3 — endogenous cargo selection. The merchant compares the
 * destination market's shortage against its local market's shortage
 * per kind and carries the good the destination needs most *relative
 * to home abundance*: score(kind) = destShortage - localShortage.
 * The destination-quote read is the same information boundary the
 * route opportunityBonus already uses (established contract); the
 * local read is co-located observation. A switch needs a margin
 * (0.2, anti-oscillation) and a real local surplus to buy from
 * (supply - demand >= 1). Ties hold the current cargo. Without a
 * destination or markets, the hold is kept: selection never invents
 * cargo.
 */
export function selectMerchantCargoKind(merchant, { world = null, destinationTownId = null } = {}) {
    const hold = merchant?.cargoKind ?? 'food';
    const readMarket = (townId) => {
        if (!townId || !world?.towns?.get) return null;
        const town = world.towns.get(townId);
        return town?.market?.getQuote ? town.market : null;
    };
    const localMarket = readMarket(merchant?.location);
    const destMarket = readMarket(destinationTownId);
    const kinds = [];
    if (localMarket) {
        const town = world.towns.get(merchant.location);
        for (const kind of Object.keys(town?.consumes ?? {})) if (!kinds.includes(kind)) kinds.push(kind);
        for (const kind of Object.keys(town?.produces ?? {})) if (!kinds.includes(kind)) kinds.push(kind);
    }
    if (!kinds.includes(hold)) kinds.push(hold);
    // E4: husk destinations score zero shortage (same ghost-demand
    // cut as the route opportunityBonus above).
    const destTown = destinationTownId && world?.towns?.get
        ? world.towns.get(destinationTownId) : null;
    const destGhost = Boolean(destTown?.abandoned);
    const shortageOf = (market, kind) => {
        if (!market) return 0;
        if (market === destMarket && destGhost) return 0;
        try {
            const quote = market.getQuote(kind);
            return Number.isFinite(quote?.shortage) ? clamp01(quote.shortage) : 0;
        } catch {
            return 0;
        }
    };
    const surplusOf = (market, kind) => {
        if (!market) return 0;
        try {
            const quote = market.getQuote(kind);
            if (!quote || !Number.isFinite(quote.supply) || !Number.isFinite(quote.demand)) return 0;
            return quote.supply - quote.demand;
        } catch {
            return 0;
        }
    };
    const scores = {};
    for (const kind of kinds) {
        const localShortage = shortageOf(localMarket, kind);
        const destShortage = shortageOf(destMarket, kind);
        scores[kind] = {
            localShortage,
            destShortage,
            score: destShortage - localShortage,
            localSurplus: surplusOf(localMarket, kind),
        };
    }
    let best = hold;
    for (const kind of kinds) {
        if ((scores[kind]?.score ?? -Infinity) > (scores[best]?.score ?? -Infinity)) best = kind;
    }
    const margin = (scores[best]?.score ?? 0) - (scores[hold]?.score ?? 0);
    const switched = best !== hold && margin > 0.2 && (scores[best]?.localSurplus ?? 0) >= 1;
    return {
        cargoKind: switched ? best : hold,
        switched,
        hold,
        best,
        margin,
        scores,
    };
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
    // R1 (V8 audit F1-MERCHANT-PANOPTICON): observation requires a
    // legal channel. The merchant learns about bandit activity ONLY
    // from bandit events it can legally observe: BANDIT_ATTACK /
    // BANDIT_RELOCATION on its currently selected route (canObserve).
    // The previous code scanned world.bandits[].roadId directly gated
    // by a bare accuracy coin flip, so a merchant at north learned a
    // distant bandit's road with p=0.5 — panopticon with noise, not
    // partial observability. A quiet bandit (no events) stays hidden;
    // perceptionAccuracy remains the success flip once the gate passes.
    // Slice F — capture observation rng draws and belief snapshot for WHY
    const whyObservations = [];
    const whyRngDraws = [];
    const beliefsSnapshotBefore = JSON.parse(JSON.stringify(merchant.routeBeliefs || {}));
    const accuracy = Number.isFinite(merchant.perceptionAccuracy)
        ? clamp01(merchant.perceptionAccuracy) : 0.5;
    if (rng) {
        // Fresh evidence window: this tick and the previous one, so an
        // attack that resolves after the merchant's decision tick is
        // learnable on the next tick. Older history stays in the store
        // (it was learned or missed when fresh); re-rolling it every
        // tick would let accuracy-1 merchants time-travel.
        // E11: non-derived convoy ambushes are bandit activity on
        // the merchant's road too. Derived views share their
        // incident with a BANDIT_ATTACK (deduped by seenRoads), so
        // including them cannot double-count within a tick.
        const banditEvents = getWorldEvents(world, {
            types: ['BANDIT_ATTACK', 'BANDIT_RELOCATION', 'CONVOY_AMBUSH'],
            minTick: tick - 1,
            maxTick: tick,
        });
        const seenRoads = new Set();
        for (const event of banditEvents) {
            const roadId = event?.roadId
                ?? event?.relocation?.roadId
                ?? event?.relocation?.to
                ?? event?.to;
            if (!roadId || seenRoads.has(roadId)) continue;
            // The gate: only the merchant's own road is observable.
            if (!canObserve(merchant, event, world)) continue;
            seenRoads.add(roadId);
            const banditId = event?.banditId ?? event?.actorId ?? null;
            const draw = rng();
            whyRngDraws.push({ banditId, roadId, draw, accuracy, observed: draw < accuracy });
            if (draw < accuracy) {
                // Successful observation. The merchant's
                // perceivedDanger for the event road jumps
                // to a moderate level (not a hard override,
                // just a "bandit activity here" signal).
                if (merchant.routeBeliefs && merchant.routeBeliefs[roadId]) {
                    const current = merchant.routeBeliefs[roadId].perceivedDanger ?? 0.5;
                    // Add observation noise: 0.7 ± 0.1 so actualDanger not injected exactly
                    const noise = (rng() - 0.5) * 0.2;
                    whyRngDraws.push({ banditId, roadId, draw: noise, kind: 'noise' });
                    const observedDanger = clamp01(0.7 + noise);
                    merchant.routeBeliefs[roadId].perceivedDanger = clamp01(Math.max(current, observedDanger));
                    merchant.routeBeliefs[roadId].confidence = clamp01(
                        (merchant.routeBeliefs[roadId].confidence ?? 0.5) + 0.2
                    );
                    merchant.routeBeliefs[roadId].source = 'observation';
                    whyObservations.push({ banditId, roadId, observedDanger });
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
    // E10: heat cools 0.95/tick on the same elapsed-tick basis as
    // recency (V8 checkpoint §8: wall ticks, not invocations).
    // Quiet bandits go cold; raiding re-marks them above.
    if (Number.isFinite(bandit.heat) && bandit.heat > 0) {
        const lastHeatTick = Number.isFinite(bandit.lastHeatTick) ? bandit.lastHeatTick : tick;
        const heatElapsed = Math.max(0, tick - lastHeatTick);
        if (heatElapsed > 0) {
            bandit.heat = Math.max(0, bandit.heat * Math.pow(0.95, heatElapsed));
            bandit.lastHeatTick = tick;
        }
    } else if (bandit.heat !== undefined) {
        bandit.lastHeatTick = tick;
    }
    for (const merchant of (world.merchants || [])) {
        const route = merchant.selectedRoute || merchant.lastRoute;
        // R1 (V8 audit F2-BANDIT-PANOPTICON): co-location boundary. The
        // bandit observes only merchants traveling its own road — it
        // counts passersby, it does not scan distant itineraries. The
        // previous code learned every merchant's route with p=0.5
        // regardless of distance.
        // R1b (review finding 9): gate before the draw so distant
        // merchants do not shift the rng stream for co-located ones.
        if (!route || route !== bandit.roadId) continue;
        if (rng() >= banditAccuracy) continue; // observation failed
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
        // Slice AF: storms suppress the hunt — a stormed road pays
        // distance/(distance + weatherCost) of its calm payoff
        // (severity 1 halves it). Calm roads carry weatherCost 0,
        // so the factor is exactly 1 and legacy behavior is preserved.
        const distance = Number(route.distance) || 0;
        const weatherCost = Number(route.weatherCost) || 0;
        const weatherFactor = distance > 0 ? distance / (distance + weatherCost) : 1;
        const payoff = belief.estimatedTraffic * (bandit.cargoValuePerMerchant ?? 10)
            * belief.recency * seasonMod * wildlifeFactor * weatherFactor;
        return { routeId: route.id, payoff, recency: belief.recency, seasonMod, wildlifeFactor, weatherFactor };
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
    // R7 (V8 audit MAT-002): the convoy is interceptable too. A
    // CONVOY_AMBUSH is a loss-bearing attack view on the deployed
    // road; without this the convoy has no recoverability while
    // lone merchants do. Derived convoy views (the direct attack
    // already debited) carry no loss and are skipped.
    const eventsThisTick = getWorldEvents(world, {
        types: ['BANDIT_ATTACK', 'CONVOY_AMBUSH'],
        tick,
    }).filter(e => e.roadId === patrol.deployedRoute
        && !(e.type === 'CONVOY_AMBUSH' && e.derived === true));
    if (eventsThisTick.length === 0) return { ok: true, events: [] };
    // R7 (V8 audit MAT-003): one interception per opportunity. Two
    // views of the same incident share an attackOpportunityId, and
    // two patrols may sweep the same road on the same tick. The
    // first interception wins; the rest skip so recovered cargo is
    // never credited twice.
    if (!(world.interceptedAttackIds instanceof Set)) {
        world.interceptedAttackIds = new Set(world.interceptedAttackIds ?? []);
    }
    const produced = [];
    const claimedThisTick = new Set();
    for (const attack of eventsThisTick) {
        const opportunityKey = attack.attackOpportunityId ?? attack.eventId ?? null;
        if (opportunityKey !== null
            && (world.interceptedAttackIds.has(opportunityKey) || claimedThisTick.has(opportunityKey))) continue;
        if (opportunityKey !== null) claimedThisTick.add(opportunityKey);
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
        // Slice AG: storms blind the patrol — the deployed road's
        // weatherCost scales the whole effective rate by the same
        // distance/(distance + weatherCost) factor the bandit hunt
        // uses (severity 1 halves it). Calm roads carry 0, so the
        // factor is exactly 1. The rate scales; no extra RNG draw,
        // so the encounter stream alignment is untouched.
        const deployedRoute = (world.routes ?? []).find(route => route.id === patrol.deployedRoute);
        const patrolWeatherCost = Number(deployedRoute?.weatherCost) || 0;
        const patrolDistance = Number(deployedRoute?.distance) || 0;
        const weatherFactor = patrolDistance > 0 ? patrolDistance / (patrolDistance + patrolWeatherCost) : 1;
        // E6: road familiarity (where) is independent of lawfulness
        // (who). Exposures on the deployed route count toward a
        // bounded bonus: 10 exposures to full (+0.2). Fresh roads
        // (and older saves without the map) contribute exactly 0,
        // so single-attack fixtures behave exactly as before.
        if (!patrol.roadFamiliarity || typeof patrol.roadFamiliarity !== 'object') patrol.roadFamiliarity = {};
        const roadSeen = Math.max(0, Number(patrol.roadFamiliarity[patrol.deployedRoute]) || 0);
        const familiarityBonus = Math.min(1, roadSeen / 10) * 0.2;
        // E10: notoriety follows the bandit, not the road. A hot
        // bandit is easier to spot anywhere (+0.3 at full heat).
        // Unknown attackers (no bandit object) contribute exactly 0,
        // so factionless-fixture behavior is unchanged.
        const banditHeat = Math.min(1, Math.max(0, Number(attacker?.heat) || 0));
        const heatBonus = banditHeat * 0.3;
        const effectiveDetectionRate = clamp01((patrol.detectionRate + lawfulnessAttentionBonus + familiarityBonus + heatBonus) * weatherFactor);
        const enforcementWhy = {
            violatorFactionId,
            lawfulnessObserverId: patrolFaction?.id ?? null,
            lawfulness,
            lawfulnessObserved,
            lawfulnessAttentionBonus,
            roadFamiliarity: roadSeen,
            familiarityBonus,
            banditHeat,
            heatBonus,
            baseDetectionRate: patrol.detectionRate,
            weatherCost: patrolWeatherCost,
            weatherFactor,
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
                if (opportunityKey !== null) world.interceptedAttackIds.add(opportunityKey);
                // Reverse the cargo loss: restore the lost cargo to the
                // merchant (cargo was set to 0 by resolveBanditAttack).
                // R7 (MAT-002): a convoy ambush debited the group and
                // redistributed the remainder evenly, so the recovery
                // returns the loss split evenly across the member list.
                const recoveredMembers = attack.type === 'CONVOY_AMBUSH' && Array.isArray(attack.merchantIds)
                    ? attack.merchantIds
                    : (attack.merchantId ? [attack.merchantId] : []);
                const memberShare = recoveredMembers.length > 0 ? (attack.lost || 0) / recoveredMembers.length : 0;
                let recoveryKind = 'food';
                for (const memberId of recoveredMembers) {
                    const member = (world.merchants || []).find(m => m.id === memberId);
                    if (!member) continue;
                    member.cargo = (member.cargo || 0) + memberShare;
                    recoveryKind = member.cargoKind ?? recoveryKind;
                    // LIVE_CONSUMER wire: a successful interception is
                    // a positive observation for the merchant about
                    // the deployed route. Lower the merchant's
                    // perceivedDanger for that route (since the route
                    // is being patrolled) and bump confidence.
                    if (member.routeBeliefs && member.routeBeliefs[patrol.deployedRoute]) {
                        const current = member.routeBeliefs[patrol.deployedRoute].perceivedDanger ?? 0.5;
                        member.routeBeliefs[patrol.deployedRoute].perceivedDanger = clamp01(current * 0.7);
                        member.routeBeliefs[patrol.deployedRoute].confidence = clamp01(
                            (member.routeBeliefs[patrol.deployedRoute].confidence ?? 0.5) + 0.1
                        );
                        member.routeBeliefs[patrol.deployedRoute].source = 'patrol_interception';
                    }
                }
                // R2-W1: interception reverses the loss-sink booking
                // made at attack time — the cargo is recovered, not
                // destroyed. Without this the global mass identity
                // would double-count the recovered material.
                if (world.transitLoss && typeof world.transitLoss === 'object' && (attack.lost || 0) > 0) {
                    world.transitLoss[recoveryKind] = Math.max(0, (Number(world.transitLoss[recoveryKind]) || 0) - (attack.lost || 0));
                }
                const interceptEvent = {
                    type: 'PATROL_INTERCEPTION',
                    tick,
                    patrolId,
                    attackOpportunityId: attack.attackOpportunityId,
                    merchantId: attack.merchantId ?? recoveredMembers[0] ?? null,
                    ...(recoveredMembers.length > 1 ? { merchantIds: [...recoveredMembers] } : {}),
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
        // E6: every worked exposure teaches the road, hit or miss.
        // Counted after the roll so the current attack is judged on
        // prior familiarity, not its own. (Already-claimed attacks
        // skip the loop above and teach nothing.)
        patrol.roadFamiliarity[patrol.deployedRoute] = roadSeen + 1;
    }
    return { ok: true, events: produced };
}
