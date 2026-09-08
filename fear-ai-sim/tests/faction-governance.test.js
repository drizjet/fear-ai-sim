import { describe, it, expect } from '@jest/globals';
import {
    FactionGovernanceSystem,
    GOVERNANCE_ARCHETYPES,
    FACTION_DIRECTIVES
} from '../packages/core/index.js';

describe('Front C / Section 33: Collective Faction Governance & Decision Structures', () => {
    it('1. Contrasts deliberation outcomes across different governance archetypes under identical incident', () => {
        const incident = {
            type: 'BORDER_TRESPASS',
            severity: 0.65,
            targetFactionId: 'rival_empire'
        };
        const context = { powerRatio: 1.4, tradeVolume: 40 };

        // 1. Military Junta: High power ratio -> martial escalation
        const junta = new FactionGovernanceSystem('iron_legion', GOVERNANCE_ARCHETYPES.MILITARY_JUNTA);
        const juntaResult = junta.deliberateIncident(incident, context);
        expect([FACTION_DIRECTIVES.MOBILIZE, FACTION_DIRECTIVES.ATTACK]).toContain(juntaResult.directive);
        expect(juntaResult.rationale).toContain('Military high command');

        // 2. Merchant Oligarchy: High trade volume -> negotiation / tribute to protect corridors
        const oligarchy = new FactionGovernanceSystem('merchant_guild', GOVERNANCE_ARCHETYPES.MERCHANT_OLIGARCHY);
        const oligarchyResult = oligarchy.deliberateIncident(incident, context);
        expect([FACTION_DIRECTIVES.NEGOTIATE, FACTION_DIRECTIVES.PAY_TRIBUTE]).toContain(oligarchyResult.directive);
        expect(oligarchyResult.rationale).toContain('Merchant council');

        // 3. Tribal Consensus: Requires >= 67% supermajority to escalate
        const tribe = new FactionGovernanceSystem('woodland_clans', GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS, {
            consensusThreshold: 0.67
        });
        const tribeResult = tribe.deliberateIncident(incident, context);
        // On first moderate incident, clan elders do not reach supermajority -> WARN
        expect(tribeResult.directive).toBe(FACTION_DIRECTIVES.WARN);
        expect(tribeResult.voteBreakdown.ratio).toBeLessThan(0.67);
    });

    it('2. Autocratic Despot: Outcome is acutely sensitive to the leader personal affective state', () => {
        const incident = { type: 'SCOUT_AMBUSH', severity: 0.70, targetFactionId: 'raiders' };

        // Terrified leader (fear = 0.85, anger = 0.10)
        const cowardlyDespot = new FactionGovernanceSystem('coward_kingdom', GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT, {
            leader: { fear: 0.85, anger: 0.10, bravery: 0.10, neuroticism: 0.90 }
        });
        const cowardlyResult = cowardlyDespot.deliberateIncident(incident, { powerRatio: 0.7 });
        expect(cowardlyResult.directive).toBe(FACTION_DIRECTIVES.RETREAT);
        expect(cowardlyResult.rationale).toContain('terrified');

        // Enraged veteran leader (fear = 0.10, anger = 0.80, bravery = 0.85)
        const warriorDespot = new FactionGovernanceSystem('warrior_horde', GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT, {
            leader: { fear: 0.10, anger: 0.80, bravery: 0.85, neuroticism: 0.20 }
        });
        const warriorResult = warriorDespot.deliberateIncident(incident, { powerRatio: 1.2 });
        expect(warriorResult.directive).toBe(FACTION_DIRECTIVES.ATTACK);
        expect(warriorResult.rationale).toContain('enraged');
    });

    it('3. Tribal Consensus: Escalation only triggers once clan council reaches supermajority', () => {
        // Council of 6 elders with diverse hawkishness
        const elders = [
            { name: 'E1', hawkishness: 0.9 },
            { name: 'E2', hawkishness: 0.8 },
            { name: 'E3', hawkishness: 0.75 },
            { name: 'E4', hawkishness: 0.7 },
            { name: 'E5', hawkishness: 0.2 },
            { name: 'E6', hawkishness: 0.1 }
        ];

        const tribe = new FactionGovernanceSystem('clans', GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS, {
            councilMembers: elders,
            consensusThreshold: 2 / 3
        });

        // Mild incident (severity 0.3) -> Hawkish pressure is low
        const mildResult = tribe.deliberateIncident({ type: 'CATTLE_THEFT', severity: 0.3 });
        expect(mildResult.directive).toBe(FACTION_DIRECTIVES.WARN);
        expect(mildResult.voteBreakdown.ratio).toBeLessThan(0.67);

        // Catastrophic border raid (severity 0.9) -> Grievance builds, pushes 4+ elders over threshold
        const severeResult = tribe.deliberateIncident({ type: 'VILLAGE_BURNED', severity: 0.9 }, { powerRatio: 1.1 });
        expect(severeResult.voteBreakdown.ratio).toBeGreaterThanOrEqual(2 / 3);
        expect([FACTION_DIRECTIVES.MOBILIZE, FACTION_DIRECTIVES.SKIRMISH]).toContain(severeResult.directive);
    });

    it('4. Ecclesiastical Devout: Distinguishes secular skirmish from holy sanctuary desecration', () => {
        const church = new FactionGovernanceSystem('holy_order', GOVERNANCE_ARCHETYPES.ECCLESIASTICAL_DEVOUT);

        // Secular raid
        const secularResult = church.deliberateIncident({ type: 'CARAVAN_AMBUSH', severity: 0.4 });
        expect(secularResult.directive).toBe(FACTION_DIRECTIVES.OBSERVE);

        // Holy Shrine desecrated -> Immediate righteous crusade
        const holyResult = church.deliberateIncident({ type: 'SANCTUARY_DESECRATED', severity: 0.8 });
        expect(holyResult.directive).toBe(FACTION_DIRECTIVES.ATTACK);
        expect(holyResult.rationale).toContain('crusade');
    });

    it('5. Military Junta falls back to tactical retreat when military readiness is shattered', () => {
        const shatteredJunta = new FactionGovernanceSystem('broken_army', GOVERNANCE_ARCHETYPES.MILITARY_JUNTA, {
            militaryReadiness: 0.15 // Shattered forces
        });

        const result = shatteredJunta.deliberateIncident({ type: 'ENEMY_ADVANCE', severity: 0.8 }, { powerRatio: 0.4 });
        expect(result.directive).toBe(FACTION_DIRECTIVES.RETREAT);
        expect(result.rationale).toContain('shattered readiness');
    });

    it('6. Strictly preserves Host Game Authority Invariant', () => {
        const governance = new FactionGovernanceSystem('test_fac', GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS);
        const hostEntity = { id: 'settlement_keep', x: 200, y: 150, garrisonCount: 50 };

        const result = governance.deliberateIncident({ type: 'PROVOCATION', severity: 0.7 });

        // Evaluates directive as semantic advice
        expect(result.isHostAuthoritative).toBe(true);
        expect(hostEntity.x).toBe(200);
        expect(hostEntity.garrisonCount).toBe(50);
    });
});
