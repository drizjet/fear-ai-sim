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

async function main() {
    console.log('=== DESIGNER DASHBOARD SERVER VERIFICATION ===\n');

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
        console.log('Testing GET / (Dashboard HTML)...');
        const rIndex = await get('/');
        if (rIndex.status !== 200 || !rIndex.body.includes('Fear AI Designer Diagnostic Dashboard')) {
            throw new Error(`GET / failed with status ${rIndex.status}`);
        }
        // Verify all 10 tab buttons exist in HTML
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
        console.log(`  * Status: ${statusJson.status}, Features count: ${statusJson.features.length}: PASS`);

        // 3. GET /api/personas
        console.log('Testing GET /api/personas...');
        const rPersonas = await get('/api/personas');
        const personasJson = JSON.parse(rPersonas.body);
        if (!personasJson.personas || !personasJson.personas['Paranoid Sentinel']) throw new Error('Personas failed');
        console.log(`  * Personas loaded (${Object.keys(personasJson.personas).join(', ')}): PASS`);

        // 4. GET /api/trade-map
        console.log('Testing GET /api/trade-map...');
        const rTrade = await get('/api/trade-map');
        const tradeJson = JSON.parse(rTrade.body);
        if (!tradeJson.selectedRoute || !tradeJson.roads) throw new Error('Trade map failed');
        console.log(`  * Trade map snapshot (selectedRoute: ${tradeJson.selectedRoute}, roads: ${Object.keys(tradeJson.roads).join(', ')}): PASS`);

        // 5. GET /api/performance
        console.log('Testing GET /api/performance...');
        const rPerf = await get('/api/performance');
        const perfJson = JSON.parse(rPerf.body);
        if (typeof perfJson.affectMsTotal !== 'number') throw new Error('Performance failed');
        console.log(`  * Performance (200 agents, affectMsTotal: ${perfJson.affectMsTotal.toFixed(2)}ms, perAgent: ${perfJson.affectMsPerAgent.toFixed(4)}ms): PASS`);

        // 6. POST /api/explain
        console.log('Testing POST /api/explain...');
        const rExplain = await post('/api/explain', { neuroticism: 0.8, resilience: 0.2, distance: 4.0, intensity: 0.9, panicPeers: 2 });
        const explainJson = JSON.parse(rExplain.body);
        if (!explainJson.active_intent) throw new Error('Explain failed');
        console.log(`  * Explain intent: ${explainJson.active_intent.type} (${explainJson.fear_band}): PASS`);

        // 7. POST /api/explain-faction
        console.log('Testing POST /api/explain-faction...');
        const rFaction = await post('/api/explain-faction', { incidentType: 'RAID_CONFIRMED', severity: 0.85 });
        const factionJson = JSON.parse(rFaction.body);
        if (!factionJson.current_stance) throw new Error('Faction explain failed');
        console.log(`  * Faction escalation: ${factionJson.current_stance} (grievance: ${factionJson.bilateral_metrics.grievance.toFixed(2)}): PASS`);

        // 8. POST /api/sim/step
        console.log('Testing POST /api/sim/step...');
        const rSim = await post('/api/sim/step', { turns: 10 });
        const simJson = JSON.parse(rSim.body);
        if (typeof simJson.turnsExecuted !== 'number') throw new Error('Sim step failed');
        console.log(`  * Sim replay turns executed: ${simJson.turnsExecuted} (status: ${simJson.status}): PASS`);

        // 9. POST /api/memory
        console.log('Testing POST /api/memory...');
        const rMem = await post('/api/memory', {});
        const memJson = JSON.parse(rMem.body);
        if (!memJson.ranked || memJson.ranked.length === 0) throw new Error('Memory explorer failed');
        console.log(`  * Memory explorer ranked recall count: ${memJson.ranked.length}: PASS`);

        // 10. POST /api/relationships
        console.log('Testing POST /api/relationships...');
        const rRel = await post('/api/relationships', {});
        const relJson = JSON.parse(rRel.body);
        if (!relJson.guardToCaptain || typeof relJson.asymmetric !== 'boolean') throw new Error('Relationships failed');
        console.log(`  * Relationship graph asymmetric trust: ${relJson.asymmetric} (guard->captain trust: ${relJson.guardToCaptain.trust.toFixed(2)}): PASS`);

        // 11. POST /api/causal
        console.log('Testing POST /api/causal...');
        const rCausal = await post('/api/causal', {});
        const causalJson = JSON.parse(rCausal.body);
        if (!causalJson.rootIds || causalJson.rootIds.length === 0) throw new Error('Causal trace failed');
        console.log(`  * Causal root-cause chain length: ${causalJson.rootIds.length} (root: ${causalJson.rootIds[0]}): PASS`);

        console.log('\n============================================================');
        console.log('ALL 11 DASHBOARD ENDPOINTS AND 10 TABS VERIFIED 100% OPERATIONAL');
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
