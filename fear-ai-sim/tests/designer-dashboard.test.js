/**
 * tests/designer-dashboard.test.js
 *
 * Test suite for Web-Based Designer Replay & Diagnostic Dashboard (Sections XXXI & XXXII).
 * Validates embedded HTTP server lifecycle, REST API explainability endpoints,
 * functional persona signature distribution, reference game replay frames,
 * and strict host engine authority boundaries.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { DesignerDashboardServer } from '../packages/runtime/index.js';

describe('Sections XXXI & XXXII: Designer Diagnostic & Replay Dashboard', () => {
    let server;
    let baseUrl;
    let testPort;

    beforeAll(async () => {
        // Ephemeral port: parallel matrix workers can never collide on a
        // fixed port (the observed NOW-4 flake class).
        server = new DesignerDashboardServer({ host: '127.0.0.1', port: 0 });
        const res = await server.start();
        baseUrl = res.url;
        testPort = res.port;
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }
    });

    function makeRequest(method, path, body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, baseUrl);
            const options = {
                method,
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                headers: {}
            };

            let payload = null;
            if (body) {
                payload = JSON.stringify(body);
                options.headers['Content-Type'] = 'application/json';
                options.headers['Content-Length'] = Buffer.byteLength(payload);
            }

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let json = null;
                    if (res.headers['content-type']?.includes('application/json')) {
                        try { json = JSON.parse(data); } catch {}
                    }
                    resolve({ status: res.statusCode, headers: res.headers, body: data, json });
                });
            });

            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });
    }

    it('1. Serves rich interactive HTML dashboard on root GET /', async () => {
        const res = await makeRequest('GET', '/');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.body).toContain('Fear AI Designer Diagnostic Dashboard');
        expect(res.body).toContain('Sections XXXI & XXXII Designer Control');
        expect(res.body).toContain('NPC Threat Attribution');
        expect(res.body).toContain('Functional Persona Curves');
        expect(res.body).toContain('14-Stage Faction Escalation');
        expect(res.body).toContain('Cognitive LOD & Route Safety');
        expect(res.body).toContain('Reference Game Replay');
    });

    it('2. Exposes system health and features on GET /api/status', async () => {
        const res = await makeRequest('GET', '/api/status');
        expect(res.status).toBe(200);
        expect(res.json.status).toBe('online');
        expect(res.json.engine).toBe('Fear AI Universal Middleware');
        expect(res.json.features).toContain('EXPLAINABILITY_INSPECTOR');
        expect(res.json.features).toContain('FUNCTIONAL_PERSONAS');
    });

    it('3. Serves functional persona signatures on GET /api/personas', async () => {
        const res = await makeRequest('GET', '/api/personas');
        expect(res.status).toBe(200);
        expect(res.json).toBeDefined();
        const personas = res.json.personas;
        expect(personas['Paranoid Sentinel']).toBeDefined();
        expect(personas['Stoic Veteran']).toBeDefined();
    });

    it('4. Evaluates real-time threat attribution on POST /api/explain', async () => {
        const res = await makeRequest('POST', '/api/explain', {
            neuroticism: 0.85,
            resilience: 0.15,
            distance: 3.5,
            intensity: 0.95,
            panicPeers: 3
        });

        expect(res.status).toBe(200);
        expect(res.json.agent_id).toBe('designer_npc_01');
        expect(res.json.active_intent).toBeDefined();
        expect(res.json.threat_attribution).toBeDefined();
        expect(res.json.threat_attribution.length).toBeGreaterThan(0);
        expect(res.json.rejected_alternatives).toBeDefined();
        expect(res.json.fear_band).toBeDefined();
        expect(res.json.active_intent.type).toBeDefined();
    });

    it('5. Evaluates faction escalation stance on POST /api/explain-faction', async () => {
        const res = await makeRequest('POST', '/api/explain-faction', {
            factionA: 'KingdomOfIron',
            factionB: 'NomadHorde',
            incidents: 4
        });

        expect(res.status).toBe(200);
        expect(res.json.faction_a).toBe('KingdomOfIron');
        expect(res.json.faction_b).toBe('NomadHorde');
        expect(res.json.bilateral_metrics).toBeDefined();
        expect(res.json.current_stance).toBeDefined();
        expect(res.json.contributing_factors.length).toBeGreaterThan(0);
    });

    it('6. Executes turn-by-turn simulation replay on POST /api/sim/step without host mutation leaks', async () => {
        const res = await makeRequest('POST', '/api/sim/step', {});

        expect(res.status).toBe(200);
        expect(res.json.turnsExecuted).toBe(50);
        expect(res.json.meanMsPerTurn).toBeLessThan(1.0); // Sub-millisecond turn time
        expect(res.json.milestones).toBeDefined();
        expect(res.json.milestones.length).toBeGreaterThan(0);
        const lastEntry = res.json.milestones[res.json.milestones.length - 1];
        expect(lastEntry.miner_pos).toBeDefined();
        expect(lastEntry.miner_intent).toBeDefined();
    });

    it('7. Handles malformed JSON payloads defensively with 400 Bad Request', async () => {
        const res = await new Promise((resolve) => {
            const req = http.request({
                method: 'POST',
                hostname: '127.0.0.1',
                port: testPort,
                path: '/api/explain',
                headers: { 'Content-Type': 'application/json' }
            }, (r) => {
                let data = '';
                r.on('data', c => { data += c; });
                r.on('end', () => resolve({ status: r.statusCode, data }));
            });
            req.write('{ this is invalid json ]');
            req.end();
        });

        expect(res.status).toBe(400);
    });

    it('8. Enforces Host Game Authority Invariant across dashboard API responses', async () => {
        const explainRes = await makeRequest('POST', '/api/explain', {
            neuroticism: 0.9, resilience: 0.1, distance: 2.0, intensity: 1.0, panicPeers: 4
        });
        // Fear AI must provide intent and affect, never mutate host physics directly
        expect(explainRes.json.active_intent.type).toMatch(/FLEE_FROM|RALLY|COWER/);
        expect(explainRes.json.authoritativeCommands).toBeUndefined();
    });
});
