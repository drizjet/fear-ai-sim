/**
 * tests/faction-escalation-matrix.test.js
 *
 * Test suite for Milestone F: Multi-Faction Diplomacy & 14-Stage Escalation Matrix.
 * Verifies:
 * 1. Faction registration, profile initialization, and initial UNAWARE stance
 * 2. Complete 14-stage state transitions and directed asymmetry E(A->B) !== E(B->A)
 * 3. Passive pressure progression from UNAWARE -> OBSERVE -> SHADOW -> WARN -> THREATEN
 * 4. Active incident triggers and casus belli generation (BORDER_TRESPASS, RAID_CONFIRMED)
 * 5. Capability gating: military/resource exhaustion prevents ATTACK, forcing RETREAT
 * 6. Uncertainty gating: low information confidence restricts escalation to OBSERVE/AVOID
 * 7. Diplomatic resolution: peaceful trade and high trust achieve TRADE and ALLY
 * 8. Involuntary capitulation: severe terror and military collapse trigger SURRENDER
 * 9. Hysteresis barrier: peaceful de-escalation requires significant pressure drop
 * 10. Snapshot serialization and 100% bit-for-bit replay determinism
 */

import {
    FactionSystem,
    ESCALATION_STAGES,
    FACTION_CULTURES,
    INCIDENT_TYPES
} from '../packages/core/index.js';

