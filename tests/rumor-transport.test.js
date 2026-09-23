import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-RUMOR-TRANSPORT-001', () => {
    it('does not deliver a queued rumor before its arrival tick', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'road-danger', valueEstimate: true });
        const near = { id: 'near' }; const far = { id: 'far' };
        society.queueRumor(rumor, near, { delay: 2 });
        society.queueRumor(rumor, far, { delay: 4 });
        society.deliverRumors([near, far]);
        expect(near.beliefs).toBeUndefined();
        society.tick(); society.deliverRumors([near, far]);
        expect(near.beliefs).toBeUndefined();
        society.tick(); society.deliverRumors([near, far]);
        expect(near.beliefs.get('road-danger').estimate).toBe(true);
        expect(far.beliefs).toBeUndefined();
    });

    it('expires undelivered rumors and preserves queue through save/load', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'border-closed' });
        const recipient = { id: 'traveler' };
        society.queueRumor(rumor, recipient, { delay: 3, ttl: -1 });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const restoredRecipient = { id: 'traveler' };
        restored.tick(); restored.deliverRumors([]);
        restored.tick(); restored.deliverRumors([]);
        restored.tick(); restored.deliverRumors([restoredRecipient]);
        expect(restoredRecipient.beliefs).toBeUndefined();
        expect(restored.rumors.queue).toHaveLength(0);
    });

    it('routes a rumor through explicit hops with hop delay and distortion', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'bandits-near-road', valueEstimate: 2, confidence: .9, source: 'scout' });
        const relay = { id: 'relay' }; const recipient = { id: 'merchant' };
        society.queueRumor(rumor, relay, { delay: 1, ttl: 10, distortion: 1 });
        society.tick(); society.deliverRumors([relay]);
        expect(relay.beliefs.get(rumor.claim).estimate).toBe(3);
        const relayed = society.rumors.publish({ claim: rumor.claim, valueEstimate: 3, confidence: .6, source: 'relay' });
        society.queueRumor(relayed, recipient, { delay: 2, ttl: 10 });
        society.tick(); society.deliverRumors([recipient]);
        expect(recipient.beliefs).toBeUndefined();
        society.tick(); society.deliverRumors([recipient]);
        expect(recipient.beliefs.get(rumor.claim).estimate).toBe(3);
        expect(recipient.beliefs.get(rumor.claim).evidence[0].source).toBe('relay');
    });
});
