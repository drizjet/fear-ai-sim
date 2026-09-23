import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

function enqueue(society, recipient, claim, delay) {
    const rumor = society.rumors.publish({ claim, timestamp: society.now() });
    society.queueRumor(rumor, recipient, { delay, ttl: 30 });
    return rumor;
}

function runAdmission({ mutate }) {
    const society = new SocietyCore({ seed: 1801 });
    society.rumors.maxQueue = 6;
    if (mutate) society.rumors.maxQueue = 1000;
    const quiet = { id: 'quiet' }, dominant = { id: 'dominant' };
    const urgent = enqueue(society, quiet, 'urgent', 1);
    for (let i = 0; i < 200; i++) enqueue(society, dominant, `dominant-${i}`, 8 + i);
    society.time = 1;
    const delivered = society.rumors.deliverDue([quiet, dominant], { now: () => society.now() });
    return { society, quiet, dominant, urgent, delivered };
}

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-FAIRNESS-ADMISSION-MUTATION-001', () => {
    it('detects a mutated unbounded admission policy through recipient service', () => {
        const protectedRun = runAdmission({ mutate: false });
        const mutatedRun = runAdmission({ mutate: true });
        expect(protectedRun.delivered.some(item => item.rumorId === protectedRun.urgent.id)).toBe(true);
        expect(mutatedRun.delivered.some(item => item.rumorId === mutatedRun.urgent.id)).toBe(true);
        expect(protectedRun.society.rumors.queue.length).toBeLessThanOrEqual(6);
        expect(mutatedRun.society.rumors.queue.length).toBeGreaterThan(protectedRun.society.rumors.queue.length);
    });

    it('does not mistake aggregate queued volume for fair recipient coverage', () => {
        const society = new SocietyCore({ seed: 1802 });
        society.rumors.maxQueue = 6;
        const quiet = { id: 'quiet' }, dominant = { id: 'dominant' };
        for (let i = 0; i < 100; i++) enqueue(society, dominant, `dominant-${i}`, 20 + i);
        const quietRumor = enqueue(society, quiet, 'quiet', 50);
        const queueRecipients = new Set(society.rumors.queue.map(item => item.recipientId));
        expect(queueRecipients.has(quiet.id)).toBe(true);
        expect(society.rumors.queue.length).toBeLessThanOrEqual(6);
        expect(quietRumor.id).toBe('rumor-101');
    });

    it('preserves the mutation audit fixture through JSON persistence', () => {
        const { society } = runAdmission({ mutate: false });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
        expect(restored.rumors.maxQueue).toBe(society.rumors.maxQueue);
    });
});
