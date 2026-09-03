/**
 * GOAP Actions for Agent AI
 * Phase 7: World State Minimization (T7.1)
 */

/**
 * Base Action class for GOAP
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
        return this;
    }

    addEffect(key, value) {
        this.effects[key] = value;
        return this;
    }

    checkPreconditions(state) {
        for (const [key, value] of Object.entries(this.preconditions)) {
            if (state[key] !== value) return false;
        }
        return true;
    }

    applyEffects(state) {
        const newState = { ...state };
        for (const [key, value] of Object.entries(this.effects)) {
            newState[key] = value;
        }
        return newState;
    }
}

/**
 * Action: Move to Safe Haven
 */
export class MoveToSafeHavenAction extends Action {
    constructor() {
        super('move_to_safe_haven', 2);
        this.addPrecondition('knowsSafeHaven', true);
        this.addEffect('threat', 'NONE');
        this.addEffect('isSafe', true);
    }
}

/**
 * Action: Hide from Threat
 */
export class HideAction extends Action {
    constructor() {
        super('hide', 1);
        this.addPrecondition('nearObstacle', true);
        this.addPrecondition('skill', 'high');
        this.addEffect('threat', 'NONE');
        this.addEffect('isSafe', true);
    }
}

/**
 * Action: Flee from Threat
 */
export class FleeAction extends Action {
    constructor() {
        super('flee', 3);
        // Can flee regardless of preconditions if threat exists
        this.addEffect('threat', 'NONE');
    }
}

/**
 * Action: Attack Threat
 * Phase 8: PAD Model integration (Anger drives attacks)
 */
export class AttackAction extends Action {
    constructor() {
        super('attack', 5); // Default high cost, reduced by Anger
        this.addEffect('threat', 'NONE');
    }
}

/**
 * Action: Find and Eat Food
 */
export class EatFoodAction extends Action {
    constructor() {
        super('eat_food', 2);
        this.addPrecondition('nearFood', true);
        this.addEffect('health', 'STABLE');
    }
}

/**
 * Action: Form Group (Herd behavior)
 */
export class FormGroupAction extends Action {
    constructor() {
        super('form_group', 1);
        this.addEffect('social', 'GROUPED');
    }
}

/**
 * Action: Scout Area
 */
export class ScoutAction extends Action {
    constructor() {
        super('scout', 2);
        this.addPrecondition('curiosity', 'high');
        this.addPrecondition('isSafe', true);
        this.addEffect('knowsSafeHaven', true);
    }
}

/**
 * Action: Distract Predator (T8.4 - Moral Agency)
 * High risk action to protect family members.
 */
export class DistractPredatorAction extends Action {
    constructor() {
        super('distract', 6); // Base cost is very high
        this.addPrecondition('hasFamilyNearby', true);
        this.addEffect('moral_duty', 'FULFILLED');
    }
}

/**
 * Get all available actions for an agent
 */
