import { describe, it, expect } from '@jest/globals';
import {
    AffectiveAgent,
    FiniteStateMachineAgent,
    UtilityAIAgent,
    BehaviorTreeAgent,
    SubsystemAblationHarness,
    ABLATION_FLAGS,
    BASELINE_MODELS
} from '../packages/core/index.js';

describe('Milestone L: Comparative Behavioral Baselines & Systematic Subsystem Ablations', () => {

    it('1. Standard FSM and Behavior Tree exhibit brittle boundary chatter under noisy distance', () => {
        const fsm = new FiniteStateMachineAgent('fsm_test', { fleeThreshold: 10.0, alertThreshold: 25.0 });
        const bt = new BehaviorTreeAgent('bt_test', { fleeDistance: 10.0, alertDistance: 25.0 });
        const fearAgent = new AffectiveAgent('fear_test', { neuroticism: 0.5, resilience: 0.5 });

        let fearOscillations = 0;
        let fearPrevIntent = null;
        const fearHistory = [];

        for (let t = 0; t < 100; t++) {
            // Distance fluctuates rapidly between 9.4m and 10.6m
            const distance = 10.0 + (Math.sin(t * 2.0) * 0.7);
            const obs = { threats: [{ id: 'boss', type: 'PREDATOR', distance, intensity: 0.8 }] };

            fsm.tick(obs);
            bt.tick(obs);

            const fearOut = fearAgent.tick(0.016, obs);
            const intent = fearOut.action_intent.type;
            if (fearHistory.length >= 2 && fearHistory[fearHistory.length - 2] === intent && intent !== fearPrevIntent) {
                fearOscillations++;
            }
            fearPrevIntent = intent;
            fearHistory.push(intent);
        }

        // FSM and BT flip-flop repeatedly
        expect(fsm.oscillationCount).toBeGreaterThan(5);
        expect(bt.oscillationCount).toBeGreaterThan(5);

        // Fear AI affective hysteresis completely suppresses high-frequency boundary chatter
        expect(fearOscillations).toBeLessThanOrEqual(1);
    });

    it('2. Post-threat recovery: FSM/BT drop instantly, while Fear AI exhibits realistic psychological decay', () => {
        const fsm = new FiniteStateMachineAgent('fsm_rec');
        const bt = new BehaviorTreeAgent('bt_rec');
        const fearAgent = new AffectiveAgent('fear_rec', { neuroticism: 0.5, resilience: 0.5 });

        // Phase 1: High terror ambush
        for (let t = 0; t < 15; t++) {
            const ambush = { threats: [{ id: 'ambush', distance: 1.5, intensity: 1.0 }] };
            fsm.tick(ambush);
            bt.tick(ambush);
            fearAgent.tick(0.016, ambush);
        }

        // Phase 2: Threat disappears
        const fsmAfter1Tick = fsm.tick({ threats: [] });
        const btAfter1Tick = bt.tick({ threats: [] });
        const fearAfter1Tick = fearAgent.tick(0.016, { threats: [] });

        // FSM and BT drop to 0 on tick 1
        expect(fsmAfter1Tick.affective_state.fear).toBe(0.0);
        expect(btAfter1Tick.affective_state.fear).toBe(0.0);

        // Fear AI preserves elevated arousal/fear (hysteresis)
        expect(fearAfter1Tick.affective_state.raw_fear).toBeGreaterThan(0.6);

        // Fear AI takes multiple ticks to cool down
        let coolTicks = 0;
        for (let t = 0; t < 50; t++) {
            const out = fearAgent.tick(0.016, { threats: [] });
            if (out.affective_state.raw_fear > 0.1) coolTicks++;
        }
        expect(coolTicks).toBeGreaterThan(15);
    });

    it('3. Archetype Expressiveness: FSM has zero entropy across personas, Fear AI exhibits diverse intents', () => {
        const archetypes = [
            { name: 'Coward', traits: { neuroticism: 0.9, resilience: 0.1 } },
            { name: 'Stoic', traits: { neuroticism: 0.1, resilience: 0.9 } },
            { name: 'Protector', traits: { neuroticism: 0.3, resilience: 0.8, leadership: 0.9 } }
        ];

        const fsmIntents = new Set();
        const fearIntents = new Set();

        for (const arch of archetypes) {
            const fsm = new FiniteStateMachineAgent(arch.name);
            const fear = new AffectiveAgent(arch.name, arch.traits);

            for (let t = 0; t < 20; t++) {
                const obs = { threats: [{ distance: 16.0, intensity: 0.6 }] };
                fsmIntents.add(fsm.tick(obs).action_intent.type);
                fearIntents.add(fear.tick(0.016, obs).action_intent.type);
            }
        }

        // FSM produces only 1 monolithic intent for all archetypes
        expect(fsmIntents.size).toBe(1);

        // Fear AI produces multiple differentiated intents across archetypes
        expect(fearIntents.size).toBeGreaterThanOrEqual(2);
    });

    it('4. Systematic Ablation: NO_HABITUATION maintains continuous panic under harmless repetition', () => {
        const fullAgent = new AffectiveAgent('full', { neuroticism: 0.5, resilience: 0.5 });
        const ablatedAgent = new AffectiveAgent('ablated', { neuroticism: 0.5, resilience: 0.5 });
        const harness = new SubsystemAblationHarness(ablatedAgent, [ABLATION_FLAGS.NO_HABITUATION]);

        let fullFear = 0;
        let ablatedFear = 0;

        for (let t = 0; t < 30; t++) {
            const soundObs = { sounds: [{ id: 'door_slam', intensity: 0.5 }] };
            fullFear = fullAgent.tick(0.016, soundObs).affective_state.raw_fear;
            ablatedFear = harness.tick(soundObs).affective_state.raw_fear;
        }

        // Full agent habituates (desensitizes), ablated agent stays locked at high fear
        expect(fullFear).toBeLessThan(ablatedFear);
        expect(ablatedFear - fullFear).toBeGreaterThan(0.3);
    });

    it('5. Systematic Ablation: NO_IDENTITY collapses persona variance to zero', () => {
        const coward = new AffectiveAgent('coward', { neuroticism: 0.9, resilience: 0.1 });
        const stoic = new AffectiveAgent('stoic', { neuroticism: 0.1, resilience: 0.9 });

        const ablatedCoward = new SubsystemAblationHarness(new AffectiveAgent('ab_coward', { neuroticism: 0.9, resilience: 0.1 }), [ABLATION_FLAGS.NO_IDENTITY]);
        const ablatedStoic = new SubsystemAblationHarness(new AffectiveAgent('ab_stoic', { neuroticism: 0.1, resilience: 0.9 }), [ABLATION_FLAGS.NO_IDENTITY]);

        for (let t = 0; t < 15; t++) {
            const obs = { threats: [{ distance: 15.0, intensity: 0.5 }] };
            coward.tick(0.016, obs);
            stoic.tick(0.016, obs);
            ablatedCoward.tick(obs);
            ablatedStoic.tick(obs);
        }

        const naturalDiff = Math.abs(coward.currentFear - stoic.currentFear);
        const ablatedDiff = Math.abs(ablatedCoward.agent.currentFear - ablatedStoic.agent.currentFear);

        expect(naturalDiff).toBeGreaterThan(0.1);
        expect(ablatedDiff).toBe(0.0); // Completely collapsed to identical uniform behavior
    });
});
