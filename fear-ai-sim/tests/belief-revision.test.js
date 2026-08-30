// Constitution §87 (RUMOR) / §533 (INFORMATION MVP) / §7 (STATE
// vs EVENT vs OBSERVATION vs BELIEF) / §8 (PARTIAL OBSERVABILITY).
//
// The audit's critique: "Whether evidence is trustworthy
// should depend on things like: direct observation vs hearsay,
// observer capability, source reliability, distance, visibility,
// age, corroboration, contradiction. It should not fundamentally
// depend on: 'did this BeliefStore already contain something?'"
// "A test expectation was changed before the actual capacity
// behavior was traced. Therefore: reproduce and trace before
// rewriting expected values." (recent work log, §26.1)
//
// This slice replaces the prior-dependent sourceTrust/confidence
// heuristic with an evidence-type-based contract.

import { createClosedWorldScenario, tickClosedWorld, evidenceStrength } from '../closed-world.js';
import { BeliefStore, Evidence } from '../beliefs.js';

describe('belief revision by evidence type (Constitution §87 / §533)', () => {
    it('evidence strength derives from evidence type, not prior existence', () => {
        // The §7 / §87 contract: a DIRECT_WITNESS is stronger
        // than a SCOUT_REPORT, which is stronger than a
        // UNKNOWN_RUMOR. The strength is a property of the
        // evidence, not of the existing belief.
        const direct = evidenceStrength('DIRECT_WITNESS');
        const scout = evidenceStrength('SCOUT_REPORT');
        const rumor = evidenceStrength('UNKNOWN_RUMOR');
        expect(direct.sourceTrust).toBeGreaterThan(scout.sourceTrust);
        expect(scout.sourceTrust).toBeGreaterThan(rumor.sourceTrust);
    });

    it('a direct witness can correct an incorrect prior over time', () => {
        // The audit's quantitative example: a wrong prior of 0.05
        // should converge toward the true value 0.8 as direct
        // observations accumulate. With 5 direct witnesses at
        // 0.8, the belief should rise well above 0.5.
        const store = new BeliefStore();
        // Seed: wrong prior.
        store.observe(new Evidence({
            subject: 'road-a', claim: 'perceivedDanger',
            value: 0.05, sourceId: 'scout-report', sourceTrust: 0.5, confidence: 0.5, tick: 0
        }));
        // Five direct witnesses.
        for (let i = 0; i < 5; i += 1) {
            store.observe(new Evidence({
                subject: 'road-a', claim: 'perceivedDanger',
                value: 0.8, sourceId: 'attack-witness', sourceTrust: 0.95, confidence: 0.95, tick: i + 1
            }));
        }
        const belief = store.get('road-a', 'perceivedDanger');
        // The belief should be much closer to 0.8 than to 0.05.
        expect(belief.value).toBeGreaterThan(0.5);
    });

    it('a contradictory weak rumor does not overturn a strong direct witness', () => {
        // The audit's critique: "a direct prior + contradictory
        // weak report" should not flip the belief. A single
        // rumor should not overturn a strong observation.
        const store = new BeliefStore();
        // Strong direct prior.
        for (let i = 0; i < 3; i += 1) {
            store.observe(new Evidence({
                subject: 'road-a', claim: 'perceivedDanger',
                value: 0.8, sourceId: 'attack-witness', sourceTrust: 0.95, confidence: 0.95, tick: i
            }));
        }
        const beforeRumor = store.get('road-a', 'perceivedDanger').value;
        // A weak rumor contradicts.
        store.observe(new Evidence({
            subject: 'road-a', claim: 'perceivedDanger',
            value: 0.1, sourceId: 'unknown-rumor', sourceTrust: 0.3, confidence: 0.3, tick: 4
        }));
        const afterRumor = store.get('road-a', 'perceivedDanger').value;
        // The rumor should not dominate the strong direct prior.
        expect(Math.abs(afterRumor - beforeRumor)).toBeLessThan(0.3);
    });

    it('two corroborating independent sources reinforce each other', () => {
        // The §533 contract: two independent scouts with
        // similar values should reinforce the belief.
        const store = new BeliefStore();
        store.observe(new Evidence({
            subject: 'road-a', claim: 'perceivedDanger',
            value: 0.7, sourceId: 'scout-1', sourceTrust: 0.7, confidence: 0.8, tick: 0
        }));
        store.observe(new Evidence({
            subject: 'road-a', claim: 'perceivedDanger',
            value: 0.72, sourceId: 'scout-2', sourceTrust: 0.7, confidence: 0.8, tick: 1
        }));
        const belief = store.get('road-a', 'perceivedDanger');
        // The corroborating sources push the belief higher than
        // a single source of the same weight.
        expect(belief.value).toBeGreaterThan(0.7);
        // The confidence should also be high.
        expect(belief.confidence).toBeGreaterThan(0.5);
    });

    it('the closed-world reducer maps sourceIds to evidence types, not to prior-dependent heuristics', () => {
        // Run the closed-world for 10 ticks and check that the
        // belief-store evidence was created with type-based
        // trust/confidence (not the prior-dependent heuristic).
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0, relationshipGate: true });
        // The merchant's belief store should have evidence
        // entries with type-based trust, not the prior-dependent
        // (0.9 then 0.5) heuristic.
        const allEvidence = world.merchants[0].beliefs.evidence || [];
        for (const ev of allEvidence) {
            const strength = evidenceStrength(
                ev.sourceId === 'attack-witness' ? 'DIRECT_WITNESS' :
                ev.sourceId === 'relocation-witness' ? 'DIRECT_WITNESS' :
                'UNKNOWN_RUMOR'
            );
            expect(ev.sourceTrust).toBe(strength.sourceTrust);
        }
    });
});
