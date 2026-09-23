import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { HabituationBook } from '../socialcore.js';
import { SocietyCore } from '../societycore.js';

// Re-opened `Habituation` ledger row (RESP-SOURCE-ABSENT-RECONCILIATION-001 re-open
// procedure): the legacy source is extracted byte-exact (blob + sha256 pinned) and the V8
// integration runs in production — FEAR_EVENT_RAISED fear gains pass through the exposure
// book and every exposure is recorded as a canonical FEAR_HABITUATED event chained to the
// fear event it shaped. Novelty protects the first exposures, recovery runs on world time,
// both state round-trips save/load, and everything is seeded-deterministic.
// Mutants pinned: habituation application removed (fear gain unattenuated); FEAR_HABITUATED
// parentage dropped; exposure book dropped from serialize; novelty rule inverted.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_SHA256 = 'df02134b9227043baca61698a1a4f7d3b0cf6ce477667acd511e04a8d812db27';
const LEGACY_BLOB = 'df69efd8bf62c1b7ac38161fcdb9e9909e764c5d';

const damage = (amount, extra = {}) => ({ kind: 'PLAYER_DAMAGE', amount, source: 'bandits', ...extra });
const eventsOf = (society, type) => society.events.filter(event => event.type === type);

const woundWorld = () => {
    const society = new SocietyCore({ seed: 55 });
    society.addFaction('settled', { fear: 0, threatPerception: 0 });
    return society;
};

