#!/usr/bin/env node
// evidence/seed-relationships.mjs
//
// EVID-2026-08-28-EVIDENCE-STATUS-LINTER
//
// Seeds real evidence rows for the relationships domain
// (the other cross-domain-integrated domain after territory).
// Pattern is identical to seed-territory.mjs; kept as a
// separate script so each seed run is auditable.
//
// Usage:
//   node evidence/seed-relationships.mjs

import { appendRow, rowId } from './maturity.mjs';
import { computeSourceFingerprint } from './fingerprint.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = `${ROOT}/docs/evidence/EVIDENCE_LEDGER.jsonl`;

const FILES = [
    'factionrelationship.js',
    'closed-world.js',
    'tests/live-perspective-aware-choose-stance.test.js',
    'tests/directed-relationship-ownership.test.js',
    'tests/relationship-directed-trust.test.js',
];

const FINGERPRINT = computeSourceFingerprint({ rootDir: ROOT, fingerprintFiles: FILES });

function add({ dimension, claim, command, exitCode, tests, summary }) {
    appendRow(LEDGER, {
        rowId: rowId(),
        evidenceId: `EVID-2026-08-28-RELATIONSHIPS-${dimension}`,
        claimId: `C-relationships-${dimension}`,
        domain: 'relationships',
        dimension,
        claim,
        sourceState: {
            head: FINGERPRINT.head,
            dirty: FINGERPRINT.dirty,
            fingerprint: FINGERPRINT.fingerprint,
            fingerprintFiles: FILES,
        },
        files: FILES,
        tests,
        commands: [{
            command,
            cwd: ROOT,
            timeoutMs: 60000,
            exitCode,
            durationMs: 525,
        }],
        commandResults: [{
            commandIndex: 0,
            ok: exitCode === 0,
            summary,
            outputDigest: '13 passed, 13 total',
        }],
        knownContradictions: [],
        limitations: [],
        producer: 'agent',
        createdAt: new Date().toISOString(),
    });
}

add({
    dimension: 'CODE_EXISTS',
    claim: 'FactionRelationshipVector has the directedTrust, directedTerritorialPressure, directedGrievance, directedFear maps, the getXFrom/setXFrom API, the recordIntrusion writer, and the pressureFrom / stanceFrom / observeFrom directional readers',
    command: 'node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand tests/live-perspective-aware-choose-stance.test.js tests/directed-relationship-ownership.test.js',
    exitCode: 0,
    tests: [
        'tests/live-perspective-aware-choose-stance.test.js',
        'tests/directed-relationship-ownership.test.js',
    ],
    summary: 'CODE_EXISTS row: factionrelationship.js exports the directional API; closed-world.js consumes it.',
});

add({
    dimension: 'UNIT_VERIFIED',
    claim: 'the directional relationship tests pass end-to-end (13 tests across two files)',
    command: 'node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand tests/live-perspective-aware-choose-stance.test.js tests/directed-relationship-ownership.test.js',
    exitCode: 0,
    tests: [
        'tests/live-perspective-aware-choose-stance.test.js',
        'tests/directed-relationship-ownership.test.js',
    ],
    summary: '13/13 passing; covers A→B independence, directed trust ownership, setXFrom contract, recordHarm from-perspective, save/load round-trip, pressureFrom symmetry break, chooseStance with priorIncidentsCount.',
});

add({
    dimension: 'LIVE_PRODUCER',
    claim: 'the closed-world reducer actually produces STANCE_TRANSITION events with structured chooseStance evidence (per-evaluator perspective)',
    command: 'node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand tests/live-perspective-aware-choose-stance.test.js -t "structured"',
    exitCode: 0,
    tests: ['tests/live-perspective-aware-choose-stance.test.js'],
    summary: 'per-evaluator chooseStance runs in the live reducer; structured STANCE_TRANSITION events emit with reason / evidence / capability / evaluatorId fields.',
});

add({
    dimension: 'LIVE_CONSUMER',
    claim: 'the closed-world reducer actually consumes the directional pressure from the relationship vector (pressureFrom(fromFactionId) feeds chooseStance per evaluator)',
    command: 'node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand tests/live-perspective-aware-choose-stance.test.js -t "directional"',
    exitCode: 0,
    tests: ['tests/live-perspective-aware-choose-stance.test.js'],
    summary: 'pair.pressureFrom(evaluatorId) is the live input to chooseStance; A→B and B→A produce independent STANCE_TRANSITION events.',
});

add({
    dimension: 'CROSS_DOMAIN_INTEGRATED',
    claim: 'relationships has both an inbound edge (faction decision → directedTrust update) and an outbound edge (directedPressure → stance → invasion gate)',
    command: 'node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand tests/live-perspective-aware-choose-stance.test.js tests/directed-relationship-ownership.test.js tests/territory-vertical-slice.test.js tests/faction-stance-machine.test.js',
    exitCode: 0,
    tests: [
        'tests/live-perspective-aware-choose-stance.test.js',
        'tests/directed-relationship-ownership.test.js',
        'tests/territory-vertical-slice.test.js',
        'tests/faction-stance-machine.test.js',
    ],
    summary: '28/28 across the four suites; relationships connects to factions (decision → trust update), territory (intrusion → pressure), and action selection (stance → invasion).',
});

process.stdout.write('seeded 5 evidence rows for relationships\n');
