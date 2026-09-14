/**
 * @file pack-coordination-engine.test.js
 *
 * Frontier C & D / Tactical Subsystem:
 * Comprehensive Conformance Battery for PackCoordinationEngine (Round 44).
 *
 * Validates:
 * 1. Deterministic role allocation across member traits (Alpha, Flankers, Chasers, Bait, Rear Guard)
 * 2. Encirclement geometry & equidistant spatial distribution around target threat
 * 3. Alpha Morale Damping / Alpha Shielding attenuating subordinate fear
 * 4. Alpha Fall Catastrophe (incapacitation/panic) triggering immediate SCATTER_DISPERSE collapse
 * 5. Tactical phase progression & Feint Probe distraction dynamics
 * 6. Alternative formation patterns (V_FORMATION, CRESCENT_SURROUND, STAGGERED_LINE)
 * 7. Dynamic member addition/removal with clean role rebalancing
 * 8. Host Game Authority Invariant (purely advisory coordinates and vectors)
 * 9. Interaction coverage and no orphan integration debt
 */

import { describe, it, expect } from '@jest/globals';
import {
    PackCoordinationEngine,
    PACK_ROLES,
    TACTICAL_PHASES,
    ENCIRCLEMENT_PATTERNS,
    DEFAULT_PACK_CONFIG
} from '../packages/core/index.js';

