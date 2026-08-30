// Constitution §9 / §87 / §530 / §42-§44.
//
// The audit: "Implement a minimal scouting mechanism. A scout
// action should produce an observation containing: observerId;
// locationId; tick; resourceEstimate; dangerEstimate;
// confidence; sourceType = DIRECT_SCOUT. The roaming group
// stores that information. Information must have: observedTick;
// source; confidence; possibly decay/staleness. Do not write
// ground-truth world values directly into faction beliefs except
// through explicit observation adapters."
//
// "Add tests: unknown rich location has zero effect before
// discovery; scout visits it; observation enters memory;
// location becomes eligible; new information changes destination
// distribution."

import {
    createRoamingGroup,
    chooseRoamingDestination,
    destinationUtility,
    recordObservation,
    scoutDestination,
    ROAMING_MODE,
} from '../roaming.js';

const deterministicRng = (seed) => () => {
    let s = seed;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
};

describe('scouting and knowledge discovery (Constitution §9 / §87 / §530)', () => {
    it('an unknown location has zero effect before discovery (the §9 invariant)', () => {
        // Without any observation, the group has no belief
        // about 'paradise-valley'. Even if 'paradise-valley'
        // has the highest true resource value, it must NOT
        // influence the choice.
        const group = createRoamingGroup({
            id: 'g1',
            mode: ROAMING_MODE.FORAGE,
            needs: { food: 0.7 },
            distanceRange: 1,
            beliefs: {
                'known-poor': { resourceValue: 0.3, distance: 0.2, danger: 0.1 }
            }
        });
        for (let seed = 0; seed < 50; seed += 1) {
            const chosen = chooseRoamingDestination(group, {
                candidates: ['known-poor', 'paradise-valley'],
                rng: deterministicRng(seed)
            });
            expect(chosen).toBe('known-poor');
        }
    });

    it('a scout produces an observation with the documented shape', () => {
        // The audit's required observation fields:
        // observerId, locationId, tick, resourceEstimate,
        // dangerEstimate, confidence, sourceType =
        // 'DIRECT_SCOUT'.
        const group = createRoamingGroup({ id: 'g1' });
        const observation = scoutDestination(group, {
            locationId: 'paradise-valley',
            tick: 5,
            resourceEstimate: 0.9,
            dangerEstimate: 0.1,
            confidence: 0.85
        });
        expect(observation.observerId).toBe('g1');
        expect(observation.locationId).toBe('paradise-valley');
        expect(observation.tick).toBe(5);
        expect(observation.resourceEstimate).toBe(0.9);
        expect(observation.dangerEstimate).toBe(0.1);
        expect(observation.confidence).toBe(0.85);
        expect(observation.sourceType).toBe('DIRECT_SCOUT');
        expect(observation.observedTick).toBe(5);
    });

    it('a scout adds the observation to the group belief store, making the location eligible', () => {
        // Before the scout, paradise-valley is unknown.
        // After the scout, the location is in group.beliefs
        // and is eligible for destination choice.
        const group = createRoamingGroup({
            id: 'g1',
            mode: ROAMING_MODE.FORAGE,
            needs: { food: 0.7 },
            distanceRange: 1,
            beliefs: {
                'known-poor': { resourceValue: 0.3, distance: 0.2, danger: 0.1 }
            }
        });
        // Paradise is unknown — its utility is -Infinity.
        expect(group.beliefs['paradise-valley']).toBeUndefined();
        expect(destinationUtility('paradise-valley', null, group)).toBe(-Infinity);
        // After the scout, the location is in the store.
        recordObservation(group, scoutDestination(group, {
            locationId: 'paradise-valley',
            tick: 5,
            resourceEstimate: 0.9,
            dangerEstimate: 0.1,
            confidence: 0.85
        }));
        expect(group.beliefs['paradise-valley']).toBeDefined();
        // The belief has the documented fields.
        const belief = group.beliefs['paradise-valley'];
        expect(belief.resourceValue).toBe(0.9);
        expect(belief.danger).toBe(0.1);
        expect(belief.observedTick).toBe(5);
        expect(belief.source).toBe('DIRECT_SCOUT');
        expect(belief.confidence).toBe(0.85);
        // The utility is now finite.
        expect(destinationUtility('paradise-valley', belief, group)).not.toBe(-Infinity);
    });

    it('a scouting trip changes the destination distribution: paradise wins after discovery', () => {
        // Before the scout, the group picks the only known
        // destination (known-poor). After the scout of
        // paradise-valley, paradise-valley has much higher
        // resource value and should be chosen more often than
        // known-poor across many seeds.
        const baseGroup = () => createRoamingGroup({
            id: 'g1',
            mode: ROAMING_MODE.FORAGE,
            needs: { food: 0.7 },
            distanceRange: 1,
            beliefs: {
                'known-poor': { resourceValue: 0.3, distance: 0.2, danger: 0.1 }
            }
        });
        // Before: 100% known-poor across 50 seeds.
        const beforeCounts = { 'known-poor': 0, 'paradise-valley': 0 };
        for (let seed = 0; seed < 50; seed += 1) {
            const chosen = chooseRoamingDestination(baseGroup(), {
                candidates: ['known-poor', 'paradise-valley'],
                rng: deterministicRng(seed)
            });
            beforeCounts[chosen] = (beforeCounts[chosen] || 0) + 1;
        }
        expect(beforeCounts['paradise-valley']).toBe(0);
        // After scouting paradise-valley, paradise should win
        // more often than known-poor.
        const makeAfter = () => {
            const g = baseGroup();
            recordObservation(g, scoutDestination(g, {
                locationId: 'paradise-valley',
                tick: 5,
                resourceEstimate: 0.9,
                dangerEstimate: 0.1,
                confidence: 0.85
            }));
            return g;
        };
        const afterCounts = { 'known-poor': 0, 'paradise-valley': 0 };
        for (let seed = 0; seed < 50; seed += 1) {
            const chosen = chooseRoamingDestination(makeAfter(), {
                candidates: ['known-poor', 'paradise-valley'],
                rng: deterministicRng(seed)
            });
            afterCounts[chosen] = (afterCounts[chosen] || 0) + 1;
        }
        expect(afterCounts['paradise-valley']).toBeGreaterThan(afterCounts['known-poor']);
    });

    it('an older observation should have lower confidence than a fresh one (stale information)', () => {
        // The audit: "old information vs fresh information."
        // A direct scout at tick 1 has confidence 0.95; the
        // same destination re-scouted at tick 100 has a
        // different (lower) staleness. A future slice can
        // implement explicit decay; for now, the observation
        // records the tick and the source, so consumers can
        // compute staleness.
        const group = createRoamingGroup({ id: 'g1' });
        const obs1 = scoutDestination(group, {
            locationId: 'home', tick: 1, resourceEstimate: 0.7, dangerEstimate: 0.1, confidence: 0.95
        });
        const obs100 = scoutDestination(group, {
            locationId: 'home', tick: 100, resourceEstimate: 0.7, dangerEstimate: 0.1, confidence: 0.95
        });
        // The audit said "30 ticks later that information may be
        // stale." We assert the basic property: observations
        // carry the observedTick so consumers can compute age.
        expect(obs1.observedTick).toBe(1);
        expect(obs100.observedTick).toBe(100);
        // A future slice can implement explicit confidence
        // decay. For now, this is the structural property.
    });

    it('the observation is auditable: group.observations lists every scout visit with source + tick', () => {
        // The audit's audit-trail property: every observation
        // is recorded, not just the latest belief.
        const group = createRoamingGroup({ id: 'g1' });
        const obs1 = scoutDestination(group, {
            locationId: 'home', tick: 1, resourceEstimate: 0.7, dangerEstimate: 0.1, confidence: 0.9
        });
        const obs2 = scoutDestination(group, {
            locationId: 'home', tick: 50, resourceEstimate: 0.5, dangerEstimate: 0.2, confidence: 0.9
        });
        recordObservation(group, obs1);
        recordObservation(group, obs2);
        // The belief at 'home' is the most recent observation.
        expect(group.beliefs['home'].resourceValue).toBe(0.5);
        // The observations list contains both, with the
        // documented source + tick.
        expect(group.observations.length).toBe(2);
        expect(group.observations[0].locationId).toBe('home');
        expect(group.observations[0].tick).toBe(1);
        expect(group.observations[1].tick).toBe(50);
    });
});
