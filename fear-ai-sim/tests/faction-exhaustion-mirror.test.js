import { describe, it, expect } from '@jest/globals';
import { FactionSystem, ESCALATION_STAGES, INCIDENT_TYPES } from '../packages/core/index.js';

// R14b: FactionSystem owns its retaliation ledger — recordIncident feeds
// it, advanceTick ages it during ATTACK-stage warfare, evaluateStance
// brakes on it without host wiring. Explicit context.warExhaustion wins.

const LADDER = [
    ESCALATION_STAGES.UNAWARE, ESCALATION_STAGES.OBSERVE, ESCALATION_STAGES.AVOID,
    ESCALATION_STAGES.WARN, ESCALATION_STAGES.NEGOTIATE, ESCALATION_STAGES.TRADE,
    ESCALATION_STAGES.SHADOW, ESCALATION_STAGES.THREATEN, ESCALATION_STAGES.MOBILIZE,
    ESCALATION_STAGES.SKIRMISH, ESCALATION_STAGES.ATTACK, ESCALATION_STAGES.RETREAT,
    ESCALATION_STAGES.SURRENDER, ESCALATION_STAGES.ALLY
];

function armedPair() {
    const sys = new FactionSystem();
    sys.registerFaction({ id: 'a', militaryReadiness: 0.9, economicStockpile: 0.9 });
    sys.registerFaction({ id: 'b', militaryReadiness: 0.9, economicStockpile: 0.9 });
    return sys;
}

function stoke(sys) {
    const stance = sys.getBilateralStance('a', 'b');
    stance.grievance = 1;
    stance.territorialPressure = 1;
    stance.economicPressure = 1;
    stance.trust = 0;
    stance.fear = 0;
    stance.informationConfidence = 1;
}

// Open combat, then grind: incidents open the ledger account, a hot
// evaluation marks the stage, ticks at war exhaust the pair.
function grindWar(sys, ticks = 40) {
    sys.recordIncident('a', 'b', INCIDENT_TYPES.RAID_CONFIRMED);
    sys.recordIncident('a', 'b', INCIDENT_TYPES.SKIRMISH_CASUALTY);
    stoke(sys);
    expect(sys.evaluateStance('a', 'b').toStage).toBe(ESCALATION_STAGES.ATTACK);
    sys.advanceTick(ticks);
}

