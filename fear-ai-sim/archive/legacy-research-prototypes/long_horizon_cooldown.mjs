// Long-horizon audit for fear-ai-sim closed-world chain.
// With raidCooldown in effect (default 5 ticks).
import {
    runClosedWorldScenario
} from './closed-world.js';
import { tickClosedWorld } from './closed-world.js';

const TICKS = 200;

function snapshot(world, tick) {
    const south = world.factions.find(f => f.id === 'south-faction');
    const north = world.factions.find(f => f.id === 'north-faction');
    return {
        tick,
        south: {
            grievance: south.grievance, fear: south.fear,
            escalation: south.escalation, lastDecision: south.lastDecision,
            resources: south.resources, maxResources: south.maxResources,
            memoryOfLoss: south.memoryOfLoss, lastRaidTick: south.lastRaidTick
        },
        north: {
            grievance: north.grievance, fear: north.fear,
            escalation: north.escalation, lastDecision: north.lastDecision,
            resources: north.resources, maxResources: north.maxResources,
            memoryOfLoss: north.memoryOfLoss, lastRaidTick: north.lastRaidTick
        }
    };
}

const samples = [];
const world = runClosedWorldScenario({ perceivedDanger: 0.0 });
for (let i = 2; i <= TICKS; i++) {
    tickClosedWorld(world, { tick: i, perceivedDanger: 0.0 });
    if (i % 5 === 0) samples.push(snapshot(world, i));
}
// Count total raids per faction.
const southRaids = world.events.filter(e => e.type === 'INVASION' && e.factionId === 'south-faction').length;
const northRaids = world.events.filter(e => e.type === 'INVASION' && e.factionId === 'north-faction').length;
const southFa = world.events.filter(e => e.type === 'FACTION_ACTION' && e.factionId === 'south-faction').length;
const northFa = world.events.filter(e => e.type === 'FACTION_ACTION' && e.factionId === 'north-faction').length;
console.log(JSON.stringify({
    final: snapshot(world, TICKS),
    samples,
    raidCounts: { southRaids, northRaids, southFa, northFa }
}, null, 2));
