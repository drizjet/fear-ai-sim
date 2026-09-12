import { describe, it, expect } from '@jest/globals';
import http from 'node:http';
import WebSocket from 'ws';
import { FearServer } from '../packages/runtime/index.js';
import {
    ProtocolValidator,
    SUPPORTED_OBSERVATION_FIELDS,
    SUPPORTED_SOCIAL_EVENT_FIELDS,
    SUPPORTED_PACING_METRICS,
} from '../packages/protocol/index.js';

// R8: handshake advertises runtime-honored optional wire fields (CXXVIII).
// The manifest is contractual: the completeness test pins that every listed
// key survives validation and every forwarded key is listed, so manifest
// and implementation cannot drift apart silently.

function postJson(port, path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            host: '127.0.0.1', port, path, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function wsHandshake(port, payload) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const timer = setTimeout(() => { try { ws.close(); } catch { /* noop */ } reject(new Error('ws handshake timeout')); }, 5000);
        ws.on('open', () => ws.send(JSON.stringify(payload)));
        ws.on('message', (data) => {
            clearTimeout(timer);
            ws.close();
            resolve(JSON.parse(String(data)));
        });
        ws.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
}

describe('R8: handshake capability advertisement', () => {
    it('1. Manifest completeness: every listed key survives validation', () => {
        const kitchenSink = {
            agent_id: 'manifest_probe',
            visual: { intensity: 0.8, reliability: 0.5, ageTicks: 3 },
            audio: { loudness: 0.6, reliability: 0.5, ageTicks: 3 },
            context: {
                trust: 0.1, trustGain: 0.2, calmTrustGain: 0.3,
                traumaLoad: 0.4, memoryLoad: 0.5, identityWeight: 0.6,
            },
        };
        const validated = ProtocolValidator.validateObservation(kitchenSink);
        expect(validated.valid).toBe(true);
        for (const channel of ['visual', 'audio']) {
            for (const key of SUPPORTED_OBSERVATION_FIELDS[channel]) {
                expect(validated.value[channel][key]).toBe(kitchenSink[channel][key]);
            }
        }
        for (const key of SUPPORTED_OBSERVATION_FIELDS.context) {
            expect(validated.value.context[key]).toBe(kitchenSink.context[key]);
        }
        const social = ProtocolValidator.validateSocialEvent({
            type: 'SOCIAL_EVENT', event: 'RESCUE', actor_id: 'a', target_id: 'b',
            location: { x: 1, y: 2, z: 3 },
        });
        expect(social.valid).toBe(true);
        for (const key of SUPPORTED_SOCIAL_EVENT_FIELDS.location) {
            expect(social.value.location[key]).toBe(key === 'x' ? 1 : key === 'y' ? 2 : 3);
        }
        expect(SUPPORTED_PACING_METRICS).toContain('cohesion');
    });

    it('2. HTTP handshake advertises the manifest; legacy requests accepted', async () => {
        const server = new FearServer({ host: '127.0.0.1', port: 0, seed: 81 });
        const { port } = await server.start();
        try {
            const full = await postJson(port, '/api/v1/handshake', {
                type: 'HANDSHAKE_REQUEST', client_id: 'r8', capabilities: ['supports_dialogue'],
            });
            expect(full.status).toBe(200);
            expect(full.body.status).toBe('ACCEPTED');
            expect(full.body.supported_observation_fields).toEqual(SUPPORTED_OBSERVATION_FIELDS);
            expect(full.body.supported_social_event_fields).toEqual(SUPPORTED_SOCIAL_EVENT_FIELDS);
            expect(full.body.supported_pacing_metrics).toEqual(SUPPORTED_PACING_METRICS);
            // Legacy host with no capabilities field is still accepted.
            const legacy = await postJson(port, '/api/v1/handshake', { type: 'HANDSHAKE_REQUEST' });
            expect(legacy.status).toBe(200);
            expect(legacy.body.supported_pacing_metrics).toContain('cohesion');
        } finally {
            await server.stop();
        }
    });

    it('3. WS handshake advertises the identical manifest', async () => {
        const server = new FearServer({ host: '127.0.0.1', port: 0, seed: 82 });
        const { port } = await server.start();
        try {
            const res = await wsHandshake(port, { type: 'HANDSHAKE_REQUEST', client_id: 'r8ws' });
            expect(res.type).toBe('HANDSHAKE_RESPONSE');
            expect(res.status).toBe('ACCEPTED');
            expect(res.supported_observation_fields).toEqual(SUPPORTED_OBSERVATION_FIELDS);
            expect(res.supported_social_event_fields).toEqual(SUPPORTED_SOCIAL_EVENT_FIELDS);
            expect(res.supported_pacing_metrics).toEqual(SUPPORTED_PACING_METRICS);
        } finally {
            await server.stop();
        }
    });
});
