// Per-faction raid cooldown regression tests.
// The long-horizon audit found that without a cooldown, factions
// oscillated `res=0 ↔ res=1, dec=RAID ↔ HOLD` every other tick —
// 100 raids in 200 ticks. With the cooldown, a faction that just
// raided is locked out for `raidCooldown` ticks.

import { describe, expect, it } from '@jest/globals';
import {
    createClosedWorldScenario,
    runClosedWorldForTicks,
    runClosedWorldScenario
} from '../closed-world.js';
import { tickClosedWorld } from '../closed-world.js';

describe('Per-faction raid cooldown', () => {
    it('a faction that just raided cannot raid again within the cooldown window', () => {
        const world = runClosedWorldScenario({ perceivedDanger: 0.0 });
        // Force north into RAID with high resources and high grievance.
        const north = world.factions.find(f => f.id === 'north-faction');
        north.grievance = 0.9;
        north.resources = 5;
        north.maxResources = 5;
        north.townId = 'north';
        // Tick 2: first raid.
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0, raidCooldown: 5 });
        const invasionsAfterFirst = world.events.filter(e =>
            e.type === 'INVASION' && e.factionId === 'north-faction'
        ).length;
        expect(invasionsAfterFirst).toBe(1);
        // Ticks 3-6 are within the cooldown window (gap = 1, 2, 3, 4
        // all < 5). North must NOT raid in any of these.
        for (let i = 3; i <= 6; i++) {
            tickClosedWorld(world, { tick: i, perceivedDanger: 0.0, raidCooldown: 5 });
        }
        const invasionsDuringCooldown = world.events.filter(e =>
            e.type === 'INVASION' && e.factionId === 'north-faction'
        ).length;
        // Still exactly 1: the cooldown blocks ticks 3-6.
        expect(invasionsDuringCooldown).toBe(1);
    });

    it('after the cooldown elapses, the same faction can raid again', () => {
        const world = runClosedWorldScenario({ perceivedDanger: 0.0 });
        const north = world.factions.find(f => f.id === 'north-faction');
        north.grievance = 0.9;
        north.resources = 5;
        north.maxResources = 5;
        north.townId = 'north';
        // Tick 2: first raid. Tick 8 (cooldown 5: 3, 4, 5, 6, 7 are
        // blocked; 8 is allowed).
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0, raidCooldown: 5 });
        for (let i = 3; i <= 7; i++) {
            tickClosedWorld(world, { tick: i, perceivedDanger: 0.0, raidCooldown: 5 });
        }
        tickClosedWorld(world, { tick: 8, perceivedDanger: 0.0, raidCooldown: 5 });
        const invasions = world.events.filter(e =>
            e.type === 'INVASION' && e.factionId === 'north-faction'
        ).length;
        // 2 raids: tick 2 and tick 8.
        expect(invasions).toBe(2);
    });

    it('cooldown=0 disables the throttle entirely (backward compat for one-shot scenario)', () => {
        const world = runClosedWorldScenario({ perceivedDanger: 0.0 });
        const north = world.factions.find(f => f.id === 'north-faction');
        north.grievance = 0.9;
        north.resources = 5;
        north.maxResources = 5;
        north.townId = 'north';
        for (let i = 2; i <= 4; i++) {
            tickClosedWorld(world, { tick: i, perceivedDanger: 0.0, raidCooldown: 0 });
        }
        // With cooldown=0, every tick the resource gate passes
        // and the cooldown check is `< 0` (always false), so north
        // can raid every tick.
        const invasions = world.events.filter(e =>
            e.type === 'INVASION' && e.factionId === 'north-faction'
        ).length;
        expect(invasions).toBe(3);
    });

    it('the one-shot runClosedWorldScenario is unaffected by the cooldown (single tick, no follow-up)', () => {
        // The seed runs at tick 1 and the reducer does not run
        // after. The cooldown only matters across multiple ticks.
        const world = runClosedWorldScenario({ perceivedDanger: 0.0 });
        const invasions = world.events.filter(e => e.type === 'INVASION').length;
        // South's seed raid still fires (1 INVASION event).
        expect(invasions).toBe(1);
        // And no faction has lastRaidTick set from the seed (the
        // seed's executeRetaliation is called directly, not via
        // the reducer, so the reducer's recording logic doesn't
        // run).
        for (const f of world.factions) {
            expect(f.lastRaidTick).toBe(null);
        }
    });
});
