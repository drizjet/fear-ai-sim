#!/usr/bin/env node

/**
 * verify_host_feedback_bounds.mjs — bounded tracking in the host advisory loop.
 *
 * HostFeedbackLoop bounds its agent map (5000) and per-agent history (64), but
 * three maps keyed by the host-supplied intent-type string were unbounded:
 *
 *   - rec.perIntent (per agent),
 *   - rec.unavailable (per agent),
 *   - this.globalPerIntent (per loop).
 *
 * ProtocolValidator.validateOutcomeReport trims intent_type to 128 chars but
 * does not restrict it to ACTION_INTENTS: any distinct string is a new entry.
 * A host (or anonymous client — outcome reports are not gated) reporting
 * distinct intent types could therefore grow all three maps without limit,
 * the same defect class as the previously fixed contradiction log.
 *
 * Invariants proven:
 * - A per-agent intent-type map is capped at 64 distinct types, oldest-first by
 *   first-touch insertion order, mirroring the agent-map eviction;
 * - Eviction removes the type's stats AND its unavailability flag together, so
 *   the two per-agent maps cannot disagree or leak orphans;
 * - The global per-intent map is capped at 512 distinct types, independently of
 *   per-agent tracking: a per-agent eviction leaves the global record intact;
 * - The canonical semantics are unchanged below the caps: the 3-consecutive
 *   structural failure threshold, transient reasons never marking unavailable,
 *   GOAL_COMPLETED clearing unavailability, resetAffordance, ACTION_INTERRUPTED
 *   not breaking a structural streak, and rankIntents steering around
 *   unavailable intents with a named fallback;
 * - Identical report sequences produce identical summaries (determinism).
 */

import {
    HostFeedbackLoop,
    INTENT_OUTCOMES,
    FAILURE_REASONS
} from '../../packages/core/src/HostFeedbackLoop.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

console.log('============================================================');
console.log('VERIFY HOST FEEDBACK BOUNDS (advisory loop tracking caps)');
console.log('============================================================');

const CAP_PER_AGENT = 64;
const CAP_GLOBAL = 512;

