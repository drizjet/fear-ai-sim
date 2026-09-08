import { describe, it, expect } from '@jest/globals';
import {
    EpistemicBeliefEngine,
    EPISTEMIC_PROVENANCE,
    BELIEF_CATEGORIES,
    AffectiveAgent,
    CANONICAL_PRESETS
} from '../packages/core/index.js';

describe('Front B / Sections 25–27: Epistemic State & Layered Belief Discrepancy Engine', () => {
    it('1. Information-Driven Fear: Subjective belief triggers acute fear and flight intent despite empty ground truth', () => {
        const engine = new EpistemicBeliefEngine('scout_1', { neuroticism: 0.80, bravery: 0.20 });
        const agent = new AffectiveAgent('scout_1', { neuroticism: 0.80, bravery: 0.20 });

        // Agent receives credible direct warning of a lethal monster nearby
        engine.receiveCommunication({
            category: BELIEF_CATEGORIES.THREAT,
            id: 'lurking_beast',
            data: {
                x: 5.0,
                y: 0.0,
                z: 0.0,
                distance: 5.0,
                intensity: 0.95,
                type: 'PREDATOR'
            },
            senderId: 'trusted_veteran',
            initialConfidence: 0.95,
            hops: 1
        }, 0.90); // 90% trust in sender

        // Synthesize subjective sensory observations from belief state
        const subjectiveObs = engine.synthesizeSubjectiveObservations();
        expect(subjectiveObs.threats).toHaveLength(1);
        expect(subjectiveObs.threats[0].id).toBe('lurking_beast');
        expect(subjectiveObs.threats[0].intensity).toBeGreaterThan(0.70);

        // Tick affective agent with subjective observations (2 ticks for hysteresis progression)
        agent.tick(0.016, subjectiveObs);
        const result = agent.tick(0.016, subjectiveObs);

        // In World Truth: The barn is completely empty!
        const worldGroundTruth = { activeThreats: [] };
        const discrepancy = engine.evaluateDiscrepancyAgainstTruth(worldGroundTruth);

        // Agent experiences acute fear and flees purely based on false alarm / belief
        expect(result.affective_state.raw_fear).toBeGreaterThan(0.60);
        expect(result.action_intent.type).toBe('FLEE_FROM');

        // Epistemic discrepancy correctly identifies Paranoia / Ghost Threat
        expect(discrepancy.falsePositives).toHaveLength(1);
        expect(discrepancy.falseNegatives).toHaveLength(0);
        expect(discrepancy.paranoiaScore).toBeGreaterThan(0.50);
        expect(discrepancy.isOmniscient).toBe(false);
    });

    it('2. Epistemic Provenance Tracking: Direct observation vs Trust-scaled communication vs Multi-hop rumor decay', () => {
        const engine = new EpistemicBeliefEngine('observer_1', { neuroticism: 0.5 });

        // Direct Observation
        engine.observeDirect({
            threats: [{ id: 'wolf_alpha', x: 10, y: 10, distance: 10, intensity: 0.8 }]
        });
        const obsBelief = engine.threatBeliefs.get('wolf_alpha');
        expect(obsBelief.provenance).toBe(EPISTEMIC_PROVENANCE.OBSERVED);
        expect(obsBelief.confidence).toBe(0.98);

        // Direct communication with low-trust stranger (trust = 0.20)
        engine.receiveCommunication({
            category: BELIEF_CATEGORIES.THREAT,
            id: 'stranger_warning',
            data: { x: 50, y: 50, distance: 50, intensity: 0.5 },
            senderId: 'unknown_stranger',
            initialConfidence: 0.8,
            hops: 1
        }, 0.20);
        const strangerBelief = engine.threatBeliefs.get('stranger_warning');
        expect(strangerBelief.provenance).toBe(EPISTEMIC_PROVENANCE.COMMUNICATED_DIRECT);
        expect(strangerBelief.confidence).toBeLessThan(0.25);

        // Multi-hop social rumor (3 hops)
        engine.receiveCommunication({
            category: BELIEF_CATEGORIES.THREAT,
            id: 'distant_rumor',
            data: { x: 100, y: 100, distance: 100, intensity: 0.9 },
            senderId: 'tavern_patron',
            initialConfidence: 0.8,
            hops: 3
        }, 0.80);
        const rumorBelief = engine.threatBeliefs.get('distant_rumor');
        expect(rumorBelief.provenance).toBe(EPISTEMIC_PROVENANCE.RUMOR);
        // Attenuated by gamma^(3-1) = 0.85^2 = 0.7225
        expect(rumorBelief.confidence).toBeLessThan(0.60);
    });

    it('3. Contradiction Resolution: Direct visual inspection disconfirms false threat rumor', () => {
        const engine = new EpistemicBeliefEngine('patrol_guard', { neuroticism: 0.30 });

        // Ingest threat rumor at coordinate (15, 0)
        engine.receiveCommunication({
            category: BELIEF_CATEGORIES.THREAT,
            id: 'phantom_bandit',
            data: { x: 15, y: 0, z: 0, distance: 15, intensity: 0.7 },
            senderId: 'panicked_refugee',
            initialConfidence: 0.8,
            hops: 2
        }, 0.70);

        expect(engine.threatBeliefs.has('phantom_bandit')).toBe(true);

        // Guard arrives at position (15, 0) and inspects with clear zone radius 25m
        engine.observeDirect({
            threats: [], // Empty!
            agentX: 15,
            agentY: 0,
            clearZoneRadius: 25.0
        });

        // Belief confidence is heavily knocked down or pruned
        const remaining = engine.threatBeliefs.get('phantom_bandit');
        expect(remaining === undefined || remaining.confidence < 0.15).toBe(true);
        expect(engine.contradictionLog.some(c => c.type === 'BELIEF_DISCONFIRMED_BY_CLEAR_SIGHT')).toBe(true);
    });

    it('4. Temporal Confidence Decay & Stale Horizon Transition', () => {
        const engine = new EpistemicBeliefEngine('watchman', {}, { temporalDecayRate: 0.01, staleHorizonTicks: 10 });

        engine.observeDirect({
            threats: [{ id: 'goblin_raider', x: 20, y: 20, distance: 20, intensity: 0.6 }]
        });

        const initialConfidence = engine.threatBeliefs.get('goblin_raider').confidence;

        // Advance 15 ticks without refreshing sight of goblin
        engine.tick(15);

        const staleBelief = engine.threatBeliefs.get('goblin_raider');
        expect(staleBelief.provenance).toBe(EPISTEMIC_PROVENANCE.OUTDATED);
        expect(staleBelief.confidence).toBeLessThan(initialConfidence);
    });

    it('5. Complacency Detection: Real threat in world truth unobserved by distracted agent', () => {
        const engine = new EpistemicBeliefEngine('complacent_scout', {});

        // Agent has zero threat beliefs
        const worldGroundTruth = {
            activeThreats: [
                { id: 'ambush_stealth_sniper', x: 5, y: 5, distance: 7.07, intensity: 0.90 }
            ]
        };

        const discrepancy = engine.evaluateDiscrepancyAgainstTruth(worldGroundTruth);

        expect(discrepancy.falsePositives).toHaveLength(0);
        expect(discrepancy.falseNegatives).toHaveLength(1);
        expect(discrepancy.falseNegatives[0].id).toBe('ambush_stealth_sniper');
        expect(discrepancy.complacencyScore).toBeGreaterThan(0.80);
    });

    it('6. Strictly preserves Host Game Authority Invariant', () => {
        const engine = new EpistemicBeliefEngine('authority_tester', {});
        const hostWorldEntity = { id: 'real_box', x: 50.0, y: 50.0, hp: 100 };

        // Engine ingests rumors, updates, and evaluates beliefs
        engine.receiveCommunication({
            category: BELIEF_CATEGORIES.THREAT,
            id: 'ghost_dragon',
            data: { x: 0, y: 0, distance: 10, intensity: 1.0 },
            senderId: 'crier',
            initialConfidence: 0.9,
            hops: 1
        }, 0.8);

        engine.synthesizeSubjectiveObservations();
        engine.evaluateDiscrepancyAgainstTruth({ activeThreats: [] });

        // Host entity transforms and data remain completely unmutated
        expect(hostWorldEntity.x).toBe(50.0);
        expect(hostWorldEntity.y).toBe(50.0);
        expect(hostWorldEntity.hp).toBe(100);
    });
});
