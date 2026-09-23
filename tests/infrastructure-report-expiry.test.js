import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-EXPIRY-001', () => {
    it('expires old unqueued rumors while retaining queued rumor records', () => {
        const society = new SocietyCore();
        const old = society.rumors.publish({ claim: 'old-report', timestamp: 0 });
        const active = society.rumors.publish({ claim: 'active-report', timestamp: 0 });
        const recipient = { id: 'traveler' };
        society.queueRumor(active, recipient, { delay: 200, ttl: 10 });
        society.time = 101;
        expect(society.rumors.expireStale({ now: () => society.now(), maxAge: 100 })).toBe(1);
        expect(society.rumors.rumors.map(rumor => rumor.id)).toEqual([active.id]);
    });
    it('decays stale route confidence while retaining the reported estimate', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, confidence: 1, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        const fresh = actor.beliefs.get('route:road:danger');
        expect(fresh.estimate).toBe(4);
        const confidence = fresh.confidence;
        for (let i = 0; i < 20; i += 1) society.tick();
        expect(fresh.estimate).toBe(4);
        expect(fresh.confidence).toBeLessThan(confidence);
    });

    it('keeps fresh reports stronger than stale reports', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, confidence: 1, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        const belief = actor.beliefs.get('route:road:danger');
        const before = belief.confidence;
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 2, confidence: 1, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]);
        expect(belief.confidence).toBeGreaterThan(before);
    });

    it('persists decayed belief state across fresh deserialize', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, recipients: [actor], delay: 1 }] });
        society.tick(); society.deliverRumors([actor]); society.tick();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
