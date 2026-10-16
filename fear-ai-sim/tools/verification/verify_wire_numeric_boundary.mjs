/**
 * tools/verification/verify_wire_numeric_boundary.mjs
 *
 * A standalone deterministic probe (Hard Rule 9: no test runner, no suite).
 * It proves ONE named thing: that the binary wire never carries a non-finite
 * number across an engine boundary — in either direction.
 *
 * The V2 wire uses fixed 32-byte records, and float32 represents NaN and
 * ±Infinity as ordinary bit patterns. Both encoders passed their float32 slots
 * through with `?? 0.0`, which rejects only null/undefined, so:
 *
 *   - `encodeIntentBatch` — which is Fear AI's OUTPUT to the host — wrote a
 *     non-finite `vectorHint` component straight into the frame, handing the
 *     host an advisory direction it cannot use;
 *   - `encodeObservationBatch` wrote a non-finite position, threat distance or
 *     threat intensity into the frame, and the decoder handed it back intact.
 *
 * Both are fixed by coercing a non-finite field to the sentinel that field
 * ALREADY uses for an absent value, so the wire can never carry one.
 *
 * Scope note, stated so the probe does not over-claim: `floatToUint16`
 * (health, energy, fear, anger, dominance, urgency) was already correct — it
 * maps NaN to 0 and clamps ±Infinity into [0, 1] — and is pinned here as such
 * rather than "fixed". The decoder quantizes every float32 to four decimals,
 * which is pre-existing documented behaviour and is asserted, not changed.
 */

import { BinaryWireProtocol } from '../../packages/protocol/src/BinaryWireProtocol.js';

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

/** Walk a decoded record for any non-finite number. */
function nonFinitePaths(obj, path = '$', out = []) {
    if (typeof obj === 'number') {
        if (!Number.isFinite(obj)) out.push(`${path}=${obj}`);
        return out;
    }
    if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) nonFinitePaths(obj[key], `${path}.${key}`, out);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
section('A. The pre-fix shape really did leak (control)');

check(Number.isFinite(NaN) === false && Number.isFinite(Infinity) === false,
    'NaN and Infinity are both non-finite');
check((NaN ?? 0.0) !== 0 && Number.isNaN(NaN ?? 0.0),
    '`NaN ?? 0.0` yields NaN, so nullish coalescing does not guard finiteness');
check((Infinity ?? 0.0) === Infinity,
    '`Infinity ?? 0.0` yields Infinity, likewise');
{
    // float32 carries these as ordinary bit patterns, so a raw slot accepts one.
    const b = new ArrayBuffer(4);
    const v = new DataView(b);
    v.setFloat32(0, NaN, true);
    check(Number.isNaN(v.getFloat32(0, true)), 'a float32 slot round-trips NaN unchanged');
    v.setFloat32(0, Infinity, true);
    check(v.getFloat32(0, true) === Infinity, 'and round-trips Infinity unchanged');
}

// ─────────────────────────────────────────────────────────────────────────────
section('B. encodeIntentBatch never writes a non-finite advisory (Fear AI OUTPUT)');

const intentBase = (over) => Object.assign({
    entityId: 'e', fear: 0.5, anger: 0.1, dominance: 0.5, urgency: 0.65,
    intentType: 'FLEE_FROM', suggestedPosture: 'SPRINTING', band: 'PANIC',
    inCombat: false, exhausted: false, vectorHint: { x: 1, y: 0, z: 0 }
}, over);

