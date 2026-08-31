import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

// Smoke test (V8 corrective checkpoint, 2026-08-31):
//
// The original migration-event.test.js paired this with a
// count-vs-latency oracle that conflated three behaviourally
// distinct contracts (MIGRATION-INCIDENCE,
// MIGRATION-LATENCY, MIGRATION-COOLDOWN) and used the
// canonical scenario as its "low-pressure" control. The
// canonical scenario still produces emergent bandit
// attacks through its merchant-bandit encounter chain, so
// the control was *not* low-pressure; the §29
// MIGRATION_COOLDOWN (10 ticks) further saturates fixed-
// window counts. The count oracle could therefore not
// distinguish sustained pressure from a peaceful world at
// saturation.
//
// The corrected contracts live in
// tests/migration-pressure-contracts.test.js, each with a
// *genuinely controlled* single-town fixture (no bandits,
// no merchants). This file retains only the minimum
// emission smoke test: at least one MIGRATION event is
// produced by the reducer under sustained pressure. The
// per-tick cadence, eligibility-conditioned incidence, and
// time-to-first-migration are owned by the contracts
// suite.

describe('MIGRATION event emission (smoke test for §164 / §213 reducer wiring)', () => {
    it('after sustained attacks and chronic shortage, the reducer emits at least one MIGRATION event', () => {
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t++) {
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.8 });
        }
        const migrationEvents = world.events.filter(ev => ev.type === 'MIGRATION');
        expect(migrationEvents.length).toBeGreaterThan(0);
    });
});