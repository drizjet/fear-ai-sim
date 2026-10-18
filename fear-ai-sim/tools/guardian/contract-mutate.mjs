// tools/guardian/contract-mutate.mjs
//
// EVID-2026-08-29-MUTATION-HARNESS (Guardian V4 §5):
// Real production-source mutation harness. Creates a disposable
// copy of the production source, applies exactly one named
// semantic mutation, runs the contract's protected verifier,
// records the result (KILLED / SURVIVED / INVALID), and
// restores the original. The main worktree is NEVER modified.
//
// Verifier (MOVEMENT B2 migration, post-Hard Rule 9): the protected
// verifier is the deterministic probe suite (tools/verification/
// run_probe_suite.mjs), not Jest — Hard Rule 9 retired the Jest
// suites and removed the binary this file used to invoke. A mutant
// is KILLED when its contract probe appears in the suite's failing
// roster; SURVIVED when the suite is green; INVALID otherwise.
// Receipts are schema v2: expectedFailingProbe / observedFailingProbes
// replace the jest-era expectedFailingTest / observedFailingTests.
//
// Usage:
//   node tools/guardian/contract-mutate.mjs --mutant MUT-RUNTIME-001
//   node tools/guardian/contract-mutate.mjs --list
//
// The --list flag prints the mutant catalog.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, symlinkSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(process.cwd());

