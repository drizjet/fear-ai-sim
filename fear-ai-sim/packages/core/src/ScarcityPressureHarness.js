/**
 * packages/core/src/ScarcityPressureHarness.js
 *
 * Section XLIX (missing link):
 * Scarcity influences migration, conflict, and morale — reads live
 * EconomicFeedbackSystem market summaries (no duplicate simulation)
 * and converts deprivation into three advisory pressures:
 * - migrationPush: famine-stricken populations should move (feeds the
 *   settlement migration system with a quantified driver).
 * - raidTemptation: starving neighbors covet stocked granaries, scaled
 *   by the existing raid-desirability math, not a second opinion.
 * - unrestMorale: internal morale erosion from prolonged deprivation.
 *
 * Takes the economy system as a duck-typed reader ({ settlementMarkets,
 * getMarketSummary, calculateRaidDesirability }) so tests can pass the
 * real simulator or a fixture. Advisory only.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export class ScarcityPressureHarness {
    /**
     * Score one settlement's scarcity pressures.
     * @param {object} econ live economy reader
     * @param {string} settlementId
     * @returns {{ deprivation, migrationPush, raidTemptation, unrestMorale, advisory }}
     */
    score(econ, settlementId) {
        if (!econ || typeof econ.getMarketSummary !== 'function') throw new Error('INVALID_ECONOMY_READER');
        const summary = econ.getMarketSummary(settlementId);
        if (!summary) throw new Error(`UNKNOWN_SETTLEMENT: ${settlementId}`);
        const deprivation = round4(clamp01(summary.desperationFearModifier / 0.6));
        const famineFactor = round4(clamp01(summary.famineTicks / 60));
        const migrationPush = round4(clamp01(deprivation * 0.7 + famineFactor * 0.3));
        let raidTemptation = 0;
        if (typeof econ.calculateRaidDesirability === 'function') {
            const raid = econ.calculateRaidDesirability(settlementId);
            raidTemptation = round4(clamp01(deprivation * 0.5 + clamp01((raid.raidUtility || 0) / 5) * 0.5));
        }
        const unrestMorale = round4(clamp01(1 - deprivation * 0.8 - famineFactor * 0.2));
        let advisory = 'STABLE';
        if (deprivation >= 0.7) advisory = 'CRITICAL_MIGRATE_OR_AID';
        else if (deprivation >= 0.4) advisory = 'STRAINED';
        else if (deprivation >= 0.15) advisory = 'WATCH';
        return { deprivation, migrationPush, raidTemptation, unrestMorale, famineTicks: summary.famineTicks, advisory };
    }

    /**
     * Score every market in the economy reader.
     * @returns Array sorted worst-first with settlement ids.
     */
    scoreAll(econ) {
        if (!econ || !(econ.settlementMarkets instanceof Map)) throw new Error('INVALID_ECONOMY_READER');
        return [...econ.settlementMarkets.keys()]
            .map((id) => ({ settlementId: String(id), ...this.score(econ, id) }))
            .sort((a, b) => b.deprivation - a.deprivation);
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0
        };
    }
}
