// Quick trace script
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

const world = createClosedWorldScenario();
for (let tick = 1; tick <= 10; tick += 1) {
    tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
    const merchant = world.merchants[0];
    const bandit = world.bandits[0];
    const changed = world.events.filter(e => e.type === 'ROUTE_CHANGED');
    const selected = world.events.filter(e => e.type === 'ROUTE_SELECTED');
    console.log(`tick=${tick} bandit=${bandit.roadId} merchant=${merchant.selectedRoute} selected_events=${selected.length} change_events=${changed.length}`);
}
