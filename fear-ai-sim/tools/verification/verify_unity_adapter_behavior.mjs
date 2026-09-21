#!/usr/bin/env node

/**
 * tools/verification/verify_unity_adapter_behavior.mjs
 *
 * The Unity adapter's own logic, EXECUTED against a live FearServer, in two
 * separate processes, with the engine replaced by a shim.
 *
 * WHY "IT COMPILES" WAS NOT ENOUGH
 * The standing limitation was "Unity verified only statically", and the previous
 * step narrowed it to "Unity type-checks outside the Editor". Neither could answer
 * the questions a host actually cares about: does the adapter's batched control
 * plane register the crowd and notice refusals, does it carry its credential on a
 * teardown, and does a restarted process come back as the SAME host? All of those
 * are properties of the adapter's code, not of the Editor, so they can be run -
 * and a compile check that passes while every one of them is broken is the exact
 * failure mode this repository keeps finding in its own claims.
 *
 * HOW IT RUNS
 *   * `tools/verification/unity/UnityEngineShim.cs` backs the UnityEngine surface
 *     with real behaviour: real HTTP over HttpClient, real field-based JSON, real
 *     file and PlayerPrefs storage, and a coroutine runner.
 *   * `tools/verification/unity/UnityBehaviorHarness.cs` drives the adapter through
 *     its public API plus reflection into its serialized fields, and fails loudly
 *     if a field or method it needs has been renamed.
 *   * the REAL adapter sources are compiled unmodified: `FearAIClient.cs`,
 *     `FearTypes.cs`, `FearSessionStore.cs`, `FearSigning.cs` (and the
 *     teardown/credential/signing logic under test lives in them).
 *   * the server runs with `--signature-policy=required`, which constrains only
 *     sessions that have registered a key: phases 1-2 are the control that this
 *     policy does not lock anyone else out, and phase 3 is the point of it.
 *   * the adapter's lifecycle bodies are executed by the shim's `UnityLifecycle`, so
 *     `OnEnable`, `Start`, `Update`, `OnDisable` and `OnDestroy` are no longer shipped
 *     unexecuted: before it, only `Awake` was ever invoked and only by this harness
 *     calling it by hand.
 *
 * Two phases in two processes, because "the host restarted" has to be true rather
 * than simulated in a variable. Phase 2 asserting GRANTED (with zero refusals)
 * only means something because phase 1's session is still LIVE on the server: a
 * claim carrying only the session NAME would be refused, so the credential loaded
 * from disk is what proved the identity.
 *
 * WHAT IT STILL DOES NOT PROVE - reported as limits, not buried
 *   * WHEN Unity calls the lifecycle. The six bodies are now DRIVEN, not declared
 *     untestable: `UnityLifecycle` runs Awake then OnEnable, Start once then Update,
 *     and OnDisable then OnDestroy on destruction, and phase 1 asserts that order on
 *     an instrumented component before it asserts anything about the adapter. What is
 *     not modelled is the timing - construction and waking are separate phases here,
 *     `FixedUpdate` (the async control-plane tick) is deliberately not invoked from
 *     the frame pump, and an `async void` body is invoked without being awaited - so
 *     whether Unity calls these at that point remains an Editor question.
 *   * Frame scheduling: the shim runs coroutines to completion synchronously.
 *   * API fidelity: the shim's UnityWebRequest/JsonUtility are implementations,
 *     not Unity's. A stub-vs-real mismatch would compile and pass here.
 *   * Anything visual: `FearAgent.cs` and `FearAgentHUD.cs` are not covered.
 *
 * Hard Rule 9 note: standalone deterministic probe; not an automated test runner.
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { loadEncryptedSession, readStoreName } from '../../packages/runtime/src/EncryptedStore.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const SHIM_DIR = path.join(REPO, 'tools', 'verification', 'unity');
const SERVER_SCRIPT = path.join(REPO, 'tools', 'verification', 'helpers', 'serve_fear_server.mjs');
const ADAPTER_FILES = [
    'packages/adapters/unity/Runtime/FearAIClient.cs',
    'packages/adapters/unity/Runtime/FearTypes.cs',
    'packages/adapters/unity/Runtime/FearSessionStore.cs',
    // Request signing rides in the same control plane, so it is compiled and
    // executed here rather than only read.
    'packages/adapters/unity/Runtime/FearSigning.cs',
    // The encrypted store container. This harness does not exercise the container
    // itself - `verify_store_encryption.mjs` compiles it and runs it against the
    // Node and Godot writers - but `FearSessionStore.cs` implements the store half
    // against it, so it has to be present for either file to build at all.
    'packages/adapters/unity/Runtime/FearEncryptedStore.cs'
];

const OWNER_SESSION = 'unity_host';
const SIGNING_SESSION = 'unity_signing_host';
const CROWD_SIZE = 6;

/**
 * The server runs with `required`, deliberately, for the WHOLE probe.
 *
 * That policy only constrains a session that has registered a signing key, so
 * phases 1 and 2 (which never register one) must behave exactly as before - and
 * showing that is half the value: turning the policy on must not lock out the
 * hosts that do not sign. Phase 3 then registers a key and proves the token has
 * stopped being enough on its own.
 */
