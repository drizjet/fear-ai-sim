/**
 * RequestSigning — proving *possession of a private key* instead of *possession
 * of a bearer token*.
 *
 * WHY THIS EXISTS
 * A session token is a bearer credential: whoever holds the string can act.
 * That is fine for a cooperating host on a private loopback, and it is not fine
 * the moment the string escapes — a snapshot, a log line, a backup, a crash
 * dump, another process on the machine, or anyone reading the wire. The token
 * hash is safe in the snapshot (presenting the hash does not match it), but a
 * token lifted from a store is indistinguishable from the host itself.
 *
 * So this module implements the other half: a HOST-GENERATED keypair, with only
 * the public half given to the server. The private key never travels. A request
 * that carries a valid signature over material this server has never seen
 * before cannot be forged from anything readable on the wire, and cannot be
 * replayed, because the server refuses a nonce it has already accepted.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * It is not TLS and it does not encrypt anything. A wire reader still sees every
 * observation, advisory and agent id, and it still learns the public key (which
 * is harmless). What it can no longer do is *act as* the host: it cannot mint a
 * new signed request, and it cannot re-send one it captured. Confidentiality of
 * payloads is a transport problem this module does not pretend to solve.
 *
 * THE ALGORITHM IS CHOSEN FOR INTEROPERABILITY, NOT PREFS
 * RS256 (RSA-2048, SHA-256, PKCS#1 v1.5) is the one asymmetric primitive every
 * language in this repository already has without shipping new dependencies:
 * Node's `crypto`, Godot's `Crypto.generate_rsa`/`sign`, .NET's `RSA.SignData`,
 * and Python's `cryptography`. Ed25519 is smaller and would be the nicer choice,
 * but it is missing from Godot's `Crypto` and from the .NET 8 BCL, and an
 * adapter that cannot sign is an adapter that silently falls back to a bearer
 * token. This was verified, not assumed: a signature produced by the real Godot
 * 4.6 binary verifies in Node against the PEM Godot exported.
 *
 * THE CANONICAL INPUT
 * A signature is only as meaningful as the byte string it covers, so the string
 * is defined exactly, line by line, with no optional whitespace and an explicit
 * version tag. `\n` is LF; every field is UTF-8; the trailing `\n` is present.
 *
 *   HTTP:
 *     FEAR-AI-SIGN-V1
 *     HTTP
 *     <METHOD, uppercase>
 *     <request target exactly as sent, e.g. /api/v1/register/batch>
 *     <sha256 of the raw request body, lowercase hex; sha256("") when empty>
 *     <session_id>
 *     <issued_at, decimal milliseconds since the Unix epoch>
 *     <nonce, hex>
 *
 *   WS (connection authentication; see below):
 *     FEAR-AI-SIGN-V1
 *     WS
 *     <the challenge this server issued on this connection>
 *     <session_id>
 *
 * Method, target and body hash are all covered, so a signature cannot be lifted
 * from a GET and reused as a POST, cannot be repointed at another route, and
 * cannot survive an edited body. The nonce plus `issued_at` are what make the
 * whole thing non-replayable.
 *
 * CROSS-LANGUAGE TRAP, FOUND BY FAILING: `issued_at` is a DECIMAL INTEGER
 * STRING, and every client must render it as an integer. Godot's JSON parser
 * hands back numbers as floats, so `str(issued_at)` produces `1758400000000.0`
 * and the signature is rejected as invalid -- looking exactly like a broken key.
 * A client that reads the timestamp out of JSON must convert to int first
 * (`str(int(x))`), and a client that generates it should keep it an int from the
 * start (`int(Time.get_unix_time_from_system() * 1000.0)`). This cost one
 * debugging cycle; the interop probe now covers it in every language.
 *
 * WHY WEBSOCKET IS A HANDSHAKE INSTEAD OF PER-MESSAGE SIGNING
 * Observations and ticks are the hot path; signing each frame would put an RSA
 * signature on every simulation step, which no host should pay. So a WebSocket
 * connection authenticates ONCE, against a challenge this server generates and
 * has never used before. That is strictly stronger than a client-chosen nonce
 * (there is nothing to capture and resend, and no clock to trust), it costs one
 * signature per connection, and it composes with the existing model: the
 * connection is what `bind`/`bindIfProven` already attach to a session.
 *
 * THE POLICY, AND WHY THE DEFAULT IS NOT `required`
 *   - `off`       — signatures are ignored entirely. Every pre-signing client,
 *                   probe and adapter keeps working untouched.
 *   - `preferred` — the default. A caller that PRESENTS a signature must present
 *                   a valid one: a malformed, stale, replayed or forged
 *                   signature is refused and never silently downgraded back to
 *                   the bearer path. A caller that presents none is judged by
 *                   the token rules as before. This is safe to turn on
 *                   everywhere because it cannot break a host that does not
 *                   sign, and it cannot be used to bypass anything.
 *   - `required`  — a request or connection that NAMES A SESSION which has a
 *                   registered signing key must sign. The token alone is then
 *                   insufficient, which is the entire point of this module.
 *
 * `required` is scoped to sessions that have a key on purpose. A host that never
 * registered one cannot be locked out of its own crowd by a policy flag it did
 * not ask for, and an anonymous caller (no `session_id`) owns nothing, so it has
 * nothing to protect and the pre-session behaviour is unchanged.
 *
 * WHAT A REFUSAL COSTS
 * Nothing is mutated on any refusal: verification is a pure decision, taken
 * before the dispatcher sees the request. Failures are counted by reason and
 * land in the same refusal log the dashboard already explains.
 */

