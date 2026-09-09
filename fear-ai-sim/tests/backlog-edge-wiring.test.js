/**
 * @file backlog-edge-wiring.test.js
 *
 * CCV backlog edges: relationship-filtered rally calming and
 * migration-history refugee information.
 */

import {
    GroupContagionSystem, RelationshipTensorSystem,
    RefugeeInformationHarness
} from '../packages/core/index.js';

function squadWithTensor() {
    const groups = new GroupContagionSystem();
    const tensor = new RelationshipTensorSystem();
    // Five members, two panicking: ratio 0.4 stays below the disciplined
    // bifurcation threshold so the rally branch (not cascade) evaluates.
    groups.createGroup('squad', 'SQUAD', 'DISCIPLINED_STAND', 'captain', ['captain', 'loyal', 'shaky', 'calm1', 'calm2']);
    // Loyal trusts the captain; shaky knows him but distrusts him.
    const loyalRel = tensor.getRelationship('loyal', 'captain');
    loyalRel.trust = 0.9;
    loyalRel.familiarity = 0.9;
    loyalRel.respect = 0.8;
    const shakyRel = tensor.getRelationship('shaky', 'captain');
    shakyRel.trust = -0.2;
    shakyRel.familiarity = 0.1;
    shakyRel.respect = 0.35;
    const states = new Map([
        ['captain', { id: 'captain', fear: 0.2, traits: { leadership: 0.9 }, position: { x: 0, y: 0, z: 0 } }],
        ['loyal', { id: 'loyal', fear: 0.8, position: { x: 5, y: 0, z: 0 } }],
        ['shaky', { id: 'shaky', fear: 0.8, position: { x: 6, y: 0, z: 0 } }],
        ['calm1', { id: 'calm1', fear: 0.1, position: { x: 4, y: 0, z: 0 } }],
        ['calm2', { id: 'calm2', fear: 0.1, position: { x: 7, y: 0, z: 0 } }]
    ]);
    return { groups, tensor, states };
}

describe('CCV edge: bonded rally calming', () => {
    test('1. Trusted members absorb more calming than distrustful ones', () => {
        const { groups, tensor, states } = squadWithTensor();
        const res = groups.evaluateGroup('squad', states, tensor, 1);
        const loyal = res.rallied.find((r) => r.agentId === 'loyal');
        const shaky = res.rallied.find((r) => r.agentId === 'shaky');
        expect(loyal).toBeDefined();
        expect(shaky).toBeDefined();
        expect(loyal.fearDamping).toBeGreaterThan(shaky.fearDamping);
    });
    test('2. Tensor-less callers keep legacy damping exactly', () => {
        const { groups, states } = squadWithTensor();
        const res = groups.evaluateGroup('squad', states, null, 1);
        // Rally covers every in-radius member meeting default respect/grievance.
        expect(res.rallied.length).toBe(4);
        for (const r of res.rallied) {
            expect(r.fearDamping).toBeCloseTo(0.25 * (0.5 + 0.5 * 0.9), 4);
        }
    });
});

describe('CCV edge: migration history voices arrivals', () => {
    test('3. War-caused arrivals seed rumors, unknown causes stay silent', () => {
        const h = new RefugeeInformationHarness();
        const history = [
            { event: 'ARRIVAL', partyId: 'p1', survivors: 60, dest: 'mill_town' },
            { event: 'ARRIVAL', partyId: 'p2', survivors: 40, dest: 'mill_town' },
            { event: 'DEPARTURE', partyId: 'p3' }
        ];
        const out = h.processMigrationHistory(history, { p1: 'WAR' });
        expect(out.rumorSeeds.length).toBe(1);
        expect(out.rumorSeeds[0].topic).toBe('APPROACHING_ARMY');
        expect(out.dreadSeeds.length).toBe(1);
        expect(() => h.processMigrationHistory('nope')).toThrow(/HISTORY_MUST_BE_ARRAY/);
    });

    test('4. Empty histories produce silence, not errors', () => {
        const h = new RefugeeInformationHarness();
        expect(h.processMigrationHistory([])).toEqual({ rumorSeeds: [], dreadSeeds: [] });
    });
});
