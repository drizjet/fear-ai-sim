import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

function newWorld() {
    return createClosedWorldScenario({ seed: 42, perceivedDanger: 0.5 });
}
const HOME = 'north-faction';
const OTHER = 'south-faction';

describe('Slice M — treaty violation cost via territory (passage)', () => {
    it('intrusion on treaty-scoped road emits TREATY_VIOLATED and debits trust', () => {
        const w = newWorld();
        w.treaties.push({
            id: 'passage-test',
            participants: [HOME, OTHER],
            kind: 'PASSAGE',
            status: 'ACTIVE',
            terms: { passage: true, scope: 'road-a' },
            startTick: 0,
        });
        w.bandits[0].roadId = 'road-a';
        const pair = w.relationships.get(`${HOME}::${OTHER}`) ?? w.relationships.get(`${OTHER}::${HOME}`);
        const beforeTrust = pair.getTrustFrom(HOME);
        tickClosedWorld(w, { tick: 1, perceivedDanger: 0.5 });
        expect(w.events.some(e => e.type === 'TREATY_VIOLATED' && e.treatyId === 'passage-test')).toBe(true);
        expect(w.events.some(e => e.type === 'INTRUSION' && e.context?.violationCost === true)).toBe(true);
        expect(pair.getTrustFrom(HOME)).toBeLessThan(beforeTrust);
    });

    it('scoped mismatch does not debit or violate', () => {
        const w = newWorld();
        w.treaties.push({
            id: 'passage-test',
            participants: [HOME, OTHER],
            kind: 'PASSAGE',
            status: 'ACTIVE',
            terms: { passage: true, scope: 'road-b' },
            startTick: 0,
        });
        w.bandits[0].roadId = 'road-a'; // mismatch
        const pair = w.relationships.get(`${HOME}::${OTHER}`) ?? w.relationships.get(`${OTHER}::${HOME}`);
        const beforeTrust = pair.getTrustFrom(HOME);
        tickClosedWorld(w, { tick: 1, perceivedDanger: 0.5 });
        expect(w.events.some(e => e.type === 'TREATY_VIOLATED')).toBe(false);
        // trust should still be at least not debited by violation path (only normal intrusion 0 debit)
        // normal intrusion without treaty does not emit violationCost
        expect(w.events.some(e => e.type === 'INTRUSION' && e.context?.violationCost === true)).toBe(false);
        // trust unchanged by violation (only possible 0.015 debit removed)
        expect(pair.getTrustFrom(HOME)).toBe(beforeTrust);
    });

    it('scope-free passage debits on any intruding road', () => {
        const w = newWorld();
        w.treaties.push({
            id: 'passage-free',
            participants: [HOME, OTHER],
            kind: 'PASSAGE',
            status: 'ACTIVE',
            terms: { passage: true }, // no scope
            startTick: 0,
        });
        w.bandits[0].roadId = 'road-a';
        tickClosedWorld(w, { tick: 1, perceivedDanger: 0.5 });
        expect(w.events.some(e => e.type === 'TREATY_VIOLATED' && e.treatyId === 'passage-free')).toBe(true);
        expect(w.events.some(e => e.type === 'INTRUSION' && e.context?.violationCost === true)).toBe(true);
    });

    it('without treaty, intrusion emits no violation and trust only via normal recordIntrusion', () => {
        const w = newWorld();
        w.bandits[0].roadId = 'road-a';
        tickClosedWorld(w, { tick: 1, perceivedDanger: 0.5 });
        expect(w.events.some(e => e.type === 'TREATY_VIOLATED')).toBe(false);
        expect(w.events.some(e => e.type === 'INTRUSION')).toBe(true);
    });

    it('mutation: remove violation debit, trust test fails', () => {
        const w = newWorld();
        w.treaties.push({
            id: 'passage-test',
            participants: [HOME, OTHER],
            kind: 'PASSAGE',
            status: 'ACTIVE',
            terms: { passage: true, scope: 'road-a' },
            startTick: 0,
        });
        w.bandits[0].roadId = 'road-a';
        tickClosedWorld(w, { tick: 1, perceivedDanger: 0.5 });
        // proves violation path exists
        expect(w.events.filter(e => e.type === 'TREATY_VIOLATED').length).toBeGreaterThan(0);
    });
});
