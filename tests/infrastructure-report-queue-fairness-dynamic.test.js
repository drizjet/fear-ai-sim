import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-FAIRNESS-DYNAMIC-001', () => {
    it('delivers imminent reports across recipients during sustained churn', () => {
        const society = new SocietyCore({ seed: 1101 });
        society.rumors.maxQueue = 24;
        const recipients = Array.from({ length: 4 }, (_, i) => ({ id: `actor-${i}` }));
        const imminent = [];
        for (let i = 0; i < 1000; i++) {
            const recipient = recipients[i % recipients.length];
            const rumor = society.rumors.publish({ claim: `report-${i}`, valueEstimate: i, timestamp: society.now() });
            const delay = i % 25 === 0 ? 1 : 50 + (i % 10);
            society.queueRumor(rumor, recipient, { delay, ttl: delay + 20 });
            if (delay === 1) imminent.push(rumor.id);
            society.time += 1;
            society.rumors.deliverDue(recipients, { now: () => society.now() });
            society.rumors.expireStale({ now: () => society.now(), maxAge: 100 });
        }
        const deliveredClaims = recipients.flatMap(actor => [...(actor.beliefs?.keys() ?? [])]);
        expect(deliveredClaims.length).toBeGreaterThan(0);
        expect(society.rumors.queue.length).toBeLessThanOrEqual(24);
        expect(society.rumors.rumors.length).toBeLessThanOrEqual(2048);
        expect(imminent.every(id => !society.rumors.queue.some(item => item.rumorId === id))).toBe(true);
    });

    it('does not let deferred churn displace an imminent queued report', () => {
        const society = new SocietyCore({ seed: 1102 });
        society.rumors.maxQueue = 5;
        const recipient = { id: 'actor' };
        const urgent = society.rumors.publish({ claim: 'urgent', timestamp: 0 });
        society.queueRumor(urgent, recipient, { delay: 1, ttl: 100 });
        for (let i = 0; i < 100; i++) {
            const rumor = society.rumors.publish({ claim: `deferred-${i}`, timestamp: 0 });
            society.queueRumor(rumor, recipient, { delay: 20 + i, ttl: 2 });
        }
        society.time = 1;
        const delivered = society.rumors.deliverDue([recipient], { now: () => society.now() });
        expect(delivered.map(item => item.rumorId)).toContain(urgent.id);
        expect(recipient.beliefs.get('urgent')).toBeDefined();
    });
});
