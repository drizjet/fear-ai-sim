// wildlife.js
//
// Minimal predator-competition model for the closed-world roads.
// A WildlifeGroup occupies one road and tracks merchant traffic there:
// merchants avoid predator-dense roads only indirectly (via bandit
// displacement), while bandits discount crowded roads because prey is
// scattered and encounters risk injury. All state is plain JSON so
// save/load/fork stay deterministic; movement itself is deterministic
// (no RNG consumed) so the encounter stream is undisturbed.

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp01 = value => Math.max(0, Math.min(1, finite(value)));

export function createWildlifeGroup({ id, roadId, size = 3 } = {}) {
    if (typeof id !== 'string' || id.length === 0) throw new RangeError('wildlife group id required');
    if (typeof roadId !== 'string' || roadId.length === 0) throw new RangeError('wildlife group roadId required');
    return {
        id,
        roadId,
        size: Math.max(1, Math.floor(finite(size, 3))),
        lastMoveTick: null,
    };
}

/** Total predator size occupying one road (0 when no group is present). */
export function wildlifePressureOnRoad(world, roadId) {
    if (!world || !Array.isArray(world.wildlifeGroups) || typeof roadId !== 'string') return 0;
    let total = 0;
    for (const group of world.wildlifeGroups) {
        if (group && group.roadId === roadId) total += Math.max(0, finite(group.size, 0));
    }
    return total;
}

/** Bandit payoff multiplier for a road: each size unit dilutes payoff 10%, capped at 80%. */
export function wildlifePayoffFactor(world, roadId) {
    return 1 - Math.min(0.8, wildlifePressureOnRoad(world, roadId) / 10);
}

function merchantTrafficByRoad(world) {
    const counts = new Map();
    for (const merchant of world.merchants ?? []) {
        const route = merchant.selectedRoute || merchant.lastRoute;
        if (typeof route !== 'string') continue;
        counts.set(route, (counts.get(route) ?? 0) + 1);
    }
    return counts;
}

/**
 * Move one wildlife group toward the busiest merchant road it can see.
 * Deterministic: moves only when another road leads merchant traffic by
 * more than `leadThreshold`; ties keep input order (no RNG consumed).
 * Emits nothing when holding; callers emit the relocation event.
 */
export function tickWildlifeGroup(world, groupId, { tick = 0, leadThreshold = 0 } = {}) {
    const group = (world.wildlifeGroups ?? []).find(item => item && item.id === groupId) ?? null;
    if (!group || typeof group.roadId !== 'string') return { ok: false, reason: 'NO_GROUP' };
    const traffic = merchantTrafficByRoad(world);
    if (traffic.size === 0) return { ok: true, relocated: false, reason: 'NO_TRAFFIC' };
    const routes = Array.isArray(world.routes) ? world.routes.map(route => route.id) : [...traffic.keys()];
    const current = traffic.get(group.roadId) ?? 0;
    let best = null;
    for (const roadId of routes) {
        if (typeof roadId !== 'string' || roadId === group.roadId) continue;
        const count = traffic.get(roadId) ?? 0;
        if (count > current + leadThreshold && (best === null || count > (traffic.get(best) ?? 0))) {
            best = roadId;
        }
    }
    if (!best) return { ok: true, relocated: false, reason: 'HOLDING' };
    const from = group.roadId;
    group.roadId = best;
    group.lastMoveTick = tick;
    return { ok: true, relocated: true, from, to: best };
}
