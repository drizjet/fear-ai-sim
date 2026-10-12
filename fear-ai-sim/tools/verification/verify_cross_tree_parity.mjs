/**
 * tools/verification/verify_cross_tree_parity.mjs
 *
 * Verifies transition parity between canonical Rust Fear engine
 * (`pixel-pets/src/engine/ai/fear.rs`) and JavaScript FearCore (`packages/core/src/FearCore.js`).
 *
 * Vectors: `evidence/rust_js_parity_vectors.json`.
 * Rust column: `evidence/rust_fear_oracle_results.json`, produced by EXECUTING the real
 * `fear.rs` (`npm run codegen:rust-fear-oracle`). Before 2026-10-12 the Rust column was
 * typed by hand and never run, and one entry (VEC-12) was wrong about Rust.
 *
 * What this probe asserts:
 *   1. JS thresholds match the recorded matrix.
 *   2. The Rust results were produced from THESE scenarios (scenario hash) and, when the
 *      host checkout is reachable, from the CURRENT fear.rs (source hash). If the host is
 *      not reachable that second half is printed as SKIPPED, not claimed.
 *   3. Every vector's `expected_rust_band` equals what the real Rust produced.
 *   4. Every vector's `expected_js_state` equals what the JS core produces.
 *   5. Where Rust and JS disagree, the vector DECLARES the divergence (`divergence: [...]`
 *      keyed into `declared_divergences`); where they agree it must not. An undeclared
 *      divergence and a stale declaration both fail.
 *   6. The lock-clock / re-arm / clamp / berserk observations (B7-B10) hold on both sides.
 *
 * It does not claim bit-identical behaviour. It claims: the Rust column is measured, the
 * JS column is measured, and every difference between them is written down.
 *
 * Hard Rule 9 Compliant: 0 automated test runner frameworks. Standalone deterministic script.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FearCore } from '../../packages/core/src/FearCore.js';
import {
    JS_STATE_FOR_RUST,
    scenariosSha256,
    sourceSha256
} from '../codegen/rust_fear_oracle/scenarios.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST_REPO = process.env.FEAR_AI_HOST_REPO
    || 'C:\\tools\\03-Projects\\lains Tools\\New Master Game';

function assert(cond, message) {
    if (!cond) throw new Error(message);
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY CROSS-TREE RUST <-> JS FEAR PARITY (Rust column EXECUTED)');
    console.log('============================================================\n');

    const vectorsPath = path.resolve(__dirname, '../../evidence/rust_js_parity_vectors.json');
    const oraclePath = path.resolve(__dirname, '../../evidence/rust_fear_oracle_results.json');
    assert(fs.existsSync(vectorsPath), `Parity vectors missing at ${vectorsPath}`);
    assert(fs.existsSync(oraclePath), `Rust oracle results missing at ${oraclePath}; run \`npm run codegen:rust-fear-oracle\``);

    const parityData = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
    const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));
    const declared = parityData.declared_divergences || {};
    const vectors = parityData.boundary_test_vectors;

    console.log(`Loaded provenance:`);
    console.log(`- Rust Source: ${parityData.provenance.rust_canonical_source}`);
    console.log(`- Sibling Commit (vectors pinned): ${parityData.provenance.sibling_repo_commit}`);
    console.log(`- JS Source: ${parityData.provenance.js_canonical_source}`);
    console.log(`- Rust results: executed fear.rs @ host ${String(oracle.provenance.host_repo_head).slice(0, 9)}, sha256 ${oracle.provenance.fear_rs_sha256.slice(0, 12)}…, ${oracle.provenance.rustc}`);
    console.log(`- Total Boundary Vectors: ${vectors.length}\n`);

    // --- Oracle freshness ---------------------------------------------------
    console.log('--- Rust results freshness ---');
    assert(
        oracle.provenance.scenarios_sha256 === scenariosSha256(parityData),
        'rust_fear_oracle_results.json was produced from different scenarios than the current vectors file. Run `npm run codegen:rust-fear-oracle`.'
    );
    console.log('  * results were produced from exactly these scenarios (scenario hash matches)');

    const hostFear = path.join(HOST_REPO, oracle.provenance.fear_rs_path);
    if (fs.existsSync(hostFear)) {
        const current = sourceSha256(fs.readFileSync(hostFear, 'utf8'));
        assert(
            current === oracle.provenance.fear_rs_sha256,
            `host fear.rs changed since the Rust results were generated (now ${current.slice(0, 12)}…, recorded ${oracle.provenance.fear_rs_sha256.slice(0, 12)}…). Run \`npm run codegen:rust-fear-oracle\` and review the vector diff.`
        );
        console.log(`  * host fear.rs is byte-identical (line-ending-normalised) to the source that was executed`);
    } else {
        console.log(`  * SKIPPED: host fear.rs not reachable at ${hostFear}; the Rust results are recorded, not re-tied to the current source here.`);
    }

    const byId = new Map(oracle.results.map(r => [r.id, r]));
    assert(byId.size === oracle.results.length, 'duplicate ids in Rust results');
    assert(
        vectors.every(v => byId.has(v.id)) && oracle.results.length === vectors.length,
        'Rust results and vectors do not cover the same ids'
    );

    // --- Threshold table (JS side) ------------------------------------------
    console.log('\n--- Threshold Parity Verification ---');
    const core = new FearCore();
    for (const row of parityData.threshold_parity_matrix) {
        if (row.js_state === 'ALERT') {
            assert(core.config.enter.ALERT === row.enter_threshold && core.config.exit.CALM === row.exit_threshold,
                `Alert threshold divergence: ${JSON.stringify(core.config.enter)} vs ${JSON.stringify(row)}`);
        } else if (row.js_state === 'ANXIOUS') {
            assert(core.config.enter.ANXIOUS === row.enter_threshold && core.config.exit.ALERT === row.exit_threshold,
                `Anxious/Afraid threshold divergence: ${JSON.stringify(core.config.enter)} vs ${JSON.stringify(row)}`);
        } else if (row.js_state === 'PANIC') {
            assert(core.config.enter.PANIC === row.enter_threshold && core.config.exit.ANXIOUS === row.exit_threshold,
                `Panic threshold divergence: ${JSON.stringify(core.config.enter)} vs ${JSON.stringify(row)}`);
            assert(core.config.panicLockTicks === row.panic_lock_ticks,
                `Panic lock ticks divergence: ${core.config.panicLockTicks} vs ${row.panic_lock_ticks}`);
        }
        console.log(`  * Band [${row.band} <-> ${row.js_state}]: Enter=${row.enter_threshold}, Exit=${row.exit_threshold} -> JS matches the recorded matrix`);
    }
    console.log('  * (Rust thresholds are exercised through the executed boundary vectors below: 0.79/0.80, 0.54/0.55, 1.39/1.40, 3.79/3.80, 1.19/1.20, lock 0.79/0.80)');

    // --- Boundary vectors ---------------------------------------------------
    console.log('\n--- Executing Boundary Vectors (Rust = executed fear.rs, JS = live FearCore) ---');
    let agree = 0;
    let diverge = 0;
    const usedDivergences = new Set();

    for (const vec of vectors) {
        const rust = byId.get(vec.id);

        // (3) the written Rust expectation must equal the executed Rust result.
        assert(
            rust.final_band === vec.expected_rust_band,
            `Vector ${vec.id}: expected_rust_band=${vec.expected_rust_band} but the executed fear.rs produced ${rust.final_band}`
        );

        // JS side: build the starting state.
        const fc = new FearCore();
        fc.reset(vec.initial_state);

        if (vec.initial_state === 'PANIC' && vec.panic_locked === true) {
            fc.reset('ANXIOUS');
            fc.update(3.85); // Triggers PANIC and sets panicLockedUntil = tickCount + 10
        } else if (vec.initial_state === 'PANIC' && vec.panic_locked === false) {
            fc.reset('ANXIOUS');
            fc.update(3.85);
            for (let i = 0; i < 15; i++) {
                fc.update(2.5); // Still above 1.2 exit threshold, but advances tick past lock
            }
        }

        let stimulus = vec.stimulus_score;
        if (vec.is_nan) stimulus = NaN;

        let jsState;
        let detail = '';
        if (vec.id === 'VEC-15B-EXTREME-INPUT-STEPPED-LADDER') {
            const res1 = fc.update(stimulus);
            jsState = res1.state;
            assert(res1.state === vec.expected_js_state_tick1,
                `Vector ${vec.id} tick 1 failed! Got ${res1.state}, expected ${vec.expected_js_state_tick1}`);
            fc.update(stimulus); // tick 2 -> ANXIOUS
            const res3 = fc.update(stimulus); // tick 3 -> PANIC
            assert(res3.state === vec.expected_js_state_tick3,
                `Vector ${vec.id} tick 3 failed! Got ${res3.state}, expected ${vec.expected_js_state_tick3}`);
            detail = ` [JS ladder: ${res1.state} t1 -> ${res3.state} t3]`;
        } else {
            jsState = fc.update(stimulus).state;
        }

        // (4) JS expectation.
        assert(jsState === vec.expected_js_state,
            `Vector ${vec.id} failed! Stimulus ${stimulus} from ${vec.initial_state} produced JS ${jsState}, expected ${vec.expected_js_state}`);

        // (5) divergence discipline.
        const rustAsJs = JS_STATE_FOR_RUST[rust.final_band] ?? null;
        const differs = rustAsJs !== jsState;
        const codes = vec.divergence || [];
        for (const c of codes) {
            assert(declared[c], `Vector ${vec.id} cites divergence ${c}, which is not in declared_divergences`);
            usedDivergences.add(c);
        }
        if (differs && codes.length === 0) {
            throw new Error(`Vector ${vec.id}: UNDECLARED divergence. Rust ${rust.final_band} vs JS ${jsState}. Add it to declared_divergences or fix the engine.`);
        }
        if (!differs && codes.length > 0) {
            throw new Error(`Vector ${vec.id}: declares divergence ${codes.join(',')} but Rust ${rust.final_band} and JS ${jsState} agree. Remove the stale declaration.`);
        }

        if (differs) {
            diverge++;
            console.log(`  * ${vec.id}: Rust ${rust.initial_band} -> ${rust.final_band}  |  JS ${vec.initial_state} -> ${jsState}  => DECLARED DIVERGENCE ${codes.join('+')}${detail}`);
        } else {
            agree++;
            console.log(`  * ${vec.id}: Rust ${rust.initial_band} -> ${rust.final_band}  |  JS ${vec.initial_state} -> ${jsState}  => AGREE${detail}`);
        }
    }

    for (const code of Object.keys(declared)) {
        assert(usedDivergences.has(code) || /^B(7|8|9|10)$/.test(code),
            `declared_divergences.${code} is not demonstrated by any vector (stale declaration)`);
    }

    // --- Observations B7-B10 ------------------------------------------------
    console.log('\n--- Lock clock, re-arm, clamp, berserk observations ---');
    const exp = parityData.observation_expectations;
    const obs = oracle.observations;

    // Consecutive lock hold.
    {
        const fc = new FearCore();
        fc.reset('ANXIOUS');
        fc.update(4.0);
        let held = 0;
        for (let i = 0; i < 40; i++) {
            if (fc.update(1.0).state === 'PANIC') held++; else break;
        }
        const e = exp.consecutive_lock_hold;
        assert(obs.consecutive_hold_at_score_1_0.further_evaluations_held === e.rust_further_evaluations_held,
            `Rust consecutive hold ${obs.consecutive_hold_at_score_1_0.further_evaluations_held} != recorded ${e.rust_further_evaluations_held}`);
        assert(held === e.js_further_updates_held, `JS consecutive hold ${held} != recorded ${e.js_further_updates_held}`);
        console.log(`  * consecutive evaluations: Rust holds panic for ${obs.consecutive_hold_at_score_1_0.further_evaluations_held}, JS for ${held} => AGREE (the lock length matches when evaluations are consecutive)`);
    }
    // B7: sparse host ticks.
    {
        const fc = new FearCore();
        fc.reset('ANXIOUS');
        fc.update(4.0);
        const js = fc.update(1.0).state;
        const e = exp.sparse_host_tick_release;
        assert(obs.sparse_host_tick_release.band === e.rust_band, `Rust sparse-tick band ${obs.sparse_host_tick_release.band} != recorded ${e.rust_band}`);
        assert(js === e.js_state_after_one_update, `JS state after one update ${js} != recorded ${e.js_state_after_one_update}`);
        console.log(`  * B7 sparse host ticks (enter@10, next eval@25, score 1.0): Rust ${obs.sparse_host_tick_release.band} (released), JS ${js} (still locked) => DECLARED DIVERGENCE B7`);
    }
    // B7: no tick.
    {
        const fc = new FearCore();
        fc.reset('ANXIOUS');
        fc.update(4.0);
        const jsArmed = fc.panicLockedUntil !== null && fc.panicLockedUntil > fc.tickCount;
        const e = exp.lock_without_eval_tick;
        assert(obs.lock_armed_without_eval_tick.recovery_lock_until === e.rust_recovery_lock_until,
            `Rust lock without eval_tick ${obs.lock_armed_without_eval_tick.recovery_lock_until} != recorded ${e.rust_recovery_lock_until}`);
        assert(jsArmed === e.js_lock_armed, `JS lock armed=${jsArmed} != recorded ${e.js_lock_armed}`);
        console.log(`  * B7 no eval tick: Rust arms no lock (lock_until=${obs.lock_armed_without_eval_tick.recovery_lock_until}), JS always arms one => DECLARED DIVERGENCE B7`);
    }
    // B8: re-arm.
    {
        const fc = new FearCore();
        fc.state = 'HIDE';
        fc.tickCount = 5;
        fc.panicLockedUntil = null;
        const r = fc.update(4.0, { threats: 1 });
        const rearmed = r.state === 'PANIC' && fc.panicLockedUntil === fc.tickCount + fc.config.panicLockTicks;
        const e = exp.lock_rearm;
        assert(obs.panicked_to_routed_lock.lock_until_before === e.rust_lock_until_before
            && obs.panicked_to_routed_lock.lock_until_after === e.rust_lock_until_after,
            `Rust Panicked->Routed lock ${obs.panicked_to_routed_lock.lock_until_before}->${obs.panicked_to_routed_lock.lock_until_after} != recorded`);
        assert(rearmed === e.js_rearmed_on_reentry_from_extended_band, `JS re-arm on re-entry from HIDE = ${rearmed}, recorded ${e.js_rearmed_on_reentry_from_extended_band}`);
        console.log(`  * B8 re-arm: Rust Panicked->${obs.panicked_to_routed_lock.band} keeps lock_until=${obs.panicked_to_routed_lock.lock_until_after}; JS re-arms a fresh lock on re-entry to PANIC from an extended band (not a like-for-like transition) => DECLARED DIVERGENCE B8`);
    }
    // B9: clamp.
    {
        const js = new FearCore().update(999).fear;
        const e = exp.score_clamp;
        assert(obs.clamp_999.final_score === e.rust_final_score, `Rust clamp ${obs.clamp_999.final_score} != recorded ${e.rust_final_score}`);
        assert(js === e.js_recorded_fear, `JS recorded fear ${js} != recorded ${e.js_recorded_fear}`);
        console.log(`  * B9 clamp: Rust clamps 999 -> ${obs.clamp_999.final_score}; JS records ${js} (band unaffected) => DECLARED DIVERGENCE B9`);
    }
    // B10: berserk vs aggressive.
    {
        const fc = new FearCore();
        fc.state = 'AGGRESSIVE';
        const js = fc.update(0, { currentAnger: 0.1 }).state;
        const e = exp.berserk_vs_aggressive;
        assert(obs.berserk_override.after_score_0 === e.rust_after_score_0 && obs.berserk_override.after_score_5 === e.rust_after_score_5,
            `Rust berserk ${obs.berserk_override.after_score_0}/${obs.berserk_override.after_score_5} != recorded`);
        assert(js === e.js_state_after_anger_drop, `JS AGGRESSIVE after anger drop = ${js}, recorded ${e.js_state_after_anger_drop}`);
        console.log(`  * B10 berserk: Rust BerserkOverride is absorbing (stays at score 0 and 5); JS AGGRESSIVE exits to ${js} when anger drops => DECLARED DIVERGENCE B10`);
    }

    console.log('\n============================================================');
    console.log(`SUCCESS: ${vectors.length} cross-tree vectors verified against the EXECUTED Rust oracle: ${agree} agree, ${diverge} declared divergences (each reproduced on both sides); lock/clamp/berserk observations B7-B10 hold.`);
    console.log('This is a measured Rust-vs-JS comparison, not a claim of bit-identical behaviour.');
    console.log('============================================================\n');
}

main().catch(err => {
    console.error('VERIFICATION FAILURE:', err.message || err);
    process.exit(1);
});