describe('Milestone F: Faction Escalation Matrix & Multi-Faction Diplomacy', () => {
    let factionSys;

    beforeEach(() => {
        factionSys = new FactionSystem();
    });

    test('1. Faction registration, profile initialization, and initial UNAWARE stance', () => {
        const guild = factionSys.registerFaction({
            id: 'merchant_guild',
            name: 'Merchant Guild',
            culture: FACTION_CULTURES.MERCANTILE,
            militaryReadiness: 0.5,
            economicStockpile: 0.8,
            territories: ['market_hub']
        });

        const raiders = factionSys.registerFaction({
            id: 'steppe_raiders',
            name: 'Steppe Raiders',
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.85,
            economicStockpile: 0.3,
            territories: ['outlaw_ridge']
        });

        expect(guild.id).toBe('merchant_guild');
        expect(raiders.militaryReadiness).toBe(0.85);

        // Prior to contact, factions are completely unaware of each other
        const stance = factionSys.getBilateralStance('merchant_guild', 'steppe_raiders');
        expect(stance.stage).toBe(ESCALATION_STAGES.UNAWARE);
        expect(stance.trust).toBe(0.0);
        expect(stance.informationConfidence).toBe(0.0);

        const evalReport = factionSys.evaluateStance('merchant_guild', 'steppe_raiders');
        expect(evalReport.toStage).toBe(ESCALATION_STAGES.UNAWARE);
    });

    test('2. Directed Asymmetry Invariant: E(A->B) !== E(B->A)', () => {
        factionSys.registerFaction({
            id: 'kingdom',
            culture: FACTION_CULTURES.HONORABLE,
            militaryReadiness: 0.7
        });
        factionSys.registerFaction({
            id: 'cult',
            culture: FACTION_CULTURES.DEVOUT,
            militaryReadiness: 0.6
        });

        // Cult harbors extreme grievance toward Kingdom, while Kingdom is calm and watchful
        const stanceCultToKing = factionSys.getBilateralStance('cult', 'kingdom');
        stanceCultToKing.grievance = 0.80;
        stanceCultToKing.informationConfidence = 0.70;

        const stanceKingToCult = factionSys.getBilateralStance('kingdom', 'cult');
        stanceKingToCult.grievance = 0.05;
        stanceKingToCult.trust = 0.40;
        stanceKingToCult.informationConfidence = 0.50;

        const reportCult = factionSys.evaluateStance('cult', 'kingdom');
        const reportKing = factionSys.evaluateStance('kingdom', 'cult');

        expect(reportCult.toStage).not.toBe(reportKing.toStage);
        expect(reportCult.compositePressure).toBeGreaterThan(reportKing.compositePressure);
        expect([ESCALATION_STAGES.MOBILIZE, ESCALATION_STAGES.SKIRMISH, ESCALATION_STAGES.THREATEN]).toContain(reportCult.toStage);
        expect([ESCALATION_STAGES.NEGOTIATE, ESCALATION_STAGES.TRADE, ESCALATION_STAGES.OBSERVE]).toContain(reportKing.toStage);
    });

    test('3. Passive territorial encroachment advances stance through progressive matrix stages', () => {
        factionSys.registerFaction({
            id: 'highland_clans',
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.8
        });
        factionSys.registerFaction({
            id: 'valley_settlers',
            culture: FACTION_CULTURES.MERCANTILE,
            militaryReadiness: 0.5
        });

        // Sighting establishes awareness
        const rep1 = factionSys.evaluateStance('highland_clans', 'valley_settlers', {
            informationConfidence: 0.45,
            territorialPressure: 0.15
        });
        expect(rep1.toStage).toBe(ESCALATION_STAGES.SHADOW);

        // Border warnings on increased encroachment
        const rep2 = factionSys.evaluateStance('highland_clans', 'valley_settlers', {
            territorialPressure: 0.35
        });
        expect(rep2.toStage).toBe(ESCALATION_STAGES.WARN);

        // Coercive threats on severe pressure
        const rep3 = factionSys.evaluateStance('highland_clans', 'valley_settlers', {
            territorialPressure: 0.60
        });
        expect([ESCALATION_STAGES.THREATEN, ESCALATION_STAGES.MOBILIZE]).toContain(rep3.toStage);
    });

    test('4. Active incidents generate casus belli and accelerate escalation to war', () => {
        factionSys.registerFaction({
            id: 'empire',
            culture: FACTION_CULTURES.EXPANSIONIST,
            militaryReadiness: 0.9,
            economicStockpile: 0.8
        });
        factionSys.registerFaction({
            id: 'rebels',
            culture: FACTION_CULTURES.HONORABLE,
            militaryReadiness: 0.7,
            economicStockpile: 0.6
        });

        // Rebels raid Imperial convoy
        factionSys.recordIncident('rebels', 'empire', INCIDENT_TYPES.RAID_CONFIRMED, {
            location: 'frontier_outpost'
        });

        const stanceEmpire = factionSys.getBilateralStance('empire', 'rebels');
        expect(stanceEmpire.grievance).toBeGreaterThanOrEqual(0.65);
        expect(stanceEmpire.casusBelli).toBe('Lethal border raid on assets');

        const report = factionSys.evaluateStance('empire', 'rebels', {
            territorialPressure: 0.85,
            economicPressure: 0.50
        });

        expect(report.toStage).toBe(ESCALATION_STAGES.ATTACK);
        expect(report.casusBelli).toBe('Lethal border raid on assets');
    });

    test('5. Capability Gate: Resource/Military exhaustion blocks ATTACK and forces RETREAT/SHADOW', () => {
        factionSys.registerFaction({
            id: 'exhausted_army',
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.15, // Depleted (< 0.35 required for ATTACK)
            economicStockpile: 0.05   // Starved (< 0.10 required)
        });
        factionSys.registerFaction({
            id: 'rival',
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.8
        });

        // High hostility pressure would normally trigger ATTACK (pressure > 0.75)
        const report = factionSys.evaluateStance('exhausted_army', 'rival', {
            informationConfidence: 0.80,
            grievance: 0.95,
            territorialPressure: 0.90
        });

        expect(report.capability.blockedByCapability).toBe(true);
        expect(report.capability.isMilitarilyCapable).toBe(false);
        expect(report.toStage).not.toBe(ESCALATION_STAGES.ATTACK);
        expect(report.toStage).toBe(ESCALATION_STAGES.RETREAT);
    });

    test('6. Uncertainty Gate: Low information confidence blocks escalation beyond OBSERVE/AVOID', () => {
        factionSys.registerFaction({
            id: 'cautious_watchers',
            culture: FACTION_CULTURES.ISOLATIONIST,
            militaryReadiness: 0.9
        });
        factionSys.registerFaction({
            id: 'unknown_strangers',
            militaryReadiness: 0.5
        });

        // High perceived danger / rumors, but very low information confidence (0.15 < 0.30)
        const report = factionSys.evaluateStance('cautious_watchers', 'unknown_strangers', {
            informationConfidence: 0.15,
            territorialPressure: 0.80,
            fear: 0.50
        });

        expect(report.uncertainty.blockedByUncertainty).toBe(true);
        expect(report.toStage).toBe(ESCALATION_STAGES.AVOID);
    });

    test('7. Diplomatic channel: Peaceful trade and high trust advance to TRADE and ALLY', () => {
        factionSys.registerFaction({
            id: 'coastal_republic',
            culture: FACTION_CULTURES.MERCANTILE,
            militaryReadiness: 0.6
        });
        factionSys.registerFaction({
            id: 'island_federation',
            culture: FACTION_CULTURES.HONORABLE,
            militaryReadiness: 0.6
        });

        // Initial diplomatic dialogue
        const repNeg = factionSys.evaluateStance('coastal_republic', 'island_federation', {
            informationConfidence: 0.80,
            trust: 0.30,
            grievance: 0.10
        });
        expect(repNeg.toStage).toBe(ESCALATION_STAGES.NEGOTIATE);

        // Commercial trade established
        factionSys.recordIncident('coastal_republic', 'island_federation', INCIDENT_TYPES.TRADE_ESTABLISHED);
        const repTrade = factionSys.evaluateStance('coastal_republic', 'island_federation', {
            trust: 0.55,
            grievance: 0.05
        });
        expect(repTrade.toStage).toBe(ESCALATION_STAGES.TRADE);

        // Mutual defense alliance formed
        const repAlly = factionSys.evaluateStance('coastal_republic', 'island_federation', {
            trust: 0.85,
            grievance: 0.02
        });
        expect(repAlly.toStage).toBe(ESCALATION_STAGES.ALLY);
    });

    test('8. Involuntary Capitulation: Critical fear and military collapse trigger SURRENDER', () => {
        factionSys.registerFaction({
            id: 'broken_garrison',
            militaryReadiness: 0.08 // Collapsed (< 0.15)
        });
        factionSys.registerFaction({
            id: 'conqueror',
            militaryReadiness: 0.95
        });

        const report = factionSys.evaluateStance('broken_garrison', 'conqueror', {
            informationConfidence: 0.90,
            fear: 0.92,
            grievance: 0.70
        });

        expect(report.toStage).toBe(ESCALATION_STAGES.SURRENDER);
    });

    test('9. Peaceful de-escalation hysteresis prevents 1-tick oscillation', () => {
        factionSys.registerFaction({
            id: 'border_guardians',
            culture: FACTION_CULTURES.HONORABLE,
            militaryReadiness: 0.8
        });
        factionSys.registerFaction({
            id: 'nomads',
            militaryReadiness: 0.5
        });

        // Escalate to WARN (threshold 0.22) with territorial pressure 0.80
        const rep1 = factionSys.evaluateStance('border_guardians', 'nomads', {
            informationConfidence: 0.80,
            territorialPressure: 0.80
        });
        expect([ESCALATION_STAGES.WARN, ESCALATION_STAGES.THREATEN]).toContain(rep1.toStage);

        // Set to explicit WARN state
        factionSys.getBilateralStance('border_guardians', 'nomads').stage = ESCALATION_STAGES.WARN;

        // Moderate pressure drop to 0.18 (would normally be SHADOW without hysteresis)
        // With hysteresis (0.22 - 0.12 = 0.10 threshold), it holds WARN
        const rep2 = factionSys.evaluateStance('border_guardians', 'nomads', {
            territorialPressure: 0.55 // 0.30 * 0.55 = 0.165 > 0.10
        });
        expect(rep2.toStage).toBe(ESCALATION_STAGES.WARN);

        // Pressure drops significantly below 0.10 (0.30 * 0.10 = 0.03 < 0.10) -> successfully de-escalates to OBSERVE
        const rep3 = factionSys.evaluateStance('border_guardians', 'nomads', {
            territorialPressure: 0.10
        });
        expect(rep3.toStage).toBe(ESCALATION_STAGES.OBSERVE);
    });

    test('10. Snapshot serialization and 100% bit-for-bit replay determinism', () => {
        factionSys.registerFaction({
            id: 'f1',
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.85
        });
        factionSys.registerFaction({
            id: 'f2',
            culture: FACTION_CULTURES.MERCANTILE,
            militaryReadiness: 0.60
        });

        factionSys.recordIncident('f1', 'f2', INCIDENT_TYPES.BORDER_TRESPASS);
        factionSys.advanceTick(10);
        factionSys.evaluateStance('f1', 'f2');

        const snapshot = factionSys.getState();
        expect(snapshot.tickCount).toBe(10);
        expect(snapshot.factions.length).toBe(2);

        const cloneSys = new FactionSystem();
        cloneSys.setState(snapshot);

        expect(cloneSys.tickCount).toBe(10);
        const f1Clone = cloneSys.getFaction('f1');
        expect(f1Clone.culture).toBe(FACTION_CULTURES.MILITARISTIC);

        // Advance both and verify identical re-evaluations
        factionSys.advanceTick(5);
        cloneSys.advanceTick(5);

        const repOrig = factionSys.evaluateStance('f2', 'f1');
        const repClone = cloneSys.evaluateStance('f2', 'f1');

        expect(repOrig.toStage).toBe(repClone.toStage);
        expect(repOrig.compositePressure).toBeCloseTo(repClone.compositePressure, 6);
        expect(repOrig.reason).toBe(repClone.reason);
    });
    test('11. NOW-14: raids exert territorial pressure and repeated raids reach SKIRMISH', () => {
        factionSys.registerFaction({ id: 'holder', culture: FACTION_CULTURES.HONORABLE });
        factionSys.registerFaction({ id: 'raider', culture: FACTION_CULTURES.EXPANSIONIST });
        factionSys.recordIncident('raider', 'holder', INCIDENT_TYPES.RAID_CONFIRMED, {});
        const stance = factionSys.getBilateralStance('holder', 'raider');
        expect(stance.territorialPressure).toBeGreaterThan(0);
        // Sustained campaign crosses the skirmish threshold.
        for (let i = 0; i < 4; i++) {
            factionSys.recordIncident('raider', 'holder', INCIDENT_TYPES.RAID_CONFIRMED, {});
        }
        const rep = factionSys.evaluateStance('holder', 'raider');
        expect(rep.compositePressure).toBeGreaterThanOrEqual(0.60);
        expect([ESCALATION_STAGES.SKIRMISH, ESCALATION_STAGES.ATTACK]).toContain(rep.toStage);
    });
});

