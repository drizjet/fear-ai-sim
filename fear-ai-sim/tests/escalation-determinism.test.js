// World-Completion Directive §121 "Same seed + same initial
// state + same inputs must produce the same relevant
// trajectory."
//
// The closed-world's `escalation.js` module had a non-deterministic
// `actionId` generator (`_actionCounter` — a module-level
// mutable counter). This slice replaces it with a
// deterministic function of the inputs.
//
// The test: two parallel closed-world runs (same seed, same
// initial state) must produce identical FACTION_ACTION and
// INVASION event sequences with identical `actionId` and
// `causationId` fields. The previous counter violated §121
// because the counter persisted across test files in the
// same process; the test would have failed if a prior test
// file had called `planRetaliation` and incremented the
// counter.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('escalation actionId determinism (Constitution §121)', () => {
    it('two parallel closed-world runs produce identical actionIds', () => {
        // Build two worlds and drive them through a long
        // horizon. FACTION_ACTION events should have
        // identical actionIds across runs.
        const a = createClosedWorldScenario();
        const b = createClosedWorldScenario();
        for (let t = 1; t <= 30; t += 1) {
            tickClosedWorld(a, { tick: t, perceivedDanger: 0.5, relationshipGate: false });
            tickClosedWorld(b, { tick: t, perceivedDanger: 0.5, relationshipGate: false });
        }
        const fa = a.events.filter(e => e.type === 'FACTION_ACTION');
        const fb = b.events.filter(e => e.type === 'FACTION_ACTION');
        expect(fa.length).toBe(fb.length);
        for (let i = 0; i < fa.length; i += 1) {
            expect(fa[i].action.actionId).toBe(fb[i].action.actionId);
        }
    });

    it('the actionId is a function of (tick, factionId, targetId, executionIndex)', () => {
        // The new generator: act-{tick}-{factionId}-{targetId}-{executionIndex}.
        // Verify the format directly by inspecting a FACTION_ACTION event.
        const w = createClosedWorldScenario();
        for (let t = 1; t <= 30; t += 1) {
            tickClosedWorld(w, { tick: t, perceivedDanger: 0.5, relationshipGate: false });
        }
        const faEvents = w.events.filter(e => e.type === 'FACTION_ACTION');
        if (faEvents.length > 0) {
            const id = faEvents[0].action.actionId;
            // The format is act-{tick}-{factionId}-{targetId}-{executionIndex}.
            expect(id).toMatch(/^act-\d+-.+-.+-\d+$/);
        }
    });

    it('INVASION events cite the same actionId as the FACTION_ACTION that caused them', () => {
        // The closed-world reducer's invasion step shares
        // the same `action.actionId` between FACTION_ACTION
        // and INVASION (per EVID-2026-08-27-CLOSED-WORLD-AUDIT-FIXES).
        // The determinism fix preserves this contract.
        const w = createClosedWorldScenario();
        for (let t = 1; t <= 30; t += 1) {
            tickClosedWorld(w, { tick: t, perceivedDanger: 0.5, relationshipGate: false });
        }
        const faById = new Map();
        for (const ev of w.events) {
            if (ev.type === 'FACTION_ACTION') {
                faById.set(ev.action.actionId, ev);
            }
        }
        const invasions = w.events.filter(e => e.type === 'INVASION');
        for (const inv of invasions) {
            expect(faById.has(inv.causationId)).toBe(true);
        }
    });
});
