/**
 * tools/verification/verify_dashboard_endpoints.mjs
 * 
 * Verifies all 10 diagnostic and inspection surfaces in DesignerDashboardServer:
 * 1. GET / (Dashboard HTML with all 10 tabs)
 * 2. GET /api/status (Server health and feature list)
 * 3. GET /api/personas (FABE Functional Persona Signatures)
 * 4. GET /api/trade-map (Closed-world trade route beliefs)
 * 5. GET /api/performance (200-agent subsystem timing benchmark)
 * 6. POST /api/explain (Diagnostic threat attribution)
 * 7. POST /api/explain-faction (14-stage faction escalation)
 * 8. POST /api/sim/step (50-turn authoritative dungeon crawler replay)
 * 9. POST /api/memory (Episodic + Semantic + Rumor relevance recall)
 * 10. POST /api/relationships (Directed RelationshipTensor matrix)
 * 11. POST /api/causal (CausalEventGraph root-cause trace)
 * 12. GET /api/sim/inspect (live attached middleware session)
 * 13. GET /api/ownership (live session ownership: attached/unattached states,
 *     refusal drill-down with blocker, cause and retry countdown,
 *     refusal visibility, read-only, and no token material in the view;
 *     identity AUDIT TIMELINE: grants and refusals on one ordered, bounded,
 *     token-free stream scoped to this process)
 * 
 * Hard Rule 9 Compliant: 0 test runner frameworks.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesignerDashboardServer } from '../../packages/runtime/src/DesignerDashboardServer.js';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { ClaimArbitration, EVENT_LOG_LIMIT } from '../../packages/runtime/src/ClaimArbitration.js';

async function main() {
    console.log('=== DESIGNER DASHBOARD SERVER & ATTACHED INSPECTION VERIFICATION ===\n');

    // Tab Classification Registry
    const TAB_CLASSIFICATION = {
        'explain-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'personas-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'factions-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'lod-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'replay-tab': 'LIVE REFERENCE SIMULATION',
        'memory-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'relations-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'causal-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'trade-tab': 'LIVE REFERENCE SIMULATION',
        'perf-tab': 'DETERMINISTIC DIAGNOSTIC VIGNETTE',
        'ownership-tab': 'LIVE ATTACHED SERVER SESSION STATE',
        'sim-inspect': 'LIVE ATTACHED MIDDLEWARE SESSION'
    };

    console.log('Dashboard Surface Taxonomy:');
    for (const [tab, classification] of Object.entries(TAB_CLASSIFICATION)) {
        console.log(`  - [${tab}]: ${classification}`);
    }
    console.log('');

    const server = new DesignerDashboardServer({ port: 0 }); // ephemeral port
    const { host, port, url } = await server.start();
    console.log(`Server started successfully on ${url}`);

    function get(pathStr) {
        return new Promise((resolve, reject) => {
            http.get(`${url}${pathStr}`, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
            }).on('error', reject);
        });
    }

    function post(pathStr, payload, method = 'POST') {
        return new Promise((resolve, reject) => {
            const bodyStr = JSON.stringify(payload);
            const req = http.request(`${url}${pathStr}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(bodyStr)
                }
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
            });
            req.on('error', reject);
            req.write(bodyStr);
            req.end();
        });
    }

    try {
        // 1. GET /
        console.log('Testing GET / (Dashboard HTML & Tabs)...');
        const rIndex = await get('/');
        if (rIndex.status !== 200 || !rIndex.body.includes('Fear AI Designer Diagnostic Dashboard')) {
            throw new Error(`GET / failed with status ${rIndex.status}`);
        }
        const tabs = [
            'explain-tab', 'personas-tab', 'factions-tab', 'lod-tab', 'replay-tab',
            'memory-tab', 'relations-tab', 'causal-tab', 'trade-tab', 'perf-tab',
            'ownership-tab'
        ];
        for (const t of tabs) {
            if (!rIndex.body.includes(t)) throw new Error(`Missing tab ${t} in HTML!`);
        }
        console.log('  * HTML served with all 11 tabs present: PASS');

        // 2. GET /api/status
        console.log('Testing GET /api/status...');
        const rStatus = await get('/api/status');
        const statusJson = JSON.parse(rStatus.body);
        if (rStatus.status !== 200 || statusJson.status !== 'online') throw new Error('Status failed');
        if (!Array.isArray(statusJson.features) || statusJson.features.length < 5) throw new Error('Feature list incomplete');
        if (!statusJson.features.includes('SESSION_OWNERSHIP')) throw new Error('Feature list does not advertise SESSION_OWNERSHIP');
        console.log(`  * Status: ${statusJson.status}, Features: ${statusJson.features.length} listed: PASS`);

        // 3. GET /api/personas
        console.log('Testing GET /api/personas...');
        const rPersonas = await get('/api/personas');
        const personasJson = JSON.parse(rPersonas.body);
        if (!personasJson.personas || !personasJson.personas['Paranoid Sentinel']) throw new Error('Personas failed');
        const sentinel = personasJson.personas['Paranoid Sentinel'];
        if (sentinel.fear_growth_multiplier <= sentinel.contagion_susceptibility) {
            throw new Error('Paranoid Sentinel trait sanity check failed');
        }
        console.log(`  * Personas validated (${Object.keys(personasJson.personas).join(', ')}): PASS`);

        // 4. GET /api/trade-map
        console.log('Testing GET /api/trade-map...');
        const rTrade = await get('/api/trade-map');
        const tradeJson = JSON.parse(rTrade.body);
        if (!tradeJson.selectedRoute || !tradeJson.roads || !tradeJson.roads['road-a']) {
            throw new Error('Trade map failed: ' + rTrade.body);
        }
        console.log(`  * Trade map snapshot (selected: ${tradeJson.selectedRoute}, road-a danger: ${tradeJson.roads['road-a'].perceivedDanger}): PASS`);

        // 5. GET /api/performance
        console.log('Testing GET /api/performance...');
        const rPerf = await get('/api/performance');
        const perfJson = JSON.parse(rPerf.body);
        if (typeof perfJson.affectMsTotal !== 'number' || perfJson.affectMsTotal <= 0) throw new Error('Performance failed');
        console.log(`  * Performance benchmark: 200 agents in ${perfJson.affectMsTotal.toFixed(2)}ms (${perfJson.affectMsPerAgent.toFixed(4)}ms/agent): PASS`);

        // 6. POST /api/explain (Semantic High vs Low Threat Assertions)
        console.log('Testing POST /api/explain with High vs Low Threat semantics...');
        // High threat
        const rHigh = await post('/api/explain', { neuroticism: 0.85, resilience: 0.2, distance: 3.0, intensity: 0.95, panicPeers: 3 });
        const highJson = JSON.parse(rHigh.body);
        if (!['PANIC', 'ANXIOUS', 'FREEZE', 'FLEE'].includes(highJson.fear_band) && !highJson.active_intent?.type?.includes('FLEE')) {
            throw new Error(`High threat failed to produce PANIC/FLEE: ${JSON.stringify(highJson)}`);
        }
        if (highJson.current_fear <= 0.3) throw new Error(`High threat current_fear too low: ${highJson.current_fear}`);

        // Low threat
        const rLow = await post('/api/explain', { neuroticism: 0.1, resilience: 0.9, distance: 80.0, intensity: 0.05, panicPeers: 0, traumaDread: 0.0, ticks: 1 });
        const lowJson = JSON.parse(rLow.body);
        if (lowJson.fear_band !== 'CALM') {
            throw new Error(`Low threat failed to maintain CALM: ${JSON.stringify(lowJson)}`);
        }
        if (lowJson.current_fear >= 0.20) throw new Error(`Low threat current_fear too high: ${lowJson.current_fear}`);
        console.log(`  * Threat explain semantic discrimination (High: ${highJson.fear_band} [fear ${highJson.current_fear}], Low: ${lowJson.fear_band} [fear ${lowJson.current_fear}]): PASS`);

        // 7. POST /api/explain-faction
        console.log('Testing POST /api/explain-faction...');
        const rFaction = await post('/api/explain-faction', { incidents: 3 });
        const factionJson = JSON.parse(rFaction.body);
        const validEscalationStances = ['MOBILIZE', 'WAR', 'TOTAL_WAR', 'SUSPICIOUS', 'TENSION', 'HOSTILE'];
        if (!factionJson.current_stance || !validEscalationStances.includes(factionJson.current_stance)) {
            throw new Error(`Faction stance invalid: ${factionJson.current_stance}`);
        }
        if (typeof factionJson.bilateral_metrics?.grievance !== 'number' || factionJson.bilateral_metrics.grievance <= 0) {
            throw new Error('Grievance metric missing or non-positive');
        }
        console.log(`  * Faction escalation: ${factionJson.current_stance} (grievance: ${factionJson.bilateral_metrics.grievance.toFixed(2)}): PASS`);

        // 8. POST /api/sim/step
        console.log('Testing POST /api/sim/step...');
        const rSim = await post('/api/sim/step', { turns: 10 });
        const simJson = JSON.parse(rSim.body);
        if (typeof simJson.turnsExecuted !== 'number' || simJson.turnsExecuted <= 0) throw new Error(`Sim step invalid: ${simJson.turnsExecuted}`);
        if (!Array.isArray(simJson.combatLog) || simJson.combatLog.length === 0) throw new Error('No combat log generated during replay step');
        console.log(`  * Sim replay turns executed: ${simJson.turnsExecuted} (combat logs: ${simJson.combatLog.length}, status: ${simJson.status}): PASS`);

        // 9. POST /api/memory (Semantic Non-Trivial Ranking Assertions)
        console.log('Testing POST /api/memory...');
        const rMem = await post('/api/memory', {});
        const memJson = JSON.parse(rMem.body);
        if (!Array.isArray(memJson.ranked) || memJson.ranked.length === 0) throw new Error('Memory explorer returned empty ranking');
        for (let i = 0; i < memJson.ranked.length - 1; i++) {
            const cur = memJson.ranked[i].score;
            const next = memJson.ranked[i + 1].score;
            if (cur < next) throw new Error(`Memory ranking out of order: ${cur} < ${next} at index ${i}`);
        }
        console.log(`  * Memory explorer: ${memJson.ranked.length} memories returned, monotonic relevance verified: PASS`);

        // 10. POST /api/relationships (Directed Asymmetry Assertions)
        console.log('Testing POST /api/relationships...');
        const rRel = await post('/api/relationships', {});
        const relJson = JSON.parse(rRel.body);
        if (!relJson.guardToCaptain || !relJson.captainToGuard) throw new Error('Directed relationship edges missing');
        if (relJson.asymmetric !== true) throw new Error('Relationship tensor should be strictly asymmetric');
        if (relJson.guardToCaptain.trust === relJson.captainToGuard.trust) {
            throw new Error('Asymmetric test failed: trust values are identical');
        }
        console.log(`  * Relationship tensor directed asymmetry verified (Guard->Captain trust: ${relJson.guardToCaptain.trust.toFixed(2)}, Captain->Guard trust: ${relJson.captainToGuard.trust.toFixed(2)}): PASS`);

        // 11. POST /api/causal (Root-Cause Trace Assertions)
        console.log('Testing POST /api/causal...');
        const rCausal = await post('/api/causal', {});
        const causalJson = JSON.parse(rCausal.body);
        if (!Array.isArray(causalJson.rootIds) || causalJson.rootIds.length === 0) throw new Error('Causal trace failed to find roots');
        console.log(`  * Causal root-cause trace verified: ${causalJson.rootIds.length} roots identified (root: ${causalJson.rootIds[0]}): PASS`);

        // 12. GET /api/sim/inspect (Live Attached Middleware Session Verification)
        console.log('\nTesting GET /api/sim/inspect (Unattached vs Attached Simulation)...');
        // Unattached inspect
        const rInspectUnattached = await get('/api/sim/inspect');
        const unattachedJson = JSON.parse(rInspectUnattached.body);
        if (unattachedJson.attached !== false || unattachedJson.status !== 'NO_SIMULATION_ATTACHED') {
            throw new Error('Unattached inspect failed: ' + rInspectUnattached.body);
        }
        console.log('  * Unattached status verified: NO_SIMULATION_ATTACHED (PASS)');

        // Attach live simulation
        const liveSim = new RuntimeSimulation({ seed: 10101 });
        liveSim.registerAgent('alpha-scout', { neuroticism: 0.3, leadership: 0.8 });
        liveSim.registerAgent('bravo-medic', { neuroticism: 0.6, agreeableness: 0.9 });
        liveSim.registerAgent('charlie-soldier', { neuroticism: 0.4, resilience: 0.7 });
        liveSim.queueObservation('alpha-scout', {
            agent_id: 'alpha-scout',
            threat_level: 0.45,
            x: 10, y: 10, z: 0
        });
        liveSim.tick(0.0166);

        server.attachSimulation(liveSim);

        // Attached inspect
        const rInspectAttached = await get('/api/sim/inspect');
        const attachedJson = JSON.parse(rInspectAttached.body);
        if (attachedJson.attached !== true || attachedJson.status !== 'ATTACHED_READ_ONLY') {
            throw new Error('Attached inspect failed: ' + rInspectAttached.body);
        }
        if (attachedJson.agentCount !== 3 || attachedJson.tickCount !== 1) {
            throw new Error(`Attached metrics mismatch: agentCount=${attachedJson.agentCount}, tickCount=${attachedJson.tickCount}`);
        }
        if (!Array.isArray(attachedJson.agents) || attachedJson.agents.length !== 3) {
            throw new Error('Attached agents list incomplete');
        }
        const scout = attachedJson.agents.find(a => a.id === 'alpha-scout');
        if (!scout || typeof scout.currentFear !== 'number' || !scout.fearBand) {
            throw new Error('Attached agent affective state missing or invalid');
        }
        console.log(`  * Attached status verified: ATTACHED_READ_ONLY (agents: ${attachedJson.agentCount}, tickCount: ${attachedJson.tickCount}, scout: ${scout.id} [${scout.fearBand}]): PASS`);

        // 13. GET /api/ownership (live session ownership, read-only, token-free)
        console.log('\nTesting GET /api/ownership (Unattached / Attached / Refusal visibility)...');
        const rOwnUnattached = await get('/api/ownership');
        const ownUnattached = JSON.parse(rOwnUnattached.body);
        if (ownUnattached.attached !== false || ownUnattached.status !== 'NO_OWNERSHIP_SOURCE_ATTACHED') {
            throw new Error('Unattached ownership failed: ' + rOwnUnattached.body);
        }
        if (ownUnattached.simAttached !== true) {
            throw new Error('Unattached ownership did not report the separately-attached simulation');
        }
        console.log('  * Unattached ownership verified: NO_OWNERSHIP_SOURCE_ATTACHED, distinguished from "nothing owned" (PASS)');

        const rOwnPost = await post('/api/ownership', {});
        if (rOwnPost.status !== 404) {
            throw new Error(`Ownership must not be writable over POST; got status ${rOwnPost.status}`);
        }
        console.log('  * Ownership is read-only over HTTP: POST /api/ownership is 404, not an arbitration path (PASS)');

        // A live owner and a rival: the refusal is the behaviour a designer
        // needs to be able to SEE, so it is asserted here and must appear in
        // the rendered view rather than existing only inside the server.
        const claims = new ClaimArbitration({ tokenFactory: () => 'a'.repeat(64) });
        const granted = claims.claim('alpha-scout', { sessionId: 'host_a' });
        if (!granted.granted || !granted.sessionToken) throw new Error('Ownership fixture failed to establish a tokenized session');
        const rival = claims.claim('alpha-scout', { sessionId: 'host_b' });
        if (rival.granted) throw new Error('A live owner must not be displaced by a name-only rival');
        // A PROVEN re-claim, so the timeline has both kinds of successful
        // identity decision in it: a fresh name that was handed a credential, and
        // a returning host that produced the one it already had. Without this the
        // timeline assertions below would only ever exercise the first kind.
        const reproof = claims.claim('alpha-scout', { sessionId: 'host_a', token: granted.sessionToken });
        if (!reproof.granted || reproof.sessionToken) throw new Error('A proven re-claim must be granted without minting a new credential');
        server.attachOwnership(claims);

        const rOwnAttached = await get('/api/ownership');
        const ownAttached = JSON.parse(rOwnAttached.body);
        if (ownAttached.attached !== true || ownAttached.status !== 'ATTACHED_READ_ONLY') {
            throw new Error('Attached ownership failed: ' + rOwnAttached.body);
        }
        if (ownAttached.scope !== 'SERVER_SESSION_STATE' || ownAttached.readOnly !== true) {
            throw new Error('Ownership view did not label itself as read-only server session state');
        }
        const hostA = ownAttached.summary.sessions.find((s) => s.session_id === 'host_a');
        if (!hostA || hostA.agent_count !== 1 || hostA.live !== true || hostA.has_token !== true) {
            throw new Error(`Ownership summary missing the live tokenized owner: ${JSON.stringify(hostA)}`);
        }
        if (ownAttached.summary.refusals < 1) {
            throw new Error('The refused rival claim is not visible in the ownership summary');
        }
        const hostBRows = ownAttached.summary.sessions.filter((s) => s.session_id === 'host_b');
        if (hostBRows.length !== 1 || hostBRows[0].agent_count !== 0) {
            throw new Error('A refused claimant must be visible with zero agents, not hidden');
        }
        console.log(`  * Attached ownership verified: host_a owns ${hostA.agent_count} agent(s) [live, tokenized], refusals visible: ${ownAttached.summary.refusals} (PASS)`);

        // No credential may reach a browser: neither the raw token nor any
        // token-keyed field may appear anywhere in the serialized response.
        if (rOwnAttached.body.includes(granted.sessionToken)) {
            throw new Error('CREDENTIAL LEAK: the rendered ownership view contains the raw session token');
        }
        // Precise, not blunt: `has_token` is a boolean the view NEEDS, so a bare
        // "no token-ish key" check would fail a correct response. The real
        // contract is that no token-keyed field may hold a STRING.
        const credentialFields = [];
        const walkTokenFields = (node, trail) => {
            if (Array.isArray(node)) return node.forEach((v, i) => walkTokenFields(v, `${trail}[${i}]`));
            if (node && typeof node === 'object') {
                for (const [k, v] of Object.entries(node)) {
                    if (/token/i.test(k) && typeof v === 'string') credentialFields.push(`${trail}.${k}`);
                    walkTokenFields(v, `${trail}.${k}`);
                }
            }
        };
        walkTokenFields(ownAttached, 'summary');
        if (credentialFields.length > 0) {
            throw new Error(`CREDENTIAL LEAK: token-keyed string field(s) rendered: ${credentialFields.join(', ')}`);
        }
        console.log('  * Ownership view is token-free: no token-keyed field holds credential material (PASS)');

        // The leak guard is drift-tested rather than assumed: a source whose
        // summary DOES carry token material must come back stripped, while
        // ordinary view fields survive. Otherwise a future rename on the
        // arbitration side would silently turn the dashboard into a credential
        // display and this probe would not notice.
        const leaky = {
            owned_agents: 2,
            tokenized_sessions: 1,
            sessions: [{
                session_id: 'leaky',
                token_hash: 'deadbeefcafe',
                session_token: 'raw-secret',
                has_token: true,
                token_mismatches: 0,
                nested: { api_token: 'nested-secret', agent_count: 2 }
            }]
        };
        const strippedBody = JSON.stringify(DesignerDashboardServer._stripTokenMaterial(leaky));
        for (const secret of ['deadbeefcafe', 'raw-secret', 'nested-secret']) {
            if (strippedBody.includes(secret)) throw new Error(`Ownership sanitizer failed to strip ${secret}`);
        }
        // Over-stripping is a defect too: it would erase the capability flag
        // the view exists to show and read as "no credential".
        for (const kept of ['"has_token":true', '"token_mismatches":0', '"tokenized_sessions":1', '"agent_count":2', '"owned_agents":2', 'leaky']) {
            if (!strippedBody.includes(kept)) throw new Error(`Ownership sanitizer removed non-credential view field ${kept}: ${strippedBody}`);
        }
        console.log('  * Credential sanitizer is drift-tested both ways: credentials stripped, capability flags & counters preserved (PASS)');

        // The refusal DRILL-DOWN: a count is an alert, an explanation is a
        // diagnosis. A refusal record has to name the verb, the agent, who asked,
        // who blocked it, and how long the block lasts, and it has to do that for
        // teardown refusals as well as claim refusals - otherwise the most
        // damaging refusal in the system (a crowd that cannot be retired) is the
        // one with no explanation on screen.
        console.log('\nTesting the refusal drill-down (GET /api/ownership -> refusals[])...');
        const teardownRefusal = claims.authorizeTeardown('alpha-scout', { sessionId: 'host_b' });
        if (teardownRefusal.allowed) throw new Error('Fixture failed: a name-only rival must not be authorized to tear down');
        const rDrill = await get('/api/ownership');
        const drill = JSON.parse(rDrill.body);
        if (!Array.isArray(drill.refusals) || drill.refusals.length < 2) {
            throw new Error(`Refusal drill-down missing: ${rDrill.body}`);
        }
        const claimRefusal = drill.refusals.find((r) => r.verb === 'claim_agent');
        if (!claimRefusal) throw new Error('A refused claim is not explained in the drill-down');
        if (claimRefusal.agent_id !== 'alpha-scout') throw new Error('The refused claim does not name the contested agent');
        if (claimRefusal.attempted_session_id !== 'host_b') throw new Error('The refused claim does not name who asked');
        if (!Array.isArray(claimRefusal.blocked_by) || claimRefusal.blocked_by[0] !== 'host_a') {
            throw new Error('The refused claim does not name the session that blocked it');
        }
        if (!Number.isFinite(claimRefusal.retry_in_ms) || claimRefusal.retry_in_ms < 0 || claimRefusal.retry_in_ms > 30000) {
            throw new Error(`The refusal renders an unusable retry countdown: ${JSON.stringify(claimRefusal)}`);
        }
        if (claimRefusal.blocking_socket_held !== false) {
            throw new Error('A refusal blocked by a connectionless session must not claim a socket is held');
        }
        if (!/lifts in/.test(claimRefusal.resolution)) {
            throw new Error('The refusal resolution does not say when the block lifts');
        }
        if (typeof claimRefusal.headline !== 'string' || !claimRefusal.headline.includes('alpha-scout')) {
            throw new Error('The refusal headline does not name the agent a designer is looking for');
        }
        const teardownRow = drill.refusals.find((r) => r.verb === 'unregister');
        if (!teardownRow || !teardownRow.headline.includes('remove agent alpha-scout')) {
            throw new Error('A refused teardown is not explained in the drill-down');
        }
        if (drill.summary.refusals_by_reason.REFUSED_OWNED_BY_LIVE_SESSION_REQUIRES_TAKEOVER < 1
            || drill.summary.refusals_by_reason.REFUSED_NOT_OWNER < 1) {
            throw new Error('Refusals are not tallied by reason');
        }
        // A null countdown is a DIFFERENT answer from "retry now", so the two
        // must not be collapsed into one another.
        const socketBlocker = { verb: 'claim_agent', agent_id: 'x', attempted_session_id: 'y', reason: 'R', blocked_by: 'z', retry_after_ms: null };
        const explainedSocket = DesignerDashboardServer._explainRefusals([socketBlocker])[0];
        if (explainedSocket.retry_in_ms !== null || explainedSocket.retry_at_ms !== null
            || explainedSocket.blocking_socket_held !== true
            || !/open connection/.test(explainedSocket.resolution)) {
            throw new Error('A blocker holding an open socket must be reported as having no deadline');
        }
        const staleBlocker = { verb: 'claim_agent', agent_id: 'x', attempted_session_id: 'y', reason: 'R', blocked_by: 'z', retry_after_ms: 0 };
        const explainedStale = DesignerDashboardServer._explainRefusals([staleBlocker])[0];
        if (!/will succeed now/.test(explainedStale.resolution)) {
            throw new Error('A zero countdown must read as "this claim will succeed now", not as a deadline');
        }
        console.log(`  * Refusal drill-down verified: ${drill.refusals.length} refusal(s) explained with verb, blocker and countdown (PASS)`);

        // The AUDIT TIMELINE: the same surface, one ordered stream that includes
        // the decisions that were GRANTED. A refusal log answers "why was my NPC
        // not registered"; it cannot answer "what happened to my session",
        // because the answer usually starts with a grant the host did not expect.
        console.log('\nTesting the identity audit timeline (GET /api/ownership -> timeline[])...');
        const rTimeline = await get('/api/ownership');
        const tl = JSON.parse(rTimeline.body);
        if (!Array.isArray(tl.timeline) || tl.timeline.length < 3) {
            throw new Error(`Audit timeline missing or too short: ${JSON.stringify(tl.timeline)}`);
        }
        for (let i = 1; i < tl.timeline.length; i++) {
            if (tl.timeline[i - 1].at < tl.timeline[i].at) {
                throw new Error('The audit timeline is not newest-first');
            }
        }
        // The row nobody would have found from a counter: the FIRST grant, which
        // is where a crowd's ownership actually starts.
        // `.pop()`, not `.find()`: the timeline is NEWEST first, so `find` returns
        // the most recent matching row. The row under test is the oldest one - the
        // grant that started the session - and asserting the wrong end of an
        // ordered ring is exactly the mistake this probe exists to catch elsewhere.
        const firstGrant = tl.timeline
            .filter((e) => e.kind === 'identity' && e.decision === 'granted' && e.session_id === 'host_a')
            .pop();
        if (!firstGrant) throw new Error('The timeline does not record the granted identity that started host_a');
        if (firstGrant.outcome !== 'GRANTED' || firstGrant.proof !== 'new_credential_issued') {
            throw new Error(`The granted identity row does not say how it was proven: ${JSON.stringify(firstGrant)}`);
        }
        // And the OTHER proof must be distinguishable: a returning host that
        // presents a credential it already holds is a different row from one that
        // just named itself and was handed a fresh one.
        const returningGrant = tl.timeline.find((e) => e.kind === 'identity' && e.decision === 'granted' && e.proof === 'presented_valid_token');
        if (!returningGrant) {
            throw new Error('The timeline does not distinguish a credential-proven grant from a fresh name claim');
        }
        // Matched on `kind` as well as timestamp: a claim and its identity
        // decision land in the same millisecond, so a row found by time alone
        // could be the per-agent claim instead of the identity decision.
        const returningRaw = tl.summary.timeline.find((e) => e.kind === 'identity'
            && e.decision === 'granted' && e.at === returningGrant.at && e.session_id === returningGrant.session_id);
        if (!returningRaw || returningRaw.token_issued !== false) {
            throw new Error(`A credential-proven grant must not report a newly issued token: ${JSON.stringify(returningRaw)}`);
        }
        if (!/proven with its credential/.test(returningGrant.headline)) {
            throw new Error(`A credential-proven grant is not described as proven: ${returningGrant.headline}`);
        }
        if (typeof firstGrant.headline !== 'string' || !firstGrant.headline.includes('host_a')) {
            throw new Error('The granted identity row has no readable headline naming the session');
        }
        // The GRANTED per-agent claim, at agent granularity: which NPC, not how many.
        const claimGrant = tl.timeline.find((e) => e.kind === 'claim' && e.decision === 'granted' && e.agent_id === 'alpha-scout');
        if (!claimGrant || claimGrant.session_id !== 'host_a') {
            throw new Error('The timeline does not record which session took which agent');
        }
        // Both refusals are on the SAME stream as the grants, with the SAME
        // rendering as the drill-down. Two descriptions of one refusal, drifting
        // apart, is the failure this asserts against.
        const tlRefused = tl.timeline.filter((e) => e.decision === 'refused');
        if (tlRefused.length < 2) throw new Error('The timeline does not carry the refusals alongside the grants');
        const tlClaimRefusal = tlRefused.find((e) => e.verb === 'claim_agent');
        const drillClaimRefusal = drill.refusals.find((r) => r.verb === 'claim_agent');
        if (!tlClaimRefusal || tlClaimRefusal.headline !== drillClaimRefusal.headline) {
            throw new Error('A refused claim is described differently in the timeline than in the drill-down');
        }
        const MEANINGS = new Set(['info', 'granted', 'recovered', 'handover', 'refused']);
        for (const e of tl.timeline) {
            if (typeof e.headline !== 'string' || e.headline.length === 0) {
                throw new Error(`A timeline row has no headline: ${JSON.stringify(e)}`);
            }
            if (!MEANINGS.has(e.meaning)) {
                throw new Error(`A timeline row has an unrenderable meaning '${e.meaning}': ${JSON.stringify(e)}`);
            }
        }
        // Token-free, on the timeline's own rows rather than only on the summary.
        const timelineCredentialFields = [];
        const walkTimeline = (node, trail) => {
            if (Array.isArray(node)) return node.forEach((v, i) => walkTimeline(v, `${trail}[${i}]`));
            if (node && typeof node === 'object') {
                for (const [k, v] of Object.entries(node)) {
                    if (/token/i.test(k) && typeof v === 'string') timelineCredentialFields.push(`${trail}.${k}`);
                    walkTimeline(v, `${trail}.${k}`);
                }
            }
        };
        walkTimeline(tl.timeline, 'timeline');
        if (timelineCredentialFields.length > 0) {
            throw new Error(`CREDENTIAL LEAK: timeline carries token-keyed string field(s): ${timelineCredentialFields.join(', ')}`);
        }
        console.log(`  * Audit timeline verified: ${tl.timeline.length} ordered decision(s), grants and refusals on one stream (PASS)`);

        // BOUNDED, and honestly scoped. The ring is written by anything that can
        // reach the claim path, so an unbounded log here would be a memory leak a
        // hostile client could drive; and because it is a per-process ring, a
        // restarted server must SAY so rather than let an empty list read as
        // "nothing ever happened to my session".
        if (tl.summary.timeline_scope !== 'THIS_PROCESS') {
            throw new Error(`The timeline does not state its scope: ${tl.summary.timeline_scope}`);
        }
        const bounded = new ClaimArbitration({ tokenFactory: () => 'b'.repeat(64) });
        const boundGranted = bounded.claim('npc_bound', { sessionId: 'bound_owner' });
        if (!boundGranted.granted) throw new Error('Fixture failed to establish the bounded-timeline owner');
        // The rival is established FIRST, so every call in the loop below is the
        // same shape: an existing live session whose caller cannot produce its
        // credential, refused at the identity step. Without this the first
        // iteration would be granted instead (the name did not exist yet), and the
        // assertion would be counting a different decision than the other 199.
        const rivalSetup = bounded.claim('rival_own_agent', { sessionId: 'bound_rival' });
        if (!rivalSetup.granted) throw new Error('Fixture failed to establish the bounded-timeline rival');
        const overflow = EVENT_LOG_LIMIT * 2;
        const eventsBefore = bounded.eventsRecorded;
        for (let i = 0; i < overflow; i++) {
            bounded.claim(`npc_bound_${i}`, { sessionId: 'bound_rival' });
        }
        const eventsFromLoop = bounded.eventsRecorded - eventsBefore;
        const boundedSummary = bounded.summary();
        if (boundedSummary.timeline.length !== EVENT_LOG_LIMIT) {
            throw new Error(`Timeline ring is not bounded to ${EVENT_LOG_LIMIT}: ${boundedSummary.timeline.length}`);
        }
        if (eventsFromLoop !== overflow) {
            throw new Error(`Each refused rival claim must record exactly one decision: ${overflow} calls produced ${eventsFromLoop}`);
        }
        // The establishing decisions happened FIRST, so a ring that trims the
        // correct end has evicted them and kept the newest refusal - and the
        // counter keeps rising past the ring, which is what makes "the last 100"
        // honest rather than "all there were".
        const madeEvents = boundedSummary.events_recorded;
        if (madeEvents <= EVENT_LOG_LIMIT) {
            throw new Error(`events_recorded must keep counting past the ring: ${madeEvents}`);
        }
        if (boundedSummary.timeline[0].verb !== 'claim_identity' || boundedSummary.timeline[0].attempted_session_id !== 'bound_rival') {
            throw new Error(`The bounded timeline trimmed the wrong end: ${JSON.stringify(boundedSummary.timeline[0])}`);
        }
        if (boundedSummary.timeline.some((e) => e.kind === 'identity') || boundedSummary.timeline.some((e) => e.agent_id === 'npc_bound')) {
            throw new Error('The bounded timeline kept the oldest rows instead of evicting them');
        }
        console.log(`  * Timeline ring verified: bounded to ${EVENT_LOG_LIMIT} rows, oldest evicted, newest kept, ${madeEvents} decisions counted, scope ${boundedSummary.timeline_scope} (PASS)`);

        console.log('\n============================================================');
        console.log('ALL 13 DASHBOARD ENDPOINTS, 11 TABS, ATTACHED INSPECTION, LIVE OWNERSHIP,');
        console.log('REFUSAL DRILL-DOWN & IDENTITY AUDIT TIMELINE PASSED CLEANLY');
        console.log('============================================================\n');

    } finally {
        await server.stop();
        console.log('Server stopped cleanly.');
    }
}

main().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
