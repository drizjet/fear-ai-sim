/**
 * tools/verification/verify_nonfinite_position_hygiene.mjs
 *
 * A standalone deterministic probe (Hard Rule 9: no test runner, no suite).
 * It proves ONE named thing: that a non-finite agent POSITION reported by a
 * host — over HTTP/JSON, over a batched registration, or over the binary wire
 * — is treated as UNKNOWN rather than written into stored agent state.
 *
 * Why this one is a control-plane defect and not only a core-embedding one:
 *
 * `validateRegisterAgent` used to pass `initial_position` through untouched
 * (`raw.initial_position || { x: 0, y: 0, z: 0 }`), and JSON carries a
 * non-finite number as an out-of-range magnitude — `JSON.parse('1e400')` is
 * `Infinity`. `RuntimeSimulation.registerAgent` then assigned it with
 * `?? agent.x`, and `AffectiveAgent.tick` only overwrites a coordinate when it
 * is FINITE, so the agent kept Infinity for the rest of its life. The damage
 * is worse than a bad tick: `getState()` serializes it, `JSON.stringify` turns
 * Infinity into `null`, and `setState`'s own `??` then discards the position
 * entirely — a silent, permanent, snapshot-visible corruption.
 *
 * The binary wire made it easier still: `decodeObservationBatch` yields raw
 * float32 bit patterns, and NaN and ±Infinity are ordinary float32 values, so
 * `agent.x = rec.position.x` assigned them with no guard at all.
 */

import { ProtocolValidator } from '../../packages/protocol/src/validator.js';
import { BinaryWireProtocol } from '../../packages/protocol/src/BinaryWireProtocol.js';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(condition, label) {
    if (condition) {
        passed += 1;
        return true;
    }
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    return false;
}

function section(title) {
    console.log(`\n--- ${title} ---`);
}

const BAD = [NaN, Infinity, -Infinity];
const finitePosition = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

// ─────────────────────────────────────────────────────────────────────────────
section('A. The pre-fix shapes really did leak (control)');

check(!Number.isFinite(JSON.parse('1e400')),
    'JSON.parse("1e400") is Infinity, so JSON can carry it without a literal');
check(JSON.stringify(Infinity) === 'null',
    'and JSON.stringify writes Infinity as null, which is how it vanishes');
check((Infinity ?? 0) === Infinity,
    '`Infinity ?? 0` passes Infinity through (nullish coalescing does not guard finiteness)');
check((null ?? 7) === 7,
    'while `null ?? 7` falls back, confirming the two shapes differ only for null/undefined');

// ─────────────────────────────────────────────────────────────────────────────
section('B. validateRegisterAgent sanitizes a non-finite initial_position');

for (const bad of BAD) {
    for (const axis of ['x', 'y', 'z']) {
        const body = { agent_id: 'p', initial_position: { x: 0, y: 0, z: 0 } };
        body.initial_position[axis] = bad;
        const val = ProtocolValidator.validateRegisterAgent(body);
        check(val.valid === true, `register with ${axis}=${String(bad)} still validates`);
        check(finitePosition(val.value.initial_position),
            `register with ${axis}=${String(bad)} yields a finite position (got ${JSON.stringify(val.value.initial_position)})`);
        check(Object.keys(val.value.initial_position).sort().join(',') === 'x,y,z',
            `register with ${axis}=${String(bad)} yields exactly x/y/z`);
    }
}

// Absent, null and non-object shapes still fall back to the origin, as before.
for (const [label, raw] of [
    ['absent', { agent_id: 'p' }],
    ['null', { agent_id: 'p', initial_position: null }],
    ['string', { agent_id: 'p', initial_position: 'north' }],
    ['array', { agent_id: 'p', initial_position: [1, 2, 3] }]
]) {
    const val = ProtocolValidator.validateRegisterAgent(raw);
    check(val.valid === true, `an ${label} initial_position still validates`);
    check(finitePosition(val.value.initial_position),
        `an ${label} initial_position falls back to a finite origin`);
}

// A registration with no agent_id is still a validation failure, independent of position.
{
    const val = ProtocolValidator.validateRegisterAgent({});
    check(val.valid === false, 'a registration with no agent_id is still rejected');
}

