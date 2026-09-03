#!/usr/bin/env node
// evidence/seed-relationships.mjs
//
// EVID-2026-08-28-RELATIONSHIPS (rewritten 2026-09-03 pre-audit item 3).
//
// Same treatment as seed-territory.mjs: the original hardcoded
// exitCode: 0 with August summaries and never ran its commands. This
// rewrite runs every command live and records real receipts through
// buildReceipt (fileHashes-persisting, idempotent). Claim IDs are
// unchanged so honest rows retire the hardcoded ones.
//
// Usage:
//   node evidence/seed-relationships.mjs   (from the fear-ai-sim package dir)

import { buildReceipt, runTestReceipt } from './receipt.mjs';

const SOURCES = ['factionrelationship.js', 'closed-world.js'];
const STANCE = 'tests/live-perspective-aware-choose-stance.test.js';
const OWNERSHIP = 'tests/directed-relationship-ownership.test.js';
const TRUST = 'tests/relationship-directed-trust.test.js';
const VERTICAL = 'tests/territory-vertical-slice.test.js';
const MACHINE = 'tests/faction-stance-machine.test.js';

function run(cmd) {
    const receipt = runTestReceipt(cmd, { timeoutMs: 120000, label: `relationships: ${cmd}` });
    if (receipt.exitCode !== 0) {
        throw new Error(`seed-relationships: refusing to seed, failing command: ${cmd}`);
    }
    return receipt;
}

const rPair = run(`--runInBand ${STANCE} ${OWNERSHIP}`);
const rProducer = run(`--runInBand ${STANCE} -t "structured"`);
const rConsumer = run(`--runInBand ${STANCE} -t "directional"`);
const rCross = run(`--runInBand ${STANCE} ${OWNERSHIP} ${VERTICAL} ${MACHINE}`);

function seed(dimension, claim, tests, commandReceipt) {
    return buildReceipt({
        claimId: `C-relationships-${dimension}`,
        domain: 'relationships',
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

seed('CODE_EXISTS', 'FactionRelationshipVector has the directedTrust, directedTerritorialPressure, directedGrievance, directedFear maps, the getXFrom/setXFrom API, the recordIntrusion writer, and the pressureFrom / stanceFrom / observeFrom directional readers', [STANCE, OWNERSHIP], rPair);
seed('UNIT_VERIFIED', 'the directional relationship tests pass end-to-end (13 tests across two files)', [STANCE, OWNERSHIP], rPair);
seed('LIVE_PRODUCER', 'the closed-world reducer actually produces STANCE_TRANSITION events with structured chooseStance evidence (per-evaluator perspective)', [STANCE], rProducer);
seed('LIVE_CONSUMER', 'the closed-world reducer actually consumes the directional pressure from the relationship vector (pressureFrom(fromFactionId) feeds chooseStance per evaluator)', [STANCE], rConsumer);
seed('CROSS_DOMAIN_INTEGRATED', 'relationships has both an inbound edge (faction decision → directedTrust update) and an outbound edge (directedPressure → stance → invasion gate)', [STANCE, OWNERSHIP, VERTICAL, MACHINE], rCross);

process.stdout.write('seeded 5 evidence rows for relationships\n');
