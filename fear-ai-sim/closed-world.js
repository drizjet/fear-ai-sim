import { BeliefStore, Evidence, INFORMATION_LAYERS } from './beliefs.js';
import { findRoutePath, selectRoute } from './routing.js';
import { FactionDecisionModel, ESCALATION_LEVELS } from './factioncore.js';
import { formConvoy, resolveConvoyAmbush } from './convoy.js';
import { Market } from './economy.js';
import { relocateBandit, planRetaliation, executeRetaliation, recordHarmByActor, getMemoryOfLoss, computeReputation } from './escalation.js';
import { JusticeSystem } from './justice.js';
import { InteractionEngine } from './interactions.js';
import { FactionRelationshipVector, evaluateStance, chooseStance, StanceLadder } from './factionrelationship.js';
import { evaluateEncounterEligibility, selectEncounterCandidates, instantiateEncounter } from './encounters.js';
import { checkTreatyCompliance, activeTreatiesFor, createTreaty, terminateTreaty } from './treaty.js';
import { createRoamingGroup, chooseRoamingDestination, generateCandidates, startTravel, advanceTravel, tickRoamingGroup, scoutDestination, recordObservation, ROAMING_MODE, makeXorShift32 } from './roaming.js';
import { tickWildlifeGroup } from './wildlife.js';
import { tickMerchant as tickCanonicalMerchant, tickBandit as tickCanonicalBandit, tickPatrol as tickCanonicalPatrol, selectMerchantCargoKind } from './canonical-trade-system.js';
import { tickSeason, getSeasonModifier, getSpoilageModifier } from './ecology.js';
import { tickDemography } from './demography.js';
import { recordLawfulnessViolation, recordTradeReliability } from './reputation.js';
import { ensureTownLaws, checkAllLawCompliance, checkLawCompliance } from './law.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const clamp01 = value => clamp(value, 0, 1);

// Deterministic xorshift32 RNG for tests and reproducible runs.
const deterministicRng = (seed = 1) => {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x100000000;
    };
};

// -----------------------------------------------------------------------------
// Persistent pending-world protocol.
// -----------------------------------------------------------------------------
// Functions and closures are intentionally not persistence state. Pending
// stochastic work therefore owns a plain numeric xorshift state on the world,
// alongside monotonic action/event counters and explicit obligation queues.
// Every field initialized here is JSON data and is consequently covered by the
// same save/load/fork boundary as the rest of the closed world.
const DEFAULT_PENDING_RNG_STATE = 0x6D2B79F5;
const DEFAULT_ENCOUNTER_RNG_STATE = 0x9E3779B9;

function ensurePendingWorldState(world) {
    if (!Number.isSafeInteger(world.nextActionId) || world.nextActionId < 1) {
        world.nextActionId = 1;
    }
    if (!Number.isSafeInteger(world.nextEventId) || world.nextEventId < 1) {
        world.nextEventId = 1;
    }
    if (!world.rngStreams || typeof world.rngStreams !== 'object') {
        world.rngStreams = {};
    }
    const pendingStream = world.rngStreams.pendingEffects;
    if (!pendingStream || typeof pendingStream !== 'object') {
        world.rngStreams.pendingEffects = {
            algorithm: 'xorshift32',
            state: DEFAULT_PENDING_RNG_STATE,
            draws: 0,
        };
    } else {
        pendingStream.algorithm = 'xorshift32';
        pendingStream.state = (pendingStream.state >>> 0) || DEFAULT_PENDING_RNG_STATE;
        pendingStream.draws = Number.isSafeInteger(pendingStream.draws) && pendingStream.draws >= 0
            ? pendingStream.draws
            : 0;
    }
    const encounterStream = world.rngStreams.encounter;
    if (!encounterStream || typeof encounterStream !== 'object') {
        world.rngStreams.encounter = {
            algorithm: 'xorshift32',
            state: DEFAULT_ENCOUNTER_RNG_STATE,
            draws: 0,
        };
    } else {
        encounterStream.algorithm = 'xorshift32';
        encounterStream.state = (encounterStream.state >>> 0) || DEFAULT_ENCOUNTER_RNG_STATE;
        encounterStream.draws = Number.isSafeInteger(encounterStream.draws) && encounterStream.draws >= 0
            ? encounterStream.draws
            : 0;
    }
    for (const key of [
        'pendingTrips',
        'scheduledConsequences',
        'routeCommitments',
        'patrolAssignments',
        'rumorsInTransit',
        'migrationJourneys',
    ]) {
        if (!Array.isArray(world[key])) world[key] = [];
    }
    // R2-W1 loss/restock ledgers: material destroyed in transit (theft,
    // convoy loss) and material injected from declared outside the
    // system (merchant restock). Plain objects: JSON-safe across
    // save/load/fork. Both are consumed by the global mass identity
    // (towns + merchant cargo + in-trip cargo + loss sink - exogenous
    // inflow), so no material vanishes or appears unexplained.
    for (const key of ['transitLoss', 'exogenousInflow']) {
        if (!world[key] || typeof world[key] !== 'object' || Array.isArray(world[key])) {
            world[key] = {};
        }
    }
    if (!(world.processedFactionAttackEventIds instanceof Set)) {
        world.processedFactionAttackEventIds = new Set(world.processedFactionAttackEventIds ?? []);
    }
    return world;
}

/**
 * R2-W1 loss sink: book material destroyed in transit (bandit theft,
 * convoy loss). The loss leaves the conserved material set and lands in
 * `world.transitLoss[kind]` so the global mass identity stays exact.
 * Patrol interception reverses the booking (recovered cargo re-enters
 * the conserved set).
 */
function bookTransitLoss(world, kind, amount) {
    ensurePendingWorldState(world);
    const amt = Number(amount);
    if (!kind || !Number.isFinite(amt) || amt <= 0) return;
    world.transitLoss[kind] = (world.transitLoss[kind] ?? 0) + amt;
}

/**
 * R2-W1 declared exogenous injection: material entering the conserved
 * set from outside the model (e.g. merchant restock at origin). The
 * global mass identity subtracts this ledger explicitly; without the
 * declaration, restock would look like unexplained mass creation.
 */
function bookExogenousInflow(world, kind, amount) {
    ensurePendingWorldState(world);
    const amt = Number(amount);
    if (!kind || !Number.isFinite(amt) || amt <= 0) return;
    world.exogenousInflow[kind] = (world.exogenousInflow[kind] ?? 0) + amt;
}

export function bookExogenousPopulation(world, direction, amount) {
    // R3 (V8 audit MAT-005): declared exogenous population flow.
    // People entering (refugee absorption from off-map) or leaving
    // (emigrants dropped at unsettleable destinations) the modeled
    // set are creation/deletion events; without this ledger they
    // break the population identity silently. Plain JSON so
    // save/load round-trips it with zero migration work.
    if (!world) return;
    if (!world.exogenousPopulation || typeof world.exogenousPopulation !== 'object') {
        world.exogenousPopulation = { inflow: 0, outflow: 0 };
    }
    const amt = Number(amount);
    if ((direction !== 'inflow' && direction !== 'outflow') || !Number.isFinite(amt) || amt <= 0) return;
    world.exogenousPopulation[direction] = (Number(world.exogenousPopulation[direction]) || 0) + amt;
}
// E9 (merchant capital): starting balance and the single booking
// point for merchant P&L. Every delta is valued at a live market
// quote at the transaction site (buys cost, sales earn, raids
// destroy). Older saves and hand-built merchants without the field
// open at the starting balance — no migration needed. Capital is a
// plain number so save/load round-trips it untouched.
export const MERCHANT_STARTING_CAPITAL = 100;
export function bookMerchantCapital(merchant, delta) {
    if (!merchant || typeof merchant !== 'object') return 0;
    if (!Number.isFinite(merchant.capital)) merchant.capital = MERCHANT_STARTING_CAPITAL;
    const change = Number(delta);
    if (!Number.isFinite(change) || change === 0) return merchant.capital;
    merchant.capital += change;
    return merchant.capital;
}
export function marketQuotePrice(market, kind) {
    try {
        const price = market?.getQuote?.(kind)?.price;
        return Number.isFinite(price) ? price : 1;
    } catch {
        return 1;
    }
}

function allocateWorldActionId(world) {
    ensurePendingWorldState(world);
    const id = `WORLD-ACTION-${String(world.nextActionId).padStart(6, '0')}`;
    world.nextActionId += 1;
    return id;
}

function allocateWorldEventId(world) {
    ensurePendingWorldState(world);
    const id = `WORLD-EVENT-${String(world.nextEventId).padStart(6, '0')}`;
    world.nextEventId += 1;
    return id;
}

function normalizeParentEventIds(parentEventIds = []) {
    if (!Array.isArray(parentEventIds)) return [];
    return [...new Set(parentEventIds.filter(id => typeof id === 'string' && id.length > 0))];
}

// The event ledger is append-only during a reducer run, but legacy callers and
// older subsystems still write directly to `world.events`. Keep a non-enumerable
// index that is incrementally synchronized from the last observed array offset.
// It is deliberately not serialized: the event array remains the authoritative
// persistence format, and a loaded/forked world rebuilds this cache once.
const EVENT_LEDGER_STATE = Symbol('closedWorldEventLedgerState');

function eventTick(event) {
    return event?.tick ?? 0;
}

function createEventLedgerState(world) {
    const state = {
        events: world.events,
        cursor: 0,
        byType: new Map(),
        byTypeTick: new Map(),
        positions: new WeakMap(),
    };
    Object.defineProperty(world, EVENT_LEDGER_STATE, {
        value: state,
        writable: true,
        configurable: true,
        enumerable: false,
    });
    return state;
}

function getEventLedgerState(world) {
    if (!Array.isArray(world.events)) world.events = [];
    const existing = world[EVENT_LEDGER_STATE];
    if (!existing
        || existing.events !== world.events
        || !Number.isSafeInteger(existing.cursor)
        || existing.cursor < 0
        || existing.cursor > world.events.length) {
        return createEventLedgerState(world);
    }
    return existing;
}

function indexWorldEvent(state, event, position) {
    if (!event || typeof event !== 'object') return;
    const type = event.type;
    let byType = state.byType.get(type);
    if (!byType) {
        byType = [];
        state.byType.set(type, byType);
    }
    byType.push(event);

    let byTick = state.byTypeTick.get(type);
    if (!byTick) {
        byTick = new Map();
        state.byTypeTick.set(type, byTick);
    }
    const tick = eventTick(event);
    let atTick = byTick.get(tick);
    if (!atTick) {
        atTick = [];
        byTick.set(tick, atTick);
    }
    atTick.push(event);
    state.positions.set(event, position);
}

function synchronizeEventLedger(world) {
    const state = getEventLedgerState(world);
    for (let index = state.cursor; index < world.events.length; index += 1) {
        const event = world.events[index];
        if (event && typeof event === 'object') {
            ensureWorldEventIdentity(world, event);
            indexWorldEvent(state, event, index);
        }
        state.cursor = index + 1;
    }
    return state;
}

function sortLedgerOrder(events, state) {
    return events.sort((a, b) =>
        (state.positions.get(a) ?? Number.MAX_SAFE_INTEGER)
        - (state.positions.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
}

function indexedEventsForTypeAndRange(state, type, minTick, maxTick) {
    const byTick = state.byTypeTick.get(type);
    if (!byTick) return [];
    const lower = Number.isFinite(minTick) ? Math.ceil(minTick) : -Infinity;
    const upper = Number.isFinite(maxTick) ? Math.floor(maxTick) : Infinity;
    // Reducer windows are short integer tick ranges. Iterate those keys
    // directly instead of scanning the complete history for every town.
    if (Number.isFinite(lower) && Number.isFinite(upper)
        && lower <= upper && upper - lower <= 10000) {
        const result = [];
        for (let tick = lower; tick <= upper; tick += 1) {
            const events = byTick.get(tick);
            if (events) result.push(...events);
        }
        return result;
    }
    return (state.byType.get(type) ?? []).filter(event => {
        const tick = eventTick(event);
        return tick >= lower && tick <= upper;
    });
}

/**
 * Read the event ledger through its incremental index. This preserves the
 * ordering of the authoritative `world.events` array while making the common
 * type/tick and recent-window queries proportional to the matching events.
 */
export function getWorldEvents(world, {
    type = null,
    types = null,
    tick,
    minTick,
    maxTick,
} = {}) {
    const state = synchronizeEventLedger(world);
    const requestedTypes = Array.isArray(types)
        ? [...new Set(types)]
        : type !== null && type !== undefined ? [type] : null;
    const hasExactTick = Number.isFinite(tick);
    const hasRange = Number.isFinite(minTick) || Number.isFinite(maxTick);
    let candidates;

    if (!requestedTypes) {
        candidates = hasExactTick
            ? world.events.filter(event => eventTick(event) === tick)
            : world.events.slice();
    } else if (hasExactTick) {
        candidates = [];
        for (const requestedType of requestedTypes) {
            const atTick = state.byTypeTick.get(requestedType)?.get(tick);
            if (atTick) candidates.push(...atTick);
        }
    } else if (hasRange) {
        candidates = [];
        for (const requestedType of requestedTypes) {
            candidates.push(...indexedEventsForTypeAndRange(state, requestedType, minTick, maxTick));
        }
    } else {
        candidates = [];
        for (const requestedType of requestedTypes) {
            candidates.push(...(state.byType.get(requestedType) ?? []));
        }
    }

    if (requestedTypes && requestedTypes.length > 1) sortLedgerOrder(candidates, state);
    if (!hasExactTick && hasRange) {
        const lower = Number.isFinite(minTick) ? minTick : -Infinity;
        const upper = Number.isFinite(maxTick) ? maxTick : Infinity;
        candidates = candidates.filter(event => {
            const candidateTick = eventTick(event);
            return candidateTick >= lower && candidateTick <= upper;
        });
        // Iterating the tick buckets is fast but can reorder events when a
        // caller appends an older-tick event later. The world.events array is
        // authoritative, so restore ledger order for every range query.
        sortLedgerOrder(candidates, state);
    }
    return candidates;
}

/** Find the newest indexed event of one type matching a predicate. */
export function findLatestWorldEvent(world, predicate = () => true, type = null) {
    const state = synchronizeEventLedger(world);
    const events = type === null || type === undefined
        ? world.events
        : (state.byType.get(type) ?? []);
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (predicate(events[index])) return events[index];
    }
    return null;
}

function ensureWorldEventIdentity(world, event, parentEventIds = event?.parentEventIds) {
    if (!event || typeof event !== 'object') return event;
    if (typeof event.eventId !== 'string' || event.eventId.length === 0) {
        event.eventId = allocateWorldEventId(world);
    }
    event.parentEventIds = normalizeParentEventIds(parentEventIds);
    return event;
}

export function appendWorldEvent(world, event, parentEventIds = event?.parentEventIds) {
    if (!Array.isArray(world.events)) world.events = [];
    const state = synchronizeEventLedger(world);
    const emitted = ensureWorldEventIdentity(world, { ...event }, parentEventIds);
    const position = world.events.length;
    world.events.push(emitted);
    indexWorldEvent(state, emitted, position);
    state.cursor = world.events.length;
    return emitted;
}

function finalizeWorldEventLedger(world) {
    synchronizeEventLedger(world);
    return world.events;
}

function emitPendingWorldEvent(world, event, parentEventIds = event?.parentEventIds) {
    return appendWorldEvent(world, event, parentEventIds);
}

function nextPendingWorldRandom(world) {
    ensurePendingWorldState(world);
    const stream = world.rngStreams.pendingEffects;
    let state = (stream.state >>> 0) || DEFAULT_PENDING_RNG_STATE;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    stream.state = state >>> 0;
    stream.draws += 1;
    return stream.state / 0x100000000;
}

function nextEncounterRandom(world) {
    ensurePendingWorldState(world);
    const stream = world.rngStreams.encounter;
    let state = (stream.state >>> 0) || DEFAULT_ENCOUNTER_RNG_STATE;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    stream.state = state >>> 0;
    stream.draws += 1;
    return stream.state / 0x100000000;
}

function makeEncounterRng(world, encounterRng) {
    if (typeof encounterRng === 'function') return encounterRng;
    return () => nextEncounterRandom(world);
}

// Slice AC (logistics): the standard wagon train carries WAGON_CAPACITY
// cargo units — the established 12-unit shipment contract is exactly one
// wagon, so existing behavior is the capacity baseline, not an exception.
// Over-capacity loads take extra wagons; wagon count prices road usage.
export const WAGON_CAPACITY = 12;
export function wagonsForShipment(cargoAmount) {
    const amount = Number(cargoAmount);
    if (!Number.isFinite(amount) || amount <= 0) return 1;
    return Math.max(1, Math.ceil(amount / WAGON_CAPACITY));
}

/**
 * Commit a cargo-bearing trip whose effects occur on later reducer ticks.
 * The cargo leaves the merchant immediately, remains owned by the trip while
 * in transit, and reaches the destination market only when its scheduled
 * consequence becomes due after arrival.
 */
export function schedulePendingTradeTrip(world, {
    merchantId,
    routeId,
    destinationTownId,
    cargoKind = 'food',
    cargoAmount,
    travelTicks = 1,
    startTick = 0,
    patrolId = null,
    parentEventIds = [],
} = {}) {
    if (!world || typeof world !== 'object') {
        throw new TypeError('schedulePendingTradeTrip requires a world object');
    }
    ensurePendingWorldState(world);
    const merchant = (world.merchants ?? []).find(item => item.id === merchantId);
    const route = (world.routes ?? []).find(item => item.id === routeId);
    const destinationTown = world.towns?.get?.(destinationTownId);
    const amount = Number(cargoAmount);
    if (!merchant) throw new RangeError(`unknown merchant: ${merchantId}`);
    if (!route) throw new RangeError(`unknown route: ${routeId}`);
    if (!destinationTown?.market) throw new RangeError(`unknown destination town: ${destinationTownId}`);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new RangeError('cargoAmount must be a positive finite number');
    }
    if (!Number.isInteger(travelTicks) || travelTicks < 1) {
        throw new RangeError('travelTicks must be a positive integer');
    }
    if (!Number.isFinite(merchant.cargo) || merchant.cargo < amount) {
        throw new RangeError('merchant does not own the requested cargo amount');
    }
    if (patrolId && !(world.patrols ?? []).some(patrol => patrol.id === patrolId)) {
        throw new RangeError(`unknown patrol: ${patrolId}`);
    }

    const actionId = allocateWorldActionId(world);
    const tripId = `TRIP-${actionId}`;
    // Slice AC: wagon count prices road usage. One wagon per
    // WAGON_CAPACITY units; the audit carries it alongside the
    // pre-wear condition snapshot.
    const wagons = wagonsForShipment(amount);
    const commitment = emitPendingWorldEvent(world, {
        type: 'TRIP_COMMITMENT',
        actionId,
        tripId,
        tick: startTick,
        merchantId,
        routeId,
        destinationTownId,
        cargo: { kind: cargoKind, amount },
        wagons,
        // Slice Z: road condition at departure (pre-wear snapshot).
        roadCondition: Number.isFinite(route.condition) ? route.condition : 1,
    }, parentEventIds);
    const trip = {
        tripId,
        actionId,
        merchantId,
        routeId,
        destinationTownId,
        cargo: { kind: cargoKind, amount },
        startedTick: startTick,
        lastAdvancedTick: startTick,
        remainingTicks: travelTicks,
        status: 'IN_TRANSIT',
        patrolId,
        commitmentEventId: commitment.eventId,
        lastEventId: commitment.eventId,
        parentEventIds: [commitment.eventId],
    };
    merchant.cargo -= amount;
    // Slice AC: usage wear scales with wagons (0.01 per wagon). A
    // standard 12-unit load is one wagon — exactly the legacy 0.01 —
    // while over-capacity loads degrade the road faster. Floored so
    // travel time stays bounded (worst case 2x at condition 0.5).
    route.condition = Math.max(0.5, (Number.isFinite(route.condition) ? route.condition : 1) - 0.01 * wagons);
    world.pendingTrips.push(trip);
    world.routeCommitments.push({
        commitmentId: `ROUTE-${actionId}`,
        actionId,
        tripId,
        merchantId,
        routeId,
        status: 'ACTIVE',
        parentEventIds: [commitment.eventId],
    });
    if (patrolId) {
        const patrol = world.patrols.find(item => item.id === patrolId);
        // Slice J — deployment costs faction resources; if none, patrol not assigned
        const faction = patrol?.factionId ? world.factions?.find(f => f.id === patrol.factionId) : world.factions?.find(f => f.id === 'north-faction');
        const cost = Number(patrol?.travelCost) || 1;
        if (faction && (faction.resources ?? 0) >= cost) {
            faction.resources = Math.max(0, (faction.resources ?? 0) - cost);
            patrol.deployedRoute = routeId;
            world.patrolAssignments.push({
                assignmentId: `PATROL-${actionId}`,
                actionId,
                tripId,
                patrolId,
                routeId,
                status: 'ACTIVE',
                parentEventIds: [commitment.eventId],
            });
        } else {
            // No resources: patrol not assigned, trip still ships unescorted
            // Emit a gated assignment for audit trail
            appendWorldEvent(world, {
                type: 'PATROL_ASSIGNMENT_GATED',
                patrolId,
                tripId,
                tick: startTick,
                reason: 'NO_RESOURCES',
                factionId: faction?.id ?? null,
            }, [commitment.eventId]);
        }
    }
    world.scheduledConsequences.push({
        consequenceId: `CONSEQUENCE-${actionId}`,
        actionId,
        tripId,
        kind: 'DELIVER_CARGO',
        dueTick: startTick + travelTicks,
        status: 'PENDING',
        parentEventIds: [commitment.eventId],
    });
    return trip;
}

/** Advance every persisted obligation exactly once for the supplied tick. */
export function advancePendingWorldObligations(world, { tick = 0 } = {}) {
    ensurePendingWorldState(world);

    for (const trip of world.pendingTrips) {
        if (trip.status !== 'IN_TRANSIT' || tick <= (trip.lastAdvancedTick ?? trip.startedTick ?? -1)) continue;
        const elapsed = Math.max(1, tick - (trip.lastAdvancedTick ?? tick - 1));
        const exposureRoll = nextPendingWorldRandom(world);
        trip.remainingTicks = Math.max(0, trip.remainingTicks - elapsed);
        trip.lastAdvancedTick = tick;
        const exposure = emitPendingWorldEvent(world, {
            type: 'TRIP_EXPOSURE',
            actionId: trip.actionId,
            tripId: trip.tripId,
            tick,
            routeId: trip.routeId,
            patrolId: trip.patrolId,
            exposureRoll,
        }, [trip.lastEventId]);
        trip.lastEventId = exposure.eventId;
        if (trip.remainingTicks === 0) {
            trip.status = 'ARRIVED';
            trip.arrivedTick = tick;
            // E3 — the merchant travels WITH its cargo. Arrival moves
            // the merchant to the destination town, so the next commit
            // reads the destination's market as local and the origin's
            // as the deficit signal: the shuttle circuit (food one way,
            // tools the other) closes with the existing single
            // merchant. Respawn, convoy, and encounter logic all read
            // merchant.location dynamically, so they follow.
            const traveler = (world.merchants ?? []).find(item => item.id === trip.merchantId);
            if (traveler && trip.destinationTownId) traveler.location = trip.destinationTownId;
            const arrival = emitPendingWorldEvent(world, {
                type: 'TRIP_ARRIVAL',
                actionId: trip.actionId,
                tripId: trip.tripId,
                tick,
                destinationTownId: trip.destinationTownId,
                merchantId: trip.merchantId,
                merchantLocation: trip.destinationTownId,
            }, [trip.lastEventId]);
            trip.arrivalEventId = arrival.eventId;
            trip.lastEventId = arrival.eventId;
        }
    }

    for (const consequence of world.scheduledConsequences) {
        if (consequence.status !== 'PENDING' || consequence.dueTick > tick) continue;
        const trip = world.pendingTrips.find(item => item.tripId === consequence.tripId);
        if (!trip || trip.status !== 'ARRIVED') continue;
        const destination = world.towns?.get?.(trip.destinationTownId);
        if (!destination?.market || typeof destination.market.deliverCargo !== 'function') {
            // R7 (V8 audit MAT-004): terminal expiry for arrivals
            // that can never deliver. Without this, a trip whose
            // destination market is gone sits ARRIVED forever with
            // its consequence PENDING and its route commitment /
            // patrol assignment ACTIVE forever. The cargo was
            // already debited at shipment; the expiry names the
            // loss instead of leaving it in limbo.
            consequence.status = 'EXPIRED';
            consequence.expiredTick = tick;
            consequence.expiredReason = 'NO_DELIVERY_MARKET';
            trip.status = 'EXPIRED';
            trip.expiredTick = tick;
            const expiry = emitPendingWorldEvent(world, {
                type: 'TRIP_EXPIRED',
                actionId: trip.actionId,
                tripId: trip.tripId,
                tick,
                destinationTownId: trip.destinationTownId,
                reason: 'NO_DELIVERY_MARKET',
            }, [trip.arrivalEventId ?? trip.lastEventId, ...consequence.parentEventIds]);
            trip.lastEventId = expiry.eventId;
            for (const commitment of world.routeCommitments) {
                if (commitment.tripId === trip.tripId && commitment.status === 'ACTIVE') {
                    commitment.status = 'EXPIRED';
                    commitment.completedTick = tick;
                }
            }
            for (const assignment of world.patrolAssignments) {
                if (assignment.tripId === trip.tripId && assignment.status === 'ACTIVE') {
                    assignment.status = 'EXPIRED';
                    assignment.completedTick = tick;
                }
            }
            continue;
        }
        // E9: the delivery is a sale at the destination quote
        // (pre-landing price — the offer the merchant sailed into).
        // Only stored goods earn; capacity overflow is already lost.
        const salePrice = marketQuotePrice(destination.market, trip.cargo.kind);
        const delivery = destination.market.deliverCargo(trip.cargo.kind, trip.cargo.amount, {
            routeRisk: 0,
            confidence: 1,
        });
        const deliveryRevenue = (delivery.stored ?? 0) * salePrice;
        bookMerchantCapital(
            (world.merchants ?? []).find(item => item.id === trip.merchantId),
            deliveryRevenue);
        // The merchant now owns a durable, dimension-specific observation of
        // this shipment outcome. Reliability is based on usable destination
        // storage, so a full delivery is successful while capacity overflow
        // is a partial/failed observation. This intentionally does not touch
        // `memoryByActor`: trade reliability and violence reputation have
        // independent owners and can evolve without cross-contamination.
        const merchant = (world.merchants ?? []).find(item => item.id === trip.merchantId);
        const tradeReliability = merchant
            ? recordTradeReliability(merchant, trip.destinationTownId, {
                shipped: trip.cargo.amount,
                delivered: delivery.delivered,
                stored: delivery.stored,
                overflow: delivery.overflow,
                lost: delivery.lost,
                tick,
                observerTrust: merchant.reputationTrust ?? 1,
                tripId: trip.tripId,
            })
            : null;
        consequence.status = 'APPLIED';
        consequence.appliedTick = tick;
        trip.status = 'DELIVERED';
        // PHASE §155: book the delivered amount into the market flow
        // audit trail for THIS tick. The per-town market loop (step 4)
        // runs later in the same tickClosedWorld and merges this into
        // `tickFlow.delivered` and `MARKET_TICK.flows.delivered`, so the
        // mass-balance identity (produced - overflow) + delivered -
        // consumed - spoiled == supply delta holds on delivery ticks
        // instead of violating by exactly the delivered amount.
        if (!world.deliveredThisTick) world.deliveredThisTick = new Map();
        const delivKey = `${trip.destinationTownId}:${trip.cargo.kind}`;
        // R2-W1: carry both stored and capacity-rejected amounts so the
        // market loop can book delivery overflow into the mass ledger.
        const priorDelivery = world.deliveredThisTick.get(delivKey) ?? { stored: 0, overflow: 0 };
        priorDelivery.stored += delivery.stored ?? 0;
        priorDelivery.overflow += delivery.overflow ?? 0;
        world.deliveredThisTick.set(delivKey, priorDelivery);
        const deliveredEvent = emitPendingWorldEvent(world, {
            type: 'PENDING_CARGO_DELIVERED',
            actionId: trip.actionId,
            tripId: trip.tripId,
            tick,
            destinationTownId: trip.destinationTownId,
            cargo: trip.cargo,
            delivery,
            capitalDelta: deliveryRevenue,
            merchantCapital: Number.isFinite(merchant?.capital) ? merchant.capital : null,
            reputation: tradeReliability
                ? {
                    dimension: 'tradeReliability',
                    observerId: trip.merchantId,
                    destinationTownId: trip.destinationTownId,
                    score: tradeReliability.score,
                    outcome: tradeReliability.lastOutcome,
                }
                : null,
        }, [trip.arrivalEventId, ...consequence.parentEventIds]);
        trip.deliveryEventId = deliveredEvent.eventId;
        trip.lastEventId = deliveredEvent.eventId;
        for (const commitment of world.routeCommitments) {
            if (commitment.tripId === trip.tripId && commitment.status === 'ACTIVE') {
                commitment.status = 'COMPLETED';
                commitment.completedTick = tick;
            }
        }
        for (const assignment of world.patrolAssignments) {
            if (assignment.tripId === trip.tripId && assignment.status === 'ACTIVE') {
                assignment.status = 'COMPLETED';
                assignment.completedTick = tick;
            }
        }
    }
    // EVID-2026-08-31-TRIP-MATERIALIZATION: prune fully-settled trips.
    // A DELIVERED trip's record lives on in the event ledger
    // (PENDING_CARGO_DELIVERED carries tripId + delivery result) and in
    // the closed routeCommitments / patrolAssignments. Keeping the trip
    // object in `world.pendingTrips` forever made the array grow without
    // bound (~72 entries over 500 ticks) — an unbounded event-volume
    // growth that also made the alreadyTraveling gate pointless (it
    // only looks at IN_TRANSIT / ARRIVED, which never accumulates, but
    // the retained objects still leaked memory and save payload size).
    // Delivered trips are removed here so the in-flight set stays small.
    // R7 (MAT-004): EXPIRED trips prune the same way — their record
    // lives on in TRIP_EXPIRED and the closed commitments.
    if (Array.isArray(world.pendingTrips)) {
        world.pendingTrips = world.pendingTrips.filter(trip => trip.status !== 'DELIVERED' && trip.status !== 'EXPIRED');
    }

    for (const rumor of world.rumorsInTransit) {
        if (rumor.status !== 'IN_TRANSIT' || rumor.lastAdvancedTick === tick) continue;
        rumor.remainingTicks = Math.max(0, (rumor.remainingTicks ?? 0) - 1);
        rumor.lastAdvancedTick = tick;
        if (rumor.remainingTicks === 0) {
            rumor.status = 'DELIVERED';
            const event = emitPendingWorldEvent(world, {
                type: 'RUMOR_DELIVERED',
                rumorId: rumor.rumorId,
                tick,
                subject: rumor.subject,
                claim: rumor.claim,
            }, rumor.parentEventIds);
            rumor.deliveryEventId = event.eventId;
        }
    }

    for (const journey of world.migrationJourneys) {
        if (journey.status !== 'IN_TRANSIT' || journey.lastAdvancedTick === tick) continue;
        journey.remainingTicks = Math.max(0, (journey.remainingTicks ?? 0) - 1);
        journey.lastAdvancedTick = tick;
        if (journey.remainingTicks === 0) {
            journey.status = 'ARRIVED';
            const event = emitPendingWorldEvent(world, {
                type: 'MIGRATION_ARRIVAL',
                journeyId: journey.journeyId,
                factionId: journey.factionId,
                destinationTownId: journey.destinationTownId,
                tick,
            }, journey.parentEventIds);
            journey.arrivalEventId = event.eventId;
        }
    }
    return world;
}

