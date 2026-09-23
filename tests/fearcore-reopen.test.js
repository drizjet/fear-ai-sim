import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { CORE_BANDS, EXTENDED_BANDS, FEAR_BANDS, FearCore, fearScale } from '../socialcore.js';
import { SocietyCore } from '../societycore.js';

// RESP-FEARCORE-REOPEN-001 (fourth re-open under RESP-SOURCE-ABSENT-RECONCILIATION-001's
// procedure) — re-opened `FearCore live transitions` and `Brain scale cleanup` rows: the
// extracted 11-band contract (`legacy/fearcore.js`) is ported with its thresholds, panic lock,
// PRESENCE_BREAK bypass, extended rules, force-fallback, snap guard and bounded decision trace,
// and `fearScale` is brain.js's §332 normalized→raw adapter verbatim. Production drives it at
// the fear seam, so a faction's fear now resolves through the band contract as well as the core
// ladder, and every real band change is a canonical FEARCORE_BAND_TRANSITION event.
// Three documented legacy quirks are preserved rather than silently fixed: the CRAWLING exit has
// an unreachable `state === 'HIDE'` disjunct; a HIDE entered from PANIC escapes before CRAWLING
// can trigger; and Phase 2.5's §260 stay rule returns before Phase 3's RECOVER branch, so a
// RECOVER band HOLDS and the legacy recovery-progress/complete branch is unreachable (all three
// recorded in the ledger disposition).
// Mutants pinned: thresholds shifted; panic lock ignored; PRESENCE_BREAK bypass removed;
// extended evaluator never consulted; machine dropped from production/serialize.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINS = [
    { file: 'fearcore.js', blob: '185494c831a6688a70aa4d143e18757a7cceb7eb', sha256: 'd5a94c963de945f054918004ecf0493789b1bccdac35879a040b6b65c10496ab' },
    { file: 'brain.js', blob: '163dfa7a184fda3e831b19ab7fa8cb65f02b3b1e', sha256: 'b35aa3952b2650492a2b9f4d025a7132c23c09a62a42835a3ed0b6fe1006d3d6' },
];

const damage = (amount, extra = {}) => ({ kind: 'PLAYER_DAMAGE', amount, source: 'bandits', ...extra });
const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const woundWorld = (seed = 77) => {
    const society = new SocietyCore({ seed });
    society.addFaction('settled', { fear: 0, threatPerception: 0 });
    return society;
};
// Drive a machine into PANIC: the core ladder steps one rung per reading (in 0.8, 1.4, 3.8).
const intoPanic = (core, context = {}) => {
    core.update(0.8, context);
    core.update(1.4, context);
    return core.update(3.8, context);
};

