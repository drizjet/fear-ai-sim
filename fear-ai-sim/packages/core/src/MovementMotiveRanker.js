/**
 * packages/core/src/MovementMotiveRanker.js
 *
 * Section LVI:
 * Why does the group move — band-level motive ranking across food,
 * water, trade, safety, raiding, migration, mission, season, rumor,
 * enemy avoidance, and territorial patrol. Complements (never replaces)
 * RoamingBandSystem.evaluateDestinationUtilities: that answers WHERE,
 * this answers WHY NOW, with inspectable weights the host and designers
 * can read before any destination scores.
 *
 * Inputs are plain band-state snapshots ({ hunger, thirst, fatigue,
 * fear, wealth, archetype, dreadByRouter?, season Faktor... }); rumor
 * dread arrives as a number the host computed (e.g. from
 * AnticipatoryFearEngine), keeping this module dependency-free.
 *
 * Pure functions. Advisory only. Host owns movement.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const MOVEMENT_MOTIVES = Object.freeze([
    'FOOD', 'WATER', 'TRADE', 'SAFETY', 'RAIDING', 'MIGRATION',
    'MISSION', 'SEASON', 'RUMOR', 'ENEMY_AVOIDANCE', 'TERRITORIAL_PATROL'
]);

/** Archetype priors: which motives each band type weighs by default. */
export const ARCHETYPE_MOTIVE_PRIORS = Object.freeze({
    TRADE_CARAVAN: { TRADE: 0.9, SAFETY: 0.6, FOOD: 0.4, MISSION: 0.3 },
    BANDIT_RAIDERS: { RAIDING: 0.9, FOOD: 0.5, ENEMY_AVOIDANCE: 0.5, SAFETY: 0.2 },
    NOMADIC_TRIBE: { SEASON: 0.8, FOOD: 0.7, WATER: 0.7, MIGRATION: 0.5 },
    DISPLACED_REFUGEES: { SAFETY: 1.0, FOOD: 0.8, MIGRATION: 0.7, WATER: 0.5 },
    PATROL_GUARD: { TERRITORIAL_PATROL: 0.9, MISSION: 0.7, ENEMY_AVOIDANCE: 0.4 },
    HERD_BEASTS: { FOOD: 0.8, WATER: 0.8, SEASON: 0.5, SAFETY: 0.4 }
});

export class MovementMotiveRanker {
    /**
     * Rank motives for one band snapshot.
     * @param {object} band { hunger, thirst, fatigue, fear, wealth,
     *   archetype, rumorDread, enemyProximity, seasonPressure, missionUrgency }
     * @returns Array of { motive, weight } sorted desc.
     */
    rank(band = {}) {
        const hunger = clamp01(band.hunger ?? 0.5);
        const thirst = clamp01(band.thirst ?? 0.5);
        const fatigue = clamp01(band.fatigue ?? 0.3);
        const fear = clamp01(band.fear ?? 0.2);
        const wealth = clamp01((band.wealth ?? 50) / 100);
        const rumorDread = clamp01(band.rumorDread ?? 0);
        const enemyProximity = clamp01(band.enemyProximity ?? 0);
        const seasonPressure = clamp01(band.seasonPressure ?? 0);
        const missionUrgency = clamp01(band.missionUrgency ?? 0);
        const priors = ARCHETYPE_MOTIVE_PRIORS[band.archetype] || {};

        const raw = {
            FOOD: hunger * 0.8 + (priors.FOOD || 0.3) * 0.2,
            WATER: thirst * 0.8 + (priors.WATER || 0.3) * 0.2,
            TRADE: wealth * 0.3 + (priors.TRADE || 0.2) * 0.5 + (1 - fear) * 0.2,
            SAFETY: fear * 0.7 + rumorDread * 0.3 + (priors.SAFETY || 0.3) * 0.2,
            RAIDING: hunger * 0.3 + (priors.RAIDING || 0.1) * 0.7,
            MIGRATION: (hunger * 0.3 + fear * 0.4 + rumorDread * 0.3) * (priors.MIGRATION || 0.3),
            MISSION: missionUrgency * 0.8 + (priors.MISSION || 0.2) * 0.2,
            SEASON: seasonPressure * 0.8 + (priors.SEASON || 0.2) * 0.2,
            RUMOR: rumorDread * 0.9 + 0.05,
            ENEMY_AVOIDANCE: enemyProximity * 0.7 + fear * 0.3,
            TERRITORIAL_PATROL: (priors.TERRITORIAL_PATROL || 0.1) * 0.8 + (1 - fear) * 0.1
        };
        // Rest need damps all movement: exhausted bands want camp, not roads.
        const restNeed = fatigue * 0.4;
        return Object.entries(raw)
            .map(([motive, weight]) => ({ motive, weight: round4(Math.max(0, weight - restNeed * (motive === 'SAFETY' ? 0.3 : 0.7))) }))
            .sort((a, b) => b.weight - a.weight || (a.motive < b.motive ? -1 : 1));
    }

    /** Top motive with margin over runner-up (decisiveness signal). */
    topMotive(band) {
        const ranked = this.rank(band);
        return {
            motive: ranked[0].motive,
            weight: ranked[0].weight,
            margin: round4(Math.max(0, ranked[0].weight - ranked[1].weight)),
            ranked
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            motivesTracked: MOVEMENT_MOTIVES.length
        };
    }
}
