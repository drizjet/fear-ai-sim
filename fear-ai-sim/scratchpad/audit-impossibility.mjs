// audit-impossibility.mjs
//
// World-Completion Directive §29: "Every six slices run
// the impossibility audit." The audit answers questions like
// "Can a passive faction become hostile? Can a trade route
// form? Can a rumor start a war?" For every required
// behavior whose answer is NO, create breadth debt.
//
// This script runs the closed-world under different
// scenarios and measures the system's ability to exhibit
// the §29 world behaviors. It also runs a 200-tick
// long-horizon trace to surface any degeneracy.

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { Market } from '../economy.js';
import { BeliefStore } from '../beliefs.js';
import { FactionDecisionModel } from '../factioncore.js';

function summarize(world) {
    const eventCounts = {};
    for (const e of world.events) {
        eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
    }
    return {
        tickHistoryLen: (world.tickHistory || []).length,
        banditRoadId: world.bandits?.[0]?.roadId,
        banditMode: world.bandits?.[0]?.mode,
        banditLocationAge: world.bandits?.[0]?.locationAge,
        banditTravelState: world.bandits?.[0]?.travelState,
        merchantRoute: world.merchants?.[0]?.selectedRoute,
        merchantLocation: world.merchants?.[0]?.location,
        merchantCargo: world.merchants?.[0]?.cargo,
        merchantBeliefKeys: Array.from(
            world.merchants?.[0]?.beliefs?.beliefs?.keys?.() ?? []
        ),
        northFaction: {
            resources: world.factions?.[0]?.resources,
            memoryOfLoss: world.factions?.[0]?.memoryOfLoss,
            lastDecision: world.factions?.[0]?.lastDecision,
            stance: world.factions?.[0]?.stance
        },
        southFaction: world.factions?.[1] ? {
            resources: world.factions?.[1]?.resources,
            memoryOfLoss: world.factions?.[1]?.memoryOfLoss,
            lastDecision: world.factions?.[1]?.lastDecision,
            stance: world.factions?.[1]?.stance
        } : null,
        northFood: world.towns?.get('north')?.market?.getQuote('food')?.supply,
        southFood: world.towns?.get('south')?.market?.getQuote('food')?.supply,
        northTools: world.towns?.get('north')?.market?.getQuote('tools')?.supply,
        southTools: world.towns?.get('south')?.market?.getQuote('tools')?.supply,
        northPop: world.towns?.get('north')?.population,
        southPop: world.towns?.get('south')?.population,
        eventCounts
    };
}

function runScenario(label, mutate, ticks = 200) {
    const world = createClosedWorldScenario();
    mutate(world);
    for (let t = 1; t <= ticks; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    const summary = summarize(world);
    summary.label = label;
    return summary;
}

// §29 Question 1: Can a passive faction become hostile?
//   (We don't have a passive faction, but we can ask
//   whether the north faction can transition from HOLD to
//   RAID under sustained attack.)
const q1 = runScenario('Q1: passive->hostile (north, low fear)', (w) => {
    w.factions[0].grievance = 0;
    w.factions[0].lastDecision = 'HOLD';
}, 200);
const q1Nervous = runScenario('Q1: passive->hostile (north, high fear)', (w) => {
    w.factions[0].grievance = 0;
    w.factions[0].lastDecision = 'HOLD';
    // High perceived danger = high fear = high grievance
}, 200);
// Use the perceivedDanger option directly
const q1Actual = runScenario('Q1: actual closed-world 200-tick (default)', () => {}, 200);
const q1NervousActual = (() => {
    const world = createClosedWorldScenario();
    for (let t = 1; t <= 200; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.95 });
    }
    const summary = summarize(world);
    summary.label = 'Q1: high fear 200-tick';
    return summary;
})();

// §29 Question 2: Can a hostile faction become peaceful?
//   (A faction that has raided can de-escalate if the
//   pressure is removed.)
const q2 = (() => {
    const world = createClosedWorldScenario();
    // Phase 1: sustain attacks
    for (let t = 1; t <= 50; t += 1) {
        if (t % 2 === 0) {
            world.events.push({
                type: 'BANDIT_ATTACK',
                roadId: 'road-a',
                banditId: 'bandits-1',
                tick: t,
                lost: 5,
                delivered: 15
            });
        }
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.9 });
    }
    const afterAttack = summarize(world);
    // Phase 2: no attacks
    for (let t = 51; t <= 150; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
    }
    const afterPeace = summarize(world);
    return { label: 'Q2: hostile->peaceful', afterAttack, afterPeace };
})();

// §29 Question 3: Can a roaming group change destination?
//   (Already proven by the live-wire, but we check the
//   200-tick trace.)
const q3 = q1Actual;

// §29 Question 4: Can a trade route form?
//   (The closed-world has 2 towns and 3 roads. The
//   merchant is at north. The merchant's route is
//   determined by chooseMerchantRoute. We check whether
//   the merchant visits road-b or road-c at any point.)
const q4 = (() => {
    const world = createClosedWorldScenario();
    const routes = [];
    for (let t = 1; t <= 50; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        routes.push(world.merchants[0].selectedRoute);
    }
    return {
        label: 'Q4: trade route form',
        uniqueRoutes: [...new Set(routes)],
        routeCounts: routes.reduce((a, r) => { a[r] = (a[r] || 0) + 1; return a; }, {})
    };
})();

