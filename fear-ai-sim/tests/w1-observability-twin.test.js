import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';
import { FactionDecisionModel } from '../factioncore.js';
import { Market } from '../economy.js';

// W1-PARTIAL-OBSERVABILITY (R2 campaign, lane B) — hidden-truth removal.
//
// Frozen contracts:
//   OBS-HIDDEN-001  No legal belief -> NEUTRAL prior, never live bandit
//                   truth (route ranking AND migration destination safety).
//   OBS-LOCALITY-001 A faction feels only attacks on roads incident to its
//                   home town (confirmedLoss / memoryOfLoss / per-target
//                   memory / memoryByActor). An unrelated town must not
//                   learn a local attack without an information path.
//
// Detector strategy: hidden-vs-visible counterfactual twin worlds with
// identical starting state and identical RNG. Where the actor has no legal
// information path to the hidden change, its belief/decision trace must be
// identical until legal information arrives (OBS-HIDDEN-001, R2.1 §A4
// composition holdout).

/**
 * A three-town world: default north/south plus a separate 'east' town
 * reachable only via road-ne, with its own faction. This is the minimal
 * topology in which road-a (north<->south) attacks are NOT local to east.
 */
function makeThreeTownWorld() {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    const eastMarket = new Market('east');
    eastMarket.setCapacity('food', 200);
    eastMarket.setDemand('food', 10, 1);
    eastMarket.setSpoilageRate('food', 0);
    eastMarket.inventory.set('food', 100);
    world.towns.set('east', {
        id: 'east',
        market: eastMarket,
        population: 10,
        consumes: { food: 1, tools: 0.2 },
        produces: { food: 1, tools: 0.1 },
        controlledBy: 'east-faction',
        homeRadius: 1, claimedRadius: 3, contestedRadius: 0,
        scarceResources: { food: true, tools: false },
        storageCapacity: { food: 200, tools: 100 },
        spoilageRate: { food: 0, tools: 0 },
    });
    world.routes.push({ id: 'road-ne', from: 'north', to: 'east', distance: 5, actualDanger: 0.1 });
    world.factions.push(new FactionDecisionModel({ id: 'east-faction', townId: 'east', resources: 2, maxResources: 2 }));
    return world;
}

describe('OBS-HIDDEN-001 — route ranking never reads live bandit truth', () => {
    it('twin worlds (bandit on road-a vs road-c): merchant with no belief produces an identical route ranking', () => {
        const makeLegacy = (banditRoadId) => {
            const world = createClosedWorldScenario();
            world.ticksPerSeason = 10000;
            // Strip the canonical identity: a legacy merchant has no
            // riskTolerance, so step 2.5 leaves selectedRoute untouched
            // and the step 2.6 legacy pass is the only consumer of the
            // perceived route danger. Belief-free: no observations, no
            // routeBeliefs — the pre-fix fallback would have injected
            // route.actualDanger based on live bandit presence.
            const m = world.merchants[0];
            m.riskTolerance = undefined;
            m.routeBeliefs = {};
            m.selectedRoute = null;
            m.activeTripCommitment = null;
            m.cargo = 10;
            world.bandits[0].roadId = banditRoadId;
            return world;
        };
        const wHidden = makeLegacy('road-c'); // bandit far from road-a
        const wVisible = makeLegacy('road-a'); // bandit right there

        tickClosedWorld(wHidden, { tick: 1, perceivedDanger: 0.5, relationshipGate: true, pinBanditRoadId: 'road-c' });
        tickClosedWorld(wVisible, { tick: 1, perceivedDanger: 0.5, relationshipGate: true, pinBanditRoadId: 'road-a' });

        const routeA = wHidden.events.find(e => e.type === 'ROUTE_SELECTED');
        const routeB = wVisible.events.find(e => e.type === 'ROUTE_SELECTED');
        expect(routeA).toBeDefined();
        expect(routeB).toBeDefined();
        // Hidden truth must not change the ranking: identical choices.
        expect(routeA.routeId).toBe(routeB.routeId);
        // And the choice must be the NEUTRAL-PRIOR outcome: with 0.5 on
        // every road, road-a (distance 5) beats road-b (distance 9).
        expect(routeA.routeId).toBe('road-a');
        // No belief was minted from ground truth either.
        expect(Object.keys(wHidden.merchants[0].routeBeliefs).length).toBe(0);
        expect(Object.keys(wVisible.merchants[0].routeBeliefs).length).toBe(0);
    });
});

