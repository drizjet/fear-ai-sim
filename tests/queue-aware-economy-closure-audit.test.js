import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

function runAudit(seed) {
    const society = new SocietyCore({ seed });
    society.addSettlement('a', { population: 25, resources: 10 });
    society.addSettlement('b', { population: 35, resources: 10 });
    society.addMarket('grain', new Market({ prices: { grain: 2 }, stock: { grain: 500 } }));
    const actors = [{ id: 'a-scout', beliefs: new Map() }, { id: 'b-scout', beliefs: new Map() }];
    actors.forEach(actor => society.actors.set(actor.id, actor));
    society.routes.edges.push({ id: 'road-a', actualDanger: 999 });
    for (let tick = 0; tick < 250; tick++) {
        society.time = tick;
        const actor = actors[tick % 2];
        if (tick % 13 === 0) {
            const report = society.rumors.publish({ claim: 'route:road-a:danger', valueEstimate: tick % 26 === 0 ? 2 : 0, confidence: .7, timestamp: tick });
            society.rumors.spread(report, [actor], { now: () => society.now() });
        }
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: tick % 2 ? 'a' : 'b', market: 'grain', recipientId: actor.id, foodNeed: 1 + (tick % 4) }] });
    }
    return society;
}

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CLOSURE-AUDIT-001', () => {
    it('keeps dynamic events finite, ordered, bounded, and conserved', () => {
        for (const seed of [2601, 2611, 2621]) {
            const society = runAudit(seed);
            const market = society.markets.get('grain');
            const actions = society.events.filter(event => event.type === 'QUEUE_AWARE_SETTLEMENT_ECONOMY');
            expect(actions).toHaveLength(250);
            expect(society.events.every((event, i) => i === 0 || event.seq > society.events[i - 1].seq)).toBe(true);
            expect(actions.every(event => Array.isArray(event.explanation) && event.explanation.length >= 3)).toBe(true);
            expect(market.stock.grain).toBeGreaterThanOrEqual(0);
            expect(market.balanceSheet().balanced).toBe(true);
            expect(market.history.length).toBeLessThanOrEqual(520);
        }
    });

    it('keeps explanations actor-local and excludes hidden route truth', () => {
        const society = runAudit(2631);
        const events = society.events.filter(event => event.type === 'QUEUE_AWARE_SETTLEMENT_ECONOMY');
        expect(JSON.stringify(events)).not.toContain('actualDanger');
        expect(events.every(event => !event.explanation.join(' ').includes('actualDanger'))).toBe(true);
        expect(new Set(events.map(event => event.recipientId).filter(Boolean))).toEqual(new Set(['a-scout', 'b-scout']));
    });

    it('round-trips the complete audited state exactly', () => {
        const society = runAudit(2641);
        const snapshot = society.serialize();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot)));
        const restoredSnapshot = restored.serialize();
        expect(restoredSnapshot.events).toEqual(snapshot.events);
        expect(restoredSnapshot.markets).toEqual(snapshot.markets);
        expect(restoredSnapshot.actors).toEqual(snapshot.actors);
        expect(restoredSnapshot.settlements).toEqual(snapshot.settlements);
        expect(restored.markets.get('grain').balanceSheet()).toEqual(society.markets.get('grain').balanceSheet());
    });
});
