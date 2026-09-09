import { describe, expect, it } from '@jest/globals';
import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';

// Betrayal-path chunk: host-reported semantic social events reach the
// BETRAYAL_ABANDONMENT trauma loop end to end. Previously only
// NEAR_DEATH_SURVIVAL was ever incurred by the runtime, so the
// agreeableness-erosion code had no live path.
function world(seed = 5) {
    const sim = new RuntimeSimulation({ seed });
    sim.registerAgent('victim', { agreeableness: 0.7 });
    sim.registerAgent('betrayer', {});
    sim.registerAgent('friend', {});
    return sim;
}

function calm(sim, n) {
    for (let t = 0; t < n; t++) {
        sim.batchTick([{ agent_id: 'victim' }, { agent_id: 'betrayer' }, { agent_id: 'friend' }], 0.0166);
    }
}

describe('betrayal-path erosion in runtime', () => {
    it('BETRAYAL wounds trust and incurs betrayal trauma on the victim', () => {
        const sim = world();
        const r = sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim', weight: 1.5 });
        expect(typeof r.traumaId).toBe('string');
        const rel = sim.social.getRelationship('victim', 'betrayer');
        expect(rel.trust).toBeLessThan(0);
        expect(rel.grievance).toBeGreaterThan(0);
        const rec = sim.coreTrauma.agentRecords.get('victim');
        expect(rec.activeTraumas.length).toBe(1);
        expect(rec.activeTraumas[0].type).toBe('BETRAYAL_ABANDONMENT');
    });

    it('unrepaired betrayal crystallizes under calm and erodes agreeableness', () => {
        const sim = world();
        sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim', weight: 2.0, severity: 1.0 });
        calm(sim, 250);
        const rec = sim.coreTrauma.agentRecords.get('victim');
        expect(rec.crystallizedTraumas.length).toBe(1);
        expect(rec.crystallizedTraumas[0].type).toBe('BETRAYAL_ABANDONMENT');
        const a = sim.agents.get('victim').traits.agreeableness;
        expect(a).toBeLessThan(0.7);
        expect(a).toBeGreaterThanOrEqual(0.1);
    });

    it('social repair defuses betrayal without personality alteration', () => {
        const sim = world();
        sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim', weight: 2.0, severity: 1.0 });
        for (let i = 0; i < 3; i++) {
            sim.reportSocialEvent({ event: 'AID', actorId: 'friend', targetId: 'victim' });
        }
        calm(sim, 250);
        const rec = sim.coreTrauma.agentRecords.get('victim');
        expect(rec.crystallizedTraumas.length).toBe(0);
        expect(rec.activeTraumas.length).toBe(0);
        expect(sim.agents.get('victim').traits.agreeableness).toBe(0.7);
    });

    it('kind events incur no trauma and build trust', () => {
        const sim = world();
        const r = sim.reportSocialEvent({ event: 'AID', actorId: 'friend', targetId: 'victim' });
        expect(r.traumaId).toBeNull();
        expect(sim.coreTrauma.agentRecords.get('victim').activeTraumas.length).toBe(0);
        expect(sim.social.getRelationship('victim', 'friend').trust).toBeGreaterThan(0);
    });

    it('erosion is deterministic per seed', () => {
        const run = () => {
            const sim = world(11);
            sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim', weight: 2.0, severity: 1.0 });
            calm(sim, 250);
            return sim.agents.get('victim').traits.agreeableness;
        };
        expect(run()).toBe(run());
    });

    it('contract: unknown participants and events throw; disabled social returns null', () => {
        const sim = world();
        expect(() => sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'ghost', targetId: 'victim' }))
            .toThrow('UNKNOWN_SOCIAL_AGENT');
        expect(() => sim.reportSocialEvent({ event: 'MURDER', actorId: 'betrayer', targetId: 'victim' }))
            .toThrow('UNKNOWN_SOCIAL_EVENT');
        const off = new RuntimeSimulation({ seed: 5, enableSocial: false });
        off.registerAgent('a', {});
        off.registerAgent('b', {});
        expect(off.reportSocialEvent({ event: 'BETRAYAL', actorId: 'a', targetId: 'b' })).toBeNull();
    });

    it('unregister purges social edges so long worlds cannot accumulate the dead', () => {
        const sim = world();
        sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim' });
        expect(sim.social.hasRelationship('victim', 'betrayer')).toBe(true);
        sim.unregisterAgent('betrayer');
        expect(sim.social.hasRelationship('victim', 'betrayer')).toBe(false);
    });
});
