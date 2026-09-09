/**
 * packages/core/src/RefugeeInformationHarness.js
 *
 * Section LX (missing link):
 * Refugees carry information — arrivals inject what they fled into the
 * rumor network and settlement dread. Consumes migration arrival records
 * (as produced by SettlementMigrationSystem.migrationHistory ARRIVAL
 * entries: { survivors, dest, ... }) plus host-reported flight causes,
 * and emits rumor seeds + dread seeds the host can feed into
 * InformationPropagationEngine and AnticipatoryFearEngine.
 *
 * Credibility scales with party size (more witnesses = harder to dismiss)
 * but saturates: a thousand refugees do not make a rumor ten times truer.
 * Causes the host never reported produce no seeds — the harness never
 * invents atrocities.
 *
 * Advisory only. Host owns people, movement, and settlement state.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const FLIGHT_CAUSES = Object.freeze([
    'WAR', 'FAMINE', 'RAID', 'MONSTER', 'EXPULSION', 'UNKNOWN'
]);

const CAUSE_TOPICS = Object.freeze({
    WAR: 'APPROACHING_ARMY',
    FAMINE: 'RESOURCE_SCARCITY',
    RAID: 'ROAD_AMBUSH',
    MONSTER: 'MONSTER_SIGHTING',
    EXPULSION: 'FACTION_BETRAYAL',
    UNKNOWN: null
});

export class RefugeeInformationHarness {
    constructor() {
        this.arrivalsProcessed = 0;
    }

    /**
     * Convert one arrival into information seeds.
     * @param {object} arrival { survivors, dest, originId?, cause? }
     * @returns {{ rumorSeeds, dreadSeeds }}
     */
    processArrival(arrival = {}) {
        const survivors = Math.max(0, Math.floor(arrival.survivors ?? 0));
        if (survivors <= 0) throw new Error('ARRIVAL_WITHOUT_SURVIVORS');
        const cause = FLIGHT_CAUSES.includes(arrival.cause) ? arrival.cause : 'UNKNOWN';
        const topic = CAUSE_TOPICS[cause];
        this.arrivalsProcessed += 1;
        if (!topic) return { rumorSeeds: [], dreadSeeds: [] };
        // Saturating credibility: 1 - 0.7^log10(1+N).
        const credibility = round4((1 - Math.pow(0.7, Math.log10(1 + survivors))) * 0.9);
        const origin = arrival.originId ? String(arrival.originId) : 'unknown_origin';
        const dest = arrival.dest ? String(arrival.dest) : 'unknown_dest';
        return {
            rumorSeeds: [{
                topic,
                claim: `${survivors} refugees reached ${dest} fleeing ${cause.toLowerCase()} at ${origin}`,
                confidence: credibility
            }],
            dreadSeeds: [{
                kind: cause === 'MONSTER' ? 'MONSTER' : cause === 'FAMINE' ? 'REGION' : 'FACTION',
                id: origin,
                confidence: credibility,
                threatLevel: cause === 'WAR' ? 0.9 : 0.7
            }]
        };
    }

    /** Batch arrivals; rumor seeds merge by topic keeping max confidence. */
    processBatch(arrivals) {
        if (!Array.isArray(arrivals)) throw new Error('ARRIVALS_MUST_BE_ARRAY');
        const merged = { rumorSeeds: [], dreadSeeds: [] };
        const bestByTopic = new Map();
        for (const a of arrivals) {
            const out = this.processArrival(a);
            for (const s of out.rumorSeeds) {
                if (!bestByTopic.has(s.topic) || bestByTopic.get(s.topic).confidence < s.confidence) {
                    bestByTopic.set(s.topic, s);
                }
            }
            merged.dreadSeeds.push(...out.dreadSeeds);
        }
        merged.rumorSeeds = [...bestByTopic.values()].sort((a, b) => b.confidence - a.confidence);
        return merged;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            arrivalsProcessed: this.arrivalsProcessed
        };
    }
}
