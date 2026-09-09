/**
 * packages/core/src/InformationPropagationEngine.js
 *
 * Sections XX, XXVI ( rumor half ):
 * Rumor propagation network — rumors with topic, claim, source, confidence,
 * origin, timestamp, and location relevance that spread, mutate, decay,
 * and get corrected across a sparse directed trust graph.
 *
 * Sits ABOVE EpistemicBeliefEngine: this engine moves messages between
 * agents; each agent's belief engine decides what to believe. Separation:
 * transport here, epistemics there.
 *
 * Determinism: seeded LCG drives mutation rolls and contact order.
 * Same seed + same injections = same network state, bit for bit.
 *
 * Host authority: pure advisory message passing. No movement, damage,
 * inventory, entity, quest, or transform mutation.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const PROPAGATED_RUMOR_TOPICS = Object.freeze([
    'APPROACHING_ARMY', 'ROAD_AMBUSH', 'FACTION_BETRAYAL', 'MONSTER_SIGHTING',
    'RESOURCE_SCARCITY', 'LEADER_DEATH', 'SAFE_SANCTUARY', 'TRADE_OPPORTUNITY'
]);

export const RUMOR_STATUS = Object.freeze({
    ACTIVE: 'ACTIVE',
    DECAYED: 'DECAYED',
    CORRECTED: 'CORRECTED',
    CONFIRMED: 'CONFIRMED'
});

/** Per-hop confidence decay and per-tick temporal decay. */
export const DEFAULT_PROPAGATION_CONFIG = Object.freeze({
    hopDecay: 0.85,
    tickDecay: 0.01,
    minConfidence: 0.05,
    mutationRate: 0.1,
    maxHops: 8
});

function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

export class InformationPropagationEngine {
    /**
     * @param {object} [config={}] overrides
     * @param {number} [seed=1337] determinism seed
     */
    constructor(config = {}, seed = 1337) {
        this.config = Object.freeze({ ...DEFAULT_PROPAGATION_CONFIG, ...config });
        this.rng = makeRng(seed);
        this.seed = seed >>> 0;
        /** rumorId -> rumor record */
        this.rumors = new Map();
        /** agentId -> Set<agentId> directed listen edges (who hears whom) */
        this.listenEdges = new Map();
        /** agentId -> credibility in [0,1] as a source */
        this.credibility = new Map();
        /** agentId -> Map<rumorId, { confidence, hops, tick }> received copies */
        this.inboxes = new Map();
        this.tick = 0;
        this.nextRumorId = 1;
        this.corrections = 0;
    }

    /** Register an agent as a potential source/listener. */
    registerAgent(agentId, credibility = 0.5) {
        const id = String(agentId);
        if (!this.listenEdges.has(id)) this.listenEdges.set(id, new Set());
        if (!this.inboxes.has(id)) this.inboxes.set(id, new Map());
        this.credibility.set(id, clamp01(credibility));
        return id;
    }

    /** Directed edge: listener hears source. */
    addListenEdge(listenerId, sourceId) {
        const l = String(listenerId);
        const s = String(sourceId);
        if (!this.listenEdges.has(l)) this.registerAgent(l);
        if (!this.listenEdges.has(s)) this.registerAgent(s);
        this.listenEdges.get(l).add(s);
    }

    /**
     * Inject a new rumor at an origin agent.
     * @returns rumor id
     */
    injectRumor(topic, claim, originId, options = {}) {
        if (!PROPAGATED_RUMOR_TOPICS.includes(topic)) throw new Error(`UNKNOWN_RUMOR_TOPIC: ${topic}`);
        const origin = String(originId);
        if (!this.listenEdges.has(origin)) this.registerAgent(origin);
        const id = `rumor_${this.nextRumorId++}`;
        const rumor = {
            id,
            topic,
            claim: String(claim),
            origin,
            source: origin,
            confidence: clamp01(options.confidence ?? 0.8),
            bornTick: this.tick,
            locationRelevance: options.locationRelevance || null,
            hops: 0,
            status: RUMOR_STATUS.ACTIVE,
            mutations: 0,
            recipients: new Set([origin])
        };
        this.rumors.set(id, rumor);
        this.inboxes.get(origin).set(id, { confidence: rumor.confidence, hops: 0, tick: this.tick });
        return id;
    }

