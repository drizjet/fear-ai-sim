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
import { spawnSync } from 'node:child_process';

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
    ['docs/CURRENT_TRUTH_LEDGER.md', '`VERIFIED_CURRENT` (`HOST_DIAGNOSTIC_CLEAN_COMMIT`)'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'no universal host-game, multi-engine, Unity/Unreal, or per-connection-ownership claim'],
    ['docs/CURRENT_TRUTH_LEDGER.md', '`VERIFIED_CURRENT` (`HEADLESS_IN_ENGINE` + `LIVE_SERVER_PIPELINE` + `STATION_ADVISORY_CONTRACT` + `FALLBACK_NUMERIC_PARITY`)'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'so no rendering, visual-fidelity, frame-presentation, Editor, or host-game claim is made'],
    // The encrypted store: the durability claim and its limit must survive
    // TOGETHER, because either alone is a false statement. "Unreadable at rest"
    // without "not against a leaked machine" overstates; the limit without the
    // claim would leave the plaintext-store limitation standing as if nothing
    // had changed.
    ['docs/CURRENT_TRUTH_LEDGER.md', '### 28. The Persisted Credential and Signing Key, Unreadable at Rest'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'no file mode on Windows because there is no mode to set there'],
    ['docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'this defeats a leaked **file**, not a leaked **machine**'],
    ['docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'The credential and the private key are absent from the file **bytes**'],
    ['docs/RELEASE_SURFACE.md', 'So a copied save folder, a support bundle or a backup'],
    ['docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'it is not a universal integration claim'],
    ['docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'RELEASE CANDIDATE: PROVISIONAL / NOT CERTIFIED'],
    ['docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'overall RC1 gate remains open'],
    ['docs/SECURITY.md', 'not a universal immunity claim'],
    ['docs/BEHAVIORAL_EVALUATION_FRAMEWORK.md', 'not a release certificate or live-integration proof'],
    // Session identity: the token's scope must stay named, and its durability
    // must not be confused with liveness or with authentication.
    ['docs/CURRENT_TRUTH_LEDGER.md', 'the token defeats *name guessing*, not traffic interception'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'an ownership snapshot is not liveness'],
    ['docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'authentication against a network adversary'],
    ['docs/RELEASE_SURFACE.md', 'restored sessions deliberately unbound'],
    // Unity's narrowed-so-not-closed gap, and the probe's SKIPPED contract. Both
    // qualifiers must survive TOGETHER: a behaviour claim without the Editor gap
    // would overstate, and an Editor gap without the behaviour claim would
    // understate what is now actually executed.
    ['docs/CURRENT_TRUTH_LEDGER.md', '`BEHAVIOR_VERIFIED_OUTSIDE_EDITOR`, `IMPLEMENTED_NOT_EDITOR_VERIFIED`'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'MonoBehaviour lifecycle is invoked by the harness rather than by the engine'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'reports `SKIPPED`, not `PASS`, when `dotnet` is absent'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'the shim is an implementation rather than Unity\'s own API'],
    ['docs/RELEASE_SURFACE.md', 'It does not close the Unity Editor gap'],
    // Credential lifetime, gated destruction, and what ownership is NOT. These
    // sentences are the whole boundary on the newest surface, so they are pinned
    // individually rather than as one blob.
    ['docs/CURRENT_TRUTH_LEDGER.md', 'Ownership is **continuity, not access control**'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'A stolen token can revoke'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'Expiry bounds the useful life of a leaked credential; it is not revocation'],
    ['docs/CURRENT_TRUTH_LEDGER.md', '`RELEASED_OWNER_STALE` does let anyone clean up a dead owner\'s agents, deliberately'],
    // The store was plaintext when these were written. It is not any more, and
    // the boundary moved rather than disappeared: what replaces "the store is a
    // plaintext bearer credential" is the narrower and more specific limit below.
    // Pinning the OLD sentence would now assert the opposite of the truth, so the
    // tripwire is updated with the claim it guards - which is the whole point of
    // writing the boundary into the same file as the evidence.
    ['docs/CURRENT_TRUTH_LEDGER.md', 'this protects a leaked **file**, not a leaked **machine**'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'Python and the standalone C# client have no store at all'],
    ['docs/CURRENT_TRUTH_LEDGER.md', 'the probe requires **bit-identical** output for pinned inputs'],
    ['docs/RELEASE_SURFACE.md', 'so the tooling has no arbitration path'],
    ['docs/RELEASE_SURFACE.md', 'It does not secure the transport'],
    ['docs/RELEASE_SURFACE.md', 'is survive a leaked machine: anyone who can'],
    ['docs/RELEASE_SURFACE.md', '**Protects a leaked file, not a leaked machine**'],
    ['docs/RELEASE_SURFACE.md', 'It does not generalize to every engine'],
    ['docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'ownership is **continuity, not access control**'],
    ['docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'A shared machine remains a shared credential; what changed is that a shared **folder** no longer is.'],
    ['docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'is live-verified against a real `FearServer`'],
    ['docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'disconnect-driven agent retirement is still intentionally not claimed'],
    // The dashboard's display layer must stay non-authoritative.
    ['docs/RELEASE_SURFACE.md', 'so the tooling has no arbitration path']
];

for (const [relativePath, needle] of currentSurfaces) {
    includes(relativePath, needle);
}
console.log(`  * Current release surfaces retain explicit scope boundaries (${currentSurfaces.length}): PASS`);

const supersededRecords = [
    'docs/CUSTOM_ENGINE_INTEGRATION_SPEC.md',
    'docs/NEW_MASTER_GAME_INTEGRATION_AUDIT_DOSSIER.md',
    'docs/NEW_MASTER_GAME_LOGIC_ANALYSIS_DOSSIER.md',
    'docs/NEW_MASTER_GAME_ROUND2_DEEP_CLAIMS_AUDIT.md',
    'docs/FAILURE_AND_LIFECYCLE_MATRIX.md',
    'docs/audit/v8-current/AUDIT_LONG_HORIZON.md',
    'docs/audit/v8-current/AUDIT_LIMITATIONS.md',
    'docs/audit/v8-current/AUDIT_CAUSAL_CONTRACTS.md',
    'evidence/manual-source-code-audit-dossier.md',
    'docs/DOMAIN_MATURITY.md'
];
for (const relativePath of supersededRecords) {
    includes(relativePath, 'status: historical-superseded');
    includes(relativePath, 'Historical record');
    includes(relativePath, 'superseded_by:');
    excludesPattern(relativePath, /^status:\s*(?:active|verified|verified-and-certified)\s*$/im);
}
console.log(`  * Superseded records are explicitly historical and non-authoritative (${supersededRecords.length}): PASS`);

const historicalProgressRecords = ['evidence/middleware-progress-evidence.json'];
for (const relativePath of historicalProgressRecords) {
    includes(relativePath, '"status": "historical-progress-record"');
    includes(relativePath, '"scope_note":');
    excludesPattern(relativePath, /^ {2}"status":\s*"VERIFIED"\s*,?$/m);
}
console.log(`  * Historical progress ledgers carry an explicit non-certification scope (${historicalProgressRecords.length}): PASS`);

const recordedHostEvidence = [
    'evidence/audit_fear_ai_connection_extended_2026-09-19.md',
    'evidence/audit_fear_ai_connection_500tick_2026-09-19.md'
];
for (const relativePath of recordedHostEvidence) {
    includes(relativePath, 'Recorded host evidence — not current release certification.');
    excludesPattern(relativePath, /Connection is CERTIFIED FOR PRODUCTION\./i);
}
console.log(`  * Recorded host transcripts cannot present themselves as current production certification (${recordedHostEvidence.length}): PASS`);

// Guard against the exact unscoped certification markers that caused the
// previous ambiguity. Historical prose may still quote an old result, but its
// frontmatter and warning must keep it outside the current release surface.
excludesPattern('docs/CURRENT_TRUTH_LEDGER.md', /^status:\s*(?:verified|verified-and-certified)\s*$/im);
excludesPattern('docs/RELEASE_CANDIDATE_CERTIFICATION.md', /^status:\s*certified\s*$/im);
console.log('  * Current authority docs cannot revert to an unconditional certification status: PASS');

// The superseded formulation of session identity is now FALSE, not merely
// weaker: sessions do outlive the process (via the snapshot) and a `session_id`
// is no longer the only thing a claimant can present. Reverting to that prose
// would understate the system in a way a reader cannot detect, so it is a
// tripwire rather than a note.
for (const relativePath of [
    'docs/CURRENT_TRUTH_LEDGER.md',
    'docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md',
    'docs/RELEASE_CANDIDATE_CERTIFICATION.md',
    'docs/RELEASE_SURFACE.md'
]) {
    excludesPattern(relativePath, /sessions? (?:live|are) (?:in )?server-memory only/i);
    excludesPattern(relativePath, /a `session_id` is (?:caller-declared|a caller-declared string) rather than a cryptographic identity/i);
}
console.log('  * The superseded "sessions are memory-only / name-only identity" prose is gone from every authority doc: PASS');

// The RC1 release surface must stay explicitly bounded: the in-scope middleware
// contract versus the standalone/research modules that are out of scope. If this
// drifts, the scope-out decision is no longer recorded.
const releaseSurface = 'docs/RELEASE_SURFACE.md';
includes(releaseSurface, '## 1. In scope');
includes(releaseSurface, '## 2. Out of scope');
includes(releaseSurface, 'verify_runtime_wiring.mjs');
for (const outOfScopeModule of [
    'PackCoordinationEngine',
    'EconomicFeedbackSystem',
    'SettlementMigrationSystem',
    'EpistemicBeliefEngine',
    'InformationPropagationEngine',
    'WorldCounterfactualEngine',
    'FunctionalPersonaSignatures',
    'MoralDissonanceEngine',
    'adapters/unreal'
]) {
    includes(releaseSurface, outOfScopeModule);
}
includes('docs/CURRENT_TRUTH_LEDGER.md', 'docs/RELEASE_SURFACE.md');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'out of RC surface');
console.log('  * RC1 release surface is defined and the optional modules are scoped out of it: PASS');

// The Godot showcase row carries three distinct evidence kinds — live execution
// (`HEADLESS_IN_ENGINE`), source-level contract (`STATION_ADVISORY_CONTRACT`),
// and numeric parity (`FALLBACK_NUMERIC_PARITY`). Each must stay named, its
// backing artifact must stay reachable from the documents, and the headless
// boundary must stay stated, so an in-engine promotion cannot silently become a
// rendering or visual-fidelity claim.
const godotStations = 'tools/verification/verify_godot_stations.mjs';
const godotParity = 'tools/verification/verify_godot_fallback_parity.mjs';
const godotCodegen = 'tools/codegen/generate_godot_fallback.mjs';
const godotEvidenceRunner = 'tools/run-godot-inengine-evidence.mjs';
const godotEvidenceRecord = 'evidence/godot_inengine_evidence_2026-09-20.md';
const godotLiveSuite = 'tests/godot_project/run_showcase_live_conformance.gd';
const godotLiveProbe = 'tools/verification/verify_godot_live_pipeline.mjs';
const godotLiveRecord = 'evidence/godot_live_pipeline_2026-09-20.md';

includes('docs/CURRENT_TRUTH_LEDGER.md', godotStations);
includes('docs/CURRENT_TRUTH_LEDGER.md', godotParity);
includes('docs/CURRENT_TRUTH_LEDGER.md', godotCodegen);
includes('docs/CURRENT_TRUTH_LEDGER.md', godotEvidenceRunner);
includes('docs/CURRENT_TRUTH_LEDGER.md', godotEvidenceRecord);
includes('docs/CURRENT_TRUTH_LEDGER.md', 'Godot Showcase Station-Level Advisory Contract');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'Godot Derived Fallback & Live In-Engine Evidence');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'HEADLESS_IN_ENGINE');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'FALLBACK_NUMERIC_PARITY');

includes('docs/RELEASE_SURFACE.md', 'HEADLESS_IN_ENGINE');
includes('docs/RELEASE_SURFACE.md', 'STATION_ADVISORY_CONTRACT');
includes('docs/RELEASE_SURFACE.md', 'FALLBACK_NUMERIC_PARITY');
includes('docs/RELEASE_SURFACE.md', 'Live in-engine rendering, visual fidelity, and frame presentation are **not** asserted');

includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'HEADLESS_IN_ENGINE');
includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', godotEvidenceRecord);
includes('docs/SYSTEM_MAP.md', 'HEADLESS_IN_ENGINE');
includes('docs/SYSTEM_MAP.md', 'godot:evidence');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', godotEvidenceRunner);
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'Godot fallback numeric parity');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'Godot live in-engine conformance');

// The evidence record itself must exist and must state its own limit, so the
// document cannot be cited as a rendering result.
includes(godotEvidenceRecord, 'headless');

// The evidence runner must report SKIPPED (never PASSED) without a Godot
// binary, and must verify its port is free before spawning a server. If either
// guarantee is edited away, the in-engine claim has no honest fallback state.
includes(godotEvidenceRunner, 'SKIPPED');
includes(godotEvidenceRunner, 'was re-acquired between checks');

// The canonical conformance runner must keep honouring the port override; a
// reverted hardcoded 8765 reintroduces the unexplained-handshake-failure mode.
includes('tests/godot_project/run_canonical_conformance.gd', 'FEAR_AI_PORT');
includes('tests/godot_project/run_canonical_conformance.gd', 'A non-FearServer process may be holding');

// Stale vacuous qualifiers must not creep back in, and no current surface may
// claim Godot rendering or visual verification.
excludesPattern('docs/CURRENT_TRUTH_LEDGER.md', /station-level behavior is not independently asserted/i);
excludesPattern('docs/CURRENT_TRUTH_LEDGER.md', /not a live Godot run/i);
excludesPattern('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', /not a live Godot run/i);
excludesPattern('docs/RELEASE_SURFACE.md', /Godot[^|]*visually verified/i);
excludesPattern('docs/CURRENT_TRUTH_LEDGER.md', /Godot[^|]*rendering (?:is|are) (?:asserted|verified)/i);
// The live-pipeline claim needs the same treatment: the suite, its wiring
// probe, and its evidence record must all stay reachable from the documents,
// and the fallback must never be described as numerically identical to the
// server, because the live run measured that it is not.
includes('docs/CURRENT_TRUTH_LEDGER.md', godotLiveSuite);
includes('docs/CURRENT_TRUTH_LEDGER.md', godotLiveProbe);
includes('docs/CURRENT_TRUTH_LEDGER.md', godotLiveRecord);
includes('docs/CURRENT_TRUTH_LEDGER.md', 'LIVE_SERVER_PIPELINE');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'Godot Showcase on a LIVE FearServer Session');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'calibrated approximation');
includes('docs/RELEASE_SURFACE.md', 'LIVE_SERVER_PIPELINE');
includes('docs/RELEASE_SURFACE.md', 'calibrated approximation');
includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'LIVE_SERVER_PIPELINE');
includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', godotLiveRecord);
includes('docs/SYSTEM_MAP.md', 'LIVE_SERVER_PIPELINE');
includes('docs/SYSTEM_MAP.md', godotLiveProbe);
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', godotLiveProbe);
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'run_showcase_live_conformance.gd');
includes(godotLiveRecord, 'headless');

