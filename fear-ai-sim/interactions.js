const ACTIONS = Object.freeze([
    'Observe', 'Greet', 'Feed', 'Recruit', 'Transform', 'Protect',
    'Threaten', 'Interrogate', 'Rob', 'Report', 'Flee', 'Attack', 'Kill'
]);

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export class InteractionEngine {
    constructor({ cooldown = 1 } = {}) {
        this.cooldown = cooldown;
        this.lastAction = new Map();
    }

    validate(action, actor, target, world = {}, tick = 0) {
        const errors = [];
        if (!ACTIONS.includes(action)) errors.push('UNKNOWN_ACTION');
        if (!actor || actor.dead) errors.push('INVALID_ACTOR');
        if (!target || target.dead) errors.push('INVALID_TARGET');
        if (actor && target && actor.id === target.id) errors.push('SELF_TARGET');
        if (actor && target && actor.factionId && target.factionId === actor.factionId && ['Attack', 'Kill', 'Rob'].includes(action)) errors.push('ALLY_TARGET');
        if (actor && ['Attack', 'Kill', 'Threaten', 'Rob'].includes(action) && !actor.canFight) errors.push('NO_CAPABILITY');
        if (actor && ['Feed', 'Recruit', 'Transform'].includes(action) && (actor.resources ?? 0) <= 0) errors.push('NO_RESOURCE');
        if (actor && this.lastAction.get(actor.id) !== undefined && tick - this.lastAction.get(actor.id) < this.cooldown) errors.push('COOLDOWN');
        if (action === 'Kill' && target?.immuneToDeath) errors.push('IMMUNITY');
        if (action === 'Report' && !(world.witnesses?.has?.(actor?.id) || actor?.canReport)) errors.push('NO_WITNESS');
        return { valid: errors.length === 0, errors };
    }

    execute(action, actor, target, world = {}, tick = 0) {
        const validation = this.validate(action, actor, target, world, tick);
        if (!validation.valid) return { ok: false, ...validation };
        this.lastAction.set(actor.id, tick);
        const consequence = { action, actorId: actor.id, targetId: target.id };
        if (action === 'Feed') { actor.resources--; target.energy = Math.min(1, (target.energy ?? 0) + 0.25); }
        if (action === 'Recruit') { actor.resources--; target.factionId = actor.factionId; }
        if (action === 'Transform') { actor.resources--; target.type = 'vampire'; }
        if (action === 'Protect') target.protectedBy = actor.id;
        if (action === 'Threaten') target.fear = clamp((target.fear ?? 0) + 0.25); 
        if (action === 'Rob') { const amount = Math.min(target.resources ?? 0, 1); target.resources = (target.resources ?? 0) - amount; actor.resources = (actor.resources ?? 0) + amount; }
        if (action === 'Report') (world.reports ||= []).push({ ...consequence, tick });
        if (action === 'Attack') target.injured = true;
        if (action === 'Kill') { target.dead = true; target.deathCause = 'interaction'; }
        if (action === 'Flee') actor.fleeing = true;
        return { ok: true, consequence };
    }
}

export { ACTIONS };
