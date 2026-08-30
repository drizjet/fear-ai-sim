// tests/ecology-season-system.test.js
//
// EVID-2026-08-29-ECOLOGY
//
// Per FEAR_LONG_TERM_GOAL.md §13: "Cross the next major domain
//  boundary: ecology/resources, beginning with material
//  drought/water/production/scarcity feedback into markets, trade,
//  security and territory."
//
// This file tests the ecology / passive-system vertical slice:
//   1. season advances on a fixed cadence (every N ticks);
//   2. each season modifier multiplies town.produces and
//      town.spoilageRate per good;
//   3. a SEASON_CHANGE structured event is emitted;
//   4. the canonical reducer (tickClosedWorld) drives the season
//      transition and the resulting produce modifier.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { nextSeason, getSeasonModifier, SEASONS, TICKS_PER_SEASON } from '../ecology.js';

describe('ecology / season system (EVID-2026-08-29-ECOLOGY)', () => {

    it('SEASONS is the canonical season cycle', () => {
        expect(SEASONS).toEqual(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']);
    });

    it('nextSeason cycles through SEASONS in order', () => {
        expect(nextSeason('SPRING')).toBe('SUMMER');
        expect(nextSeason('SUMMER')).toBe('AUTUMN');
        expect(nextSeason('AUTUMN')).toBe('WINTER');
        expect(nextSeason('WINTER')).toBe('SPRING');
    });

    it('getSeasonModifier returns a multiplier that reduces food in winter and raises it in summer', () => {
        const winterFood = getSeasonModifier('WINTER', 'food');
        const summerFood = getSeasonModifier('SUMMER', 'food');
        expect(winterFood).toBeLessThan(summerFood);
        expect(summerFood).toBeGreaterThanOrEqual(1.0);
    });

    it('TICKS_PER_SEASON is a positive integer', () => {
        expect(Number.isInteger(TICKS_PER_SEASON)).toBe(true);
        expect(TICKS_PER_SEASON).toBeGreaterThan(0);
    });

    it('tickClosedWorld advances the world season on the configured cadence', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        expect(world.season).toBe('SPRING');
        // Run TICKS_PER_SEASON ticks - the season should have advanced.
        for (let i = 1; i <= TICKS_PER_SEASON; i++) {
            tickClosedWorld(world, { tick: i, perceivedDanger: 0.1 });
        }
        expect(world.season).toBe('SUMMER');
    });

    it('tickClosedWorld emits a SEASON_CHANGE event when the season advances', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        let seasonEventSeen = null;
        for (let i = 1; i <= TICKS_PER_SEASON; i++) {
            tickClosedWorld(world, { tick: i, perceivedDanger: 0.1 });
        }
        seasonEventSeen = world.events.find(e => e.type === 'SEASON_CHANGE');
        expect(seasonEventSeen).toBeDefined();
        expect(seasonEventSeen.from).toBe('SPRING');
        expect(seasonEventSeen.to).toBe('SUMMER');
        expect(seasonEventSeen.tick).toBe(TICKS_PER_SEASON);
    });

    it('winter reduces food production below summer in the canonical market state', () => {
        // EVID-2026-08-29-ECOLOGY: pin ticksPerSeason to a large
        // value so no season change happens during the
        // comparison window. The test is about the per-tick
        // production modifier, not the season transition.
        const summer = createClosedWorldScenario({ season: 'SUMMER' });
        summer.ticksPerSeason = 10000;
        for (let i = 1; i <= TICKS_PER_SEASON; i++) {
            tickClosedWorld(summer, { tick: i, perceivedDanger: 0.1 });
        }
        const winter = createClosedWorldScenario({ season: 'WINTER' });
        winter.ticksPerSeason = 10000;
        for (let i = 1; i <= TICKS_PER_SEASON; i++) {
            tickClosedWorld(winter, { tick: i, perceivedDanger: 0.1 });
        }
        const summerFood = summer.towns.get('north').market.inventory.get('food') ?? 0;
        const winterFood = winter.towns.get('north').market.inventory.get('food') ?? 0;
        // Winter production should leave the town with less food than summer
        // production over the same number of ticks.
        expect(winterFood).toBeLessThan(summerFood);
    });
});
