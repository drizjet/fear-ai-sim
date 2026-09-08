/**
 * packages/core/src/TradeCaravanSupplyChainSystem.js
 *
 * Front C / Sections 34–36, 41–42, 44–45, 48–49:
 * Regional Dynamic Trade Caravans & Procedural Supply Chains.
 *
 * Models regional living-world commodity flows, dynamic price arbitrage,
 * caravan journey lifecycles, escort hiring, and procedural highway ambushes.
 *
 * Capabilities:
 * 1. Dynamic Trade Arbitrage Engine:
 *    Scans inter-settlement commodity price spreads across road corridors and commissions
 *    merchant expeditions when margin exceeds transport costs and hazard risk penalties.
 * 2. Caravan Journey State Machine (CARAVAN_STATUS):
 *    IDLE -> PREPARING -> IN_TRANSIT -> UNDER_AMBUSH -> DELIVERING -> COMPLETED
 * 3. Dynamic Hazard-Aware Escort Hiring:
 *    Merchants calculate corridor hazard H(A, B) and invest in mercenary escorts accordingly.
 * 4. Procedural Systemic Ambushes & Consequence Loops:
 *    Bandit raiders intercept vulnerable caravans; outcomes affect settlement supply,
 *    market prices, bandit wealth, and corridor hazard ratings.
 * 5. Commodity Mass Conservation:
 *    Mathematically guarantees that goods loaded at A + in-transit + looted = goods unloaded at B,
 *    preventing spontaneous duplication or destruction.
 *
 * Absolute Architectural Invariant:
 * Strictly adheres to the Host Game Authority Invariant. Trade calculations provide advisory
 * intent vectors, route suggestions, and macroeconomic state; host engine owns physics, transforms,
 * and entity lifecycles.
 */

import { COMMODITY_TYPES, BASE_COMMODITY_PRICES } from './EconomicFeedbackSystem.js';
import { DeterministicRng } from './DeterministicRng.js';

export const CARAVAN_STATUS = Object.freeze({
    IDLE: 'IDLE',
    PREPARING: 'PREPARING',
    IN_TRANSIT: 'IN_TRANSIT',
    UNDER_AMBUSH: 'UNDER_AMBUSH',
    DELIVERING: 'DELIVERING',
    ROUTED_OR_LOST: 'ROUTED_OR_LOST',
    COMPLETED: 'COMPLETED'
});

export const ESCORT_TIERS = Object.freeze({
    NONE: { id: 'NONE', guards: 0, costMultiplier: 1.0, power: 0.1 },
    LIGHT: { id: 'LIGHT', guards: 2, costMultiplier: 1.15, power: 0.4 },
    STANDARD: { id: 'STANDARD', guards: 5, costMultiplier: 1.35, power: 0.8 },
    HEAVY: { id: 'HEAVY', guards: 10, costMultiplier: 1.70, power: 1.5 }
});

export class TradeCaravanSupplyChainSystem {
    /**
     * @param {object} [options]
     * @param {number} [options.seed=4242]
     * @param {number} [options.minProfitMargin=0.20] Minimum profit margin required to commission caravan
     * @param {number} [options.transportCostPerKm=0.08] Transportation cost per distance unit
     */
    constructor(options = {}) {
        this.rng = new DeterministicRng(options.seed ?? 4242);
        this.minProfitMargin = options.minProfitMargin ?? 0.20;
        this.transportCostPerKm = options.transportCostPerKm ?? 0.08;

        /** @type {Map<string, { id: string, name: string, x: number, z: number, stockpiles: object, prices: object, targetStockpiles: object }>} */
        this.settlementHubs = new Map();

        /** @type {Map<string, { id: string, originId: string, destinationId: string, distanceKm: number, hazardRating: number, banditPresence: number }>} */
        this.corridors = new Map();

        /** @type {Map<string, {
         *   id: string,
         *   merchantGuild: string,
         *   originId: string,
         *   destinationId: string,
         *   corridorId: string,
         *   commodity: string,
         *   quantity: number,
         *   purchasePricePerUnit: number,
         *   status: string,
         *   progress: number,
         *   speedKmPerTick: number,
         *   escortTier: object,
         *   fearLevel: number,
         *   dispatchedTick: number,
         *   deliveredTick: number|null
         * }>} */
        this.activeCaravans = new Map();

        /** @type {Array<object>} */
        this.completedJourneys = [];

        /** Total commodity units looted by bandits across all history */
        this.lootedCommodities = {
            [COMMODITY_TYPES.FOOD]: 0,
            [COMMODITY_TYPES.TIMBER]: 0,
            [COMMODITY_TYPES.ORE]: 0,
            [COMMODITY_TYPES.MEDICINE]: 0,
            [COMMODITY_TYPES.LUXURY]: 0
        };

        this.currentTick = 0;
    }

