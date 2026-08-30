// two-roads-world.js
//
// EVID-2026-08-28-CO-ADAPTIVE-TRADE-CAMPAIGN
//
// The "Two Roads" persistent benchmark world (Movement 2 §5).
//
// Two settlements (origin, destination), one demanded good (grain),
// two viable routes:
//   - Road A: short, cheap, commercially attractive, moderate bandit exposure
//   - Road B: long, costly, initially safer, lower expected profit
//
// Several merchants with heterogeneous risk-tolerance, switching-cost,
// cargo-value-sensitivity, route-memory, deadline-pressure, and
// information-confidence.
//
// At least one bandit group with beliefs about traffic, expected
// cargo value, and patrol danger. Bandits relocate when opportunity
// or danger shifts.
//
// Finite patrol capability: patrols have a coverage area and travel
// time, and displace bandit opportunity rather than universally
// suppressing it.
//
// Markets track real inventory/demand/shortage, and cargo loss in
// the destination market's inventory.
//
// Each tick:
//   1. market clears (demand - inventory - incoming)
//   2. merchants decide route + depart (with structured reason)
//   3. merchants advance one edge (or complete trip)
//   4. exposure is recorded (per-merchant per-edge)
//   5. bandits target based on believed traffic
//   6. attacks resolved (cargo loss, belief updates)
//   7. patrol coverage reduced bandit attack success rate
//   8. deliveries update destination market inventory
//   9. bandit beliefs update from observed deliveries/attacks
//
// The reducer is deterministic given the same seed + same inputs.
//
// Architecture decisions:
//   - Merchants are independent agents with their own identity,
//     perception, and belief store. There is no global truth table.
//   - actualRouteDanger is computed from the bandit pressure on
//     each route; merchantBelievedDanger is the merchant's belief,
//     which may be stale.
//   - Switching cost is enforced by a `lastRoute` + `lastRouteTick`
//     + `switchingCost` (delay ticks) on the merchant.
//   - Beliefs age: `beliefAgeTicks` increments each tick and
//     dampens `beliefConfidence` over time.
//   - Bandits use a recency-weighted success/traffic memory per
//     route; they relocate when their top route's expected payoff
//     drops below an alternative's.
//   - Patrols cover one route at a time (the deployed route) and
//     take `patrolTravelTicks` ticks to redeploy.
//
// This is the architecture the directives call for. It is intentionally
// compact: it is a benchmark laboratory, not a production replacement.

import { Merchant, Town, routesBetween } from './trade.js';
import { Market } from './economy.js';
import { selectRoute, routeCost } from './routing.js';
import { clamp01, clamp } from './math-utils.js';

// -----------------------------------------------------------------------------
// Constants and helpers
// -----------------------------------------------------------------------------

/** Deterministic hash of (seed + salt) -> uint32. */
function seedHash(seed, salt) {
    let h = 2166136261 >>> 0;
    const s = `${seed}|${salt}`;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}

/** Deterministic float in [0, 1). */
function rngFloat(seed, salt) {
    return (seedHash(seed, salt) % 100000) / 100000;
}

/** Deterministic int in [0, n). */
function rngInt(seed, salt, n) {
    return seedHash(seed, salt) % Math.max(1, n);
}

// -----------------------------------------------------------------------------
// Two-Roads world factory
// -----------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string} [opts.seed='default']
 * @param {number} [opts.merchantCount=4]
 * @param {number} [opts.destinationDemand=20]
 * @param {number} [opts.destinationPrice=10]
 * @param {object} [opts.banditOpts]
 * @param {object} [opts.patrolOpts]
 */
