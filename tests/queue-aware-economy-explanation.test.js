import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-EXPLANATION-001', () => {
    it('explains whether delivered information changed economic demand', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('grain', new Market({ prices: { grain: 1 }, stock: { grain: 50 } }));
        const actor = { id: 'scout', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        const report = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 2, confidence: .8, source: 'scout' });
        society.rumors.spread(report, [actor], { now: () => society.now() });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', recipientId: actor.id, foodNeed: 5 }] });
        const event = society.events.at(-1);
        expect(event.explanation).toEqual(expect.arrayContaining(['base demand 5', expect.stringContaining('actor report increased demand pressure')]));
        expect(event.explanation.join(' ')).not.toContain('actualDanger');
    });

    it('explains shortage without exposing hidden route truth', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('grain', new Market({ prices: { grain: 1 }, stock: { grain: 1 } }));
        society.routes.edges.push({ id: 'road', actualDanger: 999 });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', foodNeed: 5 }] });
        const event = society.events.at(-1);
        expect(event.explanation).toContain('unmet demand 4');
        expect(JSON.stringify(event)).not.toContain('999');
    });

    it('persists explanations with their causal event', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('grain', new Market({ prices: { grain: 1 }, stock: { grain: 10 } }));
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', foodNeed: 3 }] });
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
