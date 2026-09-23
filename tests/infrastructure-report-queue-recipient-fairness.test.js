import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-RECIPIENT-FAIRNESS-001', () => {
    it('prevents one recipient from monopolizing imminent queue capacity', () => {
        const society = new SocietyCore({ seed: 1301 });
        society.rumors.maxQueue = 6;
        const dominant = { id: 'dominant' }, quiet = { id: 'quiet' };
        const protectedRumor = society.rumors.publish({ claim: 'quiet-report', valueEstimate: 9 });
        society.queueRumor(protectedRumor, quiet, { delay: 1, ttl: 20 });
        for (let i = 0; i < 30; i++) {
            const rumor = society.rumors.publish({ claim: `dominant-${i}`, valueEstimate: i });
            society.queueRumor(rumor, dominant, { delay: 1, ttl: 5 });
        }
        society.time = 1;
        const delivered = society.rumors.deliverDue([dominant, quiet], { now: () => society.now() });
        expect(delivered.map(item => item.rumorId)).toContain(protectedRumor.id);
        expect(quiet.beliefs.get('quiet-report').estimate).toBe(9);
    });

    it('preserves recipient distribution through JSON persistence', () => {
        const society = new SocietyCore({ seed: 1302 });
        society.rumors.maxQueue = 8;
        const actors = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        for (let i = 0; i < 20; i++) {
            const rumor = society.rumors.publish({ claim: `claim-${i}` });
            society.queueRumor(rumor, actors[i % actors.length], { delay: 10 + i, ttl: 20 });
        }
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
        expect(new Set(restored.rumors.queue.map(item => item.recipientId)).size).toBeGreaterThan(1);
    });

    it('dynamic mixed-recipient churn stays bounded and serves all recipients', () => {
        const society = new SocietyCore({ seed: 1303 });
        society.rumors.maxQueue = 32;
        const actors = Array.from({ length: 5 }, (_, i) => ({ id: `actor-${i}` }));
        for (let i = 0; i < 1000; i++) {
            const actor = actors[i % actors.length];
            const rumor = society.rumors.publish({ claim: `mixed-${i}`, valueEstimate: i, timestamp: society.now() });
            society.queueRumor(rumor, actor, { delay: i % 7 === 0 ? 1 : 4 + (i % 4), ttl: 12 });
            society.time += 1;
            society.rumors.deliverDue(actors, { now: () => society.now() });
            society.rumors.expireStale({ now: () => society.now(), maxAge: 100 });
        }
        expect(actors.every(actor => actor.beliefs && actor.beliefs.size > 0)).toBe(true);
        expect(society.rumors.queue.length).toBeLessThanOrEqual(32);
        expect(society.rumors.rumors.length).toBeLessThanOrEqual(2048);
    });
});
