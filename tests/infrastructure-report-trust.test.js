import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-TRUST-001', () => {
    it('weights report confidence by source trust', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const reliable = { id: 'reliable', beliefs: new Map(), sourceTrust: 1 }, unreliable = { id: 'unreliable', beliefs: new Map(), sourceTrust: .1 };
        society.actors.set(reliable.id, reliable); society.actors.set(unreliable.id, unreliable);
        society.tick({ actions: [
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: 1, source: 'patrol', sourceTrust: 1, recipients: [reliable] },
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: 1, source: 'rumor', sourceTrust: .1, recipients: [unreliable] },
        ] });
        society.tick(); society.deliverRumors([reliable, unreliable]);
        expect(reliable.beliefs.get('route:road:danger').confidence).toBeCloseTo(.5);
        expect(unreliable.beliefs.get('route:road:danger').confidence).toBeCloseTo(.05);
    });

    it('lets reliable reports change route choice while weak reports fall back', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const reliable = { id: 'reliable', beliefs: new Map(), sourceTrust: 1 }, unreliable = { id: 'unreliable', beliefs: new Map(), sourceTrust: .1 };
        society.actors.set(reliable.id, reliable); society.actors.set(unreliable.id, unreliable);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: 1, sourceTrust: 1, recipients: [reliable, unreliable] }] });
        society.tick(); society.deliverRumors([reliable, unreliable]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: reliable.id, routes: society.routes.edges, context: { fearSensitivity: 2 } }, { kind: 'TRADE_ROUTE_DECISION', actorId: unreliable.id, routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        const decisions = society.events.filter(event => event.type === 'TRADE_ROUTE_DECISION');
        expect(decisions[0].selectedRoute).toBe('detour');
        expect(decisions[1].selectedRoute).toBe('road');
    });

    it('persists source trust through fresh deserialize', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road' }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, confidence: .8, sourceTrust: .25, recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.rumors.at(-1).sourceTrust).toBe(.25);
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