// The wiring probe must keep asserting the load-bearing half of the live
// guarantee: a live appraisal never falls through to the local evaluator.
includes(godotLiveProbe, 'Live mode returns before reaching the local evaluator');
includes(godotLiveProbe, 'dropped_unregistered_observations');

// The fallback must not be advertised as a bit-exact mirror of the server.
excludesPattern('docs/CURRENT_TRUTH_LEDGER.md', /fallback[^.]{0,80}bit-exact/i);
excludesPattern('docs/RELEASE_SURFACE.md', /fallback[^.]{0,80}bit-exact/i);
console.log('  * Godot showcase row is bounded to headless in-engine execution plus its live-pipeline, contract and parity evidence: PASS');

// ---------------------------------------------------------------------------
// Batch control plane and session ownership.
//
// Two claims that are easy to overstate. Batching is a STRUCTURAL claim about
// request counts, not a performance guarantee; ownership is session
// BOOKKEEPING, not authorization. Both must stay reachable from the documents
// while their limits stay stated.
// ---------------------------------------------------------------------------
const batchControlRecord = 'evidence/batch_control_plane_2026-09-20.md';
const sessionOwnershipRecord = 'evidence/session_ownership_2026-09-20.md';
const sessionBringupRecord = 'evidence/session_bringup_2026-09-20.md';
const sessionOwnershipModule = 'packages/runtime/src/ClaimArbitration.js';
const batchBringupMeasure = 'tools/verification/measure_session_bringup.mjs';