export function getAvailableActions(agent, visuals = null) {
    const actions = [
        new MoveToSafeHavenAction(),
        new HideAction(),
        new FleeAction(),
        new AttackAction(),
        new EatFoodAction(),
        new FormGroupAction(),
        new ScoutAction(),
        new DistractPredatorAction()
    ];

    // Assign target positions for situational costs (T7.6)
    if (visuals) {
        if (visuals.food.length > 0) {
            const eat = actions.find(a => a.name === 'eat_food');
            if (eat) eat.targetPos = { 
                x: agent.x + visuals.food[0].dx * visuals.food[0].dist,
                y: agent.y + visuals.food[0].dy * visuals.food[0].dist
            };
        }
        
        if (visuals.threats.length > 0) {
            const flee = actions.find(a => a.name === 'flee');
            if (flee) flee.targetPos = {
                x: agent.x - visuals.threats[0].dx * 500, // Move far away
                y: agent.y - visuals.threats[0].dy * 500
            };
            const attack = actions.find(a => a.name === 'attack');
            if (attack) attack.targetPos = {
                x: agent.x + visuals.threats[0].dx * visuals.threats[0].dist,
                y: agent.y + visuals.threats[0].dy * visuals.threats[0].dist
            };
            const distract = actions.find(a => a.name === 'distract');
            if (distract) distract.targetPos = {
                // Move perpendicular to threat to draw it away
                x: agent.x + visuals.threats[0].dy * 100, 
                y: agent.y - visuals.threats[0].dx * 100
            };
        }
    }

    // Phase 8: PAD Emotional Model multipliers
    const flee = actions.find(a => a.name === 'flee');
    if (flee && agent.brain.currentFear !== undefined) {
        // High fear reduces flee cost
        flee.cost /= Math.max(0.1, (1.0 + agent.brain.currentFear * 2));
    }
    
    const attack = actions.find(a => a.name === 'attack');
    if (attack && agent.brain.currentAnger !== undefined) {
        // High anger drastically reduces attack cost
        attack.cost /= Math.max(0.1, (1.0 + agent.brain.currentAnger * 5));
    }

    // Pillar 2: Prospect Theory (Loss Aversion)
    // Energy loss (risk) is weighted 2x more heavily than energy gain
    if (flee) flee.cost *= 0.5; // Fleeing is "cheaper" because avoiding loss is priority
    const eat = actions.find(a => a.name === 'eat_food');
    if (eat) eat.cost *= 1.2; // Seeking gain is "more expensive" relative to avoiding loss

    // Moral Agency: Agreeableness reduces cost to distract (T8.4)
    const distract = actions.find(a => a.name === 'distract');
    if (distract && agent.brain.traits.agreeableness !== undefined) {
        // High agreeableness and low fear makes distraction more likely
        const willingness = agent.brain.traits.agreeableness * 2 - agent.brain.currentFear;
        if (willingness > 0) {
            distract.cost /= (1.0 + willingness * 5);
        }
    }

    // Modify costs based on agent traits
    if (agent.brain.traits.skill > 0.6) {
        const hide = actions.find(a => a.name === 'hide');
        if (hide) hide.cost = 0.5;
    }
    if (agent.brain.traits.curiosity > 0.7) {
        const scout = actions.find(a => a.name === 'scout');
        if (scout) scout.cost = 1;
    }

    return actions;
}

/**
 * Create world state from agent and environment
 * Phase 7: World State Minimization (T7.1)
 */
export function createWorldState(agent, visuals, safeHavens, inSafeHaven) {
    const threats = visuals.threats;
    const neighbors = visuals.neighbors;
    const food = visuals.food;

    // Enumerated status values
    let healthStatus = 'CRITICAL';
    if (agent.energy > 80) healthStatus = 'OPTIMAL';
    else if (agent.energy > 40) healthStatus = 'STABLE';
    else if (agent.energy > 15) healthStatus = 'LOW';

    let threatStatus = 'NONE';
    if (threats.length > 0) {
        const dist = threats[0].dist;
        if (dist < 100) threatStatus = 'IMMEDIATE';
        else if (dist < 300) threatStatus = 'NEARBY';
        else threatStatus = 'DISTANT';
    }

    let socialStatus = 'ISOLATED';
    if (neighbors.length > 10) socialStatus = 'CROWDED';
    else if (neighbors.length > 4) socialStatus = 'GROUPED';
    else if (neighbors.length > 0) socialStatus = 'ACCOMPANIED';

    // Moral check: Are family members nearby?
    const hasFamilyNearby = neighbors.some(n => n.familyName === agent.familyName);

    return {
        // Core enums (T7.1)
        health: healthStatus,
        threat: threatStatus,
        social: socialStatus,
        
        // Contextual flags
        isSafe: inSafeHaven || threats.length === 0,
        knowsSafeHaven: (safeHavens && safeHavens.length > 0) || agent.brain.traits.skill > 0.8,
        nearFood: food.length > 0,
        nearObstacle: detectNearObstacle(agent, visuals),
        hasFamilyNearby: hasFamilyNearby,
        moral_duty: 'PENDING',
        
        // Traits
        skill: agent.brain.traits.skill > 0.6 ? 'high' : 'low',
        curiosity: agent.brain.traits.curiosity > 0.7 ? 'high' : 'low'
    };
}

