/**
 * tools/verification/verify_counterfactual_world.mjs
 *
 * Verifies the live WorldCounterfactualEngine contract without a test runner:
 * 1. Deterministic identical reports for identical seeds and interventions.
 * 2. Counterfactual mutation isolation from the source and factual branch.
 * 3. Detection of macro, settlement-only, and no-op causal outcomes.
 * 4. Explicit rejection of invalid horizons, rewinds, and unapplied targets.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import {
    COUNTERFACTUAL_MUTATIONS,
    FrontierValleySimulation,
    WorldCounterfactualEngine
} from '../../packages/core/index.js';

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
        );
    }
    return value;
}

function stable(value) {
    return JSON.stringify(canonicalize(value));
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertStableEqual(actual, expected, label) {
    if (stable(actual) !== stable(expected)) {
        throw new Error(`${label} mismatch.`);
    }
}

function expectThrow(fn, pattern, label) {
    let error = null;
    try {
        fn();
    } catch (candidate) {
        error = candidate;
    }
    assert(error, `${label}: expected an error.`);
    assert(pattern.test(String(error.message)), `${label}: unexpected error '${error.message}'.`);
}

function pacifyBandits() {
    return {
        type: COUNTERFACTUAL_MUTATIONS.PACIFY_BANDIT_RAIDERS,
        params: {}
    };
}

function scarcityShock() {
    return {
        type: COUNTERFACTUAL_MUTATIONS.DEGRADE_COMMODITY_SCARCITY,
        params: {
            settlementId: 'Riverbend',
            commodity: 'food',
            targetLevel: 0.0
        }
    };
}

function routePacification() {
    return {
        type: COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY,
        params: {
            routeId: 'HighlandPass',
            perceivedDanger: 0.05,
            baseSecurity: 0.95
        }
    };
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY WORLD COUNTERFACTUAL ENGINE');
    console.log('============================================================\n');

    const seed = 88888;
    const forkTick = 15;
    const horizonTicks = 40;

    console.log('--- Determinism and source isolation ---');
    const control = new FrontierValleySimulation({ seed });
    control.advance(forkTick);

    const source = new FrontierValleySimulation({ seed });
    const first = WorldCounterfactualEngine.runExperiment({
        simulation: source,
        forkTick,
        horizonTicks,
        mutation: pacifyBandits()
    });
    const repeat = WorldCounterfactualEngine.runExperiment({
        simulation: new FrontierValleySimulation({ seed }),
        forkTick,
        horizonTicks,
        mutation: pacifyBandits()
    });

    assertStableEqual(first, repeat, 'same seed/intervention report');
    assertStableEqual(source.getState(), control.getState(), 'source state after fork');
    assert(first.firstDivergenceTick === 16, 'pacification should diverge on the first post-fork tick.');
    assert(first.ate.meanPopulationFearDiff < 0, 'pacification should reduce mean population fear.');
    assert(first.ate.panicIncidentsDiff < 0, 'pacification should reduce panic incidents.');
    assert(first.firstDivergenceDimensions.includes('meanPopulationFear'), 'macro fear divergence should be named.');
    console.log('  * identical reports, branch isolation, and pacification effects: PASS');

    console.log('\n--- Settlement-only divergence ---');
    const scarcity = WorldCounterfactualEngine.runExperiment({
        simulation: new FrontierValleySimulation({ seed }),
        forkTick,
        horizonTicks,
        mutation: scarcityShock()
    });
    assert(scarcity.firstDivergenceTick !== null, 'settlement-only changes must not be reported as invariant.');
    assert(scarcity.firstDivergenceDimensions.includes('settlements.riverbend.population'), 'Riverbend population divergence must be named.');
    assert(scarcity.ate.settlementPopulationDiff.riverbend < 0, 'scarcity should reduce Riverbend population.');
    assert(scarcity.ate.settlementPopulationDiff.oakhaven > 0, 'scarcity should displace population to Oakhaven in this scenario.');
    assert(!scarcity.causalNarrative.includes('ZERO causal divergence'), 'non-zero settlement effects must not use the invariant narrative.');
    console.log(`  * settlement divergence at tick ${scarcity.firstDivergenceTick}: PASS`);

    console.log('\n--- Route intervention and no-op control ---');
    const route = WorldCounterfactualEngine.runExperiment({
        simulation: new FrontierValleySimulation({ seed }),
        forkTick,
        horizonTicks,
        mutation: routePacification()
    });
    assert(route.firstDivergenceTick !== null, 'route pacification should produce a causal divergence.');
    assert(route.ate.totalEncountersDiff < 0, 'route pacification should reduce encounters in the canonical scenario.');

    const invariant = WorldCounterfactualEngine.runExperiment({
        simulation: new FrontierValleySimulation({ seed }),
        forkTick,
        horizonTicks,
        mutation: {
            type: COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION,
            params: { description: 'no-op control' },
            customFn: () => {}
        }
    });
    assert(invariant.firstDivergenceTick === null, 'a no-op custom mutation should remain invariant.');
    assert(invariant.firstDivergenceDimensions.length === 0, 'invariant reports should have no divergence dimensions.');
    assertStableEqual(invariant.factualSummary, invariant.counterfactualSummary, 'no-op branch summaries');
    console.log('  * route effect and no-op invariance: PASS');

    console.log('\n--- Input and target guards ---');
    expectThrow(
        () => WorldCounterfactualEngine.runExperiment({
            simulation: new FrontierValleySimulation({ seed }),
            forkTick,
            horizonTicks: 0,
            mutation: pacifyBandits()
        }),
        /positive integer/,
        'zero horizon'
    );
    const advanced = new FrontierValleySimulation({ seed });
    advanced.advance(3);
    expectThrow(
        () => WorldCounterfactualEngine.runExperiment({
            simulation: advanced,
            forkTick: 2,
            horizonTicks: 1,
            mutation: pacifyBandits()
        }),
        /already past forkTick/,
        'rewind request'
    );
    expectThrow(
        () => WorldCounterfactualEngine.runExperiment({
            simulation: new FrontierValleySimulation({ seed }),
            forkTick,
            horizonTicks: 1,
            mutation: {
                type: COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY,
                params: { routeId: 'missing-route', perceivedDanger: 0.05 }
            }
        }),
        /did not apply/,
        'missing mutation target'
    );
    console.log('  * invalid horizon, rewind, and unapplied target guards: PASS');

    console.log('\n============================================================');
    console.log('SUCCESS: WorldCounterfactualEngine verification passed.');
    console.log('============================================================\n');
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
