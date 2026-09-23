import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-ENCOUNTER-FEEDBACK-001', () => {
    it('uses a delivered report to change later encounter exposure', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        society.addRoamingGroup('g', { loot: 5 });
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: 'merchant', group: 'g', routeId: 'road', riskThreshold: 3, lootLoss: 2 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'RAID', reportedDanger: 4, lootLoss: .5 });
        expect(society.lootBalanceSheet(society.roamingGroups.get('g')).balanced).toBe(true);
    });

    it('keeps the encounter unchanged before a report arrives', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        society.addRoamingGroup('g', { loot: 5 });
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, recipients: [actor], delay: 2 }] });
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: 'merchant', group: 'g', routeId: 'road', riskThreshold: 3, lootLoss: 2 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'PASS', reportedDanger: null, lootLoss: 0 });
    });

    it('persists actor belief and encounter state', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        society.addRoamingGroup('g', { loot: 5 });
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