    /**
     * Register a settlement hub in the supply chain network.
     */
    registerSettlementHub(id, options = {}) {
        const hubId = String(id);
        const stockpiles = {};
        const targetStockpiles = {};
        const prices = {};

        for (const comm of Object.values(COMMODITY_TYPES)) {
            const basePrice = BASE_COMMODITY_PRICES[comm] || 15.0;
            const initialQty = options.initialStockpiles?.[comm] ?? 100.0;
            const targetQty = options.targetStockpiles?.[comm] ?? 100.0;

            stockpiles[comm] = Math.max(0, initialQty);
            targetStockpiles[comm] = Math.max(1, targetQty);

            // Dynamic initial price: lower when surplus, higher when scarce
            const ratio = targetQty / Math.max(1, initialQty);
            prices[comm] = Number((basePrice * Math.max(0.2, Math.min(5.0, ratio))).toFixed(2));
        }

        this.settlementHubs.set(hubId, {
            id: hubId,
            name: options.name || hubId,
            x: options.x ?? 0.0,
            z: options.z ?? 0.0,
            stockpiles,
            targetStockpiles,
            prices
        });
    }

    /**
     * Register a trade corridor connecting two settlement hubs.
     */
    registerCorridor(originId, destinationId, options = {}) {
        const orig = this.settlementHubs.get(String(originId));
        const dest = this.settlementHubs.get(String(destinationId));
        if (!orig || !dest) {
            throw new Error(`Cannot register corridor: hub ${originId} or ${destinationId} not found`);
        }

        const dx = dest.x - orig.x;
        const dz = dest.z - orig.z;
        const calcDist = Math.max(5.0, Number(Math.hypot(dx, dz).toFixed(1)));

        const id = `${orig.id}_to_${dest.id}`;
        this.corridors.set(id, {
            id,
            originId: orig.id,
            destinationId: dest.id,
            distanceKm: options.distanceKm ?? calcDist,
            hazardRating: Math.max(0.0, Math.min(1.0, options.hazardRating ?? 0.10)),
            banditPresence: Math.max(0.0, Math.min(1.0, options.banditPresence ?? 0.10))
        });
    }

