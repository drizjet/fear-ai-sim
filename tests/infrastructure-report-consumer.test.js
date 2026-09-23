import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-CONSUMER-001', () => {
    it('uses a delivered route report in a later canonical decision', () => {
        const society = new SocietyCore();
        society.addMarket('south', new Market({ prices: { grain: 9 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const merchant = { id: 'merchant', beliefs: new Map() };
        society.actors.set(merchant.id, merchant);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, recipients: [merchant], delay: 1 }] });
        society.tick();
        society.deliverRumors([merchant]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: 'merchant', destination: 'south', good: 'grain', routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        expect(society.events.at(-1)).toMatchObject({ selectedRoute: 'road', decision: 'TRAVEL' });
    });

    it('does not affect actors before report delivery', () => {
        const society = new SocietyCore();
        society.addMarket('south', new Market({ prices: { grain: 9 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const merchant = { id: 'merchant', beliefs: new Map() };
        society.actors.set(merchant.id, merchant);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, recipients: [merchant], delay: 2 }] });
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: 'merchant', destination: 'south', good: 'grain', routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        expect(society.events.at(-1).selectedRoute).toBe('road');
    });

    it('persists delivered belief state exactly', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const merchant = { id: 'merchant', beliefs: new Map() };
        society.actors.set(merchant.id, merchant);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, recipients: [merchant], delay: 1 }] });
        society.tick(); society.deliverRumors([merchant]);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('preserves uncertainty and never exposes hidden danger', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0, actualDanger: 999 }]);
        const merchant = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 2, confidence: .4, distortion: 2, recipients: [merchant] }] });
        society.tick(); society.deliverRumors([merchant]);
        expect(merchant.beliefs.get('route:road:danger').confidence).toBeLessThan(.4);
        expect(merchant.beliefs.get('route:road:danger').evidence[0]).not.toHaveProperty('actualDanger');
    });
});
