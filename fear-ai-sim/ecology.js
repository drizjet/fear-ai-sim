// ecology.js
//
// EVID-2026-08-29-ECOLOGY
//
// Per FEAR_LONG_TERM_GOAL.md §13: passive / ecology systems that
// pressure active decision-making without being directly chosen
// by any agent.
//
// This module exposes the SEASON cycle and the per-good season
// modifier that the canonical closed-world reducer (tickClosedWorld)
// applies to town production / spoilage each tick.
//
// The full causal chain (per goal §13) is:
//   season/environment
//   -> resource availability (via per-tick produce * modifier)
//   -> local scarcity (via market inventory + shortage quote)
//   -> price/need (via market.getQuote shortage field)
//   -> movement/trade (via merchant routeBeliefs and bandit
//      traffic belief)
//   -> territory (via the existing territory pass)
//   -> politics/conflict (via the existing stance/relationship).
//
// The slice implemented here is the first link: the season
// advances on a fixed cadence and modifies production / spoilage.
// The downstream connections (merchant belief, bandit payoff)
// can be added in later slices without changing this contract.

import { clamp } from './math-utils.js';
// R2: season changes flow through the allocator (chain parentage).
// ESM-cycle safe: closed-world.js already imports ecology.js, but
// appendWorldEvent is used at call time only (same pattern as
// canonical-trade-system.js and encounters.js).
import { appendWorldEvent } from './closed-world.js';

// The canonical season cycle. Order matters: nextSeason walks
// through this list cyclically.
export const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];

// One season lasts this many ticks. Default: 20. Configurable
// per-world via `world.ticksPerSeason` so experiments can
// compress or expand the cycle.
export const TICKS_PER_SEASON = 20;

// Per-season per-good multiplier on production. Winter reduces
// food (no growing season); summer raises it. Tools are not
// season-sensitive (forge production is roughly constant).
//
// Values are clamped to [0, 2] so a misconfigured season can't
// produce negative food or 10x overproduction.
const SEASON_MODIFIERS = {
    SPRING: { food: 1.0, tools: 1.0 },
    SUMMER: { food: 1.3, tools: 1.0 },
    AUTUMN: { food: 0.8, tools: 1.0 },
    WINTER: { food: 0.4, tools: 1.0 },
};

// Spoilage accelerates in summer (warm) and slows in winter (cold).
// Stored as a multiplier on the town's configured spoilage rate.
const SPOILAGE_MODIFIERS = {
    SPRING: 1.0,
    SUMMER: 1.4,
    AUTUMN: 1.0,
    WINTER: 0.6,
};

/**
 * Walk one step forward in the season cycle.
 */
export function nextSeason(current) {
    const idx = SEASONS.indexOf(current);
    if (idx < 0) return SEASONS[0];
    return SEASONS[(idx + 1) % SEASONS.length];
}

/**
 * The production multiplier for a given season + good. Defaults
 * to 1.0 for unknown combinations (defensive against new goods
 * or new seasons).
 */
export function getSeasonModifier(season, kind) {
    const table = SEASON_MODIFIERS[season] || {};
    const raw = table[kind];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1.0;
    return clamp(raw, 0, 2);
}

/**
 * The spoilage-rate multiplier for a given season. Defaults to 1.0.
 */
export function getSpoilageModifier(season) {
    const raw = SPOILAGE_MODIFIERS[season];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1.0;
    return clamp(raw, 0, 2);
}

/**
 * EVID-2026-08-29-ECOLOGY: advance the world's season if the
 * current tick crosses the per-season boundary. Emits a
 * SEASON_CHANGE structured event. Idempotent: if the season
 * already advanced this tick, no event is emitted.
 *
 * @param {object} world  canonical world
 * @param {number} tick   the current tick (1-indexed)
 * @returns {object|null} the SEASON_CHANGE event or null
 */
export function tickSeason(world, tick) {
    if (!world) return null;
    const cadence = Number.isFinite(world.ticksPerSeason)
        ? Math.max(1, world.ticksPerSeason)
        : TICKS_PER_SEASON;
    const previous = world.season || 'SPRING';
    // Season advances when the current tick is an exact multiple
    // of the cadence (tick=20, 40, 60, ...). This means after
    // `cadence` ticks have elapsed, the next tick transitions
    // to the next season. We do NOT advance at tick=1 (the
    // first tick of a fresh world is still the initial season).
    if (tick <= 0) return null;
    if (tick % cadence !== 0) return null;
    const next = nextSeason(previous);
    if (next === previous) return null;
    world.season = next;
    if (!Array.isArray(world.events)) world.events = [];
    // R2 (V8 audit F7): allocator-owned id chained to the previous
    // season change (no template ids — they collide on tick reuse
    // and forks). The chain head declares its root.
    const priorSeason = [...world.events].reverse().find(event =>
        event.type === 'SEASON_CHANGE' && typeof event.eventId === 'string');
    appendWorldEvent(world, {
        type: 'SEASON_CHANGE',
        tick,
        from: previous,
        to: next,
        cadence,
        spoilageModifier: getSpoilageModifier(next),
        ...(!priorSeason ? { rootReason: 'SEASON_CHAIN_START' } : {}),
    }, priorSeason ? [priorSeason.eventId] : []);
    return world.events[world.events.length - 1];
}
