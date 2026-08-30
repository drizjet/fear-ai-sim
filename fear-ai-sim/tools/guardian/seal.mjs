// tools/guardian/seal.mjs
//
// EVID-2026-08-29-V4-SEAL: compute the ROUND BASELINE SEAL
// fingerprints required by FEAR_GUARDIAN_CAMPAIGN_V4 §2.1.
// The seal is a snapshot of source state at round start. The
// worker must not modify the seal file itself.

import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(process.cwd());

function sha256File(path) {
    const buf = readFileSync(path);
    return createHash('sha256').update(buf).digest('hex');
}

function fingerprintFiles(patterns) {
    // Each pattern is a glob-like path relative to ROOT.
    const results = {};
    for (const pattern of patterns) {
        const abs = resolve(ROOT, pattern);
        try {
            statSync(abs);
            results[pattern] = {
                sha256: sha256File(abs),
                bytes: statSync(abs).size,
            };
        } catch (e) {
            results[pattern] = { error: e.message };
        }
    }
    return results;
}

function gitHead() {
    try {
        return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
        return 'NO_GIT';
    }
}

function gitDirty() {
    try {
        const out = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' }).trim();
        return out.length > 0;
    } catch {
        return null;
    }
}

const SEAL = {
    producedAt: new Date().toISOString(),
    gitHead: gitHead(),
    gitDirty: gitDirty(),
    contracts: fingerprintFiles([
        'docs/contracts/BEHAVIOR_CONTRACTS.json',
        'docs/contracts/BEHAVIOR_CONTRACTS.md',
        'docs/contracts/AUDIT_v1.md',
    ]),
    protected: fingerprintFiles([
        'docs/guardian/ACCEPTED_STATE.json',
        'docs/guardian/PROTECTED_TESTS.json',
    ]),
    evidence: fingerprintFiles([
        'docs/evidence/EVIDENCE_LEDGER.jsonl',
        'docs/evidence/CONTRADICTIONS.jsonl',
    ]),
    production: fingerprintFiles([
        'closed-world.js',
        'canonical-trade-system.js',
        'factionrelationship.js',
        'factioncore.js',
        'beliefs.js',
        'economy.js',
        'simulation.js',
    ]),
    tests: fingerprintFiles([
        'tests/planted-defect-runtime.test.js',
        'tests/closed-world-trade-reroute.test.js',
        'tests/closed-world-chain.test.js',
        'tests/closed-world-all-systems.test.js',
        'tests/closed-world-simulation.test.js',
        'tests/runtime-trade-wiring.test.js',
        'tests/scenario-differentiation-long-horizon.test.js',
    ]),
};

const allFingerprints = { ...SEAL.contracts, ...SEAL.protected, ...SEAL.evidence, ...SEAL.production, ...SEAL.tests };
const workspaceHash = createHash('sha256')
    .update(JSON.stringify(allFingerprints, Object.keys(allFingerprints).sort()))
    .digest('hex');

console.log(JSON.stringify({
    seal: SEAL,
    workspaceHash,
    summary: {
        contracts: Object.keys(SEAL.contracts).length,
        protected: Object.keys(SEAL.protected).length,
        evidence: Object.keys(SEAL.evidence).length,
        production: Object.keys(SEAL.production).length,
        tests: Object.keys(SEAL.tests).length,
    },
}, null, 2));
