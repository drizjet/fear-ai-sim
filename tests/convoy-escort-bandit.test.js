import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

// RESP-CONVOY-ESCORT-BANDIT-LOOP-001 — merchant cargo moves under escort through a full
// route-observation → convoy dispatch → bandit threat → escort resolution → market
// consequence cycle: canonical parent-chained events, one world-RNG draw at resolution,
// the underlying trip settled by the escort loop (not the generic trip progresser), and
// the whole cycle continuing across save/load.
// Mutants pinned: threat-state gate removed; resolution forced to victory; worldStep trip
// automation not deferring to escort-owned convoys.

const world = ({ available = true } = {}) => {
    const society = new SocietyCore({ seed: 77 });
    society.routes = new RouteNetwork([{ id: 'road', travelTime: 1, perceivedDanger: .4, available }]);
    society.addMarket('north', new Market({ prices: { grain: 1 }, stock: { grain: 10 } }));
    society.addMarket('south', new Market({ prices: { grain: 1 }, stock: { grain: 0 } }));
    return society;
};

const OBSERVE_AND_ship = {
    observe: { kind: 'ROUTE_OBSERVATION', actorId: 'merchant-1', routeId: 'road', observation: { perceivedDanger: .2, confidence: 1, source: 'scout' } },
    create: { kind: 'MARKET_TRIP_CREATE', market: 'north', tripId: 'trip-1', good: 'grain', quantity: 5, destination: 'south', owner: 'merchant-1' },
};

const dispatchAction = (escortStrength, convoyId = 'caravan-1') => ({ kind: 'CONVOY_DISPATCH', convoyId, market: 'north', tripId: 'trip-1', routeId: 'road', escortStrength, actorId: 'merchant-1' });
const threatAction = (banditStrength, convoyId = 'caravan-1') => ({ kind: 'CONVOY_BANDIT_THREAT', convoyId, banditStrength });
const resolveAction = (convoyId = 'caravan-1') => ({ kind: 'CONVOY_ESCORT_RESOLUTION', convoyId });

const eventsOf = (society, type) => society.events.filter(event => event.type === type);