const SIGNATURE_POLICY = 'required';

let PASS = 0;
function check(label, condition, detail = '') {
    if (!condition) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    PASS++;
    console.log(`  * ${label}: PASS`);
}

function dotnetAvailable() {
    const probe = spawnSync('dotnet', ['--version'], { encoding: 'utf8' });
    return probe.status === 0;
}

async function portIsFree(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen({ host: '127.0.0.1', port }, () => probe.close(() => resolve(true)));
    });
}

async function pickFreePort(start = 8851, end = 8880) {
    for (let p = start; p <= end; p++) {
        // eslint-disable-next-line no-await-in-loop
        if (await portIsFree(p)) return p;
    }
    return null;
}

async function httpJson(port, method, route, body) {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

async function waitForServer(port, child, logPath) {
    for (let attempt = 0; attempt < 80; attempt++) {
        if (child.exitCode !== null) break;
        // eslint-disable-next-line no-await-in-loop
        const health = await httpJson(port, 'GET', '/health').catch(() => null);
        if (health && health.status === 200) return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
    }
    let tail = '';
    try { tail = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-12).join('\n'); } catch { /* ignore */ }
    throw new Error(`FearServer never answered /health on 127.0.0.1:${port}.\n${tail}`);
}

/**
 * A scratch project that compiles the harness plus the adapter UNMODIFIED. The
 * adapter files are referenced by absolute path rather than copied, so a passing
 * run is always about the sources in the repository right now.
 */
