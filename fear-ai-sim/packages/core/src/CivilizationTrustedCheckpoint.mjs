import { fingerprintGraph, verifyTrustedGraph } from './RoadGraphFingerprint.mjs';
import { CivilizationSimulationSystem, assertCivilizationEventJournal } from './CivilizationSimulationSystem.js';
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
  const staged = new CivilizationSimulationSystem(system.config);
  staged.setState(snapshot);
  system.setState(staged.getState());
  return system;
}
