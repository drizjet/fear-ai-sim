import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    settleAttempt,
    getWorldEvents,
} from '../closed-world.js';

// TM-HOLD-10 — operator-API scope pins.
//
// settleAttempt / stakeTerritory / advanceRoamingTravel are
// scenario-authoring tools, not per-tick autonomous behaviors: no
// live settler population exists (refugees absorb into towns), no
// live pass reads claimedRadius (territory is adjacency-only), and
// live bandits relocate via relocateBanditViaRoaming (synthesized
// beliefs, not travel-written maps).
//
// These pins are change-detectors, not behavior proofs: 50 live
// ticks must not spontaneously emit operator-action events. When
// genuine autonomy lands (settler populations, radius checks,
// travel-driven relocation), these tests are updated explicitly —
// silent scope drift is what they prevent.

describe('TM-HOLD-10 — operator actions do not fire autonomously', () => {
    it('50 live ticks emit no SETTLEMENT_FOUNDED or TERRITORY_STAKED', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        for (let t = 1; t <= 50; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const types = new Set(getWorldEvents(world).map(e => e.type));
        expect(types.has('SETTLEMENT_FOUNDED')).toBe(false);
        expect(types.has('TERRITORY_STAKED')).toBe(false);
    });

    it('the pin observes the operator channel: a founded settlement is visible', () => {
        // Scratch-verification of the pin above (not a behavior
        // claim): invoking the operator API mid-run emits the event
        // the first test asserts absent. If this fails, the pin is
        // blind, not the world frozen.
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        for (let t = 1; t <= 5; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const group = {
            id: 'scope-probe-group',
            factionId: 'south-faction',
            currentLocation: 'south',
            travelState: 'AT_LOCATION',
            beliefs: { 'eastvale': { perceivedDanger: 0.1, confidence: 0.9 } },
        };
        const faction = world.factions.find(f => f.id === 'south-faction');
        faction.resources = Math.max(faction.resources, 2);
        const result = settleAttempt(world, group, 'eastvale', { tick: 6 });
        expect(result.ok).toBe(true);
        const types = new Set(getWorldEvents(world).map(e => e.type));
        expect(types.has('SETTLEMENT_FOUNDED')).toBe(true);
    });
});
