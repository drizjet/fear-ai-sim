#!/usr/bin/env node
// evidence/seed-ecology.mjs
//
// EVID-2026-08-29-ECOLOGY
//
// Seeds evidence for the ecology domain (season cycle, production
// modifier, spoilage modifier) and the SEASON_CHANGE event.
//
// Per FEAR_LONG_TERM_GOAL.md §13: "Cross the next major domain
//  boundary: ecology/resources, beginning with material
//  drought/water/production/scarcity feedback into markets, trade,
//  security and territory."

import { buildReceipt, runTestReceipt } from './receipt.mjs';

const TEST_COMMAND = '--runInBand tests/ecology-season-system.test.js tests/market-cumulative-flows-invariant.test.js';
const receipt = runTestReceipt(TEST_COMMAND, { timeoutMs: 60000, label: 'ecology full' });

const COMMON = {
    testFiles: [
        'tests/ecology-season-system.test.js',
        'tests/market-cumulative-flows-invariant.test.js',
    ],
    sourceFiles: [
        'ecology.js',
        'closed-world.js',
        'economy.js',
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

// Ecology domain
seed('CODE_EXISTS', 'C-ecology-class', 'ecology',
    'The ecology module (ecology.js) exposes SEASONS, TICKS_PER_SEASON, nextSeason, getSeasonModifier, getSpoilageModifier, and tickSeason.',
    [
        'SEASONS is the canonical cycle [SPRING, SUMMER, AUTUMN, WINTER]',
        'nextSeason cycles through SEASONS in order',
        'getSeasonModifier(season, kind) returns a clamped multiplier in [0, 2]',
    ]);
seed('UNIT_VERIFIED', 'C-ecology-unit', 'ecology',
    'The ecology primitives (nextSeason, getSeasonModifier, getSpoilageModifier) return the expected values for each season.',
    [
        'Winter food modifier (0.4) is less than summer (1.3)',
        'Spoilage modifier in summer (1.4) is higher than winter (0.6)',
    ]);
seed('LIVE_PRODUCER', 'C-ecology-live-producer', 'ecology',
    'tickClosedWorld step 0 calls tickSeason(world, tick) which emits a SEASON_CHANGE event on the configured cadence (default: every 20 ticks).',
    [
        'tickSeason advances the season on multiples of world.ticksPerSeason',
        'The SEASON_CHANGE event carries from, to, cadence, spoilageModifier',
    ]);
seed('LIVE_CONSUMER', 'C-ecology-live-consumer', 'ecology',
    'The canonical reducer applies the season modifier to town production (perCapitaProduction * getSeasonModifier(season, kind)) and to spoilage (baseSpoilRate * getSpoilageModifier(season)).',
    [
        'Winter food production is lower than summer food production over the same number of ticks',
        'Spoilage rate is temporarily multiplied during the spoil call then restored',
    ]);
seed('CONSEQUENCE_VERIFIED', 'C-ecology-consequence', 'ecology',
    'A consequence test demonstrates that an ecology change (season transition) produces a material downstream consequence: the destination market\'s food inventory is lower in winter than in summer over the same number of ticks. This is the first link in the goal §13 causal chain (season -> resource availability -> scarcity -> price -> trade -> territory -> politics).',
    [
        'tests/ecology-season-system.test.js (winter vs summer food test) asserts the consequence',
    ]);

console.log('Seeded ecology evidence.');
