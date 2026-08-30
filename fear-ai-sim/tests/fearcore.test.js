import { describe, it, expect } from '@jest/globals';
import { FearCore, FEAR_BANDS } from '../fearcore.js';
import { ReplaySystem } from '../replay.js';

describe('FearCore Part 1 contract', () => {
    it.each([
        ['CALM', 0.8, 'ALERT'],
        ['ALERT', 1.4, 'ANXIOUS'],
        ['ANXIOUS', 3.8, 'PANIC']
    ])('enters %s successor at exact threshold %s', (state, fear, expected) => {
        const core = new FearCore();
        core.reset(state);
        expect(core.update(fear).state).toBe(expected);
    });

    it.each([
        ['ALERT', 0.55, 'ALERT'],
        ['ANXIOUS', 0.8, 'ANXIOUS'],
        ['PANIC', 1.2, 'PANIC']
    ])('does not exit %s at its inclusive boundary %s', (state, fear, expected) => {
        const core = new FearCore({ panicLockTicks: 0 });
        core.reset(state);
        expect(core.update(fear).state).toBe(expected);
    });

    it.each([
        ['ALERT', 0.549999, 'CALM'],
        ['ANXIOUS', 0.799999, 'ALERT']
    ])('exits %s below its lower threshold', (state, fear, expected) => {
        const core = new FearCore();
        core.reset(state);
        expect(core.update(fear).state).toBe(expected);
    });

    it('holds PANIC for ten ticks after entering it', () => {
        const core = new FearCore();
        core.reset('ANXIOUS');
        expect(core.update(3.8).state).toBe('PANIC');
        for (let i = 0; i < 9; i++) {
            expect(core.update(0).state).toBe('PANIC');
        }
        expect(core.update(0).state).toBe('ANXIOUS');
    });

    it('does not skip intermediate bands', () => {
        const core = new FearCore();
        core.reset('CALM');
        expect(core.update(5).state).toBe('ALERT');
        expect(core.update(5).state).toBe('ANXIOUS');
        expect(core.update(5).state).toBe('PANIC');
    });

    it.each([NaN, Infinity, -Infinity, null, undefined, '3.8'])('sanitizes invalid fear input %p', input => {
        const core = new FearCore();
        const result = core.update(input);
        expect(result.fear).toBe(0);
        expect(FEAR_BANDS).toContain(result.state);
    });

    it('records a trace for an escalation with threshold and lock metadata', () => {
        const core = new FearCore();
        const result = core.update(0.8);
        const [trace] = core.getDecisionTrace();
        expect(trace).toMatchObject({
            previousState: 'CALM',
            state: 'ALERT',
            fear: 0.8,
            threshold: 0.8,
            reason: 'ENTER_ALERT',
            panicLocked: false,
            panicLockedUntil: null
        });
        expect(result).toEqual(trace);
    });

    it('records panic-lock status on every locked update', () => {
        const core = new FearCore();
        core.reset('ANXIOUS');
        core.update(3.8);
        const result = core.update(0);
        expect(result).toMatchObject({
            previousState: 'PANIC',
            state: 'PANIC',
            threshold: 1.2,
            reason: 'PANIC_LOCK',
            panicLocked: true
        });
        expect(core.getDecisionTrace()).toHaveLength(2);
    });

    it('records sanitized input and no-transition reason', () => {
        const core = new FearCore();
        const result = core.update(NaN);
        expect(result).toMatchObject({
            fear: 0,
            previousState: 'CALM',
            state: 'CALM',
            threshold: null,
            reason: 'NO_TRANSITION'
        });
    });

    it('bounds trace history and returns defensive copies', () => {
        const core = new FearCore({ maxTraceLength: 2 });
        core.update(0);
        core.update(0);
        core.update(0);
        const trace = core.getDecisionTrace();
        expect(trace).toHaveLength(2);
        trace[0].state = 'CORRUPTED';
        expect(core.getDecisionTrace()[0].state).not.toBe('CORRUPTED');
    });

    it('persists replay speed in exported metadata and restores it on load', () => {
        const replay = new ReplaySystem();
        replay.setPlaybackSpeed(4);
        replay.startRecording();
        replay.frames = [{}];
        const recording = JSON.parse(replay.stopRecording());
        expect(recording.version).toBe('1.2');
        expect(recording.playbackSpeed).toBe(4);

        const restored = new ReplaySystem();
        expect(restored.loadRecording(JSON.stringify(recording))).toBe(true);
        expect(restored.playbackSpeed).toBe(4);
    });

    it('supports replay speed selection and fractional playback', () => {
        const replay = new ReplaySystem();
        replay.frames = [{ id: 0 }, { id: 1 }, { id: 2 }];
        expect(replay.setPlaybackSpeed(0.5)).toBe(0.5);
        expect(replay.setPlaybackSpeed('2')).toBe(2);
        expect(replay.setPlaybackSpeed(0)).toBe(2);
        expect(replay.setPlaybackSpeed('invalid')).toBe(2);
        replay.setPlaybackSpeed(0.5);
        replay.isPlaying = true;
        expect(replay.getPlaybackFrame()).toEqual({ id: 0 });
        expect(replay.playbackFrame).toBe(0);
        expect(replay.getPlaybackFrame()).toEqual({ id: 0 });
        expect(replay.playbackFrame).toBe(1);
    });

    it('supports replay event markers and jumping to events', () => {
        const replay = new ReplaySystem();
        replay.frames = [{}, {}, {}];
        replay.interestingEvents = [
            { frameIndex: 1, type: 'PANIC_TRANSITION' },
            { frameIndex: 2, type: 'DEATH' }
        ];
        expect(replay.getEventMarkers()).toHaveLength(2);
        expect(replay.getEventsAtFrame(1)[0].type).toBe('PANIC_TRANSITION');
        expect(replay.jumpToEvent(1)).toEqual({});
        expect(replay.playbackFrame).toBe(2);
    });

    it('supports replay seek and frame navigation bounds', () => {
        const replay = new ReplaySystem();
        replay.frames = [{ id: 0 }, { id: 1 }, { id: 2 }];
        expect(replay.seek(1)).toEqual({ id: 1 });
        expect(replay.playbackFrame).toBe(1);
        expect(replay.seek(-10)).toEqual({ id: 0 });
        expect(replay.seek(99)).toEqual({ id: 2 });
        expect(replay.getFrame(3)).toBeNull();
    });

    it('stores FearCore traces in replay frames and retrieves them historically', () => {
        const replay = new ReplaySystem();
        replay.startRecording();
        const brain = { state: 'ALERT', currentFear: 0.8, fearCore: new FearCore() };
        brain.fearCore.update(0.8);
        replay.captureFrame([{ x: 1, y: 2, brain }], [], { count: 1, avgFear: 0.8, panicLevel: 0 });
        const trace = replay.getHistoricalTrace(0, 0);
        expect(trace).toHaveLength(1);
        expect(trace[0]).toMatchObject({ state: 'ALERT', threshold: 0.8 });
    });

    it('produces the same transition sequence for the same inputs', () => {
        const inputs = [0.8, 1.4, 3.8, 0, 0, 0, 1.2, 0.55];
        const run = () => {
            const core = new FearCore();
            return inputs.map(value => core.update(value).state);
        };
        expect(run()).toEqual(run());
    });
});
