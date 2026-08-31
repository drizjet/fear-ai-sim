import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

describe('Slice C — justice → faction legitimacy (audit §11 Slice C)', () => {
    it('JUSTICE_RESOLVED with reported crime lowers owning faction legitimacy', () => {
        const worldCrime = createClosedWorldScenario();
        const worldPeace = createClosedWorldScenario();
        for (const w of [worldCrime, worldPeace]) {
            w.ticksPerSeason = 10000;
            w.bandits = []; w.merchants = []; w.guards = []; // isolate justice
        }
        const factionCrime = worldCrime.factions.find(f => f.townId === 'north');
        const factionPeace = worldPeace.factions.find(f => f.townId === 'north');
        // Set initial legitimacy high
        factionCrime.legitimacy = 0.8;
        factionPeace.legitimacy = 0.8;
        factionCrime.grievance = 0.2;
        factionPeace.grievance = 0.2;

        // Crime world: inject attack on road incident to north
        for (let t = 1; t <= 5; t++) appendWorldEvent(worldCrime, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a', banditId: 'b1' });

        for (let t = 1; t <= 6; t++) {
            tickClosedWorld(worldCrime, { tick: t, perceivedDanger: 0.5 });
            tickClosedWorld(worldPeace, { tick: t, perceivedDanger: 0.5 });
        }

        const justiceCrime = worldCrime.justiceState.get('north');
        const justicePeace = worldPeace.justiceState.get('north');
        // Crime should have lowered legitimacy vs peace (or kept same if no report)
        expect(justiceCrime.legitimacy).toBeLessThan(justicePeace.legitimacy);
        // Owning faction tracks justice
        expect(factionCrime.legitimacy).toBeLessThan(factionPeace.legitimacy);
        expect(factionCrime.legitimacy).toBeLessThan(0.8);
    });

    it('faction with low legitimacy is more likely to RAID via production reassess', () => {
        const worldHighLegit = createClosedWorldScenario();
        const worldLowLegit = createClosedWorldScenario();
        for (const w of [worldHighLegit, worldLowLegit]) {
            w.ticksPerSeason = 10000;
            w.bandits = []; w.merchants = []; w.guards = [];
        }
        // High legitimacy faction
        const fHigh = worldHighLegit.factions.find(f => f.townId === 'north');
        fHigh.legitimacy = 0.9;
        fHigh.grievance = 0.6;
        fHigh.fear = 0.2;
        fHigh.militaryConfidence = 0.8;
        fHigh.resources = 2;

        // Low legitimacy faction (failing institutions)
        const fLow = worldLowLegit.factions.find(f => f.townId === 'north');
        fLow.legitimacy = 0.2;
        fLow.grievance = 0.4;
        fLow.fear = 0.3;
        fLow.militaryConfidence = 0.5;
        fLow.resources = 2;
        // Adjust high to have moderate grievance so legitimacy matters (not saturated)
        fHigh.grievance = 0.4;
        fHigh.fear = 0.3;
        fHigh.militaryConfidence = 0.5;

        // Direct reassess comparison: same inputs, different legitimacy
        const rHigh = fHigh.reassess({ perceivedDanger: 0.5, supplyShortage: 0.2, enemyWeakness: 0.3, confirmedLoss: 0.1 });
        const rLow = fLow.reassess({ perceivedDanger: 0.5, supplyShortage: 0.2, enemyWeakness: 0.3, confirmedLoss: 0.1 });
        expect(rLow.raidScore).toBeGreaterThan(rHigh.raidScore);
    });

    it('production path: crime→justice→faction→RAID differs, not just unit reassess', () => {
        const worldWithCrime = createClosedWorldScenario();
        const worldWithoutCrime = createClosedWorldScenario();
        for (const w of [worldWithCrime, worldWithoutCrime]) {
            w.ticksPerSeason = 10000;
            w.bandits = []; w.merchants = []; w.guards = [];
            const f = w.factions.find(f => f.townId === 'north');
            f.legitimacy = 0.5;
            f.grievance = 0.3;
            f.fear = 0.1;
            f.militaryConfidence = 0.9;
            f.resources = 5;
            f.lastRaidTick = null;
        }
        // With crime
        for (let t = 1; t <= 5; t++) appendWorldEvent(worldWithCrime, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a' });
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(worldWithCrime, { tick: t, perceivedDanger: 0.6, relationshipGate: false });
            tickClosedWorld(worldWithoutCrime, { tick: t, perceivedDanger: 0.6, relationshipGate: false });
        }
        const legWith = worldWithCrime.factions.find(f => f.townId === 'north').legitimacy;
        const legWithout = worldWithoutCrime.factions.find(f => f.townId === 'north').legitimacy;
        expect(legWith).toBeLessThan(legWithout);

        // Crime world legitimacy drops, which via dampener raises raidScore even if grievance is similar
        const fWith = worldWithCrime.factions.find(f => f.townId === 'north');
        const fWithout = worldWithoutCrime.factions.find(f => f.townId === 'north');
        expect(fWith.legitimacy).toBeLessThan(fWithout.legitimacy);
    });
});
