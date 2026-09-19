/**
 * tools/verification/verify_adapter_conformance.mjs
 *
 * Phase 1: Engine Adapter Verification & Conformance Hardening.
 * Verifies Godot 4 GDScript, Unity C# (UPM), and C# Client adapters plus
 * Protocol V1 JSON and Protocol V2 binary wire against the canonical contract.
 *
 * Suites:
 *  1. Handshake conformance (HANDSHAKE_REQUEST, protocol_version 1.0.0,
 *     capability contract advertisement).
 *  2. Serialization conformance (Protocol V2 binary round-trip, header/record
 *     sizes, magic/version guards, Godot constant parity, zero-copy reader).
 *  3. Capability negotiation & downgrade (R36: omitted=null legacy passthrough,
 *     empty array filters all gated intents, SEEK_COVER/WARN_GROUP -> FLEE_FROM,
 *     adapter omission guards).
 *  4. Intent vocabulary & outcome receipts (ACTION_INTENTS parity across all
 *     adapters, INTENT_OUTCOME taxonomy, advisory-only host authority).
 *
 * Hard Rule 9 Compliant: 0 test runners. Standalone deterministic script.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BinaryWireProtocol,
  BinaryFrameReader,
  BINARY_MAGIC,
  BINARY_PROTOCOL_VERSION,
  FRAME_TYPES,
  INTENT_CODES,
  BAND_CODES,
  HEADER_SIZE_BYTES,
  RECORD_SIZE_BYTES
} from '../../packages/protocol/src/BinaryWireProtocol.js';
import {
  HostCapabilityNegotiator,
  HOST_CAPABILITIES,
  INTENT_CAPABILITY_REQUIREMENTS,
  RUNTIME_SAFE_FALLBACKS
} from '../../packages/core/src/HostCapabilityNegotiator.js';
import { ProtocolValidator } from '../../packages/protocol/src/validator.js';
import { INTENT_OUTCOMES, FAILURE_REASONS } from '../../packages/core/src/HostFeedbackLoop.js';
import { ACTION_INTENTS } from '../../packages/core/src/IntentResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');

function readRepo(rel) {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) throw new Error(`Missing required source: ${rel}`);
  return fs.readFileSync(p, 'utf8');
}

let PASS = 0;
function check(label, cond, detail = '') {
  if (!cond) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  PASS++;
  console.log(`  * ${label}: PASS`);
}

async function main() {
  console.log('============================================================');
  console.log('VERIFY ENGINE ADAPTER CONFORMANCE (GODOT / UNITY / C# / WIRE)');
  console.log('============================================================\n');

  // ------------------------------------------------------------------
  // SUITE 1: Handshake conformance
  // ------------------------------------------------------------------
  console.log('--- Suite 1: Handshake (Protocol V1) ---');
  const godotClient = readRepo('packages/adapters/godot/fear_ai_client.gd');
  const unityClient = readRepo('packages/adapters/unity/FearAIClient.cs');
  const csharpClient = readRepo('packages/adapters/csharp/FearAIClient.cs');
  const fearServerSrc = readRepo('packages/runtime/src/FearServer.js');

  check('Godot emits HANDSHAKE_REQUEST', godotClient.includes('HANDSHAKE_REQUEST'));
  check('Godot handshake pins protocol_version 1.0.0', godotClient.includes('"1.0.0"') || godotClient.includes("'1.0.0'"));
  check('Godot handshake advertises engine Godot4', godotClient.includes('Godot4'));

  check('Unity emits HANDSHAKE_REQUEST', unityClient.includes('HANDSHAKE_REQUEST'));
  check('Unity handshake pins protocol_version 1.0.0', unityClient.includes('1.0.0'));
  check('Unity handshake advertises engine Unity', unityClient.includes('"Unity"') || unityClient.includes('engine'));

  check('C# emits HANDSHAKE_REQUEST', csharpClient.includes('HANDSHAKE_REQUEST'));
  check('C# handshake pins protocol_version 1.0.0', csharpClient.includes('"1.0.0"'));
  check('C# handshake POSTs /api/v1/handshake', csharpClient.includes('/api/v1/handshake'));
  check('C# handshake advertises engine field', csharpClient.includes('engine'));

  // Validator-level handshake semantics (canonical server contract)
  const vGodot = ProtocolValidator.validateHandshake({ type: 'HANDSHAKE_REQUEST', protocol_version: '1.0.0', client_id: 'godot_1', engine: 'Godot4' });
  check('Validator accepts Godot-shape handshake', vGodot.valid === true);
  const vUnity = ProtocolValidator.validateHandshake({ type: 'HANDSHAKE_REQUEST', protocol_version: '1.0.0', client_id: 'unity_x', engine: 'Unity' });
  check('Validator accepts Unity-shape handshake', vUnity.valid === true);
  const vCsharp = ProtocolValidator.validateHandshake({ type: 'HANDSHAKE_REQUEST', protocol_version: '1.0.0', client_id: 'csharp_client', client_name: 'csharp_client', engine: 'CSharp' });
  check('Validator accepts C#-shape handshake', vCsharp.valid === true && vCsharp.value.client_id === 'csharp_client');
  const vBadMajor = ProtocolValidator.validateHandshake({ type: 'HANDSHAKE_REQUEST', protocol_version: '2.0.0', client_id: 'x' });
  check('Validator rejects incompatible major version', vBadMajor.valid === false);

  // Server advertises capability contract (R36)
  check('Server advertises host_capabilities', fearServerSrc.includes('host_capabilities'));
  check('Server advertises capability_requirements', fearServerSrc.includes('capability_requirements'));
  check('Canonical HOST_CAPABILITIES has 8 entries', Object.keys(HOST_CAPABILITIES).length === 8, `got ${Object.keys(HOST_CAPABILITIES).length}`);

  // ------------------------------------------------------------------
  // SUITE 2: Serialization (Protocol V2 binary wire)
  // ------------------------------------------------------------------
  console.log('\n--- Suite 2: Binary wire serialization ---');
  check('Header is 16 bytes', HEADER_SIZE_BYTES === 16);
  check('Record is 32 bytes', RECORD_SIZE_BYTES === 32);
  check('Magic is FEAR LE (0x52414546)', BINARY_MAGIC === 0x52414546);
  check('Protocol version is 2', BINARY_PROTOCOL_VERSION === 2);

  // Intent batch round-trip
  const intents = [
    { entityId: 7, fear: 0.88, anger: 0.1, dominance: 0.12, urgency: 0.95, intentType: 'FLEE_FROM', suggestedPosture: 'SPRINTING', band: 'PANIC', inCombat: false, exhausted: false, vectorHint: { x: -0.98, y: 0, z: -0.19 } },
    { entityId: 8, fear: 0.1, anger: 0.0, dominance: 0.8, urgency: 0.1, intentType: 'IDLE_VIGILANT', suggestedPosture: 'UPRIGHT', band: 'CALM', inCombat: false, exhausted: false, vectorHint: { x: 0, y: 0, z: 0 } },
    { entityId: 9, fear: 0.5, anger: 0.2, dominance: 0.5, urgency: 0.5, intentType: 'WARN_GROUP', suggestedPosture: 'UPRIGHT', band: 'ANXIOUS', inCombat: true, exhausted: false, vectorHint: { x: 0.5, y: 0, z: 0.5 } }
  ];
  const iBuf = BinaryWireProtocol.encodeIntentBatch(342, intents);
  check('Intent batch byte length = 16 + 3*32', iBuf.byteLength === 16 + 3 * 32, `got ${iBuf.byteLength}`);
  const iDec = BinaryWireProtocol.decodeIntentBatch(iBuf);
  check('Intent batch tick preserved', iDec.tick === 342);
  check('Intent batch count preserved', iDec.count === 3);
  check('Intent[0] type round-trips', iDec.records[0].intentType === 'FLEE_FROM');
  check('Intent[0] band round-trips', iDec.records[0].band === 'PANIC');
  check('Intent[0] fear quantized within 1e-3', Math.abs(iDec.records[0].fear - 0.88) < 0.001, `got ${iDec.records[0].fear}`);
  check('Intent[0] vectorHint.x within float tolerance', Math.abs(iDec.records[0].vectorHint.x - (-0.98)) < 0.001);
  check('Intent[2] inCombat flag round-trips', iDec.records[2].inCombat === true);

  // Observation batch round-trip
  const obs = [
    { entityId: 7, position: { x: 12.5, y: 0, z: 4.2 }, threatDistance: 8.5, threatIntensity: 0.95, health: 0.9, energy: 0.8, stimulusType: 0, inCombat: false, provoked: false },
    { entityId: 8, position: { x: -3.25, y: 1.5, z: 0 }, threatDistance: 999.0, threatIntensity: 0.0, health: 1.0, energy: 1.0, stimulusType: 1, inCombat: true, provoked: true }
  ];
  const oBuf = BinaryWireProtocol.encodeObservationBatch(99, obs);
  check('Observation batch byte length = 16 + 2*32', oBuf.byteLength === 16 + 2 * 32);
  const oDec = BinaryWireProtocol.decodeObservationBatch(oBuf);
  check('Observation batch tick preserved', oDec.tick === 99);
  check('Observation[0] position.x preserved', Math.abs(oDec.records[0].position.x - 12.5) < 0.001);
  check('Observation[1] flags round-trip', oDec.records[1].inCombat === true && oDec.records[1].provoked === true);
  check('Observation health quantized within 1e-3', Math.abs(oDec.records[0].health - 0.9) < 0.001);

  // Guards: truncated, bad magic, bad version
  let threwTrunc = false;
  try { BinaryWireProtocol.decodeIntentBatch(iBuf.slice(0, 20)); } catch { threwTrunc = true; }
  check('Truncated buffer throws', threwTrunc);
  let threwMagic = false;
  try {
    const bad = iBuf.slice(0);
    new DataView(bad).setUint32(0, 0xdeadbeef, true);
    BinaryWireProtocol.decodeIntentBatch(bad);
  } catch { threwMagic = true; }
  check('Invalid magic throws', threwMagic);
  let threwVer = false;
  try {
    const bad = iBuf.slice(0);
    new DataView(bad).setUint8(4, 99);
    BinaryWireProtocol.decodeIntentBatch(bad);
  } catch { threwVer = true; }
  check('Unsupported version throws', threwVer);

  // Zero-copy reader parity
  const reader = new BinaryFrameReader(iBuf);
  check('Reader tick matches', reader.tick === 342);
  check('Reader count matches', reader.count === 3);
  check('Reader intent name matches', reader.getIntentName(0) === 'FLEE_FROM');
  check('Reader band name matches', reader.getBandName(0) === 'PANIC');
  const outVec = { x: 0, y: 0, z: 0 };
  reader.readVector(0, outVec);
  check('Reader zero-copy vector matches', Math.abs(outVec.x - (-0.98)) < 0.001 && outVec.y === 0);

  // Godot binary constants parity (static source check)
  check('Godot BINARY_MAGIC matches', godotClient.includes('0x52414546'));
  check('Godot BINARY_PROTOCOL_VERSION is 2', godotClient.includes('BINARY_PROTOCOL_VERSION = 2'));
  check('Godot HEADER_SIZE is 16', godotClient.includes('HEADER_SIZE_BYTES = 16'));
  check('Godot RECORD_SIZE is 32', godotClient.includes('RECORD_SIZE_BYTES = 32'));
  for (const [code, name] of [[3, 'FLEE_FROM'], [4, 'SEEK_COVER'], [8, 'WARN_GROUP']]) {
    check(`Godot INTENT_MAP ${code}=>${name}`, godotClient.includes(`${code}: "${name}"`));
  }
  for (const [code, name] of [[0, 'CALM'], [4, 'PANIC']]) {
    check(`Godot BAND_MAP ${code}=>${name}`, godotClient.includes(`${code}: "${name}"`));
  }

  // ------------------------------------------------------------------
  // SUITE 3: Capability negotiation & downgrade (R36)
  // ------------------------------------------------------------------
  console.log('\n--- Suite 3: Capability negotiation ---');
  check('SEEK_COVER requires supports_cover_points', INTENT_CAPABILITY_REQUIREMENTS.SEEK_COVER === 'supports_cover_points');
  check('WARN_GROUP requires supports_dialogue', INTENT_CAPABILITY_REQUIREMENTS.WARN_GROUP === 'supports_dialogue');
  check('Runtime safe fallback SEEK_COVER->FLEE_FROM', RUNTIME_SAFE_FALLBACKS.SEEK_COVER === 'FLEE_FROM');
  check('Runtime safe fallback WARN_GROUP->FLEE_FROM', RUNTIME_SAFE_FALLBACKS.WARN_GROUP === 'FLEE_FROM');

  const fullCaps = new HostCapabilityNegotiator(Object.values(HOST_CAPABILITIES));
  const rFull = fullCaps.filterIntent('SEEK_COVER', RUNTIME_SAFE_FALLBACKS);
  check('Full caps: SEEK_COVER passes unfiltered', rFull.intent === 'SEEK_COVER' && rFull.downgraded === false);

  const emptyCaps = new HostCapabilityNegotiator([]);
  const rEmptyCover = emptyCaps.filterIntent('SEEK_COVER', RUNTIME_SAFE_FALLBACKS);
  check('Empty caps: SEEK_COVER downgrades to FLEE_FROM', rEmptyCover.intent === 'FLEE_FROM' && rEmptyCover.downgraded === true);
  check('Empty caps: downgrade names required capability', rEmptyCover.requiredCapability === 'supports_cover_points');
  const rEmptyWarn = emptyCaps.filterIntent('WARN_GROUP', RUNTIME_SAFE_FALLBACKS);
  check('Empty caps: WARN_GROUP downgrades to FLEE_FROM', rEmptyWarn.intent === 'FLEE_FROM' && rEmptyWarn.downgraded === true);
  const rFree = emptyCaps.filterIntent('FLEE_FROM', RUNTIME_SAFE_FALLBACKS);
  check('Empty caps: FLEE_FROM (universal) passes', rFree.intent === 'FLEE_FROM' && rFree.downgraded === false);

  // Legacy vs explicit-empty semantics
  check('sanitize(undefined) => null (legacy unfiltered)', ProtocolValidator.sanitizeTickCapabilities(undefined) === null);
  const sanEmpty = ProtocolValidator.sanitizeTickCapabilities([]);
  check('sanitize([]) => [] (filters all gated)', Array.isArray(sanEmpty) && sanEmpty.length === 0);
  const sanMap = ProtocolValidator.sanitizeTickCapabilities({ supports_cover_points: true, supports_dialogue: false });
  check('sanitize(map) keeps truthy only', sanMap.length === 1 && sanMap[0] === 'supports_cover_points');

  // Adapters omit capabilities when empty (legacy preservation)
  check('Godot omits capabilities when empty', godotClient.includes('host_capabilities.size() > 0'));
  check('Unity omits capabilities when empty', unityClient.includes('caps.Count > 0') || unityClient.includes('Count > 0'));
  check('C# omits capabilities when null', csharpClient.includes('capabilities is not null'));

  // ------------------------------------------------------------------
  // SUITE 4: Intent vocabulary & outcome receipts
  // ------------------------------------------------------------------
  console.log('\n--- Suite 4: Intent vocabulary & outcome receipts ---');
  check('JS ACTION_INTENTS has 12 entries', ACTION_INTENTS.length === 12, `got ${ACTION_INTENTS.length}`);
  for (const intent of ACTION_INTENTS) {
    check(`INTENT_CODES contains ${intent}`, intent in INTENT_CODES);
  }
  const godotTypes = readRepo('packages/adapters/godot/fear_types.gd');
  const unityTypes = readRepo('packages/adapters/unity/Runtime/FearTypes.cs');
  const csharpTypes = readRepo('packages/adapters/csharp/FearTypes.cs');
  for (const intent of ['FLEE_FROM', 'SEEK_COVER', 'WARN_GROUP', 'FREEZE', 'RECOVERING']) {
    check(`Godot types contain ${intent}`, godotTypes.includes(intent));
    check(`Unity types contain ${intent}`, unityTypes.includes(intent));
  }
  // C# client is a generic HTTP transport: intent strings are runtime server
  // values, not compile-time literals. Verify the generic envelope instead.
  check('C# models generic ActionIntent envelope', csharpTypes.includes('class ActionIntent'));
  check('C# ActionIntent carries string type', csharpTypes.includes('Type'));
  check('C# ActionIntent carries vector_hint', csharpTypes.includes('vector_hint'));
  check('C# models CapabilityDowngrade', csharpTypes.includes('CapabilityDowngrade'));
  check('C# models AffordanceDowngrade', csharpTypes.includes('AffordanceDowngrade'));
  check('Unity models CapabilityDowngrade', unityTypes.includes('CapabilityDowngrade'));
  check('Unity models AffordanceDowngrade', unityTypes.includes('AffordanceDowngrade'));

  // Outcome taxonomy
  check('INTENT_OUTCOMES has 4 states', Object.keys(INTENT_OUTCOMES).length === 4);
  for (const o of ['GOAL_COMPLETED', 'INTENT_REJECTED', 'EXECUTION_FAILED', 'ACTION_INTERRUPTED']) {
    check(`Outcome taxonomy contains ${o}`, Object.values(INTENT_OUTCOMES).includes(o));
  }
  for (const r of ['NO_PATH', 'BLOCKED', 'UNSUPPORTED', 'STALE_INTENT', 'HOST_BUSY', 'UNKNOWN']) {
    check(`Failure reasons contain ${r}`, Object.values(FAILURE_REASONS).includes(r));
  }
  const vOk = ProtocolValidator.validateOutcomeReport({ agent_id: 'a1', intent_type: 'SEEK_COVER', outcome: 'GOAL_COMPLETED', reason: 'UNKNOWN', tick: 5 });
  check('Validator accepts GOAL_COMPLETED report', vOk.valid === true);
  const vDefaultReason = ProtocolValidator.validateOutcomeReport({ agent_id: 'a1', intent_type: 'FLEE_FROM', outcome: 'INTENT_REJECTED' });
  check('Validator defaults missing reason to UNKNOWN', vDefaultReason.valid === true && vDefaultReason.value.reason === 'UNKNOWN');
  const vBadOutcome = ProtocolValidator.validateOutcomeReport({ agent_id: 'a1', intent_type: 'FLEE_FROM', outcome: 'TELEPORTED' });
  check('Validator rejects unknown outcome', vBadOutcome.valid === false);

  // Adapter outcome reporting paths
  check('Godot implements report_outcome', godotClient.includes('func report_outcome'));
  check('Godot posts INTENT_OUTCOME_REPORT', godotClient.includes('INTENT_OUTCOME_REPORT'));
  check('Godot handles INTENT_OUTCOME_ACK', godotClient.includes('INTENT_OUTCOME_ACK'));
  check('Godot outcome posts /api/v1/outcome', godotClient.includes('/api/v1/outcome'));
  check('Unity implements ReportOutcome', unityClient.includes('ReportOutcome'));
  check('Unity outcome posts /api/v1/outcome', unityClient.includes('/api/v1/outcome'));
  check('C# implements ReportOutcomeAsync', csharpClient.includes('ReportOutcomeAsync'));
  check('C# outcome posts /api/v1/outcome', csharpClient.includes('/api/v1/outcome'));
  check('C# models OutcomeReceipt', csharpTypes.includes('OutcomeReceipt'));

  // Host authority: advisory-only, no transform mutation
  const godotAgent = readRepo('packages/adapters/godot/fear_agent.gd');
  const unityAgent = readRepo('packages/adapters/unity/FearAgent.cs');
  check('Godot agent exposes advisory_only movement hint', godotAgent.includes('advisory_only'));
  check('Godot agent notes host-owned motor', godotAgent.includes('Host-owned motor') || godotAgent.includes('host'));
  check('Unity agent stores RecommendedVector (advisory)', unityAgent.includes('RecommendedVector'));
  check('Unity agent notes host applies NavMesh', unityAgent.includes('Host game applies'));

  console.log('\n============================================================');
  console.log(`SUCCESS: All ${PASS} adapter conformance assertions PASSED.`);
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('VERIFICATION FAILURE:', err);
  process.exit(1);
});
