import { describe, expect, it } from '@jest/globals';
import { SocietyCore, Market, RouteNetwork, mulberry32 } from '../societycore.js';

describe('RESP-WORLD-TICK-001: deterministic world turn', () => {
    it('advances a real clock and stamps event ticks from the clock, not array length', () => {
        const society = new SocietyCore();
        expect(society.time).toBe(0);
        expect(society.now()).toBe(0);
        society.tick();
        society.tick();
        const evt = society.commitEvent({ type: 'NOTE' });
        expect(evt.tick).toBe(2);
        expect(evt.tick).not.toBe(society.events.length); // array-length-as-tick mutant restored would stamp 3
        expect(society.events[0].type).toBe('TURN');
        expect(society.events[0].tick).toBe(1);
        expect(society.events[1].tick).toBe(2);
    });

    it('allocates unique monotonic ids with ordered parentage and rejects duplicates', () => {
        const society = new SocietyCore();
        society.tick();
        const turn = society.events[0];
        const child = society.commitEvent(society.allocateEvent({ type: 'CHILD', parent: turn }));
        expect(child.id).toBe('evt-2');
        expect(child.seq).toBe(2);
        expect(child.parentId).toBe(turn.id);
        const ids = society.events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length); // duplicate event ids mutant would fail here
        expect(() => society.commitEvent({ ...child })).toThrow(/Duplicate event id/);
        expect(() => society.commitEvent({ type: 'X', seq: 999 })).toThrow(/Non-monotonic event seq/);
        expect(() => society.allocateEvent({ type: 'ORPHAN', parent: 'evt-9999' })).toThrow(/Unknown parent event/);
    });

    it('rejects oversell truthfully and reconciles market flows exactly', () => {
        const market = new Market({ prices: { grain: 2 }, stock: { grain: 10 } });
        // No-op oversell guard mutant would silently clamp stock to 0 and charge for 100.
        expect(market.trade('grain', 100)).toBe(null);
        expect(market.stock.grain).toBe(10);
        expect(market.history.at(-1).settled).toBe(false);
        expect(market.history.at(-1).reason).toBe('INSUFFICIENT_STOCK');
        // Exact settled flow: 4 units at 2 -> 8 value, stock 10 -> 6.
        expect(market.trade('grain', 4)).toBe(8);
        expect(market.stock.grain).toBe(6);
        const { net, value } = market.flows();
        expect(net.grain).toBe(4);
        expect(value.grain).toBe(8);
        expect(market.stock.grain).toBe(10 - net.grain);
        // Rejected attempts never move stock.
        market.trade('grain', 999);
        expect(market.stock.grain).toBe(6);
    });

    it('runs a deterministic turn whose randomness flows through the injectable RNG', () => {
        const run = seed => {
            const society = new SocietyCore({ rng: mulberry32(seed) });
            society.addMarket('m', new Market({ prices: { grain: 1 }, stock: { grain: 100 } }));
            society.tick({ actions: [{ kind: 'MARKET_UPDATE', market: 'm', demand: { grain: 10 }, supply: { grain: 0 }, jitter: true }] });
            return { price: society.markets.get('m').prices.grain, state: society.rng.getState() };
        };
        expect(run(42).price).toBe(run(42).price); // same seed -> same world
        expect(run(1).price).not.toBe(run(42).price); // different seed -> different world
        // RNG-omitted mutant would fall back to Math.random: the injected function must be called.
        const calls = [];
        const spy = new SocietyCore({ rng: () => { calls.push(1); return .5; } });
        spy.addMarket('m', new Market({ prices: { g: 1 }, stock: { g: 10 } }));
        spy.tick({ actions: [{ kind: 'MARKET_UPDATE', market: 'm', demand: { g: 5 }, supply: { g: 0 }, jitter: true }] });
        expect(calls.length).toBeGreaterThan(0);
        // Default RNG is seeded and serializable, so fresh instances are deterministic too.
        const d1 = new SocietyCore();
        const d2 = new SocietyCore();
        d1.addMarket('m', new Market({ prices: { g: 1 }, stock: { g: 10 } }));
        d2.addMarket('m', new Market({ prices: { g: 1 }, stock: { g: 10 } }));
        d1.tick({ actions: [{ kind: 'MARKET_UPDATE', market: 'm', demand: { g: 5 }, supply: { g: 0 }, jitter: true }] });
        d2.tick({ actions: [{ kind: 'MARKET_UPDATE', market: 'm', demand: { g: 5 }, supply: { g: 0 }, jitter: true }] });
        expect(d2.markets.get('m').prices.g).toBe(d1.markets.get('m').prices.g);
    });

    it('applies turn actions as ordered children of the TURN event', () => {
        const society = new SocietyCore();
        society.addMarket('m', new Market({ prices: { grain: 2 }, stock: { grain: 10 } }));
        society.routes = new RouteNetwork([{ id: 'road-a', travelTime: 5, perceivedDanger: 1 }]);
        society.step({ actions: [
            { kind: 'MARKET_TRADE', market: 'm', good: 'grain', quantity: 3 },
            { kind: 'ROUTE_TRAVEL', route: 'road-a', cargo: 2 },
        ] });
        expect(society.time).toBe(1);
        expect(society.now()).toBe(1);
        const turn = society.events[0];
        expect(turn.type).toBe('TURN');
        expect(society.events.slice(1).every(e => e.parentId === turn.id)).toBe(true);
        expect(society.events[1]).toMatchObject({ type: 'MARKET_TRADE', market: 'm', good: 'grain', settled: true, value: 6 });
        expect(society.events[2]).toMatchObject({ type: 'ROUTE_TRAVEL', route: 'road-a', cargo: 2, moved: true });
        expect(society.markets.get('m').stock.grain).toBe(7);
        expect(society.routes.edges[0].traffic).toBe(2);
    });

    it('serializes and deserializes full state with unique-id continuation', () => {
        const society = new SocietyCore({ rng: mulberry32(7) });
        society.addMarket('m', new Market({ prices: { grain: 2 }, stock: { grain: 10 } }));
        society.routes = new RouteNetwork([{ id: 'road-a', travelTime: 5, perceivedDanger: 1 }]);
        society.addFaction('alpha', { fear: .5 });
        society.tick({ actions: [
            { kind: 'MARKET_TRADE', market: 'm', good: 'grain', quantity: 3 },
            { kind: 'ROUTE_TRAVEL', route: 'road-a', cargo: 2 },
        ] });
        const json = JSON.parse(JSON.stringify(society)); // toJSON round-trip through JSON
        const clone = SocietyCore.deserialize(json);
        expect(clone.time).toBe(society.time);
        expect(clone.now()).toBe(society.now());
        expect(clone.eventSeq).toBe(society.eventSeq);
        expect(clone.events).toEqual(society.events);
        expect(clone.markets.get('m').stock.grain).toBe(7);
        expect(clone.markets.get('m').history).toEqual(society.markets.get('m').history);
        expect(clone.routes.edges[0].traffic).toBe(2);
        expect(clone.factions.get('alpha').state.fear).toBe(.5);
        // Continuation stays monotonic and unique: no duplicate event ids after restore.
        const next = clone.commitEvent(clone.allocateEvent({ type: 'AFTER' }));
        expect(next.seq).toBe(society.eventSeq + 1);
        const ids = clone.events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        // RNG stream continues identically from the restored state.
        expect(clone.random()).toBe(society.random());
    });
});