for (const bad of BAD) {
    for (const axis of ['x', 'y', 'z']) {
        const vec = { x: 0, y: 0, z: 0 };
        vec[axis] = bad;
        const frame = BinaryWireProtocol.encodeIntentBatch(1, [intentBase({ vectorHint: vec })]);
        const decoded = BinaryWireProtocol.decodeIntentBatch(frame).records[0];
        const leaks = nonFinitePaths(decoded);
        check(leaks.length === 0,
            `intent vectorHint.${axis}=${String(bad)}: the HOST decodes only finite values (${leaks.join('; ') || 'ok'})`);
        check(decoded.vectorHint[axis] === 0,
            `intent vectorHint.${axis}=${String(bad)} falls back to 0 (no direction), got ${decoded.vectorHint[axis]}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
section('C. encodeObservationBatch never writes a non-finite input');

const obsBase = (over) => Object.assign({
    agent_id: 'a', position: { x: 0, y: 0, z: 0 }, health: 1, energy: 1,
    threatDistance: 5, threatIntensity: 0.5
}, over);

for (const bad of BAD) {
    for (const axis of ['x', 'y', 'z']) {
        const pos = { x: 0, y: 0, z: 0 };
        pos[axis] = bad;
        const frame = BinaryWireProtocol.encodeObservationBatch(1, [obsBase({ position: pos })]);
        const decoded = BinaryWireProtocol.decodeObservationBatch(frame).records[0];
        check(nonFinitePaths(decoded).length === 0,
            `observation position.${axis}=${String(bad)}: decoded values are all finite`);
        check(decoded.position[axis] === 0,
            `observation position.${axis}=${String(bad)} falls back to the origin, got ${decoded.position[axis]}`);
    }

    const frameDist = BinaryWireProtocol.encodeObservationBatch(1, [obsBase({ threatDistance: bad })]);
    const decDist = BinaryWireProtocol.decodeObservationBatch(frameDist).records[0];
    check(nonFinitePaths(decDist).length === 0,
        `observation threatDistance=${String(bad)}: decoded values are all finite`);
    check(decDist.threatDistance === 999,
        `observation threatDistance=${String(bad)} falls back to the no-threat sentinel 999, got ${decDist.threatDistance}`);

    const frameInt = BinaryWireProtocol.encodeObservationBatch(1, [obsBase({ threatIntensity: bad })]);
    const decInt = BinaryWireProtocol.decodeObservationBatch(frameInt).records[0];
    check(nonFinitePaths(decInt).length === 0,
        `observation threatIntensity=${String(bad)}: decoded values are all finite`);
    check(decInt.threatIntensity === 0,
        `observation threatIntensity=${String(bad)} falls back to 0, got ${decInt.threatIntensity}`);
}

// A non-numeric value is the same shape of "unknown" and must not become NaN.
for (const [label, value] of [
    ['a string', 'north'],
    ['an object', {}],
    ['an array', [1]],
    ['a boolean', true]
]) {
    const frame = BinaryWireProtocol.encodeObservationBatch(1, [obsBase({ position: { x: value, y: 0, z: 0 } })]);
    const decoded = BinaryWireProtocol.decodeObservationBatch(frame).records[0];
    check(nonFinitePaths(decoded).length === 0,
        `observation position.x = ${label} decodes to a finite value`);
    check(decoded.position.x === 0, `observation position.x = ${label} falls back to the origin`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('D. float16 fields were already safe and are pinned as such');

// health/energy/fear/anger/dominance/urgency go through floatToUint16, which
// maps NaN to 0 and clamps ±Infinity into [0, 1]. Asserted, not "fixed".
for (const [label, value, expected] of [
    ['NaN', NaN, 0],
    ['Infinity', Infinity, 1],
    ['-Infinity', -Infinity, 0],
    ['a normal 0.35', 0.35, 0.35],
    ['an out-of-range 7', 7, 1]
]) {
    const frame = BinaryWireProtocol.encodeIntentBatch(1, [intentBase({ fear: value })]);
    const decoded = BinaryWireProtocol.decodeIntentBatch(frame).records[0];
    check(decoded.fear === expected,
        `floatToUint16(urgency/fear)-quantized field: ${label} -> ${expected}, got ${decoded.fear}`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('E. Finite values round-trip unchanged (regression)');

// The fix must not move a finite number. The decoder quantizes every float32
// to four decimals, which is pre-existing documented behaviour, so expectations
// are quantized the same way.
const q4 = (v) => Number(v.toFixed(4));

const obsCases = [
    { agent_id: 'a', position: { x: 1.5, y: -2.25, z: 7 }, health: 1, energy: 1, threatDistance: 5.5, threatIntensity: 0.8 },
    { agent_id: 'b', position: { x: 0, y: 0, z: 0 }, health: 0.5, energy: 0.5, threatDistance: 999, threatIntensity: 0 },
    { agent_id: 'c', position: { x: 1e6, y: -1e6, z: 1e-9 }, health: 1, energy: 1, threatDistance: 12.5, threatIntensity: 0.33 },
    { agent_id: 'd', position: { x: 3, y: 4, z: 5 }, health: 1, energy: 0.75 },
    { agent_id: 'e', x: 10, y: 20, z: 30, health: 1, energy: 1 },
    { agent_id: 'f', position: { x: -0.5, y: 0.5, z: 0 }, health: 1, energy: 1, threatDistance: 0, threatIntensity: 0 }
];
for (const rec of obsCases) {
    const got = BinaryWireProtocol.decodeObservationBatch(
        BinaryWireProtocol.encodeObservationBatch(1, [rec])).records[0];
    const want = {
        x: q4(rec.position?.x ?? rec.x ?? 0),
        y: q4(rec.position?.y ?? rec.y ?? 0),
        z: q4(rec.position?.z ?? rec.z ?? 0),
        threatDistance: q4(rec.threatDistance ?? 999),
        threatIntensity: q4(rec.threatIntensity ?? 0)
    };
    check(got.position.x === want.x && got.position.y === want.y && got.position.z === want.z
        && got.threatDistance === want.threatDistance && got.threatIntensity === want.threatIntensity,
        `observation ${rec.agent_id} round-trips unchanged (${JSON.stringify(got.position)} td=${got.threatDistance} ti=${got.threatIntensity})`);
}

const intentCases = [
    { entityId: 'e', fear: 0.5, anger: 0.1, dominance: 0.5, urgency: 0.65, intentType: 'FLEE_FROM', suggestedPosture: 'SPRINTING', band: 'PANIC', vectorHint: { x: -0.9701, y: 0, z: 0 } },
    { entityId: 'f', fear: 1, anger: 0, dominance: 1, urgency: 1, intentType: 'IDLE_VIGILANT', suggestedPosture: 'UPRIGHT', band: 'CALM', vectorHint: { x: 0, y: 0, z: 0 } },
    { entityId: 'g', fear: 0, anger: 0, dominance: 0, urgency: 0, intentType: 'SEEK_COVER', suggestedPosture: 'CROUCHING', band: 'ALERT', vectorHint: { x: 0.5774, y: 0.5774, z: 0.5774 } },
    { entityId: 'h', fear: 0.3, anger: 0.2, dominance: 0.4, urgency: 0.9, intentType: 'WARN_GROUP', suggestedPosture: 'DEFENSIVE_STANCE', band: 'ANXIOUS', vectorHint: { x: 0.7071, y: -0.7071, z: 0.5 } }
];
for (const rec of intentCases) {
    const got = BinaryWireProtocol.decodeIntentBatch(
        BinaryWireProtocol.encodeIntentBatch(1, [rec])).records[0];
    const v = rec.vectorHint;
    check(got.vectorHint.x === v.x && got.vectorHint.y === v.y && got.vectorHint.z === v.z
        && got.urgency === rec.urgency && got.fear === rec.fear && got.dominance === rec.dominance
        && got.intentType === rec.intentType && got.band === rec.band
        && got.suggestedPosture === rec.suggestedPosture,
        `intent ${rec.entityId} round-trips unchanged (${JSON.stringify(got.vectorHint)} urgency=${got.urgency} ${got.intentType}/${got.band})`);
}

// Zero is a legal value and must survive a `?? `-style guard.
{
    const got = BinaryWireProtocol.decodeObservationBatch(BinaryWireProtocol.encodeObservationBatch(1, [
        { agent_id: 'z', position: { x: 0, y: 0, z: 0 }, health: 1, energy: 1, threatDistance: 0, threatIntensity: 0 }
    ])).records[0];
    check(got.position.x === 0 && got.position.y === 0 && got.position.z === 0
        && got.threatDistance === 0 && got.threatIntensity === 0,
        'an explicit zero round-trips as zero (not as a fallback)');
}

// ─────────────────────────────────────────────────────────────────────────────
section('F. Determinism and multi-record batches');

{
    const hostile = intentBase({ vectorHint: { x: NaN, y: Infinity, z: -Infinity } });
    const run = () => JSON.stringify(BinaryWireProtocol.decodeIntentBatch(
        BinaryWireProtocol.encodeIntentBatch(1, [hostile])));
    check(run() === run(), 'identical hostile input -> identical decoded frame');

    // Every record in a batch is guarded, not just the first.
    const many = BinaryWireProtocol.encodeIntentBatch(9, [
        intentBase({ entityId: 0, vectorHint: { x: NaN, y: 0, z: 0 } }),
        intentBase({ entityId: 1, vectorHint: { x: Infinity, y: 0, z: 0 } }),
        intentBase({ entityId: 2, vectorHint: { x: 1, y: 0, z: 0 } })
    ]);
    const decodedMany = BinaryWireProtocol.decodeIntentBatch(many).records;
    check(decodedMany.length === 3, 'the batch decodes all three records');
    check(nonFinitePaths(decodedMany).length === 0,
        'every record in a mixed batch decodes finite, not only the first');

    const obsMany = BinaryWireProtocol.encodeObservationBatch(3, [
        obsBase({ agent_id: 'a0', position: { x: NaN, y: 0, z: 0 } }),
        obsBase({ agent_id: 'a1', position: { x: 0, y: Infinity, z: 0 } }),
        obsBase({ agent_id: 'a2', position: { x: 5, y: 5, z: 5 } })
    ]);
    check(nonFinitePaths(BinaryWireProtocol.decodeObservationBatch(obsMany).records).length === 0,
        'every record in a mixed observation batch decodes finite');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} assertions passed, ${failed} failed.`);
if (failures.length > 0) {
    console.log('\nFailing assertions:');
    for (const f of failures) console.log(`  - ${f}`);
}
console.log('Scope: the binary V2 wire numeric boundary only. It does not certify');
console.log('adapters, hosts, rendering, performance, or any host-authority claim.');
process.exit(failed === 0 ? 0 : 1);
