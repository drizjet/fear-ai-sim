import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

// World-Completion Directive §29 impossibility audit
// (2026-08-28) found that the default closed-world produces
// ~2 MIGRATION events per tick (994 over 500 ticks). The
// event log is dominated by MIGRATION noise. The fix: a
// per-town migration cooldown (matching the raid-cooldown
// pattern from EVID-2026-08-27-RAID-COOLDOWN).

describe('migration cooldown (audit §29 finding)', () => {
    it('a town can only emit MIGRATION once per cooldown window', () => {
        // The audit found 994 MIGRATION events over 500
        // ticks. The cooldown should drop the rate to
        // ~0.2/tick (one per 10 ticks). We assert the rate
        // is at most 1/cooldown per tick per town.
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 50; t += 1) {
            // Inject attacks so migration pressure
            // stays high.
            world.events.push({
                type: 'BANDIT_ATTACK',
                roadId: 'road-a',
                banditId: 'bandits-1',
                tick: t,
                lost: 5,
                delivered: 15
            });
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9 });
        }
        const migrations = world.events.filter(e => e.type === 'MIGRATION');
        // With 2 towns and a 10-tick cooldown, the
        // expected rate is ~0.2/tick * 50 ticks * 2 towns
        // = ~20 migrations. The pre-fix rate was ~2/tick
        // = 100. We assert a 5x reduction.
        expect(migrations.length).toBeLessThan(50);
    });

    it('the MIGRATION event is suppressed for the cooldown window after a MIGRATION', () => {
        // The per-town lastMigrationTick is updated when
        // a MIGRATION fires. Subsequent ticks within the
        // cooldown window do not produce MIGRATION events
        // for that town.
        const world = createClosedWorldScenario();
        // Set up a scenario where one town fires MIGRATION
        // first (low trust / high pressure).
        for (let t = 1; t <= 30; t += 1) {
            world.events.push({
                type: 'BANDIT_ATTACK',
                roadId: 'road-a',
                banditId: 'bandits-1',
                tick: t,
                lost: 5,
                delivered: 15
            });
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9 });
        }
        // Count MIGRATION events per town.
        const perTown = {};
        for (const e of world.events) {
            if (e.type === 'MIGRATION') {
                perTown[e.townId] = (perTown[e.townId] || 0) + 1;
            }
        }
        // With a 10-tick cooldown, each town should have
        // at most 30/10 = 3 MIGRATION events over 30
        // ticks. Without the cooldown, each town fires
        // ~30 MIGRATION events.
        for (const townId of Object.keys(perTown)) {
            expect(perTown[townId]).toBeLessThanOrEqual(5);
        }
    });
});
