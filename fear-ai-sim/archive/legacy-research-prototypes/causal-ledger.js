// RESP-EVENT-ID-AUTHORITY-001 — Causal event ledger linter (read-only).
//
// Enforces, over any world produced by `tickClosedWorld`:
//
//   EVENT-ID-001      one authoritative allocator owns event IDs. Protected
//                     event types must carry allocator-shaped ids
//                     (WORLD-EVENT-#######), never template-derived ids.
//   EVENT-PARENT-001  chain-connector event types REQUIRE at least one
//                     resolvable parent; derivative/summary types require a
//                     parent OR an explicit `rootReason` (never a silent
//                     `parentEventIds: []`).
//   EVENT-PARENT-ORDER-001  no parent may be causally later than its child.
//   CHAIN-MERCHANT-001      MERCHANT_ROUTE_DECISION -> TRIP_COMMITMENT ->
//                           ROUTE_EXPOSURE -> consequence must actually exist
//                           in the ledger's parent/child graph.
//   CHAIN-MIGRATION-001     MIGRATION -> MIGRATION_DECISION ->
//                           MIGRATION_PRESSURE_EVALUATED must actually exist
//                           in the ledger's parent/child graph.
//
// This module has no dependencies and never mutates the world. It is the
// negative control: each pre-registered mutation in
// tests/w1-causal-ledger.test.js must produce exactly its intended finding.

/** Chain-connector types: a parent is mandatory, rootReason is not enough. */
export const PARENT_REQUIRED_TYPES = [
    'TRIP_COMMITMENT',
    'OBSERVATION',
    'BELIEF_UPDATE',
    'ROUTE_EXPOSURE',
    'CANDIDATE_ENCOUNTER',
    'ENCOUNTER',
    'MIGRATION_DECISION',
    'MIGRATION',
    'FACTION_REACTION',
    'JUSTICE_RESOLVED',
];

/**
 * Derivative / summary / root-capable types: a resolvable parent OR an
 * explicit rootReason string. A silent [] is a violation (this is the
 * exact orphan class the audits found).
 */
export const PARENT_OR_ROOT_TYPES = [
    'MERCHANT_ROUTE_DECISION',
    'ROUTE_SELECTED',
    'ROUTE_CHANGED',
    'PATROL_INTERCEPTION',
    'PATROL_DETECTION_MISS',
    'REPORT_FILED',
    'BANDIT_ATTACK',
    'STANCE_TRANSITION',
    'INTRUSION',
    'BANDIT_RELOCATION',
    'CONVOY_FORMED',
    'CONVOY_DISBANDED',
    'FACTION_REASSESSMENT',
    'MARKET_TICK',
    'RUMOR',
    'MIGRATION_PRESSURE_EVALUATED',
    'FACTION_ACTION',
    'INVASION',
];

export const PROTECTED_TYPES = [...new Set([...PARENT_REQUIRED_TYPES, ...PARENT_OR_ROOT_TYPES])];

export const ALLOCATOR_ID_RE = /^WORLD-EVENT-\d+$/;

const CONSEQUENCE_TYPES = ['BANDIT_ATTACK', 'ENCOUNTER', 'PENDING_CARGO_DELIVERED'];

/**
 * Descendant cone: every event reachable from `startIds` via
 * parentEventIds edges, bounded by maxHops.
 */
function descendantCone(events, startIds, maxHops = 6) {
    const byId = new Map(events.filter(e => e && e.eventId).map(e => [e.eventId, e]));
    const seen = new Set();
    let frontier = [...startIds];
    for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
        const next = [];
        for (const id of frontier) {
            if (seen.has(id)) continue;
            seen.add(id);
            for (const child of byId.values()) {
                if (!seen.has(child.eventId) && Array.isArray(child.parentEventIds) && child.parentEventIds.includes(id)) {
                    next.push(child.eventId);
                }
            }
        }
        frontier = next;
    }
    return seen;
}

/**
 * Ancestor set: every event reachable from `startIds` by walking parents.
 */
function ancestorSet(events, startIds, maxHops = 12) {
    const byId = new Map(events.filter(e => e && e.eventId).map(e => [e.eventId, e]));
    const seen = new Set();
    let frontier = [...startIds];
    for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
        const next = [];
        for (const id of frontier) {
            if (seen.has(id)) continue;
            seen.add(id);
            const ev = byId.get(id);
            if (!ev || !Array.isArray(ev.parentEventIds)) continue;
            for (const p of ev.parentEventIds) {
                if (!seen.has(p)) next.push(p);
            }
        }
        frontier = next;
    }
    return seen;
}

/**
 * Lint a world's causal event ledger.
 *
 * @param {object} world
 * @returns {{ ok: boolean, findings: Array<object> }}
 */