import { createHash, createPublicKey, randomBytes as cryptoRandomBytes, verify as cryptoVerify } from 'node:crypto';

/** Bump only with a deliberate, documented change to the canonical string. */
export const SIGNING_VERSION = 'FEAR-AI-SIGN-V1';

/** The one algorithm this version defines. Unknown values are refused, never ignored. */
export const SIGNATURE_ALGORITHM = 'RS256';

/** Request headers a signed HTTP call carries. */
export const SIGNATURE_HEADERS = Object.freeze({
    session: 'x-fear-signature-session',
    issuedAt: 'x-fear-signature-issued-at',
    nonce: 'x-fear-signature-nonce',
    signature: 'x-fear-signature',
    algorithm: 'x-fear-signature-algorithm',
    keyId: 'x-fear-signature-key-id'
});

/**
 * How far a request's `issued_at` may differ from this server's clock.
 *
 * This is a skew allowance, not a lifetime: it bounds how long a captured
 * request stays *worth* replaying, and the replay cache is what actually stops
 * it. Two minutes is generous for cooperating processes on one machine and is
 * still far too short for a capture to be interesting.
 */
export const DEFAULT_SIGNATURE_SKEW_MS = 120000;

/** Cap on remembered nonces. Reached only by a flood of VALID signatures. */
export const DEFAULT_NONCE_LIMIT = 8192;

/** Cap on outstanding WebSocket challenges: one per open connection, plus slack. */
export const DEFAULT_CHALLENGE_LIMIT = 512;

/** How long an unclaimed WebSocket challenge stays valid. */
export const DEFAULT_CHALLENGE_TTL_MS = 30000;

/** Reasons a signed request can fail. Stable strings: they reach the refusal log. */
export const SIGNATURE_FAILURES = Object.freeze({
    MISSING: 'SIGNATURE_MISSING',
    MALFORMED: 'SIGNATURE_MALFORMED',
    UNSUPPORTED_ALG: 'SIGNATURE_UNSUPPORTED_ALG',
    UNKNOWN_KEY: 'SIGNATURE_UNKNOWN_KEY',
    STALE: 'SIGNATURE_STALE',
    REPLAY: 'SIGNATURE_REPLAY',
    INVALID: 'SIGNATURE_INVALID',
    UNKNOWN_CHALLENGE: 'SIGNATURE_UNKNOWN_CHALLENGE',
    EXPIRED_CHALLENGE: 'SIGNATURE_EXPIRED_CHALLENGE'
});

export const SIGNATURE_POLICIES = Object.freeze(['off', 'preferred', 'required']);

export function normalizeSignaturePolicy(value) {
    return SIGNATURE_POLICIES.includes(value) ? value : 'preferred';
}

/** Lowercase hex SHA-256. Empty bodies hash as sha256(""), not as null. */
export function sha256Hex(input) {
    return createHash('sha256').update(input === undefined || input === null ? '' : input).digest('hex');
}

/**
 * A short, stable, non-secret name for a public key.
 *
 * Included in the canonical input's caller side as a diagnostic only: a host
 * that rotated its key can see which key the server refused, and the server can
 * report which key it holds. The fingerprint is of the key ITSELF, so it cannot
 * be forged into a match for a different key.
 */
export function publicKeyFingerprint(publicKeyPem) {
    if (typeof publicKeyPem !== 'string' || publicKeyPem.trim() === '') return null;
    try {
        const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
        return createHash('sha256').update(der).digest('hex').slice(0, 16);
    } catch {
        return null;
    }
}

