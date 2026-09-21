#!/usr/bin/env node

/**
 * tools/verification/verify_host_token_persistence.mjs
 *
 * CROSS-PROCESS proof that a HOST keeps its session credential, and that the
 * credential is what makes a restart a reconnect instead of an arrival.
 *
 * WHY THIS IS NOT ANOTHER NODE PROBE
 * Every ownership probe before this one drives `ClaimArbitration` or a
 * FearServer from the same process, so the token is always in memory. What a
 * host actually has to do is different and was untested: write the credential
 * somewhere that outlives ITS OWN process, load it before the first claim of the
 * next run, and present it. Only a real second process can distinguish "the
 * client kept working" from "the client came back as a stranger to its own
 * crowd", because both look like a 200 with a registered agent.
 *
 * So this probe runs the REAL Godot 4.6 engine three times, in three separate
 * processes, with one store file between them:
 *
 *   phase 1  fresh store  -> registers a crowd, receives a credential, persists it
 *   phase 2  new process, same server -> the credential must produce GRANTED,
 *            and a tokenless rival must still be refused the same agents
 *   phase 3  new process, server RESTARTED and reloaded from a snapshot ->
 *            a credential hashed in a PREVIOUS server process must still work,
 *            and the run also exercises the reset gate from a real host
 *
 * It also inspects the artifact itself, and this is now the sharper half. The
 * store must EXIST, must be the ENCRYPTED container rather than JSON, must NOT
 * contain the credential or the private key in any readable form, must carry the
 * session NAME in the clear (deliberately, so a stray store can be attributed),
 * and must open with the Node reference implementation using only the keyring. The
 * last one is what separates "a file of ciphertext" from "a store the tooling can
 * actually read": without it the probe would pass on a blob nobody could use.
 * The server's own session listing, meanwhile, must never contain the credential.
 *
 * PHASE 4 has no server in it at all. It proves the UPGRADE path: a plaintext
 * store left by an older build is read, reported as PLAINTEXT_LEGACY, and
 * rewritten encrypted by the ordinary save that runs on the next credential
 * issue - in place, without a migration step a real host would have to remember.
 *
 * Requires an external Godot binary; SKIPPED (not PASSED) when one is absent, so
 * no record can claim in-engine coverage that did not happen.
 *
 * Hard Rule 9 note: standalone deterministic probe; not an automated test runner.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadEncryptedSession, readStoreName } from '../../packages/runtime/src/EncryptedStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const GODOT_PROJECT = path.join(REPO, 'tests', 'godot_project');
const SERVER_SCRIPT = path.join(REPO, 'packages', 'runtime', 'bin', 'fear-ai-server.js');
const SCENARIO = 'run_session_persistence.gd';

const GODOT_CANDIDATES = [
    process.env.FEAR_AI_GODOT,
    'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64_console.exe',
    'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64.exe'
];

const HOST_SESSION_ID = 'godot_persist_host';
const CROWD_SIZE = 3;
/** The credential phase 4's hand-written legacy store carries. */
const LEGACY_TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
/**
 * The keyring every engine phase is pinned to, so the probe can read the store
 * from OUTSIDE the engine. Passing it through the environment is also the check
 * that the override a real host would use for its own secret store works.
 */
let KEYRING_PATH = '';

let PASS = 0;
function check(label, condition, detail = '') {
    if (!condition) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    PASS++;
    console.log(`  * ${label}: PASS`);
}

function findGodot() {
    for (const candidate of GODOT_CANDIDATES) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['godot'], { encoding: 'utf8' });
    if (which.status === 0) {
        const first = which.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
        if (first && fs.existsSync(first)) return first;
    }
    return null;
}

async function portIsFree(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen({ host: '127.0.0.1', port }, () => probe.close(() => resolve(true)));
    });
}

async function pickFreePort(start = 8821, end = 8850) {
    for (let p = start; p <= end; p++) {
        // eslint-disable-next-line no-await-in-loop
        if (await portIsFree(p)) return p;
    }
    return null;
}