// ---- Mutant catalog (V4 §5.2) ----
const CATALOG = {
    'MUT-RUNTIME-001': {
        contractId: 'TRADE.RUNTIME.NO_DOUBLE_EXECUTION',
        description: 'Reintroduce second merchant canonical tick in a later phase',
        targetFile: 'closed-world.js',
        // The original fix removed tickCanonicalMerchant from step 7.5.
        // This mutation re-adds it, simulating the V3 double-ticking defect.
        // We match a unique anchor (the EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION
        // comment header) and insert a merchant loop before it.
        findPattern: /    \/\/ 7\.5\. EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION \(Guardian V3/,
        replacement: `    // MUT-RUNTIME-001: reintroduce second merchant canonical tick (regression)
    for (const merchant of (world.merchants || [])) {
        if (merchant && merchant.riskTolerance !== undefined) {
            tickCanonicalMerchant(world, merchant.id, { tick, rng: encounterRng ?? deterministicRng((tick * 0x9E3779B9) >>> 0) });
        }
    }
    // 7.5. EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION (Guardian V3`,
        expectedFailingProbe: 'verify_trade_runtime_contracts.mjs',
    },
    'MUT-RUNTIME-002': {
        contractId: 'TRADE.RUNTIME.AUTHORITATIVE_PATH',
        description: 'Make runClosedWorldStep stop invoking tickClosedWorld',
        targetFile: 'simulation.js',
        // Re-anchored 2026-10-17 (MOVEMENT B2): the call site gained the
        // attackRoadId field after the V3 seal; the old `{ tick, perceivedDanger }`
        // pattern no longer matched live source.
        findPattern: /        tickClosedWorld\(this\.closedWorld, \{ tick, perceivedDanger, attackRoadId \}\);/,
        replacement: '        // MUT-RUNTIME-002: stop invoking the canonical reducer (regression)\n        // tickClosedWorld(this.closedWorld, { tick, perceivedDanger, attackRoadId });',
        expectedFailingProbe: 'verify_trade_runtime_contracts.mjs',
    },
    'MUT-OBS-001': {
        contractId: 'TRADE.CATMOUSE.LEGAL_OBSERVATION_ONLY',
        description: 'Merchant route selection reads authoritative bandit location directly',
        targetFile: 'canonical-trade-system.js',
        findPattern: /    merchant\.selectedRoute = decision\.chosenRoute;/,
        replacement: `    // MUT-OBS-001: forbidden shortcut — merchant reads bandit authoritative position
    // and forces the chosen route to avoid it, regardless of perceptionAccuracy.
    let _mutObsChosenRoute = decision.chosenRoute;
    if (world.bandits && world.bandits.length > 0) {
        for (const _b of world.bandits) {
            if (_b && _b.roadId === _mutObsChosenRoute) {
                // Find an alternative route that is NOT the bandit's road.
                for (const _r of routes) {
                    if (_r.id !== _b.roadId) {
                        _mutObsChosenRoute = _r.id;
                        break;
                    }
                }
            }
        }
    }
    merchant.selectedRoute = _mutObsChosenRoute;
    merchant.lastRoute = _mutObsChosenRoute;`,
        expectedFailingProbe: 'verify_trade_runtime_contracts.mjs',
    },
    'MUT-MIG-001': {
        contractId: 'MIGRATION.DRIVEN_BY_RECENT_GRIEVANCE',
        description: 'Make migration fire independent of causal push pressure and cooldown',
        targetFile: 'closed-world.js',
        // Re-anchored 2026-10-17 (MOVEMENT B2): the V3 compound condition was
        // refactored into named booleans; the old `if (result.migrationPressure > 0.5 ...)`
        // pattern no longer matched live source. The mutation keeps the
        // population/destination guards (so migration is still plausible) but
        // drops the causal pressure gate and the cooldown gate.
        findPattern: /        const canMigrate = pressureExceeds && !withinCooldown && hasPopulation && hasDestination;/,
        replacement: '        const canMigrate = hasPopulation && hasDestination; // MUT-MIG-001: drop pressure and cooldown gates (regression)',
        expectedFailingProbe: 'verify_trade_runtime_contracts.mjs',
    },
    'MUT-EVID-001': {
        contractId: 'EVIDENCE.SEED.IDEMPOTENT',
        description: 'Append duplicate evidence despite same claim+dimension+fingerprint',
        targetFile: 'evidence/receipt.mjs',
        findPattern: /        if \(!isDuplicate\) \{[\s\S]*?            appendFileSync\(ledgerPath, JSON\.stringify\(row\) \+ '\\n'\);[\s\S]*?        \}/,
        replacement: `        // MUT-EVID-001: append without duplicate check (regression)
        appendFileSync(ledgerPath, JSON.stringify(row) + '\\n');`,
        expectedFailingProbe: 'verify_evidence_seed_idempotency.mjs',
    },
};

// ---- CLI parsing ----
const args = process.argv.slice(2);
if (args.includes('--list')) {
    console.log('Mutant catalog:');
    for (const [id, m] of Object.entries(CATALOG)) {
        console.log(`  ${id}: ${m.description}`);
        console.log(`    target: ${m.targetFile}`);
        console.log(`    contract: ${m.contractId}`);
        console.log(`    expected failing probe: ${m.expectedFailingProbe}`);
    }
    process.exit(0);
}

const mutantIdIdx = args.indexOf('--mutant');
if (mutantIdIdx === -1) {
    console.error('Usage: node tools/guardian/contract-mutate.mjs --mutant MUT-XXX');
    console.error('       node tools/guardian/contract-mutate.mjs --list');
    process.exit(1);
}
const mutantId = args[mutantIdIdx + 1];
const mutant = CATALOG[mutantId];
if (!mutant) {
    console.error(`Unknown mutant: ${mutantId}. Use --list to see available mutants.`);
    process.exit(1);
}

// ---- Set up disposable worktree ----
// V4 §5.1: "disposable Git worktree or clean temporary repository copy".
// We use a clean temp directory but SYMLINK node_modules from the host
// to avoid copying gigabytes of dependencies. The mutation is applied
// to the COPIED production source (in the disposable dir), not the host.
// The test runner runs from the disposable dir but resolves modules
// through the symlinked node_modules.
const disposableDir = join(tmpdir(), `fear-mutate-${mutantId}-${Date.now()}`);
mkdirSync(disposableDir, { recursive: true });

console.log(`Setting up disposable worktree at ${disposableDir}...`);
function copyDirSync(src, dest) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
        const s = join(src, entry.name);
        const d = join(dest, entry.name);
        if (entry.isDirectory()) {
            // Skip heavy/temp dirs. We'll symlink node_modules separately.
            if (['.git', 'node_modules', 'dist', 'coverage', 'scratchpad', '.omx', '.guardian-tmp'].includes(entry.name)) continue;
            copyDirSync(s, d);
        } else if (entry.isFile()) {
            copyFileSync(s, d);
        }
    }
}
const startTime = Date.now();
copyDirSync(ROOT, disposableDir);
// Symlink node_modules from host so the probe suite resolves dependencies
// without copying gigabytes.
try {
    const hostNm = join(ROOT, 'node_modules');
    const dispNm = join(disposableDir, 'node_modules');
    if (!existsSync(dispNm)) {
        symlinkSync(hostNm, dispNm, 'junction');
    }
} catch (e) {
    console.error('Warning: failed to symlink node_modules:', e.message);
}
const copyDuration = Date.now() - startTime;
console.log(`Copy took ${copyDuration}ms (node_modules symlinked)`);

