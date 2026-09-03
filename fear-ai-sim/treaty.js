// Constitution §12 (Diplomacy).
//
// World-Completion Directive §12 specifies treaties,
// non-aggression pacts, trade agreements, and the like.
// The §29 impossibility audit (2026-08-28) answered
// "Can a treaty be formed?" with **NO** — this module
// closes that gap.
//
// A treaty is a *binding* agreement between two or more
// participants (typically factions). The treaty record:
//   - `id`: unique string
//   - `participants`: array of participant ids
//   - `terms`: { kind, scope, ... } where kind is one of
//     'passage' (free passage on a road), 'non-aggression'
//     (no raids/attacks), or 'trade' (open trade route).
//   - `startTick`: tick the treaty was formed
//   - `obligations`: array of obligation records
//   - `violations`: array of violation records
//   - `status`: 'ACTIVE' | 'TERMINATED'
//   - `termination`: { reason, endTick } | null
//
// The `requestPassage(actor, target, world, tick)` interaction
// forms a passage treaty when both parties consent. By default
// both parties consent (the §12 default). A future slice can
// add a `requestConsent` interaction that requires explicit
// approval.
//
// All operations are pure (no Math.random()) so the §121
// determinism contract holds.

import { recordLawfulnessViolation } from './reputation.js';

/**
 * Create a treaty record. Pure function.
 * @param {object} options
 *   - id: unique id
 *   - participants: array of participant ids (faction ids)
 *   - terms: { kind, scope, ... }
 *   - startTick: tick the treaty was formed
 * @returns {object} the treaty record
 */
export function createTreaty({ id, participants = [], terms = {}, startTick = 0 } = {}) {
    if (!id) throw new TypeError('createTreaty requires an id');
    if (!Array.isArray(participants) || participants.length < 2) {
        throw new TypeError('createTreaty requires at least 2 participants');
    }
    if (typeof terms.kind !== 'string') {
        throw new TypeError('createTreaty requires terms.kind');
    }
    return {
        id,
        participants: participants.slice(),
        terms: { ...terms },
        startTick,
        obligations: [],
        violations: [],
        status: 'ACTIVE',
        termination: null,
    };
}

/**
 * Record the institutional observation of a treaty breach. Every participating
 * faction other than the violator receives an independent lawfulness record;
 * this keeps the signal observer-scoped and separate from relationship harm.
 */
export function observeTreatyViolation({ world, treaty, violator, reason, tick = 0 } = {}) {
    if (!world || !treaty || !violator) return [];
    const observations = [];
    for (const observerId of treaty.participants ?? []) {
        if (observerId === violator) continue;
        const observer = world.factions?.find(faction => faction.id === observerId);
        if (!observer) continue;
        const record = recordLawfulnessViolation(observer, violator, {
            tick,
            weight: observer.reputationTrust ?? 1,
            treatyId: treaty.id,
            reason,
        });
        if (record) {
            observations.push({
                observerId,
                violatorId: violator,
                dimension: 'lawfulness',
                score: record.score,
                outcome: record.lastOutcome,
            });
        }
    }
    return observations;
}

/**
 * Request passage on a road between two factions. Forms a
 * passage treaty and pushes a TREATY_FORMED event onto the
 * world. The treaty id is derived deterministically from the
 * participants + scope + startTick so the §121 contract
 * holds.
 *
 * @param {object} options
 *   - actor: the requesting faction id
 *   - target: the consenting faction id
 *   - scope: the road id (e.g. 'road-a')
 *   - world: the closed-world state (mutated in place)
 *   - tick: the current tick
 * @returns {object} { ok, treaty, reason? }
 */