/** True when this string parses as an SPKI public key this server can verify with. */
export function isUsablePublicKey(publicKeyPem) {
    return publicKeyFingerprint(publicKeyPem) !== null;
}

function canonicalLines(...lines) {
    return `${lines.join('\n')}\n`;
}

/** The exact bytes an HTTP signature must cover. */
export function canonicalHttpInput({ method, target, bodyHash, sessionId, issuedAt, nonce }) {
    return canonicalLines(
        SIGNING_VERSION,
        'HTTP',
        String(method || '').toUpperCase(),
        String(target == null ? '' : target),
        String(bodyHash || ''),
        String(sessionId == null ? '' : sessionId),
        String(issuedAt),
        String(nonce == null ? '' : nonce)
    );
}

/** The exact bytes a WebSocket challenge response must cover. */
export function canonicalWsInput({ challenge, sessionId }) {
    return canonicalLines(
        SIGNING_VERSION,
        'WS',
        String(challenge == null ? '' : challenge),
        String(sessionId == null ? '' : sessionId)
    );
}

/**
 * Verify one RSA-SHA256 signature against a public key.
 *
 * Split out because it is the only cryptographic step, and because a probe
 * should be able to check it without standing up a server.
 */
export function verifyRs256(publicKeyPem, message, signature) {
    let key;
    try {
        key = createPublicKey(publicKeyPem);
    } catch {
        return false;
    }
    try {
        return cryptoVerify('sha256', Buffer.from(message, 'utf8'), key, signature);
    } catch {
        return false;
    }
}

/** Read the signature header set, normalising case for a Node request object. */
export function readSignatureHeaders(headers) {
    const get = (name) => {
        if (!headers) return undefined;
        const direct = headers[name];
        if (typeof direct === 'string') return direct;
        if (Array.isArray(direct)) return direct[0];
        return undefined;
    };
    return {
        sessionId: get(SIGNATURE_HEADERS.session) || null,
        issuedAt: get(SIGNATURE_HEADERS.issuedAt) || null,
        nonce: get(SIGNATURE_HEADERS.nonce) || null,
        signature: get(SIGNATURE_HEADERS.signature) || null,
        algorithm: get(SIGNATURE_HEADERS.algorithm) || null,
        keyId: get(SIGNATURE_HEADERS.keyId) || null
    };
}

export class RequestSigning {
    constructor({
        policy = 'preferred',
        skewMs = DEFAULT_SIGNATURE_SKEW_MS,
        nonceLimit = DEFAULT_NONCE_LIMIT,
        challengeLimit = DEFAULT_CHALLENGE_LIMIT,
        challengeTtlMs = DEFAULT_CHALLENGE_TTL_MS,
        now = () => Date.now(),
        randomBytes
    } = {}) {
        this.policy = normalizeSignaturePolicy(policy);
        this.skewMs = Number.isFinite(skewMs) && skewMs > 0 ? skewMs : DEFAULT_SIGNATURE_SKEW_MS;
        this.nonceLimit = Number.isFinite(nonceLimit) && nonceLimit > 0 ? nonceLimit : DEFAULT_NONCE_LIMIT;
        this.challengeLimit = Number.isFinite(challengeLimit) && challengeLimit > 0 ? challengeLimit : DEFAULT_CHALLENGE_LIMIT;
        this.challengeTtlMs = Number.isFinite(challengeTtlMs) && challengeTtlMs > 0 ? challengeTtlMs : DEFAULT_CHALLENGE_TTL_MS;
        this._now = now;
        this._random = randomBytes || null;
        /** @type {Map<string, number>} "session:nonce" -> accepted-at, insertion ordered */
        this._nonces = new Map();
        /** @type {Map<string, {challenge: string, sessionId: string|null, issuedAt: number}>} response nonce -> challenge */
        this._challenges = new Map();
        // Counted separately on purpose. Deriving "rejected" as
        // verifications-minus-accepted looked right and was wrong: a request that
        // carried NO signature and was allowed through on the bearer path also
        // never increments `accepted`, so every unsigned legacy request was
        // reported as a rejection. That made a probe assert a failure that had not
        // happened, and would have told a host its signing setup was broken while
        // it was in fact working normally.
        this.verifications = 0;
        this.accepted = 0;
        this.rejected = 0;
        this.unsigned = 0;
        this.failures = Object.create(null);
    }

    get enabled() {
        return this.policy !== 'off';
    }

    /** True when this policy makes a session's own token insufficient on its own. */
    get required() {
        return this.policy === 'required';
    }

