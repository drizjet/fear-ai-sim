// Constitution §45 (Exploration vs Exploitation) / §530
// (FIRST TRUE ROAMING FACTION).
//
// The audit: "Add route/destination commitment. Do not allow a
// faction to reverse strategic destination every tick because
// utilities differ by epsilon. ... switch when
// newUtility > currentUtility + switchMargin."
//
// "Create a scenario where two destinations oscillate slightly
// in utility. Verify the group does not produce
// A → B → A → B → A → B unless the environmental change is
// large enough to justify it."

import { createRoamingGroup, chooseRoamingDestination, ROAMING_MODE } from '../roaming.js';

const deterministicRng = (seed) => () => {
    let s = seed;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
};

describe('roaming decision inertia (Constitution §45 / §530)', () => {
    it('a faction does not switch destinations when utilities are within the switch margin', () => {
        // The audit's anti-thrashing property: if two
        // destinations differ in utility by less than the
        // switch margin, the faction stays at its current
        // destination. This is the §45 "inertia" property.
        // The faction starts at A. B is slightly better but
        // within the switch margin.
        const group = createRoamingGroup({
            id: 'g1',
            currentLocation: 'A',
            mode: ROAMING_MODE.SEASONAL_MIGRATION,
            needs: { food: 0.5 },
            distanceRange: 1,
            switchMargin: 0.1,
            beliefs: {
                'A': { resourceValue: 0.5, distance: 0.2, danger: 0.2 },
                'B': { resourceValue: 0.55, distance: 0.2, danger: 0.2 }
            }
        });
        // The choice function must consult the current
        // location's utility and refuse to switch if the
        // new utility is within the margin.
        const chosen = chooseRoamingDestination(group, {
            candidates: ['B'],
            rng: deterministicRng(42)
        });
        // The faction is at A. B is only marginally better
        // (within the 0.1 margin). The function returns the
        // current location (A) because the choice is to remain.
        // Per PHASE 9, the return value is the location name,
        // not the literal string 'STAY'.
        expect(chosen).toBe('A');
    });

    it('a faction does switch when the new utility exceeds the current utility by more than the margin', () => {
        // The complement: when the new destination is
        // significantly better, the faction does switch.
        const group = createRoamingGroup({
            id: 'g1',
            currentLocation: 'A',
            mode: ROAMING_MODE.SEASONAL_MIGRATION,
            needs: { food: 0.5 },
            distanceRange: 1,
            switchMargin: 0.05,
            beliefs: {
                'A': { resourceValue: 0.5, distance: 0.2, danger: 0.2 },
                'B': { resourceValue: 0.9, distance: 0.2, danger: 0.2 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['B'],
            rng: deterministicRng(42)
        });
        // B is much better than A. The faction should switch.
        expect(chosen).toBe('B');
    });

    it('a faction does not oscillate A → B → A → B under small utility oscillations', () => {
        // The audit: "Create a scenario where two
        // destinations oscillate slightly in utility. Verify
        // the group does not produce A → B → A → B → A → B
        // unless the environmental change is large enough to
        // justify it."
        // We simulate 10 ticks. The "true" utility of each
        // destination oscillates by ±0.02 per tick (well
        // within the switch margin). The faction should pick
        // one destination and stay.
        let trueA = 0.5;
        let trueB = 0.5;
        const group = createRoamingGroup({
            id: 'g1',
            currentLocation: 'A',
            mode: ROAMING_MODE.SEASONAL_MIGRATION,
            needs: { food: 0.5 },
            distanceRange: 1,
            switchMargin: 0.1
        });
        const history = [];
        for (let tick = 0; tick < 10; tick += 1) {
            // The true utility oscillates by ±0.02 per tick.
            trueA += 0.02 * (tick % 2 === 0 ? 1 : -1);
            trueB += 0.02 * (tick % 2 === 0 ? -1 : 1);
            group.beliefs = {
                'A': { resourceValue: trueA, distance: 0.2, danger: 0.2 },
                'B': { resourceValue: trueB, distance: 0.2, danger: 0.2 }
            };
            // The current location must be the choice from
            // the previous tick (or the initial location for
            // tick 0).
            const choice = chooseRoamingDestination(group, {
                candidates: ['A', 'B'],
                rng: deterministicRng(tick)
            });
            history.push(choice);
            // If the faction chose a different destination,
            // update the current location.
            if (choice !== 'STAY') group.currentLocation = choice;
        }
        // The faction must not have flipped more than once.
        // The total number of switches is at most 1 (the
        // initial position + at most one switch when the
        // difference exceeds the margin).
        let switches = 0;
        for (let i = 1; i < history.length; i += 1) {
            if (history[i] !== history[i - 1] && history[i] !== 'STAY') switches += 1;
        }
        expect(switches).toBeLessThanOrEqual(1);
    });
});