export function requestPassage({ actor, target, scope, world, tick = 0 } = {}) {
    if (!actor || !target) return { ok: false, reason: 'MISSING_PARTICIPANT' };
    if (!scope) return { ok: false, reason: 'MISSING_SCOPE' };
    if (!world || !Array.isArray(world.events)) {
        return { ok: false, reason: 'INVALID_WORLD' };
    }
    // The §12 default: both parties consent. A future slice
    // can add a per-faction `consentPolicy` and gate the
    // formation on it.
    if (!world.treaties) world.treaties = [];
    const id = `treaty-passage-${actor}-${target}-${scope}-${tick}`;
    const treaty = createTreaty({
        id,
        participants: [actor, target],
        terms: { kind: 'passage', scope },
        startTick: tick,
    });
    world.treaties.push(treaty);
    // The §7 "Causal Ledger" contract: every world-state
    // mutation is recorded as an event.
    world.events.push({
        type: 'TREATY_FORMED',
        treatyId: treaty.id,
        treaty: { ...treaty, participants: treaty.participants.slice() },
        participants: treaty.participants.slice(),
        terms: { ...treaty.terms },
        tick,
    });
    return { ok: true, treaty };
}

/**
 * Record a treaty violation. Adds a violation record to the
 * treaty and pushes a TREATY_VIOLATED event onto the world.
 * The treaty status remains ACTIVE (a violation does not
 * automatically terminate the treaty — that is a separate
 * decision).
 *
 * @param {object} options
 *   - treaty: the treaty record (mutated in place)
 *   - violator: the participant id that violated
 *   - reason: a string describing the violation
 *   - world: the closed-world state (mutated in place)
 *   - tick: the current tick
 * @returns {object} the updated treaty record
 */
export function violateTreaty({ treaty, violator, reason, world, tick = 0 } = {}) {
    if (!treaty) throw new TypeError('violateTreaty requires a treaty');
    if (!violator) throw new TypeError('violateTreaty requires a violator');
    if (!treaty.participants.includes(violator)) {
        return { ...treaty };
    }
    const violation = { violator, reason: reason ?? 'unspecified', tick };
    if (!Array.isArray(treaty.violations)) treaty.violations = [];
    treaty.violations.push(violation);
    const reputation = observeTreatyViolation({
        world,
        treaty,
        violator,
        reason: violation.reason,
        tick,
    });
    if (world && Array.isArray(world.events)) {
        world.events.push({
            type: 'TREATY_VIOLATED',
            treatyId: treaty.id,
            violator,
            reason: violation.reason,
            tick,
            ...(reputation.length > 0 ? { reputation } : {}),
        });
    }
    return treaty;
}

/**
 * Terminate a treaty. Sets the status to TERMINATED,
 * records the termination reason and endTick, and pushes a
 * TREATY_TERMINATED event onto the world.
 *
 * @param {object} options
 *   - treaty: the treaty record (mutated in place)
 *   - reason: a string describing why
 *   - world: the closed-world state (mutated in place)
 *   - tick: the current tick
 * @returns {object} the updated treaty record
 */
export function terminateTreaty({ treaty, reason, world, tick = 0 } = {}) {
    if (!treaty) throw new TypeError('terminateTreaty requires a treaty');
    treaty.status = 'TERMINATED';
    treaty.termination = { reason: reason ?? 'unspecified', endTick: tick };
    if (world && Array.isArray(world.events)) {
        world.events.push({
            type: 'TREATY_TERMINATED',
            treatyId: treaty.id,
            reason: treaty.termination.reason,
            tick,
        });
    }
    return treaty;
}

/**
 * List all ACTIVE treaties for a given faction. The
 * `world.treaties` list is the source of truth (terminated
 * treaties remain for history).
 *
 * The optional `options.kind` parameter filters by
 * `treaty.terms.kind` (e.g. 'passage', 'non-aggression',
 * 'tradeAgreement'). This lets callers check for a specific
 * treaty kind without scanning the full list.
 *
 * @param {string} factionId
 * @param {object} world
 * @param {object} options
 *   - kind: optional treaty kind filter
 * @returns {Array} active treaties where the faction is a participant
 */
export function activeTreatiesFor(factionId, world, { kind = null } = {}) {
    if (!factionId || !world || !Array.isArray(world.treaties)) return [];
    return world.treaties.filter(treaty => {
        if (treaty.status !== 'ACTIVE') return false;
        if (!treaty.participants.includes(factionId)) return false;
        if (kind !== null && treaty.terms.kind !== kind) return false;
        return true;
    });
}

