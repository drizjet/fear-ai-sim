/**
 * Deterministic route/trade primitives.
 * Route choice consumes actor knowledge and perception, never hidden ground truth.
 */

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const nonNegative = value => Math.max(0, finite(value));

export function routeCost(route, perception = {}) {
    const distance = nonNegative(route.distance);
    const cargoValue = nonNegative(perception.cargoValue);
    const expectedCargoLoss = nonNegative(perception.expectedCargoLoss ?? cargoValue * nonNegative(perception.perceivedAmbushProbability));
    const perceivedDanger = nonNegative(perception.perceivedDanger);
    const informationUncertainty = Math.max(0, 1 - Math.max(0, Math.min(1, finite(perception.confidence, 0))));
    // Slice Z (infrastructure): degraded roads cost more to traverse.
    // Absent condition means pristine (factor 0); floored at 0.5 so the
    // surcharge stays bounded at 1x distance.
    const roadCondition = Number.isFinite(route.condition) ? Math.max(0.5, route.condition) : 1;
    const conditionSurcharge = distance * (1 / roadCondition - 1);

    return distance
        + conditionSurcharge
        + nonNegative(route.travelTime)
        + nonNegative(route.tollCost)
        + nonNegative(route.weatherCost)
        + perceivedDanger * nonNegative(perception.fearSensitivity)
        + expectedCargoLoss
        + nonNegative(route.politicalRisk)
        + nonNegative(route.borderRisk)
        + nonNegative(route.monsterRisk)
        + nonNegative(route.legalRisk)
        + informationUncertainty * nonNegative(perception.uncertaintyAversion)
        - nonNegative(perception.escortConfidence)
        - nonNegative(perception.routeFamiliarity)
        - nonNegative(perception.friendlyTerritoryConfidence);
}

export function selectRoute(routes, perception = {}) {
    if (!Array.isArray(routes) || routes.length === 0) return null;
    const ranked = routes
        .map((route, index) => ({ route, index, cost: routeCost(route, perception) }))
        .sort((a, b) => a.cost - b.cost || a.index - b.index);
    const selected = ranked[0];
    return {
        route: selected.route,
        cost: selected.cost,
        actualDanger: nonNegative(selected.route.actualDanger),
        perceivedDanger: nonNegative(perception.perceivedDanger),
        confidence: Math.max(0, Math.min(1, finite(perception.confidence, 0))),
        alternatives: ranked.slice(1).map(item => ({ route: item.route, cost: item.cost }))
    };
}

/** Return only directed edges that leave the requested node. */
export function outgoingRoutes(routes, fromId) {
    if (!Array.isArray(routes)) return [];
    return routes.filter(route => route.from === fromId && route.to !== undefined);
}

/**
 * Find the least-cost deterministic path through directed route edges.
 * Costs are evaluated from the supplied perception and ties preserve input order.
 */
export function findRoutePath(routes, fromId, toId, perception = {}) {
    if (fromId === toId) return { routes: [], towns: [fromId], cost: 0 };
    if (!Array.isArray(routes) || routes.length === 0) return null;

    const queue = [{ town: fromId, routes: [], towns: [fromId], cost: 0, order: [] }];
    const best = new Map([[fromId, 0]]);
    let winner = null;
    while (queue.length) {
        queue.sort((a, b) => a.cost - b.cost || a.order.join('.').localeCompare(b.order.join('.')));
        const current = queue.shift();
        if (current.town === toId) {
            winner = current;
            break;
        }
        for (const [index, route] of routes.entries()) {
            if (route.from !== current.town || current.towns.includes(route.to)) continue;
            const cost = current.cost + routeCost(route, perception);
            if (cost > (best.get(route.to) ?? Infinity)) continue;
            best.set(route.to, cost);
            queue.push({ town: route.to, routes: [...current.routes, route], towns: [...current.towns, route.to], cost, order: [...current.order, index] });
        }
    }
    return winner && { routes: winner.routes, towns: winner.towns, cost: winner.cost };
}

export function createRouteBelief(route, { perceivedDanger = 0, confidence = 0, sourceId = null, tick = 0 } = {}) {
    return {
        layer: 'AGENT_BELIEF', subject: route.id, claim: 'route_danger',
        actualDanger: nonNegative(route.actualDanger), perceivedDanger: nonNegative(perceivedDanger),
        confidence: Math.max(0, Math.min(1, finite(confidence, 0))), sourceId, tick
    };
}
