/**
 * FearServer - Dual-transport WebSocket & HTTP REST server for Fear AI middleware.
 * Listens on loopback (default 127.0.0.1:8765) to service Unity, Unreal, Godot,
 * and custom game engines with sub-millisecond local latency.
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { RuntimeSimulation } from './RuntimeSimulation.js';
import {
    ClaimArbitration,
    CLAIM_OUTCOMES,
    TEARDOWN_OUTCOMES,
    SIGNING_KEY_OUTCOMES
} from './ClaimArbitration.js';
import {
    RequestSigning,
    SIGNATURE_FAILURES,
    SIGNATURE_HEADERS,
    isUsablePublicKey,
    readSignatureHeaders
} from './RequestSigning.js';
import { ValleyChainScenario } from '../../core/index.js';
import {
    HostCapabilityNegotiator,
    HOST_CAPABILITIES,
    INTENT_CAPABILITY_REQUIREMENTS,
    RUNTIME_SAFE_FALLBACKS,
    HostFeedbackLoop
} from '../../core/index.js';
import {
    PROTOCOL_VERSION,
    MESSAGE_TYPES,
    ERROR_CODES,
    ProtocolValidator,
    BinaryWireProtocol,
    BINARY_MAGIC,
    FRAME_TYPES,
    INTENT_CODES,
    SUPPORTED_OBSERVATION_FIELDS,
    SUPPORTED_SOCIAL_EVENT_FIELDS,
    SUPPORTED_PACING_METRICS
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
        this.connectedClients = new Set();
        // Session-scoped ownership. Consulted on claim paths only (register,
        // unregister, reset), never on the tick hot path, so a host that never
        // names a session pays nothing for it.
        this.claims = new ClaimArbitration({
            staleAfterMs: options.sessionStalenessMs,
            // `0` disables credential expiry. Defaulted rather than required so
            // an existing host keeps working unchanged, and bounded rather than
            // infinite so a credential left on disk stops being useful on a
            // human timescale.
            tokenTtlMs: options.sessionTokenTtlMs
        });
        // Request signing. `preferred` by default: a caller that presents a
        // signature must present a valid one, and a caller that presents none is
        // judged by the token rules exactly as before. See RequestSigning.js for
        // why the default is not `required` and what `required` changes.
        this.signing = new RequestSigning({
            policy: options.signaturePolicy,
            skewMs: options.signatureSkewMs,
            nonceLimit: options.signatureNonceLimit,
            challengeLimit: options.signatureChallengeLimit,
            challengeTtlMs: options.signatureChallengeTtlMs,
            randomBytes: options.randomBytes
        });
        // R36: execution-aware advisory loop. Records host outcome
        // reports per agent (bounded inside: 5000 agents, 64 history
        // each) and filters tick outputs the host already reported
        // unexecutable. Advisory statistics only; never host mutation.
        this.feedbackLoop = new HostFeedbackLoop();
        this.chainScenario = new ValleyChainScenario();
        this.maxPayloadBytes = options.maxPayloadBytes || (50 * 1024 * 1024);

        this.httpServer = null;
        this.wss = null;
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
            // A signed read is verified like anything else: ownership state is
            // information worth protecting even when the verb is not destructive.
            const gate = this._gateSignature({ method: req.method, target: req.url, rawBody: '', headers: req.headers, sessionIdHint: null });
            if (!gate.ok) return this._sendSignatureRefusal(res, gate, req.url);
            if (path === '/' || path === '/health' || path === '/api/v1/status') {
                this._sendJson(res, 200, {
                    status: 'ok',
                    protocol_version: PROTOCOL_VERSION,
                    server: 'Fear AI Middleware Server',
                    simulation: this.simulation.getStatus()
                });
                return;
            }
            // Who owns what. This is the host-visible answer to "what happened
            // to the connection that dropped": its agents are still registered
            // and still owned, the session reads `attached: false`, and once it
            // is not live a different session may adopt them.
            if (path === '/api/v1/sessions') {
                // `signing` rides along so a host can see the policy it is being
                // judged under, whether its key is registered, and how many
                // requests have been refused for what reason.
                this._sendJson(res, 200, { ...this.claims.summary(), signing: this.signing.summary() });
                return;
            }
            this._sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (req.method === 'POST') {
            this._readJsonBody(req, res, (err, body, raw) => {
                if (err) {
                    this._sendJson(res, 400, {
                        error: 'Malformed JSON payload',
                        code: ERROR_CODES.MALFORMED_MESSAGE
                    });
                    return;
                }

                // The signature covers the RAW bytes, so it is verified here,
                // before the body is interpreted, and the session a request is
                // about is read from the body because that is where a token-only
                // caller names itself.
                const gate = this._gateSignature({
                    method: req.method,
                    target: req.url,
                    rawBody: raw === undefined ? '' : raw,
                    headers: req.headers,
                    sessionIdHint: body && typeof body.session_id === 'string' ? body.session_id : null
                });
                if (!gate.ok) return this._sendSignatureRefusal(res, gate, req.url, body);

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

    /**
     * R36: enforce host contracts on tick outputs (Front D backlog #1).
     * Two independent filters, applied in order per output:
     * 1. Capability filter (only when the request advertises caps):
     *    intents the host cannot honor downgrade via RUNTIME_SAFE_FALLBACKS.
     * 2. Affordance filter (only for agents with recorded structural
     *    failures): intents the host already reported unexecutable are
     *    replaced by the loop's safe fallback.
     * Absent capabilities (null/undefined) mean legacy unfiltered output.
     * An explicitly empty array means the host advertises nothing: every
     * gated intent downgrades. Untouched outputs return as-is.
     * Downgrades are annotated so hosts see what changed and why.
     * @param {Array} outputs batchTick/tick outputs
     * @param {Array<string>} [capabilities] sanitized host caps, or null
     * @returns {Array} filtered outputs
     */
    _applyHostContracts(outputs, capabilities) {
        if (!Array.isArray(outputs) || outputs.length === 0) return outputs;
        const caps = Array.isArray(capabilities) ? capabilities : null;
        const negotiator = caps ? new HostCapabilityNegotiator(caps) : null;
        for (const output of outputs) {
            if (!output || typeof output !== 'object') continue;
            const intent = output.action_intent;
            const type = intent && typeof intent.type === 'string' ? intent.type : null;
            if (!type) continue;
            if (negotiator) {
                const filtered = negotiator.filterIntent(type, RUNTIME_SAFE_FALLBACKS);
                if (filtered.downgraded) {
                    output.action_intent = { ...intent, type: filtered.intent };
                    output.capability_downgrade = {
                        original_intent: filtered.originalIntent,
                        required_capability: filtered.requiredCapability,
                        reason: filtered.reason
                    };
                }
            }
            const current = output.action_intent && typeof output.action_intent.type === 'string'
                ? output.action_intent.type
                : type;
            if (current && this.feedbackLoop.isUnavailable(output.agent_id, current)) {
                output.action_intent = { ...(output.action_intent || {}), type: this.feedbackLoop.fallbackFor(current) };
                output.affordance_downgrade = {
                    original_intent: current,
                    fallback: this.feedbackLoop.fallbackFor(current),
                    reason: 'HOST_REPORTED_UNAVAILABLE'
                };
            }
        }
        return outputs;
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
                    server_time_ms: Date.now(),
                    supported_observation_fields: SUPPORTED_OBSERVATION_FIELDS,
                    supported_social_event_fields: SUPPORTED_SOCIAL_EVENT_FIELDS,
                    supported_pacing_metrics: SUPPORTED_PACING_METRICS,
                    // R36: capability contract advertisement. Hosts learn
                    // which intents require which advertised capabilities
                    // (echo back per tick as `capabilities`) and the full
                    // capability vocabulary. Additive: legacy clients
                    // ignore unknown fields.
                    host_capabilities: Object.values(HOST_CAPABILITIES),
                    capability_requirements: { ...INTENT_CAPABILITY_REQUIREMENTS },
                    // Advertised so a host can discover that this server expects
                    // signatures, and how many of its requests have been refused
                    // for what reason, before it starts guessing.
                    signing: this.signing.summary()
                });
            }
            case '/api/v1/register': {
                const val = ProtocolValidator.validateRegisterAgent(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                const admitted = this._admitClaim(val.value, {});
                if (!admitted.granted) {
                    // An agent owned by a live session is not handed over on
                    // request. 409 rather than 200-with-a-lie, and no mutation.
                    return this._sendJson(res, 409, {
                        status: 'REFUSED',
                        agent_id: val.value.agent_id,
                        code: admitted.claim === CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH
                            ? 'SESSION_TOKEN_MISMATCH'
                            : 'OWNED_BY_LIVE_SESSION',
                        owner_session_id: admitted.owner_session_id,
                        claim: admitted.claim,
                        // The identity may still have been established even though
                        // this agent was not granted, and the token is returned so
                        // a refused host is not left unable to prove who it is on
                        // its next attempt.
                        session_id: admitted.session_id,
                        session_token: admitted.session_token,
                        hint: admitted.claim === CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH
                            ? 'the session_token does not match this session_id; omit it to adopt by name once the incumbent is not live'
                            : 'resend with claim:"takeover" to displace the live owner'
                    });
                }
                const signingKey = this._maybeRegisterSigningKey(val.value, admitted.session_id);
                const agent = this.simulation.registerAgent(val.value.agent_id, val.value.traits, {
                    name: val.value.name,
                    initial_position: val.value.initial_position
                });
                return this._sendJson(res, 200, {
                    status: 'REGISTERED',
                    agent_id: agent.id,
                    traits: agent.traits,
                    claim: admitted.claim,
                    session_id: admitted.session_id,
                    session_token: admitted.session_token,
                    // Reported so a host can log "my credential was replaced and
                    // here is why" rather than discovering it by accident.
                    token_rotated: admitted.token_rotated,
                    token_expired: admitted.token_expired,
                    signing_key: signingKey
                });
            }

            // Batch registration exists because the control plane carries one
            // HTTP request at a time. Registering N agents individually costs N
            // round trips, which is seconds of dead time for a large host on
            // the very first frames of a session. One request per batch of up
            // to MAX_BATCH_REGISTRATION_AGENTS removes that cost without
            // changing the registration semantics of the singular endpoint.
            case '/api/v1/register/batch': {
                const val = ProtocolValidator.validateRegisterBatch(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                // ONE identity for the whole request, then per-agent ownership
                // and per-entry reporting inside it.
                const identity = this._establishRequestIdentity(val.value, val.value.agents[0] || {});
                // Registered after identity resolves, because a key is a claim
                // about WHO the caller is: it is only accepted once the request
                // has established that identity (and, for a session that already
                // has a key, only with a matching token).
                const signingKey = identity.established
                    ? this._maybeRegisterSigningKey(val.value, identity.session_id)
                    : null;
                const registered = [];
                const refused = [];
                const claims = [];
                const takeover = (val.value.claim || 'join') === 'takeover';
                for (let i = 0; i < val.value.agents.length; i++) {
                    const entry = val.value.agents[i];
                    if (identity.session_id) {
                        if (!identity.established) {
                            // The request could not prove it may act as this
                            // session. Every entry is refused and NOTHING is
                            // mutated, with the owner named once per entry.
                            refused.push({
                                index: i,
                                agent_id: entry.agent_id,
                                reason: identity.claim,
                                owner_session_id: identity.owner_session_id
                            });
                            continue;
                        }
                        const taken = this.claims.claimUnder(entry.agent_id, identity.session_id, { takeover });
                        claims.push({
                            agent_id: entry.agent_id,
                            claim: taken.granted
                                ? ClaimArbitration.mergeOutcome(identity.claim, taken.outcome)
                                : taken.outcome
                        });
                        if (!taken.granted) {
                            refused.push({
                                index: i,
                                agent_id: entry.agent_id,
                                reason: taken.outcome,
                                owner_session_id: taken.ownerSessionId
                            });
                            continue;
                        }
                    } else {
                        claims.push({ agent_id: entry.agent_id, claim: CLAIM_OUTCOMES.GRANTED });
                    }
                    const agent = this.simulation.registerAgent(entry.agent_id, entry.traits, {
                        name: entry.name,
                        initial_position: entry.initial_position
                    });
                    registered.push(agent.id);
                }
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE,
                    status: 'REGISTERED',
                    count: registered.length,
                    registered,
                    claims,
                    refused,
                    session_id: identity.session_id,
                    claim: identity.claim,
                    // Present when a NEW session was established, or when a
                    // rotation replaced the previous credential. The host must
                    // persist it: after a rotation it is the only valid value.
                    session_token: identity.session_token,
                    token_rotated: identity.token_rotated === true,
                    token_expired: identity.token_expired === true,
                    signing_key: signingKey,
                    // Entries the validator refused, reported so the host can
                    // fix them instead of discovering them as silence.
                    rejected: val.value.rejected
                });
            }

            case '/api/v1/unregister': {
                const val = ProtocolValidator.validateUnregisterAgent(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                // Teardown is ownership-gated. Registration was arbitrated from
                // the start; without this, any client could have torn down any
                // crowd, which made every claim rule above beside the point.
                const permit = this._authorizeTeardown(val.value.agent_id, val.value);
                if (!permit.allowed) {
                    return this._sendJson(res, 409, {
                        status: 'REFUSED',
                        agent_id: val.value.agent_id,
                        code: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER,
                        owner_session_id: permit.owner_session_id,
                        retry_after_ms: this.claims.retryAfterFor(permit.owner_session_id),
                        hint: 'this agent is owned by a live session; present that session\'s session_token, or retry once it is not live'
                    });
                }
                const releasedOwner = this.claims.release(val.value.agent_id);
                const removed = this.simulation.unregisterAgent(val.value.agent_id);
                return this._sendJson(res, 200, {
                    status: removed ? 'UNREGISTERED' : 'NOT_FOUND',
                    agent_id: val.value.agent_id,
                    released_session_id: releasedOwner,
                    release: permit.outcome
                });
            }

            // Batch teardown. A host retiring a crowd, or reinitialising a
            // scene, otherwise pays one round trip per agent for the same
            // reason registration did.
            case '/api/v1/unregister/batch': {
                const val = ProtocolValidator.validateUnregisterBatch(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                const unregistered = [];
                const notFound = [];
                const refusedTeardown = [];
                for (const agentId of val.value.agent_ids) {
                    // Per-id permission, for the same reason claims are per-agent:
                    // one request can name ids from more than one session, and a
                    // blanket grant would hand over the ones it does not own.
                    const permit = this._authorizeTeardown(agentId, val.value);
                    if (!permit.allowed) {
                        // Reported, never silently skipped: an id the host
                        // believes it retired while the server still holds it is
                        // the failure mode this whole control plane exists to
                        // make visible.
                        refusedTeardown.push({
                            agent_id: agentId,
                            reason: permit.outcome,
                            owner_session_id: permit.owner_session_id
                        });
                        continue;
                    }
                    this.claims.release(agentId);
                    const removed = this.simulation.unregisterAgent(agentId);
                    // NOT_FOUND is a terminal, non-error outcome: the caller
                    // asked for the agent to be gone and it is gone. It is
                    // reported separately anyway, because a client that could
                    // not distinguish it would requeue the id forever.
                    if (removed) unregistered.push(agentId);
                    else notFound.push(agentId);
                }
                // Teardown is where sessions become agentless, so it is also
                // where stale ones are reclaimed. Bounded and cheap: the number
                // of sessions is small and this is not a per-tick path.
                this.claims.prune();
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.UNREGISTER_AGENT_BATCH_RESPONSE,
                    status: 'UNREGISTERED',
                    count: unregistered.length,
                    unregistered,
                    not_found: notFound,
                    refused: refusedTeardown,
                    rejected: val.value.rejected
                });
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
                const results = this._applyHostContracts(
                    this.simulation.batchTick(observations, dt),
                    ProtocolValidator.sanitizeTickCapabilities(body?.capabilities)
                );
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                });
            }

            case '/api/v1/batch_tick': {
                const val = ProtocolValidator.validateBatchTick(body || {});
                const results = this._applyHostContracts(
                    this.simulation.batchTick(val.value.observations, val.value.dt),
                    ProtocolValidator.sanitizeTickCapabilities(body?.capabilities)
                );
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                });
            }

            case '/api/v1/outcome': {
                // R36: host execution-outcome reports close the advisory
                // loop (XCVI-XCVIII). Recorded per agent; structural
                // failures mark intents unavailable for future ticks.
                // Garbage fails 400 loudly; the loop itself never throws
                // on validated input (bounded inside HostFeedbackLoop).
                const val = ProtocolValidator.validateOutcomeReport(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                // Field mapping: the wire speaks snake_case, the loop
                // speaks camelCase (its tested vocabulary wins).
                const receipt = this.feedbackLoop.reportOutcome({
                    agentId: val.value.agent_id,
                    intentType: val.value.intent_type,
                    outcome: val.value.outcome,
                    reason: val.value.reason,
                    tick: val.value.tick
                });
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.INTENT_OUTCOME_ACK,
                    status: 'RECORDED',
                    ...receipt
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

            // Batch trauma authoring. A settlement or battlefield authored at
            // scene load has many zones; zones are independent world state, so
            // a malformed entry is skipped with its index and the rest apply.
            case '/api/v1/trauma/batch': {
                const val = ProtocolValidator.validateTraumaZoneBatch(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                const zoneIds = [];
                for (const zone of val.value.zones) {
                    zoneIds.push(this.simulation.addTraumaZone(
                        zone.x, zone.y, zone.z,
                        zone.intensity, zone.radius, zone.lifetimeTicks
                    ));
                }
                return this._sendJson(res, 200, {
                    type: MESSAGE_TYPES.TRAUMA_ZONE_BATCH_RESPONSE,
                    status: 'ADDED',
                    count: zoneIds.length,
                    zone_ids: zoneIds,
                    rejected: val.value.rejected
                });
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
                const val = ProtocolValidator.validatePacingOverride(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                this.simulation.pacing.setOverride(val.value.intensity);
                return this._sendJson(res, 200, { status: 'UPDATED', pacing: this.simulation.pacing.getState() });
            }

            case '/api/v1/reset': {
                const clearAgents = Boolean(body?.clear_agents);
                // A reset that clears agents destroys every crowd on the server,
                // so it is gated like any other destructive verb: a caller that
                // owns the agents it is clearing (and does not reach into a live
                // session's) may proceed, and a bystander may not. A middleware
                // restart is the deliberate way past a live owner's objection -
                // restored sessions are unbound and therefore not live.
                if (clearAgents) {
                    const permit = this.claims.authorizeReset({
                        sessionId: body?.session_id || null,
                        token: body?.session_token || null
                    });
                    if (!permit.allowed) {
                        return this._sendJson(res, 409, {
                            status: 'REFUSED',
                            code: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER,
                            agent_id: null,
                            blocked_by: permit.blocked_by,
                            blocked_sessions: permit.blocked_agents,
                            hint: 'a live session owns agents; unregister them first, or present that session\'s session_token'
                        });
                    }
                }
                this.simulation.reset({ clearAgents });
                // Ownership must not outlive the agents it describes, or a
                // fresh session would be refused its own newly registered crowd.
                if (clearAgents) this.claims.clear();
                return this._sendJson(res, 200, { status: 'RESET', tick: 0, agentCount: this.simulation.agents.size });
            }

            case '/api/v1/session/revoke': {
                const val = ProtocolValidator.validateSessionRevoke(body || {});
                if (!val.valid) {
                    return this._sendJson(res, 400, { errors: val.errors, code: val.code });
                }
                const result = this.claims.revoke(val.value.session_id, val.value.session_token);
                if (!result.revoked) {
                    // 404 for a name that is not there, 403 for a credential that
                    // does not match: they are different problems for the host.
                    const status = result.reason === 'NO_SUCH_SESSION' ? 404 : 403;
                    return this._sendJson(res, status, {
                        status: 'REFUSED',
                        session_id: val.value.session_id,
                        code: result.reason,
                        hint: result.reason === 'NO_SUCH_SESSION'
                            ? 'no session with this name exists; nothing to revoke'
                            : 'the session_token does not match this session_id'
                    });
                }
                return this._sendJson(res, 200, {
                    status: 'REVOKED',
                    session_id: val.value.session_id,
                    // Named rather than counted: a host ending its session wants
                    // to know which agents it has just stopped owning, because
                    // they are still registered and still ticking.
                    released_agents: result.released_agents,
                    released_count: result.released_agents.length,
                    note: 'released agents remain registered and advisory; only ownership was ended'
                });
            }

            case '/api/v1/save': {
                const snapshot = this.simulation.saveSnapshot();
                // Ownership is server-level state, so it rides along as a
                // SERVER-level extension rather than inside the simulation's
                // own schema - `RuntimeSimulation` still knows nothing about
                // sessions. Only token HASHES are exported, so a snapshot is not
                // a credential store.
                snapshot.sessions = this.claims.exportSessions();
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
                const ownership = this._restoreOwnership(body.snapshot);
                return this._sendJson(res, 200, {
                    status: 'LOADED',
                    tick: this.simulation.tickCount,
                    agentCount: this.simulation.agents.size,
                    ownership
                });
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

    /**
     * The single signature choke point for HTTP.
     *
     * One place decides, before any route handler runs, so no verb can forget to
     * ask and no verb can be reached by a caller who failed the check. It is a
     * pure decision: a refusal here means the request was never interpreted and
     * nothing was mutated. Refusals are logged in the SAME refusal log the
     * dashboard already explains, so a signature failure is diagnosable rather
     * than a bare 401.
     */
    _gateSignature({ method, target, rawBody, headers, sessionIdHint = null }) {
        if (!this.signing.enabled) return { ok: true, reason: null };
        const presented = readSignatureHeaders(headers);
        const named = presented.sessionId || (sessionIdHint ? String(sessionIdHint) : null);
        const verdict = this.signing.verifyHttpRequest({
            method,
            target,
            rawBody,
            headers,
            sessionRecord: named ? this.claims.signingRecord(named) : null,
            sessionIdHint
        });
        if (!verdict.ok) {
            this.claims.recordSignatureRefusal({
                verb: `${String(method).toUpperCase()} ${String(target)}`,
                sessionId: named,
                reason: verdict.reason
            });
        }
        return verdict;
    }

    /** Explain a refused signature. The reason strings are stable protocol values. */
    _sendSignatureRefusal(res, gate, target, body = null) {
        const hints = {
            [SIGNATURE_FAILURES.MISSING]: 'this session has a signing key, so its token alone is not sufficient: sign the request with the session private key',
            [SIGNATURE_FAILURES.INVALID]: 'the signature does not cover this method, target and body, or it was not made with the registered key',
            [SIGNATURE_FAILURES.REPLAY]: 'this nonce has already been accepted; every request needs a fresh one',
            [SIGNATURE_FAILURES.STALE]: 'issued_at is outside the accepted clock skew',
            [SIGNATURE_FAILURES.UNKNOWN_KEY]: 'no key is registered for this session, or the key id does not match',
            [SIGNATURE_FAILURES.MALFORMED]: 'the signature header set is incomplete or not base64',
            [SIGNATURE_FAILURES.UNSUPPORTED_ALG]: 'this server verifies RS256 only'
        };
        this._sendJson(res, 401, {
            status: 'REFUSED',
            error: 'Request signature refused',
            code: gate.reason,
            policy: this.signing.policy,
            signature_required: gate.required === true,
            target: String(target),
            session_id: body && typeof body.session_id === 'string' ? body.session_id : null,
            hint: hints[gate.reason] || 'see RequestSigning.js for the canonical signing input'
        });
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
                // The raw text rides along as a third argument because a
                // signature covers bytes, not meaning: re-stringifying the parsed
                // object would produce a different string than the one signed.
                callback(null, {}, '');
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                callback(null, parsed, raw);
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

    /**
     * Restore session ownership from a snapshot, after its agents exist.
     *
     * Two decisions worth naming:
     *
     *  - Ownership is filtered to agents the snapshot ACTUALLY restored. A
     *    recorded owner for an agent that is not present would refuse a later
     *    host its own id for no reason.
     *  - Existing ownership is cleared first. A load replaces the world, so
     *    keeping the previous owner map would describe agents that no longer
     *    exist and mis-attribute the ones that do.
     *
     * A snapshot with no `sessions` field is entirely valid - every snapshot
     * written before ownership was persisted - and simply restores nothing,
     * leaving the server in the ownership-free state legacy hosts expect.
     */
    _restoreOwnership(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.sessions)) {
            return { restored: 0, agents: 0, skipped: 0, present: false };
        }
        const live = new Set(this.simulation.agents.keys());
        const filtered = snapshot.sessions.map((entry) => {
            if (!entry || typeof entry !== 'object' || !Array.isArray(entry.agent_ids)) return entry;
            return { ...entry, agent_ids: entry.agent_ids.filter((id) => live.has(String(id))) };
        });
        this.claims.clear();
        const result = this.claims.restoreSessions(filtered);
        return { ...result, present: true };
    }

    /**
     * Decide whether a registration may proceed, and record the outcome.
     *
     * A caller that names no session is granted unconditionally AND records no
     * ownership, which is why legacy hosts see byte-identical behaviour: with
     * nothing ever owned, arbitration has nothing to arbitrate. Ownership only
     * becomes a real contract once a host opts in by naming a session, and then
     * it is what lets the server tell a reconnecting host from a rival one.
     *
     * @param {object} entry validated register entry (agent_id, session_id, claim)
     * @param {string} [envelopeSessionId] batch-level session id, used when the entry omits one
     */
    _admitClaim(entry, envelope = {}, connection = null) {
        const sessionId = entry.session_id || envelope.session_id || null;
        if (!sessionId) {
            return {
                granted: true, claim: CLAIM_OUTCOMES.GRANTED,
                session_id: null, owner_session_id: null, session_token: null
            };
        }
        const result = this.claims.claim(entry.agent_id, {
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
            // Non-null only when a NEW session was established (fresh, adopted,
            // taken over) OR when a fresh credential replaced an old one. The
            // host must store it: it is the only thing that proves continuity
            // next time, and after a rotation it is the ONLY valid value.
            session_token: result.sessionToken,
            token_rotated: result.rotated === true,
            token_expired: result.tokenExpired === true
        };
    }

    /**
     * Register a session's signing key if the caller offered one.
     *
     * Separate from identity resolution because a key is optional and most
     * requests do not carry one, and because a key is a claim about WHO the
     * caller is: it is only worth storing once identity has been established.
     * Returns null when nothing was offered, so a legacy host sees no new field
     * in a response it never asked for.
     */
    _maybeRegisterSigningKey(envelope, sessionId) {
        const pem = envelope && typeof envelope.signing_public_key === 'string' ? envelope.signing_public_key : null;
        if (!pem || !sessionId) return null;
        const result = this.claims.registerSigningKey(sessionId, pem, {
            token: envelope.session_token || null
        });
        return {
            outcome: result.outcome,
            registered: result.registered,
            replaced: result.replaced,
            key_id: result.key_id
        };
    }

    /**
     * Resolve the session a whole registration REQUEST speaks as, once.
     *
     * A batch must not re-establish identity per entry: the token for a new
     * session is minted during establishment and only reaches the host in the
     * response, so a client cannot present it for entries 2..N of the same
     * request. Establishing once and then arbitrating per agent is both correct
     * and what makes a single batch behave like a single client.
     *
     * @returns {{established: boolean, claim: string, session_id: string|null,
     *            session_token: string|null, owner_session_id: string|null}}
     */
    _establishRequestIdentity(envelope, firstEntry = {}, connection = null) {
        const sessionId = envelope.session_id || firstEntry.session_id || null;
        if (!sessionId) {
            return {
                established: true, claim: CLAIM_OUTCOMES.GRANTED,
                session_id: null, session_token: null, owner_session_id: null
            };
        }
        const identity = this.claims.establishIdentity(
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

    /**
     * Decide whether a teardown may proceed, and say why when it may not.
     *
     * Deliberately separate from the release itself: a refusal must mutate
     * nothing, and keeping the decision pure is what makes that checkable rather
     * than merely intended.
     */
    _authorizeTeardown(agentId, envelope = {}) {
        return this.claims.authorizeTeardown(agentId, {
            sessionId: envelope.session_id || null,
            token: envelope.session_token || null
        });
    }

    // -------------------------------------------------------------------------
    // WebSocket Connection Routing
    // -------------------------------------------------------------------------

    _handleWsConnection(ws, req) {
        this.connectedClients.add(ws);
        // A socket starts unauthenticated. `fearAuthenticatedSession` is set only
        // by a valid signature over a challenge THIS server generated for THIS
        // connection, which is what makes it unreplayable: there is nothing on
        // the wire worth capturing, because the question is fresh and single-use.
        ws.fearAuthenticatedSession = null;
        if (this.signing.enabled) {
            const challenge = this.signing.issueChallenge(null);
            this._sendWs(ws, {
                type: MESSAGE_TYPES.AUTH_CHALLENGE,
                challenge: challenge.challenge,
                alg: challenge.alg,
                issued_at: challenge.issued_at,
                signing_version: this.signing.summary().version
            }, null);
        }

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

        // A dropped socket detaches the session but does NOT retire its agents.
        // A lost connection is not a host decision, and the state is exactly
        // what a reconnect needs. Detaching only makes the session adoptable by
        // a DIFFERENT host once it has aged out of the liveness window.
        ws.on('close', () => {
            this.connectedClients.delete(ws);
            this.claims.detach(ws);
        });

        ws.on('error', () => {
            this.connectedClients.delete(ws);
            this.claims.detach(ws);
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

    /**
     * Bind liveness to the socket for any message that names a session AND
     * proves it with the token.
     *
     * Under the `required` policy a session that has registered a signing key
     * cannot be kept live by a bearer token either. That matters more than it
     * looks: liveness is what stops other hosts from adopting a crowd, so a
     * stolen token would otherwise pin a crowd as live while every one of its
     * verb requests was refused -- a lockout a thief could maintain.
     */
    _bindWsIdentity(ws, msg) {
        if (!msg || typeof msg !== 'object') return false;
        const name = typeof msg.session_id === 'string' && msg.session_id.length > 0 ? msg.session_id : null;
        if (!name) return false;
        if (this.signing.required && this.claims.hasSigningKey(name) && ws.fearAuthenticatedSession !== name) {
            return false;
        }
        return this.claims.bindIfProven(name, msg.session_token, ws);
    }

    /**
     * Decide whether a WebSocket envelope may proceed under the signing policy.
     *
     * ANONYMOUS TRAFFIC IS NEVER GATED. An envelope that names no session owns
     * nothing and cannot reach another session's agents, so it keeps behaving
     * exactly as it did before signing existed. The gate is about a name that has
     * committed to a key.
     *
     * `AUTH_RESPONSE` is exempt, or the handshake could never complete: it is the
     * message that makes a connection authenticated in the first place.
     */
    _gateWsEnvelope(ws, msg) {
        if (!this.signing.enabled || !this.signing.required) return { ok: true };
        if (!msg || typeof msg !== 'object') return { ok: true };
        if (msg.type === MESSAGE_TYPES.AUTH_RESPONSE) return { ok: true };
        const name = typeof msg.session_id === 'string' && msg.session_id.length > 0 ? msg.session_id : null;
        if (!name) return { ok: true };
        if (!this.claims.hasSigningKey(name)) return { ok: true };
        if (ws.fearAuthenticatedSession === name) return { ok: true };
        this.claims.recordSignatureRefusal({
            verb: `WS ${msg.type}`,
            sessionId: name,
            reason: SIGNATURE_FAILURES.MISSING
        });
        return {
            ok: false,
            reason: SIGNATURE_FAILURES.MISSING,
            sessionId: name,
            detail: 'this session has a signing key, so this connection must authenticate with AUTH_RESPONSE before it can act as that session'
        };
    }

    /**
     * Verify a challenge response. On success the socket IS that session:
     * identity proven by a private key the wire never carried, and liveness
     * attached from the same proof the token path uses.
     */
    _handleAuthResponse(ws, payload, correlationId) {
        const sessionId = payload.session_id ? String(payload.session_id) : null;
        const verdict = this.signing.verifyChallengeResponse({
            challenge: payload.challenge,
            sessionId,
            signature: payload.signature,
            sessionRecord: sessionId ? this.claims.signingRecord(sessionId) : null
        });
        if (!verdict.ok) {
            this.claims.recordSignatureRefusal({
                verb: 'WS AUTH_RESPONSE',
                sessionId,
                reason: verdict.reason
            });
            // A fresh challenge rides along with the refusal, so a host whose
            // answer failed can retry without reconnecting. The old question is
            // already retired, which is why a new one is issued rather than the
            // failed one being reused.
            const fresh = this.signing.issueChallenge(sessionId);
            return this._sendWsError(ws, 'Signature refused', ERROR_CODES.VALIDATION_FAILED, correlationId, {
                code: verdict.reason,
                session_id: sessionId,
                challenge: fresh.challenge,
                alg: fresh.alg
            });
        }
        ws.fearAuthenticatedSession = sessionId;
        if (sessionId) this.claims.bind(sessionId, ws);
        return this._sendWs(ws, {
            type: 'AUTH_ACK',
            status: 'AUTHENTICATED',
            session_id: sessionId,
            alg: this.signing.summary().algorithm
        }, correlationId);
    }

    _handleWsMessage(ws, msg) {
        const correlationId = msg && typeof msg === 'object'
            ? (msg.message_id || msg.id || null)
            : null;
        // Bind liveness to the socket for any message that names a session AND
        // proves it with the token. Provenance matters: if merely speaking a
        // session's name could bind a socket or refresh its liveness, a rival
        // could keep a dead session alive indefinitely, or attach itself to a
        // live one, just by repeating a name it guessed.
        this._bindWsIdentity(ws, msg);

        // The signing gate. Same single choke point as HTTP: it runs before the
        // dispatcher, so no WS verb can be reached by a caller that failed it.
        const wsGate = this._gateWsEnvelope(ws, msg);
        if (!wsGate.ok) {
            return this._sendWsError(
                ws,
                wsGate.detail,
                ERROR_CODES.VALIDATION_FAILED,
                correlationId,
                { code: wsGate.reason, session_id: wsGate.sessionId }
            );
        }

        const validated = ProtocolValidator.validateIncomingMessage(msg);
        if (!validated.valid) {
            return this._sendWsError(
                ws,
                validated.errors?.join(', ') || 'Validation failed',
                validated.code,
                correlationId
            );
        }

        const payload = validated.value;

        switch (payload.type) {
            case MESSAGE_TYPES.AUTH_RESPONSE: {
                this._handleAuthResponse(ws, payload, correlationId);
                break;
            }

            case MESSAGE_TYPES.HANDSHAKE_REQUEST: {
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.HANDSHAKE_RESPONSE,
                    protocol_version: PROTOCOL_VERSION,
                    status: 'ACCEPTED',
                    client_id: payload.client_id,
                    supported_observation_fields: SUPPORTED_OBSERVATION_FIELDS,
                    supported_social_event_fields: SUPPORTED_SOCIAL_EVENT_FIELDS,
                    supported_pacing_metrics: SUPPORTED_PACING_METRICS,
                    host_capabilities: Object.values(HOST_CAPABILITIES),
                    capability_requirements: { ...INTENT_CAPABILITY_REQUIREMENTS },
                    signing: this.signing.summary()
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.REGISTER_AGENT: {
                const admitted = this._admitClaim(payload, {}, ws);
                if (!admitted.granted) {
                    this._sendWs(ws, {
                        type: 'REGISTER_AGENT_ACK',
                        status: 'REFUSED',
                        agent_id: payload.agent_id,
                        code: 'OWNED_BY_LIVE_SESSION',
                        owner_session_id: admitted.owner_session_id,
                        claim: admitted.claim
                    }, correlationId);
                    break;
                }
                const agent = this.simulation.registerAgent(payload.agent_id, payload.traits, {
                    name: payload.name,
                    initial_position: payload.initial_position
                });
                this._sendWs(ws, {
                    type: 'REGISTER_AGENT_ACK',
                    status: 'REGISTERED',
                    agent_id: agent.id,
                    claim: admitted.claim,
                    session_id: admitted.session_id,
                    session_token: admitted.session_token
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.REGISTER_AGENT_BATCH: {
                // Binary-wire twin of POST /api/v1/register/batch. Same
                // semantics: per-entry rejections are reported, not fatal, and
                // an entry held by a live session is refused rather than stolen.
                // One identity for the whole request, same as the HTTP twin.
                const identity = this._establishRequestIdentity(payload, payload.agents[0] || {}, ws);
                const registered = [];
                const refused = [];
                const takeover = (payload.claim || 'join') === 'takeover';
                for (const entry of payload.agents) {
                    if (identity.session_id) {
                        if (!identity.established) {
                            refused.push({
                                agent_id: entry.agent_id,
                                reason: identity.claim,
                                owner_session_id: identity.owner_session_id
                            });
                            continue;
                        }
                        const taken = this.claims.claimUnder(entry.agent_id, identity.session_id, { takeover });
                        if (!taken.granted) {
                            refused.push({
                                agent_id: entry.agent_id,
                                reason: taken.outcome,
                                owner_session_id: taken.ownerSessionId
                            });
                            continue;
                        }
                    }
                    const agent = this.simulation.registerAgent(entry.agent_id, entry.traits, {
                        name: entry.name,
                        initial_position: entry.initial_position
                    });
                    registered.push(agent.id);
                }
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE,
                    status: 'REGISTERED',
                    count: registered.length,
                    registered,
                    refused,
                    session_id: identity.session_id,
                    claim: identity.claim,
                    session_token: identity.session_token,
                    rejected: payload.rejected
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.UNREGISTER_AGENT: {
                // Same ownership gate as the HTTP twin. The wire a teardown
                // arrives on must not change who is allowed to make it, or the
                // protection would be a property of the transport rather than of
                // the agent.
                const permit = this._authorizeTeardown(payload.agent_id, payload);
                if (!permit.allowed) {
                    this._sendWs(ws, {
                        type: 'UNREGISTER_AGENT_ACK',
                        status: 'REFUSED',
                        agent_id: payload.agent_id,
                        code: TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER,
                        owner_session_id: permit.owner_session_id,
                        retry_after_ms: this.claims.retryAfterFor(permit.owner_session_id)
                    }, correlationId);
                    break;
                }
                this.claims.release(payload.agent_id);
                const removed = this.simulation.unregisterAgent(payload.agent_id);
                this._sendWs(ws, {
                    type: 'UNREGISTER_AGENT_ACK',
                    status: removed ? 'UNREGISTERED' : 'NOT_FOUND',
                    agent_id: payload.agent_id,
                    release: permit.outcome
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.UNREGISTER_AGENT_BATCH: {
                const unregistered = [];
                const notFound = [];
                const refusedTeardown = [];
                for (const agentId of payload.agent_ids) {
                    const permit = this._authorizeTeardown(agentId, payload);
                    if (!permit.allowed) {
                        refusedTeardown.push({
                            agent_id: agentId,
                            reason: permit.outcome,
                            owner_session_id: permit.owner_session_id
                        });
                        continue;
                    }
                    this.claims.release(agentId);
                    if (this.simulation.unregisterAgent(agentId)) unregistered.push(agentId);
                    else notFound.push(agentId);
                }
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.UNREGISTER_AGENT_BATCH_RESPONSE,
                    status: 'UNREGISTERED',
                    count: unregistered.length,
                    unregistered,
                    not_found: notFound,
                    refused: refusedTeardown,
                    rejected: payload.rejected
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.TRAUMA_ZONE_BATCH: {
                const zoneIds = [];
                for (const zone of payload.zones) {
                    zoneIds.push(this.simulation.addTraumaZone(
                        zone.x, zone.y, zone.z,
                        zone.intensity, zone.radius, zone.lifetimeTicks
                    ));
                }
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.TRAUMA_ZONE_BATCH_RESPONSE,
                    status: 'ADDED',
                    count: zoneIds.length,
                    zone_ids: zoneIds,
                    rejected: payload.rejected
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
                // Caps read from the raw message: validateBatchTick rebuilds
                // its value (pinned shape) and drops unknown keys, so the
                // validated payload cannot carry them.
                const caps = ProtocolValidator.sanitizeTickCapabilities(msg && msg.capabilities);
                const results = this._applyHostContracts(this.simulation.tick(dt), caps);
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.BATCH_TICK_REQUEST: {
                const caps = ProtocolValidator.sanitizeTickCapabilities(msg && msg.capabilities);
                const results = this._applyHostContracts(
                    this.simulation.batchTick(payload.observations, payload.dt),
                    caps
                );
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.BATCH_TICK_RESPONSE,
                    tick: this.simulation.tickCount,
                    results
                }, correlationId);
                break;
            }

            case MESSAGE_TYPES.INTENT_OUTCOME_REPORT: {
                // R36: WebSocket twin of POST /api/v1/outcome.
                const val = ProtocolValidator.validateOutcomeReport(payload);
                if (!val.valid) {
                    return this._sendWsError(ws, val.errors.join(', '), val.code, correlationId);
                }
                const receipt = this.feedbackLoop.reportOutcome({
                    agentId: val.value.agent_id,
                    intentType: val.value.intent_type,
                    outcome: val.value.outcome,
                    reason: val.value.reason,
                    tick: val.value.tick
                });
                this._sendWs(ws, {
                    type: MESSAGE_TYPES.INTENT_OUTCOME_ACK,
                    status: 'RECORDED',
                    ...receipt
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
                const loadResult = this.simulation.loadSnapshot(payload.snapshot);
                if (!loadResult.success) {
                    return this._sendWsError(ws, loadResult.error, ERROR_CODES.SNAPSHOT_ERROR, correlationId);
                }
                // Same ownership restore as the HTTP twin, so a WebSocket host is
                // not second-class when it reloads a session it saved.
                const ownership = this._restoreOwnership(payload.snapshot);
                this._sendWs(ws, {
                    type: 'LOAD_SNAPSHOT_ACK',
                    status: 'LOADED',
                    tick: this.simulation.tickCount,
                    agentCount: this.simulation.agents.size,
                    ownership
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

    _sendWsError(ws, message, code = ERROR_CODES.SIMULATION_ERROR, correlationId = null, extra = null) {
        this._sendWs(ws, {
            type: MESSAGE_TYPES.ERROR_RESPONSE,
            error: message,
            code,
            // Additive detail (a refusal reason, a fresh challenge). Legacy
            // clients ignore what they do not read, so this costs them nothing.
            ...(extra && typeof extra === 'object' ? extra : {})
        }, correlationId);
    }
}

export default FearServer;
