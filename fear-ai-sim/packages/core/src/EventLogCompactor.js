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

/**
 * NEXT-49: merge cold summaries (bulk or middle) at/before `cutoff` per
 * (kind, type) into cumulative spans. Warm entries keep their order.
 * Idempotent: re-merging merged entries preserves counts and spans.
 * Returns { entries, mergedCount }. Pure and deterministic.
 */
export function mergeColdSummaries(list, cutoff, options = {}) {
  const middleMaxActors = Math.max(1, options.middleMaxActors ?? 8);
  const maxDistinct = Math.max(1, options.maxDistinct ?? 8);
  const arr = Array.isArray(list) ? list : [];
  const cold = new Map();
  const warm = [];
  for (const s of arr) {
    const end = Number.isFinite(s?.windowEnd) ? s.windowEnd : Number.MAX_SAFE_INTEGER;
    if (end <= cutoff) {
      const k = `${s?.kind ?? 'summary'}::${s?.type ?? '?'}`;
      if (!cold.has(k)) cold.set(k, []);
      cold.get(k).push(s);
    } else warm.push(s);
  }
  const merged = [];
  let mergedCount = 0;
  for (const [k, group] of [...cold.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (group.length === 1) { merged.push(group[0]); continue; }
    mergedCount += group.length - 1;
    const first = group[0];
    const out = { ...first };
    out.count = group.reduce((n, g) => n + (Number.isFinite(g?.count) ? g.count : 0), 0);
    out.windowStart = Math.min(...group.map((g) => (Number.isFinite(g?.windowStart) ? g.windowStart : 0)));
    out.windowEnd = Math.max(...group.map((g) => (Number.isFinite(g?.windowEnd) ? g.windowEnd : 0)));
    if (Number.isFinite(group[0]?.firstTick)) out.firstTick = Math.min(...group.map((g) => g.firstTick));
    if (Number.isFinite(group[0]?.lastTick)) out.lastTick = Math.max(...group.map((g) => g.lastTick));
    if (group.some((g) => Array.isArray(g?.actors))) {
      out.actors = [];
      out.actorOverflow = 0;
      for (const g of group) {
        for (const a of (g.actors ?? [])) {
          if (out.actors.includes(a)) continue;
          if (out.actors.length < middleMaxActors) out.actors.push(a);
          else out.actorOverflow += 1;
        }
        out.actorOverflow += (Number.isFinite(g?.actorOverflow) ? g.actorOverflow : 0);
      }
    }
    if (group.some((g) => g?.values && typeof g.values === 'object')) {
      out.values = {};
      out.valuesOverflow = {};
      for (const g of group) {
        for (const [f, bucket] of Object.entries(g.values ?? {})) {
          const dst = (out.values[f] ??= {});
          for (const [v, n] of Object.entries(bucket ?? {})) {
            if (dst[v] !== undefined) dst[v] += n;
            else if (Object.keys(dst).length < maxDistinct) dst[v] = n;
            else out.valuesOverflow[f] = (out.valuesOverflow[f] ?? 0) + n;
          }
        }
        for (const [f, n] of Object.entries(g.valuesOverflow ?? {})) {
          out.valuesOverflow[f] = (out.valuesOverflow[f] ?? 0) + n;
        }
      }
    }
    merged.push(out);
  }
  warm.sort((a, b) => ((a?.windowStart ?? 0) - (b?.windowStart ?? 0)) || (String(a?.type ?? '') < String(b?.type ?? '') ? -1 : 1));
  return { entries: [...merged, ...warm], mergedCount };
}

/**
 * NEXT-49: merge cold-pair occupancy summaries sharing
 * (openType, closeType, key, keyValue) into cumulative spans.
 * Idempotent and deterministic. Returns the merged array.
 */
export function mergeColdPairSummaries(list) {
  const arr = Array.isArray(list) ? list : [];
  const byKey = new Map();
  for (const s of arr) {
    const k = `${s?.openType ?? '?'}::${s?.closeType ?? '?'}::${s?.key ?? '?'}::${s?.keyValue ?? '?'}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(s);
  }
  const out = [];
  for (const [k, group] of [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const first = group[0];
    const ex = [];
    for (const g of group) {
      for (const id of (g?.exampleEventIds ?? [])) {
        if (ex.length >= 8) break;
        if (!ex.includes(id)) ex.push(id);
      }
      if (ex.length >= 8) break;
    }
    out.push({
      ...first,
      pairCount: group.reduce((n, g) => n + (Number.isFinite(g?.pairCount) ? g.pairCount : 0), 0),
      firstOpenTick: Math.min(...group.map((g) => (Number.isFinite(g?.firstOpenTick) ? g.firstOpenTick : 0))),
      lastCloseTick: Math.max(...group.map((g) => (Number.isFinite(g?.lastCloseTick) ? g.lastCloseTick : 0))),
      exampleEventIds: ex,
    });
  }
  return out;
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
    // NEXT-49: cold-tier steady-state bounding (opt-in; default off, which
    // is byte-identical to the old behavior). Anything at or below
    // (maxTick - coldAgeTicks) is cold. Cold open/close pairs sharing a key
    // (e.g. nomad camp establish/abandon churn: net-zero history) roll up
    // into per-key cumulative occupancy summaries — but ONLY when both
    // halves are plain anchor-kept (reason 'anchor'): closure-referenced
    // or boundary events stay whole, so anchor closure cannot break.
    // Cold bulk/middle summaries merge per type into cumulative spans.
    // Residual archive growth is then exactly the true-anchor rate.
    coldAgeTicks = null,
    coldPairRollup = [],
    // NOW-12: per-value distributions over caller-named primitive fields
    // (for example allowed true/false splits). Empty by default (off);
    // distinct values per field cap at middleMaxDistinct, overflow counted.
    middleValueFields = [],
    middleMaxDistinct = 8,
  } = options || {};
  const anchorSet = new Set(anchorTypes);
  const bulkSet = new Set(bulkTypes);
  const dropSet = new Set(dropTypes);
  const list = Array.isArray(events) ? events : [];
  const byId = new Map();
  // Sorted once for deterministic field iteration order.
  const valueFields = [...new Set((Array.isArray(middleValueFields) ? middleValueFields : []).filter((f) => typeof f === 'string'))].sort();
  const maxDistinct = Math.max(1, middleMaxDistinct);
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
      s = { kind: 'middle-summary', type: t, windowStart: w * mWindow, windowEnd: w * mWindow + mWindow - 1, count: 0, firstTick: tick, lastTick: tick, actors: [], actorOverflow: 0, values: {}, valuesOverflow: {}, exampleEventId: eventIdOf(e, i) };
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
    // NOW-12: per-value distributions over caller-named primitive fields.
    // Non-primitives skipped (unbounded); distinct values capped.
    for (const f of valueFields) {
      const v = e[f];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
      const k = String(v);
      const bucket = (s.values[f] ??= {});
      if (bucket[k] !== undefined) bucket[k] += 1;
      else if (Object.keys(bucket).length < maxDistinct) bucket[k] = 1;
      else s.valuesOverflow[f] = (s.valuesOverflow[f] ?? 0) + 1;
    }
  });
  const middleIdx = new Set();
  list.forEach((e, i) => {
    const t = e?.type;
    if (reason.get(i) === 'kept' && typeof t === 'string' && middleTypes.has(t)) { middleIdx.add(i); keep.delete(i); }
  });
  for (const s of [...perMiddleWindow.values()].sort((a, b) => (a.windowStart - b.windowStart) || (a.type < b.type ? -1 : 1))) {
    // Stable key order inside each distribution (insertion order is already
    // deterministic, but sorted output survives readers that re-serialize).
    for (const f of Object.keys(s.values)) {
      const sorted = {};
      for (const k of Object.keys(s.values[f]).sort()) sorted[k] = s.values[f][k];
      s.values[f] = sorted;
    }
    middleSummaries.push(s);
  }

  // NEXT-49: cold tier. Pairs and summaries at or below the cold cutoff
  // roll into cumulative spans. Skipped entirely when coldAgeTicks is not
  // a finite number (default): byte-identical old behavior.
  const coldRemoved = new Set();
  const coldPairSummaries = [];
  let coldPaired = 0;
  let coldSummariesMerged = 0;
  if (Number.isFinite(coldAgeTicks)) {
    let maxTick = 0;
    list.forEach((e) => { const t = tickOf(e); if (t > maxTick) maxTick = t; });
    const cutoff = maxTick - Math.max(0, coldAgeTicks);
    const isCold = (e) => tickOf(e) <= cutoff;
    // Referenced evidence (parents of kept events) never rolls, whatever
    // its reason tag: anchor-typed but closure-referenced halves stay whole.
    const refd = new Set();
    for (const i of keep) for (const p of parentsOf(list[i])) refd.add(p);
    const rollable = (i) => reason.get(i) === 'anchor' && !refd.has(eventIdOf(list[i], i));
    // Cold open/close pair rollup (FIFO per key; rollable halves only).
    for (const spec of (Array.isArray(coldPairRollup) ? coldPairRollup : [])) {
      const open = spec?.open, close = spec?.close, key = spec?.key ?? 'primaryId';
      if (typeof open !== 'string' || typeof close !== 'string' || typeof key !== 'string') continue;
      const pending = new Map();
      const pairs = [];
      list.forEach((e, i) => {
        if (!isCold(e) || coldRemoved.has(i)) return;
        const t = e?.type;
        const kv = e?.[key];
        if (typeof kv !== 'string' || kv.length === 0) return;
        if (t === open) {
          if (rollable(i)) {
            if (!pending.has(kv)) pending.set(kv, []);
            pending.get(kv).push(i);
          }
        } else if (t === close) {
          if (!rollable(i)) return;
          const q = pending.get(kv);
          if (q && q.length > 0) pairs.push([q.shift(), i]);
        }
      });
      // Group pairs per key into cumulative occupancy summaries.
      const byKey = new Map();
      for (const [oi, ci] of pairs) {
        const kv = list[oi][key];
        if (!byKey.has(kv)) byKey.set(kv, []);
        byKey.get(kv).push([oi, ci]);
        coldRemoved.add(oi); coldRemoved.add(ci);
      }
      for (const [kv, ps] of [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        ps.sort((a, b) => tickOf(list[a[0]]) - tickOf(list[b[0]]));
        coldPaired += ps.length;
        coldPairSummaries.push({
          kind: 'cold-pair-summary', openType: open, closeType: close, key, keyValue: kv,
          pairCount: ps.length,
          firstOpenTick: tickOf(list[ps[0][0]]), lastCloseTick: tickOf(list[ps[ps.length - 1][1]]),
          exampleEventIds: ps.slice(0, 4).map(([oi, ci]) => [eventIdOf(list[oi], oi), eventIdOf(list[ci], ci)]).flat(),
        });
      }
    }
    // Cold summary merge: bulk + middle summaries at/before the cutoff
    // collapse per (kind, type) into cumulative spans (idempotent).
    const mb = mergeColdSummaries(summaries, cutoff, { middleMaxActors, maxDistinct });
    summaries.length = 0; summaries.push(...mb.entries); coldSummariesMerged += mb.mergedCount;
    const mm = mergeColdSummaries(middleSummaries, cutoff, { middleMaxActors, maxDistinct });
    middleSummaries.length = 0; middleSummaries.push(...mm.entries); coldSummariesMerged += mm.mergedCount;
  }

  const compacted = [];
  let dropped = 0;
  list.forEach((e, i) => {
    if (coldRemoved.has(i)) return; // NEXT-49: rolled into a cold summary
    if (keep.has(i)) { compacted.push(e); return; }
    const t = e?.type;
    if (typeof t === 'string' && bulkSet.has(t)) return; // summarized
    if (middleIdx.has(i)) return; // middle-summarized
    dropped += 1; // explicit dropTypes only (safe default keeps the rest)
  });

  const originalBytes = Buffer.byteLength(JSON.stringify(list), 'utf8');
  const compactBytes = Buffer.byteLength(JSON.stringify({ events: compacted, summaries, middleSummaries, coldPairSummaries }), 'utf8');
  return {
    events: compacted,
    summaries,
    middleSummaries,
    coldPairSummaries,
    danglingParents: [...dangling].sort(),
    stats: {
      original: list.length,
      kept: compacted.length,
      summarized: summaries.reduce((s, x) => s + x.count, 0),
      middleSummarized: middleSummaries.reduce((s, x) => s + x.count, 0),
      coldPaired,
      coldPairSummaries: coldPairSummaries.length,
      coldSummariesMerged,
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

export default { compactEventLog, verifyAnchorClosure, mergeColdSummaries, mergeColdPairSummaries, DEFAULT_ANCHOR_TYPES, DEFAULT_BULK_TYPES };
