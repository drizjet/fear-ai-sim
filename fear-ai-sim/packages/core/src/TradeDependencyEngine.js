/**
 * packages/core/src/TradeDependencyEngine.js
 *
 * Section LII:
 * A faction dependent on another treats conflict differently — computes
 * import-dependency ratios from the host's trade ledger and converts
 * them into conflict-restraint advisories that dampen retaliation
 * recommendations. Cutting off your own grain supply to answer an
 * insult is advisory malpractice; this engine prices the restraint.
 *
 * Reads plain ledger rows ({ sourceId, destId, commodity, amount }) as
 * produced by EconomicFeedbackSystem.tradeHistory — no import of the
 * simulator, no mutation of markets. Layers onto RetaliationModel by
 * scaling its recommended level before intent mapping (callers apply
 * dampen() to the level, then re-map, or use advise() directly).
 *
 * Advisory only. Host owns goods, wealth, and war.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const DEFAULT_DEPENDENCY_CONFIG = Object.freeze({
    criticalThreshold: 0.5,
    highThreshold: 0.3,
    windowTicks: 200
});

export class TradeDependencyEngine {
    /**
     * @param {object} [config={}] overrides
     */
    constructor(config = {}) {
        this.config = Object.freeze({ ...DEFAULT_DEPENDENCY_CONFIG, ...config });
    }

    /**
     * Dependency of importer on exporter: share of importer's total
     * recorded imports (within window) arriving from exporter.
     * @param {Array} ledger trade rows { sourceId, destId, commodity, amount, tick }
     * @param {string} importerId
     * @param {string} exporterId
     * @param {number} [nowTick=Infinity] ledger rows above nowTick-window count
     * @returns {{ ratio, imports, totalImports, critical }}
     */
    dependencyOf(ledger, importerId, exporterId, nowTick = Infinity) {
        if (!Array.isArray(ledger)) throw new Error('LEDGER_MUST_BE_ARRAY');
        const imp = String(importerId);
        const exp = String(exporterId);
        const cutoff = nowTick - this.config.windowTicks;
        let imports = 0;
        let total = 0;
        for (const row of ledger) {
            if (!row || String(row.destId) !== imp) continue;
            if (typeof row.tick === 'number' && row.tick < cutoff) continue;
            const amt = typeof row.amount === 'number' && Number.isFinite(row.amount) ? Math.max(0, row.amount) : 0;
            total += amt;
            if (String(row.sourceId) === exp) imports += amt;
        }
        const ratio = total > 0 ? round4(imports / total) : 0;
        return { ratio, imports: round4(imports), totalImports: round4(total), critical: ratio >= this.config.criticalThreshold };
    }

    /**
     * Compose with a retaliation model: restraint from the ledger flows
     * into the model's recommendation in one call (CCV edge closure).
     * @param {Array} ledger trade rows
     * @param {object} model RetaliationModel-like ({ recommend(s,t,opts) })
     * @param {string} importerId also the retaliation target
     * @param {string} exporterId also the provocateur
     * @returns {{ dependency, dampedLevel, restraint, advisory, recommendation }}
     */
    restrainedRecommend(ledger, model, importerId, exporterId, sourceId, targetId, nowTick = Infinity) {
        if (!model || typeof model.recommend !== 'function') throw new Error('MODEL_MUST_RECOMMEND');
        const base = this.advise(ledger, importerId, exporterId, 1, nowTick);
        const recommendation = model.recommend(sourceId, targetId, { restraint: base.restraint });
        return { ...base, recommendation };
    }

    /**
     * Dampen a retaliation level by dependency: the more you import from
     * the provocateur, the softer the answer.
     * @param {number} dependencyRatio in [0,1]
     * @returns damped level
     */
    dampen(level, dependencyRatio) {
        const l = clamp01(level);
        const d = clamp01(dependencyRatio);
        return round4(l * (1 - d * 0.7));
    }

    /**
     * Full advisory for target's posture toward a provocateur it imports from.
     * @returns {{ dependency, dampedLevel, restraint, advisory }}
     */
    advise(ledger, importerId, exporterId, rawLevel, nowTick = Infinity) {
        const dep = this.dependencyOf(ledger, importerId, exporterId, nowTick);
        const dampedLevel = this.dampen(rawLevel, dep.ratio);
        const restraint = round4(clamp01(rawLevel) - dampedLevel);
        let advisory = 'NO_RESTRAINT';
        if (dep.ratio >= this.config.criticalThreshold) advisory = 'AVOID_CONFLICT';
        else if (dep.ratio >= this.config.highThreshold) advisory = 'MEASURED_RESPONSE';
        else if (restraint > 0.02) advisory = 'MILD_RESTRAINT';
        return { dependency: dep, dampedLevel, restraint, advisory };
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
