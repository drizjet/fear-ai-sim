#!/usr/bin/env node

/**
 * Release-claim document tripwire.
 *
 * This is a standalone documentation-boundary probe, not a test-runner suite
 * and not runtime certification. It protects the distinction between current
 * bounded evidence, optional scenario evidence, and superseded historical
 * records.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function includes(relativePath, needle) {
    const source = read(relativePath);
    assert(source.includes(needle), `${relativePath} is missing required boundary text: ${needle}`);
}

function excludesPattern(relativePath, pattern) {
    const source = read(relativePath);
    assert(!pattern.test(source), `${relativePath} still contains a forbidden current-status marker: ${pattern}`);
}

console.log('============================================================');
console.log('VERIFY FEAR AI RELEASE-CLAIM DOCUMENT BOUNDARIES');
console.log('============================================================');

const currentSurfaces = [
    ['README.md', 'The repository contains additional standalone world-simulation and research modules; their presence or CLI demos does not make them automatic `RuntimeSimulation` services.'],
    ['docs/README.md', 'They are the authoritative current claim surfaces.'],
    ['docs/SYSTEM_MAP.md', 'not a blanket release certification'],
    ['docs/CURRENT_TRUTH_LEDGER.md', '`SCENARIO_VERIFIED`'],
    ['docs/CURRENT_TRUTH_LEDGER.md', '`PARTIAL (RECORDED_HOST_EVIDENCE)`'],
    ['docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'it is not a universal integration claim'],
    ['docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'RELEASE CANDIDATE: PROVISIONAL / NOT CERTIFIED'],
    ['docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'overall RC1 gate remains open'],
    ['docs/SECURITY.md', 'not a universal immunity claim'],
    ['docs/BEHAVIORAL_EVALUATION_FRAMEWORK.md', 'not a release certificate or live-integration proof']
];

for (const [relativePath, needle] of currentSurfaces) {
    includes(relativePath, needle);
}
console.log(`  * Current release surfaces retain explicit scope boundaries (${currentSurfaces.length}): PASS`);

const supersededRecords = [
    'docs/CUSTOM_ENGINE_INTEGRATION_SPEC.md',
    'docs/NEW_MASTER_GAME_INTEGRATION_AUDIT_DOSSIER.md',
    'docs/FAILURE_AND_LIFECYCLE_MATRIX.md'
];
for (const relativePath of supersededRecords) {
    includes(relativePath, 'status: historical-superseded');
    includes(relativePath, 'Historical record');
    includes(relativePath, 'superseded_by:');
    excludesPattern(relativePath, /^status:\s*(?:active|verified|verified-and-certified)\s*$/im);
}
console.log(`  * Superseded records are explicitly historical and non-authoritative (${supersededRecords.length}): PASS`);

// Guard against the exact unscoped certification markers that caused the
// previous ambiguity. Historical prose may still quote an old result, but its
// frontmatter and warning must keep it outside the current release surface.
excludesPattern('docs/CURRENT_TRUTH_LEDGER.md', /^status:\s*(?:verified|verified-and-certified)\s*$/im);
excludesPattern('docs/RELEASE_CANDIDATE_CERTIFICATION.md', /^status:\s*certified\s*$/im);
console.log('  * Current authority docs cannot revert to an unconditional certification status: PASS');

console.log('\nScope: this probe audits release-claim document boundaries only.');
console.log('It does not certify runtime behavior, external hosts, adapters, or research semantics.');
console.log('\nSUCCESS: Release-claim document boundaries are explicit.');