describe('OBS-LOCALITY-001 — a faction feels only its own town\'s attacks', () => {
    it('an attack on road-a (north/south) leaves the east faction untouched, while a road-ne attack reaches it', () => {
        const build = (attackRoadId) => {
            const world = makeThreeTownWorld();
            // Silence the trade machinery: only the synthetic attacks exist.
            world.merchants = [];
            world.guards = [];
            world.civilians = [];
            world.vampires = [];
            world.convoy = null;
            world.convoys = [];
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: 1, roadId: attackRoadId, banditId: 'b1', lost: 10, delivered: 0 });
            return world;
        };
        // Twin worlds differ only in WHERE the attack happens.
        const wRoadA = build('road-a');   // north<->south road
        const wRoadNE = build('road-ne'); // road touching east

        tickClosedWorld(wRoadA, { tick: 1, perceivedDanger: 0.5, relationshipGate: true });
        tickClosedWorld(wRoadNE, { tick: 1, perceivedDanger: 0.5, relationshipGate: true });

        const eastA = wRoadA.factions.find(f => f.id === 'east-faction');
        const eastNE = wRoadNE.factions.find(f => f.id === 'east-faction');
        const northA = wRoadA.factions.find(f => f.id === 'north-faction');

        // road-a is NOT incident to east: the east faction must not feel it.
        expect(eastA.memoryOfLoss).toBe(0);
        expect(eastA.grievance).toBeCloseTo(0, 5);
        expect(eastA.memoryByActor?.['b1']).toBeUndefined();
        // road-ne IS incident to east: the east faction must feel it.
        expect(eastNE.memoryOfLoss).toBeGreaterThan(0);
        expect(eastNE.grievance).toBeGreaterThan(0);
        expect(eastNE.memoryByActor?.['b1']).toBeGreaterThan(0);
        // North owns both roads: it feels either attack.
        expect(northA.memoryOfLoss).toBeGreaterThan(0);
    });

    it('canonical two-town guard: road-a attacks still reach BOTH canonical factions', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        world.merchants = [];
        world.guards = [];
        world.civilians = [];
        world.vampires = [];
        world.convoy = null;
        world.convoys = [];
        appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: 1, roadId: 'road-a', banditId: 'b1', lost: 10, delivered: 0 });
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5, relationshipGate: true });
        for (const fid of ['north-faction', 'south-faction']) {
            const f = world.factions.find(x => x.id === fid);
            expect(f.memoryOfLoss).toBeGreaterThan(0);
        }
    });
});

describe('OBS-HIDDEN-001 — migration destination safety uses legal beliefs, not bandit truth', () => {
    it('twin worlds (bandit present vs absent): identical safety scores from the town\'s belief surface', () => {
        const build = () => {
            const world = makeThreeTownWorld();
            // Legal information surface: north's merchant has observed/
            // rumored HIGH danger on road-a and LOW danger on road-ne.
            // The traveler's safety signal must derive from these beliefs,
            // never from live bandit truth.
            world.merchants = [{
                id: 'merchant-1',
                location: 'north',
                cargo: 0,
                riskTolerance: 0.5,
                switchingCost: 0,
                cargoValueSensitivity: 0.5,
                routeBeliefs: {
                    'road-a': { perceivedDanger: 0.8, confidence: 0.9 },
                    'road-b': { perceivedDanger: 0.5, confidence: 0.5 },
                    'road-c': { perceivedDanger: 0.5, confidence: 0.5 },
                    'road-ne': { perceivedDanger: 0.1, confidence: 0.9 },
                },
                lastRoute: null,
                lastRouteSwitchTick: -1000,
            }];
            world.guards = [];
            world.civilians = [];
            world.vampires = [];
            world.convoy = null;
            world.convoys = [];
            // Starvation pressure at north (drives migration).
            const north = world.towns.get('north');
            north.population = 10;
            north.market.setCapacity('food', 200);
            north.market.inventory.set('food', 0);
            const south = world.towns.get('south');
            south.market.setCapacity('food', 200);
            south.market.setDemand('food', 10, 1);
            south.market.inventory.set('food', 0);
            if (!world.justiceState) world.justiceState = new Map();
            world.justiceState.set('north', { legitimacy: 0.1, grievance: 0.9, migrationPressure: 0, justiceAccess: 0.4 });
            for (let t = 1; t <= 5; t++) appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a', banditId: 'x' });
            return world;
        };
        const wThreat = build(); // bandits-1 sits on road-a (default)
        const wClear = build();
        wClear.bandits = [];     // no bandit at all

        tickClosedWorld(wThreat, { tick: 6, perceivedDanger: 0.5, relationshipGate: true });
        tickClosedWorld(wClear, { tick: 6, perceivedDanger: 0.5, relationshipGate: true });

        const whyThreat = wThreat.events.find(e => e.type === 'MIGRATION_DECISION' && e.townId === 'north' && e.tick === 6);
        const whyClear = wClear.events.find(e => e.type === 'MIGRATION_DECISION' && e.townId === 'north' && e.tick === 6);
        expect(whyThreat?.why?.destinationUtilities).toBeDefined();
        expect(whyClear?.why?.destinationUtilities).toBeDefined();

        // The bandit's presence is HIDDEN from the traveler (no legal
        // observation for it): the safety scores must be IDENTICAL.
        const safetyScores = dec => dec.why.destinationUtilities.map(u => [u.townId, u.safetyScore, u.danger]);
        expect(safetyScores(whyThreat)).toEqual(safetyScores(whyClear));

        // And they must reflect the BELIEF surface exactly:
        // south (incident: road-a/b/c, belief max 0.8) -> danger 0.8, safety 0.2
        // east  (incident: road-ne,    belief 0.1)  -> danger 0.1, safety 0.9
        const southU = whyThreat.why.destinationUtilities.find(u => u.townId === 'south');
        const eastU = whyThreat.why.destinationUtilities.find(u => u.townId === 'east');
        expect(southU.danger).toBe(0.8);
        expect(southU.safetyScore).toBeCloseTo(0.2, 5);
        expect(eastU.danger).toBe(0.1);
        expect(eastU.safetyScore).toBeCloseTo(0.9, 5);
    });
});