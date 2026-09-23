import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

function setup(trust, danger = 1.8) {
    const society = new SocietyCore({ seed: 701 + Math.round(trust * 100) });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
    society.addRoamingGroup('g', { loot: 20 });
    const actor = { id: `actor-${trust}`, beliefs: new Map() };
    society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: danger, confidence: 1, sourceTrust: trust, recipients: [actor] }] });
    society.tick();
    society.deliverRumors([actor]);
    return { society, actor };
}

describe('RESP-INFRASTRUCTURE-REPORT-TRUST-CALIBRATION-001', () => {
    it('trust changes non-saturated categorical encounter decisions', () => {
        const trusted = setup(1, 2.3);
        const uncertain = setup(.2, 2.3);
        trusted.society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: trusted.actor.id, group: 'g', routeId: 'road', riskThreshold: 2, uncertaintyBuffer: .5, lootLoss: 4 }] });
        uncertain.society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: uncertain.actor.id, group: 'g', routeId: 'road', riskThreshold: 2, uncertaintyBuffer: .5, lootLoss: 4 }] });
        const trustedEvent = trusted.society.events.at(-1);
        const uncertainEvent = uncertain.society.events.at(-1);
        expect(trustedEvent.outcome).toBe('RAID');
        expect(uncertainEvent.outcome).toBe('PASS');
        expect(trustedEvent.trust).toBeGreaterThan(uncertainEvent.trust);
        expect(uncertainEvent.lootLoss).toBe(0);
    });

    it('trust changes loss severity while preserving conservation over a long probe', () => {
        const results = [1, .5, .2].map(trust => {
            const { society, actor } = setup(trust, 1.8);
            for (let i = 0; i < 1000; i++) society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: actor.id, group: 'g', routeId: 'road', riskThreshold: 2, lootLoss: .1 }] });
            const group = society.roamingGroups.get('g');
            const encounters = society.events.filter(event => event.type === 'ROAMING_GROUP_ROUTE_ENCOUNTER');
            return { trust, group, encounters, serialized: society.serialize() };
        });
        expect(results[0].group.loot).toBeGreaterThanOrEqual(results[1].group.loot);
        expect(results[1].group.loot).toBeGreaterThanOrEqual(results[2].group.loot);
        for (const result of results) {
            expect(result.encounters).toHaveLength(1000);
            expect(result.encounters.every(event => Number.isFinite(event.lootLoss) && event.lootLoss >= 0)).toBe(true);
            expect(result.group.loot).toBeGreaterThanOrEqual(0);
            expect(result.society ?? result.serialized).toBeTruthy();
        }
    });

    it('trust calibration survives a fresh JSON runtime', () => {
        const { society } = setup(.7, 1.8);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        restored.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: 'actor-0.7', group: 'g', routeId: 'road', riskThreshold: 2 }] });
        expect(restored.events.at(-1)).toMatchObject({ outcome: 'PASS' });
        expect(restored.serialize()).toEqual(expect.objectContaining({ actors: expect.any(Object), events: expect.any(Array) }));
    });
});