includes('docs/CURRENT_TRUTH_LEDGER.md', batchControlRecord);
includes('docs/CURRENT_TRUTH_LEDGER.md', sessionOwnershipRecord);
includes('docs/CURRENT_TRUTH_LEDGER.md', 'Batch Agent Registration');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'Session Ownership');
includes('docs/RELEASE_SURFACE.md', batchControlRecord);
includes('docs/RELEASE_SURFACE.md', sessionOwnershipRecord);
includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', batchControlRecord);
includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', sessionOwnershipRecord);
includes('docs/SYSTEM_MAP.md', sessionOwnershipModule);
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', sessionOwnershipModule);

// The ownership record must state all three limits that stop it being read as a
// security feature: it is not authorization, the identity is caller-declared
// rather than cryptographic, and liveness is a heuristic rather than a
// heartbeat. An edited-away disclaimer is how a bookkeeping contract silently
// becomes a security claim.
includes(sessionOwnershipRecord, 'No authorization layer');
includes(sessionOwnershipRecord, 'No cryptographic identity');
includes(sessionOwnershipRecord, 'not a heartbeat protocol');
includes(sessionOwnershipRecord, 'A refused claim changes nothing');

// The batch record must keep the structural framing and disclaim universal
// performance, since the measurement on one machine is not a guarantee on any
// other.
includes(batchControlRecord, 'MAX_BATCH_CONTROL_ITEMS');
includes(batchControlRecord, 'No throughput or latency guarantee');
includes(batchControlRecord, 'headless Node over loopback');

