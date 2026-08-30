// Constitution §13 / §41-§42 / §45 / §530.
//
// The audit: "The mode does not appear to participate in that
// equation. That means a raiding warband, trader, hunter,
// refugee, scout and retreating group can potentially evaluate
// destinations using essentially the same motivation. The enum
// exists, but much of its semantic meaning does not yet exist."
//
// "ROAMING_MODE must affect behavior. Do not retain decorative
// enums. Define a small mode profile layer. ... If changing
// mode cannot change the ranking in meaningful scenarios, mode
// is not yet implemented."
//
// And the units problem: "The current utility
//   resourceValue * need - distance * 2 - danger * 1.5
// must not combine ambiguous raw units. Create explicit
// normalized considerations:
//   resourceScore ∈ [0,1]
//   needPressure ∈ [0,1]
//   distanceScore ∈ [0,1]
//   dangerScore ∈ [0,1]
//   opportunityScore ∈ [0,1]
//   relationshipScore ∈ [0,1]
//   informationConfidence ∈ [0,1]"

import { createRoamingGroup, chooseRoamingDestination, destinationUtility, ROAMING_MODE } from '../roaming.js';

const deterministicRng = (seed) => () => {
    let s = seed;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
};

describe('roaming mode profiles (Constitution §13 / §41-§42 / §45 / §530)', () => {
    it('a FORAGE group ranks destinations by resource availability', () => {
        // FORAGE: high resourceScore, low distanceCost. A
        // destination with high resource and short distance
        // wins. We use a small distanceRange so the distance
        // term has a meaningful normalized effect (the audit's
        // units problem: with a large distanceRange, 0.9
        // normalizes to 0.009 and is dwarfed by resource).
        const group = createRoamingGroup({
            id: 'g1', mode: ROAMING_MODE.FORAGE, needs: { food: 0.8 },
            distanceRange: 1,
            beliefs: {
                'near-rich':  { resourceValue: 0.9, distance: 0.1, danger: 0.5 },
                'far-richer': { resourceValue: 0.95, distance: 0.9, danger: 0.5 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['near-rich', 'far-richer'],
            rng: deterministicRng(42)
        });
        expect(chosen).toBe('near-rich');
    });

    it('a RAID group prefers loot opportunity over resource, and rejects targets it cannot reach safely', () => {
        // RAID: high lootOpportunity, high targetVulnerability,
        // moderate retaliationRisk, escape-route feasibility.
        // The destination with low retaliation risk wins.
        const group = createRoamingGroup({
            id: 'g1', mode: ROAMING_MODE.RAID, needs: { food: 0.3 },
            beliefs: {
                'safe-target':   { resourceValue: 0.3, lootOpportunity: 0.7, danger: 0.1, retaliationRisk: 0.1 },
                'deadly-target': { resourceValue: 0.3, lootOpportunity: 0.9, danger: 0.2, retaliationRisk: 0.95 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['safe-target', 'deadly-target'],
            rng: deterministicRng(42)
        });
        // The deadlier target has higher loot but the
        // retaliation risk makes it effectively unreachable.
        expect(chosen).toBe('safe-target');
    });

    it('a RETREAT group prioritizes safety even when food is critical', () => {
        // RETREAT: safety dominates over resource. A starving
        // group that is being attacked prefers a safe haven over
        // a food-rich but dangerous destination.
        const group = createRoamingGroup({
            id: 'g1', mode: ROAMING_MODE.RETREAT, needs: { food: 0.95 },
            beliefs: {
                'safe-haven':  { resourceValue: 0.1, distance: 0.3, danger: 0.05 },
                'food-rich':   { resourceValue: 0.99, distance: 0.2, danger: 0.85 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['safe-haven', 'food-rich'],
            rng: deterministicRng(42)
        });
        expect(chosen).toBe('safe-haven');
    });

    it('a TRADE group considers route security, not just resource', () => {
        // TRADE: high relationship/trust, high route-security
        // sensitivity. A merchant that depends on trade routes
        // values a safe but resource-poor route.
        const group = createRoamingGroup({
            id: 'g1', mode: ROAMING_MODE.TRADE, needs: { food: 0.5 },
            beliefs: {
                'safe-route': { resourceValue: 0.3, distance: 0.4, danger: 0.05, routeSecurity: 0.95 },
                'rich-route': { resourceValue: 0.9, distance: 0.3, danger: 0.5, routeSecurity: 0.2 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['safe-route', 'rich-route'],
            rng: deterministicRng(42)
        });
        expect(chosen).toBe('safe-route');
    });

    it('a SCOUT group values information-rich destinations over resource-rich ones', () => {
        // SCOUT: informationGain becomes a positive utility term.
        // A destination with high informationConfidence and
        // interesting "uncertainty" wins over a resource-rich
        // but known destination.
        const group = createRoamingGroup({
            id: 'g1', mode: ROAMING_MODE.SCOUT, needs: { food: 0.3 },
            beliefs: {
                'known-rich':   { resourceValue: 0.9, distance: 0.2, informationConfidence: 0.95 },
                'unknown-rich': { resourceValue: 0.5, distance: 0.3, informationConfidence: 0.2 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['known-rich', 'unknown-rich'],
            rng: deterministicRng(42)
        });
        // The scout prefers the unknown (high information gain)
        // over the known-rich.
        expect(chosen).toBe('unknown-rich');
    });

    it('a REST group has a strong preference to remain in place', () => {
        // REST: strong preference to remain. The group should
        // STAY even when there is a better destination
        // (because resting is the goal).
        const group = createRoamingGroup({
            id: 'g1',
            mode: ROAMING_MODE.REST,
            currentLocation: 'home',
            needs: { food: 0.2 },
            beliefs: {
                'home':      { resourceValue: 0.5, distance: 0.0, danger: 0.0 },
                'elsewhere': { resourceValue: 0.99, distance: 0.1, danger: 0.0 }
            }
        });
        const chosen = chooseRoamingDestination(group, {
            candidates: ['elsewhere'],
            rng: deterministicRng(42)
        });
        // Per PHASE 9, the return value is the location name.
        // The group stays at 'home' because REST mode has a
        // strong rest bonus and the alternative is only
        // marginally better.
        expect(chosen).toBe('home');
    });

    it('raw route distance of 100 cannot overwhelm other normalized considerations', () => {
        // The audit: "If distance isn't normalized and
        // represents actual road length like 5, 9, 20, etc.,
        // then distance completely crushes everything else." The
        // fix: distance is normalized through distanceRange
        // before entering the utility function. This test
        // proves the *scale-invariance* property: computing
        // the same destination utilities at two different
        // distance scales (5 vs 100) yields identical results.
        // The relative ordering between destinations is
        // determined by the *ratios* of the inputs, not their
        // absolute magnitudes.
        // Scale 1: raw distance 5 and 3 (distanceRange=5).
        const group1 = {
            mode: ROAMING_MODE.FORAGE,
            needs: { food: 0.7 },
            distanceRange: 5
        };
        const u1a = destinationUtility('a', { resourceValue: 0.7, distance: 5, danger: 0.2 }, group1);
        const u1b = destinationUtility('b', { resourceValue: 0.5, distance: 3, danger: 0.2 }, group1);
        // Scale 2: raw distance 100 and 60 (distanceRange=100).
        // Same normalized ratios: 5/5=1.0 vs 3/5=0.6;
        // 100/100=1.0 vs 60/100=0.6.
        const group2 = {
            mode: ROAMING_MODE.FORAGE,
            needs: { food: 0.7 },
            distanceRange: 100
        };
        const u2a = destinationUtility('a', { resourceValue: 0.7, distance: 100, danger: 0.2 }, group2);
        const u2b = destinationUtility('b', { resourceValue: 0.5, distance: 60, danger: 0.2 }, group2);
        // Scale invariance: utilities are equal at both scales
        // (the same normalized inputs produce the same outputs).
        expect(u1a).toBeCloseTo(u2a, 10);
        expect(u1b).toBeCloseTo(u2b, 10);
        // And the *ordering* is preserved: if a > b at scale 1,
        // then a > b at scale 2.
        expect((u1a > u1b)).toBe((u2a > u2b));
    });
});
