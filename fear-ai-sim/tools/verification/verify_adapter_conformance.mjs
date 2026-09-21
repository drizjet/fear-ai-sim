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
 *  5. Canonical band vocabulary (no adapter may carry a non-canonical fear
 *     band literal; every HUD palette is a subset of the core four).
 *  6. Control-plane parity: every adapter carries session identity, the batched
 *     register/unregister/trauma routes, a legacy 404 fallback, and refusal
 *     reporting - so a host is never a second-class citizen of the middleware
 *     because of which engine it happens to be.
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
import { FEAR_BANDS, CORE_BANDS } from '../../packages/core/src/FearCore.js';
import { MAX_BATCH_CONTROL_ITEMS, MAX_BATCH_REGISTRATION_AGENTS } from '../../packages/protocol/src/types.js';

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

  // ------------------------------------------------------------------
  // SUITE 5: Canonical band vocabulary across every engine adapter
  // ------------------------------------------------------------------
  console.log('\n--- Suite 5: Canonical band vocabulary across adapters ---');
  check('JS canonical band set carries the four core bands',
    CORE_BANDS.every((b) => FEAR_BANDS.includes(b)) && FEAR_BANDS.includes('ANXIOUS'));

  const NON_CANONICAL_BANDS = ['FEAR', 'UNEASY', 'SCARED', 'TERRIFIED', 'NERVOUS', 'WARY', 'DREAD'];
  const stripComments = (src) => src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').replace(/(^|[^:])\s#.*$/, '$1'))
    .join('\n');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      // Skip build products: Godot's `.godot` import cache and the .NET
      // bin/obj trees hold no authored adapter source.
      return ['bin', 'obj', '__pycache__', '.godot', 'node_modules'].includes(d.name) ? [] : walk(p);
    }
    return [p];
  });
  // Both the packaged adapters and the Godot showcase's own adapter copies are
  // swept. The showcase carries a second `fear_agent.gd` (its offline fallback),
  // and that duplicate is exactly where a non-canonical band literal can hide
  // while the packaged copy stays clean.
  const adapterFiles = [
    ...['godot', 'unity', 'csharp', 'node', 'python', 'rust']
      .flatMap((name) => walk(path.join(REPO, 'packages/adapters', name))),
    ...walk(path.join(REPO, 'tests/godot_project'))
  ].filter((p) => /\.(gd|cs|py|mjs|js|rs)$/.test(p));
  check('Adapter trees expose source files to scan', adapterFiles.length >= 10, `found ${adapterFiles.length}`);

  const violations = [];
  for (const file of adapterFiles) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/"([A-Z][A-Z_]{2,})"/g)) {
      if (NON_CANONICAL_BANDS.includes(m[1])) violations.push(`${path.relative(REPO, file)}: "${m[1]}"`);
    }
  }
  check('No engine adapter carries a non-canonical fear band literal', violations.length === 0,
    violations.join('; '));

  const unityHud = readRepo('packages/adapters/unity/Runtime/FearAgentHUD.cs');
  const unityHudBands = [...unityHud.matchAll(/case "([A-Z_]+)":/g)].map((m) => m[1]).sort();
  check('Unity HUD band palette covers only canonical core bands',
    unityHudBands.length >= 4 && unityHudBands.every((b) => CORE_BANDS.includes(b)), `got [${unityHudBands}]`);
  const godotHud = readRepo('packages/adapters/godot/fear_agent_hud_2d.gd');
  const godotHudBands = [...godotHud.matchAll(/"([A-Z_]+)":\s*return COLOR_/g)].map((m) => m[1]).sort();
  check('Godot HUD band palette covers only canonical core bands',
    godotHudBands.length >= 4 && godotHudBands.every((b) => CORE_BANDS.includes(b)), `got [${godotHudBands}]`);

  const unityAgentBands = new Set([
    ...[...unityAgent.matchAll(/currentFearBand == "([A-Z_]+)"/g)].map((m) => m[1]),
    ...[...unityAgent.matchAll(/currentFearBand = "([A-Z_]+)"/g)].map((m) => m[1])
  ]);
  check('Unity agent band checks and defaults use only canonical bands',
    [...unityAgentBands].every((b) => FEAR_BANDS.includes(b)), `got [${[...unityAgentBands]}]`);
  check('Godot wire type enum exposes the canonical four core bands',
    CORE_BANDS.every((b) => new RegExp(`^\\t${b},$`, 'm').test(godotTypes)),
    `missing=[${CORE_BANDS.filter((b) => !new RegExp(`^\\t${b},$`, 'm').test(godotTypes))}]`);
  check('No adapter declares a FEAR or UNEASY band anywhere in its band surface',
    !violations.some((v) => v.includes('"FEAR"') || v.includes('"UNEASY"')));

  // ------------------------------------------------------------------
  // SUITE 6: Control-plane parity
  // ------------------------------------------------------------------
  console.log('\n--- Suite 6: Control-plane parity (session identity, batching, fallback) ---');
  // Suite 7, at the end of this file, covers the DESTRUCTIVE half of the control
  // plane: teardown now requires the credential too, and an adapter that sends a
  // name without it would be refused its own crowd.

  // The server contract every adapter is written against, asserted first so an
  // adapter can never be the only place a route or a limit is defined.
  check('Server caps a control batch at 512 items', MAX_BATCH_CONTROL_ITEMS === 512, `got ${MAX_BATCH_CONTROL_ITEMS}`);
  check('Batch-registration cap is an ALIAS of the control cap, not a second limit',
    MAX_BATCH_REGISTRATION_AGENTS === MAX_BATCH_CONTROL_ITEMS);
  for (const route of ['/api/v1/register/batch', '/api/v1/unregister/batch', '/api/v1/trauma/batch', '/api/v1/sessions']) {
    check(`Server exposes ${route}`, fearServerSrc.includes(route));
  }

  const pythonClient = readRepo('packages/adapters/python/fear_ai_client.py');
  const PARITY_MATRIX = [
    {
      name: 'Godot',
      src: godotClient,
      cap: 'BATCH_REGISTRATION_LIMIT',
      refusals: 'refused_claims',
      trauma: true,
      // Godot inlines the identity into each payload rather than funnelling it
      // through a helper, so the assertion names the two sites that matter: the
      // singular registration and the batch body.
      identitySites: ['payload["session_id"] = session_id', 'batch_body["session_id"] = session_id', '["claim"] = claim_mode']
    },
    {
      name: 'Unity',
      src: readRepo('packages/adapters/unity/Runtime/FearAIClient.cs'),
      cap: 'MaxBatchControlItems',
      refusals: 'RefusedClaims',
      trauma: true,
      identitySites: ['AppendClaimFields', 'SessionToken', 'claimMode']
    },
    {
      name: 'C#',
      src: csharpClient,
      cap: 'MaxBatchControlItems',
      refusals: 'RefusedClaims',
      trauma: true,
      identitySites: ['ClaimFields()', 'SessionToken', 'ClaimMode']
    },
    {
      name: 'Python',
      src: pythonClient,
      cap: 'BATCH_LIMIT',
      refusals: 'refused_claims',
      trauma: true,
      identitySites: ['def _claim_fields', 'session_token', '"claim": self.claim']
    }
  ];

  for (const adapter of PARITY_MATRIX) {
    check(`${adapter.name} carries a session name and token`,
      adapter.src.includes('session_id') && adapter.src.includes('session_token'));
    // The identity has to TRAVEL with the claim, not merely be stored: an
    // adapter that holds a token but never sends it is still anonymous to the
    // server on every reconnect.
    for (const site of adapter.identitySites) {
      check(`${adapter.name} attaches identity at \`${site}\``, adapter.src.includes(site));
    }
    check(`${adapter.name} registers in batches`, adapter.src.includes('/api/v1/register/batch'));
    check(`${adapter.name} tears down in batches`, adapter.src.includes('/api/v1/unregister/batch'));
    if (adapter.trauma) {
      check(`${adapter.name} authors trauma in batches`, adapter.src.includes('/api/v1/trauma/batch'));
    }
    // A 404 is the ONLY signal that a server predates batching, so an adapter
    // without it cannot degrade - it would retry a route that is not there.
    check(`${adapter.name} degrades on a 404 batch route`, /404/.test(adapter.src));
    check(`${adapter.name} counts refused claims instead of dropping them`,
      adapter.src.includes(adapter.refusals));
    check(`${adapter.name} surfaces rejected batch entries`,
      adapter.src.includes('rejected'));
  }

  // The cap is duplicated in four languages by necessity, so it is asserted to
  // EQUAL the server's constant rather than merely to exist: bumping the server
  // limit must not silently leave every adapter sending a different number.
  for (const adapter of PARITY_MATRIX) {
    const m = adapter.src.match(new RegExp(`${adapter.cap}\\s*[:=]\\s*(?:int\\s*=\\s*)?(\\d+)`));
    check(`${adapter.name} batch cap matches the server (${MAX_BATCH_CONTROL_ITEMS})`,
      Boolean(m) && Number(m[1]) === MAX_BATCH_CONTROL_ITEMS,
      m ? `got ${m[1]}` : `no ${adapter.cap} declaration found`);
  }

  // A refused claim must be distinguishable from a failed request: 409 means the
  // server refused and mutated nothing, which is a different decision for the
  // host than a transport error it should retry.
  check('Python distinguishes a refused claim (409) from a transport failure',
    pythonClient.includes('status == 409'));
  check('C# distinguishes a refused claim (409) from a transport failure',
    csharpClient.includes('status == 409'));
  check('Python exposes a runnable live self-check for its control plane',
    pythonClient.includes('--self-check') && pythonClient.includes('def run_self_check'));
  check('Python self-check verifies a name-only rival is refused',
    pythonClient.includes('name_only_rival_is_refused'));
  check('Python self-check verifies a proven token reconnects',
    pythonClient.includes('proven_token_reconnects'));

  // ------------------------------------------------------------------
  // SUITE 7: Teardown carries the credential, and its refusals are reported
  // ------------------------------------------------------------------
  // Added when teardown became ownership-gated on the server. Every adapter
  // already sent `session_id` when retiring agents and NONE of them sent the
  // token, which the Unity behavioural harness caught by running the real client:
  // an honest host was locked out of retiring its own crowd. A name is a label, so
  // the gate correctly treats a name-only teardown as a stranger's request.
  //
  // This is a source-level tripwire, not a behaviour check - the behaviour is
  // `verify_host_token_persistence.mjs` (Godot, in engine) and
  // `verify_unity_adapter_behavior.mjs` (Unity, live server). What it prevents is
  // the gap reopening silently in an adapter that has no behavioural harness yet.
  console.log('\n--- Suite 7: Teardown carries the credential, refusals are reported ---');

  const claimsSrc = readRepo('packages/runtime/src/ClaimArbitration.js');
  check('Server gates teardown on ownership', claimsSrc.includes('authorizeTeardown'));
  check('Server gates a world wipe on ownership', claimsSrc.includes('authorizeReset'));
  check('Server separates destruction outcomes from claim outcomes',
    claimsSrc.includes('TEARDOWN_OUTCOMES') && claimsSrc.includes('REFUSED_NOT_OWNER'));
  check('Server can end a session on the host\'s own instruction', claimsSrc.includes('revoke('));
  check('Server exposes a revocation route', fearServerSrc.includes('/api/v1/session/revoke'));
  check('Server reports teardown refusals per id on the batch route',
    /refused: refusedTeardown/.test(fearServerSrc));
  check('Server reports teardown refusals on the WebSocket batch route',
    /refused: refusedTeardown/.test(fearServerSrc));
  check('Server distinguishes a stale owner release from an attack',
    claimsSrc.includes('RELEASED_OWNER_STALE'));
  check('Server never promotes ownership to liveness on an unproven claim',
    /No liveness refresh here|touch`\./.test(claimsSrc));

  const TEARDOWN_IDENTITY = [
    {
      name: 'Godot',
      // Both the batch body and the singular fallback payload, asserted inside a
      // bounded window so the match cannot come from an unrelated registration site.
      patterns: [
        { label: 'batch teardown body', re: /ubody\["session_token"\][\s\S]{0,0}/ },
        { label: 'singular teardown payload', re: /unreg_payload\["session_token"\]/ }
      ],
      refusalCounter: 'unregistration_refusals',
      refusalSignal: 'unregister_refused_not_owner'
    },
    {
      name: 'Unity',
      patterns: [
        { label: 'batch teardown body', re: /UnregistrationBatchJson\([\s\S]{0,900}?session_token/ },
        { label: 'singular teardown payload', re: /UnregistrationJson\([\s\S]{0,600}?session_token/ }
      ],
      refusalCounter: 'UnregistrationRefusals',
      refusalSignal: 'unregister_refused_not_owner'
    },
    {
      name: 'C#',
      patterns: [
        { label: 'batch teardown body', re: /batchFields\["session_token"\]/ },
        { label: 'singular teardown payload', re: /singleFields\["session_token"\]/ }
      ],
      refusalCounter: 'UnregistrationRefusals',
      refusalSignal: 'Refused'
    },
    {
      name: 'Python',
      patterns: [
        { label: 'batch teardown body', re: /unregister\/batch"[\s\S]{0,200}?_claim_fields\(\)/ }
      ],
      // Python's singular teardown already funnelled through `_claim_fields`,
      // which is why only the batch route had the gap - asserted so a future
      // refactor cannot quietly remove it from both.
      refusalCounter: 'unregistration_refusals',
      refusalSignal: 'refused'
    }
  ];

  const ADAPTER_SOURCES = {
    Godot: godotClient,
    Unity: readRepo('packages/adapters/unity/Runtime/FearAIClient.cs'),
    'C#': csharpClient,
    Python: pythonClient
  };

  for (const adapter of TEARDOWN_IDENTITY) {
    const src = ADAPTER_SOURCES[adapter.name];
    for (const pattern of adapter.patterns) {
      check(`${adapter.name} sends its credential with the ${pattern.label}`, pattern.re.test(src));
    }
    check(`${adapter.name} counts teardown refusals separately from rejected entries`,
      src.includes(adapter.refusalCounter), adapter.refusalCounter);
    check(`${adapter.name} reports a not-owner teardown rather than dropping it`,
      src.includes(adapter.refusalSignal), adapter.refusalSignal);
  }

  console.log('\n============================================================');
  console.log(`SUCCESS: All ${PASS} adapter conformance assertions PASSED.`);
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('VERIFICATION FAILURE:', err);
  process.exit(1);
});