// The measurement record must carry its run metadata and its own caveats, so it
// cannot be cited as an unqualified speed-up.
excludesPattern('docs/CURRENT_TRUTH_LEDGER.md', /batching (?:guarantees|ensures)[^.]{0,60}(?:latency|throughput)/i);
// Asserting the DISCLAIMER is present is the meaningful guard here. A pattern
// hunting for the words "authorization"/"authentication" near "ownership"
// cannot tell an affirmative claim from its negation, and would fire on the
// very sentence that states the limit.
includes('docs/RELEASE_SURFACE.md', 'Not authorization (ownership gates claims and teardowns, not reads)');
includes('docs/RELEASE_SURFACE.md', 'not authentication');
// This line used to assert 'server-memory only', then 'no token expiry or
// revocation'. BOTH statements became FALSE as the system grew: ownership now
// rides in the snapshot, and the credential now has a TTL, rotation and a
// revocation route. A guard is only worth keeping if it tracks what is actually
// true, so it now asserts the limit that IS true after those additions. The
// scope did not disappear when the feature landed - it MOVED, from "there is no
// expiry" to "an expiry is a bound on a leak, not a revocation of it" - and a
// probe that kept asserting the old sentence would have forced the docs to lie.
includes('docs/RELEASE_SURFACE.md', 'Expiry bounds a leak\'s useful life; it is not revocation');
includes('docs/RELEASE_SURFACE.md', 'a stolen token can revoke');
includes('docs/RELEASE_SURFACE.md', 'survives a middleware restart');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'ownership gates claims rather than reads');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'as hashes, never raw tokens');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'Ownership gates **claims**, not observations or ticks');

