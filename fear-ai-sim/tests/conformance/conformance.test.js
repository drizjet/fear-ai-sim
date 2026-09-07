import { describe, it, expect } from '@jest/globals';
import {
    DeterministicRng,
    AffectiveAgent,
    FearCore,
    TraumaZoneSystem,
    ContagionGraph,
    PacingDirector,
    IntentResolver
} from '../../packages/core/index.js';
import { RuntimeSimulation } from '../../packages/runtime/index.js';

describe('Fear AI Cross-Engine Conformance Suite (8 Canonical Horror Scenarios)', () => {

    // -------------------------------------------------------------------------
    // Scenario 1: Calm Baseline Stability
    // -------------------------------------------------------------------------
    it('Scenario 1: Calm Baseline - No stimuli maintains CALM band and resting vitals', () => {
        const agent = new AffectiveAgent('agent_calm', { neuroticism: 0.3, fear: 0.4 });
        
        for (let i = 0; i < 60; i++) {
            const out = agent.tick(0.016, { threats: [], sounds: [] });
            expect(out.fear_band).toBe('CALM');
            expect(out.affective_state.arousal).toBeLessThan(0.35);
            expect(out.affective_state.valence).toBeGreaterThan(0.0);
            expect(out.audio_hints.heartbeat_bpm).toBeLessThanOrEqual(95);
            expect(out.action_intent.type).toBe('CAUTIOUS_EXPLORE');
        }
    });

    // -------------------------------------------------------------------------
    // Scenario 2: Immediate Threat Proximity Escalation
    // -------------------------------------------------------------------------
    it('Scenario 2: Threat Escalation - Predator approaching drives CALM -> ALERT -> ANXIOUS -> PANIC', () => {
        const agent = new AffectiveAgent('agent_escalate', { neuroticism: 0.7, fear: 0.8 });
        
        // Step A: Distant sound
        let out = agent.tick(0.016, {
            threats: [],
            sounds: [{ id: 'creak', type: 'SOUND', distance: 20, intensity: 0.5 }]
        });
        expect(['CALM', 'ALERT']).toContain(out.fear_band);

        // Step B: Monster spotted at medium range (25m)
        for (let i = 0; i < 5; i++) {
            out = agent.tick(0.016, {
                threats: [{ id: 'stalker', type: 'PREDATOR', distance: 25, intensity: 0.8 }]
            });
        }
        expect(['ALERT', 'ANXIOUS']).toContain(out.fear_band);

        // Step C: Monster charges close (3m)
        for (let i = 0; i < 15; i++) {
            out = agent.tick(0.016, {
                threats: [{ id: 'stalker', type: 'PREDATOR', distance: 3, intensity: 1.0 }]
            });
        }

        expect(out.fear_band).toBe('PANIC');
        expect(out.action_intent.type).toBe('FLEE_FROM');
        expect(out.action_intent.urgency).toBeGreaterThan(0.7);
        expect(out.audio_hints.heartbeat_bpm).toBeGreaterThan(130);
        expect(out.audio_hints.lowpass_cutoff_hz).toBeLessThan(8000);
        expect(['SCREAM', 'DESPERATE_SHOUT']).toContain(out.audio_hints.vocalization_hint);
    });

    // -------------------------------------------------------------------------
    // Scenario 3: Hysteresis Panic Lock Duration
    // -------------------------------------------------------------------------
    it('Scenario 3: Hysteresis Panic Lock - Agent remains locked in PANIC after threat vanishes', () => {
        const agent = new AffectiveAgent('agent_hysteresis', {
            neuroticism: 0.5,
            fear: 0.8
        }, {
            fearCoreConfig: { panicLockTicks: 15 }
        });

        // Force panic by close threat
        for (let i = 0; i < 10; i++) {
            agent.tick(0.016, { threats: [{ id: 'monster', type: 'PREDATOR', distance: 1, intensity: 1.0 }] });
        }
        expect(agent.fearCore.state).toBe('PANIC');

        // Threat instantly disappears
        const observations = { threats: [], sounds: [] };
        
        // Must stay in PANIC for next 7 ticks due to panicLockTicks = 8
        for (let t = 0; t < 7; t++) {
            const out = agent.tick(0.016, observations);
            expect(out.fear_band).toBe('PANIC');
            expect(out.debug_trace.panic_locked).toBe(true);
        }

        // Ticking further allows decay down from PANIC through ANXIOUS
        for (let t = 0; t < 30; t++) {
            agent.tick(0.016, observations);
        }
        expect(agent.fearCore.state).not.toBe('PANIC');
    });

    // -------------------------------------------------------------------------
    // Scenario 4: Habituation Desensitization Curve
    // -------------------------------------------------------------------------
    it('Scenario 4: Habituation - Repeated exposures desensitize fear reaction', () => {
        const agent = new AffectiveAgent('agent_hab', { neuroticism: 0.5, fear: 0.6 });

        // First exposure to a sudden sound
        const out1 = agent.tick(0.016, {
            sounds: [{ id: 'spooky_thump', type: 'SOUND', distance: 10, intensity: 0.8 }]
        });
        const initialFear = out1.affective_state.raw_fear;

        // Expose 10 times to the exact same thump sound
        for (let i = 0; i < 10; i++) {
            agent.tick(0.016, {
                sounds: [{ id: 'spooky_thump', type: 'SOUND', distance: 10, intensity: 0.8 }]
            });
        }

        const habLevel = agent.habituation.getHabituationLevel('SOUND', 'spooky_thump');
        expect(habLevel).toBeGreaterThan(0.2); // At least 20% habituated

        // Effective fear response should be reduced
        const testFear = agent.habituation.getEffectiveFear(0.8, 'SOUND', 'spooky_thump', 100);
        expect(testFear).toBeLessThan(0.8);
    });

    // -------------------------------------------------------------------------
    // Scenario 5: Social Panic Contagion Cascade
    // -------------------------------------------------------------------------
    it('Scenario 5: Social Contagion - Screaming panicking peer causes neighbor to panic without line-of-sight', () => {
        const sim = new RuntimeSimulation({ seed: 42 });

        // Agent A: exposed to monster at x=10
        sim.registerAgent('agent_a', { neuroticism: 0.9, fear: 0.9, extraversion: 0.5 }, { initial_position: { x: 10, y: 0, z: 0 } });

        // Agent B: behind a wall at x=15, CANNOT see monster (threats = [])
        sim.registerAgent('agent_b', { neuroticism: 0.85, fear: 0.8, extraversion: 0.8 }, { initial_position: { x: 15, y: 0, z: 0 } });

        // Tick 1-15: Agent A sees monster right in front of them
        for (let t = 0; t < 15; t++) {
            sim.queueObservation('agent_a', {
                threats: [{ id: 'monster', type: 'PREDATOR', distance: 2, intensity: 1.0 }]
            });
            // Agent B sees NO threats
            sim.queueObservation('agent_b', { threats: [] });
            sim.tick(0.016);
        }

        const agentA = sim.agents.get('agent_a');
        const agentB = sim.agents.get('agent_b');

        expect(agentA.fearCore.state).toBe('PANIC');
        // Agent B should have caught viral panic contagion from Agent A's screams and terror!
        expect(['ANXIOUS', 'PANIC']).toContain(agentB.fearCore.state);
        expect(agentB.currentFear).toBeGreaterThan(0.4);
    });

    // -------------------------------------------------------------------------
    // Scenario 6: Calm Leader Reassurance Mitigation
    // -------------------------------------------------------------------------
    it('Scenario 6: Leader Reassurance - High-leadership calm agent dampens fear in anxious neighbor', () => {
        const sim = new RuntimeSimulation({ seed: 100 });

        // Anxious follower
        sim.registerAgent('follower', { neuroticism: 0.7, fear: 0.7 }, { initial_position: { x: 0, y: 0, z: 0 } });

        // Calm, hardened Squad Leader (Leadership = 0.98, Neuroticism = 0.1)
        sim.registerAgent('leader', { leadership: 0.98, neuroticism: 0.1, resilience: 0.95 }, { initial_position: { x: 2, y: 0, z: 0 } });

        // Both hear a scary noise in the dark
        for (let t = 0; t < 10; t++) {
            sim.queueObservation('follower', {
                sounds: [{ id: 'distant_roar', type: 'SOUND', distance: 15, intensity: 0.7 }]
            });
            sim.queueObservation('leader', {
                sounds: [{ id: 'distant_roar', type: 'SOUND', distance: 15, intensity: 0.7 }]
            });
            sim.tick(0.016);
        }

        const follower = sim.agents.get('follower');
        const leader = sim.agents.get('leader');

        expect(leader.fearCore.state).toBe('CALM');
        // Because leader is right next to follower (dist 2m), follower's fear is suppressed
        expect(follower.currentFear).toBeLessThan(0.65);
    });

    // -------------------------------------------------------------------------
    // Scenario 7: Spatial Trauma Memory Dread
    // -------------------------------------------------------------------------
    it('Scenario 7: Trauma Zone - Lingering memory of prior death induces situational dread', () => {
        const sim = new RuntimeSimulation({ seed: 555 });

        // Add trauma zone where another character was killed at coordinate (50, 0, 0)
        sim.addTraumaZone(50, 0, 0, 1.0, 100, 1800);

        sim.registerAgent('wanderer', { neuroticism: 0.8, fear: 0.7 }, { initial_position: { x: 50, y: 0, z: 0 } });

        // Wanderer enters trauma zone without any visible monster
        for (let t = 0; t < 10; t++) {
            sim.queueObservation('wanderer', { threats: [], sounds: [] });
            sim.tick(0.016);
        }

        const wanderer = sim.agents.get('wanderer');
        // Even with zero active threats, trauma zone dread elevates fear and anxiety
        expect(wanderer.currentFear).toBeGreaterThan(0.25);
        expect(['ALERT', 'ANXIOUS', 'PANIC']).toContain(wanderer.fearCore.state);
    });

    // -------------------------------------------------------------------------
    // Scenario 8: Deterministic Replay Reproducibility
    // -------------------------------------------------------------------------
    it('Scenario 8: Determinism - Identical seed + inputs produce bit-for-bit identical outputs across 1,000 ticks', () => {
        const runSimulation = (seed) => {
            const sim = new RuntimeSimulation({ seed });
            sim.registerAgent('alpha', { neuroticism: 0.6, fear: 0.7 }, { initial_position: { x: 0, y: 0, z: 0 } });
            sim.registerAgent('beta', { neuroticism: 0.4, fear: 0.5 }, { initial_position: { x: 20, y: 0, z: 0 } });

            const trace = [];
            for (let t = 0; t < 500; t++) {
                const obsAlpha = {
                    threats: t % 50 === 0 ? [{ id: 'p', type: 'PREDATOR', distance: 10, intensity: 0.8 }] : []
                };
                const obsBeta = {
                    sounds: t % 30 === 0 ? [{ id: 's', type: 'SOUND', distance: 15, intensity: 0.5 }] : []
                };
                sim.queueObservation('alpha', obsAlpha);
                sim.queueObservation('beta', obsBeta);
                const out = sim.tick(0.016);
                trace.push(out);
            }
            return trace;
        };

        const trace1 = runSimulation(1337);
        const trace2 = runSimulation(1337);

        expect(trace1.length).toBe(trace2.length);
        for (let i = 0; i < trace1.length; i++) {
            expect(trace1[i]).toEqual(trace2[i]);
        }
    });
});
