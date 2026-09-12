/**
 * packages/core/src/FrontierValleySimulation.js
 *
 * Sections 111-114 / Front C: Canonical Long-Run World Simulation & Degeneracy Detection.
 *
 * Implements the canonical "FRONTIER VALLEY" reference scenario:
 * - 3 Settlements: Northwatch (Mining/Highland), Riverbend (Farming/Valley), Oakhaven (Trade Hub).
 * - 2 Trade Corridors: HighlandPass (Dangerous, Direct) and Riverway (Safe, Scenic).
 * - 4 Factions: SettlersAlliance (Defensive), ShadowfangBandits (Predatory), WildernessNomads (Foragers), TimberWolfPack (Wildlife).
 *
 * Runs multi-seed macro simulations (100–1,000 ticks) and measures macro distributions:
 * wars, alliances, trade route failures, migrations, faction survival, population fear.
 *
 * Features WorldDegeneracyDetector to catch pathological world collapse:
 * Universal War, Universal Alliance, Permanent Stagnation, Universal Migration, Universal Panic, Infinite Wealth Explosion.
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Middleware produces advisory intents, route recommendations, and economic/affective state;
 * host engine retains 100% authority over physics, transforms, collision, and entity lifecycles.
 */

import { DeterministicRng } from './DeterministicRng.js';
import { FactionSystem, FACTION_CULTURES, ESCALATION_STAGES, INCIDENT_TYPES, casualtySeverityScale } from './FactionSystem.js';
import { CivilizationSimulationSystem } from './CivilizationSimulationSystem.js';
import { WorldSimulationSystem, ROAMING_PARTY_TYPES, ENCOUNTER_TYPES, RUMOR_TOPICS } from './WorldSimulationSystem.js';
import { RelationshipTensorSystem } from './RelationshipTensorSystem.js';
import { TradeDependencyEngine } from './TradeDependencyEngine.js';
import { SuccessionEngine } from './SuccessionEngine.js';
import { FactionGovernanceSystem, GOVERNANCE_ARCHETYPES, governanceComposure } from './FactionGovernanceSystem.js';

export const FRONTIER_VALLEY_FACTIONS = Object.freeze({
    SETTLERS: 'SettlersAlliance',
    BANDITS: 'ShadowfangBandits',
    NOMADS: 'WildernessNomads',
    WILDLIFE: 'TimberWolfPack'
});

// NEXT-38: hard backstop on host-reported trade rows (matches the
// historyLedger house cap scale). Window eviction handles the common
// case invisibly; this bounds the flood case.
export const MAX_VALLEY_TRADE_ROWS = 1000;
export const FRONTIER_VALLEY_SETTLEMENTS = Object.freeze({
    NORTHWATCH: 'Northwatch',
    RIVERBEND: 'Riverbend',
    OAKHAVEN: 'Oakhaven'
});

export const FRONTIER_VALLEY_ROUTES = Object.freeze({
    HIGHLAND_PASS: 'HighlandPass',
    RIVERWAY: 'Riverway'
});

