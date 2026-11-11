/**
 * Host-authoritative destructive-request policy, shared by HTTP and WebSocket.
 *
 * Authorize before touching ownership or simulation state. The caller remains
 * responsible for route order, releasing claims, and mutating the simulation.
 */
import { TEARDOWN_OUTCOMES } from './ClaimArbitration.js';

export function authorizeHostTeardown(claims, agentId, envelope = {}) {
    return claims.authorizeTeardown(agentId, {
        sessionId: envelope.session_id || null,
        token: envelope.session_token || null
    });
}

export function authorizeHostReset(claims, envelope) {
    return claims.authorizeReset({
        sessionId: envelope?.session_id || null,
        token: envelope?.session_token || null
    });
}

/** The common HTTP/WS fields must not drift as transports evolve. */
export function teardownRefusal(claims, agentId, permit) {
    return {
        status: 'REFUSED',
        agent_id: agentId,
        code: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER,
        owner_session_id: permit.owner_session_id,
        retry_after_ms: claims.retryAfterFor(permit.owner_session_id)
    };
}

export function batchTeardownRefusal(agentId, permit) {
    return {
        agent_id: agentId,
        reason: permit.outcome,
        owner_session_id: permit.owner_session_id
    };
}

export function resetRefusal(permit) {
    return {
        status: 'REFUSED',
        code: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER,
        agent_id: null,
        blocked_by: permit.blocked_by,
        blocked_sessions: permit.blocked_agents,
        hint: 'a live session owns agents; unregister them first, or present that session\'s session_token'
    };
}
