// World-Scale Living-Systems Constitution §529 (WORLD CONTACT) failing tests.
// Reference: docs/PART_1_EXECUTION_PROMPT.md and BADAI_MASTER_PLAN §4-§6.
//
// This file encodes the §407 scenario:
//   "Passive faction repeatedly trespassed by hostile group. Expected:
//    does not attack instantly; eventually escalates if pressure persists;
//    de-escalates after pressure removed."
//
// It also encodes §395 (faction relationship vector MVP), §396 (escalation
// MVP with hysteresis), §23 (different attack and calm thresholds), and
// §344 (decision explanation API).
//
// These tests MUST fail before the breadth slice is implemented. They
// are the failing proof per the doctrine: "reproduce → failing regression
// test → prove it fails for the intended reason → trace root cause →
// implement minimal coherent correction."

import { describe, expect, it } from '@jest/globals';
import {
    FactionRelationshipVector,
    StanceLadder,
    evaluateStance,
    explainStance,
} from '../factionrelationship.js';

describe('faction relationship vector (Constitution §395)', () => {
    it('initializes a neutral vector with documented defaults', () => {
        const vector = new FactionRelationshipVector({ id: 'pair-a' });
        // Per §395 MVP: trust, grievance, fear, tradeDependency, territorialPressure.
        expect(vector.id).toBe('pair-a');
        expect(vector.trust).toBeCloseTo(0.5, 5);
        expect(vector.grievance).toBe(0);
        expect(vector.fear).toBe(0);
        expect(vector.tradeDependency).toBe(0);
        expect(vector.territorialPressure).toBe(0);
    });

    it('records a trespass event into territorial pressure and grievance', () => {
        const vector = new FactionRelationshipVector({ id: 'pair-a' });
        vector.recordTrespass({ severity: 0.3, tick: 1 });
        expect(vector.territorialPressure).toBeGreaterThan(0);
        expect(vector.grievance).toBeGreaterThan(0);
        // The first recorded event must leave an audit trail.
        expect(vector.events[0]).toMatchObject({ type: 'TRESPASS', tick: 1 });
    });

    it('decays territorial pressure when no new events arrive', () => {
        const vector = new FactionRelationshipVector({ id: 'pair-a', decay: 0.1 });
        vector.recordTrespass({ severity: 1.0, tick: 1 });
        const pressureAfterEvent = vector.territorialPressure;
        vector.advance(2, { newEvents: [] });
        expect(vector.territorialPressure).toBeLessThan(pressureAfterEvent);
    });
});

describe('stance ladder with hysteresis (Constitution §18, §23, §396)', () => {
    it('exposes the documented stance states in order', () => {
        expect(StanceLadder.TOLERANT).toBe(0);
        expect(StanceLadder.WATCHFUL).toBe(1);
        expect(StanceLadder.DEFENSIVE).toBe(2);
        expect(StanceLadder.HOSTILE).toBe(3);
        expect(StanceLadder.MOBILIZING).toBe(4);
        expect(StanceLadder.LIMITED_CONFLICT).toBe(5);
        expect(StanceLadder.WAR).toBe(6);
        expect(StanceLadder.CEASEFIRE).toBe(7);
    });

    it('does not enter HOSTILE on first contact with low pressure', () => {
        // §407: passive faction does not attack instantly.
        const stance = evaluateStance({
            pressure: 0.2,
            trust: 0.7,
            previous: StanceLadder.TOLERANT,
        });
        expect(stance).toBe(StanceLadder.TOLERANT);
    });

    it('escalates to WATCHFUL when pressure exceeds the watchful threshold', () => {
        const stance = evaluateStance({
            pressure: 0.5,
            trust: 0.5,
            previous: StanceLadder.TOLERANT,
        });
        expect(stance).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
    });

    it('escalates to DEFENSIVE under sustained pressure', () => {
        // A passive faction under repeated trespass should escalate.
        let current = StanceLadder.TOLERANT;
        for (let tick = 1; tick <= 20; tick += 1) {
            current = evaluateStance({
                pressure: 0.6,
                trust: 0.3,
                previous: current,
            });
        }
        expect(current).toBeGreaterThanOrEqual(StanceLadder.DEFENSIVE);
    });

    it('hysteresis: de-escalation requires pressure to drop below a lower threshold', () => {
        // §23: calmThreshold < attackThreshold.
        let current = StanceLadder.HOSTILE;
        // After pressure disappears, the stance should eventually calm.
        for (let tick = 1; tick <= 50; tick += 1) {
            current = evaluateStance({
                pressure: 0.1,
                trust: 0.5,
                previous: current,
            });
        }
        // With hysteresis, the stance should drop well below HOSTILE,
        // but the threshold for fully relaxing back to TOLERANT must
        // be lower than the threshold that drove the escalation.
        expect(current).toBeLessThan(StanceLadder.HOSTILE);
    });
});