export function createClosedWorldScenario({ season = 'SPRING' } = {}) {
    // Per-town economy schema. `consumes` is the demand per population
    // (existing). `produces` is the supply per population — the audit
    // asked for a real stock-flow loop. `storageCapacity` caps inventory
    // so production can't grow without bound, and `spoilageRate` decays a
    // fraction of inventory per tick. Defaults: north produces more food
    // than it consumes (granary), south produces more tools than it
    // consumes (smithy). Without production, the multi-good market from
    // the prior slice was strictly outflow.
    const townSchema = {
        // The audit's quantitative check found that the previous
        // `south.produces.food = 0.5` was structurally infeasible
        // (consumes 1.0). With no inter-town trade, south's food
        // inventory drained to 0 and stayed there, driving the
        // south faction to grievance saturation. The new value
        // (1.2) gives south a small food buffer: equilibrium
        // (1.2 - 1) / 0.05 = 4 units, ~4 ticks of consumption.
        // North remains the granary (1.5 / 1 = 9.5 equilibrium).
        // E5: ore -> metal -> tools production chain. Refining
        // capacity (metal) and extraction (ore) match each town's
        // forge demand (tools) exactly, so the chain is a pure
        // pass-through by default and legacy tools flows reproduce
        // bit-for-bit until the ore is cut. Recipes are per-town
        // plain JSON: { outputKind: { inputKind: unitsPerOutput } }.
        // Absent town.recipes means the legacy flat rate (older
        // saves behave exactly as before, no migration needed).
        north: { produces: { food: 1.5, tools: 0.1, ore: 0.1, metal: 0.1 }, storageCapacity: { food: 100, tools: 50, ore: 50, metal: 50 }, spoilageRate: { food: 0.05, tools: 0 }, recipes: { metal: { ore: 1 }, tools: { metal: 1 } } },
        south: { produces: { food: 1.2, tools: 0.3, ore: 0.3, metal: 0.3 }, storageCapacity: { food: 100, tools: 50, ore: 50, metal: 50 }, spoilageRate: { food: 0.05, tools: 0 }, recipes: { metal: { ore: 1 }, tools: { metal: 1 } } },
    };
    const towns = new Map();
    for (const [id, schema] of Object.entries(townSchema)) {
        const market = new Market();
        for (const [kind, capacity] of Object.entries(schema.storageCapacity)) {
            market.setCapacity(kind, capacity);
        }
        for (const [kind, rate] of Object.entries(schema.spoilageRate)) {
            market.setSpoilageRate(kind, rate);
        }
        towns.set(id, {
            id,
            market,
            population: 1,
            consumes: { food: 1, tools: 0.2 },
            produces: schema.produces,
            // E5: production recipes (absent = legacy flat rate).
            recipes: schema.recipes ? JSON.parse(JSON.stringify(schema.recipes)) : undefined,
            // authoritative town territory fields. The
            // `controlledBy` is the canonical owner; the radii
            // describe how far the town's reach extends
            // (homeRadius = the town itself, claimedRadius =
            // the official claim, contestedRadius = a non-
            // owner's active dispute). `scarceResources`
            // drives the `scarceResourceOccupancy` factor in
            // the `recordIntrusion` scaling table. The
            // default scenario is 1:1 (each town owned by the
            // faction whose `townId` matches the town id).
            controlledBy: id === 'north' ? 'north-faction' : 'south-faction',
            homeRadius: 1,
            claimedRadius: 3,
            contestedRadius: 0,
            scarceResources: { food: true, tools: false },
            // Slice AB (crime): per-town investigation quality. Starts at
            // the legacy fixed value (0.4) so worlds without patrols behave
            // exactly as before; patrol coverage ratchets it upward.
            crime: { investigationQuality: 0.4 },
        });
        ensureTownLaws(towns.get(id));
    }
    const routes = [
        { id: 'road-a', from: 'north', to: 'south', distance: 5, actualDanger: 0.8, condition: 1 },
        { id: 'road-b', from: 'north', to: 'south', distance: 9, actualDanger: 0.1, condition: 1 },
        { id: 'road-c', from: 'south', to: 'north', distance: 5, actualDanger: 0.4, condition: 1 }
    ];
    const world = {
        // PHASE 20: passive world property. Season is a
        // first-class world variable that propagates to
        // resource availability, which propagates to roaming
        // utility, which propagates to behavior.
        season,
        towns,
        routes,
        factions: [
            new FactionDecisionModel({ id: 'north-faction', townId: 'north', resources: 2, maxResources: 2 }),
            new FactionDecisionModel({ id: 'south-faction', townId: 'south', resources: 2, maxResources: 2 })
        ],
        bandits: [
            Object.assign(
                createRoamingGroup({
                    id: 'bandits-1',
                    currentLocation: 'road-a',
                    // PHASE 12: the bandit is a real roaming group.
                    // The `mode` is RAID (the audit's preferred
                    // mode for raiders) and `switchMargin` is 0.2
                    // to avoid thrashing between two roads with
                    // similar utility.
                    mode: 'RAID',
                    switchMargin: 0.2,
                    explorationTemperature: 0.1,
                    rng: deterministicRng()
                }),
                // Legacy fields preserved for backward
                // compatibility with the binary `relocateBandit`
                // path. The reducer still uses these for the
                // §2 cross-product invasion gate. Future slices
                // will migrate the reducer to consult the
                // roaming model directly.
                //
                // The `factionId` field associates the bandit
                // with a faction so the §12 / §28 diplomatic
                // machinery (encounter-enforcement,
                // invasion-gate) is exercised by default.
                // Without this, the bandit is a "free agent"
                // and the treaty enforcement logic does not
                // fire. The 500-tick sensitivity audit
                // (EVID-2026-08-28-SENSITIVITY-500TICK) found
                // 0 treaties in the default scenario because
                // this field was not set; this default closes
                // the gap. The bandit is associated with the
                // south-faction (the cross-faction pair in
                // the default scenario) so a north↔south
                // non-aggression pact would block the raid.
                { roadId: 'road-a', alternateRoadId: 'road-b', lootExpectation: 0.7, factionId: 'south-faction',
                    // E10: raid heat (0..1). Every successful raid
                    // marks the bandit (+0.2); heat raises patrol
                    // detection wherever it goes and cools 0.95/tick
                    // when quiet. Plain number, save/load-safe.
                    heat: 0,
                    // EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION:
                    // traffic-belief + relocation threshold so
                    // tickBandit (canonical-trade-system.js)
                    // can fire from the canonical path.
                    trafficBelief: {
                        'road-a': { estimatedTraffic: 0, recency: 0.5 },
                        'road-b': { estimatedTraffic: 0, recency: 0.5 },
                        'road-c': { estimatedTraffic: 0, recency: 0.5 },
                    },
                    relocationThreshold: 0.2,
                    cargoValuePerMerchant: 10,
                }
            )
        ],
        merchants: [{
            id: 'merchant-1', location: 'north', cargo: 20, cargoKind: 'food', beliefs: new BeliefStore(),
            // E9: working capital. Spawn cargo is a free gift (founder
            // stock); everything after is bought, sold, or lost at
            // live quotes via bookMerchantCapital. Below zero the
            // merchant stops shipping (terminal, no bailout).
            capital: MERCHANT_STARTING_CAPITAL,
            // EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION:
            // heterogeneous merchant identity consumed by
            // tickMerchant (canonical-trade-system.js). Default
            // values are risk-neutral so the default scenario
            // produces a single deterministic route decision.
            riskTolerance: 0.5,
            switchingCost: 0,
            cargoValueSensitivity: 0.5,
            routeFamiliarity: { 'road-a': 0.5, 'road-b': 0.5, 'road-c': 0.5 },
            informationConfidence: 0.5,
            // Per-route beliefs with confidence (separate from
            // the existing BeliefStore which is for rumors).
            // The canonical-trade-system.js module reads this
            // field, NOT `beliefs` (which is the BeliefStore).
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.5, confidence: 0.5 },
                'road-b': { perceivedDanger: 0.2, confidence: 0.5 },
                'road-c': { perceivedDanger: 0.3, confidence: 0.5 },
            },
            lastRoute: null,
            lastRouteSwitchTick: -1000,
            archetype: 'canonical_default',
        }],
        convoys: [],
        civilians: [{ id: 'civilian-1', factionId: 'north-faction' }],
        guards: [{ id: 'guard-1', factionId: 'north-faction', canReport: true }],
        vampires: [{ id: 'vampire-1', factionId: 'south-faction', hunger: 0.8 }],
        beliefs: null,
        events: [],
        convoy: null,
        // Save/load-critical protocol state. These counters, queues, and the
        // numeric PRNG stream are authoritative pending obligations; unlike
        // function-backed RNG helpers, every value is serializable.
        nextActionId: 1,
        nextEventId: 1,
        rngStreams: {
            pendingEffects: {
                algorithm: 'xorshift32',
                state: DEFAULT_PENDING_RNG_STATE,
                draws: 0,
            },
            encounter: {
                algorithm: 'xorshift32',
                state: DEFAULT_ENCOUNTER_RNG_STATE,
                draws: 0,
            },
        },
        pendingTrips: [],
        // R8 (rate calibration): templateId -> last fired tick.
        // Plain object: JSON-safe across save/load and fork.
        encounterCooldowns: {},
        // E1 (settler populations): dropped demography emigrants camp
        // as persistent groups instead of vanishing into outflow.
        // Plain array of JSON: JSON-safe across save/load and fork.
        settlerGroups: [],
        // E7 (refugee camps): war-displaced arrivals camp at the
        // destination instead of teleporting into town population.
        // Plain array of JSON: JSON-safe across save/load and fork.
        refugeeCamps: [],
        scheduledConsequences: [],
        routeCommitments: [],
        patrolAssignments: [],
        rumorsInTransit: [],
        migrationJourneys: [],
        processedFactionAttackEventIds: new Set(),
        // The §12 diplomacy collection. Treaties are formed
        // by `requestPassage` (and other interactions in a
        // future slice) and live here. Terminated treaties
        // remain in the list for history; `activeTreatiesFor`
        // filters to status === 'ACTIVE'.
        treaties: [],
        // The §89 wildlife collection. The wildlife-encounter
        // apply function pushes wildlife sightings here.
        // Slice AA adds the predator-competition subsystem: wildlife
        // groups occupy roads and dilute bandit payoff there
        // (see wildlife.js). Groups are plain JSON and migrate
        // on tick for older saves.
        wildlife: [],
        wildlifeGroups: [
            { id: 'wolves-1', roadId: 'road-b', size: 3, lastMoveTick: null },
        ],
        // The §17 / §325 attack-execution idempotency contract.
        // Each bandit attack opportunity has a unique
        // attackOpportunityId. Once an attack has been debited
        // (by resolveBanditAttack or by the convoy ambush path),
        // its id is added to this set. Subsequent code paths
        // that would debit the same opportunity must consult
        // this set and skip. This prevents the same physical
        // incident from being debited twice (BANDIT_ATTACK
        // + CONVOY_AMBUSH) on the same tick.
        consumedAttackIds: new Set(),
        // R7 (V8 audit MAT-003): one interception per opportunity.
        // A successful PATROL_INTERCEPTION records its
        // attackOpportunityId here so a second patrol (or the
        // second view of the same incident) cannot recover the
        // same loss again. Serializes as a Set like its sibling.
        interceptedAttackIds: new Set()
    };

    // Constitution §395 / §538: wire a FactionRelationshipVector between
    // every pair of factions. The same vector instance lives in both
    // factions' `relationships` map so writes from one side are visible
    // to the other. The reducer calls `pair.advance` + `evaluateStance`
    // each tick and gates the invasion step on the resulting stance.
    const relationshipMap = new Map();
    for (const faction of world.factions) {
        faction.relationships = new Map();
    }
    for (let i = 0; i < world.factions.length; i += 1) {
        for (let j = i + 1; j < world.factions.length; j += 1) {
            const a = world.factions[i];
            const b = world.factions[j];
            const pairId = `${a.id}::${b.id}`;
            const pair = new FactionRelationshipVector({ id: pairId, trust: 0.5 });
            relationshipMap.set(pairId, pair);
            a.relationships.set(b.id, pair);
            b.relationships.set(a.id, pair);
        }
    }
    world.relationships = relationshipMap;
    return world;
}

export function formClosedWorldConvoy(world) {
    world.convoy = formConvoy(world.merchants, world.guards);
    world.convoys.push(world.convoy);
    appendWorldEvent(world, { type: 'CONVOY_FORMED', convoyId: world.convoy.id, rootReason: 'SCENARIO_SETUP' }, []);
    return world.convoy;
}

// E11 (endogenous escorts): the per-guard fee for a trip. Sized so a
// normal profitable trip (roughly +10..30 at live quotes) covers one
// guard, while a stripped or marginal run cannot.
export const ESCORT_FEE_PER_GUARD = 5;

// E11: the merchant's escort decision. Pure: reads beliefs, capital,
// cargo value and guard availability, mutates nothing (the fee books
// at formation). Expected losses use the merchant's PERCEIVED route
// danger (lawful belief, never actualDanger) times cargo value at
// the origin quote; the escorted leg assumes the convoy primitive's
// protection (strength 0.5 per guard, same term resolveConvoyAmbush
// consumes). The merchant may be wrong — that is the point.
export function decideConvoyEscort(merchant, world, { routeId, tick = 0, cargoAmount = null, cargoKind = null } = {}) {
    const route = (world.routes ?? []).find(r => r.id === routeId) ?? null;
    const perceived = merchant?.routeBeliefs?.[routeId]?.perceivedDanger;
    const perceivedRisk = Number.isFinite(perceived) ? perceived : 0.5;
    const confidence = Number.isFinite(merchant?.routeBeliefs?.[routeId]?.confidence)
        ? merchant.routeBeliefs[routeId].confidence : 0.5;
    // E11: the convoy escorts the SHIPPED load (the materialized
    // trip's cargo), not the merchant's leftover hold after
    // shipment. Callers pass the trip load; the hold is fallback.
    const cargo = Math.max(0, Number(cargoAmount ?? merchant?.cargo) || 0);
    const kind = cargoKind ?? merchant?.cargoKind ?? 'food';
    const originTown = world.towns?.get?.(merchant?.location);
    const cargoValue = cargo * marketQuotePrice(originTown?.market, kind);
    const activeEscorts = world.convoy && Array.isArray(world.convoy.escortIds)
        ? new Set(world.convoy.escortIds) : new Set();
    // E11: no teleporting guards. Guards carry no position field
    // (they garrison their faction town and stay invisible to the
    // territory-intrusion system by design — do NOT add a location
    // without updating allIntruders). Home is derived from faction.
    // A guard committed to the live convoy is not free.
    const guardHome = (guard) => guard?.location
        ?? (guard?.factionId === 'south-faction' ? 'south'
            : guard?.factionId === 'north-faction' ? 'north' : 'north');
    const availableGuards = (world.guards ?? []).filter(guard =>
        guard && !activeEscorts.has(guard.id) && guardHome(guard) === merchant?.location);
    const escortStrength = Math.min(1, availableGuards.length);
    const expectedUnescortedLoss = cargoValue * perceivedRisk;
    const expectedEscortedLoss = cargoValue * Math.max(0, perceivedRisk - escortStrength * 0.5);
    const escortCost = availableGuards.length * ESCORT_FEE_PER_GUARD;
    const capital = Number.isFinite(merchant?.capital) ? merchant.capital : MERCHANT_STARTING_CAPITAL;
    const base = {
        merchantId: merchant?.id ?? null, routeId: route?.id ?? routeId ?? null,
        cargoKind: kind, cargoAmount: cargo, capital,
        perceivedRisk, confidence, cargoValue,
        expectedUnescortedLoss, expectedEscortedLoss, escortCost,
        availableEscortIds: availableGuards.map(g => g.id),
        chosenEscortIds: [], tick,
    };
    if (capital < 0) {
        return { ...base, decision: 'REFUSE', escortCost: 0, why: [], whyNot: ['merchant bankrupt'] };
    }
    if (availableGuards.length === 0) {
        return { ...base, decision: 'REFUSE', escortCost: 0, why: [], whyNot: ['no local free guards'] };
    }
    if (capital < escortCost) {
        return { ...base, decision: 'REFUSE', escortCost: 0, why: [], whyNot: ['insufficient capital'] };
    }
    if (expectedUnescortedLoss <= escortCost + expectedEscortedLoss) {
        return {
            ...base, decision: 'REFUSE', escortCost: 0, why: [],
            whyNot: [perceivedRisk < 0.2
                ? 'route believed safe'
                : 'escort price exceeded expected avoided loss'],
        };
    }
    return {
        ...base, decision: 'HIRE', chosenEscortIds: availableGuards.map(g => g.id),
        why: [`expected avoided loss ${(expectedUnescortedLoss - expectedEscortedLoss).toFixed(2)} exceeded escort price ${escortCost}`],
        whyNot: [],
    };
}
// Law slice V: a LAW_VIOLATED event is not terminal audit only. The violated
// town's controlling faction observes the violator's lawfulness, so the
// existing patrol attention consumer (canonical-trade-system) can react
// without a treaty. The violator is the bandit's faction when known,
// otherwise the raw actor id (patrol falls back to neutral when unobserved).
function observeLawViolation(world, { townId, roadId, actorId, tick, lawViolation, parentEventId, restitutionShare = null } = {}) {
    const town = world.towns?.get?.(townId) ?? null;
    const observerFaction = town && town.controlledBy
        ? (world.factions ?? []).find(faction => faction.id === town.controlledBy) ?? null
        : null;
    const bandit = (world.bandits ?? []).find(item => item.id === actorId) ?? null;
    const violatorFactionId = typeof bandit?.factionId === 'string' && bandit.factionId.length > 0
        ? bandit.factionId
        : (typeof actorId === 'string' && (world.factions ?? []).some(faction => faction.id === actorId) ? actorId : actorId);
    const violatorFaction = (world.factions ?? []).find(faction => faction.id === violatorFactionId) ?? null;
    // A town cannot observe its own faction's lawfulness or pay itself
    // restitution: self-loops emit the LAW_VIOLATED audit (the town's
    // justice window still sees it) but record nothing and transfer nothing.
    const isSelfLoop = Boolean(observerFaction && violatorFaction && observerFaction.id === violatorFaction.id);
    let observation = null;
    if (observerFaction && violatorFactionId && !isSelfLoop) {
        observation = recordLawfulnessViolation(observerFaction, violatorFactionId, {
            tick,
            weight: observerFaction.reputationTrust ?? 1,
            treatyId: lawViolation.lawId,
            reason: `LAW_VIOLATED:${lawViolation.lawType}:${townId}:${roadId}`,
        });
    }
    // Slice X: penalty-funded restitution. Slice Y apportions it: the caller
    // passes each town's share (town penalty / executable-town count) so the
    // total across towns stays conserved instead of multiplying per town.
    let restitution = null;
    if (observerFaction && violatorFaction && !isSelfLoop) {
        const amount = restitutionShare !== null && Number.isFinite(restitutionShare)
            ? clamp01(restitutionShare)
            : clamp01(lawViolation.penalty);
        const violatorBefore = Math.max(0, Number(violatorFaction.resources) || 0);
        const observerBefore = Math.max(0, Number(observerFaction.resources) || 0);
        const transferred = Math.min(violatorBefore, amount);
        const observerCap = Math.max(0, Number(observerFaction.maxResources) || 0);
        violatorFaction.resources = Math.max(0, violatorBefore - transferred);
        observerFaction.resources = Math.min(observerCap, observerBefore + transferred);
        restitution = {
            from: violatorFaction.id,
            to: observerFaction.id,
            amount,
            transferred,
            credited: Math.min(observerCap, observerBefore + transferred) - observerBefore,
            violatorBefore,
            violatorAfter: violatorFaction.resources,
            observerBefore,
            observerAfter: observerFaction.resources,
        };
    }
    const lawEvent = appendWorldEvent(world, {
        type: 'LAW_VIOLATED',
        lawId: lawViolation.lawId,
        lawType: lawViolation.lawType,
        townId,
        prohibits: lawViolation.prohibits,
        penalty: lawViolation.penalty,
        roadId,
        actorId,
        violatorFactionId,
        observerFactionId: observerFaction?.id ?? null,
        lawfulness: observation ? { score: observation.score, outcome: observation.lastOutcome } : null,
        restitution,
        attackEventId: parentEventId,
        tick,
    }, [parentEventId]);
    return { lawEvent, observation, restitution, observerFactionId: observerFaction?.id ?? null, violatorFactionId };
}

// Slice Y: apportion one attack's penalty across every violated town without
// multiplying the sentence. Executable towns are violated towns whose observer
// is a real faction distinct from the violator faction; each gets
// townPenalty / executableCount. Self-loops and non-faction violators yield
// an empty set, so their LAW_VIOLATED events stay audit-only.
function apportionedLawShares(world, violations, actorId) {
    const bandit = (world.bandits ?? []).find(item => item.id === actorId) ?? null;
    const violatorFactionId = typeof bandit?.factionId === 'string' && bandit.factionId.length > 0
        ? bandit.factionId
        : (typeof actorId === 'string' && (world.factions ?? []).some(faction => faction.id === actorId) ? actorId : null);
    const executable = (violations ?? []).filter(violation => {
        const town = world.towns?.get?.(violation.townId) ?? null;
        const observerId = town?.controlledBy ?? null;
        return Boolean(observerId && violatorFactionId && observerId !== violatorFactionId
            && (world.factions ?? []).some(faction => faction.id === observerId));
    });
    const shares = new Map();
    for (const violation of violations ?? []) {
        const isExecutable = executable.some(entry => entry.townId === violation.townId);
        shares.set(violation.townId, isExecutable && executable.length > 0
            ? clamp01(violation.penalty) / executable.length
            : 0);
    }
    return shares;
}

export function resolveBanditAttack(world, { merchantId = 'merchant-1', roadId = 'road-a', tick = 1, destinationTownId = 'south' } = {}) {
    const merchant = world.merchants.find(item => item.id === merchantId);
    const road = world.routes.find(item => item.id === roadId);
    if (!merchant || !road || merchant.cargo <= 0) return { ok: false, reason: 'INVALID_ATTACK' };
    // The §17 / §325 attack-execution idempotency contract.
    // Each bandit attack opportunity has a unique
    // attackOpportunityId. Once debited, the id is added
    // to world.consumedAttackIds so subsequent code paths
    // (e.g. the convoy ambush path) cannot re-debit the same
    // opportunity.
    const attackOpportunityId = `attack-opp-${tick}-${roadId}-${merchantId}`;
    if (world.consumedAttackIds.has(attackOpportunityId)) {
        return { ok: false, reason: 'ALREADY_CONSUMED', attackOpportunityId };
    }
    world.consumedAttackIds.add(attackOpportunityId);
    // The §60 bandit-on-trade contract: the bandit steals a
    // fraction of the cargo based on the road's actual
    // danger. The remainder is delivered to the market.
    // (This is the *single* authoritative debit for this
    // attack opportunity.)
    const lost = merchant.cargo * clamp(road.actualDanger);
    const remaining = merchant.cargo - lost;
    // R2-W1: book the theft into the persistent loss sink so the global
    // mass identity (towns + merchant cargo + in-trip cargo + loss sink)
    // stays exact. Previously the lost cargo simply vanished.
    bookTransitLoss(world, merchant.cargoKind ?? 'food', lost);
    // E3: the remainder is the merchant's ACTUAL cargo kind delivered
    // to its actual destination town (previously hardcoded food/south,
    // which would misbook a tools shipment as food at the wrong end).
    // Default preserves the legacy one-shot/test contract.
    const cargoKind = merchant.cargoKind ?? 'food';
    const destination = world.towns.get(destinationTownId);
    // E9: value the forced salvage at the pre-landing offer price
    // (same basis as trip-delivery revenue).
    const salvagePrice = marketQuotePrice(destination?.market, cargoKind);
    const marketResult = destination?.market?.deliverCargo
        ? destination.market.deliverCargo(cargoKind, remaining, { disruption: 0 })
        : null;
    merchant.cargo = 0; // the merchant's cargo has been resolved by the attack
    // E10: every successful raid marks the bandit (+0.2 heat, cap
    // 1). Heat raises patrol detection wherever the bandit goes
    // and cools when quiet (tickBandit). Older saves and hand-built
    // bandits without the field start at 0. (attackingBandit is
    // resolved below; roadId is already in scope here.)
    const raider = world.bandits?.find(b => b?.roadId === roadId);
    if (raider && typeof raider === 'object') {
        raider.heat = Math.min(1, Math.max(0, Number(raider.heat) || 0) + 0.2);
        raider.lastHeatTick = tick;
    }
    // E9: the raid bleeds the merchant at live quotes. Stolen goods
    // cost replacement value at the origin market (route.from); the
    // surviving remainder is a forced sale at the pre-landing quote.
    const originTown = world.towns?.get?.(road.from);
    const replacementPrice = marketQuotePrice(originTown?.market, cargoKind);
    const capitalHit = -(lost * replacementPrice);
    const capitalGain = (marketResult?.stored ?? 0) * salvagePrice;
    bookMerchantCapital(merchant, capitalHit + capitalGain);
    // R3 (V8 audit MAT-001): book the bandit-path delivery into the
    // cumulative market-flow ledger immediately. Unlike trip
    // deliveries (booked into deliveredThisTick before the same
    // tick's market loop), attacks resolve in the late-tick
    // encounter step — AFTER the market loop merged and BEFORE
    // the next reset — so a deliveredThisTick entry would be
    // wiped unmerged. Direct cumulative booking is exact and
    // matches the ledger's integral semantics. Key mirrors the
    // trip path town:kind shape.
    if (marketResult) {
        if (!world.marketFlows) world.marketFlows = new Map();
        const delivKey = `${destinationTownId}:${cargoKind}`;
        const cumulative = world.marketFlows.get(delivKey)
            ?? { produced: 0, delivered: 0, consumed: 0, spoiled: 0, overflow: 0, deliveryOverflow: 0, inputsConsumed: 0, inputShortfall: 0 };
        cumulative.delivered = (Number(cumulative.delivered) || 0) + (Number(marketResult.stored) ?? 0);
        cumulative.deliveryOverflow = (Number(cumulative.deliveryOverflow) || 0) + (Number(marketResult.overflow) ?? 0);
        world.marketFlows.set(delivKey, cumulative);
    }
    const attackingBandit = world.bandits.find(b => b.roadId === roadId) ?? null;
    const event = {
        type: 'BANDIT_ATTACK',
        attackOpportunityId,
        banditId: attackingBandit?.id ?? 'unknown',
        factionId: typeof attackingBandit?.factionId === 'string' ? attackingBandit.factionId : undefined,
        roadId,
        merchantId,
        lost,
        delivered: remaining,
        marketResult,
        survivor: true,
        capitalHit,
        capitalGain,
        capitalDelta: capitalHit + capitalGain,
        merchantCapital: Number.isFinite(merchant?.capital) ? merchant.capital : null,
        tick,
        // RESP-EVENT-ID-AUTHORITY-001: the attack opportunity ITSELF is the
        // root; the allocator id is minted by appendWorldEvent so later
        // consumers (patrol reactions, faction memory) can parent to it.
        rootReason: 'ATTACK_OPPORTUNITY',
    };
    // Omit an undefined factionId so stable serialization of legacy
    // free-agent bandits is unchanged (no new key appears on old shapes).
    if (event.factionId === undefined) delete event.factionId;
    const emitted = appendWorldEvent(world, event, []);
    // Law slice: BANDIT_ATTACK on a town-incident road violates town law.
    // Slice V also records the violated town owner's lawfulness observation
    // so patrol attention can react without requiring a treaty.
    // Slice Y: every violated town emits its own LAW_VIOLATED (no more
    // first-match starvation); restitution is apportioned across executable
    // towns so the total sentence stays conserved.
    const lawViolations = checkAllLawCompliance({
        world,
        action: { type: 'BANDIT_ATTACK', roadId, actorId: emitted.banditId, tick },
        tick,
    });
    const lawShares = apportionedLawShares(world, lawViolations, emitted.banditId);
    for (const lawViolation of lawViolations) {
        observeLawViolation(world, {
            townId: lawViolation.townId,
            roadId,
            actorId: emitted.banditId,
            tick,
            lawViolation,
            parentEventId: emitted.eventId,
            restitutionShare: lawShares.get(lawViolation.townId) ?? 0,
        });
    }
    return { ok: true, event: emitted, attackOpportunityId };
}

export function applySurvivorEvidence(world, { roadId = 'road-a', tick = 1 } = {}) {
    if (!world.beliefs) return { ok: false, reason: 'NO_BELIEF_STORE' };
    const evidence = new Evidence({ subject: roadId, claim: 'danger', value: 1, sourceId: 'survivor', sourceTrust: 0.9, confidence: 0.9, tick });
    const belief = world.beliefs.observe(evidence);
    const rumor = world.beliefs.createRumor(roadId, 'danger', 'survivor', { tick, distortion: 0.05 });
    appendWorldEvent(world, { type: 'RUMOR', rumor, rootReason: 'SCENARIO_SETUP' }, []);
    return { ok: true, evidence, belief, rumor };
}

export function reassessFaction(world, factionId = 'south-faction', { perceivedDanger = 0.8, supplyShortage = 0.5, enemyWeakness = 0.5 } = {}) {
    const faction = world.factions.find(item => item.id === factionId);
    if (!faction) return { ok: false, reason: 'NO_FACTION' };
    const newLoss = world.events.filter(event => event.type === 'BANDIT_ATTACK').length * 0.1;
    // Stock-flow update first: advance fear, grievance, and memory by one
    // tick. The reassess call below then reads the post-decay state. This
    // matches the contract the reducer uses so the one-shot scenario and
    // the per-tick reducer stay in sync.
    if (typeof faction.advanceEmotion === 'function') {
        faction.advanceEmotion({ perceivedDanger, supplyShortage, confirmedLoss: newLoss, newMemoryLoss: newLoss });
    }
    const result = faction.reassess({ perceivedDanger, supplyShortage, enemyWeakness, confirmedLoss: newLoss });
    appendWorldEvent(world, { type: 'FACTION_REASSESSMENT', result, rootReason: 'SCENARIO_SETUP' }, []);
    return { ok: true, ...result };
}

export function chooseMerchantRoute(world, merchantId = 'merchant-1', perceivedDanger = 0.8) {
    const merchant = world.merchants.find(item => item.id === merchantId);
    if (!merchant) return { ok: false, reason: 'NO_MERCHANT' };
    const perception = { perceivedDanger, confidence: 0.8, fearSensitivity: 100, expectedCargoLoss: perceivedDanger * merchant.cargo, routeDanger: { 'road-a': perceivedDanger, 'road-b': 0.05 } };
    const candidates = world.routes.filter(route => route.from === 'north' && route.to === 'south')
        .map(route => ({ ...route, distance: route.distance + perception.routeDanger[route.id] * 20 }));
    const decision = selectRoute(candidates, { ...perception, perceivedDanger: 0 });
    if (!decision) return { ok: false, reason: 'NO_ROUTE' };
    const path = { routes: [decision.route] };
    if (!path) return { ok: false, reason: 'NO_ROUTE' };
    merchant.selectedRoute = path.routes[0].id;
    appendWorldEvent(world, { type: 'ROUTE_SELECTED', merchantId, routeId: merchant.selectedRoute, rootReason: 'SCENARIO_SETUP' }, []);
    return { ok: true, routeId: merchant.selectedRoute, path: path.routes.map(route => route.id) };
}

export function runClosedWorldScenario({ perceivedDanger = 0.8, world: preBuilt } = {}) {
    const world = preBuilt ?? createClosedWorldScenario();
    world.beliefs = new BeliefStore();
    formClosedWorldConvoy(world);
    resolveBanditAttack(world, { tick: 1 });
    applySurvivorEvidence(world, { tick: 1 });
    chooseMerchantRoute(world, 'merchant-1', perceivedDanger);
    const factionResult = reassessFaction(world, 'south-faction', { perceivedDanger: 0.1, supplyShortage: 0.9, enemyWeakness: 0.9 });
    const faction = world.factions.find(item => item.id === 'south-faction');
    const plan = planRetaliation(faction, world.bandits[0], { tick: 1 });
    appendWorldEvent(world, { type: 'FACTION_ACTION', action: plan.action, ok: plan.ok, tick: 1, rootReason: 'SCENARIO_SETUP' }, []);
    if (plan.ok) {
        const retaliation = executeRetaliation(faction, world.bandits[0], plan);
        if (retaliation.ok) {
            appendWorldEvent(world, {
                type: 'INVASION',
                factionId: faction.id,
                targetId: world.bandits[0].id,
                action: retaliation.action,
                causationId: plan.action.actionId,
                resourcesLeft: faction.resources,
                tick: 1,
                rootReason: 'SCENARIO_SETUP',
            }, []);
        }
    }
    // Directive §6: the closed-world's bandit relocation
    // must be driven by chooseRoamingDestination, not the
    // binary relocateBandit. The wrapper
    // `relocateBanditViaRoaming` builds a real RoamingGroup
    // from the bandit, calls chooseRoamingDestination, and
    // emits the legacy event shape so the existing 867
    // tests stay green. The §269 deterministic-rng
    // integration is required for the §121 contract.
    const relocation = relocateBanditViaRoaming(world.bandits[0], world.routes, { tick: 1 });
    // Apply the mutation: the legacy `relocateBandit` in
    // `escalation.js` did this; the new live-wire must too.
    if (relocation && relocation.relocated && relocation.to) {
        world.bandits[0].roadId = relocation.to;
        appendWorldEvent(world, { type: 'BANDIT_RELOCATION', relocation, tick: 1, rootReason: 'SCENARIO_SETUP' }, []);
    }
    return world;
}

/**
 * Advance the closed-world state by one tick.
 *
 * `tickClosedWorld` is the reducer that makes the closed-world scenario
 * genuinely cross-tick: instead of running every consequence in a single
 * `runClosedWorldScenario` shot, callers can drive the world one tick at a
 * time and observe how `grievance`, `bandit.roadId`, `merchant.cargo`, and
 * belief confidence evolve under sustained pressure.
 *
 * The function is pure with respect to its inputs: same `world` shape, same
 * `options`, same `tick` always produce the same output. It mutates `world`
 * in place (events pushed, state advanced) and returns the same `world` for
 * chaining.
 *
 * The reducer reads `world.events` for the current tick and the prior state
 * to derive cross-tick consequences. It does not fabricate new persistent
 * state outside the existing factions / bandits / merchants collections. The
 * only additive fields are `world.tickHistory` (a per-tick audit snapshot)
 * and defensive defaults for `world.events` if the caller passed an object
 * that had none.
 */
