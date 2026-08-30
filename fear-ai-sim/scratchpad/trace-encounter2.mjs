// scratchpad/trace-encounter2.mjs
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
const world = createClosedWorldScenario({ season: 'SPRING' });
world.bandits[0].roadId = 'road-c';
world.bandits[0].trafficBelief = {
    'road-a': { estimatedTraffic: 0, recency: 0.1 },
    'road-b': { estimatedTraffic: 0, recency: 0.1 },
    'road-c': { estimatedTraffic: 5, recency: 0.8 },
};
const rng = (() => { let s = 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; }; })();
for (let t = 1; t <= 5; t++) {
    tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng });
    const merchant = world.merchants[0];
    const bandit = world.bandits[0];
    const attacks = world.events.filter(e => e.type === 'BANDIT_ATTACK' && e.tick === t);
    const encounters = world.events.filter(e => e.type === 'ENCOUNTER' && e.tick === t);
    console.log(`tick ${t}: merchant on ${merchant.selectedRoute} (last ${merchant.lastRoute}), bandit on ${bandit.roadId}, cargo=${merchant.cargo}, attacks=${attacks.length}, encounters=${encounters.length}`);
}
