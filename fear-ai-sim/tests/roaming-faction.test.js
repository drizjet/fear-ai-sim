// Constitution §38-§48 (Nomadic / Roaming Factions) / §530
// (FIRST TRUE ROAMING FACTION) / §41-§42 (Destination Utility
// and Candidates) / §13 (Decision Stochasticity) / §121
// (Determinism).
//
// The §38 contract: "Do not implement wandering as: pick random
// direction every N ticks." A roaming faction should ask:
// what do we need, what do we know, where can we get it, what
// will it cost, who controls the route, who do we fear.
//
// The §41 contract: U(d) = resourceValue + tradeValue +
// lootOpportunity + safety + kinship + strategicPosition +
// culturalValue + informationValue - distanceCost - terrainCost
// - hostileRisk - patrolRisk - crowding - diseaseRisk -
// uncertainty - treatyViolationCost.
//
// The §13 contract: "Use seeded stochastic choice over plausible
// actions. A softmax or weighted-choice model can allow: best
// action usually chosen; second-best sometimes chosen; wildly
// irrational action rarely chosen unless traits/state justify it."

import { chooseRoamingDestination, createRoamingGroup, ROAMING_MODE } from '../roaming.js';

describe('first true roaming faction (Constitution §38-§48 / §530 / §41-§13)', () => {
    // A deterministic rng that returns a sequence. The test
    // harness uses it to control the seeded stochastic choice.
    const deterministicRng = (seed) => () => {
        let s = seed;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };

    it('better known resource opportunity increases destination preference, all else equal', () => {
        // A destination with a high resource value should be
        // preferred over a destination with a low resource
        // value, ceteris paribus.
        const group = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'high-resource': { resourceValue: 0.9, distance: 0.3, danger: 0.1 },
                'low-resource':  { resourceValue: 0.2, distance: 0.3, danger: 0.1 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['high-resource', 'low-resource'],
            rng: deterministicRng(42)
        });
        expect(chosen).toBe('high-resource');
    });

    it('higher perceived danger decreases preference', () => {
        // A destination with high danger should be disfavored
        // even if its resource value is good.
        const group = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'safe-and-rich': { resourceValue: 0.8, distance: 0.3, danger: 0.1 },
                'risky-and-rich': { resourceValue: 0.8, distance: 0.3, danger: 0.9 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['safe-and-rich', 'risky-and-rich'],
            rng: deterministicRng(42)
        });
        expect(chosen).toBe('safe-and-rich');
    });

    it('greater distance decreases preference, all else equal', () => {
        // Use a small distanceRange so the distance term
        // has a meaningful normalized effect.
        const group = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            distanceRange: 1,
            beliefs: {
                'near': { resourceValue: 0.7, distance: 0.1, danger: 0.2 },
                'far':  { resourceValue: 0.7, distance: 0.9, danger: 0.2 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['near', 'far'],
            rng: deterministicRng(42)
        });
        expect(chosen).toBe('near');
    });

    it('false belief can cause a suboptimal route', () => {
        // The group holds a false belief that the "trap"
        // destination is rich. The "real-rich" destination is
        // objectively better but the group doesn't know it.
        // The group should pick the trap (per its belief) even
        // though the real-rich is the right answer.
        const group = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'trap': { resourceValue: 0.95, distance: 0.2, danger: 0.05 },
                'real-rich': null // unknown destination
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['trap', 'real-rich'],
            rng: deterministicRng(42)
        });
        // The group can only choose among destinations it
        // believes in. 'real-rich' has no belief → not
        // eligible. 'trap' wins.
        expect(chosen).toBe('trap');
    });

    it('new scout information can change destination', () => {
        // Initial: a group believes only "old-spot" is
        // available. After a scout report adds "new-spot" with
        // a better resource value, the group should switch.
        const beforeGroup = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'old-spot': { resourceValue: 0.4, distance: 0.3, danger: 0.2 }
            }
        });
        const before = chooseRoamingDestination(beforeGroup, {
            candidates: ['old-spot'],
            rng: deterministicRng(42)
        });
        expect(before).toBe('old-spot');
        // Scout report: a new destination becomes known.
        const afterGroup = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'old-spot': { resourceValue: 0.4, distance: 0.3, danger: 0.2 },
                'new-spot': { resourceValue: 0.9, distance: 0.3, danger: 0.2 }
            }
        });
        const after = chooseRoamingDestination(afterGroup, {
            candidates: ['old-spot', 'new-spot'],
            rng: deterministicRng(42)
        });
        expect(after).toBe('new-spot');
    });

    it('same seed + same state reproduces choice (determinism)', () => {
        const group = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'a': { resourceValue: 0.6, distance: 0.3, danger: 0.2 },
                'b': { resourceValue: 0.7, distance: 0.4, danger: 0.1 },
                'c': { resourceValue: 0.5, distance: 0.2, danger: 0.3 }
            }
        });
        const candidates = ['a', 'b', 'c'];
        const chosen1 = chooseRoamingDestination(group, { candidates, rng: deterministicRng(12345) });
        const chosen2 = chooseRoamingDestination(group, { candidates, rng: deterministicRng(12345) });
        expect(chosen1).toBe(chosen2);
    });

    it('different seeds generate a sensible distribution', () => {
        // Three destinations with different scores. The
        // highest-scoring destination should be chosen most
        // often across many seeds; the lowest-scoring should be
        // chosen least often.
        const baseGroup = () => createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'a-best':  { resourceValue: 0.95, distance: 0.1, danger: 0.05 },
                'b-mid':   { resourceValue: 0.5,  distance: 0.3, danger: 0.2 },
                'c-worst': { resourceValue: 0.1,  distance: 0.9, danger: 0.9 }
            }
        });
        const counts = { 'a-best': 0, 'b-mid': 0, 'c-worst': 0 };
        for (let seed = 0; seed < 200; seed += 1) {
            const chosen = chooseRoamingDestination(baseGroup(), {
                candidates: ['a-best', 'b-mid', 'c-worst'],
                rng: deterministicRng(seed)
            });
            counts[chosen] = (counts[chosen] || 0) + 1;
        }
        // The best destination should be chosen more often than
        // the worst. The mid one is somewhere in between.
        expect(counts['a-best']).toBeGreaterThan(counts['c-worst']);
    });

    it('an objectively better destination that the group does not know about cannot influence the choice', () => {
        // 'unknown-rich' is a candidate but the group has no
        // belief about it. It must not be chosen.
        const group = createRoamingGroup({
            id: 'g1', currentLocation: 'origin', needs: { food: 0.7 },
            beliefs: {
                'known-poor': { resourceValue: 0.2, distance: 0.3, danger: 0.1 }
            }
        });
        for (let seed = 0; seed < 50; seed += 1) {
            const chosen = chooseRoamingDestination(group, {
                candidates: ['known-poor', 'unknown-rich'],
                rng: deterministicRng(seed)
            });
            expect(chosen).toBe('known-poor');
        }
    });

    it('STAY is a valid candidate (the group may choose to remain in place)', () => {
        // When no destination beats the current location, the
        // group should STAY. This is the §45 exploration vs
        // exploitation property: the group does not have to
        // move if the current location is good enough. Per
        // PHASE 9, STAY is a real decision meaning "remain at
        // currentLocation" — the return value is the location
        // name, not the literal string 'STAY'.
        const group = createRoamingGroup({
            id: 'g1', currentLocation: 'home', needs: { food: 0.5 },
            beliefs: {
                'home': { resourceValue: 0.6, distance: 0.0, danger: 0.1 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: [], // no other candidates
            rng: deterministicRng(42)
        });
        expect(chosen).toBe('home');
    });
});
