import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('SocietyCore', () => {
    it('spreads a rumor into recipient belief state', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'road-a-dangerous', subject: 'road-a', valueEstimate: true, source: 'witness', confidence: 0.8, timestamp: 1 });
        const recipient = { beliefs: new Map(), sourceTrust: 0.9 };
        society.rumors.spread(rumor, [recipient]);
        expect(recipient.beliefs.get('road-a-dangerous').estimate).toBe(true);
        expect(recipient.beliefs.get('road-a-dangerous').confidence).toBeGreaterThan(0);
    });
    it('updates market prices under shortage', () => {
        const market = new Market({ prices: { grain: 1 }, stock: { grain: 10 } });
        market.update({ demand: { grain: 20 }, supply: { grain: 0 } });
        expect(market.prices.grain).toBeGreaterThan(1);
    });
    it('chooses the cheapest perceived route and tracks traffic', () => {
        const routes = new RouteNetwork();
        const selected = routes.chooseRoute([{ id: 'safe', travelTime: 10, perceivedDanger: 0 }, { id: 'fast', travelTime: 2, perceivedDanger: 10 }], { fearSensitivity: 2 });
        expect(selected.id).toBe('safe');
        expect(routes.travel(selected, 5)).toBe(true);
        expect(selected.traffic).toBe(5);
    });
    it('computes crime, reporting, justice, legitimacy, and migration', () => {
        const society = new SocietyCore();
        expect(society.resolveCrime({ reward: 10, apprehension: 1, sanction: 20 })).toBe(-10);
        expect(society.reportCrime({ legitimacy: 1, trust: 1, duty: 1, retaliationFear: 0 })).toBe(1);
        expect(society.accessToJustice({ remedy: 1, legitimacy: 1, friction: 0, risk: 0 })).toBe(1);
        expect(society.updateLegitimacy(0.5, { injustice: 1 })).toBeLessThan(0.5);
        expect(society.shouldMigrate({ fear: 1, routeDanger: 1, foodSecurity: 0, legitimacy: 0 })).toBe(true);
    });
});
