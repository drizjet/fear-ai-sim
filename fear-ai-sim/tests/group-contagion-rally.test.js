/**
 * tests/group-contagion-rally.test.js
 *
 * Test suite for Milestone E: Group Contagion Cascades & Rally Dynamics.
 * Verifies critical mass tipping points, leader rally dynamics, leader break catastrophes,
 * cowardly desertion with grievance records, group fragmentation, and snapshot replay determinism.
 */

import {
    GroupContagionSystem,
    GROUP_TYPES,
    GROUP_DOCTRINES,
    GROUP_STATES,
    GROUP_DIRECTIVES,
    RelationshipTensorSystem
} from '../packages/core/index.js';

describe('Milestone E: Group Contagion Cascades & Rally Dynamics', () => {
    let groupSys;
    let relSys;

    beforeEach(() => {
        groupSys = new GroupContagionSystem();
        relSys = new RelationshipTensorSystem();
    });

    test('1. Group registration, membership, and leader management', () => {
        const squad = groupSys.createGroup(
            'squad_alpha',
            GROUP_TYPES.SQUAD,
            GROUP_DOCTRINES.DISCIPLINED_STAND,
            'lead_1',
            ['lead_1', 'soldier_1', 'soldier_2']
        );

        expect(squad).toBeDefined();
        expect(squad.id).toBe('squad_alpha');
        expect(squad.members.length).toBe(3);
        expect(squad.state).toBe(GROUP_STATES.COHESIVE_CALM);

        groupSys.addMember('squad_alpha', 'soldier_3');
        expect(squad.members.length).toBe(4);
        expect(squad.members).toContain('soldier_3');

        groupSys.setLeader('squad_alpha', 'soldier_1');
        expect(squad.leaderId).toBe('soldier_1');

        groupSys.removeMember('squad_alpha', 'soldier_2');
        expect(squad.members).not.toContain('soldier_2');
        expect(squad.members.length).toBe(3);
    });

    test('2. Isolated stress is absorbed without triggering cascade in disciplined squad', () => {
        groupSys.createGroup(
            'iron_squad',
            GROUP_TYPES.SQUAD,
            GROUP_DOCTRINES.DISCIPLINED_STAND,
            'capt',
            ['capt', 'sq1', 'sq2', 'sq3', 'sq4', 'sq5']
        );

        const agentStates = new Map([
            ['capt', { id: 'capt', fear: 0.1, isPanicking: false, traits: { leadership: 0.8, resilience: 0.8 } }],
            ['sq1', { id: 'sq1', fear: 0.85, isPanicking: true, traits: { conscientiousness: 0.7, resilience: 0.6 } }], // 1 stressed member
            ['sq2', { id: 'sq2', fear: 0.15, isPanicking: false, traits: { conscientiousness: 0.8, resilience: 0.7 } }],
            ['sq3', { id: 'sq3', fear: 0.10, isPanicking: false, traits: { conscientiousness: 0.8, resilience: 0.7 } }],
            ['sq4', { id: 'sq4', fear: 0.12, isPanicking: false, traits: { conscientiousness: 0.8, resilience: 0.7 } }],
            ['sq5', { id: 'sq5', fear: 0.14, isPanicking: false, traits: { conscientiousness: 0.8, resilience: 0.7 } }]
        ]);

        const result = groupSys.evaluateGroup('iron_squad', agentStates, relSys);

        // 1 panicking out of 6 is 16.7% < disciplined threshold (0.40 + 0.15 + 0.08 = 0.63)
        expect(result.state).toBe(GROUP_STATES.CONTESTED_STAND);
        expect(result.directive).toBe(GROUP_DIRECTIVES.STAND_GROUND);
        expect(result.panickingRatio).toBeCloseTo(1 / 6, 2);
        expect(result.cohesion).toBeGreaterThan(0.85);
    });

    test('3. Heroic Leader actively rallies wavering peers within rally radius (spatial clipping)', () => {
        groupSys.createGroup(
            'shield_wall',
            GROUP_TYPES.SQUAD,
            GROUP_DOCTRINES.DISCIPLINED_STAND,
            'commander',
            ['commander', 'soldier_a', 'soldier_b', 'soldier_c', 'soldier_d']
        );

        // Leader is calm and at (0,0,0); 2 out of 5 soldiers are wavering (panicking)
        // soldier_a and soldier_b are within rallyRadius (35m); soldier_c and soldier_d are far away (100m)
        const agentStates = new Map([
            ['commander', { id: 'commander', fear: 0.15, isPanicking: false, position: { x: 0, y: 0, z: 0 }, traits: { leadership: 0.9, resilience: 0.9 } }],
            ['soldier_a', { id: 'soldier_a', fear: 0.72, isPanicking: true, position: { x: 10, y: 5, z: 0 }, traits: { conscientiousness: 0.7, resilience: 0.6 } }],
            ['soldier_b', { id: 'soldier_b', fear: 0.75, isPanicking: true, position: { x: 5, y: -10, z: 0 }, traits: { conscientiousness: 0.6, resilience: 0.5 } }],
            ['soldier_c', { id: 'soldier_c', fear: 0.20, isPanicking: false, position: { x: 100, y: 0, z: 0 }, traits: { conscientiousness: 0.8, resilience: 0.7 } }],
            ['soldier_d', { id: 'soldier_d', fear: 0.18, isPanicking: false, position: { x: -100, y: 0, z: 0 }, traits: { conscientiousness: 0.8, resilience: 0.7 } }]
        ]);

        const result = groupSys.evaluateGroup('shield_wall', agentStates, relSys);

        expect(result.state).toBe(GROUP_STATES.RALLYING);
        expect(result.directive).toBe(GROUP_DIRECTIVES.RALLY_TO_LEADER);
        // Only soldier_a and soldier_b are within rallyRadius: 35
        expect(result.rallied.length).toBe(2);
        const ralliedIds = result.rallied.map(r => r.agentId);
        expect(ralliedIds).toContain('soldier_a');
        expect(ralliedIds).toContain('soldier_b');
        expect(ralliedIds).not.toContain('soldier_c');
        expect(ralliedIds).not.toContain('soldier_d');
        expect(result.rallied[0].fearDamping).toBeGreaterThan(0.20);
    });

    test('4. Leader rally is rejected by members with high grievance or low respect', () => {
        groupSys.createGroup(
            'rebel_cell',
            GROUP_TYPES.SQUAD,
            GROUP_DOCTRINES.DISCIPLINED_STAND,
            'tyrant',
            ['tyrant', 'loyal_peer', 'resentful_peer', 'neutral_1', 'neutral_2']
        );

        // Set high grievance and low respect for resentful_peer toward tyrant
        relSys.getRelationship('resentful_peer', 'tyrant').respect = 0.10;
        relSys.getRelationship('resentful_peer', 'tyrant').grievance = 0.75;

        // loyal_peer has high respect
        relSys.getRelationship('loyal_peer', 'tyrant').respect = 0.85;
        relSys.getRelationship('loyal_peer', 'tyrant').grievance = 0.05;

        const agentStates = new Map([
            ['tyrant', { id: 'tyrant', fear: 0.1, isPanicking: false, position: { x: 0, y: 0, z: 0 }, traits: { leadership: 0.8 } }],
            ['loyal_peer', { id: 'loyal_peer', fear: 0.72, isPanicking: true, position: { x: 5, y: 0, z: 0 } }],
            ['resentful_peer', { id: 'resentful_peer', fear: 0.78, isPanicking: true, position: { x: -5, y: 0, z: 0 } }],
            ['neutral_1', { id: 'neutral_1', fear: 0.2, isPanicking: false, position: { x: 2, y: 2, z: 0 } }],
            ['neutral_2', { id: 'neutral_2', fear: 0.25, isPanicking: false, position: { x: -2, y: -2, z: 0 } }]
        ]);

        const result = groupSys.evaluateGroup('rebel_cell', agentStates, relSys);

        expect(result.state).toBe(GROUP_STATES.RALLYING);
        const ralliedIds = result.rallied.map(r => r.agentId);
        expect(ralliedIds).toContain('loyal_peer');
        expect(ralliedIds).not.toContain('resentful_peer');
    });

    test('5. Critical mass bifurcation triggers cascade in civilian crowd', () => {
        groupSys.createGroup(
            'market_crowd',
            GROUP_TYPES.CIVILIAN_CROWD,
            GROUP_DOCTRINES.SELF_PRESERVATION,
            null,
            ['civ1', 'civ2', 'civ3', 'civ4']
        );

        // Self-preservation threshold is 0.40 - 0.15 = 0.25
        // 2 out of 4 panicking = 50% >= 25% threshold
        const agentStates = new Map([
            ['civ1', { id: 'civ1', fear: 0.8, isPanicking: true }],
            ['civ2', { id: 'civ2', fear: 0.85, isPanicking: true }],
            ['civ3', { id: 'civ3', fear: 0.2, isPanicking: false }],
            ['civ4', { id: 'civ4', fear: 0.3, isPanicking: false }]
        ]);

        const result = groupSys.evaluateGroup('market_crowd', agentStates, relSys);

        expect(result.state).toBe(GROUP_STATES.CASCADE_TRIGGERED);
        expect(result.directive).toBe(GROUP_DIRECTIVES.SCATTER_AND_FLEE);
        expect(groupSys.getContagionMultiplier('market_crowd', 'civ3')).toBe(1.4);
    });

    test('6. Leader break catastrophe shatters cohesion and amplifies follower panic', () => {
        groupSys.createGroup(
            'vanguard',
            GROUP_TYPES.SQUAD,
            GROUP_DOCTRINES.DISCIPLINED_STAND,
            'coward_captain',
            ['coward_captain', 'soldier_x', 'soldier_y']
        );

        // Leader panics with severe fear (0.95)
        const agentStates = new Map([
            ['coward_captain', { id: 'coward_captain', fear: 0.95, isPanicking: true, traits: { leadership: 0.7 } }],
            ['soldier_x', { id: 'soldier_x', fear: 0.4, isPanicking: false }],
            ['soldier_y', { id: 'soldier_y', fear: 0.35, isPanicking: false }]
        ]);

        const result = groupSys.evaluateGroup('vanguard', agentStates, relSys);

        // Cohesion shattered by at least 50%
        expect(result.cohesion).toBeLessThanOrEqual(0.5);
        expect(result.state).toBe(GROUP_STATES.CASCADE_TRIGGERED);

        // Contagion multiplier combines cascade (1.4x) and leader broken (2.0x) = 2.8x
        const multiplier = groupSys.getContagionMultiplier('vanguard', 'soldier_x', true);
        expect(multiplier).toBeCloseTo(2.8, 1);
    });

    test('7. Cowardly desertion records abandonment grievance across loyal members', () => {
        groupSys.createGroup(
            'defense_squad',
            GROUP_TYPES.SQUAD,
            GROUP_DOCTRINES.SELF_PRESERVATION, // Triggers cascade easily
            'sergeant',
            ['sergeant', 'loyalist', 'coward']
        );

        const agentStates = new Map([
            ['sergeant', { id: 'sergeant', fear: 0.8, isPanicking: true, traits: { conscientiousness: 0.9, resilience: 0.8 } }],
            ['loyalist', { id: 'loyalist', fear: 0.8, isPanicking: true, traits: { conscientiousness: 0.85, resilience: 0.75 } }],
            ['coward', { id: 'coward', fear: 0.95, isPanicking: true, traits: { conscientiousness: 0.1, resilience: 0.1 } }] // High terror, low discipline
        ]);

        const result = groupSys.evaluateGroup('defense_squad', agentStates, relSys);

        expect(result.newlyDeserted).toContain('coward');
        expect(result.newlyDeserted).not.toContain('loyalist');

        // Check abandonment grievance recorded on remaining loyalists
        const relLoyalToCoward = relSys.getRelationship('loyalist', 'coward');
        expect(relLoyalToCoward).toBeDefined();
        expect(relLoyalToCoward.grievance).toBeGreaterThan(0.20);
        expect(relLoyalToCoward.trust).toBeLessThan(0.50);
    });

    test('8. Group fragmentation when >=50% members desert', () => {
        groupSys.createGroup(
            'caravan_guard',
            GROUP_TYPES.CARAVAN,
            GROUP_DOCTRINES.SELF_PRESERVATION,
            'escort_lead',
            ['escort_lead', 'hireling_1', 'hireling_2']
        );

        // Both hirelings are cowards who desert
        const agentStates = new Map([
            ['escort_lead', { id: 'escort_lead', fear: 0.85, isPanicking: true, traits: { conscientiousness: 0.9, resilience: 0.8 } }],
            ['hireling_1', { id: 'hireling_1', fear: 0.95, isPanicking: true, traits: { conscientiousness: 0.1, resilience: 0.1 } }],
            ['hireling_2', { id: 'hireling_2', fear: 0.95, isPanicking: true, traits: { conscientiousness: 0.1, resilience: 0.1 } }]
        ]);

        const result = groupSys.evaluateGroup('caravan_guard', agentStates, relSys);

        expect(result.state).toBe(GROUP_STATES.FRAGMENTED);
        expect(result.desertersCount).toBe(2);
    });

    test('9. State serialization and 100% bit-for-bit replay determinism', () => {
        groupSys.createGroup(
            'squad_gamma',
            GROUP_TYPES.SQUAD,
            GROUP_DOCTRINES.DISCIPLINED_STAND,
            'leader_g',
            ['leader_g', 'm1', 'm2']
        );

        const agentStates = new Map([
            ['leader_g', { id: 'leader_g', fear: 0.2, isPanicking: false, traits: { leadership: 0.8 } }],
            ['m1', { id: 'm1', fear: 0.5, isPanicking: false }],
            ['m2', { id: 'm2', fear: 0.6, isPanicking: false }]
        ]);

        groupSys.evaluateGroup('squad_gamma', agentStates, relSys, 5);

        const snapshot = groupSys.getState();
        expect(snapshot.tickCount).toBe(5);
        expect(snapshot.groups.length).toBe(1);

        const cloneSys = new GroupContagionSystem();
        cloneSys.setState(snapshot);

        const restoredGroup = cloneSys.groups.get('squad_gamma');
        expect(restoredGroup).toBeDefined();
        expect(restoredGroup.state).toBe(GROUP_STATES.CONTESTED_STAND);
        expect(restoredGroup.members).toEqual(['leader_g', 'm1', 'm2']);
        expect(cloneSys.tickCount).toBe(5);

        // Verify identical re-evaluation from restored state
        const resOrig = groupSys.evaluateGroup('squad_gamma', agentStates, relSys, 1);
        const resClone = cloneSys.evaluateGroup('squad_gamma', agentStates, relSys, 1);

        expect(resOrig.state).toBe(resClone.state);
        expect(resOrig.morale).toBeCloseTo(resClone.morale, 6);
        expect(resOrig.cohesion).toBeCloseTo(resClone.cohesion, 6);
    });
});
