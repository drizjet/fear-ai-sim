/**
 * @file EventLogCompactor.js - Sections LXXI (NEXT-8):
 * importance-tiered world event-log compaction with causal-anchor
 * preservation.
 *
 * Long worlds cannot keep every event live: a 10k-tick closed world logs
 * ~190k mostly bookkeeping events. Naive truncation destroys causal
 * auditability; keeping everything explodes memory. This compactor keeps:
 * - ANCHOR tier: anchor-type events, per-type boundary events
 *   (first/last), and the transitive parent-closure of everything kept.
 * - SUMMARY tier: bulk bookkeeping types collapse into per-window counts.
 * - KEPT tier: everything else stays (safe default; drops are opt-in).
 *
 * Deterministic: single pass, original order preserved, no RNG.
 * Read-only over the input array; returns a new compacted array.
 * Host authority: advisory log surgery only, zero host mutations.
 */

export const DEFAULT_ANCHOR_TYPES = Object.freeze([
  'SECESSION',
  'POLITY_FOUNDED',
  'TOWN_TAKEN',
  'BANDIT_ATTACK',
  'FACTION_REASSESSMENT',
  'MIGRATION',
  'REFUGEE_INTEGRATED',
  'TREATY_SIGNED',
  'WAR_DECLARED',
  'CEASEFIRE',
  'JUSTICE_RESOLVED',
  'EVALUATED',
]);

export const DEFAULT_BULK_TYPES = Object.freeze([
  'MARKET_TICK',
  'TAX_COLLECTED',
  'REPORT_FILED',
  'ROUTE_EXPOSURE',
  'CANDIDATE_ENCOUNTER',
  'TAKEOVER_GATE',
  'INTRUSION',
  'ROUTE_SELECTED',
  'ROUTE_CHANGED',
]);

function eventIdOf(e, index) {
  if (e && typeof e.eventId === 'string' && e.eventId.length > 0) return e.eventId;
  return `#${index}`;
}

function parentsOf(e) {
  if (!e || !Array.isArray(e.parentEventIds)) return [];
  return e.parentEventIds.filter((p) => typeof p === 'string' && p.length > 0);
}

export function compactEventLog(events, options = {}) {
  const {
    anchorTypes = DEFAULT_ANCHOR_TYPES,
    bulkTypes = DEFAULT_BULK_TYPES,
    keepBoundaryPerType = true,
    dropTypes = [],
    windowTicks = 100,
    tickOf = (e) => (Number.isFinite(e?.tick) ? e.tick : 0),
  } = options || {};
  const anchorSet = new Set(anchorTypes);
  const bulkSet = new Set(bulkTypes);
  const dropSet = new Set(dropTypes);
  const list = Array.isArray(events) ? events : [];

  const byId = new Map();
  list.forEach((e, i) => byId.set(eventIdOf(e, i), i));

  // First/last index per type for boundary preservation.
  const firstIdx = new Map();
  const lastIdx = new Map();
  list.forEach((e, i) => {
    const t = e?.type;
    if (typeof t !== 'string') return;
    if (!firstIdx.has(t)) firstIdx.set(t, i);
    lastIdx.set(t, i);
  });

  const keep = new Set();
  const mark = (i) => keep.add(i);
  list.forEach((e, i) => {
    const t = e?.type;
    // Typeless garbage is never a causal anchor (explicit anchor flag wins).
    if (typeof t !== 'string' && e?.anchor !== true) return;
    if (e?.anchor === true) { mark(i); return; }
    if (typeof t === 'string' && anchorSet.has(t)) { mark(i); return; }
    // Explicit caller drops beat boundary preservation (but not the parent
    // closure below: referenced evidence is resurrected as kept).
    if (typeof t === 'string' && dropSet.has(t)) return;
    if (keepBoundaryPerType && typeof t === 'string' && (firstIdx.get(t) === i || lastIdx.get(t) === i)) { mark(i); return; }
    if (typeof t === 'string' && bulkSet.has(t)) return;
    mark(i);
  });

  // Transitive parent closure: every parent referenced by a kept event
  // must itself be kept (visited set terminates cycles). Dangling parents
  // (no matching event) are reported, never fatal.
  const dangling = new Set();
  const queue = [...keep];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const i = queue.pop();
    for (const p of parentsOf(list[i])) {
      if (byId.has(p)) {
        const j = byId.get(p);
        if (!seen.has(j)) { seen.add(j); keep.add(j); queue.push(j); }
      } else {
        dangling.add(p);
      }
    }
  }

  // Bulk summarization per window for kept-out bulk events.
  const summaries = [];
  const perTypeWindow = new Map();
  list.forEach((e, i) => {
    const t = e?.type;
    if (keep.has(i) || typeof t !== 'string' || !bulkSet.has(t)) return;
    const w = Math.floor(tickOf(e) / Math.max(1, windowTicks));
    const key = `${t}::${w}`;
    if (!perTypeWindow.has(key)) {
      perTypeWindow.set(key, { type: t, windowStart: w * windowTicks, windowEnd: w * windowTicks + windowTicks - 1, count: 0 });
    }
    perTypeWindow.get(key).count += 1;
  });
  for (const s of [...perTypeWindow.values()].sort((a, b) => (a.windowStart - b.windowStart) || (a.type < b.type ? -1 : 1))) {
    summaries.push(s);
  }

  const compacted = [];
  let dropped = 0;
  list.forEach((e, i) => {
    if (keep.has(i)) { compacted.push(e); return; }
    const t = e?.type;
    if (typeof t === 'string' && bulkSet.has(t)) return; // summarized
    dropped += 1; // explicit dropTypes only (safe default keeps the rest)
  });

  const originalBytes = Buffer.byteLength(JSON.stringify(list), 'utf8');
  const compactBytes = Buffer.byteLength(JSON.stringify({ events: compacted, summaries }), 'utf8');
  return {
    events: compacted,
    summaries,
    danglingParents: [...dangling].sort(),
    stats: {
      original: list.length,
      kept: compacted.length,
      summarized: summaries.reduce((s, x) => s + x.count, 0),
      dropped,
      originalBytes,
      compactBytes,
      savingsPercent: Number(((1 - compactBytes / Math.max(1, originalBytes)) * 100).toFixed(2)),
    },
  };
}

export function verifyAnchorClosure(events) {
  const ids = new Set();
  const list = Array.isArray(events) ? events : [];
  list.forEach((e, i) => ids.add(eventIdOf(e, i)));
  const broken = [];
  list.forEach((e, i) => {
    for (const p of parentsOf(e)) {
      if (!ids.has(p)) broken.push({ event: eventIdOf(e, i), missingParent: p });
    }
  });
  return { closed: broken.length === 0, broken };
}

export default { compactEventLog, verifyAnchorClosure, DEFAULT_ANCHOR_TYPES, DEFAULT_BULK_TYPES };
