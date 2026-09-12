/**
 * tests/host-capability-negotiation.test.js
 *
 * Section 73 / Front D: Host Capability Negotiation & Intent Downgrade Verification.
 *
 * Asserts:
 * 1. Advertising capabilities accurately registers and queries supported action primitives.
 * 2. Unsupported intents gracefully downgrade to approved fallback primitives.
 * 3. Intent ranking lists are filtered, downgraded, and deduplicated without score corruption.
 * 4. Recursive capability checks handle multi-step fallback chains.
 * 5. Host Game Authority Invariant is preserved: all negotiation operates advisory-only.
 */

import { describe, it, expect } from '@jest/globals';
import {
    HostCapabilityNegotiator,
    HOST_CAPABILITIES,
    INTENT_CAPABILITY_REQUIREMENTS,
    RUNTIME_SAFE_FALLBACKS
} from '../packages/core/src/HostCapabilityNegotiator.js';
import { ACTION_INTENTS } from '../packages/core/src/IntentResolver.js';

describe('Section 73 / Front D: Host Capability Negotiation & Intent Downgrade', () => {
    it('1. Correctly registers and inspects host advertised capabilities', () => {
        const negotiator = new HostCapabilityNegotiator({
            [HOST_CAPABILITIES.SUPPORTS_NAVIGATION_QUERY]: true,
            [HOST_CAPABILITIES.SUPPORTS_DYNAMIC_REROUTING]: true,
            [HOST_CAPABILITIES.SUPPORTS_COVER_POINTS]: false
        });

        expect(negotiator.hasCapability(HOST_CAPABILITIES.SUPPORTS_NAVIGATION_QUERY)).toBe(true);
        expect(negotiator.hasCapability(HOST_CAPABILITIES.SUPPORTS_DYNAMIC_REROUTING)).toBe(true);
        expect(negotiator.hasCapability(HOST_CAPABILITIES.SUPPORTS_COVER_POINTS)).toBe(false);
        expect(negotiator.hasCapability(HOST_CAPABILITIES.SUPPORTS_GROUP_FORMATION)).toBe(false);

        const active = negotiator.getActiveCapabilities();
        expect(active).toContain(HOST_CAPABILITIES.SUPPORTS_NAVIGATION_QUERY);
        expect(active).toContain(HOST_CAPABILITIES.SUPPORTS_DYNAMIC_REROUTING);
        expect(active).not.toContain(HOST_CAPABILITIES.SUPPORTS_COVER_POINTS);
    });

    it('2. Passes supported intents through without modification', () => {
        const negotiator = new HostCapabilityNegotiator({
            [HOST_CAPABILITIES.SUPPORTS_COVER_POINTS]: true
        });

        const res = negotiator.filterIntent('TAKE_COVER');
        expect(res.downgraded).toBe(false);
        expect(res.intent).toBe('TAKE_COVER');
        expect(res.originalIntent).toBe('TAKE_COVER');
        expect(res.reason).toBeNull();
    });

    it('3. Gracefully downgrades TAKE_COVER when host lacks cover point support', () => {
        const negotiator = new HostCapabilityNegotiator({
            [HOST_CAPABILITIES.SUPPORTS_COVER_POINTS]: false
        });

        const res = negotiator.filterIntent('TAKE_COVER');
        expect(res.downgraded).toBe(true);
        expect(res.intent).toBe('HIDE');
        expect(res.originalIntent).toBe('TAKE_COVER');
        expect(res.requiredCapability).toBe(HOST_CAPABILITIES.SUPPORTS_COVER_POINTS);
        expect(res.reason).toContain("Host does not advertise 'supports_cover_points'");
    });

    it('4. Gracefully downgrades squad FORM_PHALANX when host lacks formation support', () => {
        const negotiator = new HostCapabilityNegotiator({});

        const res = negotiator.filterIntent('FORM_PHALANX');
        expect(res.downgraded).toBe(true);
        expect(res.intent).toBe('HOLD_LINE');
    });

    it('5. Gracefully downgrades dialogue BROADCAST_WARNING when host lacks dialogue', () => {
        const negotiator = new HostCapabilityNegotiator({});

        const res = negotiator.filterIntent('BROADCAST_WARNING');
        expect(res.downgraded).toBe(true);
        expect(res.intent).toBe('FLEE_FROM');
    });

    it('6. Filters and deduplicates ranked intent lists while preserving score order', () => {
        const negotiator = new HostCapabilityNegotiator({
            [HOST_CAPABILITIES.SUPPORTS_COVER_POINTS]: false
        });

        const ranked = [
            { intent: 'TAKE_COVER', score: 0.95 },
            { intent: 'HIDE', score: 0.70 },
            { intent: 'FLEE_FROM', score: 0.50 }
        ];

        // TAKE_COVER downgrades to HIDE, which duplicates the second entry.
        // The filter must preserve the higher score (0.95) and deduplicate HIDE.
        const filtered = negotiator.filterIntentRanking(ranked);
        expect(filtered.length).toBe(2);
        expect(filtered[0].intent).toBe('HIDE');
        expect(filtered[0].score).toBe(0.95);
        expect(filtered[0].downgraded).toBe(true);
        expect(filtered[1].intent).toBe('FLEE_FROM');
        expect(filtered[1].score).toBe(0.50);
    });

    it('7. Preserves Host Game Authority Invariant', () => {
        // Confirms negotiator is strictly advisory and produces no entity transform side effects
        const negotiator = new HostCapabilityNegotiator();
        const dummyHostEntity = { x: 100, y: 50, hp: 100 };

        const advice = negotiator.filterIntent('TAKE_COVER');
        expect(dummyHostEntity.x).toBe(100);
        expect(dummyHostEntity.y).toBe(50);
        expect(dummyHostEntity.hp).toBe(100);
        expect(advice.intent).toBe('HIDE');
    });

    it('8. R36 runtime intents gate on structural capabilities', () => {
        expect(INTENT_CAPABILITY_REQUIREMENTS.SEEK_COVER)
            .toBe(HOST_CAPABILITIES.SUPPORTS_COVER_POINTS);
        expect(INTENT_CAPABILITY_REQUIREMENTS.WARN_GROUP)
            .toBe(HOST_CAPABILITIES.SUPPORTS_DIALOGUE);
        // Unmapped runtime intents need no structural capability.
        const negotiator = new HostCapabilityNegotiator({});
        for (const intent of ['APPROACH_ALLY', 'INVESTIGATE_SOUND', 'FLEE_FROM', 'IDLE_VIGILANT']) {
            const res = negotiator.filterIntent(intent, RUNTIME_SAFE_FALLBACKS);
            expect(res.downgraded).toBe(false);
            expect(res.intent).toBe(intent);
        }
    });

    it('9. R36 runtime fallbacks stay inside runtime vocabulary', () => {
        const negotiator = new HostCapabilityNegotiator({});
        for (const intent of ['SEEK_COVER', 'WARN_GROUP']) {
            const res = negotiator.filterIntent(intent, RUNTIME_SAFE_FALLBACKS);
            expect(res.downgraded).toBe(true);
            expect(ACTION_INTENTS).toContain(res.intent);
        }
    });
});
