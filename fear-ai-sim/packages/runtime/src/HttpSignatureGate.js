/**
 * HTTP request-signing boundary for FearServer.
 *
 * Verify before route dispatch, and record failures in the same ownership
 * refusal log used for diagnostics. Keep this separate from the WebSocket
 * challenge and from simulation/host authorization decisions.
 */
import { SIGNATURE_FAILURES, readSignatureHeaders } from './RequestSigning.js';

export function verifyHttpSignatureGate(signing, claims, { method, target, rawBody, headers, sessionIdHint = null }) {
    if (!signing.enabled) return { ok: true, reason: null };
    const presented = readSignatureHeaders(headers);
    const named = presented.sessionId || (sessionIdHint ? String(sessionIdHint) : null);
    const verdict = signing.verifyHttpRequest({
        method,
        target,
        rawBody,
        headers,
        sessionRecord: named ? claims.signingRecord(named) : null,
        sessionIdHint
    });
    if (!verdict.ok) {
        claims.recordSignatureRefusal({
            verb: `${String(method).toUpperCase()} ${String(target)}`,
            sessionId: named,
            reason: verdict.reason
        });
    }
    return verdict;
}

/** Same wire response and explanatory hints as the existing HTTP gate. */
export function signatureRefusalBody(signing, gate, target, body = null) {
    const hints = {
        [SIGNATURE_FAILURES.MISSING]: 'this session has a signing key, so its token alone is not sufficient: sign the request with the session private key',
        [SIGNATURE_FAILURES.INVALID]: 'the signature does not cover this method, target and body, or it was not made with the registered key',
        [SIGNATURE_FAILURES.REPLAY]: 'this nonce has already been accepted; every request needs a fresh one',
        [SIGNATURE_FAILURES.STALE]: 'issued_at is outside the accepted clock skew',
        [SIGNATURE_FAILURES.UNKNOWN_KEY]: 'no key is registered for this session, or the key id does not match',
        [SIGNATURE_FAILURES.MALFORMED]: 'the signature header set is incomplete or not base64',
        [SIGNATURE_FAILURES.UNSUPPORTED_ALG]: 'this server verifies RS256 only'
    };
    return {
        status: 'REFUSED',
        error: 'Request signature refused',
        code: gate.reason,
        policy: signing.policy,
        signature_required: gate.required === true,
        target: String(target),
        session_id: body && typeof body.session_id === 'string' ? body.session_id : null,
        hint: hints[gate.reason] || 'see RequestSigning.js for the canonical signing input'
    };
}
