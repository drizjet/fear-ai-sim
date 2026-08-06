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
        
        // Check if action preconditions are still met (dynamic world)
        // For simplicity, we just execute. If it fails, we fail the node.
        const success = this.executeAction(currentAction, agent, visuals);

        if (success) {
            // Action finished successfully
            brain.planStep++;
            if (brain.planStep >= brain.currentPlan.length) {
                return BT_STATE.SUCCESS;
            }
            return BT_STATE.RUNNING; // Still executing plan
        } else {
            // Action failed (e.g. target moved away)
            brain.currentPlan = null;
            brain.planStep = 0;
            return BT_STATE.FAILURE;
        }
    }

    executeAction(action, agent, visuals) {
        // Simulated execution (in a real game, this would interface with animation/physics)
        // For our simulation, movement is handled by the state machine (decide method).
        // The BT here serves as a high-level intent driver.
        if (action.name === 'move_to_safe_haven') {
             agent.brain.state = 'RECOVER';
             return true; // Assume success for this tick
        } else if (action.name === 'hide') {
             agent.brain.state = 'HIDE';
             return true;
        } else if (action.name === 'flee') {
             agent.brain.state = 'PANIC';
             return true;
        } else if (action.name === 'attack') {
             agent.brain.state = 'AGGRESSIVE';
             return true;
        } else if (action.name === 'eat_food') {
             agent.brain.state = 'ALERT';
             return true; // We're trying to eat
        }
        
        return true; 
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
