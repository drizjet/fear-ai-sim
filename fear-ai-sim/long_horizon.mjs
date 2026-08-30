// Long-horizon audit for fear-ai-sim closed-world chain.
// Usage: node --experimental-vm-modules long_horizon.mjs [variant]
// Variants: baseline (perceivedDanger 0.0), nervous (0.5), norraid (south maxResources 0)

import {
    createClosedWorldScenario,
    runClosedWorldScenario,
    tickClosedWorld
} from './closed-world.js';

const variant = process.argv[2] || 'baseline';
const TICKS = 200;

function snapshot(world, tick) {
    const south = world.factions.find(f => f.id === 'south-faction');
    const north = world.factions.find(f => f.id === 'north-faction');
    const towns = {};
    for (const [townId, town] of world.towns) {
        const inv = {};
        const quotes = {};
        for (const kind of ['food', 'tools']) {
            inv[kind] = town.market.inventory.get(kind) ?? 0;
            const q = town.market.getQuote(kind);
            quotes[kind] = { supply: q.supply, price: q.price, shortage: q.shortage };
        }
        towns[townId] = { inv, quotes };
    }
    return {
        tick,
        south: {
            grievance: south.grievance, fear: south.fear,
            escalation: south.escalation, lastDecision: south.lastDecision,
            resources: south.resources, maxResources: south.maxResources,
            memoryOfLoss: south.memoryOfLoss
        },
        north: {
            grievance: north.grievance, fear: north.fear,
            escalation: north.escalation, lastDecision: north.lastDecision,
            resources: north.resources, maxResources: north.maxResources,
            memoryOfLoss: north.memoryOfLoss
        },
        towns,
        eventsLen: world.events.length,
        tickHistoryLen: (world.tickHistory || []).length,
        banditRoad: world.bandits[0].roadId,
        merchantCargo: world.merchants[0].cargo
    };
}

const samples = [];

function takeSample(world, tick) {
    if (tick % 10 === 0 || tick === 1) {
        samples.push(snapshot(world, tick));
    }
}

let world, perceivedDanger, mutateSouth;
if (variant === 'norraid') {
    perceivedDanger = 0.5;
    mutateSouth = true;
} else if (variant === 'nervous') {
    perceivedDanger = 0.5;
    mutateSouth = false;
} else {
    perceivedDanger = 0.0;
    mutateSouth = false;
}

world = runClosedWorldScenario({ perceivedDanger });
takeSample(world, 1);

if (mutateSouth) {
    const south = world.factions.find(f => f.id === 'south-faction');
    south.maxResources = 0;
    south.resources = 0;
}

for (let i = 2; i <= TICKS; i++) {
    tickClosedWorld(world, { tick: i, perceivedDanger });
    takeSample(world, i);
}

console.log(JSON.stringify({ variant, perceivedDanger, samples }, null, 2));
