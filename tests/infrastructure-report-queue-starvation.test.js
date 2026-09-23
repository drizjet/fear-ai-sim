import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-FAIRNESS-STARVATION-001', () => {
    it('delivers an older valid deferred report before its expiry', () => {
        const society = new SocietyCore({ seed: 1201 });
        society.rumors.maxQueue = 6;
        const recipient = { id: 'actor' };
        const deferred = society.rumors.publish({ claim: 'deferred', valueEstimate: 7, timestamp: 0 });
        society.queueRumor(deferred, recipient, { delay: 5, ttl: 20 });
        for (let tick = 0; tick < 5; tick++) {
            for (let i = 0; i < 3; i++) {
                const rumor = society.rumors.publish({ claim: `urgent-${tick}-${i}`, valueEstimate: i, timestamp: society.now() });
                society.queueRumor(rumor, recipient, { delay: 1, ttl: 5 });
            }
            society.time += 1;
            society.rumors.deliverDue([recipient], { now: () => society.now() });
            society.rumors.expireStale({ now: () => society.now(), maxAge: 100 });
        }
        expect(recipient.beliefs.get('deferred').estimate).toBe(7);
    });

    it('does not evict a valid delivery solely because newer urgent entries arrive', () => {
        const society = new SocietyCore({ seed: 1202 });
        society.rumors.maxQueue = 3;
        const recipient = { id: 'actor' };
        const valid = society.rumors.publish({ claim: 'valid', timestamp: 0 });
        society.queueRumor(valid, recipient, { delay: 4, ttl: 20 });
        for (let i = 0; i < 20; i++) {
            const urgent = society.rumors.publish({ claim: `urgent-${i}`, timestamp: society.now() });
            society.queueRumor(urgent, recipient, { delay: 1, ttl: 2 });
            society.time += 1;
            society.rumors.deliverDue([recipient], { now: () => society.now() });
        }
        expect(recipient.beliefs.get('valid')).toBeDefined();
    });

    it('preserves starvation-test queue state through JSON round-trip', () => {
        const society = new SocietyCore({ seed: 1203 });
        const recipient = { id: 'actor' };
        const rumor = society.rumors.publish({ claim: 'valid', valueEstimate: 4 });
        society.queueRumor(rumor, recipient, { delay: 3, ttl: 10 });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
    });
});
