/**
 * Explicitly requested diagnostic scenarios, not live middleware inspection.
 * This module is imported only by the /api/sim/step and /api/trade-map routes.
 */
import { runDungeonSimulation } from '../../../examples/reference-game/simulation_runner.js';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../../../closed-world.js';

export function runReferenceReplayScenario() {
    const simResult = runDungeonSimulation();
    return {
        turnsExecuted: simResult.turns_executed,
        meanMsPerTurn: simResult.average_latency_ms,
        totalMs: Number((simResult.average_latency_ms * simResult.turns_executed).toFixed(2)),
        combatLog: simResult.authoritative_combat_log,
        milestones: simResult.milestone_snapshots,
        status: simResult.status
    };
}

export function runTradeMapScenario() {
    const world = createClosedWorldScenario();
    const merchant = world.merchants[0];
    merchant.perceptionAccuracy = 1;
    merchant.selectedRoute = 'road-a';
    merchant.lastRoute = 'road-a';
    world.bandits[0].perceptionAccuracy = 0;
    world.bandits[0].roadId = 'road-a';
    appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 1, banditId: 'bandit-1', merchantId: merchant.id });
    for (let tick = 1; tick <= 3; tick++) {
        tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
    }
    const roads = {};
    for (const id of ['road-a', 'road-b', 'road-c']) {
        const b = merchant.routeBeliefs[id] || {};
        roads[id] = { perceivedDanger: b.perceivedDanger ?? null, confidence: b.confidence ?? null, source: b.source ?? 'none' };
    }
    return { selectedRoute: merchant.selectedRoute, roads };
}
