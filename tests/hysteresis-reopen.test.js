import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { HysteresisBook } from '../socialcore.js';
import { SocietyCore } from '../societycore.js';

// RESP-HYSTERESIS-REOPEN-001 (re-open executed under RESP-SOURCE-ABSENT-RECONCILIATION-001's
// procedure) — re-opened `Hysteresis` ledger row: the legacy source is extracted byte-exact (blob + sha256 pinned) and the V8
// integration runs in production — FEAR_EVENT_RAISED fear levels drive the per-faction
// state machine (asymmetric enter/exit thresholds behind a minimum-duration gate) and every
// real transition is a canonical FEAR_STATE_TRANSITION event chained off the exposure that
// produced the level it read. World time only, save/load round-trip, seeded-deterministic.
// Mutants pinned: machine not driven in production (no transitions); hysteresis gap removed
// (exitDown lifted to exitUp → oscillates where state must hold); minimum-duration gate
// removed; book dropped from serialize; morale not supplied to the production driver (the
// legacy FREEZE branch becomes unreachable); RNG adapter passed the source object instead of
// a draw (the seeded FREEZE roll throws the moment it is taken).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_SHA256 = '40e5cb26595ff5c33b9ffc11c17816fdbcc1ff56615d20c334149abaf59a3da5';
const LEGACY_BLOB = '208cbffc038a04a901b262024d5ad414b9dcdcd9';

const damage = (amount, extra = {}) => ({ kind: 'PLAYER_DAMAGE', amount, source: 'bandits', ...extra });
const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const woundWorld = (seed = 77) => {
    const society = new SocietyCore({ seed });
    society.addFaction('settled', { fear: 0, threatPerception: 0 });
    return society;
};

