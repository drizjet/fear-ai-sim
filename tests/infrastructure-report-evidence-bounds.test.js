import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-EVIDENCE-BOUNDS-001', () => {
    it('bounds belief evidence while retaining the latest report', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'actor', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        for (let i = 0; i < 300; i++) {
            society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: i, source: `scout-${i}`, recipients: [actor] }] });
            society.deliverRumors([actor]);
        }
        const belief = actor.beliefs.get('route:road:danger');
        expect(belief.evidence.length).toBeLessThanOrEqual(128);
        expect(belief.estimate).toBe(298);
        expect(belief.evidence.at(-1).source).toBe('scout-298');
    });

    it('bounds rumors and queued deliveries without changing latest belief behavior', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'actor', beliefs: new Map() };
        for (let i = 0; i < 2500; i++) society.executeAction({ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: i, recipients: [actor], delay: 100 });
        expect(society.rumors.rumors.length).toBeLessThanOrEqual(2048);
        expect(society.rumors.queue.length).toBeLessThanOrEqual(4096);
    });

    it('preserves bounded evidence and provenance through JSON round-trip', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'actor', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, source: 'scout', sourceTrust: .8, recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const belief = restored.actors.get('actor').beliefs.get('route:road:danger');
        expect(belief.evidence.at(-1)).toMatchObject({ source: 'scout', sourceTrust: .8 });
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
