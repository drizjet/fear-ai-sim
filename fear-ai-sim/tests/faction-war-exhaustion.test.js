import { describe, it, expect } from '@jest/globals';
import { FactionSystem, ESCALATION_STAGES } from '../packages/core/index.js';
import { RetaliationModel } from '../packages/core/index.js';

// R14 (audit 190): war-exhaustion consumption in faction escalation.
// RetaliationModel brakes itself with exhaustion (CEASEFIRE preference),
// but FactionSystem.evaluateStance never consulted it — exhausted factions
// marched to ATTACK on pressure alone. context.warExhaustion (host-mirrored
// from retaliation accounts) now scales composite pressure by
// (1 - 0.5*exhaustion). Absent input reproduces legacy exactly.

// Hostile-ladder rank for monotonicity (capability-gated fallbacks excluded
// by using fully capable factions).
const LADDER = [
    ESCALATION_STAGES.OBSERVE, ESCALATION_STAGES.SHADOW, ESCALATION_STAGES.WARN,
    ESCALATION_STAGES.THREATEN, ESCALATION_STAGES.MOBILIZE, ESCALATION_STAGES.SKIRMISH,
    ESCALATION_STAGES.ATTACK,
];

function hotWorld() {
    const sys = new FactionSystem();
    sys.registerFaction({ id: 'a', militaryReadiness: 0.9, economicStockpile: 0.9 });
    sys.registerFaction({ id: 'b', militaryReadiness: 0.9, economicStockpile: 0.9 });
    const stance = sys.getBilateralStance('a', 'b');
    stance.grievance = 1;
    stance.territorialPressure = 1;
    stance.economicPressure = 1;
    stance.trust = 0;
    stance.fear = 0;
    stance.informationConfidence = 1;
    return sys;
}

describe('R14: war exhaustion restrains faction escalation', () => {
    it('1. Fresh factions attack on high grievance; exhaustion steps them down', () => {
        // Fresh stance objects per evaluation: hysteresis holds transitions
        // on a lived-in record, so steady states compare across clean slates.
        const fresh = hotWorld().evaluateStance('a', 'b', {}).toStage;
        expect(fresh).toBe(ESCALATION_STAGES.ATTACK);
        const spent = hotWorld().evaluateStance('a', 'b', { warExhaustion: 1 }).toStage;
        // Pressure 0.9 halves to float-dust below the 0.45 MOBILIZE line:
        // THREATEN floor from ATTACK. Boundary behavior pinned exactly.
        expect(spent).toBe(ESCALATION_STAGES.THREATEN);
    });

    it('2. Stage rank falls monotonically as exhaustion rises', () => {
        const stages = [0, 0.3, 0.6, 1.0].map((warExhaustion) => {
            const sys = hotWorld();
            return sys.evaluateStance('a', 'b', { warExhaustion }).toStage;
        });
        const ranks = stages.map((s) => LADDER.indexOf(s));
        for (const r of ranks) expect(r).toBeGreaterThanOrEqual(0);
        for (let i = 1; i < ranks.length; i++) {
            expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1]);
        }
        expect(ranks[3]).toBeLessThan(ranks[0]);
    });

    it('3. Absent or garbage exhaustion reproduces legacy exactly', () => {
        const baseline = (() => {
            const sys = hotWorld();
            return sys.evaluateStance('a', 'b', {}).toStage;
        })();
        for (const warExhaustion of [undefined, NaN, 'spent', null, -2]) {
            const sys = hotWorld();
            expect(sys.evaluateStance('a', 'b', { warExhaustion }).toStage).toBe(baseline);
        }
        // Out-of-range clamps: 5 behaves as 1.
        const sys = hotWorld();
        expect(sys.evaluateStance('a', 'b', { warExhaustion: 5 }).toStage)
            .toBe(hotWorld().evaluateStance('a', 'b', { warExhaustion: 1 }).toStage);
    });

    it('4. Zero pressure stays calm under total exhaustion (nothing invented)', () => {
        const sys = new FactionSystem();
        sys.registerFaction({ id: 'a' });
        sys.registerFaction({ id: 'b' });
        const stage = sys.evaluateStance('a', 'b', { warExhaustion: 1 }).toStage;
        expect([ESCALATION_STAGES.UNAWARE, ESCALATION_STAGES.OBSERVE]).toContain(stage);
    });

    it('5. Joint restraint: exhausted pairs hear CEASEFIRE and stand down', () => {
        // RetaliationModel side: atrocity plus a grinding war. MASSACRE
        // severity 0.9 lands grievance 0.72; 35 war ticks exhaust to 0.7
        // while grievance decays to ~0.69, keeping net pressure in the
        // CEASEFIRE band (>= 0.2 with exhaustion >= 0.6).
        const retaliation = new RetaliationModel();
        retaliation.provoke('a', 'b', 'MASSACRE');
        retaliation.advanceTick(35, true);
        const rec = retaliation.recommend('a', 'b');
        expect(rec.exhaustion).toBeGreaterThanOrEqual(0.6);
        expect(rec.intent).toBe('CEASEFIRE');
        // Faction side consumes the mirrored exhaustion account value.
        const sys = hotWorld();
        const stage = sys.evaluateStance('a', 'b', { warExhaustion: rec.exhaustion }).toStage;
        expect(LADDER.indexOf(stage)).toBeLessThan(LADDER.indexOf(ESCALATION_STAGES.ATTACK));
    });

    it('6. Same inputs replay identical stages', () => {
        const run = () => hotWorld().evaluateStance('a', 'b', { warExhaustion: 0.7 }).toStage;
        expect(run()).toBe(run());
    });
});
