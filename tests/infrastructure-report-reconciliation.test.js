import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

function deliverReports(reports) {
    const society = new SocietyCore({ seed: 907 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
    const actor = { id: 'merchant', beliefs: new Map() };
    society.actors.set(actor.id, actor);
    society.tick({ actions: reports.map(report => ({ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', recipients: [actor], ...report })) });
    society.tick();
    society.deliverRumors([actor]);
    return { society, actor };
}

describe('RESP-INFRASTRUCTURE-REPORT-TRUST-RECONCILIATION-001', () => {
    it('retains evidence history while latest report remains the explicit estimate', () => {
        const { actor } = deliverReports([
            { perceivedDanger: 4, confidence: 1, source: 'trusted-scout', sourceTrust: 1 },
            { perceivedDanger: 0, confidence: 1, source: 'distant-scout', sourceTrust: .2 },
        ]);
        const belief = actor.beliefs.get('route:road:danger');
        expect(belief.estimate).toBe(0);
        expect(belief.evidence).toHaveLength(2);
        expect(belief.evidence.map(item => item.source)).toEqual(['trusted-scout', 'distant-scout']);
        expect(belief.confidence).toBeGreaterThan(0);
    });

    it('keeps contradictory reports actor-local', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const left = { id: 'left', beliefs: new Map() }, right = { id: 'right', beliefs: new Map() };
        society.actors.set(left.id, left); society.actors.set(right.id, right);
        society.tick({ actions: [
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 5, sourceTrust: 1, recipients: [left] },
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 0, sourceTrust: 1, recipients: [right] },
        ] });
        society.tick(); society.deliverRumors([left, right]);
        expect(left.beliefs.get('route:road:danger').estimate).toBe(5);
        expect(right.beliefs.get('route:road:danger').estimate).toBe(0);
    });

    it('persists the full contradictory evidence chain', () => {
        const { society } = deliverReports([
            { perceivedDanger: 3, confidence: .8, source: 'a', sourceTrust: 1 },
            { perceivedDanger: 1, confidence: .6, source: 'b', sourceTrust: .5 },
        ]);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
