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
    // NOW-5: middle-tier semantic summarization. Plain KEPT repeats at or
    // above middleMinRepeat collapse per window into summaries carrying
    // tick span plus a deterministic actor sample (beyond bare counts).
    middleMinRepeat = 50,
    middleWindowTicks = null,
    middleMaxActors = 8,
  } = options || {};
  const anchorSet = new Set(anchorTypes);
  const bulkSet = new Set(bulkTypes);
  const dropSet = new Set(dropTypes);
  const list = Array.isArray(events) ? events : [];
  const byId = new Map();
  list.forEach((e, i) => byId.set(eventIdOf(e, i), i));
  const firstIdx = new Map();
  const lastIdx = new Map();
  list.forEach((e, i) => {
    const t = e?.type;
    if (typeof t !== 'string') return;
    if (!firstIdx.has(t)) firstIdx.set(t, i);
    lastIdx.set(t, i);
  });

  const keep = new Set();
  // NOW-5: reason tracking separates anchor/boundary/closure evidence
  // (which must stay whole) from plain KEPT repeats (which may summarize).
  const reason = new Map();
  const mark = (i, why) => { keep.add(i); if (!reason.has(i)) reason.set(i, why); };
  list.forEach((e, i) => {
    const t = e?.type;
    // Typeless garbage is never a causal anchor (explicit anchor flag wins).
    if (typeof t !== 'string' && e?.anchor !== true) return;
    if (e?.anchor === true) { mark(i, 'anchor'); return; }
    if (typeof t === 'string' && anchorSet.has(t)) { mark(i, 'anchor'); return; }
    // Explicit caller drops beat boundary preservation (but not the parent
    // closure below: referenced evidence is resurrected as kept).
    if (typeof t === 'string' && dropSet.has(t)) return;
    if (keepBoundaryPerType && typeof t === 'string' && (firstIdx.get(t) === i || lastIdx.get(t) === i)) { mark(i, 'boundary'); return; }
    if (typeof t === 'string' && bulkSet.has(t)) return;
    mark(i, 'kept');
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
        // Upgrade BEFORE the seen check: initially-kept events start in
        // seen, but a live referrer still promotes them to closure evidence.
        if (reason.get(j) === 'kept') reason.set(j, 'closure');
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
  // NOW-5 middle tier: plain KEPT repeats at or above middleMinRepeat
  // collapse per window. Closure/boundary/anchor evidence never qualifies
  // (reason-tracked above), so anchor closure cannot break: any summarized
  // event with a live referrer would already have been closure-resurrected.
  const middleSummaries = [];
  const mWindow = middleWindowTicks ?? windowTicks;
  const keptCountByType = new Map();
  list.forEach((e, i) => {
    if (reason.get(i) !== 'kept' || typeof e?.type !== 'string') return;
    keptCountByType.set(e.type, (keptCountByType.get(e.type) ?? 0) + 1);
  });
  const middleTypes = new Set(
    [...keptCountByType.entries()].filter(([, n]) => n >= Math.max(1, middleMinRepeat)).map(([t]) => t),
  );
  const perMiddleWindow = new Map();
  list.forEach((e, i) => {
    const t = e?.type;
    if (reason.get(i) !== 'kept' || typeof t !== 'string' || !middleTypes.has(t)) return;
    const tick = tickOf(e);
    const w = Math.floor(tick / Math.max(1, mWindow));
    const key = `${t}::${w}`;
    let s = perMiddleWindow.get(key);
    if (!s) {
      s = { kind: 'middle-summary', type: t, windowStart: w * mWindow, windowEnd: w * mWindow + mWindow - 1, count: 0, firstTick: tick, lastTick: tick, actors: [], actorOverflow: 0, exampleEventId: eventIdOf(e, i) };
      perMiddleWindow.set(key, s);
    }
    s.count += 1;
    if (tick < s.firstTick) s.firstTick = tick;
    if (tick > s.lastTick) s.lastTick = tick;
    // Deterministic actor sample: sorted *Id fields (minus eventId),
    // first-seen order capped, overflow counted.
    for (const f of Object.keys(e).sort()) {
      if (f === 'eventId' || !f.endsWith('Id')) continue;
      const v = e[f];
      if (typeof v !== 'string' || v.length === 0 || s.actors.includes(v)) continue;
      if (s.actors.length < Math.max(1, middleMaxActors)) s.actors.push(v);
      else s.actorOverflow += 1;
    }
  });
  const middleIdx = new Set();
  list.forEach((e, i) => {
    const t = e?.type;
    if (reason.get(i) === 'kept' && typeof t === 'string' && middleTypes.has(t)) { middleIdx.add(i); keep.delete(i); }
  });
  for (const s of [...perMiddleWindow.values()].sort((a, b) => (a.windowStart - b.windowStart) || (a.type < b.type ? -1 : 1))) {
    middleSummaries.push(s);
  }

  const compacted = [];
  let dropped = 0;
  list.forEach((e, i) => {
    if (keep.has(i)) { compacted.push(e); return; }
    const t = e?.type;
    if (typeof t === 'string' && bulkSet.has(t)) return; // summarized
    if (middleIdx.has(i)) return; // middle-summarized
    dropped += 1; // explicit dropTypes only (safe default keeps the rest)
  });

  const originalBytes = Buffer.byteLength(JSON.stringify(list), 'utf8');
  const compactBytes = Buffer.byteLength(JSON.stringify({ events: compacted, summaries, middleSummaries }), 'utf8');
  return {
    events: compacted,
    summaries,
    middleSummaries,
    danglingParents: [...dangling].sort(),
    stats: {
      original: list.length,
      kept: compacted.length,
      summarized: summaries.reduce((s, x) => s + x.count, 0),
      middleSummarized: middleSummaries.reduce((s, x) => s + x.count, 0),
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
