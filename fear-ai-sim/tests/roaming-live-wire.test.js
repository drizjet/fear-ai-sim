import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld
} from '../closed-world.js';
import {
    createRoamingGroup,
    chooseRoamingDestination,
    ROAMING_MODE
} from '../roaming.js';

// World-Completion Directive §6: the closed-world still uses
// the binary `relocateBandit` path. The slice replaces it
// with a real `chooseRoamingDestination` so the bandit's
// movement is driven by the destination-utility model.
// The legacy event shape is preserved so the existing 867
// tests stay green.
//
// Anti-self-deception: the test must *fail* if the live-wire
// is not actually calling chooseRoamingDestination. We
// achieve this by asserting that the BANDIT_RELOCATION
// event's `reason` field is 'chooseRoamingDestination'
// (the legacy binary would say 'pressure' or similar).

describe('roaming live-wire (directive §6: make roaming real)', () => {
    it('the BANDIT_RELOCATION event reason is chooseRoamingDestination, not pressure', () => {
        // The live-wire replaces the binary relocateBandit.
        // The legacy event would have a reason derived from
        // pressure (e.g. "lootExpectation crossed threshold").
        // The new event must have reason =
        // 'chooseRoamingDestination'.
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.8 });
        }
        const relocationEvents = world.events.filter(
            ev => ev.type === 'BANDIT_RELOCATION'
        );
        expect(relocationEvents.length).toBeGreaterThan(0);
        // Every relocation event must come from
        // chooseRoamingDestination. The canonical trade
        // system emits BANDIT_RELOCATION with `reason` (string)
        // while the legacy emits it under `relocation.reason`.
        for (const ev of relocationEvents) {
            const reason = ev.relocation?.reason || ev.reason;
            expect(reason).toBe('chooseRoamingDestination');
        }
    });

    it('the bandit can be moved by a high-resource belief on another road', () => {
        // Scenario differentiation (directive §19): a
        // bandit with a strong belief that road-c is
        // profitable should move there (when the softmax
        // isn't rng-stuck on STAY). We use a high
        // temperature to make the decision less rng-sensitive.
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        // Manually set a very strong belief on road-c.
        // (This simulates the bandit having scouted
        // road-c.) We can't easily inject into the
        // live-wire's belief map from outside, so we use
        // a direct test of the underlying decision.
        const beliefs = {
            'road-a': { resourceValue: 0.1, distance: 0, danger: 0.5, informationConfidence: 0.9, observedTick: 0 },
            'road-b': { resourceValue: 0.1, distance: 5, danger: 0.5, informationConfidence: 0.9, observedTick: 0 },
            'road-c': { resourceValue: 0.9, distance: 1, danger: 0.1, informationConfidence: 0.9, observedTick: 0 }
        };
        const group = createRoamingGroup({
            id: 'test-bandit',
            currentLocation: 'road-a',
            mode: ROAMING_MODE.RAID,
            needs: { loot: 0.9 },
            beliefs,
            explorationTemperature: 0.1,
            distanceRange: 50,
            switchMargin: 0,
            rng: () => 0.5
        });
        const choice = chooseRoamingDestination(group, {
            candidates: ['road-a', 'road-b', 'road-c'],
            rng: () => 0.5
        });
        // The bandit must pick road-c (the high-resource,
        // low-danger destination).
        expect(choice).toBe('road-c');
    });

    it('the closed-world tick produces a BANDIT_RELOCATION event with the same legacy shape', () => {
        // Backward compat: the existing tests assert that
        // world.events contains a BANDIT_RELOCATION event
        // with the legacy shape.
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.8 });
        }
        const relocationEvents = world.events.filter(
            ev => ev.type === 'BANDIT_RELOCATION'
        );
        expect(relocationEvents.length).toBeGreaterThan(0);
        const first = relocationEvents[0];
        // EVID-2026-08-29-CANONICAL-RELOCATION-SHAPE: the
        // canonical trade system emits BANDIT_RELOCATION
        // with the canonical shape (from, to, topPayoff,
        // currentPayoff, reason, detail) AND a legacy
        // `relocation: { reason }` for test compatibility.
        // Accept either shape.
        expect(first.from).toBeDefined();
        expect(first.to).toBeDefined();
        expect(first.reason).toBe('chooseRoamingDestination');
    });

    it('two runs with the same seed produce the same relocation sequence', () => {
        // Determinism contract: §121.
        const w1 = createClosedWorldScenario();
        const w2 = createClosedWorldScenario();
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(w1, { tick: t, perceivedDanger: 0.8 });
            tickClosedWorld(w2, { tick: t, perceivedDanger: 0.8 });
        }
        const r1 = w1.events
            .filter(ev => ev.type === 'BANDIT_RELOCATION')
            .map(ev => ev.relocation?.to);
        const r2 = w2.events
            .filter(ev => ev.type === 'BANDIT_RELOCATION')
            .map(ev => ev.relocation?.to);
        expect(r1).toEqual(r2);
    });
});
