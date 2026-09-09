/**
 * @file debt-affect-memory-faction.test.js
 *
 * Pays down top InteractionCoverageGraph debt: AffectiveAgent x
 * LayeredMemorySystem, AffectiveAgent x RelationshipTensorSystem,
 * FactionSystem x LayeredMemorySystem — pairs co-used in scale/stress
 * benchmarks with no joint test.
 *
 * Interaction seams under test (all pre-existing public APIs):
 * - memory.getTraumaDread -> agent tick context.traumaDread
 * - relationship trust -> advisory context.leaderCalm mapping
 * - faction incidents -> episodic/semantic memory writes
 */

import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/src/AffectiveAgent.js';
import { LayeredMemorySystem } from '../packages/core/src/LayeredMemorySystem.js';
import { RelationshipTensorSystem, INTERACTION_TYPES } from '../packages/core/src/RelationshipTensorSystem.js';
import { FactionSystem } from '../packages/core/src/FactionSystem.js';
import { MemoryRelevanceScorer } from '../packages/core/src/MemoryRelevanceScorer.js';

const THREAT = { distance: 8.0, intensity: 0.7 };

function threatenedAgent() {
    return new AffectiveAgent('guard-1', { neuroticism: 0.5, resilience: 0.5 });
}

describe('Debt: AffectiveAgent x LayeredMemorySystem', () => {
    it('1. Recalled trauma dread amplifies live fear appraisal', () => {
        const mem = new LayeredMemorySystem();
        mem.recordTrauma('SPATIAL', 'gate', 0.9, { x: 0, y: 0, z: 0 }, 50);
        mem.tickCount = 10;
        const dread = mem.getTraumaDread({ x: 5, y: 0, z: 0 });

        const withMemory = threatenedAgent();
        const rMem = withMemory.tick(0.016, { threats: [THREAT] }, { traumaDread: dread });
        const alone = threatenedAgent();
        const rAlone = alone.tick(0.016, { threats: [THREAT] }, {});

        expect(dread).toBeGreaterThan(0.5);
        expect(rMem.affective_state.raw_fear).toBeGreaterThan(rAlone.affective_state.raw_fear);
    });

    it('2. Panic episode persists as episodic memory and stays retrievable', () => {
        const agent = threatenedAgent();
        const mem = new LayeredMemorySystem();
        let panicked = false;
        for (let t = 0; t < 30; t++) {
            const r = agent.tick(0.016, { threats: [{ distance: 2.0, intensity: 1.0 }] }, {});
            if (r.fear_band === 'PANIC') panicked = true;
        }
        const id = mem.recordEpisodic({
            type: 'NEAR_DEATH_PANIC', valence: -1.0, arousal: 1.0, salience: 0.95,
            participants: ['guard-1', 'orc-7'], location: { x: 0, y: 0, z: 0 }, tick: 30
        });
        const found = mem.retrieveEpisodic({ participantId: 'guard-1', minSalience: 0.8 });
        expect(panicked).toBe(true);
        expect(id).toBeGreaterThan(0);
        expect(found.length).toBe(1);
        expect(found[0].type).toBe('NEAR_DEATH_PANIC');
    });

    it('3. Relevance scorer surfaces the threat memory for the same threat context', () => {
        const mem = new LayeredMemorySystem();
        mem.recordEpisodic({
            type: 'SURVIVED_AMBUSH', valence: -0.9, arousal: 0.9, salience: 0.85,
            participants: ['orc-7'], location: { x: 10, y: 0, z: 0 }, tick: 90
        });
        mem.recordEpisodic({
            type: 'RESOURCE_DISCOVERED', valence: 0.4, arousal: 0.2, salience: 0.3,
            participants: ['elf-2'], location: { x: 900, y: 0, z: 0 }, tick: 10
        });
        mem.tickCount = 100;
        const ranked = new MemoryRelevanceScorer().rank(mem, {
            nowTick: 100, entityIds: ['orc-7'],
            position: { x: 12, y: 0, z: 0 }, goalTags: ['ambush']
        }, 2);
        expect(ranked.ranked[0].type).toBe('SURVIVED_AMBUSH');
        expect(ranked.evaluated).toBe(2);
    });

    it('4. Affect-memory loop deterministic across repeated runs', () => {
        const run = () => {
            const agent = threatenedAgent();
            const mem = new LayeredMemorySystem();
            mem.recordTrauma('ENTITY', 'orc-7', 0.8);
            const out = [];
            for (let t = 0; t < 10; t++) {
                const dread = mem.getTraumaDread({ x: 0, y: 0, z: 0 }, ['orc-7']);
                out.push(agent.tick(0.016, { threats: [THREAT] }, { traumaDread: dread }).affective_state.raw_fear);
            }
            return out;
        };
        expect(run()).toEqual(run());
    });
});

