/**
 * WebSocket text-envelope preflight. Identity binding must precede signing
 * refusal, and validation must follow signing, before any simulation verb.
 *
 * The server retains challenge handling, authenticated socket state, and the
 * validated message dispatcher. Keep its instance hooks callable so existing
 * host integrations and test doubles observe the same ordering.
 */
import { ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

export function preflightWsMessage(server, ws, msg) {
    const correlationId = msg && typeof msg === 'object'
        ? (msg.message_id || msg.id || null)
        : null;

    // A session name without a proven credential must not refresh liveness.
    server._bindWsIdentity(ws, msg);

    const wsGate = server._gateWsEnvelope(ws, msg);
    if (!wsGate.ok) {
        return {
            ok: false,
            response: server._sendWsError(
                ws,
                wsGate.detail,
                ERROR_CODES.VALIDATION_FAILED,
                correlationId,
                { code: wsGate.reason, session_id: wsGate.sessionId }
            )
        };
    }

    const validated = ProtocolValidator.validateIncomingMessage(msg);
    if (!validated.valid) {
        return {
            ok: false,
            response: server._sendWsError(
                ws,
                validated.errors?.join(', ') || 'Validation failed',
                validated.code,
                correlationId
            )
        };
    }

    return { ok: true, payload: validated.value, correlationId };
}