    _fail(reason) {
        this.failures[reason] = (this.failures[reason] || 0) + 1;
        this.rejected += 1;
        return { ok: false, reason, status: 401, required: this.required };
    }

    /** Drop expired nonces. Called on insert, so the cache cannot grow unbounded. */
    _sweepNonces() {
        const cutoff = this._now() - this.skewMs;
        for (const [key, at] of this._nonces) {
            if (at >= cutoff) break;
            this._nonces.delete(key);
        }
        while (this._nonces.size > this.nonceLimit) {
            const oldest = this._nonces.keys().next();
            if (oldest.done) break;
            this._nonces.delete(oldest.value);
        }
    }

    /** Drop expired or answered challenges. */
    _sweepChallenges() {
        const cutoff = this._now() - this.challengeTtlMs;
        for (const [key, entry] of this._challenges) {
            if (entry.issuedAt >= cutoff) break;
            this._challenges.delete(key);
        }
        while (this._challenges.size > this.challengeLimit) {
            const oldest = this._challenges.keys().next();
            if (oldest.done) break;
            this._challenges.delete(oldest.value);
        }
    }

    /**
     * A fresh, single-use challenge for one WebSocket connection.
     *
     * Returned to the host, which signs it. Because the server generates it and
     * retires it on use, a captured response is worthless: it answers a question
     * that has already been asked and thrown away.
     */
    issueChallenge(sessionId = null) {
        this._sweepChallenges();
        const challenge = this._randomBytes(24).toString('hex');
        this._challenges.set(challenge, {
            challenge,
            sessionId: sessionId ? String(sessionId) : null,
            issuedAt: this._now()
        });
        return { challenge, alg: SIGNATURE_ALGORITHM, issued_at: this._now() };
    }

    _randomBytes(size) {
        if (this._random) return Buffer.from(this._random(size));
        return cryptoRandomBytes(size);
    }

    /**
     * Verify one HTTP request.
     *
     * @param {object} args
     * @param {string} args.method
     * @param {string} args.target request target exactly as sent (path only for our clients)
     * @param {string} args.rawBody the body text as received
     * @param {object} args.headers
     * @param {object|null} args.sessionRecord the named session, or null when unknown
     * @param {string|null} [args.sessionIdHint] the session named in the BODY
     * @returns {{ok: boolean, reason: string|null, status: number, sessionId: string|null}}
     */
    verifyHttpRequest({ method, target, rawBody, headers, sessionRecord, sessionIdHint = null }) {
        if (!this.enabled) return { ok: true, reason: null, status: 200, sessionId: null };
        this.verifications += 1;

        const presented = readSignatureHeaders(headers);
        const sessionId = presented.sessionId ? String(presented.sessionId) : null;
        const hasAnySignatureMaterial = Boolean(presented.signature || presented.nonce || presented.issuedAt || presented.algorithm);

        // Nothing to verify and nothing required: the bearer path decides, exactly
        // as before. Recorded as a non-failure so a host can see how much traffic
        // is still unsigned before switching the policy to `required`.
        //
        // The session a request is ABOUT usually arrives in the BODY, not in a
        // signature header - a token-only caller names its session the way it
        // always has. So the `required` decision reads the body's name too. This
        // was missed in the first cut of this module, where a token-only request
        // against a keyed session sailed through because no signature header had
        // been sent to carry the name.
        if (!hasAnySignatureMaterial) {
            const named = sessionId || (sessionIdHint ? String(sessionIdHint) : null);
            if (this.required && named && sessionRecord && sessionRecord.signingPublicKey) {
                return this._fail(SIGNATURE_FAILURES.MISSING);
            }
            this.unsigned += 1;
            return { ok: true, reason: null, status: 200, sessionId: null, unsigned: true };
        }

        // From here a signature was attempted, so ANY problem is fatal. A caller
        // must never be able to downgrade to the token path by sending a broken
        // signature -- that would make the whole scheme opt-out for an attacker.
        if (!presented.signature || !presented.nonce || !presented.issuedAt || !sessionId) {
            return this._fail(SIGNATURE_FAILURES.MALFORMED);
        }
        if (presented.algorithm && String(presented.algorithm).toUpperCase() !== SIGNATURE_ALGORITHM) {
            return this._fail(SIGNATURE_FAILURES.UNSUPPORTED_ALG);
        }
        if (!sessionRecord || !sessionRecord.signingPublicKey) {
            // A signature for a session with no registered key cannot be checked,
            // so it is refused rather than waved through.
            return this._fail(SIGNATURE_FAILURES.UNKNOWN_KEY);
        }
        if (presented.keyId && sessionRecord.signingKeyId && String(presented.keyId) !== String(sessionRecord.signingKeyId)) {
            return this._fail(SIGNATURE_FAILURES.UNKNOWN_KEY);
        }

        const issuedAt = Number(presented.issuedAt);
        if (!Number.isFinite(issuedAt)) return this._fail(SIGNATURE_FAILURES.MALFORMED);
        if (Math.abs(this._now() - issuedAt) > this.skewMs) return this._fail(SIGNATURE_FAILURES.STALE);

        // Replay check BEFORE the expensive verify: a replayed request is already
        // refused, and this keeps a capture-and-resend loop cheap to reject.
        const nonceKey = `${sessionId}:${presented.nonce}`;
        if (this._nonces.has(nonceKey)) return this._fail(SIGNATURE_FAILURES.REPLAY);

        const signature = this._decodeSignature(presented.signature);
        if (!signature) return this._fail(SIGNATURE_FAILURES.MALFORMED);

        const message = canonicalHttpInput({
            method,
            target,
            bodyHash: sha256Hex(rawBody === undefined ? '' : rawBody),
            sessionId,
            issuedAt,
            nonce: presented.nonce
        });
        if (!verifyRs256(sessionRecord.signingPublicKey, message, signature)) {
            return this._fail(SIGNATURE_FAILURES.INVALID);
        }

        // Remembered only after a valid signature, so a flood of junk cannot fill
        // the cache and evict the nonce of a request an attacker wants to replay.
        this._nonces.set(nonceKey, this._now());
        this._sweepNonces();
        this.accepted += 1;
        return { ok: true, reason: null, status: 200, sessionId, signed: true, keyId: sessionRecord.signingKeyId || null };
    }

