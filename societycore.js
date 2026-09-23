import { AgentBelief, BeliefEvidence, HabituationBook, HysteresisBook, Morale, Personality, ReputationBook } from './socialcore.js';
import { DecisionCore } from './decisioncore.js';
import { InteractionCore } from './interactioncore.js';
import { AdvisoryGate } from './advisorygate.js';
import { FactionState, raidUtility, routeCost } from './macrocore.js';
import { DEFAULT_SEED, randomSource } from './randomcore.js';
// Compatibility re-export: the canonical RNG owner is ./randomcore.js.
export { DEFAULT_SEED, mulberry32 } from './randomcore.js';
const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const num = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export class RumorNetwork {
    constructor({ now, maxRumors = 2048, maxQueue = 4096, confidenceHalfLife = 10 } = {}) { this.rumors = []; this.seq = 0; this.queue = []; this.now = now || (() => 0); this.maxRumors = Math.max(1, Math.floor(maxRumors)); this.maxQueue = Math.max(1, Math.floor(maxQueue)); this.confidenceHalfLife = Math.max(1, num(confidenceHalfLife, 10)); }
    publish(data = {}) {
        // RESP-EVENT-ID-AUTHORITY-001: monotonic ids, never array-length templates.
        let id = data.id ?? null;
        if (id == null) {
            // Auto ids skip ids already reserved explicitly, so publishing `{ id: 'rumor-1' }`
            // first can never poison the monotonic counter into throwing on its own output.
            while (this.rumors.some(r => r.id === `rumor-${this.seq + 1}`)) this.seq += 1;
            id = `rumor-${this.seq + 1}`;
            this.seq += 1;
        }
        if (this.rumors.some(r => r.id === id)) throw new Error(`Duplicate rumor id "${id}"`);
        const rumor = { id, claim: data.claim || '', subject: data.subject ?? null, valueEstimate: data.valueEstimate ?? null, source: data.source || 'unknown', sourceTrust: clamp(data.sourceTrust ?? .5), confidence: clamp(data.confidence ?? .5), intensity: clamp(data.intensity ?? .5), timestamp: Number.isFinite(data.timestamp) ? data.timestamp : this.now() };
        this.rumors.push(rumor);
        if (this.rumors.length > this.maxRumors) this.rumors.splice(0, this.rumors.length - this.maxRumors);
        return { ...rumor };
    }
    spread(rumor, recipients = [], options = {}) {
        const clock = options.now || this.now || (() => 0);
        return recipients.map(recipient => {
            recipient.beliefs ||= new Map();
            const belief = recipient.beliefs.get(rumor.claim) || new AgentBelief(rumor.claim, null, 0, { now: clock });
            // RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001: recipient-local trust resolution
            // (trustFor > reputation book > flat sourceTrust) with skepticism gating weight.
            const fallbackTrust = recipient.sourceTrust ?? rumor.sourceTrust ?? .5;
            const baseTrust = typeof recipient.trustFor === 'function' ? recipient.trustFor(rumor.source) : (typeof recipient.reputation?.get === 'function' ? recipient.reputation.get(rumor.source, fallbackTrust) : fallbackTrust);
            const sourceTrust = clamp(num(baseTrust, .5) * (1 - clamp(recipient.skepticism ?? 0)));
            belief.addEvidence(new BeliefEvidence({ ...rumor, sourceTrust }, { now: clock }));
            recipient.beliefs.set(rumor.claim, belief);
            return belief;
        });
    }
    enqueue(rumor, recipient, { delay = 1, ttl = 10, distortion = 0, halfLife = null } = {}) {
        if (!rumor?.id || !recipient?.id) throw new Error('Rumor and recipient ids are required');
        this.queue ||= [];
        const deliveryTick = this.now() + Math.max(0, Math.floor(delay));
        // RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001: snapshot the enqueue state so delivery
        // can decay confidence by actual in-transit latency, deterministically.
        this.queue.push({ rumorId: rumor.id, recipientId: recipient.id, deliveryTick, expiresAt: deliveryTick + Math.max(0, Math.floor(ttl)), distortion: num(distortion), queuedAt: this.now(), sourceConfidence: clamp(num(rumor.confidence, .5)), halfLife: halfLife ?? null });
        if (this.queue.length > this.maxQueue) {
            const overflow = this.queue.length - this.maxQueue;
            const counts = new Map();
            for (const item of this.queue) counts.set(item.recipientId, (counts.get(item.recipientId) ?? 0) + 1);
            const protectedRecipients = new Set(this.queue.filter(item => item.deliveryTick <= this.now() + 1).map(item => item.recipientId));
            const minPerRecipient = Math.max(1, Math.floor(this.maxQueue / Math.max(1, counts.size)));
            const evictable = this.queue.map((item, index) => ({ item, index }))
                .filter(({ item }) => item.deliveryTick > this.now() && item.deliveryTick > this.now() + 1 && !protectedRecipients.has(item.recipientId) && (counts.get(item.recipientId) ?? 0) > minPerRecipient)
                .sort((a, b) => a.item.deliveryTick - b.item.deliveryTick);
            const remove = new Set(evictable.slice(0, overflow).map(entry => entry.index));
            if (remove.size < overflow) for (const entry of this.queue.map((item, index) => ({ item, index })).filter(entry => !remove.has(entry.index) && !protectedRecipients.has(entry.item.recipientId)).slice(0, overflow - remove.size)) remove.add(entry.index);
            this.queue = this.queue.filter((_, index) => !remove.has(index));
            // A full admission pass must always enforce the hard capacity, even when
            // every recipient is protected by imminent-delivery rules.
            if (this.queue.length > this.maxQueue) this.queue.splice(this.maxQueue);
        }
        return this.queue.at(-1);
    }
    expireStale({ now, maxAge = 100 } = {}) {
        const clock = now || this.now || (() => 0);
        const cutoff = clock() - Math.max(0, Math.floor(maxAge));
        const before = this.rumors.length;
        const queuedBeforeExpiry = new Set(this.queue.filter(item => item.expiresAt >= clock()).map(item => item.rumorId));
        this.rumors = this.rumors.filter(rumor => rumor.timestamp >= cutoff || queuedBeforeExpiry.has(rumor.id));
        this.queue = this.queue.filter(item => item.expiresAt >= clock() && this.rumors.some(rumor => rumor.id === item.rumorId));
        return before - this.rumors.length;
    }
    deliverDue(recipients = [], { now } = {}) {
        const clock = now || this.now || (() => 0);
        const byId = new Map(recipients.map(recipient => [recipient.id, recipient]));
        const delivered = []; const pending = [];
        for (const item of this.queue || []) {
            const recipient = byId.get(item.recipientId); const rumor = this.rumors.find(candidate => candidate.id === item.rumorId);
            if (!recipient || !rumor || item.expiresAt < clock()) continue;
            if (item.deliveryTick <= clock() && item.expiresAt >= clock()) {
                // RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001: confidence decays with in-transit
                // latency beyond the nominal one-tick handoff; distortion compounds with it.
                const elapsed = Math.max(0, clock() - (Number.isFinite(item.queuedAt) ? item.queuedAt : item.deliveryTick - 1));
                const latency = Math.max(0, elapsed - 1);
                const halfLife = Math.max(1, num(item.halfLife ?? this.confidenceHalfLife, 10));
                const perTick = 1 - Math.pow(.5, 1 / halfLife);
                const latencyFactor = Math.pow(Math.max(0, 1 - perTick), latency);
                const distortion = Math.max(0, num(item.distortion));
                const distortionFactor = 1 - Math.min(.9, distortion * .1);
                const arrivedConfidence = clamp(num(item.sourceConfidence ?? rumor.confidence, .5) * latencyFactor * distortionFactor);
                const deliveredRumor = { ...rumor, confidence: arrivedConfidence, deliveredAt: clock(), latency, distortion: num(item.distortion) };
                if (item.distortion) { deliveredRumor.id = `${rumor.id}-hop-${item.recipientId}-${item.deliveryTick}`; deliveredRumor.valueEstimate = Number.isFinite(rumor.valueEstimate) ? rumor.valueEstimate + num(item.distortion) : rumor.valueEstimate; }
                this.spread(deliveredRumor, [recipient], { now: clock }); delivered.push(item);
            }
            else pending.push(item);
        }
        this.queue = pending;
        return delivered;
    }
    // RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001: propagation runs through the relayer's
    // recipient-local belief (decayed confidence, local estimate, self as source), so a
    // skeptical or stale relay never forwards the original rumor's freshness.
    relayRumor(rumor, relayer, recipient, { delay = 1, ttl = 10, distortion = 0, halfLife = null } = {}) {
        if (!rumor?.id || !relayer?.id || !recipient?.id) throw new Error('Rumor, relayer, and recipient ids are required');
        const belief = relayer.beliefs?.get(rumor.claim);
        if (!belief || !Array.isArray(belief.evidence) || !belief.evidence.length) return null;
        const lastEvidence = belief.evidence.at(-1);
        const relayed = this.publish({ claim: rumor.claim, subject: rumor.subject, valueEstimate: Number.isFinite(belief.estimate) ? belief.estimate : (rumor.valueEstimate ?? null), confidence: clamp(num(belief.confidence, .5)), source: relayer.id, sourceTrust: clamp(num(lastEvidence.sourceTrust, .5)), timestamp: this.now() });
        return this.enqueue(relayed, recipient, { delay, ttl, distortion, halfLife });
    }
}
export class Market {
    constructor({ prices = {}, stock = {} } = {}) { this.prices = { ...prices }; this.stock = { ...stock }; this.initialStock = { ...stock }; this.history = []; this.inTransit = new Map(); }
    createTrip({ id, good, quantity, destination, cargoKind = good, owner = null } = {}) {
        if (!id || !good || !destination) throw new Error('Trip id, good, and destination are required');
        // The duplicate-id guard must fire before the stock check: a duplicate id against
        // insufficient stock is an invariant violation, not a business 'not enough stock' null.
        if (this.inTransit.has(id)) throw new Error(`Duplicate trip id "${id}"`);
        const amount = num(quantity);
        if (amount <= 0 || (this.stock[good] ?? 0) < amount) return null;
        this.stock[good] -= amount;
        this.history.push({ kind: 'TRIP_EXPORT', tripId: id, good, cargoKind, quantity: amount, destination, owner });
        const trip = { id, good, cargoKind, quantity: amount, destination, owner, status: 'IN_TRANSIT' };
        this.inTransit.set(id, trip);
        return { ...trip };
    }
    settleTrip(id, outcome = 'DELIVERED', destinationMarket = null) {
        const trip = this.inTransit.get(id);
        if (!trip) throw new Error(`Unknown or already settled trip "${id}"`);
        if (!['DELIVERED', 'LOST', 'STOLEN', 'RETURNED'].includes(outcome)) throw new Error(`Invalid trip outcome "${outcome}"`);
        if (outcome === 'DELIVERED') {
            if (!destinationMarket) throw new Error('A destination market is required for delivery');
            destinationMarket.receive(trip.good, trip.quantity);
        } else if (outcome === 'RETURNED') {
            this.receive(trip.good, trip.quantity);
        }
        trip.status = outcome;
        this.inTransit.delete(id);
        this.history.push({ kind: 'TRIP_SETTLEMENT', tripId: id, good: trip.good, cargoKind: trip.cargoKind, quantity: trip.quantity, destination: trip.destination, outcome, owner: trip.owner });
        if (outcome === 'LOST') this.history.push({ kind: 'TRIP_DESTRUCTION', tripId: id, good: trip.good, quantity: trip.quantity, destination: trip.destination });
        if (outcome === 'STOLEN') this.history.push({ kind: 'TRIP_THEFT', tripId: id, good: trip.good, quantity: trip.quantity, destination: trip.destination, owner: 'thief' });
        if (outcome === 'RETURNED') this.history.push({ kind: 'TRIP_RETURN', tripId: id, good: trip.good, quantity: trip.quantity, destination: trip.destination });
        return { ...trip };
    }
    receive(good, quantity) {
        const amount = Math.max(0, num(quantity));
        this.stock[good] = (this.stock[good] ?? 0) + amount;
        this.history.push({ kind: 'TRIP_IMPORT', good, quantity: amount });
        return amount;
    }
    // Stock-and-flow: every mutation is recorded; conservation reconciles exactly via balanceSheet().
    update({ demand = {}, supply = {} } = {}) {
        for (const good of new Set([...Object.keys(demand), ...Object.keys(supply)])) {
            const dRaw = num(demand[good]); const s = num(supply[good]);
            const old = this.prices[good] ?? 1;
            this.prices[good] = Math.max(.01, old * (1 + Math.max(-.5, Math.min(.5, (dRaw - s) / Math.max(1, dRaw + s)))));
            const before = this.stock[good] ?? 0;
            const production = Math.max(0, s);
            const destruction = Math.max(0, -s);
            const afterProduction = before + production;
            const destroyed = Math.min(destruction, afterProduction);
            const discard = destruction - destroyed; // declared destruction beyond available stock
            const available = afterProduction - destroyed;
            const demandClamped = Math.max(0, dRaw); // negative demand must never create material
            const filled = Math.min(demandClamped, available);
            const unmet = demandClamped - filled;
            this.stock[good] = available - filled;
            this.history.push({ kind: 'UPDATE', good, demand: dRaw, supply: s, production, destruction, destroyed, discard, filled, unmet });
        }
        return { ...this.prices };
    }
    trade(good, quantity, price = this.prices[good] ?? 1) {
        const amount = Math.max(0, num(quantity));
        const priceUsed = Math.max(.01, num(price, 1));
        if (amount === 0) { this.history.push({ kind: 'TRADE', good, quantity: 0, price: priceUsed, settled: false, reason: 'ZERO_QUANTITY' }); return null; }
        const available = this.stock[good] ?? 0;
        if (amount > available) { this.history.push({ kind: 'TRADE', good, quantity: amount, price: priceUsed, settled: false, reason: 'INSUFFICIENT_STOCK', available }); return null; }
        this.stock[good] = available - amount;
        this.prices[good] = priceUsed;
        this.history.push({ kind: 'TRADE', good, quantity: amount, price: priceUsed, settled: true });
        return amount * priceUsed;
    }
    // Settled trade flows only (kept for compatibility with the world-tick contract).
    flows() {
        const net = {}; const value = {};
        for (const entry of this.history) {
            if (entry.kind !== 'TRADE' || !entry.settled) continue;
            net[entry.good] = (net[entry.good] ?? 0) + entry.quantity;
            value[entry.good] = (value[entry.good] ?? 0) + entry.quantity * entry.price;
        }
        return { net, value };
    }
    // Exact conservation: stock === initial + production - destroyed - consumption - tradeOut.
    balanceSheet() {
        const goods = new Set([...Object.keys(this.initialStock), ...Object.keys(this.stock)]);
        for (const entry of this.history) goods.add(entry.good);
        const summary = {};
        for (const good of goods) {
            let production = 0, destruction = 0, destroyed = 0, discard = 0, consumption = 0, unmet = 0, tradeOut = 0;
            for (const entry of this.history) {
                if (entry.good !== good) continue;
                if (entry.kind === 'UPDATE') { production += entry.production; destruction += entry.destruction; destroyed += entry.destroyed; discard += entry.discard; consumption += entry.filled; unmet += entry.unmet; }
                else if (entry.kind === 'ROAMING_GROUP_CONSUMPTION' || entry.kind === 'QUEUE_AWARE_SETTLEMENT_CONSUMPTION') consumption += entry.quantity;
                else if (entry.kind === 'ROAMING_GROUP_LOOT_TRANSFER') production += entry.quantity;
                else if (entry.kind === 'ROAMING_GROUP_LOOT_CONSUMPTION') consumption += entry.quantity;
                else if (entry.kind === 'TRADE' && entry.settled) tradeOut += entry.quantity;
                else if (entry.kind === 'TRIP_EXPORT' || entry.kind === 'QUEUE_AWARE_CROSS_MARKET_EXPORT') tradeOut += entry.quantity;
                else if (entry.kind === 'TRIP_DESTRUCTION') { destroyed += entry.quantity; tradeOut -= entry.quantity; }
                else if (entry.kind === 'TRIP_IMPORT') production += entry.quantity;
            }
            const expected = (this.initialStock[good] ?? 0) + production - destroyed - consumption - tradeOut;
            const actual = this.stock[good] ?? 0;
            summary[good] = { initial: this.initialStock[good] ?? 0, production, destruction, destroyed, discard, consumption, unmet, tradeOut, expected, actual, balanced: Math.abs(expected - actual) < 1e-9 };
        }
        return { balanced: Object.values(summary).every(s => Math.abs(s.expected - s.actual) < 1e-9), goods: summary };
    }
}
export class RouteNetwork {
    constructor(edges = []) { this.edges = edges.map(edge => ({ ...edge, traffic: edge.traffic ?? 0 })); }
    observeRoute(route, observation = {}) {
        if (!route || !route.id) throw new Error('A route with an id is required');
        const distance = Math.max(0, num(observation.distance, 0));
        const range = Math.max(0, num(observation.range, Infinity));
        if (distance > range) return null;
        const noise = Number.isFinite(observation.distortion) ? observation.distortion : 0;
        const perceivedDanger = Math.max(0, num(observation.perceivedDanger, 0) + noise);
        const confidence = clamp(observation.confidence ?? (Math.abs(noise) > 0 ? .5 : 1));
        return { routeId: route.id, perceivedDanger, confidence, source: observation.source ?? 'unknown', observedAt: num(observation.observedAt, 0), distance };
    }
    chooseRoute(routes, context = {}) {
        const candidates = [...routes].filter(route => route && route.available !== false);
        const beliefs = context.beliefs instanceof Map ? context.beliefs : new Map(Object.entries(context.beliefs ?? {}));
        return candidates.sort((a, b) => {
            const dangerFor = route => {
                const belief = beliefs.get(`route:${route.id}:danger`);
                if (!belief || !Number.isFinite(belief.estimate)) return num(route.perceivedDanger, 0);
                const confidence = clamp(belief.confidence);
                return confidence * belief.estimate + (1 - confidence) * num(route.perceivedDanger, 0);
            };
            const aCost = routeCost({ ...a, perceivedDanger: dangerFor(a), predictabilityPenalty: (a.traffic ?? 0) * (a.predictabilityWeight ?? .1) }, context);
            const bCost = routeCost({ ...b, perceivedDanger: dangerFor(b), predictabilityPenalty: (b.traffic ?? 0) * (b.predictabilityWeight ?? .1) }, context);
            return aCost - bCost;
        })[0] || null;
    }
    travel(route, cargo = 0) { if (!route) return false; route.traffic = Math.min(Math.max(0, num(route.traffic, 0)) + Math.max(0, num(cargo)), Math.max(1, num(route.trafficCapacity, 100))); return true; }
    decayTraffic(rate = .05) { for (const route of this.edges) route.traffic = Math.max(0, num(route.traffic, 0) * (1 - clamp(rate))); return this.edges.map(route => ({ id: route.id, traffic: route.traffic })); }
    riskOutcome(route, { danger = route?.perceivedDanger ?? 0, threshold = 1 } = {}) {
        const risk = Math.max(0, num(danger));
        return risk >= Math.max(0, num(threshold, 1)) ? 'STOLEN' : 'DELIVERED';
    }
}
// RESP-CHARACTER-INTERACTION-AFFORDANCES-001: declared, serializable effects the executor
// may apply after advisory approval. Affordances without entries execute but are non-material
// in this model (observe/greet/feed/protect/flee record only).
const INTERACTION_EFFECTS = { transform: [{ subject: 'target', set: { type: 'VAMPIRE' } }], recruit: [{ subject: 'target', set: { type: 'VAMPIRE' } }] };
export class FactionRuntime {
    constructor(id, values = {}) { const { loot, ...stateValues } = values; this.id = id; this.state = new FactionState(stateValues); this.history = []; this.loot = num(loot, 0); } // RESP-FACTION-RAID-LOOP-001: `loot` is the faction's raid-stash, conserved across resolutions
    evaluateRaid(target, values = {}) { const score = raidUtility({ ...values, retaliationRisk: values.retaliationRisk ?? target.state?.militaryConfidence ?? .5 }); const decision = score > 0 ? 'RAID' : 'DEESCALATE'; this.history.push({ target: target.id, score, decision }); return { target: target.id, score, decision, escalationLevel: this.state.escalationLevel() }; }
    evaluateAction(target, context = {}) {
        const candidates = [
            { id: 'HOLD', considerations: [{ name: 'legitimacy', value: context.legitimacy ?? this.state.legitimacy }] },
            { id: 'RAID', considerations: [{ name: 'opportunity', value: context.opportunity ?? this.state.opportunity }, { name: 'resourceNeed', value: context.resourceNeed ?? this.state.resourceNeed }], prerequisites: context.canRaid === false ? ['canRaid'] : [] },
            { id: 'PATROL', considerations: [{ name: 'security', value: context.security ?? this.state.supplySecurity }] },
        ];
        return { target: target?.id ?? null, ...new DecisionCore({ rng: context.rng }).evaluate({ ...context, actorId: this.id }, candidates) };
    }
}
export class SocietyCore {
    constructor({ rng, seed } = {}) {
        this.rumors = new RumorNetwork({ now: () => this.time }); this.reputation = new ReputationBook(); this.markets = new Map(); this.routes = new RouteNetwork(); this.factions = new Map();
        this.events = []; this.eventSeq = 0; this.time = 0; // world clock; tick()/step() advance it
        this.rngSeed = seed ?? DEFAULT_SEED;
        this.rng = randomSource(rng, this.rngSeed);
        this.actors = new Map();
        this.settlements = new Map();
        this.migrationJourneys = new Map();
        this.roamingGroups = new Map();
        this.infrastructure = new Map();
        // RESP-CONVOY-ESCORT-BANDIT-LOOP-001: escort-managed convoys over market trips.
        this.convoys = new Map();
        // RESP-FACTION-RAID-LOOP-001: raids in flight (evaluation → dispatch → resolution).
        this.raids = new Map();
        // Re-opened `Habituation` row: exposure book attenuating faction fear gains.
        this.habituation = new HabituationBook();
        // Re-opened `Hysteresis` row: per-faction fear state machine — asymmetric enter/exit
        // thresholds behind the minimum-duration gate. minStateDuration 2: legacy's per-frame
        // 10 assumed 60fps, V8 fear events are story beats, so the mechanism stays with a
        // world-scale value. FREEZE only rolls on explicit low-morale context, so production
        // updates consume zero RNG (the seeded world streams are untouched).
        this.hysteresis = new HysteresisBook({ rng: () => this.rng(), minStateDuration: 2 });
        // RESP-PLAYER-INVASION-CHAIN-001: player vitals, war-pressure state, resolved invasions.
        this.player = { hp: 100, maxHp: 100, alive: true, deaths: 0 };
        this.warState = { status: 'PEACE', pressure: 0, tensionThreshold: 30, warThreshold: 70 };
        this.warLoot = 0;
        this.invasions = new Map();
        // Decisions run inside the canonical event graph and share the world RNG (deterministic turns).
        this.decisions = new DecisionCore({ rng: this.rng });
        this.interactions = new InteractionCore({ rng: this.rng });
        this.advisory = new AdvisoryGate({ interactionCore: this.interactions });
        // Canonical Personality/Morale state per actor (revived as class instances on load).
        this.personalities = new Map(); this.morales = new Map();
    }
    // All randomness flows through the injectable RNG (contract: no Math.random in the turn).
    random() { return num(this.rng.next(), .5); }
    // Personality/Morale ownership (socialcore is the single runtime owner; brain.js is absent
    // from this checkout): partial trait draws come from the world RNG so seeded worlds
    // reproduce identical personalities.
    setPersonality(actorId, values = {}) { const personality = values instanceof Personality ? values : new Personality(values, { rng: this.rng }); this.personalities.set(actorId, personality); return personality; }
    getPersonality(actorId) { return this.personalities.get(actorId) ?? null; }
    setMorale(actorId, value = 1) { const morale = value instanceof Morale ? value : new Morale(value); this.morales.set(actorId, morale); return morale; }
    getMorale(actorId) { return this.morales.get(actorId) ?? null; }
    // Evaluation context enrichment: stored Personality/Morale flow into decision scoring
    // (band width via Personality.decisionBandWidth, morale readable by considerations).
    evaluationContext(context = {}, actorId = null) {
        const personality = context.personality ?? (actorId ? this.personalities.get(actorId) : null);
        const stored = actorId ? this.morales.get(actorId) : null;
        const morale = context.morale ?? stored?.value;
        // RESP-REPUTATION-PUBLIC-PRIVATE-001: decisions consume the world reputation book —
        // public standing via reputationOf, the observer-private channel via the book itself.
        return { ...context, ...(personality ? { personality } : {}), ...(morale != null ? { morale } : {}), reputation: context.reputation ?? this.reputation, reputationOf: context.reputationOf ?? (subject => this.reputation.get(subject)) };
    }
    addMarket(id, market = new Market()) { this.markets.set(id, market); return market; }
    addFaction(id, state = {}) { const faction = new FactionRuntime(id, state); this.factions.set(id, faction); return faction; }
    lootBalanceSheet(group) {
        const current = Math.max(0, num(group?.loot));
        const destroyed = Math.max(0, num(group?.lootDestroyed));
        const transferred = Math.max(0, num(group?.lootTransferred));
        const initial = Math.max(0, num(group?.initialLoot));
        return { initial, destroyed, transferred, current, expected: initial - destroyed - transferred, balanced: Math.abs(initial - destroyed - transferred - current) < 1e-9 };
    }
    addRoamingGroup(id, { location = null, food = 0, loot = 0, foodNeed = 0, lootNeed = 0 } = {}) {
        const group = { id, location, food: Math.max(0, num(food)), loot: Math.max(0, num(loot)), initialLoot: Math.max(0, num(loot)), lootDestroyed: 0, foodNeed: Math.max(0, num(foodNeed)), lootNeed: Math.max(0, num(lootNeed)), supportReceived: Math.max(0, num(arguments[1]?.supportReceived, 0)), settlementReliance: clamp(num(arguments[1]?.settlementReliance, 0)) };
        this.roamingGroups.set(id, group); return group;
    }
    addSettlement(id, { population = 0, capacity = 1e9, legitimacy = .5, adaptation = 0, recoveryBudget = 0, resources = 0, resourceCapacity = 100 } = {}) { const settlement = { id, population: Math.max(0, num(population)), capacity: Number.isFinite(capacity) ? Math.max(0, capacity) : 1e9, legitimacy: clamp(legitimacy), adaptation: clamp(adaptation), recoveryBudget: Math.max(0, num(recoveryBudget)), resources: Math.min(Math.max(0, num(resourceCapacity, 100)), Math.max(0, num(resources))), resourceCapacity: Math.max(0, num(resourceCapacity, 100)), resourceOverflow: 0 }; this.settlements.set(id, settlement); return settlement; }
    addInfrastructure(id, { type = 'ROAD', settlement = null, capacity = 100, condition = 1 } = {}) { const structure = { id, type, settlement, capacity: Math.max(0, num(capacity)), condition: clamp(condition) }; this.infrastructure.set(id, structure); return structure; }
    beginMigration({ id, from, to, population = 0, routeId = null, routeIds = null, perceivedDanger = 0 } = {}) {
        const source = this.settlements.get(from); const destination = this.settlements.get(to);
        const amount = Math.floor(num(population));
        if (!id || !source || !destination || amount <= 0 || amount > source.population || destination.population + amount > destination.capacity) return null;
        source.population -= amount;
        const path = Array.isArray(routeIds) && routeIds.length ? [...routeIds] : (routeId ? [routeId] : []);
        const journey = { id, from, to, population: amount, routeId: path[0] ?? null, routeIds: path, hop: 0, perceivedDanger: Math.max(0, num(perceivedDanger)), status: 'IN_TRANSIT' };
        this.migrationJourneys.set(id, journey);
        return { ...journey };
    }
    settleMigration(id, outcome = 'ARRIVED') {
        const journey = this.migrationJourneys.get(id);
        if (!journey) throw new Error(`Unknown or already settled migration "${id}"`);
        const destination = this.settlements.get(journey.to);
        if (outcome === 'ARRIVED') destination.population += journey.population;
        else if (outcome === 'RETURNED') this.settlements.get(journey.from).population += journey.population;
        else if (outcome === 'STOLEN' || outcome === 'LOST') { /* explicit journey loss */ }
        else throw new Error(`Invalid migration outcome "${outcome}"`);
        journey.status = outcome; this.migrationJourneys.delete(id); return { ...journey };
    }
    // Monotonic allocator: unique sequential ids, ordered parentage, tick from the world clock.
    allocateEvent({ type = 'EVENT', parent = null, id = null, ...fields } = {}) {
        const parentId = parent == null ? null : (typeof parent === 'string' ? parent : parent.id ?? null);
        if (parentId != null && !this.events.some(e => e.id === parentId)) throw new Error(`Unknown parent event "${parentId}"`);
        const nextId = id ?? `evt-${this.eventSeq + 1}`;
        if (this.events.some(e => e.id === nextId)) throw new Error(`Duplicate event id "${nextId}"`);
        return { id: nextId, seq: this.eventSeq + 1, tick: this.time, type, parentId, ...fields };
    }
    commitEvent(event = {}) {
        const record = { ...event, tick: event.tick ?? this.time };
        if (record.id == null) record.id = `evt-${this.eventSeq + 1}`;
        if (record.seq == null) record.seq = this.eventSeq + 1;
        if (this.events.some(e => e.id === record.id)) throw new Error(`Duplicate event id "${record.id}"`);
        if (record.seq !== this.eventSeq + 1) throw new Error(`Non-monotonic event seq ${record.seq}`);
        this.eventSeq = record.seq; this.events.push(record); return record;
    }
    now() { return this.time; }
    applySeason(marketId, { season = 'SPRING', harvest = 0 } = {}) {
        const market = this.markets.get(marketId);
        if (!market) throw new Error(`Unknown market "${marketId}"`);
        const modifiers = { SPRING: 1, SUMMER: 1.1, AUTUMN: 1.2, WINTER: .5, DROUGHT: .2 };
        const factor = modifiers[season] ?? 1;
        const produced = Math.max(0, num(harvest) * factor);
        if (produced > 0) market.update({ supply: { grain: produced } });
        return { season, factor, produced, price: market.prices.grain ?? null };
    }
    spreadRumor(rumor, recipients = []) { return this.rumors.spread(rumor, recipients, { now: () => this.now() }); }
    queueRumor(rumor, recipient, options = {}) { return this.rumors.enqueue(rumor, recipient, { ...options, delay: options.delay ?? 1 }); }
    relayRumor(rumor, relayer, recipient, options = {}) { return this.rumors.relayRumor(rumor, relayer, recipient, options); }
    // RESP-EVENT-CAUSALITY-001: returns { factor, decayed } so the owning turn can record
    // belief aging in world history instead of mutating confidence silently.
    decayRouteBeliefs({ halfLife = 10 } = {}) {
        const decay = Math.max(0, Math.min(1, 1 - Math.pow(.5, 1 / Math.max(1, num(halfLife, 10)))));
        let decayed = 0;
        for (const actor of this.actors.values()) for (const [claim, belief] of (actor.beliefs ?? new Map())) {
            if (!claim.startsWith('route:') || !Number.isFinite(belief.lastUpdated)) continue;
            const age = Math.max(0, this.now() - belief.lastUpdated);
            if (age > 0 && Number.isFinite(belief.confidence)) {
                const before = belief.confidence;
                belief.confidence = clamp(belief.confidence * Math.pow(1 - decay, age));
                if (belief.confidence !== before) decayed += 1;
            }
        }
        return { factor: decay, decayed };
    }
    // RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001: non-route rumor beliefs also age with the
    // world clock; estimates are never rewritten, only confidence erodes.
    decayRumorBeliefs({ halfLife = 60 } = {}) {
        const decay = Math.max(0, Math.min(1, 1 - Math.pow(.5, 1 / Math.max(1, num(halfLife, 60)))));
        let decayed = 0;
        for (const actor of this.actors.values()) for (const [claim, belief] of (actor.beliefs ?? new Map())) {
            if (claim.startsWith('route:') || !Number.isFinite(belief.lastUpdated)) continue;
            const age = Math.max(0, this.now() - belief.lastUpdated);
            if (age > 0 && Number.isFinite(belief.confidence)) {
                const before = belief.confidence;
                belief.confidence = clamp(belief.confidence * Math.pow(1 - decay, age));
                if (belief.confidence !== before) decayed += 1;
            }
        }
        return { factor: decay, decayed };
    }
    deliverRumors(recipients = []) {
        const delivered = this.rumors.deliverDue(recipients, { now: () => this.now() });
        this.rumors.expireStale({ now: () => this.now(), maxAge: 100 });
        for (const item of delivered) {
            const recipient = recipients.find(candidate => candidate.id === item.recipientId);
            const rumor = this.rumors.rumors.find(candidate => candidate.id === item.rumorId);
            // RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001: register every delivered recipient
            // (route claims and plain rumor beliefs) so the world clock can age their beliefs.
            if (recipient && rumor && recipient.beliefs?.has(rumor.claim)) this.actors.set(recipient.id, recipient);
        }
        return delivered;
    }
    transferQueueAwareEconomicSupply({ fromMarket, toMarket, good = 'grain', quantity = 0, reason = 'queued-transfer', routeId = null, routeIds = null, actorId = null, context = {} } = {}) {
        const source = this.markets.get(fromMarket);
        const destination = this.markets.get(toMarket);
        if (!source || !destination) throw new Error('Source and destination markets are required');
        const candidates = Array.isArray(routeIds) && routeIds.length ? routeIds.map(id => this.routes.edges.find(edge => edge.id === id)).filter(Boolean) : (routeId ? [this.routes.edges.find(edge => edge.id === routeId)].filter(Boolean) : []);
        const selectedRoute = candidates.length ? this.routes.chooseRoute(candidates, context) : null;
        const accessBlocked = Boolean((Array.isArray(routeIds) && routeIds.length || routeId) && (!selectedRoute || selectedRoute.available === false));
        const requested = Math.max(0, num(quantity));
        const moved = accessBlocked ? 0 : Math.min(requested, Math.max(0, num(source.stock[good], 0)));
        source.stock[good] = Math.max(0, num(source.stock[good], 0) - moved);
        if (moved > 0) {
            this.routes.travel(selectedRoute, moved);
            source.history.push({ kind: 'QUEUE_AWARE_CROSS_MARKET_EXPORT', good, quantity: moved, destination: toMarket, reason, routeId: selectedRoute?.id ?? routeId, actorId });
            destination.receive(good, moved);
            destination.history.push({ kind: 'QUEUE_AWARE_CROSS_MARKET_IMPORT', good, quantity: moved, source: fromMarket, reason, routeId: selectedRoute?.id ?? routeId, actorId });
        }
        return { fromMarket, toMarket, good, requested, moved, routeId: selectedRoute?.id ?? routeId, routeIds: candidates.map(route => route.id), actorId, accessBlocked, sourceStock: source.stock[good], destinationStock: destination.stock[good] };
    }
    applyQueueAwareSettlementEconomy({ settlement, market, good = 'grain', recipientId, foodNeed = 0, priceSensitivity = 1, reportClaim = null } = {}) {
        const town = this.settlements.get(settlement);
        const destination = this.markets.get(market);
        if (!town || !destination) throw new Error('A settlement and market are required');
        const recipient = recipientId ? this.actors.get(recipientId) : null;
        const claim = reportClaim ?? [...(recipient?.beliefs?.keys() ?? [])].find(value => value.startsWith('route:')) ?? `route:${market}:danger`;
        const belief = recipient?.beliefs?.get(claim) ?? null;
        const confidence = belief ? clamp(belief.confidence) : 0;
        const reportedDanger = belief && Number.isFinite(belief.estimate) ? Math.max(0, belief.estimate) : 0;
        const demand = Math.max(0, num(foodNeed, town.population * .01));
        const price = Math.max(.01, num(destination.prices[good], 1));
        const informationPenalty = confidence * reportedDanger * Math.max(0, num(priceSensitivity, 1));
        const requested = Math.max(0, demand * (1 + informationPenalty));
        const available = Math.max(0, num(destination.stock[good], 0));
        const consumed = Math.min(requested, available);
        destination.stock[good] = available - consumed;
        if (consumed > 0) destination.history.push({ kind: 'QUEUE_AWARE_SETTLEMENT_CONSUMPTION', good, quantity: consumed, settlementId: town.id, recipientId: recipientId ?? null, confidence, reportedDanger });
        const unmet = requested - consumed;
        town.resources = Math.max(0, town.resources - Math.min(town.resources, unmet));
        return { settlementId: town.id, marketId: market, good, recipientId: recipientId ?? null, claim, confidence, reportedDanger, demand, requested, consumed, unmet, marketStock: destination.stock[good], resourceShortfall: unmet > town.resources };
    }
    recordRouteObservation(actor, route, observation = {}) {
        if (!actor || !route) throw new Error('An actor and route are required');
        actor.beliefs ||= new Map();
        const observed = this.routes.observeRoute(route, { ...observation, observedAt: observation.observedAt ?? this.now() });
        if (!observed) return null;
        const claim = `route:${observed.routeId}:danger`;                const belief = actor.beliefs.get(claim) || new AgentBelief(claim, null, 0, { now: () => this.now() });
        belief.addEvidence(new BeliefEvidence({ claim, subject: observed.routeId, valueEstimate: observed.perceivedDanger, confidence: observed.confidence, source: observed.source, directObservation: true, timestamp: observed.observedAt }, { now: () => this.now() }));
        actor.beliefs.set(claim, belief);
        this.actors.set(actor.id, actor);
        return { ...observed, claim };
    }
    // RESP-EVENT-CAUSALITY-001: decisions consume world events, not anonymous mutable maps.
    // Reverse scan of committed history resolves the latest BELIEF_UPDATED or RUMOR_DELIVERED
    // that produced an actor's belief; the returned id is always from an earlier seq than
    // any decision recorded after this call.
    beliefProvenance(actorId, claim) {
        if (actorId == null || !claim) return null;
        for (let index = this.events.length - 1; index >= 0; index -= 1) {
            const event = this.events[index];
            if (event.claim !== claim) continue;
            if (event.type === 'BELIEF_UPDATED' && event.actorId === actorId) return { eventId: event.id, tick: event.tick, type: event.type };
            if (event.type === 'RUMOR_DELIVERED' && event.recipientId === actorId) return { eventId: event.id, tick: event.tick, type: event.type };
        }
        return null;
    }
    // RESP-CAUSAL-CHAIN-INSPECTOR-001: walk any event's parent chain back to its roots and
    // surface the belief-producing events it cites, validating ordered parentage on the way
    // (parent.seq < child.seq, no cycles, no dangling parents). Read-only: never mutates history.
    causalChain(eventId) {
        const byId = new Map(this.events.map(event => [event.id, event]));
        const walkLineage = start => {
            const chain = [];
            const seen = new Set();
            let cursor = start;
            while (true) {
                chain.push(cursor);
                if (seen.has(cursor.id)) throw new Error(`Cyclic parent chain at "${cursor.id}"`);
                seen.add(cursor.id);
                if (cursor.parentId == null) break;
                const parent = byId.get(cursor.parentId);
                if (!parent) throw new Error(`Dangling parent "${cursor.parentId}" below "${cursor.id}"`);
                if (!(parent.seq < cursor.seq)) throw new Error(`Parentage order violated: "${parent.id}" (seq ${parent.seq}) → "${cursor.id}" (seq ${cursor.seq})`);
                cursor = parent;
            }
            return chain.reverse(); // root first, start last
        };
        const start = byId.get(eventId);
        if (!start) throw new Error(`Unknown event "${eventId}"`);
        const lineage = walkLineage(start);
        const beliefProducers = [];
        const cited = new Set();
        for (const event of [...lineage].reverse()) { // the start event first, then its ancestors
            const producerId = event.beliefProvenance?.eventId;
            if (!producerId || cited.has(producerId)) continue;
            const producer = byId.get(producerId);
            if (!producer) throw new Error(`Dangling belief provenance "${producerId}" below "${event.id}"`);
            cited.add(producerId);
            beliefProducers.push({ citedBy: event.id, event: producer, lineage: walkLineage(producer) });
        }
        return { event: start, lineage, beliefProducers, roots: lineage.filter(event => event.parentId == null).map(event => event.id) };
    }
    // RESP-EVENT-GRAPH-AUDIT-001: one pass over the whole history validating unique ids,
    // contiguous seq mirroring eventSeq, resolvable parents, and ordered parentage
    // (parent.seq < child.seq and parent.tick <= child.tick) — the seq ordering makes cycles
    // structurally impossible, so verifying it rules them out. Read-only.
    auditEventGraph() {
        const violations = [];
        const byId = new Map();
        let roots = 0;
        this.events.forEach((event, index) => {
            if (byId.has(event.id)) violations.push({ kind: 'DUPLICATE_ID', eventId: event.id });
            else byId.set(event.id, event);
            if (event.seq !== index + 1) violations.push({ kind: 'SEQ_CONTINUITY', eventId: event.id, expected: index + 1, actual: event.seq });
        });
        if (this.eventSeq !== this.events.length) violations.push({ kind: 'SEQ_MIRROR', eventSeq: this.eventSeq, events: this.events.length });
        for (const event of this.events) {
            if (event.parentId == null) { roots += 1; continue; }
            const parent = byId.get(event.parentId);
            if (!parent) { violations.push({ kind: 'DANGLING_PARENT', eventId: event.id, parentId: event.parentId }); continue; }
            if (!(parent.seq < event.seq)) violations.push({ kind: 'PARENT_SEQ_ORDER', eventId: event.id, parentId: parent.id });
            if (Number.isFinite(parent.tick) && parent.tick > event.tick) violations.push({ kind: 'PARENT_TICK_ORDER', eventId: event.id, parentId: parent.id });
        }
        return { ok: violations.length === 0, checked: this.events.length, roots, eventSeq: this.eventSeq, violations };
    }
    // Canonical deterministic world turn: advance the clock, open a TURN event, apply actions in order.
    tick({ actions = [] } = {}) {
        this.time += 1;
        const routeDecay = this.decayRouteBeliefs();
        const rumorDecay = this.decayRumorBeliefs();
        // RESP-EVENT-CAUSALITY-001: belief aging is part of the turn's history — recorded on
        // the TURN before any action consumes the decayed beliefs below.
        const turn = this.commitEvent(this.allocateEvent({ type: 'TURN', beliefDecay: { routeFactor: routeDecay.factor, rumorFactor: rumorDecay.factor, routeClaims: routeDecay.decayed, rumorClaims: rumorDecay.decayed } }));
        for (const action of actions) {
            const result = this.executeAction(action, turn);
            if (Array.isArray(result)) result.forEach(event => this.commitEvent(event));
            else this.commitEvent(result);
        }
        return this.time;
    }
    step(options = {}) { return this.tick(options); }
    progressPendingTrips({ routes = this.routes.edges, riskThreshold = 1 } = {}) {
        const actions = [];
        for (const [marketId, market] of this.markets) for (const trip of market.inTransit.values()) {
            // RESP-CONVOY-ESCORT-BANDIT-LOOP-001: escort-owned convoys settle through the
            // escort resolution loop, never through the generic trip progresser.
            const convoy = trip.convoyId ? this.convoys.get(trip.convoyId) : null;
            if (convoy && (convoy.status === 'ESCORTED' || convoy.status === 'THREATENED')) continue;
            const route = routes.find(candidate => candidate.id === trip.routeId) ?? routes.find(candidate => candidate.available !== false);
            if (!route || route.available === false) {
                actions.push({ kind: 'MARKET_TRIP_SETTLE', market: marketId, tripId: trip.id, destinationMarket: trip.destination, routeId: trip.routeId ?? route?.id ?? null, outcome: 'BLOCKED', riskThreshold });
                continue;
            }
            actions.push({ kind: 'MARKET_TRIP_SETTLE', market: marketId, tripId: trip.id, destinationMarket: trip.destination, routeId: route.id, riskThreshold, perceivedDanger: route.perceivedDanger, routeAvailable: route.available });
        }
        return actions;
    }
    worldStep({ market, season = 'SPRING', harvest = 0, destination, good = 'grain', minimumPrice = 0, routes, actorId = null, rumor, rumorRecipients = [], faction, factionTarget, factionContext = {}, factionTurns = false, migration, actions = [] } = {}) {
        const planned = [
            ...(market ? [{ kind: 'SEASON_UPDATE', market, season, harvest }] : []),
            ...(destination && routes ? [{ kind: 'TRADE_ROUTE_DECISION', destination, good, minimumPrice, routes, actorId }] : []),
            ...(faction ? [{ kind: 'FACTION_EVALUATION', faction, targetId: factionTarget, context: factionContext }] : []),
            ...(factionTurns ? [{ kind: 'FACTION_MACRO_TICK' }] : []),
            ...(migration ? [migration] : []),
            ...actions,
        ];
        // RESP-EVENT-CAUSALITY-001: rumor queueing and delivery run INSIDE the turn as
        // canonical actions (queue first, then deliver), so enqueue metadata and recipient
        // belief writes land in world history with ordered parentage. Timing is unchanged:
        // the clock advances before actions run, so deliveryTick computes exactly as the
        // former post-tick call, and delay >= 1 is still not due in the same turn.
        const rumorActions = [
            ...(rumor && rumorRecipients.length ? rumorRecipients.map(recipient => ({ kind: 'RUMOR_QUEUE', rumor, recipient, delay: recipient.delay ?? 1, ttl: recipient.ttl ?? 10, distortion: recipient.distortion ?? 0 })) : []),
            ...(rumorRecipients.length ? [{ kind: 'RUMOR_DELIVER', recipients: rumorRecipients }] : []),
        ];
        const result = this.tick({ actions: [...this.progressPendingTrips({ routes: routes ?? this.routes.edges }), ...planned, ...rumorActions] });
        return result;
    }
    executeAction(action = {}, parent = null) {
        const kind = action.kind ?? action.type;
        switch (kind) {
            case 'INTERACTION_EVALUATION': {
                const actor = action.actor || { id: action.actorId, type: action.actorType };
                const target = action.target || { id: action.targetId, type: action.targetType };
                const result = this.interactions.decide(actor, target, action.context ?? {});
                return this.allocateEvent({ type: 'INTERACTION_EVALUATION', parent, actorId: actor.id ?? null, targetId: target.id ?? null, selected: result.selected, valid: result.valid, alternatives: result.alternatives.map(candidate => ({ action: candidate.action, score: candidate.finalScore })), explanation: result.explanation });
            }
            case 'ADVISORY_VALIDATION': {
                const actor = action.actor || { id: action.actorId, type: action.actorType };
                const target = action.target || { id: action.targetId, type: action.targetType };
                const result = this.advisory.validate(action.proposal ?? action.action, actor, target, action.context ?? {});
                return this.allocateEvent({ type: 'ADVISORY_VALIDATION', parent, actorId: actor.id ?? null, targetId: target.id ?? null, approved: result.approved, action: result.action, blockers: result.blockers });
            }
            case 'MIGRATION_BEGIN': {
                const journey = this.beginMigration(action);
                return this.allocateEvent({ type: 'MIGRATION_BEGIN', parent, journeyId: action.id, from: action.from, to: action.to, population: num(action.population), status: journey ? 'IN_TRANSIT' : 'REJECTED' });
            }
            case 'MIGRATION_SETTLE': {
                const journeyBefore = this.migrationJourneys.get(action.id);
                const route = journeyBefore?.routeId ? this.routes.edges.find(edge => edge.id === journeyBefore.routeId) : null;
                const path = (journeyBefore?.routeIds ?? []).map(routeId => this.routes.edges.find(edge => edge.id === routeId)).filter(Boolean);
                const hopDanger = path[journeyBefore?.hop ?? 0]?.perceivedDanger ?? journeyBefore?.perceivedDanger ?? 0;
                const outcome = action.outcome ?? (route ? (this.routes.riskOutcome(route, { danger: hopDanger, threshold: action.riskThreshold ?? 1 }) === 'STOLEN' ? 'STOLEN' : 'ARRIVED') : 'ARRIVED');
                const journey = this.settleMigration(action.id, outcome);
                return this.allocateEvent({ type: 'MIGRATION_SETTLE', parent, journeyId: journey.id, from: journey.from, to: journey.to, population: journey.population, outcome: journey.status, routeId: journey.routeId ?? null, perceivedDanger: journey.perceivedDanger ?? 0 });
            }
            case 'SEASON_UPDATE': {
                const result = this.applySeason(action.market, { season: action.season, harvest: action.harvest });
                return this.allocateEvent({ type: 'SEASON_UPDATE', parent, market: action.market, season: result.season, factor: result.factor, produced: result.produced, price: result.price });
            }
            case 'ROAMING_GROUP_EVALUATION': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const foodPressure = Math.max(0, num(action.foodNeed, group.foodNeed) - group.food);
                const lootPressure = Math.max(0, num(action.lootNeed, group.lootNeed) - group.loot);
                const canRaid = action.canRaid !== false;
                const selected = foodPressure > 0 ? (canRaid ? 'RAID' : 'SEEK_FOOD') : (lootPressure > 0 ? 'TRADE' : 'TRAVEL');
                if (selected === 'RAID') group.loot += Math.min(foodPressure, Math.max(0, num(action.raidYield, 1)));
                if (selected === 'SEEK_FOOD') group.food += Math.min(foodPressure, Math.max(0, num(action.foodYield, 1)));
                if (selected === 'TRADE') group.food += Math.min(lootPressure, Math.max(0, num(action.tradeFood, 1)));
                return this.allocateEvent({ type: 'ROAMING_GROUP_EVALUATION', parent, groupId: group.id, location: group.location, selected, food: group.food, loot: group.loot, foodPressure, lootPressure, canRaid });
            }
            case 'ROAMING_GROUP_MOBILITY_ROUTE': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const routes = (action.routes ?? this.routes.edges).filter(Boolean);
                const context = { fearSensitivity: Math.max(.1, 1 + group.settlementReliance), uncertaintyAversion: 1 + group.settlementReliance };
                const selected = group.settlementReliance >= Math.max(0, num(action.relianceThreshold, .5)) ? null : this.routes.chooseRoute(routes, context);
                if (selected) this.routes.travel(selected, action.groupSize ?? 1);
                return this.allocateEvent({ type: 'ROAMING_GROUP_MOBILITY_ROUTE', parent, groupId: group.id, reliance: group.settlementReliance, selectedRoute: selected?.id ?? null, decision: selected ? 'ROAM' : 'RETURN_TO_SETTLEMENT', traffic: selected?.traffic ?? null, explanation: selected ? ['dependency below return threshold', `selected route ${selected.id}`] : ['settlement reliance above return threshold'] });
            }
            case 'ROAMING_GROUP_DEPENDENCY_DECAY': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const decay = Math.max(0, num(action.decay, .05));
                group.settlementReliance = clamp(group.settlementReliance - decay);
                return this.allocateEvent({ type: 'ROAMING_GROUP_DEPENDENCY_DECAY', parent, groupId: group.id, decay, reliance: group.settlementReliance, supportReceived: group.supportReceived });
            }
            case 'ROAMING_GROUP_DEPENDENCY_EVALUATION': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const reliance = clamp(group.settlementReliance);
                const selected = reliance >= Math.max(0, num(action.relianceThreshold, .5)) ? 'RETURN_TO_SETTLEMENT' : (group.food < group.foodNeed ? 'SEEK_RESOURCES' : 'ROAM');
                return this.allocateEvent({ type: 'ROAMING_GROUP_DEPENDENCY_EVALUATION', parent, groupId: group.id, reliance, supportReceived: group.supportReceived, selected, food: group.food });
            }
            case 'ROAMING_GROUP_LEGITIMACY_RECOVERY': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const faction = this.factions.get(action.faction);
                if (!faction) throw new Error(`Unknown faction "${action.faction}"`);
                const aid = Math.max(0, num(action.aid, 0));
                const solved = action.justiceResolved ? Math.max(0, num(action.justiceRecovery, .1)) : 0;
                const recovery = Math.min(1, aid * .05 + solved);
                faction.state.grievance = clamp(faction.state.grievance - recovery);
                return this.allocateEvent({ type: 'ROAMING_GROUP_LEGITIMACY_RECOVERY', parent, groupId: group.id, factionId: faction.id, aid, justiceResolved: Boolean(action.justiceResolved), recovery, grievance: faction.state.grievance });
            }
            case 'ROAMING_GROUP_CONSEQUENCE': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const shortage = Math.max(0, num(action.foodNeed, group.foodNeed) - group.food);
                const pressure = shortage / Math.max(1, num(action.foodNeed, group.foodNeed));
                const migrates = pressure >= Math.max(0, num(action.migrationThreshold, .5));
                const faction = action.faction ? this.factions.get(action.faction) : null;
                if (faction && shortage > 0) faction.state.grievance = clamp(faction.state.grievance + Math.min(1, shortage * .05));
                return this.allocateEvent({ type: 'ROAMING_GROUP_CONSEQUENCE', parent, groupId: group.id, factionId: faction?.id ?? null, shortage, pressure, consequence: migrates ? 'MIGRATION_PRESSURE' : 'HOLD', grievance: faction?.state.grievance ?? null });
            }
            case 'ROAMING_GROUP_LOOT_CONSUMER': {
                const market = this.markets.get(action.market);
                if (!market) throw new Error(`Unknown market "${action.market}"`);
                const good = action.good ?? 'loot';
                const available = Math.max(0, num(market.stock[good], 0));
                const requested = Math.max(0, num(action.quantity, 0));
                const consumed = Math.min(available, requested);
                market.stock[good] = available - consumed;
                market.history.push({ kind: 'ROAMING_GROUP_LOOT_CONSUMPTION', good, quantity: consumed, consumer: action.consumer ?? 'faction' });
                const faction = action.faction ? this.factions.get(action.faction) : null;
                if (faction && consumed > 0) faction.state.supplySecurity = clamp(faction.state.supplySecurity + consumed * .01);
                return this.allocateEvent({ type: 'ROAMING_GROUP_LOOT_CONSUMER', parent, market: action.market, factionId: faction?.id ?? null, good, requested, consumed, supplySecurity: faction?.state.supplySecurity ?? null, accepted: consumed > 0 });
            }
            case 'ROAMING_GROUP_LOOT_SETTLEMENT': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const market = this.markets.get(action.market);
                if (!market) throw new Error(`Unknown market "${action.market}"`);
                const amount = Math.min(group.loot, Math.max(0, num(action.quantity, 0)));
                if (amount > 0) {
                    group.loot -= amount;
                    market.receive(action.good ?? 'loot', amount);
                    group.lootTransferred = (group.lootTransferred ?? 0) + amount;
                    market.history.push({ kind: 'ROAMING_GROUP_LOOT_TRANSFER', good: action.good ?? 'loot', quantity: amount, groupId: group.id, settlement: action.market, interaction: action.aid ? 'AID' : 'TRADE' });
                }
                return this.allocateEvent({ type: 'ROAMING_GROUP_LOOT_SETTLEMENT', parent, groupId: group.id, market: action.market, quantity: amount, interaction: action.aid ? 'AID' : 'TRADE', loot: group.loot, marketStock: market.stock[action.good ?? 'loot'] ?? 0, accepted: amount > 0, lootBalance: this.lootBalanceSheet(group) });
            }
            case 'QUEUE_AWARE_CROSS_MARKET_TRANSFER': {
                const result = this.transferQueueAwareEconomicSupply(action);
                const route = result.routeId ? this.routes.edges.find(edge => edge.id === result.routeId) : null;
                const explanation = [`requested ${result.requested} ${result.good}`, `moved ${result.moved}`, `source ${result.fromMarket} to destination ${result.toMarket}`];
                if (result.accessBlocked) explanation.push('all candidate routes unavailable');
                else if (route) explanation.push(`route ${route.id} permitted transfer`);
                return this.allocateEvent({ type: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', parent, ...result, explanation });
            }
            case 'QUEUE_AWARE_SETTLEMENT_ECONOMY': {
                const result = this.applyQueueAwareSettlementEconomy(action);
                const explanation = [
                    `base demand ${result.demand}`,
                    result.confidence > 0 && result.reportedDanger > 0 ? `actor report increased demand pressure (${result.reportedDanger} at confidence ${result.confidence})` : 'no delivered route report influenced demand',
                    `consumed ${result.consumed} of ${result.requested} requested`,
                    result.unmet > 0 ? `unmet demand ${result.unmet}` : 'demand fully met',
                ];
                return this.allocateEvent({ type: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', parent, ...result, reportClaim: action.reportClaim ?? null, beliefProvenance: this.beliefProvenance(result.recipientId ?? null, result.claim), explanation });
            }
            case 'ROAMING_GROUP_SETTLEMENT_INTERACTION': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const market = this.markets.get(action.market);
                if (!market) throw new Error(`Unknown market "${action.market}"`);
                const requested = Math.max(0, num(action.foodRequested, group.foodNeed - group.food));
                const available = Math.max(0, market.stock[action.good ?? 'grain'] ?? 0);
                const amount = Math.min(requested, available);
                const kind = action.aid ? 'AID' : 'TRADE';
                if (amount > 0) {
                    market.stock[action.good ?? 'grain'] = available - amount;
                    market.history.push({ kind: 'ROAMING_GROUP_CONSUMPTION', good: action.good ?? 'grain', quantity: amount, groupId: group.id, interaction: kind });
                    group.food += amount;
                    group.supportReceived += amount;
                    group.settlementReliance = clamp(group.settlementReliance + amount / Math.max(1, group.foodNeed));
                }
                return this.allocateEvent({ type: 'ROAMING_GROUP_SETTLEMENT_INTERACTION', parent, groupId: group.id, market: action.market, interaction: kind, good: action.good ?? 'grain', requested, quantity: amount, food: group.food, marketStock: market.stock[action.good ?? 'grain'] ?? 0, accepted: amount > 0 });
            }
            case 'INFRASTRUCTURE_WEAR': {
                const structure = this.infrastructure.get(action.infrastructure);
                if (!structure) throw new Error(`Unknown infrastructure "${action.infrastructure}"`);
                const route = action.routeId ? this.routes.edges.find(edge => edge.id === action.routeId) : null;
                const traffic = Math.max(0, num(route?.traffic, 0));
                const wear = Math.min(clamp(structure.condition), traffic * Math.max(0, num(action.rate, .001)));
                const before = structure.condition;
                structure.condition = clamp(structure.condition - wear);
                if (route) route.available = structure.condition > 0;
                const trafficDecay = [...this.events].reverse().find(event => event.type === 'ROUTE_TRAFFIC_DECAY' && event.tick === this.time);
                return this.allocateEvent({ type: 'INFRASTRUCTURE_WEAR', parent: trafficDecay ?? parent, infrastructureId: structure.id, routeId: route?.id ?? null, traffic, wear, conditionBefore: before, conditionAfter: structure.condition, available: route ? route.available : null });
            }
            case 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE': {
                const settlement = this.settlements.get(action.settlement);
                if (!settlement) throw new Error(`Unknown settlement "${action.settlement}"`);
                const structure = this.infrastructure.get(action.infrastructure);
                if (!structure) throw new Error(`Unknown infrastructure "${action.infrastructure}"`);
                const route = action.routeId ? this.routes.edges.find(edge => edge.id === action.routeId) : null;
                const requested = Math.max(0, num(action.amount, 1));
                const spent = Math.min(requested, settlement.recoveryBudget);
                settlement.recoveryBudget -= spent;
                const before = structure.condition;
                structure.condition = clamp(structure.condition + spent * Math.max(0, num(action.effect, .05)));
                if (route) route.available = structure.condition > 0;
                return this.allocateEvent({ type: 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE', parent, settlementId: settlement.id, infrastructureId: structure.id, routeId: route?.id ?? null, requested, spent, conditionBefore: before, conditionAfter: structure.condition, recoveryBudget: settlement.recoveryBudget, available: route ? route.available : null });
            }
            case 'SETTLEMENT_RESOURCE_CONSUMPTION': {
                const settlement = this.settlements.get(action.settlement);
                if (!settlement) throw new Error(`Unknown settlement "${action.settlement}"`);
                const requested = Math.max(0, num(action.quantity, settlement.population * Math.max(0, num(action.perCapita, .01))));
                const consumed = Math.min(settlement.resources, requested);
                settlement.resources -= consumed;
                settlement.recoveryBudget += consumed * Math.max(0, num(action.recoveryRate, .5));
                return this.allocateEvent({ type: 'SETTLEMENT_RESOURCE_CONSUMPTION', parent, settlementId: settlement.id, requested, consumed, resources: settlement.resources, recoveryBudget: settlement.recoveryBudget });
            }
            case 'SETTLEMENT_ADAPTATION': {
                const settlement = this.settlements.get(action.settlement);
                if (!settlement) throw new Error(`Unknown settlement "${action.settlement}"`);
                const structure = action.infrastructure ? this.infrastructure.get(action.infrastructure) : null;
                const market = action.market ? this.markets.get(action.market) : null;
                const route = action.routeId ? this.routes.edges.find(edge => edge.id === action.routeId) : null;
                const stock = market ? Math.max(0, num(market.stock[action.good ?? 'grain'])) : 0;
                const price = market ? Math.max(0, num(market.prices[action.good ?? 'grain'], 1)) : 0;
                const infrastructureStress = structure ? 1 - clamp(structure.condition) : 0;
                const marketStress = price > 0 ? Math.min(1, 1 / price) : 0;
                const routeStress = route?.available === false ? 1 : 0;
                const stress = clamp((infrastructureStress + marketStress + routeStress) / 3);
                const requested = Math.max(0, num(action.investment, stress * 10));
                const investment = Math.min(requested, settlement.recoveryBudget);
                settlement.recoveryBudget -= investment;
                settlement.adaptation = clamp(settlement.adaptation + investment * .05);
                if (structure && investment > 0) structure.condition = clamp(structure.condition + investment * .05);
                if (route && structure) route.available = structure.condition > 0;
                return this.allocateEvent({ type: 'SETTLEMENT_ADAPTATION', parent, settlementId: settlement.id, infrastructureId: structure?.id ?? null, market: action.market ?? null, routeId: route?.id ?? null, stock, price, stress, requested, investment, adaptation: settlement.adaptation, recoveryBudget: settlement.recoveryBudget, condition: structure?.condition ?? null });
            }
            case 'INFRASTRUCTURE_UPDATE': {
                const structure = this.infrastructure.get(action.infrastructure);
                if (!structure) throw new Error(`Unknown infrastructure "${action.infrastructure}"`);
                const before = structure.condition;
                structure.condition = clamp(action.condition ?? before);
                const route = action.routeId ? this.routes.edges.find(edge => edge.id === action.routeId) : null;
                if (route) route.available = structure.condition > 0;
                return this.allocateEvent({ type: 'INFRASTRUCTURE_UPDATE', parent, infrastructureId: structure.id, routeId: action.routeId ?? null, conditionBefore: before, conditionAfter: structure.condition, available: route ? route.available : null });
            }
            case 'INFRASTRUCTURE_REPAIR': {
                const structure = this.infrastructure.get(action.infrastructure);
                if (!structure) throw new Error(`Unknown infrastructure "${action.infrastructure}"`);
                const before = structure.condition;
                structure.condition = clamp(action.condition ?? 1);
                const route = action.routeId ? this.routes.edges.find(edge => edge.id === action.routeId) : null;
                if (route) route.available = structure.condition > 0;
                return this.allocateEvent({ type: 'INFRASTRUCTURE_REPAIR', parent, infrastructureId: structure.id, routeId: action.routeId ?? null, conditionBefore: before, conditionAfter: structure.condition, available: route ? route.available : null });
            }
            case 'ROUTE_TRAFFIC_DECAY': {
                const rate = Math.max(0, Math.min(1, num(action.rate, .05)));
                const traffic = this.routes.decayTraffic(rate);
                return this.allocateEvent({ type: 'ROUTE_TRAFFIC_DECAY', parent, rate, traffic });
            }
            case 'ROAMING_GROUP_SECURITY_SHOCK': {
                const faction = this.factions.get(action.faction);
                if (!faction) throw new Error(`Unknown faction "${action.faction}"`);
                const before = clamp(faction.state.supplySecurity);
                faction.state.supplySecurity = clamp(num(action.supplySecurity, 0));
                return this.allocateEvent({ type: 'ROAMING_GROUP_SECURITY_SHOCK', parent, factionId: faction.id, supplySecurityBefore: before, supplySecurityAfter: faction.state.supplySecurity, reason: action.reason ?? 'external-shock' });
            }
            case 'ROAMING_GROUP_SUPPLY_FEEDBACK': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const faction = this.factions.get(action.faction);
                if (!faction) throw new Error(`Unknown faction "${action.faction}"`);
                const route = this.routes.edges.find(edge => edge.id === action.routeId);
                if (!route) throw new Error(`Unknown route "${action.routeId}"`);
                const latestInfrastructure = [...this.events].reverse().find(event => (event.type === 'INFRASTRUCTURE_UPDATE' || event.type === 'INFRASTRUCTURE_REPAIR') && event.routeId === route.id);
                if (route.available === false) return this.allocateEvent({ type: 'ROAMING_GROUP_SUPPLY_FEEDBACK', parent: latestInfrastructure ?? parent, groupId: group.id, factionId: faction.id, routeId: route.id, supplySecurity: clamp(faction.state.supplySecurity), perceivedDanger: 1e9, selected: 'AVOID', traffic: route.traffic ?? 0, reason: 'INFRASTRUCTURE_UNAVAILABLE' });
                const security = clamp(faction.state.supplySecurity);
                const latestShock = [...this.events].reverse().find(event => event.type === 'ROAMING_GROUP_SECURITY_SHOCK' && event.factionId === faction.id);
                const infrastructure = action.infrastructure ? this.infrastructure.get(action.infrastructure) : null;
                const latestInfrastructureForRoute = [...this.events].reverse().find(event => (event.type === 'INFRASTRUCTURE_UPDATE' || event.type === 'INFRASTRUCTURE_REPAIR' || event.type === 'INFRASTRUCTURE_WEAR') && event.routeId === route.id);
                const infrastructureCondition = infrastructure ? clamp(infrastructure.condition) : (latestInfrastructureForRoute?.conditionAfter ?? 1);
                const infrastructureDanger = (1 - clamp(infrastructureCondition)) * Math.max(0, num(action.infrastructureRisk, .5));
                const perceivedDanger = Math.max(0, (num(action.perceivedDanger ?? route.perceivedDanger, 0) + infrastructureDanger) * (1 - security * .5));
                const selected = perceivedDanger >= Math.max(0, num(action.threshold, 1)) ? 'AVOID' : 'TRAVEL';
                if (selected === 'TRAVEL') this.routes.travel(route, action.groupSize ?? 1);
                return this.allocateEvent({ type: 'ROAMING_GROUP_SUPPLY_FEEDBACK', parent: latestInfrastructureForRoute ?? latestShock ?? parent, groupId: group.id, factionId: faction.id, routeId: route.id, supplySecurity: security, perceivedDanger, selected, traffic: route.traffic ?? 0 });
            }
            case 'ROAMING_GROUP_TRAFFIC_CONSUMER': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const route = this.routes.edges.find(edge => edge.id === action.routeId);
                if (!route) throw new Error(`Unknown route "${action.routeId}"`);
                const traffic = Math.max(0, num(route.traffic, 0));
                const congestion = traffic / Math.max(1, num(route.trafficCapacity, 100));
                const outcome = congestion >= Math.max(0, num(action.threshold, .8)) ? 'CONGESTED' : 'OPEN';
                const loss = outcome === 'CONGESTED' ? Math.min(group.loot, Math.max(0, num(action.loss, 1))) : 0;
                group.loot -= loss;
                group.lootDestroyed += loss;
                return this.allocateEvent({ type: 'ROAMING_GROUP_TRAFFIC_CONSUMER', parent, groupId: group.id, routeId: route.id, traffic, congestion, outcome, lootLoss: loss, loot: group.loot, lootBalance: this.lootBalanceSheet(group) });
            }
            case 'ROAMING_GROUP_ROUTE_RISK': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const route = this.routes.edges.find(edge => edge.id === action.routeId);
                if (!route) throw new Error(`Unknown route "${action.routeId}"`);
                const perceivedDanger = Math.max(0, num(action.perceivedDanger ?? route.perceivedDanger, 0));
                const trafficPressure = Math.max(0, num(route.traffic, 0)) * Math.max(0, num(action.trafficWeight, .01));
                const risk = perceivedDanger + trafficPressure;
                const outcome = risk >= Math.max(0, num(action.threshold, 1)) ? 'CONFLICT' : 'SAFE_PASSAGE';
                if (outcome === 'CONFLICT') { const loss = Math.min(group.loot, Math.max(0, num(action.loss, 1))); group.loot -= loss; group.lootDestroyed += loss; }
                return this.allocateEvent({ type: 'ROAMING_GROUP_ROUTE_RISK', parent, groupId: group.id, routeId: route.id, perceivedDanger, traffic: route.traffic ?? 0, risk, outcome, loot: group.loot, lootDestroyed: group.lootDestroyed, lootBalance: this.lootBalanceSheet(group) });
            }
            case 'INFRASTRUCTURE_ENCOUNTER_REPORT': {
                const route = this.routes.edges.find(edge => edge.id === action.routeId);
                if (!route) throw new Error(`Unknown route "${action.routeId}"`);
                const sourceTrust = clamp(action.sourceTrust ?? .5);
                const rumor = this.rumors.publish({ claim: `route:${route.id}:danger`, subject: route.id, valueEstimate: Math.max(0, num(action.perceivedDanger, route.perceivedDanger ?? 0)), confidence: clamp((action.confidence ?? .5)), source: action.source ?? 'encounter', sourceTrust, timestamp: this.now() });
                const queued = [];
                for (const recipient of action.recipients ?? []) queued.push(this.queueRumor(rumor, recipient, { delay: action.delay ?? 1, ttl: action.ttl ?? 10, distortion: action.distortion ?? 0 }));
                return this.allocateEvent({ type: 'INFRASTRUCTURE_ENCOUNTER_REPORT', parent, routeId: route.id, rumorId: rumor.id, recipients: queued.map(item => item.recipientId), deliveryTick: queued[0]?.deliveryTick ?? null, confidence: rumor.confidence });
            }
            case 'ROAMING_GROUP_ROUTE_ENCOUNTER': {
                const group = this.roamingGroups.get(action.group);
                if (!group) throw new Error(`Unknown roaming group "${action.group}"`);
                const route = this.routes.edges.find(edge => edge.id === action.routeId);
                if (!route) throw new Error(`Unknown route "${action.routeId}"`);
                const actor = action.actorId ? this.actors.get(action.actorId) : null;
                const belief = actor?.beliefs?.get(`route:${route.id}:danger`);
                const reportedDanger = belief && Number.isFinite(belief.estimate) ? belief.estimate : null;
                const infrastructure = action.infrastructure ? this.infrastructure.get(action.infrastructure) : null;
                const infrastructureCondition = infrastructure ? clamp(infrastructure.condition) : 1;
                const infrastructureDanger = (1 - infrastructureCondition) * Math.max(0, num(action.infrastructureRisk, .5));
                const danger = Math.max(0, num(action.perceivedDanger ?? reportedDanger ?? route.perceivedDanger, 0) + infrastructureDanger);
                const trust = belief ? clamp(belief.confidence) : 1;
                const effectiveThreshold = Math.max(0, num(action.riskThreshold, 1)) + (1 - trust) * Math.max(0, num(action.uncertaintyBuffer, .5));
                const outcome = danger >= effectiveThreshold ? 'RAID' : 'PASS';
                const loss = outcome === 'RAID' ? Math.min(group.loot, Math.max(0, num(action.lootLoss, 0)) * Math.max(.25, trust)) : 0;
                if (loss > 0) { group.loot -= loss; group.lootDestroyed += loss; }
                if (outcome === 'RAID') { const yieldAmount = Math.max(0, num(action.lootYield, 0)); group.loot += yieldAmount; group.initialLoot += yieldAmount; }
                const latestInfrastructure = [...this.events].reverse().find(event => (event.type === 'INFRASTRUCTURE_UPDATE' || event.type === 'INFRASTRUCTURE_REPAIR' || event.type === 'INFRASTRUCTURE_WEAR') && event.routeId === route.id);
                return this.allocateEvent({ type: 'ROAMING_GROUP_ROUTE_ENCOUNTER', parent: latestInfrastructure ?? parent, actorId: action.actorId ?? null, groupId: group.id, routeId: route.id, infrastructureId: infrastructure?.id ?? null, reportedDanger, perceivedDanger: danger, infrastructureDanger, effectiveThreshold, trust, outcome, lootLoss: loss, provenance: belief ? { source: belief.evidence?.at(-1)?.source ?? null, confidence: belief.confidence, age: Math.max(0, this.now() - num(belief.lastUpdated, this.now())) } : null, beliefProvenance: this.beliefProvenance(action.actorId ?? null, `route:${route.id}:danger`), loot: group.loot, lootBalance: this.lootBalanceSheet(group) });
            }
            case 'FACTION_EVALUATION': {
                const faction = this.factions.get(action.faction);
                if (!faction) throw new Error(`Unknown faction "${action.faction}"`);
                const target = action.target ?? { id: action.targetId ?? null };
                const result = faction.evaluateAction(target, { ...action.context, rng: this.rng });
                const selected = result.selected;
                if (selected === 'RAID') faction.state.resourceNeed = Math.max(0, faction.state.resourceNeed - 0.1);
                if (selected === 'PATROL') faction.state.supplySecurity = Math.min(1, faction.state.supplySecurity + 0.1);
                if (selected === 'HOLD' && Number.isFinite(action.context?.cooperation)) faction.state.legitimacy = this.updateLegitimacy(faction.state.legitimacy, { cooperation: action.context.cooperation });
                faction.history.push({ tick: this.now(), target: target.id, selected, score: result.candidates.find(candidate => candidate.action === selected)?.finalScore ?? 0 });
                const evaluation = this.allocateEvent({ type: 'FACTION_EVALUATION', parent, factionId: faction.id, targetId: target.id, selected, legitimacy: faction.state.legitimacy, resourceNeed: faction.state.resourceNeed, supplySecurity: faction.state.supplySecurity, alternatives: result.alternatives.map(candidate => ({ action: candidate.action, score: candidate.finalScore })) });
                // RESP-FACTION-EVALUATION-RAID-CHAIN-001: a production RAID choice (DecisionCore)
                // dispatches through the raid loop instead of only nudging resourceNeed. The
                // reference guards decide BEFORE any chain event exists: an unregistered or self
                // target is recorded as a skip ON this event (existing worlds rely on that path),
                // never a throw. Same contract as MERCHANT_ECONOMY_CYCLE: earlier stages commit
                // here so each child resolves its committed parent at allocation time; EVERY path
                // returns exactly one uncommitted tail event for the turn driver to commit.
                if (selected !== 'RAID') return evaluation;
                const targetFaction = target.id == null ? null : this.factions.get(target.id) ?? null;
                const chainable = Boolean(targetFaction) && targetFaction !== faction;
                if (!chainable) {
                    return this.allocateEvent({ ...evaluation, raidChain: targetFaction === faction ? 'SKIPPED_SELF_TARGET' : 'SKIPPED_TARGET_NOT_REGISTERED' });
                }
                this.commitEvent(evaluation);
                // Stage 1: the macro-layer raid evaluation, scored from the SAME context
                // DecisionCore chose from (finite numbers only — rng stays out).
                const values = Object.fromEntries(Object.entries(action.context ?? {}).filter(([key, value]) => key !== 'rng' && typeof value === 'number' && Number.isFinite(value)));
                const raidEvaluation = this.executeAction({ kind: 'FACTION_RAID_EVALUATION', faction: faction.id, targetId: target.id, values }, evaluation);
                this.commitEvent(raidEvaluation);
                // Stage 2: dispatch — force/bagSize honor the caller's context, otherwise they
                // default from the attacker's confidence and half the target's stash.
                const force = Number.isFinite(action.context?.force) && action.context.force > 0 ? action.context.force : Math.max(.1, num(faction.state.militaryConfidence, .5) * 10);
                const bagSize = Number.isFinite(action.context?.bagSize) && action.context.bagSize >= 0 ? action.context.bagSize : Math.floor(num(targetFaction.loot, 0) / 2);
                const raidId = `${evaluation.id}:raid`;
                const dispatch = this.executeAction({ kind: 'FACTION_RAID_DISPATCH', raidId, faction: faction.id, targetId: target.id, force, bagSize }, raidEvaluation);
                if (dispatch.status !== 'RAIDING') return dispatch; // REJECTED — nothing to resolve
                this.commitEvent(dispatch);
                // Stage 3: one world-RNG draw; defense honors context or the defender's confidence.
                const defense = Number.isFinite(action.context?.defense) && action.context.defense >= 0 ? action.context.defense : Math.max(0, num(targetFaction.state.militaryConfidence, .5) * 10);
                return this.executeAction({ kind: 'FACTION_RAID_RESOLUTION', raidId, defense }, dispatch);
            }
            // RESP-FACTION-AUTONOMOUS-TICK-001: the macro layer runs autonomously — one action
            // gives EVERY registered faction a turn with no manual targeting: the target is the
            // richest other registered faction (stable sort → insertion order breaks loot ties),
            // the context is the faction's own numeric state, and each turn flows through the
            // production FACTION_EVALUATION → raid chain. Same single-tail contract as the
            // economy cycle: each turn's tail commits BEFORE the next turn allocates (seq/id
            // integrity), the final tail returns uncommitted for the turn driver; fewer than two
            // factions means no counterpart to turn against, so the macro event itself is the
            // untouched tail.
            case 'FACTION_MACRO_TICK': {
                const macro = this.allocateEvent({ type: 'FACTION_MACRO_TICK', parent, factions: [...this.factions.keys()] });
                const factions = [...this.factions.values()];
                if (factions.length < 2) return macro; // no counterpart to turn against
                this.commitEvent(macro);
                let pending = null;
                for (const faction of factions) {
                    if (pending) this.commitEvent(pending);
                    // The richest-other target resolves WHEN the turn runs — later turns see
                    // earlier turns' effects (a raid that just resolved reshapes the loot map).
                    const target = factions.filter(other => other !== faction).sort((a, b) => b.loot - a.loot)[0];
                    const context = Object.fromEntries(Object.entries(faction.state).filter(([key, value]) => key !== 'rng' && typeof value === 'number' && Number.isFinite(value)));
                    pending = this.executeAction({ kind: 'FACTION_EVALUATION', faction: faction.id, targetId: target.id, context }, macro);
                }
                return pending;
            }
            // RESP-FACTION-RAID-LOOP-001: the faction raid loop — production-wires the once-
            // orphaned macro layer (FactionRuntime.evaluateRaid → macrocore raidUtility and
            // escalationLevel) through canonical parent-chained events: evaluation → dispatch →
            // one-draw resolution with exact loot conservation.
            case 'FACTION_RAID_EVALUATION': {
                const attacker = this.factions.get(action.faction);
                if (!attacker) throw new Error(`Unknown faction "${action.faction}"`);
                const targetId = action.targetId ?? action.target ?? null;
                const target = this.factions.get(targetId);
                if (!target) throw new Error(`Unknown faction "${targetId}"`);
                if (attacker === target) throw new Error('FACTION_RAID_EVALUATION requires two distinct factions');
                for (const [term, value] of Object.entries(action.values ?? {})) {
                    if (value != null && !Number.isFinite(value)) throw new Error(`RAID evaluation term "${term}" must be a finite number`);
                }
                // Guards precede mutation: evaluateRaid records into faction history below.
                const evaluation = attacker.evaluateRaid(target, action.values ?? {});
                return this.allocateEvent({ type: 'FACTION_RAID_EVALUATION', parent, factionId: attacker.id, targetId: target.id, score: evaluation.score, decision: evaluation.decision, escalationLevel: evaluation.escalationLevel, militaryConfidence: attacker.state.militaryConfidence });
            }
            case 'FACTION_RAID_DISPATCH': {
                if (!action.raidId) throw new Error('FACTION_RAID_DISPATCH requires a raidId');
                if (this.raids.has(action.raidId)) throw new Error(`Duplicate raid id "${action.raidId}"`);
                const attacker = this.factions.get(action.faction);
                if (!attacker) throw new Error(`Unknown faction "${action.faction}"`);
                const targetId = action.targetId ?? action.target ?? null;
                const target = this.factions.get(targetId);
                if (!target) throw new Error(`Unknown faction "${targetId}"`);
                if (attacker === target) throw new Error('FACTION_RAID_DISPATCH requires two distinct factions');
                const evaluation = [...this.events].reverse().find(event => event.type === 'FACTION_RAID_EVALUATION' && event.factionId === attacker.id && event.targetId === target.id);
                if (!evaluation) throw new Error(`FACTION_RAID_DISPATCH requires an evaluation of "${attacker.id}" against "${target.id}"`);
                if (evaluation.decision !== 'RAID') {
                    return this.allocateEvent({ type: 'FACTION_RAID_DISPATCH', parent: evaluation, raidId: action.raidId, factionId: attacker.id, targetId: target.id, status: 'REJECTED', reason: 'NOT_RAID_WORTHY', score: evaluation.score });
                }
                const force = num(action.force, NaN);
                if (!Number.isFinite(force) || force <= 0) throw new Error('FACTION_RAID_DISPATCH requires a positive force');
                const bagSize = Math.max(0, num(action.bagSize, 0));
                const raid = { id: action.raidId, factionId: attacker.id, targetId: target.id, force, bagSize, status: 'RAIDING', outcome: null, roll: null, stolen: 0, dispatchedTick: this.now() };
                this.raids.set(raid.id, raid);
                return this.allocateEvent({ type: 'FACTION_RAID_DISPATCH', parent: evaluation, raidId: raid.id, factionId: attacker.id, targetId: target.id, force, bagSize, status: 'RAIDING', escalationLevel: attacker.state.escalationLevel() });
            }
            case 'FACTION_RAID_RESOLUTION': {
                const raid = this.raids.get(action.raidId);
                if (!raid) throw new Error(`Unknown raid "${action.raidId}"`);
                if (raid.status !== 'RAIDING') throw new Error(`cannot resolve raid "${raid.id}" from status "${raid.status}"`);
                const attacker = this.factions.get(raid.factionId);
                const target = this.factions.get(raid.targetId);
                if (!attacker) throw new Error(`Unknown faction "${raid.factionId}"`);
                if (!target) throw new Error(`Unknown faction "${raid.targetId}"`);
                const defense = Math.max(0, num(action.defense, 0));
                const roll = this.random(); // the single world-RNG draw
                const victory = raid.force > defense + roll;
                const attackerLootBefore = attacker.loot;
                const targetLootBefore = target.loot;
                const stolen = victory ? Math.min(targetLootBefore, raid.bagSize) : 0;
                attacker.loot = attackerLootBefore + stolen;
                target.loot = targetLootBefore - stolen;
                raid.status = victory ? 'SUCCEEDED' : 'REPULSED';
                raid.outcome = victory ? 'LOOT_TAKEN' : 'REPULSED';
                raid.roll = roll;
                raid.stolen = stolen;
                // Escalation consequences (macro layer surfaced in the event graph).
                attacker.state.militaryConfidence = clamp(attacker.state.militaryConfidence + (victory ? .1 : -.1));
                target.state.militaryConfidence = clamp(target.state.militaryConfidence - (victory ? .05 : 0));
                target.state.grievance = clamp(target.state.grievance + (victory ? .15 : .05));
                target.state.anger = clamp(target.state.anger + (victory ? .1 : .02));
                target.state.threatPerception = clamp(target.state.threatPerception + (victory ? .1 : .05));
                const dispatch = [...this.events].reverse().find(event => event.type === 'FACTION_RAID_DISPATCH' && event.raidId === raid.id);
                if (!dispatch) throw new Error(`Raid "${raid.id}" has no committed dispatch event`);
                return this.allocateEvent({ type: 'FACTION_RAID_RESOLUTION', parent: dispatch, raidId: raid.id, factionId: raid.factionId, targetId: raid.targetId, force: raid.force, defense, roll, victory, outcome: raid.outcome, stolen, attackerLootBefore, attackerLootAfter: attacker.loot, targetLootBefore, targetLootAfter: target.loot, escalationLevel: attacker.state.escalationLevel() });
            }
            case 'JUSTICE_RESOLUTION': {
                const faction = this.factions.get(action.faction);
                if (!faction) throw new Error(`Unknown faction "${action.faction}"`);
                const before = faction.state.legitimacy;
                const solved = clamp(action.solved ? 1 : 0);
                const injustice = clamp(action.injustice ?? (solved ? 0 : 1));
                faction.state.legitimacy = this.updateLegitimacy(before, { solved, injustice, cooperation: action.cooperation ?? 0 });
                faction.state.grievance = clamp(faction.state.grievance + injustice * 0.1 - solved * 0.05);
                return this.allocateEvent({ type: 'JUSTICE_RESOLUTION', parent, factionId: faction.id, solved: Boolean(action.solved), injustice, legitimacyBefore: before, legitimacyAfter: faction.state.legitimacy, grievanceAfter: faction.state.grievance });
            }
            case 'MIGRATION_EVALUATION': {
                const faction = this.factions.get(action.faction);
                if (!faction) throw new Error(`Unknown faction "${action.faction}"`);
                const context = { fear: action.fear ?? faction.state.fear, routeDanger: action.routeDanger ?? 0, foodSecurity: action.foodSecurity ?? 1, legitimacy: action.legitimacy ?? faction.state.legitimacy };
                const migrates = this.shouldMigrate(context);
                const pressure = clamp(context.fear * .4 + context.routeDanger * .3 + (1 - context.foodSecurity) * .2 + (1 - context.legitimacy) * .1);
                return this.allocateEvent({ type: 'MIGRATION_EVALUATION', parent, factionId: faction.id, destination: action.destination ?? null, pressure, migrates, legitimacy: context.legitimacy, parents: action.parentEvents ?? [] });
            }
            // RESP-CRIME-JUSTICE-LEGITIMACY-LOOP-001: the crime → report → justice → legitimacy →
            // migration production loop. Each stage resolves its upstream event (explicit id or
            // latest match), parents to it, and hands its output to the next stage's primitive.
            case 'CRIME_COMMIT': {
                const payoff = this.resolveCrime(action);
                return this.allocateEvent({ type: 'CRIME_COMMITTED', parent, actorId: action.actorId ?? null, settlementId: action.settlementId ?? null, payoff, commits: payoff > 0, reward: action.reward ?? 0, desperation: action.desperation ?? 0, apprehension: action.apprehension ?? 0, sanction: action.sanction ?? 0, fear: action.fear ?? 0, moralCost: action.moralCost ?? 0 });
            }
            case 'CRIME_REPORT': {
                const crimeId = action.crimeId ?? this.events.findLast(event => event.type === 'CRIME_COMMITTED' && event.commits && (!action.settlementId || event.settlementId === action.settlementId))?.id;
                const crime = this.events.find(event => event.id === crimeId && event.type === 'CRIME_COMMITTED');
                if (!crime) throw new Error(`No committed crime to report "${action.crimeId ?? ''}"`);
                if (!crime.commits) throw new Error(`Crime "${crime.id}" was never committed`);
                const settlementId = action.settlementId ?? crime.settlementId;
                const settlement = settlementId ? this.settlements.get(settlementId) : null;
                const context = { legitimacy: action.legitimacy ?? settlement?.legitimacy ?? 0, trust: action.trust ?? 0, duty: action.duty ?? 0, retaliationFear: action.retaliationFear ?? 0, corruption: action.corruption ?? 0, uncertainty: action.uncertainty ?? 0 };
                const reportProbability = this.reportCrime(context);
                const reported = this.random() < reportProbability;
                return this.allocateEvent({ type: 'CRIME_REPORTED', parent: crime, crimeId: crime.id, settlementId: settlement?.id ?? settlementId ?? null, reported, reportProbability, legitimacy: context.legitimacy, trust: context.trust, duty: context.duty, retaliationFear: context.retaliationFear, corruption: context.corruption, uncertainty: context.uncertainty });
            }
            case 'CRIME_JUSTICE': {
                const reportId = action.reportId ?? this.events.findLast(event => event.type === 'CRIME_REPORTED' && event.reported && (!action.settlementId || event.settlementId === action.settlementId))?.id;
                const report = this.events.find(event => event.id === reportId && event.type === 'CRIME_REPORTED');
                if (!report) throw new Error(`No reported crime to adjudicate "${action.reportId ?? ''}"`);
                if (!report.reported) throw new Error(`Crime "${report.crimeId}" was never reported`);
                const settlement = this.settlements.get(action.settlementId ?? report.settlementId);
                if (!settlement) throw new Error(`Unknown settlement "${action.settlementId ?? report.settlementId}"`);
                const legitimacyBefore = settlement.legitimacy;
                const remedy = this.accessToJustice({ remedy: action.remedy ?? 1, legitimacy: legitimacyBefore, friction: action.friction ?? .5, risk: action.risk ?? .5 });
                const solved = remedy >= (action.solvedThreshold ?? .5);
                const injustice = clamp(action.injustice ?? (solved ? 0 : 1));
                const legitimacyAfter = this.updateLegitimacy(legitimacyBefore, { solved: solved ? 1 : 0, injustice, cooperation: action.cooperation ?? 0 });
                settlement.legitimacy = legitimacyAfter;
                return this.allocateEvent({ type: 'JUSTICE_RESOLUTION', parent: report, authority: 'SETTLEMENT', settlementId: settlement.id, crimeId: report.crimeId, reportId: report.id, remedy, solved, injustice, legitimacyBefore, legitimacyAfter });
            }
            case 'CRIME_MIGRATION': {
                const justiceId = action.justiceId ?? this.events.findLast(event => event.type === 'JUSTICE_RESOLUTION' && event.authority === 'SETTLEMENT' && (!action.settlementId || event.settlementId === action.settlementId))?.id;
                const justice = this.events.find(event => event.id === justiceId && event.type === 'JUSTICE_RESOLUTION');
                if (!justice) throw new Error(`No justice resolution to evaluate "${action.justiceId ?? ''}"`);
                const settlement = this.settlements.get(action.settlementId ?? justice.settlementId);
                if (!settlement) throw new Error(`Unknown settlement "${action.settlementId ?? justice.settlementId}"`);
                const context = { fear: action.fear ?? 0, routeDanger: action.routeDanger ?? 0, foodSecurity: action.foodSecurity ?? 1, legitimacy: action.legitimacy ?? settlement.legitimacy };
                const migrates = this.shouldMigrate(context);
                const pressure = clamp(context.fear * .4 + context.routeDanger * .3 + (1 - context.foodSecurity) * .2 + (1 - context.legitimacy) * .1);
                return this.allocateEvent({ type: 'MIGRATION_EVALUATION', parent: justice, authority: 'SETTLEMENT', settlementId: settlement.id, crimeId: justice.crimeId ?? null, justiceId: justice.id, destination: action.destination ?? null, pressure, migrates, legitimacy: context.legitimacy });
            }
            case 'CONVOY_DISPATCH': {
                // RESP-CONVOY-ESCORT-BANDIT-LOOP-001 stage 1: a merchant's committed cargo (an
                // in-transit trip) leaves under escort. Invariant guards first (id, ownership),
                // then reference lookups, then the business rejection (route unavailable).
                if (!action.convoyId) throw new Error('CONVOY_DISPATCH requires a convoyId');
                if (this.convoys.has(action.convoyId)) throw new Error(`Duplicate convoy id "${action.convoyId}"`);
                const market = this.markets.get(action.market);
                if (!market) throw new Error(`Unknown market "${action.market}"`);
                const trip = market.inTransit.get(action.tripId);
                if (!trip) throw new Error(`Unknown trip "${action.tripId}"`);
                if (trip.convoyId) throw new Error(`Trip "${trip.id}" is already escorted by convoy "${trip.convoyId}"`);
                const route = this.routes.edges.find(edge => edge.id === action.routeId);
                if (!route) throw new Error(`Unknown route "${action.routeId}"`);
                if (!this.markets.get(trip.destination)) throw new Error(`Unknown destination market "${trip.destination}"`);
                if (route.available === false) {
                    return this.allocateEvent({ type: 'CONVOY_DISPATCH', parent, convoyId: action.convoyId, market: action.market, tripId: trip.id, routeId: route.id, status: 'REJECTED', reason: 'ROUTE_UNAVAILABLE' });
                }
                const escortStrength = Math.max(0, num(action.escortStrength, 0));
                const convoy = { id: action.convoyId, market: action.market, tripId: trip.id, routeId: route.id, destination: trip.destination, owner: trip.owner ?? null, good: trip.good, quantity: trip.quantity, escortStrength, banditStrength: null, status: 'ESCORTED', outcome: null, dispatchedTick: this.now() };
                trip.convoyId = convoy.id;
                this.convoys.set(convoy.id, convoy);
                // Merchant policy consumes the route graph + the actor's route belief (parent to
                // the latest observation of this route, cite the belief producer).
                const routeObservation = [...this.events].reverse().find(event => event.type === 'ROUTE_OBSERVATION' && event.routeId === route.id) ?? null;
                return this.allocateEvent({ type: 'CONVOY_DISPATCH', parent: action.parent ?? routeObservation ?? parent, convoyId: convoy.id, market: convoy.market, tripId: convoy.tripId, routeId: convoy.routeId, destination: convoy.destination, owner: convoy.owner, good: convoy.good, quantity: convoy.quantity, escortStrength, status: 'ESCORTED', beliefProvenance: this.beliefProvenance(action.actorId ?? null, `route:${route.id}:danger`) });
            }
            case 'CONVOY_BANDIT_THREAT': {
                // RESP-CONVOY-ESCORT-BANDIT-LOOP-001 stage 2: bandits intercept an escorted
                // convoy. Parent-chained to that convoy's dispatch event.
                const convoy = this.convoys.get(action.convoyId);
                if (!convoy) throw new Error(`Unknown convoy "${action.convoyId}"`);
                if (convoy.status !== 'ESCORTED') throw new Error(`Convoy "${convoy.id}" cannot be threatened from status "${convoy.status}"`);
                convoy.status = 'THREATENED';
                convoy.banditStrength = Math.max(0, num(action.banditStrength, 0));
                const dispatch = [...this.events].reverse().find(event => event.type === 'CONVOY_DISPATCH' && event.convoyId === convoy.id && event.status !== 'REJECTED') ?? parent;
                return this.allocateEvent({ type: 'CONVOY_BANDIT_THREAT', parent: action.parent ?? dispatch, convoyId: convoy.id, routeId: convoy.routeId, tripId: convoy.tripId, owner: convoy.owner, good: convoy.good, quantity: convoy.quantity, escortStrength: convoy.escortStrength, banditStrength: convoy.banditStrength, status: 'THREATENED' });
            }
            case 'CONVOY_ESCORT_RESOLUTION': {
                // RESP-CONVOY-ESCORT-BANDIT-LOOP-001 stage 3: the escort resolution draws one
                // number from the world RNG (escortStrength + roll vs banditStrength), settles
                // the underlying trip — the market consequence — and records BOTH the draw and
                // the settlement as canonical parent-chained events.
                const convoy = this.convoys.get(action.convoyId);
                if (!convoy) throw new Error(`Unknown convoy "${action.convoyId}"`);
                if (convoy.status !== 'THREATENED') throw new Error(`Convoy "${convoy.id}" cannot resolve escort outcome from status "${convoy.status}"`);
                const market = this.markets.get(convoy.market);
                const trip = market?.inTransit.get(convoy.tripId);
                if (!market || !trip) throw new Error(`Convoy trip "${convoy.tripId}" is no longer in transit under market "${convoy.market}"`);
                const roll = this.random();
                const escortPower = convoy.escortStrength + roll;
                const victory = escortPower >= convoy.banditStrength;
                if (victory) {
                    const destination = this.markets.get(convoy.destination);
                    if (!destination) throw new Error(`Unknown destination market "${convoy.destination}"`);
                    market.settleTrip(convoy.tripId, 'DELIVERED', destination);
                    convoy.status = 'DELIVERED'; convoy.outcome = 'ESCORT_VICTORY';
                } else {
                    market.settleTrip(convoy.tripId, 'STOLEN');
                    convoy.status = 'ROBBED'; convoy.outcome = 'BANDIT_SUCCESS';
                }
                const threat = [...this.events].reverse().find(event => event.type === 'CONVOY_BANDIT_THREAT' && event.convoyId === convoy.id) ?? parent;
                // Commit the draw, then its consequence, as a two-event chain (allocate →
                // commit → allocate keeps seq monotonic — same pattern as RUMOR_DELIVER).
                const resolutionEvent = this.commitEvent(this.allocateEvent({ type: 'CONVOY_ESCORT_RESOLUTION', parent: action.parent ?? threat, convoyId: convoy.id, routeId: convoy.routeId, tripId: convoy.tripId, destination: convoy.destination, owner: convoy.owner, good: convoy.good, quantity: convoy.quantity, escortStrength: convoy.escortStrength, banditStrength: convoy.banditStrength, roll, escortPower, victory, outcome: convoy.outcome, status: convoy.status, ticksEscorted: this.now() - convoy.dispatchedTick, originStock: market.stock[convoy.good] ?? 0, destinationStock: this.markets.get(convoy.destination)?.stock[convoy.good] ?? 0 }));
                this.commitEvent(this.allocateEvent({ type: 'MARKET_TRIP_SETTLE', parent: resolutionEvent, market: convoy.market, tripId: convoy.tripId, good: trip.good, cargoKind: trip.cargoKind, quantity: trip.quantity, destination: convoy.destination, outcome: victory ? 'DELIVERED' : 'STOLEN', routeId: convoy.routeId, perceivedDanger: convoy.banditStrength, owner: victory ? convoy.owner : 'thief' }));
                return [];
            }
            case 'PLAYER_DAMAGE': {
                // RESP-PLAYER-INVASION-CHAIN-001 stage 1: player damage is the attack signal —
                // it wounds the player, raises war pressure (double pressure on a lethal blow),
                // and feeds the FearEvent that war escalation consumes.
                if (!this.player.alive) throw new Error('PLAYER_DAMAGE requires a living player');
                const amount = num(action.amount, NaN);
                if (!Number.isFinite(amount) || amount < 0) throw new Error('PLAYER_DAMAGE requires a non-negative finite amount');
                const faction = action.factionId ? this.factions.get(action.factionId) : null;
                if (action.factionId && !faction) throw new Error(`Unknown faction "${action.factionId}"`);
                const hpBefore = this.player.hp;
                const applied = Math.min(hpBefore, amount);
                this.player.hp = hpBefore - applied;
                const lethal = applied > 0 && this.player.hp === 0;
                if (lethal) { this.player.alive = false; this.player.deaths += 1; }
                const pressureGain = applied * (lethal ? 2 : 1);
                const pressureBefore = this.warState.pressure;
                this.warState.pressure = pressureBefore + pressureGain;
                const wound = this.allocateEvent({ type: 'PLAYER_WOUNDED', parent, amount: applied, requested: amount, hpBefore, hpAfter: this.player.hp, alive: this.player.alive, deaths: this.player.deaths, source: action.source ?? 'unknown' });
                this.commitEvent(wound);
                const baseFearGain = pressureGain / 100;
                let habituation = null;
                if (faction) {
                    // Re-opened `Habituation` row: the exposure book attenuates the fear gain —
                    // novelty protects the first exposures, recovery runs on world time.
                    habituation = this.habituation.attenuate(baseFearGain, { stimulusType: action.source ?? 'unknown', actorId: faction.id, now: this.now() });
                    faction.state.fear = clamp(num(faction.state.fear, 0) + habituation.adjusted);
                    faction.state.threatPerception = clamp(num(faction.state.threatPerception, 0) + pressureGain / 200);
                }
                const fearEvent = this.allocateEvent({ type: 'FEAR_EVENT_RAISED', parent: wound, pressureBefore, pressureAfter: this.warState.pressure, pressureGain, baseFearGain, fearGainApplied: habituation ? habituation.adjusted : 0, habituationLevel: habituation ? habituation.habituationLevel : 0, factionId: faction?.id ?? null, factionFearAfter: faction ? faction.state.fear : null, source: action.source ?? 'unknown' });
                if (!faction) return fearEvent; // driver commits the returned event
                // The exposure record chains off the fear event it shaped (commit → allocate →
                // return keeps seq monotonic — same two-event pattern as the escort resolution).
                this.commitEvent(fearEvent);
                const habituated = this.allocateEvent({ type: 'FEAR_HABITUATED', parent: fearEvent, factionId: faction.id, source: fearEvent.source, stimulusKey: habituation.key, baseGain: habituation.base, appliedGain: habituation.adjusted, fearReduced: habituation.fearReduced, habituationLevel: habituation.habituationLevel, exposureCount: habituation.exposureCount });
                // Re-opened `Hysteresis` row: the fear state machine consumes the POST-attenuation
                // fear — asymmetric enter/exit thresholds behind the minimum-duration gate — and a
                // real transition records as a canonical event chained off the exposure that
                // produced the level it read. Blocked/gate updates emit nothing (no event spam).
                const transition = this.hysteresis.update(faction.id, faction.state.fear, {}, this.now());
                if (!transition.transitioned) return habituated;
                this.commitEvent(habituated);
                return this.allocateEvent({ type: 'FEAR_STATE_TRANSITION', parent: habituated, factionId: faction.id, from: transition.from, to: transition.to, fearLevel: transition.fearLevel, stateTimer: transition.stateTimer, worldTime: this.now() });
            }
            case 'WAR_STATUS_EVALUATE': {
                // RESP-PLAYER-INVASION-CHAIN-001 stage 2: war status is computed from the
                // accumulated pressure against the world thresholds and parent-chained to the
                // FearEvent that produced the pressure.
                const pressure = this.warState.pressure;
                const tensionThreshold = Math.max(0, num(action.tensionThreshold, this.warState.tensionThreshold));
                const warThreshold = Math.max(tensionThreshold, num(action.warThreshold, this.warState.warThreshold));
                this.warState.tensionThreshold = tensionThreshold;
                this.warState.warThreshold = warThreshold;
                const target = pressure >= warThreshold ? 'WAR' : pressure >= tensionThreshold ? 'TENSION' : 'PEACE';
                const statusBefore = this.warState.status;
                this.warState.status = target;
                const fearEvent = [...this.events].reverse().find(event => event.type === 'FEAR_EVENT_RAISED') ?? parent;
                const escalation = target === 'PEACE' ? 0 : Math.min(8, Math.floor((pressure / Math.max(1, warThreshold)) * 8));
                return this.allocateEvent({ type: 'WAR_STATUS_UPDATE', parent: action.parent ?? fearEvent, statusBefore, statusAfter: target, pressure, tensionThreshold, warThreshold, escalation });
            }
            case 'INVASION_MOBILIZE': {
                // RESP-PLAYER-INVASION-CHAIN-001 stage 3: invasions only mobilize during an
                // active war; one world-RNG draw decides the assault, loot transfers exactly
                // from settlement resources into war loot (conservation on every resolution).
                if (this.warState.status !== 'WAR') throw new Error(`Invasion requires war state "WAR" (current "${this.warState.status}")`);
                if (!action.invasionId) throw new Error('INVASION_MOBILIZE requires an invasionId');
                if (this.invasions.has(action.invasionId)) throw new Error(`Duplicate invasion id "${action.invasionId}"`);
                const settlement = this.settlements.get(action.settlementId);
                if (!settlement) throw new Error(`Unknown settlement "${action.settlementId}"`);
                const force = num(action.force, 0);
                if (!(force > 0)) throw new Error('INVASION_MOBILIZE requires a positive force');
                const defense = Math.max(0, num(action.defense, 0));
                const roll = this.random();
                const attackerPower = force;
                const defenderPower = defense + roll;
                const victory = attackerPower > defenderPower;
                const resourcesBefore = settlement.resources;
                const plunder = Math.max(0, Math.floor(num(action.plunder, force)));
                const loot = victory ? Math.min(resourcesBefore, plunder) : 0;
                settlement.resources = resourcesBefore - loot;
                this.warLoot += loot;
                const invasion = { id: action.invasionId, settlementId: action.settlementId, force, defense, roll, victory, loot, tick: this.now(), status: victory ? 'SUCCEEDED' : 'REPULSED' };
                this.invasions.set(invasion.id, invasion);
                const warStatus = [...this.events].reverse().find(event => event.type === 'WAR_STATUS_UPDATE') ?? parent;
                return this.allocateEvent({ type: 'INVASION_RESOLVED', parent: action.parent ?? warStatus, invasionId: invasion.id, settlementId: invasion.settlementId, force, defense, roll, attackerPower, defenderPower, victory, loot, warLoot: this.warLoot, resourcesBefore, resourcesAfter: settlement.resources, status: invasion.status, warStatus: this.warState.status });
            }
            case 'MERCHANT_ECONOMY_CYCLE': {
                // RESP-ROUTING-TRADE-ECONOMY-LOOP-001: one action runs the merchant economy
                // cycle — route + profitability plan, shipment, delivery, and the two-sided
                // price response — as a single parent-chained event chain. Every path returns
                // exactly one uncommitted tail event (the runner commits it); earlier events
                // are committed here.
                const origin = this.markets.get(action.market);
                if (!origin) throw new Error(`Unknown market "${action.market}"`);
                const destination = this.markets.get(action.destination);
                if (!destination) throw new Error(`Unknown destination market "${action.destination}"`);
                if (action.market === action.destination) throw new Error('MERCHANT_ECONOMY_CYCLE requires distinct origin and destination markets');
                const quantity = num(action.quantity, 0);
                if (!(quantity > 0)) throw new Error('MERCHANT_ECONOMY_CYCLE requires a positive quantity');
                if (!action.good) throw new Error('MERCHANT_ECONOMY_CYCLE requires a good');
                if (!action.tripId) throw new Error('MERCHANT_ECONOMY_CYCLE requires a tripId');
                if (origin.inTransit.has(action.tripId)) throw new Error(`Duplicate trip id "${action.tripId}"`);
                const routes = action.routes ?? this.routes.edges;
                const destinationPrice = num(destination.prices?.[action.good], 0);
                const minimumPrice = num(action.minimumPrice, 0);
                const profitable = destinationPrice >= minimumPrice;
                const actor = action.actorId ? this.actors.get(action.actorId) : null;
                const selected = profitable ? this.routes.chooseRoute(routes, { ...action.context, beliefs: action.beliefs ?? actor?.beliefs, marketPrice: destinationPrice }) : null;
                const plan = this.allocateEvent({ type: 'MERCHANT_ROUTE_PLAN', parent, market: action.market, destination: action.destination, good: action.good, quantity, routeId: selected?.id ?? null, destinationPrice, minimumPrice, profitable, decision: selected ? 'TRAVEL' : 'WAIT' });
                if (!selected) return plan;
                this.commitEvent(plan);
                const trip = origin.createTrip({ id: action.tripId, good: action.good, cargoKind: action.cargoKind, owner: action.owner ?? action.actorId ?? null, quantity, destination: action.destination });
                if (!trip) return this.allocateEvent({ type: 'MARKET_TRIP_CREATE', parent: plan, market: action.market, tripId: action.tripId, good: action.good, cargoKind: action.cargoKind ?? action.good, quantity, destination: action.destination, owner: action.owner ?? action.actorId ?? null, status: 'REJECTED', reason: 'INSUFFICIENT_STOCK' });
                const create = this.allocateEvent({ type: 'MARKET_TRIP_CREATE', parent: plan, market: action.market, tripId: trip.id, good: trip.good, cargoKind: trip.cargoKind, quantity: trip.quantity, destination: trip.destination, owner: trip.owner ?? null, status: 'IN_TRANSIT' });
                this.commitEvent(create);
                origin.settleTrip(action.tripId, 'DELIVERED', destination);
                const settle = this.allocateEvent({ type: 'MARKET_TRIP_SETTLE', parent: create, market: action.market, tripId: action.tripId, good: action.good, quantity, destination: action.destination, outcome: 'DELIVERED', routeId: selected.id, perceivedDanger: num(selected.perceivedDanger, 0), owner: trip.owner ?? null });
                this.commitEvent(settle);
                // Price response at both ends: the purchase raises demand at the origin, the
                // delivery raises supply at the destination — one canonical event per market.
                const originPriceBefore = num(origin.prices?.[action.good], 0);
                origin.update({ demand: { [action.good]: quantity }, supply: {} });
                const originUpdate = this.allocateEvent({ type: 'MARKET_UPDATE', parent: settle, market: action.market, jitter: false, good: action.good, priceBefore: originPriceBefore, priceAfter: num(origin.prices?.[action.good], originPriceBefore), shock: 'DEMAND' });
                this.commitEvent(originUpdate);
                const destinationPriceBefore = num(destination.prices?.[action.good], 0);
                destination.update({ demand: {}, supply: { [action.good]: quantity } });
                return this.allocateEvent({ type: 'MARKET_UPDATE', parent: originUpdate, market: action.destination, jitter: false, good: action.good, priceBefore: destinationPriceBefore, priceAfter: num(destination.prices?.[action.good], destinationPriceBefore), shock: 'SUPPLY' });
            }
            case 'ROUTE_OBSERVATION': {
                const actor = action.actorId ? this.actors.get(action.actorId) || { id: action.actorId } : action.actor;
                const route = action.route || this.routes.edges.find(edge => edge.id === action.routeId);
                const observed = this.routes.observeRoute(route, { ...action.observation, observedAt: action.observation?.observedAt ?? this.now() });
                if (!observed) return this.allocateEvent({ type: 'ROUTE_OBSERVATION_REJECTED', parent, actorId: actor.id, routeId: route?.id ?? null, reason: 'OUT_OF_RANGE' });
                this.recordRouteObservation(actor, route, action.observation ?? {});
                const observation = this.allocateEvent({ type: 'ROUTE_OBSERVATION', parent, actorId: actor.id, routeId: observed.routeId, perceivedDanger: observed.perceivedDanger, confidence: observed.confidence, source: observed.source, observedAt: observed.observedAt, distance: observed.distance });
                this.commitEvent(observation);
                // RESP-EVENT-CAUSALITY-001: recordRouteObservation writes exactly this claim —
                // observeRoute never returned a claim, so the event used to carry `claim: undefined`.
                return this.allocateEvent({ type: 'BELIEF_UPDATED', parent: observation, actorId: actor.id, claim: `route:${observed.routeId}:danger`, estimate: observed.perceivedDanger, confidence: observed.confidence });
            }
            case 'TRADE_ROUTE_DECISION': {
                const routes = action.routes ?? this.routes.edges;
                const destination = this.markets.get(action.destination);
                const price = destination?.prices?.[action.good] ?? 0;
                const linkedInfrastructure = action.infrastructure ? this.infrastructure.get(action.infrastructure) : null;
                const accessBlocked = linkedInfrastructure?.condition <= 0 || (action.routeId && this.routes.edges.find(edge => edge.id === action.routeId)?.available === false);
                const actor = action.actorId ? this.actors.get(action.actorId) : null;
                const context = { ...action.context, beliefs: action.beliefs ?? actor?.beliefs, expectedCargoLoss: action.context?.expectedCargoLoss ?? 0, marketPrice: price };
                const minimumPrice = num(action.minimumPrice, 0);
                const profitable = price >= minimumPrice;
                const selected = profitable && !accessBlocked ? this.routes.chooseRoute(routes, context) : null;
                const selectedBelief = selected && actor?.beliefs?.get(`route:${selected.id}:danger`);
                const fallbackBelief = actor && [...(actor.beliefs?.values() ?? [])].find(belief => belief?.evidence?.length);
                const provenanceBelief = selectedBelief ?? fallbackBelief;
                const provenance = provenanceBelief?.evidence?.at(-1) ? { source: provenanceBelief.evidence.at(-1).source ?? null, confidence: provenanceBelief.confidence, age: Math.max(0, this.now() - num(provenanceBelief.lastUpdated, this.now())) } : null;
                // RESP-EVENT-CAUSALITY-001: cite the world event that produced the consumed belief.
                const beliefProvenance = this.beliefProvenance(actor?.id ?? null, selected ? `route:${selected.id}:danger` : (provenanceBelief?.claim ?? null));
                const settlement = action.settlement ? this.settlements.get(action.settlement) : null;
                const requestedResourceGain = selected && settlement ? Math.max(0, num(action.resourceGain, 1)) : 0;
                const resourceGain = settlement ? Math.min(requestedResourceGain, Math.max(0, settlement.resourceCapacity - settlement.resources)) : 0;
                const resourceOverflow = settlement ? requestedResourceGain - resourceGain : 0;
                if (settlement) { settlement.resources += resourceGain; settlement.resourceOverflow += resourceOverflow; }
                return this.allocateEvent({ type: 'TRADE_ROUTE_DECISION', parent: action.parent ?? (actor ? ([...this.events].reverse().find(event => event.type === 'ROUTE_OBSERVATION' && event.actorId === actor.id) ?? [...this.events].reverse().find(event => event.type === 'SETTLEMENT_ADAPTATION') ?? parent) : ([...this.events].reverse().find(event => event.type === 'SETTLEMENT_ADAPTATION') ?? parent)), actorId: action.actorId ?? null, good: action.good ?? null, destination: action.destination ?? null, destinationPrice: price, minimumPrice, profitable, accessBlocked: Boolean(accessBlocked), selectedRoute: selected?.id ?? null, decision: selected ? 'TRAVEL' : 'WAIT', settlementId: settlement?.id ?? null, requestedResourceGain, resourceGain, resourceOverflow, settlementResources: settlement?.resources ?? null, resourceCapacity: settlement?.resourceCapacity ?? null, provenance, beliefProvenance, explanation: [`destination price ${price}`, `minimum price ${minimumPrice}`] });
            }
            case 'MARKET_TRIP_CREATE': {
                const market = this.markets.get(action.market); if (!market) throw new Error(`Unknown market "${action.market}"`);
                const trip = market.createTrip({ id: action.tripId, good: action.good, cargoKind: action.cargoKind, owner: action.owner ?? action.actorId ?? null, quantity: action.quantity, destination: action.destination });
                return this.allocateEvent({ type: 'MARKET_TRIP_CREATE', parent, market: action.market, tripId: action.tripId, good: action.good, cargoKind: action.cargoKind ?? action.good, owner: action.owner ?? action.actorId ?? null, quantity: num(action.quantity), destination: action.destination, status: trip ? 'IN_TRANSIT' : 'REJECTED' });
            }
            case 'MARKET_TRIP_SETTLE': {
                const market = this.markets.get(action.market); if (!market) throw new Error(`Unknown market "${action.market}"`);
                const inTransit = market.inTransit.get(action.tripId);
                const route = action.routeId ? this.routes.edges.find(edge => edge.id === action.routeId) : null;
                const routeBlocked = Boolean(route && (route.available === false || action.routeAvailable === false));
                const outcome = action.outcome ?? (routeBlocked ? 'BLOCKED' : (route ? this.routes.riskOutcome(route, { danger: action.perceivedDanger ?? route.perceivedDanger, threshold: action.riskThreshold ?? 1 }) : 'DELIVERED'));
                const destination = action.destinationMarket ? this.markets.get(action.destinationMarket) : this.markets.get(action.destination ?? inTransit?.destination);
                const trip = outcome === 'BLOCKED' ? (() => {
                    if (!inTransit) throw new Error(`Unknown or already settled trip "${action.tripId}"`);
                    inTransit.status = 'BLOCKED';
                    market.inTransit.delete(action.tripId);
                    market.history.push({ kind: 'TRIP_SETTLEMENT', tripId: action.tripId, good: inTransit.good, quantity: inTransit.quantity, destination: inTransit.destination, outcome: 'BLOCKED' });
                    return { ...inTransit };
                })() : market.settleTrip(action.tripId, outcome, destination);
                return this.allocateEvent({ type: 'MARKET_TRIP_SETTLE', parent, market: action.market, tripId: action.tripId, good: trip.good, cargoKind: trip.cargoKind, quantity: trip.quantity, destination: trip.destination, outcome: trip.status, routeId: action.routeId ?? null, perceivedDanger: num(action.perceivedDanger ?? route?.perceivedDanger, 0), owner: trip.status === 'STOLEN' ? (action.thief ?? 'thief') : trip.owner });
            }
            case 'MARKET_TRADE': {
                const market = this.markets.get(action.market); if (!market) throw new Error(`Unknown market "${action.market}"`);
                const result = market.trade(action.good, action.quantity, action.price);
                return this.allocateEvent({ type: 'MARKET_TRADE', parent, market: action.market, good: action.good, quantity: num(action.quantity), price: num(action.price, market.prices[action.good] ?? 1), settled: result !== null, value: result ?? 0 });
            }
            case 'MARKET_UPDATE': {
                const market = this.markets.get(action.market); if (!market) throw new Error(`Unknown market "${action.market}"`);
                const prices = market.update({ demand: action.demand ?? {}, supply: action.supply ?? {} });
                if (action.jitter) for (const good of Object.keys(prices)) market.prices[good] *= 1 + (this.random() - .5) * .02;
                return this.allocateEvent({ type: 'MARKET_UPDATE', parent, market: action.market, jitter: Boolean(action.jitter) });
            }
            case 'ROUTE_TRAVEL': {
                const route = this.routes.edges.find(e => e.id === action.route); if (!route) throw new Error(`Unknown route "${action.route}"`);
                const moved = this.routes.travel(route, action.cargo ?? 0);
                return this.allocateEvent({ type: 'ROUTE_TRAVEL', parent, route: action.route, cargo: num(action.cargo, 0), moved });
            }
            case 'RUMOR_QUEUE': {
                const rumor = typeof action.rumor === 'object' && action.rumor ? action.rumor : this.rumors.rumors.find(candidate => candidate.id === action.rumor);
                if (!rumor?.id) throw new Error(`Unknown rumor "${action.rumor?.id ?? action.rumor}"`);
                const recipient = typeof action.recipient === 'object' && action.recipient ? action.recipient : this.actors.get(action.recipient) ?? { id: action.recipient };
                if (!recipient?.id) throw new Error('A rumor recipient is required');
                const item = this.queueRumor(rumor, recipient, { delay: action.delay ?? 1, ttl: action.ttl ?? 10, distortion: action.distortion ?? 0, halfLife: action.halfLife ?? null });
                return this.allocateEvent({ type: 'RUMOR_QUEUE', parent, rumorId: rumor.id, recipientId: recipient.id, claim: rumor.claim ?? null, delay: action.delay ?? 1, ttl: action.ttl ?? 10, distortion: action.distortion ?? 0, queuedAt: item?.queuedAt ?? this.now(), deliveryTick: item?.deliveryTick ?? null, expiresAt: item?.expiresAt ?? null });
            }
            case 'RUMOR_DELIVER': {
                // RESP-EVENT-CAUSALITY-001: delivery mutates recipient beliefs — every write is
                // mirrored into history: a summary event, one RUMOR_DELIVERED per queue item,
                // and a BELIEF_UPDATED child pinned to the delivering event.
                const recipients = (action.recipients ?? (action.recipient ? [action.recipient] : [])).map(entry => (typeof entry === 'object' && entry) ? entry : (this.actors.get(entry) ?? { id: entry }));
                const delivered = this.deliverRumors(recipients);
                this.commitEvent(this.allocateEvent({ type: 'RUMOR_DELIVER', parent, requested: recipients.length, delivered: delivered.length }));
                const summary = this.events.at(-1);
                for (const item of delivered) {
                    const rumor = this.rumors.rumors.find(candidate => candidate.id === item.rumorId);
                    const recipient = recipients.find(candidate => candidate.id === item.recipientId);
                    const claim = rumor?.claim ?? null;
                    const belief = claim != null ? recipient?.beliefs?.get(claim) : null;
                    const lastEvidence = belief?.evidence?.at(-1) ?? null;
                    const deliveredAt = Number.isFinite(lastEvidence?.deliveredAt) ? lastEvidence.deliveredAt : this.now();
                    const latency = Math.max(0, deliveredAt - (Number.isFinite(item.queuedAt) ? item.queuedAt : (item.deliveryTick ?? deliveredAt) - 1) - 1);
                    const deliveredEvent = this.commitEvent(this.allocateEvent({ type: 'RUMOR_DELIVERED', parent: summary, rumorId: item.rumorId, recipientId: item.recipientId, claim, queuedAt: item.queuedAt ?? null, deliveryTick: item.deliveryTick ?? null, deliveredAt, latency, arrivedConfidence: lastEvidence ? clamp(lastEvidence.confidence) : null }));
                    this.commitEvent(this.allocateEvent({ type: 'BELIEF_UPDATED', parent: deliveredEvent, actorId: item.recipientId, claim, estimate: belief?.estimate ?? null, confidence: belief ? clamp(belief.confidence) : null }));
                }
                return [];
            }
            case 'RUMOR_RELAY': {
                const rumor = typeof action.rumor === 'object' && action.rumor ? action.rumor : this.rumors.rumors.find(candidate => candidate.id === action.rumor);
                if (!rumor?.id) throw new Error(`Unknown rumor "${action.rumor?.id ?? action.rumor}"`);
                const relayer = typeof action.relayer === 'object' && action.relayer ? action.relayer : this.actors.get(action.relayer) ?? { id: action.relayer };
                const recipient = typeof action.recipient === 'object' && action.recipient ? action.recipient : this.actors.get(action.recipient) ?? { id: action.recipient };
                if (!relayer?.id || !recipient?.id) throw new Error('Relayer and recipient ids are required');
                const item = this.relayRumor(rumor, relayer, recipient, { delay: action.delay ?? 1, ttl: action.ttl ?? 10, distortion: action.distortion ?? 0, halfLife: action.halfLife ?? null });
                return this.allocateEvent({ type: 'RUMOR_RELAY', parent, rumorId: rumor.id, relayerId: relayer.id, recipientId: recipient.id, claim: rumor.claim ?? null, relayed: Boolean(item), enqueuedRumorId: item?.rumorId ?? null, deliveryTick: item?.deliveryTick ?? null });
            }
            case 'INTERACTION_EXECUTION': {
                // RESP-CHARACTER-INTERACTION-AFFORDANCES-001: execute a registered affordance
                // end-to-end — the advisory gate is the ONLY approval path, approved interactions
                // apply the declared effect table, and every outcome (rejections included) lands
                // in world history. Resolution prefers world-registered actors so effects mutate
                // world state, not throwaway literals.
                const pick = ref => this.actors.get(ref?.id) ?? ref ?? {};
                const actor = pick(action.actor ?? { id: action.actorId, type: action.actorType });
                const target = pick(action.target ?? { id: action.targetId, type: action.targetType });
                const requested = action.proposal ?? action.action ?? null;
                const verdict = this.advisory.validate(requested, actor, target, action.context ?? {});
                if (!verdict.approved) {
                    return this.allocateEvent({ type: 'INTERACTION_EXECUTION', parent, approved: false, action: requested, actorId: actor?.id ?? null, targetId: target?.id ?? null, blockers: verdict.blockers || [], effects: [], source: verdict.source });
                }
                const effects = [];
                for (const rule of INTERACTION_EFFECTS[verdict.action] ?? []) {
                    const subject = rule.subject === 'actor' ? actor : target;
                    for (const [field, value] of Object.entries(rule.set)) {
                        const from = subject[field];
                        subject[field] = value;
                        effects.push({ subject: rule.subject, field, from, to: value });
                    }
                }
                return this.allocateEvent({ type: 'INTERACTION_EXECUTION', parent, approved: true, action: verdict.action, actorId: actor?.id ?? null, targetId: target?.id ?? null, blockers: [], effects, source: verdict.source });
            }
            case 'MORALE_UPDATE': {
                // Morale is owned by socialcore's Morale through the world registry; each update
                // is a canonical TURN child with before/after and the freeze signal.
                const actorId = action.actorId ?? null;
                if (!actorId) throw new Error('MORALE_UPDATE requires an actorId');
                const morale = this.morales.get(actorId) ?? new Morale(num(action.initial, 1));
                this.morales.set(actorId, morale);
                const before = morale.value;
                const after = morale.update({ fear: action.fear, victories: action.victories, losses: action.losses, safe: action.safe });
                return this.allocateEvent({ type: 'MORALE_SHIFT', parent, actorId, before, after, delta: after - before, freezeRisk: morale.canFreeze(), update: { fear: num(action.fear), victories: num(action.victories), losses: num(action.losses), safe: Boolean(action.safe) } });
            }
            case 'DECISION': {
                // Evaluate through DecisionCore and record the outcome as world history:
                // chosen action, score, and the rejected alternatives (why-not explainability).
                const decisionActorId = action.actorId ?? action.context?.actorId ?? null;
                const result = this.decisions.evaluate(this.evaluationContext(action.context ?? {}, decisionActorId), action.actions ?? []);
                const chosen = result.candidates.find(c => c.action === result.selected);
                const best = result.candidates.length
                    ? result.candidates.reduce((m, c) => (c.finalScore > m.finalScore ? c : m), result.candidates[0])
                    : null;
                return this.allocateEvent({
                    type: 'DECISION', parent,
                    actorId: result.actorId ?? action.actorId ?? null,
                    selected: result.selected, valid: result.valid,
                    score: chosen ? chosen.finalScore : 0,
                    blockers: chosen ? chosen.blockers : (best ? best.blockers : []),
                    alternatives: result.alternatives.map(a => ({ action: a.action, score: a.finalScore })),
                    explanation: result.explanation,
                });
            }
            case 'REPUTATION_JUDGE': {
                // RESP-REPUTATION-PUBLIC-PRIVATE-001: judgments land in one of two channels —
                // PUBLIC standing shared world-wide, or PRIVATE observer-local opinion — both
                // blended through ReputationBook weighted math and recorded as a canonical
                // parent-chained event. All invariants validate before any mutation.
                const scope = action.scope ?? 'public';
                if (scope !== 'public' && scope !== 'private') throw new Error(`Reputation scope must be "public" or "private" (got "${scope}")`);
                if (!action.subjectId) throw new Error('REPUTATION_JUDGE requires a subjectId');
                const value = num(action.value, NaN);
                if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('REPUTATION_JUDGE requires a value within 0..1');
                const weight = action.weight == null ? 1 : num(action.weight, NaN);
                if (!Number.isFinite(weight) || weight < 0) throw new Error('REPUTATION_JUDGE requires a non-negative weight');
                const observerId = action.observerId ?? null;
                if (scope === 'private' && !observerId) throw new Error('A private judgment requires an observerId');
                const valueBefore = scope === 'public' ? this.reputation.get(action.subjectId) : this.reputation.getPrivate(observerId, action.subjectId);
                const valueAfter = scope === 'public'
                    ? this.reputation.update(action.subjectId, value, weight)
                    : this.reputation.updatePrivate(observerId, action.subjectId, value, weight);
                const prior = [...this.events].reverse().find(event => event.type === 'REPUTATION_UPDATE' && event.subjectId === action.subjectId) ?? null;
                return this.allocateEvent({ type: 'REPUTATION_UPDATE', parent: action.parent ?? prior ?? parent, scope, subjectId: action.subjectId, observerId, valueBefore, valueAfter, weight, reason: action.reason ?? null });
            }
            default: throw new Error(`Unknown action kind "${kind}"`);
        }
    }
    // Plain-object state for a future save/load layer; round-trips through deserialize.
    serialize() {
        return {
            schema: 'fear-ai-sim/societycore', version: 1,
            time: this.time, eventSeq: this.eventSeq,
            events: this.events.map(e => ({ ...e })),
            actors: this.serializeActors(),
            rumors: this.rumors.rumors.map(r => ({ ...r })),
            rumorSeq: this.rumors.seq,
            rumorQueue: this.rumors.queue.map(item => ({ ...item })),
            rumorMaxRumors: this.rumors.maxRumors,
            rumorMaxQueue: this.rumors.maxQueue,
            rumorConfidenceHalfLife: this.rumors.confidenceHalfLife,
            reputation: Object.fromEntries([...this.reputation.values.entries()].map(([k, v]) => [k, { ...v }])),
            reputationPrivate: Object.fromEntries([...this.reputation.privateValues.entries()].map(([observer, channel]) => [observer, Object.fromEntries([...channel.entries()].map(([target, entry]) => [target, { ...entry }]))])),
            markets: Object.fromEntries([...this.markets.entries()].map(([id, m]) => [id, { prices: { ...m.prices }, stock: { ...m.stock }, initialStock: { ...m.initialStock }, history: m.history.map(h => ({ ...h })), inTransit: Object.fromEntries(m.inTransit.entries()) }])),
            routes: { edges: this.routes.edges.map(e => ({ ...e })) },
            infrastructure: Object.fromEntries([...this.infrastructure.entries()].map(([id, structure]) => [id, { ...structure }])),
            factions: Object.fromEntries([...this.factions.entries()].map(([id, f]) => [id, { id: f.id, state: { ...f.state }, loot: f.loot, history: f.history.map(h => ({ ...h })) }])),
            settlements: Object.fromEntries([...this.settlements.entries()].map(([id, settlement]) => [id, { ...settlement }])),
            migrationJourneys: Object.fromEntries([...this.migrationJourneys.entries()].map(([id, journey]) => [id, { ...journey }])),
            roamingGroups: Object.fromEntries([...this.roamingGroups.entries()].map(([id, group]) => [id, { ...group }])),
            convoys: Object.fromEntries([...this.convoys.entries()].map(([id, convoy]) => [id, { ...convoy }])),
            raids: Object.fromEntries([...this.raids.entries()].map(([id, raid]) => [id, { ...raid }])),
            habituation: Object.fromEntries([...this.habituation.exposures.entries()].map(([key, exposure]) => [key, { ...exposure }])),
            hysteresis: Object.fromEntries([...this.hysteresis.actors.entries()].map(([id, controller]) => [id, { state: controller.state, stateTimer: controller.stateTimer, transitionHistory: controller.transitionHistory.map(entry => ({ ...entry })) }])),
            player: { ...this.player },
            warState: { ...this.warState },
            warLoot: this.warLoot,
            invasions: Object.fromEntries([...this.invasions.entries()].map(([id, invasion]) => [id, { ...invasion }])),
            personalities: Object.fromEntries([...this.personalities.entries()].map(([id, p]) => [id, { openness: p.openness, conscientiousness: p.conscientiousness, extraversion: p.extraversion, agreeableness: p.agreeableness, neuroticism: p.neuroticism, riskTolerance: p.riskTolerance, uncertaintyAversion: p.uncertaintyAversion, impulsiveness: p.impulsiveness }])),
            morales: Object.fromEntries([...this.morales.entries()].map(([id, m]) => [id, { value: m.value }])),
            rng: this.rng.getState ? { seed: this.rngSeed, state: this.rng.getState() } : null,
        };
    }
    serializeActors() {
        return Object.fromEntries((this.actors ?? new Map()).entries().map(([id, actor]) => [id, { id, ...(actor.type != null ? { type: actor.type } : {}), beliefs: Object.fromEntries([...((actor.beliefs instanceof Map) ? actor.beliefs : new Map()).entries()].map(([claim, belief]) => [claim, { claim: belief.claim, estimate: belief.estimate, confidence: belief.confidence, lastUpdated: belief.lastUpdated, evidence: belief.evidence.map(e => ({ ...e })) }])) }]));
    }
    toJSON() { return this.serialize(); }
    static deserialize(json, { rng } = {}) {
        const society = new SocietyCore({ rng });
        society.time = json.time ?? 0; society.eventSeq = json.eventSeq ?? 0;
        society.actors = new Map(Object.entries(json.actors ?? {}).map(([id, data]) => {
            const actor = { id, ...(data.type != null ? { type: data.type } : {}), beliefs: new Map() };
            for (const [claim, raw] of Object.entries(data.beliefs ?? {})) {
                const belief = new AgentBelief(raw.claim ?? claim, raw.estimate, raw.confidence, { now: () => society.now() });
                belief.lastUpdated = raw.lastUpdated ?? society.now();
                belief.evidence = (raw.evidence ?? []).map(e => new BeliefEvidence(e, { now: () => society.now() }));
                actor.beliefs.set(claim, belief);
            }
            return [id, actor];
        }));
        society.events = (json.events ?? []).map(e => ({ ...e }));
        society.rumors.rumors = (json.rumors ?? []).map(r => ({ ...r }));
        society.rumors.seq = json.rumorSeq ?? json.rumors?.length ?? 0;
        society.rumors.queue = (json.rumorQueue ?? []).map(item => ({ ...item }));
        if (json.rumorMaxRumors != null) society.rumors.maxRumors = Math.max(1, Math.floor(json.rumorMaxRumors));
        if (json.rumorMaxQueue != null) society.rumors.maxQueue = Math.max(1, Math.floor(json.rumorMaxQueue));
        if (json.rumorConfidenceHalfLife != null) society.rumors.confidenceHalfLife = Math.max(1, num(json.rumorConfidenceHalfLife, 10));
        for (const [k, v] of Object.entries(json.reputation ?? {})) society.reputation.values.set(k, { ...v });
        for (const [observer, channel] of Object.entries(json.reputationPrivate ?? {})) society.reputation.privateValues.set(observer, new Map(Object.entries(channel).map(([target, entry]) => [target, { ...entry }])));
        for (const [id, m] of Object.entries(json.markets ?? {})) { const market = new Market({ prices: m.prices, stock: m.stock }); market.initialStock = { ...(m.initialStock ?? m.stock) }; market.history = (m.history ?? []).map(h => ({ ...h })); market.inTransit = new Map(Object.entries(m.inTransit ?? {}).map(([tripId, trip]) => [tripId, { ...trip }])); society.markets.set(id, market); }
        society.routes = new RouteNetwork((json.routes?.edges ?? []).map(e => ({ ...e })));
        society.infrastructure = new Map(Object.entries(json.infrastructure ?? {}).map(([id, structure]) => [id, { ...structure }]));
        for (const [id, f] of Object.entries(json.factions ?? {})) { const faction = new FactionRuntime(id, f.state ?? {}); faction.history = (f.history ?? []).map(h => ({ ...h })); faction.loot = num(f.loot, 0); society.factions.set(id, faction); }
        society.settlements = new Map(Object.entries(json.settlements ?? {}).map(([id, settlement]) => [id, { ...settlement }]));
        society.migrationJourneys = new Map(Object.entries(json.migrationJourneys ?? {}).map(([id, journey]) => [id, { ...journey }]));
        society.roamingGroups = new Map(Object.entries(json.roamingGroups ?? {}).map(([id, group]) => [id, { ...group }]));
        society.convoys = new Map(Object.entries(json.convoys ?? {}).map(([id, convoy]) => [id, { ...convoy }]));
        society.raids = new Map(Object.entries(json.raids ?? {}).map(([id, raid]) => [id, { ...raid }]));
        for (const [key, exposure] of Object.entries(json.habituation ?? {})) society.habituation.exposures.set(key, { ...exposure });
        for (const [id, controller] of Object.entries(json.hysteresis ?? {})) society.hysteresis.actors.set(id, { state: controller.state, stateTimer: controller.stateTimer, transitionHistory: (controller.transitionHistory ?? []).map(entry => ({ ...entry })) });
        society.player = { hp: 100, maxHp: 100, alive: true, deaths: 0, ...(json.player ?? {}) };
        society.warState = { status: 'PEACE', pressure: 0, tensionThreshold: 30, warThreshold: 70, ...(json.warState ?? {}) };
        society.warLoot = num(json.warLoot, 0);
        society.invasions = new Map(Object.entries(json.invasions ?? {}).map(([id, invasion]) => [id, { ...invasion }]));
        if (json.rng) { if (json.rng.seed != null) society.rngSeed = json.rng.seed; if (society.rng.getState) society.rng.setState(json.rng.state); }
        for (const [id, values] of Object.entries(json.personalities ?? {})) society.personalities.set(id, new Personality(values, { rng: society.rng }));
        for (const [id, state] of Object.entries(json.morales ?? {})) society.morales.set(id, new Morale(state.value));
        return society;
    }
    resolveCrime({ reward = 0, desperation = 0, apprehension = 0, sanction = 0, fear = 0, moralCost = 0 } = {}) { return num(reward) + num(desperation) - clamp(apprehension) * num(sanction) - num(fear) - num(moralCost); }
    reportCrime({ legitimacy = 0, trust = 0, duty = 0, retaliationFear = 0, corruption = 0, uncertainty = 0 } = {}) { return clamp(legitimacy + trust + duty - retaliationFear - corruption - uncertainty); }
    accessToJustice({ remedy = 0, legitimacy = 0, friction = 0, risk = 0 } = {}) { return clamp((remedy * legitimacy) / Math.max(.001, friction + risk + .001)); }
    updateLegitimacy(current, { cooperation = 0, injustice = 0, solved = 0 } = {}) { return clamp(num(current, .5) + num(cooperation) * .05 + num(solved) * .03 - num(injustice) * .08); }
    shouldMigrate({ fear = 0, routeDanger = 0, foodSecurity = 1, legitimacy = 1 } = {}) { return clamp(clamp(fear) * .4 + clamp(routeDanger) * .3 + (1 - clamp(foodSecurity)) * .2 + (1 - clamp(legitimacy)) * .1) > .6; }
}
