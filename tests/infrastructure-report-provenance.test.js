import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-PROVENANCE-001', () => {
    it('carries source, confidence, and age into route decisions', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0 }, { id: 'detour', travelTime: 5, perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 10, confidence: 1, source: 'scout-east', recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: actor.id, routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        expect(society.events.at(-1).provenance).toMatchObject({ source: 'scout-east' });
        expect(society.events.at(-1).provenance.confidence).toBeLessThan(1);
        expect(society.events.at(-1).provenance.age).toBeGreaterThan(0);
    });

    it('reports age and confidence after information decays', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, confidence: 1, source: 'scout', recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]); society.tick();
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: actor.id, group: society.addRoamingGroup('g', { loot: 2 }).id, routeId: 'road', riskThreshold: 1 }] });
        expect(society.events.at(-1).provenance).toMatchObject({ source: 'scout', age: 3 });
        expect(society.events.at(-1).provenance.confidence).toBeLessThan(1);
    });

    it('persists provenance-bearing belief state', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 2, source: 'patrol', recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
    });
});
