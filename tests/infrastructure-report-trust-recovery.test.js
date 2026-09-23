import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-TRUST-RECOVERY-001', () => {
    it('trusted refresh recovers confidence more strongly than untrusted refresh', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const trusted = { id: 'trusted', beliefs: new Map() }, untrusted = { id: 'untrusted', beliefs: new Map() };
        society.tick({ actions: [
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 5, confidence: 1, sourceTrust: 1, recipients: [trusted] },
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 5, confidence: 1, sourceTrust: .1, recipients: [untrusted] },
        ] });
        society.tick(); society.deliverRumors([trusted, untrusted]);
        for (let i = 0; i < 10; i += 1) society.tick();
        const staleTrusted = trusted.beliefs.get('route:road:danger').confidence;
        const staleUntrusted = untrusted.beliefs.get('route:road:danger').confidence;
        society.tick({ actions: [
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 5, confidence: 1, sourceTrust: 1, recipients: [trusted] },
            { kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 5, confidence: 1, sourceTrust: .1, recipients: [untrusted] },
        ] });
        society.tick(); society.deliverRumors([trusted, untrusted]);
        expect(trusted.beliefs.get('route:road:danger').confidence).toBeGreaterThan(staleTrusted);
        expect(untrusted.beliefs.get('route:road:danger').confidence).toBeGreaterThan(staleUntrusted);
        expect(trusted.beliefs.get('route:road:danger').confidence).toBeGreaterThan(untrusted.beliefs.get('route:road:danger').confidence);
    });

    it('keeps recovery state actor-local and persistent', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, confidence: .8, sourceTrust: .5, recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]); society.tick();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
        expect(restored.actors.get('merchant').beliefs.get('route:road:danger').confidence).toBeLessThan(1);
    });

    it('mutation control rejects hidden truth as a trust source', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0, actualDanger: 999 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 0, confidence: 1, sourceTrust: 1, recipients: [actor] }] });
        society.tick(); society.deliverRumors([actor]);
        expect(actor.beliefs.get('route:road:danger').estimate).toBe(0);
    });
});
