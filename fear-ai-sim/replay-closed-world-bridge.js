// replay-closed-world-bridge.js
//
// World-Completion Directive §22 "Save / Load / Replay /
// Fork — A persistent world requires stronger continuity
// than deterministic reruns." Also §119 "RESUME
// EQUIVALENCE: For deterministic scenarios, run N ticks,
// save, load, run M ticks, must match run N+M
// uninterrupted."
//
// This module is the bridge between the closed-world
// (tickClosedWorld, merchants, bandits, factions, markets)
// and the replay system (ReplaySystem.captureFrame). It
// converts a closed-world `world` object into the
// replay-frame format (agents, predators, stats) at a
// given tick.

/**
 * Record a single closed-world tick to the replay system.
 *
 * The closed-world has `world.merchants` (the agents) and
 * `world.bandits` (the predators). The replay system
 * expects `agents` and `predators` arrays. This function
 * converts the closed-world state into the replay format
 * and calls `replay.captureFrame`.
 *
 * The `ReplaySystem.captureFrame` shape preserves a fixed
 * set of agent/predator fields (x, y, state, id, fear,
 * fearTrace, type, mode, roadId). The closed-world's
 * custom fields (route, location, cargo, lootExpectation)
 * are stored on a side-channel `replay.closedWorldSnapshots`
 * (an array of `{ tick, merchants, bandits, stats }`
 * records). The `extractClosedWorldFrame` and
 * `playClosedWorldReplay` functions below read from that
 * side-channel.
 *
 * @param {object} replay - the ReplaySystem instance
 * @param {object} world - the closed-world state
 * @param {number} tick - the current tick
 */
export function recordClosedWorldTick(replay, world, tick) {
    if (!replay || !world) return;
    // The closed-world's merchants are the "agents" from
    // the replay's perspective. Each merchant has a
    // location, a selected route, and a belief store.
    const agents = [];
    for (const merchant of world.merchants || []) {
        if (!merchant) continue;
        agents.push({
            id: merchant.id,
            // The replay expects x/y. The closed-world
            // doesn't have spatial coordinates, so we
            // use the merchant's location and selected
            // route as a 1D coordinate.
            x: 0,
            y: 0,
            state: merchant.location || 'unknown',
        });
    }
    // The closed-world's bandits are the "predators"
    // from the replay's perspective. Each bandit has a
    // roadId (the destination-utility live-wire sets it).
    const predators = [];
    for (const bandit of world.bandits || []) {
        if (!bandit) continue;
        predators.push({
            id: bandit.id,
            // The replay expects x/y. We use the
            // roadId as a 1D coordinate (the closed-world
            // doesn't have a spatial model).
            x: 0,
            y: 0,
            type: `bandits-${bandit.roadId}`,
            // The standard ReplaySystem.captureFrame
            // preserves `roadId` and `mode` on the
            // predator object. The closed-world bridge
            // also stores them on the side-channel
            // snapshot for the rich playback.
            roadId: bandit.roadId,
            mode: bandit.mode,
        });
    }
    // The stats include the total merchant count, the
    // total bandit count, and the faction resource total.
    const stats = {
        count: agents.length,
        predators: predators.length,
        // The sum of all faction resources is a compact
        // "world health" metric. A future slice can add
        // more (food, population, migration count).
        resources: 0
    };
    for (const faction of world.factions || []) {
        if (faction && Number.isFinite(faction.resources)) {
            stats.resources += faction.resources;
        }
    }
    // Call the replay's captureFrame. This records
    // the standard frame shape on `replay.frames`.
    // The captureFrame is a no-op unless
    // `replay.startRecording()` was called; we still
    // call it for backward compat with the standard
    // replay system, but the closed-world's playback
    // does NOT depend on `replay.frames` — it uses
    // the side-channel below.
    if (typeof replay.captureFrame === 'function') {
        replay.captureFrame(agents, predators, stats, { tick });
    }
    // The closed-world side-channel: a per-tick
    // snapshot that preserves the custom fields. The
    // `playClosedWorldReplay` function reads from this.
    if (!Array.isArray(replay.closedWorldSnapshots)) {
        replay.closedWorldSnapshots = [];
    }
    // The rich merchant state (route, location, cargo)
    // and bandit state (roadId, mode, lootExpectation)
    // are stored on the side-channel.
    replay.closedWorldSnapshots.push({
        tick,
        merchants: (world.merchants || []).map(m => ({
            id: m.id,
            location: m.location,
            route: m.selectedRoute,
            cargo: m.cargo,
        })),
        bandits: (world.bandits || []).map(b => ({
            id: b.id,
            roadId: b.roadId,
            mode: b.mode,
            lootExpectation: b.lootExpectation,
        })),
        stats: { ...stats },
    });
}

