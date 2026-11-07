/**
 * External-host registration identity and signing-key policy.
 *
 * Session establishment and per-agent arbitration belong to ClaimArbitration;
 * this boundary translates validated host envelopes into its decisions. The
 * server retains transport route order and all simulation mutations.
 */
import { CLAIM_OUTCOMES } from './ClaimArbitration.js';

/** Unnamed legacy hosts are granted without recording any ownership. */
export function admitHostClaim(claims, entry, envelope = {}, connection = null) {
    const sessionId = entry.session_id || envelope.session_id || null;
    if (!sessionId) {
        return {
            granted: true, claim: CLAIM_OUTCOMES.GRANTED,
            session_id: null, owner_session_id: null, session_token: null
        };
    }
    const result = claims.claim(entry.agent_id, {
        sessionId,
        token: entry.session_token || envelope.session_token,
        claim: entry.claim || envelope.claim || 'join',
        rotate: entry.rotate_token === true || envelope.rotate_token === true,
        connection
    });
    return {
        granted: result.granted,
        claim: result.outcome,
        session_id: String(sessionId),
        owner_session_id: result.ownerSessionId,
        // Only newly established or rotated credentials are returned.
        session_token: result.sessionToken,
        token_rotated: result.rotated === true,
        token_expired: result.tokenExpired === true
    };
}

/** Signing-key registration follows successful identity establishment. */
export function registerHostSigningKey(claims, envelope, sessionId) {
    const pem = envelope && typeof envelope.signing_public_key === 'string' ? envelope.signing_public_key : null;
    if (!pem || !sessionId) return null;
    const result = claims.registerSigningKey(sessionId, pem, {
        token: envelope.session_token || null
    });
    return {
        outcome: result.outcome,
        registered: result.registered,
        replaced: result.replaced,
        key_id: result.key_id
    };
}

/** One identity for an entire registration batch, never one per entry. */
export function establishHostRequestIdentity(claims, envelope, firstEntry = {}, connection = null) {
    const sessionId = envelope.session_id || firstEntry.session_id || null;
    if (!sessionId) {
        return {
            established: true, claim: CLAIM_OUTCOMES.GRANTED,
            session_id: null, session_token: null, owner_session_id: null
        };
    }
    const identity = claims.establishIdentity(
        sessionId,
        envelope.session_token || firstEntry.session_token,
        envelope.claim || firstEntry.claim || 'join',
        connection,
        { rotate: envelope.rotate_token === true || firstEntry.rotate_token === true }
    );
    return {
        established: identity.established,
        claim: identity.outcome,
        session_id: String(sessionId),
        session_token: identity.sessionToken,
        owner_session_id: identity.ownerSessionId,
        token_rotated: identity.rotated === true,
        token_expired: identity.tokenExpired === true
    };
}