/**
 * Request a non-aggression pact between two factions. The
 * pact is a treaty with `terms.kind === 'non-aggression'`.
 * A non-aggression pact constrains the participants: a
 * faction with a non-aggression pact must NOT raid a
 * bandit (or any actor) associated with the other faction.
 *
 * The treaty id is derived deterministically from the
 * participants + kind + startTick so the §121 contract
 * holds.
 *
 * @param {object} options
 *   - actor: the requesting faction id
 *   - target: the consenting faction id
 *   - world: the closed-world state (mutated in place)
 *   - tick: the current tick
 * @returns {object} { ok, treaty, reason? }
 */
export function requestNonAggression({ actor, target, world, tick = 0 } = {}) {
    if (!actor || !target) return { ok: false, reason: 'MISSING_PARTICIPANT' };
    if (!world || !Array.isArray(world.events)) {
        return { ok: false, reason: 'INVALID_WORLD' };
    }
    if (!world.treaties) world.treaties = [];
    const id = `treaty-nonaggression-${actor}-${target}-${tick}`;
    const treaty = createTreaty({
        id,
        participants: [actor, target],
        terms: { kind: 'non-aggression', scope: 'all' },
        startTick: tick,
    });
    world.treaties.push(treaty);
    world.events.push({
        type: 'TREATY_FORMED',
        treatyId: treaty.id,
        treaty: { ...treaty, participants: treaty.participants.slice() },
        participants: treaty.participants.slice(),
        terms: { ...treaty.terms },
        tick,
    });
    return { ok: true, treaty };
}

/**
 * Check whether a given action violates any active treaty.
 * The predicate is called from the closed-world reducer after
 * each state-mutating step. If the action violates an active
 * treaty, the violation is recorded on the treaty and a
 * `TREATY_VIOLATED` event is emitted. The treaty is NOT
 * auto-terminated — the violation is observed, not
 * auto-punitive.
 *
 * The MVP checks passage treaties: an action with a `roadId`
 * that matches an active passage treaty's `terms.scope` and
 * a `violator` that is a treaty participant is a violation.
 * Legacy passage records with `kind: 'PASSAGE'` and
 * `terms.passage === true` are accepted as well. A scope-free
 * passage treaty covers every road. Future slices can add
 * checks for non-aggression treaties (action.type === 'RAID'
 * and target is a participant) and trade treaties
 * (action.type === 'embargo' and target is a participant).
 *
 * @param {object} options
 *   - world: the closed-world state (mutated in place)
 *   - action: { type, roadId?, violator?, tick }
 *   - tick: the current tick
 * @returns {object|null} the violation record { treatyId, violator, reason, tick },
 *   or null if no violation
 */
export function checkTreatyCompliance({ world, action, tick = 0 } = {}) {
    if (!world || !action) return null;
    if (!Array.isArray(world.treaties)) return null;
    for (const treaty of world.treaties) {
        if (treaty.status !== 'ACTIVE') continue;
        // Passage treaty: a road action by a treaty
        // participant on the protected scope is a violation.
        const treatyKind = treaty.terms?.kind ?? treaty.kind;
        const isPassage = treatyKind === 'passage'
            || treatyKind === 'PASSAGE'
            || treaty.terms?.passage === true;
        const hasScope = typeof treaty.terms?.scope === 'string' && treaty.terms.scope.length > 0;
        const scopeMatches = !hasScope || action.roadId === treaty.terms.scope;
        if (isPassage && scopeMatches && action.violator) {
            if (treaty.participants.includes(action.violator)) {
                const updated = violateTreaty({
                    treaty,
                    violator: action.violator,
                    reason: action.type ?? 'passage-violation',
                    world,
                    tick,
                });
                // Return a violation record that includes
                // the treaty id (the §7 Causal Ledger
                // contract: every event is reconstructable
                // from the audit trail).
                const last = updated.violations[updated.violations.length - 1];
                return { treatyId: updated.id, ...last };
            }
        }
    }
    return null;
}