// ---------------------------------------------------------------------------
// Section A: the per-agent type map is capped, oldest-first, and the global
// record of an evicted type survives the per-agent eviction.
// ---------------------------------------------------------------------------
const a = new HostFeedbackLoop();
for (let i = 0; i <= CAP_PER_AGENT + 4; i += 1) {
    a.reportOutcome({ agentId: 'solo', intentType: `T${i}`, outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
}
const aRec = a.agents.get('solo');
assert(aRec.perIntent.size === CAP_PER_AGENT,
    `Per-agent intent map exceeded its cap (${aRec.perIntent.size} > ${CAP_PER_AGENT})`);
assert(!aRec.perIntent.has('T0') && !aRec.perIntent.has('T4'),
    'Oldest intent types were not evicted first');
assert(aRec.perIntent.has(`T${CAP_PER_AGENT + 4}`),
    'The newest intent type was not tracked after eviction');
assert(a.reliability('solo', 'T0') === 0.5,
    'An evicted type still carries stats (reliability should fall back to the 0.5 prior)');
assert(a.reliability('solo', `T${CAP_PER_AGENT + 4}`) === 0.6667,
    'The newest type does not carry its own stats');
assert(a.totalReports === CAP_PER_AGENT + 5,
    'totalReports stopped counting reports for evicted types');
assert(a.globalPerIntent.size === CAP_PER_AGENT + 5,
    'Global tracking lost types that were only evicted per-agent');
assert(a.globalReliability('T0') === 0.6667,
    'Global reliability lost the stats of a per-agent evicted type');
assert(a.getAgentSummary('solo').intents.length === CAP_PER_AGENT,
    'getAgentSummary reported more intents than the cap');
console.log('  * Section A (per-agent cap, global survives): PASS');

// ---------------------------------------------------------------------------
// Section B: eviction removes the unavailability flag with the stats, and
// unavailability is stable right up to the eviction point.
// ---------------------------------------------------------------------------
const b = new HostFeedbackLoop();
for (let i = 0; i < 3; i += 1) {
    b.reportOutcome({ agentId: 'marked', intentType: 'U0', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.NO_PATH });
}
assert(b.isUnavailable('marked', 'U0') === true,
    'Three consecutive structural failures did not mark the intent unavailable');
assert(b.agents.get('marked').unavailable.size === 1,
    'Unavailability map does not hold exactly the marked type');
for (let i = 1; i <= CAP_PER_AGENT - 1; i += 1) {
    b.reportOutcome({ agentId: 'marked', intentType: `U${i}`, outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
}
assert(b.agents.get('marked').perIntent.size === CAP_PER_AGENT,
    'Pre-eviction fill did not reach the cap exactly');
assert(b.isUnavailable('marked', 'U0') === true,
    'The oldest type lost its flag before the cap was actually exceeded');
b.reportOutcome({ agentId: 'marked', intentType: `U${CAP_PER_AGENT}`, outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
const bRec = b.agents.get('marked');
assert(bRec.perIntent.size === CAP_PER_AGENT,
    'Per-agent map grew past the cap on the eviction-triggering insert');
assert(!bRec.perIntent.has('U0'),
    'The oldest type (the unavailable one) was not the one evicted');
assert(bRec.unavailable.size === 0,
    'Eviction left an orphaned unavailability flag behind');
assert(b.isUnavailable('marked', 'U0') === false,
    'The evicted type is still reported unavailable');
const reReport = b.reportOutcome({ agentId: 'marked', intentType: 'U0', outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
assert(reReport.unavailable === false && reReport.availabilityChanged === false,
    'A re-reported evicted type resurrected its old unavailability state');
console.log('  * Section B (flag evicted with stats, no orphans): PASS');

// ---------------------------------------------------------------------------
// Section C: the global map is capped independently of per-agent tracking.
// ---------------------------------------------------------------------------
const c = new HostFeedbackLoop();
for (let i = 0; i <= CAP_GLOBAL; i += 1) {
    c.reportOutcome({ agentId: `g${i}`, intentType: `G${i}`, outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
}
assert(c.globalPerIntent.size === CAP_GLOBAL,
    `Global intent map exceeded its cap (${c.globalPerIntent.size} > ${CAP_GLOBAL})`);
assert(!c.globalPerIntent.has('G0'),
    'The globally oldest type was not evicted first');
assert(c.globalReliability('G0') === 0.5,
    'A globally evicted type still carries stats');
assert(c.globalReliability(`G${CAP_GLOBAL}`) === 0.6667,
    'The globally newest type does not carry its own stats');
assert(c.agents.size === CAP_GLOBAL + 1,
    'The agent map was disturbed by global type eviction');
assert(c.getAgentSummary('g0').intents.length === 1,
    'Global eviction disturbed a single-type agent’s per-agent record');
console.log('  * Section C (global cap, per-agent untouched): PASS');

// ---------------------------------------------------------------------------
// Section D: canonical semantics unchanged below the caps.
// ---------------------------------------------------------------------------
const d = new HostFeedbackLoop();
for (let i = 0; i < 3; i += 1) {
    d.reportOutcome({ agentId: 'ranked', intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.BLOCKED });
}
const ranked = d.rankIntents('ranked', [
    { type: 'SEEK_COVER', score: 0.9 },
    { type: 'WARN_GROUP', score: 0.5 }
]);
assert(ranked.top.type === 'WARN_GROUP',
    'rankIntents still ranked an unavailable intent on top');
assert(ranked.rejectedAlternatives.length === 1
    && ranked.rejectedAlternatives[0].type === 'SEEK_COVER'
    && ranked.rejectedAlternatives[0].reason === 'HOST_REPORTED_BLOCKED'
    && ranked.rejectedAlternatives[0].fallback === 'FLEE_FROM',
    'The rejected alternative lost its reason or fallback name');
const cleared = d.reportOutcome({ agentId: 'ranked', intentType: 'SEEK_COVER', outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
assert(cleared.availabilityChanged === true && cleared.unavailable === false,
    'A later completion did not clear unavailability');

const flake = new HostFeedbackLoop();
for (let i = 0; i < 2; i += 1) {
    flake.reportOutcome({ agentId: 'flake', intentType: 'APPROACH_ALLY', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.UNSUPPORTED });
}
assert(flake.isUnavailable('flake', 'APPROACH_ALLY') === false,
    'Two structural failures marked unavailability before the threshold');
flake.reportOutcome({ agentId: 'flake', intentType: 'APPROACH_ALLY', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.UNSUPPORTED });
assert(flake.isUnavailable('flake', 'APPROACH_ALLY') === true,
    'The third consecutive structural failure did not mark unavailability');

for (let i = 0; i < 5; i += 1) {
    flake.reportOutcome({ agentId: 'flake', intentType: 'DESPERATE_FLAIL', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.HOST_BUSY });
}
assert(flake.isUnavailable('flake', 'DESPERATE_FLAIL') === false,
    'A transient reason marked unavailability');
assert(flake.agents.get('flake').perIntent.get('DESPERATE_FLAIL').consecutiveStructuralFailures === 0,
    'A transient reason advanced the structural streak');

const streak = new HostFeedbackLoop();
streak.reportOutcome({ agentId: 'streak', intentType: 'FREEZE', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.NO_PATH });
streak.reportOutcome({ agentId: 'streak', intentType: 'FREEZE', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.NO_PATH });
streak.reportOutcome({ agentId: 'streak', intentType: 'FREEZE', outcome: INTENT_OUTCOMES.ACTION_INTERRUPTED });
streak.reportOutcome({ agentId: 'streak', intentType: 'FREEZE', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.NO_PATH });
assert(streak.isUnavailable('streak', 'FREEZE') === true,
    'An interruption between structural failures broke the streak');

const reset = new HostFeedbackLoop();
for (let i = 0; i < 3; i += 1) {
    reset.reportOutcome({ agentId: 'reset', intentType: 'INVESTIGATE_SOUND', outcome: INTENT_OUTCOMES.EXECUTION_FAILED, reason: FAILURE_REASONS.BLOCKED });
}
assert(reset.isUnavailable('reset', 'INVESTIGATE_SOUND') === true,
    'resetAffordance precondition not reached');
assert(reset.resetAffordance('reset', 'INVESTIGATE_SOUND') === true
    && reset.isUnavailable('reset', 'INVESTIGATE_SOUND') === false,
    'resetAffordance did not clear the flag');
assert(reset.agents.get('reset').perIntent.get('INVESTIGATE_SOUND').consecutiveStructuralFailures === 0,
    'resetAffordance did not reset the structural streak');
console.log('  * Section D (canonical semantics unchanged below the caps): PASS');

// ---------------------------------------------------------------------------
// Section E: identical sequences produce identical state.
// ---------------------------------------------------------------------------
function runSequence() {
    const loop = new HostFeedbackLoop();
    for (let i = 0; i < CAP_PER_AGENT + 10; i += 1) {
        loop.reportOutcome({ agentId: 'det', intentType: `D${i}`, outcome: INTENT_OUTCOMES.GOAL_COMPLETED });
    }
    loop.reportOutcome({ agentId: 'det', intentType: 'D5', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.NO_PATH });
    loop.reportOutcome({ agentId: 'det', intentType: 'D5', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.NO_PATH });
    loop.reportOutcome({ agentId: 'det', intentType: 'D5', outcome: INTENT_OUTCOMES.INTENT_REJECTED, reason: FAILURE_REASONS.NO_PATH });
    return loop;
}
const e1 = runSequence();
const e2 = runSequence();
assert(JSON.stringify(e1.getAgentSummary('det')) === JSON.stringify(e2.getAgentSummary('det')),
    'Identical report sequences produced different per-agent summaries');
assert(e1.globalReliability('D0') === e2.globalReliability('D0')
    && e1.globalReliability('D5') === e2.globalReliability('D5'),
    'Identical report sequences produced different global reliability');
assert(e1.agents.get('det').perIntent.size === e2.agents.get('det').perIntent.size
    && e1.agents.get('det').unavailable.size === e2.agents.get('det').unavailable.size,
    'Identical report sequences produced different map sizes');
console.log('  * Section E (determinism): PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} host feedback bounds assertions passed.`);
console.log('============================================================');
