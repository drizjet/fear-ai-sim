import { appendWorldEvent, bookExogenousPopulation } from './closed-world.js';

// Constitution §89 / §90 / §91 / §94 / §532.
//
// Encounter eligibility catalog. An encounter template describes
// a kind of local collision (ambush, broken caravan, refugee
// group, patrol, wildlife) and the world-state conditions under
// which it is plausible. The catalog is *static*: it does not
// generate events. The reducer calls `evaluateEncounterEligibility`
// per tick to produce a list of eligible templates, then emits
// CANDIDATE_ENCOUNTER events for the audit trail. A later slice
// will instantiate one of the candidates and mutate world state.
//
// The §89 contract:
//   "An encounter should usually be a LOCAL COLLISION OF REAL
//    WORLD PROCESSES. ... Randomness selects among plausible
//    events. World state determines plausibility."
//
// The §91 contract:
//   "Do not spawn impossible actors. ... World state determines
//    plausibility."
//
// The §95 contract:
//   "A random encounter can be surprising. It should not be
//    causally empty. Randomness selects among plausible events.
//    World state determines plausibility."

/**
 * Returns the static encounter catalog. Each template is a
 * { id, description, priority, check } record. The check
 * function takes a world snapshot and returns true if the
 * encounter is plausible.
 */
export function encounterCatalog() {
    return [
        {
            id: 'bandit-ambush',
            description: 'A bandit on a route encounters a merchant traveling the same route.',
            priority: 5,
            check(world) {
                if (!world.bandits || !world.merchants || !world.routes) return false;
                if (world.bandits.length === 0 || world.merchants.length === 0) return false;
                // The bandit must be on a road the merchant has
                // cargo to travel. We use the presence of a
                // merchant with cargo and a bandit on any route.
                return world.merchants.some(merchant => (merchant.cargo ?? 0) > 0)
                    && world.bandits.some(bandit => world.routes.some(route => route.id === bandit.roadId));
            },
        },
        {
            id: 'broken-caravan',
            description: 'A merchant with low cargo (post-raid) limps toward a settlement.',
            priority: 3,
            check(world) {
                if (!world.merchants) return false;
                return world.merchants.some(merchant => (merchant.cargo ?? 0) > 0 && (merchant.cargo ?? 0) < 10);
            },
        },
        {
            id: 'patrol-checkpoint',
            description: 'A guard faction with resources patrols a road and encounters a merchant.',
            priority: 2,
            check(world) {
                if (!world.guards || !world.merchants || !world.factions) return false;
                return world.guards.length > 0
                    && world.merchants.some(merchant => (merchant.cargo ?? 0) > 0)
                    && world.factions.some(faction => (faction.resources ?? 0) > 0);
            },
        },
        {
            id: 'refugee-group',
            description: 'A war-driven refugee group approaches a settlement, seeking entry.',
            priority: 1,
            // R8 (rate calibration): at most one firing per 15
            // ticks. Each firing absorbs 1-3 refugees while
            // demography births floor(pop * 0.01) per tick — an
            // uncooled type fires every tick that grievance
            // exceeds 0.3 and swamps births in quiet worlds. A
            // 15-tick floor caps inflow at ~0.2/tick, a bounded
            // supplement instead of the dominant pump. Enforced
            // generically in tickClosedWorld via
            // world.encounterCooldowns.
            cooldownTicks: 15,
            check(world) {
                // A refugee encounter is plausible when there is
                // recent faction conflict (grievance > 0) and a
                // settlement with capacity to absorb them. Towns is
                // a Map in live worlds (R3: .length was always
                // undefined, so this type could never be eligible).
                if (!world.factions || !world.towns) return false;
                const townCount = world.towns.size ?? world.towns.length ?? 0;
                return world.factions.some(faction => (faction.grievance ?? 0) > 0.3)
                    && townCount > 0;
            },
        },
        {
            id: 'wildlife-encounter',
            description: 'Wildlife appears on an undefended route.',
            priority: 0,
            check(world) {
                // Always plausible in a generic world. Future
                // slice can wire ecological state.
                return world.routes && world.routes.length > 0;
            },
        },
    ];
}

/**
 * Evaluate which encounter templates are eligible for the current
 * world state. Returns the list of eligible templates (filtered
 * and sorted by priority).
 */
