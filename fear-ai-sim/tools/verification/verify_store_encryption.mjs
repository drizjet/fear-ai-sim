#!/usr/bin/env node

/**
 * tools/verification/verify_store_encryption.mjs
 *
 * THE PERSISTED CREDENTIAL AND SIGNING KEY, UNREADABLE AT REST — and the round
 * trip that has to keep working anyway.
 *
 * THE PROBLEM, STATED PLAINLY
 * A host that turns on persistence writes its `session_token` and, once request
 * signing is on, its PRIVATE KEY. Until this format existed it wrote them as
 * plaintext JSON, in the game's save tree, which is inside every backup, every
 * synced folder, every support bundle and every crash dump. A private key in the
 * clear does not merely risk the crowd — it makes the `required` signing policy
 * pointless against the party most likely to have the file.
 *
 * WHAT HAS TO BE TRUE FOR THIS TO BE WORTH ANYTHING
 *   1. The store must not contain the credential or the key in a form anyone can
 *      read. Asserted by searching the raw file, not by asking the writer.
 *   2. The store must still be enough on its own to continue the session — but
 *      ONLY together with a keyring kept somewhere else. Asserted by decrypting
 *      it and by the separate cross-process restart probe.
 *   3. The format must be the SAME in every runtime that writes it, or a host
 *      becomes unreadable to its own tooling. Asserted by making the Node
 *      reference and the real Godot 4.6 engine produce BIT-IDENTICAL output for
 *      the same pinned inputs, and by having each decrypt the other's file.
 *
 * WHY BIT-IDENTICAL AND NOT "BOTH PARSE"
 * A format only has to be self-consistent to pass a round trip inside one
 * language. Cross-language tolerance hides the bugs that matter: Node pads
 * automatically and Godot does not (a 32-byte plaintext became 32 bytes on one
 * side and 48 on the other, and Godot's AESContext returns ZERO BYTES for a
 * non-block-multiple rather than erroring). Requiring identical bytes means
 * neither side is allowed to be lenient on read.
 *
 * THREE WRITERS, ONE FORMAT, CHECKED AGAINST EACH OTHER
 * The container is implemented in Node, GDScript and C#. Each cross-check is
 * SKIPPED (not PASSED) when the runtime it needs is absent, so no record can claim
 * coverage that did not happen. The Node half always runs, because it is the
 * reference the other two are measured against.
 *
 * THE C# HALF RUNS WITHOUT THE UNITY EDITOR, which is why the container was kept
 * free of any UnityEngine dependency: a container that could only be exercised
 * inside an engine is a container nobody on this machine could check. It is
 * compiled and executed as an ordinary console program and byte-compared exactly
 * like the engine is.
 *
 * Hard Rule 9 note: standalone deterministic probe; not an automated test runner.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
    STORE_FAILURES,
    STORE_KDF_ITERATIONS,
    decryptStore,
    defaultKeyringPath,
    encryptStore,
    loadOrCreateKeyring,
    readStoreName
} from '../../packages/runtime/src/EncryptedStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const GODOT_PROJECT = path.join(REPO, 'tests', 'godot_project');
const SCENARIO = 'run_store_encryption.gd';

const GODOT_CANDIDATES = [
    process.env.FEAR_AI_GODOT,
    'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64_console.exe',
    'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64.exe'
];

/**
 * The vector, pinned on both sides. `iter` is written into the file, so the
 * count is a property of the artifact rather than an assumption either reader
 * makes — which is the whole reason a writer may choose its own cost.
 */
const VECTOR_PASSWORD = 'fear-ai-interop-password';
const VECTOR_ITERATIONS = 1000;
const VECTOR_NAME = 'interop_host';
const VECTOR_TOKEN = 'a'.repeat(64);
const VECTOR_PRIVATE_KEY = 'FAKE-PRIVATE-KEY-MATERIAL';
const VECTOR_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----';
const VECTOR_SAVED_AT = 1758400000;

let PASS = 0;
function check(label, condition, detail = '') {
    if (!condition) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    PASS++;
    console.log(`  * ${label}: PASS`);
}

