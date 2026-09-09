import { describe, it, expect } from '@jest/globals';
import {
    PROTOCOL_VERSION,
    MESSAGE_TYPES,
    ERROR_CODES,
    ProtocolValidator
} from '../../packages/protocol/index.js';

describe('Protocol v1.0.0 Validator', () => {
    it('validates a valid handshake request', () => {
        const msg = {
            type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
            protocol_version: '1.0.0',
            client_id: 'test_client',
            client_name: 'TestEngine',
            engine: 'Unity'
        };
        const res = ProtocolValidator.validateIncomingMessage(msg);
        expect(res.valid).toBe(true);
        expect(res.value.client_id).toBe('test_client');
    });

    it('rejects an incompatible major protocol version', () => {
        const msg = {
            type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
            protocol_version: '2.0.0',
            client_id: 'future_client'
        };
        const res = ProtocolValidator.validateIncomingMessage(msg);
        expect(res.valid).toBe(false);
        expect(res.code).toBe(ERROR_CODES.INVALID_PROTOCOL_VERSION);
    });

    it('validates agent registration and clamps OCEAN traits to 0..1', () => {
        const msg = {
            type: MESSAGE_TYPES.REGISTER_AGENT,
            agent_id: 'agent_42',
            name: 'Hero',
            traits: {
                neuroticism: 1.8, // out of bounds, should clamp to 1.0
                courage: -0.5,
                fear: 0.75
            }
        };
        const res = ProtocolValidator.validateIncomingMessage(msg);
        expect(res.valid).toBe(true);
        expect(res.value.agent_id).toBe('agent_42');
        expect(res.value.traits.neuroticism).toBe(1.0);
        expect(res.value.traits.fear).toBe(0.75);
    });

    it('validates and sanitizes sensory observations', () => {
        const obs = {
            agent_id: 'agent_42',
            x: 10.5,
            y: -5.0,
            z: 0.0,
            health: 0.8,
            threats: [
                {
                    type: 'PREDATOR',
                    distance: 12.0,
                    intensity: 0.95
                },
                {
                    type: 'INVALID_TYPE', // should fallback
                    distance: -3.0 // should clamp
                }
            ]
        };
        const res = ProtocolValidator.validateObservation(obs);
        expect(res.valid).toBe(true);
        expect(res.value.threats.length).toBe(2);
        expect(res.value.threats[0].type).toBe('PREDATOR');
        expect(res.value.threats[1].type).toBe('PREDATOR');
        expect(res.value.threats[1].distance).toBe(0);
    });

    it('verifies valid agent output schema check', () => {
        const validOutput = {
            agent_id: 'agent_1',
            tick: 10,
            fear_band: 'PANIC',
            affective_state: {
                valence: -0.8,
                arousal: 0.95,
                dominance: 0.1,
                raw_fear: 0.9,
                adrenaline: 0.85,
                morale: 0.2
            },
            action_intent: {
                type: 'FLEE_FROM',
                target_id: 'monster_1',
                urgency: 0.95,
                vector_hint: { x: -1, y: 0, z: 0 }
            },
            audio_hints: {
                heartbeat_bpm: 165,
                shepard_mix: 0.5,
                lowpass_cutoff_hz: 3000,
                infrasound_intensity: 0.8,
                vocalization_hint: 'SCREAM'
            }
        };
        expect(ProtocolValidator.isValidAgentOutput(validOutput)).toBe(true);

        const invalidOutput = { ...validOutput, fear_band: 'SUPER_SAIYAN' };
        expect(ProtocolValidator.isValidAgentOutput(invalidOutput)).toBe(false);
    });

    it('validates social events with sanitized participants', () => {
        const res = ProtocolValidator.validateSocialEvent({
            event: 'BETRAYAL', actor_id: 'a', target_id: 'b', weight: 1.5,
            witnesses: ['c', 'c', '  '], exposed: false
        });
        expect(res.valid).toBe(true);
        expect(res.value.actor_id).toBe('a');
        expect(res.value.weight).toBe(1.5);
        expect(res.value.witnesses).toEqual(['c']);
        expect(res.value.severity).toBeNull();
    });

    it('rejects unknown social events and empty participants', () => {
        expect(ProtocolValidator.validateSocialEvent(
            { event: 'MURDER', actor_id: 'a', target_id: 'b' }).valid).toBe(false);
        expect(ProtocolValidator.validateSocialEvent(
            { event: 'AID', actor_id: '  ', target_id: 'b' }).valid).toBe(false);
        expect(ProtocolValidator.validateSocialEvent(null).valid).toBe(false);
    });
});
