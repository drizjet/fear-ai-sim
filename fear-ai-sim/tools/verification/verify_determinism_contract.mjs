#!/usr/bin/env node

/**
 * verify_determinism_contract.mjs — the determinism contract of the JS sim tree.
 *
 * The CCIII red-team fix replaced `Math.random` defaults with seeded
 * `DeterministicRng` instances and derived every agent's fallback seed from the
 * simulation seed plus registration order. Those fixes are load-bearing: a
 * replay, a snapshot comparison, or a long-horizon benchmark is only meaningful
 * if the same seed produces the same world. This probe pins the contract so a
 * future edit cannot quietly reintroduce a clock read or an unseeded draw into
 * a simulation definition file, or break the seed chain, without a red probe.
 *
 * Invariants proven:
 * - The simulation-definition files (AffectiveAgent, FearCore, DeterministicRng,
 *   RuntimeSimulation) contain no LIVE clock read and no LIVE Math.random; the
 *   known mentions are comments documenting the CCIII fix, and the scanner that
 *   says so is itself controlled against synthetic live and comment lines;
 * - DeterministicRng: same seed, same sequence; numeric seeds normalise
 *   (0/NaN/empty -> 1337) the same way; string seeds hash stably; `next()`
 *   aliases `random()`; `range`/`intRange`/`choice` are deterministic;
 * - The seed chain: an agent's fallback seed is `${id}#${simSeed}#${n}`, the
 *   registration counter is scoped to its simulation instance (an interleaved
 *   sibling consumes nothing), an owner-supplied seed wins, and two simulations
 *   built from the same seed with the same inputs persist byte-identical
 *   snapshots after ten ticks;
 * - Seed sensitivity: a different seed produces a different world (the
 *   byte-equality above is not vacuous);
 * - RequestSigning honours injected `now` and `randomBytes` (challenges and
 *   timestamps are fully reproducible under injection), the challenge TTL sweep
 *   reads the injected clock, and the uninjected default still produces a fresh
 *   challenge per call.
 */

import { readFileSync } from 'node:fs';
import { DeterministicRng } from '../../packages/core/src/DeterministicRng.js';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { RequestSigning } from '../../packages/runtime/src/RequestSigning.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

console.log('============================================================');
console.log('VERIFY DETERMINISM CONTRACT (seeded RNG + clock isolation)');
console.log('============================================================');

// ---------------------------------------------------------------------------
// Section A: no live clock and no live Math.random in simulation definitions.
// ---------------------------------------------------------------------------
const SIM_DEFINITION_FILES = [
    'packages/core/src/AffectiveAgent.js',
    'packages/core/src/FearCore.js',
    'packages/core/src/DeterministicRng.js',
    'packages/runtime/src/RuntimeSimulation.js'
];
const LIVE_CLOCK_RNG_PATTERNS = ['Math.random(', 'Date.now(', 'performance.now(', 'new Date('];

function classifyLine(line) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return 'comment';
    return 'live';
}

function findLiveUsages(source) {
    const offenders = [];
    source.split(/\r?\n/).forEach((line, index) => {
        for (const pattern of LIVE_CLOCK_RNG_PATTERNS) {
            if (line.includes(pattern) && classifyLine(line) === 'live') {
                offenders.push({ line: index + 1, pattern });
            }
        }
    });
    return offenders;
}

const scannerControl = [
    ['const x = Math.random();', 'live'],
    ['const t = Date.now();', 'live'],
    ['// Deterministic fallback RNG: Math.random as a default', 'comment'],
    [' * Math.random default made replays diverge', 'comment'],
    ['/* Date.now() */', 'comment']
];
assert(scannerControl.every(([text, expected]) => classifyLine(text) === expected),
    'Section A scanner control failed: the classifier cannot tell live code from comments, so its verdict on the real files is meaningless');

for (const file of SIM_DEFINITION_FILES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const offenders = findLiveUsages(source);
    assert(offenders.length === 0,
        `${file} reads a live clock or draws unseeded randomness: ${offenders.map((o) => `${o.pattern} at line ${o.line}`).join(', ')}`);
}
console.log('  * Section A (no live clock or Math.random in simulation definitions): PASS');

// ---------------------------------------------------------------------------
// Section B: DeterministicRng — same seed, same sequence; seeds normalise.
// ---------------------------------------------------------------------------
const draws = (rng, count) => Array.from({ length: count }, () => rng.random());

