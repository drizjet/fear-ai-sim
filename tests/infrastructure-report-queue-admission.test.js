import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

function enqueueBurst({ maxQueue = 6, count = 40, recipientFor }) {
    const society = new SocietyCore({ seed: 1601 });
    society.rumors.maxQueue = maxQueue;
    const actors = Array.from({ length: 4 }, (_, i) => ({ id: `actor-${i}` }));
    for (let i = 0; i < count; i++) {
        const recipient = recipientFor(i, actors);
        const rumor = society.rumors.publish({ claim: `admission-${i}`, timestamp: society.now() });
        society.queueRumor(rumor, recipient, { delay: 2 + (i % 3), ttl: 20 });
    }
    return { society, actors };
}

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-FAIRNESS-ADMISSION-001', () => {
    it('admits a bounded mix without dropping every low-volume recipient', () => {
        const { society, actors } = enqueueBurst({
            recipientFor: (i, all) => i < 35 ? all[0] : all[i % all.length],
        });
        const recipients = new Set(society.rumors.queue.map(item => item.recipientId));
        expect(society.rumors.queue.length).toBeLessThanOrEqual(6);
        expect(recipients).toContain('actor-1');
        expect(recipients).toContain('actor-2');
        expect(recipients).toContain('actor-3');
        expect(actors).toHaveLength(4);
    });

    it('keeps imminent deliveries ahead of deferred admission pressure', () => {
        const society = new SocietyCore({ seed: 1602 });
        society.rumors.maxQueue = 5;
        const quiet = { id: 'quiet' }, dominant = { id: 'dominant' };
        const urgent = society.rumors.publish({ claim: 'urgent', timestamp: society.now() });
        society.queueRumor(urgent, quiet, { delay: 1, ttl: 20 });
        for (let i = 0; i < 100; i++) {
            const rumor = society.rumors.publish({ claim: `deferred-${i}`, timestamp: society.now() });
            society.queueRumor(rumor, dominant, { delay: 10 + i, ttl: 100 });
        }
        expect(society.rumors.queue.some(item => item.rumorId === urgent.id)).toBe(true);
        society.time = 1;
        const delivered = society.rumors.deliverDue([quiet, dominant], { now: () => society.now() });
        expect(delivered.some(item => item.rumorId === urgent.id)).toBe(true);
    });

    it('negative control shows unbounded admission can hide recipient starvation', () => {
        const { society, actors } = enqueueBurst({
            maxQueue: 200,
            recipientFor: (i, all) => i < 39 ? all[0] : all[1],
        });
        expect(society.rumors.queue.length).toBe(40);
        expect(society.rumors.queue.filter(item => item.recipientId === 'actor-2')).toHaveLength(0);
        expect(actors[0].id).toBe('actor-0');
    });
});
