// 500-tick multi-seed audit
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

const results = [];
for (let seed = 0; seed < 3; seed += 1) {
    const world = createClosedWorldScenario();
    for (let t = 1; t <= 500; t += 1) {
        if ((t + seed) % 3 === 0) {
            world.events.push({
                type: 'BANDIT_ATTACK',
                roadId: 'road-a',
                banditId: 'bandits-1',
                tick: t,
                lost: 5,
                delivered: 15
            });
        }
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    const uniqueBanditRoads = new Set();
    const uniqueMerchantRoutes = new Set();
    let lastStance = null;
    let stanceChanges = 0;
    for (const entry of world.tickHistory || []) {
        if (entry.banditRoadId) uniqueBanditRoads.add(entry.banditRoadId);
        if (entry.merchantSelectedRoute) uniqueMerchantRoutes.add(entry.merchantSelectedRoute);
        if (entry.pairStanceNorthSouth && entry.pairStanceNorthSouth !== lastStance) {
            stanceChanges += 1;
            lastStance = entry.pairStanceNorthSouth;
        }
    }
    results.push({
        seed,
        uniqueBanditRoads: [...uniqueBanditRoads],
        uniqueMerchantRoutes: [...uniqueMerchantRoutes],
        stanceChanges,
        finalNorthDecision: world.factions[0].lastDecision,
        finalSouthDecision: world.factions[1]?.lastDecision,
        finalMemoryOfLoss: world.factions[0].memoryOfLoss,
        migrationCount: world.events.filter(e => e.type === 'MIGRATION').length,
        eventTypeCount: new Set(world.events.map(e => e.type)).size,
        finalNorthPop: world.towns.get('north')?.population,
        finalSouthPop: world.towns.get('south')?.population
    });
}
console.log('=== 500-tick multi-seed audit ===');
console.log(JSON.stringify(results, null, 2));