// ---- Hash the pre-mutation source ----
const targetPath = join(disposableDir, mutant.targetFile);
const preHash = createHash('sha256').update(readFileSync(targetPath)).digest('hex');
const originalContent = readFileSync(targetPath, 'utf8');

if (!mutant.findPattern.test(originalContent)) {
    console.error(`MUTANT PATTERN NOT FOUND in ${mutant.targetFile}`);
    console.error(`The pattern in CATALOG['${mutantId}'] does not match the current source.`);
    console.error(`This means the mutant is INVALID for the current source state.`);
    rmSync(disposableDir, { recursive: true, force: true });
    process.exit(2);
}

// ---- Apply the mutation ----
const mutated = originalContent.replace(mutant.findPattern, mutant.replacement);
writeFileSync(targetPath, mutated);
const postHash = createHash('sha256').update(readFileSync(targetPath)).digest('hex');
const patchHash = createHash('sha256').update(mutated).digest('hex');

console.log(`Applied mutation ${mutantId} to ${mutant.targetFile}`);
console.log(`  pre-hash: ${preHash}`);
console.log(`  post-hash: ${postHash}`);

// ---- Run the protected verifier ----
// Hard Rule 9 retired Jest; the protected verifier is the deterministic probe
// suite. --json writes the roster to a file INSIDE the disposable dir (the
// runner resolves the path against its own repo root) — that roster is the
// machine-readable verdict this harness parses.
console.log('Running protected verifier (deterministic probe suite)...');
const probeRunJsonRel = '.guardian-probe-run.json';
const probeRunJsonPath = join(disposableDir, probeRunJsonRel);
let exitCode = 0;
let stdout = '';
try {
    stdout = execSync(`node tools/verification/run_probe_suite.mjs --json ${probeRunJsonRel} 2>&1`, {
        cwd: disposableDir,
        encoding: 'utf8',
        timeout: 1200000,
        maxBuffer: 64 * 1024 * 1024,
    });
} catch (e) {
    exitCode = e.status || 1;
    stdout = e.stdout || '';
    console.log(`Probe suite exited with code ${exitCode}, stdout length ${stdout.length}`);
}

