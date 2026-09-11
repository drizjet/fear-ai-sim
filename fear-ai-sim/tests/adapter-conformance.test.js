import { describe, it, expect } from '@jest/globals';
import { runAdapterConformance, canonicalAdapterSample } from '../packages/protocol/index.js';
import { FEAR_BANDS } from '../packages/core/src/FearCore.js';
import { ACTION_INTENTS } from '../packages/core/src/IntentResolver.js';
import { INTENT_CODES } from '../packages/protocol/src/BinaryWireProtocol.js';

// NEXT-126: third-party adapter conformance harness (CCI-28 frontier 10
// groundwork). Server-free contract proof for the next external host.
describe('NEXT-126: adapter conformance harness', () => {
    it('1. Canonical reference adapter passes every check', () => {
        const r = runAdapterConformance(canonicalAdapterSample());
        expect(r.failed).toBe(0);
        expect(r.passed).toBe(r.checks.length);
    });

    it('2. Broken handshake fails exactly the handshake checks', () => {
        const bad = {
            ...canonicalAdapterSample(),
            name: 'broken-handshake',
            handshake: { protocol_version: '9.9.9', client_id: 'x' }
        };
        const r = runAdapterConformance(bad);
        expect(r.failed).toBeGreaterThan(0);
        const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.pass]));
        expect(byId['version-major-match']).toBe(false);
        expect(byId['register-valid']).toBe(true);
        expect(byId['tick-request-valid']).toBe(true);
    });

    it('3. Unknown intent in response fails the response check', () => {
        const bad = {
            ...canonicalAdapterSample(),
            name: 'rogue-intent',
            tickResponse: { agent_id: 'a1', fear_band: 'PANIC', action_intent: { type: 'NUKE_FROM_ORBIT' } },
            declaredIntents: ['FLEE_FROM', 'NUKE_FROM_ORBIT']
        };
        const r = runAdapterConformance(bad);
        const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.pass]));
        expect(byId['response-intent-known']).toBe(false);
        expect(byId['declared-intent-vocabulary-clean']).toBe(false);
        expect(byId['handshake-valid']).toBe(true);
    });

    it('4. Harness vocabularies match the canonical core sets (drift alarm)', () => {
        expect(new Set(Object.keys(INTENT_CODES).filter((k) => k !== 'UNKNOWN')))
            .toEqual(new Set(ACTION_INTENTS));
        // Every core band must be accepted by the harness sample path.
        const sample = canonicalAdapterSample();
        for (const band of FEAR_BANDS) {
            const r = runAdapterConformance({ ...sample, tickResponse: { ...sample.tickResponse, fear_band: band } });
            const bandCheck = r.checks.find((c) => c.id === 'response-band-known');
            expect(bandCheck.pass).toBe(true);
        }
    });

    it('5. Empty adapter fails without throwing', () => {
        const r = runAdapterConformance({});
        expect(r.failed).toBeGreaterThan(0);
        expect(r.checks.length).toBeGreaterThan(5);
    });
});
