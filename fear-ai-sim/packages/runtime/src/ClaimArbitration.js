/**
 * ClaimArbitration — session-scoped ownership of registered agents.
 *
 * WHY THIS EXISTS
 * Agents live in `RuntimeSimulation.agents` keyed by id, and the simulation
 * already behaves correctly when an id is re-registered (traits merge, state is
 * preserved, no duplicate is created). What the server could not answer is
 * *who* a registered agent belongs to. Without that, "my host reconnected" and
 * "a second host is claiming my crowd" look identical.
 *
 * IDENTITY MODEL
 * Two things are deliberately kept separate:
 *
 *   - The session NAME (`session_id`) is a host-chosen label. It survives a
 *     host process restart, but on its own it is NOT a credential: anyone can
 *     write down a name they saw.
 *   - The session TOKEN is issued by the server, 256 bits of CSPRNG entropy,
 *     returned exactly once when a session is created. It proves continuity of
 *     the same host process.
 *
 * So a name says *which* crowd, and a token says *it is me*. A claim that
 * presents the right token is recognised unconditionally. A claim that presents
 * only a name may create a session or adopt a dead one, but can never displace a
 * session that is still live — which is precisely the guessing attack the name
 * alone allowed.
 *
 * THE RULES
 *   1. Token matches the name's session   -> granted. State preserved. This is
 *      the reconnect path, and it does not care about liveness.
 *   2. Name is unclaimed                  -> granted, new session, token issued.
 *   3. Name claimed, session NOT live     -> adopted. New session under the same
 *      name, NEW token issued (the old token is retired). This is host migration
 *      or a restart that lost its token.
 *   4. Name claimed, session IS live      -> refused. Nothing is mutated. This
 *      is the duplicate-host case: a live crowd is never handed to whoever asked
 *      second just because they know its name.
 *   5. Token presented but does not match -> refused as a mismatched token.
 *   6. `claim: "takeover"`                -> displaces a LIVE owner, explicitly,
 *      and is counted separately so it is visible rather than routine.
 *
 * A session is LIVE while it holds an OPEN connection, or has been bound by a
 * proven claim within `staleAfterMs` **during this process**. Recency alone is
 * not enough, because a restored session has a `lastSeen` from before the
 * restart and no connection: it must not read as live merely because the
 * middleware restarted quickly.
 *
 * THE CREDENTIAL HAS A LIFETIME, AND THE HOST CAN END IT
 * A token is not forever, and its disposal is not only the server's decision:
 *
 *   - EXPIRY. `tokenTtlMs` bounds how long an issued token is accepted (a week
 *     by default; `0` disables it). An expired token is deliberately NOT a
 *     lockout: it is honoured one final time and replaced. Presenting the old
 *     credential still proves identity, so the claim is GRANTED *and* a fresh
 *     token is returned in the same response. A host that was away for a month
 *     therefore recovers instead of deadlocking, while a credential copied off
 *     a disk after a month buys exactly one call rather than indefinite access.
 *   - ROTATION. A proven host can ask for a new credential with
 *     `rotate_token: true` on any claim, retiring the old one immediately. The
 *     flag is honoured only for an identity that ALREADY matched, so it cannot
 *     be used to rotate a credential the caller does not hold.
 *
 * A STRANGER CANNOT HOLD A SESSION ALIVE
 * Liveness moves only on proven traffic (`bind`, `bindIfProven`) and on the
 * host's own proven claims. A refusal is inert: it neither shortens the
 * incumbent's window nor extends it, so an attacker can neither evict an owner
 * by running out its clock nor pin a crowd to a credential forever by refusing
 * to stop naming it.
 *   - REVOCATION. `revoke(name, token)` ends a session on the spot: the record
 *     goes, the name becomes free for a fresh claim, and its agents are
 *     released (still registered, no longer owned). A host that is finished
 *     should revoke rather than linger until its names happen to go stale.
 *
 * TEARDOWN IS OWNERSHIP-GATED TOO
 * Registration was arbitrated from the start; unregistration and reset were
 * not, so any client could tear down any crowd. `authorizeTeardown` and
 * `authorizeReset` apply the same test to destructive verbs. An agent owned by
 * a session may be removed by that session (proven by token), or by anyone once
 * its owner is no longer live - which is the same window in which that owner's
 * agents are already adoptable, so cleanup gains an attacker nothing that
 * adoption did not already allow. A reset additionally refuses while ANOTHER
 * live session owns agents, because "wipe the world" is not a decision the
 * middleware can silently make on a running host's behalf.
 *
 * WHAT THIS IS NOT
 * Ownership is continuity, not access control. It protects a live session's
 * agents from other sessions, and it protects nothing else. There is no
 * transport security, no user authentication and no per-agent authorization
 * here: if the wire can be read, the token can be read with it.
 *
 * TOKENS ARE HASHED AT REST
 * Only a SHA-256 of each token is retained, so the ownership summary can never
 * leak a credential and a snapshot containing sessions does not contain tokens.
 * No salt is used, and none is needed: tokens are 256-bit random, so there is no
 * dictionary to build.
 *
 * COST
 * `RuntimeSimulation` never consults this module. Ownership gates *claims*, not
 * observations or ticks: agents remain advisory and the host keeps authority.
 * The server only consults it on registration, unregistration, reset and
 * handshake, so the per-tick hot path is untouched.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { isUsablePublicKey, publicKeyFingerprint } from './RequestSigning.js';

/** Claim outcomes. `GRANTED`/`ADOPTED`/`TAKEN_OVER` all mean the caller now owns it. */
export const CLAIM_OUTCOMES = Object.freeze({
    GRANTED: 'GRANTED',
    ADOPTED: 'ADOPTED',
    TAKEN_OVER: 'TAKEN_OVER',
    REFUSED_OWNED_BY_LIVE_SESSION: 'REFUSED_OWNED_BY_LIVE_SESSION',
    REFUSED_OWNED_BY_LIVE_SESSION_REQUIRES_TAKEOVER: 'REFUSED_OWNED_BY_LIVE_SESSION_REQUIRES_TAKEOVER',
    REFUSED_TOKEN_MISMATCH: 'REFUSED_TOKEN_MISMATCH'
});

/**
 * Outcomes of a DESTRUCTIVE verb (unregister, reset). Separate vocabulary from
 * claims because the failure means something different to a host: a refused
 * claim costs it an NPC it never had, while a refused teardown means an agent
 * it believes it retired is still live on the server.
 */