    _decodeSignature(value) {
        if (typeof value !== 'string' || value.trim() === '') return null;
        let buffer;
        try {
            buffer = Buffer.from(value, 'base64');
        } catch {
            return null;
        }
        // A base64 round trip that does not reproduce the input means the caller
        // sent something that was not base64 at all.
        if (buffer.length === 0 || buffer.toString('base64').replace(/=+$/, '') !== value.trim().replace(/=+$/, '')) {
            return null;
        }
        return buffer;
    }

    /**
     * Verify a response to a challenge this server issued.
     *
     * The challenge is looked up and immediately retired: single use, regardless
     * of whether the signature verifies, so a captured response cannot be tried
     * twice and a wrong guess burns its question.
     */
    verifyChallengeResponse({ challenge, sessionId, signature, sessionRecord }) {
        if (!this.enabled) return { ok: true, reason: null, status: 200 };
        this.verifications += 1;

        const record = challenge ? this._challenges.get(String(challenge)) : null;
        if (!record) return this._fail(SIGNATURE_FAILURES.UNKNOWN_CHALLENGE);
        this._challenges.delete(String(challenge));
        if ((this._now() - record.issuedAt) > this.challengeTtlMs) {
            return this._fail(SIGNATURE_FAILURES.EXPIRED_CHALLENGE);
        }
        if (!sessionRecord || !sessionRecord.signingPublicKey) {
            return this._fail(SIGNATURE_FAILURES.UNKNOWN_KEY);
        }

        const decoded = this._decodeSignature(signature);
        if (!decoded) return this._fail(SIGNATURE_FAILURES.MALFORMED);

        const message = canonicalWsInput({ challenge: String(challenge), sessionId });
        if (!verifyRs256(sessionRecord.signingPublicKey, message, decoded)) {
            return this._fail(SIGNATURE_FAILURES.INVALID);
        }
        this.accepted += 1;
        return { ok: true, reason: null, status: 200, signed: true };
    }

    /** Host-visible state. No signature material, no challenges, no nonces. */
    summary() {
        return {
            policy: this.policy,
            algorithm: SIGNATURE_ALGORITHM,
            version: SIGNING_VERSION,
            skew_ms: this.skewMs,
            verifications: this.verifications,
            accepted: this.accepted,
            rejected: this.rejected,
            // Allowed through WITHOUT a signature, which is the number a host
            // watches while deciding whether it can switch to `required`.
            unsigned: this.unsigned,
            failures_by_reason: { ...this.failures },
            nonce_cache_size: this._nonces.size,
            nonce_cache_limit: this.nonceLimit,
            challenges_outstanding: this._challenges.size,
            challenge_limit: this.challengeLimit,
            // The honest boundary, stated where a host will read it.
            confidentiality: 'none: this authenticates requests, it does not encrypt the transport'
        };
    }
}
