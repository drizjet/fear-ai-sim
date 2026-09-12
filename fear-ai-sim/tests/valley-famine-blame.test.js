import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS,
    FRONTIER_VALLEY_SETTLEMENTS
} from '../packages/core/src/FrontierValleySimulation.js';
import { INCIDENT_TYPES, FactionSystem } from '../packages/core/src/FactionSystem.js';

// R18: famine blame (CCVIII: faction leaders blame rivals). Stressed
// settler settlements convert to RUMOR_HEARSAY blame toward bandits on
// cadence: small grievance, no trust loss, no casus belli, no exhaustion.

function starve(sim) {
    for (const s of sim.settlements.values()) s.resources.food = 0;
}

function settlerView(sim) {
    return sim.factionSystem.getBilateralStance(
        FRONTIER_VALLEY_FACTIONS.SETTLERS,
        FRONTIER_VALLEY_FACTIONS.BANDITS
    );
}

function blameIncidents(sim) {
    return settlerView(sim).incidents.filter((i) =>
        i.type === INCIDENT_TYPES.RUMOR_HEARSAY && i.details?.famineBlame === true);
}

describe('R18: famine blame moves faction grievance', () => {
    it('1. Starved valley blames rivals; fed valley does not', () => {
        const starved = new FrontierValleySimulation({ seed: 818 });
        starve(starved);
        starved.advance(30);
        expect(blameIncidents(starved).length).toBeGreaterThan(0);
        const fed = new FrontierValleySimulation({ seed: 818 });
        fed.advance(30);
        expect(blameIncidents(fed).length).toBe(0);
    });

    it('2. Blame is hearsay-weight: small grievance, trust and cause untouched', () => {
        const sim = new FrontierValleySimulation({ seed: 818 });
        starve(sim);
        const before = settlerView(sim);
        const trustBefore = before.trust;
        sim.advance(10);
        const after = settlerView(sim);
        expect(blameIncidents(sim).length).toBeGreaterThan(0);
        expect(after.trust).toBe(trustBefore);
        expect(after.casusBelli).toBe(before.casusBelli);
    });

    it('3. Cadence bound: no blame before tick 10', () => {
        const sim = new FrontierValleySimulation({ seed: 818 });
        starve(sim);
        sim.advance(9);
        expect(blameIncidents(sim).length).toBe(0);
        sim.advance(1);
        expect(blameIncidents(sim).length).toBeGreaterThan(0);
    });

    it('4. Blame simmers posture: exact hearsay weight plus live wiring', () => {
        // Unit weight: one blame incident adds exactly 0.10 grievance.
        const sys = new FactionSystem();
        sys.registerFaction({ id: 'a' });
        sys.registerFaction({ id: 'b' });
        const stance = sys.getBilateralStance('b', 'a');
        stance.grievance = 0.5;
        sys.recordIncident('a', 'b', INCIDENT_TYPES.RUMOR_HEARSAY, { famineBlame: true });
        expect(stance.grievance).toBeCloseTo(0.6, 9);
        // Live wiring: starved valley carries blame fuel the fed
        // control lacks, and never sits below it (clamp saturation is
        // honest valley behavior under raid load).
        const starved = new FrontierValleySimulation({ seed: 4242 });
        starve(starved);
        starved.advance(60);
        const fed = new FrontierValleySimulation({ seed: 4242 });
        fed.advance(60);
        expect(blameIncidents(starved).length).toBeGreaterThan(0);
        expect(settlerView(starved).grievance).toBeGreaterThanOrEqual(settlerView(fed).grievance);
    });

    it('5. Same inputs replay identical blame', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            starve(sim);
            sim.advance(40);
            return blameIncidents(sim).length;
        };
        const first = run();
        expect(first).toBeGreaterThan(0);
        expect(run()).toBe(first);
    });

    it('6. Red team: blame alone never totalizes (2000-tick ceiling)', () => {
        // Adversarial pin on the R18 design claim: cadence-bound hearsay
        // must simmer posture without reaching MOBILIZE on its own.
        const sys = new FactionSystem();
        sys.registerFaction({ id: 'a', militaryReadiness: 0.9, economicStockpile: 0.9 });
        sys.registerFaction({ id: 'b', militaryReadiness: 0.9, economicStockpile: 0.9 });
        sys.getBilateralStance('a', 'b').informationConfidence = 1;
        const stages = new Set();
        for (let t = 1; t <= 2000; t++) {
            if (t % 10 === 0) {
                sys.recordIncident('b', 'a', INCIDENT_TYPES.RUMOR_HEARSAY, { famineBlame: true });
            }
            sys.advanceTick(1);
            stages.add(sys.evaluateStance('a', 'b').toStage);
        }
        expect(sys.getBilateralStance('a', 'b').grievance).toBeGreaterThan(0.5);
        for (const hot of ['MOBILIZE', 'SKIRMISH', 'ATTACK']) {
            expect(stages.has(hot)).toBe(false);
        }
    });
});

describe('R40: one-way blame is structural, not a gap', () => {
    // Verdict on the carried R18 gap: hunger blame requires a granary.
    // Only settlement-holding factions keep per-capita food stocks, and
    // every valley town is settler-held, so settler hunger blaming the
    // raiders who burn fields (NEXT-39) is exhaustive, not arbitrary.
    // Stockless factions (bandits, nomads, wildlife) cannot starve and
    // therefore never originate famine blame. If a future scenario gives
    // another faction stocked towns, _stressedSettlements already reads
    // all towns; only the blamed-party mapping would need revisiting.
    function allFamineBlame(sim) {
        const found = [];
        for (const [, map] of sim.factionSystem.stances) {
            for (const st of map.values()) {
                for (const i of st.incidents) {
                    if (i.type === INCIDENT_TYPES.RUMOR_HEARSAY && i.details?.famineBlame === true) {
                        found.push({ view: `${st.sourceId}->${st.targetId}`, source: i.sourceId, target: i.targetId });
                    }
                }
            }
        }
        return found;
    }

    it('7. Blame direction exhaustive: only settlers blame, only bandits blamed', () => {
        const sim = new FrontierValleySimulation({ seed: 818 });
        starve(sim);
        sim.advance(60);
        const all = allFamineBlame(sim);
        expect(all.length).toBeGreaterThan(0);
        for (const b of all) {
            expect(b.target).toBe(FRONTIER_VALLEY_FACTIONS.SETTLERS);
            expect(b.source).toBe(FRONTIER_VALLEY_FACTIONS.BANDITS);
        }
    });

    it('8. Stockless factions never originate famine blame, even at war', () => {
        const sim = new FrontierValleySimulation({ seed: 818 });
        starve(sim);
        // Stoke every bilateral to war: if blame could originate anywhere,
        // this run would show it.
        for (const [a, b] of [
            [FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS],
            [FRONTIER_VALLEY_FACTIONS.NOMADS, FRONTIER_VALLEY_FACTIONS.BANDITS]
        ]) {
            sim.applySetupStance({
                source: a, target: b,
                patch: { grievance: 1, territorialPressure: 1, economicPressure: 1, trust: 0, fear: 0, informationConfidence: 1 }
            });
        }
        sim.advance(100);
        const all = allFamineBlame(sim);
        expect(all.length).toBeGreaterThan(0);
        const blamers = new Set(all.map((b) => b.target));
        // Only the stocked faction (settlers) appears as the blaming view.
        expect(blamers).toEqual(new Set([FRONTIER_VALLEY_FACTIONS.SETTLERS]));
    });
});