export const TEARDOWN_OUTCOMES = Object.freeze({
    RELEASED: 'RELEASED',
    RELEASED_OWNER_STALE: 'RELEASED_OWNER_STALE',
    RELEASED_ORPHAN: 'RELEASED_ORPHAN',
    REFUSED_NOT_OWNER: 'REFUSED_NOT_OWNER'
});

/**
 * Outcomes of registering a session's signing key.
 *
 * A key is the session's PUBLIC half, so storing it is not sensitive; the
 * refusal exists because a key is a *claim about identity*, and letting anyone
 * who knows a name overwrite the key of a live session would hand them exactly
 * the impersonation this feature exists to prevent.
 */
export const SIGNING_KEY_OUTCOMES = Object.freeze({
    REGISTERED: 'SIGNING_KEY_REGISTERED',
    REPLACED: 'SIGNING_KEY_REPLACED',
    REFUSED_NO_SUCH_SESSION: 'SIGNING_KEY_REFUSED_NO_SUCH_SESSION',
    REFUSED_INVALID_KEY: 'SIGNING_KEY_REFUSED_INVALID_KEY',
    REFUSED_NOT_PROVEN: 'SIGNING_KEY_REFUSED_NOT_PROVEN'
});

const GRANTING_OUTCOMES = new Set([
    CLAIM_OUTCOMES.GRANTED,
    CLAIM_OUTCOMES.ADOPTED,
    CLAIM_OUTCOMES.TAKEN_OVER
]);

/** Default liveness window. Generous: a slow frame must not look like a death. */
export const DEFAULT_SESSION_STALENESS_MS = 30000;

/** 256 bits. Short enough to carry in a JSON field, long enough to be unguessable. */
export const SESSION_TOKEN_BYTES = 32;

/**
 * A week. Long enough that no plausible host session reaches it, short enough
 * that a credential left on disk stops being useful on a human timescale.
 */
export const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Bounded refusal memory. Enough to explain a fight, not a log to maintain. */
export const REFUSAL_LOG_LIMIT = 25;

/**
 * Bounded IDENTITY-DECISION memory: the audit timeline.
 *
 * Larger than the refusal log because it also carries the decisions that were
 * GRANTED, and a timeline that only records fights cannot answer "what changed"
 * — a host that lost its crowd needs to see the claim that took it, which means
 * seeing the successes too. Still bounded, and still a per-process ring rather
 * than a durable audit log: it is written by anything that can reach the claim
 * path, so leaving it unbounded would be a memory leak with a friendly name.
 */
export const EVENT_LOG_LIMIT = 100;

/** Cap on distinct blocking sessions named in one refusal record. */
export const MAX_REPORTED_BLOCKERS = 8;

export function hashSessionToken(token) {
    return createHash('sha256').update(String(token)).digest('hex');
}