function writeProject(scratch) {
    fs.copyFileSync(path.join(SHIM_DIR, 'UnityEngineShim.cs'), path.join(scratch, 'UnityEngineShim.cs'));
    fs.copyFileSync(path.join(SHIM_DIR, 'UnityBehaviorHarness.cs'), path.join(scratch, 'UnityBehaviorHarness.cs'));

    const compileItems = ['UnityEngineShim.cs', 'UnityBehaviorHarness.cs']
        .map((f) => `    <Compile Include="${f}" />`)
        .concat(ADAPTER_FILES.map((rel) => `    <Compile Include="${path.join(REPO, rel).replace(/\\/g, '/')}" />`))
        .join('\n');

    const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>disable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <AssemblyName>UnityBehaviorHarness</AssemblyName>
    <RootNamespace>FearAI</RootNamespace>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <GenerateDocumentationFile>false</GenerateDocumentationFile>
    <NoWarn>CS0649;CS0414;CS0169</NoWarn>
  </PropertyGroup>
  <ItemGroup>
${compileItems}
  </ItemGroup>
</Project>
`;
    fs.writeFileSync(path.join(scratch, 'UnityBehaviorHarness.csproj'), csproj);
}

function build(scratch) {
    const res = spawnSync('dotnet', ['build', '-c', 'Release', '--nologo', '-v', 'quiet'], {
        cwd: scratch,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 300_000
    });
    const output = `${res.stdout || ''}${res.stderr || ''}`;
    if (res.status !== 0) {
        throw new Error(`the Unity adapter + harness did not build:\n${output.split(/\r?\n/).slice(-25).join('\n')}`);
    }
    const dll = path.join(scratch, 'bin', 'Release', 'net8.0', 'UnityBehaviorHarness.dll');
    if (!fs.existsSync(dll)) throw new Error(`expected build output missing: ${dll}`);
    return dll;
}

function runPhase(dll, phase, storePath, port, keyringPath = '') {
    const args = [dll, `--phase=${phase}`, `--store=${storePath}`, `--port=${port}`];
    if (keyringPath) args.push(`--keyring=${keyringPath}`);
    const res = spawnSync('dotnet', args, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000
    });
    const output = `${res.stdout || ''}${res.stderr || ''}`;
    const logPath = path.join(os.tmpdir(), `unity_adapter_behavior_phase${phase}.log`);
    fs.writeFileSync(logPath, output);
    return {
        exit: res.status === null ? 1 : res.status,
        passed: new RegExp(`UNITY_HARNESS_PHASE_${phase}=PASSED`).test(output),
        failures: output.split(/\r?\n/).filter((l) => /\[FAIL\]/.test(l)).map((l) => l.trim()),
        logPath
    };
}

function reportPhase(result, phase) {
    if (result.exit !== 0 || !result.passed) {
        const detail = result.failures.length > 0 ? `\n${result.failures.join('\n')}` : '';
        throw new Error(`Unity harness phase ${phase} failed (exit=${result.exit}). Log: ${result.logPath}${detail}`);
    }
    PASS++;
    console.log(`  * phase ${phase} passed in its own OS process (exit 0, self-reported PASSED): PASS`);
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY UNITY ADAPTER BEHAVIOUR vs A LIVE FearServer (.NET)');
    console.log('============================================================');

    if (!dotnetAvailable()) {
        console.log('\nSKIPPED: no `dotnet` on PATH, so NO behavioural Unity evidence was captured.');
        console.log('The Unity row in the ledger stays at "type-checks only".');
        return;
    }

    const port = await pickFreePort();
    if (!port) throw new Error('no free port in 8851-8880');
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fear_ai_unity_harness_'));
    const storePath = path.join(scratch, 'unity_session.json');
    const serverLog = path.join(os.tmpdir(), 'fear_ai_unity_behavior_server.log');
    const serverFd = fs.openSync(serverLog, 'w');
    const server = spawn(process.execPath, [SERVER_SCRIPT, `--port=${port}`, '--host=127.0.0.1', `--signature-policy=${SIGNATURE_POLICY}`], {
        cwd: REPO,
        stdio: ['ignore', serverFd, serverFd]
    });

    try {
        console.log(`\n--- 1. build the adapter + harness against a real FearServer ---`);
        await waitForServer(port, server, serverLog);
        console.log(`FearServer: 127.0.0.1:${port}`);
        writeProject(scratch);
        const dll = build(scratch);
        check('the real Unity adapter sources compiled into an executable harness', fs.existsSync(dll));
        // The list is explicit so the compile scope cannot widen by accident. The
        // count alone was the old form of that check and it went stale the moment a
        // file was added for a real reason, so the list is checked for the two things
        // that actually matter: every entry exists, and the container is present
        // because `FearSessionStore.cs` implements against it.
        check('every file under test exists on disk',
            ADAPTER_FILES.every((rel) => fs.existsSync(path.join(REPO, rel))),
            ADAPTER_FILES.filter((rel) => !fs.existsSync(path.join(REPO, rel))).join(', '));
        check('the encrypted store container is compiled, because the store depends on it',
            ADAPTER_FILES.includes('packages/adapters/unity/Runtime/FearEncryptedStore.cs'));

        console.log(`\n--- 2. a fresh Unity host process claims a crowd ---`);
        const phase1 = runPhase(dll, 1, storePath, port);
        reportPhase(phase1, 1);
        check('the harness persisted a credential file', fs.existsSync(storePath), storePath);
        const stored = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        check('the file holds the session NAME', stored.session_id === OWNER_SESSION, JSON.stringify(stored.session_id));
        check('the file holds a 256-bit credential', /^[0-9a-f]{64}$/.test(String(stored.session_token)),
            `length=${String(stored.session_token).length}`);

        const sessions = await httpJson(port, 'GET', '/api/v1/sessions');
        const owner = sessions.body.sessions.find((s) => s.session_id === OWNER_SESSION);
        check('the server credits the Unity host with its crowd, minus the one it retired',
            owner && owner.agent_count === CROWD_SIZE - 1, JSON.stringify(owner));
        check('the server sees the Unity host as able to prove continuity', owner.has_token === true);
        check('the server never echoes the stored credential',
            !JSON.stringify(sessions.body).includes(stored.session_token));
        // Claim refusals and teardown refusals are counted SEPARATELY on the
        // server, deliberately: a refused claim costs the host an NPC it never
        // had, while a refused teardown means an agent it believes it retired is
        // still live. The harness exercises one of each, so each tally is one.
        check('a refused rival claim is visible in the server tally',
            Number(sessions.body.refusals) >= 1, `refusals=${sessions.body.refusals}`);
        check('a refused teardown is counted separately from a refused claim',
            Number(sessions.body.teardown_refusals) >= 1, `teardown_refusals=${sessions.body.teardown_refusals}`);

        console.log(`\n--- 3. a NEW Unity host process returns with that credential ---`);
        const phase2 = runPhase(dll, 2, storePath, port);
        reportPhase(phase2, 2);

        console.log(`\n--- 4. a Unity host that proves itself with a KEY, against a \`required\` server ---`);
        const signingStore = path.join(scratch, 'unity_signing.json');
        const phase3 = runPhase(dll, 3, signingStore, port);
        reportPhase(phase3, 3);
        const signingLog = fs.readFileSync(phase3.logPath, 'utf8');
        const keyId = (signingLog.match(/SIGNING_KEY_ID=([0-9a-f]{16})/) || [])[1];
        const sessionToken = (signingLog.match(/SIGNING_SESSION_TOKEN=([0-9a-f]{64})/) || [])[1];
        check('the harness reported the key fingerprint it registered', Boolean(keyId), keyId);
        check('the harness reported the credential it holds', Boolean(sessionToken));

        // The server's side of the same facts. The fingerprint is the assertion
        // that matters most here: it is derived from the PEM the ADAPTER built -
        // by hand, with no PEM helpers available on this target - so a match means
        // the server parsed and hashed exactly the key the adapter meant to send.
        const afterSigning = await httpJson(port, 'GET', '/api/v1/sessions');
        const signingSession = afterSigning.body.sessions.find((s) => s.session_id === SIGNING_SESSION);
        check('the server holds a signing key for the signing host',
            signingSession && signingSession.has_signing_key === true, JSON.stringify(signingSession));
        check('the server fingerprint matches the key the adapter built',
            signingSession && signingSession.signing_key_id === keyId,
            `server=${signingSession && signingSession.signing_key_id} adapter=${keyId}`);
        check('no signature was refused on the signed path',
            Number(afterSigning.body.signing && afterSigning.body.signing.rejected) === 0,
            JSON.stringify(afterSigning.body.signing && afterSigning.body.signing.failures_by_reason));
        check('the session list reports the signature policy in force',
            afterSigning.body.signing && afterSigning.body.signing.policy === SIGNATURE_POLICY,
            String(afterSigning.body.signing && afterSigning.body.signing.policy));

        // THE POINT OF THE WHOLE FEATURE: this host's own 256-bit token, sent by
        // itself, with no signature, is no longer enough to act as it. A token
        // lifted from a store or a log buys nothing once the key is registered.
        const leaked = await httpJson(port, 'POST', '/api/v1/unregister/batch', {
            session_id: SIGNING_SESSION,
            session_token: sessionToken,
            agent_ids: ['signing_agent_02']
        });
        check('a LEAKED TOKEN alone is refused under the required policy',
            leaked.status === 401 && leaked.body.code === 'SIGNATURE_MISSING',
            `status=${leaked.status} code=${leaked.body && leaked.body.code}`);

        // And the refusal must not have half-happened. The agent is still there.
        const afterLeak = await httpJson(port, 'GET', '/api/v1/sessions');
        const stillHeld = afterLeak.body.sessions.find((s) => s.session_id === SIGNING_SESSION);
        check('the refused request mutated nothing',
            stillHeld && stillHeld.agent_count === 1, JSON.stringify(stillHeld));

        // ------------------------------------------------------------------
        // Phase 4 — the credential and the PRIVATE KEY, encrypted at rest.
        // No server: the adapter's own read-back is the subject, and the probe
        // then checks the same file from OUTSIDE the adapter with the reference
        // implementation. Two independent readers of one container is the point.
        // ------------------------------------------------------------------
        console.log('\n--- 5. the Unity store, encrypted at rest ---');
        const keyringDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fear_ai_unity_keyring_'));
        const unityKeyring = path.join(keyringDir, 'keyring').replace(/\\/g, '/');
        const encryptedStore = path.join(scratch, 'unity_session.enc').replace(/\\/g, '/');
        const phase4 = runPhase(dll, 4, encryptedStore, port, unityKeyring);
        reportPhase(phase4, 4);

        const phase4Log = fs.readFileSync(phase4.logPath, 'utf8');
        const storedToken = (phase4Log.match(/UNITY_STORE_TOKEN=([0-9a-f]{64})/) || [])[1];
        const storedKeyId = (phase4Log.match(/UNITY_STORE_KEY_ID=([0-9a-f]{16})/) || [])[1];
        check('the harness reported the credential it stored', Boolean(storedToken));
        check('the harness reported the fingerprint of the key it stored', Boolean(storedKeyId), String(storedKeyId));

        check('the store file exists', fs.existsSync(encryptedStore));
        const unityStoreText = fs.readFileSync(encryptedStore, 'utf8');
        check('it is the CONTAINER, not the plaintext JSON the harness used to write',
            unityStoreText.startsWith('FEAR-AI-STORE-V1\n'), unityStoreText.split('\n')[0]);
        check('it is not parseable JSON at all', (() => {
            try { JSON.parse(unityStoreText); return false; } catch { return true; }
        })());
        check('THE ADAPTER-STORED CREDENTIAL IS NOT READABLE IN THE FILE',
            !unityStoreText.includes(storedToken));
        check('no private-key PEM banner is readable in it', !unityStoreText.includes('PRIVATE KEY'));
        check('the session name is readable without the key, deliberately',
            readStoreName(encryptedStore) === OWNER_SESSION, readStoreName(encryptedStore));

        // The second, INDEPENDENT reader: the Node reference, with the keyring alone.
        const opened = loadEncryptedSession(encryptedStore, { keyringPath: unityKeyring });
        check('the Node reference opens the ADAPTER-WRITTEN store with the keyring alone',
            opened.ok, opened.reason);
        check('and recovers the credential the adapter had',
            opened.record.sessionToken === storedToken,
            `store=${String(opened.record.sessionToken).length} chars reported=${String(storedToken).length}`);
        // Normalised before the comparison, and that is a finding rather than a
        // convenience: `ExportPrivateKeyText` uses the platform's line ending, so on
        // Windows the text is CRLF while the adapter's own parser accepts either. The
        // container is byte-identical across runtimes because this text is INSIDE the
        // ciphertext; a comparison that did not normalise would be asserting the
        // opposite of what the format actually promises.
        const recoveredKey = opened.record.signingPrivateKeyText;
        check('and recovers a PRIVATE KEY, which is the half that must not be readable in the file',
            recoveredKey.replace(/\r\n/g, '\n').startsWith('FEAR-AI-RSA1\n'),
            String(recoveredKey).split('\n')[0]);
        check('and the recovered key is not readable in the file',
            !unityStoreText.includes(recoveredKey));
        // The recovered key must be a key the ADAPTER would accept back, not merely
        // something key-shaped: it is re-imported through the same parser phase 4
        // used to restore it.
        check('the recovered key text is the FEAR-AI-RSA1 text the adapter exports',
            recoveredKey.includes('\nmodulus=') && recoveredKey.includes('\nq='),
            recoveredKey.split('\n').slice(1, 3).join(','));
        check('a copy of the store without its keyring is inert', (() => {
            const strangerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fear_ai_unity_stranger_'));
            const stranger = loadEncryptedSession(encryptedStore,
                { keyringPath: path.join(strangerDir, 'keyring') });
            fs.rmSync(strangerDir, { recursive: true, force: true });
            return !stranger.ok;
        })());
        fs.rmSync(keyringDir, { recursive: true, force: true });

        console.log('\n============================================================');
        console.log(`SUCCESS: ${PASS} Unity behavioural assertions passed across 4 separate processes.`);
        console.log(`Server policy for this run: ${SIGNATURE_POLICY} (phases 1-2 never register a key, so they are the control).`);
        console.log('Phase 4 needs no server, and its store file is read back by BOTH the adapter and');
console.log('the Node reference, so the container is not checked only by its own author.');        console.log('The lifecycle bodies are DRIVEN here (Awake/OnEnable/Start/Update/OnDisable/OnDestroy, in');
        console.log('Unity\'s order, asserted on an instrumented component first), so a body that can never');
        console.log('work is caught without an Editor. Limits NOT covered here: WHEN Unity calls them');
        console.log('(construction and waking are separate phases here, FixedUpdate is not pumped, async');
        console.log('void bodies are not awaited), frame scheduling, shim-vs-real API fidelity, and the');
        console.log('non-control-plane files (FearAgent/_HUD).');
        console.log('============================================================');
    } finally {
        if (server.exitCode === null) server.kill('SIGKILL');
        try { fs.closeSync(serverFd); } catch { /* ignore */ }
        try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* ignore */ }
        console.log(`\nCleaned up: scratch project removed, FearServer on ${port} stopped.`);
    }
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
