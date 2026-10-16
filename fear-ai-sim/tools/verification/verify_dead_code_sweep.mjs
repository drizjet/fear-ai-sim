/**
 * tools/verification/verify_dead_code_sweep.mjs
 *
 * Verifies the 2026-10-15 dead-branch sweep: three surfaces were trimmed, and
 * this probe pins that the live behavior each dead path shadowed survives.
 *
 * 1. FearCore._evaluateExtendedBands()
 *    - The PRESENCE_BREAK entry compare (PANIC -> PRESENCE_BREAK) lived twice:
 *      update()'s Phase 0 fires it first and returns, so the evaluator copy was
 *      unreachable and was removed. Phase 0 owns the one remaining entry.
 *    - A FORCE_* Phase-3 chain (FORCE_PANIC / FORCE_FREEZE / FORCE_HIDE...)
 *      sat behind the Phase-2.5 extended-band hold, which returns every
 *      extended band except RECOVER, so no FearCore state could ever reach it;
 *      removed. The behaviors it claimed are provided by Phase 0
 *      (PRESENCE_BREAK), the HIDE escape, and the FREEZE hold — all pinned
 *      below, and the vocabulary must never surface in any trace.
 *    - CRAWLING's entry guard carried `&& state !== 'CRAWLING'` (redundant
 *      under `=== 'HIDE'`) and its exit guard `|| state === 'HIDE'` (provably
 *      false under `=== 'CRAWLING'`); both clauses were removed, and the
 *      entry / hold / exit truth table is pinned.
 *
 * 2. HostFeedbackLoop.fallbackFor()
 *    - The unknown-type default was 'FLEE_FROM' (a specific action) while
 *      rankIntents()' all-rejected answer is the universal IDLE_VIGILANT; the
 *      default now returns that same universal safe intent. Mapped types are
 *      unchanged (truth table pinned), and the downgraded top and the
 *      unknown-type fallback are now one answer.
 *
 * 3. RequestSigning challenge records
 *    - Records carried a `sessionId` written at issue time and read by nothing
 *      (verification resolves the session from the responder's own record).
 *      Field and parameter were removed; the record shape is pinned to
 *      {challenge, issuedAt} and single-use / TTL retirement re-proven.
 *
 * Deterministic: seeded RNG, injected clock and randomness; no wall-clock
 * reads, no network, no host mutation (advisory surfaces only).
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearCore, FEAR_SCALE } from '../../packages/core/src/FearCore.js';
import { ACTION_INTENTS } from '../../packages/core/src/IntentResolver.js';
import { HostFeedbackLoop, DEFAULT_EXECUTION_FALLBACKS } from '../../packages/core/src/HostFeedbackLoop.js';
import { RequestSigning, SIGNATURE_FAILURES } from '../../packages/runtime/src/RequestSigning.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

console.log('============================================================');
console.log('VERIFY DEAD-CODE SWEEP (FearCore guards, fallback default, challenge records)');
console.log('============================================================\n');

// ---------------------------------------------------------------- Section A
console.log('--- A. FearCore dead guards removed; live semantics pinned ---');

// A1: extended-band holds that the removed FORCE_* chain once claimed.
{
    const holdPresence = new FearCore();
    holdPresence.reset('PRESENCE_BREAK');
    const presence = holdPresence.update(4.0);
    assert(presence.state === 'PRESENCE_BREAK' && presence.reason === 'EXTENDED_BAND_STAY',
        `PRESENCE_BREAK at normalized ${(4.0 / FEAR_SCALE).toFixed(4)} must hold via Phase 2.5 (got ${presence.reason}).`);

    const holdVault = new FearCore();
    holdVault.reset('VAULTING');
    const vaulting = holdVault.update(4.0, { obstacleAhead: true });
    assert(vaulting.state === 'VAULTING' && vaulting.reason === 'EXTENDED_BAND_STAY',
        `VAULTING with an obstacle ahead must hold through extreme fear (got ${vaulting.reason}).`);

    const holdFreeze = new FearCore();
    holdFreeze.reset('FREEZE');
    const freeze = holdFreeze.update(4.0, { rng: () => 0.5 });
    assert(freeze.state === 'FREEZE' && freeze.reason === 'EXTENDED_BAND_STAY',
        `FREEZE must hold when the exit roll misses (got ${freeze.reason}).`);

    const reasons = [presence.reason, vaulting.reason, freeze.reason].join(' ');
    assert(!/FORCE_/.test(reasons),
        `The removed FORCE_* reasons must never surface (got: ${reasons}).`);
    console.log('  * extended holds (PRESENCE_BREAK / VAULTING / FREEZE), no FORCE_*: PASS');
}

// A2: the HIDE escape the removed FORCE_PANIC branch once claimed.
{
    const fc = new FearCore();
    fc.reset('HIDE');
    const escape = fc.update(4.0, { threats: 1 });
    assert(escape.state === 'PANIC' && escape.reason === 'EXIT_HIDE_PANIC_ESCAPE',
        `HIDE at normalized fear above 0.95 with threats must escape to PANIC (got ${escape.reason}).`);
    assert(escape.threshold === 0.95, 'The escape must report the authored normalized 0.95 literal.');

    fc.reset('HIDE');
    const hold = fc.update(3.5, { threats: 1 });
    assert(hold.state === 'HIDE' && hold.reason === 'EXTENDED_BAND_STAY',
        `HIDE below the escape gate must hold (got ${hold.reason}).`);
    assert(3.5 / FEAR_SCALE < 0.95 && 4.0 / FEAR_SCALE >= 0.95,
        'The 3.5/4.0 pair must straddle the 0.95 normalized escape gate by construction.');

    fc.reset('HIDE');
    const clear = fc.update(0.5, { threats: 0 });
    assert(clear.state === 'RECOVER' && clear.reason === 'EXIT_HIDE_NO_THREATS',
        `HIDE with zero threats must exit to RECOVER (got ${clear.reason}).`);
    console.log('  * HIDE escape / hold / no-threats exit: PASS');
}

// A3: CRAWLING entry / hold / exit after the guard simplification.
{
    const fc = new FearCore();
    fc.reset('HIDE');
    const enter = fc.update(0.5, { threats: 1, obstaclePresent: true });
    assert(enter.state === 'CRAWLING' && enter.reason === 'CRAWL_UNDER_OBSTACLE',
        `HIDE under an obstacle must crawl (got ${enter.reason}).`);

    const hold = fc.update(0.5, { threats: 1, obstaclePresent: true });
    assert(hold.state === 'CRAWLING' && hold.reason === 'EXTENDED_BAND_STAY',
        `CRAWLING with the obstacle still present must hold (got ${hold.reason}).`);

    const back = fc.update(0.5, { threats: 1, obstaclePresent: false });
    assert(back.state === 'HIDE' && back.reason === 'EXIT_CRAWLING',
        `CRAWLING must return to HIDE when the obstacle clears (got ${back.reason}).`);

    const other = new FearCore();
    other.reset('VAULTING');
    const noSpurious = other.update(0.5, { obstacleAhead: true, obstaclePresent: true });
    assert(noSpurious.state === 'VAULTING' && noSpurious.reason === 'EXTENDED_BAND_STAY',
        `obstaclePresent alone must not crawl a non-HIDE band (got ${noSpurious.reason}).`);
    console.log('  * CRAWLING entry / hold / exit truth table: PASS');
}

// A4: the PRESENCE_BREAK entry fires exactly once, via Phase 0 only.
{
    const fc = new FearCore({ maxTraceLength: 300 });
    fc.reset('PANIC');
    let fires = 0;
    for (let i = 0; i < 200; i++) {
        const r = fc.update(4.0);
        if (r.reason === 'EXTREME_FEAR_LOCK') fires += 1;
    }
    assert(fires === 1, `EXTREME_FEAR_LOCK must fire exactly once across the warmup (got ${fires}).`);
    assert(fc.state === 'PRESENCE_BREAK' && fc.stateTimer === 200,
        'The 200-tick warmup must land in PRESENCE_BREAK with the timer at 200.');

    const after = fc.update(4.0);
    assert(after.state === 'PRESENCE_BREAK' && after.reason === 'EXTENDED_BAND_STAY',
        `PRESENCE_BREAK must hold after entry (got ${after.reason}).`);
    assert(fc.getDecisionTrace().length === 201 && fires === 1,
        'One decision per update: the removed duplicate compare must not add a second path.');
    console.log('  * single PRESENCE_BREAK entry via Phase 0: PASS');
}

// A5: RECOVER escalation, its progress path, and the SNAP_TO_CALM guard.
{
    const fc = new FearCore();
    fc.reset('RECOVER');
    const override = fc.update(4.0);
    assert(override.state === 'PANIC' && override.reason === 'RECOVER_PANIC_OVERRIDE',
        `Renewed panic must override convalescence (got ${override.reason}).`);

    fc.reset('RECOVER');
    const progress = fc.update(0.5);
    assert(progress.state === 'RECOVER' && progress.reason === 'RECOVER_PROGRESS'
        && progress.recoveryProgress === 0.1,
        `RECOVER must keep accumulating progress below the override (got ${progress.reason}).`);

    const corrupt = new FearCore();
    corrupt.state = 'NOT_A_BAND';
    const snapped = corrupt.update(0);
    assert(snapped.state === 'CALM' && snapped.reason === 'SNAP_TO_CALM',
        `A corrupted band must snap to CALM (got ${snapped.reason}).`);
    console.log('  * RECOVER escalation + progress + SNAP_TO_CALM guard: PASS');
}

// ---------------------------------------------------------------- Section B
console.log('\n--- B. fallbackFor truth table: mapped preserved, everything else universal ---');
{
    const loop = new HostFeedbackLoop();

    const mappedEntries = Object.entries(DEFAULT_EXECUTION_FALLBACKS);
    assert(mappedEntries.length === 7,
        `The mapped fallback table must hold 7 entries (got ${mappedEntries.length}).`);
    for (const [type, expected] of mappedEntries) {
        assert(loop.fallbackFor(type) === expected,
            `Mapped type ${type} must keep its fallback ${expected} (got ${loop.fallbackFor(type)}).`);
    }

    const mapped = new Set(Object.keys(DEFAULT_EXECUTION_FALLBACKS));
    const unmapped = ACTION_INTENTS.filter((t) => !mapped.has(t));
    assert(unmapped.length === 5,
        `The action vocabulary must leave exactly 5 unmapped types (got ${unmapped.length}: ${unmapped.join(', ')}).`);
    for (const type of unmapped) {
        assert(loop.fallbackFor(type) === 'IDLE_VIGILANT',
            `Unmapped known type ${type} must resolve to the universal safe intent (got ${loop.fallbackFor(type)}).`);
    }
    assert(loop.fallbackFor('HOST_CUSTOM_DANCE') === 'IDLE_VIGILANT',
        'Unknown host types must resolve to the universal safe intent.');
    assert(loop.fallbackFor(42) === 'IDLE_VIGILANT',
        'Non-string types (stringified) must resolve to the universal safe intent.');
    assert(ACTION_INTENTS.includes(loop.fallbackFor('anything at all')),
        'The universal fallback must stay inside the action vocabulary.');

    for (let i = 0; i < 3; i++) {
        loop.reportOutcome({ agentId: 'agent-a', intentType: 'SEEK_COVER', outcome: 'INTENT_REJECTED', reason: 'NO_PATH' });
    }
    const ranked = loop.rankIntents('agent-a', [{ type: 'SEEK_COVER' }]);
    assert(ranked.rejectedAlternatives.length === 1 && ranked.rejectedAlternatives[0].fallback === 'FLEE_FROM',
        'A mapped unavailable type must keep its mapped fallback in rejectedAlternatives.');
    assert(ranked.top.type === 'IDLE_VIGILANT' && ranked.top.safeFallback === true && ranked.downgraded === true,
        'An all-rejected ranking must downgrade to the universal safe intent.');
    assert(ranked.top.type === loop.fallbackFor('not-a-type'),
        'The downgraded top and the unknown-type fallback must be one answer.');

    for (let i = 0; i < 3; i++) {
        loop.reportOutcome({ agentId: 'agent-b', intentType: 'WEIRD_ACTION', outcome: 'EXECUTION_FAILED', reason: 'BLOCKED' });
    }
    const rankedB = loop.rankIntents('agent-b', [{ type: 'WEIRD_ACTION' }]);
    assert(rankedB.rejectedAlternatives[0].reason === 'HOST_REPORTED_BLOCKED'
        && rankedB.rejectedAlternatives[0].fallback === 'IDLE_VIGILANT',
        'An unknown unavailable type must reject with the universal fallback.');
    assert(loop.getAgentSummary('agent-b').unavailable[0].fallback === 'IDLE_VIGILANT',
        'The agent summary must report the universal fallback for unknown types.');
    console.log('  * fallbackFor mapped / unmapped / unknown + downgraded-top agreement: PASS');
}

// ---------------------------------------------------------------- Section C
console.log('\n--- C. RequestSigning challenge records: {challenge, issuedAt} only ---');
{
    let fakeNow = 1_000_000;
    const FIXED_TTL = 1000;
    let rngCall = 0;
    const signing = new RequestSigning({
        challengeTtlMs: FIXED_TTL,
        now: () => fakeNow,
        randomBytes: (size) => { rngCall += 1; return Buffer.alloc(size, rngCall & 0xff); }
    });

    const c1 = signing.issueChallenge();
    const record1 = signing._challenges.get(c1.challenge);
    assert(record1 && Object.keys(record1).sort().join(',') === 'challenge,issuedAt',
        `Challenge records must be exactly {challenge, issuedAt} (got ${record1 ? Object.keys(record1).join(',') : 'no record'}).`);
    assert(!('sessionId' in record1), 'The vestigial sessionId field must not exist.');
    assert(record1.challenge === c1.challenge && record1.issuedAt === fakeNow,
        'The record must carry its own challenge and the injected issue time.');
    assert(signing.summary().challenges_outstanding === 1, 'One challenge must be outstanding after issue.');

    const burn = signing.verifyChallengeResponse({
        challenge: c1.challenge, sessionId: 'sess_never_stored', signature: 'AAAA', sessionRecord: null
    });
    assert(burn.reason === SIGNATURE_FAILURES.UNKNOWN_KEY,
        `Verification must resolve the session from the responder's record, not a stored field (got ${burn.reason}).`);

    const replay = signing.verifyChallengeResponse({
        challenge: c1.challenge, sessionId: 'sess_never_stored', signature: 'AAAA', sessionRecord: null
    });
    assert(replay.reason === SIGNATURE_FAILURES.UNKNOWN_CHALLENGE,
        `A retired challenge must not be reusable (got ${replay.reason}).`);
    assert(signing.summary().challenges_outstanding === 0,
        'The challenge must be retired after one attempt, successful or not.');

    const c2 = signing.issueChallenge();
    fakeNow += FIXED_TTL + 1;
    const stale = signing.verifyChallengeResponse({
        challenge: c2.challenge, sessionId: 'sess_never_stored', signature: 'AAAA', sessionRecord: null
    });
    assert(stale.reason === SIGNATURE_FAILURES.EXPIRED_CHALLENGE,
        `An over-TTL challenge must expire before the key check (got ${stale.reason}).`);
    console.log('  * record shape / single-use retirement / TTL: PASS');
}

// ---------------------------------------------------------------- Section D
console.log('\n--- D. Sweep scenarios are deterministic across seeded instances ---');
{
    const sweepScenario = (seed) => {
        const fc = new FearCore({ seed });
        fc.reset('HIDE');
        fc.update(4.0, { threats: 1 });
        fc.reset('HIDE');
        fc.update(0.5, { threats: 1, obstaclePresent: true });
        fc.update(0.5, { threats: 1, obstaclePresent: false });
        fc.reset('PANIC');
        for (let i = 0; i < 210; i++) fc.update(4.0);
        fc.reset('RECOVER');
        fc.update(4.0);
        fc.reset('VAULTING');
        fc.update(1.0, { obstacleAhead: false, rng: () => 0.5 });
        return JSON.stringify(fc.getDecisionTrace());
    };
    const traceOne = sweepScenario('dead-sweep-seed');
    const traceTwo = sweepScenario('dead-sweep-seed');
    assert(traceOne === traceTwo,
        'Two same-seed cores must produce identical decision traces across the sweep scenarios.');
    assert(!traceOne.includes('FORCE_'),
        'The removed FORCE_* vocabulary must not appear in any decision trace.');
    console.log('  * same-seed trace equality + FORCE_* absence: PASS');
}

console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} dead-code-sweep assertions passed.`);
console.log('============================================================');