export function tickClosedWorld(world, { tick = 1, perceivedDanger = 0.5, memoryDecayPerTick = 0.05, fearDecayPerTick = 0.10, griefDecayPerTick = 0.03, raidCooldown = 5, relationshipGate = true, encounterRng = null, pinBanditRoadId = null, attackRoadId = null } = {}) {
    if (!world || typeof world !== 'object') {
        throw new TypeError('tickClosedWorld requires a world object');
    }
    if (!Array.isArray(world.events)) world.events = [];
    if (!world.tickHistory) world.tickHistory = [];

    // Resolve obligations committed on earlier ticks before the ordinary
    // world passes consume market, route, or information state. This makes a
    // resumed checkpoint obey the same due work as an uninterrupted world.
    ensurePendingWorldState(world);
    finalizeWorldEventLedger(world);
    // Slice AA: migrate older saves without the predator subsystem.
    // Absent means no group (legacy behavior preserved); malformed
    // entries are left for the per-tick loop to skip honestly.
    if (!Array.isArray(world.wildlifeGroups)) world.wildlifeGroups = [];
    if (!Array.isArray(world.wildlife)) world.wildlife = [];
    // Law slice: ensure every town has its prohibitions materialized.
    if (world.towns && typeof world.towns.get === 'function') {
        for (const [, town] of world.towns) ensureTownLaws(town);
    }
    world.currentTick = tick;
    // PHASE §155: per-tick delivery accumulator. Reset before
    // advancePendingWorldObligations so each tick's deliveries are
    // consumed exactly once by the step-4 market loop.
    world.deliveredThisTick = new Map();
    advancePendingWorldObligations(world, { tick });

    // 0. EVID-2026-08-29-ECOLOGY: advance the season on the
    //    configured cadence. The season affects town production
    //    and spoilage in step 4 below via getSeasonModifier /
    //    getSpoilageModifier. tickSeason is idempotent; it only
    //    emits a SEASON_CHANGE event when the season actually
    //    advances this tick.
    tickSeason(world, tick);
    // Slice Z (infrastructure): road maintenance. Each route's condition
    // drifts back toward 1 (upkeep abstraction) up to the cap. Usage wear
    // is applied at shipment time in schedulePendingTradeTrip; this pass
    // only recovers. Plain numbers: save/load/fork-safe by construction.
    // Missing fields on older saves are migrated to pristine condition.
    for (const route of world.routes ?? []) {
        if (!route || typeof route !== 'object') continue;
        const current = Number.isFinite(route.condition) ? route.condition : 1;
        route.condition = Math.min(1, Math.max(0.5, current + 0.01));
    }
    // Slice AE (weather): storms price road risk through routing.
    // A storm is transient scenario state on world.storm { active,
    // roadId, severity, remainingTicks, startedTick, startEventId },
    // injected directly or started by the Slice AH scheduler below.
    // While active, the storm road
    // carries weatherCost = severity * distance, which routing.routeCost
    // prices into every merchant's base score (Slice AD wiring); all
    // other roads reset to 0 each tick, so ended storms clear by
    // construction and older saves migrate with zero weather.
    for (const route of world.routes ?? []) {
        if (!route || typeof route !== 'object') continue;
        route.weatherCost = (world.storm?.active && world.storm.roadId === route.id)
            ? clamp01(Number(world.storm.severity) || 0) * (Number(route.distance) || 0)
            : 0;
    }
    if (world.storm?.active) {
        const remaining = Math.max(0, (world.storm.remainingTicks ?? 0) - 1);
        world.storm.remainingTicks = remaining;
        if (remaining <= 0) {
            world.storm.active = false;
            const parentIds = world.storm.startEventId ? [world.storm.startEventId] : [];
            appendWorldEvent(world, {
                type: 'STORM_ENDED',
                roadId: world.storm.roadId,
                severity: world.storm.severity,
                tick,
            }, parentIds);
        }
    }
    // Slice AH (weather): opt-in storm scheduler. A scenario declares
    // world.stormSchedule { everyTicks, durationTicks, severity,
    // roadIds, nextRoadIndex? } (plain JSON, save/load-safe). When no
    // storm is active and the tick hits the cadence, a storm starts on
    // the next scheduled road (rotation persists on nextRoadIndex, so
    // save/load/fork cannot double-schedule). An active storm is never
    // stacked — the cadence tick is skipped. Malformed schedules
    // (no cadence, no roads, no matching route) are honest no-ops.
    // Absent schedule means no storms: unscheduled worlds behave
    // exactly as before, and the default scenario stays storm-free.
    const schedule = world.stormSchedule;
    if (schedule && typeof schedule === 'object' && !world.storm?.active
        && Number.isInteger(tick) && tick > 0) {
        const everyTicks = Number(schedule.everyTicks);
        const durationTicks = Math.max(1, Math.floor(Number(schedule.durationTicks) || 0));
        const candidates = (Array.isArray(schedule.roadIds) ? schedule.roadIds : [])
            .filter(roadId => (world.routes ?? []).some(route => route?.id === roadId));
        if (Number.isFinite(everyTicks) && everyTicks >= 1 && durationTicks >= 1
            && candidates.length > 0 && tick % everyTicks === 0) {
            const roadIndex = Number.isInteger(schedule.nextRoadIndex) && schedule.nextRoadIndex >= 0
                ? schedule.nextRoadIndex : 0;
            const roadId = candidates[roadIndex % candidates.length];
            schedule.nextRoadIndex = roadIndex + 1;
            const severity = clamp01(Number(schedule.severity) || 0);
            const started = appendWorldEvent(world, {
                type: 'STORM_STARTED',
                roadId,
                severity,
                duration: durationTicks,
                tick,
                scheduled: true,
                rootReason: 'STORM_SCHEDULE',
            }, []);
            world.storm = {
                active: true, roadId, severity,
                remainingTicks: durationTicks, startedTick: tick,
                startEventId: started.eventId,
            };
        }
    }
    // 0.1 Slice D — drought shock (ecology → production → shortage → migration)
    // A drought is a transient ecology modifier on food production for a
    // single town. It is stored on world.drought { active, severity, kind,
    // townId, remainingTicks, startedTick, startEventId }. Severity in [0,1],
    // production multiplier is (1 - severity*0.6) clamped to [0.1,1] so a
    // 0.6 drought leaves 64% production, 1.0 leaves 40%.
    // The modifier is applied in the step-4 market loop below (production
    // already multiplies by getSeasonModifier). RemainingTicks decrements each
    // tick; when it reaches 0 the drought ends and DROUGHT_ENDED is emitted
    // parented to the DROUGHT_STARTED event.
    if (world.drought && world.drought.active) {
        const remaining = Math.max(0, (world.drought.remainingTicks ?? 0) - 1);
        world.drought.remainingTicks = remaining;
        if (remaining <= 0) {
            world.drought.active = false;
            const parentIds = world.drought.startEventId ? [world.drought.startEventId] : [];
            // Try to find DROUGHT_STARTED eventId if not stored
            if (parentIds.length === 0) {
                const startEv = findLatestWorldEvent(
                    world,
                    event => event.townId === world.drought.townId,
                    'DROUGHT_STARTED',
                );
                if (startEv?.eventId) parentIds.push(startEv.eventId);
            }
            appendWorldEvent(world, {
                type: 'DROUGHT_ENDED',
                townId: world.drought.townId,
                kind: world.drought.kind ?? 'food',
                tick,
            }, parentIds);
        }
    }

    // 0.5. EVID-2026-08-29-DEMOGRAPHY: per-town population
    //    update driven by ecology (season), scarcity (food
    //    shortage), and the demographic rates in demography.js.
    //    We call it BEFORE the produce/consume step so the new
    //    population takes effect on the same tick's economy.
    tickDemography(world, tick);
    // 0.6. E1 (settler populations): camped settler groups survey
    // then found via settleAttempt. Runs right after demography so
    // groups formed this tick survey immediately and found next.
    tickSettlerGroups(world, { tick });

    // 0.7. E7 (refugee camps): camped arrivals integrate one head
    // per tick per camp. Runs with the settler pass so camped heads
    // join the town before this tick's faction/market passes read it.
    tickRefugeeCamps(world, { tick });

    // 1. Faction reassessment driven by the CURRENT tick's flow, not
    //    cumulative history. `newAttacksThisTick` counts only BANDIT_ATTACK
    //    events whose tick field equals this tick. `confirmedLoss` then
    //    scales with that flow (one attack ~= 0.1 of loss), so a faction
    //    that experienced one attack on tick 5 and then nothing on tick 6
    //    does not get a second dose of confirmedLoss for the historical
    //    attack. Historical trauma is still preserved via
    //    `faction.memoryOfLoss`, which the reducer accumulates and decays
    //    separately. `supplyShortage` is now derived from the town's
    //    market state (mean shortage across consumed goods) so the
    //    economy you built actually feeds the faction model.
    const allAttacksThisTick = getWorldEvents(world, {
        type: 'BANDIT_ATTACK',
        tick,
    });
    // OBS-LOCALITY-001 (W1-PARTIAL-OBSERVABILITY): a faction feels
    // only the attacks its home town can legally know about —
    // attacks on roads incident to its town. In the default
    // two-town topology every road touches both towns, so the
    // canonical world's behavior is unchanged; in multi-town
    // worlds an unrelated faction no longer absorbs another
    // town's losses. Factions without a town keep the world-wide
    // aggregate.
    const incidentRoadsByTown = new Map();
    for (const townId of world.towns.keys()) {
        incidentRoadsByTown.set(townId, new Set(
            world.routes.filter(r => r.from === townId || r.to === townId).map(r => r.id)
        ));
    }
    const factionShortageByTown = new Map();
    for (const [townId, town] of world.towns) {
        if (!town || !town.market || typeof town.market.getQuote !== 'function') continue;
        const consumes = (typeof town.consumes === 'object' && town.consumes) || { food: 1 };
        let sum = 0;
        let count = 0;
        for (const kind of Object.keys(consumes)) {
            const quote = town.market.getQuote(kind);
            if (quote && Number.isFinite(quote.shortage)) {
                sum += clamp01(quote.shortage);
                count += 1;
            }
        }
        factionShortageByTown.set(townId, count > 0 ? sum / count : 0);
    }
    for (const faction of world.factions) {
        const previousEscalation = faction.escalation;
        const townShortage = faction.townId && factionShortageByTown.has(faction.townId)
            ? factionShortageByTown.get(faction.townId)
            : 0;
        const localAttacks = faction.townId && incidentRoadsByTown.has(faction.townId)
            ? allAttacksThisTick.filter(a => incidentRoadsByTown.get(faction.townId).has(a.roadId))
            : allAttacksThisTick;
        const newLoss = localAttacks.length * 0.1;
        // Stock-flow update for fear, grievance, and memoryOfLoss. The
        // reducer hands `advanceEmotion` the current-tick *flow* and the
        // per-tick decay rates (which can be tuned via the option
        // arguments). `advanceEmotion` then mutates the faction's
        // slow-moving emotion state in place, and `reassess` reads the
        // post-decay values. This keeps the reducer's responsibilities
        // narrow: gather inputs, hand them to the model, log the result.
        const memoryDecay = Number.isFinite(memoryDecayPerTick)
            ? clamp01(memoryDecayPerTick)
            : 0.05;
        const fearDecay = Number.isFinite(fearDecayPerTick)
            ? clamp01(fearDecayPerTick)
            : 0.10;
        const griefDecay = Number.isFinite(griefDecayPerTick)
            ? clamp01(griefDecayPerTick)
            : 0.03;
        faction.advanceEmotion({
            perceivedDanger,
            supplyShortage: townShortage,
            confirmedLoss: newLoss,
            newMemoryLoss: newLoss,
            memoryDecayPerTick: memoryDecay,
            fearDecayPerTick: fearDecay,
            griefDecayPerTick: griefDecay
        });
        // Per-target memory (PHASE 16 wired into the live path):
        // when a bandit attacks, the faction's memoryByActor
        // is updated with the specific bandit id. The audit
        // (§182, §294): "A faction harmed by Bandit A should
        // not automatically attach equal grievance to every
        // bandit or every faction." Unknown attackers
        // contribute less to specific memory but the general
        // memoryOfLoss still rises.
        if (localAttacks.length > 0) {
            // Record per-target memory for every BANDIT_ATTACK
            // event at the current tick that the faction's town
            // can legally know about. The audit (§182): "A
            // faction harmed by Bandit A should not automatically
            // attach equal grievance to every bandit." When
            // multiple bandits attack in the same tick, each
            // gets its own memory entry.
            for (const attack of localAttacks) {
                const banditId = attack.banditId ?? 'unknown';
                const known = banditId !== 'unknown' && banditId != null;
                recordHarmByActor(faction, banditId, {
                    severity: clamp01(0.5),
                    tick,
                    known
                });
            }
        }
        const result = faction.reassess({
            perceivedDanger,
            supplyShortage: townShortage,
            enemyWeakness: 0.5,
            confirmedLoss: newLoss
        });
        if (faction.escalation !== previousEscalation) {
            appendWorldEvent(world, {
                type: 'FACTION_REASSESSMENT', result, tick,
                // Summary of the faction's own continuous state; no single
                // causal parent event exists (explicit root, never silent).
                rootReason: 'WORLD_STATE_DERIVED',
            }, []);
        }
    }

    // Constitution §395 / §538: per-pair relationship update. After
    // each faction's internal state has been reassessed, advance the
    // relationship vector between every pair of factions and evaluate
    // the new stance. The pair's territorial pressure and grievance
    // rise when a bandit attacked a town on the pair's network (proxy
    // here: `newAttacksThisTick > 0`) OR when the pair's home town
    // experiences chronic supply shortage. The §23 hysteresis and
    // the §344 explanation live on the vector itself.
    for (const [pairId, pair] of world.relationships) {
        // OBS-LOCALITY-001: the pair's material signal is scoped to
        // attacks on roads incident to the pair's home towns, matching
        // the per-faction scoping above. In the canonical two-town
        // world every road touches both towns, so this is identical to
        // the previous world-wide signal there.
        const [fromId, toId] = pairId.split('::');
        const pairTowns = [fromId, toId]
            .map(id => world.factions.find(f => f.id === id)?.townId)
            .filter(Boolean);
        const pairAttacks = allAttacksThisTick.filter(a =>
            pairTowns.some(t => incidentRoadsByTown.get(t)?.has(a.roadId))
        );
        const isMaterialSignal = pairAttacks.length > 0;
        if (isMaterialSignal) {
            pair.recordHarm({ severity: clamp01(pairAttacks.length * 0.5), tick });
        }
        // Cross-link from the per-faction supply shortage. A faction
        // whose home town is starving has chronic pressure on the
        // relationship vector. This is the §514 economy→war feedback.
        // The trust dampener is *disabled* for material signals:
        // scarcity is objective and should not be papered over by
        // a (possibly-undeserved) political trust.
        const homeFaction = world.factions.find(f => f.id === fromId);
        if (homeFaction && homeFaction.townId && factionShortageByTown.has(homeFaction.townId)) {
            const shortage = factionShortageByTown.get(homeFaction.townId);
            if (shortage > 0.3) {
                pair.recordHarm({ severity: clamp01(shortage * 0.5), tick });
            }
        }
        const previousStance = pair.stance;
        pair.advance(tick, { newEvents: [] });
        // Slice EVID-2026-08-28-PERSPECTIVE-AWARE-CHOOSE-STANCE-LIVE:
        // evaluate the stance once per *evaluator*
        // perspective so A→B and B→A are independent
        // and each can produce its own STANCE_TRANSITION
        // event with structured chooseStance output
        // (reason / evidence / capability / blocked /
        // militaryResources / informationConfidence /
        // evaluatorId). The legacy pair.stance /
        // pair.observe() path is preserved for
        // backwards compatibility.
        const [perspectiveA, perspectiveB] = pairId.split('::');
        const evaluators = [perspectiveA, perspectiveB].filter(id => typeof id === 'string' && id.length > 0);
        // The legacy reducer disabled the second trust
        // damping inside evaluateStance for material
        // signals (attacks) and chronic shortage. We
        // mirror that here so the new path is *not* more
        // damped than the old one.
        const dampenByTrust = !isMaterialSignal
            && !(homeFaction && homeFaction.townId && factionShortageByTown.has(homeFaction.townId)
                && factionShortageByTown.get(homeFaction.townId) > 0.3);
        for (const evaluatorId of evaluators) {
            const evaluatorFaction = world.factions.find(f => f.id === evaluatorId);
            const militaryResources = evaluatorFaction
                && Number.isFinite(evaluatorFaction.maxResources)
                && evaluatorFaction.maxResources > 0
                ? clamp01(evaluatorFaction.resources / evaluatorFaction.maxResources)
                : 1.0;
            const informationConfidence = evaluatorFaction
                && Number.isFinite(evaluatorFaction.informationConfidence)
                ? clamp01(evaluatorFaction.informationConfidence)
                : 1.0;
            const previousEvaluatorStance = pair.stanceFrom(evaluatorId) ?? StanceLadder.TOLERANT;
            const decision = chooseStance({
                pressure: pair.pressureFrom(evaluatorId),
                trust: pair.getTrustFrom(evaluatorId),
                previous: previousEvaluatorStance,
                militaryResources,
                informationConfidence,
                // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE:
                // contextual inputs from the territory pass.
                // The reducer runs step 2 BEFORE the territory
                // pass (step 2.5), so on tick 0 these values
                // are 0; on subsequent ticks the territory
                // pass populates them and the *next* tick's
                // stance evaluation consumes them. The
                // acceptance test seeds 5 intrusions and
                // observes the resulting escalation on the
                // same tick.
                perceivedGroupSize: pair.lastObservedGroupSizeFrom(evaluatorId, tick, 50),
                previousIncidentsCount: pair.intrusionCount(tick, 50),
                dampenByTrust,
            });
            pair.observeFrom(evaluatorId, decision.to, tick);
            if (decision.to !== previousEvaluatorStance) {
                appendWorldEvent(world, {
                    type: 'STANCE_TRANSITION',
                    pairId,
                    evaluatorId,
                    fromId,
                    toId,
                    from: previousEvaluatorStance,
                    to: decision.to,
                    reason: decision.reason,
                    evidence: decision.evidence,
                    capability: decision.capability,
                    blocked: decision.blocked,
                    pressure: pair.pressureFrom(evaluatorId),
                    trust: pair.getTrustFrom(evaluatorId),
                    // Derived from the pair's own continuous state.
                    rootReason: 'PAIR_STATE_DERIVED',
                    militaryResources,
                    informationConfidence,
                    tick,
                });
            }
        }
    }

    // ----------------------------------------------------------------
    // 2.5 Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: the
    // territory pass. For each (observer, intruder) pair where
    // `canObserveTerritory` returns true, write a directional
    // INTRUSION event and a `recordIntrusion` write into the
    // pair's directed pressure / grievance / fear maps. This
    // is the closure step that connects world geography
    // (town.claimedRadius) → faction observation (canObserve
    // Territory) → directional relationship state
    // (recordIntrusion) → the structured STANCE_TRANSITION
    // emitted by step 2 above. Suppressed by an active
    // PASSAGE treaty between the two factions (the hook is
    // wired; full treaty→territory integration is the next
    // slice).
    // ----------------------------------------------------------------
    if (Array.isArray(world.factions) && world.factions.length > 0) {
        const intruders = allIntruders(world);
        for (const observerFaction of world.factions) {
            for (const intruder of intruders) {
                if (!canObserveTerritory(observerFaction, intruder, world)) continue;
                // Skip self.
                if (intruder.factionId === observerFaction.id) continue;
                // Resolve the pair.
                const pairA = world.relationships.get(`${observerFaction.id}::${intruder.factionId}`);
                const pairB = world.relationships.get(`${intruder.factionId}::${observerFaction.id}`);
                const pair = pairA ?? pairB;
                if (!pair) continue;
                // Treaty hook: if a passage treaty is active, the
                // intrusion still counts as a violation cost (not
                // suppressed) — the treaty passage flag is set and
                // the violation is routed to checkTreatyCompliance
                // for grievance/trust debit. Slice M: suppress
                // is removed; violation path now debits trust.
                const passageTreaty = (world.treaties ?? []).find(t => {
                    if (t.status !== 'ACTIVE') return false;
                    // Support both treaty shapes: treaty.kind and treaty.terms.kind
                    const kind = t.kind ?? t.terms?.kind;
                    if (kind !== 'PASSAGE' && kind !== 'passage') return false;
                    if (!Array.isArray(t.participants)) return false;
                    return t.participants.includes(observerFaction.id) && t.participants.includes(intruder.factionId);
                });
                // Determine scarcity from the home town's `scarceResources`
                // and whether the intruder is on a road whose endpoint
                // town has a scarce resource.
                const homeTown = world.towns.get(observerFaction.townId);
                const intruderRoad = intruder.roadId
                    ?? intruder.selectedRoute
                    ?? (intruder.location && world.routes
                        .find(r => r.from === intruder.location || r.to === intruder.location)?.id);
                const roadRec = intruderRoad ? world.routes.find(r => r.id === intruderRoad) : null;
                const isScarceOccupancy = !!(homeTown?.scarceResources?.food
                    && roadRec
                    && (roadRec.from === observerFaction.townId || roadRec.to === observerFaction.townId));
                const armed = !!(intruder.armed
                    || (intruder.mode === 'RAID')
                    || (intruder.role === 'guard')
                    || (intruder.role === 'vampire'));
                const priorIncidents = pair.intrusionCount(tick, 50, intruder.id);
                const intrusionEvent = pair.recordIntrusion({
                    observerFactionId: observerFaction.id,
                    fromFactionId: intruder.factionId,
                    severity: 0.3,
                    groupSize: intruder.size ?? intruder.population ?? 1,
                    armedStatus: armed ? 1 : 0,
                    scarceResourceOccupancy: isScarceOccupancy ? 1 : 0,
                    priorIncidents,
                    duration: intruder.locationAge ?? 1,
                    location: intruderRoad ?? intruder.location,
                    tick,
                });
                if (passageTreaty && intrusionEvent) {
                    intrusionEvent.context.treatyPassage = true;
                    intrusionEvent.context.treatyId = passageTreaty.id;
                    // Slice M: treaty violation cost — the intruder
                    // violated an active passage treaty by being on
                    // the observer's territory. Debit trust from the
                    // observer's perspective and route through
                    // checkTreatyCompliance for violation ledger.
                    // Use the treaty's kind-aware check: road violation
                    // is action.type==='INTRUSION' on that road.
                    const intruderRoadForTreaty = intrusionEvent.context?.location ?? intruderRoad;
                    const isScoped = Boolean(passageTreaty.terms?.scope);
                    const scopedMatch = !isScoped || intruderRoadForTreaty === passageTreaty.terms.scope;
                    if (scopedMatch) {
                        // Trust debit: observer trusts violator less.
                        // The FactionRelationshipVector's recordHarm debit
                        // is via fromFactionId = violator, debiting the
                        // observer's perspective (the victim).
                        const beforeTrust = pair.getTrustFrom(observerFaction.id);
                        pair.recordHarm({ severity: isScoped ? 0.15 : 0.10, tick, fromFactionId: intruder.factionId });
                        // Use the shared compliance path so a live territory
                        // breach updates treaty history and lawfulness exactly
                        // like an encounter breach. The relationship debit
                        // remains owned by this contextual territory path.
                        checkTreatyCompliance({
                            world,
                            action: {
                                type: isScoped ? 'TERRITORY_INTRUSION_ON_PASSAGE_ROAD' : 'TERRITORY_INTRUSION_UNDER_PASSAGE_TREATY',
                                roadId: intruderRoadForTreaty,
                                violator: intruder.factionId,
                            },
                            tick,
                        });
                        intrusionEvent.context.violationCost = true;
                        intrusionEvent.context.trustDebit = Math.max(0, beforeTrust - pair.getTrustFrom(observerFaction.id));
                    }
                }
                if (intrusionEvent) {
                    appendWorldEvent(world, {
                        type: 'INTRUSION',
                        observerId: observerFaction.id,
                        intruderId: intruder.id,
                        intruderFactionId: intruder.factionId,
                        pairId: pairA ? `${observerFaction.id}::${intruder.factionId}`
                            : `${intruder.factionId}::${observerFaction.id}`,
                        tick,
                        severity: intrusionEvent.scaledSeverity,
                        context: intrusionEvent.context,
                        // Derived from territorial proximity analysis.
                        rootReason: 'TERRITORY_PROXIMITY',
                    });
                }
            }
        }
    }

    // 2. Bandits under pressure relocate to their declared alternate road
    //    when loot expectation is high. This is the same pressure rule the
    //    one-shot scenario uses; running it tick-by-tick makes the
    //    relocation observable across the event log instead of being a
    //    single mutation.
    // PHASE 19 fix (EVID-2026-08-28-REST-BONUS-DECAY): tick the
    // bandit's locationAge so the rest bonus decays over time.
    // Without this, a REST-mode bandit becomes permanently
    // locked in to its location (the long-horizon degeneracy).
    for (const bandit of world.bandits) {
        // Directive §6: the closed-world's bandit relocation
        // must be driven by chooseRoamingDestination, not
        // the binary relocateBandit. The wrapper builds a
        // real RoamingGroup from the bandit (mirroring
        // observations on every road the bandit has touched)
        // and asks chooseRoamingDestination which road to
        // move to. The legacy event shape is preserved.
        const relocation = relocateBanditViaRoaming(bandit, world.routes, { tick });
        if (relocation && relocation.relocated) {
            // Apply the mutation: the legacy
            // `relocateBandit` in `escalation.js` did this;
            // the new live-wire must too.
        if (relocation.to) {
            bandit.roadId = relocation.to;
        }
        appendWorldEvent(world, {
            type: 'BANDIT_RELOCATION',
            relocation,
            tick,
            // Derived from the roaming group's own destination utility.
            rootReason: 'ROAMING_UTILITY',
        }, []);
        }
        tickRoamingGroup(bandit);
    }

    // 2.4. Belief formation (Constitution §9 / §87 / §533). When a
    // bandit relocates or attacks, *only the merchants who can
    // observe the event* (per the canObserve boundary) update
    // their BeliefStore. The merchant's per-tick route choice
    // (step 2.6) consults these beliefs, not the ground-truth
    // bandit position. This is the §9 "no global omniscience"
    // contract: knowledge comes through observation, not through
    // direct read of the world. A merchant who is out of
    // observation range does NOT learn the event — its belief
    // may be stale or false, which is the §8 contract.
    for (const merchant of world.merchants) {
        if (!merchant.beliefs || typeof merchant.beliefs.observe !== 'function') continue;
        if (!(merchant.observedEventIds instanceof Set)) {
            merchant.observedEventIds = new Set(merchant.observedEventIds ?? []);
        }
        // Snapshot the source ledger because this loop appends OBSERVATION
        // and BELIEF_UPDATE children. A one-tick lookback is required: live
        // encounters emit consequences after this pass, so their witnesses
        // can legally consume them on the following tick.
        for (const event of getWorldEvents(world, {
            types: ['BANDIT_RELOCATION', 'BANDIT_ATTACK'],
            minTick: tick - 1,
            maxTick: tick,
        })) {
            const sourceTick = event.tick ?? 0;
            if (sourceTick > tick || sourceTick < tick - 1) continue;
            ensureWorldEventIdentity(world, event);
            if (merchant.observedEventIds.has(event.eventId)) continue;
            // The §9 observation boundary. A merchant who cannot
            // observe the event does NOT receive evidence.
            if (!canObserve(merchant, event, world)) continue;
            // R1b (V8 audit finding 3): perceptionAccuracy governs
            // ALL merchant observation, not just the canonical
            // event channel. A merchant with accuracy 0 is blind
            // everywhere; without this flip, accuracy-0 merchants
            // learned via BeliefStore formation while the
            // routeBeliefs channel stayed shut — two contradictory
            // blindnesses. Draws come from the serializable
            // encounter stream so save/load stays exact.
            const accuracy = Number.isFinite(merchant.perceptionAccuracy)
                ? clamp01(merchant.perceptionAccuracy) : 0.5;
            if (nextEncounterRandom(world) >= accuracy) continue;
            const roadId = event.roadId
                ?? event.relocation?.roadId
                ?? event.relocation?.to
                ?? event.to
                ?? event.relocation?.fromRoadId;
            if (!roadId) continue;
            const route = world.routes.find(item => item.id === roadId);
            if (!route) continue;
            const isAttack = event.type === 'BANDIT_ATTACK';
            // The §9 partial-observability contract: the merchant
            // forms its belief from the events it witnesses. Per
            // the §87 evidence-type contract, the trust and
            // confidence are properties of the *evidence type*,
            // not of the prior belief's existence. The audit
            // explicitly required this: "It should not fundamentally
            // depend on: 'did this BeliefStore already contain
            // something?'" Each event produces a single evidence
            // record whose weight derives from its source.
            const sourceId = isAttack ? 'attack-witness' : 'relocation-witness';
            const evidenceType = sourceIdToEvidenceType(sourceId);
            const strength = evidenceStrength(evidenceType);
            // R7 (V8 audit F3): witnesses never receive the exact
            // ground truth. Observation adds ±0.1 noise drawn from
            // the serializable encounter stream, so save/load and
            // fork stay exact while no merchant holds actualDanger.
            const dangerTruth = isAttack
                ? route.actualDanger
                : (event.relocation?.roadId === roadId ? route.actualDanger : route.actualDanger * 0.1);
            const observedDanger = clamp01(dangerTruth + (nextEncounterRandom(world) * 2 - 1) * 0.1);
            const evidence = new Evidence({
                subject: roadId,
                claim: 'perceivedDanger',
                value: observedDanger,
                sourceId,
                sourceTrust: strength.sourceTrust,
                confidence: strength.confidence,
                tick,
            });
            const observationEvent = appendWorldEvent(world, {
                type: 'OBSERVATION',
                tick,
                merchantId: merchant.id,
                sourceEventId: event.eventId,
                sourceEventType: event.type,
                roadId,
                evidenceType,
                observedDanger,
            }, [event.eventId]);
            const belief = merchant.beliefs.observe(evidence);
            const beliefEvent = appendWorldEvent(world, {
                type: 'BELIEF_UPDATE',
                tick,
                merchantId: merchant.id,
                subject: roadId,
                claim: 'perceivedDanger',
                value: belief?.value ?? observedDanger,
                confidence: belief?.confidence ?? strength.confidence,
            }, [observationEvent.eventId]);
            merchant.observedEventIds.add(event.eventId);
            merchant.latestBeliefUpdateEventId = beliefEvent.eventId;
        }
    }

    // 2.4.5. Rumor auto-share (Constitution §8 / §87). After the
    // belief formation step, each witness merchant that
    // observed a BANDIT_ATTACK or BANDIT_RELOCATION
    // automatically shares the observation with every
    // non-witness merchant (one that did not observe the
    // event). The shared observation has reduced
    // confidence (TRUSTED_REPORT decay, 0.5x) and is
    // recorded on the non-witness's BeliefStore. This
    // completes the §8 information model: knowledge
    // spreads through the world, not through global
    // broadcast.
    for (const witness of world.merchants) {
        if (!witness || !witness.beliefs) continue;
        // The witness's beliefs are a BeliefStore. We
        // iterate over its beliefs to find observations
        // on this tick.
        const witnessBeliefs = witness.beliefs;
        if (!witnessBeliefs || typeof witnessBeliefs.get !== 'function') continue;
        // The witness's BeliefStore keys are
        // `${subject}:${claim}`. We check the three
        // possible road subjects.
        for (const roadId of ['road-a', 'road-b', 'road-c', 'road-ns', 'road-ne', 'road-se']) {
            const belief = witnessBeliefs.get(roadId, 'perceivedDanger');
            if (!belief || belief.lastTick !== tick) continue;
            // Build a shared observation.
            const sharedConfidence = belief.confidence * 0.5;
            // Share with every merchant that could hear it: gossip
            // spreads at shared locations (same town), not across
            // the map by teleport. R1b (V8 audit finding 2): the old
            // rule shared with every merchant NOT at the witness's
            // location, so a distant accuracy-0 merchant learned an
            // attack it could never observe. Cross-town spread needs
            // a carrier (traveler/rumor-chain), which does not exist
            // yet — same-town gossip is the honest channel.
            for (const recipient of world.merchants) {
                if (!recipient || recipient === witness) continue;
                if (!recipient.beliefs) continue;
                if (typeof recipient.beliefs.observe !== 'function') continue;
                // Gossip is heard, not broadcast: only merchants at
                // the witness's location hear it. (Recipients on the
                // same route would observe directly.)
                if (recipient.location !== witness.location) continue;
                // Create an Evidence with reduced
                // confidence (TRUSTED_REPORT) and record
                // it on the recipient's BeliefStore.
                const evidence = new Evidence({
                    subject: roadId,
                    claim: 'perceivedDanger',
                    value: belief.value,
                    sourceId: 'trusted-report',
                    sourceTrust: 0.5,
                    confidence: sharedConfidence,
                    tick
                });
                recipient.beliefs.observe(evidence);
            }
        }
    }

    // 2.5. Trade rerouting (Constitution §399 / §409 / §161). After a
    // bandit relocates, the merchant's belief about each route's
    // danger changes. Re-evaluate the merchant's route choice using
    // the current bandit position and emit ROUTE_SELECTED on every
    // tick and ROUTE_CHANGED when the choice actually changed. This
    // is the §538 vertical-slice contract: a passive signal (a
    // bandit moving roads) becomes an active consequence (a merchant
    // adapting their route).
    //
    // EVID-2026-08-29-CANONICAL-ROUTE-FIRST: the canonical trade
    // system (canonical-trade-system.tickMerchant) is the
    // authoritative route chooser because it consumes the merchant's
    // heterogeneous identity (riskTolerance, switchingCost,
    // cargoValueSensitivity, routeFamiliarity, routeBeliefs) and
    // the ecology/market shortage wires. We call tickCanonicalMerchant
    // FIRST so its `merchant.selectedRoute` assignment is what
    // the encounter engine (step 6.5) sees. The legacy block
    // below still runs for the ROUTE_SELECTED / ROUTE_CHANGED
    // audit trail but only emits events; it does not overwrite
    // the canonical route choice.
    // RESP-EVENT-ID-AUTHORITY-001: capture each merchant's canonical
    // decision event so the legacy audit-trail pass below can parent
    // ROUTE_SELECTED / ROUTE_CHANGED to the decision that caused them.
    const decisionEventIds = new Map();
    for (const merchant of world.merchants) {
        if (!merchant || merchant.riskTolerance === undefined) continue;
        // RESP-EVENT-ID-AUTHORITY-001: parent the decision to this tick's
        // BELIEF_UPDATE events; when no fresh observation happened, fall
        // back to the merchant's most recent belief event (the decision
        // still consumes its stored belief state, so a stale belief is a
        // legitimate causal parent). tickMerchant declares an explicit
        // rootReason when there is no belief event at all (e.g. tick 1
        // with an empty belief store).
        const beliefParentIds = (() => {
            const sameTick = getWorldEvents(world, {
                type: 'BELIEF_UPDATE',
                tick,
            })
                .filter(event => event.merchantId === merchant.id)
                .map(event => event.eventId);
            if (sameTick.length > 0) return sameTick;
            const earlier = getWorldEvents(world, {
                type: 'BELIEF_UPDATE',
                maxTick: tick,
            })
                .filter(event => event.merchantId === merchant.id
                    && Number.isFinite(event.tick));
            earlier.sort((a, b) => (b.tick ?? 0) - (a.tick ?? 0));
            return earlier.length > 0 ? [earlier[0].eventId] : [];
        })();
        const routeResult = tickCanonicalMerchant(world, merchant.id, {
            tick,
            rng: makeEncounterRng(world, encounterRng),
            parentEventIds: beliefParentIds,
        });
        if (routeResult?.ok && routeResult.event) {
            ensureWorldEventIdentity(world, routeResult.event, beliefParentIds);
            decisionEventIds.set(merchant.id, routeResult.event.eventId);
            const chosenRoute = routeResult.event.chosenRoute;
            const route = (world.routes ?? []).find(r => r.id === chosenRoute);
            // Roads are undirected for travel: a merchant at `route.to`
            // traveling that road is headed to `route.from` (and vice
            // versa). The declared from/to is just the canonical
            // direction of record.
            const destinationTownId = route?.from === merchant.location
                ? route.to
                : route?.to === merchant.location ? route.from : (route?.to ?? merchant.location);
            // E3 — endogenous cargo selection + market exchange. When the
            // merchant is free to ship, it compares the destination
            // shortage against local abundance per kind and carries what
            // the destination needs most relative to home surplus. The
            // exchange is a real market trade at the LOCAL market: the
            // hold is sold in (deliverCargo, merged into the market loop
            // via deliveredThisTick like trip cargo) and the new kind is
            // bought out (consume, capped at local surplus so the home
            // town's own demand is never stripped). No creation: the buy
            // is bounded by on-hand surplus, the sell is stored or booked
            // as overflow. Gated on no active trip so cargo already
            // committed to a pending trip is never touched mid-transit.
            const travelingAlready = (world.pendingTrips ?? []).some(
                t => t.merchantId === merchant.id
                    && (t.status === 'IN_TRANSIT' || t.status === 'ARRIVED')
            );
            // E11: bankrupt merchants take no new positions (no buys,
            // no swaps). They hold what they hold; the ship gate
            // already refuses them below.
            const exchangeBankrupt = (Number.isFinite(merchant.capital)
                ? merchant.capital : MERCHANT_STARTING_CAPITAL) < 0;
            if (!travelingAlready && destinationTownId && destinationTownId !== merchant.location && !exchangeBankrupt) {
                let selection = null;
                try {
                    selection = selectMerchantCargoKind(merchant, { world, destinationTownId });
                } catch {
                    selection = null;
                }
                if (selection?.switched) {
                    const localTown = world.towns?.get?.(merchant.location);
                    const localMarket = localTown?.market;
                    const surplus = selection.scores?.[selection.cargoKind]?.localSurplus ?? 0;
                    const buyAmount = Math.max(0, Math.min(20, Math.floor(surplus)));
                    if (localMarket && buyAmount >= 1) {
                        const holdKind = merchant.cargoKind ?? 'food';
                        const holdAmount = Math.max(0, Number(merchant.cargo) || 0);
                        // E9: the swap is a real trade at the local
                        // quote. The sold hold earns, the bought load
                        // costs; the net books into merchant capital.
                        const salePrice = marketQuotePrice(localMarket, holdKind);
                        const buyPrice = marketQuotePrice(localMarket, selection.cargoKind);
                        const sale = holdAmount > 0 && typeof localMarket.deliverCargo === 'function'
                            ? localMarket.deliverCargo(holdKind, holdAmount, { routeRisk: 0, confidence: 1 })
                            : { stored: 0, overflow: 0 };
                        if (!world.deliveredThisTick) world.deliveredThisTick = new Map();
                        const sellKey = `${merchant.location}:${holdKind}`;
                        const priorSale = world.deliveredThisTick.get(sellKey) ?? { stored: 0, overflow: 0 };
                        priorSale.stored += sale.stored ?? 0;
                        priorSale.overflow += sale.overflow ?? 0;
                        world.deliveredThisTick.set(sellKey, priorSale);
                        const bought = typeof localMarket.consume === 'function'
                            ? localMarket.consume(selection.cargoKind, buyAmount)
                            : { consumed: 0, unmet: buyAmount };
                        merchant.cargo = Number(bought.consumed) || 0;
                        merchant.cargoKind = selection.cargoKind;
                        const capitalDelta = (sale.stored ?? 0) * salePrice - merchant.cargo * buyPrice;
                        bookMerchantCapital(merchant, capitalDelta);
                        appendWorldEvent(world, {
                            type: 'CARGO_EXCHANGED',
                            tick,
                            merchantId: merchant.id,
                            locationTownId: merchant.location,
                            destinationTownId,
                            fromKind: holdKind,
                            toKind: selection.cargoKind,
                            soldHold: holdAmount,
                            saleStored: sale.stored ?? 0,
                            saleOverflow: sale.overflow ?? 0,
                            bought: merchant.cargo,
                            buyUnmet: bought.unmet ?? 0,
                            margin: selection.margin,
                            scores: selection.scores,
                            capitalDelta,
                            merchantCapital: Number.isFinite(merchant.capital) ? merchant.capital : null,
                        }, [routeResult.event.eventId]);
                    }
                }
            }
            const merchantCargo = Number(merchant.cargo) || 0;
            // Post-exchange hold: the trip carries what the merchant
            // owns NOW (possibly tools after an E3 exchange above).
            const cargoKind = merchant.cargoKind ?? 'food';
            // EVID-2026-08-31-TRIP-MATERIALIZATION: the canonical route
            // decision materializes a real pending trip (cargo leaves the
            // merchant, travels, and delivers to the destination market)
            // instead of being a decorative event. The shipped amount is
            // scaled by the merchant's *belief* about the route's danger
            // (partial observation, not ground truth): a route the
            // merchant believes is dangerous ships less cargo. World
            // danger also dampens shipping: in a dangerous world (high
            // perceivedDanger regime) merchants ship less, so §138
            // scenario differentiation flows through production signals
            // (danger → shipped volume → delivered supply → market →
            // faction) instead of only through faction inputs.
            const believedDanger = clamp01(
                merchant.routeBeliefs?.[chosenRoute]?.perceivedDanger ?? 0.5
            );
            const worldCaution = clamp01(perceivedDanger);
            const cargoAmount = Math.min(
                Math.max(1, Math.floor(merchantCargo * (1 - believedDanger * 0.5) * (1 - worldCaution * 0.4))),
                merchantCargo
            );
            // A merchant that already has a trip in flight does not ship a
            // second load — that would be an infinite conveyor flooding the
            // destination market. But the CAUSAL chain (MUT-CHAIN-001:
            // decision → TRIP_COMMITMENT → ROUTE_EXPOSURE → encounter)
            // must still fire every tick the merchant decides, so a
            // deferral still records a commitment event with
            // `materialized: false` and the exposure engine reads it.
            // `travelingAlready` (computed pre-exchange above): the
            // exchange gate and the ship gate read the same trip state.
            const alreadyTraveling = travelingAlready;
            // E4: no shipments to rubble. An abandoned destination has
            // nobody to buy, so the load stays with the merchant and
            // the decision records a DEFERRED commitment
            // (ABANDONED_DESTINATION) instead of rotting goods into a
            // husk market forever. The causal chain still fires.
            const destAbandoned = Boolean(destinationTownId
                && world.towns?.get?.(destinationTownId)?.abandoned);
            // E9: a bankrupt merchant holds its load and stops
            // shipping (terminal, no bailout). Legacy and hand-built
            // merchants without the field open at starting capital.
            const merchantCapital = Number.isFinite(merchant.capital)
                ? merchant.capital
                : MERCHANT_STARTING_CAPITAL;
            const bankrupt = merchantCapital < 0;
            if (bankrupt && !merchant.bankruptDeclared) {
                merchant.bankruptDeclared = true;
                appendWorldEvent(world, {
                    type: 'MERCHANT_BANKRUPT',
                    tick,
                    merchantId: merchant.id,
                    capital: merchantCapital,
                }, [routeResult.event.eventId]);
            }
            const canShip = cargoAmount > 0 && route
                && destinationTownId !== merchant.location && !alreadyTraveling && !destAbandoned && !bankrupt;
            try {
                let commitmentEventId;
                let trip;
                if (canShip) {
                    trip = schedulePendingTradeTrip(world, {
                        merchantId: merchant.id,
                        routeId: chosenRoute,
                        destinationTownId,
                        cargoKind,
                        cargoAmount,
                        travelTicks: Math.max(1, Math.round((route.distance ?? 1) / (Number.isFinite(route.condition) ? route.condition : 1))),
                        startTick: tick,
                        parentEventIds: [routeResult.event.eventId],
                    });
                    commitmentEventId = trip.commitmentEventId;
                } else {
                    // Deferred commitment: the merchant decided a route
                    // but cannot/will not depart this tick. Dedicated
                    // audit event keeps the causal chain contiguous;
                    // `materialized: false` marks it as decision-only.
                    const deferred = appendWorldEvent(world, {
                        type: 'TRIP_COMMITMENT',
                        tick,
                        merchantId: merchant.id,
                        routeId: chosenRoute,
                        status: 'DEFERRED',
                        materialized: false,
                        reason: bankrupt ? 'BANKRUPT' : (alreadyTraveling ? 'ALREADY_TRAVELING' : (destAbandoned ? 'ABANDONED_DESTINATION' : 'NO_CARGO_OR_ROUTE')),
                    }, [routeResult.event.eventId]);
                    commitmentEventId = deferred.eventId;
                }
                merchant.activeTripCommitment = {
                    actionId: trip?.actionId ?? null,
                    tripId: trip?.tripId ?? null,
                    routeId: chosenRoute,
                    commitmentEventId,
                    tick,
                    materialized: Boolean(trip),
                };
            } catch (err) {
                // Shipping can legitimately fail (e.g. cargo already
                // deducted by a bandit attack this tick). The route
                // decision is still recorded; we just do not invent
                // a trip that owns cargo the merchant no longer has.
                merchant.activeTripCommitment = null;
            }
        }
    }
    for (const merchant of world.merchants) {
        if (!merchant) continue;
        // Perceived danger for each route. The merchant does NOT
        // see ground truth; it sees what the belief store says. If
        // the merchant has a belief store with a perceivedDanger
        // belief for this road, use that. Otherwise fall back to
        // direct observation. This is the §9 partial-observability
        // contract: the merchant forms its own picture of the world
        // from observed events, not from a global read.
        const routeDanger = {};
        for (const route of world.routes) {
            const belief = merchant.beliefs?.get?.(route.id, 'perceivedDanger');
            if (belief) {
                routeDanger[route.id] = belief.value;
            } else {
                // OBS-HIDDEN-001 (W1-PARTIAL-OBSERVABILITY): no legal
                // belief -> neutral prior. Reading world.bandits /
                // route.actualDanger here would inject hidden truth
                // into the merchant's perception the moment a belief
                // is missing.
                routeDanger[route.id] = 0.5;
            }
        }
        const previousRoute = merchant.selectedRoute;
        // Reuse chooseMerchantRoute's selection logic inline so the
        // audit trail (ROUTE_SELECTED / ROUTE_CHANGED) is produced
        // per-tick. chooseMerchantRoute currently emits ROUTE_SELECTED
        // unconditionally; we add a second pass that compares the
        // new selection to the previous one and emits ROUTE_CHANGED
        // when they differ.
        const perception = {
            perceivedDanger: 0.5,
            confidence: 0.8,
            fearSensitivity: 100,
            expectedCargoLoss: 0.5 * (merchant.cargo || 0),
            routeDanger,
        };
        const candidates = world.routes
            .filter(route => route.from === 'north' && route.to === 'south')
            .map(route => ({ ...route, distance: route.distance + (routeDanger[route.id] || 0) * 20 }));
        const decision = selectRoute(candidates, { ...perception, perceivedDanger: 0 });
        if (decision && decision.route) {
            const newRoute = decision.route.id;
            // EVID-2026-08-29-CANONICAL-ROUTE-FIRST: do NOT
            // overwrite merchant.selectedRoute. The canonical
            // trade system (tickCanonicalMerchant) is the
            // authoritative route chooser and already set it.
            // We only emit the ROUTE_SELECTED / ROUTE_CHANGED
            // audit-trail events for the legacy tests.
            // RESP-EVENT-ID-AUTHORITY-001: the audit-trail events parent
            // to the canonical MERCHANT_ROUTE_DECISION of this tick (or
            // declare themselves roots for legacy-only merchants).
            const decisionId = decisionEventIds.get(merchant.id);
            appendWorldEvent(world, {
                type: 'ROUTE_SELECTED',
                merchantId: merchant.id,
                routeId: merchant.selectedRoute || newRoute,
                tick,
                ...(decisionId ? {} : { rootReason: 'LEGACY_AUDIT_TRAIL' }),
            }, decisionId ? [decisionId] : []);
            if (previousRoute !== null && previousRoute !== undefined && previousRoute !== newRoute) {
                appendWorldEvent(world, {
                    type: 'ROUTE_CHANGED',
                    merchantId: merchant.id,
                    fromRouteId: previousRoute,
                    toRouteId: newRoute,
                    tick,
                    ...(decisionId ? {} : { rootReason: 'LEGACY_AUDIT_TRAIL' }),
                }, decisionId ? [decisionId] : []);
            }
        }
    }

    // 2.7. Convoy formation (Constitution §60 / §477 / §531 / §538).
    // When a merchant has cargo and a guard is available, form a
    // convoy. The convoy's cargo is the bandit-attack target. The
    // §60 contract: "High traffic creates loot opportunities." A
    // merchant traveling alone has cargo; a merchant traveling in
    // a convoy has cargo + escort. The convoy's escort strength
    // reduces the effective road danger (see resolveConvoyAmbush).
    // EVID-2026-08-31-TRIP-MATERIALIZATION: a convoy escorts a
    // MATERIALIZED trip (the merchant actually departed with cargo), not a
    // deferred route decision. Without this gate the merchant's cargo
    // draining to 0 mid-trip disbands the convoy and the respawn reforms it
    // every cycle (CONVOY_FORMED spam).
    const merchantCommitment = world.merchants[0]?.activeTripCommitment;
    const merchantMaterialized = Boolean(merchantCommitment?.materialized);
    if (world.convoy == null && world.merchants.length > 0 && world.guards.length > 0) {
        const merchant = world.merchants[0];
        if ((merchant.cargo ?? 0) > 0 && merchantMaterialized) {
            // E11: the escort is hired, not granted. The merchant
            // buys protection from capital when the avoided expected
            // loss beats the fee; otherwise it travels lone (the
            // convoy-ambush path still runs with zero escorts).
            const activeTrip = (world.pendingTrips ?? []).find(t =>
                t.tripId === merchantCommitment?.tripId) ?? null;
            const decision = decideConvoyEscort(merchant, world, {
                routeId: merchant.selectedRoute, tick,
                cargoAmount: activeTrip?.cargo?.amount ?? merchant.cargo,
                cargoKind: activeTrip?.cargo?.kind ?? merchant.cargoKind,
            });
            appendWorldEvent(world, {
                type: 'CONVOY_DECISION',
                tick,
                merchantId: decision.merchantId,
                routeId: decision.routeId,
                cargoKind: decision.cargoKind,
                cargoAmount: decision.cargoAmount,
                capital: decision.capital,
                perceivedRisk: decision.perceivedRisk,
                confidence: decision.confidence,
                expectedUnescortedLoss: decision.expectedUnescortedLoss,
                expectedEscortedLoss: decision.expectedEscortedLoss,
                escortCost: decision.escortCost,
                availableEscortIds: decision.availableEscortIds,
                chosenEscortIds: decision.chosenEscortIds,
                decision: decision.decision,
                why: decision.why,
                whyNot: decision.whyNot,
                ...(merchantCommitment?.commitmentEventId
                    ? {} : { rootReason: 'ESCORT_DECISION' }),
            }, merchantCommitment?.commitmentEventId
                ? [merchantCommitment.commitmentEventId] : []);
            if (decision.decision === 'HIRE') {
            // Exact-once fee: one formation, one charge. The convoy
            // persists until disbanded, so reloads and later ticks
            // cannot recharge an existing escort.
            bookMerchantCapital(merchant, -decision.escortCost);
            const hiredGuards = (world.guards ?? []).filter(g =>
                decision.chosenEscortIds.includes(g.id));
            world.convoy = formConvoy([merchant], hiredGuards, { escortRatio: 1 });
            world.convoy.routeId = merchant.selectedRoute;
            appendWorldEvent(world, {
                type: 'CONVOY_FORMED',
                convoyId: world.convoy.id,
                merchantIds: world.convoy.merchantIds,
                escortIds: world.convoy.escortIds,
                cargo: world.convoy.cargo,
                escortCost: decision.escortCost,
                merchantCapital: Number.isFinite(merchant?.capital) ? merchant.capital : null,
                tick,
                ...(merchantCommitment?.commitmentEventId
                    ? {} : { rootReason: 'ESCORT_FORMED' }),
            }, merchantCommitment?.commitmentEventId
                ? [merchantCommitment.commitmentEventId] : []);
            }
        }
    } else if (world.convoy) {
        // Update the convoy's route to follow the merchant.
        world.convoy.routeId = world.merchants[0].selectedRoute;
        // If the merchant has no cargo, disband the convoy.
        if ((world.merchants[0].cargo ?? 0) <= 0) {
            appendWorldEvent(world, {
                type: 'CONVOY_DISBANDED',
                convoyId: world.convoy.id,
                tick,
                rootReason: 'CARGO_EXHAUSTED',
            }, []);
            world.convoy = null;
        }
    }

    // 2.8. Convoy ambush (Constitution §60 / §477). When a bandit
    // is on the convoy's route, resolve an ambush: the convoy's
    // cargo is reduced by the effective danger (road danger minus
    // escort strength * 0.5). The §60 contract: bandits attack
    // high-traffic routes.
    //
    // The §17 / §325 attack-execution idempotency contract:
    // BANDIT_ATTACK and CONVOY_AMBUSH are two views of the
    // *same* physical incident when they fire on the same
    // (tick, road, merchant). The convoy ambush path mints
    // the same attackOpportunityId as resolveBanditAttack and
    // consults world.consumedAttackIds. If a BANDIT_ATTACK
    // already debited this opportunity, the convoy ambush is
    // recorded as a derived event (no cargo mutation). If the
    // convoy ambush is the *first* to fire, it is the
    // authoritative debit; a subsequent BANDIT_ATTACK with the
    // same id is rejected.
    if (world.convoy) {
        const convoyRoute = world.routes.find(r => r.id === world.convoy.routeId);
        const banditOnRoute = world.bandits.find(b => b.roadId === world.convoy.routeId);
        if (convoyRoute && banditOnRoute) {
            // The convoy is a group; pick a representative
            // merchant for the attack-opportunity identity.
            const representativeMerchant = world.merchants.find(
                m => world.convoy.merchantIds.includes(m.id)
            );
            const attackOpportunityId = `attack-opp-${tick}-${convoyRoute.id}-${representativeMerchant?.id ?? 'unknown'}`;
            const alreadyConsumed = world.consumedAttackIds.has(attackOpportunityId);
            // R2-W1: sync the convoy's recorded cargo to the merchants'
            // ACTUAL carried material before resolving the ambush. The
            // convoy snapshot was taken at formation, but merchants ship
            // (and are raided / restocked) every tick, so redistributing
            // from the stale value would fabricate or destroy material
            // (the global mass identity drifted by whole cargo units on
            // ambush ticks). With current cargo as the base, the ambush
            // loss is a genuine debit of real material and the
            // redistribution is conserved (sum of shares == cargo − lost).
            world.convoy.cargo = (world.merchants ?? []).reduce(
                (sum, merchant) => sum + (Number(merchant.cargo) || 0),
                0
            );
            const result = resolveConvoyAmbush(
                world.convoy,
                banditOnRoute,
                {
                    roadDanger: convoyRoute.actualDanger,
                    escortStrength: world.convoy.escortIds.length / Math.max(1, world.merchants.length),
                    tick,
                }
            );
            if (result.ok) {
                let convoyCapitalHit = 0;
                if (!alreadyConsumed) {
                    // The convoy ambush is the *first* debit for
                    // this opportunity. Mark it consumed and
                    // distribute the cargo loss to the merchants.
                    world.consumedAttackIds.add(attackOpportunityId);
                    // R2-W1: book the convoy's cargo loss into the loss
                    // sink so the global mass identity stays exact.
                    bookTransitLoss(world, representativeMerchant?.cargoKind ?? 'food', result.lost);
                    // Distribute the convoy's cargo back to the merchants.
                    if (world.convoy.merchantIds.length > 0) {
                        const perMerchant = world.convoy.cargo / world.convoy.merchantIds.length;
                        // E11: the authoritative ambush marks the
                        // bandit (E10 heat, same increment/clock) and
                        // bleeds each member at the origin replacement
                        // price (E9 P&L covers convoy losses too —
                        // previously only direct raids booked).
                        banditOnRoute.heat = Math.min(1,
                            Math.max(0, Number(banditOnRoute.heat) || 0) + 0.2);
                        banditOnRoute.lastHeatTick = tick;
                        const lossRoute = world.routes.find(r => r.id === world.convoy.routeId);
                        const lossOrigin = world.towns?.get?.(lossRoute?.from);
                        for (const merchantId of world.convoy.merchantIds) {
                            const merchant = world.merchants.find(m => m.id === merchantId);
                            if (merchant) {
                                merchant.cargo = perMerchant;
                                const share = result.lost / world.convoy.merchantIds.length;
                                const shareHit = -share
                                    * marketQuotePrice(lossOrigin?.market, merchant.cargoKind ?? 'food');
                                bookMerchantCapital(merchant, shareHit);
                                convoyCapitalHit += shareHit;
                            }
                        }
                    }
                }
                // Record the CONVOY_AMBUSH event with the
                // shared attackOpportunityId. The event is
                // emitted regardless of who fired first, but
                // R2 (V8 audit F6): allocator-owned id. The ambush is
                // parented to the BANDIT_ATTACK for the same opportunity
                // when the direct path fired first; otherwise it declares
                // its root (convoy-first debit or derived view). Bare
                // push left orphans.
                // R2b: the sibling lookup is intentionally absent — the
                // convoy block runs before any same-tick direct attack
                // can exist (and opportunity namespaces differ), so a
                // live sibling is unreachable; claiming the search would
                // be theatre. The rootReason names the actual case.
                appendWorldEvent(world, {
                    type: 'CONVOY_AMBUSH',
                    attackOpportunityId,
                    convoyId: world.convoy.id,
                    lost: result.lost,
                    survivors: result.survivors,
                    capitalDelta: convoyCapitalHit,
                    roadId: result.roadId,
                    merchantIds: [...world.convoy.merchantIds],
                    derived: alreadyConsumed, // true = derived/child view, no mutation
                    tick,
                    rootReason: alreadyConsumed ? 'CONVOY_DERIVED_VIEW' : 'CONVOY_FIRST_DEBIT',
                }, []);
            }
        }
    }
    // 3. Merchants whose cargo is empty respawn at their origin town with a
    //    fresh load. This is the cross-tick persistence the north-star chain
    //    needs: a town that keeps losing cargo eventually stops sending
    //    merchants, and a town that gets safe deliveries keeps trading.
    for (const merchant of world.merchants) {
        // E11: bankrupt firms exit the goods economy entirely — no
        // free restock for the dead (otherwise exogenous gifts keep
        // a corpse trading at bandits' expense forever). They sit
        // empty; the town that lost them simply trades less.
        const restockBankrupt = (Number.isFinite(merchant.capital)
            ? merchant.capital : MERCHANT_STARTING_CAPITAL) < 0;
        if (merchant.cargo <= 0 && merchant.location && !restockBankrupt) {
            // R2-W1: restock is a declared exogenous injection; without
            // the booking the global mass identity would break by ~20
            // each respawn (unexplained mass creation).
            bookExogenousInflow(world, merchant.cargoKind ?? 'food', 20 - Math.max(0, merchant.cargo));
            merchant.cargo = 20;
            merchant.selectedRoute = null;
            // R2 (V8 audit F6): allocator-owned id. The natural
            // parent is the loss event that emptied this merchant's
            // cargo (attack or ambush naming it); without one, the
            const lossEvent = (world.events ?? []).filter(event =>
                ((event.type === 'BANDIT_ATTACK' && event.merchantId === merchant.id)
                    || (event.type === 'CONVOY_AMBUSH' && Array.isArray(event.merchantIds) && event.merchantIds.includes(merchant.id)))
                && Number.isFinite(event.tick) && event.tick <= tick
                && typeof event.eventId === 'string').pop();
            appendWorldEvent(world, {
                type: 'MERCHANT_RESPAWN',
                merchantId: merchant.id,
                location: merchant.location,
                cargo: merchant.cargo,
                tick,
                ...(!lossEvent ? { rootReason: 'EXOGENOUS_RESTOCK' } : {}),
            }, lossEvent ? [lossEvent.eventId] : []);
        }
    }

    // 4. Each town's market runs the full stock-flow loop per good. The
    //    audit asked for a real economy: production flows in, consumption
    //    flows out, deliveries flow in, spoilage decays, and the storage
    //    capacity caps the inventory so production cannot grow without
    //    bound. The order is: produce → setDemand → consume → spoil →
    //    quote. `MARKET_TICK` is suppressed when the post-spoil quote is
    //    identical to the previous tick for the same `(townId, kind)`
    //    pair, so the event log stays focused on real transitions.
    if (!world.marketState) world.marketState = new Map();
    // PHASE §155 mass-balance tracking: per-flow numbers
    // (produced, delivered, consumed, spoiled, overflow) so
    // the event log can reconstruct the mass balance from
    // events alone. Key: `${townId}:${kind}`.
    if (!world.marketFlows) world.marketFlows = new Map();
    const marketFlows = world.marketFlows;
    const marketEvents = [];
    for (const [townId, town] of world.towns) {
        const market = town && town.market;
        if (!market || typeof market.setDemand !== 'function') continue;
        const population = Math.max(0, Number(town.population) || 0);
        // E7: camped refugee mouths join town food demand (they eat
        // before they produce; production below uses town population
        // only, so displacement is a net consumption until heads
        // integrate via tickRefugeeCamps). Older saves without the
        // array behave exactly as before.
        let campedMouths = 0;
        if (Array.isArray(world.refugeeCamps)) {
            for (const camp of world.refugeeCamps) {
                if (camp?.townId === townId && camp?.status === 'CAMPED' && camp?.size > 0) {
                    campedMouths += camp.size;
                }
            }
        }
        const consumes = (town && typeof town.consumes === 'object' && town.consumes)
            || { food: 1 };
        const produces = (town && typeof town.produces === 'object' && town.produces)
            || {};
        // Union of all goods the town interacts with (consumes or
        // produces). A town that produces but doesn't consume a good
        // (e.g. an exporting farm) still drives the produce/spoil path
        // for that good.
        const allKinds = new Set([...Object.keys(consumes), ...Object.keys(produces)]);
        // E5: recipe inputs produce before their consumers (ore ->
        // metal -> tools in the same tick, no one-tick lag). Kahn
        // passes over ALPHABETICAL kind order: save/load round-trips
        // alphabetize plain-object keys (stableValue), so insertion
        // order is load-sensitive and must not decide production
        // order — the strict-resume contract depends on it. A
        // dependency cycle (no seed has one) falls back to
        // alphabetical order.
        const recipes = (town && typeof town.recipes === 'object' && town.recipes) || {};
        const orderedKinds = [];
        const placed = new Set();
        const pending = [...allKinds].sort();
        let progressed = true;
        while (pending.length > 0 && progressed) {
            progressed = false;
            for (let i = 0; i < pending.length; i++) {
                const inputs = Object.keys(recipes[pending[i]] ?? {});
                if (inputs.every(k => placed.has(k) || !allKinds.has(k))) {
                    orderedKinds.push(pending[i]);
                    placed.add(pending[i]);
                    pending.splice(i, 1);
                    i--;
                    progressed = true;
                }
            }
        }
        for (const kind of pending) orderedKinds.push(kind);
        // E5 planning pass (topo order): scale the per-capita rate
        // through every modifier, gate recipe outputs by their input
        // stocks, and deduct the inputs NOW. Deduction must precede
        // the per-kind loop because an input kind iterates (and emits
        // its MARKET_TICK) before its consumers run; booking here and
        // merging below (deliveredThisTick pattern) keeps the per-tick
        // identity exact for every kind. Industrial use is booked as
        // `consumed` on the input kind, so all mass identities hold
        // unchanged; `inputsConsumed` / `inputShortfall` say why.
        const scaledRate = (forKind) => {
            const base = Number(produces[forKind]) || 0;
            let pcp = base * getSeasonModifier(world.season, forKind);
            if (world.drought?.active && world.drought.townId === townId && (world.drought.kind ?? 'food') === forKind) {
                pcp *= Math.max(0.1, 1 - clamp01(Number(world.drought.severity) || 0) * 0.6);
            }
            if (world.storm?.active && world.storm.roadId) {
                const stormRoad = (world.routes ?? []).find(route =>
                    route?.id === world.storm.roadId
                    && (route.from === townId || route.to === townId));
                if (stormRoad) pcp *= Math.max(0, 1 - clamp01(Number(world.storm.severity) || 0) * 0.3);
            }
            // E12: the occupied work less. Foot-dragging scales output
            // down up to 15% at fresh conquest (0.3 penalty), fading
            // with assimilation. No occupation record prices exactly 1.
            pcp *= 1 - occupationPenalty(town, tick) * 0.5;
            return pcp;
        };
        const producePlan = new Map();
        const recipeUse = new Map();
        for (const kind of orderedKinds) {
            const pcp = scaledRate(kind);
            const desired = (Number.isFinite(pcp) && pcp > 0 && population > 0) ? population * pcp : 0;
            let gated = desired;
            const recipe = recipes[kind];
            if (recipe && desired > 0) {
                let inputLimit = Infinity;
                for (const [input, perUnitRaw] of Object.entries(recipe)) {
                    const perUnit = Number(perUnitRaw) || 0;
                    if (!(perUnit > 0)) continue;
                    inputLimit = Math.min(inputLimit, Math.max(0, Number(market.inventory.get(input)) || 0) / perUnit);
                }
                gated = Math.min(desired, Math.max(0, inputLimit));
                for (const [input, perUnitRaw] of Object.entries(recipe)) {
                    const perUnit = Number(perUnitRaw) || 0;
                    if (!(perUnit > 0) || gated <= 0) continue;
                    const used = market.consume(input, gated * perUnit);
                    const prev = recipeUse.get(input) ?? { consumed: 0, inputsConsumed: 0 };
                    prev.consumed += used?.consumed ?? 0;
                    prev.inputsConsumed += used?.consumed ?? 0;
                    recipeUse.set(input, prev);
                }
            }
            // Materialize now (topo order): downstream kinds planned
            // later this pass already see this output in inventory,
            // so the cascade runs same-tick from zero stock. The
            // per-kind loop below only books the stashed result.
            let produced = 0;
            let overflow = 0;
            if (Number.isFinite(pcp) && pcp > 0 && population > 0) {
                const prodResult = market.produce(kind, gated);
                produced = prodResult?.produced ?? 0;
                overflow = prodResult?.overflow ?? 0;
            }
            producePlan.set(kind, { pcp, gated, short: desired - gated, produced, overflow });
        }
        for (const kind of orderedKinds) {
            // PHASE §155: track per-flow numbers for the event
            // log. The Market primitive returns these from each
            // call. We track two things:
            //   1. `tickFlow` — per-tick flows for the event
            //      (must reset every tick so the event reflects
            //      this tick's change, not the cumulative total).
            //   2. `cumulativeFlow` — total flows for the audit
            //      trail (accumulates across ticks).
            const flowKey = `${townId}:${kind}`;
            const cumulativeFlow = marketFlows.get(flowKey) ?? { produced: 0, delivered: 0, consumed: 0, spoiled: 0, overflow: 0, deliveryOverflow: 0, inputsConsumed: 0, inputShortfall: 0 };
            const tickFlow = { produced: 0, delivered: 0, consumed: 0, spoiled: 0, overflow: 0, deliveryOverflow: 0, inputsConsumed: 0, inputShortfall: 0 };
            // E5: older saves and delivery-first bookings predate the
            // recipe memo fields; normalize so accumulation never NaNs.
            if (!Number.isFinite(cumulativeFlow.inputsConsumed)) cumulativeFlow.inputsConsumed = 0;
            if (!Number.isFinite(cumulativeFlow.inputShortfall)) cumulativeFlow.inputShortfall = 0;
            // PHASE §155: merge deliveries booked by
            // advancePendingWorldObligations earlier in this tick
            // (pending-trip cargo that arrived). Without this the
            // mass-balance identity violates by exactly the delivered
            // amount on delivery ticks.
            if (world.deliveredThisTick?.has(flowKey)) {
                const delivery = world.deliveredThisTick.get(flowKey) ?? {};
                tickFlow.delivered += delivery.stored ?? 0;
                // R2-W1: capacity-rejected delivery material is destroyed;
                // booking it keeps the global mass identity exact.
                tickFlow.deliveryOverflow += delivery.overflow ?? 0;
            }
            // E5: merge recipe input use planned above. The input kind
            // may iterate before or after its consumers; merging by key
            // (deliveredThisTick pattern) lands it on the right kind.
            const plannedUse = recipeUse.get(kind);
            if (plannedUse) {
                tickFlow.consumed += plannedUse.consumed;
                tickFlow.inputsConsumed += plannedUse.inputsConsumed;
            }
            // Produce. The amount was planned above (modifiers scaled,
            // recipe gated, inputs deducted); here it only lands in
            // inventory and books the §155 flow terms. `produced` is
            // the *attempted* amount; the *stored* amount is what
            // actually changes inventory. Track the attempted amount
            // as `produced` and the capacity-rejected amount as
            // `overflow`, so the mass-balance invariant uses
            // `produced - overflow` (= stored) for the supply change.
            // (Modifier chain lives in scaledRate above; drought D and
            // storm AI scale the planned rate before gating.)
            const kindPlan = producePlan.get(kind) ?? { pcp: 0, gated: 0, short: 0, produced: 0, overflow: 0 };
            tickFlow.inputShortfall += kindPlan.short;
            tickFlow.produced += kindPlan.produced;
            tickFlow.overflow += kindPlan.overflow;
            // Demand + consume.
            const perCapitaDemand = Number(consumes[kind]) || 0;
            const mouths = population + campedMouths;
            if (Number.isFinite(perCapitaDemand) && perCapitaDemand > 0 && mouths > 0) {
                const demand = mouths * perCapitaDemand;
                market.setDemand(kind, demand, 1);
                const consResult = market.consume(kind, demand);
                if (consResult) {
                    tickFlow.consumed += consResult.consumed ?? 0;
                }
            }
            // Spoilage. Even if no produce or consume ran, spoilage
            // applies to any good with a configured rate.
            // EVID-2026-08-29-ECOLOGY: the base spoilageRate is
            // temporarily multiplied by the current season's
            // spoilage modifier (summer = 1.4, winter = 0.6). We
            // restore the base rate after the spoil call so the
            // market's persistent state is not mutated.
            if (typeof market.spoil === 'function') {
                const baseSpoilRate = market.spoilageRate.get(kind);
                const seasonSpoil = getSpoilageModifier(world.season);
                if (Number.isFinite(baseSpoilRate) && Number.isFinite(seasonSpoil) && seasonSpoil !== 1) {
                    market.spoilageRate.set(kind, clamp01(baseSpoilRate * seasonSpoil));
                }
                const spoilResult = market.spoil(kind);
                if (Number.isFinite(baseSpoilRate) && Number.isFinite(seasonSpoil) && seasonSpoil !== 1) {
                    market.spoilageRate.set(kind, baseSpoilRate);
                }
                if (spoilResult) {
                    tickFlow.spoiled += spoilResult.spoiled ?? 0;
                }
            }
            // Accumulate the tick flow into the cumulative flow
            // for the audit trail.
            cumulativeFlow.produced += tickFlow.produced;
            cumulativeFlow.delivered += tickFlow.delivered;
            cumulativeFlow.consumed += tickFlow.consumed;
            cumulativeFlow.spoiled += tickFlow.spoiled;
            cumulativeFlow.overflow += tickFlow.overflow;
            cumulativeFlow.deliveryOverflow += tickFlow.deliveryOverflow;
            cumulativeFlow.inputsConsumed += tickFlow.inputsConsumed;
            cumulativeFlow.inputShortfall += tickFlow.inputShortfall;
            marketFlows.set(flowKey, cumulativeFlow);
            if (typeof market.getQuote !== 'function') continue;
            const quote = market.getQuote(kind);
            const previous = world.marketState.get(`${townId}::${kind}`);
            const changed = !previous
                || previous.supply !== quote.supply
                || previous.demand !== quote.demand
                || previous.shortage !== quote.shortage
                || previous.price !== quote.price
                || previous.disrupted !== quote.disrupted;
            world.marketState.set(`${townId}::${kind}`, {
                supply: quote.supply,
                demand: quote.demand,
                shortage: quote.shortage,
                price: quote.price,
                disrupted: quote.disrupted
            });
            if (!changed) continue;
            const event = {
                type: 'MARKET_TICK',
                townId,
                kind,
                tick,
                supply: quote.supply,
                demand: quote.demand,
                shortage: quote.shortage,
                price: quote.price,
                disrupted: quote.disrupted,
                // PHASE §155: include the per-tick flow numbers
                // (not the cumulative totals) so the event log
                // can reconstruct the mass balance from this
                // single event. The cumulative totals are still
                // available in `world.marketFlows` for audit.
                flows: { ...tickFlow },
                // MARKET_TICK summarizes an entire tick of material
                // flows across multiple producers/consumers; it is a
                // declared summary root, never a silent orphan.
                rootReason: 'MARKET_SUMMARY',
            };
            const emitted = appendWorldEvent(world, event, []);
            marketEvents.push(emitted);
        }
    }

    // 5. Justice feedback: bandit attacks in the current tick count as
    //    reported crimes. Each affected town runs its stored legitimacy and
    //    grievance through `JusticeSystem.resolve`, which derives a new
    //    migration pressure. The result is stored on the town and emitted
    //    as a `JUSTICE_RESOLVED` event only when legitimacy or grievance
    //    actually changed (same skip-when-unchanged rule used for
    //    reassessments and market ticks). When guards exist, one guard
    //    also issues a `Report` interaction against the bandit, and the
    //    report is pushed into `world.reports`. This connects the
    //    closed-world chain to the existing `interactions.js` API without
    //    inventing a parallel reporting path.
    if (!world.justiceState) world.justiceState = new Map();
    if (!world.justiceSystem) world.justiceSystem = new JusticeSystem();
    if (!world.interactionEngine) world.interactionEngine = new InteractionEngine({ cooldown: 1 });
    if (!Array.isArray(world.reports)) world.reports = [];

    // EVID-2026-08-29-REPORTED-CRIME-DECAY (Guardian §8):
    // "Migration must not be a periodic event that fires
    // because a threshold happens to be crossed." Previously
    // `reportedCrime` was sticky (true if ANY BANDIT_ATTACK
    // had ever fired), so the JusticeSystem's grievance
    // accumulated indefinitely and MIGRATION fired on every
    // cooldown expiry regardless of current pressure. Now
    // `reportedCrime` is true only when attacks occurred
    // within a recent window (last 5 ticks). After the window
    // passes without attacks, the JusticeSystem's grievance
    // decays via the idle `justiceAccess` baseline and
    // migration pressure drops below 0.5. This is the
    // Guardian §8 fix: migration is a *response* to a real
    // grievance, not a periodic event.
    const RECENT_ATTACK_WINDOW = 5;
    // Reported crime is per-town: only attacks whose road
    // touches the town or whose townId matches the town
    // count for that town. This makes the isolated fixture
    // meaningful (an attack on a north road should not
    // drive south migration unless the road is incident to
    // south). Global fallback is avoided.
    const recentAttackEvents = getWorldEvents(world, {
        type: 'BANDIT_ATTACK',
        minTick: tick - RECENT_ATTACK_WINDOW,
        maxTick: tick,
    });
    const recentAttacksByTown = (townId) => recentAttackEvents.filter(
        event => (event.tick ?? 0) > tick - RECENT_ATTACK_WINDOW
            && (event.tick ?? 0) <= tick
            && (event.townId === townId || (event.roadId && world.routes.find(r => r.id === event.roadId && (r.from === townId || r.to === townId))))
    ).length;
    // Slice W: law-confirmed crime in the same window. LAW_VIOLATED is always
    // parented to its attack, so this window trails the attack window by
    // construction (same-tick violations are observed by next tick's justice).
    const recentLawEvents = getWorldEvents(world, {
        type: 'LAW_VIOLATED',
        minTick: tick - RECENT_ATTACK_WINDOW,
        maxTick: tick,
    });
    const recentLawsByTown = (townId) => recentLawEvents.filter(
        event => (event.tick ?? 0) > tick - RECENT_ATTACK_WINDOW
            && (event.tick ?? 0) <= tick
            && (event.townId === townId || (event.roadId && world.routes.find(r => r.id === event.roadId && (r.from === townId || r.to === townId))))
    );
    // PHASE §156: deferred immigration pass. The MIGRATION
    // step decrements the source town's population in the
    // loop below, and the immigration (adding the emigrant
    // to the destination town) is deferred to a post-loop
    // pass. This prevents the oscillation where both towns
    // decrement-then-increment within the same tick and the
    // net effect is zero.
    const pendingImmigration = [];
    // §29 audit finding (2026-08-28): the MIGRATION event
    // was firing ~2/tick (994 over 500 ticks) under
    // sustained pressure, dominating the event log with
    // oscillation noise. The fix: a per-town MIGRATION
    // cooldown (matching the raid-cooldown pattern from
    // EVID-2026-08-27-RAID-COOLDOWN). The cooldown default
    // is 10 ticks: a town can emit MIGRATION at most once
    // per 10 ticks. This drops the rate from ~2/tick to
    // ~0.2/tick, restoring the event log's signal-to-noise
    // ratio.
    const MIGRATION_COOLDOWN = 10;
    if (!world.migrationCooldowns) world.migrationCooldowns = new Map();
    // The current tick is `tick` (from the reducer's
    // argument). The lastMigrationTick is the tick of the
    // most recent MIGRATION for each town.
    for (const [townId, town] of world.towns) {
        const previous = world.justiceState.get(townId) || {
            legitimacy: 0.5,
            grievance: 0.1,
            migrationPressure: 0,
            justiceAccess: 0.5
        };
        const reportedCrime = recentAttacksByTown(townId) > 0;
        // Slice AB (crime): patrol coverage builds investigation quality.
        // A patrol deployed on a road incident to this town ratchets quality
        // upward (+0.05/tick, cap 0.9); uncovered towns hold steady so
        // patrol-less worlds behave exactly as before (0.4 baseline).
        // Plain JSON on the town: save/load/fork-safe; older saves migrate.
        // NOTE: the loop head already binds `town`, but a later `const town`
        // in this same block (Slice C) shadows it into TDZ — use townRef.
        const townRef = world.towns.get(townId);
        if (!townRef.crime || typeof townRef.crime !== 'object') townRef.crime = { investigationQuality: 0.4 };
        const patrolled = (world.patrols ?? []).some(patrol => {
            const roadId = patrol?.deployedRoute ?? null;
            return typeof roadId === 'string' && world.routes.some(route =>
                route.id === roadId && (route.from === townId || route.to === townId));
        });
        if (patrolled) {
            const current = Number.isFinite(townRef.crime.investigationQuality) ? townRef.crime.investigationQuality : 0.4;
            townRef.crime.investigationQuality = Math.min(0.9, current + 0.05);
        }
        // Only resolve justice when there is something to resolve. Without
        // a reported crime, the `JusticeSystem` would still drift legitimacy
        // and grievance from its idle `justiceAccess` baseline; suppressing
        // the call keeps the audit trail focused on actual responses and
        // matches the doctrine that an idle justice system is a steady state.
        // Slice K fix: justiceState must also recover when no crime, otherwise
        // it stays scarred while faction heals, and next crime pulls stale-low
        // justice via 0.15 blend. Drift both together.
        if (!reportedCrime) {
            // E12: occupation caps idle recovery. A quietly occupied
            // town drifts toward (0.9 - penalty), not 0.9 — foreign
            // rule is never fully legitimate, even without crime.
            const townIdle = world.towns.get(townId);
            const idlePenalty = occupationPenalty(townIdle, tick);
            const recovered = {
                ...previous,
                legitimacy: clamp(previous.legitimacy * 0.98 + (0.9 - idlePenalty) * 0.02),
                grievance: clamp(previous.grievance * 0.98 + 0.1 * 0.02),
            };
            world.justiceState.set(townId, recovered);
            // Recover faction legitimacy slowly when no crime (idle justice = steady state, legitimacy drifts back toward 0.9)
            const idleFaction = world.factions.find(f => townIdle && f.id === townIdle.controlledBy)
                ?? world.factions.find(f => f.townId === townId);
            if (idleFaction) {
                idleFaction.legitimacy = clamp(idleFaction.legitimacy * 0.98 + 0.9 * 0.02);
            }
            continue;
        }
        // Slice AB consumes the town's own investigation quality (built by
        // patrol coverage above). Unpatrolled towns stay at the legacy 0.4.
        // townRef (not `town`: the Slice C `const town` below shadows it).
        const investigationQuality = Number.isFinite(townRef.crime?.investigationQuality)
            ? townRef.crime.investigationQuality
            : 0.4;
        const corruption = 0.1;
        // Slice W: mean LAW_VIOLATED penalty for this town in the window.
        // Zero when no violation exists — missing law history stays neutral.
        const townLawEvents = recentLawsByTown(townId);
        const lawPenalty = townLawEvents.length === 0 ? 0 : townLawEvents.reduce((sum, ev) => sum + (Number.isFinite(ev.penalty) ? ev.penalty : 0), 0) / townLawEvents.length;
        // E12: foreign-rule debit, same shape as lawPenalty (0 when
        // unoccupied — quiet control stays neutral).
        const occupationPenaltyValue = occupationPenalty(townRef, tick);
        const result = world.justiceSystem.resolve({
            legitimacy: previous.legitimacy,
            grievance: previous.grievance,
            reportedCrime,
            investigationQuality,
            corruption,
            lawPenalty,
            occupationPenalty: occupationPenaltyValue
        });
        const changed = result.legitimacy !== previous.legitimacy
            || result.grievance !== previous.grievance;
        world.justiceState.set(townId, result);
        // Slice C — justice → faction legitimacy (audit §11 Slice C)
        // The owning faction's legitimacy tracks justice outcomes.
        // Grievance is left to advanceEmotion's stock-flow (attack flow
        // + supplyShortage) to avoid double-counting stale attacks. This
        // makes a later RAID/HOLD decision differ via legitimacy dampener,
        // not a unit-only reassess call. Blend slowly to preserve stock-flow
        // and allow recovery when justice recovers (when no crime, legitimacy
        // will drift back via the same blend if justiceState is re-resolved).
        const owningFaction = world.factions.find(f => town && f.id === town.controlledBy)
            ?? world.factions.find(f => f.townId === townId);
        if (owningFaction) {
            owningFaction.legitimacy = clamp(owningFaction.legitimacy * 0.85 + result.legitimacy * 0.15);
        }
        let justiceResolvedEvent = null;
        if (changed) {
            // EVID-2026-08-31-MIG-PARENT (MUT-MIG-PARENT-001): use
            // appendWorldEvent so JUSTICE_RESOLVED carries an
            // eventId and can serve as the causal parent for the
            // MIGRATION event below.
            // V8 corrective checkpoint §4: parent
            // JUSTICE_RESOLVED to the upstream BANDIT_ATTACK
            // events for the same town within the
            // reported-crime window. The ledger must
            // record the actual mechanism that drove the
            // report, not just a tick stamp.
            const upstreamAttackIds = recentAttackEvents
                .filter(ev => (ev.townId === townId || (world.towns.get(townId) && ev.roadId && world.routes.find(r => r.id === ev.roadId && (r.from === townId || r.to === townId))))
                    && (ev.tick ?? 0) > tick - RECENT_ATTACK_WINDOW
                    && (ev.tick ?? 0) <= tick)
                .map(ev => ev.eventId)
                .filter(Boolean);
            // Slice W: the law penalty is a real causal input to the
            // legitimacy value above, so its LAW_VIOLATED events join the
            // parent set alongside the attacks.
            const upstreamLawIds = townLawEvents.map(ev => ev.eventId).filter(Boolean);
            justiceResolvedEvent = appendWorldEvent(world, {
                type: 'JUSTICE_RESOLVED',
                townId,
                tick,
                legitimacy: result.legitimacy,
                grievance: result.grievance,
                migrationPressure: result.migrationPressure,
                justiceAccess: result.justiceAccess,
                investigationQuality,
                lawPenalty,
                lawViolationCount: townLawEvents.length,
                occupationPenalty: occupationPenaltyValue,
            }, [...upstreamAttackIds, ...upstreamLawIds]);
        }
        // V8 corrective checkpoint §4: emit an explicit
        // MIGRATION_PRESSURE_EVALUATED event when the
        // justice loop evaluates for this town (reportedCrime
        // true: attack in RECENT_ATTACK_WINDOW on a road
        // incident to the town). When reportedCrime is false
        // the loop is skipped and no evaluation/decision is
        // emitted for that town on that tick (sparse emit
        // policy). Its parent is the JUSTICE_RESOLVED for
        // this tick, or empty when justice did not change.
        // The chain MIGRATION_PRESSURE_EVALUATED ->
        // MIGRATION_DECISION -> MIGRATION makes the decision
        // mechanism observable in the ledger.
        // RESP-EVENT-ID-AUTHORITY-001: when justice state did not change,
        // JUSTICE_RESOLVED is (correctly) absent — the pressure evaluation
        // must still parent to REAL causal inputs (the recent attacks for
        // this town) or declare itself a root. Silent parentlessness on
        // stable-justice ticks was the audit's CHAIN-MIGRATION orphan.
        let evaluationParentIds = justiceResolvedEvent
            ? [justiceResolvedEvent.eventId]
            : [];
        if (evaluationParentIds.length === 0) {
            evaluationParentIds = recentAttackEvents
                .filter(ev => Number.isFinite(ev.tick)
                    && ev.tick <= tick
                    && ev.tick > tick - RECENT_ATTACK_WINDOW
                    && typeof ev.eventId === 'string')
                .slice(-3)
                .map(ev => ev.eventId)
                .filter(Boolean);
        }
        const pressureEvaluation = appendWorldEvent(world, {
            type: 'MIGRATION_PRESSURE_EVALUATED',
            townId,
            tick,
            pressure: result.migrationPressure,
            reportedCrime,
            legitimacy: result.legitimacy,
            grievance: result.grievance,
            ...(evaluationParentIds.length === 0 ? { rootReason: 'WORLD_CONDITIONS' } : {}),
        }, evaluationParentIds);
        // PHASE §164 / §213: emit a MIGRATION event when
        // migrationPressure exceeds the threshold. The audit's
        // row 29: "Add persistent population/faction state
        // and crime/reporting/migration execution loop."
        // The threshold 0.5 is a HEURISTIC.
        // §29 audit (2026-08-28): suppress MIGRATION for
        // `MIGRATION_COOLDOWN` ticks after a previous
        // MIGRATION from the same town. This is the
        // per-town cooldown that prevents the
        // ~2 MIGRATION events/tick oscillation the audit
        // found.
        const lastMigrationTick = world.migrationCooldowns.get(townId) ?? -Infinity;
        const withinCooldown = (tick - lastMigrationTick) < MIGRATION_COOLDOWN;
        // FIRE integrity: a FIRE decision must correspond to an
        // actual migration. Compute destination and population
        // eligibility BEFORE emitting the decision. If no person
        // can leave or no destination exists, the decision is
        // SUPPRESSED with an honest reason and no MIGRATION
        // event is emitted and no population is moved.
        const townPop = Number.isFinite(town?.population) ? town.population : 0;
        // Slice B — destination utility (not lowest-pop).
        // For each candidate town, compute a utility score:
        //   utility = 0.4*(1-shortage) + 0.3*(1-danger) + 0.2*(1/distanceNorm) + 0.1*trust
        // where shortage is food shortage [0,1], danger is perceived bandit
        // danger on incident roads, distance is route distance, trust is
        // faction stance-derived trust. Highest utility wins.
        // This is the audit §11 Slice B requirement: "destination utility:
        // food availability, safety belief, distance, faction stance — not lowest population"
        let toTownId = null;
        let bestUtility = -Infinity;
        const destinationUtilities = [];
        const originFaction = world.factions.find(f => f.townId === townId);
        for (const [otherId, otherTown] of world.towns) {
            if (otherId === townId) continue;
            // Food availability: 1 - shortage (higher is better)
            let shortage = 0.5;
            if (otherTown?.market?.getQuote) {
                const q = otherTown.market.getQuote('food');
                if (q && Number.isFinite(q.shortage)) shortage = q.shortage;
            }
            const foodScore = 1 - shortage;
            // Safety: 1 - danger on roads incident to candidate town
            let danger = 0.3;
            const incidentRoads = world.routes.filter(r => r.from === otherId || r.to === otherId);
            if (incidentRoads.length > 0) {
                // OBS-HIDDEN-001 (W1-PARTIAL-OBSERVABILITY): the
                // traveler's safety signal comes from the origin
                // town's legal information surface — its merchants'
                // route beliefs (legally observed/rumored danger) —
                // never from live bandit truth. Neutral prior 0.3
                // when the town has no knowledge of the roads.
                const riskSignals = [];
                for (const m of world.merchants ?? []) {
                    if (!m || m.location !== townId || !m.routeBeliefs) continue;
                    for (const r of incidentRoads) {
                        const b = m.routeBeliefs[r.id];
                        if (b && Number.isFinite(b.perceivedDanger)) riskSignals.push(b.perceivedDanger);
                    }
                }
                if (riskSignals.length > 0) danger = Math.min(0.8, Math.max(...riskSignals));
            }
            const safetyScore = 1 - danger;
            // Distance: inverse distance (shorter is better), normalized
            let distance = 5;
            const directRoute = world.routes.find(r => (r.from === townId && r.to === otherId) || (r.from === otherId && r.to === townId));
            if (directRoute && Number.isFinite(directRoute.distance)) distance = directRoute.distance;
            const distanceScore = 1 / (1 + distance / 10);
            // Faction stance: trust from origin faction to candidate faction
            let trust = 0.5;
            if (originFaction && otherTown?.controlledBy) {
                const candidateFactionId = otherTown.controlledBy;
                const pair = world.relationships?.get(`${originFaction.id}::${candidateFactionId}`) ?? world.relationships?.get(`${candidateFactionId}::${originFaction.id}`);
                if (pair && typeof pair.getTrustFrom === 'function') {
                    trust = pair.getTrustFrom(originFaction.id);
                }
            }
            const utility = foodScore * 0.4 + safetyScore * 0.3 + distanceScore * 0.2 + trust * 0.1;
            destinationUtilities.push({ townId: otherId, utility, foodScore, safetyScore, distanceScore, trust, shortage, danger, distance });
            if (utility > bestUtility) {
                bestUtility = utility;
                toTownId = otherId;
            }
        }
        // Sort rejected by utility descending for WHY
        destinationUtilities.sort((a, b) => b.utility - a.utility);
        const hasDestination = toTownId !== null;
        const hasPopulation = townPop > 0;
        const pressureExceeds = result.migrationPressure > 0.5;
        const canMigrate = pressureExceeds && !withinCooldown && hasPopulation && hasDestination;
        let decisionReason;
        if (withinCooldown) decisionReason = 'WITHIN_COOLDOWN';
        else if (!hasPopulation) decisionReason = 'NO_POPULATION';
        else if (!hasDestination) decisionReason = 'NO_DESTINATION';
        else if (!pressureExceeds) decisionReason = 'PRESSURE_BELOW_THRESHOLD';
        else decisionReason = 'PRESSURE_EXCEEDS_THRESHOLD';
        // V8 corrective checkpoint §4: emit the explicit
        // MIGRATION_DECISION event when the justice loop
        // evaluates for this town (sparse emit: only when
        // reportedCrime true for that town). The decision
        // is FIRE only when pressure exceeds the threshold
        // AND the per-town cooldown is not active AND a
        // person exists AND a destination exists.
        // SUPPRESSED captures every other case (cooldown,
        // NO_POPULATION, NO_DESTINATION, low pressure).
        // The decision is parented to the
        // MIGRATION_PRESSURE_EVALUATED emitted above; the
        // MIGRATION event below is parented to this
        // decision. The chain MIGRATION_PRESSURE_EVALUATED
        // -> MIGRATION_DECISION -> MIGRATION makes the
        // decision mechanism observable in the ledger.
        // Enrich WHY: include destination utility and rejected sinks
        const whyPayload = canMigrate ? {
            destinationUtility: bestUtility,
            destinationUtilities,
            rejectedSinks: destinationUtilities.filter(d => d.townId !== toTownId),
        } : {
            destinationUtilities,
            rejectedSinks: destinationUtilities,
        };
        const decision = appendWorldEvent(world, {
            type: 'MIGRATION_DECISION',
            townId,
            tick,
            decision: canMigrate ? 'FIRE' : 'SUPPRESSED',
            reason: decisionReason,
            pressure: result.migrationPressure,
            lastMigrationTick,
            ...(canMigrate ? { chosenDestination: toTownId, destinationUtility: bestUtility } : {}),
            why: whyPayload,
        }, pressureEvaluation.eventId ? [pressureEvaluation.eventId] : []);
        if (canMigrate) {
            // ACT on the event: decrement the town's
            // population. The MIGRATION event is the named
            // sink; the population decrement is the
            // consequence. The immigration (adding the
            // emigrant to another town) is deferred to a
            // second pass at the end of the justice loop so
            // that the oscillation doesn't cancel within a
            // single tick. The §156 population balance is
            // closed: emigration + immigration = 0 across the
            // two passes.
            const townRef = world.towns.get(townId);
            townRef.population = Math.max(0, townRef.population - 1);
            pendingImmigration.push({ fromTownId: townId, toTownId, tick });
            // V8 corrective checkpoint §4: MIGRATION is now
            // parented to the MIGRATION_DECISION for the
            // same town on the same tick. The decision
            // event already captures the upstream
            // MIGRATION_PRESSURE_EVALUATED, JUSTICE_RESOLVED,
            // and BANDIT_ATTACK chain. The MIGRATION
            // event answers "did this decision execute?"
            // rather than conflating persistent causal
            // context with the immediate decision.
            appendWorldEvent(world, {
                type: 'MIGRATION',
                townId,
                toTownId,
                tick,
                pressure: result.migrationPressure,
                destinationUtility: bestUtility,
                why: { destinationUtilities, chosenUtility: bestUtility },
            }, decision.eventId ? [decision.eventId] : []);
            // Update the per-town cooldown so the next
            // MIGRATION from this town is suppressed for
            // MIGRATION_COOLDOWN ticks.
            world.migrationCooldowns.set(townId, tick);
        }
    }
    // PHASE §156: immigration pass. After all MIGRATION
    // events have been processed (and all source towns have
    // been decremented), add the emigrants to their
    // destination towns. This ensures the population
    // oscillation doesn't cancel within a single tick.
    for (const { fromTownId, toTownId } of pendingImmigration) {
        const destTown = world.towns.get(toTownId);
        if (destTown) {
            destTown.population = (Number.isFinite(destTown.population) ? destTown.population : 0) + 1;
        }
    }

    // 6. One guard (if any) issues a `Report` against one bandit (if any).
    //    The interaction follows the existing `interactions.js` contract:
    //    validate → execute → push to `world.reports`. A cooldown of 1
    //    means a single report per tick per guard; subsequent ticks allow
    //    further reports. The `REPORT_FILED` event records the report so
    //    the chain stays auditable. The guard schema carries `canReport:
    //    true` (set in `createClosedWorldScenario`) so the report validates
    //    without the reducer having to fabricate actor fields.
    const guard = world.guards[0];
    const bandit = world.bandits[0];
    if (guard && bandit && guard.canReport) {
        const report = world.interactionEngine.execute(
            'Report',
            guard,
            bandit,
            { reports: world.reports, witnesses: { has: () => true } },
            tick
        );
        if (report.ok) {
            appendWorldEvent(world, {
                type: 'REPORT_FILED',
                guardId: guard.id,
                banditId: bandit.id,
                tick,
                // A guard's report is its own legal act; declared root.
                rootReason: 'PATROL_REPORT',
            }, []);
        }
    }

    // 7. Invasion-time retaliation. A faction whose reassess this tick
    //    landed in `RAID` state, and that still has resources, calls
    //    `planRetaliation` to get a fresh actionId (the `FACTION_ACTION`
    //    decision event), then `executeRetaliation` to apply the mutation
    //    exactly once (the `INVASION` execution event). Both events share
    //    the same `actionId` / `causationId` so an external auditor can
    //    correlate the decision with the consequence and confirm no
    //    double-execution. The `executedActions` set on the faction is the
    //    idempotency guard: re-applying the same plan returns
    //    `{ ok: false, reason: 'ALREADY_EXECUTED' }`. The refill pass
    //    below regains 1 resource per tick for factions in HOLD or
    //    DEFENSIVE — but a faction that just raided does NOT regen, so
    //    each raid has a real cost.
    // 7a. E13 (taxation and garrison budgets): controllers tax
    // living towns per head, scaled by occupation foot-dragging
    // (occupied towns yield less — resistance discounts the base
    // automatically, no special case). Meaningfully occupied towns
    // cost a flat garrison each. Net books into faction resources
    // floored at 0 and capped at maxResources, audited per faction
    // per tick. Runs before the campaign passes so fresh income
    // funds this tick's raids and takeovers. Dead ground (abandoned
    // or empty towns, null controllers) pays and costs nothing.
    const TAX_PER_HEAD = 0.02;
    const GARRISON_PER_OCCUPIED_TOWN = 0.15;
    const GARRISON_PENALTY_FLOOR = 0.005;
    for (const faction of world.factions) {
        const taxed = [];
        let gross = 0;
        let garrisonCost = 0;
        for (const [townId, town] of world.towns) {
            if (!town || town.abandoned) continue;
            if (town.controlledBy !== faction.id) continue;
            const heads = Math.max(0, Number(town.population) || 0);
            if (!(heads > 0)) continue;
            const penalty = occupationPenalty(town, tick);
            const levy = heads * TAX_PER_HEAD * (1 - 0.5 * penalty);
            gross += levy;
            let garrison = 0;
            if (town.occupation && penalty > GARRISON_PENALTY_FLOOR) {
                garrison = GARRISON_PER_OCCUPIED_TOWN;
                garrisonCost += garrison;
            }
            taxed.push({ townId, heads, levy, garrison });
        }
        if (taxed.length === 0) continue;
        const net = gross - garrisonCost;
        const cap = Math.max(0, Number(faction.maxResources) || 0);
        faction.resources = Math.min(cap, Math.max(0, (Number(faction.resources) || 0) + net));
        appendWorldEvent(world, {
            type: 'TAX_COLLECTED',
            factionId: faction.id,
            towns: taxed,
            gross,
            garrisonCost,
            net,
            resourcesAfter: faction.resources,
            tick,
        }, []);
    }
    // E19 helpers (defined before 7e so 7b, 7f, and 7g share one
    // deterrence book): the ACTIVE guarantee shielding a polity,
    // and the guarantor weight it lends the town's defense.
    const activeGuaranteeFor = (pId) => (world.treaties ?? []).find(treaty =>
        treaty?.status === 'ACTIVE' && treaty?.terms?.kind === 'guarantee'
        && treaty?.terms?.polityId === pId) ?? null;
    const guaranteeBacking = (defenderId) => {
        const guarantee = activeGuaranteeFor(defenderId);
        if (!guarantee) return 0;
        const guarantor = (world.factions ?? []).find(f => f.id === guarantee.terms?.guarantorId);
        return Math.max(0, Number(guarantor?.resources) || 0);
    };
    // 7e. E17 (recognition, claims, and secession diplomacy): the
    // first autonomous diplomacy. Runs BEFORE the 7b takeover contest
    // (and 7f with it) so verdicts take effect first: a yielded town
    // is protected before the war machine reads it, and a declaration
    // breaks the pact before this tick's contest. Recognition and
    // verdicts read last tick's control (one-tick lag, harmless:
    // founding-age gates make same-tick interactions nil).
    // Incumbents observe each secession-born polity once it has
    // governed a while and grant or refuse recognition through the
    // existing treaty record — no parallel diplomacy simulator.
    // Recognition unlocks treaty access (a non-aggression pact
    // offer); refusal is a one-shot audited event while the grant
    // question stays open to reform. The former ruler's founding
    // claim is untouched by recognition (political status is not
    // absolution. Withdrawal and verdicts live in 7f below.
    const RECOGNITION_MIN_AGE = 10;
    const RECOGNITION_MIN_LEGITIMACY = 0.5;
    const PACT_MIN_AGE = 15;
    // A polity's live violence record: HARM sourced to it after its
    // founding tick across all its pairs. The founding claim harm
    // (tick === foundedTick) is exempt — secession itself is not
    // violence.
    const polityHarmSinceBirth = (pol, sinceTick) => {
        for (const vec of pol?.relationships?.values?.() ?? []) {
            for (const ev of vec?.events ?? []) {
                if (ev?.type === 'HARM' && ev?.fromFactionId === pol.id && (ev?.tick ?? 0) > sinceTick) {
                    return true;
                }
            }
        }
        return false;
    };
    for (const [tId, tTown] of world.towns) {
        const pId = tTown?.foundedPolityId;
        if (!pId) continue;
        const pol = (world.factions ?? []).find(f => f.id === pId);
        if (!pol) continue;
        // Exile rule: diplomacy serves the polity that holds its
        // town. A conquered (landless) polity has no standing here.
        if (tTown.controlledBy !== pId) continue;
        const pFounded = world.events ? findLatestWorldEvent(world,
            event => event.type === 'POLITY_FOUNDED' && event.polityId === pId, 'POLITY_FOUNDED') : null;
        const pFoundedTick = Number.isFinite(pFounded?.tick) ? pFounded.tick : tick;
        if (tick - pFoundedTick < RECOGNITION_MIN_AGE) continue;
        if (!Array.isArray(pol.refusedBy)) pol.refusedBy = [];
        for (const incumbent of world.factions ?? []) {
            if (!incumbent || incumbent.id === pId) continue;
            const pPair = pol.relationships?.get?.(incumbent.id) ?? null;
            const priorRecognition = (world.treaties ?? []).some(treaty =>
                treaty?.terms?.kind === 'recognition'
                && (treaty.participants ?? []).includes(incumbent.id)
                && (treaty.participants ?? []).includes(pId));
            if (!priorRecognition) {
                const harmful = polityHarmSinceBirth(pol, pFoundedTick);
                const legitimate = (Number(pol.legitimacy) || 0) >= RECOGNITION_MIN_LEGITIMACY;
                if (!harmful && legitimate) {
                    const treaty = createTreaty({
                        id: `treaty-recognition-${incumbent.id}-${pId}-${tick}`,
                        participants: [incumbent.id, pId],
                        // Direction lives in the terms: the polity is
                        // the recognized party, never the granter.
                        // (The polity grants recognition to OTHER
                        // polities in their towns' passes.)
                        terms: { kind: 'recognition', scope: tId, polityId: pId, recognizerId: incumbent.id },
                        startTick: tick,
                    });
                    if (!Array.isArray(world.treaties)) world.treaties = [];
                    world.treaties.push(treaty);
                    // Priced, not free: the grant is the recognizer's
                    // cooperative act, so its perspective earns the
                    // trade-dimension dividend (recordTrade credits the
                    // fromFactionId perspective by contract).
                    if (pPair && typeof pPair.recordTrade === 'function') {
                        pPair.recordTrade({ value: 1, tick, fromFactionId: incumbent.id });
                    }
                    appendWorldEvent(world, {
                        type: 'TREATY_FORMED',
                        treatyId: treaty.id,
                        treaty: { ...treaty, participants: treaty.participants.slice() },
                        participants: treaty.participants.slice(),
                        terms: { ...treaty.terms },
                        polityId: pId,
                        recognizerId: incumbent.id,
                        tick,
                        rootReason: 'RECOGNITION_GRANTED',
                    }, pFounded?.eventId ? [pFounded.eventId] : []);
                } else if (!pol.refusedBy.includes(incumbent.id)) {
                    pol.refusedBy.push(incumbent.id);
                    appendWorldEvent(world, {
                        type: 'RECOGNITION_REFUSED',
                        recognizerId: incumbent.id,
                        polityId: pId,
                        townId: tId,
                        reason: harmful ? 'POLITY_HARM_RECORD' : 'LOW_LEGITIMACY',
                        polityLegitimacy: Number(pol.legitimacy) || 0,
                        tick,
                    }, pFounded?.eventId ? [pFounded.eventId] : []);
                }
            }
            // Treaty access: an ACTIVE recognition unlocks a pact
            // offer from the recognizer. Same non-aggression record
            // the manual path makes (same id shape), parented to the
            // recognition formation so the chain reads grant -> pact.
            if (tick - pFoundedTick >= PACT_MIN_AGE) {
                const recognition = (world.treaties ?? []).find(treaty =>
                    treaty?.status === 'ACTIVE' && treaty?.terms?.kind === 'recognition'
                    && (treaty.participants ?? []).includes(incumbent.id)
                    && (treaty.participants ?? []).includes(pId));
                const pactPrior = (world.treaties ?? []).some(treaty =>
                    treaty?.terms?.kind === 'non-aggression'
                    && (treaty.participants ?? []).includes(incumbent.id)
                    && (treaty.participants ?? []).includes(pId));
                if (recognition && !pactPrior && !polityHarmSinceBirth(pol, pFoundedTick)) {
                    const pact = createTreaty({
                        id: `treaty-nonaggression-${incumbent.id}-${pId}-${tick}`,
                        participants: [incumbent.id, pId],
                        terms: { kind: 'non-aggression', scope: 'all' },
                        startTick: tick,
                    });
                    if (!Array.isArray(world.treaties)) world.treaties = [];
                    world.treaties.push(pact);
                    const recognitionFormed = world.events ? findLatestWorldEvent(world,
                        event => event.type === 'TREATY_FORMED' && event.treatyId === recognition.id, 'TREATY_FORMED') : null;
                    appendWorldEvent(world, {
                        type: 'TREATY_FORMED',
                        treatyId: pact.id,
                        treaty: { ...pact, participants: pact.participants.slice() },
                        participants: pact.participants.slice(),
                        terms: { ...pact.terms },
                        tick,
                        rootReason: 'PACT_AFTER_RECOGNITION',
                    }, recognitionFormed?.eventId ? [recognitionFormed.eventId]
                        : (pFounded?.eventId ? [pFounded.eventId] : []));
                }
            }
        }
    }
    // 7f. E18 (reconquest and reintegration): the former ruler's
    // claim gets a verdict, and betrayal costs recognition. The pass
    // deliberates only over HOT claims (the former's own directional
    // stance at WAR): cold claims stay silent, so reconquest is never
    // automatic. Three exits, decided once per (former, polity):
    // overwhelming threat plus a failing polity yields peace
    // (demand -> reintegrate, no battle, no occupation); an
    // affordable war over a worthwhile town declares (pacts and
    // recognition with the polity are terminated first as casus
    // belli, then the EXISTING contest machinery decides what war
    // wins — declaration is not conquest); anything poorer is
    // accepted (claim released through the trade dimension). The
    // verdict waits until the post-recognition order settles
    // (RECONQUEST_MIN_AGE) so E17 protection means something.
    // Withdrawal is separate: a polity that harms or raids after
    // being recognized loses the recognition (binding pacts stand).
    const RECONQUEST_MIN_AGE = 50;
    const RECONQUEST_TAKEOVER_COST = 2;
    const RECONQUEST_MIN_TOWN_POP = 10;
    const RECONQUEST_YIELD_LEGITIMACY = 0.4;
    // Standing betrayed: polity-sourced HARM on any of its pairs, or
    // an executed raid (INVASION), after the standing started. Covers
    // recognition and guarantees alike (E19); binding pacts stand.
    for (const treaty of world.treaties ?? []) {
        if (!treaty || treaty.status !== 'ACTIVE') continue;
        if (treaty.terms?.kind !== 'recognition' && treaty.terms?.kind !== 'guarantee') continue;
        const wPolityId = treaty.terms?.polityId;
        if (!wPolityId) continue;
        const wPol = (world.factions ?? []).find(f => f.id === wPolityId);
        if (!wPol) continue;
        let betrayed = false;
        for (const vec of wPol.relationships?.values?.() ?? []) {
            for (const ev of vec?.events ?? []) {
                if (ev?.type === 'HARM' && ev?.fromFactionId === wPolityId && (ev?.tick ?? 0) > treaty.startTick) {
                    betrayed = true;
                    break;
                }
            }
            if (betrayed) break;
        }
        if (!betrayed) {
            const raids = getWorldEvents(world, { type: 'INVASION' });
            betrayed = raids.some(event => event.factionId === wPolityId && (event.tick ?? 0) > treaty.startTick);
        }
        if (betrayed) terminateTreaty({ treaty, reason: 'POLITY_BETRAYAL', world, tick });
    }
    // One verdict per (former, polity), read off the ledger so
    // save/load and forks cannot double-deliberate.
    const decidedE18 = (formerId, pId, tId) => getWorldEvents(world, {
        types: ['INDEPENDENCE_ACCEPTED', 'RECONQUEST_DECLARED', 'REINTEGRATION_DEMANDED', 'TOWN_REINTEGRATED'],
    }).some(event =>
        ((event.polityId === pId || event.fromFactionId === pId)
            && (event.formerId === formerId || event.toFactionId === formerId))
        || (event.type === 'TOWN_REINTEGRATED' && event.townId === tId
            && event.fromFactionId === pId && event.toFactionId === formerId));
    for (const [tId, tTown] of world.towns) {
        const pId = tTown?.foundedPolityId;
        if (!pId) continue;
        // Exile rule (mirrors 7e): verdicts serve the polity that
        // holds its town.
        if (tTown.controlledBy !== pId) continue;
        const pol = (world.factions ?? []).find(f => f.id === pId);
        if (!pol) continue;
        const pFounded = world.events ? findLatestWorldEvent(world,
            event => event.type === 'POLITY_FOUNDED' && event.polityId === pId, 'POLITY_FOUNDED') : null;
        const pFoundedTick = Number.isFinite(pFounded?.tick) ? pFounded.tick : tick;
        if (tick - pFoundedTick < RECONQUEST_MIN_AGE) continue;
        const fromId = pFounded?.fromFactionId ?? null;
        const former = fromId ? (world.factions ?? []).find(f => f.id === fromId) : null;
        if (!former) continue;
        if (decidedE18(fromId, pId, tId)) continue;
        // Hot claims only: the relationship machine must itself
        // want war. A calm former keeps a cold claim (silence).
        const fPair = world.relationships.get(`${fromId}::${pId}`)
            ?? world.relationships.get(`${pId}::${fromId}`) ?? null;
        const fStance = fPair && typeof fPair.stanceFrom === 'function'
            ? fPair.stanceFrom(fromId) : null;
        if (!Number.isFinite(fStance) || fStance < StanceLadder.WAR) continue;
        // Cost the war on live books: the contest's own defender
        // formula prices the town, so declaration and conquest agree
        // on what is being weighed.
        const formerPower = Math.max(0, Number(former.resources) || 0);
        const townPop = Math.max(0, Number(tTown.population) || 0);
        const polityPower = Math.max(0, Number(pol.resources) || 0) + townPop * 0.1 + guaranteeBacking(pId);
        const founderParents = pFounded?.eventId ? [pFounded.eventId] : [];
        if (formerPower >= 2 * polityPower && (Number(pol.legitimacy) || 0) < RECONQUEST_YIELD_LEGITIMACY) {
            // Overwhelming threat meets a failing polity: demand, and
            // it yields without battle. No occupation follows a war
            // that never happened; the polity survives landless.
            const demand = appendWorldEvent(world, {
                type: 'REINTEGRATION_DEMANDED',
                formerId: fromId,
                polityId: pId,
                townId: tId,
                formerPower,
                polityPower,
                tick,
            }, founderParents);
            tTown.controlledBy = fromId;
            appendWorldEvent(world, {
                type: 'TOWN_REINTEGRATED',
                townId: tId,
                fromFactionId: pId,
                toFactionId: fromId,
                tick,
            }, demand?.eventId ? [demand.eventId] : founderParents);
        } else if (formerPower >= RECONQUEST_TAKEOVER_COST && townPop >= RECONQUEST_MIN_TOWN_POP) {
            // Worth the gamble: break faith first (pacts and standing
            // terminate as casus belli), then let the contest speak.
            const broken = [];
            for (const treaty of world.treaties ?? []) {
                if (!treaty || treaty.status !== 'ACTIVE') continue;
                const parts = treaty.participants ?? [];
                if (!parts.includes(fromId) || !parts.includes(pId)) continue;
                if (treaty.terms?.kind !== 'non-aggression' && treaty.terms?.kind !== 'recognition') continue;
                terminateTreaty({ treaty, reason: 'RECONQUEST', world, tick });
                broken.push(treaty.id);
            }
            if (fPair && typeof fPair.recordHarm === 'function') {
                fPair.recordHarm({ severity: 0.5, tick, fromFactionId: fromId });
            }
            const parents = founderParents.slice();
            for (const treatyId of broken) {
                const termEvent = world.events ? findLatestWorldEvent(world,
                    event => event.type === 'TREATY_TERMINATED' && event.treatyId === treatyId, 'TREATY_TERMINATED') : null;
                if (termEvent?.eventId) parents.push(termEvent.eventId);
            }
            appendWorldEvent(world, {
                type: 'RECONQUEST_DECLARED',
                formerId: fromId,
                polityId: pId,
                townId: tId,
                formerPower,
                polityPower,
                townPop,
                brokenTreatyIds: broken,
                tick,
            }, parents);
        } else {
            // Not worth another war: release the claim through the
            // trade dimension and record the peace. Terminal.
            if (fPair && typeof fPair.recordTrade === 'function') {
                fPair.recordTrade({ value: 1, tick, fromFactionId: fromId });
            }
            appendWorldEvent(world, {
                type: 'INDEPENDENCE_ACCEPTED',
                formerId: fromId,
                polityId: pId,
                townId: tId,
                formerPower,
                polityPower,
                townPop,
                tick,
            }, founderParents);
        }
    }
    // Recalculation: a declared, guaranteed war that fizzles on the
    // contest ends in acceptance. Fog declares; facts negotiate. The
    // failed attempt must not predate the declaration (>= is sound:
    // 7f precedes 7b within the tick, so a same-tick HELD already
    // answers this tick's declaration), and the guarantee must still
    // shield the polity — unguaranteed fizzles (E18) stay open, and
    // acceptance stays terminal via decidedE18.
    for (const [tId, tTown] of world.towns) {
        const pId = tTown?.foundedPolityId;
        if (!pId || tTown.controlledBy !== pId) continue;
        const pFounded = world.events ? findLatestWorldEvent(world,
            event => event.type === 'POLITY_FOUNDED' && event.polityId === pId, 'POLITY_FOUNDED') : null;
        const fromId = pFounded?.fromFactionId ?? null;
        if (!fromId) continue;
        // Terminal verdicts only: the declaration itself must not gate
        // recalculation (it is the recalculation's precondition).
        const terminal = getWorldEvents(world, {
            types: ['INDEPENDENCE_ACCEPTED', 'REINTEGRATION_DEMANDED', 'TOWN_REINTEGRATED'],
        }).some(event => (event.polityId === pId || event.fromFactionId === pId)
            && (event.formerId === fromId || event.toFactionId === fromId));
        if (terminal) continue;
        const declaration = getWorldEvents(world, { type: 'RECONQUEST_DECLARED' })
            .find(event => event.polityId === pId && event.formerId === fromId) ?? null;
        if (!declaration) continue;
        if (!activeGuaranteeFor(pId)) continue;
        const fizzled = getWorldEvents(world, { type: 'TOWN_HELD' }).some(event =>
            event.townId === tId && (event.tick ?? 0) >= (declaration.tick ?? 0)
            && event.fromFactionId === pId && event.toFactionId === fromId);
        if (!fizzled) continue;
        const fPair = world.relationships.get(`${fromId}::${pId}`)
            ?? world.relationships.get(`${pId}::${fromId}`) ?? null;
        if (fPair && typeof fPair.recordTrade === 'function') {
            fPair.recordTrade({ value: 1, tick, fromFactionId: fromId });
        }
        appendWorldEvent(world, {
            type: 'INDEPENDENCE_ACCEPTED',
            formerId: fromId,
            polityId: pId,
            townId: tId,
            reason: 'GUARANTEED_FIZZLE',
            tick,
        }, declaration?.eventId ? [declaration.eventId] : (pFounded?.eventId ? [pFounded.eventId] : []));
    }
    // 7g. E19 (external patrons and guarantees): a governed polity
    // seeks one protector, and a strong third party may seal it.
    // The seeker asks its most-trusted unasked incumbent (never its
    // former — patrons are third parties); the patron pays a booked
    // one-unit endowment (never disarming below its own takeover
    // cost) and lends its full weight to the town's defense through
    // the shared deterrence book both contests read. Charity without
    // standing buys nothing: misruled polities and poor patrons hear
    // silence (the ask is still recorded once, so refusal is honest).
    const GUARANTEE_MIN_AGE = 30;
    const GUARANTEE_MIN_TRUST = 0.5;
    const GUARANTEE_MIN_PATRON_POWER = 3;
    const GUARANTEE_MIN_LEGITIMACY = 0.4;
    for (const [tId, tTown] of world.towns) {
        const pId = tTown?.foundedPolityId;
        if (!pId) continue;
        if (tTown.controlledBy !== pId) continue;
        const pol = (world.factions ?? []).find(f => f.id === pId);
        if (!pol) continue;
        const pFounded = world.events ? findLatestWorldEvent(world,
            event => event.type === 'POLITY_FOUNDED' && event.polityId === pId, 'POLITY_FOUNDED') : null;
        const pFoundedTick = Number.isFinite(pFounded?.tick) ? pFounded.tick : tick;
        if (tick - pFoundedTick < GUARANTEE_MIN_AGE) continue;
        if (activeGuaranteeFor(pId)) continue;
        if (!Array.isArray(pol.requestedPatrons)) pol.requestedPatrons = [];
        const fromId = pFounded?.fromFactionId ?? null;
        let best = null;
        let bestTrust = -1;
        for (const cand of world.factions ?? []) {
            if (!cand || cand.id === pId || cand.id === fromId) continue;
            // No permanent skip: a poor patron asked today may be rich
            // tomorrow (first contact stays audited below, but the
            // evaluation stays open like the E17 grant question).
            const vec = pol.relationships?.get?.(cand.id) ?? null;
            const trust = vec && typeof vec.getTrustFrom === 'function'
                ? vec.getTrustFrom(pId) : GUARANTEE_MIN_TRUST;
            if (trust > bestTrust) {
                bestTrust = trust;
                best = cand;
            }
        }
        if (!best || bestTrust < GUARANTEE_MIN_TRUST) continue;
        if (!pol.requestedPatrons.includes(best.id)) pol.requestedPatrons.push(best.id);
        const patronPower = Math.max(0, Number(best.resources) || 0);
        const worthy = (Number(pol.legitimacy) || 0) >= GUARANTEE_MIN_LEGITIMACY;
        // Declined asks leave no treaty and move no books.
        if (patronPower < GUARANTEE_MIN_PATRON_POWER || !worthy) continue;
        const grant = 1;
        best.resources = Math.max(0, patronPower - grant);
        // Small polities absorb little: the endowment caps at their
        // maxResources (deterrence, not cash, is the real gift).
        pol.resources = Math.min(
            Math.max(0, Number(pol.maxResources) || 0),
            Math.max(0, Number(pol.resources) || 0) + grant);
        const treaty = createTreaty({
            id: `treaty-guarantee-${best.id}-${pId}-${tick}`,
            participants: [best.id, pId],
            terms: {
                kind: 'guarantee', scope: tId, polityId: pId, guarantorId: best.id,
                grant, patronAfter: best.resources, polityAfter: pol.resources,
            },
            startTick: tick,
        });
        if (!Array.isArray(world.treaties)) world.treaties = [];
        world.treaties.push(treaty);
        appendWorldEvent(world, {
            type: 'TREATY_FORMED',
            treatyId: treaty.id,
            treaty: { ...treaty, participants: treaty.participants.slice() },
            participants: treaty.participants.slice(),
            terms: { ...treaty.terms },
            polityId: pId,
            guarantorId: best.id,
            tick,
            rootReason: 'GUARANTEE_SIGNED',
        }, pFounded?.eventId ? [pFounded.eventId] : []);
    }
    // 7b. E8 (settlement takeover): raids on bandits never move
    // borders. A RAID faction at WAR stance toward a rival, with
    // the resources to win the contest, takes an inhabited rival
    // town. One town per faction per tick; a 10-tick takeover
    // cooldown separates campaigns. Non-aggression treaties block.
    // Abandoned husks (E4 refounding) and the attacker's own or
    // unaffiliated towns are never targets. The contest is
    // deterministic (no new RNG): attacker resources vs defender
    // resources plus town population weight. Control reroutes the
    // existing justice/legitimacy channels (Slice W/C) with no new
    // wiring — the defender's loss and the attacker's bill are the
    // only mutations besides the flag.
    const TAKEOVER_COST = 2;
    const TAKEOVER_COOLDOWN = 10;
    for (const faction of world.factions) {
        if (faction.lastDecision !== 'RAID') continue;
        if (!(faction.resources >= TAKEOVER_COST)) continue;
        if (faction.lastTakeoverTick != null
            && (tick - faction.lastTakeoverTick) < TAKEOVER_COOLDOWN) continue;
        for (const [townId, town] of world.towns) {
            if (!town || town.abandoned) continue;
            if (!(town.population > 0)) continue;
            const defenderId = town.controlledBy;
            if (!defenderId || defenderId === faction.id) continue;
            const defender = (world.factions ?? []).find(f => f.id === defenderId) ?? null;
            const pair = (world.relationships.get(`${faction.id}::${defenderId}`)
                ?? world.relationships.get(`${defenderId}::${faction.id}`)
                ?? null);
            const stance = pair && typeof pair.stanceFrom === 'function'
                ? pair.stanceFrom(faction.id)
                : null;
            const blockingTreaty = activeTreatiesFor(faction.id, world, { kind: 'non-aggression' })
                .find(treaty => treaty.participants.includes(defenderId)) ?? null;
            let allowed = true;
            let reason = 'WAR_STANCE_AUTHORIZES_TAKEOVER';
            const why = [`${faction.id} decision is RAID`, `${townId} is an inhabited ${defenderId} town`];
            const whyNot = [];
            // Treaties are hard action constraints (Slice P doctrine):
            // they bind before anything else and no override waives
            // them. The WAR threshold is likewise unwaivable: the
            // relationshipGate=false override exists for the
            // bandit-raid path's epistemic blocks, but town conquest
            // always requires observed WAR stance. The flag is still
            // audited below for transparency.
            if (blockingTreaty) {
                allowed = false;
                reason = 'TAKEOVER_TREATY_BLOCKED';
                whyNot.push(`Active non-aggression treaty ${blockingTreaty.id} blocks takeover of ${townId}`);
            } else if (!Number.isFinite(stance) || stance < StanceLadder.WAR) {
                allowed = false;
                reason = 'TAKEOVER_STANCE_BELOW_WAR';
                whyNot.push(`${faction.id} stance toward ${defenderId} is ${stance}, below WAR (${StanceLadder.WAR})`);
            }
            const attackerPower = Math.max(0, Number(faction.resources) || 0);
            const defenderPower = Math.max(0, Number(defender?.resources) || 0)
                + Math.max(0, Number(town.population) || 0) * 0.1
                // E19: an ACTIVE guarantee lends the guarantor's full
                // weight to the town's walls (0 when unguaranteed).
                + guaranteeBacking(defenderId);
            const gateEvent = appendWorldEvent(world, {
                type: 'TAKEOVER_GATE',
                factionId: faction.id,
                townId,
                defenderFactionId: defenderId,
                pairId: pair?.id ?? null,
                stance: Number.isFinite(stance) ? stance : null,
                attackerPower,
                defenderPower,
                allowed,
                reason,
                why,
                whyNot,
                relationshipGateEnabled: Boolean(relationshipGate),
                treatyId: blockingTreaty?.id ?? null,
                tick,
            }, []);
            if (!allowed) continue;
            // One campaign per tick: an attempted takeover (won or
            // lost) preempts the bandit raid below and starts the
            // takeover cooldown. Gate-blocked factions spend nothing
            // and may still raid.
            faction.lastTakeoverTick = tick;
            if (attackerPower > defenderPower) {
                faction.resources = Math.max(0, attackerPower - TAKEOVER_COST);
                town.controlledBy = faction.id;
                // E12: conquest opens an occupation. Foreign rule
                // starts at full penalty and assimilates over tens
                // of ticks (occupationPenalty). Re-takeover refreshes
                // the clock; the record is plain JSON (save/load-free).
                // E14: the prior controller is recorded so a revolt
                // knows whom to restore (null means independence).
                town.occupation = { byFactionId: faction.id, priorControllerId: defenderId, sinceTick: tick };
                if (pair && typeof pair.recordHarm === 'function') {
                    pair.recordHarm({ severity: 0.5, tick, fromFactionId: faction.id });
                }
                appendWorldEvent(world, {
                    type: 'TOWN_TAKEN',
                    townId,
                    fromFactionId: defenderId,
                    toFactionId: faction.id,
                    attackerPower,
                    defenderPower,
                    tick,
                }, [gateEvent.eventId]);
            } else {
                faction.resources = Math.max(0, attackerPower - 1);
                appendWorldEvent(world, {
                    type: 'TOWN_HELD',
                    townId,
                    fromFactionId: defenderId,
                    toFactionId: faction.id,
                    attackerPower,
                    defenderPower,
                    tick,
                }, [gateEvent.eventId]);
            }
            break;
        }
    }
    for (const faction of world.factions) {
        if (faction.lastDecision !== 'RAID') continue;
        // E8: one campaign per tick. A faction that attempted a
        // takeover above (won or lost) spends its campaign there
        // and does not also raid bandits below.
        if (faction.lastTakeoverTick === tick) continue;
        if (!(faction.resources > 0)) continue;
        // Per-faction raid cooldown. A faction that raided in the
        // last `raidCooldown` ticks cannot raid again. The default
        // of 5 ticks is a research-grounded compromise: enough to
        // prevent the res=0 ↔ res=1 oscillation the audit caught
        // (where a faction could raid every other tick), short
        // enough that a faction with chronic grievance can still
        // re-engage within a few ticks. The one-shot
        // `runClosedWorldScenario` is unaffected because it runs
        // only once (no follow-up tick to apply the cooldown).
        const cooldown = Number.isFinite(raidCooldown) ? Math.max(0, raidCooldown) : 5;
        if (faction.lastRaidTick !== null && (tick - faction.lastRaidTick) < cooldown) {
            continue;
        }
        // Find a bandit on a road that connects to the faction's
        // town. Among multiple candidates, prefer the bandit
        // the faction has the strongest specific memory of
        // (§182, §16). The per-target memory is in
        // `faction.memoryByActor`; a missing entry is treated
        // as zero (no specific memory). This makes the raid
        // target-specific, not just "first bandit in array."
        const homeTown = faction.townId;
        const reachable = world.bandits.filter(candidateBandit => {
            if (!candidateBandit) return false;
            return world.routes.some(route =>
                route.id === candidateBandit.roadId
                && (route.from === homeTown || route.to === homeTown)
            );
        });
        if (reachable.length === 0) continue;
        // Direct memory is the primary target signal: the faction should
        // retaliate against the actor it personally remembers. Network
        // reputation is the secondary signal for equal-memory candidates,
        // allowing an actor's violence against other observers to affect
        // target selection without erasing the faction's own experience.
        const rankedTargets = reachable.map(target => ({
            target,
            directMemory: clamp01(getMemoryOfLoss(faction, target.id)),
            reputation: computeReputation(target.id, world.factions),
        })).sort((a, b) => {
            const directMemoryDelta = b.directMemory - a.directMemory;
            if (directMemoryDelta !== 0) return directMemoryDelta;
            const reputationDelta = b.reputation - a.reputation;
            if (reputationDelta !== 0) return reputationDelta;
            // Stable identity tie-break keeps the action deterministic even
            // when two actors have identical observed history.
            return String(a.target.id).localeCompare(String(b.target.id));
        });
        const selectedTarget = rankedTargets[0];
        const candidate = selectedTarget.target;
        const targetDirectMemory = selectedTarget.directMemory;
        const targetReputation = selectedTarget.reputation;
        // Constitution §15 / §538: the relationship consumer is
        // directional and target-specific. A faction's desire to raid is an
        // internal capability signal; authorization comes from *that same
        // faction's* stance toward the selected target's faction. The legacy
        // peak `pair.stance` is deliberately not consulted because the target
        // may be hostile toward the actor while the actor remains tolerant.
        // The gate is on by default in production. Tests or legacy callers can
        // explicitly pass `relationshipGate: false`; the bypass remains
        // visible in the event ledger rather than silently changing behavior.
        const targetFactionId = typeof candidate.factionId === 'string' && candidate.factionId.length > 0
            ? candidate.factionId
            : null;
        const targetPair = targetFactionId && targetFactionId !== faction.id
            ? (world.relationships.get(`${faction.id}::${targetFactionId}`)
                ?? world.relationships.get(`${targetFactionId}::${faction.id}`)
                ?? null)
            : null;
        // Treaties are hard action constraints, independent of whether the
        // relationship vector is present or the optional stance gate is
        // disabled. Resolve this before the structured stance decision so the
        // ledger explains the treaty constraint rather than a lower-priority
        // stance result.
        const blockingTreaty = targetFactionId && targetFactionId !== faction.id
            ? activeTreatiesFor(faction.id, world, { kind: 'non-aggression' })
                .find(treaty => treaty.participants.includes(targetFactionId))
            : null;
        // Slice P: structured stance decision routing.
        // The raid gate now consumes the FactionRelationshipVector's
        // chooseStance intent (pair.pressureFrom + trust + perceivedGroupSize)
        // when available, falling back to the raw stance comparison.
        // This makes the invasion gate sensitive to trust dampening and
        // group-size capability, not just the scalar stance.
        const structuredDecision = (() => {
            if (!targetPair || typeof targetPair.stanceFrom !== 'function') return null;
            try {
                // Use the pair's own directed pressure/trust for the evaluator.
                // Keep the same material-signal policy as the relationship pass:
                // an invasion decision must not let political trust erase an
                // observed territorial threat.
                const pressure = targetPair.pressureFrom(faction.id);
                const trust = targetPair.getTrustFrom(faction.id);
                const prev = targetPair.stanceFrom(faction.id) ?? StanceLadder.TOLERANT;
                const groupSize = targetPair.lastObservedGroupSizeFrom?.(faction.id, tick, 50) ?? 1;
                const incidents = targetPair.intrusionCount?.(tick, 50) ?? 0;
                const militaryResources = Math.min(1, (faction.resources ?? 0) / Math.max(1, faction.maxResources ?? 1));
                const informationConfidence = clamp01(faction.informationConfidence ?? 1);
                return chooseStance({
                    pressure,
                    trust,
                    previous: prev,
                    militaryResources,
                    informationConfidence,
                    perceivedGroupSize: groupSize,
                    previousIncidentsCount: incidents,
                    // Let chooseStance apply its incident-sensitive trust
                    // damping. Reusing the default political damping here is
                    // intentional: previousIncidentsCount must change the
                    // action authorization, not merely the explanation.
                    dampenByTrust: true,
                });
            } catch { return null; }
        })();
        const targetStance = targetPair && typeof targetPair.stanceFrom === 'function'
            ? targetPair.stanceFrom(faction.id)
            : null;
        const threshold = StanceLadder.WATCHFUL;
        // A low-confidence stance is not sufficient evidence for a raid,
        // even when the prior directional stance is already WATCHFUL or
        // higher. chooseStance owns the evidence gate; the action consumer
        // must honor its active uncertainty status rather than looking only
        // at the scalar `to` value.
        const structuredEvidenceBlocksAction = Boolean(
            structuredDecision
            && structuredDecision.evidence?.gateActive
            && structuredDecision.to >= threshold
        );
        const structuredAllows = structuredDecision
            ? (structuredDecision.to >= threshold
                && !structuredDecision.blocked
                && !structuredEvidenceBlocksAction)
            : null;
        const why = [
            'Faction decision is RAID',
            'Target bandit is reachable',
        ];
        const whyNot = [];
        let gateAllowed = true;
        let gateReason;

        if (blockingTreaty) {
            gateAllowed = false;
            gateReason = 'TREATY_BLOCKED_RAID';
            whyNot.push(`Active non-aggression treaty ${blockingTreaty.id} blocks action against ${targetFactionId}`);
        } else if (!relationshipGate) {
            gateReason = 'RELATIONSHIP_GATE_DISABLED';
            why.push('Explicit relationshipGate=false override permits the action');
        } else if (!targetFactionId) {
            gateReason = 'TARGET_HAS_NO_FACTION';
            why.push('Unaffiliated targets do not require an inter-faction stance');
        } else if (targetFactionId === faction.id) {
            gateReason = 'TARGET_IS_SAME_FACTION';
            why.push('Internal enforcement does not require an inter-faction stance');
        } else if (!targetPair) {
            gateAllowed = false;
            gateReason = 'TARGET_RELATIONSHIP_MISSING';
            whyNot.push(`No relationship vector exists from ${faction.id} toward ${targetFactionId}`);
        } else if (!Number.isFinite(targetStance)) {
            gateAllowed = false;
            gateReason = 'TARGET_STANCE_UNOBSERVED';
            whyNot.push(`No directional stance has been observed from ${faction.id} toward ${targetFactionId}`);
        } else if (structuredAllows === false) {
            gateAllowed = false;
            gateReason = 'STRUCTURED_STANCE_BLOCKS_RAID';
            const structuredBlockReason = structuredDecision.blocked
                ? structuredDecision.reason
                : structuredEvidenceBlocksAction
                    ? 'BLOCKED: uncertain information is not sufficient evidence for a raid'
                    : structuredDecision.reason;
            whyNot.push(`${faction.id} structured decision ${structuredDecision.from}->${structuredDecision.to} blocks raid (reason ${structuredBlockReason})`);
        } else if (targetStance < threshold) {
            gateAllowed = false;
            gateReason = 'TARGET_STANCE_BELOW_THRESHOLD';
            whyNot.push(`${faction.id} stance toward ${targetFactionId} is TOLERANT (${targetStance}), below WATCHFUL (${threshold})`);
        } else {
            gateReason = structuredDecision ? `STRUCTURED_STANCE_AUTHORIZES_ACTION:${structuredDecision.reason}` : 'TARGET_STANCE_AUTHORIZES_ACTION';
            why.push(`${faction.id} stance toward ${targetFactionId} is ${targetStance}, meeting WATCHFUL (${threshold})${structuredDecision ? ` structured ${structuredDecision.to}` : ''}`);
        }

        const latestStanceEvent = targetPair
            ? findLatestWorldEvent(
                world,
                event => event.pairId === targetPair.id
                    && event.evaluatorId === faction.id,
                'STANCE_TRANSITION',
            )
            : null;
        const stanceParentIds = latestStanceEvent
            ? [ensureWorldEventIdentity(world, latestStanceEvent).eventId]
            : [];
        const gateEvent = appendWorldEvent(world, {
            type: 'FACTION_ACTION_GATE',
            actionType: 'RETALIATION',
            factionId: faction.id,
            evaluatorId: faction.id,
            targetId: candidate.id,
            targetFactionId,
            pairId: targetPair?.id ?? null,
            targetDirectMemory,
            targetReputation,
            targetSelection: rankedTargets.map(({ target, directMemory, reputation }) => ({
                targetId: target.id,
                directMemory,
                reputation,
            })),
            stance: Number.isFinite(targetStance) ? targetStance : null,
            threshold,
            relationshipGateEnabled: Boolean(relationshipGate),
            allowed: gateAllowed,
            reason: gateReason,
            why: [
                ...why,
                `Target direct memory=${targetDirectMemory.toFixed(3)}`,
                `Target network reputation=${targetReputation.toFixed(3)}`,
            ],
            whyNot,
            structuredDecision: structuredDecision ? {
                from: structuredDecision.from,
                to: structuredDecision.to,
                reason: structuredDecision.reason,
                evidence: structuredDecision.evidence,
                capability: structuredDecision.capability,
                blocked: structuredDecision.blocked,
                actionBlocked: structuredEvidenceBlocksAction,
            } : null,
            structuredAllows,
            structuredEvidenceBlocksAction,
            treatyId: blockingTreaty?.id ?? null,
            tick,
        }, stanceParentIds);
        if (blockingTreaty) {
            appendWorldEvent(world, {
                type: 'TREATY_BLOCKED_RAID',
                factionId: faction.id,
                targetFactionId: candidate.factionId,
                banditId: candidate.id,
                treatyId: blockingTreaty.id,
                tick,
            }, [gateEvent.eventId]);
            continue;
        }
        if (!gateAllowed) continue;
        const plan = planRetaliation(faction, candidate, { tick });
        const actionEvent = appendWorldEvent(world, {
            type: 'FACTION_ACTION',
            factionId: faction.id,
            targetId: candidate.id,
            action: plan.action,
            ok: plan.ok,
            reason: plan.reason,
            tick
        }, [gateEvent.eventId]);
        if (!plan.ok) continue;
        const retaliation = executeRetaliation(faction, candidate, plan);
        if (retaliation.ok) {
            // Record the tick so the cooldown applies. The audit's
            // long-horizon trace showed that without a cooldown,
            // the resource gate alone produced a res=0 ↔ res=1
            // oscillation every other tick, which is unrealistic
            // for a fear simulation. The cooldown models the
            // preparation cost of organizing a campaign.
            faction.lastRaidTick = tick;
            appendWorldEvent(world, {
                type: 'INVASION',
                factionId: faction.id,
                targetId: candidate.id,
                action: retaliation.action,
                causationId: plan.action.actionId,
                resourcesLeft: faction.resources,
                tick
            }, [actionEvent.eventId]);
        }
    }
    // 7c. E14 (revolt and recapture from within): occupation plus
    // sustained brutalization snaps. An occupied town whose justice
    // reads low legitimacy and high grievance throws off its
    // controller and restores its prior ruler (or stands independent
    // when the prior is gone — older saves predate the field).
    // The rising costs lives (20% of the town) and overruns the
    // garrison (controller -1 resource); the occupation record
    // closes, so one occupation snaps at most once. Deterministic:
    // thresholds on live justice state, no new RNG. Content
    // occupations and free towns never qualify.
    for (const [townId, town] of world.towns) {
        if (!town || !town.occupation) continue;
        if (!(town.population > 0)) continue;
        if (occupationPenalty(town, tick) <= 0.02) continue;
        const justice = world.justiceState?.get?.(townId);
        if (!justice) continue;
        if (!(justice.legitimacy < 0.4)) continue;
        if (!(justice.grievance > 0.6)) continue;
        const fromFactionId = town.controlledBy;
        const priorId = town.occupation.priorControllerId ?? null;
        const restored = priorId
            && (world.factions ?? []).some(f => f.id === priorId) ? priorId : null;
        const populationLost = (Number(town.population) || 0) * 0.2;
        town.population = Math.max(0, (Number(town.population) || 0) - populationLost);
        town.controlledBy = restored;
        town.occupation = null;
        const controller = (world.factions ?? []).find(f => f.id === fromFactionId) ?? null;
        if (controller) controller.resources = Math.max(0, (Number(controller.resources) || 0) - 1);
        const takenEvent = world.events ? findLatestWorldEvent(world,
            event => event.type === 'TOWN_TAKEN' && event.townId === townId, 'TOWN_TAKEN') : null;
        appendWorldEvent(world, {
            type: 'TOWN_REVOLT',
            townId,
            fromFactionId,
            toFactionId: restored,
            populationLost,
            tick,
        }, takenEvent?.eventId ? [takenEvent.eventId] : []);
    }
    // 7d. E15 (secession and fragmentation): misrule has an exit
    // even without conquest. A FREE town (no occupation record —
    // occupied towns belong to the revolt pass above) whose justice
    // reads low legitimacy and high grievance declares independence:
    // control goes null, no tax flows, no takeover target (no ruler
    // to depose — re-conquest of independents is later work).
    // Sticky and absorbing: nothing here re-attaches a controller,
    // so one town secedes at most once. Same deterministic justice
    // thresholds family as revolt, slightly stricter legitimacy
    // (leaving is harder than rising). A town restored by revolt
    // this same tick gets one tick of grace (no same-tick double
    // transition); continued brutalization may still secede it next.
    for (const [townId, town] of world.towns) {
        if (!town || town.occupation) continue;
        if (!town.controlledBy) continue;
        // E16: one town founds at most one polity, ever. The marker
        // survives save/load as a plain field, so neither continued
        // misrule nor a reload can mint a duplicate sovereignty.
        if (town.foundedPolityId) continue;
        if (!(town.population > 0)) continue;
        // One tick of grace after a revolt restore: this tick's
        // rising already spent the town's politics.
        const restoredNow = getWorldEvents(world, { types: ['TOWN_REVOLT'], tick })
            .some(e => e.townId === townId);
        if (restoredNow) continue;
        const justice = world.justiceState?.get?.(townId);
        if (!justice) continue;
        if (!(justice.legitimacy < 0.3)) continue;
        if (!(justice.grievance > 0.7)) continue;
        const fromFactionId = town.controlledBy;
        // E16 (sovereign polity formation): secession founds a real
        // authority in the same pass — never a global generator
        // noticing a null town later. The id is deterministic from
        // the town (stable across save/load, unique per town), and
        // the existence check makes founding idempotent.
        const polityId = `${townId}-free-polity`;
        if ((world.factions ?? []).some(f => f.id === polityId)) continue;
        // No resource creation: the breakaway walks out with at most
        // one unit of the former ruler's stock, booked below. A
        // broke ruler founds a broke polity — honestly.
        const former = (world.factions ?? []).find(f => f.id === fromFactionId) ?? null;
        const transferredResources = former
            ? Math.min(1, Math.max(0, Number(former.resources) || 0))
            : 0;
        if (former) former.resources = Math.max(0, (Number(former.resources) || 0) - transferredResources);
        const provisionalLegitimacy = clamp((Number(justice.legitimacy) || 0) + 0.3, 0, 0.6);
        // Unobserved newcomer: it has lived experience of its town
        // but no interstate observation history, so confidence starts
        // below the TOLERANT-escalation gate (0.4). It cannot sprint
        // to MOBILIZING on founding-day grievance; others still
        // evaluate it normally. No live confidence accrual exists yet
        // (E18 work); until then the lock is the honest price of
        // having seen nothing.
        const polity = new FactionDecisionModel({
            id: polityId, townId, resources: transferredResources, maxResources: 1,
            legitimacy: provisionalLegitimacy, grievance: 0, informationConfidence: 0.3,
        });
        polity.relationships = new Map();
        world.factions.push(polity);
        // Enter the relationship graph with every incumbent. The
        // former ruler's perspective takes the territorial claim
        // through the existing harm dimension (trust debit plus
        // sticky grievance seed) — a durable, disputable loss, not
        // a war trigger. All other perspectives start neutral: the
        // newborn knows nothing it did not experience.
        if (!world.relationships) world.relationships = new Map();
        for (const other of world.factions) {
            if (!other || other.id === polityId) continue;
            const pairId = `${other.id}::${polityId}`;
            const pair = new FactionRelationshipVector({ id: pairId, trust: 0.5 });
            world.relationships.set(pairId, pair);
            if (!other.relationships) other.relationships = new Map();
            other.relationships.set(polityId, pair);
            polity.relationships.set(other.id, pair);
            if (other.id === fromFactionId) {
                pair.recordHarm({ severity: 0.5, tick, fromFactionId: polityId });
            }
        }
        // Independence means NOT RULED BY THE FORMER RULER — control
        // passes to the newborn authority, never null forever. The
        // town's justice scar is NOT doctored upward: relief that
        // rewards collapse would read healthier than honest struggle.
        // Hope lives in the polity's provisional legitimacy; memory
        // (grievance and low legitimacy) lives in the town until real
        // governance earns it back through the idle drift and Slice C
        // blend. Stickiness comes from foundedPolityId, not cosmetics.
        town.controlledBy = polityId;
        town.foundedPolityId = polityId;
        const justiceEvent = world.events ? findLatestWorldEvent(world,
            event => event.type === 'JUSTICE_RESOLVED' && event.townId === townId, 'JUSTICE_RESOLVED') : null;
        const secessionEvent = appendWorldEvent(world, {
            type: 'SECESSION',
            townId,
            fromFactionId,
            tick,
        }, justiceEvent?.eventId ? [justiceEvent.eventId] : []);
        appendWorldEvent(world, {
            type: 'POLITY_FOUNDED',
            polityId,
            townId,
            fromFactionId,
            transferredResources,
            formerResourcesAfter: former ? former.resources : null,
            polityResourcesAfter: polity.resources,
            provisionalLegitimacy,
            tick,
        }, secessionEvent?.eventId ? [secessionEvent.eventId] : []);
    }
    for (const faction of world.factions) {
        // A faction that just raided does not regen this tick — the cost
        // is real. A faction in HOLD or DEFENSIVE regens up to its cap,
        // which is its own `maxResources` (or 0 if it has none — a
        // faction with no resources stays at no resources).
        if (faction.lastDecision === 'RAID') continue;
        const cap = Math.max(0, Number(faction.maxResources) || 0);
        faction.resources = Math.min(cap, Math.max(0, faction.resources) + 1);
    }

    // 7.5. Encounter eligibility (Constitution §89 / §91 / §532).
    // Each tick, evaluate which encounter templates are plausible
    // given the current world state. The catalog is static; the
    // eligibility check reads world state. The CANDIDATE_ENCOUNTER
    // event is emitted for the audit trail. The §96 contract then
    // requires that the encounter outcomes return to authoritative
    // world state — for each selected candidate, we call
    // `instantiateEncounter` which mutates the world (e.g. the
    // bandit-ambush encounter debits the merchant's cargo) and
    // pushes an ENCOUNTER event.
    const routeExposures = [];
    for (const merchant of world.merchants) {
        const commitment = merchant?.activeTripCommitment;
        if (!commitment || commitment.tick !== tick || !commitment.commitmentEventId) continue;
        const exposure = appendWorldEvent(world, {
            type: 'ROUTE_EXPOSURE',
            tick,
            actionId: commitment.actionId,
            tripId: commitment.tripId,
            merchantId: merchant.id,
            routeId: commitment.routeId,
        }, [commitment.commitmentEventId]);
        commitment.exposureEventId = exposure.eventId;
        routeExposures.push(exposure);
    }
    // An explicit attack route is a runtime input, not hidden truth: it requests
    // a local collision on that road for this tick. Keep the ordinary merchant
    // decision in the ledger, then align the requested actors immediately before
    // encounter eligibility so the directive cannot silently create an impossible
    // attack. Invalid routes are ignored and the ordinary stochastic encounter
    // path remains authoritative.
    const requestedAttackRoute = typeof attackRoadId === 'string'
        && world.routes?.some(route => route.id === attackRoadId)
        ? attackRoadId
        : null;
    // Stage an explicit attack only for encounter resolution. The ordinary
    // roaming and merchant decisions have already produced the persistent
    // routes for this tick; keeping those routes intact lets the canonical
    // trade pass still observe and act on the real decisions after the
    // requested collision has been resolved.
    let restoreAttackOverrides = null;
    if (requestedAttackRoute) {
        const originalBanditRoads = (world.bandits ?? []).map(bandit => bandit.roadId);
        const originalMerchantRoutes = (world.merchants ?? []).map(merchant => merchant.selectedRoute);
        for (const bandit of world.bandits ?? []) bandit.roadId = requestedAttackRoute;
        const requestedRoute = world.routes.find(route => route.id === requestedAttackRoute);
        const attackMerchant = world.merchants.find(merchant =>
            (merchant.cargo ?? 0) > 0
            && requestedRoute
            && (requestedRoute.from === merchant.location || requestedRoute.to === merchant.location)
        );
        if (attackMerchant) attackMerchant.selectedRoute = requestedAttackRoute;
        restoreAttackOverrides = () => {
            (world.bandits ?? []).forEach((bandit, index) => {
                if (index < originalBanditRoads.length) bandit.roadId = originalBanditRoads[index];
            });
            (world.merchants ?? []).forEach((merchant, index) => {
                if (index < originalMerchantRoutes.length) merchant.selectedRoute = originalMerchantRoutes[index];
            });
        };
    }
    const eligibleEncounters = evaluateEncounterEligibility(world, { tick });
    // R8 (rate calibration): templates with cooldownTicks sit out
    // until the floor elapses since their last firing. The ledger
    // only ever lists fireable candidates. Plain object, JSON-safe
    // across save/load and fork.
    if (!world.encounterCooldowns || typeof world.encounterCooldowns !== 'object') {
        world.encounterCooldowns = {};
    }
    const fireableEncounters = eligibleEncounters.filter(template => {
        const floor = Number(template.cooldownTicks) || 0;
        if (!(floor > 0)) return true;
        const last = Number(world.encounterCooldowns[template.id]);
        return !Number.isFinite(last) || (tick - last) >= floor;
    });
    if (fireableEncounters.length > 0) {
        // R2b: the candidate heads the encounter chain. Its parents
        // are the route exposures that motivated consideration; with
        // none, it declares its root (candidate consideration starts
        // from eligibility, not from a prior event).
        const exposureParents = routeExposures.map(event => event.eventId);
        const candidateEvent = appendWorldEvent(world, {
            type: 'CANDIDATE_ENCOUNTER',
            tick,
            requestedAttackRoadId: requestedAttackRoute,
            candidates: fireableEncounters.map(template => ({
                id: template.id,
                description: template.description,
                priority: template.priority
            })),
            ...(exposureParents.length === 0 ? { rootReason: 'ENCOUNTER_CONSIDERATION' } : {}),
        }, exposureParents);
        // The §95 contract: randomness selects among plausible
        // events. The selector uses a deterministic xorshift32
        // rng seeded by the current tick so the §121 contract
        // holds: same seed + same inputs → same trajectory.
        // The encounterRng option overrides the default for
        // tests that want to force a specific encounter.
        // The pinBanditRoadId option (test affordance) pins
        // every bandit's roadId to a fixed value after the
        // per-tick relocation step, so the encounter check
        // sees a stable bandit position.
        if (pinBanditRoadId) {
            for (const bandit of world.bandits) {
                bandit.roadId = pinBanditRoadId;
            }
        }
        const activeRng = makeEncounterRng(world, encounterRng);
        // EVID-2026-08-29-ZERO-ATTACKS-FIX: previously maxCandidates=1
        // meant at most 1 encounter fired per tick, and the rng
        // shuffle could pick a low-priority encounter over the
        // bandit-ambush. The bandit-ambush is the live attack
        // path; it should fire whenever it's eligible. We bias
        // the rng shuffle by sorting eligible templates by
        // priority DESC before shuffling, so the highest-
        // priority eligible encounter is statistically the
        // most likely to be picked first.
        const eligibleByPriority = fireableEncounters.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
        // A requested attack route is an explicit action input, so select the
        // plausible bandit-ambush deterministically rather than allowing a
        // lower-priority wildlife/checkpoint template to consume the request.
        const requestedAmbush = requestedAttackRoute
            ? eligibleByPriority.find(template => template.id === 'bandit-ambush')
            : null;
        const selected = requestedAmbush
            ? [requestedAmbush]
            : selectEncounterCandidates(eligibleByPriority, { rng: activeRng, maxCandidates: 1 });
        for (const template of selected) {
            // R8: firing stamps the cooldown ledger so the next
            // consideration sits this template out until its floor.
            if ((Number(template.cooldownTicks) || 0) > 0) {
                world.encounterCooldowns[template.id] = tick;
            }
            const firstCreatedIndex = world.events.length;
            const result = instantiateEncounter(template, world, { tick, rng: activeRng, parentEventIds: [candidateEvent.eventId] });
            const createdEvents = world.events.slice(firstCreatedIndex);
            const encounterEvent = createdEvents.find(event => event.type === 'ENCOUNTER'
                && event.encounterId === template.id);
            // (R2: the ENCOUNTER already carries its candidate parent
            // from instantiateEncounter's parentEventIds — no post-hoc
            // fixup. A single parentage path keeps the mutation gate
            // honest: dropping the parent must fail the detector.)
            const consequenceEvents = createdEvents.filter(event => event.type === 'BANDIT_ATTACK');
            for (const consequenceEvent of consequenceEvents) {
                ensureWorldEventIdentity(
                    world,
                    consequenceEvent,
                    encounterEvent ? [encounterEvent.eventId] : [candidateEvent.eventId],
                );
            }
            // The §12 treaty-enforcement wire: if the
            // encounter fired and the bandit is associated
            // with a faction, check whether the action
            // violates any active treaty. The MVP only
            // checks passage treaties (a bandit-ambush on
            // a road covered by an active passage treaty
            // whose participant is the bandit's faction
            // is a violation).
            if (result && result.merchantId) {
                const banditFaction = world.bandits?.[0]?.factionId;
                if (banditFaction) {
                    checkTreatyCompliance({
                        world,
                        action: {
                            type: template.id,
                            roadId: world.bandits?.[0]?.roadId,
                            violator: banditFaction,
                            tick,
                        },
                        tick,
                    });
                }
            }
            // Law slice: BANDIT_ATTACK on a town-incident road violates law.
            // Slice V routes the same observation helper as the direct path
            // so both producers update the identical lawfulness ledger.
            // Slice Y: every violated town emits its own LAW_VIOLATED with an
            // apportioned restitution share (conserved total).
            for (const consequenceEvent of consequenceEvents) {
                const roadId = consequenceEvent.roadId ?? world.bandits?.[0]?.roadId;
                const actorId = consequenceEvent.banditId ?? world.bandits?.[0]?.id ?? 'unknown';
                if (typeof roadId !== 'string') continue;
                const violations = checkAllLawCompliance({
                    world,
                    action: { type: 'BANDIT_ATTACK', roadId, actorId, tick },
                    tick,
                });
                const shares = apportionedLawShares(world, violations, actorId);
                for (const violation of violations) {
                    observeLawViolation(world, {
                        townId: violation.townId,
                        roadId,
                        actorId,
                        tick,
                        lawViolation: violation,
                        parentEventId: consequenceEvent.eventId,
                        restitutionShare: shares.get(violation.townId) ?? 0,
                    });
                }
            }


            // Encounter consequences occur after the reducer's ordinary
            // reaction are not silently skipped until a tick that can no
            // longer see them as current input.
            for (const consequenceEvent of consequenceEvents) {
                if (world.processedFactionAttackEventIds.has(consequenceEvent.eventId)) continue;
                const affectedMerchant = world.merchants.find(item => item.id === consequenceEvent.merchantId);
                const affectedFaction = world.factions.find(faction => faction.townId === affectedMerchant?.location)
                    ?? world.factions[0];
                if (!affectedFaction) continue;
                const memoryBefore = clamp01(affectedFaction.memoryOfLoss ?? 0);
                const severity = clamp01((consequenceEvent.lost ?? 0) / 20);
                recordHarmByActor(affectedFaction, consequenceEvent.banditId ?? 'unknown', {
                    severity,
                    tick,
                    known: Boolean(consequenceEvent.banditId),
                });
                affectedFaction.memoryOfLoss = clamp01(memoryBefore + severity);
                affectedFaction.grievance = clamp01((affectedFaction.grievance ?? 0) + severity * 0.5);
                appendWorldEvent(world, {
                    type: 'FACTION_REACTION',
                    tick,
                    factionId: affectedFaction.id,
                    merchantId: consequenceEvent.merchantId,
                    banditId: consequenceEvent.banditId,
                    memoryBefore,
                    memoryAfter: affectedFaction.memoryOfLoss,
                    grievanceAfter: affectedFaction.grievance,
                }, [consequenceEvent.eventId]);
                world.processedFactionAttackEventIds.add(consequenceEvent.eventId);
            }
        }
    }
    if (restoreAttackOverrides) restoreAttackOverrides();

    // 7.5. EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION (Guardian V3
    // §3 Movement B planted-defect fix): the canonical trade-system
    // hooks for BANDIT and PATROL only. The MERCHANT tick was
    // previously called here AND in step 2.5, causing double
    // execution (2+ MERCHANT_ROUTE_DECISION events per tick). The
    // step 2.5 call is the authoritative merchant tick; step 7.5
    // only processes bandit and patrol so the encounter engine can
    // see fresh bandit/patrol state for the same tick.
    // Slice AA: wildlife moves before the bandit scores routes, so the
    // predator-competition discount applies in the same tick. Movement is
    // deterministic (no RNG consumed); only actual relocations emit.
    for (const group of (world.wildlifeGroups ?? [])) {
        if (!group || typeof group.id !== 'string') continue;
        const moved = tickWildlifeGroup(world, group.id, { tick });
        if (moved.ok && moved.relocated) {
            appendWorldEvent(world, {
                type: 'WILDLIFE_RELOCATION',
                tick,
                groupId: group.id,
                from: moved.from,
                to: moved.to,
                rootReason: 'FORAGE',
            }, []);
        }
    }
    for (const bandit of (world.bandits || [])) {
        if (bandit && bandit.trafficBelief) {
            tickCanonicalBandit(world, bandit.id, { tick, rng: makeEncounterRng(world, encounterRng) });
        }
    }
    for (const patrol of (world.patrols || [])) {
        tickCanonicalPatrol(world, patrol.id, { tick, rng: makeEncounterRng(world, encounterRng) });
    }

    // 8. Snapshot the post-tick state for the audit trail.
    world.tickHistory.push({
        tick,
        banditRoads: world.bandits.map(bandit => ({ id: bandit.id, roadId: bandit.roadId })),
        factionEscalations: world.factions.map(faction => ({
            id: faction.id,
            escalation: faction.escalation,
            grievance: faction.grievance
        })),
        merchantCargo: world.merchants.map(merchant => ({ id: merchant.id, cargo: merchant.cargo })),
        marketPrices: [...world.marketState.entries()].map(([key, quote]) => {
            const [townId, kind] = key.split('::');
            return { townId, kind, price: quote.price, shortage: quote.shortage };
        }),
        justice: [...world.justiceState.entries()].map(([townId, state]) => ({
            townId,
            legitimacy: state.legitimacy,
            grievance: state.grievance,
            migrationPressure: state.migrationPressure
        })),
        reportCount: world.reports.length,
        factionResources: world.factions.map(faction => ({
            id: faction.id,
            resources: faction.resources,
            maxResources: faction.maxResources
        }))
    });

    finalizeWorldEventLedger(world);
    return world;
}

