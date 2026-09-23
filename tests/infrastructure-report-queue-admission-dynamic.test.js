import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

function runProbe(seed, maxQueue, recipientCount) {
    const society = new SocietyCore({ seed });
    society.rumors.maxQueue = maxQueue;
    const actors = Array.from({ length: recipientCount }, (_, i) => ({ id: `recipient-${i}` }));
    for (let i = 0; i < 500; i++) {
        const actor = actors[i % 13 === 0 ? i % recipientCount : (i * 7) % recipientCount];
        const rumor = society.rumors.publish({ claim: `dynamic-${seed}-${i}`, timestamp: society.now() });
        society.queueRumor(rumor, actor, { delay: i % 9 === 0 ? 1 : 3 + (i % 6), ttl: 30 });
        if (i % 2 === 0) society.time += 1;
        society.rumors.deliverDue(actors, { now: () => society.now() });
        society.rumors.expireStale({ now: () => society.now(), maxAge: 100 });
    }
    return { society, actors };
}

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-FAIRNESS-ADMISSION-DYNAMIC-001', () => {
    it('remains bounded and serves every recipient across changing capacities', () => {
        for (const [capacity, recipients] of [[3, 2], [7, 5], [19, 11], [32, 17]]) {
            const { society, actors } = runProbe(1700 + capacity, capacity, recipients);
            expect(society.rumors.queue.length).toBeLessThanOrEqual(capacity);
            expect(actors.every(actor => (actor.beliefs?.size ?? 0) > 0)).toBe(true);
            expect(society.rumors.rumors.length).toBeLessThanOrEqual(2048);
        }
    });

    it('preserves bounded admission state through JSON round-trip', () => {
        const { society } = runProbe(1799, 9, 6);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
        expect(restored.rumors.rumors).toEqual(society.rumors.rumors);
    });
});
