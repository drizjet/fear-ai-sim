/**
 * @file world-soak-monitor.js - Sections LXXII-LXXIII:
 * living-world soak degeneration detection + phase-transition mapping.
 *
 * Long runs must be checked for failure MODES, not just crashes:
 * infinite wealth, population collapse, agency stagnation, event-log
 * explosion, and runaway raiding. The monitor samples advisory world
 * state at fixed intervals and flags degenerate trajectories.
 * Phase mapping sweeps one control parameter and locates the interior
 * threshold where behavior switches (trade reroute, raid onset).
 *
 * Advisory only: reads world state, never mutates host-owned entities.
 * All runs are seeded; identical inputs reproduce identical series.
 */
import { createClosedWorldScenario, tickClosedWorld } from './closed-world.js';

export function makeSoakRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

export function sampleWorldMetrics(world) {
  let inventory = 0;
  let population = 0;
  for (const town of world.towns.values()) {
    population += town.population ?? 0;
    if (town.market?.inventory) {
      for (const amount of town.market.inventory.values()) inventory += amount ?? 0;
    }
  }
  let capital = 0;
  for (const m of world.merchants ?? []) capital += m.capital ?? 0;
  let factionResources = 0;
  for (const f of world.factions ?? []) factionResources += f.resources ?? 0;
  let decisions = 0;
  let raids = 0;
  let deliveries = 0;
  for (const e of world.events) {
    if (e.type === 'MERCHANT_ROUTE_DECISION') decisions += 1;
    else if (e.type === 'BANDIT_ATTACK') raids += 1;
    else if (e.type === 'PENDING_CARGO_DELIVERED') deliveries += 1;
  }
  return {
    wealth: inventory + capital + factionResources,
    population,
    events: world.events.length,
    decisions,
    raids,
    deliveries,
  };
}

function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += values[i]; sxx += i * i; sxy += i * values[i];
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

export function detectDegeneration(series) {
  const flags = [];
  if (series.length < 4) return { degenerate: false, flags };
  const wealth = series.map((s) => s.wealth);
  const half = Math.floor(wealth.length / 2);
  const earlySlope = slope(wealth.slice(0, half));
  const lateSlope = slope(wealth.slice(half));
  // Infinite wealth: ACCELERATING accumulation late in the run, far above
  // start. Steady linear trade profit (constant late slope) is legitimate
  // commerce, not runaway feedback. Calibrated: healthy 500-tick soak has
  // late/early slope ratio ~1 (linear merchant profit, 104 -> 1938).
  if (lateSlope > 2 * Math.max(1e-9, earlySlope) && wealth[wealth.length - 1] > 2 * Math.max(1, wealth[0])) {
    flags.push({ mode: 'INFINITE_WEALTH', detail: `early slope ${earlySlope.toFixed(3)} vs late ${lateSlope.toFixed(3)}/sample, ${wealth[0].toFixed(1)} -> ${wealth[wealth.length - 1].toFixed(1)}` });
  }
  const popStart = series[0].population;
  const popEnd = series[series.length - 1].population;
  // Near-extinction only: Malthusian equilibration toward carrying capacity
  // (e.g. 200 -> 47 from an overshoot start) is legitimate dynamics.
  if (popStart > 0 && popEnd <= 0.05 * popStart && popEnd < 5) {
    flags.push({ mode: 'POPULATION_COLLAPSE', detail: `${popStart} -> ${popEnd}` });
  }
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (last.decisions - prev.decisions <= 0 && last.events - prev.events > 0) {
    flags.push({ mode: 'AGENCY_STAGNATION', detail: `no route decisions in final window while ${last.events - prev.events} events logged` });
  }
  // Event explosion: per-tick log RATE accelerating across the run, not raw
  // growth (per-tick bookkeeping events make growth-from-zero meaningless).
  const rateOf = (a, b, steps) => (b.events - a.events) / Math.max(1, steps);
  const earlyRate = rateOf(series[0], series[half], half);
  const lateRate = rateOf(series[half], last, series.length - 1 - half);
  if (earlyRate > 1 && lateRate > 3 * earlyRate && lateRate > 100) {
    flags.push({ mode: 'EVENT_EXPLOSION', detail: `early ${earlyRate.toFixed(1)}/sample vs late ${lateRate.toFixed(1)}/sample` });
  }
  const mid = series[Math.floor(series.length / 2)];
  const earlyRaids = mid.raids - series[0].raids;
  const lateRaids = last.raids - mid.raids;
  if (earlyRaids > 0 && lateRaids > 3 * earlyRaids) {
    flags.push({ mode: 'RUNAWAY_RAIDS', detail: `early ${earlyRaids} vs late ${lateRaids}` });
  }
  return { degenerate: flags.length > 0, flags };
}
export function runSoak({ ticks = 2000, sampleEvery = 100, seed = 1, perceivedDanger = 0.5, setup = null } = {}) {
  const world = createClosedWorldScenario();
  world.towns.get('north').population = 100;
  world.towns.get('south').population = 100;
  if (typeof setup === 'function') setup(world);
  const rng = makeSoakRng(seed);
  const series = [sampleWorldMetrics(world)];
  for (let t = 1; t <= ticks; t++) {
    tickClosedWorld(world, { tick: t, perceivedDanger, encounterRng: rng });
    if (t % sampleEvery === 0) series.push(sampleWorldMetrics(world));
  }
  return { series, report: detectDegeneration(series) };
}

/**
 * Sweep one control parameter, run a short soak per value, and map the
 * response curve of a chosen metric. Returns the value ladder plus the
 * first interval where the metric crosses the threshold (interior
 * transition), or null when the response is degenerate (always/never).
 */
export function mapPhaseTransition({ values, threshold, run, metric }) {
  const curve = values.map((value) => ({ value, metric: metric(run(value)) }));
  let crossing = null;
  for (let i = 1; i < curve.length; i++) {
    const prevBelow = curve[i - 1].metric < threshold;
    // Either crossing direction counts; record the first interior one.
    if (prevBelow !== (curve[i].metric < threshold)) {
      crossing = { from: curve[i - 1].value, to: curve[i].value };
      break;
    }
  }
  const allAbove = curve.every((p) => p.metric >= threshold);
  const allBelow = curve.every((p) => p.metric < threshold);
  return { curve, crossing, degenerate: allAbove || allBelow };
}

export default { runSoak, detectDegeneration, sampleWorldMetrics, mapPhaseTransition, makeSoakRng };