// The measurement must exist as a runnable command and must be wired to the
// probe that produces it, or the numbers in the record have no reproducible
// source.
includes('package.json', 'measure:session-bringup');
includes('package.json', batchBringupMeasure);
includes(sessionBringupRecord, '1d4902d5a849b8a5a4938f9b06dcd03fec001932');
console.log('  * Batch control-plane and session-ownership claims are bounded and their limits stated: PASS');

// ---------------------------------------------------------------------------
// Request signing, the identity timeline, the arbitration fuzzer, and the
// Unity Editor gate.
//
// Four claims in this group are each one sentence away from being false. Signing
// is the easiest to overstate: it makes a leaked token insufficient, which SOUNDS
// like transport security and is not, and the one property that must never be
// claimed is confidentiality. The timeline is a per-process ring, not an audit
// log. The fuzzer is single-threaded. And the Unity Editor gate SKIPS on this
// machine, so nothing may read as an in-Editor verification.
// ---------------------------------------------------------------------------
const signingRecord = 'evidence/transport_signing_audit_timeline_2026-09-20.md';
const signingModule = 'packages/runtime/src/RequestSigning.js';
const signingProbe = 'tools/verification/verify_transport_signing.mjs';
const timelineProbe = 'tools/verification/verify_dashboard_endpoints.mjs';
const fuzzProbe = 'tools/verification/verify_fuzz_arbitration.mjs';
const unityEditorProbe = 'tools/verification/verify_unity_editor_tests.mjs';

