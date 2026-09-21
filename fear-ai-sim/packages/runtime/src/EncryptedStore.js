/**
 * EncryptedStore — the persisted session credential, unreadable at rest.
 *
 * WHAT WAS WRONG BEFORE THIS EXISTED
 * A host that opted into persistence wrote its `session_token` and, once request
 * signing landed, its **private key** into a plaintext JSON file. That file is a
 * complete, copyable identity: `cat` it, or drop it in a support bundle, a synced
 * folder, a backup, or a repository, and whoever reads it can act as that host.
 * The token was already guarded on the SERVER side (hashed at rest, compared in
 * constant time, insufficient under `required` without the key) — but the key
 * itself sat in the clear on disk, which made the stronger of the two protections
 * pointless.
 *
 * WHAT THIS ACTUALLY BUYS, STATED WITHOUT EMBELLISHMENT
 * It defeats three things, all of them real and none of them "security":
 *
 *   1. RELOCATION. The store alone is useless on another machine, in a backup, or
 *      in a repository, because the key material is not in the file and is not in
 *      the same directory tree. This is the common leak path — not an attacker
 *      with a shell, but a folder that gets copied somewhere it should not.
 *   2. CASUAL INSPECTION. `grep -r 'token'` over a support bundle finds nothing.
 *   3. TAMPERING BY EDITING. The envelope is authenticated, so a hand-edited store
 *      is refused rather than half-honoured.
 *
 * It does NOT defend against someone who can read BOTH the store and the keyring
 * on the same machine. That person can decrypt it. There is no hardware backing,
 * no OS keystore integration, and the keyring's permissions are best-effort. Any
 * claim stronger than "the file does not travel" would be false, and the docs say
 * exactly this.
 *
 * WHY THE KEYRING IS A SEPARATE FILE IN A SEPARATE TREE
 * A host must decrypt its own store with no involvement from the game code — that
 * is the requirement, and it makes the key readable by any process running as the
 * same user. Given that, the only meaningful design choice left is WHERE the key
 * lives, and the answer is "not inside the thing that gets backed up". So the
 * keyring sits in the user-scoped configuration directory while the store sits
 * wherever the host wants it (Godot's `user://`, a Unity save slot, a project
 * folder). A backup of the save folder therefore does not carry the key.
 *
 * THE FORMAT IS THE POINT, AND IT IS BYTE-EXACT
 * Four runtimes implement this (Node, Godot, Python, .NET), so a mismatch of one
 * character produces a refusal that looks exactly like a wrong key. The layout is
 * therefore line-based with LF endings and no optional whitespace, in the same
 * style as `FEAR-AI-SIGN-V1`, and the interop probe decrypts a vector produced by
 * this file in every other runtime.
 *
 *   FEAR-AI-STORE-V1
 *   kdf=pbkdf2-hmac-sha256
 *   iter=<integer>
 *   salt=<base64, 16 bytes>
 *   cipher=aes-256-cbc
 *   iv=<base64, 16 bytes>
 *   name=<the session NAME, deliberately in the clear - see below>
 *   ct=<base64>
 *   mac=<base64, 32 bytes>
 *
 * The MAC covers every byte from the start of the file through the newline that
 * ends the `ct=` line — encrypt-then-MAC over the exact text, so there is no
 * canonicalisation step to disagree about. It is compared in constant time.
 *
 * `name` IS DELIBERATELY PLAINTEXT, and that is a considered decision rather than
 * an oversight. The whole ownership model rests on a name NOT being a credential:
 * `session_id` is host-chosen and guessable, and it is the `session_token` that
 * proves continuity. Keeping the name readable costs nothing real, and it buys an
 * operator the ability to see WHICH host a stray store belongs to without a key —
 * which is the first question anyone asks. The probe asserts both halves: the name
 * is present in the clear, and the credential and key are not.
 *
 * THREE INTEROP TRAPS, ALL FOUND BY RUNNING IT RATHER THAN READING IT
 *   1. PADDING IS THE CALLER'S JOB. Node's `createCipheriv` applies PKCS#7 padding
 *      automatically; Godot's `AESContext` does not, and worse, it returns ZERO
 *      BYTES for input that is not a multiple of the block size instead of
 *      erroring. A 32-byte plaintext therefore produced 32 bytes on one side and
 *      48 on the other. So padding is written explicitly here and Node's automatic
 *      padding is DISABLED (`setAutoPadding(false)`), which keeps one source of
 *      truth for the bytes on the wire.
 *   2. The MAC must cover the ciphertext as SENT, not as re-serialised. Both sides
 *      must hash the exact file text, so this module takes the text it is about to
 *      write rather than rebuilding it from fields.
 *   3. THE ENCRYPTED PAYLOAD IS JSON, AND JSON KEY ORDER IS NOT PORTABLE. Godot's
 *      `JSON.stringify` SORTS object keys by default (`sort_keys = true`); Node
 *      emits them in insertion order. The keys, the values and the length were all
 *      correct, and the ciphertext still differed from the second base64 character
 *      on — which presents as "the other runtime is writing a different key" and is
 *      nothing of the sort. Neither language's default is wrong; relying on either
 *      is. So the plaintext is CANONICALISED here (keys sorted, recursively) and
 *      the Godot side requests the same explicitly, which makes the layout a
 *      property of the format instead of a property of a caller's dictionary.
 *      Note that this changes only bytes INSIDE the ciphertext: a reader parses
 *      JSON and does not care about order, so containers written before this are
 *      still read correctly.
 */

