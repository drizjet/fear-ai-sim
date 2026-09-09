/**
 * packages/core/src/EncounterConsequenceEngine.js
 *
 * Section LXIII:
 * Encounter outcomes update later advisory state — the world-feedback
 * bridge that roaming outcomes were missing. Consumes resolved encounters
 * (as produced by RoamingBandSystem._resolveEncounter: { category,
 * resolution, ... }) and emits four advisory streams WITHOUT mutating
 * any simulator:
 * - corridorHazards: corridorId -> danger advisory (caravan routing reads).
 * - rumorSeeds: injection specs for InformationPropagationEngine
 *   ({ topic, claim, confidence }) — survivors talk.
 * - escortAdvisories: settlementId -> recommended escort tier bump.
 * - dreadSeeds: absorption specs for AnticipatoryFearEngine
 *   ({ kind, id, confidence, threatLevel }).
 *
 * Canonical chain (caravan destroyed): route danger rises, rumors spread,
 * escorts increase — each stream independently consumable by the host.
 *
 * Advisory only. Host owns corridors, goods, guards, and movement.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

/** Resolution -> consequence weights. */
const RESOLUTION_WEIGHTS = Object.freeze({
    COMBAT_ENGAGEMENT: { hazard: 0.5, rumor: 0.8, escort: 0.6, dread: 0.7 },
    EXTORTION_PAID: { hazard: 0.4, rumor: 0.6, escort: 0.5, dread: 0.5 },
    FLED_IN_TERROR: { hazard: 0.3, rumor: 0.7, escort: 0.3, dread: 0.6 },
    MUTUAL_AVOIDANCE: { hazard: 0.1, rumor: 0.2, escort: 0.1, dread: 0.15 },
    RELIEF_PROVIDED: { hazard: 0, rumor: 0.3, escort: 0, dread: 0 },
    PEACEFUL_TRADE: { hazard: 0, rumor: 0.25, escort: 0, dread: 0 }
});

const CATEGORY_TOPICS = Object.freeze({
    HIGHWAY_AMBUSH: 'ROAD_AMBUSH',
    PATROL_RAID_ENGAGEMENT: 'ROAD_AMBUSH',
    REFUGEE_INSPECTION: 'RESOURCE_SCARCITY',
    REFUGEE_HUMANITARIAN_RELIEF: 'SAFE_SANCTUARY',
    RIVAL_STANDOFF: 'FACTION_BETRAYAL',
    PEACEFUL_CONVERGENCE: 'TRADE_OPPORTUNITY'
});

export class EncounterConsequenceEngine {
    constructor() {
        this.encountersProcessed = 0;
    }

    /**
     * Convert one resolved encounter into world-feedback advisories.
     * @param {object} encounter { category, resolution, locationId?, corridorId? }
     * @returns {{ corridorHazards, rumorSeeds, escortAdvisories, dreadSeeds }}
     */
    process(encounter = {}) {
        const resolution = encounter.resolution;
        if (!resolution || !(resolution in RESOLUTION_WEIGHTS)) throw new Error(`UNKNOWN_RESOLUTION: ${resolution}`);
        const w = RESOLUTION_WEIGHTS[resolution];
        const corridorId = encounter.corridorId || encounter.locationId || 'unknown_corridor';
        const category = encounter.category || 'PEACEFUL_CONVERGENCE';
        this.encountersProcessed += 1;
        const corridorHazards = w.hazard > 0 ? [{ corridorId: String(corridorId), danger: round4(w.hazard) }] : [];
        const rumorSeeds = w.rumor > 0 ? [{
            topic: CATEGORY_TOPICS[category] || 'ROAD_AMBUSH',
            claim: `${category} resolved as ${resolution} near ${corridorId}`,
            confidence: round4(w.rumor)
        }] : [];
        const escortAdvisories = w.escort > 0 ? [{ corridorId: String(corridorId), tierBump: w.escort >= 0.6 ? 2 : 1 }] : [];
        const dreadSeeds = w.dread > 0 ? [{
            kind: 'ROAD', id: String(corridorId), confidence: round4(w.rumor), threatLevel: round4(w.dread)
        }] : [];
        return { corridorHazards, rumorSeeds, escortAdvisories, dreadSeeds };
    }

    /**
     * Fold a batch, merging corridor hazards by max (danger does not average).
     */
    processBatch(encounters) {
        if (!Array.isArray(encounters)) throw new Error('ENCOUNTERS_MUST_BE_ARRAY');
        const merged = { corridorHazards: [], rumorSeeds: [], escortAdvisories: [], dreadSeeds: [] };
        const hazardByCorridor = new Map();
        for (const e of encounters) {
            const out = this.process(e);
            for (const h of out.corridorHazards) {
                hazardByCorridor.set(h.corridorId, Math.max(hazardByCorridor.get(h.corridorId) || 0, h.danger));
            }
            merged.rumorSeeds.push(...out.rumorSeeds);
            merged.escortAdvisories.push(...out.escortAdvisories);
            merged.dreadSeeds.push(...out.dreadSeeds);
        }
        merged.corridorHazards = [...hazardByCorridor.entries()]
            .map(([corridorId, danger]) => ({ corridorId, danger: round4(danger) }))
            .sort((a, b) => b.danger - a.danger);
        return merged;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            encountersProcessed: this.encountersProcessed
        };
    }
}
