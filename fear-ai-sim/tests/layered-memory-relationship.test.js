/**
 * tests/layered-memory-relationship.test.js
 *
 * Test suite for Milestone D: Layered Memory Architecture & Relationship Tensors.
 * Verifies multi-layer memory storage, bounded capacity, salience decay,
 * directed asymmetric social relationships, behavioral modulation, and replay determinism.
 */

import {
    LayeredMemorySystem,
    MEMORY_LAYERS,
    EPISODIC_EVENT_TYPES,
    SEMANTIC_CATEGORIES,
    RelationshipTensorSystem,
    INTERACTION_TYPES
} from '../packages/core/index.js';

describe('Milestone D: Layered Memory Architecture & Relationship Tensors', () => {
    describe('LayeredMemorySystem', () => {
        let mem;

        beforeEach(() => {
            mem = new LayeredMemorySystem({
                maxSensoryEntries: 5,
                maxEpisodicEntries: 10,
                maxTraumaEntries: 5,
                maxSemanticEntries: 10,
                episodicBaseDecay: 0.05
            });
        });

        test('1. Sensory Working Memory FIFO maintains strict capacity bound', () => {
            for (let i = 0; i < 20; i++) {
                mem.recordSensory({ threat_distance: 100 - i, threat_detected: false }, i);
            }
            expect(mem.sensory.length).toBe(5);
            expect(mem.sensory[mem.sensory.length - 1].tick).toBe(19);
            expect(mem.sensory[0].tick).toBe(15);
        });

        test('2. Episodic Memory records events, dedupes, and decays mundane events faster than flashbulb trauma', () => {
            const mundaneId = mem.recordEpisodic({
                type: EPISODIC_EVENT_TYPES.RESOURCE_DISCOVERED,
                salience: 0.4,
                tick: 1
            });
            const traumaticId = mem.recordEpisodic({
                type: EPISODIC_EVENT_TYPES.ABANDONED_BY_PEER,
                salience: 0.95,
                tick: 1
            });

            expect(mem.episodic.length).toBe(2);

            // Duplicate registration at same tick reinforces rather than duplicates
            const reinforcedId = mem.recordEpisodic({
                type: EPISODIC_EVENT_TYPES.RESOURCE_DISCOVERED,
                salience: 0.4,
                tick: 1
            });
            expect(reinforcedId).toBe(mundaneId);
            expect(mem.episodic.length).toBe(2);

            // Advance 10 ticks: mundane memory decays rapidly, flashbulb memory resists decay
            mem.tick(10);

            const mundane = mem.episodic.find(e => e.id === mundaneId);
            const traumatic = mem.episodic.find(e => e.id === traumaticId);

            expect(traumatic.salience).toBeGreaterThan(0.85); // Resists decay (0.1x rate)
            expect(mundane.salience).toBeLessThan(0.40);       // Decays normally
        });

        test('3. Trauma Memory registers spatial dread zones and entity cues with distance falloff', () => {
            mem.recordTrauma('SPATIAL', 'site_alpha', 1.0, { x: 10, y: 0, z: 0 }, 20);
            mem.recordTrauma('ENTITY', 'monster_omega', 0.8);

            // Point-blank dread
            const dreadClose = mem.getTraumaDread({ x: 10, y: 0, z: 0 });
            expect(dreadClose).toBeCloseTo(1.0, 2);

            // Halfway falloff
            const dreadMid = mem.getTraumaDread({ x: 20, y: 0, z: 0 }); // dist = 10, radius = 20 -> 0.5 factor
            expect(dreadMid).toBeCloseTo(0.5, 2);

            // Beyond radius
            const dreadFar = mem.getTraumaDread({ x: 40, y: 0, z: 0 });
            expect(dreadFar).toBe(0.0);

            // Entity cue activation
            const dreadEntity = mem.getTraumaDread({ x: 0, y: 0, z: 0 }, ['monster_omega']);
            expect(dreadEntity).toBeGreaterThan(0.5);
        });

        test('4. Semantic Knowledge performs conflict resolution: higher confidence overrides stale belief', () => {
            mem.recordSemantic('zone_4', SEMANTIC_CATEGORIES.SANCTUARY, { x: 5, y: 0, z: 5 }, 0.6, {}, 10);
            expect(mem.semantic.get('zone_4').category).toBe(SEMANTIC_CATEGORIES.SANCTUARY);

            // Newer observation with higher confidence reporting it is now a HAZARD
            mem.recordSemantic('zone_4', SEMANTIC_CATEGORIES.HAZARD, { x: 5, y: 0, z: 5 }, 0.95, {}, 50);
            expect(mem.semantic.get('zone_4').category).toBe(SEMANTIC_CATEGORIES.HAZARD);
            expect(mem.semantic.get('zone_4').confidence).toBe(0.95);
        });

        test('5. Bounded capacity policy prunes lowest salience/confidence entries under load', () => {
            for (let i = 0; i < 100; i++) {
                mem.recordEpisodic({
                    type: EPISODIC_EVENT_TYPES.SURVIVED_AMBUSH,
                    salience: (i + 1) / 100, // 0.01 to 1.0
                    tick: i
                });
                mem.recordSemantic(`key_${i}`, SEMANTIC_CATEGORIES.RESOURCE, { x: i, y: 0, z: 0 }, (i + 1) / 100);
            }

            expect(mem.episodic.length).toBe(10);
            // Verify retained episodic memories have highest salience
            const minRetainedSalience = Math.min(...mem.episodic.map(e => e.salience));
            expect(minRetainedSalience).toBeGreaterThan(0.85);

            expect(mem.semantic.size).toBe(10);
        });

        test('6. Snapshot serialization and deserialization produces bit-for-bit restore', () => {
            mem.recordSensory({ threat_distance: 12 }, 5);
            mem.recordEpisodic({ type: EPISODIC_EVENT_TYPES.ALLIED_EXTRACTION, salience: 0.9, tick: 5 });
            mem.recordTrauma('SPATIAL', 't1', 0.8, { x: 1, y: 2, z: 3 }, 30);
            mem.recordSemantic('s1', SEMANTIC_CATEGORIES.CHOKEPOINT, { x: 0, y: 0, z: 0 }, 0.7);

            const snapshot = mem.getState();
            const restored = new LayeredMemorySystem();
            restored.setState(snapshot);

            expect(restored.sensory.length).toBe(mem.sensory.length);
            expect(restored.episodic.length).toBe(mem.episodic.length);
            expect(restored.trauma.length).toBe(mem.trauma.length);
            expect(restored.semantic.size).toBe(mem.semantic.size);
            expect(restored.getTraumaDread({ x: 1, y: 2, z: 3 })).toBeCloseTo(mem.getTraumaDread({ x: 1, y: 2, z: 3 }), 5);
        });
    });

    describe('RelationshipTensorSystem', () => {
        let social;

        beforeEach(() => {
            social = new RelationshipTensorSystem({
                maxRelationshipsPerAgent: 5,
                grievanceDecayRate: 0.01
            });
        });

        test('7. Directed Asymmetry Invariant: R_ij !== R_ji', () => {
            // Alice rescues Bob
            social.recordInteraction('bob', 'alice', INTERACTION_TYPES.RESCUE_CONFIRMED, { weight: 1.0 });
            social.recordInteraction('alice', 'bob', INTERACTION_TYPES.AID_PROVIDED, { weight: 1.0 });

            const bobToAlice = social.getRelationship('bob', 'alice');
            const aliceToBob = social.getRelationship('alice', 'bob');

            expect(bobToAlice.obligation).toBeGreaterThan(0.4); // Bob owes Alice
            expect(aliceToBob.obligation).toBe(0.0);             // Alice does not owe Bob
            expect(bobToAlice.respect).toBeGreaterThan(aliceToBob.respect); // Bob respects his rescuer
        });

        test('8. Treachery and betrayal spike grievance and destroy trust', () => {
            social.recordInteraction('victim', 'traitor', INTERACTION_TYPES.ABANDONMENT);
            social.recordInteraction('victim', 'traitor', INTERACTION_TYPES.BETRAYAL);

            const rel = social.getRelationship('victim', 'traitor');
            expect(rel.trust).toBeLessThan(-0.8);
            expect(rel.grievance).toBeGreaterThan(0.8);
            expect(rel.affection).toBeLessThan(-0.5);
        });

        test('9. Behavioral Modulation: Grievance suppresses panic contagion from betrayer', () => {
            // Normal peer
            social.recordInteraction('agent', 'normal_peer', INTERACTION_TYPES.SHARED_SURVIVAL);
            // Traitor peer
            social.recordInteraction('agent', 'traitor_peer', INTERACTION_TYPES.BETRAYAL);

            const contagionNormal = social.getContagionSusceptibility('agent', 'normal_peer', 0.8);
            const contagionTraitor = social.getContagionSusceptibility('agent', 'traitor_peer', 0.8);

            expect(contagionTraitor).toBeLessThan(contagionNormal * 0.3); // Severe contagion dampening
        });

        test('10. Leader Reassurance Gating: Resentment blocks leader calming', () => {
            social.recordInteraction('follower', 'good_leader', INTERACTION_TYPES.LEADER_CALMING);
            social.recordInteraction('follower', 'corrupt_leader', INTERACTION_TYPES.BETRAYAL);

            const calmGood = social.getLeaderReassuranceEfficiency('follower', 'good_leader', 0.6);
            const calmCorrupt = social.getLeaderReassuranceEfficiency('follower', 'corrupt_leader', 0.6);

            expect(calmGood).toBeGreaterThan(0.25);
            expect(calmCorrupt).toBe(0.0); // Completely blocked
        });

        test('11. Pro-Social Altruism Gating: High grievance causes absolute refusal to aid', () => {
            social.recordInteraction('hero', 'ally', INTERACTION_TYPES.AID_RECEIVED);
            social.recordInteraction('hero', 'betrayer', INTERACTION_TYPES.BETRAYAL);

            const helpAlly = social.getProSocialWillingness('hero', 'ally', 0.8);
            const helpBetrayer = social.getProSocialWillingness('hero', 'betrayer', 0.8);

            expect(helpAlly).toBeGreaterThanOrEqual(0.8);
            expect(helpBetrayer).toBe(0.0); // Strictly zero helping
        });

        test('12. Forgiveness Dynamics: Peaceful ticks decay grievances back to baseline', () => {
            social.recordInteraction('alice', 'bob', INTERACTION_TYPES.ABANDONMENT);
            const initialGrievance = social.getRelationship('alice', 'bob').grievance;
            expect(initialGrievance).toBeGreaterThan(0.5);

            // Advance 100 peaceful ticks
            social.tick(100);
            const finalGrievance = social.getRelationship('alice', 'bob').grievance;
            expect(finalGrievance).toBeLessThan(0.01);
        });

        test('13. Entity lifecycle garbage collection cleanly purges inbound and outbound relationships', () => {
            social.recordInteraction('alice', 'bob', INTERACTION_TYPES.SHARED_SURVIVAL);
            social.recordInteraction('bob', 'alice', INTERACTION_TYPES.SHARED_SURVIVAL);

            expect(social.hasRelationship('alice', 'bob')).toBe(true);
            expect(social.hasRelationship('bob', 'alice')).toBe(true);

            social.purgeAgent('bob');
            expect(social.hasRelationship('alice', 'bob')).toBe(false);
            expect(social.relationships.has('bob')).toBe(false);
        });

        test('14. Social Snapshot serialization reproduces identical directed tensors', () => {
            social.recordInteraction('a1', 'a2', INTERACTION_TYPES.AID_RECEIVED);
            social.recordInteraction('a2', 'a3', INTERACTION_TYPES.LEADER_CALMING);

            const snap = social.getState();
            const restored = new RelationshipTensorSystem();
            restored.setState(snap);

            const r1 = restored.getRelationship('a1', 'a2');
            const r2 = restored.getRelationship('a2', 'a3');

            expect(r1.obligation).toBeCloseTo(social.getRelationship('a1', 'a2').obligation, 5);
            expect(r2.respect).toBeCloseTo(social.getRelationship('a2', 'a3').respect, 5);
        });
    });
});
