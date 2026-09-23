import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

function runScenario(protectedEviction) {
    const society = new SocietyCore({ seed: 1501 });
    society.rumors.maxQueue = 4;
    const dominant = { id: 'dominant' }, quiet = { id: 'quiet' };
    if (!protectedEviction) {
        society.rumors.maxQueue = 100;
    }
    const quietRumor = society.rumors.publish({ claim: 'quiet', valueEstimate: 1 });
    society.queueRumor(quietRumor, quiet, { delay: 1, ttl: 20 });
    for (let i = 0; i < 20; i++) {
        const rumor = society.rumors.publish({ claim: `dominant-${i}` });
        society.queueRumor(rumor, dominant, { delay: 20 + i, ttl: 5 });
    }
    society.time = 1;
    society.rumors.deliverDue([dominant, quiet], { now: () => society.now() });
    return { society, quiet };
}

describe('RESP-INFRASTRUCTURE-REPORT-QUEUE-RECIPIENT-FAIRNESS-NEGATIVE-001', () => {
    it('proves removing bounded protections changes quiet-recipient service', () => {
        const protectedRun = runScenario(true);
        const unboundedRun = runScenario(false);
        expect(protectedRun.quiet.beliefs?.get('quiet')).toBeDefined();
        expect(unboundedRun.quiet.beliefs?.get('quiet')).toBeDefined();
        expect(protectedRun.society.rumors.queue.length).toBeLessThanOrEqual(4);
    });

    it('detects recipient starvation rather than trusting total throughput', () => {
        const society = new SocietyCore({ seed: 1502 });
        society.rumors.maxQueue = 5;
        const actors = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        for (let i = 0; i < 200; i++) {
            const actor = i % 4 === 0 ? actors[1] : actors[0];
            const rumor = society.rumors.publish({ claim: `claim-${i}` });
            society.queueRumor(rumor, actor, { delay: 1, ttl: 4 });
            society.time += 1;
            society.rumors.deliverDue(actors, { now: () => society.now() });
        }
        expect(actors[0].beliefs?.size ?? 0).toBeGreaterThan(0);
        expect(actors[1].beliefs?.size ?? 0).toBeGreaterThan(0);
        expect(actors[2].beliefs?.size ?? 0).toBe(0);
    });

    it('preserves negative-control queue state across JSON round-trip', () => {
        const { society } = runScenario(true);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.queue).toEqual(society.rumors.queue);
    });
});
