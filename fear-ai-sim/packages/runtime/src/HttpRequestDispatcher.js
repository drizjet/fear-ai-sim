/**
 * HTTP transport ingress. Method selection, body-read failures, signing gates
 * and route dispatch order stay here; simulation and ownership verbs remain
 * on FearServer._routeHttpPost, after all transport checks succeed.
 */
import { PROTOCOL_VERSION, ERROR_CODES } from '../../protocol/index.js';

export function dispatchHttpRequest(server, req, res) {
    // Universal CORS headers for WebGL / browser engine integrations
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Fear-Signature, X-Fear-Signature-Issued-At, X-Fear-Signature-Nonce, X-Fear-Signature-Key-Id, *');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${server.host}:${server.port}`);
    const path = url.pathname;

    if (req.method === 'GET') {
        // Even reads pass the signing gate before route resolution.
        const gate = server._gateSignature({ method: req.method, target: req.url, rawBody: '', headers: req.headers, sessionIdHint: null });
        if (!gate.ok) return server._sendSignatureRefusal(res, gate, req.url);
        if (path === '/' || path === '/health' || path === '/api/v1/status') {
            server._sendJson(res, 200, {
                status: 'ok',
                protocol_version: PROTOCOL_VERSION,
                server: 'Fear AI Middleware Server',
                simulation: server.simulation.getStatus()
            });
            return;
        }
        // The host-visible session list includes the signing policy; it is not
        // an anonymous bypass for an otherwise signed read.
        if (path === '/api/v1/sessions') {
            server._sendJson(res, 200, { ...server.claims.summary(), signing: server.signing.summary() });
            return;
        }
        server._sendJson(res, 404, { error: 'Not found' });
        return;
    }

    if (req.method === 'POST') {
        server._readJsonBody(req, res, (err, body, raw) => {
            if (err) {
                server._sendJson(res, 400, {
                    error: 'Malformed JSON payload',
                    code: ERROR_CODES.MALFORMED_MESSAGE
                });
                return;
            }

            // Verify exact raw bytes, before interpreting or dispatching body.
            const gate = server._gateSignature({
                method: req.method,
                target: req.url,
                rawBody: raw === undefined ? '' : raw,
                headers: req.headers,
                sessionIdHint: body && typeof body.session_id === 'string' ? body.session_id : null
            });
            if (!gate.ok) return server._sendSignatureRefusal(res, gate, req.url, body);

            try {
                server._routeHttpPost(path, body, res);
            } catch (dispatchErr) {
                server._sendJson(res, 500, {
                    error: dispatchErr.message,
                    code: ERROR_CODES.SIMULATION_ERROR
                });
            }
        });
        return;
    }

    server._sendJson(res, 405, { error: 'Method not allowed' });
}
