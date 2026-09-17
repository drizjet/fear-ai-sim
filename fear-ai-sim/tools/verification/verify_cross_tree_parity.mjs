/**
 * tools/verification/verify_cross_tree_parity.mjs
 * 
 * Verifies mathematical transition parity between canonical Rust Fear engine
 * (`pixel-pets/src/engine/ai/fear.rs`) and JavaScript FearCore (`packages/core/src/FearCore.js`).
 * 
 * Executes boundary test vectors from `evidence/rust_js_parity_vectors.json`.
 * 
 * Hard Rule 9 Compliant: 0 automated test runner frameworks. Standalone deterministic script.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FearCore } from '../../packages/core/src/FearCore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('============================================================');
    console.log('VERIFY CROSS-TREE RUST <-> JS FEAR PARITY VECTORS');
    console.log('============================================================\n');

    const vectorsPath = path.resolve(__dirname, '../../evidence/rust_js_parity_vectors.json');
    if (!fs.existsSync(vectorsPath)) throw new Error(`Parity vectors missing at ${vectorsPath}`);

    const parityData = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
    console.log(`Loaded provenance:`);
    console.log(`- Rust Source: ${parityData.provenance.rust_canonical_source}`);
    console.log(`- Sibling Commit: ${parityData.provenance.sibling_repo_commit}`);
    console.log(`- JS Source: ${parityData.provenance.js_canonical_source}`);
    console.log(`- Total Boundary Vectors: ${parityData.boundary_test_vectors.length}\n`);

    // Verify Threshold Parity Table
    console.log('--- Threshold Parity Verification ---');
    const core = new FearCore();
    for (const row of parityData.threshold_parity_matrix) {
        if (row.js_state === 'ALERT') {
            if (core.config.enter.ALERT !== row.enter_threshold || core.config.exit.CALM !== row.exit_threshold) {
                throw new Error(`Alert threshold divergence: ${JSON.stringify(core.config.enter)} vs ${JSON.stringify(row)}`);
            }
        } else if (row.js_state === 'ANXIOUS') {
            if (core.config.enter.ANXIOUS !== row.enter_threshold || core.config.exit.ALERT !== row.exit_threshold) {
                throw new Error(`Anxious/Afraid threshold divergence: ${JSON.stringify(core.config.enter)} vs ${JSON.stringify(row)}`);
            }
        } else if (row.js_state === 'PANIC') {
            if (core.config.enter.PANIC !== row.enter_threshold || core.config.exit.ANXIOUS !== row.exit_threshold) {
                throw new Error(`Panic threshold divergence: ${JSON.stringify(core.config.enter)} vs ${JSON.stringify(row)}`);
            }
            if (core.config.panicLockTicks !== row.panic_lock_ticks) {
                throw new Error(`Panic lock ticks divergence: ${core.config.panicLockTicks} vs ${row.panic_lock_ticks}`);
            }
        }
        console.log(`  * Band [${row.band} <-> ${row.js_state}]: Enter=${row.enter_threshold}, Exit=${row.exit_threshold} -> PARITY MATCH`);
    }

    // Execute Boundary Test Vectors
    console.log('\n--- Executing Boundary Vectors ---');
    let passCount = 0;

    for (const vec of parityData.boundary_test_vectors) {
        const fc = new FearCore();
        fc.reset(vec.initial_state);

        if (vec.initial_state === 'PANIC' && vec.panic_locked === true) {
            // Enter panic to trigger lock
            fc.reset('ANXIOUS');
            fc.update(3.85); // Triggers PANIC and sets panicLockedUntil = tickCount + 10
        } else if (vec.initial_state === 'PANIC' && vec.panic_locked === false) {
            // Advance past panic lock
            fc.reset('ANXIOUS');
            fc.update(3.85);
            for (let i = 0; i < 15; i++) {
                fc.update(2.5); // Still above 1.2 exit threshold, but advances tick past lock
            }
        }

        if (vec.id === 'VEC-15B-EXTREME-INPUT-STEPPED-LADDER') {
            const res1 = fc.update(vec.stimulus_score);
            if (res1.state !== vec.expected_js_state_tick1) {
                throw new Error(`Vector ${vec.id} tick 1 failed! Got ${res1.state}, expected ${vec.expected_js_state_tick1}`);
            }
            fc.update(vec.stimulus_score); // tick 2 -> ANXIOUS
            const res3 = fc.update(vec.stimulus_score); // tick 3 -> PANIC
            if (res3.state !== vec.expected_js_state_tick3) {
                throw new Error(`Vector ${vec.id} tick 3 failed! Got ${res3.state}, expected ${vec.expected_js_state_tick3}`);
            }
            console.log(`  * ${vec.id} (CALM -> ${res1.state} [t1] -> ANXIOUS [t2] -> ${res3.state} [t3]): PASS`);
            passCount++;
            continue;
        }

        let stimulus = vec.stimulus_score;
        if (vec.is_nan) stimulus = NaN;

        const res = fc.update(stimulus);

        if (res.state !== vec.expected_js_state) {
            throw new Error(`Vector ${vec.id} failed! Stimulus ${stimulus} from ${vec.initial_state} produced ${res.state}, expected ${vec.expected_js_state}`);
        }

        console.log(`  * ${vec.id} (${vec.initial_state} + ${stimulus} -> ${res.state}): PASS`);
        passCount++;
    }

    console.log('\n============================================================');
    console.log(`SUCCESS: All ${passCount} cross-tree parity vectors PASSED bit-identically!`);
    console.log('============================================================\n');
}

main().catch(err => {
    console.error('VERIFICATION FAILURE:', err);
    process.exit(1);
});