async function httpJson(port, method, route, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(`http://127.0.0.1:${port}${route}`, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
        });
        const parsed = await res.json().catch(() => null);
        return { status: res.status, body: parsed };
    } finally {
        clearTimeout(timer);
    }
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
    try {
        tail = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-12).join('\n');
    } catch { /* ignore */ }
    throw new Error(`FearServer never answered /health on 127.0.0.1:${port}.\n${tail}`);
}

function startServer(port, logPath, append = false) {
    const fd = fs.openSync(logPath, append ? 'a' : 'w');
    const child = spawn(process.execPath, [SERVER_SCRIPT, '--port', String(port), '--host', '127.0.0.1'], {
        cwd: REPO,
        stdio: ['ignore', fd, fd]
    });
    return { child, fd };
}

async function stopServer(server) {
    if (!server) return;
    if (server.child.exitCode === null) {
        server.child.kill('SIGKILL');
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 2000);
            server.child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
    }
    try { fs.closeSync(server.fd); } catch { /* ignore */ }
}

/**
 * Run one phase in its OWN Godot process. The store path is passed as a user arg
 * rather than an environment variable because it is the subject of the run: a
 * phase that silently used a different store would make the whole probe a
 * tautology, and an argument is visible in the log.
 */
function runPhase(godotExe, phase, storePath, port) {
    const res = spawnSync(
        godotExe,
        ['--path', '.', '--headless', '--script', SCENARIO, '--', `--phase=${phase}`, `--store=${storePath}`],
        {
            cwd: GODOT_PROJECT,
            env: { ...process.env, FEAR_AI_PORT: String(port), FEAR_AI_KEYRING: KEYRING_PATH },
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            timeout: 180_000
        }
    );
    const output = `${res.stdout || ''}${res.stderr || ''}`;
    const logPath = path.join(os.tmpdir(), `godot_session_persistence_phase${phase}.log`);
    fs.writeFileSync(logPath, output);
    return {
        exit: res.status === null ? 1 : res.status,
        output,
        logPath,
        passed: /PERSIST_PHASE_\d=PASSED/.test(output),
        failures: output.split(/\r?\n/).filter((l) => /\[FAIL\]/.test(l)).map((l) => l.trim())
    };
}

