#!/usr/bin/env node
// evidence/seed-territory.mjs
//
// EVID-2026-08-28-TERRITORY (rewritten 2026-09-03 pre-audit item 3).
//
// The original script hardcoded exitCode: 0 with August summaries and
// never ran its commands. This rewrite runs every command live via
// runTestReceipt and records real exit codes, durations, and output
// digests through buildReceipt (fileHashes-persisting, idempotent).
// Claim IDs are unchanged so honest rows retire the hardcoded ones
// through the linter's SUPERSEDED rule.
//
// Usage:
//   node evidence/seed-territory.mjs   (from the fear-ai-sim package dir)

import { buildReceipt, runTestReceipt } from './receipt.mjs';

const SOURCES = ['factionrelationship.js', 'closed-world.js'];
const VERTICAL = 'tests/territory-vertical-slice.test.js';
const STANCE = 'tests/live-perspective-aware-choose-stance.test.js';
const MACHINE = 'tests/faction-stance-machine.test.js';

function run(cmd) {
    const receipt = runTestReceipt(cmd, { timeoutMs: 120000, label: `territory: ${cmd}` });
    if (receipt.exitCode !== 0) {
        throw new Error(`seed-territory: refusing to seed, failing command: ${cmd}`);
    }
    return receipt;
}

const rVertical = run(`--runInBand ${VERTICAL}`);
const rProducer = run(`--runInBand ${VERTICAL} -t "live INTRUSION event emission"`);
const rConsumer = run(`--runInBand ${STANCE} ${VERTICAL}`);
const rConsequence = run(`--runInBand ${VERTICAL} -t "live invasion-gate"`);
const rCross = run(`--runInBand ${VERTICAL} ${STANCE} ${MACHINE}`);

function seed(dimension, claim, tests, commandReceipt) {
    return buildReceipt({
        claimId: `C-territory-${dimension}`,
        domain: 'territory',
        dimension,
        claim,
        testFiles: tests,
        sourceFiles: SOURCES,
        commandReceipt,
        assertions: [`live command green at seed time: ${commandReceipt.command}`],
        limitations: [],
        useImportClosure: true,
    });
}

seed('CODE_EXISTS', 'the FactionRelationshipVector has the directedTerritorialPressure / directedGrievance / directedFear maps and the recordIntrusion writer (territory-vertical-slice.js)', [VERTICAL], rVertical);
seed('UNIT_VERIFIED', 'the territory vertical-slice acceptance tests pass end-to-end', [VERTICAL], rVertical);
seed('LIVE_PRODUCER', 'the closed-world reducer actually produces INTRUSION events in the live tick (step 2.5 territory pass)', [VERTICAL], rProducer);
seed('LIVE_CONSUMER', 'the closed-world reducer actually consumes the directional pressure from the territory pass via pressureFrom(fromFactionId) and chooseStance per evaluator', [STANCE, VERTICAL], rConsumer);
seed('CONSEQUENCE_VERIFIED', 'consequence: at 5 prior intrusions, the live chooseStance escalates the faction to at least WATCHFUL (Part XIV acceptance chain end-to-end)', [VERTICAL], rConsequence);
seed('CROSS_DOMAIN_INTEGRATED', 'territory has both an inbound edge (faction observation → territorial pressure) and an outbound edge (territorial pressure → stance → action selection)', [VERTICAL, STANCE, MACHINE], rCross);

process.stdout.write('seeded 6 evidence rows for territory\n');
