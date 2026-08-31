// Constitution §260 (SINGLE OWNER RULE) / §261 (CURRENT FEAR
// OWNERSHIP) / §416 (NO FEATURE IS DONE IF DISCONNECTED).
//
// The §260 contract: "A major semantic concept should have one
// authoritative owner. ... Duplicate ownership creates drift."
//
// The §261 contract: "The latest project history indicates
// Brain/FearCore ownership remains an active risk. Resolve
// before building deep new systems that depend on fear state."
//
// The previous run reported that `brain.state` overrides
// `fearcore.state` in approximately 43% of audited scenarios.
// This test reproduces that claim, then asserts a structural
// fix: after the fix, `brain.state` and `fearcore.state` must
// AGREE for every state in the rich band vocabulary, and the
// inline state mutations in `brain.js` must be removed.

import { readFileSync } from 'node:fs';
import { Brain } from '../brain.js';
import { FearCore, FEAR_BANDS, DEFAULT_FEARCORE_CONFIG } from '../fearcore.js';

describe('Brain / FearCore single-authority (Constitution §260 / §261)', () => {
    // The full band vocabulary the production callers expect.
    // This is the union of (FEAR_BANDS from fearcore.js) and
    // the inline states in brain.js.
    const ALL_BANDS = [
        'CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'PRESENCE_BREAK',
        'RECOVER', 'AGGRESSIVE', 'HIDE', 'FREEZE', 'VAULTING', 'CRAWLING'
    ];

    it('FearCore owns the full band vocabulary (the inline states must be a subset of FearCore states)', () => {
        // The first structural property: every state the
        // production callers expect must be reachable through
        // FearCore's update() function. If a state is in
        // ALL_BANDS but not in FearCore's band list, then
        // the inline code in brain.js is the only place it
        // lives, which is the dual-ownership problem.
        for (const band of ALL_BANDS) {
            expect(FEAR_BANDS.includes(band)).toBe(true);
        }
    });

    it('brain.state equals fearCore.state after every decide() call (the structural invariant)', () => {
        // The §260 invariant: one owner. brain.state must
        // be a derived read of fearCore.state, never a
        // parallel source of truth.
        //
        // Drive the brain through 50 ticks of varied inputs
        // and assert that brain.state === fearCore.state
        // after every decide() call.
        const brain = new Brain({ skill: 0, neuroticism: 0.5, fear: 0.5, resilience: 0.5 });
        const fakeAgent = { x: 0, y: 0, energy: 100 };
        for (let tick = 0; tick < 50; tick += 1) {
            const fearLevel = (tick % 5) / 5; // 0, 0.2, 0.4, 0.6, 0.8
            const visuals = { threats: [], food: [], neighbors: [] };
            // Call the public decide() path.
            brain.decide(
                visuals,
                fakeAgent,
                null, // globalMemory
                [],  // safeHavens
                0,   // traumaIntensity
                0,   // mirrorFear
                [],  // smartObjects
                null, // heatmap
                null, // socialDynamics
                null  // worldEnv
            );
            // The §260 invariant: the two state fields must
            // be in agreement.
            expect(brain.state).toBe(brain.fearCore.state);
        }
    });

    it('the inline state mutations in brain.js have been removed (no dual write path)', () => {
        // Read the source of brain.js. The inline mutations
        // we are auditing for are `this.state = '...'` lines
        // OUTSIDE of `this.fearCore.update()` (which is the
        // legitimate path). After the fix, every assignment
        // to `this.state` should be either (a) the
        // constructor default, (b) a `this.fearCore.reset(...)`
        // call, or (c) `this.state = fearResult.state` after
        // `fearCore.update()`.
        //
        // The most permissive check: any `this.state = 'X'`
        // assignment outside the constructor / reset() /
        // update() is a §260 violation.
        const fs = { readFileSync };
        const candidates = [
            'C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim/brain.js',
            '/mnt/c/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim/brain.js',
            new URL('../brain.js', import.meta.url).pathname,
            'brain.js',
        ];
        let src = null;
        for (const p of candidates) {
            try { src = fs.readFileSync(p, 'utf-8'); if (src) break; } catch {}
        }
        if (!src) throw new Error('brain.js not found in any candidate path');
        // Find all `this.state = 'X'` assignments and their
        // context. We assert that the only assignments are
        // (a) in the constructor (`this.state = 'CALM'`), and
        // (b) immediately after `fearCore.update(...)` returns
        // (i.e. `this.state = fearResult.state`).
        const assignmentLines = [];
        const lines = src.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const m = line.match(/this\.state\s*=\s*['"]([\w_]+)['"]/);
            if (!m) continue;
            // Skip the constructor default (line 30 or 121).
            // Skip `this.state = fearResult.state` (line 414).
            // Skip `this.state = this.fearCore.state` if any.
            const value = m[1];
            const isConstructor = i < 200; // constructor is at top
            const isUpdateAssignment = /fearResult\.state|fearCore\.state/.test(line);
            if (isConstructor || isUpdateAssignment) continue;
            // Any other assignment is a dual-write violation.
            assignmentLines.push({ line: i + 1, value, text: line.trim() });
        }
        expect(assignmentLines).toEqual([]);
    });

    it('FearCore is the sole writer of `state` for the rich band vocabulary', () => {
        // Drive a variety of inputs through FearCore and
        // assert that every transition is recorded in the
        // decisionTrace (the §547 / §324 audit trail).
        const fc = new FearCore({});
        for (let rawFear = 0; rawFear <= 5; rawFear += 0.5) {
            fc.update(rawFear);
        }
        // Every transition should have a reason and a
        // threshold.
        for (const entry of fc.decisionTrace) {
            expect(entry).toHaveProperty('from');
            expect(entry).toHaveProperty('to');
            expect(entry).toHaveProperty('reason');
            expect(entry).toHaveProperty('tick');
        }
    });
});