const rngA = new DeterministicRng(12345);
const rngB = new DeterministicRng(12345);
const rngC = new DeterministicRng(54321);
const seqA = draws(rngA, 100);
const seqB = draws(rngB, 100);
const seqC = draws(rngC, 100);
assert(seqA.length === 100 && seqB.length === 100, 'Section B did not collect 100 draws');
assert(seqA.every((value, index) => value === seqB[index]),
    'Two instances with the same seed produced different sequences');
assert(seqA.some((value, index) => value !== seqC[index]),
    'Two instances with different seeds produced identical sequences');
assert(seqA.every((value) => value >= 0 && value < 1), 'random() left [0, 1)');

assert(new DeterministicRng(0).state === new DeterministicRng(1337).state,
    'Numeric seed 0 did not normalise to the documented 1337 fallback');
assert(new DeterministicRng(NaN).state === new DeterministicRng(1337).state,
    'Non-finite numeric seed did not normalise to the documented 1337 fallback');
assert(new DeterministicRng('').state === new DeterministicRng(1337).state,
    'Empty string seed did not normalise to the documented 1337 fallback');
assert(new DeterministicRng('alpha').state === new DeterministicRng('alpha').state,
    'The same string seed hashed to different states');
assert(new DeterministicRng('alpha').state !== new DeterministicRng('beta').state,
    'Different string seeds hashed to the same state');

const nextA = new DeterministicRng(777);
const nextB = new DeterministicRng(777);
assert(nextA.next() === nextB.random() && nextA.random() === nextB.next() && nextA.next() === nextB.next(),
    'next() does not alias random() one-for-one');

const helperA = new DeterministicRng(4242);
const helperB = new DeterministicRng(4242);
for (let i = 0; i < 20; i += 1) {
    assert(helperA.range(5, 6) === helperB.range(5, 6), 'range() diverged between same-seed instances');
}
assert(helperA.range(5, 6) >= 5 && helperA.range(5, 6) < 6, 'range() left its window');
assert(helperA.intRange(3, 3) === 3 && helperB.intRange(3, 3) === 3, 'intRange() missed a single-value window');
assert(helperA.choice(['x', 'y', 'z']) === helperB.choice(['x', 'y', 'z']),
    'choice() picked differently on same-seed instances');
assert(['x', 'y', 'z'].includes(helperA.choice(['x', 'y', 'z'])), 'choice() returned an element that was not in the array');
assert(helperA.choice([]) === undefined, 'choice() on an empty array should be undefined, not a draw');
console.log('  * Section B (DeterministicRng: seeds normalise, sequences repeat): PASS');

// ---------------------------------------------------------------------------
// Section C: the seed chain — reproducible worlds, scoped counters.
// ---------------------------------------------------------------------------
const simA = new RuntimeSimulation({ seed: 777001 });
const simB = new RuntimeSimulation({ seed: 990002 });
const simC = new RuntimeSimulation({ seed: 777001 });
simA.registerAgent('scout', { neuroticism: 0.4 }, { initial_position: { x: 0, y: 0, z: 0 } });
simB.registerAgent('x1', {}, { initial_position: { x: 1, y: 0, z: 0 } });
simA.registerAgent('medic', { neuroticism: 0.6 }, { initial_position: { x: 4, y: 0, z: 0 } });
simB.registerAgent('x2', {}, { initial_position: { x: 2, y: 0, z: 0 } });
simC.registerAgent('scout', { neuroticism: 0.4 }, { initial_position: { x: 0, y: 0, z: 0 } });
simB.registerAgent('x3', {}, { initial_position: { x: 3, y: 0, z: 0 } });
simC.registerAgent('medic', { neuroticism: 0.6 }, { initial_position: { x: 4, y: 0, z: 0 } });

assert(simA.agents.get('scout').fallbackSeed === 'scout#777001#0',
    `Agent fallback seed is not the documented id#simSeed#n shape: ${simA.agents.get('scout').fallbackSeed}`);
assert(simA.agents.get('medic').fallbackSeed === 'medic#777001#1',
    `Registration counter did not advance in order: ${simA.agents.get('medic').fallbackSeed}`);
assert(simC.agents.get('scout').fallbackSeed === simA.agents.get('scout').fallbackSeed
    && simC.agents.get('medic').fallbackSeed === simA.agents.get('medic').fallbackSeed,
    'A sibling simulation interleaved between registrations consumed another instance\'s counter');