// §29 Question 5: Can a town starve?
const q5 = (() => {
    const world = createClosedWorldScenario();
    // Disable production by setting produces to 0
    for (const [, town] of world.towns) {
        town.produces = { food: 0, tools: 0 };
    }
    for (let t = 1; t <= 100; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    return {
        label: 'Q5: town starve',
        northFood: world.towns.get('north').market.getQuote('food').supply,
        southFood: world.towns.get('south').market.getQuote('food').supply
    };
})();

// §29 Question 6: Can a town recover?
const q6 = (() => {
    const world = createClosedWorldScenario();
    // Phase 1: disable production (starve)
    for (const [, town] of world.towns) {
        town.produces = { food: 0, tools: 0 };
    }
    for (let t = 1; t <= 50; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    const afterStarve = world.towns.get('north').market.getQuote('food').supply;
    // Phase 2: re-enable production
    for (const [, town] of world.towns) {
        town.produces = { food: 1.5, tools: 0.1 };
    }
    world.towns.get('south').produces = { food: 1.2, tools: 0.3 };
    for (let t = 51; t <= 150; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    return {
        label: 'Q6: town recover',
        foodAfterStarve: afterStarve,
        foodAfterRecovery: world.towns.get('north').market.getQuote('food').supply
    };
})();

// §29 Question 7: Can a faction remember harm from a specific actor?
const q7 = (() => {
    const world = createClosedWorldScenario();
    // Inject 5 attacks from bandit-A
    for (let t = 1; t <= 5; t += 1) {
        world.events.push({
            type: 'BANDIT_ATTACK',
            roadId: 'road-a',
            banditId: 'bandit-A',
            tick: t,
            lost: 5,
            delivered: 15
        });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    const memory = world.factions[0].memoryByActor || {};
    return {
        label: 'Q7: per-target memory',
        northMemoryByActor: { ...memory },
        hasBanditA: 'bandit-A' in memory
    };
})();

// §29 Question 8: Can a merchant learn from a rumor?
const q8 = (() => {
    // Use the 3-town setup from rumor-auto-share-live.test.js
    const towns = new Map();
    for (const id of ['north', 'south', 'east']) {
        const market = new Market();
        towns.set(id, {
            id, market, population: 1,
            consumes: { food: 1 },
            produces: { food: 1.5 }
        });
    }
    const world = {
        season: 'SPRING',
        towns,
        routes: [
            { id: 'road-ns', from: 'north', to: 'south', distance: 5, actualDanger: 0.8 },
            { id: 'road-ne', from: 'north', to: 'east', distance: 7, actualDanger: 0.1 },
            { id: 'road-se', from: 'south', to: 'east', distance: 6, actualDanger: 0.1 }
        ],
        factions: [],
        bandits: [{
            id: 'bandits-1',
            roadId: 'road-ns',
            alternateRoadId: 'road-ne',
            lootExpectation: 0.5
        }],
        merchants: [
            { id: 'merchants-1', location: 'north', cargo: 20, selectedRoute: 'road-ns', beliefs: new BeliefStore() },
            { id: 'merchants-2', location: 'east', cargo: 0, selectedRoute: 'road-ne', beliefs: new BeliefStore() }
        ],
        guards: [],
        events: [],
        beliefs: new BeliefStore(),
        tickHistory: [],
        relationships: new Map(),
        consumedAttackIds: new Set()
    };
    world.events.push({
        type: 'BANDIT_ATTACK',
        roadId: 'road-ns',
        banditId: 'bandits-1',
        tick: 1,
        lost: 5,
        delivered: 15
    });
    tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
    const witnessBelief = world.merchants[0].beliefs.get('road-ns', 'perceivedDanger');
    const nonWitnessBelief = world.merchants[1].beliefs.get('road-ns', 'perceivedDanger');
    return {
        label: 'Q8: merchant learns from rumor',
        witnessHasBelief: !!witnessBelief,
        nonWitnessHasBelief: !!nonWitnessBelief,
        nonWitnessConfidence: nonWitnessBelief?.confidence
    };
})();

// §29 Question 9: Can a faction have a directed two-sided trust?
const q9 = (() => {
    const world = createClosedWorldScenario();
    // The closed-world's relationships are a Map of
    // FactionRelationshipVector. Check if they have
    // two-sided trust.
    const pair = world.relationships?.get('north-faction/south-faction');
    return {
        label: 'Q9: two-sided trust',
        relationshipKeys: pair ? Object.keys(pair) : null,
        hasTrust: pair && 'trust' in pair
    };
})();

// §29 Question 10: Can a treaty be formed?
//   (No treaty system exists.)
const q10 = { label: 'Q10: treaty formation', treatyExists: false };

// §29 Question 11: Can an encounter be instantiated from world state?
const q11 = (() => {
    const world = createClosedWorldScenario();
    for (let t = 1; t <= 20; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    const candidateEncounters = world.events.filter(e => e.type === 'CANDIDATE_ENCOUNTER');
    const encounters = world.events.filter(e => e.type === 'ENCOUNTER');
    return {
        label: 'Q11: encounter from world state',
        candidateEncounterCount: candidateEncounters.length,
        encounterCount: encounters.length
    };
})();

// §29 Question 12: Can the world continue when nothing is happening?
const q12 = (() => {
    const world = createClosedWorldScenario();
    const initialEventCount = world.events.length;
    for (let t = 1; t <= 50; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
    }
    const finalEventCount = world.events.length;
    return {
        label: 'Q12: world continues',
        eventsAtStart: initialEventCount,
        eventsAtEnd: finalEventCount,
        eventsAdded: finalEventCount - initialEventCount
    };
})();

// Print all results
const results = [
    q1Actual, q1NervousActual,
    q2,
    q3,
    q4,
    q5,
    q6,
    q7,
    q8,
    q9,
    q10,
    q11,
    q12
];
console.log('=== IMPOSSIBILITY AUDIT (directive §29) ===');
console.log(JSON.stringify(results, null, 2));
