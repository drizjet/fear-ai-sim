#!/usr/bin/env node
// evidence/seed-demography.mjs
//
// EVID-2026-08-29-DEMOGRAPHY
//
// Seeds evidence for the demography domain. The first link of
// the goal §14 causal chain (per-town population update driven
// by ecology + scarcity).

import { buildReceipt, runTestReceipt } from './receipt.mjs';

const TEST_COMMAND = '--runInBand tests/demography-system.test.js';
const receipt = runTestReceipt(TEST_COMMAND, { timeoutMs: 60000, label: 'demography full' });

const COMMON = {
    testFiles: [
        'tests/demography-system.test.js',
    ],
    sourceFiles: [
        'demography.js',
        'closed-world.js',
        'ecology.js',
    ],
    commandReceipt: receipt,
    useImportClosure: true,
    dryRun: false,
};

function seed(dimension, claimId, domain, claim, assertions, limitations = []) {
    return buildReceipt({
        ...COMMON,
        dimension,
        claimId,
        domain,
        claim,
        assertions,
        limitations,
    });
}

seed('CODE_EXISTS', 'C-demography-class', 'demography',
    'demography.js exposes computeDemographicUpdate and tickDemography. The update is births - deaths - emigration with per-tick per-town rate constants.',
    [
        'BASE_BIRTH_RATE = 0.01, BASE_DEATH_RATE = 0.005',
        'SCARCITY_DEATH_MULTIPLIER and SCARCITY_BIRTH_MULTIPLIER scale the rates by food shortage',
        'SEASON_EMIGRATION_MODIFIER (SPRING 0.8, SUMMER 0.5, AUTUMN 1.0, WINTER 1.5) multiplies the emigration rate',
    ]);
seed('UNIT_VERIFIED', 'C-demography-unit', 'demography',
    'computeDemographicUpdate returns a structured result with previousPopulation, newPopulation, births, deaths, emigration, shortage, and season. The conservation invariant holds (births - deaths - emigration == newPopulation - previousPopulation).',
    [
        'tests/demography-system.test.js (computeDemographicUpdate returns a structured result)',
        'tests/demography-system.test.js (conservation invariant) asserts births - deaths - emigration == newPopulation - previousPopulation',
    ]);
seed('LIVE_PRODUCER', 'C-demography-live-producer', 'demography',
    'tickClosedWorld step 0.5 calls tickDemography which emits POPULATION_CHANGE events for any town whose population changed (births/deaths/emigration non-zero).',
    [
        'tickDemography is called by tickClosedWorld',
        'POPULATION_CHANGE events are emitted with previousPopulation, newPopulation, births, deaths, emigration, shortage, season',
    ]);
seed('LIVE_CONSUMER', 'C-demography-live-consumer', 'demography',
    'tickDemography is a live consumer of: (a) town.market.getQuote(kind).shortage (per-tick scarcity), (b) world.season (per-tick ecology), and (c) town.population (the authoritative state it mutates). The produce/consume step that follows in tickClosedWorld reads the new town.population, so the demographic change is causal for the same-tick economy.',
    [
        'computeDemographicUpdate reads market.getQuote for each kind in town.consumes',
        'computeDemographicUpdate reads world.season',
        'town.population is mutated in place and the produce step uses the new value',
    ]);
seed('CONSEQUENCE_VERIFIED', 'C-demography-consequence', 'demography',
    'A consequence test demonstrates that winter + high food scarcity produces emigration > 0 from a town with population = 1000. This is the first link of the goal §14 chain: scarcity (driven by ecology) -> emigration -> population change -> downstream labor/demand/information change.',
    [
        'tests/demography-system.test.js (high scarcity + winter produces emigration > 0)',
    ]);
seed('CROSS_DOMAIN_INTEGRATED', 'C-demography-cross-domain', 'demography',
    'Emigration from one town is routed to the destination town with the lowest food shortage. The receiving town\'s population rises by exactly the emigration count, with source attribution. The global sum of populations is conserved modulo births and deaths (migration is a transfer, not a creation or destruction of people).',
    [
        'tests/demography-system.test.js (migration: emigrants from a short town arrive at a less-short town) proves the routing',
        'tests/demography-system.test.js (global conservation) proves the sum-of-populations invariant',
    ]);
seed('INTEGRATION_VERIFIED', 'C-demography-integration', 'demography',
    'An integration test exercises the full demography chain end-to-end: tickClosedWorld step 0.5 calls tickDemography, which produces POPULATION_CHANGE events with births/deaths/emigration/immigration fields, mutates town.population in place, and is consumed by step 4 (produce/consume) which reads the new population. Migration (emigration -> pickDestination -> immigration) is wired as a single two-pass loop in the same tick.',
    [
        'tests/demography-system.test.js (POPULATION_CHANGE event is emitted by tickClosedWorld) proves the integration with the canonical reducer',
        'tickDemography is wired into tickClosedWorld step 0.5 BEFORE the produce/consume step',
    ]);

console.log('Seeded demography evidence.');