includes('docs/CURRENT_TRUTH_LEDGER.md', signingRecord);
includes('docs/RELEASE_SURFACE.md', signingRecord);
// The audit cites the probe by filename inside a sentence rather than as a
// standalone path, so the bare name is what is asserted here: the guard is that
// the claim POINTS AT its evidence, not the shape of the citation.
includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'verify_transport_signing.mjs');
includes('docs/SYSTEM_MAP.md', signingModule);
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', signingProbe);
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', fuzzProbe);
includes('docs/CURRENT_TRUTH_LEDGER.md', fuzzProbe);

// The limits, asserted in every document that carries the claim. A pattern
// hunting for "TLS"/"confidential" near "signing" cannot tell an affirmative
// claim from its negation and would fire on the very sentences that state the
// boundary, so the DISCLAIMERS themselves are what is asserted.
includes('docs/CURRENT_TRUTH_LEDGER.md', 'not TLS and not confidentiality');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'binary wire carries no session identity at all');
includes('docs/RELEASE_SURFACE.md', 'Request signing authenticates requests and makes them non-replayable');
includes('docs/SYSTEM_MAP.md', 'leaked token alone is insufficient');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'leaked token alone being refused');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'Not TLS, not confidentiality');

// The signing probe must keep both load-bearing assertions: that a leaked token
// alone is refused, and that its own scope banner still says what it is not.
includes(signingProbe, 'the LEAKED TOKEN ALONE is refused');
includes(signingProbe, 'NOT TLS');
includes(signingProbe, 'no silent downgrade');

// The timeline's two honest qualifiers, in the ledger and in the surface the
// claim is published on.
includes('docs/CURRENT_TRUTH_LEDGER.md', "timeline_scope: 'THIS_PROCESS'");
includes('docs/CURRENT_TRUTH_LEDGER.md', 'not a durable audit log');
includes('docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md', 'not part of a snapshot');
includes(timelineProbe, 'Timeline ring is not bounded');

// The fuzzer's scope: sequential, and it says so. A fuzz result quoted as a
// concurrency result would be a claim the probe never made.
includes('docs/CURRENT_TRUTH_LEDGER.md', 'single-threaded and sequential');
includes(fuzzProbe, 'the refusal-inertness check fires when a refusal is made to mutate');
includes(fuzzProbe, 'a different seed produces a different sequence');