// Prefer the runner's own JSON roster; fall back to parsing its summary
// lines (format: "  FAIL     verify_x.mjs  ..." / "  FLAKY    ...").
let payload = null;
try {
    payload = JSON.parse(readFileSync(probeRunJsonPath, 'utf8'));
} catch {
    payload = null;
}
let observedFailingProbes = [];
let probeSuite = null;
if (payload && payload.totals) {
    observedFailingProbes = Array.isArray(payload.failures) ? [...payload.failures] : [];
    probeSuite = {
        probes: payload.totals.probes,
        passed: payload.totals.passed,
        passedWithSkips: payload.totals.passedWithSkips,
        failed: payload.totals.failed,
        notProven: Array.isArray(payload.notProven) ? payload.notProven.map(entry => entry.name) : [],
    };
} else {
    for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^\s+(?:FAIL|FLAKY)\s+(\S+\.mjs)/);
        if (m) observedFailingProbes.push(m[1]);
    }
}
observedFailingProbes = [...new Set(observedFailingProbes)];

// KILLED: the mutant's own contract probe failed the suite (which is why the
// suite exited non-zero). SURVIVED: the suite stayed green — a verifier
// weakness (P0). INVALID: red for some other reason, so the mutation could
// not be validated.
const expectedFailingProbe = mutant.expectedFailingProbe;
const observedFailing = observedFailingProbes.includes(expectedFailingProbe);
let result;
if (exitCode === 0 && observedFailingProbes.length === 0) {
    result = 'SURVIVED'; // P0 verifier weakness
} else if (exitCode !== 0 && observedFailing) {
    result = 'KILLED';
} else {
    result = 'INVALID'; // failed but not for the expected reason
}

// ---- Record the receipt ----
const receiptsDir = join(ROOT, 'docs/guardian/mutation-receipts');
mkdirSync(receiptsDir, { recursive: true });

const stamp = Date.now();
// Write the full stdout to the receipt for debugging
const fullLogPath = join(receiptsDir, `${mutantId}-${stamp}-stdout.log`);
writeFileSync(fullLogPath, stdout);
const fullLogSize = stdout.length;

// Preserve the probe-suite roster alongside the receipt: the disposable dir
// is deleted below, and the roster is the machine-readable evidence the
// verdict was computed from.
let probeRunCopyPath = null;
if (payload) {
    probeRunCopyPath = join(receiptsDir, `${mutantId}-${stamp}-probe-run.json`);
    writeFileSync(probeRunCopyPath, `${JSON.stringify(payload, null, 2)}\n`);
}

const receipt = {
    schemaVersion: 2,
    mutationId: mutantId,
    contractId: mutant.contractId,
    description: mutant.description,
    targetFile: mutant.targetFile,
    preHash,
    postHash,
    patchHash,
    verifier: {
        kind: 'deterministic-probe-suite',
        command: `node tools/verification/run_probe_suite.mjs --json ${probeRunJsonRel}`,
        probeSuite,
    },
    expectedFailingProbe,
    observedFailingProbes,
    exitCode,
    result,
    disposableDir,
    copyDurationMs: copyDuration,
    verdict: result === 'KILLED' ? 'MUTANT_KILLED' : result === 'SURVIVED' ? 'VERIFIER_WEAKNESS_P0' : 'INVALID_MUTANT',
    recordedAt: new Date().toISOString(),
};

const receiptPath = join(receiptsDir, `${mutantId}-${stamp}.json`);
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

console.log('\n--- MUTATION RECEIPT ---');
console.log(JSON.stringify(receipt, null, 2));
console.log(`\nReceipt written to ${receiptPath}`);
if (probeRunCopyPath) console.log(`Probe-suite roster preserved at ${probeRunCopyPath}`);

// ---- Clean up disposable dir ----
rmSync(disposableDir, { recursive: true, force: true });
console.log(`Disposable worktree cleaned up.`);
console.log(`Full stdout log: ${fullLogPath} (${fullLogSize} bytes)`);

// ---- Exit code reflects the result ----
if (result === 'KILLED') {
    process.exit(0);
} else if (result === 'SURVIVED') {
    console.error(`\nP0: MUTANT SURVIVED. The protected verifier did not fail under the planted defect.`);
    process.exit(1);
} else {
    console.error(`\nINVALID MUTANT: the harness could not validate the mutation.`);
    process.exit(2);
}