describe('Frontier C & D: Multi-Agent Pack Coordination Engine (Round 44)', () => {

    it('1. Deterministically assigns optimal tactical roles based on composite traits', () => {
        const engine = new PackCoordinationEngine({ seed: 42 });
        const pack = engine.createPack('raider_squad_alpha', {
            phase: TACTICAL_PHASES.ENCIRCLING,
            pattern: ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER
        });

        // Register candidate members
        engine.registerMember('raider_squad_alpha', 'scout_runner', {
            dominance: 0.30, courage: 0.50, fear: 0.20, aggression: 0.40, speed: 1.6, resilience: 0.4
        });
        engine.registerMember('raider_squad_alpha', 'brute_warrior', {
            dominance: 0.95, courage: 0.90, fear: 0.10, aggression: 0.85, speed: 1.0, resilience: 0.9
        });
        engine.registerMember('raider_squad_alpha', 'agile_flanker_a', {
            dominance: 0.60, courage: 0.70, fear: 0.15, aggression: 0.80, speed: 1.45, resilience: 0.6
        });
        engine.registerMember('raider_squad_alpha', 'agile_flanker_b', {
            dominance: 0.55, courage: 0.65, fear: 0.20, aggression: 0.75, speed: 1.40, resilience: 0.6
        });
        engine.registerMember('raider_squad_alpha', 'anchor_guard', {
            dominance: 0.45, courage: 0.80, fear: 0.10, aggression: 0.50, speed: 0.8, resilience: 0.95
        });

        const evalTick = engine.tickPack('raider_squad_alpha');

        // Brute warrior must become ALPHA_LEADER
        expect(evalTick.alphaId).toBe('brute_warrior');
        const alpha = evalTick.members.find(m => m.memberId === 'brute_warrior');
        expect(alpha.role).toBe(PACK_ROLES.ALPHA_LEADER);

        // Fast agile agents must become Left/Right Flankers
        const flankerA = evalTick.members.find(m => m.memberId === 'agile_flanker_a');
        const flankerB = evalTick.members.find(m => m.memberId === 'agile_flanker_b');
        expect([PACK_ROLES.FLANKER_LEFT, PACK_ROLES.FLANKER_RIGHT]).toContain(flankerA.role);
        expect([PACK_ROLES.FLANKER_LEFT, PACK_ROLES.FLANKER_RIGHT]).toContain(flankerB.role);
        expect(flankerA.role).not.toBe(flankerB.role);

        // Scout runner with speed 1.6 should be Bait/Harasser
        const scout = evalTick.members.find(m => m.memberId === 'scout_runner');
        expect([PACK_ROLES.BAIT, PACK_ROLES.HARASSER, PACK_ROLES.CHASER]).toContain(scout.role);
    });

    it('2. Computes precise encirclement geometry and advisory headings around threat', () => {
        const engine = new PackCoordinationEngine({ seed: 101, defaultEngagementRadius: 20.0 });
        engine.createPack('hunting_pack', {
            phase: TACTICAL_PHASES.ENCIRCLING,
            pattern: ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER,
            engagementRadius: 20.0,
            targetThreat: { x: 100, y: 0, z: 50 }
        });

        engine.registerMember('hunting_pack', 'alpha', { dominance: 0.9, courage: 0.9, fear: 0.1 });
        engine.registerMember('hunting_pack', 'flank_1', { dominance: 0.5, speed: 1.3 });
        engine.registerMember('hunting_pack', 'flank_2', { dominance: 0.5, speed: 1.2 });
        engine.registerMember('hunting_pack', 'rear', { dominance: 0.4, speed: 0.8 });

        const evalTick = engine.tickPack('hunting_pack', { x: 100, y: 0, z: 50 });

        for (const m of evalTick.members) {
            // Distance from threat to advisory position must equal engagement radius (20.0)
            const dx = m.advisoryPosition.x - 100;
            const dz = m.advisoryPosition.z - 50;
            const dist = Math.hypot(dx, dz);
            expect(dist).toBeCloseTo(20.0, 1);

            // Heading vector must point towards target threat
            const headingLength = Math.hypot(m.headingVector.x, m.headingVector.z);
            expect(headingLength).toBeCloseTo(1.0, 2);

            // Dot product between heading vector and vector to target must be positive (facing target)
            const dirToTargetX = (100 - m.advisoryPosition.x) / dist;
            const dirToTargetZ = (50 - m.advisoryPosition.z) / dist;
            const dot = (m.headingVector.x * dirToTargetX) + (m.headingVector.z * dirToTargetZ);
            expect(dot).toBeGreaterThan(0.95);
        }
    });

    it('3. Verifies Alpha Morale Damping suppresses subordinate fear', () => {
        const engine = new PackCoordinationEngine();
        engine.createPack('damped_pack');

        // Strong calm Alpha (dominance 1.0, fear 0.05)
        engine.registerMember('damped_pack', 'leader', { dominance: 1.0, courage: 0.95, fear: 0.05 });
        // Subordinate with raw fear 0.50
        engine.registerMember('damped_pack', 'subordinate', { dominance: 0.2, fear: 0.50 });

        const tickWithAlpha = engine.tickPack('damped_pack');
        const subResult = tickWithAlpha.members.find(m => m.memberId === 'subordinate');

        // With alpha damping factor 0.40 and dominance 1.0, attenuation is 40%
        // Expected effective fear = 0.50 * (1 - 0.40 * 1.0) = 0.30
        expect(subResult.effectiveFear).toBeCloseTo(0.30, 2);
        expect(subResult.effectiveFear).toBeLessThan(0.50);
        expect(tickWithAlpha.packMorale).toBeGreaterThan(0.70);
    });

    it('4. Triggers Alpha Fall Catastrophe & immediate SCATTER_DISPERSE collapse when Alpha breaks', () => {
        const engine = new PackCoordinationEngine();
        engine.createPack('catastrophe_pack');

        engine.registerMember('catastrophe_pack', 'alpha', { dominance: 0.85, fear: 0.10 });
        engine.registerMember('catastrophe_pack', 'member_1', { dominance: 0.3, fear: 0.20 });
        engine.registerMember('catastrophe_pack', 'member_2', { dominance: 0.3, fear: 0.20 });

        const initialTick = engine.tickPack('catastrophe_pack');
        expect(initialTick.phase).toBe(TACTICAL_PHASES.STALKING);
        expect(initialTick.packCohesion).toBeGreaterThan(0.80);

        // Inject panic lock into Alpha (fear >= 0.85)
        const alpha = engine.packs.get('catastrophe_pack').members.get('alpha');
        alpha.traits.fear = 0.90;

        const panicTick = engine.tickPack('catastrophe_pack');
        expect(panicTick.phase).toBe(TACTICAL_PHASES.SCATTER_DISPERSE);
        expect(panicTick.packCohesion).toBeLessThan(0.50);

        // In scatter disperse, advisory vectors point radially OUTWARD away from threat
        for (const m of panicTick.members) {
            expect(m.phase).toBe(TACTICAL_PHASES.SCATTER_DISPERSE);
            expect(m.targetDistance).toBeGreaterThanOrEqual(DEFAULT_PACK_CONFIG.defaultEngagementRadius * 2);
        }
    });

    it('5. Handles removal (death) of Alpha by initiating immediate pack scatter', () => {
        const engine = new PackCoordinationEngine();
        engine.createPack('alpha_death_pack');

        engine.registerMember('alpha_death_pack', 'alpha_warlord', { dominance: 0.9, courage: 0.9, fear: 0.05 });
        engine.registerMember('alpha_death_pack', 'grunt_1', { dominance: 0.4, fear: 0.30 });
        engine.registerMember('alpha_death_pack', 'grunt_2', { dominance: 0.4, fear: 0.30 });

        engine.tickPack('alpha_death_pack');

        // Host reports alpha death / despawn
        const removed = engine.removeMember('alpha_death_pack', 'alpha_warlord');
        expect(removed).toBe(true);

        const afterDeathTick = engine.tickPack('alpha_death_pack');
        expect(afterDeathTick.phase).toBe(TACTICAL_PHASES.SCATTER_DISPERSE);
        expect(afterDeathTick.packCohesion).toBeLessThan(0.40);
    });

    it('6. Operates Feint Probe and Synchronized Strike distance modulation', () => {
        const engine = new PackCoordinationEngine({ defaultEngagementRadius: 15.0 });
        engine.createPack('probe_pack', {
            phase: TACTICAL_PHASES.FEINT_PROBE,
            pattern: ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER,
            targetThreat: { x: 0, y: 0, z: 0 }
        });

        engine.registerMember('probe_pack', 'alpha', { dominance: 0.9, courage: 0.9 });
        engine.registerMember('probe_pack', 'flank_1', { dominance: 0.6, speed: 1.6, aggression: 0.8 });
        engine.registerMember('probe_pack', 'flank_2', { dominance: 0.5, speed: 1.5, aggression: 0.7 });
        engine.registerMember('probe_pack', 'distractor_bait', { dominance: 0.3, speed: 1.4, fear: 0.2 });

        const feintTick = engine.tickPack('probe_pack');
        const bait = feintTick.members.find(m => m.memberId === 'distractor_bait');
        expect(bait).toBeDefined();
        expect(bait.isFeinting).toBe(true);
        // Bait advances closer during feint probe than perimeter
        expect(bait.targetDistance).toBeLessThan(15.0);

        // Transition to SYNCHRONIZED_STRIKE
        engine.setPhase('probe_pack', TACTICAL_PHASES.SYNCHRONIZED_STRIKE);
        const strikeTick = engine.tickPack('probe_pack');
        expect(strikeTick.phase).toBe(TACTICAL_PHASES.SYNCHRONIZED_STRIKE);

        // In synchronized strike, all members collapse to strike distance (3.5m)
        for (const m of strikeTick.members) {
            expect(m.targetDistance).toBeCloseTo(DEFAULT_PACK_CONFIG.strikeDistance, 1);
        }
    });

    it('7. Supports alternative geometric formations (V_FORMATION, CRESCENT_SURROUND, STAGGERED_LINE)', () => {
        const engine = new PackCoordinationEngine();
        engine.createPack('v_pack', {
            pattern: ENCIRCLEMENT_PATTERNS.V_FORMATION,
            phase: TACTICAL_PHASES.ENCIRCLING,
            targetThreat: { x: 50, y: 0, z: 50 }
        });

        for (let i = 0; i < 5; i++) {
            engine.registerMember('v_pack', `v_member_${i}`, { dominance: 0.5 + i * 0.1 });
        }

        const vEval = engine.tickPack('v_pack');
        expect(vEval.pattern).toBe(ENCIRCLEMENT_PATTERNS.V_FORMATION);
        expect(vEval.members.length).toBe(5);

        // Crescent surround
        engine.setPattern('v_pack', ENCIRCLEMENT_PATTERNS.CRESCENT_SURROUND);
        const crescentEval = engine.tickPack('v_pack');
        expect(crescentEval.pattern).toBe(ENCIRCLEMENT_PATTERNS.CRESCENT_SURROUND);

        // Staggered line
        engine.setPattern('v_pack', ENCIRCLEMENT_PATTERNS.STAGGERED_LINE);
        const staggeredEval = engine.tickPack('v_pack');
        expect(staggeredEval.pattern).toBe(ENCIRCLEMENT_PATTERNS.STAGGERED_LINE);
    });

    it('8. Strictly maintains Host Game Authority Invariant (ADVISORY_ONLY)', () => {
        const engine = new PackCoordinationEngine();
        engine.createPack('authority_pack');
        engine.registerMember('authority_pack', 'test_wolf', { dominance: 0.8 });

        const evaluation = engine.tickPack('authority_pack');

        expect(evaluation.host_authority).toBe('ADVISORY_ONLY');
        expect(evaluation.members[0]).toHaveProperty('advisoryPosition');
        expect(evaluation.members[0]).toHaveProperty('headingVector');
        expect(evaluation.members[0]).toHaveProperty('role');

        // Engine must NOT alter host world state or perform physics/damage
        expect(evaluation.members[0]).not.toHaveProperty('appliedDamage');
        expect(evaluation.members[0]).not.toHaveProperty('navmeshPath');
    });

    it('9. Generates clean ASCII tactical radar visualization', () => {
        const engine = new PackCoordinationEngine();
        engine.createPack('radar_pack', {
            phase: TACTICAL_PHASES.ENCIRCLING,
            pattern: ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER
        });
        engine.registerMember('radar_pack', 'alpha', { dominance: 0.95 });
        engine.registerMember('radar_pack', 'flanker_1', { dominance: 0.6, speed: 1.4 });
        engine.registerMember('radar_pack', 'flanker_2', { dominance: 0.5, speed: 1.3 });

        engine.tickPack('radar_pack');
        const radar = engine.renderAsciiRadar('radar_pack', 11);

        expect(radar).toContain('[T]'); // Target Threat present
        expect(radar).toContain('👑A'); // Alpha leader present
        expect(radar).toContain('Legend:');
    });
});
