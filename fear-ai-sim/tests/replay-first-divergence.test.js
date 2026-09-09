/**
 * tests/replay-first-divergence.test.js
 *
 * Sections 81-82 / Front E: Replay Workbench & First-Divergence Debugger Verification.
 *
 * Asserts:
 * 1. Identical replays compare with diverged: false and 0 mismatches.
 * 2. Pinpoints exact tick and entity property when affective state diverges.
 * 3. Pinpoints exact tick when faction bilateral tension diverges.
 * 4. Pinpoints group state divergence.
 * 5. Accurately detects truncation or stream length disparities.
 * 6. Tolerates floating point precision within configured epsilon tolerance.
 */

import { describe, it, expect } from '@jest/globals';
import { ReplayWorkbench } from '../packages/core/src/ReplayWorkbench.js';

describe('Sections 81-82 / Front E: Replay Workbench & First-Divergence Debugger', () => {
    it('1. Identical replay histories return diverged: false with zero divergence point', () => {
        const replayA = {
            seed: 12345,
            ticks: [
                {
                    tick: 0,
                    entities: [{ id: 'agent_1', fear: 0.10, band: 'CALM', intent: 'WANDER' }],
                    factions: { Settlers: { tension: 0.10 } }
                },
                {
                    tick: 1,
                    entities: [{ id: 'agent_1', fear: 0.35, band: 'ALERT', intent: 'INVESTIGATE' }],
                    factions: { Settlers: { tension: 0.15 } }
                }
            ]
        };

        const replayB = JSON.parse(JSON.stringify(replayA));

        const res = ReplayWorkbench.compareReplays(replayA, replayB);
        expect(res.diverged).toBe(false);
        expect(res.firstDivergence).toBeNull();
        expect(res.totalTicksCompared).toBe(2);
        expect(res.summary).toContain('identical');
    });

    it('2. Pinpoints exact tick, entity, and property where fear diverges', () => {
        const replayA = {
            ticks: [
                { tick: 0, entities: [{ id: 'scout_1', fear: 0.10, band: 'CALM' }] },
                { tick: 1, entities: [{ id: 'scout_1', fear: 0.20, band: 'CALM' }] },
                { tick: 2, entities: [{ id: 'scout_1', fear: 0.50, band: 'ALERT' }] }
            ]
        };

        const replayB = {
            ticks: [
                { tick: 0, entities: [{ id: 'scout_1', fear: 0.10, band: 'CALM' }] },
                { tick: 1, entities: [{ id: 'scout_1', fear: 0.20, band: 'CALM' }] },
                { tick: 2, entities: [{ id: 'scout_1', fear: 0.85, band: 'PANIC' }] } // Diverged here at tick 2
            ]
        };

        const res = ReplayWorkbench.compareReplays(replayA, replayB);
        expect(res.diverged).toBe(true);
        expect(res.firstDivergence).toBeDefined();
        expect(res.firstDivergence.tick).toBe(2);
        expect(res.firstDivergence.subsystem).toBe('entities');
        expect(res.firstDivergence.targetId).toBe('scout_1');
        expect(res.firstDivergence.property).toBe('fear');
        expect(res.firstDivergence.valueA).toBe(0.50);
        expect(res.firstDivergence.valueB).toBe(0.85);
        expect(res.firstDivergence.previousTickConsistent).toBe(true);
    });

    it('3. Pinpoints divergence in faction escalation state', () => {
        const replayA = {
            ticks: [
                { tick: 0, factions: { RedClan: { stage: 'OBSERVE', tension: 0.3 } } },
                { tick: 1, factions: { RedClan: { stage: 'AVOID', tension: 0.4 } } }
            ]
        };

        const replayB = {
            ticks: [
                { tick: 0, factions: { RedClan: { stage: 'OBSERVE', tension: 0.3 } } },
                { tick: 1, factions: { RedClan: { stage: 'SKIRMISH', tension: 0.8 } } }
            ]
        };

        const res = ReplayWorkbench.compareReplays(replayA, replayB);
        expect(res.diverged).toBe(true);
        expect(res.firstDivergence.tick).toBe(1);
        expect(res.firstDivergence.subsystem).toBe('factions');
        expect(res.firstDivergence.targetId).toBe('RedClan');
    });

    it('4. Pinpoints truncated or missing ticks stream', () => {
        const replayA = {
            ticks: [
                { tick: 0, entities: [{ id: 'npc_1', fear: 0.1 }] },
                { tick: 1, entities: [{ id: 'npc_1', fear: 0.2 }] },
                { tick: 2, entities: [{ id: 'npc_1', fear: 0.3 }] }
            ]
        };

        const replayB = {
            ticks: [
                { tick: 0, entities: [{ id: 'npc_1', fear: 0.1 }] },
                { tick: 1, entities: [{ id: 'npc_1', fear: 0.2 }] }
            ]
        };

        const res = ReplayWorkbench.compareReplays(replayA, replayB);
        expect(res.diverged).toBe(true);
        expect(res.firstDivergence.subsystem).toBe('STREAM');
        expect(res.firstDivergence.property).toBe('length');
        expect(res.firstDivergence.valueA).toBe(3);
        expect(res.firstDivergence.valueB).toBe(2);
    });

    it('5. Tolerates floating point precision within configurable tolerance', () => {
        const replayA = {
            ticks: [{ tick: 0, entities: [{ id: 'scout_1', fear: 0.5000001 }] }]
        };

        const replayB = {
            ticks: [{ tick: 0, entities: [{ id: 'scout_1', fear: 0.5000009 }] }]
        };

        // Difference is 8e-7, which is < default tolerance 1e-5
        const res = ReplayWorkbench.compareReplays(replayA, replayB, { floatTolerance: 1e-5 });
        expect(res.diverged).toBe(false);
    });
    it('6. Volatile label fields never count as divergence; real changes still caught', () => {
        const frame = (grievance, ts) => ({
            tick: 0,
            factions: { highguard: { grievance, recordedAt: ts } },
            groups: {}
        });
        const A = { ticks: [frame(0.5, 100)] };
        const B = { ticks: [frame(0.5, 999)] };
        // Timestamp-only difference false-diverges without exclusions.
        expect(ReplayWorkbench.compareReplays(A, B).diverged).toBe(true);
        expect(ReplayWorkbench.compareReplays(A, B, { volatileKeys: ['recordedAt'] }).diverged).toBe(false);
        // A genuine behavioral change is still caught with exclusions active.
        const C = { ticks: [frame(0.9, 100)] };
        const res = ReplayWorkbench.compareReplays(A, C, { volatileKeys: ['recordedAt'] });
        expect(res.diverged).toBe(true);
        expect(res.firstDivergence.property).toBe('grievance');
    });
});
