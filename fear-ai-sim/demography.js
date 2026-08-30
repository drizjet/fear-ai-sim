// demography.js
//
// EVID-2026-08-29-DEMOGRAPHY
//
// Per FEAR_LONG_TERM_GOAL.md §14: "Population accounting:
// nextPopulation = population + births + immigration - deaths - emigration
//  No unexplained people. Migration changes geography, labor,
//  demand, information and politics."
//
// This module exposes the smallest useful demographic loop:
// per-tick per-town population update that responds to scarcity
// (food shortage) and ecology (season). The full migration
// chain (war -> displacement -> receiving settlement) is a
// follow-up slice; this is the first link.

import { clamp } from './math-utils.js';

// Base birth rate per population per tick. Default 0.01 (1% per
// tick is fast; intended to be tuned). At population=1 this is
// 0.01 births/tick, so it takes ~100 ticks for the population
// to grow by 1.
const BASE_BIRTH_RATE = 0.01;

// Base death rate per population per tick. Default 0.005
// (0.5%/tick). At population=1, deaths per tick < 1, so we
// use a probability roll.
const BASE_DEATH_RATE = 0.005;

// Scarcity multiplier: when food shortage is high, death rate
// rises and birth rate falls.
const SCARCITY_DEATH_MULTIPLIER = 4.0; // at shortage=1, death = 0.02
const SCARCITY_BIRTH_MULTIPLIER = 0.2;  // at shortage=1, birth = 0.002

// Migration rate per population per tick when conditions are
// severe. 0.05 means 5% of the population can emigrate per tick
// when shortage is 1.
const MAX_EMIGRATION_RATE = 0.05;

// Season modifier for migration: in winter, emigration is more
// attractive (cold + scarcity = "go somewhere else").
const SEASON_EMIGRATION_MODIFIER = {
    SPRING: 0.8,
    SUMMER: 0.5,
    AUTUMN: 1.0,
    WINTER: 1.5,
};

/**
 * Compute the demographic update for a single town this tick.
 *
 * @param {object} world  the canonical world
 * @param {string} townId the town id
 * @param {number} tick   the current tick
 * @returns {object|null} { births, deaths, emigration, newPopulation, shortage, season }
 */
export function computeDemographicUpdate(world, townId, tick) {
    if (!world || !world.towns) return null;
    const town = world.towns.get(townId);
    if (!town) return null;
    const population = Math.max(0, Math.floor(Number(town.population) || 0));
    if (population === 0) return null;
    // Compute mean food shortage.
    let totalShortage = 0;
    let count = 0;
    const market = town.market;
    if (market && typeof market.getQuote === 'function') {
        const consumes = (typeof town.consumes === 'object' && town.consumes) || { food: 1 };
        for (const kind of Object.keys(consumes)) {
            const q = market.getQuote(kind);
            if (q && Number.isFinite(q.shortage)) {
                totalShortage += q.shortage;
                count += 1;
            }
        }
    }
    const meanShortage = count > 0 ? totalShortage / count : 0;
    // Deaths: base rate + scarcity-driven rate.
    const effectiveDeathRate = clamp(
        BASE_DEATH_RATE + meanShortage * SCARCITY_DEATH_MULTIPLIER * BASE_DEATH_RATE,
        0, 1
    );
    const deaths = Math.floor(population * effectiveDeathRate);
    // Births: base rate scaled by (1 - shortage).
    const effectiveBirthRate = clamp(
        BASE_BIRTH_RATE * (1 - meanShortage * (1 - SCARCITY_BIRTH_MULTIPLIER)),
        0, 1
    );
    const births = Math.floor(population * effectiveBirthRate);
    // Emigration: shortage * season modifier.
    const seasonKey = world.season || 'SUMMER';
    const seasonMod = SEASON_EMIGRATION_MODIFIER[seasonKey] ?? 1.0;
    const effectiveEmigrationRate = clamp(
        meanShortage * MAX_EMIGRATION_RATE * seasonMod,
        0, MAX_EMIGRATION_RATE
    );
    const emigration = Math.floor(population * effectiveEmigrationRate);
    const newPopulation = Math.max(0, population + births - deaths - emigration);
    return {
        tick,
        townId,
        previousPopulation: population,
        births,
        deaths,
        emigration,
        newPopulation,
        shortage: meanShortage,
        season: seasonKey,
    };
}