describe('re-opened Habituation row: extracted source + V8 integration', () => {
    it('the extracted legacy source is byte-exact against the manifest blob and sha256', () => {
        const bytes = fs.readFileSync(path.join(ROOT, 'legacy', 'habituation.js'));
        expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(LEGACY_SHA256);
        const provenance = fs.readFileSync(path.join(ROOT, 'legacy', 'PROVENANCE.md'), 'utf8');
        expect(provenance).toContain(LEGACY_BLOB); // provenance cites the upstream blob
        expect(provenance).toContain(LEGACY_SHA256);
    });

    it('HabituationBook preserves legacy semantics: novelty, cap, decay speed, world-time recovery', () => {
        const book = new HabituationBook();

        // novelty protects the first two exposures: no attenuation at all
        const first = book.attenuate(1, { stimulusType: 'PREDATOR', actorId: 'a', now: 0 });
        const second = book.attenuate(1, { stimulusType: 'PREDATOR', actorId: 'a', now: 1 });
        expect(first).toMatchObject({ habituationLevel: 0, exposureCount: 1, adjusted: 1 });
        expect(second).toMatchObject({ habituationLevel: 0, exposureCount: 2, adjusted: 1 });

        // third exposure (count 2): 2×.08=0.16 potential − novelty .15×1/3=0.05 → 0.11
        const third = book.attenuate(1, { stimulusType: 'PREDATOR', actorId: 'a', now: 2 });
        expect(third.habituationLevel).toBeCloseTo(0.11, 10);
        expect(third.adjusted).toBeCloseTo(0.89, 10);
        expect(third.fearReduced).toBeCloseTo(0.11, 10);

        // decay speed matters: GROUP_PANIC (2.0) habituates one exposure earlier than PREDATOR
        const panic = new HabituationBook();
        panic.attenuate(1, { stimulusType: 'GROUP_PANIC', actorId: 'a', now: 0 });
        const panicSecond = panic.attenuate(1, { stimulusType: 'GROUP_PANIC', actorId: 'a', now: 0 });
        expect(panicSecond.habituationLevel).toBeCloseTo(.06, 10); // 1×.08×2=0.16 − .10 novelty

        // the cap holds no matter how many exposures accumulate
        const marathon = new HabituationBook();
        let level = 0;
        for (let i = 0; i < 50; i++) level = marathon.attenuate(1, { stimulusType: 'PREDATOR', actorId: 'a', now: i }).habituationLevel;
        expect(level).toBeCloseTo(0.60, 10);

        // recovery runs on WORLD time passed by the caller (rate .02 × 2 ticks → −.04)
        const read = book.read('PREDATOR', 'a', null, 4);
        expect(read.habituationLevel).toBeCloseTo(0.11 - 0.04, 10);
        expect(book.read('PREDATOR', 'a', null, 2).habituationLevel).toBeCloseTo(0.11, 10); // no elapsed time, no recovery
    });

    it('attenuates production fear gains through FEAR_HABITUATED chained events', () => {
        const society = woundWorld();
        society.tick({ actions: [damage(20, { factionId: 'settled' })] });
        society.tick({ actions: [damage(20, { factionId: 'settled' })] });
        society.tick({ actions: [damage(20, { factionId: 'settled' })] });

        const habituations = eventsOf(society, 'FEAR_HABITUATED');
        expect(habituations.map(event => event.exposureCount)).toEqual([1, 2, 3]);

        // each exposure record chains off the fear event it shaped
        const fears = eventsOf(society, 'FEAR_EVENT_RAISED');
        expect(fears).toHaveLength(3);
        habituations.forEach((event, index) => {
            expect(event.parentId).toBe(fears[index].id);
            expect(fears[index].parentId).toBe(society.events.filter(e => e.type === 'PLAYER_WOUNDED')[index].id);
        });

        // novelty: exposures 1–2 apply the full gain; exposure 3 is attenuated (source
        // 'bandits' falls back to the VISUAL config: count 2 × .08 × 1.2 = .192 − .05 = .142)
        expect(habituations[0]).toMatchObject({ baseGain: .2, appliedGain: .2, habituationLevel: 0 });
        expect(habituations[1]).toMatchObject({ appliedGain: .2, habituationLevel: 0 });
        expect(habituations[2].habituationLevel).toBeCloseTo(0.142, 10);
        expect(habituations[2].appliedGain).toBeCloseTo(.2 * (1 - .142), 10);
        expect(habituations[2].appliedGain).toBeLessThan(habituations[2].baseGain);
        expect(fears[2].baseFearGain).toBe(.2);
        expect(fears[2].fearGainApplied).toBeCloseTo(habituations[2].appliedGain, 10);

        // faction fear reflects the attenuated third gain exactly
        expect(society.factions.get('settled').state.fear).toBeCloseTo(.2 + .2 + .2 * (1 - .142), 10);
        expect(society.auditEventGraph().ok).toBe(true);
        expect(society.causalChain(habituations[2].id).lineage.map(event => event.type)).toEqual([
            'TURN', 'PLAYER_WOUNDED', 'FEAR_EVENT_RAISED', 'FEAR_HABITUATED',
        ]);
    });

    it('isolates exposures per faction and per stimulus source', () => {
        const society = woundWorld();
        society.addFaction('other', { fear: 0 });
        for (let i = 0; i < 3; i++) society.tick({ actions: [damage(20, { factionId: 'settled' })] });
        society.tick({ actions: [damage(20, { factionId: 'other' })] });          // new faction, same source
        society.tick({ actions: [damage(20, { factionId: 'settled', source: 'earthquake' })] }); // same faction, new source

        const habituations = eventsOf(society, 'FEAR_HABITUATED');
        const [settled1, settled2, settled3, other, newSource] = habituations;
        expect(settled3.exposureCount).toBe(3);
        expect(other).toMatchObject({ factionId: 'other', exposureCount: 1, habituationLevel: 0 }); // separate key untouched by settled's history
        expect(newSource).toMatchObject({ factionId: 'settled', source: 'earthquake', exposureCount: 1, habituationLevel: 0 });
        expect(society.habituation.exposures.size).toBe(3);
    });

    it('wounds without a faction never touch the exposure book', () => {
        const society = new SocietyCore({ seed: 55 });
        society.tick({ actions: [damage(10), damage(10), damage(10)] });
        expect(eventsOf(society, 'FEAR_HABITUATED')).toHaveLength(0);
        expect(eventsOf(society, 'FEAR_EVENT_RAISED')).toHaveLength(3);
        expect(society.habituation.exposures.size).toBe(0);
        expect(society.factions.size).toBe(0);
    });

    it('survives save/load mid-exposure and continues identically to an uninterrupted run', () => {
        const control = woundWorld();
        control.tick({ actions: [damage(20, { factionId: 'settled' })] });
        control.tick({ actions: [damage(20, { factionId: 'settled' })] });
        control.tick({ actions: [damage(20, { factionId: 'settled' })] });

        const interrupted = woundWorld();
        interrupted.tick({ actions: [damage(20, { factionId: 'settled' })] });
        interrupted.tick({ actions: [damage(20, { factionId: 'settled' })] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));

        // exposure book and faction fear survive the round-trip
        const exposures = [...restored.habituation.exposures.values()];
        expect(exposures).toHaveLength(1);
        expect(exposures[0].count).toBe(2);
        expect(restored.factions.get('settled').state.fear).toBe(.4);

        restored.tick({ actions: [damage(20, { factionId: 'settled' })] });
        const [third] = [...restored.events].reverse().filter(event => event.type === 'FEAR_HABITUATED');
        expect(third.exposureCount).toBe(3); // count continued across save/load, not restarted
        expect(restored.serialize()).toEqual(control.serialize()); // bit-for-bit identical continuation
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = woundWorld();
            for (let i = 0; i < 4; i++) society.tick({ actions: [damage(20, { factionId: 'settled' })] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