// ---------------------------------------------------------------------------
// The Unity Editor gate.
//
// This is the one row in the group whose honest outcome on this machine is
// NOT a pass. The gate must exist, must skip with a reason, must fail on zero
// tests executed, and must be declared as not promoting the adapter anywhere it
// is mentioned - otherwise the next reader promotes Unity on the strength of a
// test project that has never been run.
// ---------------------------------------------------------------------------
includes('package.json', 'verify:unity-editor');
includes(unityEditorProbe, 'SKIPPED: no Unity Editor found');
includes(unityEditorProbe, 'ran but executed NO tests');
includes(unityEditorProbe, 'FEAR_AI_UNITY_REQUIRED');
includes('docs/CURRENT_TRUTH_LEDGER.md', 'no Editor has run these tests here');
includes('docs/RELEASE_SURFACE.md', 'the Unity row keeps `IMPLEMENTED_NOT_EDITOR_VERIFIED`');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'This row does not promote the Unity adapter');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'compiled and *not executed*');
// The compile gate must keep saying that it compiles these tests rather than
// running them; a compile gate that reads like a test run is worse than none.
includes('tools/verification/verify_dotnet_adapters_compile.mjs', 'COMPILED here and not executed');
// And the EditMode assembly must stay out of a player build.
includes('packages/adapters/unity/Tests/EditMode/FearAI.EditModeTests.asmdef', 'UNITY_INCLUDE_TESTS');
console.log('  * Transport signing, identity timeline, arbitration fuzz and the Unity Editor gate are bounded and their limits stated: PASS');

// ---------------------------------------------------------------------------
// The evidence-ledger gate is retired, and the three roles it used to blur
// must stay apart.
//
// `npm run lint:evidence` was a gate whose exit code was the verdict. The
// ledger stopped being maintained on 2026-09-06; thousands of rows no longer
// re-prove against the sources they name, so that gate could never pass again.
// It could have been made green by bulk-invalidating the unproved rows, which
// would have been a declaration rather than a proof — so it was retired loudly
// instead. The question still worth asking ("how much of the closed record
// still re-proves?") moved to a report mode that makes no verdict claim, and
// the map's ledger section became generated so it cannot drift from the record
// it summarises. These checks keep those roles from collapsing back together.
// ---------------------------------------------------------------------------
const evidenceGate = spawnSync(process.execPath, [path.join(repoRoot, 'evidence', 'lint.mjs'), '--retired'], {
    encoding: 'utf8',
    cwd: repoRoot
});
assert(evidenceGate.status === 9, `lint:evidence --retired exited ${evidenceGate.status}, expected 9 (a retired gate must refuse, not report a verdict)`);
assert(/RETIRED/.test(`${evidenceGate.stderr}${evidenceGate.stdout}`),
    'lint:evidence --retired does not say it is retired, so the reader cannot tell why it failed');
includes('package.json', '"lint:evidence": "node evidence/lint.mjs --retired"');
includes('package.json', '"evidence:report": "node evidence/lint.mjs --report"');
includes('evidence/lint.mjs', 'CLOSED_HISTORICAL_RECORD');
// The status section of the map is generated from the ledger. If the two ever
// disagree, this fails here rather than being discovered by a human audit two
// weeks later - which is exactly how the previous divergence happened.
const generatorCheck = spawnSync(process.execPath, [path.join(repoRoot, 'tools', 'codegen', 'generate_maturity_map.mjs'), '--check'], {
    encoding: 'utf8',
    cwd: repoRoot
});
assert(generatorCheck.status === 0,
    `the generated maturity-ledger section is out of date with the evidence ledger: ${(generatorCheck.stderr || generatorCheck.stdout).trim()}`);
// The dossier's probe roster is generated from the recorded run's own JSON, so
// the dossier cannot describe a run it did not have. Same drift test as the map.
const dossierCheck = spawnSync(process.execPath, [path.join(repoRoot, 'tools', 'codegen', 'generate_release_dossier.mjs'), '--check'], {
    encoding: 'utf8',
    cwd: repoRoot
});
assert(dossierCheck.status === 0,
    `the release dossier's probe roster is out of date with evidence/probe_suite_report.json: ${(dossierCheck.stderr || dossierCheck.stdout).trim()}`);
