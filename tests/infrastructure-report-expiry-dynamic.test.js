import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-REPORT-EVIDENCE-EXPIRY-DYNAMIC-001', () => {
    it('keeps active deliveries alive while expiring stale unqueued reports', () => {
        const society = new SocietyCore({ seed: 1001 });
        const recipient = { id: 'merchant' };
        let delivered = 0;
        for (let i = 0; i < 1000; i++) {
            const rumor = society.rumors.publish({ claim: `report-${i}`, valueEstimate: i, timestamp: society.now() });
            if (i % 10 === 0) society.queueRumor(rumor, recipient, { delay: 2, ttl: 20 });
            society.time += 1;
            delivered += society.rumors.deliverDue([recipient], { now: () => society.now() }).length;
            society.rumors.expireStale({ now: () => society.now(), maxAge: 100 });
        }
        expect(delivered).toBeGreaterThan(0);
        expect(society.rumors.rumors.length).toBeLessThanOrEqual(2048);
        expect(society.rumors.queue.length).toBeLessThanOrEqual(4096);
        expect(society.rumors.rumors.every(rumor => rumor.timestamp >= society.now() - 100 || society.rumors.queue.some(item => item.rumorId === rumor.id))).toBe(true);
    });

    it('negative control prevents stale unqueued reports from influencing new beliefs', () => {
        const society = new SocietyCore({ seed: 1002 });
        const old = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 9, timestamp: 0 });
        society.time = 101;
        expect(society.rumors.expireStale({ now: () => society.now(), maxAge: 100 })).toBe(1);
        const actor = { id: 'merchant' };
        society.rumors.deliverDue([actor], { now: () => society.now() });
        expect(actor.beliefs).toBeUndefined();
        expect(society.rumors.rumors).not.toContainEqual(old);
    });

    it('does not expire a queued report before its delivery window', () => {
        const society = new SocietyCore({ seed: 1003 });
        const rumor = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 5, timestamp: 0 });
        const actor = { id: 'merchant' };
        society.queueRumor(rumor, actor, { delay: 100, ttl: 10 });
        society.time = 101;
        society.rumors.expireStale({ now: () => society.now(), maxAge: 10 });
        expect(society.rumors.rumors).toContainEqual(rumor);
        const delivered = society.rumors.deliverDue([actor], { now: () => society.now() });
        expect(delivered).toHaveLength(1);
        expect(actor.beliefs.get('route:road:danger').estimate).toBe(5);
    });
});