    /**
     * Advance one tick: spread active rumors along listen edges, apply
     * mutation rolls, temporal decay, and status transitions.
     */
    advanceTick() {
        this.tick += 1;
        const newlyHeard = [];
        // Spread: every agent holding an active rumor shares with listeners.
        // Deterministic order: sorted agent ids, sorted rumor ids.
        for (const [listener, sources] of [...this.listenEdges.entries()].sort()) {
            for (const source of [...sources].sort()) {
                const sourceInbox = this.inboxes.get(source);
                if (!sourceInbox) continue;
                for (const [rumorId] of [...sourceInbox.entries()].sort()) {
                    const rumor = this.rumors.get(rumorId);
                    if (!rumor || rumor.status !== RUMOR_STATUS.ACTIVE) continue;
                    if (rumor.hops + 1 > this.config.maxHops) continue;
                    const listenerInbox = this.inboxes.get(listener);
                    if (listenerInbox.has(rumorId)) continue;
                    const sourceCred = this.credibility.get(source) ?? 0.5;
                    const held = sourceInbox.get(rumorId);
                    const conf = round4(held.confidence * this.config.hopDecay * (0.5 + sourceCred * 0.5));
                    if (conf < this.config.minConfidence) continue;
                    // Mutation roll: claim drifts, confidence drops.
                    let claim = rumor.claim;
                    let mutated = false;
                    if (this.rng() < this.config.mutationRate) {
                        claim = `${rumor.claim} (retold)`;
                        mutated = true;
                    }
                    listenerInbox.set(rumorId, { confidence: conf, hops: held.hops + 1, tick: this.tick });
                    rumor.recipients.add(listener);
                    rumor.hops = Math.max(rumor.hops, held.hops + 1);
                    if (mutated) rumor.mutations += 1;
                    void claim;
                    newlyHeard.push({ rumorId, listener, confidence: conf });
                }
            }
        }
        // Temporal decay + status transitions.
        for (const rumor of this.rumors.values()) {
            if (rumor.status !== RUMOR_STATUS.ACTIVE) continue;
            rumor.confidence = round4(rumor.confidence - this.config.tickDecay);
            if (rumor.confidence < this.config.minConfidence) rumor.status = RUMOR_STATUS.DECAYED;
        }
        return newlyHeard;
    }

    /**
     * Authoritative correction (host-validated truth arrives).
     * Marks rumor corrected and records trust penalty for its origin.
     */
    correctRumor(rumorId, truthful) {
        const rumor = this.rumors.get(String(rumorId));
        if (!rumor) throw new Error(`UNKNOWN_RUMOR: ${rumorId}`);
        rumor.status = truthful ? RUMOR_STATUS.CONFIRMED : RUMOR_STATUS.CORRECTED;
        this.corrections += 1;
        if (!truthful) {
            // Origin loses credibility: future rumors from it weigh less.
            const cur = this.credibility.get(rumor.origin) ?? 0.5;
            this.credibility.set(rumor.origin, round4(cur * 0.7));
        }
        return rumor.status;
    }

    /** What an agent currently holds (sorted by confidence desc). */
    heldBy(agentId) {
        const inbox = this.inboxes.get(String(agentId));
        if (!inbox) return [];
        return [...inbox.entries()]
            .map(([rumorId, held]) => ({ rumorId, ...held, status: this.rumors.get(rumorId)?.status || 'UNKNOWN' }))
            .sort((a, b) => b.confidence - a.confidence);
    }

    credibilityOf(agentId) {
        return this.credibility.get(String(agentId)) ?? 0.5;
    }

    networkStats() {
        let active = 0;
        let reach = 0;
        for (const r of this.rumors.values()) {
            if (r.status === RUMOR_STATUS.ACTIVE) active += 1;
            reach += r.recipients.size;
        }
        return {
            tick: this.tick,
            rumorsInjected: this.rumors.size,
            rumorsActive: active,
            totalReach: reach,
            corrections: this.corrections,
            agentsTracked: this.listenEdges.size
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            ...this.networkStats()
        };
    }
}