describe('re-opened FearCore row: extracted band contract + production wiring', () => {
    it('extracts both legacy sources byte-exact and records their upstream provenance', () => {
        const provenance = fs.readFileSync(path.join(ROOT, 'legacy', 'PROVENANCE.md'), 'utf8');
        const manifest = fs.readFileSync(path.join(ROOT, 'docs', 'SOURCE_ABSENT_RECONCILIATION.md'), 'utf8');
        for (const pin of PINS) {
            expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'legacy', pin.file))).digest('hex')).toBe(pin.sha256);
            expect(provenance).toContain(pin.blob);
            expect(provenance).toContain(pin.sha256);
            expect(manifest).not.toContain(`| ${pin.file} |`); // both entries left the manifest
        }
        // the test cited by the row was never committed upstream: it stays absent in both trees
        expect(fs.existsSync(path.join(ROOT, 'tests', 'fearcore.test.js'))).toBe(false);
    });

    it('keeps the documented band vocabulary and thresholds verbatim', () => {
        const core = new FearCore();
        expect(FEAR_BANDS).toHaveLength(11);
        expect(CORE_BANDS).toEqual(['CALM', 'ALERT', 'ANXIOUS', 'PANIC']);
        expect(EXTENDED_BANDS).toHaveLength(7);
        expect(core.config.enter).toEqual({ ALERT: 0.8, ANXIOUS: 1.4, PANIC: 3.8 });
        expect(core.config.exit).toEqual({ CALM: 0.55, ALERT: 0.8, ANXIOUS: 1.2 });
        expect(core.config.panicLockTicks).toBe(10);
        expect(core.config.extended.FREEZE).toEqual({ enterMorale: 0.4, exitProbability: 0.02 });
        expect(core.state).toBe('CALM');
        expect(core.reset('PANIC')).toBe('PANIC');
        expect(core.panicLockedUntil).toBe(10);
        expect(() => core.reset('NOPE')).toThrow(/Unknown fear band/);
    });

    it('steps the core ladder one rung per reading with asymmetric enter/exit thresholds', () => {
        const core = new FearCore();
        expect(core.update(0.7)).toMatchObject({ state: 'CALM', changed: false, reason: 'NO_TRANSITION' });
        expect(core.update(0.8)).toMatchObject({ from: 'CALM', to: 'ALERT', changed: true, reason: 'ENTER_ALERT', threshold: 0.8 });
        expect(core.update(1.3)).toMatchObject({ state: 'ALERT', changed: false }); // 1.4 not reached
        expect(core.update(1.4)).toMatchObject({ from: 'ALERT', to: 'ANXIOUS', reason: 'ENTER_ANXIOUS', threshold: 1.4 });
        expect(core.update(1.2)).toMatchObject({ state: 'ANXIOUS', changed: false }); // holds above exit .8
        expect(core.update(0.7)).toMatchObject({ from: 'ANXIOUS', to: 'ALERT', reason: 'EXIT_TO_ALERT', threshold: 0.8 });
        expect(core.update(0.5)).toMatchObject({ from: 'ALERT', to: 'CALM', reason: 'EXIT_TO_CALM', threshold: 0.55 });
        expect(core.update(3.8)).toMatchObject({ state: 'ALERT' }); // one rung per reading, never a jump
    });

    it('holds the panic lock, then releases PANIC downward above the exit threshold', () => {
        const core = new FearCore();
        expect(intoPanic(core)).toMatchObject({ from: 'ANXIOUS', to: 'PANIC', reason: 'ENTER_PANIC' });
        expect(core.panicLockedUntil).toBe(core.tick + 10);
        expect(core.update(0.5)).toMatchObject({ state: 'PANIC', changed: false, reason: 'PANIC_LOCK', panicLocked: true });
        for (let tick = core.tick; tick < core.panicLockedUntil - 1; tick += 1) core.update(0.5);
        expect(core.update(0.5)).toMatchObject({ from: 'PANIC', to: 'ANXIOUS', reason: 'EXIT_TO_ANXIOUS', panicLocked: false });
        expect(core.panicLockedUntil).toBeNull();
    });

    it('fires PRESENCE_BREAK through the lock and recovers over accumulated progress', () => {
        const core = new FearCore({ extended: { PRESENCE_BREAK: { enterStateTimer: 3 } } });
        core.update(0.8); core.update(1.4);
        expect(core.update(3.8)).toMatchObject({ to: 'PANIC' });
        // Phase 0 runs BEFORE the panic-lock guard, so sustained extreme fear breaks through
        expect(core.update(0.96)).toMatchObject({ from: 'PANIC', to: 'PRESENCE_BREAK', reason: 'EXTREME_FEAR_LOCK', threshold: 0.95 });
        expect(core.update(0.4)).toMatchObject({ from: 'PRESENCE_BREAK', to: 'RECOVER', reason: 'EXIT_PRESENCE_BREAK' });
        // Legacy quirk preserved: the §260 stay rule owns extended bands, so RECOVER holds and the
        // Phase 3 progress/complete branch below it is unreachable in the extracted contract.
        expect(core.update(0.1)).toMatchObject({ state: 'RECOVER', changed: false, reason: 'EXTENDED_BAND_STAY' });
        expect(core.update(0.1)).toMatchObject({ state: 'RECOVER', changed: false, reason: 'EXTENDED_BAND_STAY' });
        expect(core.recoveryProgress).toBe(0);
    });

    it('honors the context-driven extended bands, including their exit fallbacks', () => {
        const angry = new FearCore();
        expect(angry.update(0.1, { currentAnger: 0.7 })).toMatchObject({ to: 'AGGRESSIVE', reason: 'ANGER_OVERRIDE', threshold: 0.6 });
        expect(angry.update(0.9, { currentAnger: 0.5 })).toMatchObject({ state: 'AGGRESSIVE', reason: 'EXTENDED_BAND_STAY' });
        expect(angry.update(0.9, { currentAnger: 0.3 })).toMatchObject({ from: 'AGGRESSIVE', to: 'ALERT', reason: 'EXIT_AGGRESSIVE_TO_ALERT' });

        const hider = new FearCore();
        intoPanic(hider, { skill: 0.7, threats: 2, rng: () => 0 });
        // the panic lock runs to tick + 10, so the PANIC reading at tick 3 is followed by nine locked readings
        for (let i = 0; i < 9; i += 1) expect(hider.update(3.8, { skill: 0.7, threats: 2, rng: () => 0 })).toMatchObject({ state: 'PANIC', reason: 'PANIC_LOCK' });
        expect(hider.update(3.8, { skill: 0.7, threats: 2, rng: () => 0 })).toMatchObject({ to: 'HIDE', reason: 'HIDE_UNDER_THREAT' });
        expect(hider.update(0.5, { threats: 0 })).toMatchObject({ to: 'RECOVER', reason: 'EXIT_HIDE_NO_THREATS' });

        const frozen = new FearCore();
        intoPanic(frozen);
        for (let i = 0; i < 10; i += 1) frozen.update(3.8);
        expect(frozen.update(3.8, { morale: 0.3, rng: () => 0 })).toMatchObject({ to: 'FREEZE', reason: 'FREEZE_UNDER_PANIC' });
        expect(frozen.update(3.8, { morale: 0.3, rng: () => 0 })).toMatchObject({ to: 'RECOVER', reason: 'EXIT_FREEZE' });

        const vaulter = new FearCore();
        expect(vaulter.update(1.4, { skill: 0.6, obstacleAhead: true })).toMatchObject({ to: 'VAULTING', reason: 'OBSTACLE_VAULT' });
        expect(vaulter.update(1.4, { skill: 0.6 })).toMatchObject({ to: 'ALERT', reason: 'EXIT_VAULTING' });

        // CRAWLING is reachable from a low-fear HIDE reading (see the disposition note: a HIDE
        // entered from PANIC escapes first, so this is the path the legacy contract actually has)
        const crawler = new FearCore();
        crawler.reset('HIDE');
        expect(crawler.update(0.5, { threats: 1, obstaclePresent: true })).toMatchObject({ from: 'HIDE', to: 'CRAWLING', reason: 'CRAWL_UNDER_OBSTACLE' });
        expect(crawler.update(0.5, { threats: 1 })).toMatchObject({ from: 'CRAWLING', to: 'HIDE', reason: 'EXIT_CRAWLING' });
    });

    it('keeps the §332 scale adapter verbatim: 0..1 normalized → 0..3.8 raw', () => {
        expect(fearScale(0)).toBe(0);
        expect(fearScale(1)).toBeCloseTo(3.8, 10);
        expect(fearScale(0.5)).toBeCloseTo(1.9, 10);
        expect(fearScale(-1)).toBe(0); // clamped
        expect(fearScale(2)).toBeCloseTo(3.8, 10);
        expect(fearScale(Number.NaN)).toBe(0);
        // documented consequence: ALERT/ANXIOUS/PANIC land at 0.21/0.37/1.0 of normalized fear
        expect(fearScale(0.8 / 3.8)).toBeGreaterThanOrEqual(0.8);
        expect(fearScale(3.8 / 3.8)).toBeGreaterThanOrEqual(3.8);
    });

    it('records a bounded decision trace that callers cannot mutate', () => {
        const core = new FearCore({ maxTraceLength: 3 });
        for (let i = 0; i < 6; i += 1) core.update(i * 0.5);
        const trace = core.getDecisionTrace();
        expect(trace).toHaveLength(3);
        expect(trace[0]).toMatchObject({ state: expect.any(String), from: expect.any(String), to: expect.any(String), reason: expect.any(String) });
        trace[0].reason = 'TAMPERED';
        expect(core.getDecisionTrace()[0].reason).not.toBe('TAMPERED');
        expect(core.serialize().trace).toHaveLength(3);
    });

    it('drives production fear through the band contract as chained canonical events', () => {
        const society = woundWorld();
        society.tick({ actions: [damage(15, { factionId: 'settled' })] });
        society.tick({ actions: [damage(15, { factionId: 'settled' })] });
        const bands = eventsOf(society, 'FEARCORE_BAND_TRANSITION');
        expect(bands).toHaveLength(1);
        expect(bands[0]).toMatchObject({ factionId: 'settled', from: 'CALM', to: 'ALERT', reason: 'ENTER_ALERT', threshold: 0.8 });
        expect(bands[0].rawFear).toBeCloseTo(fearScale(0.30), 10); // the §332 scale of the faction's fear
        expect(bands[0].panicLocked).toBe(false);

        // both machines spoke on the same reading: the band event chains off the core transition
        expect(society.causalChain(bands[0].id).lineage.map(event => event.type)).toEqual([
            'TURN', 'PLAYER_WOUNDED', 'FEAR_EVENT_RAISED', 'FEAR_HABITUATED', 'FEAR_STATE_TRANSITION', 'FEARCORE_BAND_TRANSITION',
        ]);
        expect(society.auditEventGraph().ok).toBe(true);

        // a world with no band change emits nothing extra
        const quiet = woundWorld();
        quiet.tick({ actions: [damage(1, { factionId: 'settled' })] });
        expect(eventsOf(quiet, 'FEARCORE_BAND_TRANSITION')).toHaveLength(0);
        expect(quiet.fearCore.state).toBe('CALM');
    });

    it('reaches PANIC in production, then holds it behind the lock without event spam', () => {
        const society = new SocietyCore({ seed: 5 });
        society.addFaction('terrified', { fear: 1, threatPerception: 1 });
        society.addFaction('bystander', {});
        for (let i = 0; i < 4; i += 1) society.tick({ actions: [damage(1, { factionId: 'terrified' })] });

        const bands = eventsOf(society, 'FEARCORE_BAND_TRANSITION');
        expect(bands.map(event => `${event.from}->${event.to}`)).toEqual(['CALM->ALERT', 'ALERT->ANXIOUS', 'ANXIOUS->PANIC']);
        expect(bands.at(-1).panicLocked).toBe(true);
        expect(society.fearCore.state).toBe('PANIC');
        expect(eventsOf(society, 'FEARCORE_BAND_TRANSITION')).toHaveLength(3); // the fourth reading was locked
        expect(society.fearCore.getDecisionTrace().at(-1).reason).toBe('PANIC_LOCK');
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('round-trips the machine across save/load and stays deterministic', () => {
        const control = woundWorld();
        for (let i = 0; i < 2; i += 1) control.tick({ actions: [damage(15, { factionId: 'settled' })] }); // then one more after the restore

        const interrupted = woundWorld();
        interrupted.tick({ actions: [damage(15, { factionId: 'settled' })] });
        interrupted.tick({ actions: [damage(15, { factionId: 'settled' })] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));
        expect(restored.fearCore.serialize()).toEqual(interrupted.fearCore.serialize());
        expect(restored.fearCore.getDecisionTrace()).toEqual(interrupted.fearCore.getDecisionTrace());

        control.tick({ actions: [damage(15, { factionId: 'settled' })] });
        restored.tick({ actions: [damage(15, { factionId: 'settled' })] });
        expect(restored.serialize()).toEqual(control.serialize());

        const run = () => {
            const society = woundWorld(9);
            for (let i = 0; i < 3; i += 1) society.tick({ actions: [damage(15, { factionId: 'settled' })] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