export class FrontierValleySimulation {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.seed=424242]
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 424242;
        this.rng = new DeterministicRng(this.seed);

        this.factionSystem = new FactionSystem();
        // NEXT-80: valley-owned directed trust store so rumor corrections
        // (refutation loss, vindication reward) exercise live in encounters.
        this.relationshipSystem = new RelationshipTensorSystem();
        this.civSystem = new CivilizationSimulationSystem();
        this.worldSystem = new WorldSimulationSystem({
            encounterProximityRadius: 35.0,
            // NEXT-82: was rngSeed (dead key - WorldSimulationSystem reads
            // config.seed, so every valley shared stream 1337 for rumor
            // distortion). Draw order unchanged, preserving valley determinism.
            seed: this.rng.intRange(1, 1000000)
        });
        this.currentTick = 0;
        // NEXT-16: host-reported inter-faction trade flow. The host owns
        // goods and movement; the valley records an advisory ledger so
        // trade-dependent victims cool their conflict grievances below.
        this.tradeLedger = [];
        this.dependency = new TradeDependencyEngine();
        // R19: valley-owned succession engine (stateless resolve) plus
        // war-attrition episode state. Consecutive hot ticks accumulate;
        // any cold tick resets and re-arms, bounding one succession per
        // war episode. Snapshotted explicitly below.
        this.succession = new SuccessionEngine();
        this.attrition = { hotTicks: 0, rearmed: true, threshold: 25 };
        // NEXT-95: exoneration ledger. Maps rumorId -> [{ perceiver, subject }]
        // pairs biased by RUMOR_HEARSAY, plus the set of rumorIds already
        // retracted, so a refuted subject rumor unwinds exactly what it
        // caused (once). Serialized with the snapshot for fork fidelity.
        this._hearsayLedger = new Map();
        // NEXT-96: route-danger exoneration. Maps rumorId -> [routeIds]
        // biased by RUMOR_THREAT hearsay, retracted on refutation.
        this._hearsayRoutes = new Map();
        this._exoneratedRumors = new Set();
        this.macroMetrics = {
            warsDeclared: 0,
            alliancesFormed: 0,
            // NEXT-19: live (non-sticky) phase state. The sticky flags above
            // record that war/alliance ever happened; these record whether
            // the watched pairs are at war/allied RIGHT NOW, so peace-making
            // interventions can score.
            warsActive: 0,
            alliancesActive: 0,
            routeFailures: 0,
            reroutesTriggered: 0,
            migrations: 0,
            panicIncidents: 0,
            totalEncounters: 0,
            deliveries: 0,
            // NEXT-62: moved volume alongside event counts. Counts measure
            // loop liveness; volume measures throughput (they divorce when
            // sinks throttle to crumbs).
            deliveredVolume: 0,
            fearSum: 0.0,
            fearSamples: 0
        };
        // R16: war-displacement scenario params (designer-overridable via
        // options.displacement). While settler-bandit war is hot, the
        // frontier source sheds a fixed cohort share on cadence to the
        // most food-secure settlement; arrivals eat the R12 arrival meal.
        // Cadence keys off currentTick, so snapshots carry no new fields.
        this.displacement = {
            source: FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH,
            everyTicks: 10,
            rate: 0.05,
            floor: 5,
            meal: 0.5,
            ...(options.displacement || {})
        };
        // R17: scarcity-unrest params (designer-overridable via
        // options.scarcity). Settlements below perCapitaThreshold food
        // per mouth stress nearby groups (hunger unrest). Pure function
        // of existing stocks/positions: no new snapshot fields.
        this.scarcity = {
            perCapitaThreshold: 0.25,
            radius: 40,
            dreadPerTick: 0.05,
            // R28: hungry towns lose faith per stressed settlement tick.
            cohesionErosionPerTick: 0.002,
            ...(options.scarcity || {})
        };
        // R21: directive-consumption kill-switch (ablation and legacy
        // comparison). Default on; snapshotted below so forks inherit it.
        this.directiveConsumption = options.directiveConsumption !== false;
        // R30: stand-down relief knob (designer-overridable via
        // options.standDown). Fractured councils cool their grievance by
        // this much per GOVERNANCE_STAND_DOWN. Default 0.10 mirrors the
        // RUMOR_HEARSAY rung; 0 disables cooling (ablation). Snapshotted
        // below so forks inherit it.
        this.standDown = {
            relief: 0.10,
            ...(options.standDown || {})
        };

        this._setupFrontierValley(options);
    }

    /**
     * Applies one designer setup-stance override (NEXT-43). Both factions
     * must be registered; numeric patch fields are clamped to [0,1].
     * @param {object} [override={}]
     * @param {string} override.source source faction id
     * @param {string} override.target target faction id
     * @param {object} [override.patch={}] stance fields to set
     */
    applySetupStance(override = {}) {
        const source = String(override.source ?? '');
        const target = String(override.target ?? '');
        if (!this.factionSystem.getFaction(source) || !this.factionSystem.getFaction(target)) {
            throw new Error('UNKNOWN_SETUP_FACTION');
        }
        const stance = this.factionSystem.getBilateralStance(source, target);
        if (!stance) throw new Error('UNKNOWN_SETUP_FACTION');
        const clamp = (v) => typeof v !== 'number' || !Number.isFinite(v) ? null : Math.min(1, Math.max(0, v));
        for (const field of ['grievance', 'trust', 'fear', 'territorialPressure', 'economicPressure', 'informationConfidence']) {
            const v = clamp(override.patch?.[field]);
            if (v !== null) stance[field] = v;
        }
        return stance;
    }

    _setupFrontierValley(options = {}) {
        this.settlements = new Map();

        // 1. Setup Settlements in CivilizationSystem (Nodes) and Local Map
        const settlementsData = [
            {
                id: FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH,
                position: { x: 50, y: 0, z: 200 },
                population: 45,
                wealth: 50.0,
                resources: { food: 20.0, timber: 80.0, ore: 60.0 }
            },
            {
                id: FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND,
                position: { x: 200, y: 0, z: 50 },
                population: 65,
                wealth: 45.0,
                resources: { food: 95.0, timber: 25.0, ore: 15.0 }
            },
            {
                id: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
                position: { x: 300, y: 0, z: 300 },
                population: 90,
                wealth: 85.0,
                resources: { food: 50.0, timber: 40.0, ore: 30.0 }
            }
        ];
        // R24: designer setup-stock tuning (closes the R23 red-team gap:
        // hardcoded stocks kept the migration-to-scarcity chain
        // sub-threshold with no designer recourse). Per-settlement
        // population/wealth/resource overrides; finite numbers clamp at
        // zero, non-numeric garbage is ignored, unknown settlement ids
        // throw (NEXT-43 convention). Positions stay canonical.
        const setupTunings = options.settlements || {};
        for (const [id, patch] of Object.entries(setupTunings)) {
            const target = settlementsData.find((s) => s.id === id);
            if (!target) throw new Error('UNKNOWN_SETUP_SETTLEMENT');
            if (!patch || typeof patch !== 'object') continue;
            const nonNeg = (v) => typeof v !== 'number' || !Number.isFinite(v) ? null : Math.max(0, v);
            const pop = nonNeg(patch.population);
            if (pop !== null) target.population = Math.floor(pop);
            const wealth = nonNeg(patch.wealth);
            if (wealth !== null) target.wealth = wealth;
            if (patch.resources && typeof patch.resources === 'object') {
                for (const commodity of ['food', 'timber', 'ore']) {
                    const qty = nonNeg(patch.resources[commodity]);
                    if (qty !== null) target.resources[commodity] = qty;
                }
            }
        }

        for (const s of settlementsData) {
            this.settlements.set(s.id, s);
            this.civSystem.registerNode(s.id, {
                name: s.id,
                position: s.position,
                market: s.resources
            });
        }

        // NEXT-45: settlement production (valley fiction, same authority
        // story as the caravan flow). Rates are model params, caps are
        // storage bounds: growth is bounded by construction, never by luck.
        this.production = {
            [FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH]: { food: { rate: 0.020, cap: 20.0 } },
            [FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND]: { timber: { rate: 0.020, cap: 25.0 } }
        };

        // NEXT-45: storage caps bound every sink (Oakhaven would otherwise
        // accumulate without limit — the LXXII infinite-wealth watch).
        // Delivery stalls honestly when the destination is full, symmetric
        // with the empty-origin stall. Caps are scenario params.
        this.storageCaps = {
            [FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH]: { food: 20.0 },
            [FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND]: { timber: 25.0 },
            [FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN]: { food: 150.0, timber: 120.0 }
        };
        // NEXT-45: sink upkeep (population consumption). Below mean inflow
        // so the flow oscillates perpetually instead of satiation-stalling;
        // above zero so sinks cannot inflate without bound even uncapped.
        this.upkeep = {
            [FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN]: { food: 0.012, timber: 0.012 }
        };
        // 2. Setup Trade Routes in CivilizationSystem
        this.civSystem.registerRoute(FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS, {
            fromNodeId: FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH,
            toNodeId: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
            distance: 180.0,
            baseSecurity: 0.65,
            waypoints: [{ x: 50, y: 0, z: 200 }, { x: 175, y: 0, z: 250 }, { x: 300, y: 0, z: 300 }]
        });

        this.civSystem.registerRoute(FRONTIER_VALLEY_ROUTES.RIVERWAY, {
            fromNodeId: FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND,
            toNodeId: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
            distance: 120.0,
            baseSecurity: 0.90,
            waypoints: [{ x: 200, y: 0, z: 50 }, { x: 250, y: 0, z: 175 }, { x: 300, y: 0, z: 300 }]
        });

        // 3. Register Factions in FactionSystem
        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.SETTLERS,
            culture: FACTION_CULTURES.HONORABLE,
            militaryReadiness: 0.70,
            economicStockpile: 0.65
        });

        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.BANDITS,
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.55,
            economicStockpile: 0.30
        });

        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.NOMADS,
            culture: FACTION_CULTURES.ISOLATIONIST,
            militaryReadiness: 0.40,
            economicStockpile: 0.45
        });

        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.WILDLIFE,
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.35,
            economicStockpile: 0.20
        });
        // R20: valley governments. Settlers and nomads deliberate by
        // council; bandits follow a single warlord (autocracy), so a
        // fallen warlord headless-falls their deliberation (R15) until
        // succession enthrones an heir (R19). Wildlife is hunger, not
        // government (NOW-16 spirit: no deliberation).
        this.governance = new Map([
            [FRONTIER_VALLEY_FACTIONS.SETTLERS, new FactionGovernanceSystem(
                FRONTIER_VALLEY_FACTIONS.SETTLERS, GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS)],
            [FRONTIER_VALLEY_FACTIONS.BANDITS, new FactionGovernanceSystem(
                FRONTIER_VALLEY_FACTIONS.BANDITS, GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT,
                { leader: { fear: 0.2, anger: 0.8, bravery: 0.7, neuroticism: 0.5 } })],
            [FRONTIER_VALLEY_FACTIONS.NOMADS, new FactionGovernanceSystem(
                FRONTIER_VALLEY_FACTIONS.NOMADS, GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS)]
        ]);
        const warlord = this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS);
        if (warlord && !warlord.leaderId) warlord.leaderId = `${FRONTIER_VALLEY_FACTIONS.BANDITS}.warlord`;
        // Bounded advisory trail of deliberated directives (newest last).
        this.governanceTrail = [];

        // Bilateral relations: Bandits hostile to Settlers; Nomads neutral; Wildlife predatory
        const banditStance = this.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.BANDITS
        );
        if (banditStance) {
            banditStance.grievance = 0.80;
            banditStance.fear = 0.40;
            banditStance.informationConfidence = 0.85;
            banditStance.stage = ESCALATION_STAGES.THREATEN;
        }

        const nomadStance = this.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.NOMADS
        );
        if (nomadStance) {
            nomadStance.trust = 0.60;
            nomadStance.informationConfidence = 0.50;
            nomadStance.stage = ESCALATION_STAGES.TRADE;
        }
        // NEXT-43: designer setup overrides for outcome-sweep experiments.
        // Applied after the canonical backstory so overrides win. Unknown
        // factions are rejected (same rule as recordValleyTrade): silent
        // typos must not conjure phantom bilateral state.
        for (const override of options.setupStances ?? []) {
            this.applySetupStance(override);
        }

        // 4. Setup Roaming Groups in WorldSimulationSystem with seed-based initial deployment
        const jitX = (this.rng.random() - 0.5) * 30.0;
        const jitZ = (this.rng.random() - 0.5) * 30.0;

        this.worldSystem.registerGroup('patrol_settlers_1', {
            name: 'Settler Militia Patrol',
            type: ROAMING_PARTY_TYPES.PATROL,
            factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
            memberCount: 8,
            position: { x: 120 + jitX * 0.5, y: 0, z: 120 + jitZ * 0.5 },
            waypoints: [{ x: 50, y: 0, z: 200 }, { x: 200, y: 0, z: 50 }],
            militaryStrength: 0.70,
            leaderId: 'lead_patrol_settlers'
        });

        this.worldSystem.registerGroup('caravan_merchant_1', {
            name: 'Highland Merchant Convoy',
            type: ROAMING_PARTY_TYPES.CARAVAN,
            factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
            memberCount: 5,
            position: { x: 50, y: 0, z: 200 },
            waypoints: [{ x: 175, y: 0, z: 250 }, { x: 300, y: 0, z: 300 }],
            wealth: 0.85,
            // NEXT-33: standing settlement-layer run (valley fiction, not a
            // host faction-trade report): Northwatch food to Oakhaven.
            tradeRun: {
                fromSettlement: FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH,
                toSettlement: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
                commodity: 'food',
                amount: 2.0
            },
            leaderId: 'lead_caravan_merchant_1'
        });

        this.worldSystem.registerGroup('caravan_merchant_2', {
            name: 'Riverbend Timber Run',
            type: ROAMING_PARTY_TYPES.CARAVAN,
            factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
            memberCount: 4,
            position: { x: 200 + jitX * 0.5, y: 0, z: 50 + jitZ * 0.5 },
            waypoints: [{ x: 250, y: 0, z: 150 }, { x: 300, y: 0, z: 300 }],
            wealth: 0.60,
            // NEXT-45: second standing run (Riverbend timber to Oakhaven)
            // proving multi-caravan scheduling on the same settle logic.
            tradeRun: {
                fromSettlement: FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND,
                toSettlement: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
                commodity: 'timber',
                amount: 1.5
            },
            leaderId: 'lead_caravan_merchant_2'
        });

        this.worldSystem.registerGroup('bandit_warband_1', {
            name: 'Shadowfang Ambushers',
            type: ROAMING_PARTY_TYPES.BANDITS,
            factionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
            memberCount: 6,
            position: { x: 60 + jitX, y: 0, z: 210 + jitZ },
            waypoints: [{ x: 60, y: 0, z: 210 }, { x: 175, y: 0, z: 250 }],
            militaryStrength: 0.60,
            leaderId: 'lead_bandit_warband'
        });

        this.worldSystem.registerGroup('nomad_clan_1', {
            name: 'Wilderness Foragers',
            type: ROAMING_PARTY_TYPES.NOMAD_TRIBE,
            factionId: FRONTIER_VALLEY_FACTIONS.NOMADS,
            memberCount: 12,
            position: { x: 220 + jitX * 0.7, y: 0, z: 180 + jitZ * 0.7 },
            waypoints: [{ x: 220, y: 0, z: 180 }, { x: 280, y: 0, z: 220 }],
            wealth: 0.40,
            leaderId: 'lead_nomad_clan'
        });

        this.worldSystem.registerGroup('wolf_pack_1', {
            name: 'Timber Wolf Pack',
            type: ROAMING_PARTY_TYPES.WILDLIFE_PACK,
            factionId: FRONTIER_VALLEY_FACTIONS.WILDLIFE,
            memberCount: 4,
            position: { x: 80 + jitX * 0.3, y: 0, z: 220 + jitZ * 0.3 },
            waypoints: [{ x: 80, y: 0, z: 220 }, { x: 100, y: 0, z: 240 }],
            leaderId: 'lead_wolf_pack'
        });
        // NEXT-80: stranger-neutral trust so threading the relationship
        // store reproduces the old no-store 0.5 default exactly until
        // rumor corrections (the only valley trust writer) fire.
        const leaders = [...this.worldSystem.groups.values()].map(g => g.leaderId).filter(Boolean);
        for (const s of leaders) {
            for (const t of leaders) {
                if (s !== t) this.relationshipSystem.getRelationship(s, t).trust = 0.5;
            }
        }
    }
    /**
     * Report host-observed inter-faction trade flow (NEXT-16). The host
     * owns goods, wealth, and movement; Fear AI records an advisory
     * ledger row driving dependency restraint on later conflict
     * grievances. Unknown factions are rejected: silent ledger growth
     * from typos would corrupt restraint math. NEXT-33 boundary: the
     * autonomous caravan flow settles settlement-layer deliveries only
     * and never calls this method, so faction restraint keeps its host
     * grounding (no forged inter-faction dependence).
     * @param {object} [flow={}]
     * @param {string} flow.sourceFaction exporter
     * @param {string} flow.destFaction importer
     * @param {string} [flow.commodity='food']
     * @param {number} [flow.amount=1.0]
     * @returns {object} recorded ledger row
     */
    recordValleyTrade(flow = {}) {
        const vals = Object.values(FRONTIER_VALLEY_FACTIONS);
        const source = String(flow.sourceFaction ?? '');
        const dest = String(flow.destFaction ?? '');
        if (!vals.includes(source) || !vals.includes(dest) || source === dest) {
            throw new Error('UNKNOWN_TRADE_FACTION');
        }
        const amount = typeof flow.amount === 'number' && Number.isFinite(flow.amount) && flow.amount > 0
            ? flow.amount : 1.0;
        const row = {
            tick: this.currentTick,
            sourceId: source,
            destId: dest,
            commodity: String(flow.commodity ?? 'food').slice(0, 64),
            amount
        };
        this.tradeLedger.push(row);
        // NEXT-38: bounded growth. Window eviction first: rows older than
        // the dependency window can never count again, because every read
        // passes a nowTick at or ahead of this tick (provably invisible).
        // Hard cap second, matching the historyLedger house convention:
        // lossy under flood, bounded always.
        const floor = this.currentTick - this.dependency.config.windowTicks;
        while (this.tradeLedger.length > 0 && this.tradeLedger[0].tick < floor) {
            this.tradeLedger.shift();
        }
        while (this.tradeLedger.length > MAX_VALLEY_TRADE_ROWS) {
            this.tradeLedger.shift();
        }
        return row;
    }

    /**
     * Restraint fraction for a victim faction toward a provocateur from
     * recorded trade dependence (0 when independent). Reuses the
     * TradeDependencyEngine advisory curve, so ledger math and conflict
     * math cannot drift apart.
     */
    _dependencyRestraint(victimFaction, provocateurFaction) {
        if (!victimFaction || !provocateurFaction) return 0;
        return this.dependency.advise(
            this.tradeLedger, victimFaction, provocateurFaction, 1, this.currentTick
        ).restraint;
    }

    /**
     * Settles one standing settlement-layer delivery when a caravan
     * completes its waypoint loop (NEXT-33, capped NEXT-45). The transfer
     * is min(amount, origin stock, destination space): origins floor at
     * zero, sinks stall honestly at their storage caps, totals never
     * inflate. Valley fiction for the internal reference world: it NEVER
     * writes the faction trade ledger, which stays host-reported only.
     * @param {object} group caravan group carrying tradeRun
     */
    _settleTradeDelivery(group) {
        const run = group.tradeRun;
        const from = this.civSystem.nodes.get(run.fromSettlement);
        const to = this.civSystem.nodes.get(run.toSettlement);
        if (!from || !to) return;
        const available = Number(from.market?.[run.commodity]) || 0;
        const destQty = Number(to.market?.[run.commodity]) || 0;
        const destCap = Number(this.storageCaps?.[run.toSettlement]?.[run.commodity]);
        const space = Number.isFinite(destCap) ? Math.max(0, destCap - destQty) : Infinity;
        const moved = Math.min(Number(run.amount) || 0, Math.max(0, available), space);
        if (moved <= 0) return;
        from.market[run.commodity] = available - moved;
        to.market[run.commodity] = destQty + moved;
        this.macroMetrics.deliveries = (this.macroMetrics.deliveries ?? 0) + 1;
        this.macroMetrics.deliveredVolume = (this.macroMetrics.deliveredVolume ?? 0) + moved;
        this.worldSystem.recordHistoryEvent('TRADE_DELIVERY', {
            primaryId: group.id,
            secondaryId: run.toSettlement,
            cause: 'CARAVAN_LOOP_WRAP',
            consequences: {
                commodity: run.commodity,
                amount: moved,
                from: run.fromSettlement,
                to: run.toSettlement
            }
        });
    }

    /**
     * Advisory commodity price index (NEXT-63: the trade price channel).
     * Pure read of advisory state: scarcity (sink fill vs cap) plus
     * inbound-route danger, as a 1.0-based multiplier. Hosts own currency
     * and exchange; this only advises relative expensiveness. Unknown
     * commodities read neutral-ish (danger unknown, scarcity from sink).
     * @param {string} commodity
     * @returns {number} >= 1.0 price multiplier, NaN-safe
     */
    advisoryPrice(commodity) {
        const sink = this.civSystem.nodes.get('Oakhaven');
        const cap = Number(this.storageCaps?.Oakhaven?.[commodity]);
        const stock = Number(sink?.market?.[commodity]) || 0;
        const scarcity = Number.isFinite(cap) && cap > 0 ? Math.min(1, Math.max(0, 1 - stock / cap)) : 0.5;
        const routeId = commodity === 'timber' ? FRONTIER_VALLEY_ROUTES.RIVERWAY : FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS;
        const danger = Number(this.civSystem.routes.get(routeId)?.perceivedDanger);
        const d = Number.isFinite(danger) ? Math.min(1, Math.max(0, danger)) : 0.5;
        return 1 + 0.5 * scarcity + 0.5 * d;
    }

    /**
     * Produces settlement goods each tick up to storage caps (NEXT-45).
     * Bounded by construction: min(cap, qty + rate) can never inflate
     * past cap, and unknown settlements/commodities are skipped, never
     * created. Unblocks the caravan flow from honest indefinite stall.
     */
    _produceSettlements() {
        for (const [settlementId, outputs] of Object.entries(this.production ?? {})) {
            const node = this.civSystem.nodes.get(settlementId);
            if (!node) continue;
            for (const [commodity, spec] of Object.entries(outputs)) {
                const rate = Number(spec?.rate) || 0;
                const cap = Number(spec?.cap);
                if (!(rate > 0) || !Number.isFinite(cap)) continue;
                const qty = Number(node.market?.[commodity]) || 0;
                node.market[commodity] = Math.min(cap, qty + rate);
            }
        }
        for (const [settlementId, burns] of Object.entries(this.upkeep ?? {})) {
            const node = this.civSystem.nodes.get(settlementId);
            if (!node) continue;
            for (const [commodity, rate] of Object.entries(burns)) {
                if (!(Number(rate) > 0)) continue;
                const qty = Number(node.market?.[commodity]) || 0;
                node.market[commodity] = Math.max(0, qty - Number(rate));
            }
        }
    }

    /**
     * NEXT-95: exoneration sweep. NEXT-96: also retracts route danger.
     * NEXT-97: decay-aware residuals. A refuted rumor retracts only the
     * undecayed remainder of its bias (grievance half-life 60 ticks,
     * route-danger half-life 80), so late refutations cannot manufacture
     * safety below the never-biased baseline. Legacy ledger entries
     * without a tick read as fresh (full retraction, pre-97 behavior).
     */
    _exonerateRefutedRumors() {
        // NEXT-96: union of faction-pair and route ledgers. Any refuted
        // heard rumor retracts both its posture bias and its route danger.
        // CCIR-25: iterate the exonerated set too, and check vanishing
        // BEFORE the exonerated-skip. Otherwise an exonerated-then-evicted
        // rumor keeps its ledger entries and its set id forever (rumor ids
        // are monotonic and never reused, so dropping is safe). Without
        // this, long worlds leak one set id per refuted rumor ever.
        const rids = new Set([...this._hearsayLedger.keys(), ...this._hearsayRoutes.keys(), ...this._exoneratedRumors]);
        for (const rid of rids) {
            const master = this.worldSystem.rumors.get(rid);
            if (!master) { this._hearsayLedger.delete(rid); this._hearsayRoutes.delete(rid); this._exoneratedRumors.delete(rid); continue; }
            if (this._exoneratedRumors.has(rid)) continue;
            if (master.correction && master.correction.confirmed === false) {
                const griefHalf = Number(this.factionSystem.config?.grievanceHalfLifeTicks) || 60;
                const dangerHalf = Number(this.civSystem.config?.routeDangerHalfLifeTicks) || 80;
                for (const { perceiver, subject, tick, share } of this._hearsayLedger.get(rid) ?? []) {
                    const elapsed = Math.max(0, this.currentTick - (tick ?? this.currentTick));
                    // NEXT-102: credibility shares, mirroring the route side.
                    // Legacy entries without a share retract in full.
                    const relief = 0.10 * (Number.isFinite(Number(share)) ? Number(share) : 1) * Math.pow(2, -elapsed / griefHalf);
                    this.factionSystem.recordIncident(subject, perceiver, INCIDENT_TYPES.RUMOR_EXONERATED, { rumorId: rid, relief });
                }
                for (const entry of this._hearsayRoutes.get(rid) ?? []) {
                    const routeId = entry?.routeId ?? entry;
                    const elapsed = Math.max(0, this.currentTick - ((entry?.tick) ?? this.currentTick));
                    const share = Number.isFinite(Number(entry?.share)) ? Number(entry.share) : 1;
                    const relief = 0.10 * share * Math.pow(2, -elapsed / dangerHalf);
                    this.civSystem.recordRouteIncident(routeId, 'RUMOR_EXONERATED', -relief);
                }
                this._exoneratedRumors.add(rid);
            }
        }
    }
    /**
     * R28: stressed-settlement read, shared by unrest, blame, and
     * cohesion erosion so all three see the same hunger in a tick.
     * @returns {Array} stressed settlement records
     */
    _stressedSettlements() {
        const s = this.scarcity;
        if (!s) return [];
        const threshold = Number(s.perCapitaThreshold);
        if (!Number.isFinite(threshold)) return [];
        const stressed = [];
        for (const settlement of this.settlements.values()) {
            const pop = Math.max(0, Number(settlement.population) || 0);
            if (pop <= 0) continue;
            const food = Math.max(0, Number(settlement.resources?.food) || 0);
            if (food / pop >= threshold) continue;
            stressed.push(settlement);
        }
        return stressed;
    }
    /**
     * R17: scarcity unrest. Stressed settlements stress groups inside
     * radius (hunger unrest dread on the existing threatPressure
     * driver, capped at 1). Per-capita, not absolute. Deterministic
     * spatial read, no RNG, no new state.
     * @returns {number} groups stressed this call
     */
    _applyScarcityUnrest() {
        const s = this.scarcity;
        if (!s) return 0;
        const threshold = Number(s.perCapitaThreshold);
        const radius = Math.max(0, Number(s.radius) || 0);
        const dread = Math.max(0, Number(s.dreadPerTick) || 0);
        if (!Number.isFinite(threshold) || dread <= 0) return 0;
        const stressed = this._stressedSettlements();
        if (stressed.length === 0) return 0;
        let count = 0;
        for (const group of this.worldSystem.groups.values()) {
            if (!group || !group.drivers || !group.position) continue;
            let near = false;
            for (const settlement of stressed) {
                const dx = Number(group.position.x) - Number(settlement.position?.x);
                const dz = Number(group.position.z) - Number(settlement.position?.z);
                if (!Number.isFinite(dx) || !Number.isFinite(dz)) continue;
                if (dx * dx + dz * dz <= radius * radius) { near = true; break; }
            }
            if (!near) continue;
            group.drivers.threatPressure = Math.min(1.0, (Number(group.drivers.threatPressure) || 0) + dread);
            count++;
        }
        return count;
    }
    /**
     * R19: war attrition. Consecutive SKIRMISH/ATTACK ticks on the
     * settler-bandit bilateral accumulate; any cold tick resets and
     * re-arms. At threshold, the militarily weaker side loses its
     * leader (DEATH_IN_BATTLE): SuccessionEngine resolves deterministic
     * heir-vs-challenger candidates and applySuccession lands cohesion,
     * morale, successor, splinter-risk, and policy-shift advisories on
     * the faction record. One succession per hot episode. The host
     * creates or destroys any entities. Deterministic, no RNG.
     * @returns {boolean} whether a succession resolved this tick
     */
    _attriteLeadership() {
        const a = this.attrition;
        if (!a) return false;
        const bilateral = this.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.BANDITS
        );
        const hot = !!bilateral && (bilateral.stage === ESCALATION_STAGES.ATTACK || bilateral.stage === ESCALATION_STAGES.SKIRMISH);
        if (!hot) {
            a.hotTicks = 0;
            a.rearmed = true;
            return false;
        }
        a.hotTicks++;
        const threshold = Math.max(1, Math.floor(Number(a.threshold) || 25));
        if (!a.rearmed || a.hotTicks < threshold) return false;
        a.rearmed = false;
        const settlers = this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.SETTLERS);
        const bandits = this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS);
        if (!settlers || !bandits) return false;
        const fallen = (Number(bandits.militaryReadiness) || 0) < (Number(settlers.militaryReadiness) || 0)
            ? FRONTIER_VALLEY_FACTIONS.BANDITS
            : FRONTIER_VALLEY_FACTIONS.SETTLERS;
        const fallenFaction = this.factionSystem.getFaction(fallen);
        const archetype = fallenFaction && fallenFaction.culture === FACTION_CULTURES.MILITARISTIC
            ? 'MILITARY_JUNTA'
            : 'TRIBAL_CONSENSUS';
        const report = this.succession.resolve({
            factionId: fallen,
            cause: 'DEATH_IN_BATTLE',
            archetype,
            candidates: [
                { id: `${fallen}.heir`, legitimacy: 0.8, competence: 0.5, popularity: 0.5, continuity: 0.9 },
                { id: `${fallen}.challenger`, legitimacy: 0.3, competence: 0.7, popularity: 0.6, continuity: 0.2 }
            ]
        });
        this.factionSystem.applySuccession(report);
        this.macroMetrics.successions = (Number(this.macroMetrics.successions) || 0) + 1;
        return true;
    }

    /**
     * R18: famine blame (CCVIII: faction leaders blame rivals). Stressed
     * settler settlements convertible to rival blame on cadence: one
     * RUMOR_HEARSAY incident (small grievance, no trust loss, no casus
     * belli, no exhaustion feed) from bandits toward settlers. Cadence
     * bounds the simmer so blame pressures posture without totalizing
     * on its own. Deterministic, no RNG.
     * @param {number} stressedSettlements stressed count this tick
     * @returns {boolean} whether a blame incident was recorded
     */
    _blameRivalsForFamine(stressedSettlements) {
        if (!(stressedSettlements > 0)) return false;
        if (this.currentTick % 10 !== 0) return false;
        this.factionSystem.recordIncident(
            FRONTIER_VALLEY_FACTIONS.BANDITS,
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            INCIDENT_TYPES.RUMOR_HEARSAY,
            { famineBlame: true, stressedSettlements }
        );
        return true;
    }

    /**
     * R28: famine erodes settler cohesion. Each stressed settler town
     * costs the SettlersAlliance faith per tick (hungry towns blame
     * their own council too, not just rivals). Floor 0. Succession can
     * restore cohesion through rally (R19); no passive recovery, so
     * wars leave scars. Valley towns are settler towns; roaming
     * factions erode through attrition instead (R19). Deterministic.
     * @returns {boolean} whether cohesion moved this tick
     */
    _erodeSettlerCohesion() {
        const stressed = this._stressedSettlements();
        if (stressed.length === 0) return false;
        const settlers = this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.SETTLERS);
        if (!settlers) return false;
        const rate = Math.max(0, Number(this.scarcity?.cohesionErosionPerTick) || 0);
        if (!(rate > 0)) return false;
        const current = Number(settlers.cohesion);
        settlers.cohesion = Math.max(0, (Number.isFinite(current) ? current : 0.7) - rate * stressed.length);
        return true;
    }

    /**
     * R16: war displacement. While the settler-bandit bilateral sits at
     * SKIRMISH/ATTACK, the frontier source sheds a cohort share on
     * cadence to the most food-secure settlement. Mouths are conserved
     * (source loss equals destination gain) and arrivals eat the R12
     * arrival meal from the destination stockpile, so flight dilutes
     * downstream food security. Deterministic: cadence keys off
     * currentTick, ties break by fixed settlement order, no RNG.
     * @returns {boolean} whether a cohort moved
     */
    _displaceWarRefugees() {
        const d = this.displacement;
        if (!d) return false;
        const every = Math.max(1, Math.floor(Number(d.everyTicks) || 10));
        if (this.currentTick % every !== 0) return false;
        const bilateral = this.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.BANDITS
        );
        if (!bilateral || (bilateral.stage !== ESCALATION_STAGES.ATTACK && bilateral.stage !== ESCALATION_STAGES.SKIRMISH)) return false;
        const source = this.settlements.get(d.source);
        const floor = Math.max(0, Math.floor(Number(d.floor) || 0));
        if (!source || source.population <= floor) return false;
        let dest = null;
        for (const id of [FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH, FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND, FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN]) {
            if (id === source.id) continue;
            const s = this.settlements.get(id);
            if (!s) continue;
            if (!dest || (Number(s.resources?.food) || 0) > (Number(dest.resources?.food) || 0)) dest = s;
        }
        if (!dest) return false;
        const rate = Math.min(1, Math.max(0, Number(d.rate) || 0));
        const moved = Math.min(Math.max(1, Math.floor(source.population * rate)), source.population - floor);
        if (moved <= 0) return false;
        source.population -= moved;
        dest.population += moved;
        const meal = moved * (Number(d.meal) || 0);
        dest.resources.food = Math.max(0, Number(((Number(dest.resources?.food) || 0) - meal).toFixed(3)));
        // NEXT-62 convention: volume, not event count.
        this.macroMetrics.migrations += moved;
        return true;
    }

    /**
     * R21: governance composure of a valley faction (pure, trailless).
     * Reads the same live faction record the deliberation path uses and
     * scales casualty-fuel severity by conviction: whole governments
     * fight at full strength, split councils at half, headless
     * autocracies at a quarter. Returns 1.0 when directive consumption
     * is disabled, for unknown factions, or on garbage (legacy-safe).
     * @param {string} factionId inflicting faction
     * @returns {number} severity multiplier in { 0.25, 0.5, 1.0 }
     */
    _composureScale(factionId) {
        if (this.directiveConsumption === false) return 1.0;
        const gov = this.governance ? this.governance.get(factionId) : null;
        if (!gov) return 1.0;
        const faction = this.factionSystem.getFaction(factionId);
        if (!faction) return 1.0;
        return governanceComposure({
            splinterRisk: faction.splinterRisk,
            cohesion: faction.cohesion,
            leaderVacant: !faction.leaderId,
            archetype: gov.archetype
        }).scale;
    }

    /**
     * R20: deliberate one incident through a valley government's live
     * faction state (NOW-16 style: unit-testable in isolation). Reads
     * splinterRisk, cohesion, and leader vacancy off the faction record
     * (R19 succession aftermath), so fractured governments step down
     * (R15) and headless autocracies fall to OBSERVE. Appends a bounded
     * advisory trail entry and counts deliberations/fractures. Factions
     * without governments (wildlife) return null. Deterministic.
     * @param {string} factionId deliberating faction
     * @param {object} incident { type, severity, targetFactionId }
     * @returns {object|null} deliberation result
     */
    _deliberateGovernance(factionId, incident = {}) {
        const gov = this.governance ? this.governance.get(factionId) : null;
        if (!gov) return null;
        const faction = this.factionSystem.getFaction(factionId);
        const other = incident.targetFactionId ? this.factionSystem.getFaction(incident.targetFactionId) : null;
        const myMil = Number(faction?.militaryReadiness) || 0;
        const theirMil = Number(other?.militaryReadiness) || 0;
        const rawRisk = Number(faction?.splinterRisk);
        const splinterRisk = Number.isFinite(rawRisk) ? Math.max(0, Math.min(1, rawRisk)) : 0;
        const rawCohesion = Number(faction?.cohesion);
        const cohesion = Number.isFinite(rawCohesion) ? Math.max(0, Math.min(1, rawCohesion)) : 1;
        const leaderVacant = !faction?.leaderId;
        const result = gov.deliberateIncident(
            { type: incident.type, severity: incident.severity, targetFactionId: incident.targetFactionId },
            {
                powerRatio: theirMil > 0 ? myMil / theirMil : 1.0,
                splinterRisk,
                cohesion,
                leaderVacant
            }
        );
        // Input-based fracture flag (mirrors the R15 gates, not string
        // matching): vacant autocracy, or split council.
        const fractured = (leaderVacant && gov.archetype === GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT)
            || splinterRisk >= 0.5 || cohesion <= 0.35;
        this.governanceTrail.push({
            tick: this.currentTick,
            factionId,
            incidentType: incident.type ?? 'UNKNOWN',
            directive: result.directive,
            rationale: result.rationale,
            fractured,
            steppedDown: result.steppedDown === true
        });
        if (this.governanceTrail.length > 100) {
            this.governanceTrail.splice(0, this.governanceTrail.length - 100);
        }
        this.macroMetrics.governanceDeliberations = (Number(this.macroMetrics.governanceDeliberations) || 0) + 1;
        if (fractured) {
            this.macroMetrics.governanceFractures = (Number(this.macroMetrics.governanceFractures) || 0) + 1;
        }
        // R29: close the exhaustion loop. A council that steps its own
        // war posture down cools its grudge a rung (war-weariness made
        // mechanical). Advisory faction state only; deterministic.
        // No target (or unknown target) deliberations only trail.
        // R30: relief amount is the designer-tunable standDown.relief
        // (default 0.10); the incident case clamps and NaN-guards it.
        if (result.steppedDown === true && typeof incident.targetFactionId === 'string' && incident.targetFactionId) {
            this.factionSystem.recordIncident(
                incident.targetFactionId,
                factionId,
                INCIDENT_TYPES.GOVERNANCE_STAND_DOWN,
                { directive: result.directive, steppedDown: true, relief: Number(this.standDown?.relief) }
            );
        }
        return result;
    }

    /**
     * Maps live encounters to route danger, group threat pressure, and
     * faction incidents. Extracted (NOW-16) so the mapping is unit-testable
     * with synthetic encounters; advance() calls it once per tick.
     * Wildlife predation never feeds faction grievances: animal hunger is
     * not faction warfare.
     * @param {Array<object>} encounters
     */
    _recordEncounterConsequences(encounters) {
        this._exonerateRefutedRumors();
        for (const enc of encounters) {
            const gA = this.worldSystem.groups.get(enc.partyAId);
            const gB = this.worldSystem.groups.get(enc.partyBId);
            const fA = gA?.factionId;
            const fB = gB?.factionId;
            const bandit = fA === FRONTIER_VALLEY_FACTIONS.BANDITS ? fA : (fB === FRONTIER_VALLEY_FACTIONS.BANDITS ? fB : null);
            const victim = bandit === fA ? fB : fA;
            const civilized = victim === FRONTIER_VALLEY_FACTIONS.SETTLERS || victim === FRONTIER_VALLEY_FACTIONS.NOMADS;
            if (enc.advisoryResolution === 'COMBAT_ENGAGEMENT') {
                // Combat raises regional danger and increases tension
                this.civSystem.recordRouteIncident(FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS, 'AMBUSH', 0.25);
                if (gA && gA.drivers) gA.drivers.threatPressure = Math.min(1.0, gA.drivers.threatPressure + 0.35);
                if (bandit && civilized) {
                    // NEXT-16: a victim that depends on the provocateur's
                    // faction cools its grudge (grievance scaled, facts kept).
                    const restraint = this._dependencyRestraint(victim, bandit);
                    // R31: contest-scaled raid fuel. Strength shares are
                    // needed for both the raid and the fight-back below,
                    // so compute once here.
                    const victimGroup = victim === fA ? gA : gB;
                    const banditGroup = bandit === fA ? gA : gB;
                    const vStr = Number(victimGroup?.militaryStrength) || 0;
                    const bStr = Number(banditGroup?.militaryStrength) || 0;
                    const totalStr = vStr + bStr;
                    const victimShare = totalStr > 0 ? vStr / totalStr : 0.5;
                    // NEXT-56: shared map; sweepable via sim.severityParams.
                    const sevP = this.severityParams ?? {};
                    // NEXT-55 precedent: fuel scales with the INFLICTER's
                    // share. An overmatching raid is a salient atrocity
                    // (full fuel); a raid broken on strong escorts is a
                    // footnote (floor). Missing readings split evenly.
                    const raidSeverity = casualtySeverityScale(
                        totalStr > 0 ? bStr / totalStr : 0.5, sevP.floor, sevP.knee);
                    this.factionSystem.recordIncident(bandit, victim, INCIDENT_TYPES.RAID_CONFIRMED, { encounter: enc.encounterId ?? null, restraint, severity: raidSeverity });
                    // R20: the victim government deliberates the raid
                    // through live faction state (advisory trail).
                    this._deliberateGovernance(victim, { type: 'RAID_CONFIRMED', severity: 0.7, targetFactionId: bandit });
                    // NEXT-44: the victim fought back, so the raiders bled
                    // too. Symmetric restraint: dependence cools both ways.
                    // NEXT-48: mauling-vs-scuffle differentiation. The
                    // fight-back casualty severity scales with the victim's
                    // strength share (missing strength reads as unarmed):
                    // parity or better mauls (1.0), an unarmed caravan
                    // scuffles (0.25 floor). Per-incident fuel, not the
                    // ladder: the reverse ceiling still holds (less fuel).
                    // R21: divided victims fight back weakly: casualty fuel
                    // scales by the inflicter's governance composure.
                    const fightSeverity = casualtySeverityScale(victimShare, sevP.floor, sevP.knee)
                        * this._composureScale(victim);
                    const backRestraint = this._dependencyRestraint(bandit, victim);
                    this.factionSystem.recordIncident(victim, bandit, INCIDENT_TYPES.SKIRMISH_CASUALTY, { encounter: enc.encounterId ?? null, restraint: backRestraint, severity: fightSeverity });
                    // R20: the bandit warlord deliberates the bloody nose.
                    this._deliberateGovernance(bandit, { type: 'SKIRMISH_CASUALTY', severity: 0.55, targetFactionId: victim });
                }
                // NEXT-44: retaliatory fuel. Border-skirmish combat (never
                // bandit-initiated: that path attributes blame above) bleeds
                // both sides, so each faction records SKIRMISH_CASUALTY
                // against the other. Self-limiting by construction: Context 2
                // requires an already-hot stage, so retaliation deepens
                // ongoing wars but cannot start them. Wildlife excluded
                // (NOW-16: animal hunger is not faction warfare).
                const W = FRONTIER_VALLEY_FACTIONS.WILDLIFE;
                if (enc.encounterType === ENCOUNTER_TYPES.BORDER_SKIRMISH && fA && fB && fA !== fB && fA !== W && fB !== W) {
                    // NEXT-55: one-sided massacres fuel asymmetrically. Each
                    // direction scales with the INFLICTER's strength share
                    // (same 0.25-floor/parity-knee map as the NEXT-48
                    // fight-back): the mauled side grieves fully, the mauler
                    // barely notices the scuffle. Parity stays symmetric.
                    const aStr = Number(gA?.militaryStrength) || 0;
                    const bStr = Number(gB?.militaryStrength) || 0;
                    const sevP = this.severityParams ?? {};
                    // R21: each side's fuel scales by its own governance
                    // composure: fractured factions maul with less conviction.
                    const sevFor = (inf, vic, inflicter) => ((inf + vic) > 0
                        ? casualtySeverityScale(inf / (inf + vic), sevP.floor, sevP.knee)
                        : 0.5) * this._composureScale(inflicter);
                    this.factionSystem.recordIncident(fA, fB, INCIDENT_TYPES.SKIRMISH_CASUALTY, { encounter: enc.encounterId ?? null, severity: sevFor(aStr, bStr, fA) });
                    this.factionSystem.recordIncident(fB, fA, INCIDENT_TYPES.SKIRMISH_CASUALTY, { encounter: enc.encounterId ?? null, severity: sevFor(bStr, aStr, fB) });
                }
            } else if (enc.advisoryResolution === 'EXTORTION_PAID') {
                if (gA && gA.drivers) gA.drivers.threatPressure = Math.min(1.0, gA.drivers.threatPressure + 0.15);
                if (gB && gB.drivers) gB.drivers.threatPressure = Math.min(1.0, gB.drivers.threatPressure + 0.15);
                // NOW-16: paid tribute still provokes: the victim pays but
                // remembers who demanded it (smaller than a raid).
                if (bandit && civilized) {
                    const restraint = this._dependencyRestraint(victim, bandit);
                    this.factionSystem.recordIncident(bandit, victim, INCIDENT_TYPES.PROVOCATION, { encounter: enc.encounterId ?? null, restraint });
                    // R20: the victim government deliberates the shakedown.
                    this._deliberateGovernance(victim, { type: 'PROVOCATION', severity: 0.4, targetFactionId: bandit });
                }
            }
            // NEXT-85: heard (not fought) threats raise ADVISORY route danger
            // at hearsay weight. Combat already logged 0.25 on the pass
            // above, so combat encounters skip this branch. Hearsay danger
            // decays without reinforcement via the civ danger decay.
            // NEXT-91: danger lands on routes nearest each heard rumor's
            // originLocation (threat site), not the hearing site. Rumors
            // without usable origins fall back to the hearing site; one
            // incident per route per encounter (no per-rumor spam).
            if (enc.heardThreatRumor && enc.advisoryResolution !== 'COMBAT_ENGAGEMENT') {
                const routes = new Set();
                // CCIR-27: settled rumors (host-refuted) contribute nothing.
                // Re-hearing known-false claims biased again with no further
                // retraction (exonerated-once), ratcheting posture and danger
                // without bound. Unknown masters count as live (old path).
                const isSettled = (id) => {
                    const m = this.worldSystem.rumors.get(id);
                    return m?.correction != null && m.correction.confirmed === false;
                };
                const heardIds = enc.heardThreatRumorIds ?? [];
                const liveIds = heardIds.filter((id) => !isSettled(id));
                const allSettled = heardIds.length > 0 && liveIds.length === 0;
                if (!allSettled) {
                // NEXT-93: faction-attributed menace also biases posture.
                // WAR_DECLARED / FACTION_BETRAYAL rumors naming a subject
                // faction (own-faction subjects excluded). One pair bias
                // per encounter, split into credibility shares per rumor
                // (NEXT-102: pair key -> { perceiver, subject, rids }).
                const pairContrib = new Map();
                // NEXT-99 reader, hoisted for NEXT-102: mean held
                // credibility across both hearing parties (neutral 0.5
                // when neither holds the rumor).
                const credOf = (id) => {
                    const held = [gA, gB].map((gp) => gp?.knownRumors?.get(id)?.credibility);
                    const known = held.filter((c) => Number.isFinite(Number(c)));
                    if (known.length === 0) return 0.5;
                    return known.reduce((a, b) => a + Number(b), 0) / known.length;
                };
                for (const rid of liveIds) {
                    const master = this.worldSystem.rumors.get(rid);
                    const o = master?.originLocation;
                    // NEXT-101: unprovided origins are missing data, not a
                    // threat at the map origin. Skip them here; the empty
                    // routes set below falls back to the hearing site.
                    // Legacy masters without the flag keep literal routing.
                    if (o && master?.originProvided !== false && Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.z))) {
                        routes.add(this._nearestRouteTo(o));
                    }
                    const subject = master?.subjectFactionId;
                    if ((master?.topic === RUMOR_TOPICS.WAR_DECLARED || master?.topic === RUMOR_TOPICS.FACTION_BETRAYAL) && subject) {
                        for (const g of [gA, gB]) {
                            const f = g?.factionId;
                            if (f && f !== subject) {
                                // NEXT-102: every contributing rumor shares
                                // the pair bias; the incident below still
                                // fires once per pair per encounter.
                                if (!pairContrib.has(f + '>' + subject)) {
                                    pairContrib.set(f + '>' + subject, { perceiver: f, subject, rids: [] });
                                }
                                const seen = pairContrib.get(f + '>' + subject).rids;
                                // Same-faction hearing parties share the pair:
                                // one entry per rumor, not per party.
                                if (!seen.includes(rid)) seen.push(rid);
                            }
                        }
                    }
                }
                // NEXT-102: fire each pair bias once, ledgering credibility
                // shares per contributing rumor (bias behavior unchanged).
                for (const { perceiver, subject, rids } of pairContrib.values()) {
                    this.factionSystem.recordIncident(subject, perceiver, INCIDENT_TYPES.RUMOR_HEARSAY, {
                        encounter: enc.encounterId ?? null, rumorId: rids[0]
                    });
                    const total = rids.reduce((a, id) => a + credOf(id), 0) || 1;
                    for (const rid of rids) {
                        if (!this._hearsayLedger.has(rid)) this._hearsayLedger.set(rid, []);
                        this._hearsayLedger.get(rid).push({ perceiver, subject, tick: this.currentTick, share: credOf(rid) / total });
                    }
                }
                if (routes.size === 0) routes.add(this._nearestRouteTo(gA?.position));
                for (const routeId of routes) {
                    this.civSystem.recordRouteIncident(routeId, 'RUMOR_THREAT', 0.10);
                    // NEXT-96: remember which routes this hearing biased,
                    // per rumor, so refutation retracts them (once each).
                    // NEXT-97: stamp the bias tick for decay-aware retraction.
                    for (const rid of liveIds) {
                        if (!this._hearsayRoutes.has(rid)) this._hearsayRoutes.set(rid, []);
                        const seen = this._hearsayRoutes.get(rid);
                        // NEXT-98: encounter-level bias is shared across all
                        // rumors heard together (one +0.10, not one each).
                        // NEXT-99: shares follow heard credibility (hoisted
                        // credOf above); missing instances stay equal.
                        const ids = liveIds;
                        const total = ids.reduce((a, id) => a + credOf(id), 0) || 1;
                        const share = credOf(rid) / total;
                        if (!seen.some((e) => e.routeId === routeId)) seen.push({ routeId, tick: this.currentTick, share });
                    }
                }
            }
            }
        }
    }
    /**
     * NEXT-85: route nearest a hearing site by waypoint geometry.
     * Falls back to Highland Pass when positions or waypoints are missing
     * (matches the pre-existing combat coarseness instead of crashing).
     */
    _nearestRouteTo(position) {
        let best = FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS;
        let bestDist = Infinity;
        const px = Number(position?.x);
        const pz = Number(position?.z);
        if (!Number.isFinite(px) || !Number.isFinite(pz)) return best;
        for (const route of this.civSystem.routes.values()) {
            if (!Array.isArray(route.waypoints)) continue;
            for (const wp of route.waypoints) {
                const dx = Number(wp?.x) - px;
                const dz = Number(wp?.z) - pz;
                if (!Number.isFinite(dx) || !Number.isFinite(dz)) continue;
                const d = dx * dx + dz * dz;
                if (d < bestDist) { bestDist = d; best = route.id; }
            }
        }
        return best;
    }

    /**
     * Advances the canonical simulation by a specified number of ticks.
     * @param {number} ticks
     * @returns {Object} Macro summary metrics
     */
    advance(ticks = 1, { hooks = null } = {}) {
        for (let i = 0; i < ticks; i++) {
            this.currentTick++;

            // Host game moves traveling groups along their waypoints
            for (const group of this.worldSystem.groups.values()) {
                if (group.state === 'TRAVELING' && group.waypoints.length > 0) {
                    const targetWp = group.waypoints[group.currentWaypointIndex % group.waypoints.length];
                    const dx = targetWp.x - group.position.x;
                    const dz = targetWp.z - group.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist > 5.0) {
                        const step = Math.min(dist, 3.5);
                        group.position.x += (dx / dist) * step;
                        group.position.z += (dz / dist) * step;
                    } else {
                        const nextIdx = this.worldSystem.advanceWaypoint(group.id);
                        // NEXT-33: caravan loop-wrap settles one standing
                        // settlement-layer delivery (goods move, conserved).
                        if (nextIdx === 0 && group.type === ROAMING_PARTY_TYPES.CARAVAN && group.tradeRun) {
                            this._settleTradeDelivery(group);
                        }
                    }
                }
            }

            // NEXT-45: settlement production before consumption/delivery.
            this._produceSettlements();

            // 1. Advance Civ System (trade, resource flows)
            this.civSystem.advanceSimulation(1);

            // 2. Advance World System (movement, encounters, rumors)
            this.worldSystem.tick(1.0, { factionSystem: this.factionSystem, relationshipTensorSystem: this.relationshipSystem });
            const encounters = this.worldSystem.activeEncounters || [];
            this.macroMetrics.totalEncounters += encounters.length;
            this._recordEncounterConsequences(encounters);

            // 3. Advance Faction Escalation
            this.factionSystem.advanceTick(1);
            // NOW-14: run the escalation state machine every tick. Before
            // this, stages were initialized once and never re-derived, so
            // wars could never break out no matter how many raids occurred.
            this.factionSystem.evaluateStance(FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS);
            this.factionSystem.evaluateStance(FRONTIER_VALLEY_FACTIONS.BANDITS, FRONTIER_VALLEY_FACTIONS.SETTLERS);
            this.factionSystem.evaluateStance(FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.NOMADS);
            this.factionSystem.evaluateStance(FRONTIER_VALLEY_FACTIONS.NOMADS, FRONTIER_VALLEY_FACTIONS.SETTLERS);
            for (const route of this.civSystem.routes.values()) {
                if (route.perceivedDanger >= 0.60) {
                    this.macroMetrics.routeFailures++;
                }
            }

            // Sample fear across groups
            for (const group of this.worldSystem.groups.values()) {
                const fear = group.drivers?.threatPressure ?? 0.0;
                this.macroMetrics.fearSum += fear;
                this.macroMetrics.fearSamples++;
                if (fear >= 0.60) {
                    this.macroMetrics.panicIncidents++;
                }
            }
            // Check bilateral escalation state for wars / alliances
            const bilateral = this.factionSystem.getBilateralStance(
                FRONTIER_VALLEY_FACTIONS.SETTLERS,
                FRONTIER_VALLEY_FACTIONS.BANDITS
            );
            if (bilateral) {
                if (bilateral.stage === ESCALATION_STAGES.ATTACK || bilateral.stage === ESCALATION_STAGES.SKIRMISH) {
                    this.macroMetrics.warsDeclared = Math.max(this.macroMetrics.warsDeclared, 1);
                    this.macroMetrics.warsActive = 1;
                } else {
                    this.macroMetrics.warsActive = 0;
                }
            }

            const nomadBilateral = this.factionSystem.getBilateralStance(
                FRONTIER_VALLEY_FACTIONS.SETTLERS,
                FRONTIER_VALLEY_FACTIONS.NOMADS
            );
            if (nomadBilateral && nomadBilateral.stage === ESCALATION_STAGES.ALLY) {
                this.macroMetrics.alliancesFormed = Math.max(this.macroMetrics.alliancesFormed, 1);
                this.macroMetrics.alliancesActive = 1;
            } else {
                this.macroMetrics.alliancesActive = 0;
            }
            // R16: war displacement runs after escalation state is final
            // for the tick, so flight reads the same stages as warsActive.
            this._displaceWarRefugees();
            // R17: scarcity unrest reads post-displacement stocks, so
            // flight-driven dilution bites the same tick it lands.
            const stressedSettlements = this._applyScarcityUnrest();
            // R18: famine blame turns stressed settlements into rival
            // blame (CCVIII: faction leaders blame rivals).
            this._blameRivalsForFamine(stressedSettlements);
            // R28: famine erodes settler faith after blame is laid.
            this._erodeSettlerCohesion();
            // R19: war attrition reads the same final stages; a long hot
            // episode costs the weaker side its leader (advisory state).
            this._attriteLeadership();
            // CVII sink: read-only post-tick metrics; fault-isolated.
            if (hooks && typeof hooks.emit === 'function') {
                try {
                    const summary = this.getMacroSummary();
                    hooks.emit('valley_tick', this.currentTick, { tick: this.currentTick });
                    hooks.emit('valley_fear', summary.meanPopulationFear, { tick: this.currentTick });
                    hooks.emit('valley_panics', summary.panicIncidents, { tick: this.currentTick });
                } catch {
                    // A broken sink must never break the tick.
                }
            }
        }

        return this.getMacroSummary();
    }

    /**
     * Advances the simulation by a single tick and returns event telemetry.
     * @returns {{ tick: number, meanFear: number, events: Array<Object>, summary: Object }}
     */
    tick() {
        const prevEncounters = this.macroMetrics.totalEncounters;
        const prevFailures = this.macroMetrics.routeFailures;
        const prevWars = this.macroMetrics.warsDeclared;
        const prevAlliances = this.macroMetrics.alliancesFormed;

        this.advance(1);

        const events = [];
        if (this.macroMetrics.totalEncounters > prevEncounters) {
            const activeEncounters = this.worldSystem.activeEncounters || [];
            for (const enc of activeEncounters) {
                events.push({
                    type: enc.advisoryResolution === 'COMBAT_ENGAGEMENT' ? 'PATROL_SKIRMISH' : 'HIGHWAY_AMBUSH',
                    encounterId: enc.id,
                    partyA: enc.partyAId,
                    partyB: enc.partyBId,
                    resolution: enc.advisoryResolution
                });
            }
            if (events.length === 0) {
                events.push({
                    type: 'HIGHWAY_AMBUSH',
                    tick: this.currentTick
                });
            }
        }

        if (this.macroMetrics.routeFailures > prevFailures) {
            events.push({
                type: 'CARAVAN_REROUTE',
                tick: this.currentTick,
                reason: 'HIGH_CORRIDOR_DANGER'
            });
        }

        if (this.macroMetrics.warsDeclared > prevWars) {
            events.push({
                type: 'WAR_DECLARED',
                tick: this.currentTick,
                factions: [FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS]
            });
        }

        if (this.macroMetrics.alliancesFormed > prevAlliances) {
            events.push({
                type: 'ALLIANCE_FORMED',
                tick: this.currentTick,
                factions: [FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.NOMADS]
            });
        }

        let fearTotal = 0;
        let groupCount = 0;
        for (const g of this.worldSystem.groups.values()) {
            fearTotal += g.drivers?.threatPressure ?? 0.0;
            groupCount++;
        }
        const meanFear = groupCount > 0 ? fearTotal / groupCount : 0.0;

        return {
            tick: this.currentTick,
            meanFear,
            events,
            summary: this.getMacroSummary()
        };
    }

    /**
     * Returns structured macro metrics of the simulation.
     */
    getMacroSummary() {
        const meanFear = this.macroMetrics.fearSamples > 0
            ? this.macroMetrics.fearSum / this.macroMetrics.fearSamples
            : 0.0;

        return {
            seed: this.seed,
            ticksExecuted: this.currentTick,
            warsDeclared: this.macroMetrics.warsDeclared,
            alliancesFormed: this.macroMetrics.alliancesFormed,
            warsActive: this.macroMetrics.warsActive,
            alliancesActive: this.macroMetrics.alliancesActive,
            routeFailures: this.macroMetrics.routeFailures,
            panicIncidents: this.macroMetrics.panicIncidents,
            totalEncounters: this.macroMetrics.totalEncounters,
            deliveries: this.macroMetrics.deliveries ?? 0,
            deliveredVolume: this.macroMetrics.deliveredVolume ?? 0,
            meanPopulationFear: Number(meanFear.toFixed(4)),
            settlements: {
                northwatch: this.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH)?.population ?? 0,
                riverbend: this.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND)?.population ?? 0,
                oakhaven: this.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN)?.population ?? 0
            },
            factionSurvivals: {
                settlers: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.SETTLERS)?.militaryReadiness ?? 0) > 0.1,
                bandits: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS)?.militaryReadiness ?? 0) > 0.1,
                nomads: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.NOMADS)?.militaryReadiness ?? 0) > 0.1,
                wildlife: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.WILDLIFE)?.militaryReadiness ?? 0) > 0.1
            }
        };
    }

    /**
     * Serializes complete Frontier Valley simulation state for deterministic replay and counterfactual forks.
     * @returns {Object} snapshot
     */
    getState() {
        return {
            seed: this.seed,
            currentTick: this.currentTick,
            rngState: this.rng.getState(),
            macroMetrics: { ...this.macroMetrics },
            settlements: Array.from(this.settlements.entries()).map(([id, s]) => ({
                id,
                position: { ...s.position },
                population: s.population,
                wealth: s.wealth,
                resources: { ...s.resources }
            })),
            factionSystem: this.factionSystem.getState(),
            hearsayLedger: Array.from(this._hearsayLedger.entries()),
            hearsayRoutes: Array.from(this._hearsayRoutes.entries()),
            exoneratedRumors: Array.from(this._exoneratedRumors),
            civSystem: this.civSystem.getState(),
            relationshipSystem: this.relationshipSystem.getState(),
            worldSystem: this.worldSystem.exportState(),
            // R19: attrition episode state plus succession count
            // (resolve is stateless; only the counter persists).
            attrition: { ...(this.attrition || { hotTicks: 0, rearmed: true, threshold: 25 }) },
            successionCount: this.succession ? this.succession.successions : 0,
            // R21: consumption switch so forks inherit the ablation setting.
            directiveConsumption: this.directiveConsumption !== false,
            // R22: designer scenario params (R16 displacement, R17
            // scarcity, NEXT-56 severity sweep, R30 stand-down relief) so
            // forks and counterfactuals inherit tuning instead of defaults.
            scenarioParams: {
                displacement: { ...(this.displacement || {}) },
                scarcity: { ...(this.scarcity || {}) },
                severityParams: { ...(this.severityParams || {}) },
                standDown: { ...(this.standDown || {}) }
            },
            // R20: governments carry deliberation memory (grievance,
            // current directive, leader traits); the trail is bounded.
            governance: Array.from((this.governance || new Map()).entries()).map(([id, gov]) => ({
                factionId: id,
                archetype: gov.archetype,
                leader: gov.leader ? { ...gov.leader } : null,
                councilMembers: Array.isArray(gov.councilMembers) ? gov.councilMembers.map((m) => ({ ...m })) : [],
                grievanceLevel: gov.grievanceLevel,
                currentDirective: gov.currentDirective
            })),
            governanceTrail: Array.isArray(this.governanceTrail)
                ? this.governanceTrail.slice(-100).map((e) => ({ ...e }))
                : []
        };
    }

    /**
     * Restores simulation state from a snapshot.
     * @param {Object} snapshot
     */
    setState(snapshot) {
        if (!snapshot) return;
        this.seed = snapshot.seed ?? this.seed;
        this.currentTick = snapshot.currentTick ?? 0;
        if (snapshot.rngState) {
            this.rng.setState(snapshot.rngState);
        }
        if (snapshot.macroMetrics) {
            this.macroMetrics = { ...snapshot.macroMetrics };
        }
        if (Array.isArray(snapshot.settlements)) {
            this.settlements.clear();
            for (const s of snapshot.settlements) {
                this.settlements.set(s.id, {
                    ...s,
                    position: { ...s.position },
                    resources: { ...s.resources }
                });
            }
        }
        if (snapshot.factionSystem) {
            this.factionSystem.setState(snapshot.factionSystem);
        }
        if (Array.isArray(snapshot.hearsayLedger)) {
            this._hearsayLedger = new Map(snapshot.hearsayLedger);
        }
        if (Array.isArray(snapshot.hearsayRoutes)) {
            this._hearsayRoutes = new Map(snapshot.hearsayRoutes);
        }
        if (Array.isArray(snapshot.exoneratedRumors)) {
            this._exoneratedRumors = new Set(snapshot.exoneratedRumors);
        }
        if (snapshot.civSystem) {
            this.civSystem.setState(snapshot.civSystem);
        }
        if (snapshot.relationshipSystem) {
            this.relationshipSystem.setState(snapshot.relationshipSystem);
        }
        if (snapshot.worldSystem) {
            this.worldSystem.importState(snapshot.worldSystem);
        }
        // R19: restore attrition episode state; pre-R19 snapshots keep
        // fresh episode state (garbage-safe).
        if (snapshot.attrition && typeof snapshot.attrition === 'object') {
            this.attrition = {
                hotTicks: Math.max(0, Math.floor(Number(snapshot.attrition.hotTicks)) || 0),
                rearmed: snapshot.attrition.rearmed !== false,
                threshold: Math.max(1, Math.floor(Number(snapshot.attrition.threshold)) || 25)
            };
        }
        if (this.succession && Number.isFinite(Number(snapshot.successionCount))) {
            this.succession.successions = Math.max(0, Math.floor(Number(snapshot.successionCount)));
        }
        // R21: restore the ablation switch; pre-R21 snapshots default on.
        if (typeof snapshot.directiveConsumption === 'boolean') {
            this.directiveConsumption = snapshot.directiveConsumption;
        }
        // R22: restore designer tuning; pre-R22 snapshots keep
        // constructor defaults (garbage-safe). Shallow merge so new
        // future keys default instead of vanishing.
        if (snapshot.scenarioParams && typeof snapshot.scenarioParams === 'object') {
            const sp = snapshot.scenarioParams;
            if (sp.displacement && typeof sp.displacement === 'object') {
                this.displacement = { ...this.displacement, ...sp.displacement };
            }
            if (sp.scarcity && typeof sp.scarcity === 'object') {
                this.scarcity = { ...this.scarcity, ...sp.scarcity };
            }
            if (sp.severityParams && typeof sp.severityParams === 'object') {
                this.severityParams = { ...(this.severityParams || {}), ...sp.severityParams };
            }
            if (sp.standDown && typeof sp.standDown === 'object') {
                this.standDown = { ...(this.standDown || {}), ...sp.standDown };
            }
        }
        // R20: restore governments and the bounded trail; pre-R20
        // snapshots keep fresh setup-built governments (garbage-safe).
        if (Array.isArray(snapshot.governance)) {
            for (const saved of snapshot.governance) {
                if (!saved || typeof saved.factionId !== 'string') continue;
                const gov = this.governance ? this.governance.get(saved.factionId) : null;
                if (!gov) continue;
                if (saved.leader && typeof saved.leader === 'object') gov.leader = { ...saved.leader };
                if (Array.isArray(saved.councilMembers)) gov.councilMembers = saved.councilMembers.map((m) => ({ ...m }));
                if (Number.isFinite(Number(saved.grievanceLevel))) gov.grievanceLevel = Number(saved.grievanceLevel);
                if (typeof saved.currentDirective === 'string') gov.currentDirective = saved.currentDirective;
            }
        }
        if (Array.isArray(snapshot.governanceTrail)) {
            this.governanceTrail = snapshot.governanceTrail.slice(-100).map((e) => ({ ...e }));
        }
    }

    /**
     * Clones the simulation at the current tick, producing an independent running instance.
     * @returns {FrontierValleySimulation}
     */
    fork() {
        const cloned = new FrontierValleySimulation({ seed: this.seed });
        cloned.setState(this.getState());
        return cloned;
    }
}

