import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R41: nomad war reachability verdict. Canon runs show zero nomad combat
// with a bandit-nomad closest approach of ~84 units against a 35-unit
// encounter radius, which read as a reachability gap. Grounding shows it
// is emergent peace, not missing mechanics:
// - The classifier already covers nomads: Context 2 (BORDER_SKIRMISH +
//   COMBAT_ENGAGEMENT) fires on hot stages for ANY faction pair, and the
//   raid-consequence path treats nomads as civilized victims.
// - Canon settler-nomad stages never heat: the pair's only grievance
//   input is absent (trade builds trust per season under R32), so
//   Context 2 never triggers and every meeting stays PEACEFUL_TRADE.
// - Bandit-nomad separation is fiction: Highland ambushers vs
//   southeast foragers. Mechanism stands ready if a scenario reunites
//   them, except the advance() evaluate list covers only
//   settler-bandit and settler-nomad pairs, so a future scenario moving
//   nomads near bandits must add bandit-nomad evaluation for raid
//   grievance to convert into stages (recordIncident never moves
//   stages by itself).

const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
const N = FRONTIER_VALLEY_FACTIONS.NOMADS;
const B = FRONTIER_VALLEY_FACTIONS.BANDITS;

function collectNomadEncounters(sim, ticks) {
    const found = [];
    for (let t = 0; t < ticks; t++) {
        sim.advance(1);
        for (const e of (sim.worldSystem.activeEncounters || [])) {
            if (e.partyAId === 'nomad_clan_1' || e.partyBId === 'nomad_clan_1') {
                found.push(e);
            }
        }
    }
    return found;
}

function otherParty(e) {
    return e.partyAId === 'nomad_clan_1' ? e.partyBId : e.partyAId;
}

describe('R41: canon nomad peace is emergent, not a gap', () => {
    it('1. Nomad meetings exhaustive: only settler caravans, only peaceful trade', () => {
        for (const seed of [818, 4242, 7]) {
            const sim = new FrontierValleySimulation({ seed });
            const all = collectNomadEncounters(sim, 2000);
            expect(all.length).toBeGreaterThan(0);
            for (const e of all) {
                expect(e.advisoryResolution).toBe('PEACEFUL_TRADE');
                expect(e.encounterType).toBe('PEACEFUL_CONVERGENCE');
                expect(otherParty(e)).toBe('caravan_merchant_2');
            }
        }
    });

    it('2. Bandit-nomad separation exhaustive: never within encounter radius', () => {
        const radius = new FrontierValleySimulation({ seed: 818 }).worldSystem.config.encounterProximityRadius;
        expect(radius).toBe(35);
        for (const seed of [818, 4242, 7, 1234]) {
            const sim = new FrontierValleySimulation({ seed });
            let min = Infinity;
            for (let t = 0; t < 2000; t++) {
                sim.advance(1);
                const a = sim.worldSystem.groups.get('bandit_warband_1').position;
                const b = sim.worldSystem.groups.get('nomad_clan_1').position;
                const dd = Math.hypot(a.x - b.x, a.z - b.z);
                if (dd < min) min = dd;
            }
            expect(min).toBeGreaterThan(radius);
        }
    });

    it('3. Red team: stoked war makes nomads fight, so peace is conditional', () => {
        for (const seed of [818, 4242, 7]) {
            const sim = new FrontierValleySimulation({ seed });
            for (const [a, b] of [[S, N], [N, S], [B, N], [N, B]]) {
                sim.applySetupStance({
                    source: a, target: b,
                    patch: { grievance: 1, territorialPressure: 1, economicPressure: 1, trust: 0, fear: 0, informationConfidence: 1 }
                });
            }
            const all = collectNomadEncounters(sim, 300);
            const combats = all.filter((e) => e.advisoryResolution === 'COMBAT_ENGAGEMENT');
            expect(combats.length).toBeGreaterThan(0);
            for (const c of combats) {
                expect(c.encounterType).toBe('BORDER_SKIRMISH');
            }
        }
    });
});