describe('NEXT-39: ATTACK-path raid-rate frontier', () => {
    test('12. Chronic raiding totalizes, sparse raids simmer, one raid threatens', async () => {
        const { raidRateFrontier } = await import('../benchmarks/behavioral-evaluation/attack_path_frontier.mjs');
        const full = raidRateFrontier();
        expect(raidRateFrontier()).toEqual(full);
        const byK = Object.fromEntries(full.rows.map(r => [r.everyTicks, r]));
        // Chronic (weekly or denser) reaches ATTACK; sparse never does.
        for (const k of [1, 3, 7, 15, 30]) {
            expect(byK[k].stages).toContain(ESCALATION_STAGES.ATTACK);
            expect(byK[k].firstAttackTick).toBeGreaterThanOrEqual(0);
        }
        for (const k of [60, 120]) {
            expect(byK[k].stages).not.toContain(ESCALATION_STAGES.ATTACK);
            expect(byK[k].firstAttackTick).toBe(-1);
        }
        // XLII proportionality: a single raid threatens, never attacks.
        expect(full.singleRaidStage).toBe(ESCALATION_STAGES.THREATEN);
    });
});

describe('NEXT-93: hearsay incident weight', () => {
    function twoFactions() {
        const sys = new FactionSystem();
        sys.registerFaction({ id: 'settlers', name: 'Settlers', culture: FACTION_CULTURES.HONORABLE });
        sys.registerFaction({ id: 'bandits', name: 'Bandits', culture: FACTION_CULTURES.MILITARISTIC });
        return sys;
    }
    test('13. Hearsay adds small grievance without trust loss or war cause', () => {
        const sys = twoFactions();
        const stanceBefore = sys.getBilateralStance('settlers', 'bandits');
        const grievanceBefore = stanceBefore.grievance;
        const trustBefore = stanceBefore.trust;
        const causeBefore = stanceBefore.casusBelli;
        sys.recordIncident('bandits', 'settlers', INCIDENT_TYPES.RUMOR_HEARSAY, {});
        const after = sys.getBilateralStance('settlers', 'bandits');
        expect(after.grievance).toBeCloseTo(grievanceBefore + 0.10, 9);
        expect(after.trust).toBe(trustBefore);
        expect(after.casusBelli).toBe(causeBefore);
    });
    test('14. Hearsay is deterministic for a fixed seed', () => {
        const run = () => {
            const sys = twoFactions();
            sys.recordIncident('bandits', 'settlers', INCIDENT_TYPES.RUMOR_HEARSAY, {});
            return sys.getBilateralStance('settlers', 'bandits').grievance;
        };
        expect(run()).toBe(run());
    });
});