export class WorldDegeneracyDetector {
    /**
     * Evaluates a collection of multi-seed macro run summaries to detect pathological world degeneracy.
     * @param {Array<Object>} runSummaries
     * @returns {{
     *   degenerate: boolean,
     *   flags: Array<{ type: string, description: string, severity: 'WARN'|'CRITICAL' }>,
     *   healthyMetrics: {
     *     meanWarsPerRun: number,
     *     meanEncountersPerRun: number,
     *     meanPopulationFear: number,
     *     stabilityScore: number
     *   }
     * }}
     */
    static analyzeRuns(runSummaries) {
        if (!Array.isArray(runSummaries) || runSummaries.length === 0) {
            return {
                degenerate: true,
                flags: [{ type: 'NO_DATA', description: 'No simulation run summaries provided', severity: 'CRITICAL' }],
                healthyMetrics: { meanWarsPerRun: 0, meanEncountersPerRun: 0, meanPopulationFear: 0, stabilityScore: 0 }
            };
        }

        const flags = [];
        let totalWars = 0;
        let totalAlliances = 0;
        let totalEncounters = 0;
        let totalFear = 0;
        let totalRouteFailures = 0;

        let allWars = true;
        let allAlliances = true;
        let allZeroEncounters = true;
        let anyExtinction = false;

        for (const run of runSummaries) {
            totalWars += run.warsDeclared ?? 0;
            totalAlliances += run.alliancesFormed ?? 0;
            totalEncounters += run.totalEncounters ?? 0;
            totalFear += run.meanPopulationFear ?? 0;
            totalRouteFailures += run.routeFailures ?? 0;

            if ((run.warsDeclared ?? 0) === 0) allWars = false;
            if ((run.alliancesFormed ?? 0) === 0) allAlliances = false;
            if ((run.totalEncounters ?? 0) > 0) allZeroEncounters = false;

            // Check settlement survival
            if (run.settlements) {
                const totalPop = (run.settlements.northwatch || 0) + (run.settlements.riverbend || 0) + (run.settlements.oakhaven || 0);
                if (totalPop === 0) anyExtinction = true;
            }
        }

        const N = runSummaries.length;
        const meanFear = totalFear / N;
        const meanEncounters = totalEncounters / N;
        const meanWars = totalWars / N;

        // 1. Check Universal Permanent War
        if (allWars && meanWars > 5) {
            flags.push({
                type: 'UNIVERSAL_WAR_DEGENERACY',
                description: 'Every run ended in total relentless warfare with no peace or negotiation intervals.',
                severity: 'CRITICAL'
            });
        }

        // 2. Check Permanent Stagnation
        if (allZeroEncounters) {
            flags.push({
                type: 'PERMANENT_STAGNATION_DEGENERACY',
                description: '0 encounters occurred across all seeds; world state is static and non-interactive.',
                severity: 'CRITICAL'
            });
        }

        // 3. Check Universal Panic
        if (meanFear >= 0.90) {
            flags.push({
                type: 'UNIVERSAL_PANIC_DEGENERACY',
                description: `Mean population fear is ${meanFear.toFixed(2)} (>= 0.90), indicating universal hysteria lock.`,
                severity: 'CRITICAL'
            });
        }

        // 4. Check Universal Extinction
        if (anyExtinction) {
            flags.push({
                type: 'UNIVERSAL_MIGRATION_EXTINCTION',
                description: 'Settlement population dropped to 0 across runs, indicating runaway depopulation.',
                severity: 'WARN'
            });
        }

        const isDegenerate = flags.some(f => f.severity === 'CRITICAL');
        const stabilityScore = isDegenerate ? 0.0 : Math.max(0.0, 1.0 - (flags.length * 0.25));

        return {
            degenerate: isDegenerate,
            flags,
            healthyMetrics: {
                meanWarsPerRun: Number(meanWars.toFixed(2)),
                meanEncountersPerRun: Number(meanEncounters.toFixed(2)),
                meanPopulationFear: Number(meanFear.toFixed(4)),
                stabilityScore: Number(stabilityScore.toFixed(2))
            }
        };
    }
}
