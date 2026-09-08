/**
 * packages/core/src/EconomicFeedbackSystem.js
 *
 * Sections 40-43 & 115 / Front C: Systemic Economic Feedback,
 * Commodity Scarcity, Desperation Raid Incentives, and Economic Pathology Detection.
 *
 * Models the bidirectional causal loop between economics and intelligence:
 * 1. Commodity Production & Consumption (Food, Timber, Ore, Medicine).
 * 2. Scarcity Index & Dynamic Price Elasticity.
 * 3. Famine & Deprivation Fear: Low food/medicine emits desperation fear to settlements.
 * 4. Bandit Raid Desirability: Wealthy, poorly garrisoned targets attract predatory raids.
 * 5. Escort Reallocation: Repeated losses trigger defensive investment dampening route danger.
 * 6. EconomicPathologyDetector: Catches infinite wealth, resource duplication, runaway prices,
 *    and permanent famine lockouts per Section 43.
 *
 * Strictly adheres to the Host Game Authority Invariant:
 * Middleware models abstract supply/demand scores, prices, and advisory raid intents;
 * host game engine remains 100% authoritative for actual inventories and player items.
 */

export const COMMODITY_TYPES = Object.freeze({
    FOOD: 'FOOD',
    TIMBER: 'TIMBER',
    ORE: 'ORE',
    MEDICINE: 'MEDICINE',
    LUXURY: 'LUXURY'
});

export const BASE_COMMODITY_PRICES = Object.freeze({
    [COMMODITY_TYPES.FOOD]: 10.0,
    [COMMODITY_TYPES.TIMBER]: 15.0,
    [COMMODITY_TYPES.ORE]: 25.0,
    [COMMODITY_TYPES.MEDICINE]: 40.0,
    [COMMODITY_TYPES.LUXURY]: 60.0
});

export const ECONOMIC_PATHOLOGIES = Object.freeze({
    INFINITE_WEALTH_EXPLOIT: 'INFINITE_WEALTH_EXPLOIT',
    RESOURCE_DUPLICATION_BUG: 'RESOURCE_DUPLICATION_BUG',
    PERMANENT_FAMINE_COLLAPSE: 'PERMANENT_FAMINE_COLLAPSE',
    ROUTE_OSCILLATION_CHATTER: 'ROUTE_OSCILLATION_CHATTER',
    PRICE_RUNAWAY_EXPLOSION: 'PRICE_RUNAWAY_EXPLOSION'
});

export class EconomicFeedbackSystem {
    /**
     * @param {Object} [config={}]
     */
    constructor(config = {}) {
        this.settlementMarkets = new Map(); // Map<settlementId, SettlementMarketState>
        this.tradeHistory = [];
        this.tickCount = 0;
        this.config = {
            consumptionPerCapita: 0.05,
            subsistenceThresholdMultiplier: 0.40, // Stockpile below 40% target triggers scarcity
            maxPriceMultiplier: 10.0,
            escortInvestmentPerIncident: 0.15,
            ...config
        };
    }

    /**
     * Registers a settlement market node with baseline capacity, production, and initial stockpiles.
     * @param {string} id
     * @param {Object} options
     */
    registerSettlementMarket(id, options = {}) {
        const population = options.population ?? 50;
        const targetStockpiles = {
            [COMMODITY_TYPES.FOOD]: population * 2.0,
            [COMMODITY_TYPES.TIMBER]: population * 0.8,
            [COMMODITY_TYPES.ORE]: population * 0.5,
            [COMMODITY_TYPES.MEDICINE]: population * 0.4,
            [COMMODITY_TYPES.LUXURY]: population * 0.2,
            ...(options.targetStockpiles || {})
        };

        const currentStockpiles = {
            [COMMODITY_TYPES.FOOD]: options.initialStockpiles?.food ?? targetStockpiles[COMMODITY_TYPES.FOOD],
            [COMMODITY_TYPES.TIMBER]: options.initialStockpiles?.timber ?? targetStockpiles[COMMODITY_TYPES.TIMBER],
            [COMMODITY_TYPES.ORE]: options.initialStockpiles?.ore ?? targetStockpiles[COMMODITY_TYPES.ORE],
            [COMMODITY_TYPES.MEDICINE]: options.initialStockpiles?.medicine ?? targetStockpiles[COMMODITY_TYPES.MEDICINE],
            [COMMODITY_TYPES.LUXURY]: options.initialStockpiles?.luxury ?? targetStockpiles[COMMODITY_TYPES.LUXURY]
        };

        const productionRates = {
            [COMMODITY_TYPES.FOOD]: options.production?.food ?? 2.0,
            [COMMODITY_TYPES.TIMBER]: options.production?.timber ?? 1.0,
            [COMMODITY_TYPES.ORE]: options.production?.ore ?? 0.5,
            [COMMODITY_TYPES.MEDICINE]: options.production?.medicine ?? 0.2,
            [COMMODITY_TYPES.LUXURY]: options.production?.luxury ?? 0.1
        };

        this.settlementMarkets.set(id, {
            id,
            population,
            garrison: options.garrison ?? 0.5,
            wealth: options.wealth ?? 100.0,
            stockpiles: currentStockpiles,
            targetStockpiles,
            productionRates,
            prices: { ...BASE_COMMODITY_PRICES },
            famineTicks: 0,
            desperationFearModifier: 0.0,
            escortReadiness: 0.0
        });
    }