import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Bump only with a deliberate, documented change to the container layout. */
export const STORE_VERSION = 'FEAR-AI-STORE-V1';

/** Bump only with a deliberate change to the keyring layout. */
export const KEYRING_VERSION = 'FEAR-AI-KEYRING-V1';

export const STORE_KDF = 'pbkdf2-hmac-sha256';
export const STORE_CIPHER = 'aes-256-cbc';

/**
 * Iteration count for the KDF.
 *
 * The default password is 256 bits of random from the keyring, so this count is
 * not load-bearing for that case — a brute force over a 256-bit key does not care
 * about 60,000 iterations. It exists because the SAME code path accepts a
 * host-supplied passphrase, and a human-chosen one is where the count matters.
 * It is deliberately modest because GDScript runs the PBKDF2 loop itself and
 * the measured cost is part of the evidence rather than a guess.
 */
export const STORE_KDF_ITERATIONS = 60000;

export const SALT_BYTES = 16;
export const IV_BYTES = 16;
export const KEYRING_KEY_BYTES = 32;
export const MAC_BYTES = 32;

/** Stable reasons a store can fail to load. A host reports WHY, not just "no". */
export const STORE_FAILURES = Object.freeze({
    MISSING: 'STORE_MISSING',
    UNREADABLE: 'STORE_UNREADABLE',
    MALFORMED: 'STORE_MALFORMED',
    UNSUPPORTED_VERSION: 'STORE_UNSUPPORTED_VERSION',
    UNSUPPORTED_KDF: 'STORE_UNSUPPORTED_KDF',
    UNSUPPORTED_CIPHER: 'STORE_UNSUPPORTED_CIPHER',
    TAMPERED: 'STORE_TAMPERED',
    WRONG_KEY: 'STORE_WRONG_KEY',
    KEYRING_MISSING: 'KEYRING_MISSING',
    KEYRING_MALFORMED: 'KEYRING_MALFORMED',
    NAME_NOT_ENCODABLE: 'STORE_NAME_NOT_ENCODABLE'
});

const MAC_SEPARATOR = '\n';

// ---------------------------------------------------------------------------
// Small shared helpers.
// ---------------------------------------------------------------------------

/** Standard base64, no line breaks. The only encoding this format uses. */
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const unb64 = (text) => Buffer.from(String(text), 'base64');

/** Length-independent comparison, so a MAC cannot be probed byte by byte. */
function constantTimeEquals(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

/**
 * Canonical JSON for the encrypted payload: object keys sorted, recursively.
 *
 * See trap 3 in the header. Sorting is chosen over "both sides insert in the same
 * order" because insertion order is a property of a caller's dictionary, not of
 * the format: it holds in Node, Godot and Python today, and it is the kind of
 * thing that quietly stops holding in one of them later. Sorting is a rule the
 * format can state and a runtime can be checked against.
 */
export function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
}

/**
 * PKCS#7 padding, written out rather than relied on.
 *
 * Always pads, even when the plaintext is already a block multiple: a full block
 * of 0x10 is unambiguous on removal, whereas "pad nothing when it fits" makes the
 * last block's trailing bytes indistinguishable from padding.
 */
export function pkcs7Pad(bytes, blockSize = 16) {
    const buffer = Buffer.from(bytes);
    const remainder = buffer.length % blockSize;
    const padLength = blockSize - remainder;
    return Buffer.concat([buffer, Buffer.alloc(padLength, padLength)]);
}

/** Remove PKCS#7 padding, or null when it is not well formed. */
export function pkcs7Unpad(bytes, blockSize = 16) {
    const buffer = Buffer.from(bytes);
    if (buffer.length === 0 || buffer.length % blockSize !== 0) return null;
    const padLength = buffer[buffer.length - 1];
    if (padLength < 1 || padLength > blockSize) return null;
    for (let i = buffer.length - padLength; i < buffer.length; i++) {
        if (buffer[i] !== padLength) return null;
    }
    return buffer.subarray(0, buffer.length - padLength);
}

