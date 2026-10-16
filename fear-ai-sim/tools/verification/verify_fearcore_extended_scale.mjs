/**
 * tools/verification/verify_fearcore_extended_scale.mjs
 *
 * Verifies that the extended-band fear literals are compared on the scale they
 * were authored on. The pre-migration inline machine (git bf6e5d0
 * fear-ai-sim/brain.js) kept normalized fear (`currentFear`, 0..1) and compared
 * it against 0.95 / 0.5 / 0.2 / 0.85 directly (`f = currentFear * 100` with
 * `f > 85`, `f < 20`, `currentFear < 0.5`, `currentFear > 0.95`). The port
 * moved the same literals into `EXTENDED_BAND_*` config but `update()` receives
 * caller-scaled raw fear (`currentFear * FEAR_SCALE`), so the gates silently
 * degenerated: the PRESENCE_BREAK gate was vacuous (any PANIC >= 3.8 raw beats
 * 0.95), HIDE escaped on its first tick, and RECOVER completion needed raw
 * fear < 0.2 (~0.048 normalized) — effectively unreachable. This probe pins
 * the fixed contract: extended fear literals are normalized and compared as
 * `rawFear / FEAR_SCALE`, on defaults and on custom configs alike.
 *
 * Also pins two adjacent repairs carried in the same tranche:
 *   - FREEZE entry used `rng() < exitProbability * 10` (= 0.2), a silent 4x
 *     rate change from the authored 0.05 roll (PROVENANCE: "5% roll at every
 *     PANIC tick"; BADAI_MASTER_SPEC: "morale < 0.4 gates FREEZE (5% roll)");
 *     it is now its own `enterProbability: 0.05` key.
 *   - HIDE.exitPanicFear was re-derived from 0.85 to 0.95 so the hold window
 *     stays non-empty above the modern onset (panicOnsetRawFear = 0.9048).
 *   - BehavioralParetoFrontier._resetAgent wrote phantom
 *     `fearCore.currentBand` / `fearCore.panicLockCounter` properties (neither
 *     exists on FearCore) and left the real state/trace/lock stale across
 *     regime evaluations; it now calls the public `fearCore.reset('CALM')`.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import {
    FearCore,
    FEAR_SCALE,
    DEFAULT_FEARCORE_CONFIG,
    panicOnsetRawFear
} from '../../packages/core/src/FearCore.js';
import { BehavioralParetoFrontier } from '../../packages/core/src/BehavioralParetoFrontier.js';
import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

console.log('============================================================');
console.log('VERIFY FEARCORE EXTENDED SCALE (normalized literals vs raw fear)');
console.log('============================================================\n');

// ---------------------------------------------------------------- Section A
console.log('--- A. PRESENCE_BREAK extreme gate is a real gate again (raw 3.9 holds, raw 4.0 fires) ---');
{
    const fc = new FearCore();
    fc.reset('PANIC');
    let lockedTicks = 0;
    let stayedPanic = true;
    for (let i = 0; i < 200; i++) {
        const r = fc.update(1.3);
        if (r.state !== 'PANIC') stayedPanic = false;
        if (r.reason === 'PANIC_LOCK') lockedTicks++;
    }
    assert(stayedPanic, 'PANIC must persist through the 200-tick warmup at raw 1.3.');
    assert(lockedTicks === 9, `The 10-tick panic lock must hold 9 updates before release (got ${lockedTicks}).`);
    assert(fc.stateTimer === 200, 'The since-reset state timer must be 200 after the warmup.');

    const hold = fc.update(3.9);
    assert(hold.state === 'PANIC' && hold.reason === 'NO_TRANSITION',
        `Raw 3.9 (norm ${(3.9 / FEAR_SCALE).toFixed(4)}) is below the normalized 0.95 gate and must not trigger PRESENCE_BREAK (got ${hold.reason}).`);

    const fire = fc.update(4.0);
    assert(fire.state === 'PRESENCE_BREAK' && fire.reason === 'EXTREME_FEAR_LOCK',
        `Raw 4.0 (norm ${(4.0 / FEAR_SCALE).toFixed(4)}) is at or above the normalized 0.95 gate and must trigger EXTREME_FEAR_LOCK (got ${fire.reason}).`);
    assert(fire.threshold === 0.95, 'The trace must report the authored normalized literal 0.95.');
    assert(3.9 / FEAR_SCALE < 0.95 && 4.0 / FEAR_SCALE >= 0.95,
        'The 3.9/4.0 pair must straddle the 0.95 normalized gate by construction.');
    console.log('  * extreme gate boundary: PASS');
}

// ---------------------------------------------------------------- Section B
console.log('\n--- B. PRESENCE_BREAK exits on the normalized 0.5 (raw 2.2 holds, raw 2.0 exits) ---');
{
    const fc = new FearCore();
    fc.reset('PRESENCE_BREAK');

    const hold = fc.update(2.2);
    assert(hold.state === 'PRESENCE_BREAK' && hold.reason === 'EXTENDED_BAND_STAY',
        `Raw 2.2 (norm ${(2.2 / FEAR_SCALE).toFixed(4)}) is above the normalized exit and must hold (got ${hold.reason}).`);

    const exit = fc.update(2.0);
    assert(exit.state === 'RECOVER' && exit.reason === 'EXIT_PRESENCE_BREAK',
        `Raw 2.0 (norm ${(2.0 / FEAR_SCALE).toFixed(4)}) is below the normalized 0.5 exit and must release to RECOVER (got ${exit.reason}).`);
    assert(exit.threshold === 0.5, 'The trace must report the authored normalized literal 0.5.');
    assert(2.0 / FEAR_SCALE < 0.5 && 2.2 / FEAR_SCALE >= 0.5,
        'The 2.0/2.2 pair must straddle the 0.5 normalized exit by construction.');
    console.log('  * PRESENCE_BREAK exit boundary: PASS');
}

// ---------------------------------------------------------------- Section C
console.log('\n--- C. RECOVER completes at the normalized 0.2 (raw 0.8 completes, raw 0.9 does not) ---');
{
    const fc = new FearCore();
    fc.reset('RECOVER');
    for (let i = 0; i < 7; i++) {
        const r = fc.update(0.9);
        assert(r.reason === 'RECOVER_PROGRESS', `Raw 0.9 keeps recovering (step ${i + 1}, got ${r.reason}).`);
    }
    assert(Math.abs(fc.recoveryProgress - 0.7) < 1e-9, `Recovery progress must accumulate 0.1 per tick (got ${fc.recoveryProgress}).`);

    const fullProgress = fc.update(0.9);
    assert(fullProgress.reason === 'RECOVER_PROGRESS' && Math.abs(fullProgress.recoveryProgress - 0.8) < 1e-9,
        `Raw 0.9 (norm ${(0.9 / FEAR_SCALE).toFixed(4)}) is above the normalized 0.2 gate: full progress alone must not complete recovery (got ${fullProgress.reason}).`);

    const complete = fc.update(0.8);
    assert(complete.reason === 'RECOVER_COMPLETE' && complete.state === 'CALM',
        `Raw 0.8 (norm ${(0.8 / FEAR_SCALE).toFixed(4)}) is below the normalized 0.2 gate and must complete recovery (got ${complete.reason}).`);
    assert(fc.recoveryProgress === 0, 'Completion must zero the recovery progress.');
    assert(complete.threshold === 0.2, 'The trace must report the authored normalized literal 0.2.');
    assert(0.8 / FEAR_SCALE < 0.2 && 0.9 / FEAR_SCALE >= 0.2,
        'The 0.8/0.9 pair must straddle the 0.2 normalized gate by construction.');

    const fc2 = new FearCore();
    fc2.reset('RECOVER');
    const override = fc2.update(4.0);
    assert(override.reason === 'RECOVER_PANIC_OVERRIDE' && override.state === 'PANIC',
        'A renewed lethal threat must still override convalescence (NOW-20 preserved).');
    console.log('  * RECOVER completion boundary: PASS');
}

// ---------------------------------------------------------------- Section D
console.log('\n--- D. HIDE is a hold band again (holds inside the window, escapes above it) ---');
{
    const fc = new FearCore();
    fc.reset('PANIC');
    fc.panicLockedUntil = null;

    const enter = fc.update(3.0, { skill: 0.7, threats: 1, rng: () => 0.1 });
    assert(enter.state === 'HIDE' && enter.reason === 'HIDE_UNDER_THREAT',
        `A skilled, threatened panicker with rng 0.1 must hide (got ${enter.reason}).`);

    const hold = fc.update(3.9, { skill: 0.7, threats: 1 });
    assert(hold.state === 'HIDE' && hold.reason === 'EXTENDED_BAND_STAY',
        `Raw 3.9 (norm ${(3.9 / FEAR_SCALE).toFixed(4)}) is inside the hold window (onset 0.9048, escape 0.95) and must stay hidden (got ${hold.reason}).`);

    const escape = fc.update(4.0, { skill: 0.7, threats: 1 });
    assert(escape.state === 'PANIC' && escape.reason === 'EXIT_HIDE_PANIC_ESCAPE',
        `Raw 4.0 (norm ${(4.0 / FEAR_SCALE).toFixed(4)}) breaks the normalized 0.95 escape and must re-panic (got ${escape.reason}).`);
    assert(escape.threshold === 0.95, 'The trace must report the re-derived normalized literal 0.95.');

    assert(panicOnsetRawFear() < DEFAULT_FEARCORE_CONFIG.extended.HIDE.exitPanicFear,
        'The hold window must stay non-empty: escape literal strictly above the panic onset.');

    const fc2 = new FearCore();
    fc2.reset('PANIC');
    fc2.panicLockedUntil = null;
    fc2.update(3.0, { skill: 0.7, threats: 1, rng: () => 0.1 });
    const noThreats = fc2.update(3.0, { skill: 0.7, threats: 0 });
    assert(noThreats.state === 'RECOVER' && noThreats.reason === 'EXIT_HIDE_NO_THREATS',
        'Threats gone must still release HIDE to RECOVER.');
    console.log('  * HIDE hold window: PASS');
}

// ---------------------------------------------------------------- Section E
console.log('\n--- E. FREEZE entry roll is the authored 0.05, not the port\'s 0.2 ---');
{
    const setup = () => {
        const fc = new FearCore();
        fc.reset('PANIC');
        fc.panicLockedUntil = null;
        return fc;
    };

    const enters = setup().update(1.3, { morale: 0.3, rng: () => 0.049 });
    assert(enters.state === 'FREEZE' && enters.reason === 'FREEZE_UNDER_PANIC',
        `rng 0.049 < 0.05 must enter FREEZE (got ${enters.reason}).`);

    const atBoundary = setup().update(1.3, { morale: 0.3, rng: () => 0.05 });
    assert(atBoundary.state === 'PANIC' && atBoundary.reason === 'NO_TRANSITION',
        'rng exactly 0.05 must NOT enter FREEZE (strict less-than).');

    const above = setup().update(1.3, { morale: 0.3, rng: () => 0.06 });
    assert(above.state === 'PANIC' && above.reason === 'NO_TRANSITION',
        'rng 0.06 must NOT enter FREEZE (the old 0.2 roll would have taken it).');

    const fcExit = new FearCore();
    fcExit.reset('FREEZE');
    const exits = fcExit.update(0.5, { rng: () => 0.01 });
    assert(exits.state === 'RECOVER' && exits.reason === 'EXIT_FREEZE',
        `rng 0.01 < 0.02 must exit FREEZE (got ${exits.reason}).`);

    const fcStay = new FearCore();
    fcStay.reset('FREEZE');
    const stays = fcStay.update(0.5, { rng: () => 0.03 });
    assert(stays.state === 'FREEZE' && stays.reason === 'EXTENDED_BAND_STAY',
        'rng 0.03 >= 0.02 must keep FREEZE held.');

    assert(DEFAULT_FEARCORE_CONFIG.extended.FREEZE.enterProbability === 0.05,
        'The authored FREEZE entry rate must be pinned at 0.05.');
    assert(DEFAULT_FEARCORE_CONFIG.extended.FREEZE.exitProbability === 0.02,
        'The FREEZE exit rate must stay 0.02.');
    console.log('  * FREEZE roll rates: PASS');
}

// ---------------------------------------------------------------- Section F
console.log('\n--- F. custom configs get the same normalized semantics (enterFear 0.94) ---');
{
    const fc = new FearCore({ extended: { PRESENCE_BREAK: { enterFear: 0.94 } } });
    assert(fc.config.extended.PRESENCE_BREAK.enterFear === 0.94, 'The custom override must be applied.');
    assert(fc.config.extended.PRESENCE_BREAK.enterStateTimer === 200, 'Unmentioned fields must keep defaults.');
    assert(fc.config.extended.RECOVER.exitFear === 0.2, 'Untouched bands must keep their defaults.');

    fc.reset('PANIC');
    fc.panicLockedUntil = null;
    for (let i = 0; i < 200; i++) fc.update(1.3);

    const hold = fc.update(3.94);
    assert(hold.state === 'PANIC' && hold.reason === 'NO_TRANSITION',
        `Raw 3.94 (norm ${(3.94 / FEAR_SCALE).toFixed(4)}) is below the custom 0.94 gate and must hold.`);

    const fire = fc.update(3.95);
    assert(fire.state === 'PRESENCE_BREAK' && fire.reason === 'EXTREME_FEAR_LOCK' && fire.threshold === 0.94,
        `Raw 3.95 (norm ${(3.95 / FEAR_SCALE).toFixed(4)}) is at or above the custom 0.94 gate and must fire.`);

    assert(DEFAULT_FEARCORE_CONFIG.extended.PRESENCE_BREAK.exitFear === 0.5
        && DEFAULT_FEARCORE_CONFIG.extended.RECOVER.exitRecovery === 0.8
        && DEFAULT_FEARCORE_CONFIG.extended.HIDE.enterSkill === 0.6,
        'The neighboring extended literals must keep their authored values.');
    console.log('  * custom-config normalized semantics: PASS');
}

// ---------------------------------------------------------------- Section G
console.log('\n--- G. Pareto frontier resets the real fear core, not phantom properties ---');
{
    const frontier = new BehavioralParetoFrontier();
    const agent = new AffectiveAgent('fearcore-scale-probe');
    agent.currentFear = 0.9;
    agent.currentAnger = 0.5;
    agent.tickCount = 42;
    agent.fearCore.reset('ANXIOUS');
    agent.fearCore.update(4.0);
    agent.fearCore.update(1.0);

    assert(agent.fearCore.state === 'PANIC', 'Precondition: the fear core must be dirty with PANIC.');
    assert(agent.fearCore.tickCount === 2 && agent.fearCore.stateTimer === 2,
        'Precondition: the fear core clock must have advanced.');
    assert(agent.fearCore.panicLockedUntil === 11, 'Precondition: the panic lock must be armed.');
    assert(agent.fearCore.getDecisionTrace().length === 2, 'Precondition: the decision trace must have entries.');

    frontier._resetAgent(agent, {});

    assert(agent.currentFear === 0 && agent.currentAnger === 0 && agent.tickCount === 0,
        'The agent surface fields must be reset.');
    assert(agent.fearCore.state === 'CALM', 'The real fear-core state must be CALM after reset.');
    assert(agent.fearCore.tickCount === 0, 'The real fear-core tick count must reset.');
    assert(agent.fearCore.stateTimer === 0, 'The real fear-core state timer must reset.');
    assert(agent.fearCore.panicLockedUntil === null, 'The panic lock must be cleared.');
    assert(agent.fearCore.recoveryProgress === 0, 'The recovery progress must be cleared.');
    assert(agent.fearCore.getDecisionTrace().length === 0, 'The decision trace must be empty.');
    assert(!('currentBand' in agent.fearCore) && !('panicLockCounter' in agent.fearCore),
        'No phantom currentBand/panicLockCounter properties may be created.');

    const snapshot = agent.fearCore.getState();
    assert(snapshot.state === 'CALM' && snapshot.tickCount === 0 && snapshot.panicLockedUntil === null,
        'The public snapshot must show the fresh state.');
    console.log('  * Pareto fear-core reset: PASS');
}

console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} fearcore extended-scale assertions passed.`);
console.log('============================================================');
