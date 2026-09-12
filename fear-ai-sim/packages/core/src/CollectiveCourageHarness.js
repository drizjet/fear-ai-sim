/**
 * packages/core/src/CollectiveCourageHarness.js
 *
 * Sections XXXI-XXXIII:
 * Casualties, morale, and collective courage — host-reported losses fold
 * into group morale, retreat pressure, and leadership buffering WITHOUT
 * conflating morale with mean fear. A squad can be terrified (high fear)
 * yet dutiful (high morale): fear is affect, morale is cohesion.
 *
 * Experiment: identical casualty sequences under LEADER_PRESENT vs
 * LEADER_ABSENT arms. Collective courage verdict requires the leader arm
 * to hold duty (morale above retreat pressure) at fear levels where the
 * leaderless arm breaks — leadership as the isolated causal variable.
 *
 * Inputs are host reports ({ casualties: [ids], fearByMember: {...} });
 * the harness never invents deaths. Advisory only.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

/** Signed 4-decimal rounding for pressure values (round4 clamps to [0,1]). */
const round4s = (v) => (typeof v !== 'number' || !Number.isFinite(v) ? 0 : Math.round(v * 10000) / 10000);

export const DEFAULT_COURAGE_CONFIG = Object.freeze({
    members: 8,
    casualtyOrder: [],
    leaderTrust: 0.7,
    leaderRespect: 0.8,
    doctrineBonus: 0.1
});

export class CollectiveCourageHarness {
    /**
     * Evaluate one casualty sequence.
     * @param {object} [config={}] { members, casualtyOrder: string[], leaderPresent,
     *   leaderTrust, leaderRespect, doctrineBonus, baseFear, fearByMember: {id: fear} }
     * @returns report with morale series, retreat series, and duty verdict
     */
    runSequence(config = {}) {
        const cfg = { ...DEFAULT_COURAGE_CONFIG, ...config };
        const n = Math.max(2, Math.min(40, cfg.members | 0));
        const ids = Array.from({ length: n }, (_, i) => `member_${i}`);
        const order = (Array.isArray(cfg.casualtyOrder) && cfg.casualtyOrder.length > 0
            ? cfg.casualtyOrder.map(String).filter((id) => ids.includes(id))
            : ids.slice(0, Math.min(n - 1, 3)));
        const baseFear = clamp01(config.baseFear ?? 0.45);
        const leaderPresent = config.leaderPresent !== false;
        const cohesion = leaderPresent
            ? clamp01(cfg.leaderTrust * 0.5 + cfg.leaderRespect * 0.4 + cfg.doctrineBonus)
            : clamp01(0.25 + cfg.doctrineBonus * 0.5);
        const alive = new Set(ids);
        const moraleSeries = [];
        const fearSeries = [];
        const retreatSeries = [];
        // Morale starts at cohesion; each loss hits morale proportional to
        // casualty fraction, buffered by leadership; fear ratchets upward.
        // NEXT-169 (post-25 candidate 9): per-member fear. Host-reported
        // fearByMember seeds individual fear; members without entries use
        // baseFear. Each survivor ratchets by the same rule; squad series
        // track the survivor mean, so uniform input reproduces legacy
        // series exactly.
        const rawMap = (config.fearByMember && typeof config.fearByMember === 'object')
            ? config.fearByMember : {};
        const fearOf = new Map(ids.map((id) => {
            const raw = rawMap[id] == null ? NaN : Number(rawMap[id]);
            return [id, Number.isFinite(raw) ? clamp01(raw) : baseFear];
        }));
        const meanFear = () => {
            let s = 0;
            for (const id of alive) s += fearOf.get(id);
            return alive.size > 0 ? s / alive.size : 0;
        };
        let morale = round4(cohesion);
        let fear = meanFear();
        moraleSeries.push(morale);
        fearSeries.push(round4(fear));
        for (const fallen of order) {
            if (!alive.has(fallen)) continue;
            alive.delete(fallen);
            fearOf.delete(fallen);
            const casualtyFraction = 1 - alive.size / n;
            for (const id of alive) {
                const f = fearOf.get(id);
                fearOf.set(id, clamp01(f + 0.12 * (1 - f)));
            }
            fear = meanFear();
            const buffer = leaderPresent ? 0.45 : 0.1;
            morale = round4(clamp01(morale - casualtyFraction * 0.35 * (1 - buffer)));
            moraleSeries.push(morale);
            fearSeries.push(round4(fear));
            retreatSeries.push(round4s(fear * (0.3 + casualtyFraction * 0.5) - morale * 0.5));
        }
        const finalMorale = moraleSeries[moraleSeries.length - 1];
        const finalFear = fearSeries[fearSeries.length - 1];
        const finalRetreat = retreatSeries[retreatSeries.length - 1];
        return {
            leaderPresent,
            survivors: alive.size,
            casualties: n - alive.size,
            moraleSeries,
            fearSeries,
            retreatSeries,
            finalMorale,
            finalFear,
            finalRetreatPressure: finalRetreat,
            holdsDuty: finalRetreat <= 0 && finalMorale >= 0.35,
            // NEXT-169: per-survivor fear (4-decimal, id-sorted) so joints
            // can arbitrate heterogeneous squads member by member.
            finalFears: Object.fromEntries([...fearOf.entries()]
                .sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([id, f]) => [id, Math.round(f * 10000) / 10000]))
        };
    }

    /**
     * Two-arm experiment isolating leadership as the causal variable.
     * @returns {{ leaderArm, leaderlessArm, verdict }}
     */
    runExperiment(config = {}) {
        const leaderArm = this.runSequence({ ...config, leaderPresent: true });
        const leaderlessArm = this.runSequence({ ...config, leaderPresent: false });
        const verdict = leaderArm.holdsDuty && !leaderlessArm.holdsDuty
            ? 'COLLECTIVE_COURAGE'
            : leaderArm.holdsDuty && leaderlessArm.holdsDuty
                ? 'BOTH_HOLD'
                : !leaderArm.holdsDuty && !leaderlessArm.holdsDuty
                    ? 'BOTH_BREAK'
                    : 'LEADER_BREAKS_ANOMALY';
        return { leaderArm, leaderlessArm, verdict };
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
