import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-CONFLICTING-REPORTS-001', () => {
    it('preserves contradictory scout reports for different actors', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const cautious = { id: 'cautious', beliefs: new Map() }, confident = { id: 'confident', beliefs: new Map() };
        society.actors.set(cautious.id, cautious); society.actors.set(confident.id, confident);
        society.tick({ actions: [
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: 1, source: 'scout-east', recipients: [cautious] },
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 0, confidence: 1, source: 'scout-west', recipients: [confident] },
        ] });
        society.tick(); society.deliverRumors([cautious, confident]);
        expect(cautious.beliefs.get('route:road:danger').estimate).toBe(10);
        expect(confident.beliefs.get('route:road:danger').estimate).toBe(0);
        expect(cautious.beliefs.get('route:road:danger').evidence[0].source).toBe('scout-east');
        expect(confident.beliefs.get('route:road:danger').evidence[0].source).toBe('scout-west');
    });

    it('produces divergent decisions from contradictory local beliefs', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const cautious = { id: 'cautious', beliefs: new Map() }, confident = { id: 'confident', beliefs: new Map() };
        society.actors.set(cautious.id, cautious); society.actors.set(confident.id, confident);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: 1, recipients: [cautious] }, { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 0, confidence: 1, recipients: [confident] }] });
        society.tick(); society.deliverRumors([cautious, confident]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: 'cautious', routes: society.routes.edges, context: { fearSensitivity: 2 } }, { kind: 'TRADE_ROUTE_DECISION', actorId: 'confident', routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        const decisions = society.events.filter(event => event.type === 'TRADE_ROUTE_DECISION');
        expect(decisions.map(event => event.selectedRoute)).toEqual(['detour', 'road']);
    });

    it('persists contradictory provenance across a fresh runtime', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, confidence: .7, source: 'scout', recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
    });
});
