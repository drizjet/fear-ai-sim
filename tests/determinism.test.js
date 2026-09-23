import { describe, expect, it } from '@jest/globals';
import { Personality, BeliefEvidence, AgentBelief } from '../socialcore.js';
import { DecisionCore } from '../decisioncore.js';
import { mulberry32 } from '../randomcore.js';
import { SocietyCore } from '../societycore.js';

describe('RESP-RNG-OWNERSHIP-001: injectable, serializable randomness and time', () => {
    it('draws Personality trait defaults from the injected RNG', () => {
        const calls = [];
        const personality = new Personality({}, { rng: () => { calls.push(1); return 0.25; } });
        expect(calls.length).toBeGreaterThan(0); // Math.random-restored mutant would leave the spy unused
        expect(personality.openness).toBe(0.25);
        expect(personality.extraversion).toBe(0.25);
    });

    it('is deterministic by default: fresh instances draw identical traits', () => {
        const a = new Personality();
        const b = new Personality();
        expect(a.openness).toBe(b.openness);
        expect(a.neuroticism).toBe(b.neuroticism);
        expect(a.impulsiveness).toBe(b.impulsiveness);
    });

    it('reproduces identical traits from the same seed and diverges from a different seed', () => {
        const a = new Personality({}, { rng: mulberry32(7) });
        const b = new Personality({}, { rng: mulberry32(7) });
        const c = new Personality({}, { rng: mulberry32(8) });
        expect(a.openness).toBe(b.openness);
        const traits = p => [p.openness, p.conscientiousness, p.extraversion, p.agreeableness, p.neuroticism];
        expect(traits(a)).not.toEqual(traits(c));
    });

    it('makes DecisionCore selection deterministic by default and RNG-driven when injected', () => {
        const actions = [
            { id: 'a', considerations: [{ name: 'x', value: 0.5 }] },
            { id: 'b', considerations: [{ name: 'x', value: 0.5 }] },
        ];
        const d1 = new DecisionCore();
        const d2 = new DecisionCore();
        expect(d1.evaluate({}, actions).selected).toBe(d2.evaluate({}, actions).selected);
        const calls = [];
        const injected = new DecisionCore({ random: () => { calls.push(1); return 0; } });
        const result = injected.evaluate({}, actions);
        expect(calls.length).toBeGreaterThan(0);
        expect(result.selected).toBe('a'); // cursor 0 selects first candidate deterministically
    });

    it('stamps BeliefEvidence and AgentBelief timestamps from the injected clock', () => {
        const evidence = new BeliefEvidence({ claim: 'c', valueEstimate: true }, { now: () => 1234 });
        expect(evidence.timestamp).toBe(1234); // Date.now-restored mutant would fail this exact match
        const belief = new AgentBelief('c', true, 0.5, { now: () => 5678 });
        expect(belief.lastUpdated).toBe(5678);
    });

    it('serializes RNG state so a fresh runtime continues the identical stream', () => {
        const source = mulberry32(11);
        source.next();
        const clone = mulberry32(11);
        clone.setState(source.getState());
        expect(clone.next()).toBe(source.next());
        // World-level round-trip through SocietyCore save/load.
        const society = new SocietyCore({ rng: mulberry32(3) });
        society.random();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.random()).toBe(society.random());
    });
});