// A finite position must survive EXACTLY, unmodified.
for (const pos of [
    { x: 10, y: 20, z: 0 }, { x: -5.5, y: 0.25, z: 100 }, { x: 0, y: 0, z: 0 }, { x: 1e6, y: -1e6, z: 1e-9 }
]) {
    const val = ProtocolValidator.validateRegisterAgent({ agent_id: 'p', initial_position: pos });
    check(JSON.stringify(val.value.initial_position) === JSON.stringify(pos),
        `finite position ${JSON.stringify(pos)} passes through byte-identical`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('C. Batched registration sanitizes through the same path');

for (const bad of BAD) {
    const val = ProtocolValidator.validateRegisterBatch({
        agents: [{ agent_id: 'b', initial_position: { x: bad, y: 1, z: 2 } }]
    });
    check(val.valid === true, `batch register with x=${String(bad)} validates`);
    check(val.value.agents.every((a) => finitePosition(a.initial_position)),
        `batch register with x=${String(bad)} yields finite positions`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('D. RuntimeSimulation.registerAgent never writes a non-finite coordinate');

for (const bad of BAD) {
    const sim = new RuntimeSimulation({ seed: 4242 });
    const agent = sim.registerAgent('sim_p', {}, {
        initial_position: { x: bad, y: 2, z: 3 }
    });
    check(Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.z),
        `registerAgent with x=${String(bad)} leaves all coordinates finite`);
    check(agent.y === 2 && agent.z === 3,
        'and the GOOD coordinates are still applied (the guard is per-axis, not all-or-nothing)');
}

// A coordinate that is merely absent must keep the agent's existing value.
{
    const sim = new RuntimeSimulation({ seed: 4242 });
    const seeded = sim.registerAgent('seeded', {}, { initial_position: { x: 7, y: 8, z: 9 } });
    check(seeded.x === 7 && seeded.y === 8 && seeded.z === 9, 'a finite initial_position is applied');

    const sim2 = new RuntimeSimulation({ seed: 4242 });
    const partial = sim2.registerAgent('partial', {}, { initial_position: { y: 4 } });
    check(partial.x === 0 && partial.y === 4 && partial.z === 0,
        'a partial initial_position fills only the axes it names');
}

// ─────────────────────────────────────────────────────────────────────────────
section('E. AffectiveAgent constructor drops a non-finite option');

for (const key of ['x', 'y', 'z', 'energy', 'health', 'morale']) {
    for (const bad of BAD) {
        const options = {};
        options[key] = bad;
        const agent = new AffectiveAgent('ctor', {}, options);
        check(Number.isFinite(agent[key]),
            `new AffectiveAgent({ ${key}: ${String(bad)} }) stores a finite ${key} (got ${agent[key]})`);
    }
}

// The downstream fields those options feed must also stay finite.
for (const [label, options] of [
    ['energy NaN', { energy: NaN }],
    ['health Infinity', { health: Infinity }],
    ['morale NaN', { morale: NaN }],
    ['morale Infinity', { morale: Infinity }],
    ['all three non-finite', { energy: NaN, health: Infinity, morale: -Infinity }]
]) {
    const agent = new AffectiveAgent('ctor_ds', {}, options);
    const result = agent.tick(0.016, { threats: [{ id: 't', distance: 5, intensity: 0.9 }] }, {});
    const affect = result.affective_state;
    check(Object.values(affect).every((v) => Number.isFinite(v)),
        `${label}: every affective_state field is finite`);
    check(['currentDominance', 'currentFear', 'valence', 'arousal', 'morale', 'energy', 'health']
        .every((k) => Number.isFinite(agent[k])),
    `${label}: no stored agent field is non-finite`);
    check(JSON.stringify(result).indexOf('NaN') === -1 && JSON.stringify(result).indexOf('Infinity') === -1,
        `${label}: the advisory payload carries no NaN/Infinity token`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('F. The binary wire: a decoded non-finite position is never stored');

// Craft a REAL frame carrying non-finite float32 bits and decode it, which is
// exactly what the server's binary route does.
for (const bad of BAD) {
    const frame = BinaryWireProtocol.encodeObservationBatch(1, [{
        agent_id: 'bin',
        position: { x: bad, y: 2, z: 3 },
        health: 1,
        energy: 1
    }]);
    const decoded = BinaryWireProtocol.decodeObservationBatch(frame);
    const rec = decoded.records[0];
    check(rec && rec.position !== undefined, 'the crafted frame decodes to a record with a position');

    // This is the guard the server now applies before touching agent state.
    const sim = new RuntimeSimulation({ seed: 4242 });
    const agent = sim.registerAgent(rec.agent_id, {}, { initial_position: rec.position });
    check(Number.isFinite(agent.x),
        `a decoded position of x=${String(bad)} leaves agent.x finite (got ${agent.x})`);
    check(Number.isFinite(agent.y) && Number.isFinite(agent.z),
        'and does not disturb the finite axes');
    check(agent.y === 2, 'the good y coordinate survives');
}

// ─────────────────────────────────────────────────────────────────────────────
section('G. The damage does not persist and does not ride the snapshot');

{
    const sim = new RuntimeSimulation({ seed: 4242 });
    const agent = sim.registerAgent('persist', {}, { initial_position: { x: Infinity, y: 0, z: 0 } });
    for (let i = 0; i < 25; i++) agent.tick(0.016, {}, {});
    check(Number.isFinite(agent.x), 'agent.x is still finite after 25 further ticks');
    const snap = agent.getState();
    check(Number.isFinite(snap.x), 'getState().x is finite');
    check(JSON.stringify(snap).indexOf('NaN') === -1 && JSON.stringify(snap).indexOf('Infinity') === -1,
        'the serialized snapshot carries no NaN/Infinity token');

    // A round-tripped snapshot must restore a usable position, not null.
    const restored = new AffectiveAgent('persist', {}, {});
    restored.setState(JSON.parse(JSON.stringify(snap)));
    check(Number.isFinite(restored.x), 'a round-tripped snapshot restores a finite x');
}

// ─────────────────────────────────────────────────────────────────────────────
section('H. Finite positions and options are untouched');

{
    const sim = new RuntimeSimulation({ seed: 4242 });
    const a = sim.registerAgent('h1', {}, { initial_position: { x: 12.5, y: -3.25, z: 7 } });
    check(a.x === 12.5 && a.y === -3.25 && a.z === 7, 'a finite initial_position is applied exactly');

    const agent = new AffectiveAgent('h2', {}, { x: 5, y: 6, z: 7, energy: 0.8, health: 0.9, morale: 0.7 });
    check(agent.x === 5 && agent.y === 6 && agent.z === 7, 'finite constructor coordinates are applied exactly');
    check(agent.energy === 0.8 && agent.health === 0.9 && agent.morale === 0.7,
        'finite constructor physiological options are applied exactly');

    // Zero is a legal position and must survive a `?? `-style guard.
    const origin = new AffectiveAgent('h3', {}, { x: 0, y: 0, z: 0 });
    check(origin.x === 0 && origin.y === 0 && origin.z === 0, 'an explicit origin (0) survives');
}

// ─────────────────────────────────────────────────────────────────────────────
section('I. Determinism and host authority');

{
    const sim1 = new RuntimeSimulation({ seed: 4242 });
    const sim2 = new RuntimeSimulation({ seed: 4242 });
    const p1 = { agent_id: 'det', initial_position: { x: Infinity, y: NaN, z: -Infinity } };
    const p2 = { agent_id: 'det', initial_position: { x: Infinity, y: NaN, z: -Infinity } };
    const before = JSON.stringify(p1);
    sim1.registerAgent(p1.agent_id, {}, { initial_position: p1.initial_position });
    sim2.registerAgent(p2.agent_id, {}, { initial_position: p2.initial_position });
    const r1 = JSON.stringify(sim1.agents.get('det').tick(0.016, { threats: [{ id: 't', distance: 5, intensity: 0.8 }] }, {}));
    const r2 = JSON.stringify(sim2.agents.get('det').tick(0.016, { threats: [{ id: 't', distance: 5, intensity: 0.8 }] }, {}));
    check(r1 === r2, 'identical non-finite input -> identical advisory (deterministic)');
    check(JSON.stringify(p1) === before, 'the host-supplied object is not mutated');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} assertions passed, ${failed} failed.`);
if (failures.length > 0) {
    console.log('\nFailing assertions:');
    for (const f of failures) console.log(`  - ${f}`);
}
console.log('Scope: non-finite position hygiene on the registration and binary-wire paths.');
console.log('It does not certify adapters, hosts, performance, or any host-authority claim.');
process.exit(failed === 0 ? 0 : 1);