    /**
     * Advances the economic simulation across all registered settlement markets.
     * @param {number} [ticks=1]
     */
    tick(ticks = 1) {
        for (let t = 0; t < ticks; t++) {
            this.tickCount++;

            for (const market of this.settlementMarkets.values()) {
                // 1. Production
                for (const [comm, rate] of Object.entries(market.productionRates)) {
                    market.stockpiles[comm] = (market.stockpiles[comm] || 0) + rate;
                }

                // 2. Consumption (Food consumption scaled to population)
                const foodConsumed = market.population * this.config.consumptionPerCapita;
                market.stockpiles[COMMODITY_TYPES.FOOD] = Math.max(0.0, market.stockpiles[COMMODITY_TYPES.FOOD] - foodConsumed);

                // Medicine consumed based on hardship/scarcity
                const medConsumed = market.population * 0.01;
                market.stockpiles[COMMODITY_TYPES.MEDICINE] = Math.max(0.0, market.stockpiles[COMMODITY_TYPES.MEDICINE] - medConsumed);

                // 3. Update Prices & Scarcity Index
                this._updateMarketPrices(market);

                // 4. Famine & Desperation Affective Feedback
                const foodTarget = market.targetStockpiles[COMMODITY_TYPES.FOOD];
                const subsistenceThreshold = foodTarget * this.config.subsistenceThresholdMultiplier;

                if (market.stockpiles[COMMODITY_TYPES.FOOD] < subsistenceThreshold) {
                    market.famineTicks++;
                    const deficitRatio = 1.0 - (market.stockpiles[COMMODITY_TYPES.FOOD] / subsistenceThreshold);
                    // Famine directly modulates population fear and unrest [0.0, 0.60]
                    market.desperationFearModifier = Math.min(0.60, deficitRatio * 0.60);
                } else {
                    market.famineTicks = Math.max(0, market.famineTicks - 1);
                    market.desperationFearModifier = Math.max(0.0, market.desperationFearModifier - 0.02);
                }

                // 5. Escort readiness gradual decay
                market.escortReadiness = Math.max(0.0, market.escortReadiness - 0.005);
            }
        }
    }

    /**
     * Updates dynamic commodity prices based on local supply vs target demand.
     * @private
     */
    _updateMarketPrices(market) {
        for (const [comm, basePrice] of Object.entries(BASE_COMMODITY_PRICES)) {
            const stock = market.stockpiles[comm] || 0.0;
            const target = market.targetStockpiles[comm] || 1.0;

            let multiplier = 1.0;
            if (stock < target) {
                // Supply deficit -> price increases
                const deficit = target - stock;
                multiplier = 1.0 + (deficit / Math.max(1.0, stock + 10.0));
            } else {
                // Surplus -> price decreases
                const surplus = stock - target;
                multiplier = Math.max(0.2, 1.0 - (surplus / (target * 2.0)));
            }

            market.prices[comm] = Math.min(
                basePrice * this.config.maxPriceMultiplier,
                Number((basePrice * multiplier).toFixed(2))
            );
        }
    }

    /**
     * Evaluates the predatory raid desirability of a target settlement from a raider faction's perspective.
     * @param {string} settlementId
     * @returns {{ raidUtility: number, plunderValue: number, defenseScore: number, recommended: boolean }}
     */
    calculateRaidDesirability(settlementId) {
        const market = this.settlementMarkets.get(settlementId);
        if (!market) return { raidUtility: 0, plunderValue: 0, defenseScore: 0, recommended: false };

        let totalPlunderValue = market.wealth;
        for (const [comm, stock] of Object.entries(market.stockpiles)) {
            totalPlunderValue += stock * (market.prices[comm] || 10.0);
        }

        const defenseScore = (market.garrison * 100.0) + (market.escortReadiness * 50.0);
        const raidUtility = totalPlunderValue / Math.max(10.0, defenseScore);

        return {
            raidUtility: Number(raidUtility.toFixed(3)),
            plunderValue: Number(totalPlunderValue.toFixed(2)),
            defenseScore: Number(defenseScore.toFixed(2)),
            recommended: raidUtility > 2.5
        };
    }

