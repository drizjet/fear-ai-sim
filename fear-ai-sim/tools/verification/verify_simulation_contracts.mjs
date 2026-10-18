#!/usr/bin/env node
/**
 * tools/verification/verify_simulation_contracts.mjs - the closed-world
 * simulation contracts, proven against the production reducer itself.
 *
 * Why this probe exists: Guardian V3 audit (docs/contracts/AUDIT_v1.md)
 * recorded two weakened simulation assertions, both flagged
 * IMPLEMENTATION_FIX_REQUIRED:
 *
 *   Change 4.1 (SS7.3) - CLOSED_WORLD_SIMULATION.RAID / T-SIM-001.
 *       The retired suite expected the south faction's canonical
 *       reassessment to produce RAID when forced with high grievance and
 *       full military confidence, but V3 had relaxed the assertion to "any
 *       decision". The implementation now genuinely produces RAID for the
 *       forced parameters, so the RAID expectation is restored here: a
 *       control world stays HOLD at tick 1, and the forced world (grievance
 *       0.5, militaryConfidence 1.0, riskTolerance 1.0, maxResources 4,
 *       resources 4) reaches RAID on tick 1 with the FACTION_REASSESSMENT
 *       snapshot to match.
 *
 *   Change 4.2 (SS7.4) - CLOSED_WORLD_SIMULATION.ROUTE / T-SIM-002.
 *       V3 had replaced a hard-coded `selectedRoute === 'road-c'` with an
 *       equally brittle choice. The contract proven here is structural:
 *       every MERCHANT_ROUTE_DECISION ranks ALL legal routes by ascending
 *       score with route-order tie-break, chooses the argmin unless the
 *       declared inertia window overrides it (and then the chosen route is
 *       the merchant's previous route, never the argmin), reports matching
 *       chosenScore/rejectedAlternatives, and carries a parseable reason.
 *       This holds on any future route table - nothing here names a route.
 *
 * Both contracts live at the protected-test level (registry entries and
 * T-SIM-001/T-SIM-002); neither is a BEHAVIOR_CONTRACTS.json entry.
 *
 * Deterministic: fixed seeds, no network, no ports, no test runner.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    deterministicRng,
    formClosedWorldConvoy,
} from '../../closed-world.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
void repoRoot;

let checks = 0;
function check(condition, what) {
    checks += 1;
    if (!condition) {
        console.error(`\nFAILED check ${checks}: ${what}`);
        process.exit(1);
    }
}

console.log('============================================================');
console.log('VERIFY SIMULATION CONTRACTS (forced-RAID reassessment,');
console.log('structural route-decision ranking with inertia boundary)');
console.log('============================================================');

// ---------------------------------------------------------------- section 1
// CLOSED_WORLD_SIMULATION.RAID (SS7.3): forced parameters must land on RAID.
{
    const controlWorld = createClosedWorldScenario();
    formClosedWorldConvoy(controlWorld);
    check(Array.isArray(controlWorld.factions) && controlWorld.factions.some(f => f.id === 'south-faction'),
        'control world has the canonical south faction');
    const controlSouth = controlWorld.factions.find(f => f.id === 'south-faction');
    tickClosedWorld(controlWorld, { tick: 1, perceivedDanger: 0.8, encounterRng: deterministicRng(0x5EEDBEEF) });
    check(controlSouth.lastDecision === 'HOLD',
        `control world south stays HOLD at tick 1 (got ${controlSouth.lastDecision}) - the forced fields below are what move it`);

    const forcedWorld = createClosedWorldScenario();
    formClosedWorldConvoy(forcedWorld);
    const south = forcedWorld.factions.find(f => f.id === 'south-faction');
    check(Boolean(south), 'forced world has the canonical south faction');
    south.grievance = 0.5;
    south.militaryConfidence = 1.0;
    south.riskTolerance = 1.0;
    south.maxResources = 4;
    south.resources = 4;
    tickClosedWorld(forcedWorld, { tick: 1, perceivedDanger: 0.8, encounterRng: deterministicRng(0x5EEDBEEF) });
    check(south.lastDecision === 'RAID',
        `forced south reaches RAID at tick 1 (got ${south.lastDecision}) - the V3 "any decision" weakening is closed`);
    check(Number.isFinite(south.escalation) && south.escalation > controlSouth.escalation,
        `forced south escalation (${south.escalation}) exceeds the control (${controlSouth.escalation})`);

    const southReassessments = forcedWorld.events.filter(e =>
        e.type === 'FACTION_REASSESSMENT' && e.result?.factionId === 'south-faction');
    check(southReassessments.length === 1,
        `forced tick produced exactly one south FACTION_REASSESSMENT (observed ${southReassessments.length})`);
    const reassessment = southReassessments[0];
    check(reassessment.tick === 1, `south FACTION_REASSESSMENT rides tick 1 (got ${reassessment.tick})`);
    check(reassessment.result.decision === 'RAID',
        `south FACTION_REASSESSMENT snapshot says RAID (got ${reassessment.result.decision})`);
    check(reassessment.result.escalation === south.escalation,
        `reassessment escalation snapshot (${reassessment.result.escalation}) matches the faction state (${south.escalation})`);
    check(reassessment.result.hasResources === true,
        'the RAID decision was made with resources in hand (hasResources true)');
    console.log(`  * forced-RAID reassessment: control HOLD, forced RAID at escalation ${south.escalation}: PASS`);
}

// ---------------------------------------------------------------- section 2
// CLOSED_WORLD_SIMULATION.ROUTE (SS7.4): the route decision is the ranked
// utility vector plus argmin, with the inertia window as the only override.
{
    const world = createClosedWorldScenario();
    formClosedWorldConvoy(world);
    check(Array.isArray(world.merchants) && world.merchants.length >= 1, 'route world has at least 1 merchant');
    check(Array.isArray(world.routes) && world.routes.length >= 2,
        `route world has at least 2 routes (has ${world.routes?.length ?? 'none'})`);
    const routesOrder = world.routes.map(route => route.id);
    const legalRoutes = new Set(routesOrder);

    const rng = deterministicRng(0x5EEDBEEF);
    const TICKS = 5;
    let decisionsChecked = 0;
    for (let tick = 1; tick <= TICKS; tick += 1) {
        const previousLastRoute = new Map(world.merchants.map(m => [m.id, m.lastRoute ?? null]));
        tickClosedWorld(world, { tick, perceivedDanger: 0.8, encounterRng: rng });
        const decisions = world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION' && e.tick === tick);
        check(decisions.length >= 1,
            `tick ${tick}: at least one route decision was made (observed ${decisions.length})`);
        for (const decision of decisions) {
            decisionsChecked += 1;
            const label = `tick ${tick} merchant ${decision.merchantId}`;
            const merchant = world.merchants.find(m => m.id === decision.merchantId);
            check(Boolean(merchant), `${label}: decision references a live merchant`);

            // (a) the chosen route is legal
            check(legalRoutes.has(decision.chosenRoute),
                `${label}: chosenRoute ${decision.chosenRoute} is one of the legal routes [${routesOrder.join(', ')}]`);

            // (b) the ranked vector covers every legal route exactly once
            const ranked = decision.why?.ranked;
            check(Array.isArray(ranked) && ranked.length === routesOrder.length,
                `${label}: why.ranked covers every route (observed ${ranked?.length ?? 'none'} of ${routesOrder.length})`);
            const rankedIds = new Set(ranked.map(r => r.routeId));
            check(rankedIds.size === legalRoutes.size && routesOrder.every(id => rankedIds.has(id)),
                `${label}: why.ranked route ids equal the legal set [${routesOrder.join(', ')}]`);
            check(ranked.every(r => Number.isFinite(r.score)),
                `${label}: every ranked candidate carries a finite score`);

            // (c) ascending score, ties broken by route-table order
            for (let i = 1; i < ranked.length; i += 1) {
                const prev = ranked[i - 1];
                const cur = ranked[i];
                check(prev.score <= cur.score,
                    `${label}: ranked order is score-ascending (${prev.routeId} ${prev.score} then ${cur.routeId} ${cur.score})`);
                if (prev.score === cur.score) {
                    check(routesOrder.indexOf(prev.routeId) < routesOrder.indexOf(cur.routeId),
                        `${label}: equal scores break by route-table order (${prev.routeId} before ${cur.routeId})`);
                }
            }

            // (d) the threshold snapshot reports the argmin candidacy
            check(decision.why?.threshold?.lastRoute === ranked[0].routeId,
                `${label}: why.threshold.lastRoute (${decision.why?.threshold?.lastRoute}) is the argmin route (${ranked[0].routeId})`);

            // (e) chosenScore is the chosen candidate's own score
            const chosenEntry = ranked.find(r => r.routeId === decision.chosenRoute);
            check(Boolean(chosenEntry), `${label}: the chosen route appears in the ranked vector`);
            check(decision.chosenScore === chosenEntry.score,
                `${label}: chosenScore (${decision.chosenScore}) equals the chosen candidate's score (${chosenEntry.score})`);
            check(decision.why?.chosenRoute === decision.chosenRoute,
                `${label}: why.chosenRoute mirrors the event's chosenRoute`);

            // (f) rejected alternatives = ranked minus chosen
            const rejected = decision.rejectedAlternatives;
            check(Array.isArray(rejected) && rejected.length === ranked.length - 1,
                `${label}: rejectedAlternatives has ranked-minus-one entries (observed ${rejected?.length ?? 'none'})`);
            const rejectedIds = new Set(rejected.map(r => r.routeId));
            check(rejectedIds.size === rejected.length && !rejectedIds.has(decision.chosenRoute),
                `${label}: rejectedAlternatives never contains the chosen route`);
            check([...legalRoutes].filter(id => id !== decision.chosenRoute).every(id => rejectedIds.has(id)),
                `${label}: every legal non-chosen route is rejected`);
            check(rejected.every(r => Number.isFinite(r.score) && Number.isFinite(r.danger)),
                `${label}: every rejected alternative carries score and danger`);

            // (g) inertia is the ONLY override of the argmin
            const inertiaApplied = decision.why?.threshold?.inertiaApplied === true;
            if (inertiaApplied) {
                check(decision.chosenRoute === previousLastRoute.get(decision.merchantId),
                    `${label}: inertia chose the merchant's previous route (${previousLastRoute.get(decision.merchantId)})`);
                check(decision.chosenRoute !== ranked[0].routeId,
                    `${label}: inertia chose a route other than the argmin (${ranked[0].routeId})`);
            } else {
                check(decision.chosenRoute === ranked[0].routeId,
                    `${label}: without inertia the argmin (${ranked[0].routeId}) is chosen (got ${decision.chosenRoute})`);
            }

            // (h) the WHY reason is parseable identity, not prose
            check(typeof decision.reason === 'string'
                && /risk_tol=\d\.\d{2}, perceived_danger=\d\.\d{2}/.test(decision.reason),
                `${label}: reason carries risk_tol and perceived_danger (got "${decision.reason}")`);

            // alias: the encounter engine reads merchant.selectedRoute
            check(merchant.selectedRoute === decision.chosenRoute,
                `${label}: merchant.selectedRoute alias matches the decision (${merchant.selectedRoute})`);
        }
    }
    check(decisionsChecked >= TICKS,
        `every tick produced a decision (${decisionsChecked} decisions over ${TICKS} ticks)`);
    console.log(`  * structural route ranking: ${decisionsChecked} decisions, argmin/inertia boundary and rejected sets consistent: PASS`);
}

console.log('');
console.log(`All ${checks} simulation-contract assertions PASSED.`);
