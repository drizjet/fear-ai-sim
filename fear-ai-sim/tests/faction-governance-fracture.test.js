import { describe, it, expect } from '@jest/globals';
import {
    FactionGovernanceSystem,
    GOVERNANCE_ARCHETYPES,
    FACTION_DIRECTIVES,
    SuccessionEngine
} from '../packages/core/index.js';

// R15: governance reacts to succession aftermath. A fractured faction
// steps high-commitment directives down one rung; a headless autocracy
// can will nothing (councils survive their leaders). Absent/garbage
// context reproduces legacy deliberation exactly.

function junta() {
    return new FactionGovernanceSystem('iron_legion', GOVERNANCE_ARCHETYPES.MILITARY_JUNTA);
}

function autocrat() {
    return new FactionGovernanceSystem('throne', GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT, {
        leader: { fear: 0.1, anger: 0.9, bravery: 0.8, neuroticism: 0.3 }
    });
}

// severity 0.6 + powerRatio 1.4 drives the junta to ATTACK.
const WAR_INCIDENT = { type: 'BORDER_SKIRMISH', severity: 0.6, targetFactionId: 'foe' };
const WAR_CONTEXT = { powerRatio: 1.4 };

describe('R15: governance reacts to succession aftermath', () => {
    it('1. Absent or garbage succession context reproduces legacy exactly', () => {
        const a = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT });
        const b = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT });
        expect(b.directive).toBe(a.directive);
        expect(b.rationale).toBe(a.rationale);
        const garbage = junta().deliberateIncident(WAR_INCIDENT, {
            ...WAR_CONTEXT, splinterRisk: 'high', cohesion: NaN, leaderVacant: 'yes'
        });
        expect(garbage.directive).toBe(a.directive);
        expect(garbage.rationale).toBe(a.rationale);
    });

    it('2. Fractured junta steps ATTACK down to MOBILIZE', () => {
        const whole = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT });
        expect(whole.directive).toBe(FACTION_DIRECTIVES.ATTACK);
        const fractured = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT, splinterRisk: 0.7 });
        expect(fractured.directive).toBe(FACTION_DIRECTIVES.MOBILIZE);
        expect(fractured.rationale).toContain('could not commit');
    });

    it('3. Low cohesion alone fractures (no splinterRisk needed)', () => {
        const fractured = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT, cohesion: 0.2 });
        expect(fractured.directive).toBe(FACTION_DIRECTIVES.MOBILIZE);
    });

    it('4. Fracture boundary is exact: 0.49 holds, 0.5 steps down', () => {
        const hold = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT, splinterRisk: 0.49 });
        expect(hold.directive).toBe(FACTION_DIRECTIVES.ATTACK);
        const step = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT, splinterRisk: 0.5 });
        expect(step.directive).toBe(FACTION_DIRECTIVES.MOBILIZE);
    });

    it('5. Non-commitment directives survive fracture (nothing invented)', () => {
        const guild = new FactionGovernanceSystem('guild', GOVERNANCE_ARCHETYPES.MERCHANT_OLIGARCHY);
        const calm = { type: 'TRADE_DISPUTE', severity: 0.3, targetFactionId: 'partner' };
        const whole = guild.deliberateIncident(calm, { powerRatio: 1.0, tradeVolume: 40 });
        expect(whole.directive).toBe(FACTION_DIRECTIVES.NEGOTIATE);
        const fractured = new FactionGovernanceSystem('guild', GOVERNANCE_ARCHETYPES.MERCHANT_OLIGARCHY)
            .deliberateIncident(calm, { powerRatio: 1.0, tradeVolume: 40, splinterRisk: 0.9 });
        expect(fractured.directive).toBe(FACTION_DIRECTIVES.NEGOTIATE);
    });

    it('6. Headless autocracy falls to OBSERVE; headed autocracy commits', () => {
        const headed = autocrat().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT });
        expect([FACTION_DIRECTIVES.ATTACK, FACTION_DIRECTIVES.MOBILIZE]).toContain(headed.directive);
        const headless = autocrat().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT, leaderVacant: true });
        expect(headless.directive).toBe(FACTION_DIRECTIVES.OBSERVE);
        expect(headless.rationale).toContain('Headless autocracy');
    });

    it('7. Headless junta still attacks: councils survive their leaders', () => {
        const headless = junta().deliberateIncident(WAR_INCIDENT, { ...WAR_CONTEXT, leaderVacant: true });
        expect(headless.directive).toBe(FACTION_DIRECTIVES.ATTACK);
    });

    it('8. End to end: interregnum aftermath headless-falls the autocracy', () => {
        // SuccessionEngine with no heir: interregnum, splinterRisk 0.85.
        const succession = new SuccessionEngine();
        const report = succession.resolve({ factionId: 'throne', cause: 'ASSASSINATION', candidates: [] });
        expect(report.interregnum).toBe(true);
        const aftermath = autocrat().deliberateIncident(WAR_INCIDENT, {
            ...WAR_CONTEXT, splinterRisk: report.splinterRisk, leaderVacant: report.successorId == null
        });
        expect(aftermath.directive).toBe(FACTION_DIRECTIVES.OBSERVE);
    });

    it('9. Same fractured inputs replay identical directives', () => {
        const run = () => junta().deliberateIncident(
            WAR_INCIDENT, { ...WAR_CONTEXT, splinterRisk: 0.7 }
        ).directive;
        expect(run()).toBe(run());
    });
});
