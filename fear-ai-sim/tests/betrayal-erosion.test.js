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

describe('NOW-26: betrayal severity mapping', () => {
    function outcome(weight, severity) {
        const sim = world();
        sim.reportSocialEvent({
            event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim',
            weight, ...(severity === null ? {} : { severity })
        });
        calm(sim, 250);
        const rec = sim.coreTrauma.agentRecords.get('victim');
        return {
            incurred: rec.crystallizedTraumas[0]?.severity,
            agreeableness: sim.agents.get('victim').traits.agreeableness
        };
    }

    it('omitted severity defaults to weight/2 across the weight range', () => {
        expect(outcome(0.1, null).incurred).toBeCloseTo(0.1, 10);
        expect(outcome(1.0, null).incurred).toBeCloseTo(0.5, 10);
        expect(outcome(2.0, null).incurred).toBeCloseTo(1.0, 10);
    });

    it('trait damage scales monotonically with mapped severity', () => {
        const light = outcome(0.1, null).agreeableness;
        const mid = outcome(1.0, null).agreeableness;
        const heavy = outcome(2.0, null).agreeableness;
        expect(light).toBeGreaterThan(mid);
        expect(mid).toBeGreaterThan(heavy);
        expect(heavy).toBeGreaterThanOrEqual(0.1);
    });

    it('explicit severity overrides weight in both directions', () => {
        // Heavy act, host-downplayed severity: mild outcome.
        expect(outcome(2.0, 0.2).agreeableness).toBeGreaterThan(outcome(2.0, null).agreeableness);
        // Light act, host-upgraded severity: full outcome.
        expect(outcome(0.1, 1.0).agreeableness).toBe(outcome(2.0, null).agreeableness);
    });
});

describe('NOW-27: social-repair defuse boundary', () => {
    function woundAndRepair(repairs, repairTick = 0, totalCalm = 250) {
        const sim = world();
        sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim', weight: 2.0, severity: 1.0 });
        calm(sim, repairTick);
        for (let i = 0; i < repairs; i++) {
            sim.reportSocialEvent({ event: 'AID', actorId: 'friend', targetId: 'victim' });
        }
        calm(sim, totalCalm - repairTick);
        const rec = sim.coreTrauma.agentRecords.get('victim');
        return {
            crystallized: rec.crystallizedTraumas.length,
            agreeableness: sim.agents.get('victim').traits.agreeableness
        };
    }

    it('two repairs cannot defuse; three repairs can (0.60 vs 0.90 against the 0.65 bar)', () => {
        expect(woundAndRepair(2).crystallized).toBe(1);
        const healed = woundAndRepair(3);
        expect(healed.crystallized).toBe(0);
        expect(healed.agreeableness).toBe(0.7);
    });

    it('late repair inside the window still defuses; timing within the window is irrelevant', () => {
        const healed = woundAndRepair(3, 100);
        expect(healed.crystallized).toBe(0);
        expect(healed.agreeableness).toBe(0.7);
    });

    it('post-crystallization repair cannot undo, but long calm heals through extinction', () => {
        const sim = world();
        sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'betrayer', targetId: 'victim', weight: 2.0, severity: 1.0 });
        calm(sim, 250);
        for (let i = 0; i < 3; i++) {
            sim.reportSocialEvent({ event: 'AID', actorId: 'friend', targetId: 'victim' });
        }
        calm(sim, 50);
        const rec = sim.coreTrauma.agentRecords.get('victim');
        // Crystallization is irreversible by repair: the record stands.
        expect(rec.crystallizedTraumas.length).toBe(1);
        // Extinction therapy restores traits toward baseline over long calm
        // (asymptotic: approaches but never exactly touches baseline).
        calm(sim, 2000);
        expect(sim.agents.get('victim').traits.agreeableness).toBeCloseTo(0.7, 3);
    });
});

describe('NEXT-25: RECOVER times betrayal interaction', () => {
    // Verdict: layers stay independent and coherent. Convalescence
    // (fear-state recovery) proceeds undisturbed by a fresh social wound
    // while the wound lifecycles normally alongside it; the NOW-20
    // lethal-threat override still fires with betrayal trauma active.
    // No source change: these tests pin the verdict.
    const HARD = [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] }];
    const IDLE = [{ agent_id: 'a1' }, { agent_id: 'a2' }];
    function convalescing(seed = 77) {
        const sim = new RuntimeSimulation({ seed });
        sim.registerAgent('a1', { neuroticism: 0.5, resilience: 0.5, agreeableness: 0.7 });
        sim.registerAgent('a2', {});
        for (let t = 0; t < 150; t++) sim.batchTick(HARD, 0.0166);
        for (let t = 0; t < 300; t++) {
            sim.batchTick(IDLE, 0.0166);
            if (sim.agents.get('a1').fearCore.state === 'RECOVER') break;
        }
        expect(sim.agents.get('a1').fearCore.state).toBe('RECOVER');
        return sim;
    }

    it('betrayal during RECOVER neither stalls convalescence nor escapes wounding', () => {
        const sim = convalescing();
        sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'a2', targetId: 'a1', weight: 2.0, severity: 1.0 });
        let exit = null;
        for (let t = 0; t < 400 && exit === null; t++) {
            sim.batchTick(IDLE, 0.0166);
            const st = sim.agents.get('a1').fearCore.state;
            if (st !== 'RECOVER') exit = st;
        }
        // Convalescence still completes on its own terms.
        expect(exit).toBe('CALM');
        // The wound lifecycled alongside and crystallized despite the calm.
        for (let t = 0; t < 300; t++) sim.batchTick(IDLE, 0.0166);
        const rec = sim.coreTrauma.agentRecords.get('a1');
        expect(rec.crystallizedTraumas.some((x) => x.type === 'BETRAYAL_ABANDONMENT')).toBe(true);
        expect(sim.agents.get('a1').traits.agreeableness).toBeLessThan(0.7);
    });

    it('lethal threat during betrayal convalescence re-panics without completing recovery', () => {
        const sim = convalescing();
        sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'a2', targetId: 'a1', weight: 2.0, severity: 1.0 });
        let sawCalm = false;
        let panicked = false;
        for (let t = 0; t < 400 && !panicked; t++) {
            sim.batchTick(HARD, 0.0166);
            const st = sim.agents.get('a1').fearCore.state;
            if (st === 'CALM') sawCalm = true;
            if (st === 'PANIC') panicked = true;
        }
        expect(panicked).toBe(true);
        expect(sawCalm).toBe(false);
    });
});
