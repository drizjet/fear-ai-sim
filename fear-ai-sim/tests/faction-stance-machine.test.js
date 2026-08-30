/**
 * Audit P1 #2 (2026-08-28): "Build the real faction stance
 * machine. TOLERANT → WATCHFUL → DEFENSIVE → HOSTILE with
 * hysteresis, capability gates, information confidence
 * and explicit decision explanations."
 *
 * Acceptance test from the audit:
 *   "Two factions can move across multiple stance states
 *    for causal reasons, de-escalate, and explain each
 *    transition."
 *
 * The current `evaluateStance` returns a stance code but
 * does not say WHY the transition fired. This slice adds
 * `chooseStance` which:
 *   1. Returns a structured `{ from, to, reason, evidence,
 *      capability, blocked }` decision object.
 *   2. Refuses to escalate into MOBILIZING / WAR /
 *      LIMITED_CONFLICT when `militaryResources` is too
 *      low (capability gate).
 *   3. Refuses to escalate from TOLERANT when
 *      `informationConfidence` is too low (uncertainty gate).
 *   4. Emits a `STANCE_TRANSITION` event with the
 *      structured reason.
 *   5. Preserves the existing hysteresis (escalation
 *      thresholds higher than de-escalation thresholds).
 */
import { chooseStance, StanceLadder } from '../factionrelationship.js';

const S = StanceLadder;

describe('faction stance machine (audit P1 #2)', () => {
    test('chooseStance returns a structured decision with reason and capability', () => {
        const decision = chooseStance({
            pressure: 0.55,
            trust: 0.5,
            previous: S.TOLERANT,
            militaryResources: 0.8,
            informationConfidence: 0.7,
        });
        // The decision explains itself.
        expect(decision.from).toBe(S.TOLERANT);
        expect(decision.to).toBeDefined();
        expect(decision.reason).toBeDefined();
        expect(decision.evidence).toBeDefined();
        expect(decision.capability).toBeDefined();
        expect(decision.blocked).toBe(false);
    });

    test('TOLERANT can move up through WATCHFUL → DEFENSIVE → HOSTILE for causal reasons', () => {
        const path = [];
        let previous = S.TOLERANT;
        for (const pressure of [0.05, 0.25, 0.55, 0.75, 0.9]) {
            const decision = chooseStance({
                pressure,
                trust: 0.3,
                previous,
                militaryResources: 0.8,
                informationConfidence: 0.8,
            });
            if (decision.to !== previous) {
                path.push({ from: decision.from, to: decision.to, reason: decision.reason });
            }
            previous = decision.to;
        }
        expect(path.length).toBeGreaterThanOrEqual(3);
        for (const step of path) {
            expect(step.reason).toBeTruthy();
        }
    });

    test('capability gate: cannot escalate to MOBILIZING / WAR / LIMITED_CONFLICT with low resources', () => {
        const decision = chooseStance({
            pressure: 0.9,
            trust: 0.2,
            previous: S.HOSTILE,
            militaryResources: 0.1,
            informationConfidence: 0.9,
        });
        expect(decision.to).not.toBe(S.MOBILIZING);
        expect(decision.to).not.toBe(S.WAR);
        expect(decision.capability).toMatchObject({ militaryResources: 0.1, gateActive: true });
        expect(decision.blocked).toBe(true);
    });

    test('uncertainty gate: cannot escalate from TOLERANT with low information confidence', () => {
        const decision = chooseStance({
            pressure: 0.7,
            trust: 0.3,
            previous: S.TOLERANT,
            militaryResources: 0.8,
            informationConfidence: 0.1,
        });
        expect(decision.to).toBe(S.TOLERANT);
        expect(decision.from).toBe(S.TOLERANT);
        expect(decision.evidence).toMatchObject({ informationConfidence: 0.1, gateActive: true });
        expect(decision.blocked).toBe(true);
    });

    test('a faction can de-escalate and the decision explains the calming cause', () => {
        // Use a high enough pressure that trust damping
        // still lands us in DEFENSIVE.
        const high = chooseStance({
            pressure: 0.95,
            trust: 0.3,
            previous: S.TOLERANT,
            militaryResources: 0.8,
            informationConfidence: 0.8,
        });
        // The decision either reached DEFENSIVE or
        // higher; what we care about is the
        // de-escalation step below.
        expect(high.to).toBeGreaterThanOrEqual(S.DEFENSIVE);
        const calmed = chooseStance({
            pressure: 0.2,
            trust: 0.7,
            previous: high.to,
            militaryResources: 0.8,
            informationConfidence: 0.7,
        });
        // The de-escalation moved the faction down.
        expect(calmed.to).toBeLessThan(high.to);
        // The reason cites the calming.
        expect(calmed.reason).toMatch(/calm|pressure|hold/i);
    });
});
