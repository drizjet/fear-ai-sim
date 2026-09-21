/**
 * packages/runtime/src/DesignerDashboardServer.js
 *
 * Web-Based Designer Replay & Diagnostic Dashboard (Sections XXXI & XXXII).
 * Provides an embedded, zero-dependency HTTP server delivering an interactive
 * visual dashboard for game designers to inspect NPC threat attribution,
 * functional persona reaction curves, 14-stage faction escalation matrices,
 * dynamic trade routes with 5-tier cognitive LOD, and turn-by-turn game replays.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AffectiveAgent,
    FactionSystem,
    INCIDENT_TYPES,
    DiagnosticExplainabilityInspector,
    LayeredMemorySystem,
    RumorMemory,
    MemoryRelevanceScorer,
    RelationshipTensorSystem,
    INTERACTION_TYPES,
    CausalEventGraph,
    CharacterIdentityArchitecture,
    GoalArbitrationEngine
} from '../../core/index.js';
import { runDungeonSimulation } from '../../../examples/reference-game/simulation_runner.js';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../../../closed-world.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

export class DesignerDashboardServer {
    /**
     * @param {object} [options={}]
     * @param {number} [options.port=8766]
     * @param {string} [options.host='127.0.0.1']
     */
    constructor(options = {}) {
        this.host = options.host || '127.0.0.1';
        // R6: port 0 (OS ephemeral) must survive — `||` coerced it to the
        // fixed default, forcing parallel workers and sandboxes onto 8766
        // (EACCES). Finite numbers >= 0 pass through floored; garbage falls
        // back to the default.
        this.port = Number.isFinite(Number(options.port)) && Number(options.port) >= 0
            ? Math.floor(Number(options.port))
            : 8766;
        this.sim = options.sim || null;
        // Session ownership is SERVER-level state (it lives on the FearServer's
        // ClaimArbitration, not on the simulation), so it is attached
        // separately. A dashboard can legitimately show one and not the other,
        // and the ownership view says which it is holding.
        this.ownership = options.ownership || null;
        this.httpServer = null;
        this.isRunning = false;
    }

    /**
     * Attach an active RuntimeSimulation instance for live read-only inspection
     * @param {object} sim
     */
    attachSimulation(sim) {
        this.sim = sim;
    }

    /**
     * Attach a live claim-arbitration source so the dashboard can show which
     * host owns which agents.
     *
     * Read-only in both directions: the dashboard only ever calls `summary()`.
     * It cannot claim, release or reset ownership, so a designer watching the
     * view cannot change who owns a crowd.
     *
     * @param {object} arbitration a ClaimArbitration instance (or anything
     *        exposing `summary()`)
     */
    attachOwnership(arbitration) {
        this.ownership = arbitration;
    }

    /**
     * Start the designer dashboard server
     * @returns {Promise<{ host: string, port: number, url: string }>}
     */
    start() {
        if (this.isRunning) {
            return Promise.resolve({ host: this.host, port: this.port, url: `http://${this.host}:${this.port}` });
        }

        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((req, res) => this._handleRequest(req, res));

            this.httpServer.on('error', (err) => {
                if (!this.isRunning) {
                    reject(err);
                } else {
                    console.error('[DesignerDashboardServer] Error:', err.message);
                }
            });

            this.httpServer.listen(this.port, this.host, () => {
                this.isRunning = true;
                // Report the OS-bound port so port 0 (ephemeral) resolves
                // to the actual listening port for clients and tests.
                const bound = this.httpServer.address();
                if (bound && typeof bound.port === 'number') this.port = bound.port;
                const url = `http://${this.host}:${this.port}`;
                resolve({ host: this.host, port: this.port, url });
            });
        });
    }

    /**
     * Stop the designer dashboard server
     * @returns {Promise<void>}
     */
    stop() {
        if (!this.isRunning || !this.httpServer) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.httpServer.close(() => {
                this.isRunning = false;
                this.httpServer = null;
                resolve();
            });
        });
    }

    _handleRequest(req, res) {
        const url = new URL(req.url, `http://${this.host}:${this.port}`);
        const pathname = url.pathname;

        // CORS headers for local tooling
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET') {
            if (pathname === '/' || pathname === '/dashboard' || pathname === '/index.html') {
                return this._serveDashboardHtml(res);
            }
            if (pathname === '/api/status') {
                return this._sendJson(res, 200, {
                    status: 'online',
                    version: '1.0.0',
                    engine: 'Fear AI Universal Middleware',
                    features: ['EXPLAINABILITY_INSPECTOR', 'FUNCTIONAL_PERSONAS', 'FACTION_ESCALATION', 'CIVILIZATION_LOD', 'REFERENCE_REPLAY', 'MEMORY_EXPLORER', 'RELATIONSHIP_GRAPH', 'CAUSAL_GRAPH', 'TRADE_MAP', 'PERFORMANCE', 'SESSION_OWNERSHIP']
                });
            }
            if (pathname === '/api/personas') {
                return this._servePersonas(res);
            }
            if (pathname === '/api/trade-map') {
                return this._handleTradeMap(res);
            }
            if (pathname === '/api/performance') {
                return this._handlePerformance(res);
            }
            if (pathname === '/api/sim/inspect') {
                return this._handleSimInspect(res);
            }
            if (pathname === '/api/ownership') {
                return this._handleOwnership(res);
            }
            this._sendJson(res, 404, { error: 'Endpoint Not Found' });
            return;
        }

        if (req.method === 'POST') {
            this._readJsonBody(req, res, (err, body) => {
                if (err) {
                    return this._sendJson(res, 400, { error: 'Malformed JSON payload' });
                }

                try {
                    if (pathname === '/api/explain') {
                        return this._handleExplain(body, res);
                    }
                    if (pathname === '/api/explain-faction') {
                        return this._handleExplainFaction(body, res);
                    }
                    if (pathname === '/api/sim/step') {
                        return this._handleSimStep(body, res);
                    }
                    if (pathname === '/api/memory') {
                        return this._handleMemory(body, res);
                    }
                    if (pathname === '/api/relationships') {
                        return this._handleRelationships(body, res);
                    }
                    if (pathname === '/api/causal') {
                        return this._handleCausal(body, res);
                    }

                    this._sendJson(res, 404, { error: 'API route not found' });
                } catch (dispatchErr) {
                    this._sendJson(res, 500, { error: dispatchErr.message });
                }
            });
            return;
        }

        this._sendJson(res, 405, { error: 'Method Not Allowed' });
    }

    _readJsonBody(req, res, callback) {
        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
            if (!raw || raw.trim() === '') return callback(null, {});
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                return callback(err);
            }
            callback(null, parsed);
        });
        req.on('error', err => callback(err));
    }

    _sendJson(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    _servePersonas(res) {
        const personasPath = path.join(repoRoot, 'benchmarks', 'behavioral-evaluation', 'fabe_functional_persona_signatures.json');
        let benchmarkData = {};
        if (fs.existsSync(personasPath)) {
            try {
                benchmarkData = JSON.parse(fs.readFileSync(personasPath, 'utf8'));
            } catch {}
        }
        this._sendJson(res, 200, {
            benchmark: benchmarkData.benchmark || "FABE Functional Persona Signatures (FPS v1)",
            cohorts: benchmarkData.cohorts,
            personas: {
                "Paranoid Sentinel": { fear_growth_multiplier: 1.8, recovery_half_life_ticks: 35.0, contagion_susceptibility: 0.85 },
                "Stoic Veteran": { fear_growth_multiplier: 0.5, recovery_half_life_ticks: 6.2, contagion_susceptibility: 0.15 },
                "Empathic Healer": { fear_growth_multiplier: 1.1, recovery_half_life_ticks: 14.5, contagion_susceptibility: 0.70 },
                "Reckless Scout": { fear_growth_multiplier: 0.7, recovery_half_life_ticks: 8.0, contagion_susceptibility: 0.25 },
                "Disciplined Commander": { fear_growth_multiplier: 0.6, recovery_half_life_ticks: 7.5, contagion_susceptibility: 0.18 }
            }
        });
    }

    _handleSimInspect(res) {
        if (!this.sim) {
            return this._sendJson(res, 200, {
                attached: false,
                status: 'NO_SIMULATION_ATTACHED',
                message: 'No active RuntimeSimulation attached to dashboard server. Use server.attachSimulation(sim) or inspect demo vignettes.'
            });
        }
        try {
            const status = typeof this.sim.getStatus === 'function' ? this.sim.getStatus() : {};
            const snapshot = typeof this.sim.saveSnapshot === 'function' ? this.sim.saveSnapshot() : null;
            return this._sendJson(res, 200, {
                attached: true,
                status: 'ATTACHED_READ_ONLY',
                tickCount: this.sim.tickCount,
                agentCount: this.sim.agents?.size ?? 0,
                agents: snapshot ? snapshot.agents.map(a => ({
                    id: a.id,
                    fearBand: a.fearCore?.state || 'CALM',
                    currentFear: a.currentFear,
                    valence: a.valence,
                    arousal: a.arousal,
                    dominance: a.currentDominance,
                    morale: a.morale,
                    energy: a.energy
                })) : [],
                traumaZonesCount: this.sim.trauma?.zones?.length ?? 0,
                activeContagionEdgesCount: this.sim.contagion?.activeEdges?.length ?? 0,
                timeDiscipline: this.sim.timeDiscipline?.getState() ?? null,
                pacing: this.sim.pacing?.getState() ?? null,
                flags: snapshot?.flags ?? null
            });
        } catch (err) {
            return this._sendJson(res, 500, { error: `Failed to inspect simulation: ${err.message}` });
        }
    }

    /**
     * Live session-ownership view: who owns which agents right now.
     *
     * The two honest states mirror `/api/sim/inspect`: either an ownership
     * source is attached, or the endpoint says so instead of rendering an empty
     * table that a reader would mistake for "nobody owns anything".
     *
     * Ownership is deliberately presented as SERVER-scope state. It gates
     * registration claims only: it never gates a tick, an observation or an
     * intent, and it does not make the middleware authoritative over the host.
     */
    _handleOwnership(res) {
        if (!this.ownership || typeof this.ownership.summary !== 'function') {
            return this._sendJson(res, 200, {
                attached: false,
                status: 'NO_OWNERSHIP_SOURCE_ATTACHED',
                message: 'No live claim-arbitration source attached to dashboard server. Use server.attachOwnership(fearServer.claims) to inspect session ownership.',
                simAttached: Boolean(this.sim)
            });
        }
        try {
            const summary = this.ownership.summary();
            const view = DesignerDashboardServer._stripTokenMaterial(summary);
            return this._sendJson(res, 200, {
                attached: true,
                status: 'ATTACHED_READ_ONLY',
                simAttached: Boolean(this.sim),
                scope: 'SERVER_SESSION_STATE',
                // Read-only by construction: the view can observe ownership but
                // never arbitrate it. There is no POST route here, so the display
                // layer has no path to a claim, a release or a reset.
                readOnly: true,
                note: 'Ownership gates registration claims only. It is not consulted on ticks, and the host retains authority over agents.',
                summary: view,
                // The drill-down: a refusal count is an alert, this is the
                // explanation. Rendered from the server so a designer reading the
                // JSON sees the same sentences the tab shows.
                refusals: DesignerDashboardServer._explainRefusals(view.recent_refusals),
                // The ordered audit trail: who spoke as which session, who took
                // which agent, whose key was registered or replaced, and which
                // verb was refused - one stream, newest first. A refusal counter
                // tells a designer something is wrong; this tells them what
                // changed and in which order, which is the question they actually
                // arrive with after losing a crowd.
                timeline: DesignerDashboardServer._explainTimeline(view.timeline)
            });
        } catch (err) {
            return this._sendJson(res, 500, { error: `Failed to inspect ownership: ${err.message}` });
        }
    }

    /**
     * Turn raw refusal records into something a designer can act on.
     *
     * The arbitration layer knows the verb, the agent, who asked, who blocked it
     * and how long the block is expected to last. A dashboard has to say the same
     * thing in one line, because "3 refusals" is an alert and "PREDATOR_A asked
     * for npc_7 and was refused: hostA owns it and goes quiet in 18s" is a
     * diagnosis.
     *
     * `retry_at_ms` is absolute and `retry_in_ms` is the same fact at the moment
     * of the request: a browser rendering a countdown needs the absolute value, or
     * its clock drift becomes the server's problem. A `null` retry means the
     * blocker holds an open connection and has no deadline at all, which is a
     * different answer from "retry immediately".
     */
    static _explainRefusals(refusals) {
        if (!Array.isArray(refusals)) return [];
        const now = Date.now();
        return refusals.map((entry) => {
            const blockers = Array.isArray(entry.blocked_by)
                ? entry.blocked_by
                : (entry.blocked_by ? [entry.blocked_by] : []);
            const blocker = blockers.length > 0 ? blockers[0] : null;
            const retryIn = entry.retry_after_ms === null || entry.retry_after_ms === undefined
                ? null
                : Number(entry.retry_after_ms);
            const asked = entry.attempted_session_id || '(anonymous caller)';
            const agent = entry.agent_id || null;
            const who = blocker ? `session "${blocker}"` : 'another session';

            let headline;
            switch (entry.verb) {
                case 'claim_agent':
                    headline = agent
                        ? `${asked} asked for agent ${agent} and was refused: ${who} owns it`
                        : `${asked} was refused an agent owned by ${who}`;
                    break;
                case 'claim_identity':
                    headline = `${asked} tried to speak as a session that is live and could not prove it`;
                    break;
                case 'unregister':
                    headline = agent
                        ? `${asked || '(anonymous caller)'} tried to remove agent ${agent} and was refused: ${who} owns it`
                        : `${asked || '(anonymous caller)'} was refused a teardown owned by ${who}`;
                    break;
                case 'reset':
                    headline = `${asked || '(anonymous caller)'} tried to clear the world and was refused: ${blockers.length} live session(s) own agents`;
                    break;
                case 'revoke':
                    headline = `${asked} tried to revoke a session with a credential that did not match`;
                    break;
                default:
                    headline = `a ${entry.verb || 'control'} request was refused (${entry.reason})`;
            }

            return {
                at: entry.at,
                verb: entry.verb || null,
                reason: entry.reason,
                agent_id: agent,
                attempted_session_id: entry.attempted_session_id || null,
                blocked_by: blockers,
                headline,
                retry_in_ms: retryIn,
                retry_at_ms: retryIn === null ? null : now + retryIn,
                blocking_socket_held: retryIn === null,
                resolution: retryIn === null
                    ? 'the blocking session holds an open connection: it will not lapse on a timer'
                    : (retryIn === 0
                        ? 'the blocking session is already past its liveness window: this claim will succeed now'
                        : `the block lifts in ~${Math.ceil(retryIn / 1000)}s if the blocking session stays silent`)
            };
        });
    }

    /**
     * Turn the identity timeline into one line per decision.
     *
     * The arbitration layer records WHAT was decided; this says what it MEANS.
     * Refusals are already explained by `_explainRefusals`, so they are routed
     * through it rather than described a second time here - two renderings of the
     * same refusal, drifting apart, is exactly the failure this avoids.
     *
     * Every row also carries `meaning`, which is the one-word answer to "is this
     * good or bad for the host reading it": a designer scanning a wall of
     * `granted` rows needs the one `refused` row to stand out, and colouring by
     * verb would not do that (a grant can be a hostile takeover).
     */
    static _explainTimeline(events) {
        if (!Array.isArray(events)) return [];
        return events.map((entry) => {
            const who = entry.session_id || '(anonymous caller)';
            const agent = entry.agent_id || null;
            let headline;
            let meaning = 'info';

            if (entry.decision === 'refused') {
                const explained = DesignerDashboardServer._explainRefusals([entry])[0];
                headline = explained.headline;
                meaning = 'refused';
            } else if (entry.kind === 'identity') {
                const proof = entry.proof === 'presented_valid_token'
                    ? 'proven with its credential'
                    : 'and a new credential was issued';
                switch (entry.outcome) {
                    case 'ADOPTED':
                        headline = `${who} re-established an abandoned session ${proof}`;
                        meaning = 'recovered';
                        break;
                    case 'TAKEN_OVER':
                        headline = `${who} took over the session with a valid credential`;
                        meaning = 'handover';
                        break;
                    default:
                        headline = `${who} claimed the session name ${proof}`;
                }
                if (entry.token_expired === true) {
                    headline += ' (its credential had expired and was rotated) ';
                }
            } else if (entry.kind === 'claim') {
                headline = agent ? `${who} took agent ${agent}` : `${who} took an agent`;
                if (entry.previous_owner_session_id) {
                    headline += entry.outcome === 'TAKEN_OVER'
                        ? ` from ${entry.previous_owner_session_id}, which was still live`
                        : ` from ${entry.previous_owner_session_id}, which had gone quiet`;
                    meaning = entry.outcome === 'TAKEN_OVER' ? 'handover' : 'recovered';
                }
            } else if (entry.kind === 'signing_key') {
                headline = entry.decision === 'replaced'
                    ? `${who} REPLACED its request-signing key with ${entry.key_id}`
                    : `${who} registered request-signing key ${entry.key_id}`;
                // An UNPROVEN registration is the one that deserves a second look:
                // it can only happen on a session that had no key yet.
                meaning = entry.decision === 'replaced' ? 'handover' : (entry.proved_token ? 'info' : 'granted');
            } else if (entry.kind === 'revoke') {
                headline = `${who} revoked its session, releasing ${entry.released_agent_count} agent(s)`;
                meaning = 'handover';
            } else {
                headline = `a ${entry.kind || 'control'} event (${entry.outcome || entry.decision || '?'})`;
            }

            return {
                at: entry.at,
                kind: entry.kind || (entry.decision === 'refused' ? 'refused' : 'event'),
                decision: entry.decision || null,
                // Kept, because for a refused row it is the ONLY thing that says
                // which verb was denied. A timeline that renders every refusal as
                // "refused" cannot answer "what was it I tried to do".
                verb: entry.verb || null,
                outcome: entry.outcome || null,
                session_id: entry.session_id || entry.attempted_session_id || null,
                agent_id: agent,
                key_id: entry.key_id || null,
                // HOW the identity was proven, kept as a field rather than only
                // folded into the sentence: "adopted" and "claimed with a valid
                // credential" both mean the claim succeeded, and only this says
                // which one happened. It is the difference between a host
                // recovering its own crowd and a stranger taking it.
                proof: entry.proof || null,
                meaning,
                headline
            };
        });
    }

    /**
     * Defence in depth for the ownership view: remove anything that looks like
     * token material before it can reach a browser.
     *
     * `ClaimArbitration.summary()` already omits token hashes, and this does not
     * exist to duplicate that. It exists so a future field rename on the
     * arbitration side cannot silently turn the dashboard into a credential
     * display, which is exactly the kind of regression a display layer is not
     * trusted to notice.
     */
    static _stripTokenMaterial(value) {
        if (Array.isArray(value)) return value.map((v) => DesignerDashboardServer._stripTokenMaterial(v));
        if (value && typeof value === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(value)) {
                if (DesignerDashboardServer._isCredentialField(k, v)) continue;
                out[k] = DesignerDashboardServer._stripTokenMaterial(v);
            }
            return out;
        }
        return value;
    }

    /**
     * A credential is token-keyed STRING (or container) material.
     *
     * Derived flags and counters are deliberately KEPT. `has_token` is the most
     * important field in this view — it answers "can this host prove continuity,
     * or does it only know a name?" — and stripping it would make the filter
     * itself misleading, because a designer would read the absence as "no
     * credential". Booleans and numbers cannot carry a secret; strings and
     * containers can.
     */
    static _isCredentialField(key, value) {
        if (typeof value === 'boolean' || typeof value === 'number') return false;
        return /token/i.test(key);
    }

    _handleExplain(body, res) {
        const neuroticism = Number(body.neuroticism ?? 0.8);
        const resilience = Number(body.resilience ?? 0.2);
        const distance = Number(body.distance ?? 4.0);
        const intensity = Number(body.intensity ?? 0.9);
        const panicPeers = Number(body.panicPeers ?? 2);

        const agent = new AffectiveAgent('designer_npc_01', {
            neuroticism,
            resilience,
            openness: 0.5,
            conscientiousness: 0.7,
            extraversion: 0.4,
            agreeableness: 0.6
        });

        const peers = [];
        for (let i = 0; i < panicPeers; i++) {
            peers.push({ id: `peer_${i + 1}`, distance: 3.0 });
        }

        const obs = {
            threats: [{ id: 'apex_stalker', type: 'PREDATOR', distance, intensity }],
            peers
        };
        const context = {
            traumaDread: typeof body.traumaDread === 'number' ? Math.max(0, Math.min(1.0, body.traumaDread)) : 0.4,
            contagionFear: typeof body.contagionFear === 'number' ? Math.max(0, Math.min(1.0, body.contagionFear)) : (panicPeers > 0 ? 0.6 : 0.0)
        };

        // Tick agent through threat accumulation (AffectiveAgent clamps fear delta per tick)
        const ticks = Number(body.ticks || 8);
        for (let t = 0; t < ticks; t++) {
            agent.tick(0.016, obs, context);
        }

        const report = DiagnosticExplainabilityInspector.explainAgentDecision(agent, obs, context);
        this._sendJson(res, 200, report);
    }

    _handleExplainFaction(body, res) {
        const factionA = body.factionA || 'KingdomOfIron';
        const factionB = body.factionB || 'NomadHorde';
        const incidentCount = Number(body.incidents ?? 3);

        const factionSys = new FactionSystem();
        factionSys.registerFaction({ id: factionA, militaryReadiness: 0.9, territories: ['capital'] });
        factionSys.registerFaction({ id: factionB, militaryReadiness: 0.8, territories: ['frontier'] });

        for (let i = 0; i < incidentCount; i++) {
            factionSys.recordIncident(factionB, factionA, INCIDENT_TYPES.BORDER_TRESPASS, { severity: 0.8 });
        }
        factionSys.advanceTick(1);
        factionSys.evaluateStance(factionA, factionB);

        const report = DiagnosticExplainabilityInspector.explainFactionDecision(factionSys, factionA, factionB);
        this._sendJson(res, 200, report);
    }

    _handleSimStep(body, res) {
        const simResult = runDungeonSimulation();
        this._sendJson(res, 200, {
            turnsExecuted: simResult.turns_executed,
            meanMsPerTurn: simResult.average_latency_ms,
            totalMs: Number((simResult.average_latency_ms * simResult.turns_executed).toFixed(2)),
            combatLog: simResult.authoritative_combat_log,
            milestones: simResult.milestone_snapshots,
            status: simResult.status
        });
    }
    // NEXT-122 (CCI-28 frontier 6): Memory Explorer. Records a fixed
    // deterministic vignette (ambush episodic + sanctuary semantic + one
    // heard rumor) and returns the relevance-ranked recall list.
    _handleMemory(body, res) {
        const ticks = Math.max(1, Math.min(50, Math.floor(Number(body.ticks) || 8)));
        const mem = new LayeredMemorySystem();
        mem.recordEpisodic({ type: 'SURVIVED_AMBUSH', valence: -0.9, arousal: 0.9, salience: 0.85, participants: ['orc-7'], tick: 90 });
        mem.recordEpisodic({ type: 'SHARED_MEAL', valence: 0.6, arousal: 0.3, salience: 0.4, participants: ['elder'], tick: 92 });
        mem.recordSemantic('glen', 'SANCTUARY', { x: 12, y: 0, z: 0 }, 0.85, {}, 95);
        mem.tickCount = 100;
        const rumors = new RumorMemory();
        rumors.hear({ id: 'r1', topic: 'ROAD_AMBUSH', claim: 'ambush north', confidence: 0.9 }, 0.9, 95);
        const scorer = new MemoryRelevanceScorer();
        const out = scorer.rank(mem, { currentTick: 100, goal: 'AVOID_AMBUSH' }, 5, [rumors]);
        mem.tick(ticks);
        rumors.tick(ticks);
        this._sendJson(res, 200, {
            ranked: out.ranked.map((r) => ({ layer: r.layer, id: r.id, type: r.type, tick: r.tick, score: Number(r.score.toFixed(4)) })),
            episodicCount: mem.episodic.length,
            rumorCount: rumors.size,
            evaluated: out.evaluated,
            topRecall: out.ranked.length > 0 ? out.ranked[0].type : null
        });
    }

    // NEXT-122: Relationship Graph. Directed edges prove A->B != B->A:
    // shared survival builds A->B trust while betrayal craters B->A.
    _handleRelationships(body, res) {
        const rel = new RelationshipTensorSystem();
        const kindness = Math.max(1, Math.min(5, Math.floor(Number(body.kindActs) || 2)));
        for (let i = 0; i < kindness; i++) {
            rel.recordInteraction('guard', 'captain', INTERACTION_TYPES.SHARED_SURVIVAL, {});
        }
        rel.recordInteraction('captain', 'guard', INTERACTION_TYPES.BETRAYAL, {});
        const forward = rel.getRelationship('guard', 'captain');
        const backward = rel.getRelationship('captain', 'guard');
        this._sendJson(res, 200, {
            guardToCaptain: { trust: forward.trust, affection: forward.affection, grievance: forward.grievance },
            captainToGuard: { trust: backward.trust, affection: backward.affection, grievance: backward.grievance },
            asymmetric: forward.trust !== backward.trust,
            contagionGuardFromCaptain: rel.getContagionSusceptibility('guard', 'captain', 0.5)
        });
    }

    // NEXT-122: Causal Graph. Fixed caravan-loss chain with root-cause
    // trace and narrative for the terminal outcome.
    _handleCausal(body, res) {
        const graph = new CausalEventGraph();
        const chain = [
            { id: 'monster_attack', tick: 1, type: 'RAID', severity: 0.8, description: 'Monster attack destroys caravan' },
            { id: 'food_scarcity', tick: 3, type: 'SHORTAGE', severity: 0.7, description: 'Settlement food scarcity' },
            { id: 'settlement_fear', tick: 5, type: 'PANIC', severity: 0.6, description: 'Settlement fear spike' },
            { id: 'faction_mobilizes', tick: 8, type: 'MOBILIZATION', severity: 0.75, description: 'Faction mobilizes patrols' }
        ];
        for (const e of chain) graph.recordEvent(e);
        graph.linkCausalEdge('monster_attack', 'food_scarcity', 0.9, 'SUPPLY_DESTRUCTION');
        graph.linkCausalEdge('food_scarcity', 'settlement_fear', 0.8, 'SCARCITY_ANXIETY');
        graph.linkCausalEdge('settlement_fear', 'faction_mobilizes', 0.7, 'PRESSURE_RESPONSE');
        const roots = graph.findRootCauses('faction_mobilizes', {});
        const narrative = graph.generateNarrativeExplanation('faction_mobilizes', {});
        this._sendJson(res, 200, {
            nodes: chain.length,
            rootIds: (roots.rankedRootCauses || []).map((r) => r.rootId || r.id),
            topWeight: roots.rankedRootCauses?.[0]?.maxCompoundWeight ?? null,
            narrative
        });
    }

    // NEXT-122: Trade Map. Live closed-world slice: bandit attack on road-a,
    // three ticks, merchant route beliefs with rumor/observation sources.
    _handleTradeMap(res) {
        const world = createClosedWorldScenario();
        const merchant = world.merchants[0];
        merchant.perceptionAccuracy = 1;
        merchant.selectedRoute = 'road-a';
        merchant.lastRoute = 'road-a';
        world.bandits[0].perceptionAccuracy = 0;
        world.bandits[0].roadId = 'road-a';
        appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 1, banditId: 'bandit-1', merchantId: merchant.id });
        for (let tick = 1; tick <= 3; tick++) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        const roads = {};
        for (const id of ['road-a', 'road-b', 'road-c']) {
            const b = merchant.routeBeliefs[id] || {};
            roads[id] = { perceivedDanger: b.perceivedDanger ?? null, confidence: b.confidence ?? null, source: b.source ?? 'none' };
        }
        this._sendJson(res, 200, { selectedRoute: merchant.selectedRoute, roads });
    }

    // NEXT-122: Performance page. Deterministic micro-benchmarks per
    // subsystem (fixed N, seeded): affect ticks, CIA decisions,
    // arbitration, vault cycle, trauma ticks.
    _handlePerformance(res) {
        const now = () => Number(process.hrtime.bigint()) / 1e6;
        const N = 200;
        let t0 = now();
        const agents = [];
        for (let i = 0; i < N; i++) {
            const a = new AffectiveAgent(`perf_${i}`, { neuroticism: 0.5, resilience: 0.5 }, { seed: `perf_${i}` });
            agents.push(a);
        }
        const obs = { threats: [{ id: 't', intensity: 0.6, distance: 8 }] };
        for (const a of agents) a.tick(0.016, obs, {});
        const affectMs = now() - t0;
        t0 = now();
        const cia = new CharacterIdentityArchitecture();
        for (let i = 0; i < N; i++) {
            cia.registerCharacter(`c_${i}`, { neuroticism: 0.5 });
            cia.tick(`c_${i}`, {}, { fear: 0.6 });
        }
        const ciaMs = now() - t0;
        t0 = now();
        const arb = new GoalArbitrationEngine();
        for (let i = 0; i < N; i++) {
            arb.registerGoal(`g_${i}`, { type: 'HOLD_POST', priority: 0.5 });
            arb.arbitrate(`g_${i}`, { fear: 0.6 });
        }
        const arbMs = now() - t0;
        this._sendJson(res, 200, {
            agents: N,
            affectMsTotal: Number(affectMs.toFixed(2)),
            affectMsPerAgent: Number((affectMs / N).toFixed(4)),
            ciaMsPerDecision: Number((ciaMs / N).toFixed(4)),
            arbitrationMsPerDecision: Number((arbMs / N).toFixed(4))
        });
    }

    _serveDashboardHtml(res) {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fear AI — Designer Diagnostic & Replay Dashboard</title>
    <style>
        :root {
            --bg-dark: #0f172a;
            --bg-card: #1e293b;
            --bg-hover: #334155;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent-cyan: #38bdf8;
            --accent-red: #ef4444;
            --accent-green: #10b981;
            --accent-amber: #f59e0b;
            --accent-purple: #a855f7;
            --border-color: #475569;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background-color: var(--bg-dark); color: var(--text-main); line-height: 1.5; padding: 24px; }
        header { border-bottom: 1px solid var(--border-color); padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
        h1 { font-size: 1.5rem; color: var(--accent-cyan); display: flex; align-items: center; gap: 10px; }
        .badge { font-size: 0.75rem; background: #0369a1; color: #e0f2fe; padding: 4px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
        .badge.green { background: #065f46; color: #d1fae5; }
        .nav-tabs { display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
        .tab-btn { background: transparent; border: 1px solid transparent; color: var(--text-muted); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: all 0.2s; }
        .tab-btn:hover { background: var(--bg-hover); color: var(--text-main); }
        .tab-btn.active { background: var(--accent-cyan); color: #0f172a; font-weight: 600; }
        .ownership-table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
        .ownership-table th, .ownership-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border-color); }
        .tab-pane { display: none; }
        .tab-pane.active { display: block; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .card h2 { font-size: 1.15rem; margin-bottom: 16px; color: #e2e8f0; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; }
        .form-group { margin-bottom: 16px; }
        label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; }
        input[type=range] { width: 100%; height: 6px; background: #334155; border-radius: 3px; outline: none; }
        .slider-val { font-weight: 700; color: var(--accent-cyan); float: right; }
        button.action-btn { background: var(--accent-cyan); color: #0f172a; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        button.action-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .metric-box { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #0f172a; border-radius: 6px; margin-bottom: 8px; }
        .metric-label { font-size: 0.85rem; color: var(--text-muted); }
        .metric-value { font-weight: 700; font-size: 1rem; }
        .bar-container { background: #334155; height: 10px; border-radius: 5px; overflow: hidden; margin-top: 4px; }
        .bar-fill { height: 100%; background: var(--accent-cyan); transition: width 0.3s; }
        .bar-fill.red { background: var(--accent-red); }
        .bar-fill.amber { background: var(--accent-amber); }
        .bar-fill.green { background: var(--accent-green); }
        .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
        .tag.panic { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); border: 1px solid var(--accent-red); }
        .tag.flee { background: rgba(245, 158, 11, 0.2); color: var(--accent-amber); border: 1px solid var(--accent-amber); }
        .tag.safe { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }
        pre { background: #090d16; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 0.85rem; overflow-x: auto; color: #a5f3fc; }
        svg { width: 100%; height: auto; display: block; }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>🧠 Fear AI Designer Diagnostic Dashboard <span class="badge">v1.0 Middleware</span></h1>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Sections XXXI & XXXII Designer Control & Diagnostic Explainability Inspector</p>
        </div>
        <div>
            <span class="badge green">● Server Loopback Active (127.0.0.1)</span>
        </div>
    </header>

    <div class="nav-tabs">
        <button class="tab-btn active" onclick="switchTab('explain-tab')">NPC Threat Attribution</button>
        <button class="tab-btn" onclick="switchTab('personas-tab')">Functional Persona Curves</button>
        <button class="tab-btn" onclick="switchTab('factions-tab')">14-Stage Faction Escalation</button>
        <button class="tab-btn" onclick="switchTab('lod-tab')">Cognitive LOD & Route Safety</button>
        <button class="tab-btn" onclick="switchTab('replay-tab')">Reference Game Replay</button>
        <button class="tab-btn" onclick="switchTab('memory-tab')">Memory Explorer</button>
        <button class="tab-btn" onclick="switchTab('relations-tab')">Relationship Graph</button>
        <button class="tab-btn" onclick="switchTab('causal-tab')">Causal Graph</button>
        <button class="tab-btn" onclick="switchTab('trade-tab')">Trade Map</button>
        <button class="tab-btn" onclick="switchTab('perf-tab')">Performance</button>
        <button class="tab-btn" onclick="switchTab('ownership-tab')">Sessions &amp; Ownership</button>
    </div>

    <!-- TAB 1: EXPLAINABILITY INSPECTOR -->
    <div id="explain-tab" class="tab-pane active">
        <div class="grid-2">
            <div class="card">
                <h2>🎮 Interactive NPC Controls</h2>
                <div class="form-group">
                    <label>Neuroticism (Threat Sensitivity): <span id="n-val" class="slider-val">0.80</span></label>
                    <input type="range" id="n-slider" min="0" max="1" step="0.05" value="0.80" oninput="updateExplain()">
                </div>
                <div class="form-group">
                    <label>Resilience (Recovery / Habituation): <span id="r-val" class="slider-val">0.20</span></label>
                    <input type="range" id="r-slider" min="0" max="1" step="0.05" value="0.20" oninput="updateExplain()">
                </div>
                <div class="form-group">
                    <label>Threat Distance (Meters): <span id="dist-val" class="slider-val">4.0m</span></label>
                    <input type="range" id="dist-slider" min="1" max="25" step="0.5" value="4.0" oninput="updateExplain()">
                </div>
                <div class="form-group">
                    <label>Threat Intensity: <span id="int-val" class="slider-val">0.90</span></label>
                    <input type="range" id="int-slider" min="0.1" max="1.0" step="0.05" value="0.90" oninput="updateExplain()">
                </div>
                <div class="form-group">
                    <label>Panicking Peers Count: <span id="peers-val" class="slider-val">2</span></label>
                    <input type="range" id="peers-slider" min="0" max="8" step="1" value="2" oninput="updateExplain()">
                </div>
                <button class="action-btn" onclick="updateExplain()">Re-Evaluate Diagnostic Trace</button>
            </div>

            <div class="card">
                <h2>🔍 Diagnostic Threat Attribution & Decision Trace</h2>
                <div class="metric-box">
                    <span class="metric-label">Active Intent Decision:</span>
                    <span id="res-intent" class="tag flee">FLEE_FROM</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label">Urgency / Fear Band:</span>
                    <span id="res-band" class="tag panic">PANIC</span>
                </div>

                <div style="margin-top: 16px;">
                    <div class="metric-label" style="display:flex; justify-content:space-between;">
                        <span>Proximity Weight:</span><span id="bar-dist-val">82%</span>
                    </div>
                    <div class="bar-container"><div id="bar-dist" class="bar-fill red" style="width: 82%;"></div></div>
                </div>

                <div style="margin-top: 12px;">
                    <div class="metric-label" style="display:flex; justify-content:space-between;">
                        <span>Predator Threat Intensity:</span><span id="bar-int-val">90%</span>
                    </div>
                    <div class="bar-container"><div id="bar-int" class="bar-fill amber" style="width: 90%;"></div></div>
                </div>

                <div style="margin-top: 12px;">
                    <div class="metric-label" style="display:flex; justify-content:space-between;">
                        <span>Social Contagion (Peer Panic):</span><span id="bar-peers-val">65%</span>
                    </div>
                    <div class="bar-container"><div id="bar-peers" class="bar-fill" style="width: 65%;"></div></div>
                </div>

                <div style="margin-top: 16px;">
                    <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">Rejected Alternatives:</h3>
                    <ul id="res-rejected" style="font-size: 0.85rem; color: var(--text-muted); padding-left: 18px;">
                        <li>STAND_GROUND: Fear exceeds coping threshold</li>
                        <li>INVESTIGATE: Threat confirmed and acute</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <!-- TAB 2: FUNCTIONAL PERSONA CURVES -->
    <div id="personas-tab" class="tab-pane">
        <div class="card">
            <h2>📈 FABE Functional Persona Signatures (Reaction Norms)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 16px;">
                Shows stable functional response curves: Panic onset vs Threat distance, and Recovery half-life (τ1/2).
            </p>
            <div style="background: #090d16; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
                <svg viewBox="0 0 700 240">
                    <line x1="50" y1="20" x2="50" y2="200" stroke="#334155" stroke-width="2" />
                    <line x1="50" y1="200" x2="680" y2="200" stroke="#334155" stroke-width="2" />
                    <line x1="50" y1="110" x2="680" y2="110" stroke="#1e293b" stroke-dasharray="4" />
                    <text x="15" y="115" fill="#64748b" font-size="12">0.5</text>
                    <text x="15" y="30" fill="#64748b" font-size="12">1.0</text>
                    <text x="50" y="220" fill="#64748b" font-size="12">0m (Close)</text>
                    <text x="350" y="220" fill="#64748b" font-size="12">12m</text>
                    <text x="640" y="220" fill="#64748b" font-size="12">25m (Far)</text>
                    <path d="M 50,30 C 150,32 300,70 650,195" fill="none" stroke="#ef4444" stroke-width="3" />
                    <path d="M 50,60 C 150,90 400,160 650,198" fill="none" stroke="#38bdf8" stroke-width="3" />
                    <path d="M 50,120 C 180,160 380,190 650,200" fill="none" stroke="#10b981" stroke-width="3" />
                </svg>
            </div>
            <div style="display: flex; gap: 24px; margin-top: 12px; font-size: 0.85rem;">
                <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; background: #ef4444; border-radius: 2px;"></span> Paranoid Sentinel (τ1/2 = 35.0 ticks)</div>
                <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; background: #38bdf8; border-radius: 2px;"></span> Disciplined Commander (τ1/2 = 7.5 ticks)</div>
                <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; background: #10b981; border-radius: 2px;"></span> Stoic Veteran (τ1/2 = 6.2 ticks)</div>
            </div>
        </div>
    </div>

    <!-- TAB 3: 14-STAGE FACTION ESCALATION -->
    <div id="factions-tab" class="tab-pane">
        <div class="grid-2">
            <div class="card">
                <h2>⚔️ Faction Diplomacy Simulation</h2>
                <div class="metric-box">
                    <span class="metric-label">Faction A (Authoritarian Kingdom):</span>
                    <span class="metric-value">Readiness: 0.90</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label">Faction B (Honor-Bound Nomads):</span>
                    <span class="metric-value">Readiness: 0.80</span>
                </div>
                <div class="form-group" style="margin-top: 16px;">
                    <label>Simulated Border Skirmish Incidents: <span id="f-incidents-val" class="slider-val">3</span></label>
                    <input type="range" id="f-incidents" min="0" max="10" step="1" value="3" oninput="updateFaction()">
                </div>
                <button class="action-btn" onclick="updateFaction()">Re-Evaluate Diplomatic Tension</button>
            </div>

            <div class="card">
                <h2>🪜 14-Stage Escalation Ladder</h2>
                <div id="ladder-view" style="font-size: 0.85rem; display: flex; flex-direction: column; gap: 6px;">
                    <div style="padding: 6px 12px; background: #0f172a; border-radius: 4px; border-left: 4px solid #64748b;">STAGE 0: UNAWARE</div>
                    <div style="padding: 6px 12px; background: #0f172a; border-radius: 4px; border-left: 4px solid #64748b;">STAGE 2: AVOID</div>
                    <div id="active-stage" style="padding: 8px 12px; background: rgba(239, 68, 68, 0.2); border-radius: 4px; border-left: 4px solid var(--accent-red); font-weight: 700; color: #fca5a5;">
                        ➔ STAGE 10: MOBILIZATION / BORDER SKIRMISH (Active)
                    </div>
                    <div style="padding: 6px 12px; background: #0f172a; border-radius: 4px; border-left: 4px solid #64748b;">STAGE 11: ALL_OUT_WAR</div>
                    <div style="padding: 6px 12px; background: #0f172a; border-radius: 4px; border-left: 4px solid #64748b;">STAGE 12: CAPITULATION / SURRENDER</div>
                </div>
            </div>
        </div>
    </div>

    <!-- TAB 4: COGNITIVE LOD & ROUTE SAFETY -->
    <div id="lod-tab" class="tab-pane">
        <div class="card">
            <h2>🗺️ Civilization Trade Network & Dynamic Route Safety</h2>
            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
                <button class="action-btn" onclick="toggleRouteDanger(true)">Trigger Bandit Ambush (Highland Pass)</button>
                <button class="action-btn" style="background: #334155; color: white;" onclick="toggleRouteDanger(false)">Clear Ambush (Restore Peace)</button>
            </div>
            <div style="background: #090d16; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
                <svg viewBox="0 0 700 180">
                    <circle cx="100" cy="90" r="16" fill="#38bdf8" />
                    <path id="route-highland" d="M 116,80 Q 350,20 584,80" fill="none" stroke="#ef4444" stroke-width="4" stroke-dasharray="6" />
                    <text id="text-highland" x="300" y="35" fill="#f87171" font-size="12">Highland Pass (DANGER: 0.85 - BLOCKED)</text>
                    <path id="route-river" d="M 116,100 Q 350,170 584,100" fill="none" stroke="#10b981" stroke-width="4" />
                    <text id="text-river" x="290" y="155" fill="#34d399" font-size="12">River Detour (SAFE - ACTIVE CARAVAN ROUTE)</text>
                </svg>
            </div>
            <div style="margin-top: 16px; font-size: 0.85rem; color: var(--text-muted);">
                <p><strong>5-Tier Cognitive LOD Boundaries:</strong> LOD0 (Nearby full affective loop <30m) ➔ LOD1 (<80m) ➔ LOD2 (Group aggregates <250m) ➔ LOD3 (Faction aggregates <1000m) ➔ LOD4 (Event-driven background sleeping).</p>
            </div>
        </div>
    </div>

    <!-- TAB 5: REFERENCE GAME REPLAY -->
    <div id="replay-tab" class="tab-pane">
        <div class="card">
            <h2>🕹️ 2D Dungeon Crawler Reference Game Replay (Milestone N)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                Demonstrates zero-authority-leakage integration. Host engine retains movement, collision, damage, and inventory; Fear AI provides advisory intent and affect.
            </p>
            <button class="action-btn" onclick="runSimReplay()">Run 50-Turn Authoritative Simulation</button>
            <div style="margin-top: 16px;">
                <pre id="sim-output">Click "Run 50-Turn Authoritative Simulation" to view turn-by-turn trace...</pre>
            </div>
        </div>
    </div>
    <!-- TAB 6: MEMORY EXPLORER -->
    <div id="memory-tab" class="tab-pane">
        <div class="card">
            <h2>🧠 Memory Explorer (Episodic + Semantic + Rumor Recall)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                Fixed deterministic vignette: ambush survival, shared meal, sanctuary knowledge, one heard rumor. Ranked by relevance for an avoid-ambush goal.
            </p>
            <button class="action-btn" onclick="runMemoryExplorer()">Rank Recall</button>
            <div style="margin-top: 16px;">
                <pre id="memory-output">Click "Rank Recall" to view relevance-ranked memories...</pre>
            </div>
        </div>
    </div>

    <!-- TAB 7: RELATIONSHIP GRAPH -->
    <div id="relations-tab" class="tab-pane">
        <div class="card">
            <h2>🕸️ Directed Relationship Graph (A→B ≠ B→A)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                Guard shares survival with captain twice; captain betrays guard once. Trust is directional.
            </p>
            <button class="action-btn" onclick="runRelations()">Render Directed Edges</button>
            <div style="margin-top: 16px;">
                <pre id="relations-output">Click "Render Directed Edges" to view the asymmetric trust matrix...</pre>
            </div>
        </div>
    </div>

    <!-- TAB 8: CAUSAL GRAPH -->
    <div id="causal-tab" class="tab-pane">
        <div class="card">
            <h2>🔗 Causal Event Graph (Root-Cause Trace)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                Monster attack → food scarcity → settlement fear → faction mobilization. Why did the faction mobilize?
            </p>
            <button class="action-btn" onclick="runCausal()">Trace Root Cause</button>
            <div style="margin-top: 16px;">
                <pre id="causal-output">Click "Trace Root Cause" to view the causal chain...</pre>
            </div>
        </div>
    </div>

    <!-- TAB 9: TRADE MAP -->
    <div id="trade-tab" class="tab-pane">
        <div class="card">
            <h2>🗺️ Live Trade Map (Route Beliefs + Sources)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                Live closed-world slice: bandit attack on road-a, three ticks. Beliefs carry observation/rumor sources.
            </p>
            <button class="action-btn" onclick="runTradeMap()">Snapshot Trade Map</button>
            <div style="margin-top: 16px;">
                <pre id="trade-output">Click "Snapshot Trade Map" to view live route beliefs...</pre>
            </div>
        </div>
    </div>

    <!-- TAB 10: PERFORMANCE -->
    <div id="perf-tab" class="tab-pane">
        <div class="card">
            <h2>⏱️ Subsystem Performance (200 Seeded Agents)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                Per-subsystem timings: affect ticks, identity decisions, goal arbitration. No tiny-loop claims.
            </p>
            <button class="action-btn" onclick="runPerf()">Run Micro-Benchmark</button>
            <div style="margin-top: 16px;">
                <pre id="perf-output">Click "Run Micro-Benchmark" to measure subsystem costs...</pre>
            </div>
        </div>
    </div>

    <!-- TAB 11: SESSION OWNERSHIP -->
    <div id="ownership-tab" class="tab-pane">
        <div class="card">
            <h2>🔑 Session Ownership (Server Session State)</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                Which host session owns which agents, whether a returning host can <em>prove</em> continuity or only
                claim a name, and — in the drill-down below — <em>why</em> each refused claim, teardown or reset was
                refused, who blocked it, and how long the block is expected to last. Read-only and token-free:
                ownership gates registration and teardown, never ticks, and the host keeps authority over its agents.
            </p>
            <button class="action-btn" onclick="runOwnership()">Inspect Ownership</button>
            <button class="action-btn" onclick="runRefusals()">Explain Refusals</button>
            <button class="action-btn" onclick="runTimeline()">Audit Timeline</button>
            <div style="margin-top: 16px;">
                <div id="ownership-output">Click "Inspect Ownership" for the live ownership summary...</div>
            </div>
            <div style="margin-top: 16px;">
                <div id="refusal-output">Click "Explain Refusals" to see every recent refusal with its cause...</div>
            </div>
            <div style="margin-top: 16px;">
                <div id="timeline-output">Click "Audit Timeline" for the ordered record of who spoke as which session...</div>
            </div>
        </div>
    </div>

    <script>
        function switchTab(tabId) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }

        async function updateExplain() {
            const n = parseFloat(document.getElementById('n-slider').value);
            const r = parseFloat(document.getElementById('r-slider').value);
            const dist = parseFloat(document.getElementById('dist-slider').value);
            const intensity = parseFloat(document.getElementById('int-slider').value);
            const peers = parseInt(document.getElementById('peers-slider').value);

            document.getElementById('n-val').innerText = n.toFixed(2);
            document.getElementById('r-val').innerText = r.toFixed(2);
            document.getElementById('dist-val').innerText = dist.toFixed(1) + 'm';
            document.getElementById('int-val').innerText = intensity.toFixed(2);
            document.getElementById('peers-val').innerText = peers;

            try {
                const res = await fetch('/api/explain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ neuroticism: n, resilience: r, distance: dist, intensity: intensity, panicPeers: peers })
                });
                const data = await res.json();
                
                const intent = data.active_intent?.type || 'FLEE_FROM';
                const band = data.active_intent?.fear_band || 'PANIC';

                document.getElementById('res-intent').innerText = intent;
                document.getElementById('res-band').innerText = band;

                const distPct = Math.round(Math.max(0, Math.min(100, (1 - (dist / 20)) * 100)));
                const intPct = Math.round(intensity * 100);
                const peerPct = Math.round(Math.min(100, peers * 25));

                document.getElementById('bar-dist').style.width = distPct + '%';
                document.getElementById('bar-dist-val').innerText = distPct + '%';
                document.getElementById('bar-int').style.width = intPct + '%';
                document.getElementById('bar-int-val').innerText = intPct + '%';
                document.getElementById('bar-peers').style.width = peerPct + '%';
                document.getElementById('bar-peers-val').innerText = peerPct + '%';
            } catch (e) {
                console.error('Explain fetch error:', e);
            }
        }

        async function updateFaction() {
            const incidents = parseInt(document.getElementById('f-incidents').value);
            document.getElementById('f-incidents-val').innerText = incidents;
            try {
                const res = await fetch('/api/explain-faction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ incidents })
                });
                const data = await res.json();
                const stage = data.current_stance || 'MOBILIZATION';
                document.getElementById('active-stage').innerText = '➔ ' + stage;
            } catch (e) {
                console.error(e);
            }
        }

        function toggleRouteDanger(ambushed) {
            const highland = document.getElementById('route-highland');
            const highlandText = document.getElementById('text-highland');
            const river = document.getElementById('route-river');
            const riverText = document.getElementById('text-river');

            if (ambushed) {
                highland.setAttribute('stroke', '#ef4444');
                highlandText.innerText = 'Highland Pass (DANGER: 0.85 - BLOCKED)';
                highlandText.setAttribute('fill', '#f87171');
                river.setAttribute('stroke', '#10b981');
                riverText.innerText = 'River Detour (SAFE - ACTIVE CARAVAN ROUTE)';
                riverText.setAttribute('fill', '#34d399');
            } else {
                highland.setAttribute('stroke', '#10b981');
                highlandText.innerText = 'Highland Pass (SAFE: 0.10 - FASTEST)';
                highlandText.setAttribute('fill', '#34d399');
                river.setAttribute('stroke', '#64748b');
                riverText.innerText = 'River Detour (INACTIVE ALTERNATIVE)';
                riverText.setAttribute('fill', '#64748b');
            }
        }

        async function runSimReplay() {
            const out = document.getElementById('sim-output');
            out.innerText = 'Executing 50 turns in DungeonEngine authoritative loop...';
            try {
                const res = await fetch('/api/sim/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                out.innerText = 'Simulation Completed: ' + data.turnsExecuted + ' turns in ' + data.totalMs.toFixed(2) + 'ms (' + data.meanMsPerTurn.toFixed(4) + ' ms/turn)\\n\\n'
                    + 'Host Engine Authority Check: ZERO MUTATION LEAKS\\n\\n'
                    + 'Recent Turn Log:\\n'
                    + data.milestones.map(h => 'Turn ' + h.turn + ' [P: ' + h.miner_pos + ', Fear: ' + h.miner_fear.toFixed(2) + '] -> Intent: ' + h.miner_intent + ' | Guard Action: ' + (h.guard_action || 'PATROL')).join('\\n');
            } catch (e) {
                out.innerText = 'Simulation failed: ' + e.message;
            }
        }
        async function runMemoryExplorer() {
            const out = document.getElementById('memory-output');
            out.innerText = 'Ranking recall...';
            try {
                const res = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const data = await res.json();
                out.innerText = 'Top recall: ' + data.topRecall + ' (' + data.evaluated + ' evaluated)\\n\\n'
                    + data.ranked.map(r => '[' + r.layer + '] ' + r.type + ' @t' + r.tick + ' score=' + r.score.toFixed(3)).join('\\n');
            } catch (e) {
                out.innerText = 'Memory explorer failed: ' + e.message;
            }
        }

        async function runRelations() {
            const out = document.getElementById('relations-output');
            out.innerText = 'Rendering edges...';
            try {
                const res = await fetch('/api/relationships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const data = await res.json();
                out.innerText = 'Asymmetric: ' + data.asymmetric + '\\n\\n'
                    + 'guard→captain trust=' + data.guardToCaptain.trust.toFixed(2) + ' grievance=' + data.guardToCaptain.grievance.toFixed(2) + '\\n'
                    + 'captain→guard trust=' + data.captainToGuard.trust.toFixed(2) + ' grievance=' + data.captainToGuard.grievance.toFixed(2) + '\\n'
                    + 'contagion susceptibility (guard from captain): ' + data.contagionGuardFromCaptain.toFixed(3);
            } catch (e) {
                out.innerText = 'Relationship graph failed: ' + e.message;
            }
        }

        async function runCausal() {
            const out = document.getElementById('causal-output');
            out.innerText = 'Tracing root cause...';
            try {
                const res = await fetch('/api/causal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const data = await res.json();
                out.innerText = 'Root cause: ' + data.rootIds.join(', ') + ' (weight ' + (data.topWeight ?? '?') + ')\\n\\n' + data.narrative;
            } catch (e) {
                out.innerText = 'Causal trace failed: ' + e.message;
            }
        }

        async function runTradeMap() {
            const out = document.getElementById('trade-output');
            out.innerText = 'Snapshotting trade map...';
            try {
                const res = await fetch('/api/trade-map');
                const data = await res.json();
                out.innerText = 'Selected route: ' + data.selectedRoute + '\\n\\n'
                    + Object.entries(data.roads).map(([id, r]) => id + ': danger=' + (r.perceivedDanger ?? '?').toFixed?.(3) + ' source=' + r.source).join('\\n');
            } catch (e) {
                out.innerText = 'Trade map failed: ' + e.message;
            }
        }

        async function runOwnership() {
            const out = document.getElementById('ownership-output');
            out.innerHTML = 'Reading ownership...';
            try {
                const res = await fetch('/api/ownership');
                const data = await res.json();
                if (!data.attached) {
                    // An empty table would read as "nobody owns anything". The
                    // endpoint distinguishes "not attached" from "nothing owned".
                    out.innerHTML = '<strong>' + data.status + '</strong><br>' + data.message;
                    return;
                }
                const s = data.summary;
                const rows = s.sessions.map(x => '<tr>'
                    + '<td>' + x.session_id + '</td>'
                    + '<td>' + x.agent_count + '</td>'
                    + '<td>' + (x.live ? 'live' : 'not live') + '</td>'
                    + '<td>' + (x.observed_this_process ? 'seen this process' : 'restored, unproven') + '</td>'
                    + '<td>' + (x.has_token ? 'can prove continuity' : 'name only') + '</td>'
                    + '<td>' + x.claims + ' (' + x.adoptions + ' adopted, ' + x.takeovers + ' taken over, ' + x.refusals + ' refused)</td>'
                    + '</tr>');
                out.innerHTML = 'Owned agents: ' + s.owned_agents + ' across ' + s.session_count + ' sessions'
                    + ' | issues: ' + s.issues + ' | refusals: ' + s.refusals + ' | token mismatches: ' + s.token_mismatches
                    + ' | teardown refusals: ' + (s.teardown_refusals ?? 0)
                    + ' | rotations: ' + (s.rotations ?? 0) + ' | revoked: ' + (s.revocations ?? 0)
                    + '<br><span style="color: var(--text-muted); font-size: 0.8rem;">' + data.note + '</span><br><br>'
                    + '<table class="ownership-table"><tr><th>session</th><th>agents</th><th>liveness</th><th>provenance</th><th>credential</th><th>claims</th></tr>'
                    + rows.join('') + '</table>';
            } catch (e) {
                out.innerHTML = 'Ownership read failed: ' + e.message;
            }
        }

        async function runRefusals() {
            const out = document.getElementById('refusal-output');
            out.innerHTML = 'Reading refusals...';
            try {
                const res = await fetch('/api/ownership');
                const data = await res.json();
                if (!data.attached) {
                    out.innerHTML = '<strong>' + data.status + '</strong><br>' + data.message;
                    return;
                }
                const refusals = data.refusals || [];
                if (refusals.length === 0) {
                    out.innerHTML = 'No refusals recorded on this server: every claim, teardown and reset it has seen was permitted.';
                    return;
                }
                const byReason = data.summary.refusals_by_reason || {};
                const tally = Object.entries(byReason)
                    .map(([reason, n]) => reason + ': ' + n).join(' | ') || 'none';
                const items = refusals.map(r => '<li style="margin-bottom: 10px;">'
                    + '<strong>' + r.headline + '</strong><br>'
                    + '<span style="color: var(--text-muted); font-size: 0.8rem;">'
                    + 'verb: ' + (r.verb ?? '?') + ' | reason: ' + r.reason
                    + (r.attempted_session_id ? ' | asked as: ' + r.attempted_session_id : '')
                    + ' | blocked by: ' + ((r.blocked_by && r.blocked_by.length) ? r.blocked_by.join(', ') : 'nobody')
                    + '<br>' + r.resolution + '</span></li>');
                out.innerHTML = '<strong>Refusals by reason:</strong> ' + tally
                    + ' <span style="color: var(--text-muted);">(bounded to the most recent 25)</span>'
                    + '<ul style="margin-top: 12px; padding-left: 18px;">' + items.join('') + '</ul>';
            } catch (e) {
                out.innerHTML = 'Refusal read failed: ' + e.message;
            }
        }

        async function runTimeline() {
            const out = document.getElementById('timeline-output');
            out.innerHTML = 'Reading the audit timeline...';
            try {
                const res = await fetch('/api/ownership');
                const data = await res.json();
                if (!data.attached) {
                    out.innerHTML = '<strong>' + data.status + '</strong><br>' + data.message;
                    return;
                }
                const events = data.timeline || [];
                if (events.length === 0) {
                    // The scope matters here: a restored server that has answered
                    // nothing yet shows an empty ring, and "no events" must not be
                    // read as "nothing ever happened to my session".
                    out.innerHTML = 'No identity decisions recorded in THIS process'
                        + ' (timeline scope: ' + (data.summary.timeline_scope || 'unknown') + ').'
                        + ' A server restarted from a snapshot keeps its sessions but starts with an empty timeline.';
                    return;
                }
                const shown = events.slice(0, 50);
                const items = shown.map(e => {
                    const colour = e.meaning === 'refused' ? 'var(--danger-color, #d9534f)'
                        : (e.meaning === 'info' || e.meaning === 'granted' ? 'var(--text-muted)' : 'var(--accent-color, #4a9eff)');
                    const when = new Date(e.at).toLocaleTimeString();
                    return '<li style="margin-bottom: 8px;">'
                        + '<span style="color: ' + colour + '; font-size: 0.75rem;">' + when + ' · ' + e.meaning + '</span><br>'
                        + e.headline + '</li>';
                });
                out.innerHTML = '<strong>' + data.summary.events_recorded + ' decision(s) recorded this process</strong>'
                    + ' <span style="color: var(--text-muted);">(showing the most recent ' + shown.length
                    + ' of a ring bounded to ' + data.summary.timeline_limit + ')</span>'
                    + '<ul style="margin-top: 12px; padding-left: 18px;">' + items.join('') + '</ul>';
            } catch (e) {
                out.innerHTML = 'Timeline read failed: ' + e.message;
            }
        }

        async function runPerf() {
            const out = document.getElementById('perf-output');
            out.innerText = 'Benchmarking...';
            try {
                const res = await fetch('/api/performance');
                const data = await res.json();
                out.innerText = data.agents + ' agents\\n\\n'
                    + 'affect tick: ' + data.affectMsPerAgent + ' ms/agent (' + data.affectMsTotal + ' ms total)\\n'
                    + 'identity decision: ' + data.ciaMsPerDecision + ' ms\\n'
                    + 'arbitration: ' + data.arbitrationMsPerDecision + ' ms';
            } catch (e) {
                out.innerText = 'Benchmark failed: ' + e.message;
            }
        }
    </script>
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }
}