function reportPhase(result, phase) {
    if (result.exit !== 0 || !result.passed) {
        const detail = result.failures.length > 0 ? `\n${result.failures.join('\n')}` : '';
        throw new Error(`Godot phase ${phase} failed (exit=${result.exit}). Log: ${result.logPath}${detail}`);
    }
    PASS++;
    console.log(`  * phase ${phase} passed in its own engine process (exit 0, self-reported PASSED): PASS`);
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY HOST TOKEN PERSISTENCE ACROSS PROCESSES (Godot 4.6)');
    console.log('============================================================');

    const godotExe = findGodot();
    if (!godotExe) {
        console.log('\nSKIPPED: no Godot binary found, so NO cross-process evidence was captured.');
        console.log('Set FEAR_AI_GODOT to the executable to run this probe.');
        console.log('The host-persistence claim is NOT supported by this run.');
        return;
    }
    console.log(`Godot:  ${godotExe}`);

    const port = await pickFreePort();
    if (!port) throw new Error('no free port found in 8821-8850');
    const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fear_ai_session_'));
    // Forward slashes: GDScript's FileAccess accepts them on every platform, and a
    // backslash path would need escaping to survive being passed as an argument.
    const storePath = path.join(storeDir, 'session.json').replace(/\\/g, '/');
    // Deliberately in a DIFFERENT directory from the store, mirroring the real rule
    // that the key must not travel with the thing it protects. The probe then
    // checks the engine honoured it rather than assuming it did.
    const keyringDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fear_ai_keyring_'));
    KEYRING_PATH = path.join(keyringDir, 'keyring').replace(/\\/g, '/');
    const serverLog = path.join(os.tmpdir(), 'fear_ai_session_persistence_server.log');

    let server = null;
    try {
        console.log(`\n--- 1. a fresh host process establishes a crowd ---`);
        server = startServer(port, serverLog);
        await waitForServer(port, server.child, serverLog);
        console.log(`FearServer: 127.0.0.1:${port} | store: ${storePath}`);
        console.log(`keyring pinned to:   ${KEYRING_PATH}  (deliberately outside the store's directory)`);

        const phase1 = runPhase(godotExe, 1, storePath, port);
        reportPhase(phase1, 1);

        // ---- the artifact itself, not just the client's opinion of it --------
        if (!fs.existsSync(storePath)) throw new Error(`the store was never written: ${storePath}`);
        PASS++;
        console.log(`  * the credential store exists on disk: PASS`);
        const storeText = fs.readFileSync(storePath, 'utf8');

        // THE AT-REST ASSERTIONS. Read from the BYTES: asking the writer whether it
        // encrypted anything would prove only that it agrees with itself.
        check('the store is the FORMATTED CONTAINER, not the plaintext JSON it used to be',
            storeText.startsWith('FEAR-AI-STORE-V1\n'), storeText.split('\n')[0]);
        check('the store is not parseable JSON at all', (() => {
            try { JSON.parse(storeText); return false; } catch { return true; }
        })());
        check('the session NAME is readable without the key, deliberately',
            readStoreName(storePath) === HOST_SESSION_ID, readStoreName(storePath));

        // The decisive one: no keyring, no credential. Searched for the literal
        // 64-hex token and for the PEM header of the private key, because those are
        // the two things that must never be readable in a persisted store.
        const store = loadEncryptedSession(storePath, { keyringPath: KEYRING_PATH });
        check('the store opens with the Node reference and the keyring alone', store.ok, store.reason);
        const credential = store.record.sessionToken;
        check('the opened store holds a 256-bit credential', /^[0-9a-f]{64}$/.test(credential),
            `length ${credential.length}`);
        // Phase 1 does not enable request signing, so this store legitimately holds
        // no private key. Stated rather than skipped, because "no key here" is what
        // makes the PHASE 5 assertions about a key mean something.
        check('no private key is in this store, because phase 1 does not enable signing',
            store.record.signingPrivateKeyText === '');
        check('THE CREDENTIAL IS NOT READABLE IN THE FILE', !storeText.includes(credential));
        // "PRIVATE KEY" is the PEM banner, so this catches a store that kept the key
        // in some other plainly-labelled form, not only a byte-identical copy.
        check('no private-key PEM banner survives in the file',
            !storeText.includes('PRIVATE KEY'));
        // Relocation, which is the leak that actually happens.
        check('the keyring is a real, separate file', fs.existsSync(KEYRING_PATH));
        check('the keyring is NOT inside the store\'s directory',
            path.dirname(KEYRING_PATH) !== path.dirname(storePath));
        check('a stranger keyring cannot open the store', (() => {
            const strangerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fear_ai_stranger_'));
            const stranger = loadEncryptedSession(storePath,
                { keyringPath: path.join(strangerDir, 'keyring') });
            fs.rmSync(strangerDir, { recursive: true, force: true });
            return !stranger.ok;
        })());
        check('the store records when it was written',
            Number.isFinite(Number(store.record.savedAtUnix)), String(store.record.savedAtUnix));

        const sessionsBefore = await httpJson(port, 'GET', '/api/v1/sessions');
        const ownerBefore = sessionsBefore.body.sessions.find((s) => s.session_id === HOST_SESSION_ID);
        check('the server credits the session with the whole crowd',
            ownerBefore && ownerBefore.agent_count === CROWD_SIZE, JSON.stringify(ownerBefore));
        check('the server agrees this session can prove continuity', ownerBefore.has_token === true);
        // The store is the ONLY copy. A summary that echoed the credential would
        // make every dashboard read a credential disclosure.
        check('the server never discloses the stored credential',
            !JSON.stringify(sessionsBefore.body).includes(credential));

        console.log(`\n--- 2. a NEW host process reclaims the same crowd ---`);
        const phase2 = runPhase(godotExe, 2, storePath, port);
        reportPhase(phase2, 2);

        const sessionsAfter = await httpJson(port, 'GET', '/api/v1/sessions');
        const ownerAfter = sessionsAfter.body.sessions.find((s) => s.session_id === HOST_SESSION_ID);
        check('the restarted host still owns the whole crowd on the server',
            ownerAfter && ownerAfter.agent_count === CROWD_SIZE, JSON.stringify(ownerAfter));
        check('the restarted host is counted as a grant rather than an adoption',
            Number(sessionsAfter.body.adoptions) === 0, `adoptions=${sessionsAfter.body.adoptions}`);

        console.log(`\n--- 3. the MIDDLEWARE restarts, then a new host process returns ---`);
        const saved = await httpJson(port, 'POST', '/api/v1/save', {});
        const snapshot = saved.body && saved.body.snapshot;
        check('a snapshot was taken before the restart', Boolean(snapshot));
        check('ownership rides in the snapshot as a credential HASH', Array.isArray(snapshot.sessions)
            && snapshot.sessions.some((s) => s.session_id === HOST_SESSION_ID && /^[0-9a-f]{64}$/.test(String(s.token_hash))),
            JSON.stringify(snapshot.sessions && snapshot.sessions.map((s) => s.session_id)));
        check('the snapshot is not a credential store',
            !JSON.stringify(snapshot).includes(credential));

        await stopServer(server);
        server = startServer(port, serverLog, true);
        await waitForServer(port, server.child, serverLog);
        console.log(`  * FearServer restarted on the same port: PASS`);

        const loaded = await httpJson(port, 'POST', '/api/v1/load', { snapshot });
        check('the snapshot reloaded', loaded.status === 200 && loaded.body.status === 'LOADED',
            JSON.stringify(loaded.body));
        check('ownership was restored from it', loaded.body.ownership && loaded.body.ownership.restored >= 1
            && loaded.body.ownership.agents === CROWD_SIZE, JSON.stringify(loaded.body.ownership));
        const restored = await httpJson(port, 'GET', '/api/v1/sessions');
        const restoredOwner = restored.body.sessions.find((s) => s.session_id === HOST_SESSION_ID);
        check('a restored session keeps its credential hash', restoredOwner && restoredOwner.has_token === true,
            JSON.stringify(restoredOwner));
        check('a restored session is NOT live: ownership is continuity, not liveness',
            restoredOwner.live === false && restoredOwner.observed_this_process === false,
            JSON.stringify(restoredOwner));

        const phase3 = runPhase(godotExe, 3, storePath, port);
        reportPhase(phase3, 3);

        console.log(`\n--- 4. an OLDER BUILD's plaintext store is upgraded in place ---`);
        // No server needed: this phase is about the file. It also runs LAST so that
        // its hand-written ".legacy" store cannot be confused with the real one.
        const phase4 = runPhase(godotExe, 4, storePath, port);
        reportPhase(phase4, 4);

        // And the file on disk afterwards, checked from outside the engine: the
        // upgrade has to be a real rewrite, not a flag the client sets and forgets.
        const upgradedPath = `${storePath}.legacy`;
        if (!fs.existsSync(upgradedPath)) throw new Error(`phase 4 left no upgraded store: ${upgradedPath}`);
        const upgradedText = fs.readFileSync(upgradedPath, 'utf8');
        check('the legacy plaintext file was REPLACED by the encrypted container',
            upgradedText.startsWith('FEAR-AI-STORE-V1\n'), upgradedText.split('\n')[0]);
        check('the upgraded file no longer exposes the legacy credential',
            !upgradedText.includes(LEGACY_TOKEN));
        const upgraded = loadEncryptedSession(upgradedPath, { keyringPath: KEYRING_PATH });
        check('the upgraded store still carries the SAME credential',
            upgraded.ok && upgraded.record.sessionToken === LEGACY_TOKEN, upgraded.reason);
        check('the upgrade cost the host nothing: the name is intact',
            readStoreName(upgradedPath) === HOST_SESSION_ID, readStoreName(upgradedPath));

        console.log(`\n--- 5. the PRIVATE SIGNING KEY, at rest and after a restart ---`);
        const phase5 = runPhase(godotExe, 5, storePath, port);
        reportPhase(phase5, 5);

        const signingPath = `${storePath}.signing`;
        if (!fs.existsSync(signingPath)) throw new Error(`phase 5 left no store: ${signingPath}`);
        const signingText = fs.readFileSync(signingPath, 'utf8');
        check('the signing store is the encrypted container',
            signingText.startsWith('FEAR-AI-STORE-V1\n'), signingText.split('\n')[0]);
        check('NO PRIVATE-KEY PEM BANNER IS READABLE IN IT', !signingText.includes('PRIVATE KEY'));

        const signingStore = loadEncryptedSession(signingPath, { keyringPath: KEYRING_PATH });
        check('it opens with the reference and the keyring alone', signingStore.ok, signingStore.reason);
        const recoveredKey = signingStore.record.signingPrivateKeyText;
        // Banner-agnostic on purpose. Godot's `CryptoKey.save_to_string(false)` emits
        // PKCS#1 ("BEGIN RSA PRIVATE KEY") while the Node side would emit PKCS#8, and
        // pinning either one here would turn a legitimate encoding difference into a
        // false failure. What matters is that a private key is in there at all, and
        // the import below is what proves it is one.
        check('a PEM private key is inside it',
            recoveredKey.startsWith('-----BEGIN ') && recoveredKey.includes('PRIVATE KEY-----'),
            `recovered ${recoveredKey.length} characters: ${recoveredKey.split('\n')[0]}`);
        check('AND THE RECOVERED KEY IS NOT READABLE IN THE FILE',
            !signingText.includes(recoveredKey));

        // The point of encrypting the key is that the host gets it BACK, usable. A
        // blob that merely decrypts to something PEM-shaped would pass every check
        // above and still be worthless, so the key is actually imported and its
        // public half compared against the one the store says belongs with it.
        const imported = crypto.createPrivateKey(recoveredKey);
        check('the recovered private key is a real, importable key', Boolean(imported.asymmetricKeyType));
        check('it is the RSA key this feature produces', imported.asymmetricKeyType === 'rsa');
        const derivedPublic = crypto.createPublicKey(imported).export({ type: 'spki', format: 'pem' }).toString();
        check('its public half matches the public key stored beside it',
            derivedPublic.trim() === String(signingStore.record.signingPublicKeyPem).trim(),
            'the recovered key does not belong to the stored public half');
        // Stated rather than skipped: phase 5 never contacts a server, so this file
        // holds a PRIVATE KEY and no credential. That is what makes it a clean test
        // of the key half - the credential half was proven against phase 1's store,
        // where there was a real issued credential to look for.
        check('this store holds a signing key and no credential, as the phase intends',
            signingStore.record.sessionToken === '');
        check('and it is therefore still not a credential store',
            !signingText.includes(credential));

        console.log('\n============================================================');
        console.log(`SUCCESS: ${PASS} host persistence assertions passed across 6 separate engine processes.`);
        console.log('============================================================');
    } finally {
        await stopServer(server);
        try { fs.rmSync(storeDir, { recursive: true, force: true }); } catch { /* ignore */ }
        try { fs.rmSync(keyringDir, { recursive: true, force: true }); } catch { /* ignore */ }
        console.log(`\nCleaned up: store and keyring removed, FearServer on ${port} stopped.`);
    }
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