describe('RESP-CONVOY-ESCORT-BANDIT-LOOP-001: convoy/escort/bandit production loop', () => {
    it('runs the full observation → dispatch → threat → resolution → market consequence cycle', () => {
        const society = world();
        society.tick({ actions: [OBSERVE_AND_ship.observe, OBSERVE_AND_ship.create] });
        society.tick({ actions: [dispatchAction(3)] });
        society.tick({ actions: [threatAction(1), resolveAction()] });

        const [observation] = eventsOf(society, 'ROUTE_OBSERVATION');
        const [beliefEvent] = eventsOf(society, 'BELIEF_UPDATED');
        const [dispatch] = eventsOf(society, 'CONVOY_DISPATCH');
        const [threat] = eventsOf(society, 'CONVOY_BANDIT_THREAT');
        const [resolution] = eventsOf(society, 'CONVOY_ESCORT_RESOLUTION');

        // one validated lineage: TURN → observation → dispatch → threat → resolution
        expect(dispatch.parentId).toBe(observation.id);
        expect(threat.parentId).toBe(dispatch.id);
        expect(resolution.parentId).toBe(threat.id);
        expect(dispatch.beliefProvenance?.eventId).toBe(beliefEvent.id);
        expect(society.events.indexOf(beliefEvent) < society.events.indexOf(dispatch)).toBe(true); // belief predates the dispatch

        // escort math: escort 3 + roll ≥ 3 > bandits 1 — always a victory
        expect(resolution.victory).toBe(true);
        expect(resolution.roll).toBeGreaterThanOrEqual(0);
        expect(resolution.roll).toBeLessThan(1);
        expect(resolution.outcome).toBe('ESCORT_VICTORY');
        expect(resolution.status).toBe('DELIVERED');
        expect(resolution.quantity).toBe(5);

        // market consequence: cargo moved north → south, conservation exact on both sides
        expect(society.markets.get('north').stock.grain).toBe(5);
        expect(society.markets.get('south').stock.grain).toBe(5);
        expect(society.markets.get('north').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('south').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('north').inTransit.size).toBe(0);
        expect(society.convoys.get('caravan-1').status).toBe('DELIVERED');

        // the whole cycle is one validated lineage from the TURN, auditable end to end
        const chain = society.causalChain(resolution.id);
        expect(chain.lineage.map(event => event.type)).toEqual([
            'TURN', 'ROUTE_OBSERVATION', 'CONVOY_DISPATCH', 'CONVOY_BANDIT_THREAT', 'CONVOY_ESCORT_RESOLUTION',
        ]);
        expect(chain.roots.some(id => society.events.find(event => event.id === id)?.type === 'TURN')).toBe(true);
        expect(chain.beliefProducers.map(producer => producer.event.id)).toContain(beliefEvent.id);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('a bandit victory steals the cargo without breaking conservation', () => {
        const society = world();
        society.tick({ actions: [OBSERVE_AND_ship.observe, OBSERVE_AND_ship.create] });
        society.tick({ actions: [dispatchAction(0)] });
        society.tick({ actions: [threatAction(5), resolveAction()] });

        const [resolution] = eventsOf(society, 'CONVOY_ESCORT_RESOLUTION');
        expect(resolution.victory).toBe(false); // escort 0 + roll < 1 ≤ 5 — never wins
        expect(resolution.outcome).toBe('BANDIT_SUCCESS');
        expect(resolution.status).toBe('ROBBED');

        const north = society.markets.get('north');
        const south = society.markets.get('south');
        expect(north.stock.grain).toBe(5);      // cargo left the origin...
        expect(south.stock.grain).toBe(0);      // ...and never arrived
        expect(north.history.some(entry => entry.kind === 'TRIP_THEFT' && entry.tripId === 'trip-1')).toBe(true);
        expect(north.balanceSheet().balanced).toBe(true);
        expect(south.balanceSheet().balanced).toBe(true);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('enforces stage gates: unknown trip, duplicate convoy id, out-of-order stages', () => {
        const society = world();
        society.tick({ actions: [OBSERVE_AND_ship.observe, OBSERVE_AND_ship.create] });

        // reference and invariant guards fire before any mutation
        expect(() => society.tick({ actions: [{ ...dispatchAction(3), tripId: 'nope' }] })).toThrow(/Unknown trip "nope"/);
        expect(() => society.tick({ actions: [{ ...dispatchAction(3), tripId: undefined, convoyId: undefined }] })).toThrow(/requires a convoyId/);

        society.tick({ actions: [dispatchAction(3)] });
        // invariant-first: the duplicate id is reported even though trip-1 is now escorted
        expect(() => society.tick({ actions: [dispatchAction(1)] })).toThrow(/Duplicate convoy id/);
        // stage order: resolve before threat is impossible...
        expect(() => society.tick({ actions: [resolveAction()] })).toThrow(/cannot resolve escort outcome from status "ESCORTED"/);
        // ...and a second threat after resolution is refused too
        society.tick({ actions: [threatAction(1)] });
        society.tick({ actions: [resolveAction()] });
        expect(() => society.tick({ actions: [threatAction(1)] })).toThrow(/cannot be threatened from status "DELIVERED"/);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('rejects dispatch on an unavailable route without touching state', () => {
        const society = world({ available: false });
        society.tick({ actions: [OBSERVE_AND_ship.create] });
        society.tick({ actions: [dispatchAction(3)] });

        const [event] = eventsOf(society, 'CONVOY_DISPATCH');
        expect(event).toMatchObject({ status: 'REJECTED', reason: 'ROUTE_UNAVAILABLE' });
        expect(society.convoys.size).toBe(0);
        const trip = society.markets.get('north').inTransit.get('trip-1');
        expect(trip.convoyId).toBeUndefined(); // no ownership recorded on rejection
        expect(society.markets.get('north').balanceSheet().balanced).toBe(true);
    });

    it('worldStep trip automation defers to escort-owned convoys', () => {
        const society = world();
        society.tick({ actions: [OBSERVE_AND_ship.observe, OBSERVE_AND_ship.create, dispatchAction(3)] });
        society.worldStep({ routes: society.routes.edges });

        // the generic progresser must not settle an escorted trip behind the escort loop's back
        expect(eventsOf(society, 'MARKET_TRIP_SETTLE')).toHaveLength(0);
        expect(society.markets.get('north').inTransit.has('trip-1')).toBe(true);
        expect(society.convoys.get('caravan-1').status).toBe('ESCORTED');

        // once the escort loop resolves it, the trip settles exactly once as a canonical event
        society.tick({ actions: [threatAction(1), resolveAction()] });
        const [settle] = eventsOf(society, 'MARKET_TRIP_SETTLE');
        expect(settle).toMatchObject({ tripId: 'trip-1', outcome: 'DELIVERED', owner: 'merchant-1' });
        const [resolution] = eventsOf(society, 'CONVOY_ESCORT_RESOLUTION');
        expect(settle.parentId).toBe(resolution.id); // consequence chains off the draw
        expect(society.markets.get('south').stock.grain).toBe(5);
    });

    it('survives save/load mid-cycle and continues identically to an uninterrupted run', () => {
        const control = world();
        control.tick({ actions: [OBSERVE_AND_ship.observe, OBSERVE_AND_ship.create] });
        control.tick({ actions: [dispatchAction(3)] });
        control.tick({ actions: [threatAction(1), resolveAction()] });

        const interrupted = world();
        interrupted.tick({ actions: [OBSERVE_AND_ship.observe, OBSERVE_AND_ship.create] });
        interrupted.tick({ actions: [dispatchAction(3)] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));

        // convoy state, trip ownership, and RNG state all survive the round-trip
        expect(restored.convoys.get('caravan-1')).toMatchObject({ status: 'ESCORTED', escortStrength: 3, tripId: 'trip-1' });
        expect(restored.markets.get('north').inTransit.get('trip-1').convoyId).toBe('caravan-1');

        restored.tick({ actions: [threatAction(1), resolveAction() ] });
        expect(restored.auditEventGraph().ok).toBe(true);
        expect(restored.serialize()).toEqual(control.serialize()); // bit-for-bit identical continuation
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = world();
            society.tick({ actions: [OBSERVE_AND_ship.observe, OBSERVE_AND_ship.create] });
            society.tick({ actions: [dispatchAction(3)] });
            society.tick({ actions: [threatAction(1), resolveAction()] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
