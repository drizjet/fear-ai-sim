import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS,
    FRONTIER_VALLEY_SETTLEMENTS
} from '../packages/core/src/FrontierValleySimulation.js';
import { ESCALATION_STAGES } from '../packages/core/src/FactionSystem.js';

// R16: war displacement in the living world. While the settler-bandit
// bilateral sits at SKIRMISH/ATTACK, Northwatch sheds a cohort share on
// cadence to the most food-secure settlement; mouths are conserved and
// arrivals eat the R12 arrival meal. Peacetime moves nobody.

function stokeWar(sim) {
    sim.applySetupStance({
        source: FRONTIER_VALLEY_FACTIONS.SETTLERS,
        target: FRONTIER_VALLEY_FACTIONS.BANDITS,
        patch: {
            grievance: 1, territorialPressure: 1, economicPressure: 1,
            trust: 0, fear: 0, informationConfidence: 1
        }
    });
}
function totalPop(summary) {
    return summary.settlements.northwatch + summary.settlements.riverbend + summary.settlements.oakhaven;
}

describe('R16: war displacement moves mouths in the living world', () => {
    it('1. Cold bilateral moves nobody: the gate reads stage, not the clock', () => {
        // Valley raiders re-heat fast, so sustained peace is not a live
        // valley state; isolate the gate instead: on a cadence tick with
        // a cold stage, nothing moves.
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.advance(10);
        const before = sim.getMacroSummary().settlements;
        const moved = sim.macroMetrics.migrations;
        const stance = sim.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.BANDITS
        );
        stance.stage = ESCALATION_STAGES.OBSERVE;
        expect(sim._displaceWarRefugees()).toBe(false);
        expect(sim.getMacroSummary().settlements).toEqual(before);
        expect(sim.macroMetrics.migrations).toBe(moved);
    });

    it('2. Cadence is exact: no flight before tick 10, flight at tick 10', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(9);
        expect(sim.macroMetrics.migrations).toBe(0);
        sim.advance(1);
        expect(sim.macroMetrics.migrations).toBeGreaterThan(0);
    });

    it('3. Mouths conserved and destination diluted under war', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        const summary = sim.advance(30);
        expect(totalPop(summary)).toBe(200);
        expect(summary.settlements.northwatch).toBeLessThan(45);
        // Riverbend holds the most food, so it absorbs the cohort.
        expect(summary.settlements.riverbend).toBeGreaterThan(65);
        // Destination food diluted by arrival meals (0.5 per head).
        const riverbend = sim.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND);
        const gained = summary.settlements.riverbend - 65;
        expect(riverbend.resources.food).toBeLessThanOrEqual(95 - gained * 0.5);
    });

    it('4. Extinction floor holds under prolonged war', () => {
        const sim = new FrontierValleySimulation({ seed: 99 });
        stokeWar(sim);
        const summary = sim.advance(400);
        expect(summary.settlements.northwatch).toBeGreaterThanOrEqual(5);
        expect(totalPop(summary)).toBe(200);
    });

    it('5. Same seed replays identical displacement', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            stokeWar(sim);
            const summary = sim.advance(60);
            return { settlements: summary.settlements, migrations: sim.macroMetrics.migrations };
        };
        expect(run()).toEqual(run());
    });

    it('6. Flight fires only on hot-stage ticks under live re-heating', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(20);
        expect(sim.macroMetrics.migrations).toBeGreaterThan(0);
        // Valley raiders re-heat quickly, so hold the fields down every
        // tick and check the gate per tick: flight may fire only when the
        // tick's own evaluation re-heated to SKIRMISH/ATTACK.
        const bilateral = () => sim.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.BANDITS
        );
        let coldTicks = 0;
        for (let i = 0; i < 30; i++) {
            const stance = bilateral();
            stance.grievance = 0; stance.territorialPressure = 0;
            stance.economicPressure = 0; stance.trust = 0.8; stance.fear = 0;
            const before = sim.macroMetrics.migrations;
            sim.advance(1);
            const stage = bilateral().stage;
            if (stage !== ESCALATION_STAGES.SKIRMISH && stage !== ESCALATION_STAGES.ATTACK) {
                coldTicks++;
                expect(sim.macroMetrics.migrations).toBe(before);
            }
        }
        expect(coldTicks).toBeGreaterThan(0);
    });
});
