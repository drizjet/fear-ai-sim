// law.js
// Minimal law model for town-level prohibitions.
// Laws are plain JSON so save/load/fork remain deterministic.
// Each town owns `laws: Array<Law>` where Law = { id, type, prohibits, scope, penalty, description }.

export const LAW_TYPES = Object.freeze({
    BANDITRY: 'banditry',
    THEFT: 'theft',
    TRESPASS: 'trespass',
    SMUGGLING: 'smuggling',
});

const DEFAULT_PENALTY_BY_TYPE = {
    [LAW_TYPES.BANDITRY]: 0.3,
    [LAW_TYPES.THEFT]: 0.25,
    [LAW_TYPES.TRESPASS]: 0.15,
    [LAW_TYPES.SMUGGLING]: 0.2,
};

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}
function clamp01(value) {
    return Math.max(0, Math.min(1, finite(value, 0)));
}

export function createLaw({ id, type, prohibits, scope = null, penalty, description } = {}) {
    if (typeof id !== 'string' || id.length === 0) throw new RangeError('law id required');
    if (!Object.values(LAW_TYPES).includes(type)) throw new RangeError(`unknown law type: ${type}`);
    const prohib = typeof prohibits === 'string' && prohibits.length > 0 ? prohibits : 'BANDIT_ATTACK';
    const resolvedPenalty = Number.isFinite(penalty) ? clamp01(penalty) : (DEFAULT_PENALTY_BY_TYPE[type] ?? 0.2);
    return {
        id,
        type,
        prohibits: prohib,
        scope: scope ?? null,
        penalty: resolvedPenalty,
        description: typeof description === 'string' ? description : `${type} prohibited`,
    };
}

export function ensureTownLaws(town) {
    if (!town || typeof town !== 'object') return [];
    if (!Array.isArray(town.laws)) {
        // Default: every town prohibits banditry on its incident roads.
        // This is the minimal closed-world law that makes BANDIT_ATTACK illegal
        // without requiring per-scenario setup.
        const defaultLaw = createLaw({
            id: `${town.id}-law-banditry`,
            type: LAW_TYPES.BANDITRY,
            prohibits: 'BANDIT_ATTACK',
            scope: 'town-roads',
            penalty: DEFAULT_PENALTY_BY_TYPE[LAW_TYPES.BANDITRY],
            description: 'Banditry on town-incident roads is illegal',
        });
        town.laws = [defaultLaw];
    }
    // Normalize any hand-authored laws that may lack penalty/scope.
    for (let i = 0; i < town.laws.length; i += 1) {
        const law = town.laws[i];
        if (!law || typeof law !== 'object') continue;
        if (!law.id || typeof law.id !== 'string') law.id = `${town.id}-law-${i}`;
        if (!Object.values(LAW_TYPES).includes(law.type)) law.type = LAW_TYPES.BANDITRY;
        if (typeof law.prohibits !== 'string' || law.prohibits.length === 0) law.prohibits = 'BANDIT_ATTACK';
        if (!Number.isFinite(law.penalty)) law.penalty = DEFAULT_PENALTY_BY_TYPE[law.type] ?? 0.2;
        law.penalty = clamp01(law.penalty);
        if (law.scope === undefined) law.scope = null;
        if (typeof law.description !== 'string') law.description = `${law.type} prohibited`;
    }
    return town.laws;
}

function incidentRoadsForTown(townId, world) {
    if (!world || !Array.isArray(world.routes)) return new Set();
    const set = new Set();
    for (const route of world.routes) {
        if (!route || typeof route !== 'object') continue;
        if (route.from === townId || route.to === townId) set.add(route.id);
    }
    return set;
}

/**
 * Is an action illegal under a specific town's laws?
 * Action shape: { type: 'BANDIT_ATTACK', roadId, actorId, ... }
 * Town shape: { id, laws }
 */
export function isActionIllegal(action, town, world = null) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return null;
    if (!town || typeof town !== 'object') return null;
    const laws = ensureTownLaws(town);
    for (const law of laws) {
        if (!law || law.prohibits !== action.type) continue;
        // Scope handling: null/undefined or 'global' matches any road; 'town-roads' requires incident road.
        const scope = law.scope;
        if (scope === null || scope === undefined || scope === 'global' || scope === '*') {
            return law;
        }
        if (scope === 'town-roads') {
            const roadId = action.roadId ?? action.routeId ?? null;
            if (typeof roadId !== 'string') continue;
            const incident = incidentRoadsForTown(town.id, world);
            if (incident.has(roadId)) return law;
            continue;
        }
        // Explicit road scope string matches exact road.
        if (typeof scope === 'string' && scope === action.roadId) return law;
        // Array scope.
        if (Array.isArray(scope) && scope.includes(action.roadId)) return law;
    }
    return null;
}

/**
 * Check an action against all towns' laws. Returns the first matching violation
 * or null. The first town in insertion order wins, which is deterministic.
 */
export function checkLawCompliance({ world, action, tick = 0 } = {}) {
    if (!world || !world.towns || typeof world.towns.get !== 'function') return null;
    if (!action || typeof action.type !== 'string') return null;
    for (const [, town] of world.towns) {
        const law = isActionIllegal(action, town, world);
        if (law) {
            return {
                townId: town.id,
                lawId: law.id,
                lawType: law.type,
                prohibits: law.prohibits,
                penalty: law.penalty,
                action,
                tick,
            };
        }
    }
    return null;
}
