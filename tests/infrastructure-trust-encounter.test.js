import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-TRUST-ENCOUNTER-001', () => {
    it('trusted danger reports produce stronger encounter consequences', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        society.addRoamingGroup('trusted-group', { loot: 10 });
        society.addRoamingGroup('uncertain-group', { loot: 10 });
        const trusted = { id: 'trusted', beliefs: new Map() }, uncertain = { id: 'uncertain', beliefs: new Map() };
        society.tick({ actions: [
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, confidence: 1, sourceTrust: 1, recipients: [trusted] },
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, confidence: .2, sourceTrust: .2, recipients: [uncertain] },
        ] });
        society.tick(); society.deliverRumors([trusted, uncertain]);
        society.tick({ actions: [
            { kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: 'trusted', group: 'trusted-group', routeId: 'road', riskThreshold: 2, lootLoss: 4 },
            { kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: 'uncertain', group: 'uncertain-group', routeId: 'road', riskThreshold: 2, lootLoss: 4 },
        ] });
        const encounters = society.events.filter(event => event.type === 'ROAMING_GROUP_ROUTE_ENCOUNTER');
        expect(encounters[0].outcome).toBe('RAID');
        expect(encounters[0].lootLoss).toBeCloseTo(1.74, 1);
        expect(encounters[1].outcome).toBe('RAID');
        expect(encounters[1].trust).toBeLessThan(encounters[0].trust);
        expect(society.lootBalanceSheet(society.roamingGroups.get('trusted-group')).balanced).toBe(true);
    });

    it('persists trust-weighted encounter state', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 1 }]);
        society.addRoamingGroup('g', { loot: 5 });
        const actor = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, confidence: .7, sourceTrust: .5, recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: actor.id, group: 'g', routeId: 'road', riskThreshold: 2 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('mutation control removes trusted report influence', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        society.addRoamingGroup('g', { loot: 5 });
        const actor = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 2, confidence: 1, sourceTrust: 1, recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        actor.beliefs.clear();
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: actor.id, group: 'g', routeId: 'road', riskThreshold: 2, lootLoss: 2 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'PASS', lootLoss: 0, trust: 1 });
    });
});
