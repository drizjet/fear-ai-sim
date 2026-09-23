import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

// RESP-EVENT-CAUSALITY-001 — belief paths run through canonical event emission:
// decay is recorded on the TURN, worldStep queues/delivers rumors as parented actions,
// and decisions that consume beliefs cite the event that produced them.
// Mutants pinned: bare worldStep queue/delivery; dropped RUMOR_DELIVERED parentage;
// missing beliefProvenance; TURN without the decay summary.

const rumorWorld = () => {
    const society = new SocietyCore({ seed: 7 });
    society.routes = new RouteNetwork([{ id: 'road', travelTime: 2 }]);
    society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 20 } }));
    society.addSettlement('town', { population: 1000, resources: 50 });
    return society;
};

describe('RESP-EVENT-CAUSALITY-001: belief paths through canonical events', () => {
    it('worldStep routes rumor queue + delivery through a parented event chain', () => {
        const society = rumorWorld();
        const recipient = { id: 'merchant', delay: 0 };
        const rumor = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 4, source: 'scout', confidence: .8 });

        society.worldStep({ rumor, rumorRecipients: [recipient] });

        const turn = society.events.find(e => e.type === 'TURN');
        const queued = society.events.find(e => e.type === 'RUMOR_QUEUE');
        const deliver = society.events.find(e => e.type === 'RUMOR_DELIVER');
        const delivered = society.events.find(e => e.type === 'RUMOR_DELIVERED');
        const updated = society.events.filter(e => e.type === 'BELIEF_UPDATED').at(-1);

        expect(queued).toMatchObject({ parentId: turn.id, rumorId: rumor.id, recipientId: 'merchant', claim: 'route:road:danger', deliveryTick: 1 });
        expect(deliver).toMatchObject({ parentId: turn.id, requested: 1, delivered: 1 });
        expect(delivered).toMatchObject({ parentId: deliver.id, recipientId: 'merchant', claim: 'route:road:danger', latency: 0 });
        expect(updated).toMatchObject({ parentId: delivered.id, actorId: 'merchant', claim: 'route:road:danger', estimate: 4 });
        // full chain stamped from the world clock
        expect([turn, queued, deliver, delivered, updated].every(e => e.tick === 1)).toBe(true);
        // the belief write itself happened on the recipient object
        expect(recipient.beliefs.get('route:road:danger').estimate).toBe(4);

        // relay through an action: the relayer's local belief is republished and queued, parented to its TURN
        const turn2 = society.events.filter(e => e.type === 'TURN').at(-1);
        const relay = society.executeAction({ kind: 'RUMOR_RELAY', rumor, relayer: recipient, recipient: { id: 'other' }, delay: 1 }, turn2);
        expect(relay).toMatchObject({ type: 'RUMOR_RELAY', parentId: turn2.id, relayerId: 'merchant', recipientId: 'other', relayed: true, enqueuedRumorId: 'rumor-2' });
    });

    it('records belief decay on the TURN event (aged beliefs counted, fresh worlds zeroed)', () => {
        const society = rumorWorld();
        society.tick();
        const turn0 = society.events.find(e => e.type === 'TURN');
        expect(turn0.beliefDecay).toEqual({ routeFactor: expect.any(Number), rumorFactor: expect.any(Number), routeClaims: 0, rumorClaims: 0 });

        const scout = { id: 'scout' };
        society.recordRouteObservation(scout, society.routes.edges[0], { perceivedDanger: .8, confidence: 1 });
        const rumor = society.rumors.publish({ claim: 'rumor-broadcast', valueEstimate: 3, confidence: .9 });
        society.spreadRumor(rumor, [scout]);
        society.actors.set('scout', scout);
        const routeConfidence = scout.beliefs.get('route:road:danger').confidence;
        const rumorConfidence = scout.beliefs.get('rumor-broadcast').confidence;

        society.tick();
        const turn1 = society.events.filter(e => e.type === 'TURN').at(-1);
        expect(turn1.beliefDecay.routeClaims).toBe(1);
        expect(turn1.beliefDecay.rumorClaims).toBe(1);
        expect(turn1.beliefDecay.routeFactor).toBeGreaterThan(0);
        // decay really touched confidence (it is not just a counter)
        expect(scout.beliefs.get('route:road:danger').confidence).toBeLessThan(routeConfidence);
        expect(scout.beliefs.get('rumor-broadcast').confidence).toBeLessThan(rumorConfidence);
    });

    it('TRADE_ROUTE_DECISION cites the event that produced its route belief', () => {
        const society = rumorWorld();
        society.addMarket('city', new Market({ prices: { grain: 9 }, stock: { grain: 0 } }));

        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actorId: 'merchant', routeId: 'road', observation: { perceivedDanger: .6, confidence: 1 } }] });
        const producer = society.events.find(e => e.type === 'BELIEF_UPDATED');
        expect(producer).toMatchObject({ actorId: 'merchant', claim: 'route:road:danger', tick: 1 });

        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', minimumPrice: 1, routes: society.routes.edges, actorId: 'merchant' }] });
        const decision = society.events.find(e => e.type === 'TRADE_ROUTE_DECISION');
        expect(decision.selectedRoute).toBe('road');
        expect(decision.decision).toBe('TRAVEL');
        expect(decision.beliefProvenance).toEqual({ eventId: producer.id, tick: producer.tick, type: 'BELIEF_UPDATED' });
        expect(decision.seq).toBeGreaterThan(producer.seq);
    });

    it('QUEUE_AWARE_SETTLEMENT_ECONOMY consumes the delivered rumor event it depends on', () => {
        const society = rumorWorld();
        const buyer = { id: 'buyer', delay: 0 };
        const rumor = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 4, source: 'scout', confidence: .9 });

        society.tick({ actions: [
            { kind: 'RUMOR_QUEUE', rumor, recipient: buyer, delay: 0 },
            { kind: 'RUMOR_DELIVER', recipients: [buyer] },
        ] });
        const producer = society.events.find(e => e.type === 'BELIEF_UPDATED');
        expect(producer).toMatchObject({ actorId: 'buyer', tick: 1 });

        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'south', recipientId: 'buyer', foodNeed: 5 }] });
        const decision = society.events.find(e => e.type === 'QUEUE_AWARE_SETTLEMENT_ECONOMY');
        expect(decision.reportedDanger).toBe(4);
        expect(decision.requested).toBeGreaterThan(decision.demand);
        expect(decision.beliefProvenance).toEqual({ eventId: producer.id, tick: producer.tick, type: 'BELIEF_UPDATED' });
        expect(decision.seq).toBeGreaterThan(producer.seq);
    });

    it('invariant: any recipient gaining evidence in a tick has a BELIEF_UPDATED in that tick', () => {
        const society = rumorWorld();
        const observer = { id: 'observer' };
        const listener = { id: 'listener' };
        const rumor = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 2, confidence: .7 });
        const actors = [observer, listener];
        const snapshot = () => new Map(actors.map(a => [a.id, new Map([...(a.beliefs ?? new Map())].map(([claim, belief]) => [claim, belief.evidence.length]))]));

        const script = [
            { actions: [{ kind: 'ROUTE_OBSERVATION', actorId: 'observer', routeId: 'road', observation: { perceivedDanger: .5, confidence: 1 } }] },
            { actions: [{ kind: 'RUMOR_QUEUE', rumor, recipient: listener, delay: 0 }, { kind: 'RUMOR_DELIVER', recipients: [listener] }] },
            { actions: [{ kind: 'ROUTE_OBSERVATION', actorId: 'observer', routeId: 'road', observation: { perceivedDanger: .3, confidence: 1 } }] },
        ];

        for (const step of script) {
            const before = snapshot();
            society.tick(step);
            const after = snapshot();
            for (const actor of actors) {
                for (const [claim, count] of after.get(actor.id) ?? []) {
                    if ((before.get(actor.id)?.get(claim) ?? 0) >= count) continue; // no evidence gained
                    const pinned = society.events.find(e => e.type === 'BELIEF_UPDATED' && e.tick === society.now() && e.actorId === actor.id && e.claim === claim);
                    expect(pinned).toBeDefined();
                }
            }
        }
    });

    it('is deterministic across identical seeded worlds and survives save/load', () => {
        const scriptedRun = () => {
            const society = rumorWorld();
            society.addMarket('city', new Market({ prices: { grain: 9 }, stock: { grain: 0 } }));
            society.addFaction('clan', { legitimacy: .5 });
            const scout = { id: 'scout', delay: 0 };
            const rumor = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 4, source: 'watcher', confidence: .8 });
            const script = [
                { actions: [
                    { kind: 'ROUTE_OBSERVATION', actorId: 'scout', routeId: 'road', observation: { perceivedDanger: .5, confidence: 1 } },
                    { kind: 'FACTION_EVALUATION', faction: 'clan', targetId: 'rival', context: { opportunity: .6, resourceNeed: .7 } },
                ] },
                { actions: [
                    { kind: 'RUMOR_QUEUE', rumor, recipient: scout, delay: 0 },
                    { kind: 'RUMOR_DELIVER', recipients: [scout] },
                ] },
                { actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', minimumPrice: 1, routes: society.routes.edges, actorId: 'scout' }] },
            ];
            for (const step of script) society.tick(step);
            return society;
        };

        const fingerprint = society => society.events.map(e => ({ id: e.id, seq: e.seq, type: e.type, parentId: e.parentId, tick: e.tick }));
        const first = scriptedRun();
        expect(fingerprint(scriptedRun())).toEqual(fingerprint(first));

        const clone = SocietyCore.deserialize(JSON.parse(JSON.stringify(first.serialize())));
        expect(clone.events).toEqual(first.events);
        const producer = clone.events.filter(e => e.type === 'BELIEF_UPDATED').at(-1); // latest producer wins
        const decision = clone.events.find(e => e.type === 'TRADE_ROUTE_DECISION');
        expect(decision.beliefProvenance).toEqual({ eventId: producer.id, tick: producer.tick, type: 'BELIEF_UPDATED' });

        clone.tick({ actions: [{ kind: 'DECISION', context: { actorId: 'post-restore' }, actions: [{ id: 'observe' }] }] });
        const ids = clone.events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length); // no duplicate ids after restore
        const resolved = clone.events.find(e => e.id === clone.events.find(f => f.type === 'TRADE_ROUTE_DECISION').beliefProvenance.eventId);
        expect(resolved).toBeDefined(); // provenance still resolves after save/load
    });
});