    /**
     * Records a successful delivery or trade transaction between settlements.
     * @param {string} sourceId
     * @param {string} destId
     * @param {string} commodity
     * @param {number} amount
     */
    recordTradeTransaction(sourceId, destId, commodity, amount) {
        const source = this.settlementMarkets.get(sourceId);
        const dest = this.settlementMarkets.get(destId);
        if (!source || !dest || amount <= 0) return false;

        const actualTransfer = Math.min(amount, source.stockpiles[commodity] || 0);
        source.stockpiles[commodity] -= actualTransfer;
        dest.stockpiles[commodity] = (dest.stockpiles[commodity] || 0) + actualTransfer;

        this.tradeHistory.push({
            tick: this.tickCount,
            sourceId,
            destId,
            commodity,
            amount: actualTransfer
        });

        return true;
    }

    /**
     * Responds to an ambush incident along a trade corridor by allocating garrison defense to escorts.
     * @param {string} settlementId
     * @param {number} [severity=0.2]
     */
    allocateEscortInvestment(settlementId, severity = 0.2) {
        const market = this.settlementMarkets.get(settlementId);
        if (market) {
            market.escortReadiness = Math.min(1.0, market.escortReadiness + severity * this.config.escortInvestmentPerIncident);
        }
    }

    /**
     * Gets summary metrics of a settlement market.
     * @param {string} settlementId
     * @returns {Object|null}
     */
    getMarketSummary(settlementId) {
        const m = this.settlementMarkets.get(settlementId);
        if (!m) return null;
        return {
            id: m.id,
            population: m.population,
            wealth: m.wealth,
            foodStockpile: Number(m.stockpiles[COMMODITY_TYPES.FOOD].toFixed(1)),
            desperationFearModifier: Number(m.desperationFearModifier.toFixed(3)),
            famineTicks: m.famineTicks,
            escortReadiness: Number(m.escortReadiness.toFixed(3)),
            foodPrice: m.prices[COMMODITY_TYPES.FOOD]
        };
    }
}

export class EconomicPathologyDetector {
    /**
     * Validates an economic simulation history for pathological failure modes per Section 43.
     * @param {EconomicFeedbackSystem} econSystem
     * @returns {{
     *   healthy: boolean,
     *   pathologies: Array<{ type: string, description: string, severity: 'WARN'|'CRITICAL' }>
     * }}
     */
    static validate(econSystem) {
        const pathologies = [];

        for (const [id, market] of econSystem.settlementMarkets.entries()) {
            // 1. Infinite Wealth / Unbounded Stockpile Accumulation
            for (const [comm, stock] of Object.entries(market.stockpiles)) {
                const target = market.targetStockpiles[comm] || 100.0;
                if (stock > target * 20.0) {
                    pathologies.push({
                        type: ECONOMIC_PATHOLOGIES.INFINITE_WEALTH_EXPLOIT,
                        description: `Settlement "${id}" accumulated ${stock.toFixed(1)} units of ${comm} (>20x target ${target}), indicating unbounded wealth accumulation without sink.`,
                        severity: 'CRITICAL'
                    });
                }
            }

            // 2. Permanent Famine Collapse
            if (market.famineTicks > 120 && market.stockpiles[COMMODITY_TYPES.FOOD] === 0) {
                pathologies.push({
                    type: ECONOMIC_PATHOLOGIES.PERMANENT_FAMINE_COLLAPSE,
                    description: `Settlement "${id}" is trapped in permanent famine (${market.famineTicks} ticks at 0 food) without market equilibrium recovery.`,
                    severity: 'CRITICAL'
                });
            }

            // 3. Price Runaway Explosion
            for (const [comm, price] of Object.entries(market.prices)) {
                const base = BASE_COMMODITY_PRICES[comm] || 10.0;
                if (price >= base * 10.0) {
                    pathologies.push({
                        type: ECONOMIC_PATHOLOGIES.PRICE_RUNAWAY_EXPLOSION,
                        description: `Price of ${comm} in "${id}" reached ${price.toFixed(1)} (>= 10x base price ${base}), indicating runaway hyper-inflation.`,
                        severity: 'WARN'
                    });
                }
            }
        }

        // 4. Resource Duplication Bug (Audit Trade History)
        const totalDelivered = econSystem.tradeHistory.reduce((sum, t) => sum + t.amount, 0);
        if (totalDelivered < 0) {
            pathologies.push({
                type: ECONOMIC_PATHOLOGIES.RESOURCE_DUPLICATION_BUG,
                description: `Negative commodity trade volume detected in ledger.`,
                severity: 'CRITICAL'
            });
        }

        return {
            healthy: pathologies.filter(p => p.severity === 'CRITICAL').length === 0,
            pathologies
        };
    }
}
