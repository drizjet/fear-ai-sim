/**
 * @file host-feedback-loop.test.js
 *
 * Sections 208–211, 288–293:
 * Execution-Aware Advisory Loop & Host Outcome Feedback.
 */

import { HostFeedbackLoop, INTENT_OUTCOMES, FAILURE_REASONS } from '../packages/core/index.js';

describe('Sections 208–211, 288–293: Execution-Aware Advisory Loop', () => {
    test('1. Goal completions raise intent reliability', () => {
        const loop = new HostFeedbackLoop();
        loop.recordRecommendation('scout_01', 1, { type: 'FLEE_FROM', urgency: 0.8 });
        const before = loop.reliability('scout_01', 'FLEE_FROM');
        expect(before).toBeCloseTo(0.5, 4);
        loop.reportOutcome({ agentId: 'scout_01', tick: 2, intentType: 'FLEE_FROM', outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
        expect(loop.reliability('scout_01', 'FLEE_FROM')).toBeGreaterThan(before);
        expect(loop.globalReliability('FLEE_FROM')).toBeGreaterThan(0.5);
    });

    test('2. Repeated rejections filter phantom intents from rankings', () => {
        const loop = new HostFeedbackLoop();
        for (let i = 0; i < 3; i++) {
            loop.reportOutcome({ agentId: 'scout_01', tick: i, intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.UNSUPPORTED });
        }
        expect(loop.isUnavailable('scout_01', 'SEEK_COVER')).toBe(true);
        const ranking = loop.rankIntents('scout_01', [
            { type: 'SEEK_COVER', score: 0.95 },
            { type: 'FLEE_FROM', score: 0.5 }
        ]);
        expect(ranking.ranked.map((r) => r.type)).not.toContain('SEEK_COVER');
        expect(ranking.rejectedAlternatives.map((r) => r.type)).toContain('SEEK_COVER');
        expect(ranking.top.type).toBe('FLEE_FROM');
    });

    test('3. Single flakes never mark unavailable; structural streak does', () => {
        const loop = new HostFeedbackLoop();
        loop.reportOutcome({ agentId: 'scout_01', tick: 1, intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.NO_PATH });
        expect(loop.isUnavailable('scout_01', 'SEEK_COVER')).toBe(false);
        loop.reportOutcome({ agentId: 'scout_01', tick: 2, intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.HOST_BUSY });
        expect(loop.isUnavailable('scout_01', 'SEEK_COVER')).toBe(false);
        loop.reportOutcome({ agentId: 'scout_01', tick: 3, intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.BLOCKED });
        loop.reportOutcome({ agentId: 'scout_01', tick: 4, intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.BLOCKED });
        expect(loop.isUnavailable('scout_01', 'SEEK_COVER')).toBe(true);
        expect(loop.fallbackFor('SEEK_COVER')).toBe('FLEE_FROM');
    });

    test('4. Interruptions decay confidence without affordance verdicts', () => {
        const loop = new HostFeedbackLoop();
        for (let i = 0; i < 5; i++) {
            loop.reportOutcome({ agentId: 'scout_01', tick: i, intentType: 'WARN_GROUP', outcome: INTENT_OUTCOMES.ACTION_INTERRUPTED });
        }
        expect(loop.isUnavailable('scout_01', 'WARN_GROUP')).toBe(false);
        const ranking = loop.rankIntents('scout_01', [{ type: 'WARN_GROUP', score: 0.9 }]);
        expect(ranking.ranked[0].reliability).toBeLessThan(0.5);
        expect(ranking.ranked[0].type).toBe('WARN_GROUP');
    });

    test('5. Per-agent isolation with shared global stats', () => {
        const loop = new HostFeedbackLoop();
        for (let i = 0; i < 3; i++) {
            loop.reportOutcome({ agentId: 'agent_a', tick: i, intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.NO_PATH });
        }
        expect(loop.isUnavailable('agent_a', 'SEEK_COVER')).toBe(true);
        expect(loop.isUnavailable('agent_b', 'SEEK_COVER')).toBe(false);
        const rankB = loop.rankIntents('agent_b', [{ type: 'SEEK_COVER', score: 0.9 }]);
        expect(rankB.top.type).toBe('SEEK_COVER');
        loop.reportOutcome({ agentId: 'agent_a', tick: 9, intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
        expect(loop.isUnavailable('agent_a', 'SEEK_COVER')).toBe(false);
    });

    test('6. Unseen intents express uncertainty with calibrated confidence', () => {
        const loop = new HostFeedbackLoop();
        const ranking = loop.rankIntents('fresh_01', [
            { type: 'FLEE_FROM', score: 0.8 },
            { type: 'FREEZE', score: 0.8 }
        ]);
        expect(ranking.ranked[0].uncertain).toBe(true);
        expect(ranking.ranked[0].adjustedScore).toBeCloseTo(0.6, 4);
        expect(ranking.top.type).toBe('FLEE_FROM');
        const empty = loop.rankIntents('fresh_01', []);
        expect(empty.top.type).toBe('IDLE_VIGILANT');
        expect(empty.downgraded).toBe(true);
    });

    test('7. Authority invariant and determinism strictly preserved', () => {
        const loop = new HostFeedbackLoop();
        loop.recordRecommendation('scout_01', 1, { type: 'FLEE_FROM', urgency: 0.9 });
        loop.reportOutcome({ agentId: 'scout_01', tick: 2, intentType: 'FLEE_FROM', outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
        const a = loop.rankIntents('scout_01', [{ type: 'FLEE_FROM', score: 0.7 }, { type: 'FREEZE', score: 0.6 }]);
        const b = loop.rankIntents('scout_01', [{ type: 'FREEZE', score: 0.6 }, { type: 'FLEE_FROM', score: 0.7 }]);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        const audit = loop.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.status).toBe('CLEAN_ADVISORY_ONLY');
        expect(audit.hostPhysicsMutations).toBe(0);
        expect(audit.hostTransformMutations).toBe(0);
        expect(() => loop.reportOutcome({ agentId: 'x', intentType: 'FLEE_FROM', outcome: 'BOGUS' })).toThrow();
    });
});

describe('NEXT-66: intent-level stuck-actuator feedback', () => {
    test('8. Structural trips the breaker (reversibly); transient demotes; missing is a no-op', () => {
        // Structural: 3x BLOCKED trips, completion clears.
        const s = new HostFeedbackLoop();
        for (let i = 0; i < 3; i++) {
            s.reportOutcome({ agentId: 'g', intentType: 'FLEE_FROM', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.BLOCKED });
        }
        expect(s.isUnavailable('g', 'FLEE_FROM')).toBe(true);
        const ranked = s.rankIntents('g', [{ type: 'FLEE_FROM', score: 0.9 }]);
        expect(ranked.ranked).toHaveLength(0);
        expect(ranked.rejectedAlternatives[0].reason).toContain('BLOCKED');
        const cleared = s.reportOutcome({ agentId: 'g', intentType: 'FLEE_FROM', outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
        expect(cleared.unavailable).toBe(false);
        expect(cleared.availabilityChanged).toBe(true);
        // Transient-coded permanent failure: never trips, but reliability
        // demotion keeps it ranked below anything healthier.
        const t = new HostFeedbackLoop();
        for (let i = 0; i < 50; i++) {
            t.reportOutcome({ agentId: 'g', intentType: 'FLEE_FROM', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.HOST_BUSY });
        }
        expect(t.isUnavailable('g', 'FLEE_FROM')).toBe(false);
        expect(t.reliability('g', 'FLEE_FROM')).toBeCloseTo(1 / 52, 4);
        const rt = t.rankIntents('g', [{ type: 'FLEE_FROM', score: 0.9 }]);
        expect(rt.ranked).toHaveLength(1);
        expect(rt.ranked[0].adjustedScore).toBeLessThan(0.9);
        // Missing reports: Laplace prior, uncertain, never filtered.
        const m = new HostFeedbackLoop();
        expect(m.isUnavailable('g', 'FLEE_FROM')).toBe(false);
        expect(m.reliability('g', 'FLEE_FROM')).toBe(0.5);
        const rm = m.rankIntents('g', [{ type: 'FLEE_FROM', score: 0.9 }]);
        expect(rm.ranked[0].uncertain).toBe(true);
    });
});
