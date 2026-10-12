#!/usr/bin/env node
/**
 * tools/codegen/generate_rust_fear_oracle.mjs
 *
 * Produces `evidence/rust_fear_oracle_results.json` by EXECUTING the real Pixel Pets
 * `fear.rs` (the canonical band/hysteresis/panic-lock model) on the scenarios in
 * `evidence/rust_js_parity_vectors.json`.
 *
 * Why it exists: `verify_cross_tree_parity.mjs` used to compare JS against
 * `expected_rust_band` values that were typed by hand and never executed. One of
 * them (VEC-12) was wrong about Rust. A Rust column nobody runs is an assertion,
 * not a measurement.
 *
 * How: `fear.rs` is COPIED (read-only on the host) into a temp crate together with the
 * oracle in `tools/codegen/rust_fear_oracle/`, built and run there, with the target
 * directory in the temp dir too. Nothing is built inside either repository, so the host
 * repo's build-isolation guardrails (BUILD_AND_RECOVERY_GUARDRAILS.md) are not involved.
 *
 *   node tools/codegen/generate_rust_fear_oracle.mjs          # write the results file
 *   node tools/codegen/generate_rust_fear_oracle.mjs --check  # regenerate in memory and compare
 *
 * `--check` needs the host checkout and cargo; without them it prints SKIPPED and exits 0
 * (the committed results still stand, they just are not re-derived here).
 *
 * Hard Rule 9: this runs a one-shot Rust program, not a test runner.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildScenarios, scenariosSha256, sourceSha256 } from './rust_fear_oracle/scenarios.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const ORACLE_DIR = path.join(__dirname, 'rust_fear_oracle');
const VECTORS = path.join(REPO, 'evidence/rust_js_parity_vectors.json');
const OUT = path.join(REPO, 'evidence/rust_fear_oracle_results.json');
const HOST_REPO = process.env.FEAR_AI_HOST_REPO
    || 'C:\\tools\\03-Projects\\lains Tools\\New Master Game';
const FEAR_RS_REL = 'pixel-pets/src/engine/ai/fear.rs';
const check = process.argv.includes('--check');

function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
}
function git(args) {
    const r = run('git', ['-C', HOST_REPO, ...args]);
    return r.status === 0 ? r.stdout.trim() : null;
}
function skipOrFail(message) {
    if (check) {
        console.log(`SKIPPED: ${message}`);
        console.log('The committed oracle results stand but were not re-derived here.');
        process.exit(0);
    }
    console.error(`FAILED: ${message}`);
    process.exit(1);
}

const fearRs = path.join(HOST_REPO, FEAR_RS_REL);
if (!fs.existsSync(fearRs)) skipOrFail(`host fear.rs not found at ${fearRs} (set FEAR_AI_HOST_REPO).`);
const cargoVersion = run('cargo', ['--version']);
if (cargoVersion.status !== 0) skipOrFail('cargo is not available.');

const vectors = JSON.parse(fs.readFileSync(VECTORS, 'utf8'));
const scenarios = buildScenarios(vectors);
const fearText = fs.readFileSync(fearRs, 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fear-rust-oracle-'));
try {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.copyFileSync(path.join(ORACLE_DIR, 'Cargo.toml'), path.join(tmp, 'Cargo.toml'));
    fs.copyFileSync(path.join(ORACLE_DIR, 'src/main.rs'), path.join(tmp, 'src/main.rs'));
    fs.writeFileSync(path.join(tmp, 'src/fear.rs'), fearText);
    const lockInRepo = path.join(ORACLE_DIR, 'Cargo.lock');
    const haveLock = fs.existsSync(lockInRepo);
    if (haveLock) fs.copyFileSync(lockInRepo, path.join(tmp, 'Cargo.lock'));
    fs.writeFileSync(path.join(tmp, 'scenarios.json'), JSON.stringify(scenarios));

    const env = { ...process.env, CARGO_TARGET_DIR: path.join(tmp, 'target') };
    const base = ['run', '--quiet', ...(haveLock ? ['--locked'] : [])];
    let r = run('cargo', [...base, '--offline', '--', 'scenarios.json'], { cwd: tmp, env });
    if (r.status !== 0) r = run('cargo', [...base, '--', 'scenarios.json'], { cwd: tmp, env });
    if (r.status !== 0) {
        console.error(r.stderr);
        skipOrFail('the oracle crate failed to build or run (see cargo output above).');
    }
    if (!haveLock && fs.existsSync(path.join(tmp, 'Cargo.lock')) && !check) {
        fs.copyFileSync(path.join(tmp, 'Cargo.lock'), lockInRepo);
        console.log(`Wrote ${path.relative(REPO, lockInRepo)} (pinned dependency graph for the oracle).`);
    }

    const oracle = JSON.parse(r.stdout);
    const rustc = run('rustc', ['--version']).stdout.trim();
    const doc = {
        schema: 'fear-ai.rust-fear-oracle-results.v1',
        description: 'Output of the REAL host fear.rs executed on the rust_scenario records of rust_js_parity_vectors.json. Do not edit by hand; regenerate with `npm run codegen:rust-fear-oracle`.',
        provenance: {
            host_repo_head: git(['rev-parse', 'HEAD']),
            fear_rs_path: FEAR_RS_REL,
            fear_rs_sha256: sourceSha256(fearText),
            fear_rs_last_commit: git(['log', '-1', '--format=%H', '--', FEAR_RS_REL]),
            fear_rs_matches_head: git(['status', '--porcelain', '--', FEAR_RS_REL]) === '',
            scenarios_sha256: scenariosSha256(vectors),
            oracle_source_sha256: sourceSha256(fs.readFileSync(path.join(ORACLE_DIR, 'src/main.rs'), 'utf8')),
            rustc,
            generated_utc: new Date().toISOString()
        },
        results: oracle.results,
        observations: oracle.observations
    };

    if (check) {
        const committed = JSON.parse(fs.readFileSync(OUT, 'utf8'));
        const strip = d => JSON.stringify({
            r: d.results,
            o: d.observations,
            p: { ...d.provenance, generated_utc: null, rustc: null, host_repo_head: null, fear_rs_last_commit: null, fear_rs_matches_head: null }
        });
        if (strip(committed) !== strip(doc)) {
            console.error('DRIFT: evidence/rust_fear_oracle_results.json no longer matches what the real fear.rs produces.');
            console.error('Run `npm run codegen:rust-fear-oracle` and review the diff.');
            process.exit(1);
        }
        console.log(`OK: committed oracle results match a fresh execution of fear.rs (sha256 ${doc.provenance.fear_rs_sha256.slice(0, 12)}…).`);
    } else {
        fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
        console.log(`Wrote ${path.relative(REPO, OUT)}: ${oracle.results.length} scenarios, fear.rs sha256 ${doc.provenance.fear_rs_sha256.slice(0, 12)}…`);
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