/**
 * EVID-2026-08-29-DEMOGRAPHY: apply the demographic update to
 * the town. Mutates town.population in place and emits a
 * POPULATION_CHANGE structured event. Idempotent if called
 * twice on the same tick (the second call sees the post-update
 * population and produces a delta of 0).
 *
 * EVID-2026-08-29-MIGRATION: emigrated population is routed
 * to the most viable destination town (the town with the
 * lowest food shortage that has an available capacity). The
 * receiving town gets an IMMIGRATION event with the same
 * population delta. If no viable destination exists, the
 * emigrants are lost (we don't synthesize a destination).
 */
export function tickDemography(world, tick) {
    if (!world || !world.towns) return [];
    const events = [];
    if (!Array.isArray(world.events)) world.events = [];
    // First pass: compute per-town updates (but don't apply yet
    // because we need to know total emigration before picking
    // destinations).
    const updates = [];
    for (const [townId, town] of world.towns) {
        const update = computeDemographicUpdate(world, townId, tick);
        if (update) updates.push(update);
    }
    // Second pass: pick a destination for each emigrating town.
    // The destination is the town with the lowest food shortage
    // that isn't the origin and has positive population
    // capacity (i.e., not already overcrowded).
    const pickDestination = (originId) => {
        let best = null;
        let bestShortage = Infinity;
        for (const [candId, cand] of world.towns) {
            if (candId === originId) continue;
            if (!cand || !cand.market) continue;
            let candShortage = 0;
            let count = 0;
            if (typeof cand.market.getQuote === 'function') {
                for (const kind of Object.keys(cand.consumes || {})) {
                    const q = cand.market.getQuote(kind);
                    if (q && Number.isFinite(q.shortage)) {
                        candShortage += q.shortage;
                        count += 1;
                    }
                }
                if (count > 0) candShortage = candShortage / count;
            }
            if (candShortage < bestShortage) {
                bestShortage = candShortage;
                best = candId;
            }
        }
        return best;
    };
    // Apply.
    // Track per-town immigration so the apply step for the
    // destination accounts for it (otherwise the destination's
    // own demographic event would overwrite the immigration).
    const immigrationByTown = new Map();
    for (const update of updates) {
        if (update.emigration > 0) {
            const destId = pickDestination(update.townId);
            if (destId) {
                const dest = world.towns.get(destId);
                // EVID-2026-08-29-MIGRATION-FLOOR: a town with
                // population 0 cannot receive immigrants (it
                // has nobody to settle them). Skip the
                // immigration for the 0-population case.
                if (dest && (dest.population || 0) > 0) {
                    immigrationByTown.set(destId,
                        (immigrationByTown.get(destId) || 0) + update.emigration);
                }
            }
        }
    }
    for (const update of updates) {
        const town = world.towns.get(update.townId);
        if (!town) continue;
        // Apply the demographic update: births - deaths - emigration,
        // but ADD any immigration this town received.
        const immigration = immigrationByTown.get(update.townId) || 0;
        const oldPop = town.population;
        const newPop = Math.max(0, oldPop + update.births - update.deaths - update.emigration + immigration);
        const actualDelta = newPop - oldPop;
        town.population = newPop;
        if (actualDelta === 0 && update.births === 0 && update.deaths === 0 && update.emigration === 0 && immigration === 0) {
            continue;
        }
        const popEvent = {
            type: 'POPULATION_CHANGE',
            eventId: `POPULATION_CHANGE-${tick}-${update.townId}`,
            tick,
            townId: update.townId,
            previousPopulation: oldPop,
            newPopulation: newPop,
            births: update.births,
            deaths: update.deaths,
            emigration: update.emigration,
            immigration,
            shortage: update.shortage,
            season: update.season,
        };
        world.events.push(popEvent);
        events.push(popEvent);
        // Emit the immigration event separately for the source/dest
        // pair, so the audit trail can trace the migration.
        if (update.emigration > 0) {
            const destId = pickDestination(update.townId);
            if (destId) {
                const immEvent = {
                    type: 'POPULATION_CHANGE',
                    eventId: `POPULATION_CHANGE-${tick}-${destId}-immigration`,
                    tick,
                    townId: destId,
                    previousPopulation: newPop - immigration,
                    newPopulation: newPop,
                    births: 0,
                    deaths: 0,
                    emigration: 0,
                    immigration: update.emigration,
                    sourceTownId: update.townId,
                    shortage: 0,
                    season: update.season,
                };
                world.events.push(immEvent);
                events.push(immEvent);
            }
        }
    }
    return events;
}
