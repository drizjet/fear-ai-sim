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
 * 
 * Hard Rule 9 Compliant: 0 test runner frameworks.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesignerDashboardServer } from '../../packages/runtime/src/DesignerDashboardServer.js';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';

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

    function post(pathStr, payload) {
        return new Promise((resolve, reject) => {
            const bodyStr = JSON.stringify(payload);
            const req = http.request(`${url}${pathStr}`, {
                method: 'POST',
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
            'memory-tab', 'relations-tab', 'causal-tab', 'trade-tab', 'perf-tab'
        ];
        for (const t of tabs) {
            if (!rIndex.body.includes(t)) throw new Error(`Missing tab ${t} in HTML!`);
        }
        console.log('  * HTML served with all 10 tabs present: PASS');

        // 2. GET /api/status
        console.log('Testing GET /api/status...');
        const rStatus = await get('/api/status');
        const statusJson = JSON.parse(rStatus.body);
        if (rStatus.status !== 200 || statusJson.status !== 'online') throw new Error('Status failed');
        if (!Array.isArray(statusJson.features) || statusJson.features.length < 5) throw new Error('Feature list incomplete');
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

        console.log('\n============================================================');
        console.log('ALL 12 DASHBOARD ENDPOINTS, 10 TABS & ATTACHED INSPECTION PASSED CLEANLY');
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