/**
 * Key separation: PBKDF2 produces one master key, and the AES and MAC keys are
 * distinct HMACs of it.
 *
 * This is why the derivation is not "ask PBKDF2 for 64 bytes": the block
 * function of a two-block PBKDF2 output is fiddly to reproduce by hand in
 * GDScript, and a hand-rolled block function is exactly where a cross-language
 * mismatch would hide. Two labelled HMACs are trivially reproducible anywhere.
 */
export function deriveStoreKeys({ password, salt, iterations = STORE_KDF_ITERATIONS }) {
    const master = pbkdf2Sync(
        Buffer.from(password),
        Buffer.from(salt),
        iterations,
        32,
        'sha256'
    );
    return {
        master,
        aesKey: createHmac('sha256', master).update('fear-ai-store/aes').digest(),
        macKey: createHmac('sha256', master).update('fear-ai-store/mac').digest()
    };
}

/**
 * Encrypt a record into the store text.
 *
 * @param {object} args
 * @param {string} args.name the session NAME; written in the clear (see the header)
 * @param {string} args.password the keyring secret, or a host-supplied passphrase
 * @param {object} args.record everything that must stay secret
 * @returns {{ok: boolean, text?: string, reason?: string}}
 */
export function encryptStore({ name, record, password, iterations = STORE_KDF_ITERATIONS, salt, iv }) {
    const sessionName = name == null ? '' : String(name);
    // A newline or a control character in the name would corrupt a line-based
    // format, and the failure would surface as "the store will not load" with no
    // hint why. Refused at the only point where it can still be explained.
    if (/[\r\n]/.test(sessionName)) {
        return { ok: false, reason: STORE_FAILURES.NAME_NOT_ENCODABLE };
    }
    const actualSalt = salt || randomBytes(SALT_BYTES);
    const actualIv = iv || randomBytes(IV_BYTES);
    const { aesKey, macKey } = deriveStoreKeys({ password, salt: actualSalt, iterations });

    const plaintext = Buffer.from(canonicalJson({
        v: 1,
        session_id: sessionName,
        session_token: record.sessionToken ?? '',
        signing_private_key: record.signingPrivateKeyText ?? '',
        signing_public_key: record.signingPublicKeyPem ?? '',
        saved_at_unix: record.savedAtUnix ?? Math.floor(Date.now() / 1000)
    }), 'utf8');

    const cipher = createCipheriv('aes-256-cbc', aesKey, actualIv);
    // See trap 1 in the header: the padding is applied here, by hand, because
    // Godot does not pad and reading a 32-byte plaintext as a 48-byte one is not
    // a diagnosable error at the other end.
    cipher.setAutoPadding(false);
    const ciphertext = Buffer.concat([cipher.update(pkcs7Pad(plaintext)), cipher.final()]);

    const header = [
        STORE_VERSION,
        `kdf=${STORE_KDF}`,
        `iter=${iterations}`,
        `salt=${b64(actualSalt)}`,
        `cipher=${STORE_CIPHER}`,
        `iv=${b64(actualIv)}`,
        `name=${sessionName}`,
        `ct=${b64(ciphertext)}`
    ].join(MAC_SEPARATOR) + MAC_SEPARATOR;

    const mac = createHmac('sha256', macKey).update(Buffer.from(header, 'utf8')).digest();
    return { ok: true, text: `${header}mac=${b64(mac)}${MAC_SEPARATOR}` };
}

/**
 * Verify and decrypt store text.
 *
 * The MAC is checked BEFORE anything is decrypted, and the MAC covers the exact
 * text, so an edited field is refused as `TAMPERED` rather than producing
 * plausible garbage or a padding error that reads like a wrong key.
 *
 * @returns {{ok: boolean, record?: object, reason?: string}}
 */