assert(simB.agents.get('x3').fallbackSeed === 'x3#990002#2',
    `Sibling counter is not instance-scoped: ${simB.agents.get('x3').fallbackSeed}`);

const simE = new RuntimeSimulation({ seed: 777001 });
simE.registerAgent('custom', {}, { seed: 'owner-pick', initial_position: { x: 0, y: 0, z: 0 } });
assert(simE.agents.get('custom').fallbackSeed === 'owner-pick',
    'An owner-supplied seed did not win over the derived default');

const THREAT = { id: 'apex', x: 0, y: 0, z: 0, distance: 1.8, intensity: 1.0, type: 'PREDATOR' };
function buildRun(seed) {
    const sim = new RuntimeSimulation({ seed });
    sim.registerAgent('scout', { neuroticism: 0.4 }, { initial_position: { x: 0, y: 0, z: 0 } });
    sim.registerAgent('medic', { neuroticism: 0.6 }, { initial_position: { x: 4, y: 0, z: 0 } });
    for (let tick = 0; tick < 10; tick += 1) {
        sim.queueObservation('scout', { x: 0, y: 0, z: 0, threats: [THREAT] });
        sim.queueObservation('medic', { x: 4, y: 0, z: 0, threats: [THREAT] });
        sim.tick(0.1);
    }
    return sim;
}
const worldA = buildRun(777001);
const worldC = buildRun(777001);
const worldD = buildRun(777002);
const snapshotA = JSON.stringify(worldA.saveSnapshot());
const snapshotC = JSON.stringify(worldC.saveSnapshot());
const snapshotD = JSON.stringify(worldD.saveSnapshot());
assert(snapshotA === snapshotC,
    'Two same-seed worlds with identical inputs persisted different snapshots after 10 ticks');
assert(snapshotA !== snapshotD,
    'A different seed produced a byte-identical world, so the equality above proves nothing');
console.log('  * Section C (seed chain: reproducible worlds, scoped counters): PASS');

// ---------------------------------------------------------------------------
// Section D: RequestSigning honours injected clock and randomness.
// ---------------------------------------------------------------------------
let fakeNow = 1_000_000;
const FIXED_TTL = 1000;
const makeInjector = () => {
    let call = 0;
    return (size) => {
        call += 1;
        return Buffer.alloc(size, call & 0xff);
    };
};
const firstSigning = new RequestSigning({
    challengeTtlMs: FIXED_TTL,
    now: () => fakeNow,
    randomBytes: makeInjector()
});
const firstChallenge = firstSigning.issueChallenge('sess_a');
assert(firstChallenge.challenge === '01'.repeat(24),
    `Injected randomness was not honoured: ${firstChallenge.challenge}`);
assert(firstChallenge.issued_at === fakeNow,
    `Injected clock was not honoured: ${firstChallenge.issued_at} !== ${fakeNow}`);
assert(firstSigning._challenges.get(firstChallenge.challenge).sessionId === 'sess_a',
    'The challenge record did not carry the session it was issued for');
const twinSigning = new RequestSigning({
    challengeTtlMs: FIXED_TTL,
    now: () => fakeNow,
    randomBytes: makeInjector()
});
assert(twinSigning.issueChallenge('sess_a').challenge === firstChallenge.challenge,
    'Two instances with identical injection produced different challenges');

fakeNow += FIXED_TTL + 1;
const secondChallenge = firstSigning.issueChallenge('sess_a');
assert(secondChallenge.challenge === '02'.repeat(24),
    `The injector's second call was not honoured: ${secondChallenge.challenge}`);
assert(!firstSigning._challenges.has(firstChallenge.challenge),
    'The challenge TTL sweep did not read the injected clock (expired challenge survived)');
assert(firstSigning._challenges.size === 1 && firstSigning._challenges.has(secondChallenge.challenge),
    'The challenge sweep did not leave exactly the fresh challenge');

const liveSigning = new RequestSigning({});
const liveOne = liveSigning.issueChallenge();
const liveTwo = liveSigning.issueChallenge();
assert(liveOne.challenge !== liveTwo.challenge,
    'Without injection the default randomness produced a repeated challenge');
console.log('  * Section D (RequestSigning: injected clock and randomness are honoured): PASS');

console.log('============================================================');
console.log(`SUCCESS: All ${assertions} determinism contract assertions passed.`);
console.log('============================================================');