/** The C# half of the container, compiled and run as a plain console program. */
const CONTAINER_SOURCE = path.join(REPO, 'packages', 'adapters', 'unity', 'Runtime', 'FearEncryptedStore.cs');

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>disable</Nullable>
    <LangVersion>latest</LangVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <AssemblyName>FearStoreInterop</AssemblyName>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="FearEncryptedStore.cs" />
    <Compile Include="Program.cs" />
  </ItemGroup>
</Project>
`;

/**
 * The C# side of the interop vector.
 *
 * It does the same two things the engine does - decrypt the container the Node
 * reference wrote, and write one from the pinned salt and IV - and prints the
 * recovered fields so the probe can compare them, rather than deciding for itself
 * whether it passed.
 */
const PROGRAM = `using System;
using System.IO;
using System.Text;
using FearAI;

internal static class Program
{
    private const string Name = "interop_host";
    private const string Token = "${'a'.repeat(64)}";
    private const string PrivateKey = "FAKE-PRIVATE-KEY-MATERIAL";
    private const string PublicKey = "-----BEGIN PUBLIC KEY-----";
    private const long SavedAt = ${VECTOR_SAVED_AT};
    private const int Iterations = ${VECTOR_ITERATIONS};

    private static int Main(string[] args)
    {
        string nodeStore = "", emit = "", password = "";
        foreach (var arg in args)
        {
            if (arg.StartsWith("--node-store=")) nodeStore = arg.Substring(13);
            else if (arg.StartsWith("--emit=")) emit = arg.Substring(7);
            else if (arg.StartsWith("--password=")) password = arg.Substring(11);
        }
        var passwordBytes = Encoding.UTF8.GetBytes(password);
        var salt = new byte[16];
        var iv = new byte[16];
        for (int i = 0; i < 16; i++)
        {
            salt[i] = (byte)i;
            iv[i] = (byte)i;
        }

        var incoming = FearStoreCryptography.Decrypt(File.ReadAllText(nodeStore), passwordBytes);
        Console.WriteLine("CSHARP_DECRYPT_OK=" + (incoming.Ok ? "true" : "false"));
        Console.WriteLine("CSHARP_DECRYPT_REASON=" + incoming.Reason);
        if (incoming.Ok)
        {
            Console.WriteLine("CSHARP_NAME=" + incoming.Record.SessionId);
            Console.WriteLine("CSHARP_TOKEN=" + incoming.Record.SessionToken);
            Console.WriteLine("CSHARP_KEY=" + incoming.Record.SigningKeyText);
        }

        var record = new FearStoreRecord
        {
            SessionId = Name,
            SessionToken = Token,
            SigningKeyText = PrivateKey,
            SigningPublicKeyPem = PublicKey,
            SavedAtUnix = SavedAt
        };
        var built = FearStoreCryptography.Encrypt(Name, record, passwordBytes, Iterations, salt, iv);
        if (!built.Ok)
        {
            Console.WriteLine("CSHARP_BUILD_FAILED=" + built.Reason);
            Console.WriteLine("CSHARP_STORE=FAILED");
            return 1;
        }
        File.WriteAllText(emit, built.Text);
        Console.WriteLine("CSHARP_STORE=PASSED");
        return 0;
    }
}
`;

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

function runCsharpInterop({ nodeStorePath, password }) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fearai-csharp-store-'));
    try {
        fs.copyFileSync(CONTAINER_SOURCE, path.join(scratch, 'FearEncryptedStore.cs'));
        fs.writeFileSync(path.join(scratch, 'Probe.csproj'), CSPROJ);
        fs.writeFileSync(path.join(scratch, 'Program.cs'), PROGRAM);
        const emitPath = path.join(scratch, 'csharp_store').replace(/\\/g, '/');

        const run = spawnSync('dotnet', ['run', '-v', 'q', '--nologo', '--',
            `--node-store=${nodeStorePath}`, `--emit=${emitPath}`, `--password=${password}`], {
            cwd: scratch,
            encoding: 'utf8',
            timeout: 300_000,
            maxBuffer: 32 * 1024 * 1024
        });
        const output = `${run.stdout || ''}${run.stderr || ''}`;
        if (!/CSHARP_STORE=PASSED/.test(output)) {
            throw new Error(`the C# interop program did not pass (exit=${run.status}):\n${output.slice(-2000)}`);
        }
        const field = (name) => {
            const match = output.match(new RegExp(`^CSHARP_${name}=(.*)$`, 'm'));
            return match ? match[1].trim() : '';
        };
        return {
            decryptOk: field('DECRYPT_OK') === 'true',
            decryptReason: field('DECRYPT_REASON'),
            name: field('NAME'),
            token: field('TOKEN'),
            key: field('KEY'),
            emitted: fs.existsSync(emitPath) ? fs.readFileSync(emitPath, 'utf8') : null
        };
    } finally {
        try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

function vectorRecord() {
    return {
        sessionToken: VECTOR_TOKEN,
        signingPrivateKeyText: VECTOR_PRIVATE_KEY,
        signingPublicKeyPem: VECTOR_PUBLIC_KEY,
        savedAtUnix: VECTOR_SAVED_AT
    };
}

function buildVector({ salt, iv, password = VECTOR_PASSWORD, iterations = VECTOR_ITERATIONS } = {}) {
    const built = encryptStore({
        name: VECTOR_NAME,
        record: vectorRecord(),
        password,
        iterations,
        salt,
        iv
    });
    if (!built.ok) throw new Error(`the reference refused to build the vector: ${built.reason}`);
    return built.text;
}

function main() {
    console.log('============================================================');
    console.log('VERIFY ENCRYPTED SESSION STORE (Node reference + Godot 4.6)');
    console.log('============================================================');

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fear_ai_store_'));
    // Forward slashes so the path survives being passed to Godot as an argument.
    const nodeStorePath = path.join(workDir, 'node_store').replace(/\\/g, '/');
    const emitPath = path.join(workDir, 'godot_store').replace(/\\/g, '/');
    const salt = Buffer.from([...Array(16).keys()]);
    const iv = Buffer.from([...Array(16).keys()]);

    try {
        // ------------------------------------------------------------------
        // 1. The reference half. Runs always: this is the authority.
        // ------------------------------------------------------------------
        console.log('\n--- 1. the format itself, produced by the Node reference ---');
        const referenceText = buildVector({ salt, iv });
        fs.writeFileSync(nodeStorePath, referenceText, 'utf8');

        check('the container declares its version on the first line',
            referenceText.startsWith('FEAR-AI-STORE-V1\n'));
        check('the declared iteration count is the one actually used',
            referenceText.includes(`\niter=${VECTOR_ITERATIONS}\n`));
        check('the declared kdf and cipher are the ones implemented',
            referenceText.includes(`\nkdf=pbkdf2-hmac-sha256\n`) && referenceText.includes(`\ncipher=aes-256-cbc\n`));

        // THE at-rest assertion, made against the BYTES rather than the writer's
        // opinion of them. This is the claim the whole change rests on.
        check('THE STORE DOES NOT CONTAIN THE CREDENTIAL', !referenceText.includes(VECTOR_TOKEN));
        check('THE STORE DOES NOT CONTAIN THE PRIVATE KEY', !referenceText.includes(VECTOR_PRIVATE_KEY));
        check('the session NAME is readable without the key, deliberately',
            referenceText.includes(`\nname=${VECTOR_NAME}\n`));
        check('the name is readable through the supported accessor too',
            readStoreName(nodeStorePath) === VECTOR_NAME);

        // Padding is applied by the format, not by the library, so this vector has
        // to actually need padding or trap 1 would go untested.
        const plaintextLength = Buffer.byteLength(JSON.stringify({
            v: 1,
            session_id: VECTOR_NAME,
            session_token: VECTOR_TOKEN,
            signing_private_key: VECTOR_PRIVATE_KEY,
            signing_public_key: VECTOR_PUBLIC_KEY,
            saved_at_unix: VECTOR_SAVED_AT
        }), 'utf8');
        check('the vector is NOT a whole number of cipher blocks, so padding is exercised',
            plaintextLength % 16 !== 0, `${plaintextLength} bytes`);
        const ciphertextBytes = Buffer.from(referenceText.split('\nct=')[1].split('\n')[0], 'base64');
        check('the ciphertext grew to the next block boundary, and no further',
            ciphertextBytes.length === plaintextLength + (16 - (plaintextLength % 16)),
            `${ciphertextBytes.length} vs plaintext ${plaintextLength}`);

        const reopened = decryptStore(referenceText, { password: VECTOR_PASSWORD });
        check('the reference reopens its own container', reopened.ok, reopened.reason);
        check('every field survives the round trip',
            reopened.record.sessionToken === VECTOR_TOKEN
            && reopened.record.signingPrivateKeyText === VECTOR_PRIVATE_KEY
            && reopened.record.signingPublicKeyPem === VECTOR_PUBLIC_KEY
            && reopened.record.savedAtUnix === VECTOR_SAVED_AT
            && reopened.record.sessionId === VECTOR_NAME);

        // The default path a host actually takes: no pinned salt, no pinned IV, and
        // the shipped iteration count. `iter` rides in the file, so a reader obeys
        // whatever the writer chose rather than assuming a shared constant.
        const defaultEffort = encryptStore({ name: VECTOR_NAME, record: vectorRecord(), password: VECTOR_PASSWORD });
        check('the default writer records its own iteration count in the file',
            defaultEffort.ok && defaultEffort.text.includes(`\niter=${STORE_KDF_ITERATIONS}\n`));
        check('a container built with the default cost still opens',
            decryptStore(defaultEffort.text, { password: VECTOR_PASSWORD }).ok);
        check('a random salt is used when none is pinned, so two writes differ',
            defaultEffort.text !== buildVector({}));
        check('but both still open under the same passphrase',
            decryptStore(buildVector({}), { password: VECTOR_PASSWORD }).ok);

        console.log('\n--- 2. the refusal surface ---');
        const wrongPassword = decryptStore(referenceText, { password: 'not-the-passphrase' });
        check('a wrong passphrase is refused as TAMPERED, the same answer as an edit',
            !wrongPassword.ok && wrongPassword.reason === STORE_FAILURES.TAMPERED, wrongPassword.reason);
        const editedName = decryptStore(referenceText.replace(`name=${VECTOR_NAME}`, 'name=someone_else'),
            { password: VECTOR_PASSWORD });
        check('editing the plaintext NAME is refused by the MAC',
            editedName.reason === STORE_FAILURES.TAMPERED);
        const ctAt = referenceText.indexOf('\nct=') + 4;
        const flipped = referenceText.slice(0, ctAt)
            + (referenceText[ctAt] === 'A' ? 'B' : 'A')
            + referenceText.slice(ctAt + 1);
        check('one flipped ciphertext character is refused by the MAC',
            decryptStore(flipped, { password: VECTOR_PASSWORD }).reason === STORE_FAILURES.TAMPERED);
        check('a truncated container is refused',
            !decryptStore(referenceText.slice(0, 100), { password: VECTOR_PASSWORD }).ok);
        check('an empty file is refused', !decryptStore('', { password: VECTOR_PASSWORD }).ok);
        check('a foreign version line is refused as unsupported, not as a bad key',
            decryptStore(referenceText.replace('FEAR-AI-STORE-V1', 'FEAR-AI-STORE-V2'),
                { password: VECTOR_PASSWORD }).reason === STORE_FAILURES.UNSUPPORTED_VERSION);
        check('a downgraded cipher is refused rather than attempted',
            decryptStore(referenceText.replace('cipher=aes-256-cbc', 'cipher=aes-128-ecb'),
                { password: VECTOR_PASSWORD }).reason === STORE_FAILURES.UNSUPPORTED_CIPHER);
        check('a name that would corrupt the line format is refused',
            !encryptStore({ name: 'bad\nname', record: vectorRecord(), password: VECTOR_PASSWORD }).ok);

        // ------------------------------------------------------------------
        // 3. The keyring, which must be a DIFFERENT file in a DIFFERENT tree.
        // ------------------------------------------------------------------
        console.log('\n--- 3. the keyring is separate from the store ---');
        const keyringPath = path.join(workDir, 'keyring');
        const created = loadOrCreateKeyring({ keyringPath });
        check('a keyring is created on demand', created.ok && created.created === true, created.reason);
        check('it holds a 256-bit key', created.key.length === 32);
        const reloaded = loadOrCreateKeyring({ keyringPath });
        check('the NEXT load returns the SAME key rather than a fresh one',
            reloaded.ok && reloaded.created === false && reloaded.key.equals(created.key));
        check('the keyring is not the store: it holds no credential',
            !fs.readFileSync(keyringPath, 'utf8').includes(VECTOR_TOKEN));
        // This is the RELOCATION claim, and it is the one that actually matters:
        // the common leak is a folder that gets copied somewhere it should not be,
        // not an attacker with a shell. A copy of the save tree must therefore be
        // inert, and that is only true if the key is somewhere else.
        const elsewhere = path.join(workDir, 'other_tree');
        fs.mkdirSync(elsewhere, { recursive: true });
        const stranger = loadOrCreateKeyring({ keyringPath: path.join(elsewhere, 'keyring') });
        const keyed = encryptStore({
            name: VECTOR_NAME,
            record: vectorRecord(),
            password: created.key,
            salt,
            iv
        });
        check('a container keyed from a keyring opens with THAT keyring',
            decryptStore(keyed.text, { password: created.key }).ok);
        check('A COPY OF THE STORE WITHOUT ITS KEYRING IS INERT',
            !decryptStore(keyed.text, { password: stranger.key }).ok);
        // The default location is the rule that makes relocation work in practice,
        // so it is asserted rather than assumed: a keyring that defaults into the
        // store's own directory would be carried by the same backup.
        process.env.FEAR_AI_KEYRING = path.join(workDir, 'pinned_keyring');
        check('FEAR_AI_KEYRING pins the keyring, which is how a host points at its own secret store',
            defaultKeyringPath() === process.env.FEAR_AI_KEYRING);
        delete process.env.FEAR_AI_KEYRING;
        const platformDefault = defaultKeyringPath();
        check('the default keyring path is a user CONFIGURATION path, not the store',
            !platformDefault.startsWith(workDir) && platformDefault !== 'keyring',
            platformDefault);

        // ------------------------------------------------------------------
        // 4. Interop with the real engine. SKIPPED, honestly, without one.
        // ------------------------------------------------------------------
        console.log('\n--- 4. interop with the real Godot engine ---');
        const godotExe = findGodot();
        if (!godotExe) {
            console.log('SKIPPED: no Godot binary found, so NO in-engine evidence was captured.');
            console.log('Set FEAR_AI_GODOT to the executable to run this half.');
        } else {
        console.log(`Godot:  ${godotExe}`);

        const args = [
            '--path', '.', '--headless', '--script', SCENARIO, '--',
            `--node-store=${nodeStorePath}`,
            `--emit=${emitPath}`,
            `--password=${VECTOR_PASSWORD}`
        ];
        const res = spawnSync(godotExe, args, {
            cwd: GODOT_PROJECT,
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            timeout: 240_000
        });
        const output = `${res.stdout || ''}${res.stderr || ''}`;
        const logPath = path.join(os.tmpdir(), 'godot_store_encryption.log');
        fs.writeFileSync(logPath, output);
        if (!/STORE_ENCRYPTION=PASSED/.test(output)) {
            const failures = output.split(/\r?\n/).filter((l) => /\[FAIL\]/.test(l)).join('\n');
            throw new Error(`the in-engine run did not pass (exit=${res.status}). Log: ${logPath}\n${failures}`);
        }
        PASS++;
        const engineAssertions = (output.match(/\[PASS\]/g) || []).length;
        console.log(`  * the engine run passed in its own process (exit 0, ${engineAssertions} in-engine assertions): PASS`);

        check('the engine wrote the container it was asked for', fs.existsSync(emitPath));
        const engineText = fs.readFileSync(emitPath, 'utf8');

        // THE interop assertion. Same inputs, two languages, identical bytes.
        check('GODOT AND NODE PRODUCE BIT-IDENTICAL CONTAINERS FOR THE SAME INPUTS',
            engineText === referenceText,
            engineText === referenceText
                ? ''
                : `first difference at byte ${[...engineText].findIndex((c, i) => c !== referenceText[i])}`);

        const engineStoreReadByNode = decryptStore(engineText, { password: VECTOR_PASSWORD });
        check('the reference decrypts the ENGINE-written container', engineStoreReadByNode.ok,
            engineStoreReadByNode.reason);
        check('and recovers the same credential and private key',
            engineStoreReadByNode.record.sessionToken === VECTOR_TOKEN
            && engineStoreReadByNode.record.signingPrivateKeyText === VECTOR_PRIVATE_KEY);
        check('the ENGINE-written container leaks neither secret either',
            !engineText.includes(VECTOR_TOKEN) && !engineText.includes(VECTOR_PRIVATE_KEY));

        // The engine's keyring: same rules, checked from the outside.
        const engineKeyring = path.join(workDir, 'godot_store.keyring');
        check('the engine created a keyring for its container', fs.existsSync(engineKeyring));
        check('the engine keyring is a different file from the container',
            !fs.readFileSync(engineKeyring, 'utf8').includes(VECTOR_TOKEN));
        check('the engine keyring carries the expected version line',
            fs.readFileSync(engineKeyring, 'utf8').startsWith('FEAR-AI-KEYRING-V1\n'));
        }

        // ------------------------------------------------------------------
        // 5. The C# container, compiled and RUN outside the Unity Editor.
        // ------------------------------------------------------------------
        console.log('\n--- 5. interop with the C# container (no Editor required) ---');
        const dotnet = spawnSync('dotnet', ['--version'], { encoding: 'utf8' });
        if (dotnet.error || dotnet.status !== 0) {
            console.log('SKIPPED: dotnet is not on PATH, so the C# half was NOT exercised.');
        } else {
            console.log(`dotnet: ${String(dotnet.stdout).trim()}`);
            const csharp = runCsharpInterop({ nodeStorePath, password: VECTOR_PASSWORD });
            check('the C# program decrypted the Node-written container', csharp.decryptOk,
                csharp.decryptReason || 'the container would not open');
            check('and recovered the same name, credential and private key',
                csharp.name === VECTOR_NAME && csharp.token === VECTOR_TOKEN
                && csharp.key === VECTOR_PRIVATE_KEY,
                `${csharp.name} / ${String(csharp.token).length} chars / ${String(csharp.key).length} chars`);

            check('the C# container was written', csharp.emitted !== null);
            check('C# AND NODE PRODUCE BIT-IDENTICAL CONTAINERS FOR THE SAME INPUTS',
                csharp.emitted === referenceText,
                csharp.emitted === referenceText
                    ? ''
                    : `first difference at byte ${[...(csharp.emitted || '')]
                        .findIndex((c, i) => c !== referenceText[i])}`);
            check('the C#-written container leaks neither secret',
                !String(csharp.emitted).includes(VECTOR_TOKEN)
                && !String(csharp.emitted).includes(VECTOR_PRIVATE_KEY));
            const csharpReadByNode = decryptStore(String(csharp.emitted), { password: VECTOR_PASSWORD });
            check('the reference decrypts the C#-written container', csharpReadByNode.ok, csharpReadByNode.reason);
        }

        console.log('\n============================================================');
        console.log(`SUCCESS: ${PASS} encrypted-store assertions passed.`);
        console.log('============================================================');
    } finally {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
        console.log('\nCleaned up:', workDir);
    }
}

main();
