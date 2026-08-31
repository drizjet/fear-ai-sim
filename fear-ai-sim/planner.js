/**
 * GOAP Planner: Goal-Oriented Action Planning for LainAI
 * Uses A* to find a sequence of actions that reach a desired world state.
 */
export class Planner {
    /**
     * Finds a plan (sequence of actions) to achieve a goal.
     * @param {Object} startState - Current world state { key: value }
     * @param {Object} goalState - Target world state { key: value }
     * @param {Array} actions - List of available Action objects
     * @param {Map} successStats - Optional success/failure stats for dynamic costs
     * @param {Object} agentPos - {x, y} for distance-based costs (T7.6)
     * @param {number} agentUncertainty - Current uncertainty level (T11.3)
     * @returns {Array|null} Sequence of Action objects or null if no plan found
     */
    plan(startState, goalState, actions, successStats = null, agentPos = null, agentUncertainty = 0) {
        const usableActions = actions.filter(action => action.cost > 0);
        
        // Nodes for A* search
        const root = {
            state: { ...startState },
            cost: 0,
            action: null,
            parent: null,
            heuristic: this.calculateHeuristic(startState, goalState)
        };

        const openList = [root];
        const closedList = [];

        while (openList.length > 0) {
            // Sort by f = g + h
            openList.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));
            const current = openList.shift();

            // Check if goal met
            if (this.isGoalMet(current.state, goalState)) {
                return this.reconstructPlan(current);
            }

            closedList.push(current);

            // Explore neighbors
            for (const action of usableActions) {
                if (action.checkPreconditions(current.state)) {
                    const nextState = action.applyEffects(current.state);
                    
                    if (this.isInList(closedList, nextState)) continue;

                    // Apply Situational Cost (T6.5, T7.6, T11.3)
                    let modifiedCost = action.cost;
                    
                    // 1. Success History (T6.5)
                    if (successStats && successStats.has(action.name)) {
                        const stats = successStats.get(action.name);
                        const total = stats.success + stats.fail;
                        if (total > 5) {
                            const failureRate = stats.fail / total;
                            modifiedCost *= (1 + failureRate * 2);
                        }
                    }

                    // 2. Distance-based cost (T7.6)
                    if (agentPos && action.targetPos) {
                        const dist = Math.hypot(agentPos.x - action.targetPos.x, agentPos.y - action.targetPos.y);
                        // Normalize distance cost (e.g. 1 unit per 100 pixels)
                        modifiedCost += (dist / 100);
                    }

                    // 3. Risk-Averse Decision Module (T11.3)
                    const potentialLoss = (action.name === 'attack' || action.name === 'distract') ? 5 : 1;
                    modifiedCost += (agentUncertainty * potentialLoss);

                    const g = current.cost + modifiedCost;
                    const h = this.calculateHeuristic(nextState, goalState);
                    
                    const existingNode = this.findInList(openList, nextState);
                    if (existingNode) {
                        if (g < existingNode.cost) {
                            existingNode.cost = g;
                            existingNode.parent = current;
                            existingNode.action = action;
                        }
                    } else {
                        openList.push({
                            state: nextState,
                            cost: g,
                            heuristic: h,
                            action: action,
                            parent: current
                        });
                    }
                }
            }
            
            // Safety break for deep searches
            if (closedList.length > 500) break;
        }

        return null;
    }

    isGoalMet(current, goal) {
        for (const key in goal) {
            if (current[key] !== goal[key]) return false;
        }
        return true;
    }

    calculateHeuristic(state, goal) {
        let h = 0;
        for (const key in goal) {
            if (state[key] !== goal[key]) h++;
        }
        return h;
    }

    reconstructPlan(node) {
        const plan = [];
        let current = node;
        while (current.parent) {
            plan.unshift(current.action);
            current = current.parent;
        }
        return plan;
    }

    isInList(list, state) {
        return list.some(node => this.areStatesEqual(node.state, state));
    }

    findInList(list, state) {
        return list.find(node => this.areStatesEqual(node.state, state));
    }

    areStatesEqual(a, b) {
        for (const key in a) {
            if (a[key] !== b[key]) return false;
        }
        for (const key in b) {
            if (b[key] !== a[key]) return false;
        }
        return true;
    }
}

/**
 * Represent a single action an agent can take.
 */
export class Action {
    constructor(name, cost = 1) {
        this.name = name;
        this.cost = cost;
        this.preconditions = {};
        this.effects = {};
    }

    addPrecondition(key, value) {
        this.preconditions[key] = value;
    }

    addEffect(key, value) {
        this.effects[key] = value;
    }

    checkPreconditions(state) {
        for (const key in this.preconditions) {
            if (state[key] !== this.preconditions[key]) return false;
        }
        return true;
    }

    applyEffects(state) {
        const newState = { ...state };
        for (const key in this.effects) {
            newState[key] = this.effects[key];
        }
        return newState;
    }
}