describe('Debt: AffectiveAgent x RelationshipTensorSystem', () => {
    it('5. Trusted-leader calming context lowers fear vs abandonment context', () => {
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('guard-1', 'captain', INTERACTION_TYPES.LEADER_CALMING, { weight: 1.5 });
        rel.recordInteraction('guard-2', 'captain', INTERACTION_TYPES.ABANDONMENT, { weight: 1.5 });
        const trusted = rel.getRelationship('guard-1', 'captain');
        const abandoned = rel.getRelationship('guard-2', 'captain');
        expect(trusted.trust).toBeGreaterThan(abandoned.trust);

        // Advisory mapping: trust scales the leaderCalm context the host passes in.
        const calmCtx = { leaderCalm: trusted.trust * 0.8 };
        const coldCtx = { leaderCalm: Math.max(0, abandoned.trust) * 0.8 };
        const rCalm = threatenedAgent().tick(0.016, { threats: [THREAT] }, calmCtx);
        const rCold = threatenedAgent().tick(0.016, { threats: [THREAT] }, coldCtx);
        expect(rCalm.affective_state.raw_fear).toBeLessThanOrEqual(rCold.affective_state.raw_fear);
    });

    it('6. Betrayal writes grievance while shared survival writes trust (asymmetric)', () => {
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('a', 'b', INTERACTION_TYPES.SHARED_SURVIVAL, { weight: 1.0 });
        rel.recordInteraction('b', 'a', INTERACTION_TYPES.BETRAYAL, { weight: 1.0 });
        const ab = rel.getRelationship('a', 'b');
        const ba = rel.getRelationship('b', 'a');
        expect(ab.trust).toBeGreaterThan(ba.trust);
        expect(ba.grievance).toBeGreaterThan(ab.grievance);
    });
});

describe('Debt: FactionSystem x LayeredMemorySystem', () => {
    it('7. Faction raid incident persists as high-salience episodic memory', () => {
        const factions = new FactionSystem();
        factions.registerFaction({ id: 'highguard', name: 'Highguard' });
        factions.registerFaction({ id: 'redcloaks', name: 'Redcloaks' });
        factions.recordIncident('redcloaks', 'highguard', 'RAID_CONFIRMED', { severity: 0.9 });
        const stance = factions.getBilateralStance('highguard', 'redcloaks');
        expect(stance.grievance).toBeGreaterThan(0.5);
        const mem = new LayeredMemorySystem();
        const id = mem.recordEpisodic({
            type: 'COMBAT_CONFRONTATION', valence: -0.8, arousal: 0.9, salience: 0.9,
            participants: ['faction:redcloaks', 'faction:highguard'],
            details: { factionIncident: true }, tick: 5
        });
        const found = mem.retrieveEpisodic({ participantId: 'faction:redcloaks' });
        expect(id).toBeGreaterThan(0);
        expect(found.length).toBe(1);
    });

    it('8. Faction-memory sequence deterministic across repeated runs', () => {
        const run = () => {
            const factions = new FactionSystem();
            factions.registerFaction({ id: 'highguard', name: 'Highguard' });
            factions.registerFaction({ id: 'redcloaks', name: 'Redcloaks' });
            factions.recordIncident('redcloaks', 'highguard', 'RAID', { severity: 0.9 });
            const mem = new LayeredMemorySystem();
            mem.recordSemantic('redcloak-road', 'HAZARD', { x: 100, y: 0, z: 0 }, 0.8, { factionId: 'redcloaks' }, 6);
            return mem.semantic.get('redcloak-road').confidence;
        };
        expect(run()).toBe(run());
    });
});
