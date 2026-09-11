import { describe, it, expect } from '@jest/globals';
import { IntentResolver, pickTrustedPeer } from '../packages/core/index.js';
import { RelationshipTensorSystem, INTERACTION_TYPES } from '../packages/core/index.js';

// NEXT-150: social context in intent resolution (audit candidate 14).
// Opt-in observations.peerTrust ({ peerId: trust }) steers WARN_GROUP
// and APPROACH_ALLY toward the most trusted visible peer instead of
// peers[0]. Absent map reproduces legacy targets exactly.
describe('NEXT-150: trusted-peer intent targets', () => {
    const agent = { id: 'g', fearCore: { state: 'ANXIOUS' }, currentFear: 0.5, currentDominance: 0.4, currentAnger: 0, energy: 1, traits: { agreeableness: 0.8 }, x: 0, y: 0, z: 0 };
    const peers = [{ id: 'betrayer', x: 5, y: 0, z: 0 }, { id: 'friend', x: -5, y: 0, z: 0 }];
    const threats = [{ id: 'w', type: 'WOLF', intensity: 0.7, distance: 10, x: 10, y: 0, z: 0 }];

    it('1. Absent trust map keeps legacy peers[0] targets', () => {
        expect(IntentResolver.resolveIntent(agent, { threats, peers }).target_id).toBe('betrayer');
        expect(IntentResolver.resolveIntent(agent, { peers }).target_id).toBe('betrayer');
    });

    it('2. Warnings go to the most trusted peer', () => {
        const r = IntentResolver.resolveIntent(agent, { threats, peers, peerTrust: { betrayer: -0.9, friend: 0.8 } });
        expect(r.type).toBe('WARN_GROUP');
        expect(r.target_id).toBe('friend');
    });

    it('3. Approaches go to the most trusted peer', () => {
        const r = IntentResolver.resolveIntent(agent, { peers, peerTrust: { betrayer: -0.9, friend: 0.8 } });
        expect(r.type).toBe('APPROACH_ALLY');
        expect(r.target_id).toBe('friend');
        expect(r.vector_hint.x).toBeLessThan(0);
    });

    it('4. End-to-end: tensor trust steers the warning', () => {
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('g', 'betrayer', INTERACTION_TYPES.BETRAYAL, { weight: 1.0 });
        rel.recordInteraction('g', 'friend', INTERACTION_TYPES.RESCUE_CONFIRMED, { weight: 1.0 });
        const peerTrust = {
            betrayer: rel.getRelationship('g', 'betrayer').trust,
            friend: rel.getRelationship('g', 'friend').trust
        };
        const r = IntentResolver.resolveIntent(agent, { threats, peers, peerTrust });
        expect(r.type).toBe('WARN_GROUP');
        expect(r.target_id).toBe('friend');
    });

    it('5. Urgency and posture unchanged by targeting', () => {
        const plain = IntentResolver.resolveIntent(agent, { threats, peers });
        const trusted = IntentResolver.resolveIntent(agent, { threats, peers, peerTrust: { betrayer: -0.9, friend: 0.8 } });
        expect(trusted.urgency).toBe(plain.urgency);
        expect(trusted.suggested_posture).toBe(plain.suggested_posture);
        expect(trusted.type).toBe(plain.type);
    });

    it('6. Helper degrades safely on bad inputs', () => {
        expect(pickTrustedPeer([], {})).toBeNull();
        expect(pickTrustedPeer(peers, null)).toBe(peers[0]);
        expect(pickTrustedPeer(peers, { unknown: 1 })).toBe(peers[0]);
        expect(pickTrustedPeer(peers, { friend: NaN }).id).toBe('betrayer');
    });
});
