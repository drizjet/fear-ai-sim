import { fingerprintGraph, verifyTrustedGraph } from './RoadGraphFingerprint.mjs';
import { CivilizationSimulationSystem, assertCivilizationEventJournal, assertCivilizationRestoreTarget, assertCivilizationReplayFields } from './CivilizationSimulationSystem.js';
export function civRoadGraph(state) {
  if (!state || !Array.isArray(state.nodes) || !Array.isArray(state.routes)) throw new Error('malformed civilization road graph');
  return {
    nodes: state.nodes.map(n => n.id),
    edges: state.routes.map(r => ({ source: r.fromNodeId, target: r.toNodeId, distance: r.distance,
      directed: false, id: r.id, attributes: { toll: r.toll, baseSecurity: r.baseSecurity } }))
  };
}
export function civRoadGraphFingerprint(state) { return fingerprintGraph(civRoadGraph(state)); }
export function restoreTrustedCivState(system, snapshot, independentlyTrustedFingerprint) {
  if (!(system instanceof CivilizationSimulationSystem)) throw new Error('CivilizationSimulationSystem required');
  verifyTrustedGraph(civRoadGraph(snapshot), independentlyTrustedFingerprint);
  if (!Number.isSafeInteger(snapshot.tickCount) || snapshot.tickCount < 0 ||
    !Array.isArray(snapshot.entities) || !Array.isArray(snapshot.events)) throw new Error('invalid snapshot');
  assertCivilizationEventJournal(snapshot.events, snapshot.tickCount);
  // setState otherwise treats a null market/position or waypoint list as an
  // empty object/array. Registered nodes always have object fields, and
  // registered routes always have an array, even when that array is empty.
  const record = value => value !== null && typeof value === 'object' &&
    !Array.isArray(value);
  for (const node of snapshot.nodes) {
    if (!record(node) || !record(node.market) || !record(node.position))
      throw new Error('invalid civilization node state');
  }
  for (const route of snapshot.routes) {
    if (!record(route) || !Array.isArray(route.waypoints))
      throw new Error('invalid civilization route waypoints');
  }
  const ids = new Set();
  for (const e of snapshot.entities) {
    // CivilizationSimulationSystem.setState silently skips falsy entity IDs.
    // Reject before loading, or a "successful" trusted restore loses an entity.
    if (!e || typeof e.id !== 'string' || e.id.length===0 ||
        ids.has(e.id) || !Number.isFinite(e.routeProgress) ||
        e.routeProgress < 0 || e.routeProgress > 1 ||
        !Number.isSafeInteger(e.lastUpdateTick) || e.lastUpdateTick < 0 ||
        e.lastUpdateTick > snapshot.tickCount)
      throw new Error('invalid caravan state');
    ids.add(e.id);
  }
  // Validate replay-consumed numeric fields before staged setState or any
  // JSON-based authority clone can silently normalize nonfinite numbers.
  assertCivilizationReplayFields(snapshot);
  const staged = new CivilizationSimulationSystem(system.config);
  staged.setState(snapshot);
  assertCivilizationRestoreTarget(system);
  system.setState(staged.getState());
  return system;
}
