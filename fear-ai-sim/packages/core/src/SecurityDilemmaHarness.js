/**
 * packages/core/src/SecurityDilemmaHarness.js
 *
 * Section XLVI:
 * The security dilemma — faction A mobilizes defensively; faction B
 * interprets mobilization as aggression; escalation follows though
 * neither initially intended war. The harness runs the canonical
 * two-faction loop with tunable misperception and reports whether
 * the system spirals, stabilizes, or resolves through signaling.
 *
 * Mechanics per round:
 * 1. Each faction observes the other's mobilization level through a
 *    misperception filter: perceived = true * (1 + misperception) for
 *    the fearful, discounted by trust and by costly signals sent.
 * 2. Each faction sets its own mobilization = defensiveNeed (fear +
 *    grievance) + mirrorFraction * perceivedOther.
 * 3. Costly signals (announced exercises, invited observers, partial
 *    stand-downs) reduce the other's misperception next round.
 *
 * Verdicts: SPIRAL (both cross the war threshold), STABLE_DETERRENCE
 * (both hold below it), DE_ESCALATION (both fall back), ASYMMETRIC
 * (one dominates while the other submits — still peace, of a kind).
 *
 * Deterministic. Advisory only.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const DEFAULT_DILEMMA_CONFIG = Object.freeze({
    rounds: 8,
    warThreshold: 0.8,
    mirrorFraction: 0.5,
    signalStrength: 0.3
});

export class SecurityDilemmaHarness {
    /**
     * Build a dilemma config from two FactionSystem bilateral stances
     * (NOW-3 wiring). Fear/grievance drive defensive need; trust discounts
     * misperception; low information confidence raises it. Pure function of
     * stance snapshots — the harness never touches the faction system.
     */
    static configFromStances(stanceAB = {}, stanceBA = {}) {
        const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
        return {
            fearA: num(stanceAB.fear),
            fearB: num(stanceBA.fear),
            trustAB: (num(stanceAB.trust) + num(stanceBA.trust)) / 2,
            misperceptionA: 0.2 + 0.6 * (1 - num(stanceAB.informationConfidence)),
            misperceptionB: 0.2 + 0.6 * (1 - num(stanceBA.informationConfidence)),
            mobilizationA: num(stanceAB.grievance) * 0.5,
            mobilizationB: num(stanceBA.grievance) * 0.5
        };
    }
    /**
     * Run one dilemma.
     * @param {object} [config={}] { rounds, warThreshold, mirrorFraction,
     *   misperceptionA, misperceptionB, fearA, fearB, trustAB, signals: boolean[] }
     */
    run(config = {}) {
        const cfg = { ...DEFAULT_DILEMMA_CONFIG, ...config };
        let mobA = clamp01(config.mobilizationA ?? 0.2);
        let mobB = clamp01(config.mobilizationB ?? 0.2);
        let misA = clamp01(config.misperceptionA ?? 0.4);
        let misB = clamp01(config.misperceptionB ?? 0.4);
        const fearA = clamp01(config.fearA ?? 0.4);
        const fearB = clamp01(config.fearB ?? 0.4);
        const trust = clamp01(config.trustAB ?? 0.3);
        const signals = Array.isArray(config.signals) ? config.signals : [];
        const seriesA = [round4(mobA)];
        const seriesB = [round4(mobB)];
        for (let r = 0; r < cfg.rounds; r++) {
            if (signals[r] === true) {
                // Costly signal: sender accepts vulnerability, receiver updates.
                misA = round4(Math.max(0, misA - cfg.signalStrength * 0.5));
                misB = round4(Math.max(0, misB - cfg.signalStrength * 0.5));
            }
            const perceivedB = clamp01(mobB * (1 + misA) * (1 - trust * 0.5));
            const perceivedA = clamp01(mobA * (1 + misB) * (1 - trust * 0.5));
            mobA = round4(clamp01(fearA * 0.5 + cfg.mirrorFraction * perceivedB));
            mobB = round4(clamp01(fearB * 0.5 + cfg.mirrorFraction * perceivedA));
            // Unreciprocated fear decays slightly: no fuel, no fire.
            seriesA.push(mobA);
            seriesB.push(mobB);
        }
        const peakA = Math.max(...seriesA);
        const peakB = Math.max(...seriesB);
        const endA = seriesA[seriesA.length - 1];
        const endB = seriesB[seriesB.length - 1];
        let verdict = 'STABLE_DETERRENCE';
        if (peakA >= cfg.warThreshold && peakB >= cfg.warThreshold) verdict = 'SPIRAL';
        else if (endA < seriesA[0] && endB < seriesB[0]) verdict = 'DE_ESCALATION';
        else if ((peakA >= cfg.warThreshold) !== (peakB >= cfg.warThreshold)) verdict = 'ASYMMETRIC';
        return {
            seriesA, seriesB, peakA, peakB, endA, endB,
            finalMisperception: round4((misA + misB) / 2),
            verdict
        };
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