describe('R14b: internal exhaustion mirror restrains escalation', () => {
    it('1. Fresh ledger reads zero: absent context reproduces explicit zero', () => {
        // NOTE: separate fresh systems per read — hysteresis must not
        // leak across evaluations, and every system gets stoked first.
        const sys = armedPair();
        stoke(sys);
        const absent = sys.evaluateStance('a', 'b').toStage;
        const sysB = armedPair();
        stoke(sysB);
        const explicit = sysB.evaluateStance('a', 'b', { warExhaustion: 0 }).toStage;
        const sysC = armedPair();
        stoke(sysC);
        expect(sysC.evaluateStance('a', 'b', {}).toStage).toBe(absent);
        expect(absent).toBe(explicit);
    });

    it('2. Hostile incidents open ledger accounts; trade does not', () => {
        const sys = armedPair();
        sys.recordIncident('a', 'b', INCIDENT_TYPES.RAID_CONFIRMED);
        expect(sys.retaliation.recommend('a', 'b').grievance).toBeGreaterThan(0);
        const quiet = armedPair();
        quiet.recordIncident('a', 'b', INCIDENT_TYPES.TRADE_ESTABLISHED);
        quiet.recordIncident('a', 'b', INCIDENT_TYPES.RUMOR_HEARSAY);
        expect(quiet.retaliation.recommend('a', 'b').grievance).toBe(0);
        expect(quiet.retaliation.accounts.size).toBe(0);
    });

    it('3. Ground war exhausts: mirrored brake steps stages down', () => {
        const sys = armedPair();
        grindWar(sys);
        expect(sys.retaliation.recommend('a', 'b').exhaustion).toBeGreaterThanOrEqual(0.6);
        stoke(sys);
        const mirrored = armedPair();
        // Rebuild the same decayed stance state without the ledger: the
        // explicit-zero read isolates decay from the mirrored brake.
        const decayed = sys.getBilateralStance('a', 'b');
        const stance2 = mirrored.getBilateralStance('a', 'b');
        Object.assign(stance2, {
            grievance: decayed.grievance, territorialPressure: decayed.territorialPressure,
            economicPressure: decayed.economicPressure, trust: decayed.trust,
            fear: decayed.fear, informationConfidence: decayed.informationConfidence,
            stage: decayed.stage
        });
        const withMirror = sys.evaluateStance('a', 'b').toStage;
        const withoutMirror = mirrored.evaluateStance('a', 'b', { warExhaustion: 0 }).toStage;
        expect(LADDER.indexOf(withMirror)).toBeLessThan(LADDER.indexOf(withoutMirror));
    });

    it('4. Explicit host context still overrides the mirror', () => {
        const sys = armedPair();
        grindWar(sys);
        stoke(sys);
        const mirrored = sys.evaluateStance('a', 'b').toStage;
        const overrideSys = armedPair();
        const decayed = sys.getBilateralStance('a', 'b');
        const stance2 = overrideSys.getBilateralStance('a', 'b');
        Object.assign(stance2, {
            grievance: decayed.grievance, territorialPressure: decayed.territorialPressure,
            economicPressure: decayed.economicPressure, trust: decayed.trust,
            fear: decayed.fear, informationConfidence: decayed.informationConfidence,
            stage: decayed.stage
        });
        const overridden = overrideSys.evaluateStance('a', 'b', { warExhaustion: 0 }).toStage;
        expect(LADDER.indexOf(overridden)).toBeGreaterThan(LADDER.indexOf(mirrored));
    });

    it('5. Peace recovers: cooled pairs regain the capacity to fight', () => {
        const sys = armedPair();
        grindWar(sys);
        // Cool the pair: peace gestures plus quiet evaluation.
        sys.recordIncident('a', 'b', INCIDENT_TYPES.PEACE_OFFER);
        const stance = sys.getBilateralStance('a', 'b');
        stance.grievance = 0; stance.territorialPressure = 0;
        stance.economicPressure = 0; stance.trust = 0.6; stance.fear = 0;
        sys.evaluateStance('a', 'b');
        sys.evaluateStance('b', 'a');
        sys.advanceTick(200);
        expect(sys.retaliation.recommend('a', 'b').exhaustion).toBe(0);
        // Re-ignite: the brake is gone.
        stoke(sys);
        expect(sys.evaluateStance('a', 'b').toStage).toBe(ESCALATION_STAGES.ATTACK);
    });

    it('6. Snapshot round-trips the brake; legacy snapshots restore clean', () => {
        const sys = armedPair();
        grindWar(sys);
        stoke(sys);
        const before = sys.evaluateStance('a', 'b').toStage;
        const restored = new FactionSystem();
        restored.registerFaction({ id: 'a', militaryReadiness: 0.9, economicStockpile: 0.9 });
        restored.registerFaction({ id: 'b', militaryReadiness: 0.9, economicStockpile: 0.9 });
        restored.setState(sys.getState());
        const stance = restored.getBilateralStance('a', 'b');
        Object.assign(stance, {
            grievance: 1, territorialPressure: 1, economicPressure: 1,
            trust: 0, fear: 0, informationConfidence: 1
        });
        expect(restored.evaluateStance('a', 'b').toStage).toBe(before);
        // Pre-R14b snapshot: no retaliation fields — restores without crash.
        const legacy = sys.getState();
        delete legacy.retaliationAccounts;
        delete legacy.retaliationTick;
        const legacySys = new FactionSystem();
        legacySys.registerFaction({ id: 'a' });
        legacySys.registerFaction({ id: 'b' });
        expect(() => legacySys.setState(legacy)).not.toThrow();
        expect(legacySys.retaliation.recommend('a', 'b').exhaustion).toBe(0);
    });

    it('7. Only total war tires: MOBILIZE and SKIRMISH accrue no exhaustion', () => {
        const sys = armedPair();
        sys.recordIncident('a', 'b', INCIDENT_TYPES.PROVOCATION);
        const stance = sys.getBilateralStance('a', 'b');
        stance.grievance = 0.5; stance.informationConfidence = 1;
        const stage = sys.evaluateStance('a', 'b').toStage;
        expect([ESCALATION_STAGES.MOBILIZE, ESCALATION_STAGES.THREATEN, ESCALATION_STAGES.SHADOW]).toContain(stage);
        sys.advanceTick(50);
        expect(sys.retaliation.recommend('a', 'b').exhaustion).toBe(0);
        // Skirmishing is costly but sustainable: 50 ticks at SKIRMISH
        // still accrue nothing; only ATTACK-stage warfare exhausts.
        const stance2 = sys.getBilateralStance('a', 'b');
        stance2.grievance = 1; stance2.territorialPressure = 1;
        stance2.economicPressure = 0.2; stance2.trust = 0.1;
        stance2.fear = 0; stance2.informationConfidence = 1;
        // Raw pressure 0.705: SKIRMISH band, clear of ATTACK (0.75).
        expect(sys.evaluateStance('a', 'b').toStage).toBe(ESCALATION_STAGES.SKIRMISH);
        sys.advanceTick(50);
        expect(sys.retaliation.recommend('a', 'b').exhaustion).toBe(0);
    });
});
