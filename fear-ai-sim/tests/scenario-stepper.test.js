/**
 * @file scenario-stepper.test.js
 * Unit and integration tests for Frontiers A & E / Sections 124–128:
 * Interactive Scenario Stepper, Semantic Breakpoint Debugger & Dynamic Live Interventions.
 */

import {
    ScenarioStepper,
    ScenarioFuzzer,
    BREAKPOINT_TYPES,
    TIMELINE_EVENT_TYPES,
    ESCALATION_STAGES
} from '../packages/core/index.js';

describe('Frontiers A & E / Sections 124–128: Interactive Scenario Stepper & Breakpoints', () => {
    let scenario;
    let stepper;

    beforeEach(() => {
        scenario = ScenarioFuzzer.generateFuzzedScenario(54321);
        stepper = new ScenarioStepper(scenario, { keyframeInterval: 5 });
    });

    test('1. Step advancement records timeline and captures periodic keyframes', () => {
        expect(stepper.instance.currentTick).toBe(0);
        expect(stepper.keyframes.size).toBe(1); // Tick 0 keyframe

        const res = stepper.step(12);
        expect(res.stopped).toBe(false);
        expect(res.currentTick).toBe(12);
        expect(res.ticksAdvanced).toBe(12);
        expect(stepper.instance.currentTick).toBe(12);

        // Keyframes at 0, 5, 10
        expect(stepper.keyframes.has(0)).toBe(true);
        expect(stepper.keyframes.has(5)).toBe(true);
        expect(stepper.keyframes.has(10)).toBe(true);
        expect(stepper.keyframes.size).toBe(3);

        const summary = stepper.getTimelineSummary();
        expect(summary.currentTick).toBe(12);
        expect(summary.keyframesRetained).toBe(3);
    });

    test('2. Bidirectional time travel guarantees bit-exact state parity across rewinds', () => {
        stepper.step(20);
        const stateAt20 = stepper.captureState();

        // Rewind to tick 10
        const stateAt10 = stepper.rewindToTick(10);
        expect(stateAt10.tick).toBe(10);
        expect(stepper.instance.currentTick).toBe(10);

        // Rewind to tick 0
        const stateAt0 = stepper.rewindToTick(0);
        expect(stateAt0.tick).toBe(0);
        expect(stepper.instance.currentTick).toBe(0);

        // Fast-forward back to tick 20
        const stateAt20Reconstituted = stepper.rewindToTick(20);
        expect(stateAt20Reconstituted.tick).toBe(20);

        // Assert 100% bit-exact parity between original tick 20 and reconstituted tick 20
        for (const [id, agent] of Object.entries(stateAt20.agents)) {
            const reconstituted = stateAt20Reconstituted.agents[id];
            expect(reconstituted).toBeDefined();
            expect(reconstituted.fear).toBeCloseTo(agent.fear, 4);
            expect(reconstituted.arousal).toBeCloseTo(agent.arousal, 4);
            expect(reconstituted.position.x).toBeCloseTo(agent.position.x, 2);
            expect(reconstituted.position.z).toBeCloseTo(agent.position.z, 2);
        }

        // Out of bounds rewind throws
        expect(() => stepper.rewindToTick(-1)).toThrow(RangeError);
        expect(() => stepper.rewindToTick(999)).toThrow(RangeError);
    });

    test('3. Semantic breakpoints halt simulation execution at exact conditions', () => {
        // Breakpoint 1: Fear threshold - inject an acute threat event at tick 4 so an agent triggers the fear breakpoint
        scenario.timelineEvents = scenario.timelineEvents || [];
        scenario.timelineEvents.push({
            tick: 4,
            eventType: TIMELINE_EVENT_TYPES.INJECT_THREAT,
            parameters: { distance: 2.0, intensity: 0.95 }
        });
        stepper = new ScenarioStepper(scenario, { keyframeInterval: 5 });

        stepper.addBreakpoint('bp_panic', BREAKPOINT_TYPES.ON_FEAR_THRESHOLD, { threshold: 0.40 });
        const res1 = stepper.runUntilBreakpoint(30);

        expect(res1.stopped).toBe(true);
        expect(res1.reason).toBe('BREAKPOINT_TRIGGERED');
        expect(res1.firedBreakpoint.breakpoint.id).toBe('bp_panic');
        expect(res1.firedBreakpoint.fear).toBeGreaterThanOrEqual(0.40);

        const stopTick = res1.currentTick;
        expect(stopTick).toBeGreaterThan(0);
        expect(stopTick).toBeLessThanOrEqual(30);

        // Breakpoint 2: Custom predicate
        const customStepper = new ScenarioStepper(scenario);
        customStepper.addBreakpoint('bp_custom', BREAKPOINT_TYPES.CUSTOM_PREDICATE, {
            fn: (instance, tick) => tick === 7,
            description: 'Pause at tick 7'
        });

        const res2 = customStepper.runUntilBreakpoint(20);
        expect(res2.stopped).toBe(true);
        expect(res2.currentTick).toBe(7);
        expect(res2.firedBreakpoint.breakpoint.id).toBe('bp_custom');
    });

    test('4. Live dynamic interventions alter trajectory and persist in causal timeline', () => {
        stepper.step(5);
        const stateBefore = stepper.captureState();

        // Inject high acute threat at current tick
        stepper.injectLiveIntervention({
            type: TIMELINE_EVENT_TYPES.INJECT_THREAT,
            distance: 3.0,
            intensity: 0.95
        });

        // Step 1 tick forward
        stepper.step(1);
        const stateAfter = stepper.captureState();

        // Mean fear should surge due to threat
        const agentsBefore = Object.values(stateBefore.agents);
        const agentsAfter = Object.values(stateAfter.agents);
        const meanFearBefore = agentsBefore.reduce((acc, a) => acc + a.fear, 0) / agentsBefore.length;
        const meanFearAfter = agentsAfter.reduce((acc, a) => acc + a.fear, 0) / agentsAfter.length;

        expect(meanFearAfter).toBeGreaterThan(meanFearBefore);

        const summary = stepper.getTimelineSummary();
        expect(summary.liveInterventionsCount).toBe(1);
    });

    test('5. getTickDiff produces accurate differential analysis between arbitrary ticks', () => {
        stepper.step(25);

        const diff = stepper.getTickDiff(5, 20);
        expect(diff.tickA).toBe(5);
        expect(diff.tickB).toBe(20);
        expect(diff.ticksElapsed).toBe(15);
        expect(diff.agentDeltas).toBeDefined();
        expect(diff.settlementDeltas).toBeDefined();

        expect(Object.keys(diff.agentDeltas).length).toBeGreaterThan(0);
        expect(Object.keys(diff.settlementDeltas).length).toBeGreaterThan(0);

        // Out of bounds diff throws
        expect(() => stepper.getTickDiff(0, 100)).toThrow(RangeError);
        expect(() => stepper.getTickDiff(-5, 10)).toThrow(RangeError);
    });
});
