import { describe, expect, it } from '@jest/globals';
import {
    getAvailableActions,
    Action,
    MoveToSafeHavenAction,
    HideAction,
    FleeAction,
    AttackAction,
    EatFoodAction,
    FormGroupAction,
    ScoutAction,
    DistractPredatorAction
} from '../agentactions.js';

describe('getAvailableActions returns the full action library', () => {
    // The audit: the closed-world's agent decision loop
    // uses getAvailableActions to populate the planner's
    // action set. The function must return all 8 action
    // classes and must set target positions based on the
    // agent's visuals. The function is deterministic (no
    // randomness) so the same agent + visuals always
    // produces the same action set.

    const fullAgent = () => ({
        x: 100, y: 100, energy: 60,
        brain: {
            currentFear: 0.2, state: 'CALM',
            traits: { skill: 0.4, curiosity: 0.4, agreeableness: 0.5 }
        }
    });

    it('returns all 8 action classes', () => {
        const agent = fullAgent();
        const actions = getAvailableActions(agent);
        expect(actions).toHaveLength(8);
        const names = actions.map(a => a.name).sort();
        expect(names).toEqual([
            'attack', 'distract', 'eat_food', 'flee',
            'form_group', 'hide', 'move_to_safe_haven', 'scout'
        ].sort());
    });

    it('returns Action instances (not raw config)', () => {
        const agent = fullAgent();
        const actions = getAvailableActions(agent);
        for (const action of actions) {
            expect(action).toBeInstanceOf(Action);
            expect(typeof action.cost).toBe('number');
            expect(typeof action.preconditions).toBe('object');
            expect(typeof action.effects).toBe('object');
        }
    });

    it('sets target position for eat_food when food is visible', () => {
        const agent = fullAgent();
        const visuals = { food: [{ dx: 1, dy: 0, dist: 50 }], threats: [], neighbors: [], obstacles: [] };
        const actions = getAvailableActions(agent, visuals);
        const eat = actions.find(a => a.name === 'eat_food');
        expect(eat.targetPos).toBeDefined();
        expect(eat.targetPos.x).toBe(150);
        expect(eat.targetPos.y).toBe(100);
    });

    it('sets target position for flee when threats are visible', () => {
        const agent = fullAgent();
        const visuals = { food: [], threats: [{ dx: 1, dy: 0 }], neighbors: [], obstacles: [] };
        const actions = getAvailableActions(agent, visuals);
        const flee = actions.find(a => a.name === 'flee');
        expect(flee.targetPos).toBeDefined();
        expect(flee.targetPos.x).toBe(-400);
        expect(flee.targetPos.y).toBe(100);
    });

    it('two calls with the same agent and visuals produce identical action sets', () => {
        const agent = fullAgent();
        const visuals = { food: [{ dx: 1, dy: 0, dist: 50 }], threats: [{ dx: 0, dy: 1 }], neighbors: [], obstacles: [] };
        const actions1 = getAvailableActions(agent, visuals);
        const actions2 = getAvailableActions(agent, visuals);
        for (let i = 0; i < actions1.length; i += 1) {
            expect(actions1[i].name).toBe(actions2[i].name);
            expect(actions1[i].cost).toBe(actions2[i].cost);
            expect(actions1[i].targetPos).toEqual(actions2[i].targetPos);
        }
    });
});