export function lintCausalLedger(world) {
    const findings = [];
    const events = Array.isArray(world?.events) ? world.events : [];

    // --- EVENT-ID-001: duplicate ids -------------------------------------
    const byId = new Map();
    for (const e of events) {
        if (!e || typeof e !== 'object' || typeof e.eventId !== 'string' || e.eventId.length === 0) continue;
        if (byId.has(e.eventId)) {
            findings.push({ code: 'DUP_EVENT_ID', severity: 'high', eventType: e.type, eventId: e.eventId });
        }
        byId.set(e.eventId, e);
    }

    // --- EVENT-PARENT-001 / EVENT-PARENT-ORDER-001 / EVENT-ID-001 ---------
    for (const e of events) {
        if (!e || typeof e !== 'object') continue;
        const parents = Array.isArray(e.parentEventIds) ? e.parentEventIds : [];
        for (const p of parents) {
            const parent = byId.get(p);
            if (!parent) {
                findings.push({ code: 'UNKNOWN_PARENT', severity: 'high', eventType: e.type, eventId: e.eventId, parentId: p });
            } else if (Number.isFinite(e.tick) && Number.isFinite(parent.tick) && parent.tick > e.tick) {
                findings.push({
                    code: 'FUTURE_PARENT', severity: 'high', eventType: e.type, eventId: e.eventId,
                    parentId: p, parentTick: parent.tick, childTick: e.tick,
                });
            }
        }
        if (!e.type) continue;
        if (PARENT_REQUIRED_TYPES.includes(e.type)) {
            if (parents.length === 0) {
                findings.push({ code: 'MISSING_PARENT', severity: 'high', eventType: e.type, eventId: e.eventId });
            }
        } else if (PARENT_OR_ROOT_TYPES.includes(e.type)) {
            if (parents.length === 0 && typeof e.rootReason !== 'string') {
                findings.push({ code: 'MISSING_PARENT_OR_ROOT', severity: 'medium', eventType: e.type, eventId: e.eventId });
            }
        }
        if (PROTECTED_TYPES.includes(e.type)) {
            if (typeof e.eventId !== 'string' || e.eventId.length === 0) {
                findings.push({ code: 'MISSING_EVENT_ID', severity: 'high', eventType: e.type, eventId: null });
            } else if (!ALLOCATOR_ID_RE.test(e.eventId)) {
                findings.push({ code: 'TEMPLATE_EVENT_ID', severity: 'high', eventType: e.type, eventId: e.eventId });
            }
        }
    }

    // --- CHAIN-MERCHANT-001: decision -> commitment -> exposure -> consequence
    const decisions = events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION' && e.eventId);
    for (const d of decisions) {
        const cone = descendantCone(events, [d.eventId], 3);
        const trip = events.some(e => e.type === 'TRIP_COMMITMENT' && cone.has(e.eventId));
        if (!trip) {
            findings.push({ code: 'CHAIN_MERCHANT_DECISION', severity: 'high', eventType: 'TRIP_COMMITMENT', eventId: d.eventId });
        }
    }
    const trips = events.filter(e => e.type === 'TRIP_COMMITMENT' && e.eventId && e.materialized !== false);
    for (const t of trips) {
        const cone = descendantCone(events, [t.eventId], 5);
        const exposed = events.some(e => ['ROUTE_EXPOSURE', ...CONSEQUENCE_TYPES].includes(e.type) && cone.has(e.eventId));
        if (!exposed) {
            findings.push({ code: 'CHAIN_MERCHANT_TRIP', severity: 'high', eventType: 'ROUTE_EXPOSURE', eventId: t.eventId });
        }
    }
    const exposures = events.filter(e => e.type === 'ROUTE_EXPOSURE' && e.eventId);
    const anyConsequenceInLedger = events.some(e => CONSEQUENCE_TYPES.includes(e.type));
    if (exposures.length > 0 && anyConsequenceInLedger) {
        // EVENTUALLY-style: if consequences DID occur in this window but
        // none is descendant-linked to an exposure, the exposure ->
        // consequence wire is broken. If no consequence occurred at all,
        // the window simply had no eligible encounter — not a violation.
        const pathExists = exposures.some(x => {
            const cone = descendantCone(events, [x.eventId], 4);
            return events.some(e => CONSEQUENCE_TYPES.includes(e.type) && cone.has(e.eventId));
        });
        if (!pathExists) {
            findings.push({ code: 'CHAIN_MERCHANT_EXPOSURE', severity: 'medium', eventType: 'BANDIT_ATTACK', eventId: null });
        }
    }

    // --- CHAIN-MIGRATION-001: migration -> decision -> pressure evaluation ---
    const migrations = events.filter(e => e.type === 'MIGRATION' && e.eventId);
    const decisionsByEventId = new Map(events.filter(e => e.type === 'MIGRATION_DECISION' && e.eventId).map(e => [e.eventId, e]));
    for (const m of migrations) {
        const decisionParent = (m.parentEventIds ?? []).find(p => decisionsByEventId.has(p));
        if (!decisionParent) {
            findings.push({ code: 'CHAIN_MIGRATION', severity: 'high', eventType: 'MIGRATION_DECISION', eventId: m.eventId });
        }
    }
    const evaluationsByEventId = new Map(events.filter(e => e.type === 'MIGRATION_PRESSURE_EVALUATED' && e.eventId).map(e => [e.eventId, e]));
    for (const d of decisionsByEventId.values()) {
        const ancestors = ancestorSet(events, [d.eventId], 4);
        const hasEvaluation = [...ancestors].some(id => evaluationsByEventId.has(id))
            || (d.parentEventIds ?? []).some(p => evaluationsByEventId.has(p));
        if (!hasEvaluation) {
            findings.push({ code: 'CHAIN_MIGRATION_PRESSURE', severity: 'high', eventType: 'MIGRATION_PRESSURE_EVALUATED', eventId: d.eventId });
        }
    }

    return { ok: findings.length === 0, findings };
}

/**
 * Group findings by code — convenience for mutation detectors.
 */
export function findingsByCode(world) {
    const groups = {};
    for (const f of lintCausalLedger(world).findings) {
        (groups[f.code] = groups[f.code] ?? []).push(f);
    }
    return groups;
}