export function decryptStore(text, { password }) {
    if (typeof text !== 'string' || text.length === 0) {
        return { ok: false, reason: STORE_FAILURES.MALFORMED };
    }
    const fields = new Map();
    const lines = text.split('\n');
    let macLineAt = -1;
    let macInputEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 0) {
            if (line !== STORE_VERSION) {
                return { ok: false, reason: STORE_FAILURES.UNSUPPORTED_VERSION };
            }
            // Byte offset of the end of this line, including its LF, so the MAC
            // input is the file text rather than a rebuild of it.
            macInputEnd = Buffer.byteLength(line + '\n', 'utf8');
            continue;
        }
        if (line === '') continue;
        const equals = line.indexOf('=');
        if (equals <= 0) continue;
        fields.set(line.slice(0, equals), line.slice(equals + 1));
        if (line.startsWith('mac=')) {
            macLineAt = i;
            break;
        }
        macInputEnd += Buffer.byteLength(line + '\n', 'utf8');
    }

    if (macLineAt < 0 || macInputEnd < 0) return { ok: false, reason: STORE_FAILURES.MALFORMED };
    if (fields.get('kdf') !== STORE_KDF) return { ok: false, reason: STORE_FAILURES.UNSUPPORTED_KDF };
    if (fields.get('cipher') !== STORE_CIPHER) return { ok: false, reason: STORE_FAILURES.UNSUPPORTED_CIPHER };
    const iterations = Number(fields.get('iter'));
    if (!Number.isFinite(iterations) || iterations < 1) return { ok: false, reason: STORE_FAILURES.MALFORMED };

    const salt = unb64(fields.get('salt') || '');
    const iv = unb64(fields.get('iv') || '');
    const ciphertext = unb64(fields.get('ct') || '');
    const presentedMac = unb64(fields.get('mac') || '');
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || presentedMac.length !== MAC_BYTES) {
        return { ok: false, reason: STORE_FAILURES.MALFORMED };
    }
    if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
        return { ok: false, reason: STORE_FAILURES.MALFORMED };
    }

    const { aesKey, macKey } = deriveStoreKeys({ password, salt, iterations });
    const macInput = Buffer.from(text.slice(0, macInputEnd), 'utf8');
    const expectedMac = createHmac('sha256', macKey).update(macInput).digest();
    if (!constantTimeEquals(expectedMac, presentedMac)) {
        // Deliberately ONE reason for "wrong key" and "edited file": telling them
        // apart would confirm which of the two a caller has, and the MAC is what
        // makes them indistinguishable in the first place.
        return { ok: false, reason: STORE_FAILURES.TAMPERED };
    }

    const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);
    decipher.setAutoPadding(false);
    let padded;
    try {
        padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
        return { ok: false, reason: STORE_FAILURES.WRONG_KEY };
    }
    const plaintext = pkcs7Unpad(padded);
    if (plaintext === null) return { ok: false, reason: STORE_FAILURES.WRONG_KEY };

    let parsed;
    try {
        parsed = JSON.parse(plaintext.toString('utf8'));
    } catch {
        return { ok: false, reason: STORE_FAILURES.WRONG_KEY };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: STORE_FAILURES.MALFORMED };

    return {
        ok: true,
        record: {
            sessionId: typeof parsed.session_id === 'string' ? parsed.session_id : '',
            sessionToken: typeof parsed.session_token === 'string' ? parsed.session_token : '',
            signingPrivateKeyText: typeof parsed.signing_private_key === 'string' ? parsed.signing_private_key : '',
            signingPublicKeyPem: typeof parsed.signing_public_key === 'string' ? parsed.signing_public_key : '',
            savedAtUnix: Number.isFinite(parsed.saved_at_unix) ? parsed.saved_at_unix : null
        }
    };
}

// ---------------------------------------------------------------------------
// The keyring.
// ---------------------------------------------------------------------------

/**
 * Where the keyring lives when a host does not say.
 *
 * A fixed, user-scoped configuration directory — NOT the game's data directory —
 * so that the store and the key it needs do not sit in the same folder. Override
 * with `FEAR_AI_KEYRING`, which is what the probes use and what a host with its
 * own secret-management story should set.
 */
export function defaultKeyringPath() {
    if (process.env.FEAR_AI_KEYRING) return process.env.FEAR_AI_KEYRING;
    const home = os.homedir();
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        return path.join(appData, 'FearAI', 'keyring');
    }
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return path.join(configHome, 'fear-ai', 'keyring');
}

/** Write a file with the narrowest permissions the platform will take. */
function writePrivateFile(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, { encoding: 'utf8', mode: 0o600 });
    // `mode` on create is masked by the umask, so an existing file can still be
    // wider than intended; on POSIX it is worth the extra call. Windows has no
    // equivalent here and this is a no-op there - stated, not implied.
    if (process.platform !== 'win32') {
        try { fs.chmodSync(filePath, 0o600); } catch { /* best effort, by design */ }
    }
}

export function createKeyringText(key = randomBytes(KEYRING_KEY_BYTES)) {
    return [
        KEYRING_VERSION,
        `key=${b64(key)}`,
        `created_unix=${Math.floor(Date.now() / 1000)}`
    ].join(MAC_SEPARATOR) + MAC_SEPARATOR;
}