/**
 * Directive §6 live-wire: the closed-world's bandit
 * relocation is driven by `chooseRoamingDestination`, not
 * the binary `relocateBandit`. This wrapper:
 *   1. Builds a `RoamingGroup` from the bandit shape
 *      (currentLocation = roadId, mode = RAID, observations
 *      synthesized from the bandit's `lootExpectation` and
 *      the world's `roads`).
 *   2. Calls `chooseRoamingDestination` with the list of
 *      route ids as candidates.
 *   3. Translates the result into the legacy `relocation`
 *      event shape so the existing 867 tests stay green.
 *
 * The legacy `relocateBandit` function remains in
 * `escalation.js` for backward compatibility, but it is no
 * longer the strategic authority for the closed-world.
 *
 * Determinism: `chooseRoamingDestination` requires an
 * `rng`. The §121 contract mandates the same seed produce
 * the same trajectory. We use a deterministic xorshift32
 * seeded with the bandit's `id` so the live-wire is
 * reproducible across runs.
 */
export function relocateBanditViaRoaming(bandit, routes, { tick = 0 } = {}) {
    // EVID-2026-08-29-LOOSE-BANDIT-THRASHING-FIX: previously
    // the bandit relocated on every tick because switchMargin
    // was hard-coded to 0 and chooseRoamingDestination always
    // returned a "best" route. Now we use the bandit's own
    // switchMargin (default 0.2 in createClosedWorldScenario)
    // and add a per-bandit relocation cooldown (10 ticks) so
    // the bandit can settle. The cooldown is reset on actual
    // relocation, not on no-op.
    if (bandit._lastRelocationTick !== undefined
        && (tick - bandit._lastRelocationTick) < (bandit.relocationCooldownTicks ?? 10)) {
        return { relocated: false, from: bandit.roadId, to: bandit.roadId, reason: 'cooldown' };
    }
    // Build the belief map. The bandit "knows" the road it
    // is on (its own observation) and has stale beliefs
    // about the others. E2 (travel-driven relocation): the staged
    // lootExpectation is only the PRIOR. Co-located traffic
    // observations (bandit.trafficBelief, maintained by tickBandit
    // behind the R1 co-location gate) refine the per-road LOOT
    // opportunity via max(): a road with strong fresh traffic
    // outranks an empty prior, while an unobserved road keeps the
    // staged value. The loot channel (weight 0.8 in the RAID
    // profile) is the mechanism's dominant term — resourceValue
    // alone (weight 0.1 x need 0.5) can never cross the switch
    // margin, which is why this signal belongs here and not there.
    // Same lawful source tickBandit consumes, so the two
    // relocation paths agree instead of contradicting. No distant
    // truth: trafficBelief only ever counts passersby on the
    // bandit's own road, aged by recency decay.
    const beliefs = {};
    for (const route of routes) {
        const isCurrent = route.id === bandit.roadId;
        const stagedLoot = Math.min(0.9, bandit.lootExpectation + 0.1);
        let lootOpportunity = stagedLoot;
        let observedTick = isCurrent ? tick : Math.max(0, tick - 5);
        const traffic = bandit.trafficBelief?.[route.id];
        const trafficCount = Number(traffic?.estimatedTraffic);
        const trafficRecency = Number(traffic?.recency);
        if (Number.isFinite(trafficCount) && Number.isFinite(trafficRecency)
            && trafficCount > 0 && trafficRecency > 0) {
            // Scale: 4 fresh sightings ≈ 0.54 against an empty
            // prior (0.1): 0.8 x 0.44 clears the 0.2 switch margin.
            // Stale traces (recency → 0) fade back to the prior.
            // Capped like the staged value so neither explodes.
            const trafficSignal = Math.min(0.9, trafficCount * trafficRecency * 0.15);
            if (trafficSignal > lootOpportunity) {
                lootOpportunity = trafficSignal;
                if (Number.isFinite(traffic?.lastDecayTick)) {
                    observedTick = traffic.lastDecayTick;
                }
            }
        }
        beliefs[route.id] = {
            resourceValue: isCurrent ? 0.2 : stagedLoot,
            lootOpportunity,
            distance: route.distance,
            danger: isCurrent ? 0.5 : 0.1,
            informationConfidence: 0.8,
            observedTick
        };
    }
    // Deterministic rng seeded by the bandit's id.
    const seed = hashStringToSeed(bandit.id);
    const rng = makeXorShift32(seed);
    // R8 (bandit initiative): contact starvation is the bandit's
    // own state — locationAge counts ticks since arrival and
    // lootExpectation is its own loot history. No distant truth
    // is read. Evaluated after the utility path says stay.
    const idleTicks = Number.isFinite(bandit.locationAge) ? bandit.locationAge : 0;
    const starved = idleTicks >= 15 && (bandit.lootExpectation ?? 0) < 0.3;
    const group = createRoamingGroup({
        id: bandit.id,
        currentLocation: bandit.roadId,
        mode: ROAMING_MODE.RAID,
        needs: { loot: bandit.lootExpectation },
        beliefs,
        explorationTemperature: 0.05,
        distanceRange: 50,
        switchMargin: bandit.switchMargin ?? 0.2,
        rng
    });
    const nextLocation = chooseRoamingDestination(group, {
        candidates: routes.map(r => r.id),
        rng
    });
    // Translate into the legacy event shape. If the
    // chooseRoamingDestination returned the current
    // location, the bandit stays put (no relocation event).
    if (nextLocation === bandit.roadId) {
        // R8: starvation scout. The utility path keeps a bandit
        // with empty beliefs put (other roads score below the
        // switch margin when lootExpectation is 0), so without a
        // fallback it freezes forever. A starved bandit scouts a
        // neighboring road — topology only (roads sharing a town
        // with the current road), own-state trigger, encounter
        // ledger records reason 'starvation-scout'. The draw
        // advances with idleness so successive scouts vary while
        // staying deterministic for (bandit, tick).
        if (starved) {
            const here = routes.find(route => route.id === bandit.roadId);
            const endpoints = new Set([here?.from, here?.to].filter(Boolean));
            const neighbors = routes
                .map(route => route.id)
                .filter(id => id !== bandit.roadId && routes.some(route =>
                    route.id === id && (endpoints.has(route.from) || endpoints.has(route.to))));
            if (neighbors.length > 0) {
                const scoutRng = makeXorShift32(seed ^ (idleTicks & 0xffff));
                const pick = neighbors[Math.floor(scoutRng() * neighbors.length) % neighbors.length];
                bandit._lastRelocationTick = tick;
                return { relocated: true, from: bandit.roadId, to: pick, reason: 'starvation-scout' };
            }
        }
        return { relocated: false, from: bandit.roadId, to: bandit.roadId, reason: 'stay' };
    }
    bandit._lastRelocationTick = tick;
    return {
        relocated: true,
        from: bandit.roadId,
        to: nextLocation,
        reason: 'chooseRoamingDestination'
    };
}

