import { describe, expect, it } from '@jest/globals';
import { SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-ENCOUNTER-REPORTING-001', () => {
    it('queues a delayed uncertain route report instead of mutating beliefs globally', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0, actualDanger: 99 }]);
        const recipient = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 4, confidence: .6, recipients: [recipient], delay: 2, distortion: 1 }] });
        expect(recipient.beliefs.size).toBe(0);
        expect(society.events.at(-1).parentId).toBe(society.events[0].id);
        society.tick();
        expect(recipient.beliefs.size).toBe(0);
        society.tick();
        society.deliverRumors([recipient]);
        expect(recipient.beliefs.get('route:road:danger').estimate).toBe(5);
        expect(recipient.beliefs.get('route:road:danger').confidence).toBeLessThan(.6);
    });

    it('preserves report queue and belief state across fresh deserialize', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 2 }]);
        const recipient = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 3, recipients: [recipient], delay: 3 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('does not expose actual danger in the report or rumor', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 1, actualDanger: 100 }]);
        const recipient = { id: 'merchant', beliefs: new Map() };
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_ENCOUNTER_REPORT', routeId: 'road', perceivedDanger: 2, recipients: [recipient] }] });
        expect(society.events.at(-1)).not.toHaveProperty('actualDanger');
        expect(society.rumors.rumors.at(-1)).not.toHaveProperty('actualDanger');
    });
});