export function evaluateEncounterEligibility(world, options = {}) {
    const templates = encounterCatalog();
    return templates
        .filter(template => {
            try {
                return template.check(world, options);
            } catch (_err) {
                return false;
            }
        })
        .sort((a, b) => b.priority - a.priority);
}

/**
 * Select encounter candidates from a list of eligible templates.
 * The selector is deterministic when given a deterministic rng.
 * The §121 determinism contract requires this.
 */
export function selectEncounterCandidates(eligible, { rng = Math.random, maxCandidates = 3 } = {}) {
    if (!Array.isArray(eligible) || eligible.length === 0) return [];
    // The §95 contract: randomness among plausible events. We
    // use rng to shuffle and take the top maxCandidates. This is
    // a soft randomization — the order of the input (sorted by
    // priority) is the *prior*; the rng is the *sample*.
    const shuffled = eligible.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, maxCandidates);
}

/**
 * Instantiate an encounter template. The instantiation
 * mutates world state (the §96 contract: "Encounter
 * outcomes must return to authoritative world state") and
 * pushes an ENCOUNTER event onto the world.
 *
 * Each template has a corresponding `apply` function that
 * performs the world-state mutation. If the template has
 * no explicit `apply`, the default is a no-op (the
 * encounter is observed but causes no state change —
 * suitable for "the traveler notices the wildlife and
 * moves on" scenarios).
 *
 * The result object has at minimum:
 *   - encounterId: the template id
 *   - tick: the tick at which the encounter was instantiated
 *   - any template-specific fields (e.g. `stolen` for bandit-ambush)
 *
 * @param {object} template - the encounter template
 * @param {object} world - the closed-world state (mutated in place)
 * @param {object} options
 *   - tick: the current tick
 *   - rng: deterministic rng (for any stochastic outcome)
 * @returns {object} the encounter result
 */
