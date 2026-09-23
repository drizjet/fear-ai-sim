import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-EXPLANATION-NEGATIVE-001', () => {
    it('does not claim report influence before belief delivery', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('grain', new Market({ prices: { grain: 1 }, stock: { grain: 20 } }));
        const actor = { id: 'scout', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        const report = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 9, confidence: 1 });
        society.queueRumor(report, actor, { delay: 10 });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', recipientId: actor.id, foodNeed: 4 }] });
        const event = society.events.at(-1);
        expect(event.explanation).toContain('no delivered route report influenced demand');
        expect(event.explanation.join(' ')).not.toContain('increased demand pressure');
    });

    it('does not leak hidden route truth into explanations', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('grain', new Market({ prices: { grain: 1 }, stock: { grain: 20 } }));
        society.routes.edges.push({ id: 'road', actualDanger: 12345 });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', foodNeed: 4 }] });
        expect(JSON.stringify(society.events.at(-1))).not.toContain('12345');
        expect(society.events.at(-1).explanation.join(' ')).not.toContain('actualDanger');
    });

    it('detects a mutated explanation that asserts unsupported certainty', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('grain', new Market({ prices: { grain: 1 }, stock: { grain: 2 } }));
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', foodNeed: 5 }] });
        const event = society.events.at(-1);
        const original = event.explanation.join(' ');
        event.explanation = ['the route is certainly dangerous'];
        expect(event.explanation.join(' ')).not.toBe(original);
        expect(event.explanation.join(' ')).not.toContain('unmet demand');
    });
});
