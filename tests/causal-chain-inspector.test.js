import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

// RESP-CAUSAL-CHAIN-INSPECTOR-001 — walk any event's parent chain back to its roots and
// surface the belief-producing events it cites, validating ordered parentage (read-only).
// Mutants pinned: lineage order reversed; belief-producer walk skipped.

const ascending = list => list.every((event, index) => index === 0 || list[index - 1].seq < event.seq);

const world = () => {
    const society = new SocietyCore({ seed: 11 });
    society.routes = new RouteNetwork([{ id: 'road', travelTime: 2 }]);
    society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 20 } }));
    society.addMarket('city', new Market({ prices: { grain: 9 }, stock: { grain: 0 } }));
    society.addSettlement('town', { population: 1000, resources: 50 });
    return society;
};

describe('RESP-CAUSAL-CHAIN-INSPECTOR-001: causal-chain inspector', () => {
    it('walks a TRADE decision back to its TURN and the observation that produced its belief', () => {
        const society = world();
        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actorId: 'merchant', routeId: 'road', observation: { perceivedDanger: .6, confidence: 1 } }] });
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', minimumPrice: 1, routes: society.routes.edges, actorId: 'merchant' }] });

        const decision = society.events.find(event => event.type === 'TRADE_ROUTE_DECISION');
        const turn1 = society.events.find(event => event.type === 'TURN');
        const observation = society.events.find(event => event.type === 'ROUTE_OBSERVATION');
        const chain = society.causalChain(decision.id);

        expect(chain.event.id).toBe(decision.id);
        // TRADE parents to the actor's latest ROUTE_OBSERVATION (a cross-tick causal edge),
        // so the lineage root is that observation's TURN — exactly what the inspector surfaces.
        expect(chain.lineage.map(event => event.id)).toEqual([turn1.id, observation.id, decision.id]);
        expect(chain.roots).toEqual([turn1.id]);
        expect(ascending(chain.lineage)).toBe(true);

        expect(chain.beliefProducers).toHaveLength(1);
        const [producerRef] = chain.beliefProducers;
        expect(producerRef.citedBy).toBe(decision.id);
        expect(producerRef.event).toMatchObject({ type: 'BELIEF_UPDATED', actorId: 'merchant', claim: 'route:road:danger' });
        expect(producerRef.lineage.map(event => event.type)).toEqual(['TURN', 'ROUTE_OBSERVATION', 'BELIEF_UPDATED']);
        expect(producerRef.lineage.map(event => event.id)).toEqual([turn1.id, observation.id, producerRef.event.id]); // shares the observation ancestor
        expect(ascending(producerRef.lineage)).toBe(true);
        expect(decision.beliefProvenance).toEqual({ eventId: producerRef.event.id, tick: producerRef.event.tick, type: 'BELIEF_UPDATED' });
    });

    it('surfaces the rumor-delivery producer behind a queue-aware decision', () => {
        const society = world();
        const buyer = { id: 'buyer', delay: 0 };
        const rumor = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 4, source: 'scout', confidence: .9 });
        society.tick({ actions: [
            { kind: 'RUMOR_QUEUE', rumor, recipient: buyer, delay: 0 },
            { kind: 'RUMOR_DELIVER', recipients: [buyer] },
        ] });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'south', recipientId: 'buyer', foodNeed: 5 }] });

        const decision = society.events.find(event => event.type === 'QUEUE_AWARE_SETTLEMENT_ECONOMY');
        const chain = society.causalChain(decision.id);
        expect(chain.roots).toHaveLength(1);

        expect(chain.beliefProducers).toHaveLength(1);
        const [producerRef] = chain.beliefProducers;
        expect(producerRef.citedBy).toBe(decision.id);
        expect(producerRef.event).toMatchObject({ type: 'BELIEF_UPDATED', actorId: 'buyer', claim: 'route:road:danger' });
        expect(producerRef.lineage.map(event => event.type)).toEqual(['TURN', 'RUMOR_DELIVER', 'RUMOR_DELIVERED', 'BELIEF_UPDATED']);
        expect(ascending(producerRef.lineage)).toBe(true);
    });

    it('validates ordered parentage: unknown ids, dangling parents, and order violations throw', () => {
        const society = world();
        society.tick();
        society.tick();
        const [root, second] = society.events;
        expect(root.parentId).toBeNull();

        expect(() => society.causalChain('evt-nope')).toThrow(/Unknown event/);

        // parent pointing at a LATER event breaks parent.seq < child.seq
        root.parentId = society.events.at(-1).id;
        expect(() => society.causalChain(root.id)).toThrow(/Parentage order violated/);

        root.parentId = 'evt-999';
        expect(() => society.causalChain(root.id)).toThrow(/Dangling parent/);

        root.parentId = null; // restore
        expect(society.causalChain(root.id).lineage.map(event => event.id)).toEqual([root.id]);
        expect(society.causalChain(second.id).lineage.map(event => event.id)).toEqual([second.id]); // each TURN is its own root
    });

    it('is read-only: walking never mutates world history', () => {
        const society = world();
        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actorId: 'merchant', routeId: 'road', observation: { perceivedDanger: .6, confidence: 1 } }] });
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', minimumPrice: 1, routes: society.routes.edges, actorId: 'merchant' }] });
        const decision = society.events.find(event => event.type === 'TRADE_ROUTE_DECISION');

        const before = JSON.stringify(society.events);
        society.causalChain(decision.id);
        society.causalChain(society.events[0].id);
        expect(JSON.stringify(society.events)).toBe(before);
    });
});
