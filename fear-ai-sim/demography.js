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
import { appendWorldEvent, findLatestWorldEvent, formSettlerGroup, abandonTown } from './closed-world.js';

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
    const deathsExact = population * effectiveDeathRate;
    // Births: base rate scaled by (1 - shortage).
    const effectiveBirthRate = clamp(
        BASE_BIRTH_RATE * (1 - meanShortage * (1 - SCARCITY_BIRTH_MULTIPLIER)),
        0, 1
    );
    const birthsExact = population * effectiveBirthRate;
    // Emigration: shortage * season modifier.
    const seasonKey = world.season || 'SUMMER';
    const seasonMod = SEASON_EMIGRATION_MODIFIER[seasonKey] ?? 1.0;
    const effectiveEmigrationRate = clamp(
        meanShortage * MAX_EMIGRATION_RATE * seasonMod,
        0, MAX_EMIGRATION_RATE
    );
    const emigrationExact = population * effectiveEmigrationRate;
    // E4 — sub-scale demographic resolution. Integer floors froze
    // every town below pop ~20 into a statue (pop 1: all rates
    // floor to 0 forever, so founded towns neither grew, starved,
    // nor declined). Fractional parts now accumulate in plain
    // per-town remainder buckets (save/load-safe numbers) and only
    // whole humans move. Event fields carry the applied integers,
    // so per-event conservation identities stay exact; the
    // remainder is town-held headcount-in-waiting, invisible until
    // it resolves. Single-tick-from-zero behavior is unchanged
    // (buckets start at 0, integer parts equal the old floors).
    if (!town._demoRemainder || typeof town._demoRemainder !== 'object') {
        town._demoRemainder = { births: 0, deaths: 0, emigration: 0 };
    }
    const rem = town._demoRemainder;
    const birthsTotal = birthsExact + (Number(rem.births) || 0);
    const deathsTotal = deathsExact + (Number(rem.deaths) || 0);
    const emigrationTotal = emigrationExact + (Number(rem.emigration) || 0);
    const births = Math.floor(birthsTotal);
    const deaths = Math.floor(deathsTotal);
    const emigration = Math.floor(emigrationTotal);
    rem.births = birthsTotal - births;
    rem.deaths = deathsTotal - deaths;
    rem.emigration = emigrationTotal - emigration;
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
    // E4 — the destination is the town with the lowest
    // shortage-plus-insecurity score. Security is lawful public
    // knowledge: recent BANDIT_ATTACK / CONVOY_AMBUSH events on
    // roads incident to the candidate, decayed over 40 ticks. A
    // raided town repels migrants even when its shelves are full,
    // so insecurity can empty a town (decline -> abandonment).
    // Abandoned towns are rubble, not destinations.
    const attackTickByTown = new Map();
    for (const event of world.events ?? []) {
        if (event?.type !== 'BANDIT_ATTACK' && event?.type !== 'CONVOY_AMBUSH') continue;
        if (!Number.isFinite(event?.tick)) continue;
        const roadId = event.roadId;
        if (!roadId) continue;
        const road = (world.routes ?? []).find(r => r.id === roadId);
        if (!road) continue;
        for (const end of [road.from, road.to]) {
            const prev = attackTickByTown.get(end);
            if (prev === undefined || event.tick > prev) attackTickByTown.set(end, event.tick);
        }
    }
    const insecurityOf = (townId) => {
        const last = attackTickByTown.get(townId);
        if (last === undefined) return 0;
        return 0.5 * Math.max(0, 1 - (tick - last) / 40);
    };
    const pickDestination = (originId) => {
        let best = null;
        let bestScore = Infinity;
        for (const [candId, cand] of world.towns) {
            if (candId === originId) continue;
            if (!cand || !cand.market) continue;
            if (cand.abandoned) continue;
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
            const score = candShortage + insecurityOf(candId);
            if (score < bestScore) {
                bestScore = score;
                best = candId;
            }
        }
        return best;
    };
    // Track per-town immigration so the apply step for the
    // destination accounts for it (otherwise the destination's
    // own demographic event would overwrite the immigration).
    const immigrationByTown = new Map();
    // R3: receipt per source transfer, decided once here from
    // pre-apply populations. The emission loop below must reuse
    // this receipt — re-reading post-apply populations can disagree
    // with the gate above (a town that emigrated itself away reads
    // 0 after applying, though it received when gated).
    const transferReceipt = new Map();
    for (const update of updates) {
        if (update.emigration > 0) {
            const destId = pickDestination(update.townId);
            if (destId) {
                const dest = world.towns.get(destId);
                // EVID-2026-08-29-MIGRATION-FLOOR: a town with
                // population 0 cannot receive immigrants (it
                // has nobody to settle them). Skip the
                // immigration for the 0-population case.
                const received = Boolean(dest && (dest.population || 0) > 0);
                if (received) {
                    immigrationByTown.set(destId,
                        (immigrationByTown.get(destId) || 0) + update.emigration);
                } else {
                    // E1 (settler populations): emigrants refused at a
                    // 0-pop destination camp as settlers instead of
                    // vanishing into outflow. No outflow is booked:
                    // the humans remain in the world (see
                    // formSettlerGroup + tickSettlerGroups).
                    formSettlerGroup(world, { originTownId: update.townId, size: update.emigration, tick, reason: 'MIGRATION_FLOOR_ZERO_POP' });
                }
                transferReceipt.set(update.townId, { destId, received, amount: update.emigration });
            } else {
                // E1: no destination exists at all — the emigrants camp
                // at the origin instead of being deleted into outflow.
                formSettlerGroup(world, { originTownId: update.townId, size: update.emigration, tick, reason: 'NO_DESTINATION' });
                transferReceipt.set(update.townId, { destId: null, received: false, amount: update.emigration });
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
        // E4 — inhabited-then-empty means abandoned. The flag is set
        // only by observed life (never at construction), so towns
        // initialized at 0 pop that never lived never trigger. A
        // re-founded town keeps its history and can abandon again
        // (new episode, new event).
        if (newPop > 0) {
            town.everInhabited = true;
        } else if (town.everInhabited && !town.abandoned) {
            abandonTown(world, update.townId, { tick });
        }
        if (actualDelta === 0 && update.births === 0 && update.deaths === 0 && update.emigration === 0 && immigration === 0) {
            continue;
        }
        const popEvent = {
            type: 'POPULATION_CHANGE',
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
        // V8 corrective checkpoint breadth slice
        // (Slice 9 / Demography, 2026-08-31): route the
        // POPULATION_CHANGE emission through the canonical
        // appendWorldEvent helper so it carries an
        // eventId from allocateWorldEventId and a
        // non-empty parentEventIds. Pre-fix, demography
        // used a hand-crafted template literal that
        // collided under tick reuse and skipped
        // parentEventIds entirely, breaking the causal
        // chain MIGRATION -> IMMIGRATION ->
        // POPULATION_CHANGE.
        //
        // Demography runs at step 0.5 — the first
        // event-emitting step of the tick — so there
        // are no same-tick upstream events. The
        // natural parent is the most recent
        // POPULATION_CHANGE for the same town (the
        // previous tick's demographic state). This
        // makes the per-town demographic state
        // chain MIGRATION -> POPULATION_CHANGE(T-1) ->
        // POPULATION_CHANGE(T) observable.
        const previousPopChange = findLatestWorldEvent(
            world,
            ev => ev.townId === update.townId,
            'POPULATION_CHANGE',
        );
        const popParentIds = previousPopChange?.eventId
            ? [previousPopChange.eventId]
            : [];
        const emittedPop = appendWorldEvent(world, popEvent, popParentIds);
        events.push(emittedPop);
        // Emit the immigration event separately for the source/dest
        // pair, so the audit trail can trace the migration.
        // R3: reuse the transfer receipt decided above — re-picking
        // here would read post-apply populations AND the world has
        // mutated since, so the destination could disagree.
        if (update.emigration > 0) {
            const receipt = transferReceipt.get(update.townId);
            const destId = receipt?.destId ?? null;
            const destReceives = receipt?.received ?? false;
            if (destId) {
                // Honest parentage: demography runs at step 0.5
                // before justice/migration on the same tick, so
                // a same-tick MIGRATION_DECISION does not yet
                // exist. Parent to the most recent FIRE decision
                // for the source town (tick <= current) and to
                // the previous POPULATION_CHANGE for the
                // destination so the chain is never empty after
                // the first per-town event.
                const migrationDecision = findLatestWorldEvent(
                    world,
                    ev => ev.townId === update.townId
                        && ev.decision === 'FIRE'
                        && (ev.tick ?? 0) <= tick,
                    'MIGRATION_DECISION',
                );
                const destPreviousPop = findLatestWorldEvent(
                    world,
                    ev => ev.townId === destId,
                    'POPULATION_CHANGE',
                );
                const immParentIds = [];
                if (destPreviousPop?.eventId) immParentIds.push(destPreviousPop.eventId);
                if (migrationDecision?.eventId) immParentIds.push(migrationDecision.eventId);
                // Fallback to source previous POP if dest had no history
                if (immParentIds.length === 0 && previousPopChange?.eventId) {
                    immParentIds.push(previousPopChange.eventId);
                }
                const destTown = world.towns.get(destId);
                // The immigration event should reflect the
                // destination's perspective. Use dest's most
                // recent POP newPopulation, or current dest
                // population (old value before its own update).
                const destOldPop = destPreviousPop ? destPreviousPop.newPopulation : (destTown?.population ?? 0);
                // R3 (MAT-005b): the event tells the truth recorded in
                // the receipt above — never re-read post-apply pops.
                // A dropped transfer emits received 0 with the drop
                // owned by the outflow ledger, not a phantom +N.
                const immEvent = {
                    type: 'POPULATION_CHANGE',
                    tick,
                    townId: destId,
                    previousPopulation: destOldPop,
                    newPopulation: destReceives ? destOldPop + update.emigration : destOldPop,
                    births: 0,
                    deaths: 0,
                    emigration: 0,
                    immigration: destReceives ? update.emigration : 0,
                    attemptedImmigration: update.emigration,
                    ...(destReceives ? {} : { dropReason: 'MIGRATION_FLOOR_ZERO_POP' }),
                    sourceTownId: update.townId,
                    shortage: 0,
                    season: update.season,
                    immigrationKind: 'MIGRATION_DECISION',
                };
                const emittedImm = appendWorldEvent(world, immEvent, immParentIds);
                events.push(emittedImm);
            }
        }
    }
    return events;
}