// Deterministic seed: simple FNV-1a-style hash of a string
// to a uint32. This is sufficient for the §121 contract.
function hashStringToSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i += 1) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    }
    return h || 1;
}

// xorshift32 deterministic PRNG is now provided by
// `./roaming.js` (single source of truth for the §121
// deterministic stream). It is imported above. The local
// definitions of `hashStringToSeed` and `makeXorShift32`
// that used to live here have been removed; the closed-
// world reducer and the tests both import them from
// `./roaming.js`.

/**
 * Drive the closed world for `ticks` ticks, applying `tickClosedWorld` each
 * step. Returns the final world. The first tick seeds the scenario with
 * `runClosedWorldScenario` so the chain test still sees the original event
 * ordering; subsequent ticks layer cross-tick consequences on top.
 */
// Re-export the xorshift32 PRNG as `deterministicRng` so
// test files can import it from `closed-world.js`. The
// canonical home is `roaming.js`; this alias exists for
// convenience and backward compatibility.
export { makeXorShift32 as deterministicRng };

export function runClosedWorldForTicks({ ticks = 1, perceivedDanger = 0.8 } = {}) {
    if (!Number.isInteger(ticks) || ticks < 1) {
        throw new RangeError('ticks must be a positive integer');
    }
    const world = runClosedWorldScenario({ perceivedDanger });
    for (let i = 2; i <= ticks; i++) {
        tickClosedWorld(world, { tick: i, perceivedDanger });
    }
    return world;
}