includes('evidence/probe_suite_report.json', '"kind": "recorded-probe-suite-run"');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'GENERATED:PROBE-ROSTER:BEGIN');
// The determinism section is generated from a DIFFERENT artifact, and it must be
// able to say "never repeated" — a dossier that dropped the section would read
// exactly like one whose every probe repeated cleanly.
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'GENERATED:PROBE-DETERMINISM:BEGIN');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'Determinism (recorded repeated run, generated)');
// The cross-night half: the dossier must report the ledger, and the flaky branch
// is asserted on the generator because the rendered text depends on whether any
// probe has actually flaked — asserting the degraded wording on the document
// would fail whenever every recorded night was clean.
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'Across the ledger of recorded repeated runs');
includes('tools/verification/stability_regression.mjs', 'a recorded fact cannot be failed away');
includes('tools/verification/stability_regression.mjs', 'No probe has ever disagreed with itself across the recorded ledger');
includes('tools/codegen/generate_release_dossier.mjs', 'never gated: a recorded fact cannot be failed away');
// The bound and the comparability rule: a rate without an interval overclaims, and a
// timing ratio across two machines measures the machines.
includes('tools/verification/stability_regression.mjs', 'Wilson');
includes('tools/verification/stability_regression.mjs', 'ratio across two different machines measures the machines');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', '95% Wilson upper bound');
// Folding a night into the record is a write, so the default must be a dry run.
includes('tools/verification/fold_stability_ledger.mjs', 'DRY RUN — nothing written');
includes('tools/verification/fold_stability_ledger.mjs', 'is already present is skipped');
// The ledger is read and written by Node, never by a shell: a shell decodes a native
// command's output with the console's code page, which mangles the em dash the record
// contains, so a night read that way is not the night on disk.
includes('tools/verification/fold_stability_ledger.mjs', '--into-ref');
includes('tools/verification/fold_stability_ledger.mjs', '--require-ref');
// And the nightly step that proposes the night is a dry run unless it is told otherwise,
// and stops rather than rebuilding a review branch it could not read.
includes('tools/ci/open_ledger_night_pr.ps1', 'DRY RUN (nothing written, nothing pushed)');
includes('tools/ci/open_ledger_night_pr.ps1', '--into-ref');
includes('tools/ci/open_ledger_night_pr.ps1', 'exists on the remote but could not be fetched');
includes('docs/SYSTEM_MAP.md', 'verify:stability-regression');
includes('evidence/probe_stability_ledger.jsonl', '"verdicts"');
// The never-repeated branch is asserted on the GENERATOR, not on the rendered
// dossier: when every probe was repeated the dossier correctly says so instead,
// and a text assertion that only holds in the degraded case would be a probe that
// fails whenever the good case is true.
includes('tools/codegen/generate_release_dossier.mjs', 'No repeated run has been recorded');
includes('tools/codegen/generate_release_dossier.mjs', 'is not a repeated run');
includes('tools/codegen/generate_release_dossier.mjs', 'Never repeated at all');
includes('evidence/probe_stability_report.json', '"kind": "recorded-probe-stability-run"');
includes('evidence/probe_stability_report.json', '"verdicts"');
includes('AGENTS.md', 'npm run verify:probe-stability');
includes('docs/RELEASE_CANDIDATE_CERTIFICATION.md', 'is *not* a pass');
includes('docs/DOMAIN_MATURITY.md', 'GENERATED:LEDGER-STATUS:BEGIN');
includes('docs/DOMAIN_MATURITY.md', 'npm run evidence:report');
includes('docs/DOMAIN_MATURITY.md', 'No label in this table is a statement about today.');
// Every doc that used to point a reader at the retired gate must name both the
// closure and the replacement, or the next reader runs a retired gate.
includes('AGENTS.md', 'npm run evidence:report');
includes('docs/SYSTEM_MAP.md', 'npm run evidence:report');
includes('docs/PROVENANCE.md', 'npm run evidence:report');
console.log('  * The retired evidence-ledger gate refuses, its report makes no verdict claim, and the generated map section matches the ledger: PASS');

console.log('\nScope: this probe audits release-claim document boundaries only.');
console.log('It does not certify runtime behavior, external hosts, adapters, or research semantics.');
console.log('\nSUCCESS: Release-claim document boundaries are explicit.');