// =============================================================================
// §22 / §119 Playback — the inverse of `recordClosedWorldTick`.
// =============================================================================
//
// World-Completion Directive §22 "Save / Load / Replay /
// Fork" and §119 "RESUME EQUIVALENCE: For deterministic
// scenarios, run N ticks, save, load, run M ticks, must
// match run N+M uninterrupted." The bridge above records
// a closed-world tick into a replay frame; this section
// reads a recorded frame back into a structured snapshot
// and walks the recording in tick order.

/**
 * Read a single replay side-channel snapshot (or a
 * standard replay frame) back into a structured snapshot.
 * The inverse of `recordClosedWorldTick`. The snapshot
 * is `{ tick, merchants, bandits, stats }` where
 * `merchants` and `bandits` carry the per-tick state that
 * was recorded.
 *
 * Accepts either a closed-world side-channel snapshot
 * (from `replay.closedWorldSnapshots`) or a standard
 * replay frame (from `replay.frames`). The closed-world
 * playback prefers the side-channel because it
 * preserves the custom fields.
 *
 * @param {object} snapshot - a closed-world snapshot or a standard frame
 * @returns {{ tick: number, merchants: Array, bandits: Array, stats: object }}
 */
export function extractClosedWorldFrame(snapshot) {
    if (!snapshot) return null;
    // The closed-world side-channel stores merchants and
    // bandits with the rich field set directly.
    if (Array.isArray(snapshot.merchants) && Array.isArray(snapshot.bandits)) {
        return {
            tick: snapshot.tick,
            merchants: snapshot.merchants.map(m => ({ ...m })),
            bandits: snapshot.bandits.map(b => ({ ...b })),
            stats: { ...(snapshot.stats || {}) },
        };
    }
    // The standard replay frame shape: agents carry id,
    // state, x, y; predators carry id, type, roadId, mode.
    return {
        tick: snapshot.tick,
        merchants: (snapshot.agents || []).map(agent => ({
            id: agent.id,
            location: agent.state,
            route: null,
            cargo: null,
        })),
        bandits: (snapshot.predators || []).map(predator => ({
            id: predator.id,
            roadId: predator.roadId,
            mode: predator.mode,
            lootExpectation: null,
        })),
        stats: { ...(snapshot.stats || {}) },
    };
}

/**
 * Walk the closed-world side-channel snapshots in tick
 * order and yield each one. The §119 RESUME EQUIVALENCE
 * contract requires that the playback is deterministic —
 * a fresh playback of the same recording yields the same
 * snapshots.
 *
 * @param {object} replay - the ReplaySystem instance
 * @param {object} options
 *   - startTick: optional inclusive lower bound
 *   - endTick: optional inclusive upper bound
 * @returns {Array<{ tick, merchants, bandits, stats }>}
 */
export function playClosedWorldReplay(replay, { startTick = null, endTick = null } = {}) {
    if (!replay) return [];
    // Prefer the closed-world side-channel snapshots.
    const snapshots = Array.isArray(replay.closedWorldSnapshots)
        ? replay.closedWorldSnapshots.slice()
        : [];
    // Fall back to the standard replay frames if no
    // side-channel snapshots exist.
    if (snapshots.length === 0 && Array.isArray(replay.frames)) {
        for (const frame of replay.frames) {
            snapshots.push(frame);
        }
    }
    const out = [];
    for (const snap of snapshots) {
        const tick = snap?.tick ?? 0;
        if (startTick !== null && tick < startTick) continue;
        if (endTick !== null && tick > endTick) continue;
        const extracted = extractClosedWorldFrame(snap);
        if (extracted) out.push(extracted);
    }
    out.sort((a, b) => a.tick - b.tick);
    return out;
}