describe('passive-faction under pressure (Constitution §407)', () => {
    it('does not attack on first harmless contact', () => {
        const state = simulateScenario({
            ticks: 1,
            trespassRate: 0, // No trespass events.
            initialTrust: 0.7,
        });
        // No conflict events of any kind should fire.
        expect(state.conflictEvents).toBe(0);
    });

    it('escalates when a hostile group repeatedly trespasses', () => {
        const state = simulateScenario({
            ticks: 30,
            trespassRate: 1, // 1 trespass per tick.
            initialTrust: 0.5,
        });
        // By tick 30 the passive faction should have escalated to
        // at least DEFENSIVE and should not still be TOLERANT.
        expect(state.stanceHistory.at(-1)).toBeGreaterThanOrEqual(StanceLadder.DEFENSIVE);
        // And some defensive response should have been recorded.
        expect(state.responseEvents.filter(event => event.type !== 'TRESPASS')).not.toHaveLength(0);
    });

    it('de-escalates after the trespassing stops', () => {
        const state = simulateScenario({
            ticks: 60,
            trespassRate: 1,
            initialTrust: 0.5,
            stopTrespassAt: 30,
        });
        // After the trespass stops, the stance should drop.
        const earlyStance = state.stanceHistory[35];
        const lateStance = state.stanceHistory.at(-1);
        expect(lateStance).toBeLessThan(earlyStance);
    });
});

describe('decision explanation API (Constitution §344)', () => {
    it('returns the top decision factors for a stance', () => {
        const explanation = explainStance({
            pressure: 0.7,
            trust: 0.3,
            tradeDependency: 0.1,
            territorialPressure: 0.6,
            fear: 0.2,
        });
        // The explanation must be a structured object that names the
        // most relevant factors in order.
        expect(explanation).toMatchObject({
            decision: expect.any(String),
            topFactors: expect.any(Array),
        });
        expect(explanation.topFactors.length).toBeGreaterThan(0);
        expect(explanation.topFactors[0]).toMatchObject({
            name: expect.any(String),
            value: expect.any(Number),
            weight: expect.any(Number),
        });
    });
});

// --------------------------------------------------------------------
// Helper: scenario runner. Exists only in this test file until the
// production module is implemented. Once `factionrelationship.js` lands,
// the implementation will move there and this helper will import it.
// --------------------------------------------------------------------

function simulateScenario({ ticks, trespassRate, initialTrust, stopTrespassAt = Infinity }) {
    // The audit's P1 #1: trust is owned by the directed map. To set the
    // initial trust, the helper seeds both perspectives via setTrustFrom.
    const vector = new FactionRelationshipVector({
        id: 'pair-under-test::pair-under-test',
        trust: initialTrust,
    });
    const state = {
        stanceHistory: [StanceLadder.TOLERANT],
        conflictEvents: 0,
        responseEvents: [],
    };

    for (let tick = 1; tick <= ticks; tick += 1) {
        if (tick <= stopTrespassAt && trespassRate > 0) {
            for (let i = 0; i < trespassRate; i += 1) {
                vector.recordTrespass({ severity: 0.5, tick });
                state.responseEvents.push({ type: 'TRESPASS', tick });
            }
        }
        const pressure = vector.territorialPressure;
        const stance = evaluateStance({
            pressure,
            trust: vector.trust,
            previous: state.stanceHistory.at(-1),
        });
        if (stance >= StanceLadder.LIMITED_CONFLICT) {
            state.conflictEvents += 1;
        }
        const observed = vector.observe(stance, tick);
        // Surface stance transitions into the response events so the
        // §407 "some defensive response should have been recorded" assertion
        // can find a non-trespass event after the first DEFENSIVE transition.
        const lastEvent = vector.events[vector.events.length - 1];
        if (lastEvent && lastEvent.type === 'STANCE_TRANSITION' && lastEvent.to >= StanceLadder.DEFENSIVE) {
            state.responseEvents.push(lastEvent);
        }
        state.stanceHistory.push(observed);
        vector.advance(tick, { newEvents: [] });
    }
    return state;
}