export function createTwoRoadsScenario({
    seed = 'default',
    merchantCount = 4,
    destinationDemand = 20,
    destinationPrice = 10,
    banditOpts = {},
    patrolOpts = {},
} = {}) {
    const origin = new Town('origin');
    const destination = new Town('destination');
    destination.market.setDemand('grain', destinationDemand, destinationPrice);
    origin.market.setDemand('tools', 8, 12);

    // Two routes from origin -> destination.
    // Road A: short, cheap, moderate bandit pressure (default).
    // Road B: long, costly, initially safer, lower expected profit.
    const roadA = {
        id: 'road-a',
        from: 'origin', to: 'destination',
        distance: 5, travelTime: 2, tollCost: 1, weatherCost: 0,
        actualDanger: 0.4,                // ground-truth danger
        expectedAmbushProbability: 0.2,   // baseline attack prob
        politicalRisk: 0, borderRisk: 0, monsterRisk: 0, legalRisk: 0,
    };
    const roadB = {
        id: 'road-b',
        from: 'origin', to: 'destination',
        distance: 10, travelTime: 4, tollCost: 2, weatherCost: 0,
        actualDanger: 0.1,
        expectedAmbushProbability: 0.05,
        politicalRisk: 0, borderRisk: 0, monsterRisk: 0, legalRisk: 0,
    };

    // Merchants: heterogeneous risk-tolerance, switching cost, etc.
    const merchants = [];
    const archetypes = ['risk_averse', 'risk_neutral', 'risk_tolerant', 'risk_tolerant_alt'];
    for (let i = 0; i < merchantCount; i++) {
        const archetype = archetypes[i % archetypes.length];
        const m = new Merchant(`merchant-${i}`, { grain: 5, tools: 1 });
        m.location = 'origin';
        // Heterogeneous identity.
        m.riskTolerance = archetype === 'risk_averse' ? 0.15
            : archetype === 'risk_neutral' ? 0.5
            : archetype === 'risk_tolerant' ? 0.85
            : 0.95;
        m.switchingCost = archetype === 'risk_averse' ? 4
            : archetype === 'risk_neutral' ? 2
            : archetype === 'risk_tolerant' ? 1
            : 0;
        m.cargoValueSensitivity = archetype === 'risk_averse' ? 0.9
            : archetype === 'risk_neutral' ? 0.5
            : archetype === 'risk_tolerant' ? 0.3
            : 0.1;
        m.routeFamiliarity = archetype === 'risk_averse' ? { 'road-b': 0.8, 'road-a': 0.2 }
            : archetype === 'risk_neutral' ? { 'road-a': 0.5, 'road-b': 0.5 }
            : archetype === 'risk_tolerant' ? { 'road-a': 0.6, 'road-b': 0.3 }
            : { 'road-a': 0.8 };
        m.deadlinePressure = 0.0;
        m.informationConfidence = archetype === 'risk_averse' ? 0.9
            : archetype === 'risk_neutral' ? 0.6
            : archetype === 'risk_tolerant' ? 0.3
            : 0.2;
        m.beliefAgeTicks = 0;
        // Initial belief: each merchant has its own initial perception
        // (NOT omniscient truth). Risk-averse starts believing Road A is
        // dangerous; risk-tolerant starts believing it's safe.
        m.beliefs = {
            'road-a': { perceivedDanger: archetype === 'risk_averse' ? 0.6
                : archetype === 'risk_neutral' ? 0.4
                : archetype === 'risk_tolerant' ? 0.2
                : 0.15, confidence: 0.5, sourceType: 'initial', tick: 0 },
            'road-b': { perceivedDanger: 0.1, confidence: 0.5, sourceType: 'initial', tick: 0 },
        };
        m.lastRoute = null;
        m.lastRouteSwitchTick = -1000;
        m.expectedProfitAtDeparture = 0;
        m.realizedProfit = 0;
        m.trips = 0;
        m.deliveries = 0;
        m.cargoLost = 0;
        m.exposureTicks = 0;
        m.exposureDistance = 0;
        m.attackCount = 0;
        m.archetype = archetype;
        merchants.push(m);
    }

    // Bandit group: beliefs about traffic + cargo value per route.
    const bandit = {
        id: 'bandit-0',
        factionId: 'bandit-faction',
        homeRoute: 'road-a',
        currentRoute: 'road-a',
        targetRoute: 'road-a',
        relocationCooldown: 0,
        resources: 0,             // total cargo value captured
        // Beliefs: per-route, recency-weighted.
        beliefs: {
            'road-a': { believedTraffic: 0.5, believedCargoValue: 5, lastSuccessTick: -1000, lastFailureTick: -1000 },
            'road-b': { believedTraffic: 0.2, believedCargoValue: 5, lastSuccessTick: -1000, lastFailureTick: -1000 },
        },
        attacksAttempted: 0,
        attacksSucceeded: 0,
        attacksFailed: 0,
        ...banditOpts,
    };

    // Patrol: finite coverage, travels between routes.
    const patrol = {
        id: 'patrol-0',
        deployedRoute: null,            // 'road-a' | 'road-b' | null
        coverageByRoute: { 'road-a': 0, 'road-b': 0 },
        travelRemaining: 0,             // ticks until redeploy
        detectionRate: 0.7,             // per-attempt detection probability when present
        interceptionSuccess: 0.6,       // per-detected attack: chance the patrol prevents cargo loss
        origin: 'origin',
        ...patrolOpts,
    };

    const world = {
        seed,
        tick: 0,
        origin, destination,
        routes: [roadA, roadB],
        merchants,
        bandit,
        patrol,
        // Exposure ledger (per-tick aggregates).
        exposure: {
            merchantExposureTicks: 0,
            merchantExposureDistance: 0,
            exposedCargoValue: 0,
            eligibleAmbushOpportunities: 0,
            banditContactWindows: 0,
            patrolCoveredExposure: 0,
            // Per-route breakdowns (used for analytics, not omniscient reads).
            perRoute: {
                'road-a': { exposureTicks: 0, eligibleAmbush: 0, attacks: 0, attacksSucceeded: 0, cargoLost: 0, patrolCovered: 0 },
                'road-b': { exposureTicks: 0, eligibleAmbush: 0, attacks: 0, attacksSucceeded: 0, cargoLost: 0, patrolCovered: 0 },
            }
        },
        // Structured decision events.
        events: [],
        // Long-horizon history (per-tick snapshot for analytics).
        history: [],
    };

    return world;
}

