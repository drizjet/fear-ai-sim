import { Market } from './economy.js';
import { selectRoute, findRoutePath } from './routing.js';

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export class Town {
    constructor(id, market = new Market(`${id}:market`)) {
        this.id = id;
        this.market = market;
    }
}

export class Merchant {
    constructor(id, cargo = {}) {
        this.id = id;
        this.cargo = new Map(Object.entries(cargo).map(([kind, amount]) => [kind, Math.max(0, finite(amount))]));
        this.location = null;
        this.lastTrade = null;
        this.trip = null;
    }

    depart(from, to, routes, perception = {}) {
        const decision = selectRoute(routes, perception);
        if (!decision) return { ok: false, reason: 'NO_ROUTE' };
        return { ok: true, merchantId: this.id, from: from.id, to: to.id, ...decision };
    }

    arrive(to, decision, perception = {}, cargo = this.cargo) {
        if (!to?.market || !decision?.ok || !decision.route) return { ok: false, reason: 'INVALID_ROUTE' };
        const deliveries = [...cargo].map(([kind, amount]) => ({
            kind,
            ...to.market.deliverCargo(kind, amount, {
                routeRisk: decision.perceivedDanger,
                confidence: perception.confidence
            })
        }));
        this.location = to.id;
        this.lastTrade = { merchantId: this.id, destination: to.id, routeId: decision.route.id, deliveries };
        return { ok: true, ...this.lastTrade };
    }

    /** Persistent departure: snapshots state and never mutates a market. */
    startTrip(from, to, path, perception = {}, towns = new Map([[from?.id, from], [to?.id, to]])) {
        if (!from?.id || !to?.id || from.id === to.id || !towns?.get(from.id) || !towns.get(to.id)
            || !Array.isArray(path) || path.length === 0) return { ok: false, reason: 'INVALID_ROUTE' };
        const completePath = path.map((edge, index) => ({
            ...edge,
            from: edge.from ?? (index === 0 ? from.id : path[index - 1]?.to),
            to: edge.to ?? (index === path.length - 1 ? to.id : path[index + 1]?.from)
        }));
        if (completePath.some(edge => !edge?.id || edge.from === undefined || edge.to === undefined)
            || completePath[0].from !== from.id
            || completePath.at(-1).to !== to.id
            || completePath.some((edge, index) => index > 0 && completePath[index - 1].to !== edge.from)
            || completePath.some(edge => !towns.get(edge.from) || !towns.get(edge.to))) {
            return { ok: false, reason: 'INVALID_ROUTE' };
        }
        const decision = selectRoute([completePath[0]], perception);
        if (!decision) return { ok: false, reason: 'INVALID_ROUTE' };
        this.location = from.id;
        this.trip = {
            origin: from.id,
            destination: to.id,
            path: completePath.slice(),
            towns,
            townMap: towns,
            cargo: new Map(this.cargo),
            edgeIndex: 0,
            decision: { ok: true, ...decision }
        };
        return this.trip.decision;
    }

    /** Complete exactly one edge. Delivery happens only on the final edge. */
    completeTrip(towns = this.trip?.townMap || this.trip?.towns, perception = {}) {
        const trip = this.trip;
        if (!trip) return { ok: false, reason: 'NO_ACTIVE_TRIP' };
        if (!towns?.get(trip.origin) || !towns.get(trip.destination)
            || trip.edgeIndex < 0 || trip.edgeIndex >= trip.path.length) {
            return { ok: false, reason: 'INVALID_ROUTE' };
        }
        const edge = trip.path[trip.edgeIndex];
        if (!edge || !towns.get(edge.from) || !towns.get(edge.to)) {
            return { ok: false, reason: 'STALE_EDGE' };
        }
        const isFinal = trip.edgeIndex === trip.path.length - 1;
        if (trip.edgeIndex > 0 && this.location !== edge.from) return { ok: false, reason: 'STALE_EDGE' };
        if (!isFinal) {
            this.location = edge.to;
            trip.edgeIndex += 1;
            return { ok: true, merchantId: this.id, from: edge.from, to: edge.to, routeId: edge.id, inTransit: true };
        }
        if (edge.to !== trip.destination) return { ok: false, reason: 'INVALID_ROUTE' };
        const result = this.arrive(towns.get(trip.destination), { ...trip.decision, route: edge }, perception, trip.cargo);
        if (result.ok) this.trip = null;
        return result;
    }
}

export function routesBetween(routes, fromId, toId) {
    if (!Array.isArray(routes)) return [];
    return routes.filter(route => route.from === undefined && route.to === undefined
        ? fromId === 'origin' && toId === 'destination'
        : route.from === fromId && route.to === toId);
}

/** Backward-compatible immediate execution path. */
export function runTradeTrip(merchant, from, to, routes, perception = {}) {
    const direct = routesBetween(routes, from.id, to.id);
    if (direct.length) {
        const decision = merchant.depart(from, to, direct, perception);
        return decision.ok ? merchant.arrive(to, decision, perception) : decision;
    }
    const graph = findRoutePath(routes, from.id, to.id, perception);
    if (!graph) return { ok: false, reason: 'NO_ROUTE' };
    const towns = new Map(graph.towns.map(id => [id, id === from.id ? from : id === to.id ? to : new Town(id)]));
    const departure = merchant.startTrip(from, to, graph.routes, perception, towns);
    if (!departure.ok) return departure;
    while (merchant.trip) {
        const result = merchant.completeTrip(towns, perception);
        if (!result.ok) return result;
        if (!merchant.trip) return result;
    }
    return { ok: false, reason: 'INVALID_ROUTE' };
}

/** Start an idle trip, or advance exactly one edge of an active trip. */
export function runTradeGraphTick(merchants, towns, routes, perceptions = {}) {
    return merchants.map(merchant => {
        const perception = perceptions[merchant.id] || {};
        if (merchant.trip) return { merchantId: merchant.id, ...merchant.completeTrip(merchant.trip.townMap, perception) };
        const from = towns.get(merchant.location) || towns.values().next().value;
        const destination = from && [...towns.values()].find(town => town.id !== from.id);
        if (!from) return { ok: false, merchantId: merchant.id, reason: 'NO_TOWN' };
        if (!destination) return { ok: false, merchantId: merchant.id, reason: 'NO_DESTINATION' };
        const graph = findRoutePath(routes, from.id, destination.id, perception);
        if (!graph) return { ok: false, merchantId: merchant.id, reason: 'NO_ROUTE' };
        const departure = merchant.startTrip(from, destination, graph.routes, perception, towns);
        if (!departure.ok) return { merchantId: merchant.id, ...departure };
        return { merchantId: merchant.id, ok: true, from: from.id, to: destination.id, ...departure, inTransit: true };
    });
}
