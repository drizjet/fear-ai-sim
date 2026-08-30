/**
 * Hybrid AI: Behavior Tree implementation (T8.2)
 * Integrates with GOAP as an external planner.
 */

export const BT_STATE = {
    SUCCESS: 1,
    FAILURE: 2,
    RUNNING: 3
};

export class BTNode {
    constructor() {
        this.state = BT_STATE.RUNNING;
    }
    tick(agent, visuals, globalMemory, safeHavens) {
        return BT_STATE.SUCCESS;
    }
}

export class Selector extends BTNode {
    constructor(children) {
        super();
        this.children = children;
    }
    tick(agent, visuals, globalMemory, safeHavens) {
        for (const child of this.children) {
            const status = child.tick(agent, visuals, globalMemory, safeHavens);
            if (status !== BT_STATE.FAILURE) {
                return status;
            }
        }
        return BT_STATE.FAILURE;
    }
}

export class Sequence extends BTNode {
    constructor(children) {
        super();
        this.children = children;
    }
    tick(agent, visuals, globalMemory, safeHavens) {
        for (const child of this.children) {
            const status = child.tick(agent, visuals, globalMemory, safeHavens);
            if (status !== BT_STATE.SUCCESS) {
                return status;
            }
        }
        return BT_STATE.SUCCESS;
    }
}

export class RequestGOAPPlanNode extends BTNode {
    tick(agent, visuals, globalMemory, safeHavens) {
        // Only replan if we don't have a plan or plan is exhausted
        if (!agent.brain.currentPlan || agent.brain.planStep >= agent.brain.currentPlan.length) {
            agent.brain.updatePlan(agent, visuals, safeHavens, false); // inSafeHaven simplified for now
        }

        if (agent.brain.currentPlan && agent.brain.currentPlan.length > 0) {
            return BT_STATE.SUCCESS; // Plan acquired
        }
        
        return BT_STATE.FAILURE; // No valid plan found
    }
}

export class ExecutePlanNode extends BTNode {
    tick(agent, visuals, globalMemory, safeHavens) {
        const brain = agent.brain;
        if (!brain.currentPlan || brain.planStep >= brain.currentPlan.length) {
            return BT_STATE.SUCCESS; // Plan finished
        }

        const currentAction = brain.currentPlan[brain.planStep];
        const success = this.executeAction(currentAction, agent, visuals, safeHavens);

        if (success) {
            brain.recordActionSuccess?.(currentAction.name, true);
            brain.planStep++;
            if (brain.planStep >= brain.currentPlan.length) {
                return BT_STATE.SUCCESS;
            }
            return BT_STATE.RUNNING;
        }

        brain.recordActionSuccess?.(currentAction.name, false);
        brain.currentPlan = null;
        brain.planStep = 0;
        return BT_STATE.FAILURE;
    }

    executeAction(action, agent, visuals, safeHavens = []) {
        if (!action || typeof action.name !== 'string') return false;

        // Revalidate the action against the current world before execution. Planning
        // happens on an earlier snapshot, so stale plans must not mutate behavior.
        const state = this.createExecutionState(agent, visuals, safeHavens);
        if (!action.checkPreconditions(state)) return false;

        // Execution here selects an authoritative Brain mode; movement and resource
        // mutation remain owned by Agent/Simulation.
        const states = {
            move_to_safe_haven: 'RECOVER',
            hide: 'HIDE',
            flee: 'PANIC',
            attack: 'AGGRESSIVE',
            eat_food: 'ALERT',
            distract: 'PANIC'
        };
        if (states[action.name]) agent.brain.state = states[action.name];
        return true;
    }

    createExecutionState(agent, visuals, safeHavens) {
        const threats = visuals?.threats || [];
        const food = visuals?.food || [];
        const neighbors = visuals?.neighbors || [];
        const inSafeHaven = safeHavens.some(sh =>
            agent.x > sh.x && agent.x < sh.x + sh.w &&
            agent.y > sh.y && agent.y < sh.y + sh.h
        );
        return {
            threat: threats.length === 0 ? 'NONE' : threats[0].dist < 100 ? 'IMMEDIATE' : threats[0].dist < 300 ? 'NEARBY' : 'DISTANT',
            isSafe: inSafeHaven || threats.length === 0,
            knowsSafeHaven: safeHavens.length > 0,
            nearFood: food.length > 0,
            nearObstacle: neighbors.length > 0,
            hasFamilyNearby: neighbors.some(n => n.familyName === agent.familyName),
            health: agent.energy > 80 ? 'OPTIMAL' : agent.energy > 40 ? 'STABLE' : agent.energy > 15 ? 'LOW' : 'CRITICAL',
            social: neighbors.length > 10 ? 'CROWDED' : neighbors.length > 4 ? 'GROUPED' : neighbors.length > 0 ? 'ACCOMPANIED' : 'ISOLATED',
            skill: agent.brain.traits.skill > 0.6 ? 'high' : 'low',
            curiosity: agent.brain.traits.curiosity > 0.7 ? 'high' : 'low',
            moral_duty: 'PENDING'
        };
    }
}

export class HybridBehaviorTree {
    constructor() {
        this.root = new Selector([
            new Sequence([
                new RequestGOAPPlanNode(),
                new ExecutePlanNode()
            ])
            // Fallbacks can be added here
        ]);
    }

    tick(agent, visuals, globalMemory, safeHavens) {
        this.root.tick(agent, visuals, globalMemory, safeHavens);
    }
}