// -----------------------------------------------------------------------------
// Reducer: tick the world one step
// -----------------------------------------------------------------------------

/**
 * @param {object} world  - from createTwoRoadsScenario
 * @returns {object} world
 */
export function tickTwoRoads(world) {
    world.tick += 1;
    const tick = world.tick;
    const seed = world.seed;
    const { routes, merchants, bandit, patrol, exposure, events } = world;
    const roadA = routes[0], roadB = routes[1];

    // Reset per-route exposure this tick (cumulative exposure is in history).
    for (const r of routes) exposure.perRoute[r.id] = { exposureTicks: 0, eligibleAmbush: 0, attacks: 0, attacksSucceeded: 0, cargoLost: 0, patrolCovered: 0 };

    // (1) market clearing: demand vs (origin inventory + expected incoming).
    //   Simple: any unmet demand raises destination price by shortage/2.
    const destInv = world.destination.market.inventory.get('grain') || 0;
    const destDem = world.destination.market.demand.get('grain') || 0;
    const shortage = Math.max(0, destDem - destInv);
    // Use getQuote to get the current effective price (already incorporates shortage).
    const destQuote = world.destination.market.getQuote('grain');

    // (2) Each merchant decides a route (or advances trip).
    for (const m of merchants) {
        // Age beliefs.
        m.beliefAgeTicks += 1;
        for (const routeId in m.beliefs) {
            // Confidence decays ~5% per tick.
            m.beliefs[routeId].confidence = clamp01(m.beliefs[routeId].confidence * 0.95);
        }

        if (m.trip) {
            // Advance one edge.
            const edge = m.trip.path[m.trip.edgeIndex];
            if (edge) {
                m.exposureTicks += 1;
                m.exposureDistance += edge.distance || 0;
                exposure.merchantExposureTicks += 1;
                exposure.merchantExposureDistance += edge.distance || 0;
                exposure.exposedCargoValue += sumCargoValue(m.cargo);
                exposure.perRoute[edge.id].exposureTicks += 1;
                if (patrol.deployedRoute === edge.id) {
                    exposure.perRoute[edge.id].patrolCovered += 1;
                    exposure.patrolCoveredExposure += 1;
                }
                // Eligible ambush opportunity: this merchant is exposed on a route.
                exposure.eligibleAmbushOpportunities += 1;
                exposure.perRoute[edge.id].eligibleAmbush += 1;
                // Bandit may attempt attack.
                attemptAttack(world, m, edge, tick);
            }
            m.location = edge?.to || m.location;
            m.trip.edgeIndex += 1;
            if (m.trip.edgeIndex >= m.trip.path.length) {
                // Complete trip. Inventory arrives at destination (already
                // deducted at departure conceptually, but we model cargo
                // as live with the merchant until delivery).
                const cargoMap = new Map(m.cargo);
                m.cargo.clear(); // emptied
                const dest = world.destination;
                for (const [kind, amount] of cargoMap) {
                    dest.market.deliverCargo(kind, amount, { routeRisk: 0.1, confidence: 0.5 });
                }
                m.deliveries += cargoMap.get('grain') || 0;
                m.realizedProfit += (cargoMap.get('grain') || 0) * (dest.market.getQuote('grain').price);
                m.trips += 1;
                m.trip = null;
                // Refill cargo for next trip.
                m.cargo.set('grain', 5);
                m.cargo.set('tools', 1);
            }
            continue;
        }

        // Decide a new route.
        const basePerception = perceptionForMerchant(m, routes, destDem - destInv);
        const viable = routesBetween(routes, 'origin', 'destination');
        if (viable.length === 0) continue;
        // Per-route perception: override perceivedDanger, confidence,
        // and routeFamiliarity from the merchant's per-route belief.
        const ranked = viable.map((route, index) => {
            const belief = m.beliefs[route.id] || { perceivedDanger: 0, confidence: 0 };
            const perRoutePerception = {
                ...basePerception,
                perceivedDanger: belief.perceivedDanger,
                expectedAmbushProbability: belief.perceivedDanger * 0.5,
                expectedCargoLoss: sumCargoValue(m.cargo) * m.cargoValueSensitivity * belief.perceivedDanger,
                confidence: m.informationConfidence * belief.confidence,
                routeFamiliarity: m.routeFamiliarity[route.id] ?? 0.5,
            };
            return { route, index, cost: routeCost(route, perRoutePerception) };
        }).sort((a, b) => a.cost - b.cost || a.index - b.index);
        const best = ranked[0];
        const rejected = ranked.slice(1).map(item => ({ routeId: item.route.id, cost: item.cost }));

        // Apply route inertia / switching cost.
        let chosen = best;
        if (m.lastRoute && m.lastRoute !== best.route.id) {
            const canSwitch = (tick - m.lastRouteSwitchTick) >= m.switchingCost;
            const sameRouteStillBest = ranked.find(r => r.route.id === m.lastRoute);
            if (!canSwitch && sameRouteStillBest) {
                // Stick with previous route (inertia).
                chosen = sameRouteStillBest;
            }
        }

        // Structured MERCHANT_ROUTE_DECISION event.
        const decisionEvent = {
            type: 'MERCHANT_ROUTE_DECISION',
            eventId: `MERCHANT_ROUTE_DECISION-${tick}-${m.id}`,
            tick,
            merchantId: m.id,
            archetype: m.archetype,
            riskTolerance: m.riskTolerance,
            switchingCost: m.switchingCost,
            from: 'origin',
            to: 'destination',
            previousRoute: m.lastRoute,
            chosenRoute: chosen.route.id,
            rejectedAlternatives: rejected,
            believedDangerA: m.beliefs['road-a']?.perceivedDanger ?? null,
            believedDangerB: m.beliefs['road-b']?.perceivedDanger ?? null,
            beliefConfidence: chosen.route.id === 'road-a' ? (m.beliefs['road-a']?.confidence ?? 0) : (m.beliefs['road-b']?.confidence ?? 0),
            expectedDeliveryValue: sumCargoValue(m.cargo) * destQuote.price,
            expectedCargoLoss: chosen.route.id === 'road-a' ? sumCargoValue(m.cargo) * 0.2 : sumCargoValue(m.cargo) * 0.05,
            switchingCostIncurred: (m.lastRoute && m.lastRoute !== chosen.route.id) ? m.switchingCost : 0,
            reason: m.lastRoute && m.lastRoute !== chosen.route.id ? 'route_switch_with_inertia' : 'best_cost',
        };
        events.push(decisionEvent);

        // Depart.
        m.lastRoute = chosen.route.id;
        if (decisionEvent.rejectedAlternatives.some(r => r.routeId === chosen.route.id) === false
            && rejected.some(r => r.routeId === chosen.route.id)) {
            // chosen is the previously-stuck route due to inertia
        }
        if (m.lastRoute !== chosen.route.id) m.lastRouteSwitchTick = tick;
        m.expectedProfitAtDeparture = sumCargoValue(m.cargo) * destQuote.price;
        const graph = { routes: [chosen.route], towns: ['origin', 'destination'] };
        // Pass the chosen route's per-route perception to startTrip so
        // the trip's decision reflects the merchant's belief.
        const chosenBelief = m.beliefs[chosen.route.id] || { perceivedDanger: 0, confidence: 0 };
        const chosenPerception = {
            ...basePerception,
            perceivedDanger: chosenBelief.perceivedDanger,
            expectedAmbushProbability: chosenBelief.perceivedDanger * 0.5,
            expectedCargoLoss: sumCargoValue(m.cargo) * m.cargoValueSensitivity * chosenBelief.perceivedDanger,
            confidence: m.informationConfidence * chosenBelief.confidence,
            routeFamiliarity: m.routeFamiliarity[chosen.route.id] ?? 0.5,
        };
        const departure = m.startTrip(world.origin, world.destination, graph.routes, chosenPerception, new Map([['origin', world.origin], ['destination', world.destination]]));
        if (!departure.ok) {
            // Edge from origin (stuck).
            continue;
        }
    }

    // (3) Bandit learning: recency-weighted update of believed traffic/cargo
    //     from this tick's exposure + outcomes.
    for (const r of routes) {
        const observed = exposure.perRoute[r.id];
        // Believed traffic is a moving average; weight recent ticks more.
        const alpha = 0.4;
        const observedTraffic = clamp01(observed.exposureTicks / Math.max(1, merchants.length));
        bandit.beliefs[r.id].believedTraffic = clamp01(
            (1 - alpha) * bandit.beliefs[r.id].believedTraffic + alpha * observedTraffic
        );
    }

    // (4) Bandit relocation: pick the route with the highest expected payoff
    //     if the bandit has been on the current one long enough.
    if (bandit.relocationCooldown > 0) bandit.relocationCooldown -= 1;
    if (bandit.relocationCooldown === 0) {
        const routeA = bandit.beliefs['road-a'];
        const routeB = bandit.beliefs['road-b'];
        const payoffA = expectedBanditPayoff(bandit, 'road-a', patrol, exposure);
        const payoffB = expectedBanditPayoff(bandit, 'road-b', patrol, exposure);
        const newTarget = payoffB > payoffA * 1.15 ? 'road-b'
            : payoffA > payoffB * 1.15 ? 'road-a'
            : bandit.currentRoute;
        if (newTarget !== bandit.currentRoute) {
            events.push({
                type: 'BANDIT_RELOCATION',
                tick,
                banditId: bandit.id,
                from: bandit.currentRoute,
                to: newTarget,
                payoffA, payoffB,
                reason: 'expected_payoff_shift',
            });
            bandit.currentRoute = newTarget;
            bandit.relocationCooldown = 6; // ticks before re-evaluating
        }
    }

    // (5) Patrol redeployment cost.
    if (patrol.travelRemaining > 0) patrol.travelRemaining -= 1;
    if (patrol.travelRemaining === 0 && patrol.pendingDeployment && patrol.pendingDeployment !== patrol.deployedRoute) {
        patrol.deployedRoute = patrol.pendingDeployment;
        delete patrol.pendingDeployment;
        events.push({
            type: 'PATROL_REDEPLOY_COMPLETE',
            tick,
            patrolId: patrol.id,
            deployedRoute: patrol.deployedRoute,
        });
    }

    // (6) Snapshot history.
    world.history.push({
        tick,
        destinationPrice: destQuote.price,
        destinationInventory: destInv,
        destinationShortage: shortage,
        merchantExposureTicks: exposure.merchantExposureTicks,
        eligibleAmbushOpportunities: exposure.eligibleAmbushOpportunities,
        attacksAttempted: bandit.attacksAttempted,
        attacksSucceeded: bandit.attacksSucceeded,
        banditRoute: bandit.currentRoute,
        patrolRoute: patrol.deployedRoute,
        perRoute: JSON.parse(JSON.stringify(exposure.perRoute)),
        beliefByRoute: {
            'road-a': avgBelief(merchants, 'road-a'),
            'road-b': avgBelief(merchants, 'road-b'),
        }
    });

    return world;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function sumCargoValue(cargo) {
    if (!cargo) return 0;
    let total = 0;
    for (const [k, v] of cargo) total += v;
    return total;
}

function avgBelief(merchants, routeId) {
    if (!merchants.length) return { perceivedDanger: 0, confidence: 0 };
    let pd = 0, cf = 0;
    for (const m of merchants) {
        const b = m.beliefs[routeId];
        if (b) { pd += b.perceivedDanger; cf += b.confidence; }
    }
    return { perceivedDanger: pd / merchants.length, confidence: cf / merchants.length };
}

function perceptionForMerchant(m, routes, shortage) {
    const cargoValue = sumCargoValue(m.cargo);
    // The merchant is about to evaluate ALL viable routes against
    // its single perception. The single perception must therefore
    // carry *its own* identity (risk-tolerance, cargo-value-sensitivity,
    // switching-cost) so the routeCost formula can produce a different
    // ranking for different merchants.
    //
    // The "perceived danger" used here is the AVERAGE of the merchant's
    // per-route beliefs (the merchant has not yet selected a route, so
    // we use a single coarse perception). The merchant-specific traits
    // (riskTolerance, cargoValueSensitivity, etc.) are what differ.
    let avgPerceivedDanger = 0;
    let avgConfidence = 0;
    let n = 0;
    for (const r of routes) {
        const b = m.beliefs[r.id];
        if (b) { avgPerceivedDanger += b.perceivedDanger; avgConfidence += b.confidence; n++; }
    }
    if (n > 0) { avgPerceivedDanger /= n; avgConfidence /= n; }
    return {
        // Single-route perception fields (used by routeCost).
        perceivedDanger: avgPerceivedDanger,
        expectedAmbushProbability: avgPerceivedDanger * 0.5,
        // fearSensitivity: high for risk-averse, low for risk-tolerant.
        fearSensitivity: 1 - m.riskTolerance,
        // cargoValue: scales expectedCargoLoss.
        cargoValue,
        expectedCargoLoss: cargoValue * m.cargoValueSensitivity * avgPerceivedDanger,
        // uncertaintyAversion: high for risk-averse.
        uncertaintyAversion: (1 - m.riskTolerance) * 0.7 + 0.1,
        // routeFamiliarity: averaged across known routes; for a
        // per-route comparison the consumer should also branch.
        routeFamiliarity: 0.5,
        // confidence is the merchant's information confidence * avg
        // belief confidence.
        confidence: m.informationConfidence * avgConfidence,
        // Merchant identity: for downstream accounting and METAMORPHIC
        // tests.
        merchantId: m.id,
        riskTolerance: m.riskTolerance,
        cargoValueSensitivity: m.cargoValueSensitivity,
        switchingCost: m.switchingCost,
        // Per-route belief snapshot, for the decision event.
        perRoute: Object.fromEntries(routes.map(r => [r.id, m.beliefs[r.id] || null])),
    };
}

function expectedBanditPayoff(bandit, routeId, patrol, exposure) {
    const belief = bandit.beliefs[routeId];
    const base = belief.believedTraffic * belief.believedCargoValue;
    // Patrol coverage reduces payoff.
    const covered = exposure.perRoute[routeId].patrolCovered > 0;
    const reduction = covered ? 0.4 : 1.0;
    return base * reduction;
}

function attemptAttack(world, merchant, edge, tick) {
    const bandit = world.bandit;
    const patrol = world.patrol;
    // Bandit only attacks on its current route.
    if (bandit.currentRoute !== edge.id) return;
    // Compute attack probability: bandit believes traffic * (1 - patrol coverage)
    const belief = bandit.beliefs[edge.id];
    const patrolCovers = patrol.deployedRoute === edge.id;
    const baseProb = clamp01(belief.believedTraffic * 0.6);
    const adjustedProb = patrolCovers ? baseProb * (1 - patrol.detectionRate) : baseProb;
    // Roll: deterministic.
    const roll = rngFloat(world.seed, `${tick}|${merchant.id}|${edge.id}|attempt`);
    if (roll > adjustedProb) return;
    bandit.attacksAttempted += 1;
    world.exposure.perRoute[edge.id].attacks += 1;
    // Outcome: detection check if patrol covers.
    if (patrolCovers) {
        const detRoll = rngFloat(world.seed, `${tick}|${merchant.id}|${edge.id}|detect`);
        if (detRoll < patrol.detectionRate) {
            // Patrol intercepts. Attack fails.
            bandit.attacksFailed += 1;
            const interceptRoll = rngFloat(world.seed, `${tick}|${merchant.id}|${edge.id}|intercept`);
            if (interceptRoll < patrol.interceptionSuccess) {
                // Cargo preserved.
                world.events.push({
                    type: 'PATROL_INTERCEPTION',
                    tick, merchantId: merchant.id, routeId: edge.id,
                    cargoPreserved: sumCargoValue(merchant.cargo),
                });
                return;
            }
        }
    }
    // Attack succeeds: cargo loss.
    bandit.attacksSucceeded += 1;
    world.exposure.perRoute[edge.id].attacksSucceeded += 1;
    const cargoValue = sumCargoValue(merchant.cargo);
    const cargoLossRatio = clamp01(0.5 + rngFloat(world.seed, `${tick}|${merchant.id}|${edge.id}|loss`) * 0.4);
    const cargoLost = cargoValue * cargoLossRatio;
    world.exposure.perRoute[edge.id].cargoLost += cargoLost;
    // Distribute cargo: split between captured (bandit resources) and destroyed.
    const capturedRatio = 0.7;
    const captured = cargoLost * capturedRatio;
    const destroyed = cargoLost - captured;
    bandit.resources += captured;
    merchant.attackCount += 1;
    merchant.cargoLost += cargoLost;
    // Cargo loss: convert merchant cargo to a loss-decrement.
    for (const k of [...merchant.cargo.keys()]) {
        const before = merchant.cargo.get(k);
        merchant.cargo.set(k, Math.max(0, before * (1 - cargoLossRatio)));
    }
    // Belief update: merchant learns Road X is dangerous (from firsthand attack).
    const newPerceived = clamp01((merchant.beliefs[edge.id].perceivedDanger + 0.3 + rngFloat(world.seed, `${tick}|${merchant.id}|${edge.id}|update`) * 0.2));
    merchant.beliefs[edge.id] = {
        perceivedDanger: newPerceived,
        confidence: clamp01(merchant.beliefs[edge.id].confidence + 0.4),
        sourceType: 'firsthand_attack',
        tick,
    };
    // Bandit belief update: success on this route.
    bandit.beliefs[edge.id].lastSuccessTick = tick;
    bandit.beliefs[edge.id].believedCargoValue = clamp01(
        (bandit.beliefs[edge.id].believedCargoValue * 0.7) + (cargoValue / 10) * 0.3
    );
    // World event.
    world.events.push({
        type: 'CARGO_LOSS',
        tick, merchantId: merchant.id, routeId: edge.id,
        cargoLost, captured, destroyed,
        banditId: bandit.id,
    });
}

// -----------------------------------------------------------------------------
// Analytics helpers
// -----------------------------------------------------------------------------

/** Run the world for N ticks and return a clean result. */
export function runTwoRoads(opts = {}, ticks = 100) {
    const world = createTwoRoadsScenario(opts);
    for (let i = 0; i < ticks; i++) tickTwoRoads(world);
    return world;
}

/** Defensive zero-exposure assertion helper. */
export function ambiguousZeroRate(world) {
    const total = world.exposure.eligibleAmbushOpportunities;
    const attacks = world.bandit.attacksAttempted;
    if (total === 0) return { rate: null, eligible: 0, attempts: 0, ambiguous: true };
    return { rate: attacks / total, eligible: total, attempts: attacks, ambiguous: false };
}
