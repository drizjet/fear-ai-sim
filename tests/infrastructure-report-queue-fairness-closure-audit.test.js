import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

function runAudit(seed, capacity, recipientCount) {
    const society = new SocietyCore({ seed });
    society.rumors.maxQueue = capacity;
    const actors = Array.from({ length: recipientCount }, (_, i) => ({ id: `audit-${i}` }));
    const deliveredByRecipient = new Map(actors.map(actor => [actor.id, 0]));
    for (let i = 0; i < 1200; i++) {
        const recipient = actors[i % 19 === 0 ? i % actors.length : (i * 11) % actors.length];
        const rumor = society.rumors.publish({ claim: `audit-${seed}-${i}`, timestamp: society.now() });
        society.queueRumor(rumor, recipient, { delay: i % 17 === 0 ? 1 : 2 + (i % 8), ttl: 25 });
        society.time += i % 3 === 0 ? 1 : 0;
        const delivered = society.rumors.deliverDue(actors, { now: () => society.now() });
        for (const item of delivered) deliveredByRecipient.set(item.recipientId, deliveredByRecipient.get(item.recipientId) + 1);
        society.rumors.expireStale({ now: () => society.now(), maxAge: 100 });
        if (society.rumors.queue.length > capacity) throw new Error(`queue exceeded capacity at ${i}`);
    }
    return { society, actors, deliveredByRecipient };
}

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-FAIRNESS-CLOSURE-AUDIT-001', () => {
    it('passes structural and dynamic bounds across varied queue regimes', () => {
        for (const [capacity, recipients] of [[2, 2], [5, 4], [13, 9], [32, 16]]) {
            const { society, actors, deliveredByRecipient } = runAudit(1900 + capacity, capacity, recipients);
            expect(society.rumors.queue.length).toBeLessThanOrEqual(capacity);
            expect(society.rumors.rumors.length).toBeLessThanOrEqual(society.rumors.maxRumors);
            expect(actors.every(actor => (deliveredByRecipient.get(actor.id) ?? 0) > 0)).toBe(true);
        }
    });

    it('preserves fairness configuration and queued entries through persistence', () => {
        const { society } = runAudit(1991, 7, 5);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.maxQueue).toBe(7);
        expect(restored.rumors.maxRumors).toBe(society.rumors.maxRumors);
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
    });

    it('retains due entries while expired deferred entries are removed', () => {
        const society = new SocietyCore({ seed: 1992 });
        society.rumors.maxQueue = 4;
        const dueRecipient = { id: 'due' }, expiredRecipient = { id: 'expired' };
        const due = society.rumors.publish({ claim: 'due', timestamp: 0 });
        const expired = society.rumors.publish({ claim: 'expired', timestamp: 0 });
        society.queueRumor(due, dueRecipient, { delay: 1, ttl: 20 });
        society.queueRumor(expired, expiredRecipient, { delay: 100, ttl: 1 });
        society.time = 1;
        expect(society.rumors.deliverDue([dueRecipient, expiredRecipient], { now: () => society.now() })).toHaveLength(1);
        society.time = 102;
        society.rumors.expireStale({ now: () => society.now(), maxAge: 10 });
        expect(society.rumors.queue).toHaveLength(0);
        expect(society.rumors.rumors.some(rumor => rumor.id === expired.id)).toBe(false);
    });
});
