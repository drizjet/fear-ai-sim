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
import { WorldSimulationSystem, ROAMING_PARTY_TYPES, ENCOUNTER_TYPES } from './WorldSimulationSystem.js';
import { TradeDependencyEngine } from './TradeDependencyEngine.js';

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
        this.civSystem = new CivilizationSimulationSystem();
        this.worldSystem = new WorldSimulationSystem({
            encounterProximityRadius: 35.0,
            rngSeed: this.rng.intRange(1, 1000000)
        });
        this.currentTick = 0;
        // NEXT-16: host-reported inter-faction trade flow. The host owns
        // goods and movement; the valley records an advisory ledger so
        // trade-dependent victims cool their conflict grievances below.
        this.tradeLedger = [];
        this.dependency = new TradeDependencyEngine();
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
            militaryStrength: 0.70
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
            }
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
            }
        });

        this.worldSystem.registerGroup('bandit_warband_1', {
            name: 'Shadowfang Ambushers',
            type: ROAMING_PARTY_TYPES.BANDITS,
            factionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
            memberCount: 6,
            position: { x: 60 + jitX, y: 0, z: 210 + jitZ },
            waypoints: [{ x: 60, y: 0, z: 210 }, { x: 175, y: 0, z: 250 }],
            militaryStrength: 0.60
        });

        this.worldSystem.registerGroup('nomad_clan_1', {
            name: 'Wilderness Foragers',
            type: ROAMING_PARTY_TYPES.NOMAD_TRIBE,
            factionId: FRONTIER_VALLEY_FACTIONS.NOMADS,
            memberCount: 12,
            position: { x: 220 + jitX * 0.7, y: 0, z: 180 + jitZ * 0.7 },
            waypoints: [{ x: 220, y: 0, z: 180 }, { x: 280, y: 0, z: 220 }],
            wealth: 0.40
        });

        this.worldSystem.registerGroup('wolf_pack_1', {
            name: 'Timber Wolf Pack',
            type: ROAMING_PARTY_TYPES.WILDLIFE_PACK,
            factionId: FRONTIER_VALLEY_FACTIONS.WILDLIFE,
            memberCount: 4,
            position: { x: 80 + jitX * 0.3, y: 0, z: 220 + jitZ * 0.3 },
            waypoints: [{ x: 80, y: 0, z: 220 }, { x: 100, y: 0, z: 240 }]
        });
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
     * Maps live encounters to route danger, group threat pressure, and
     * faction incidents. Extracted (NOW-16) so the mapping is unit-testable
     * with synthetic encounters; advance() calls it once per tick.
     * Wildlife predation never feeds faction grievances: animal hunger is
     * not faction warfare.
     * @param {Array<object>} encounters
     */
    _recordEncounterConsequences(encounters) {
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
                    this.factionSystem.recordIncident(bandit, victim, INCIDENT_TYPES.RAID_CONFIRMED, { encounter: enc.encounterId ?? null, restraint });
                    // NEXT-44: the victim fought back, so the raiders bled
                    // too. Symmetric restraint: dependence cools both ways.
                    // NEXT-48: mauling-vs-scuffle differentiation. The
                    // fight-back casualty severity scales with the victim's
                    // strength share (missing strength reads as unarmed):
                    // parity or better mauls (1.0), an unarmed caravan
                    // scuffles (0.25 floor). Per-incident fuel, not the
                    // ladder: the reverse ceiling still holds (less fuel).
                    const victimGroup = victim === fA ? gA : gB;
                    const banditGroup = bandit === fA ? gA : gB;
                    const vStr = Number(victimGroup?.militaryStrength) || 0;
                    const bStr = Number(banditGroup?.militaryStrength) || 0;
                    const share = (vStr + bStr) > 0 ? vStr / (vStr + bStr) : 0.5;
                    // NEXT-56: shared map; sweepable via sim.severityParams.
                    const sevP = this.severityParams ?? {};
                    const fightSeverity = casualtySeverityScale(share, sevP.floor, sevP.knee);
                    const backRestraint = this._dependencyRestraint(bandit, victim);
                    this.factionSystem.recordIncident(victim, bandit, INCIDENT_TYPES.SKIRMISH_CASUALTY, { encounter: enc.encounterId ?? null, restraint: backRestraint, severity: fightSeverity });
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
                    const sevFor = (inf, vic) => (inf + vic) > 0
                        ? casualtySeverityScale(inf / (inf + vic), sevP.floor, sevP.knee)
                        : 0.5;
                    this.factionSystem.recordIncident(fA, fB, INCIDENT_TYPES.SKIRMISH_CASUALTY, { encounter: enc.encounterId ?? null, severity: sevFor(aStr, bStr) });
                    this.factionSystem.recordIncident(fB, fA, INCIDENT_TYPES.SKIRMISH_CASUALTY, { encounter: enc.encounterId ?? null, severity: sevFor(bStr, aStr) });
                }
            } else if (enc.advisoryResolution === 'EXTORTION_PAID') {
                if (gA && gA.drivers) gA.drivers.threatPressure = Math.min(1.0, gA.drivers.threatPressure + 0.15);
                if (gB && gB.drivers) gB.drivers.threatPressure = Math.min(1.0, gB.drivers.threatPressure + 0.15);
                // NOW-16: paid tribute still provokes: the victim pays but
                // remembers who demanded it (smaller than a raid).
                if (bandit && civilized) {
                    const restraint = this._dependencyRestraint(victim, bandit);
                    this.factionSystem.recordIncident(bandit, victim, INCIDENT_TYPES.PROVOCATION, { encounter: enc.encounterId ?? null, restraint });
                }
            }
        }
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
            this.worldSystem.tick(1.0, { factionSystem: this.factionSystem });
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
            civSystem: this.civSystem.getState(),
            worldSystem: this.worldSystem.exportState()
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
        if (snapshot.civSystem) {
            this.civSystem.setState(snapshot.civSystem);
        }
        if (snapshot.worldSystem) {
            this.worldSystem.importState(snapshot.worldSystem);
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
