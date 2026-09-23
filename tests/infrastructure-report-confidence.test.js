import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-CONFIDENCE-CONSUMER-001', () => {
    it('weights a route report by actor confidence', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: .2, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: actor.id, routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        expect(society.events.at(-1).selectedRoute).toBe('road');
    });

    it('falls back to local perception after report confidence decays', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: 1, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        for (let i = 0; i < 100; i += 1) society.tick();
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: actor.id, routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        expect(society.events.at(-1).selectedRoute).toBe('road');
    });

    it('preserves contradictory beliefs between actors', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const safe = { id: 'safe', beliefs: new Map() }, afraid = { id: 'afraid', beliefs: new Map() };
        society.actors.set(safe.id, safe); society.actors.set(afraid.id, afraid);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 0, confidence: 1, recipients: [safe] }, { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 5, confidence: 1, recipients: [afraid] }] });
        society.tick(); society.deliverRumors([safe, afraid]);
        expect(safe.beliefs.get('route:road:danger').estimate).not.toBe(afraid.beliefs.get('route:road:danger').estimate);
    });

    it('persists confidence-weighted belief state', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, confidence: .5, recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
