import { describe, it, expect } from '@jest/globals';
import { FactionSystem } from '../packages/core/index.js';
import { SuccessionEngine } from '../packages/core/index.js';

// R11 (audit 190): succession-to-policy-state effects.
// FactionSystem.applySuccession landed cohesion/morale/leaderId but dropped
// policyShift and splinterRisk on the floor — computed advisories with no
// consumer. They now land as readable faction state (finite numbers only).

const CANDIDATES = [
    { id: 'heir', legitimacy: 0.9, competence: 0.6, popularity: 0.7, continuity: 0.2 },
    { id: 'spare', legitimacy: 0.4, competence: 0.8, popularity: 0.5, continuity: 0.9 },
];

function setup() {
    const factions = new FactionSystem();
    factions.registerFaction({ id: 'f1' });
    return { factions, engine: new SuccessionEngine() };
}

describe('R11: succession risk advisories land on faction state', () => {
    it('1. Fresh factions carry zeroed risk state', () => {
        const { factions } = setup();
        const f = factions.getFaction('f1');
        expect(f.splinterRisk).toBe(0);
        expect(f.lastPolicyShift).toBe(0);
    });

    it('2. Resolve outcome lands all five fields', () => {
        const { factions, engine } = setup();
        const report = engine.resolve({
            factionId: 'f1', cause: 'ASSASSINATION', archetype: 'AUTOCRATIC_DESPOT',
            candidates: CANDIDATES, cohesion: 0.7, morale: 0.7,
        });
        const updated = factions.applySuccession(report);
        expect(updated.leaderId).toBe(report.successorId);
        expect(updated.cohesion).toBeLessThan(0.7);
        expect(updated.splinterRisk).toBe(report.splinterRisk);
        expect(updated.lastPolicyShift).toBe(report.policyShift);
        // Low-continuity winner (0.2) breaks hard with the past.
        expect(report.policyShift).toBeCloseTo(0.8, 10);
        expect(updated.lastPolicyShift).toBeCloseTo(0.8, 10);
    });

    it('3. Interregnum lands maximum risk without a leader', () => {
        const { factions, engine } = setup();
        const report = engine.resolve({ factionId: 'f1', cause: 'DISGRACE', candidates: [] });
        expect(report.interregnum).toBe(true);
        const updated = factions.applySuccession(report);
        expect(updated.splinterRisk).toBe(0.85);
        expect(updated.leaderId).toBe(undefined);
        expect(updated.cohesion).toBeLessThan(0.7);
    });

    it('4. Unknown factions and garbage advisories stay safe', () => {
        const { factions, engine } = setup();
        expect(factions.applySuccession({ factionId: 'ghost', cohesionDelta: -0.5 })).toBeNull();
        const report = engine.resolve({
            factionId: 'f1', cause: 'NATURAL_DEATH', candidates: CANDIDATES,
        });
        const updated = factions.applySuccession({
            ...report, splinterRisk: NaN, policyShift: 'rupture',
        });
        // Prior state kept: defaults, since nothing valid landed before.
        expect(updated.splinterRisk).toBe(0);
        expect(updated.lastPolicyShift).toBe(0);
        // Valid values still land around the garbage.
        const relanded = factions.applySuccession(report);
        expect(relanded.splinterRisk).toBe(report.splinterRisk);
    });

    it('5. Same resolve plus apply replays exactly', () => {
        const run = () => {
            const { factions, engine } = setup();
            const report = engine.resolve({
                factionId: 'f1', cause: 'DEATH_IN_BATTLE', candidates: CANDIDATES,
            });
            return factions.applySuccession(report);
        };
        expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    });
});