/**
 * Read a keyring, or create one.
 *
 * A malformed keyring is REPORTED and NOT overwritten: like a corrupt store, it
 * may be the only copy of a key that is still valid, and silently replacing it
 * would destroy the host's ability to read a store that is sitting right there.
 *
 * @returns {{ok: boolean, key?: Buffer, created?: boolean, path: string, reason?: string}}
 */
export function loadOrCreateKeyring({ keyringPath = defaultKeyringPath() } = {}) {
    if (fs.existsSync(keyringPath)) {
        let text;
        try {
            text = fs.readFileSync(keyringPath, 'utf8');
        } catch {
            return { ok: false, reason: STORE_FAILURES.UNREADABLE, path: keyringPath };
        }
        const key = parseKeyringText(text);
        if (!key) return { ok: false, reason: STORE_FAILURES.KEYRING_MALFORMED, path: keyringPath };
        return { ok: true, key, created: false, path: keyringPath };
    }
    const key = randomBytes(KEYRING_KEY_BYTES);
    try {
        writePrivateFile(keyringPath, createKeyringText(key));
    } catch {
        return { ok: false, reason: STORE_FAILURES.UNREADABLE, path: keyringPath };
    }
    return { ok: true, key, created: true, path: keyringPath };
}

/** The key from keyring text, or null when it is not a usable keyring. */
export function parseKeyringText(text) {
    if (typeof text !== 'string') return null;
    const lines = text.split('\n');
    if (lines.length === 0 || lines[0] !== KEYRING_VERSION) return null;
    for (const line of lines.slice(1)) {
        if (!line.startsWith('key=')) continue;
        const key = unb64(line.slice(4));
        // Length-checked, because a truncated keyring would otherwise derive a
        // short key and fail much later, looking like a wrong password.
        return key.length === KEYRING_KEY_BYTES ? key : null;
    }
    return null;
}

// ---------------------------------------------------------------------------
// The two operations a host actually wants.
// ---------------------------------------------------------------------------

/**
 * Save a session record encrypted.
 *
 * Written to a temporary file and RENAMED into place where the platform allows,
 * because a half-written store is precisely the loss this file exists to prevent:
 * the crash that motivates persistence is also the crash that can truncate it.
 */
export function saveEncryptedSession(storePath, { sessionId, sessionToken, signingPrivateKeyText = '', signingPublicKeyPem = '', keyringPath, password } = {}) {
    const secret = password || resolveKeyringPassword(keyringPath);
    if (!secret.ok) return { ok: false, reason: secret.reason };
    const encrypted = encryptStore({
        name: sessionId,
        password: secret.password,
        record: { sessionToken, signingPrivateKeyText, signingPublicKeyPem }
    });
    if (!encrypted.ok) return encrypted;
    try {
        fs.mkdirSync(path.dirname(storePath), { recursive: true });
        const temporary = `${storePath}.tmp`;
        fs.writeFileSync(temporary, encrypted.text, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temporary, storePath);
    } catch {
        return { ok: false, reason: STORE_FAILURES.UNREADABLE };
    }
    return { ok: true, keyringPath: secret.keyringPath || null, created_keyring: secret.created === true };
}

export function loadEncryptedSession(storePath, { keyringPath, password } = {}) {
    if (!fs.existsSync(storePath)) return { ok: false, reason: STORE_FAILURES.MISSING };
    let text;
    try {
        text = fs.readFileSync(storePath, 'utf8');
    } catch {
        return { ok: false, reason: STORE_FAILURES.UNREADABLE };
    }
    const secret = password ? { ok: true, password } : resolveKeyringPassword(keyringPath);
    if (!secret.ok) return { ok: false, reason: secret.reason };
    return decryptStore(text, { password: secret.password });
}

function resolveKeyringPassword(keyringPath) {
    const keyring = loadOrCreateKeyring({ keyringPath: keyringPath || defaultKeyringPath() });
    if (!keyring.ok) return { ok: false, reason: keyring.reason };
    return { ok: true, password: keyring.key, keyringPath: keyring.path, created: keyring.created };
}

/**
 * The session NAME from a store without needing the key.
 *
 * This is the affordance the plaintext `name=` line buys: an operator with a
 * stray store can tell which host it belongs to. It deliberately returns only
 * the name, because that is all that is readable without the keyring.
 */
export function readStoreName(storePath) {
    try {
        const text = fs.readFileSync(storePath, 'utf8');
        for (const line of text.split('\n')) {
            if (line.startsWith('name=')) return line.slice(5);
        }
    } catch {
        return null;
    }
    return null;
}