export function instantiateEncounter(template, world, { tick = 0, rng = Math.random, parentEventIds = [] } = {}) {
    if (!template || !world) return null;
    // Build the result. The result is the encounter
    // record that the ENCOUNTER event will carry.
    const result = {
        encounterId: template.id,
        tick
    };
    let applied = false;
    // The bandit-ambush encounter: the bandit on the same
    // route as the merchant steals some cargo. This is
    // the §89 "local collision of real world processes":
    // a bandit on a road encounters a merchant on the
    // same road and the encounter mutates both. The
    // stolen amount is a fraction of the merchant's
    // cargo (deterministic, based on the rng).
    if (template.id === 'bandit-ambush') {
        const merchant = world.merchants?.find(m => {
            const route = world.routes?.find(r => r.id === m.selectedRoute);
            if (!route) return false;
            return world.bandits?.some(b => b.roadId === route.id);
        });
        if (merchant && (merchant.cargo ?? 0) > 0) {
            // The stolen fraction is 30% of the cargo
            // (a HEURISTIC, calibrated to be significant
            // but not destructive). The actual fraction
            // can be rng-jittered in a future slice.
            const stolen = Math.max(1, Math.floor(merchant.cargo * 0.3));
            const before = merchant.cargo;
            merchant.cargo = Math.max(0, merchant.cargo - stolen);
            result.stolen = before - merchant.cargo;
            result.merchantId = merchant.id;
            applied = true;
        }
    } else if (template.id === 'broken-caravan') {
        // The §89 narrative: a merchant with low cargo
        // (post-raid) limps toward a settlement. The
        // apply: 20% of the merchant's cargo is consumed
        // as a "settling cost" (the merchant pays the
        // town for shelter, repairs, etc.).
        const merchant = world.merchants?.find(m => (m.cargo ?? 0) > 0 && (m.cargo ?? 0) < 10);
        if (merchant) {
            const before = merchant.cargo;
            const settlingCost = Math.max(1, Math.floor(before * 0.2));
            merchant.cargo = Math.max(0, before - settlingCost);
            // R2-W1: the settling cost leaves the conserved material set
            // (paid out for shelter/repairs); book it so the global mass
            // identity stays exact.
            if (settlingCost > 0) {
                if (!world.transitLoss || typeof world.transitLoss !== 'object') world.transitLoss = {};
                const kind = merchant.cargoKind ?? 'food';
                world.transitLoss[kind] = (world.transitLoss[kind] ?? 0) + settlingCost;
            }
            result.merchantId = merchant.id;
            result.settlingCost = settlingCost;
            result.delivered = merchant.cargo;
            applied = true;
        }
    } else if (template.id === 'patrol-checkpoint') {
        // The §89 narrative: a guard faction with
        // resources inspects a merchant on the road. The
        // apply: 10% of the merchant's cargo becomes the
        // guard faction's resources (a toll). The
        // merchant's cargo decreases by the toll.
        const merchant = world.merchants?.find(m => (m.cargo ?? 0) > 0);
        const guard = world.guards?.[0];
        if (merchant && guard) {
            const guardFaction = world.factions?.find(f => f.id === guard.factionId);
            if (guardFaction) {
                const before = merchant.cargo;
                const toll = Math.max(1, Math.floor(before * 0.1));
                merchant.cargo = Math.max(0, before - toll);
                const cap = Math.max(0, Number(guardFaction.maxResources) || 0);
                guardFaction.resources = Math.min(cap, (guardFaction.resources ?? 0) + toll);
                // R2-W1: the toll transfers material OUT of the trade set
                // into faction coffers (abstract resources); book the
                // outflow so the global mass identity stays exact.
                if (toll > 0) {
                    if (!world.transitLoss || typeof world.transitLoss !== 'object') world.transitLoss = {};
                    const kind = merchant.cargoKind ?? 'food';
                    world.transitLoss[kind] = (world.transitLoss[kind] ?? 0) + toll;
                }
                result.merchantId = merchant.id;
                result.toll = toll;
                result.guardFactionId = guardFaction.id;
                applied = true;
            }
        }
    } else if (template.id === 'refugee-group') {
        // The §89 narrative: a war-driven refugee group
        // approaches a settlement, seeking entry. The
        // apply: the destination town's population
        // increases by N refugees. N is derived from the
        // highest-grievance faction (the source of the
        // refugees), capped at 3.
        const sourceFaction = world.factions?.find(f => (f.grievance ?? 0) > 0.3);
        if (sourceFaction) {
            const refugeeCount = Math.min(3, Math.max(1, Math.floor(sourceFaction.grievance * 3)));
            // The destination is the first town (the
            // closed-world's towns are an iterable Map;
            // we pick the first one for the MVP).
            const destination = world.towns?.values?.()?.next?.()?.value;
            if (destination) {
                destination.population = (destination.population ?? 0) + refugeeCount;
                // R3 (V8 audit MAT-005a): refugees arrive from off-map —
                // creation is legitimate, but it must be owned. Book
                // the headcount into the exogenous-population ledger.
                bookExogenousPopulation(world, 'inflow', refugeeCount);
                result.sourceFactionId = sourceFaction.id;
                result.destinationTownId = destination.id;
                result.refugeeCount = refugeeCount;
                applied = true;
            }
        }
    } else if (template.id === 'wildlife-encounter') {
        // The §89 narrative: wildlife appears on an
        // undefended route. The apply: no cargo loss,
        // but a wildlife sighting is recorded on
        // world.wildlife (a new collection).
        if (!Array.isArray(world.wildlife)) world.wildlife = [];
        const route = world.routes?.[0];
        if (route) {
            const sighting = {
                sightingId: `sighting-${tick}-${world.wildlife.length}`,
                route: route.id,
                tick,
            };
            world.wildlife.push(sighting);
            result.sightingId = sighting.sightingId;
            result.route = route.id;
            applied = true;
        }
    }
    // The §91 contract: "Do not spawn impossible
    // actors. ... World state determines plausibility."
    // If no apply function was able to run (precondition
    // not met), return null and do NOT push an ENCOUNTER
    // event — otherwise the audit trail would be polluted
    // with encounters that never happened.
    if (!applied) return null;
    // Push the ENCOUNTER event onto the world for the
    // §7 "Causal Ledger" contract. The event carries the
    // R2 (V8 audit F7): allocator-owned id with the caller's
    // parentage (the reducer passes its CANDIDATE_ENCOUNTER).
    // Direct callers get a declared root. The emitted id is
    // wired back onto result.eventId so the bandit-ambush
    // BANDIT_ATTACK child below parents to a real id instead
    // of undefined.
    // Normalized once: a caller passing [undefined] (the old
    // rewrite-on-undefined-id shape) must not silently orphan
    // or smuggle a junk parent id.
    const parents = (parentEventIds ?? []).filter(id => typeof id === 'string');
    const emitted = appendWorldEvent(world, {
        type: 'ENCOUNTER',
        encounterId: template.id,
        tick,
        result,
        ...(parents.length === 0 ? { rootReason: 'ENCOUNTER_TRIGGERED' } : {}),
    }, parents);
    // EVID-2026-08-29-BANDIT-ATTACK-WIRE: when the encounter
    // engine runs a bandit-ambush, also push a BANDIT_ATTACK
    // event with the same shape as resolveBanditAttack so
    // downstream consumers (canonical trade system, patrol
    // detection, statistics) see the attack. The audit trail
    // has both the ENCOUNTER and the BANDIT_ATTACK events.
    if (template.id === 'bandit-ambush' && result && result.merchantId) {
        // The encounter engine already found a merchant on a
        // bandit's road in its `apply` function. Reuse that
        // resolution but also accept the merchant if they
        // have a selectedRoute or lastRoute matching any
        // bandit's road. We do NOT require selectedRoute
        // because the encounter engine runs in step 6.5
        // BEFORE the canonical trade system (step 7.5) sets
        // it; the merchant's lastRoute (set by the legacy
        // chooseMerchantRoute in step 1) is good enough.
        const merchant = world.merchants?.find(m => m.id === result.merchantId);
        const route = merchant
            ? world.routes?.find(r => r.id === (merchant.selectedRoute || merchant.lastRoute))
            : null;
        const bandit = route ? world.bandits?.find(b => b.roadId === route.id) : null;
        if (merchant && route && bandit) {
            const attackOpportunityId = `encounter-attack-${tick}-${route.id}-${merchant.id}`;
            // Idempotency: do not double-debit if the same
            // opportunity was already debited by resolveBanditAttack
            // or another encounter in this tick.
            if (!world.consumedAttackIds) world.consumedAttackIds = new Set();
            if (!world.consumedAttackIds.has(attackOpportunityId)) {
                world.consumedAttackIds.add(attackOpportunityId);
                // EVID-2026-08-29-ECOLOGY-PRESERVE: the
                // encounter apply already stole the cargo
                // (merchant.cargo -= stolen). We do NOT call
                // destination.market.deliverCargo here
                // because the canonical routes are
                // north<->south and the destination market
                // for an attack on the merchant's route is
                // not necessarily the merchant's actual
                // destination. The original resolveBanditAttack
                // (called from runClosedWorldStep) handles
                // the destination delivery; the encounter
                // path is just for the BANDIT_ATTACK event
                // shape.
                const lost = result.stolen || 0;
                const remaining = merchant.cargo || 0;
                // R2-W1 loss sink: the encounter engine stole this cargo;
                // book it so it does not vanish from the global mass
                // identity (patrol interception reverses the booking).
                if (lost > 0) {
                    if (!world.transitLoss || typeof world.transitLoss !== 'object') world.transitLoss = {};
                    const kind = merchant.cargoKind ?? 'food';
                    world.transitLoss[kind] = (world.transitLoss[kind] ?? 0) + lost;
                }
                const attackEvent = {
                    type: 'BANDIT_ATTACK',
                    attackOpportunityId,
                    banditId: bandit.id,
                    roadId: route.id,
                    merchantId: merchant.id,
                    lost,
                    delivered: remaining,
                    marketResult: null,
                    survivor: true,
                    tick,
                    source: 'encounter_engine',
                    // RESP-EVENT-ID-AUTHORITY-001: allocator-owned id so
                    // downstream consumers (patrol detection, faction
                    // memory) can resolve this attack as a causal parent.
                    rootReason: 'ATTACK_OPPORTUNITY',
                };
                const emittedAttack = appendWorldEvent(world, attackEvent, []);
                // The encounter event itself is the causal parent of the
                // attack it produced, when resolvable.
                if (result && result.eventId) {
                    emittedAttack.parentEventIds = [result.eventId];
                    delete emittedAttack.rootReason;
                }
            }
        }
    }
    return result;
}
