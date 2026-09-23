import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-RECIPIENT-FAIRNESS-WEIGHTING-001', () => {
    it('protects the more urgent recipient under unequal queue volume', () => {
        const society = new SocietyCore({ seed: 1401 });
        society.rumors.maxQueue = 6;
        const noisy = { id: 'noisy' }, urgent = { id: 'urgent' };
        const urgentRumor = society.rumors.publish({ claim: 'urgent', valueEstimate: 10 });
        society.queueRumor(urgentRumor, urgent, { delay: 2, ttl: 20 });
        for (let i = 0; i < 20; i++) {
            const rumor = society.rumors.publish({ claim: `noisy-${i}` });
            society.queueRumor(rumor, noisy, { delay: 20 + i, ttl: 2 });
        }
        expect(society.rumors.queue.some(item => item.rumorId === urgentRumor.id)).toBe(true);
        society.time = 2;
        expect(society.rumors.deliverDue([noisy, urgent], { now: () => society.now() }).map(item => item.rumorId)).toContain(urgentRumor.id);
    });

    it('uses stable insertion order for equal-priority deferred entries', () => {
        const society = new SocietyCore({ seed: 1402 });
        society.rumors.maxQueue = 2;
        const recipient = { id: 'actor' };
        const first = society.rumors.publish({ claim: 'first' });
        const second = society.rumors.publish({ claim: 'second' });
        const third = society.rumors.publish({ claim: 'third' });
        society.queueRumor(first, recipient, { delay: 10, ttl: 10 });
        society.queueRumor(second, recipient, { delay: 10, ttl: 10 });
        society.queueRumor(third, recipient, { delay: 10, ttl: 10 });
        expect(society.rumors.queue.map(item => item.rumorId)).toEqual([second.id, third.id]);
    });

    it('preserves weighted queue state through JSON round-trip', () => {
        const society = new SocietyCore({ seed: 1403 });
        const recipient = { id: 'actor' };
        const rumor = society.rumors.publish({ claim: 'weighted', sourceTrust: .9 });
        society.queueRumor(rumor, recipient, { delay: 4, ttl: 8, distortion: .2 });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
        expect(restored.rumors.rumors).toEqual(society.rumors.rumors);
    });
});
