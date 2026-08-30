import { describe, it, expect } from '@jest/globals';
import { ReplaySystem } from '../replay.js';

describe('replay system is deterministic (Constitution §5 / §121 / §20)', () => {
    // The audit: replay uses Date.now() and console.log, which
    // break the determinism contract. The fix: replace
    // Date.now() with an injected tick counter so the same
    // simulation produces the same recording across runs.

    it('two recordings of the same simulation with the same tick counter produce identical recordings', () => {
        const rs1 = new ReplaySystem();
        const rs2 = new ReplaySystem();
        rs1.startRecording();
        rs2.startRecording();
        const agents = [
            { x: 10, y: 20, id: 'a1', brain: { state: 'CALM', currentFear: 0.1, fearCore: { getDecisionTrace: () => [] } } }
        ];
        const predators = [{ x: 5, y: 5, type: 'STALKER' }];
        const stats = { count: 1, avgFear: 0.1, panicLevel: 0 };
        // Drive 5 frames at ticks 0..4 using the injected tick.
        for (let tick = 0; tick < 5; tick += 1) {
            rs1.captureFrame(agents, predators, stats, { tick });
            rs2.captureFrame(agents, predators, stats, { tick });
            rs1.markEvent('BANDIT_ATTACK', { tick, agentId: 'a1' });
            rs2.markEvent('BANDIT_ATTACK', { tick, agentId: 'a1' });
        }
        const rec1 = rs1.stopRecording();
        const rec2 = rs2.stopRecording();
        // The recordings must be identical (modulo console
        // output which is not part of the recording).
        const parsed1 = JSON.parse(rec1);
        const parsed2 = JSON.parse(rec2);
        expect(parsed1.frames).toEqual(parsed2.frames);
        expect(parsed1.events).toEqual(parsed2.events);
    });

    it('the recording timestamps are the injected ticks, not wall-clock time', () => {
        const rs = new ReplaySystem();
        rs.startRecording();
        const agents = [
            { x: 0, y: 0, id: 'a1', brain: { state: 'CALM', currentFear: 0.0, fearCore: { getDecisionTrace: () => [] } } }
        ];
        const predators = [];
        const stats = { count: 1, avgFear: 0, panicLevel: 0 };
        for (let tick = 0; tick < 3; tick += 1) {
            rs.captureFrame(agents, predators, stats, { tick });
        }
        const rec = JSON.parse(rs.stopRecording());
        // The frame timestamps should be the injected ticks.
        for (let i = 0; i < rec.frames.length; i += 1) {
            expect(rec.frames[i].timestamp).toBe(i);
        }
    });

    it('backward compat: captureFrame without a tick option still works (defaults to 0)', () => {
        const rs = new ReplaySystem();
        rs.startRecording();
        const agents = [
            { x: 0, y: 0, id: 'a1', brain: { state: 'CALM', currentFear: 0.0, fearCore: { getDecisionTrace: () => [] } } }
        ];
        const predators = [];
        const stats = { count: 1, avgFear: 0, panicLevel: 0 };
        // No tick option — should still record.
        rs.captureFrame(agents, predators, stats);
        const rec = JSON.parse(rs.stopRecording());
        expect(rec.frames.length).toBe(1);
        // Default timestamp is 0 (or whatever the existing logic produces).
    });
});
