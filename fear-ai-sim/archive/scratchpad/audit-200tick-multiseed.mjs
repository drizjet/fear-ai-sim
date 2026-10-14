// 200-tick multi-seed long-horizon audit after the encounter
// live-wire and treaty system slices. Verifies that:
//   1. ENCOUNTER events fire in long-horizon runs (the §89
//      live-wire is stable, not just a 1-tick artifact).
//   2. TREATY_FORMED events fire when test setups exercise
//      requestPassage.
//   3. The closed-world is still deterministic across seeds
//      (no regression from the encounter/treaty wiring).
//   4. The population balance property still holds (no
//      regression from the treaty addition).
//   5. The MIGRATION event rate is still bounded (no
//      regression from the new treaty collection).

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { requestPassage, activeTreatiesFor } from '../treaty.js';

function summarize(world) {
    const counts = {};
    for (const e of world.events) {
        counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return {
        totalEvents: world.events.length,
        counts,
        treaties: world.treaties.length,
        activeTreaties: activeTreatiesFor('north-faction', world).length,
        finalNorthFaction: {
            resources: world.factions[0].resources,
            grievance: world.factions[0].grievance,
            lastDecision: world.factions[0].lastDecision,
        },
        finalSouthFaction: {
            resources: world.factions[1].resources,
            grievance: world.factions[1].grievance,
            lastDecision: world.factions[1].lastDecision,
        },
        finalTowns: Object.fromEntries(
            [...world.towns.entries()].map(([id, t]) => [id, { population: t.population }])
        ),
    };
}

const seeds = [1, 7, 42, 100, 9999];
const summaries = [];
for (const seed of seeds) {
    const world = createClosedWorldScenario();
    // Inject a treaty at tick 1 to exercise the treaty path.
    requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world, tick: 1 });
    for (let t = 1; t <= 200; t += 1) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, relationshipGate: false, seed });
    }
    summaries.push({ seed, ...summarize(world) });
}
console.log(JSON.stringify(summaries, null, 2));

// Verifications
let allOk = true;
const checks = [];
function check(name, ok, detail) {
    checks.push({ name, ok, detail });
    if (!ok) allOk = false;
}

// 1. ENCOUNTER events must fire in some long-horizon runs.
const anyEncounters = summaries.some(s => (s.counts.ENCOUNTER || 0) > 0);
check('encounter events fire in at least one seed', anyEncounters,
    summaries.map(s => s.counts.ENCOUNTER || 0));

// 2. TREATY_FORMED events must fire in all runs (we injected one).
const allHaveTreaty = summaries.every(s => (s.counts.TREATY_FORMED || 0) >= 1);
check('TREATY_FORMED in all runs', allHaveTreaty,
    summaries.map(s => s.counts.TREATY_FORMED || 0));

// 3. Determinism: same world state across two runs with the
//    same encounterRng (the §121 contract).
const w1 = createClosedWorldScenario();
const w2 = createClosedWorldScenario();
requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world: w1, tick: 1 });
requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world: w2, tick: 1 });
for (let t = 1; t <= 20; t += 1) {
    tickClosedWorld(w1, { tick: t, perceivedDanger: 0.5, relationshipGate: false, encounterRng: () => 0.999 });
    tickClosedWorld(w2, { tick: t, perceivedDanger: 0.5, relationshipGate: false, encounterRng: () => 0.999 });
}
const sameEvents = JSON.stringify(w1.events) === JSON.stringify(w2.events);
const sameTreaties = JSON.stringify(w1.treaties) === JSON.stringify(w2.treaties);
check('event log deterministic across two runs', sameEvents);
check('treaties deterministic across two runs', sameTreaties);
if (!sameEvents) {
    // Find the first difference
    for (let i = 0; i < Math.min(w1.events.length, w2.events.length); i += 1) {
        if (JSON.stringify(w1.events[i]) !== JSON.stringify(w2.events[i])) {
            console.log('First event diff at index', i);
            console.log('w1:', JSON.stringify(w1.events[i]));
            console.log('w2:', JSON.stringify(w2.events[i]));
            break;
        }
    }
    console.log('w1.events.length:', w1.events.length, 'w2.events.length:', w2.events.length);
}

// 4. Population balance: world total population conserved.
const w3 = createClosedWorldScenario();
for (let t = 1; t <= 200; t += 1) {
    tickClosedWorld(w3, { tick: t, perceivedDanger: 0.5, relationshipGate: false });
}
const popTotal = [...w3.towns.values()].reduce((s, t) => s + t.population, 0);
check('world total population conserved (2)', popTotal === 2, popTotal);

// 5. MIGRATION event rate bounded.
const migrationRate = summaries.map(s => s.counts.MIGRATION || 0);
check('MIGRATION rate bounded (avg < 5/tick)', migrationRate.every(r => r < 1000), migrationRate);

console.log('\n=== AUDIT RESULTS ===');
for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`, c.detail !== undefined ? JSON.stringify(c.detail) : '');
}
console.log(allOk ? '\nALL CHECKS PASS' : '\nSOME CHECKS FAILED');
process.exit(allOk ? 0 : 1);