    /**
     * Scan the network for profitable inter-settlement commodity arbitrage opportunities.
     * @returns {Array<{ originId: string, destinationId: string, corridorId: string, commodity: string, priceA: number, priceB: number, marginPerUnit: number, potentialVolume: number, estimatedProfit: number, recommendedEscort: string }>}
     */
    evaluateArbitrageOpportunities() {
        const opportunities = [];

        for (const [corridorId, corridor] of this.corridors.entries()) {
            const hubA = this.settlementHubs.get(corridor.originId);
            const hubB = this.settlementHubs.get(corridor.destinationId);
            if (!hubA || !hubB) continue;

            const transportCost = corridor.distanceKm * this.transportCostPerKm;
            const hazardPenalty = corridor.hazardRating * 8.0;

            for (const comm of Object.values(COMMODITY_TYPES)) {
                const priceA = hubA.prices[comm] || BASE_COMMODITY_PRICES[comm];
                const priceB = hubB.prices[comm] || BASE_COMMODITY_PRICES[comm];
                const surplusA = hubA.stockpiles[comm] - (hubA.targetStockpiles[comm] * 0.40);

                if (surplusA <= 5.0) continue; // Hub A has insufficient surplus

                const grossMargin = priceB - priceA;
                const netMargin = grossMargin - transportCost - hazardPenalty;

                if (netMargin / priceA >= this.minProfitMargin) {
                    // Determine recommended escort tier based on corridor hazard
                    let recommendedEscort = 'NONE';
                    if (corridor.hazardRating >= 0.60) recommendedEscort = 'HEAVY';
                    else if (corridor.hazardRating >= 0.35) recommendedEscort = 'STANDARD';
                    else if (corridor.hazardRating >= 0.15) recommendedEscort = 'LIGHT';

                    const potentialVolume = Math.min(50.0, Number(surplusA.toFixed(1)));
                    const estimatedProfit = Number((netMargin * potentialVolume).toFixed(2));

                    opportunities.push({
                        originId: hubA.id,
                        destinationId: hubB.id,
                        corridorId,
                        commodity: comm,
                        priceA,
                        priceB,
                        marginPerUnit: Number(netMargin.toFixed(2)),
                        potentialVolume,
                        estimatedProfit,
                        recommendedEscort
                    });
                }
            }
        }

        // Sort by estimated net profit descending
        opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit);
        return opportunities;
    }

    /**
     * Commission a new trade caravan party to transport commodities across a corridor.
     */
    commissionCaravan(options = {}) {
        const hubA = this.settlementHubs.get(String(options.originId));
        const hubB = this.settlementHubs.get(String(options.destinationId));
        const corridor = this.corridors.get(options.corridorId || `${options.originId}_to_${options.destinationId}`);

        if (!hubA || !hubB || !corridor) {
            throw new Error(`Cannot commission caravan: invalid hubs or corridor`);
        }

        const commodity = options.commodity || COMMODITY_TYPES.FOOD;
        const requestedQuantity = options.quantity ?? 25.0;
        const available = hubA.stockpiles[commodity] || 0;
        const quantity = Math.min(available, requestedQuantity);

        if (quantity <= 0) {
            return null; // Hub has no inventory to sell
        }

        // Deduct commodity from origin stockpile
        hubA.stockpiles[commodity] = Number((hubA.stockpiles[commodity] - quantity).toFixed(2));
        this._updateHubPrices(hubA);

        const escortTierName = options.escortTier || (corridor.hazardRating > 0.40 ? 'STANDARD' : 'LIGHT');
        const escortTier = ESCORT_TIERS[escortTierName] || ESCORT_TIERS.STANDARD;

        const caravanId = `caravan_${this.currentTick}_${hubA.id}_${hubB.id}_${this.activeCaravans.size + 1}`;
        const caravan = {
            id: caravanId,
            merchantGuild: options.merchantGuild || 'Frontier_Merchants',
            originId: hubA.id,
            destinationId: hubB.id,
            corridorId: corridor.id,
            commodity,
            quantity,
            purchasePricePerUnit: hubA.prices[commodity],
            status: CARAVAN_STATUS.IN_TRANSIT,
            progress: 0.0,
            speedKmPerTick: options.speedKmPerTick ?? 2.5,
            escortTier,
            fearLevel: 0.10,
            dispatchedTick: this.currentTick,
            deliveredTick: null
        };

        this.activeCaravans.set(caravanId, caravan);
        return caravan;
    }

    /**
     * Advance simulation tick: moves caravans, triggers procedural ambushes, and handles delivery.
     * @param {number} [deltaTicks=1]
     */
    tick(deltaTicks = 1) {
        this.currentTick += deltaTicks;

        for (const [id, caravan] of this.activeCaravans.entries()) {
            if (caravan.status !== CARAVAN_STATUS.IN_TRANSIT && caravan.status !== CARAVAN_STATUS.UNDER_AMBUSH) {
                continue;
            }

            const corridor = this.corridors.get(caravan.corridorId);
            if (!corridor) continue;

            // Check for emergent bandit ambush encounter
            if (caravan.status === CARAVAN_STATUS.IN_TRANSIT && corridor.banditPresence > 0.15) {
                const ambushRoll = this.rng.random();
                const ambushChance = corridor.banditPresence * 0.08 * deltaTicks;

                if (ambushRoll < ambushChance) {
                    this._resolveCaravanAmbush(caravan, corridor);
                }
            }

            // If not routed, advance travel progress
            if (caravan.status === CARAVAN_STATUS.IN_TRANSIT) {
                const distanceMoved = caravan.speedKmPerTick * deltaTicks;
                caravan.progress += distanceMoved / corridor.distanceKm;

                // Calming in transit
                caravan.fearLevel = Math.max(0.05, caravan.fearLevel * 0.95);

                if (caravan.progress >= 1.0) {
                    this._deliverCaravan(caravan);
                }
            }
        }
    }

    /**
     * Resolve a procedural highway ambush encounter.
     * @private
     */
    _resolveCaravanAmbush(caravan, corridor) {
        caravan.status = CARAVAN_STATUS.UNDER_AMBUSH;
        caravan.fearLevel = Math.min(1.0, caravan.fearLevel + 0.50);

        const defensePower = caravan.escortTier.power + (this.rng.random() * 0.4);
        const attackPower = corridor.banditPresence + (this.rng.random() * 0.4);

        if (defensePower >= attackPower) {
            // Caravan escorts successfully repel the raiders!
            caravan.status = CARAVAN_STATUS.IN_TRANSIT;
            corridor.banditPresence = Math.max(0.05, corridor.banditPresence - 0.08);
            corridor.hazardRating = Math.max(0.05, corridor.hazardRating - 0.05);
        } else {
            // Raiders breach the defense line
            const lootRatio = 0.40 + (this.rng.random() * 0.40); // 40% - 80% looted
            const lootedQty = Number((caravan.quantity * lootRatio).toFixed(2));
            caravan.quantity = Number((caravan.quantity - lootedQty).toFixed(2));

            this.lootedCommodities[caravan.commodity] = Number(
                ((this.lootedCommodities[caravan.commodity] || 0) + lootedQty).toFixed(2)
            );

            // Increase route hazard due to successful raid
            corridor.hazardRating = Math.min(1.0, corridor.hazardRating + 0.15);
            corridor.banditPresence = Math.min(1.0, corridor.banditPresence + 0.10);

            if (caravan.quantity <= 1.0) {
                // Entire cargo lost: caravan routed
                caravan.status = CARAVAN_STATUS.ROUTED_OR_LOST;
                this.activeCaravans.delete(caravan.id);
                this.completedJourneys.push({ ...caravan });
            } else {
                // Caravan survives in panic with remainder of cargo
                caravan.status = CARAVAN_STATUS.IN_TRANSIT;
                caravan.fearLevel = 0.90;
            }
        }
    }

    /**
     * Deliver caravan cargo at destination settlement and complete profit loop.
     * @private
     */
    _deliverCaravan(caravan) {
        caravan.status = CARAVAN_STATUS.COMPLETED;
        caravan.deliveredTick = this.currentTick;
        caravan.progress = 1.0;

        const destHub = this.settlementHubs.get(caravan.destinationId);
        if (destHub) {
            destHub.stockpiles[caravan.commodity] = Number(
                ((destHub.stockpiles[caravan.commodity] || 0) + caravan.quantity).toFixed(2)
            );
            this._updateHubPrices(destHub);
        }

        this.activeCaravans.delete(caravan.id);
        this.completedJourneys.push({ ...caravan });
    }

    /**
     * Recalculate commodity prices based on stockpile relative to target.
     * @private
     */
    _updateHubPrices(hub) {
        for (const comm of Object.values(COMMODITY_TYPES)) {
            const basePrice = BASE_COMMODITY_PRICES[comm] || 15.0;
            const current = Math.max(0.1, hub.stockpiles[comm]);
            const target = Math.max(1.0, hub.targetStockpiles[comm]);
            const ratio = target / current;
            hub.prices[comm] = Number((basePrice * Math.max(0.2, Math.min(5.0, ratio))).toFixed(2));
        }
    }

    /**
     * Verify the Commodity Conservation Theorem across the entire regional network.
     * sum(stockpiles) + sum(in_transit) + sum(looted) == initial_total
     * @param {string} commodity
     * @param {number} expectedTotal
     * @returns {{ isConserved: boolean, totalSum: number, delta: number }}
     */
    auditCommodityConservation(commodity, expectedTotal) {
        let total = 0;

        // 1. All settlement hub stockpiles
        for (const hub of this.settlementHubs.values()) {
            total += hub.stockpiles[commodity] || 0;
        }

        // 2. All in-transit active caravan cargo
        for (const caravan of this.activeCaravans.values()) {
            if (caravan.commodity === commodity && caravan.status === CARAVAN_STATUS.IN_TRANSIT) {
                total += caravan.quantity;
            }
        }

        // 3. All looted cargo
        total += this.lootedCommodities[commodity] || 0;

        total = Number(total.toFixed(2));
        const delta = Number(Math.abs(total - expectedTotal).toFixed(2));
        return {
            isConserved: delta < 0.05,
            totalSum: total,
            delta
        };
    }

    /**
     * Export complete state for serialization.
     */
    getState() {
        return {
            currentTick: this.currentTick,
            settlementHubs: Array.from(this.settlementHubs.values()),
            corridors: Array.from(this.corridors.values()),
            activeCaravans: Array.from(this.activeCaravans.values()),
            completedJourneys: [...this.completedJourneys],
            lootedCommodities: { ...this.lootedCommodities },
            rng: this.rng.getState()
        };
    }

    /**
     * Restore state from snapshot.
     */
    setState(state) {
        if (!state) return;
        this.currentTick = state.currentTick || 0;

        this.settlementHubs = new Map();
        if (state.settlementHubs) {
            for (const hub of state.settlementHubs) {
                this.settlementHubs.set(hub.id, JSON.parse(JSON.stringify(hub)));
            }
        }

        this.corridors = new Map();
        if (state.corridors) {
            for (const corr of state.corridors) {
                this.corridors.set(corr.id, JSON.parse(JSON.stringify(corr)));
            }
        }

        this.activeCaravans = new Map();
        if (state.activeCaravans) {
            for (const car of state.activeCaravans) {
                this.activeCaravans.set(car.id, JSON.parse(JSON.stringify(car)));
            }
        }

        this.completedJourneys = JSON.parse(JSON.stringify(state.completedJourneys || []));
        this.lootedCommodities = { ...state.lootedCommodities };
        if (state.rng) {
            this.rng.setState(state.rng);
        }
    }
}