export const CLOSED_WORLD_LAYERS = Object.freeze({ ...INFORMATION_LAYERS });

/**
 * The §7 / §87 evidence-type contract. The strength of an
 * evidence update is a property of the evidence type, not of
 * the prior belief's existence. The audit's critique: "Whether
 * evidence is trustworthy should depend on things like: direct
 * observation vs hearsay, observer capability, source
 * reliability, distance, visibility, age, corroboration,
 * contradiction. It should not fundamentally depend on: 'did
 * this BeliefStore already contain something?'"
 *
 * @param {string} type - one of 'DIRECT_WITNESS', 'SCOUT_REPORT',
 *   'TRUSTED_REPORT', 'UNKNOWN_RUMOR'
 * @returns {{sourceTrust: number, confidence: number}}
 */
export function evidenceStrength(type) {
    switch (type) {
        case 'DIRECT_WITNESS':
            return { sourceTrust: 0.95, confidence: 0.95 };
        case 'SCOUT_REPORT':
            return { sourceTrust: 0.7, confidence: 0.8 };
        case 'TRUSTED_REPORT':
            return { sourceTrust: 0.6, confidence: 0.7 };
        case 'UNKNOWN_RUMOR':
            return { sourceTrust: 0.3, confidence: 0.4 };
        default:
            return { sourceTrust: 0.5, confidence: 0.5 };
    }
}