describe('re-opened Hysteresis row: extracted source + V8 integration', () => {
    it('the extracted legacy source is byte-exact against the manifest blob and sha256', () => {
        const bytes = fs.readFileSync(path.join(ROOT, 'legacy', 'hysteresis.js'));
        expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(LEGACY_SHA256);
        const provenance = fs.readFileSync(path.join(ROOT, 'legacy', 'PROVENANCE.md'), 'utf8');
        expect(provenance).toContain(LEGACY_BLOB); // provenance cites the upstream blob
        expect(provenance).toContain(LEGACY_SHA256);
        // the manifest no longer lists hysteresis.js — the row left SOURCE_ABSENT through the
        // designed tripwire (guard suite updated in the same change).
        const manifest = fs.readFileSync(path.join(ROOT, 'docs', 'SOURCE_ABSENT_RECONCILIATION.md'), 'utf8');
        expect(manifest).not.toContain('| hysteresis.js |');
    });

    it('HysteresisBook preserves legacy semantics: the asymmetric enter/exit gap holds state', () => {
        const book = new HysteresisBook({ minStateDuration: 1 });
        // CALM only leaves upward above exitUp .25 …
        expect(book.update('a', 0.20, {}, 5)).toMatchObject({ transitioned: false, state: 'CALM' });
        expect(book.update('a', 0.26, {}, 6)).toMatchObject({ transitioned: true, from: 'CALM', to: 'ALERT' });
        // … and once ALERT, fear .20 HOLDS it (exitDown .15) — the gap that kills oscillation:
        // the very same .20 that cannot enter ALERT also cannot exit it.
        expect(book.update('a', 0.20, {}, 7)).toMatchObject({ transitioned: false, state: 'ALERT' });
        expect(book.update('a', 0.14, {}, 8)).toMatchObject({ transitioned: true, from: 'ALERT', to: 'CALM' });
        // world time lands in the record — no wall clock anywhere (RESP-TIME-OWNERSHIP-001)
        expect(book.getHistory('a').map(entry => entry.timestamp)).toEqual([6, 8]);
        // legacy gap numbers preserved verbatim
        expect(book.getHysteresisGap('CALM', 'ALERT')).toBe(0); // exitUp .25 − enter .25
        expect(book.getHysteresisGap('ALERT', 'CALM')).toBe(-0.15); // enter CALM 0 − exitDown .15
    });

    it('enforces the minimum-duration gate: no reading moves the state before the legacy minimum', () => {
        const gated = new HysteresisBook(); // legacy default 10
        // even MAX fear cannot flip the state on the first nine readings
        expect(gated.update('gated', 1, {}, 0)).toMatchObject({ transitioned: false, state: 'CALM' });
        expect(gated.canChangeState('gated')).toBe(false);
        for (let i = 1; i < 9; i += 1) expect(gated.update('gated', 1, {}, i).transitioned).toBe(false);
        // the tenth reading passes the gate and fear 1 moves CALM → ALERT
        expect(gated.update('gated', 1, {}, 9)).toMatchObject({ transitioned: true, from: 'CALM', to: 'ALERT' });
        // the transition re-arms the gate (timer reset)
        expect(gated.canChangeState('gated')).toBe(false);
    });

    it('keeps the seeded legacy FREEZE roll behind low morale', () => {
        const frozen = new HysteresisBook({ minStateDuration: 1, rng: () => 0 }); // rng always rolls the freeze
        expect(frozen.update('f', 0.26, {}, 0)).toMatchObject({ to: 'ALERT' });
        expect(frozen.update('f', 0.56, {}, 0)).toMatchObject({ to: 'ANXIOUS' });
        expect(frozen.update('f', 0.76, {}, 0)).toMatchObject({ to: 'PANIC' });
        expect(frozen.update('f', 0.9, { morale: 0.3 }, 0)).toMatchObject({ transitioned: true, from: 'PANIC', to: 'FREEZE' });
        // high morale keeps the same readings out of FREEZE (no roll consumed, state holds PANIC…)
        const steady = new HysteresisBook({ minStateDuration: 1, rng: () => 0 });
        steady.update('g', 0.76, {}, 0); steady.update('g', 0.56, {}, 0); steady.update('g', 0.76, {}, 0);
        expect(steady.update('g', 0.9, { morale: 1 }, 0)).toMatchObject({ transitioned: false, state: 'PANIC' });
    });

    it('drives production fear gains through FEAR_STATE_TRANSITION chained events', () => {
        const society = woundWorld();
        for (let i = 0; i < 5; i += 1) society.tick({ actions: [damage(15, { factionId: 'settled' })] });

        const transitions = eventsOf(society, 'FEAR_STATE_TRANSITION');
        // gate (minStateDuration 2): wound 1 is blocked; wound 2 lands the full .15 + .15
        // above CALM's exitUp .25; later wounds accumulate through habituation until ALERT's
        // exitUp .55 is crossed — exactly two transitions, never one per wound.
        expect(transitions.map(event => `${event.from}->${event.to}`)).toEqual(['CALM->ALERT', 'ALERT->ANXIOUS']);
        expect(transitions[0].fearLevel).toBeCloseTo(0.30, 10); // two unattenuated .15 gains
        expect(transitions[1].fearLevel).toBeGreaterThan(transitions[0].fearLevel);
        expect(transitions[1].fearLevel).toBeLessThan(1);
        expect(transitions[0].worldTime).toBe(2); // wound 2's tick, world clock
        expect(society.hysteresis.getState('settled')).toBe('ANXIOUS');
        expect(society.hysteresis.getHistory('settled')).toHaveLength(2);

        // five wounds → five exposure records; every transition chains off the exposure whose
        // post-attenuation level it read
        const habituations = eventsOf(society, 'FEAR_HABITUATED');
        expect(habituations).toHaveLength(5);
        for (const event of transitions) {
            const parent = society.events.find(item => item.id === event.parentId);
            expect(parent.type).toBe('FEAR_HABITUATED');
        }
        expect(society.causalChain(transitions[1].id).lineage.map(event => event.type)).toEqual([
            'TURN', 'PLAYER_WOUNDED', 'FEAR_EVENT_RAISED', 'FEAR_HABITUATED', 'FEAR_STATE_TRANSITION',
        ]);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('keeps the machine per-faction: only wounded factions update, bystanders stay untouched', () => {
        const society = woundWorld();
        society.addFaction('bystander', {});
        society.tick({ actions: [damage(15, { factionId: 'settled' })] });
        society.tick({ actions: [damage(15, { factionId: 'settled' })] });
        expect(society.hysteresis.actors.has('bystander')).toBe(false);
        expect(society.hysteresis.getState('settled')).toBe('ALERT');
        expect(eventsOf(society, 'FEAR_STATE_TRANSITION')).toHaveLength(1);
        // a wound without a faction never touches the machine
        const bare = woundWorld();
        bare.tick({ actions: [damage(15)] });
        expect(bare.hysteresis.actors.size).toBe(0);
        expect(eventsOf(bare, 'FEAR_STATE_TRANSITION')).toHaveLength(0);
    });

    it('reaches the legacy FREEZE branch in production: the driver supplies morale and the RNG adapter draws', () => {
        // every world draw is 0, so the legacy 5% FREEZE roll is certain the first time it is taken
        const bowed = (morale) => {
            const society = new SocietyCore({ rng: () => 0 });
            society.addFaction('bowed', { fear: .9, threatPerception: 0 });
            if (morale != null) society.setMorale('bowed', morale);
            // eight readings: the ladder needs two per rung plus the post-PANIC gate window
            for (let i = 0; i < 8; i += 1) society.tick({ actions: [damage(1, { factionId: 'bowed' })] });
            return society;
        };

        const desperate = bowed(.3);
        expect(eventsOf(desperate, 'FEAR_STATE_TRANSITION').map(event => `${event.from}->${event.to}`)).toContain('PANIC->FREEZE');
        expect(desperate.hysteresis.getState('bowed')).toBe('FREEZE');

        // no morale assigned → the branch short-circuits before the roll, exactly as before
        const steady = bowed(null);
        expect(eventsOf(steady, 'FEAR_STATE_TRANSITION').map(event => event.to)).not.toContain('FREEZE');
        expect(steady.hysteresis.getState('bowed')).toBe('PANIC');
        expect(desperate.auditEventGraph().ok).toBe(true);
    });

    it('round-trips the machine across save/load with seeded-identical continuation', () => {
        const control = woundWorld();
        for (let i = 0; i < 2; i += 1) control.tick({ actions: [damage(15, { factionId: 'settled' })] });

        const interrupted = woundWorld();
        interrupted.tick({ actions: [damage(15, { factionId: 'settled' })] });
        interrupted.tick({ actions: [damage(15, { factionId: 'settled' })] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));
        expect(restored.hysteresis.getState('settled')).toBe('ALERT'); // machine state survives
        expect(restored.hysteresis.getHistory('settled')).toEqual(interrupted.hysteresis.getHistory('settled'));
        expect(restored.auditEventGraph().ok).toBe(true);

        control.tick({ actions: [damage(15, { factionId: 'settled' })] });
        restored.tick({ actions: [damage(15, { factionId: 'settled' })] });
        expect(restored.serialize()).toEqual(control.serialize()); // seeded-identical continuation
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = woundWorld(9);
            for (let i = 0; i < 4; i += 1) society.tick({ actions: [damage(15, { factionId: 'settled' })] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
