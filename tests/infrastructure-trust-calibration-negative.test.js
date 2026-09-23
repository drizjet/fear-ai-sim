import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

function reportedWorld({ trust = 1, danger = 2.3 } = {}) {
    const society = new SocietyCore({ seed: 811 + Math.round(trust * 100) });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
    society.addRoamingGroup('g', { loot: 20 });
    const actor = { id: `actor-${trust}`, beliefs: new Map() };
    society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: danger, confidence: 1, sourceTrust: trust, recipients: [actor] }] });
    society.tick();
    society.deliverRumors([actor]);
    return { society, actor };
}

describe('RESP-INFRASTRUCTURE-REPORT-TRUST-CALIBRATION-NEGATIVE-001', () => {
    it('negative control proves removing actor belief removes report influence', () => {
        const withBelief = reportedWorld({ trust: 1 });
        const withoutBelief = reportedWorld({ trust: 1 });
        withoutBelief.actor.beliefs.clear();
        withBelief.society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: withBelief.actor.id, group: 'g', routeId: 'road', riskThreshold: 2, uncertaintyBuffer: .5, lootLoss: 4 }] });
        withoutBelief.society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: withoutBelief.actor.id, group: 'g', routeId: 'road', riskThreshold: 2, uncertaintyBuffer: .5, lootLoss: 4 }] });
        expect(withBelief.society.events.at(-1).outcome).toBe('RAID');
        expect(withoutBelief.society.events.at(-1)).toMatchObject({ outcome: 'PASS', lootLoss: 0 });
    });

    it('stale confidence weakens influence without deleting provenance', () => {
        const { society, actor } = reportedWorld({ trust: 1, danger: 2.1 });
        const fresh = actor.beliefs.get('route:road:danger').confidence;
        for (let i = 0; i < 20; i++) society.tick();
        const staleBelief = actor.beliefs.get('route:road:danger');
        expect(staleBelief.confidence).toBeLessThan(fresh);
        expect(staleBelief.evidence.at(-1).source).toBe('encounter');
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: actor.id, group: 'g', routeId: 'road', riskThreshold: 2, uncertaintyBuffer: .5, lootLoss: 2 }] });
        expect(society.events.at(-1).provenance.source).toBe('encounter');
    });

    it('hidden route truth does not alter a belief-driven outcome', () => {
        const first = reportedWorld({ trust: 1, danger: 2.3 });
        const second = reportedWorld({ trust: 1, danger: 2.3 });
        first.society.routes.edges[0].actualDanger = -999;
        second.society.routes.edges[0].actualDanger = 999;
        const action = { kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', actorId: first.actor.id, group: 'g', routeId: 'road', riskThreshold: 2, uncertaintyBuffer: .5, lootLoss: 4 };
        first.society.tick({ actions: [action] });
        second.society.tick({ actions: [{ ...action, actorId: second.actor.id }] });
        const left = first.society.events.at(-1), right = second.society.events.at(-1);
        expect({ outcome: left.outcome, lootLoss: left.lootLoss, trust: left.trust }).toEqual({ outcome: right.outcome, lootLoss: right.lootLoss, trust: right.trust });
    });

    it('negative-control state remains exact after JSON round-trip', () => {
        const { society } = reportedWorld({ trust: .2, danger: 2.1 });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