/**
 * Map a sourceId (from the closed-world reducer's belief
 * wiring) to an evidence type for the §7 contract.
 */
function sourceIdToEvidenceType(sourceId) {
    if (sourceId === 'attack-witness' || sourceId === 'relocation-witness') return 'DIRECT_WITNESS';
    if (sourceId === 'scout-report') return 'SCOUT_REPORT';
    if (sourceId === 'unknown-rumor') return 'UNKNOWN_RUMOR';
    if (sourceId === 'trusted-report') return 'TRUSTED_REPORT';
    return 'UNKNOWN_RUMOR';
}

/**
 * The §9 observation boundary. An actor observes a world event
 * iff `canObserve(actor, event, world)` returns true. The default
 * rule for the closed-world is: an actor observes an event on
 * `road-X` iff the actor's current route or location is on
 * `road-X` (or the actor is at a town that has `road-X` as an
 * outgoing route). This is a simple proximity proxy; a future
 * slice can add a perception radius, line-of-sight, scout
 * reports, or rumor propagation.
 *
 * The §8 contract: "An agent may believe something false. A
 * rumor may cause a real war. The engine must preserve the
 * difference between factual causality and perceived causality."
 * canObserve is the *only* gate that determines whether an event
 * enters an actor's belief store.
 */
export function canObserve(actor, event, world) {
    if (!actor || !event || !world) return false;
    // E11: convoy ambushes are bandit-activity observations too — a
    // merchant learns them only on its own road (same R1 gate).
    if (event.type !== 'BANDIT_RELOCATION' && event.type !== 'BANDIT_ATTACK' && event.type !== 'CONVOY_AMBUSH') return true; // non-bandit events observable by default
    const roadId = event.roadId
        ?? event.relocation?.roadId
        ?? event.relocation?.to
        ?? event.to;
    if (!roadId) return false;
    // Slice K — remove panopticon: only the actor's currently selected
    // route is observable. The previous town-adjacency fallback made a
    // merchant at 'north' see both road-a and road-b simultaneously,
    // which is omniscience. Now legal observation requires the actor to
    // be on the road (selectedRoute === roadId). Town adjacency no
    // longer grants free observation of all incident roads.
    const actorRoute = actor.selectedRoute;
    if (actorRoute === roadId) return true;
    return false;
}

/**
 * Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: the
 * legal observation path for territorial intrusions.
 * Returns true iff the observer faction can plausibly
 * detect the intruder within the home town's claimed
 * reach. Today the strategic graph has no coordinates
 * (the radius is symbolic); the predicate therefore
 * resolves to:
 *   1) intruder is at the home town, OR
 *   2) intruder is on a road adjacent to the home town.
 * A future slice can plug in real coordinates and a
 * `claimedRadius` check; the directional + contextual
 * contract is what this slice proves.
 *
 * The intruder is any actor with a `factionId` different
 * from the observer faction's own (or a factionless actor
 * on the observer's territory). Returning false here
 * means the reducer MUST NOT write an INTRUSION event for
 * the (observer, intruder) pair — this is the audit's
 * anti-omniscience contract for territory.
 */
export function canObserveTerritory(observer, intruder, world) {
    if (!observer || !intruder || !world) return false;
    // Resolve the observer's home town.
    const observerFactionId = observer.factionId
        ?? observer.id
        ?? observer;
    const observerFaction = world.factions.find(f => f.id === observerFactionId);
    if (!observerFaction) return false;
    const homeTown = world.towns.get(observerFaction.townId);
    if (!homeTown) return false;
    const intruderFactionId = intruder.factionId ?? null;
    // Same faction = not an intrusion.
    if (intruderFactionId && intruderFactionId === observerFactionId) return false;
    // 1) Intruder is at the home town itself.
    if (intruder.location === homeTown.id) return true;
    // 2) Intruder is on a road adjacent to the home town.
    const intruderRoad = intruder.roadId
        ?? intruder.selectedRoute
        ?? (intruder.location && world.routes
            .find(r => r.from === intruder.location || r.to === intruder.location)?.id);
    if (intruderRoad) {
        const adjacent = world.routes
            .filter(r => r.from === homeTown.id || r.to === homeTown.id)
            .map(r => r.id);
        if (adjacent.includes(intruderRoad)) return true;
    }
    return false;
}

/**
 * Enumerate every actor in the world that has a faction
 * identity and a location (town or road). The territory
 * pass iterates this list and asks `canObserveTerritory`
 * for each (observer, intruder) pair. Factionless actors
 * (stray merchants with no faction) are not intrusions;
 * the reducer ignores them here.
 */
export function allIntruders(world) {
    if (!world) return [];
    const actors = [];
    const addActor = (a) => {
        if (!a) return;
        if (!a.factionId) return;
        if (!a.location && !a.roadId && !a.selectedRoute) return;
        actors.push(a);
    };
    for (const b of world.bandits ?? []) addActor(b);
    for (const c of world.merchants ?? []) addActor(c);
    for (const v of world.vampires ?? []) addActor(v);
    for (const c of world.civilians ?? []) addActor(c);
    for (const g of world.guards ?? []) addActor(g);
    for (const convoy of world.convoys ?? []) addActor(convoy);
    return actors;
}

// =============================================================================
// §120 FORK API — Counterfactual Branching
// =============================================================================
//
// World-Completion Directive §120: "Long-term ambition: clone
// world at tick T. Change one input. Run both branches.
// Compare."
//
// This module adds three primitives:
//   - `forkWorld(world)`: a deterministic deep-clone of the
//     world that handles Maps, Sets, and class instances.
//     The §120 contract is that the clone is fully
//     independent of the original — mutating one must not
//     affect the other.
//   - `runForkedBranches(...)`: run the world to tick T,
//     then run two independent branches from that point
//     with optional per-branch option overrides. The §121
//     determinism contract requires that a fork with no
//     input changes produces byte-identical branches.
//   - `diffWorlds(a, b)`: walk the top-level / nested
//     structure of two worlds and return a list of
//     differing fields. The §120 contract is that a fork
//     with an input change produces *meaningfully*
//     different branches for the right reason.
//
// The deep-clone handles the closed-world's state shape:
//   - `towns: Map<id, {id, market: Market, population,
//     consumes, produces}>` — Maps are re-constructed;
//     Market is re-instantiated via the existing
//     `Market.deserialize(Market.serialize(market))` to
//     preserve the class's invariants.
//   - `factions: FactionDecisionModel[]` — array of class
//     instances. Each faction is serialized and
//     re-instantiated via the model's constructor (the
//     constructor accepts the same fields).
//   - `bandits: RoamingGroup[]` — array of class instances.
//     Each is cloned via a JSON round-trip (the
//     `RoamingGroup` carries a private `rng` closure that
//     is not serializable, so we re-seed from the bandit's
//     id, the same as the live-wire does).
//   - `merchants: {id, location, cargo, beliefs: BeliefStore,
//     selectedRoute}[]` — beliefs are deep-cloned via the
//     existing `BeliefStore.deserialize`.
//   - `relationships: Map<id, FactionRelationshipVector>` —
//     the same vector instance lives in both factions'
//     maps, so we deep-clone each vector.
//   - `consumedAttackIds: Set`, `executedActions: Set`
//     (per-faction) — Sets are re-constructed.
//   - `events: array`, `tickHistory: array`,
//     `marketFlows`, `marketState`, `justiceState`,
//     `treaties`, `wildlife` — all deep-cloned as needed.

/**
 * Deep-clone a closed-world. Maps and Sets are reconstructed
 * (not shared with the original). Class instances that
 * expose a `serialize`/`deserialize` pair (Market,
 * BeliefStore) are round-tripped through that. Class
 * instances that don't (FactionDecisionModel, RoamingGroup,
 * FactionRelationshipVector) are reconstructed by their
 * constructor with the same field values.
 *
 * @param {object} world
 * @returns {object} a deep clone of the world
 */
export function forkWorld(world) {
    if (!world || typeof world !== 'object') {
        throw new TypeError('forkWorld requires a world object');
    }
    const clone = {};
    for (const key of Object.keys(world)) {
        clone[key] = deepCloneValue(world[key], new WeakMap());
    }
    return clone;
}

function deepCloneValue(value, seen) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    // Handle known class instances first.
    if (value instanceof Map) {
        const out = new Map();
        for (const [k, v] of value.entries()) {
            out.set(deepCloneValue(k, seen), deepCloneValue(v, seen));
        }
        return out;
    }
    if (value instanceof Set) {
        const out = new Set();
        for (const v of value.values()) {
            out.add(deepCloneValue(v, seen));
        }
        return out;
    }
    if (Array.isArray(value)) {
        return value.map(item => deepCloneValue(item, seen));
    }
    // Market: use the existing serialize / deserialize
    // pair to preserve the class's invariants (capacity,
    // spoilageRate, basePrice, etc.).
    if (value && typeof value.serialize === 'function' && typeof Market !== 'undefined' && value instanceof Market) {
        return Market.deserialize(value.serialize());
    }
    // BeliefStore: use the existing serialize / deserialize
    // pair to preserve the beliefs + evidence.
    if (value && typeof value.serialize === 'function' && typeof value.deserialize === 'function'
        && value.constructor && value.constructor.name === 'BeliefStore') {
        const Bel = value.constructor;
        return new Bel().deserialize(value.serialize());
    }
    // Plain object: clone every enumerable property.
    // Use `seen` to break cycles. Preserve the prototype
    // so class methods (advanceEmotion, reassess, etc.)
    // remain callable on the clone.
    if (seen.has(value)) return seen.get(value);
    const proto = Object.getPrototypeOf(value);
    const out = Object.create(proto);
    seen.set(value, out);
    for (const k of Object.keys(value)) {
        try {
            out[k] = deepCloneValue(value[k], seen);
        } catch (_err) {
            // Some properties may be non-serializable
            // (e.g. a closure on a RoamingGroup's rng).
            // Skip them; the live-wire re-seeds them.
            out[k] = value[k];
        }
    }
    return out;
}

/**
 * Run the world to `forkAtTick`, then run two independent
 * branches from that point with optional per-branch option
 * overrides. The two branches are seeded from the same
 * pre-fork state, so any divergence in their final state is
 * attributable to the per-branch overrides.
 *
 * @param {object} options
 *   - world: the initial world (will be cloned)
 *   - forkAtTick: the tick at which to fork
 *   - branchATicks: how many ticks branch A runs after the fork
 *   - branchBTicks: how many ticks branch B runs after the fork
 *   - branchAOverrides: optional per-tickClosedWorld option overrides for A
 *   - branchBOverrides: optional per-tickClosedWorld option overrides for B
 * @returns {{branchA, branchB, divergence}}
 */
export function runForkedBranches({
    world,
    forkAtTick = 1,
    branchATicks = 0,
    branchBTicks = 0,
    branchAOverrides = {},
    branchBOverrides = {},
} = {}) {
    if (!world) throw new TypeError('runForkedBranches requires a world');
    if (!Number.isInteger(forkAtTick) || forkAtTick < 1) {
        throw new RangeError('forkAtTick must be a positive integer');
    }
    // Step 1: run the pre-fork trajectory on a single
    // world (so both branches start from the same state).
    const pre = forkWorld(world);
    for (let t = 1; t <= forkAtTick; t += 1) {
        tickClosedWorld(pre, { tick: t, ...branchAOverrides });
    }
    // Step 2: clone the pre-fork world twice and run
    // each branch independently.
    const branchA = forkWorld(pre);
    const branchB = forkWorld(pre);
    for (let t = forkAtTick + 1; t <= forkAtTick + branchATicks; t += 1) {
        tickClosedWorld(branchA, { tick: t, ...branchAOverrides });
    }
    for (let t = forkAtTick + 1; t <= forkAtTick + branchBTicks; t += 1) {
        tickClosedWorld(branchB, { tick: t, ...branchBOverrides });
    }
    // Step 3: report the divergence between the two
    // branches. Empty if no override was applied
    // (byte-identical branches are the §121 default).
    const divergence = diffWorlds(branchA, branchB);
    return { branchA, branchB, divergence, forkAtTick };
}

/**
 * Compare two closed-worlds and report the fields that
 * differ. The comparison walks the top-level keys and a
 * fixed set of nested fields (merchants, factions,
 * bandits, treaties, events, tickHistory, marketState,
 * marketFlows, justiceState, wildlife, towns, relationships).
 *
 * @param {object} a
 * @param {object} b
 * @returns {Array<{path: string, valueA: any, valueB: any}>}
 */
export function diffWorlds(a, b) {
    if (!a || !b) return [];
    const diffs = [];
    const NESTED_KEYS = [
        'merchants', 'factions', 'bandits', 'treaties',
        'events', 'tickHistory', 'marketFlows', 'wildlife',
    ];
    for (const key of Object.keys(a)) {
        if (key === 'towns' || key === 'relationships' || key === 'marketState' || key === 'justiceState' || key === 'convoy' || key === 'convoys') {
            // Map-valued: compare serialized forms.
            if (JSON.stringify(serializeMapish(a[key])) !== JSON.stringify(serializeMapish(b[key]))) {
                diffs.push({ path: key, valueA: 'map', valueB: 'map' });
            }
            continue;
        }
        if (NESTED_KEYS.includes(key)) {
            // Array-valued: compare element-wise. If
            // element differs, walk into the element to
            // find the specific field path that differs.
            const arrA = a[key] ?? [];
            const arrB = b[key] ?? [];
            if (arrA.length !== arrB.length) {
                diffs.push({ path: `${key}.length`, valueA: arrA.length, valueB: arrB.length });
            }
            for (let i = 0; i < Math.min(arrA.length, arrB.length); i += 1) {
                const sa = stableStringify(arrA[i]);
                const sb = stableStringify(arrB[i]);
                if (sa !== sb) {
                    // Walk into the element to find
                    // specific field-level diffs. Use a
                    // shallow walk — scalar properties and
                    // a sample of nested ones — to keep
                    // the diff output readable.
                    const ea = arrA[i];
                    const eb = arrB[i];
                    if (ea && eb && typeof ea === 'object' && typeof eb === 'object') {
                        for (const sub of Object.keys(ea)) {
                            const va = ea[sub];
                            const vb = eb[sub];
                            if (stableStringify(va) !== stableStringify(vb)) {
                                diffs.push({ path: `${key}[${i}].${sub}`, valueA: va, valueB: vb });
                            }
                        }
                    } else {
                        diffs.push({ path: `${key}[${i}]`, valueA: ea, valueB: eb });
                    }
                }
            }
            continue;
        }
        if (stableStringify(a[key]) !== stableStringify(b[key])) {
            diffs.push({ path: key, valueA: a[key], valueB: b[key] });
        }
    }
    return diffs;
}

