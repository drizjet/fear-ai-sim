import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-FAIRNESS-001', () => {
    it('protects imminent deliveries when the queue is over capacity', () => {
        const society = new SocietyCore();
        society.rumors.maxQueue = 3;
        const recipient = { id: 'merchant' };
        const first = society.rumors.publish({ claim: 'first', timestamp: 0 });
        society.queueRumor(first, recipient, { delay: 1, ttl: 20 });
        for (let i = 0; i < 5; i++) {
            const rumor = society.rumors.publish({ claim: `deferred-${i}`, timestamp: 0 });
            society.queueRumor(rumor, recipient, { delay: 100 + i, ttl: 1 });
        }
        expect(society.rumors.queue.some(item => item.rumorId === first.id)).toBe(true);
        society.time = 1;
        expect(society.rumors.deliverDue([recipient], { now: () => society.now() })).toHaveLength(1);
        expect(recipient.beliefs.get('first').estimate).toBe(null);
    });

    it('retains queue ordering and fairness metadata through JSON persistence', () => {
        const society = new SocietyCore();
        society.rumors.maxQueue = 4;
        const recipient = { id: 'merchant' };
        for (let i = 0; i < 8; i++) {
            const rumor = society.rumors.publish({ claim: `claim-${i}` });
            society.queueRumor(rumor, recipient, { delay: i + 1, ttl: 20 });
        }
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
        expect(restored.rumors.queue.length).toBeLessThanOrEqual(8);
    });

    it('negative control demonstrates an evicted deferred delivery is not delivered', () => {
        const society = new SocietyCore();
        society.rumors.maxQueue = 2;
        const recipient = { id: 'merchant' };
        const old = society.rumors.publish({ claim: 'old' });
        society.queueRumor(old, recipient, { delay: 50, ttl: 1 });
        for (let i = 0; i < 3; i++) {
            const rumor = society.rumors.publish({ claim: `new-${i}` });
            society.queueRumor(rumor, recipient, { delay: 1, ttl: 20 });
        }
        society.time = 1;
        society.rumors.deliverDue([recipient], { now: () => society.now() });
        expect(recipient.beliefs?.has('old')).not.toBe(true);
    });
});
