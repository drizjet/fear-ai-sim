/**
 * FearServer - Dual-transport WebSocket & HTTP REST server for Fear AI middleware.
 * Listens on loopback (default 127.0.0.1:8765) to service Unity, Unreal, Godot,
 * and custom game engines with sub-millisecond local latency.
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { RuntimeSimulation } from './RuntimeSimulation.js';
import { ValleyChainScenario } from '../../core/index.js';
import {
    PROTOCOL_VERSION,
    MESSAGE_TYPES,
    ERROR_CODES,
    ProtocolValidator,
    BinaryWireProtocol,
    BINARY_MAGIC,
    FRAME_TYPES,
    INTENT_CODES
} from '../../protocol/index.js';

export class FearServer {
    /**
     * @param {object} [options={}]
     */
    constructor(options = {}) {
        this.host = options.host || '127.0.0.1';
        // R6: same port-0 coercion defect as the dashboard server — finite
        // numbers >= 0 pass through floored (0 = OS ephemeral); garbage
        // falls back to the default.
        this.port = Number.isFinite(Number(options.port)) && Number(options.port) >= 0
            ? Math.floor(Number(options.port))
            : 8765;
        this.allowRemoteAccess = Boolean(options.allowRemoteAccess);
        if ((this.host === '0.0.0.0' || this.host === '::') && !this.allowRemoteAccess) {
            console.warn('[FearServer] Public bind requested without allowRemoteAccess=true; defaulting safely to 127.0.0.1.');
            this.host = '127.0.0.1';
        }
        this.simulation = new RuntimeSimulation(options);
        this.chainScenario = new ValleyChainScenario();
        this.maxPayloadBytes = options.maxPayloadBytes || (50 * 1024 * 1024);

        this.httpServer = null;
        this.wss = null;
        this.connectedClients = new Set();
        this.isRunning = false;
    }

    /**
     * Start server listening
     * @returns {Promise<{ host: string, port: number }>}
     */
    start() {
        if (this.isRunning) {
            return Promise.resolve({ host: this.host, port: this.port });
        }

        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((req, res) => this._handleHttpRequest(req, res));

            this.wss = new WebSocketServer({
                server: this.httpServer,
                maxPayload: this.maxPayloadBytes,
                perMessageDeflate: false
            });
            this.wss.on('connection', (ws, req) => this._handleWsConnection(ws, req));

            this.httpServer.on('error', (err) => {
                if (!this.isRunning) {
                    reject(err);
                } else {
                    console.error('[FearServer] Server error:', err.message);
                }
            });

            this.httpServer.on('clientError', (err, socket) => {
                if (socket && socket.writable) {
                    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                }
            });

            this.httpServer.listen(this.port, this.host, () => {
                this.isRunning = true;
                // Report the OS-bound port so port 0 resolves to the actual
                // listening port (mirrors DesignerDashboardServer).
                const bound = this.httpServer.address();
                if (bound && typeof bound.port === 'number') this.port = bound.port;
                resolve({ host: this.host, port: this.port });
            });
        });
    }

    /**
     * Stop server and disconnect all clients cleanly
     * @returns {Promise<void>}
     */
    stop() {
        if (!this.isRunning) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            for (const ws of this.connectedClients) {
                try {
                    ws.close(1000, 'Server stopping');
                } catch {
                    // Ignore socket close errors
                }
            }
            this.connectedClients.clear();

            if (this.wss) {
                this.wss.close(() => {
                    if (this.httpServer) {
                        this.httpServer.close(() => {
                            this.isRunning = false;
                            resolve();
                        });
                    } else {
                        this.isRunning = false;
                        resolve();
                    }
                });
            } else if (this.httpServer) {
                this.httpServer.close(() => {
                    this.isRunning = false;
                    resolve();
                });
            } else {
                this.isRunning = false;
                resolve();
            }
        });
    }

    // -------------------------------------------------------------------------
    // HTTP Request Routing
    // -------------------------------------------------------------------------

    _handleHttpRequest(req, res) {
        // Universal CORS headers for WebGL / browser engine integrations
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://${this.host}:${this.port}`);
        const path = url.pathname;

        if (req.method === 'GET') {
            if (path === '/' || path === '/health' || path === '/api/v1/status') {
                this._sendJson(res, 200, {
                    status: 'ok',
                    protocol_version: PROTOCOL_VERSION,
                    server: 'Fear AI Middleware Server',
                    simulation: this.simulation.getStatus()
                });
                return;
            }
            this._sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (req.method === 'POST') {
            this._readJsonBody(req, res, (err, body) => {
                if (err) {
                    this._sendJson(res, 400, {
                        error: 'Malformed JSON payload',
                        code: ERROR_CODES.MALFORMED_MESSAGE
                    });
                    return;
                }

                try {
                    this._routeHttpPost(path, body, res);
                } catch (dispatchErr) {
                    this._sendJson(res, 500, {
                        error: dispatchErr.message,
                        code: ERROR_CODES.SIMULATION_ERROR
                    });
                }
            });
            return;
        }

        this._sendJson(res, 405, { error: 'Method not allowed' });
    }

    _routeHttpPost(path, body, res) {
        switch (path) {
            case '/api/v1/handshake': {
                const val = ProtocolValidator.validateHandshake(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.HANDSHAKE_RESPONSE,
                    protocol_version: PROTOCOL_VERSION,
                    status: 'ACCEPTED',
                    client_id: val.value.client_id,
                    server_time_ms: Date.now()
                });
            }

            case '/api/v1/register': {
                const val = ProtocolValidator.validateRegisterAgent(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                const agent = this.simulation.registerAgent(val.value.agent_id, val.value.traits, {
                    name: val.value.name,
                    initial_position: val.value.initial_position
                });
                return this._sendJson(res, 200, {
                    status: 'REGISTERED',
                    agent_id: agent.id,
                    traits: agent.traits
                });
            }

            case '/api/v1/unregister': {
                const val = ProtocolValidator.validateUnregisterAgent(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                const removed = this.simulation.unregisterAgent(val.value.agent_id);
                return this._sendJson(res, 200, { status: removed ? 'UNREGISTERED' : 'NOT_FOUND', agent_id: val.value.agent_id });
            }

            case '/api/v1/observation': {
                const val = ProtocolValidator.validateObservation(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                this.simulation.queueObservation(val.value.agent_id, val.value);
                return this._sendJson(res, 200, { status: 'QUEUED', agent_id: val.value.agent_id });
            }

            case '/api/v1/tick': {
                let observations = [];
                if (body && body.observations) {
                    const batchVal = ProtocolValidator.validateBatchTick(body);
                    observations = batchVal.value.observations;
                } else if (body && body.agent_id) {
                    const singleVal = ProtocolValidator.validateObservation(body);
                    if (singleVal.valid) observations = [singleVal.value];
                }
                const dt = body?.dt ?? 0.0166;
                const results = this.simulation.batchTick(observations, dt);
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                });
            }

            case '/api/v1/batch_tick': {
                const val = ProtocolValidator.validateBatchTick(body || {});
                const results = this.simulation.batchTick(val.value.observations, val.value.dt);
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                });
            }

            case '/api/v1/trauma': {
                const zoneId = this.simulation.addTraumaZone(
                    body.x, body.y, body.z ?? 0,
                    body.intensity ?? 1.0,
                    body.radius ?? 150,
                    body.lifetimeTicks ?? 1800
                );
                return this._sendJson(res, 200, { status: 'ADDED', zone_id: zoneId });
            }

            case '/api/v1/social/event': {
                // NOW-25: host-reported semantic social event. Same contract
                // as RuntimeSimulation.reportSocialEvent; transport-only
                // validation here, advisory state changes inside.
                const val = ProtocolValidator.validateSocialEvent(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                let result;
                try {
                    result = this.simulation.reportSocialEvent({
                        event: val.value.event,
                        actorId: val.value.actor_id,
                        targetId: val.value.target_id,
                        weight: val.value.weight,
                        witnesses: val.value.witnesses,
                        exposed: val.value.exposed,
                        severity: val.value.severity
                    });
                } catch (err) {
                    return this._sendJson(res, 400, { error: err.message, code: ERROR_CODES.VALIDATION_FAILED });
                }
                if (result === null) {
                    return this._sendJson(res, 400, { error: 'Social reporting is disabled on this server', code: ERROR_CODES.VALIDATION_FAILED });
                }
                return this._sendJson(res, 200, {
                    status: 'APPLIED',
                    event: val.value.event,
                    actor_id: val.value.actor_id,
                    target_id: val.value.target_id,
                    trauma_id: result.traumaId,
                    direct: result.direct,
                    witness_updates: result.witnessUpdates
                });
            }

            case '/api/v1/pacing': {
                this.simulation.pacing.setOverride(body.intensity ?? null);
                return this._sendJson(res, 200, { status: 'UPDATED', pacing: this.simulation.pacing.getState() });
            }

            case '/api/v1/reset': {
                const clearAgents = Boolean(body?.clear_agents);
                this.simulation.reset({ clearAgents });
                return this._sendJson(res, 200, { status: 'RESET', tick: 0, agentCount: this.simulation.agents.size });
            }

            case '/api/v1/save': {
                const snapshot = this.simulation.saveSnapshot();
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.SNAPSHOT_RESPONSE,
                    snapshot
                });
            }

            case '/api/v1/load': {
                if (!body.snapshot) {
                    return this._sendJson(res, 400, { error: 'Missing snapshot object', code: ERROR_CODES.VALIDATION_FAILED });
                }
                const loadResult = this.simulation.loadSnapshot(body.snapshot);
                if (!loadResult.success) {
                    return this._sendJson(res, 400, { error: loadResult.error, code: 'UNSUPPORTED_SNAPSHOT_VERSION' });
                }
                return this._sendJson(res, 200, { status: 'LOADED', tick: this.simulation.tickCount, agentCount: this.simulation.agents.size });
            }

            case '/api/v1/advisory/chain': {
                // Canonical valley advisory chain for Godot Station 10 and any
                // HTTP host: deterministic, bounded, advisory-only.
                const seed = body?.seed === undefined ? 424242 : Number(body.seed);
                if (!Number.isInteger(seed)) {
                    return this._sendJson(res, 400, { error: 'seed must be an integer', code: ERROR_CODES.VALIDATION_FAILED });
                }
                const report = this.chainScenario.run({ seed });
                return this._sendJson(res, 200, {
                    type: 'ADVISORY_CHAIN_RESPONSE',
                    seed: report.seed,
                    links: report.links,
                    checks: report.checks,
                    unbroken: report.unbroken,
                    summary: report.summary
                });
            }

            default:
                return this._sendJson(res, 404, { error: `Endpoint ${path} not found` });
        }
    }

    _readJsonBody(req, res, callback) {
        let raw = '';
        let destroyed = false;
        req.on('data', (chunk) => {
            if (destroyed) return;
            raw += chunk;
            if (raw.length > this.maxPayloadBytes) {
                destroyed = true;
                this._sendJson(res, 413, {
                    error: 'Payload Too Large',
                    code: 'PAYLOAD_TOO_LARGE',
                    maxPayloadBytes: this.maxPayloadBytes
                });
                res.on('finish', () => {
                    try { req.destroy(); } catch {}
                });
            }
        });
        req.on('end', () => {
            if (destroyed) return;
            if (!raw || raw.trim() === '') {
                callback(null, {});
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                callback(null, parsed);
            } catch (err) {
                callback(err);
            }
        });
        req.on('error', (err) => {
            if (!destroyed) {
                callback(err);
            }
        });
    }

    _sendJson(res, status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    // -------------------------------------------------------------------------
    // WebSocket Connection Routing
    // -------------------------------------------------------------------------

    _handleWsConnection(ws, req) {
        this.connectedClients.add(ws);

        ws.on('message', (message, isBinary) => {
            const isBuffer = Buffer.isBuffer(message);
            if (isBinary || (isBuffer && message.length >= 16)) {
                const buf = isBuffer ? message : Buffer.from(message);
                // Check magic bytes: 'F', 'E', 'A', 'R' (0x46, 0x45, 0x41, 0x52)
                if (buf.length >= 16 && buf[0] === 0x46 && buf[1] === 0x45 && buf[2] === 0x41 && buf[3] === 0x52) {
                    try {
                        this._handleBinaryMessage(ws, buf);
                        return;
                    } catch (err) {
                        console.error('[FearServer] Binary wire message error:', err);
                        return;
                    }
                }
            }

            try {
                const data = JSON.parse(message.toString());
                this._handleWsMessage(ws, data);
            } catch (err) {
                this._sendWsError(ws, 'Malformed JSON message', ERROR_CODES.MALFORMED_MESSAGE);
            }
        });

        ws.on('close', () => {
            this.connectedClients.delete(ws);
        });

        ws.on('error', () => {
            this.connectedClients.delete(ws);
        });
    }

    _handleBinaryMessage(ws, buf) {
        if (!buf || buf.length < 16) return;

        const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const view = new DataView(arrayBuf);
        const magic = view.getUint32(0, true);
        if (magic !== BINARY_MAGIC) {
            return;
        }

        const version = view.getUint8(4);
        const frameType = view.getUint8(5);
        const tick = view.getUint32(8, true);
        const count = view.getUint32(12, true);

        if (frameType === FRAME_TYPES.OBSERVATION_BATCH) {
            const decoded = BinaryWireProtocol.decodeObservationBatch(arrayBuf);
            const batchObservations = [];

            for (const rec of decoded.records) {
                const agentId = rec.agent_id;
                if (!this.simulation.agents.has(agentId)) {
                    this.simulation.registerAgent(agentId, {
                        neuroticism: 0.60,
                        resilience: 0.40,
                        bravery: 0.50
                    }, {
                        initial_position: rec.position
                    });
                }
                const agent = this.simulation.agents.get(agentId);
                if (agent) {
                    agent.x = rec.position.x;
                    agent.y = rec.position.y;
                    agent.z = rec.position.z;
                }

                batchObservations.push({
                    agent_id: agentId,
                    threats: rec.threatDistance < 990 ? [{
                        id: 'threat_binary',
                        distance: rec.threatDistance,
                        intensity: rec.threatIntensity
                    }] : [],
                    sounds: [],
                    peers: []
                });
            }

            const results = this.simulation.batchTick(batchObservations, 0.0166);
            const resultMap = new Map(results.map(r => [r.agent_id, r]));

            const intentRecords = decoded.records.map(rec => {
                const res = resultMap.get(rec.agent_id);
                const aff = res?.affective_state || {};
                const act = res?.action_intent || {};
                const vec = act?.vector_hint || { x: 0.0, y: 0.0, z: 0.0 };

                return {
                    entityId: rec.entityId,
                    fear: aff.raw_fear ?? (res?.fear_score ? res.fear_score / 5.0 : 0.0),
                    anger: aff.anger ?? 0.0,
                    dominance: aff.dominance ?? 0.5,
                    urgency: act?.urgency ?? (aff.raw_fear ?? 0.0),
                    intentType: act?.primary_intent || 'IDLE_VIGILANT',
                    suggestedPosture: act?.suggested_posture || 'UPRIGHT',
                    band: res?.fear_band || 'CALM',
                    inCombat: rec.inCombat || false,
                    exhausted: false,
                    vectorHint: vec
                };
            });

            const responseBuffer = BinaryWireProtocol.encodeIntentBatch(this.simulation.tickCount, intentRecords);
            ws.send(Buffer.from(responseBuffer), { binary: true });
        } else if (frameType === FRAME_TYPES.PING) {
            const pongBuffer = new ArrayBuffer(16);
            const pongView = new DataView(pongBuffer);
            pongView.setUint32(0, BINARY_MAGIC, true);
            pongView.setUint8(4, 2);
            pongView.setUint8(5, FRAME_TYPES.PING);
            pongView.setUint16(6, 0, true);
            pongView.setUint32(8, this.simulation.tickCount, true);
            pongView.setUint32(12, 0, true);
            ws.send(Buffer.from(pongBuffer), { binary: true });
        }
    }

    _handleWsMessage(ws, msg) {
        const validated = ProtocolValidator.validateIncomingMessage(msg);
        if (!validated.valid) {
            return this._sendWsError(ws, validated.errors?.join(', ') || 'Validation failed', validated.code);
        }

        const payload = validated.value;
        const correlationId = payload.message_id || msg.message_id || msg.id || null;

        switch (payload.type) {
            case MESSAGE_TYPES.HANDSHAKE_REQUEST: {
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.HANDSHAKE_RESPONSE,
                    protocol_version: PROTOCOL_VERSION,
                    status: 'ACCEPTED',
                    client_id: payload.client_id
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.REGISTER_AGENT: {
                const agent = this.simulation.registerAgent(payload.agent_id, payload.traits, {
                    name: payload.name,
                    initial_position: payload.initial_position
                });
                this._sendWs(ws, {
                    type: 'REGISTER_AGENT_ACK',
                    status: 'REGISTERED',
                    agent_id: agent.id
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.UNREGISTER_AGENT: {
                const removed = this.simulation.unregisterAgent(payload.agent_id);
                this._sendWs(ws, {
                    type: 'UNREGISTER_AGENT_ACK',
                    status: removed ? 'UNREGISTERED' : 'NOT_FOUND',
                    agent_id: payload.agent_id
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.SOCIAL_EVENT: {
                // NOW-28: WebSocket twin of POST /api/v1/social/event.
                let result;
                try {
                    result = this.simulation.reportSocialEvent({
                        event: payload.event,
                        actorId: payload.actor_id,
                        targetId: payload.target_id,
                        weight: payload.weight,
                        witnesses: payload.witnesses,
                        exposed: payload.exposed,
                        severity: payload.severity
                    });
                } catch (err) {
                    return this._sendWsError(ws, err.message, ERROR_CODES.VALIDATION_FAILED);
                }
                if (result === null) {
                    return this._sendWsError(ws, 'Social reporting is disabled on this server', ERROR_CODES.VALIDATION_FAILED);
                }
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.SOCIAL_EVENT_ACK,
                    status: 'APPLIED',
                    event: payload.event,
                    actor_id: payload.actor_id,
                    target_id: payload.target_id,
                    trauma_id: result.traumaId,
                    direct: result.direct,
                    witness_updates: result.witnessUpdates
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.OBSERVATION_DISPATCH: {
                this.simulation.queueObservation(payload.agent_id, payload);
                break;
            }

            case MESSAGE_TYPES.STEP_REQUEST: {
                const dt = typeof payload.dt === 'number' ? payload.dt : 0.0166;
                const results = this.simulation.tick(dt);
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.BATCH_TICK_REQUEST: {
                const results = this.simulation.batchTick(payload.observations, payload.dt);
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.SAVE_SNAPSHOT_REQUEST: {
                const snapshot = this.simulation.saveSnapshot();
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.SNAPSHOT_RESPONSE,
                    snapshot
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST: {
                this.simulation.loadSnapshot(payload.snapshot);
                this._sendWs(ws, {
                    type: 'LOAD_SNAPSHOT_ACK',
                    status: 'LOADED',
                    tick: this.simulation.tickCount,
                    agentCount: this.simulation.agents.size
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.RESET_REQUEST: {
                this.simulation.reset();
                this._sendWs(ws, {
                    type: 'RESET_ACK',
                    status: 'RESET',
                    tick: 0
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.SET_PACING_OVERRIDE: {
                this.simulation.pacing.setOverride(payload.intensity ?? null);
                this._sendWs(ws, {
                    type: 'SET_PACING_OVERRIDE_ACK',
                    pacing: this.simulation.pacing.getState()
                }, correlationId);
                break;
            }

            default:
                this._sendWsError(ws, `Unhandled message type: ${payload.type}`, ERROR_CODES.MALFORMED_MESSAGE, correlationId);
        }
    }

    _sendWs(ws, data, correlationId = null) {
        if (ws.readyState === WebSocket.OPEN) {
            // Check backpressure on slow consumers (e.g. > 5MB buffered)
            if (ws.bufferedAmount > 5 * 1024 * 1024) {
                console.warn('[FearServer] Slow consumer detected: terminating saturated WebSocket connection.');
                try {
                    ws.close(1008, 'Buffer overflow: consumer too slow');
                } catch {}
                return;
            }
            if (correlationId) {
                data.message_id = correlationId;
            }
            ws.send(JSON.stringify(data));
        }
    }

    _sendWsError(ws, message, code = ERROR_CODES.SIMULATION_ERROR, correlationId = null) {
        this._sendWs(ws, {
            type: MESSAGE_TYPES.ERROR_RESPONSE,
            error: message,
            code
        }, correlationId);
    }
}

export default FearServer;
