// scripts/closed-world-relationship-trace.mjs
//
// §538 vertical-slice quantitative check for the relationship-vector
// integration. Drives the closed-world chain across multiple tick
// horizons and reports the relationship state evolution.

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

const STANCE_NAMES = {
    0: 'TOLERANT',
    1: 'WATCHFUL',
    2: 'DEFENSIVE',
    3: 'HOSTILE',
    4: 'MOBILIZING',
    5: 'LIMITED_CONFLICT',
    6: 'WAR',
    7: 'CEASEFIRE',
};

function runScenario({ ticks, perceivedDanger, feedTowns }) {
    const world = createClosedWorldScenario();
    if (feedTowns) {
        for (const town of world.towns.values()) {
            for (const kind of Object.keys(town.consumes)) {
                town.market.deliverCargo(kind, 200, { routeRisk: 0 });
            }
        }
    }
    const pair = world.relationships.values().next().value;
    const trace = [];
    for (let tick = 1; tick <= ticks; tick += 1) {
        tickClosedWorld(world, { tick, perceivedDanger, relationshipGate: true });
        trace.push({ tick, stance: pair.stance, stanceName: STANCE_NAMES[pair.stance], pressure: pair.pressure(), trust: pair.trust, grievance: pair.grievance, fear: pair.fear, territorialPressure: pair.territorialPressure });
    }
    return { trace, pair, eventCount: world.events.length, invasionCount: world.events.filter(e => e.type === 'INVASION').length, transitionCount: world.events.filter(e => e.type === 'STANCE_TRANSITION').length };
}

const scenarios = [
    { ticks: 30, perceivedDanger: 0.5, feedTowns: false, label: '30-tick, hungry towns, perceivedDanger 0.5' },
    { ticks: 30, perceivedDanger: 0.5, feedTowns: true, label: '30-tick, fed towns, perceivedDanger 0.5' },
    { ticks: 30, perceivedDanger: 0.9, feedTowns: false, label: '30-tick, hungry towns, perceivedDanger 0.9' },
    { ticks: 30, perceivedDanger: 0.0, feedTowns: true, label: '30-tick, fed towns, perceivedDanger 0.0' },
    { ticks: 60, perceivedDanger: 0.5, feedTowns: false, label: '60-tick, hungry towns, perceivedDanger 0.5' },
];

console.log('label\\tfinalStance\\tfinalPressure\\tinvasionCount\\ttransitionCount');
for (const scenario of scenarios) {
    const r = runScenario(scenario);
    const last = r.trace[r.trace.length - 1];
    console.log([scenario.label, last.stanceName, last.pressure.toFixed(3), r.invasionCount, r.transitionCount].join('\\t'));
}