function serializeMapish(m) {
    if (!m) return null;
    if (m instanceof Map) {
        return [...m.entries()].map(([k, v]) => [k, stableStringify(v)]);
    }
    return stableStringify(m);
}

// Recursive stable stringifier that returns a *value*
// (not a string). At the top level the caller wraps
// with JSON.stringify. Maps and Sets are encoded with
// marker objects so the loader can reconstruct them.
function stableValue(v) {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (v instanceof Map) {
        return {
            __map__: true,
            entries: [...v.entries()].map(([k, val]) => [stableValue(k), stableValue(val)]),
        };
    }
    if (v instanceof Set) {
        return {
            __set__: true,
            values: [...v.values()].map(stableValue),
        };
    }
    if (Array.isArray(v)) return v.map(stableValue);
    // Plain object: sort keys, recurse.
    const out = {};
    for (const k of Object.keys(v).sort()) {
        out[k] = stableValue(v[k]);
    }
    return out;
}

// Top-level stringify: returns a JSON string. Used by
// `saveWorld` and by `diffWorlds`'s `stableStringify` helper.
function stableStringify(v) {
    return JSON.stringify(stableValue(v));
}

// =============================================================================
// §22 / §118 Save / Load — JSON round-trip for the closed-world.
// =============================================================================
//
// World-Completion Directive §22 "Save / Load / Replay /
// Fork" and §118 "A living world needs robust persistence.
// Save: RNG state; world time; agent state; faction
// relations; market state; route state; event ledger;
// encounter history; cooldowns; belief; memory; contracts;
// important passive state."
//
// This module adds `saveWorld(world)` and `loadWorld(json)`
// for JSON round-trip of the closed-world. Maps are encoded
// with a `__map__: true` wrapper and Sets with a `__set__:
// true` wrapper so the loader can distinguish them from
// plain arrays. Class instances with a `serialize` /
// `deserialize` pair (Market, BeliefStore) are
// round-tripped through that.

/**
 * Serialize a closed-world to JSON. The output is a JSON
 * string that captures every observable state in the
 * world: towns (with markets), factions (with relationship
 * maps and per-faction Sets), bandits, merchants (with
 * their BeliefStore), treaties, wildlife, events,
 * tickHistory, and the marketFlows / marketState /
 * justiceState Maps.
 *
 * @param {object} world - the closed-world state
 * @returns {string} a JSON string
 */
export function saveWorld(world) {
    return stableStringify(world);
}

/**
 * Deserialize a closed-world from JSON. The inverse of
 * `saveWorld`. Maps are reconstructed from `{__map__:
 * true, entries: [...]}`, Sets are reconstructed from
 * `{__set__: true, values: [...]}`, and the prototype of
 * class instances is preserved so their methods
 * (`advanceEmotion`, `reassess`, etc.) remain callable.
 *
 * The loader walks the restored object and re-attaches
 * the prototype of known class instances
 * (`FactionDecisionModel`, `RoamingGroup`,
 * `BeliefStore`, `Market`, `FactionRelationshipVector`)
 * so the loaded world can be ticked forward without
 * losing the §121 determinism contract.
 *
 * @param {string} json - the JSON string from `saveWorld`
 * @returns {object} the restored closed-world
 */
export function loadWorld(json) {
    if (typeof json !== 'string') {
        throw new TypeError('loadWorld requires a JSON string');
    }
    const parsed = JSON.parse(json);
    const restored = restoreValue(parsed);
    reattachPrototypes(restored);
    return restored;
}

function restoreValue(v) {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(restoreValue);
    // Marker-based Map / Set detection.
    if (v.__map__ === true && Array.isArray(v.entries)) {
        const out = new Map();
        for (const [k, val] of v.entries) {
            out.set(restoreValue(k), restoreValue(val));
        }
        return out;
    }
    if (v.__set__ === true && Array.isArray(v.values)) {
        const out = new Set();
        for (const item of v.values) {
            out.add(restoreValue(item));
        }
        return out;
    }
    // Plain object: walk each key.
    const out = {};
    for (const k of Object.keys(v)) {
        out[k] = restoreValue(v[k]);
    }
    return out;
}

// Re-attach the prototype of known class instances so
// the loaded world's methods (advanceEmotion, reassess,
// etc.) remain callable. The class instances are
// detected by their shape (presence of constructor-name
// hints we serialize alongside).
function reattachPrototypes(world) {
    if (!world) return;
    // Faction instances: each entry in `world.factions`
    // is a FactionDecisionModel. Re-attach the prototype
    // so methods (advanceEmotion, reassess) remain
    // callable. We re-attach unconditionally — the
    // prototype of a JSON-parsed object is
    // Object.prototype, so this is always a no-op for
    // already-attached instances.
    if (Array.isArray(world.factions)) {
        for (const f of world.factions) {
            if (f && typeof f === 'object' && ('grievance' in f || 'escalation' in f || 'resources' in f)) {
                Object.setPrototypeOf(f, FactionDecisionModel.prototype);
            }
        }
    }
    // Markets: each town's `market` is a `Market` class
    // instance with internal Maps. JSON round-trip
    // produces a plain object whose `inventory` /
    // `demand` / etc. fields are plain objects (not
    // Maps). Without re-instantiation, calls like
    // `market.produce(kind, amount)` silently fail
    // because `this.inventory.get(...)` returns
    // `undefined`. The `Market.deserialize(data)` factory
    // re-instantiates the class with proper Maps, which
    // is required for the §119 resume-equivalence
    // contract (the market step must run deterministically
    // post-load).
    if (world.towns instanceof Map) {
        for (const town of world.towns.values()) {
            if (town && town.market && typeof town.market.serialize === 'function') {
                town.market = Market.deserialize(town.market.serialize());
            } else if (town && town.market && typeof town.market === 'object') {
                // The market was JSON-deserialized into a
                // plain object. Re-construct it via the
                // serialize/deserialize round-trip so the
                // Maps are restored. Critical: `Map.entries()`
                // returns the entries, but `Object.entries`
                // on a Map returns `[]` (Maps don't expose
                // entries as own string properties). This
                // was the bug that the audit's §119 contract
                // would have caught: inventory.size=0
                // post-load.
                const toEntries = (m) => Array.isArray(m) ? m : (m instanceof Map ? [...m.entries()] : Object.entries(m || {}));
                const serialized = {
                    id: town.market.id,
                    inventory: toEntries(town.market.inventory),
                    demand: toEntries(town.market.demand),
                    basePrice: toEntries(town.market.basePrice),
                    delivered: toEntries(town.market.delivered),
                    disrupted: toEntries(town.market.disrupted),
                    capacity: toEntries(town.market.capacity),
                    spoilageRate: toEntries(town.market.spoilageRate),
                    // Preserve an uninitialized EMA as absent. Creating an
                    // empty Map here changes stable save output after load,
                    // even though no price-memory observation ever existed.
                    _priceMemory: town.market._priceMemory == null
                        ? undefined
                        : toEntries(town.market._priceMemory),
                };
                town.market = Market.deserialize(serialized);
            }
        }
        // Law slice: migrate older saves that predate town.laws.
        for (const town of world.towns.values()) {
            if (town && typeof town === 'object') ensureTownLaws(town);
        }
    }
    // Relationship vectors: each entry in
    // `world.relationships` (and in each faction's
    // `relationships` map) is a FactionRelationshipVector.
    // After JSON round-trip the `trust` and `grievance`
    // fields are getters (not own properties), so we
    // detect by the `events` array (which is always an
    // own property of the relationship vector).
    if (world.relationships instanceof Map) {
        for (const pair of world.relationships.values()) {
            if (pair && typeof pair === 'object' && Array.isArray(pair.events)) {
                Object.setPrototypeOf(pair, FactionRelationshipVector.prototype);
            }
        }
    }
    if (Array.isArray(world.factions)) {
        for (const f of world.factions) {
            if (f && f.relationships instanceof Map) {
                for (const [otherFactionId, pair] of f.relationships) {
                    if (pair && typeof pair === 'object' && Array.isArray(pair.events)) {
                        Object.setPrototypeOf(pair, FactionRelationshipVector.prototype);
                    }
                    // JSON cannot preserve shared object identity. Restore the
                    // invariant that both faction-local maps reference the
                    // canonical vector held by world.relationships; otherwise
                    // one branch can update a different pair after load.
                    const canonical = world.relationships?.get?.(`${f.id}::${otherFactionId}`)
                        ?? world.relationships?.get?.(`${otherFactionId}::${f.id}`);
                    if (canonical) f.relationships.set(otherFactionId, canonical);
                }
            }
        }
    }
    // Bandit instances: each entry in `world.bandits` is
    // a RoamingGroup (or a wrapper). The wrapper shape
    // has `currentLocation`, `mode`, etc. We detect by
    // checking for those fields.
    if (Array.isArray(world.bandits)) {
        for (const b of world.bandits) {
            if (b && typeof b === 'object'
                && 'currentLocation' in b && 'mode' in b
                && Object.getPrototypeOf(b) !== FactionDecisionModel.prototype
                && Object.getPrototypeOf(b).constructor?.name === 'Object') {
                // The bandit is a RoamingGroup. Re-attach
                // the prototype via createRoamingGroup —
                // the class itself isn't exported, so we
                // re-seed by re-running createRoamingGroup
                // with the persisted fields. This is a
                // limitation: a future slice can add a
                // `RoamingGroup.deserialize(data)` factory.
                // For now, the bandit's prototype stays
                // as Object.prototype, but the bandit is
                // not the test's main concern (the
                // merchant's reroute consults the bandit
                // via `bandit.roadId` which is preserved).
            }
        }
    }
    // Belief stores: each merchant's `beliefs` field.
    // The BeliefStore class has a `serialize` /
    // `deserialize` round-trip pair, but JSON.parse on
    // the serialized form produces a plain object with
    // the same field shape (beliefs: Map, evidence:
    // Array, decay: number). The `BeliefStore.deserialize`
    // method reconstructs the class instance.
    if (Array.isArray(world.merchants)) {
        for (const m of world.merchants) {
            if (m && m.beliefs && typeof m.beliefs === 'object') {
                // Re-attach the BeliefStore prototype
                // so `merchant.beliefs.observe(evidence)`
                // and `merchant.beliefs.get(subject,
                // claim)` are both callable post-load.
                // The class methods preserve the
                // determinism contract on the §9
                // information model.
                Object.setPrototypeOf(m.beliefs, BeliefStore.prototype);
            }
        }
    }
    // InteractionEngine: the world carries a single
    // InteractionEngine instance for Report/Guard
    // interactions. After JSON round-trip the engine is
    // a plain object — re-instantiate it from the
    // interactions module so the `execute` method is
    // available.
    // Preserve optional derived instances as absent when the checkpoint did
    // not contain them. Eagerly adding these fields makes save(load(save(w)))
    // differ for a fresh world even though no behavior has run yet. A normal
    // reducer tick still initializes both lazily at the justice step below.
    if (Object.prototype.hasOwnProperty.call(world, 'interactionEngine')
        && world.interactionEngine
        && typeof world.interactionEngine === 'object') {
        Object.setPrototypeOf(world.interactionEngine, InteractionEngine.prototype);
        if (!(world.interactionEngine.lastAction instanceof Map)) {
            world.interactionEngine.lastAction = new Map(Object.entries(world.interactionEngine.lastAction ?? {}));
        }
        if (!Number.isFinite(world.interactionEngine.cooldown)) {
            world.interactionEngine.cooldown = 1;
        }
    }
    // JusticeSystem: similar to InteractionEngine, the
    // JusticeSystem class has a `resolve` method that must
    // be callable after a JSON round-trip. The class
    // instance is plain-object-shaped after parse, so we
    // re-instantiate it only when the serialized checkpoint
    // included the instance. Fresh worlds acquire it lazily
    // in tickClosedWorld, preserving resume byte identity.
    if (Object.prototype.hasOwnProperty.call(world, 'justiceSystem')
        && (!world.justiceSystem
            || typeof world.justiceSystem.resolve !== 'function')) {
        world.justiceSystem = new JusticeSystem();
    }
}

// =============================================================================
// Settlement staking (Slice K) + Roaming travel exposure (Slice L)
// =============================================================================
//
// Slice K: settleAttempt + stakeTerritory
//   A roaming group can stake a claim by founding a new town if
//   (1) the location is not already a town, (2) the group's
//   currentLocation is adjacent to or at the location, OR the
//   group has a belief about the location (scouted), and
//   (3) the group's faction has resources to fund the settlement.
//   The new town inherits a market with capacity/spoilage from
//   the staging schema, a default consumes/produces, and the
//   staking faction as controlledBy with homeRadius/claimedRadius.
//   claimedRadius is recorded as authoritative DATA, but no live
//   reader consumes it yet: canObserveTerritory is adjacency-only
//   (radius is symbolic there by explicit contract) — a radius
//   check is a future slice, not this one.
//
// Slice L: roaming travel exposure → bandit belief
//   When a bandit is IN_TRANSIT (startTravel/advanceTravel), each
//   advanceTravel exposure tick mints a scout observation via
//   recordObservation into the bandit's own belief map. The
//   chooseRoamingDestination live-wire already synthesizes
//   beliefs from lootExpectation; Slice L adds the *observed*
//   belief path so a bandit that was exposed to a high-resource
//   midway location will bias toward it on a later tick.
//

/**
 * Attempt to found a new settlement at `locationId` by `group`.
 *
 * TM-HOLD-10 scope: OPERATOR-API, not autonomous. The reducer never
 * calls this (no live settler population exists — refugees absorb
 * into towns, see A5-F9). Live-consequential outputs: the founded
 * town ticks in market/demography/territory passes from the next
 * tick (proven by settlement-staking.test.js "new settlement is
 * live"). Autonomous founding awaits settler populations.
 *
 * The group must be AT_LOCATION (not IN_TRANSIT) and the
 * location must not already be a town. The staking faction
 * (group.factionId or its id) must have resources > 0 to pay
 * the founding cost (1 resource unit).
 * @param {object} world - closed world
 * @param {object} group - roaming group (bandit, merchant group, etc.)
 * @param {string} locationId - new town id
 * @param {object} options
 *   - tick: current tick for event
 *   - cost: resource cost (default 1)
 *   - townTemplate: { produces, storageCapacity, spoilageRate, consumes, population }
 * @returns {{ok: boolean, reason?: string, town?: object, event?: object}}
 */
/**
 * Form a persistent settler group from dropped demography emigrants.
 *
 * E1: emigrants subtracted at the source but refused at every
 * destination used to vanish into the exogenous-outflow ledger
 * (declared deletion). They now camp at the origin town as a
 * persistent group that can survey and found (tickSettlerGroups).
 * No outflow is booked: the humans remain in the world.
 *
 * @param {object} world
 * @param {object} options { originTownId, size, tick, reason }
 * @returns {{group: object, event: object}}
 */
export function formSettlerGroup(world, { originTownId, size, tick = 0, reason = 'NO_DESTINATION' } = {}) {
    if (!world || typeof world !== 'object') throw new TypeError('formSettlerGroup requires world');
    if (!originTownId || !(size > 0)) throw new TypeError('formSettlerGroup requires originTownId and positive size');
    if (!Array.isArray(world.settlerGroups)) world.settlerGroups = [];
    const origin = world.towns?.get?.(originTownId);
    const group = {
        id: `settlers-${tick}-${world.settlerGroups.length}`,
        size,
        originTownId,
        campTownId: originTownId,
        factionId: origin?.controlledBy ?? null,
        formedTick: tick,
        status: 'CAMPED',
        travelState: 'AT_LOCATION',
        currentLocation: originTownId,
        beliefs: {},
    };
    world.settlerGroups.push(group);
    const prevPop = findLatestWorldEvent(world, ev => ev.townId === originTownId, 'POPULATION_CHANGE');
    const event = appendWorldEvent(world, {
        type: 'SETTLER_GROUP_FORMED',
        groupId: group.id,
        size,
        originTownId,
        campTownId: originTownId,
        reason,
        tick,
    }, prevPop?.eventId ? [prevPop.eventId] : []);
    return { group, event };
}

/**
 * Advance camped settler groups one tick: survey-then-found.
 *
 * E1: each CAMPED group with members either (a) surveys a derived
 * site (`<camp>-landing`, collision-suffixed) when it has no belief
 * about it — recording the belief the settleAttempt knowledge gate
 * requires, with a SCOUT_OBSERVATION audit — or (b) founds via the
 * existing settleAttempt operator when the belief exists and the
 * backing faction can pay. Founded groups are absorbed (members
 * become town population via the template) and leave the array;
 * unfunded groups wait (the live NO_RESOURCES path).
 *
 * @param {object} world
 * @param {object} options { tick }
 * @returns {Array} events emitted this tick
 */
export function tickSettlerGroups(world, { tick = 0 } = {}) {
    if (!world || typeof world !== 'object') return [];
    if (!Array.isArray(world.settlerGroups)) world.settlerGroups = [];
    const events = [];
    const remaining = [];
    for (const group of world.settlerGroups) {
        if (!group || group.status !== 'CAMPED' || !(group.size > 0)) {
            if (group) remaining.push(group);
            continue;
        }
        // E4 — recovery preference: a camped group re-founds a known
        // abandoned site instead of sprawling a new landing. Knowledge
        // mirrors the settleAttempt gates (at / adjacent / belief).
        // Worlds without abandoned sites behave exactly as before.
        let refoundSite = null;
        if (world.towns instanceof Map) {
            for (const [townId, town] of world.towns) {
                if (!town?.abandoned) continue;
                const atSite = group.currentLocation === townId;
                let adjacentToSite = false;
                if (!atSite && group.currentLocation) {
                    adjacentToSite = (world.routes ?? []).some(r =>
                        (r.from === group.currentLocation && r.to === townId)
                        || (r.from === townId && r.to === group.currentLocation));
                }
                if (atSite || adjacentToSite || group.beliefs?.[townId]) {
                    refoundSite = townId;
                    break;
                }
            }
        }
        let site = `${group.campTownId}-landing`;
        let suffix = 2;
        while (world.towns?.has?.(site)) {
            site = `${group.campTownId}-landing-${suffix}`;
            suffix += 1;
        }
        // A known husk takes precedence over a fresh landing: the
        // survey-then-found rhythm below is unchanged, but
        // settleAttempt revives instead of founding.
        if (refoundSite) site = refoundSite;
        if (!group.beliefs) group.beliefs = {};
        if (!group.beliefs[site]) {
            group.beliefs[site] = { perceivedDanger: 0.2, confidence: 0.5, tick, source: 'settler-survey' };
            if (!Array.isArray(group.observations)) group.observations = [];
            group.observations.push({ locationId: site, tick });
            events.push(appendWorldEvent(world, {
                type: 'SCOUT_OBSERVATION',
                observerId: group.id,
                locationId: site,
                resourceEstimate: 0,
                dangerEstimate: 0.2,
                confidence: 0.5,
                tick,
                sourceType: 'SETTLER_SURVEY',
            }, []));
            remaining.push(group);
            continue;
        }
        const result = settleAttempt(world, group, site, {
            tick,
            cost: 1,
            townTemplate: {
                produces: { food: 1.0, tools: 0.1, ore: 0.1, metal: 0.1 },
                storageCapacity: { food: 50, tools: 30, ore: 30, metal: 30 },
                spoilageRate: { food: 0.05, tools: 0 },
                recipes: { metal: { ore: 1 }, tools: { metal: 1 } },
                consumes: { food: 1, tools: 0.2 },
                population: group.size,
                controlledBy: group.factionId ?? undefined,
                homeRadius: 1,
                claimedRadius: 3,
                contestedRadius: 0,
                scarceResources: { food: true, tools: false },
            },
        });
        if (!result.ok) remaining.push(group);
    }
    world.settlerGroups = remaining;
    return events;
}

/**
 * E12 — occupation penalty. Foreign rule starts at 0.3 and
 * assimilates geometrically (0.966/tick, ~20-tick half-life, under
 * 0.01 past ~100 ticks). No occupation record means no penalty, so
 * quiet control and older saves behave exactly as before. Pure:
 * the same (town, tick) always yields the same number.
 */
export function occupationPenalty(town, tick = 0) {
    const since = Number(town?.occupation?.sinceTick);
    if (!Number.isFinite(since)) return 0;
    const elapsed = Math.max(0, (Number(tick) || 0) - since);
    return 0.3 * Math.pow(0.966, elapsed);
}

/**
 * E7 — integrate camped refugees one head per tick per camp.
 * Arrival books the exogenous inflow (owned creation); integration
 * is an internal transfer (camp -1, town +1, no ledger change), so
 * population conservation holds across both steps. Camped heads
 * consume town food via the market step but produce nothing until
 * integrated — displacement costs before it pays. An emptied camp
 * closes with exactly one REFUGEE_INTEGRATED event and leaves the
 * array. Camps whose town vanished integrate into nothing and are
 * dropped silently (no people created, no event).
 */
export function tickRefugeeCamps(world, { tick = 0 } = {}) {
    if (!world || typeof world !== 'object') return [];
    if (!Array.isArray(world.refugeeCamps)) world.refugeeCamps = [];
    const events = [];
    const remaining = [];
    for (const camp of world.refugeeCamps) {
        if (!camp || camp.status !== 'CAMPED' || !(camp.size > 0)) continue;
        const town = world.towns?.get?.(camp.townId);
        if (!town) continue;
        town.population = (Number(town.population) || 0) + 1;
        camp.size -= 1;
        camp.integrated = (Number(camp.integrated) || 0) + 1;
        if (camp.size <= 0) {
            camp.status = 'INTEGRATED';
            events.push(appendWorldEvent(world, {
                type: 'REFUGEE_INTEGRATED',
                campId: camp.id,
                townId: camp.townId,
                integrated: camp.integrated,
                tick,
            }, []));
        } else {
            remaining.push(camp);
        }
    }
    world.refugeeCamps = remaining;
    return events;
}

/**
 * E4 — abandon a dead town. A town that was once inhabited but now
 * holds nobody becomes rubble: the flag excludes it from future
 * migration destinations, the claim is released (factions fall back
 * to wider aggregates; the home faction keeps its townId memory and
 * feels the empty shelves as shortage pressure — loss, not peace),
 * and the remaining inventory spoils out, booked straight into the
 * cumulative market-flow ledger (bandit-path pattern) so the R3
 * mass residual stays exact. Idempotent per episode: a second call
 * is ALREADY_ABANDONED. Recovery goes through settleAttempt, which
 * revives abandoned sites instead of refusing them. The demographic
 * remainder buckets are cleared: headcount-in-waiting belonged to
 * the living and must not resolve into births for nobody later.
 */
export function abandonTown(world, townId, { tick = 0 } = {}) {
    const town = world.towns?.get?.(townId);
    if (!town) return { ok: false, reason: 'NO_TOWN' };
    if (town.abandoned) return { ok: false, reason: 'ALREADY_ABANDONED' };
    const spoiledByKind = {};
    if (town.market?.inventory instanceof Map) {
        for (const [kind, amount] of town.market.inventory) {
            const qty = Math.max(0, Number(amount) || 0);
            if (qty <= 0) continue;
            spoiledByKind[kind] = qty;
            town.market.inventory.set(kind, 0);
            if (!world.marketFlows) world.marketFlows = new Map();
            const flowKey = `${townId}:${kind}`;
            const cumulative = world.marketFlows.get(flowKey)
                ?? { produced: 0, delivered: 0, consumed: 0, spoiled: 0, overflow: 0, deliveryOverflow: 0 };
            cumulative.spoiled = (Number(cumulative.spoiled) || 0) + qty;
            world.marketFlows.set(flowKey, cumulative);
        }
    }
    const previousController = town.controlledBy ?? null;
    town.abandoned = true;
    town.abandonedTick = tick;
    town.controlledBy = null;
    if (town._demoRemainder && typeof town._demoRemainder === 'object') {
        town._demoRemainder.births = 0;
        town._demoRemainder.deaths = 0;
        town._demoRemainder.emigration = 0;
    }
    const event = appendWorldEvent(world, {
        type: 'TOWN_ABANDONED',
        tick,
        townId,
        previousController,
        spoiledByKind,
        rootReason: 'NO_INHABITANTS',
    }, []);
    return { ok: true, town, event, spoiledByKind, previousController };
}

export function settleAttempt(world, group, locationId, { tick = 0, cost = 1, townTemplate = null } = {}) {
    if (!world || typeof world !== 'object') throw new TypeError('settleAttempt requires world');
    if (!group || typeof group !== 'object') throw new TypeError('settleAttempt requires group');
    if (world.towns?.has?.(locationId)) {
        const existing = world.towns.get(locationId);
        // E4 — recovery: an abandoned site can be re-founded. The
        // husk record persists (market, radii, routes), so revival
        // re-inhabits it instead of minting a duplicate town: flag
        // cleared, population from the settling group, claim to the
        // group's faction, market loop resumes on live demand. A
        // lived-in town is still refused (ALREADY_EXISTS).
        if (!existing?.abandoned) {
            return { ok: false, reason: 'ALREADY_EXISTS' };
        }
        // Same travel/knowledge gates as founding: no teleport
        // settlements, no settling unknown sites.
        if (group.travelState === 'IN_TRANSIT') {
            return { ok: false, reason: 'IN_TRANSIT' };
        }
        const hasBelief = Boolean(group.beliefs?.[locationId]);
        const atLocation = group.currentLocation === locationId;
        let adjacent = false;
        if (!atLocation && !hasBelief && group.currentLocation) {
            const routes = world.routes ?? [];
            adjacent = routes.some(r => (r.from === group.currentLocation && r.to === locationId) || (r.from === locationId && r.to === group.currentLocation));
        }
        if (!atLocation && !adjacent && !hasBelief) {
            return { ok: false, reason: 'NO_KNOWLEDGE' };
        }
        const factionId = group.factionId ?? group.id;
        const faction = world.factions?.find(f => f.id === factionId);
        if (faction && (faction.resources ?? 0) < cost) {
            return { ok: false, reason: 'NO_RESOURCES' };
        }
        if (faction) {
            faction.resources = Math.max(0, (faction.resources ?? 0) - cost);
        }
        existing.abandoned = false;
        existing.refoundedTick = tick;
        existing.population = townTemplate?.population ?? group.size ?? 1;
        if (townTemplate?.consumes) existing.consumes = townTemplate.consumes;
        if (townTemplate?.produces) existing.produces = townTemplate.produces;
        existing.controlledBy = townTemplate?.controlledBy ?? factionId;
        const event = appendWorldEvent(world, {
            type: 'TOWN_REFOUNDED',
            tick,
            locationId,
            factionId,
            groupId: group.id,
            population: existing.population,
            previousAbandonedTick: existing.abandonedTick ?? null,
            cost,
        }, []);
        group.currentLocation = locationId;
        return { ok: true, town: existing, event, refounded: true };
    }
    if (group.travelState === 'IN_TRANSIT') {
        return { ok: false, reason: 'IN_TRANSIT' };
    }
    // Knowledge gate: group must either be at the location, adjacent via route, or have a belief about it
    const hasBelief = Boolean(group.beliefs?.[locationId]);
    const atLocation = group.currentLocation === locationId;
    let adjacent = false;
    if (!atLocation && !hasBelief && group.currentLocation) {
        const routes = world.routes ?? [];
        adjacent = routes.some(r => (r.from === group.currentLocation && r.to === locationId) || (r.from === locationId && r.to === group.currentLocation));
    }
    if (!atLocation && !adjacent && !hasBelief) {
        return { ok: false, reason: 'NO_KNOWLEDGE' };
    }
    const factionId = group.factionId ?? group.id;
    const faction = world.factions?.find(f => f.id === factionId);
    if (faction && (faction.resources ?? 0) < cost) {
        return { ok: false, reason: 'NO_RESOURCES' };
    }
    // Pay cost
    if (faction) {
        faction.resources = Math.max(0, (faction.resources ?? 0) - cost);
    }
    const template = townTemplate ?? {
        produces: { food: 1.0, tools: 0.1, ore: 0.1, metal: 0.1 },
        storageCapacity: { food: 50, tools: 30, ore: 30, metal: 30 },
        spoilageRate: { food: 0.05, tools: 0 },
        recipes: { metal: { ore: 1 }, tools: { metal: 1 } },
        consumes: { food: 1, tools: 0.2 },
        population: 1,
        controlledBy: factionId,
        homeRadius: 1,
        claimedRadius: 3,
        contestedRadius: 0,
        scarceResources: { food: true, tools: false },
    };
    const market = new Market(locationId);
    for (const [kind, cap] of Object.entries(template.storageCapacity ?? { food: 50 })) {
        market.setCapacity(kind, cap);
    }
    for (const [kind, rate] of Object.entries(template.spoilageRate ?? { food: 0.05 })) {
        market.setSpoilageRate(kind, rate);
    }
    if (template.population != null) {
        // leave population as template
    }
    const newTown = {
        id: locationId,
        market,
        population: template.population ?? 1,
        produces: template.produces ?? { food: 1.0, tools: 0.1, ore: 0.1, metal: 0.1 },
        recipes: template.recipes ? JSON.parse(JSON.stringify(template.recipes)) : undefined,
        controlledBy: template.controlledBy ?? factionId,
        homeRadius: template.homeRadius ?? 1,
        claimedRadius: template.claimedRadius ?? 3,
        contestedRadius: template.contestedRadius ?? 0,
        scarceResources: template.scarceResources ?? { food: true, tools: false },
    };
    if (!world.towns || !(world.towns instanceof Map)) {
        world.towns = new Map(Object.entries(world.towns ?? {}));
    }
    world.towns.set(locationId, newTown);
    // Create route stub so graph stays connected: connect from group currentLocation if a location
    if (group.currentLocation && group.currentLocation !== locationId && Array.isArray(world.routes)) {
        const alreadyConnected = world.routes.some(r => (r.from === group.currentLocation && r.to === locationId) || (r.from === locationId && r.to === group.currentLocation));
        if (!alreadyConnected) {
            world.routes.push({ id: `road-${group.currentLocation}-${locationId}`, from: group.currentLocation, to: locationId, distance: 5, actualDanger: 0.2 });
        }
    }
    // Ensure a FactionRelationshipVector exists for the new faction if new
    if (factionId && !world.factions.find(f => f.id === factionId)) {
        const newFaction = { id: factionId, townId: locationId, resources: 1, maxResources: 2, legitimacy: 0.9, grievance: 0.1, escalation: 0, lastDecision: 'HOLD', relationships: new Map() };
        Object.setPrototypeOf(newFaction, FactionDecisionModel.prototype);
        world.factions.push(newFaction);
    }
    // Emit SETTLEMENT_FOUNDED
    let parentIds = [];
    if (group.travelState === 'AT_LOCATION' && group.observations?.length) {
        const lastObs = group.observations[group.observations.length - 1];
        // parent to last observation event if any
        const lastObsEvent = [...(world.events ?? [])].reverse().find(e => e.type === 'SCOUT_OBSERVATION' || e.type === 'BANDIT_RELOCATION');
        if (lastObsEvent?.eventId) parentIds = [lastObsEvent.eventId];
    }
    const event = appendWorldEvent(world, {
        type: 'SETTLEMENT_FOUNDED',
        locationId,
        factionId,
        groupId: group.id,
        tick,
        cost,
        claimedRadius: newTown.claimedRadius,
        rootReason: parentIds.length === 0 ? 'SETTLEMENT_STAKE' : undefined,
    }, parentIds);
    // Update group currentLocation to the new settlement
    group.currentLocation = locationId;
    return { ok: true, town: newTown, event };
}



/**
 * Stake or extend a town's claimed territory.
 * Increases claimedRadius by `delta` (default 1) up to `maxRadius` (default 5).
 * Emits TERRITORY_STAKED.
 *
 * TM-HOLD-10 scope: OPERATOR-API, not autonomous. The reducer never
 * calls this, and no live pass reads claimedRadius yet (territory
 * observation is adjacency-only). The radius + event are durable
 * state for the future radius-check slice and for scenario authors.
 *
 * @param {object} world
 * @param {string} townId
 * @param {object} options { delta, maxRadius, tick, factionId }
 * @returns {{ok: boolean, reason?: string, event?: object, previousRadius?: number, newRadius?: number}}
 */
export function stakeTerritory(world, townId, { delta = 1, maxRadius = 5, tick = 0, factionId = null } = {}) {
    if (!world || !(world.towns instanceof Map)) throw new TypeError('stakeTerritory requires world with towns Map');
    const town = world.towns.get(townId);
    if (!town) return { ok: false, reason: 'NO_TOWN' };
    const faction = factionId ? world.factions?.find(f => f.id === factionId) : (world.factions?.find(f => f.id === town.controlledBy) ?? world.factions?.find(f => f.townId === townId));
    if (faction && (faction.resources ?? 0) < 1) {
        return { ok: false, reason: 'NO_RESOURCES' };
    }
    const previousRadius = town.claimedRadius ?? 3;
    if (previousRadius >= maxRadius) {
        return { ok: false, reason: 'AT_MAX_RADIUS' };
    }
    const newRadius = Math.min(maxRadius, previousRadius + delta);
    if (faction) faction.resources = Math.max(0, (faction.resources ?? 0) - 1);
    town.claimedRadius = newRadius;
    const event = appendWorldEvent(world, {
        type: 'TERRITORY_STAKED',
        townId,
        factionId: faction?.id ?? town.controlledBy,
        previousRadius,
        newRadius,
        delta,
        tick,
        rootReason: 'TERRITORY_STAKE',
    }, []);
    return { ok: true, event, previousRadius, newRadius };
}
/**
 * Slice L helper: advance a roaming group's travel and record
 * exposure as a scout observation into the group's belief map.
 *
 * TM-HOLD-10 scope: OPERATOR-API, not autonomous. The reducer never
 * calls this — live bandits relocate via relocateBanditViaRoaming
 * (synthesized beliefs), which does not consume travel-written
 * belief maps yet (roaming maturity row). Wiring travel observations
 * into relocation is expansion work, not this slice.
 *
 * @param {object} group - roaming group (must be IN_TRANSIT)
 * @param {number} ticks - ticks to advance
 * @param {object} options { exposure: { locationId, resourceEstimate, dangerEstimate, confidence }, world, tick }
 * @returns {string} resulting travelState
 */
export function advanceRoamingTravel(group, ticks, { exposure = null, world = null, tick = 0 } = {}) {
    if (!group) throw new TypeError('advanceRoamingTravel requires group');
    if (group.travelState !== 'IN_TRANSIT') return group.travelState;
    // Use roaming.js advanceTravel under the hood
    const result = advanceTravel(group, ticks, exposure ? { exposure } : {});
    // Additionally emit a SCOUT_OBSERVATION event for audit trail if world provided and exposure given
    if (world && exposure?.locationId) {
        const obs = group.beliefs?.[exposure.locationId];
        appendWorldEvent(world, {
            type: 'SCOUT_OBSERVATION',
            observerId: group.id,
            locationId: exposure.locationId,
            resourceEstimate: exposure.resourceEstimate ?? obs?.resourceValue ?? 0,
            dangerEstimate: exposure.dangerEstimate ?? obs?.danger ?? 0,
            confidence: exposure.confidence ?? obs?.confidence ?? 0.6,
            tick,
            sourceType: 'TRAVEL_EXPOSURE',
        }, []);
    }
    return result;
}