/** Constant-time comparison, so a token cannot be probed one byte at a time. */
function tokensMatch(presented, recordedHash) {
    if (typeof presented !== 'string' || !recordedHash) return false;
    const presentedHash = hashSessionToken(presented);
    const a = Buffer.from(presentedHash, 'utf8');
    const b = Buffer.from(recordedHash, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export class ClaimArbitration {
    constructor({ staleAfterMs = DEFAULT_SESSION_STALENESS_MS, now = () => Date.now(), tokenFactory, tokenTtlMs = DEFAULT_TOKEN_TTL_MS } = {}) {
        this.staleAfterMs = Number.isFinite(staleAfterMs) ? staleAfterMs : DEFAULT_SESSION_STALENESS_MS;
        // `0` disables expiry. Kept as a number rather than a boolean so a host
        // can choose its own window without a second switch to get wrong.
        this.tokenTtlMs = Number.isFinite(tokenTtlMs) && tokenTtlMs >= 0 ? tokenTtlMs : DEFAULT_TOKEN_TTL_MS;
        this._now = now;
        this._tokenFactory = tokenFactory || (() => randomBytes(SESSION_TOKEN_BYTES).toString('hex'));
        /** @type {Map<string, object>} sessionId -> session record */
        this.sessions = new Map();
        /** @type {Map<string, string>} agentId -> sessionId */
        this.owners = new Map();
        this.refusals = 0;
        this.adoptions = 0;
        this.takeovers = 0;
        this.issues = 0;
        this.tokenMismatches = 0;
        this.rotations = 0;
        this.expiredCredentials = 0;
        this.revocations = 0;
        this.teardownRefusals = 0;
        this.staleReleases = 0;
        this.signingKeyRegistrations = 0;
        this.signingKeyReplacements = 0;
        this.signatureRefusals = 0;
        /** @type {Array<object>} newest-first, bounded by REFUSAL_LOG_LIMIT */
        this.refusalLog = [];
        /** @type {Record<string, number>} reason -> count, for a stable summary */
        this.refusalsByReason = Object.create(null);
        /**
         * Newest-first identity timeline, bounded by EVENT_LOG_LIMIT: every
         * decision this module made about WHO a caller is, granted or refused.
         * Deliberately NOT restored from a snapshot (see `summary().timeline_scope`):
         * a restored process has not made any decisions yet, and reporting a
         * previous process's rows as live would be a quiet lie about recency.
         * @type {Array<object>}
         */
        this.eventLog = [];
        this.eventsRecorded = 0;
    }

    /** True when at least one session has claimed ownership of anything. */
    get active() {
        return this.owners.size > 0;
    }

    _newSession(name, { tokenHash, observed, tokenIssuedAt = null, signingPublicKey = null, signingKeyId = null, signingKeySetAt = null }) {
        return {
            tokenHash,
            tokenIssuedAt,
            // The session's PUBLIC signing key, if it registered one. Only the
            // public half is ever here: the private key never leaves the host,
            // which is the entire difference between this and the token.
            signingPublicKey,
            signingKeyId,
            signingKeySetAt,
            agentIds: new Set(),
            connection: null,
            firstSeen: this._now(),
            lastSeen: this._now(),
            detachedAt: null,
            // A restored session has never been heard from in THIS process, so it
            // starts unbound: recency from a previous process must not make it
            // look live.
            observed: observed === true,
            claimModes: { adoptions: 0, takeovers: 0, refusals: 0 },
            claims: 0
        };
    }

    _issueToken(session, name) {
        const token = this._tokenFactory();
        session.tokenHash = hashSessionToken(token);
        // Issuance time is what expiry is measured from, so it is stamped here
        // rather than inferred from any claim that happens to follow.
        session.tokenIssuedAt = this._now();
        this.issues += 1;
        return token;
    }

    /**
     * Whether this session's credential is past its usable window.
     *
     * A session restored from a snapshot keeps its issuance time, so a token
     * that was already old when the snapshot was taken comes back old. A
     * session whose hash was exported before `token_issued_at` existed has no
     * timestamp and is treated as unexpired: absent evidence is not a reason to
     * lock a working host out.
     */
    _tokenExpired(session) {
        if (!(this.tokenTtlMs > 0)) return false;
        if (!Number.isFinite(session.tokenIssuedAt)) return false;
        return (this._now() - session.tokenIssuedAt) > this.tokenTtlMs;
    }

    /** How long until this blocker stops blocking, or null if it holds a socket. */
    _blockerRetryAfter(name) {
        const session = this.sessions.get(String(name));
        if (!session) return 0;
        if (session.connection && session.connection.readyState === 1) return null;
        if (!session.observed) return 0;
        return Math.max(0, this.staleAfterMs - (this._now() - session.lastSeen));
    }

    /**
     * Record one refusal for the host-visible drill-down.
     *
     * Bounded on purpose: this is an explanation, not an audit trail, and an
     * unbounded log on a path a hostile client can drive is a memory leak with
     * a friendly name.
     */
    _recordRefusal(entry) {
        const reason = entry && entry.reason ? String(entry.reason) : 'UNKNOWN';
        const record = { at: this._now(), ...entry, reason };
        this.refusalLog.unshift(record);
        if (this.refusalLog.length > REFUSAL_LOG_LIMIT) {
            this.refusalLog.length = REFUSAL_LOG_LIMIT;
        }
        this.refusalsByReason[reason] = (this.refusalsByReason[reason] || 0) + 1;
        // The SAME decision, in the timeline, so a reader can follow one ordered
        // stream instead of correlating two logs by timestamp. Hooked here rather
        // than at each call site on purpose: every refusal already funnels through
        // this method, so a new refusal path cannot forget to be on the timeline.
        this._recordEvent({ decision: 'refused', ...record });
    }

    /**
     * Record one identity decision on the bounded audit timeline.
     *
     * WHY A SEPARATE STREAM FROM `refusalLog`
     * The refusal log answers "why was this NPC not registered". The timeline
     * answers "what happened to my session" — which includes the grants, the
     * token issuance, the key rotation and the revoke. Those are the rows a host
     * needs after it loses a crowd, and none of them are refusals.
     */
    _recordEvent(entry) {
        this.eventLog.unshift({ at: this._now(), ...entry });
        if (this.eventLog.length > EVENT_LOG_LIMIT) {
            this.eventLog.length = EVENT_LOG_LIMIT;
        }
        this.eventsRecorded += 1;
    }

    /** True when `token` is this name's credential. Used by teardown and revoke. */
    proves(name, token) {
        const session = this.sessions.get(String(name));
        return Boolean(session) && tokensMatch(token, session.tokenHash);
    }

    /**
     * Public form of the blocker countdown, for callers that refuse on this
     * module's behalf. Null means "not soon": a blocker holding an open socket
     * has no deadline, and reporting `0` there would read as "retry now".
     */
    retryAfterFor(name) {
        return this._blockerRetryAfter(name);
    }

    /**
     * Prove identity and bind liveness. Only called with a token that already
     * matched, so a caller cannot bind a name it merely knows.
     */
    bind(name, connection = null) {
        const session = this.sessions.get(String(name));
        if (!session) return null;
        const now = this._now();
        session.observed = true;
        session.lastSeen = now;
        if (connection) {
            session.connection = connection;
            session.detachedAt = null;
        }
        return session;
    }

    /**
     * Bind a socket to a session ONLY if the caller proved it holds the token.
     *
     * This is what a handshake uses. A handshake cannot create a session (no
     * agents) and must not attach a stranger's socket to someone else's crowd,
     * so a name alone binds nothing here - not even liveness.
     */
    bindIfProven(name, token, connection = null) {
        const session = this.sessions.get(String(name));
        if (!session || !tokensMatch(token, session.tokenHash)) return false;
        this.bind(name, connection);
        return true;
    }

    /**
     * The public key registered for a session, for the signing gate.
     *
     * Deliberately narrow: the request verifier gets the key and its fingerprint
     * and nothing else, so verification cannot accidentally read (or mutate)
     * ownership state on its way to a decision.
     */
    signingRecord(name) {
        const session = this.sessions.get(String(name));
        if (!session || !session.signingPublicKey) return null;
        // Field names deliberately match the verifier's expectations, because a
        // silent mismatch here is a gate that never fires: the first cut of this
        // returned `publicKey`/`keyId` and the verifier looked for
        // `signingPublicKey`, so a token-only request against a keyed session was
        // waved through while every signature was refused as unknown.
        return { signingPublicKey: session.signingPublicKey, signingKeyId: session.signingKeyId || null };
    }

    /** True when this session has committed to signing (so its token is not enough). */
    hasSigningKey(name) {
        const session = this.sessions.get(String(name));
        return Boolean(session && session.signingPublicKey);
    }

    /**
     * Register (or replace) a session's signing key.
     *
     * TWO RULES, and both are about who may speak for a name:
     *   - A session with NO key accepts the first one that arrives, because that
     *     is the same moment the session itself was created or adopted. A host
     *     that just adopted a crowd it lost the token for is the owner by that
     *     adoption; refusing its key would leave it unable to ever sign.
     *   - A session that ALREADY has a key accepts a new one ONLY from a caller
     *     that proves the token. Otherwise anyone who knows the name could swap
     *     the key and then impersonate the host — the attack this feature exists
     *     to close, arriving through its own front door. This mirrors
     *     `rotate_token`, which is likewise honoured only for a proven identity.
     *
     * @returns {{registered: boolean, replaced: boolean, outcome: string, key_id: string|null}}
     */
    registerSigningKey(name, publicKey, { token = null } = {}) {
        const sessionName = String(name);
        const session = this.sessions.get(sessionName);
        if (!session) {
            return { registered: false, replaced: false, outcome: SIGNING_KEY_OUTCOMES.REFUSED_NO_SUCH_SESSION, key_id: null };
        }
        const keyId = publicKeyFingerprint(publicKey);
        if (!keyId || !isUsablePublicKey(publicKey)) {
            return { registered: false, replaced: false, outcome: SIGNING_KEY_OUTCOMES.REFUSED_INVALID_KEY, key_id: null };
        }
        const alreadyHasKey = Boolean(session.signingPublicKey);
        if (alreadyHasKey && !tokensMatch(token, session.tokenHash)) {
            this._recordRefusal({
                verb: 'register_signing_key',
                agent_id: null,
                attempted_session_id: sessionName,
                reason: SIGNING_KEY_OUTCOMES.REFUSED_NOT_PROVEN,
                blocked_by: sessionName,
                retry_after_ms: this._blockerRetryAfter(sessionName)
            });
            return { registered: false, replaced: false, outcome: SIGNING_KEY_OUTCOMES.REFUSED_NOT_PROVEN, key_id: null };
        }
        session.signingPublicKey = String(publicKey);
        session.signingKeyId = keyId;
        session.signingKeySetAt = this._now();
        this._recordEvent({
            kind: 'signing_key',
            decision: alreadyHasKey ? 'replaced' : 'registered',
            session_id: sessionName,
            // The FINGERPRINT, never the key body or anything private. A timeline
            // a designer reads is not a place for material worth stealing, and the
            // key id is enough to tell two keys apart.
            key_id: keyId,
            proved_token: tokensMatch(token, session.tokenHash)
        });
        if (alreadyHasKey) {
            this.signingKeyReplacements += 1;
            return { registered: true, replaced: true, outcome: SIGNING_KEY_OUTCOMES.REPLACED, key_id: keyId };
        }
        this.signingKeyRegistrations += 1;
        return { registered: true, replaced: false, outcome: SIGNING_KEY_OUTCOMES.REGISTERED, key_id: keyId };
    }

    /**
     * Record a signature refusal in the SAME log the claims use.
     *
     * Verification happens before the dispatcher runs, so it cannot report
     * through a route's own refusal path. Routing it here means a refused
     * signature shows up in the dashboard drill-down beside a refused claim,
     * with the same shape, instead of being a number nobody can explain.
     */
    recordSignatureRefusal({ verb = 'signature', sessionId = null, reason, detail = null } = {}) {
        this.signatureRefusals += 1;
        this._recordRefusal({
            verb,
            agent_id: null,
            attempted_session_id: sessionId ? String(sessionId) : null,
            reason: reason || 'SIGNATURE_INVALID',
            blocked_by: sessionId ? String(sessionId) : null,
            detail,
            retry_after_ms: 0
        });
    }

    /**
     * Refresh liveness of a session WITHOUT binding a connection.
     *
     * ONLY FOR PROVEN TRAFFIC. An earlier revision called this from the refusal
     * path, on the reasoning that an incumbent whose name had just been spoken was
     * probably still around. That reasoning was wrong in a way worth recording:
     * nothing a stranger sends can SHORTEN the incumbent's window, because the
     * window is a function of the incumbent's own silence. So the call never
     * defended the incumbent against a clock-runner - it only ever EXTENDED the
     * window, which handed an attacker a real denial of service: name a session
     * repeatedly and its crowd stays locked to a token nobody (including an owner
     * that lost its credential) can produce, for as long as the noise continues.
     *
     * Without it, an idle session lapses on schedule and its own host recovers by
     * adopting, which is strictly less harmful than a permanent lockout.
     */
    touch(name) {
        const session = this.sessions.get(String(name));
        if (!session || !session.observed) return null;
        session.lastSeen = this._now();
        return session;
    }

    /**
     * Mark every session bound to this connection as detached. Agent state is
     * deliberately NOT touched: a dropped socket is not a host decision to
     * retire a crowd, and the proven reconnect behaviour preserves it.
     */
    detach(connection) {
        const detached = [];
        for (const [name, session] of this.sessions) {
            if (session.connection === connection) {
                session.connection = null;
                session.detachedAt = this._now();
                detached.push(name);
            }
        }
        return detached;
    }

    /** Is this session still allowed to defend its agents against other claimants? */
    isLive(name) {
        const session = this.sessions.get(String(name));
        if (!session) return false;
        if (session.connection && session.connection.readyState === 1) return true;
        // `observed` is what stops a restored session from looking live on the
        // strength of a timestamp taken in a previous process.
        return session.observed === true && (this._now() - session.lastSeen) < this.staleAfterMs;
    }

    ownerOf(agentId) {
        return this.owners.get(String(agentId)) || null;
    }

    /**
     * Arbitrate one claim: establish identity, then take the agent.
     * Convenience for single-agent callers; batched callers should establish
     * once and then call `claimUnder` per entry (see the note on batching).
     *
     * @param {string} agentId
     * @param {object} [request]
     * @param {string} [request.sessionId] host-chosen name; omit for an anonymous caller
     * @param {string} [request.token] server-issued token proving continuity
     * @param {'join'|'adopt'|'takeover'} [request.claim]
     * @param {object} [request.connection] the socket the claim arrived on, if any
     * @returns {{granted: boolean, outcome: string, ownerSessionId: string|null,
     *            previousOwnerSessionId: string|null, sessionToken: string|null}}
     */
    claim(agentId, request = {}) {
        const name = request.sessionId ? String(request.sessionId) : null;

        // An anonymous caller records no ownership at all. With nothing ever
        // owned, arbitration has nothing to arbitrate, so every host that
        // predates sessions behaves exactly as it did before they existed.
        if (!name) {
            return {
                granted: true,
                outcome: CLAIM_OUTCOMES.GRANTED,
                ownerSessionId: null,
                previousOwnerSessionId: this.owners.get(String(agentId)) || null,
                sessionToken: null
            };
        }

        const identity = this.establishIdentity(name, request.token, request.claim || 'join', request.connection, {
            rotate: request.rotate === true
        });
        if (!identity.established) {
            return {
                granted: false,
                outcome: identity.outcome,
                ownerSessionId: identity.ownerSessionId,
                previousOwnerSessionId: this.owners.get(String(agentId)) || null,
                sessionToken: null,
                rotated: false,
                tokenExpired: false
            };
        }

        const taken = this.claimUnder(agentId, name, { takeover: (request.claim || 'join') === 'takeover' });
        return {
            granted: taken.granted,
            outcome: taken.granted ? identity.outcome : taken.outcome,
            ownerSessionId: taken.granted ? name : taken.ownerSessionId,
            previousOwnerSessionId: taken.previousOwnerSessionId,
            sessionToken: identity.sessionToken,
            rotated: identity.rotated === true,
            tokenExpired: identity.tokenExpired === true
        };
    }

    /**
     * Resolve which session a request is speaking as.
     *
     * BATCHING NOTE: this is deliberately separate from taking agents, and a
     * batch must call it ONCE for the whole request. The token for a new session
     * is minted here and only reaches the host in the response, so per-entry
     * re-establishment would refuse every entry after the first: the client
     * cannot present a token it has not been given yet. One request, one
     * identity, then per-agent ownership inside it.
     *
     * @returns {{established: boolean, outcome: string, ownerSessionId: string|null, sessionToken: string|null}}
     */
    establishIdentity(name, token, mode = 'join', connection = null, options = {}) {
        const identity = this._settleIdentity(String(name), token, mode, connection, options.rotate === true);
        if (!identity.established) {
            this.refusals += 1;
            if (identity.ownerSessionId) {
                const owner = this.sessions.get(identity.ownerSessionId);
                if (owner) owner.claimModes.refusals += 1;
            }
            this._recordRefusal({
                verb: 'claim_identity',
                agent_id: identity.agentId || null,
                attempted_session_id: String(name),
                reason: identity.outcome,
                blocked_by: identity.ownerSessionId || null,
                retry_after_ms: identity.ownerSessionId ? this._blockerRetryAfter(identity.ownerSessionId) : 0
            });
            return identity;
        }
        const session = this.sessions.get(String(name));
        if (session) {
            if (identity.outcome === CLAIM_OUTCOMES.ADOPTED) {
                this.adoptions += 1;
                session.claimModes.adoptions += 1;
            } else if (identity.outcome === CLAIM_OUTCOMES.TAKEN_OVER) {
                this.takeovers += 1;
                session.claimModes.takeovers += 1;
            }
        }
        this._recordEvent({
            kind: 'identity',
            decision: 'granted',
            outcome: identity.outcome,
            session_id: String(name),
            // WHICH PROOF held. A returned token means none did and one was just
            // minted; otherwise the caller presented a credential that matched.
            // Worth a field because "adopted" and "taken over" look identical in
            // the outcome counters once someone asks how a crowd changed hands.
            proof: identity.sessionToken ? 'new_credential_issued' : 'presented_valid_token',
            token_issued: Boolean(identity.sessionToken),
            token_rotated: identity.rotated === true,
            token_expired: identity.tokenExpired === true
        });
        return identity;
    }

    /**
     * Take one agent for an ALREADY ESTABLISHED session.
     *
     * Per-agent arbitration still applies: a different session may own this
     * particular agent even though the request's own identity resolved fine.
     * That agent is refused unless the claimant is taking over, and a refusal
     * here mutates nothing.
     */
    claimUnder(agentId, name, { takeover = false } = {}) {
        const id = String(agentId);
        const sessionName = String(name);
        const previousOwnerSessionId = this.owners.get(id) || null;
        const session = this.sessions.get(sessionName);

        if (!session) {
            return {
                granted: false,
                outcome: CLAIM_OUTCOMES.REFUSED_OWNED_BY_LIVE_SESSION,
                ownerSessionId: null,
                previousOwnerSessionId
            };
        }

        let outcome = CLAIM_OUTCOMES.GRANTED;
        const fromAnotherSession = previousOwnerSessionId && previousOwnerSessionId !== sessionName;
        if (fromAnotherSession) {
            if (this.isLive(previousOwnerSessionId) && !takeover) {
                this.refusals += 1;
                const owner = this.sessions.get(previousOwnerSessionId);
                if (owner) owner.claimModes.refusals += 1;
                this._recordRefusal({
                    verb: 'claim_agent',
                    agent_id: id,
                    attempted_session_id: sessionName,
                    reason: CLAIM_OUTCOMES.REFUSED_OWNED_BY_LIVE_SESSION_REQUIRES_TAKEOVER,
                    blocked_by: previousOwnerSessionId,
                    retry_after_ms: this._blockerRetryAfter(previousOwnerSessionId)
                });
                return {
                    granted: false,
                    outcome: CLAIM_OUTCOMES.REFUSED_OWNED_BY_LIVE_SESSION_REQUIRES_TAKEOVER,
                    ownerSessionId: previousOwnerSessionId,
                    previousOwnerSessionId
                };
            }
            // Taking an agent from a session that is gone is an ADOPTION even
            // when this claimant's own name is brand new: the meaningful fact
            // for a host is that ownership transferred because the previous
            // holder was not there, and that is worth reporting distinctly from
            // a first-ever grant.
            outcome = takeover && this.isLive(previousOwnerSessionId)
                ? CLAIM_OUTCOMES.TAKEN_OVER
                : CLAIM_OUTCOMES.ADOPTED;
            // Counted here as well as in `establishIdentity`, because these are
            // different events: that one counts taking over a session NAME, this
            // one counts taking over an individual agent from another session.
            // Both are things a host needs to see in the summary.
            if (outcome === CLAIM_OUTCOMES.TAKEN_OVER) {
                this.takeovers += 1;
                session.claimModes.takeovers += 1;
            } else {
                this.adoptions += 1;
                session.claimModes.adoptions += 1;
            }
            this._releaseFrom(previousOwnerSessionId, id);
        }

        session.claims += 1;
        session.agentIds.add(id);
        this.owners.set(id, sessionName);
        // Recorded per AGENT, not per request: a batch of 512 is one identity
        // decision and 512 ownership decisions, and a host debugging "which NPC
        // did I lose" needs the second kind at agent granularity.
        this._recordEvent({
            kind: 'claim',
            decision: 'granted',
            outcome,
            session_id: sessionName,
            agent_id: id,
            previous_owner_session_id: fromAnotherSession ? previousOwnerSessionId : null
        });
        return {
            granted: true,
            outcome,
            ownerSessionId: sessionName,
            previousOwnerSessionId: fromAnotherSession ? previousOwnerSessionId : null
        };
    }

    /**
     * Report the more informative of two outcomes for one entry.
     * Per-agent transfer (adopted / taken over) says more than the request-level
     * identity resolution, which is usually a plain grant, so it wins when both
     * succeeded.
     */
    static mergeOutcome(identityOutcome, agentOutcome) {
        if (agentOutcome && agentOutcome !== CLAIM_OUTCOMES.GRANTED) return agentOutcome;
        return identityOutcome || CLAIM_OUTCOMES.GRANTED;
    }

    /**
     * Decide whether this claim may act as `name`.
     * Returns `established: false` when it may not, with the outcome to report.
     */
    _settleIdentity(name, token, mode, connection, rotate = false) {
        const existing = this.sessions.get(name);

        if (!existing) {
            // Rule 2: a fresh name is free. The claimant becomes the owner and
            // receives the token that will prove it is the same host next time.
            const session = this._newSession(name, { tokenHash: null, observed: true });
            this.sessions.set(name, session);
            if (connection) session.connection = connection;
            const sessionToken = this._issueToken(session, name);
            return { established: true, outcome: CLAIM_OUTCOMES.GRANTED, ownerSessionId: name, sessionToken, rotated: false, tokenExpired: false };
        }

        // Rule 1: a matching token IS the identity. Liveness is irrelevant, so a
        // host that dropped and came back - or that outlived a middleware
        // restart - is recognised without having to win an argument.
        //
        // A matching-but-expired token lands here too, and is honoured exactly
        // once: proof of possession is proof, and the response replaces the
        // credential. Refusing it instead would turn a long absence into a
        // lockout against the session's own host.
        if (tokensMatch(token, existing.tokenHash)) {
            this.bind(name, connection);
            const expired = this._tokenExpired(existing);
            if (expired || rotate) {
                const sessionToken = this._issueToken(existing, name);
                this.rotations += 1;
                if (expired) this.expiredCredentials += 1;
                return {
                    established: true,
                    outcome: CLAIM_OUTCOMES.GRANTED,
                    ownerSessionId: name,
                    sessionToken,
                    rotated: true,
                    tokenExpired: expired
                };
            }
            return {
                established: true,
                outcome: CLAIM_OUTCOMES.GRANTED,
                ownerSessionId: name,
                sessionToken: null,
                rotated: false,
                tokenExpired: false
            };
        }

        // A token was presented and it is wrong: that is a distinct, reportable
        // failure rather than a silent fall-through to name-only handling.
        if (typeof token === 'string' && token.length > 0 && existing.tokenHash) {
            this.tokenMismatches += 1;
            // No liveness refresh here: an unproven caller must not be able to
            // hold a session open by guessing at its credential. See `touch`.
            return {
                established: false,
                outcome: CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH,
                ownerSessionId: name,
                sessionToken: null
            };
        }

        const live = this.isLive(name);

        // Rule 6: explicit, counted displacement of a live owner.
        if (live && mode === 'takeover') {
            // A takeover mints a NEW session under the same name rather than
            // editing the incumbent: the old token dies with the old owner, so a
            // displaced host cannot come back with it.
            // The incumbent's token is discarded, not carried over: a displaced
            // host must not be able to return on the old credential.
            const session = this._newSession(name, { tokenHash: null, observed: true });
            const previousAgents = new Set(existing.agentIds);
            this.sessions.set(name, session);
            if (connection) session.connection = connection;
            session.agentIds = previousAgents;
            for (const agentId of previousAgents) this.owners.set(agentId, name);
            const sessionToken = this._issueToken(session, name);
            return { established: true, outcome: CLAIM_OUTCOMES.TAKEN_OVER, ownerSessionId: name, sessionToken, rotated: false, tokenExpired: false };
        }

        if (live) {
            // Rule 4. Nothing is mutated, and specifically no liveness is
            // refreshed: the incumbent's window is measured from the incumbent's
            // own last proven message, so a name-knowing stranger can neither
            // shorten it nor extend it. `touch` records why that matters.
            return {
                established: false,
                outcome: CLAIM_OUTCOMES.REFUSED_OWNED_BY_LIVE_SESSION_REQUIRES_TAKEOVER,
                ownerSessionId: name,
                sessionToken: null
            };
        }

        // Rule 3: the incumbent is not live, so there is nobody to protect. The
        // name is re-established under a new session and a NEW token; the old
        // token is retired, so the previous holder cannot return with it.
        const session = this._newSession(name, { tokenHash: null, observed: true });
        const priorAgents = new Set(existing.agentIds);
        this.sessions.set(name, session);
        if (connection) session.connection = connection;
        session.agentIds = priorAgents;
        for (const agentId of priorAgents) this.owners.set(agentId, name);
        const sessionToken = this._issueToken(session, name);
        return { established: true, outcome: CLAIM_OUTCOMES.ADOPTED, ownerSessionId: name, sessionToken, rotated: false, tokenExpired: false };
    }

    /**
     * End this session now, on the host's own instruction.
     *
     * Refused unless the caller proves it holds the credential: revoking is the
     * most destructive verb a session has, and a bare name must never be enough
     * for it. The agents stay REGISTERED - they are the host's crowd, not the
     * session's - but ownership is released, so a fresh session can claim them
     * immediately rather than waiting out the staleness window.
     *
     * A stolen token can revoke. That is inherent to revocation-by-credential,
     * and it is why the response names the agents that were released rather than
     * quietly doing nothing on refusal.
     */
    revoke(name, token) {
        const sessionName = String(name);
        const session = this.sessions.get(sessionName);
        if (!session) {
            return { revoked: false, reason: 'NO_SUCH_SESSION', released_agents: [] };
        }
        if (!tokensMatch(token, session.tokenHash)) {
            this.tokenMismatches += 1;
            this._recordRefusal({
                verb: 'revoke',
                agent_id: null,
                attempted_session_id: sessionName,
                reason: CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH,
                blocked_by: sessionName,
                retry_after_ms: this._blockerRetryAfter(sessionName)
            });
            return { revoked: false, reason: CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH, released_agents: [] };
        }
        const released = [...session.agentIds];
        this.sessions.delete(sessionName);
        for (const agentId of released) {
            if (this.owners.get(agentId) === sessionName) this.owners.delete(agentId);
        }
        this.revocations += 1;
        this._recordEvent({
            kind: 'revoke',
            decision: 'revoked',
            session_id: sessionName,
            released_agent_count: released.length
        });
        return { revoked: true, reason: null, released_agents: released };
    }

    /**
     * May this caller remove this agent?
     *
     * Three answers, all deliberate:
     *   - nobody owns it          -> yes. Nothing to protect, and this is what
     *                                every pre-session host still does.
     *   - the caller owns it      -> yes, proven by token.
     *   - a DEAD session owns it  -> yes, reported as RELEASED_OWNER_STALE. The
     *                                owner is not live, which is exactly the
     *                                window in which its agents are adoptable by
     *                                anyone, so this grants nothing new.
     *   - a LIVE session owns it  -> no, and nothing is mutated.
     *
     * Never mutates: the caller releases on an `allowed` answer, so a refusal can
     * not half-apply.
     */
    authorizeTeardown(agentId, { sessionId = null, token = null } = {}) {
        const id = String(agentId);
        const owner = this.owners.get(id) || null;
        if (!owner) {
            return { allowed: true, outcome: TEARDOWN_OUTCOMES.RELEASED_ORPHAN, owner_session_id: null };
        }
        const proven = sessionId ? this.proves(sessionId, token) : false;
        if (proven && String(sessionId) === owner) {
            return { allowed: true, outcome: TEARDOWN_OUTCOMES.RELEASED, owner_session_id: owner };
        }
        if (!this.isLive(owner)) {
            this.staleReleases += 1;
            return { allowed: true, outcome: TEARDOWN_OUTCOMES.RELEASED_OWNER_STALE, owner_session_id: owner };
        }
        this.teardownRefusals += 1;
        const ownerSession = this.sessions.get(owner);
        if (ownerSession) ownerSession.claimModes.refusals += 1;
        this._recordRefusal({
            verb: 'unregister',
            agent_id: id,
            attempted_session_id: sessionId ? String(sessionId) : null,
            reason: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER,
            blocked_by: owner,
            retry_after_ms: this._blockerRetryAfter(owner)
        });
        return { allowed: false, outcome: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER, owner_session_id: owner };
    }

    /**
     * May this caller clear the world?
     *
     * Allowed when no agent is owned, when every owned agent belongs to the
     * caller's own PROVEN session, or when the remaining owners are no longer
     * live. Refused while another live session holds agents, with the blocking
     * sessions named so the operator can see who to stop rather than only that
     * something said no. A middleware restart is the deliberate escape hatch:
     * restored sessions are unbound and therefore not live.
     */
    authorizeReset({ sessionId = null, token = null } = {}) {
        const provenName = sessionId && this.proves(sessionId, token) ? String(sessionId) : null;
        const blocked = [];
        for (const [id, owner] of this.owners) {
            if (provenName && owner === provenName) continue;
            if (!this.isLive(owner)) continue;
            if (!blocked.includes(owner)) blocked.push(owner);
        }
        if (blocked.length === 0) {
            return { allowed: true, blocked_by: [], blocked_agents: 0 };
        }
        this.teardownRefusals += 1;
        this._recordRefusal({
            verb: 'reset',
            agent_id: null,
            attempted_session_id: provenName,
            reason: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER,
            blocked_by: blocked.slice(0, MAX_REPORTED_BLOCKERS),
            blocked_by_count: blocked.length,
            retry_after_ms: this._blockerRetryAfter(blocked[0])
        });
        return { allowed: false, blocked_by: blocked.slice(0, MAX_REPORTED_BLOCKERS), blocked_agents: blocked.length };
    }

    _releaseFrom(name, agentId) {
        const session = this.sessions.get(name);
        if (!session) return;
        session.agentIds.delete(agentId);
        if (this.owners.get(agentId) === name) this.owners.delete(agentId);
    }

    /** Drop ownership of one agent (explicit unregister, or its removal). */
    release(agentId) {
        const id = String(agentId);
        const name = this.owners.get(id);
        if (!name) return null;
        this.owners.delete(id);
        const session = this.sessions.get(name);
        if (session) session.agentIds.delete(id);
        return name;
    }

    /** Drop ownership of many agents. Returns how many were owned. */
    releaseAll(agentIds) {
        let released = 0;
        for (const id of agentIds) {
            if (this.release(id) !== null) released += 1;
        }
        return released;
    }

    /**
     * Forget every session and every ownership record (a reset that clears
     * agents, or the moment before a snapshot is restored).
     *
     * The refusal log survives on purpose: it is a diagnostic of what happened,
     * not a record of who owns what, and a designer who clears the world after
     * watching a fight needs the explanation more than they need a blank pane.
     * It is bounded, so it cannot grow.
     */
    clear() {
        this.sessions.clear();
        this.owners.clear();
    }

    /** Drop sessions with no agents and no recent proven traffic. */
    prune() {
        const pruned = [];
        for (const [name, session] of this.sessions) {
            if (session.agentIds.size === 0 && !this.isLive(name)) {
                this.sessions.delete(name);
                pruned.push(name);
            }
        }
        return pruned;
    }

    // ---------------------------------------------------------------------
    // Snapshot integration
    //
    // Ownership is server-level state, so it rides along in the snapshot as a
    // SERVER-level extension rather than inside the simulation's own schema.
    // Only token HASHES are exported, so a snapshot is not a credential store.
    // ---------------------------------------------------------------------

    /** Serializable ownership, without tokens. */
    exportSessions() {
        const sessions = [];
        for (const [name, session] of this.sessions) {
            sessions.push({
                session_id: name,
                token_hash: session.tokenHash,
                // The PUBLIC signing key rides along, deliberately. It is not a
                // secret, and a restarted middleware that forgot it would keep
                // insisting the returning host sign a challenge its key can no
                // longer be matched against - turning a crash into a lockout.
                signing_public_key: session.signingPublicKey || null,
                signing_key_id: session.signingKeyId || null,
                signing_key_set_at: session.signingKeySetAt || null,
                // Issuance time rides along so expiry is measured from when the
                // credential was actually made, not from when it was loaded.
                token_issued_at: session.tokenIssuedAt,
                agent_ids: [...session.agentIds],
                first_seen: session.firstSeen,
                last_seen: session.lastSeen,
                claims: session.claims,
                adoptions: session.claimModes.adoptions,
                takeovers: session.claimModes.takeovers,
                refusals: session.claimModes.refusals
            });
        }
        return sessions;
    }

    /**
     * Rehydrate ownership from a snapshot.
     *
     * Every restored session begins UNBOUND: `observed` is false and no
     * connection is attached, so nothing restored reads as live. A host that
     * kept its token is recognised by rule 1 regardless; a host that lost it
     * adopts, because the incumbent is not live. A restored session therefore
     * never blocks the very host it belongs to.
     *
     * @returns {{restored: number, agents: number, skipped: number}}
     */
    restoreSessions(sessions) {
        if (!Array.isArray(sessions)) return { restored: 0, agents: 0, skipped: 0 };
        let restored = 0;
        let agents = 0;
        let skipped = 0;
        for (const entry of sessions) {
            if (!entry || typeof entry !== 'object') { skipped += 1; continue; }
            const name = typeof entry.session_id === 'string' ? entry.session_id.trim() : '';
            if (!name) { skipped += 1; continue; }
            const session = this._newSession(name, {
                tokenHash: typeof entry.token_hash === 'string' ? entry.token_hash : null,
                // A restored key is accepted only if it still parses: a corrupted
                // snapshot must not leave a session that can never be signed for,
                // and it must not make `hasSigningKey` claim a key it cannot use.
                signingPublicKey: isUsablePublicKey(entry.signing_public_key) ? entry.signing_public_key : null,
                signingKeyId: isUsablePublicKey(entry.signing_public_key)
                    ? (typeof entry.signing_key_id === 'string' ? entry.signing_key_id : publicKeyFingerprint(entry.signing_public_key))
                    : null,
                signingKeySetAt: Number.isFinite(entry.signing_key_set_at) ? entry.signing_key_set_at : null,
                observed: false,
                // A snapshot written before issuance times existed leaves this
                // null, which `_tokenExpired` reads as unexpired rather than as
                // a dead credential.
                tokenIssuedAt: Number.isFinite(entry.token_issued_at) ? entry.token_issued_at : null
            });
            if (Number.isFinite(entry.first_seen)) session.firstSeen = entry.first_seen;
            if (Number.isFinite(entry.last_seen)) session.lastSeen = entry.last_seen;
            if (Array.isArray(entry.agent_ids)) {
                for (const agentId of entry.agent_ids) {
                    if (typeof agentId !== 'string' || agentId.length === 0) continue;
                    session.agentIds.add(agentId);
                    this.owners.set(agentId, name);
                    agents += 1;
                }
            }
            if (entry.claimModes === undefined) {
                session.claimModes = {
                    adoptions: Number(entry.adoptions) || 0,
                    takeovers: Number(entry.takeovers) || 0,
                    refusals: Number(entry.refusals) || 0
                };
            }
            session.claims = Number(entry.claims) || 0;
            if (!session.tokenHash) session.tokenHash = null;
            this.sessions.set(name, session);
            restored += 1;
        }
        return { restored, agents, skipped };
    }

    /**
     * Host-visible ownership summary. Token HASHES are never exposed: a summary
     * is safe to read, log and display.
     */
    summary() {
        const sessions = [];
        for (const [name, session] of this.sessions) {
            sessions.push({
                session_id: name,
                agent_count: session.agentIds.size,
                attached: Boolean(session.connection),
                live: this.isLive(name),
                observed_this_process: session.observed === true,
                // Whether a returning host can prove continuity. False means the
                // name alone is all anyone has, and adoption-after-staleness is
                // the only way back.
                has_token: Boolean(session.tokenHash),
                // Whether this host has committed to signing. Its presence is
                // what makes the TOKEN insufficient under the `required` policy,
                // so a designer needs to see it per session.
                has_signing_key: Boolean(session.signingPublicKey),
                // A public-key fingerprint. Safe to display and safe to log: it
                // identifies a key without being usable as one.
                signing_key_id: session.signingKeyId || null,
                // Reported per session because an expiring credential is exactly
                // the thing a host needs warning about before it silently
                // degrades into name-only adoption.
                token_age_ms: Number.isFinite(session.tokenIssuedAt) ? this._now() - session.tokenIssuedAt : null,
                token_expires_in_ms: this.tokenTtlMs > 0 && Number.isFinite(session.tokenIssuedAt)
                    ? Math.max(0, this.tokenTtlMs - (this._now() - session.tokenIssuedAt))
                    : null,
                detached_at: session.detachedAt,
                claims: session.claims,
                adoptions: session.claimModes.adoptions,
                takeovers: session.claimModes.takeovers,
                refusals: session.claimModes.refusals
            });
        }
        sessions.sort((a, b) => b.agent_count - a.agent_count || a.session_id.localeCompare(b.session_id));
        return {
            active: this.active,
            owned_agents: this.owners.size,
            session_count: this.sessions.size,
            tokenized_sessions: sessions.filter((s) => s.has_token).length,
            issues: this.issues,
            adoptions: this.adoptions,
            takeovers: this.takeovers,
            refusals: this.refusals,
            token_mismatches: this.tokenMismatches,
            stale_after_ms: this.staleAfterMs,
            // Credential lifecycle and destructive-verb accounting. These are
            // diagnostics, not policy: nothing here is consulted when deciding a
            // claim.
            token_ttl_ms: this.tokenTtlMs,
            signing_key_sessions: sessions.filter((s) => s.has_signing_key).length,
            signing_key_registrations: this.signingKeyRegistrations,
            signing_key_replacements: this.signingKeyReplacements,
            signature_refusals: this.signatureRefusals,
            rotations: this.rotations,
            expired_credentials: this.expiredCredentials,
            revocations: this.revocations,
            teardown_refusals: this.teardownRefusals,
            stale_owner_releases: this.staleReleases,
            refusals_by_reason: { ...this.refusalsByReason },
            // Newest first, bounded. This is what turns "a claim was refused"
            // into "this host lost this agent to that session, and that session
            // goes quiet in 18s", which is the difference between a number and
            // something a designer can act on.
            recent_refusals: this.refusalLog.map((entry) => ({ ...entry })),
            // The identity AUDIT TIMELINE: the same decisions plus the ones that
            // were granted, in one ordered stream, so "what happened to my
            // session" has an answer that is not a diff of counters. Every row is
            // a name, an id, an outcome and a timestamp; no token, no signature,
            // no key body, so it is safe on the same token-free surface as the
            // rest of the ownership view.
            timeline: this.eventLog.map((entry) => ({ ...entry })),
            events_recorded: this.eventsRecorded,
            timeline_limit: EVENT_LOG_LIMIT,
            // Stated rather than implied. This ring is NOT part of a snapshot, so
            // after a restart it is empty even though the sessions it described
            // are still there. A reader who assumes otherwise would read "no
            // events" as "nothing happened".
            timeline_scope: 'THIS_PROCESS',
            sessions
        };
    }
}

/** Convenience for callers that want to know whether an outcome handed over ownership. */
export function outcomeGrantsOwnership(outcome) {
    return GRANTING_OUTCOMES.has(outcome);
}

/** True when the outcome means a NEW token was minted and must reach the host. */
export function outcomeIssuesToken(outcome) {
    return outcome === CLAIM_OUTCOMES.GRANTED || outcome === CLAIM_OUTCOMES.ADOPTED || outcome === CLAIM_OUTCOMES.TAKEN_OVER;
}