/**
 * Create a goal based on agent needs
 */
export function createGoal(agent, visuals) {
    const hasFamilyNearby = visuals.neighbors.some(n => n.familyName === agent.familyName);

    // Moral Agency (T8.4)
    if (visuals.threats.length > 0 && hasFamilyNearby && agent.brain.traits.agreeableness > 0.7 && agent.brain.currentFear < 0.6) {
        return { moral_duty: 'FULFILLED' };
    }

    // Priority 1: Survival from immediate threats
    if (visuals.threats.length > 0 && visuals.threats[0].dist < 150) {
        return { threat: 'NONE' };
    }

    
    // Priority 2: Nutrition if low energy
    if (agent.energy < 40) {
        return { health: 'STABLE' };
    }
    
    // Priority 3: Social safety
    if (agent.brain.state === 'ANXIOUS' && visuals.neighbors.length < 3) {
        return { social: 'GROUPED' };
    }
    
    // Default: Be safe
    return { isSafe: true };
}

/**
 * Determine whether the agent is actually near an obstacle.
 *
 * The previous implementation aliased this to `visuals.neighbors.length > 0`,
 * which is incorrect in any populated simulation and over-gates the `hide`
 * GOAP action. The new contract is tiered:
 *   1. `visuals.obstacles` is the authoritative list of obstacles in the
 *      agent's perception radius. The agent is "near" if the closest obstacle
 *      is within `OBSTACLE_NEAR_RADIUS` units.
 *   2. `visuals.queryObstacleAt(x, y)` is an optional spatial query the caller
 *      can provide for lazy obstacle lookups.
 *   3. If neither is supplied, fall back to the legacy neighbor heuristic and
 *      surface a one-time console warning so the gap is visible. Callers that
 *      care about correctness must populate `visuals.obstacles`.
 */
const OBSTACLE_NEAR_RADIUS = 60;
let nearObstacleWarned = false;

export { OBSTACLE_NEAR_RADIUS };

function detectNearObstacle(agent, visuals) {
    const obstacles = visuals && visuals.obstacles;
    if (Array.isArray(obstacles) && obstacles.length > 0 && agent) {
        const ax = agent.x;
        const ay = agent.y;
        let nearest = Infinity;
        for (let i = 0; i < obstacles.length; i++) {
            const o = obstacles[i];
            if (!o) continue;
            const ox = Number.isFinite(o.x) ? o.x : (o.position && o.position.x);
            const oy = Number.isFinite(o.y) ? o.y : (o.position && o.position.y);
            if (!Number.isFinite(ox) || !Number.isFinite(oy)) continue;
            const dx = ox - ax;
            const dy = oy - ay;
            const d2 = dx * dx + dy * dy;
            if (d2 < nearest) nearest = d2;
        }
        return nearest <= OBSTACLE_NEAR_RADIUS * OBSTACLE_NEAR_RADIUS;
    }

    if (visuals && typeof visuals.queryObstacleAt === 'function' && agent) {
        const hit = visuals.queryObstacleAt(agent.x, agent.y, OBSTACLE_NEAR_RADIUS);
        return Boolean(hit);
    }

    if (!nearObstacleWarned && typeof console !== 'undefined') {
        nearObstacleWarned = true;
        console.warn('[agentactions] createWorldState called without visuals.obstacles; falling back to neighbor heuristic. Populate visuals.obstacles to enable correct hide-gating.');
    }
    return !!(visuals && visuals.neighbors && visuals.neighbors.length > 0);
}
