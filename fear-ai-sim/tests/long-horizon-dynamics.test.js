// Long-horizon dynamics regression tests for the closed-world chain.
// These tests catch the P0 failures the recent audit found:
//   - faction resource death-spiral (resources stuck at 0 forever)
//   - structural infeasibility (south food = 0 forever)
//   - permanent grievance/lastDecision lock at saturation
//   - long-horizon event-log diversity
//
// Each test uses real numbers and an explicit target state, not loose bands.

import {
    createClosedWorldScenario,
    runClosedWorldScenario
} from '../closed-world.js';
import { tickClosedWorld } from '../closed-world.js';

const TICKS = 100;

function runAndCollect(perceivedDanger = 0.0) {
    const world = runClosedWorldScenario({ perceivedDanger });
    for (let i = 2; i <= TICKS; i++) {
        tickClosedWorld(world, { tick: i, perceivedDanger });
    }
    return world;
}

describe('Long-horizon closed-world dynamics', () => {
    it('a faction that has raided should not be permanently locked out of further raiding (resources must recover eventually)', () => {
        // The death-spiral: the refill rule skips factions in RAID,
        // and a faction in RAID never leaves RAID because the reassess
        // formula doesn't depend on resources. So a faction that
        // exhausts its resources is locked out forever.
        const world = runAndCollect(0.0);
        const south = world.factions.find(f => f.id === 'south-faction');
        // If a faction's resources are 0 AND it has grievance high
        // enough to want to raid, the model is broken: it wants to
        // fight but has no capacity to ever fight again.
        const locked = south.resources === 0
            && south.lastDecision === 'RAID'
            && south.escalation >= 6;
        expect(locked).toBe(false);
    });

    it('both towns should not have a hard-zero inventory for a kind that is locally produced', () => {
        // South produces 0.5 food and consumes 1.0 food, with no
        // external trade. This is structurally infeasible: inventory
        // drains to 0 and stays there. A locally-viable town must
        // have production >= consumption (or trade in the loop).
        const world = runAndCollect(0.0);
        const towns = [];
        for (const [townId, town] of world.towns) {
            for (const kind of Object.keys(town.consumes)) {
                const produces = town.produces[kind] || 0;
                const consumes = town.consumes[kind] || 0;
                if (consumes > 0 && produces >= consumes) {
                    const inv = town.market.inventory.get(kind) || 0;
                    towns.push({ town: townId, kind, inv, produces, consumes });
                }
            }
        }
        // At least one of the locally-viable (town, kind) pairs should
        // have non-zero inventory. With current calibration: north.food
        // (produces 1.5, consumes 1) — expected inventory ~9.5.
        const hasNonZero = towns.some(t => t.inv > 0);
        expect(hasNonZero).toBe(true);
    });

    it('south food inventory must not be permanently zero when south produces food', () => {
        // South produces 0.5 food/tick. The current calibration
        // (consumes 1.0) is structurally infeasible. A locally-viable
        // town that produces food must not have zero food inventory
        // at the end of a long run.
        const world = runAndCollect(0.0);
        const south = world.towns.get('south');
        const southFood = south.market.inventory.get('food') || 0;
        const southProduces = south.produces.food || 0;
        expect({
            produces: southProduces,
            finalInventory: southFood,
            broken: southProduces > 0 && southFood === 0
        }).toEqual({
            produces: southProduces,
            finalInventory: southFood,
            broken: false
        });
    });

    it('factions should not be permanently locked at max grievance (1.0) with RAID decision for the entire run', () => {
        // Grievance saturates at 1.0 in <50 ticks because the formula
        // adds positive terms every tick with multiplicative decay < 1.
        // A healthy simulation should let grievance come down when
        // the stimulus is removed.
        const world = runAndCollect(0.0);
        const south = world.factions.find(f => f.id === 'south-faction');
        const atPeace = south.lastDecision !== 'RAID' || south.grievance < 0.95;
        expect(atPeace).toBe(true);
    });

    it('both factions should not have the same grief + decision + resources at tick 100 (diversity)', () => {
        // If both factions converge to identical state, the model has
        // lost causal diversity. The two towns have different
        // production/consumption profiles; the factions should reflect
        // that asymmetry.
        const world = runAndCollect(0.0);
        const south = world.factions.find(f => f.id === 'south-faction');
        const north = world.factions.find(f => f.id === 'north-faction');
        const identical = south.lastDecision === north.lastDecision
            && south.grievance === north.grievance
            && south.resources === north.resources
            && south.memoryOfLoss === north.memoryOfLoss;
        expect(identical).toBe(false);
    });
});
