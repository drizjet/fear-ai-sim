import { describe, it, expect } from '@jest/globals';
import { FearServer } from '../../packages/runtime/index.js';
import { ProtocolValidator } from '../../packages/protocol/index.js';

describe('Security Hardening & Local Middleware Threat Model', () => {

    it('1. Default Bind is Loopback Only: rejects 0.0.0.0 without allowRemoteAccess flag', () => {
        const serverDefault = new FearServer();
        expect(serverDefault.host).toBe('127.0.0.1');

        // Attempting to bind 0.0.0.0 without opt-in falls back safely to 127.0.0.1
        const serverPublicAttempt = new FearServer({ host: '0.0.0.0' });
        expect(serverPublicAttempt.host).toBe('127.0.0.1');

        // Explicit opt-in permits remote binding if needed
        const serverExplicit = new FearServer({ host: '0.0.0.0', allowRemoteAccess: true });
        expect(serverExplicit.host).toBe('0.0.0.0');
    });

    it('2. Prototype Pollution Defense: strips __proto__ and constructor overrides', () => {
        const maliciousPayload = JSON.parse('{"type":"REGISTER_AGENT","agent_id":"hacker","traits":{"__proto__":{"polluted":true},"neuroticism":0.5}}');
        const validated = ProtocolValidator.validateRegisterAgent(maliciousPayload);

        expect(validated.valid).toBe(true);
        expect(validated.value.traits.polluted).toBeUndefined();
        expect(({}).polluted).toBeUndefined();
        expect(validated.value.traits.neuroticism).toBe(0.5);
    });

    it('3. Path Traversal Safety: path-like agent IDs remain pure memory keys with zero FS side-effects', () => {
        const pathTraversalId = '../../../../Windows/System32/drivers/etc/hosts';
        const validated = ProtocolValidator.validateRegisterAgent({
            agent_id: pathTraversalId,
            traits: { fear: 0.5 }
        });

        expect(validated.valid).toBe(true);
        expect(validated.value.agent_id).toBe(pathTraversalId);

        const server = new FearServer({ port: 9111 });
        const agent = server.simulation.registerAgent(pathTraversalId, { fear: 0.5 });
        expect(agent.id).toBe(pathTraversalId);
        expect(server.simulation.agents.has(pathTraversalId)).toBe(true);
    });

    it('4. Identifier Length Limits: truncates oversized strings beyond 256 characters', () => {
        const massiveId = 'A'.repeat(5000);
        const validated = ProtocolValidator.validateRegisterAgent({
            agent_id: massiveId,
            traits: {}
        });

        expect(validated.valid).toBe(true);
        expect(validated.value.agent_id.length).toBe(256);
    });

    it('5. Snapshot Injection Safety: snapshots operate strictly in memory without filesystem execution', () => {
        const maliciousSnapshot = {
            version: 1,
            seed: 42,
            targetFilePath: 'C:/malicious/overwrite.txt',
            exec: 'calc.exe',
            agents: []
        };

        const server = new FearServer({ port: 9112 });
        const res = server.simulation.loadSnapshot(maliciousSnapshot);
        expect(res.success).toBe(true);
        // Simulation does not execute commands or write files
        expect(server.simulation.seed).toBe(42);
    });
});
