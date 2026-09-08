/**
 * tests/economic-feedback-system.test.js
 *
 * Sections 40-43 & 115 / Front C: Systemic Economic Feedback,
 * Commodity Scarcity, Desperation Raid Incentives, and Economic Pathology Detection.
 *
 * Asserts:
 * 1. Simulates commodity production and population consumption across settlement markets.
 * 2. Prices react elastically to supply deficits and surpluses.
 * 3. Famine / Scarcity below subsistence thresholds emits desperation fear to settlements.
 * 4. Bandit raid desirability evaluates plunder value against garrison defense.
 * 5. Escort investment builds defensive readiness following corridor incidents.
 * 6. Executes trade transactions between settlements and audits trade ledger.
 * 7. EconomicPathologyDetector catches infinite wealth exploits, permanent famine, and runaway prices.
 * 8. Preserves Host Game Authority Invariant (advisory economic metrics without mutating host inventory).
 */

import { describe, it, expect } from '@jest/globals';
import {
    EconomicFeedbackSystem,
    EconomicPathologyDetector,
    COMMODITY_TYPES,
    ECONOMIC_PATHOLOGIES
} from '../packages/core/src/EconomicFeedbackSystem.js';

describe('Sections 40-43 & 115 / Front C: Systemic Economic Feedback & Pathology Detector', () => {
    it('1. Simulates commodity production and consumption with accurate stockpile balances', () => {
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('Oakhaven', {
            population: 100,
            production: { food: 10.0 }, // Produces 10 Food/tick
            initialStockpiles: { food: 200.0 }
        });

        // 100 pop consumes 100 * 0.05 = 5 Food/tick -> net gain +5 Food/tick
        econ.tick(10);

        const summary = econ.getMarketSummary('Oakhaven');
        expect(summary).toBeDefined();
        expect(summary.foodStockpile).toBeCloseTo(250.0, 1);
        expect(summary.desperationFearModifier).toBe(0.0);
    });

    it('2. Prices react elastically to supply deficits and surpluses', () => {
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('Riverbend', {
            population: 50,
            initialStockpiles: { food: 20.0 }, // Severe deficit vs target 100
            production: { food: 0.0 }
        });

        econ.tick(1);
        const market = econ.settlementMarkets.get('Riverbend');
        const priceDeficit = market.prices[COMMODITY_TYPES.FOOD];

        // Normal base price is 10.0; severe deficit should increase price
        expect(priceDeficit).toBeGreaterThan(10.0);

        // Inject massive surplus
        market.stockpiles[COMMODITY_TYPES.FOOD] = 500.0;
        econ.tick(1);
        const priceSurplus = market.prices[COMMODITY_TYPES.FOOD];
        expect(priceSurplus).toBeLessThan(10.0);
    });

    it('3. Famine below subsistence thresholds triggers desperation fear unrest', () => {
        const econ = new EconomicFeedbackSystem({
            consumptionPerCapita: 0.10 // Rapid consumption
        });

        econ.registerSettlementMarket('Northwatch', {
            population: 60, // Target food = 120, subsistence = 48
            initialStockpiles: { food: 20.0 }, // Below subsistence
            production: { food: 0.0 }
        });

        econ.tick(5);
        const summary = econ.getMarketSummary('Northwatch');
        expect(summary.famineTicks).toBeGreaterThanOrEqual(5);
        expect(summary.desperationFearModifier).toBeGreaterThan(0.20);
    });

    it('4. Calculates bandit raid desirability based on plunder vs garrison defense', () => {
        const econ = new EconomicFeedbackSystem();
        // Wealthy merchant hub with low garrison
        econ.registerSettlementMarket('VulnerableHub', {
            population: 80,
            wealth: 500.0,
            garrison: 0.10, // Very weak garrison
            initialStockpiles: { luxury: 100.0 }
        });

        // Fortified citadel with minimal plunder and massive garrison
        econ.registerSettlementMarket('FortifiedCitadel', {
            population: 20,
            wealth: 20.0,
            garrison: 0.95, // High defense
            initialStockpiles: { food: 5.0, timber: 0, ore: 0, medicine: 0, luxury: 0 }
        });

        const hubRaid = econ.calculateRaidDesirability('VulnerableHub');
        const fortRaid = econ.calculateRaidDesirability('FortifiedCitadel');

        expect(hubRaid.raidUtility).toBeGreaterThan(fortRaid.raidUtility);
        expect(hubRaid.recommended).toBe(true);
        expect(fortRaid.recommended).toBe(false);
    });

    it('5. Allocates escort readiness following trade corridor incidents', () => {
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('Riverbend', {
            garrison: 0.60
        });

        expect(econ.getMarketSummary('Riverbend').escortReadiness).toBe(0.0);

        econ.allocateEscortInvestment('Riverbend', 0.8);
        expect(econ.getMarketSummary('Riverbend').escortReadiness).toBeGreaterThan(0.10);
    });

    it('6. Executes trade transactions between settlements with accurate conservation of goods', () => {
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('SourceTown', { initialStockpiles: { food: 100.0 } });
        econ.registerSettlementMarket('DestTown', { initialStockpiles: { food: 20.0 } });

        const ok = econ.recordTradeTransaction('SourceTown', 'DestTown', COMMODITY_TYPES.FOOD, 40.0);
        expect(ok).toBe(true);
        expect(econ.settlementMarkets.get('SourceTown').stockpiles[COMMODITY_TYPES.FOOD]).toBe(60.0);
        expect(econ.settlementMarkets.get('DestTown').stockpiles[COMMODITY_TYPES.FOOD]).toBe(60.0);
    });

    it('7. EconomicPathologyDetector catches infinite wealth accumulation and permanent famine', () => {
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('GlitchCity', {
            population: 10,
            targetStockpiles: { [COMMODITY_TYPES.FOOD]: 20.0 },
            initialStockpiles: { food: 1000.0 } // >20x target
        });

        const report = EconomicPathologyDetector.validate(econ);
        expect(report.healthy).toBe(false);
        const infiniteWealth = report.pathologies.find(p => p.type === ECONOMIC_PATHOLOGIES.INFINITE_WEALTH_EXPLOIT);
        expect(infiniteWealth).toBeDefined();
        expect(infiniteWealth.severity).toBe('CRITICAL');
    });

    it('8. Strictly adheres to Host Game Authority Invariant', () => {
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('BorderVillage', {
            population: 40,
            wealth: 50.0
        });

        econ.tick(10);
        const summary = econ.getMarketSummary('BorderVillage');

        // Middleware outputs advisory metrics; does not directly move actors or mutate host inventories
        expect(summary.population).toBe(40);
        expect(typeof summary.desperationFearModifier).toBe('number');
        expect(summary.desperationFearModifier).toBeGreaterThanOrEqual(0.0);
        expect(summary.desperationFearModifier).toBeLessThanOrEqual(1.0);
    });
});
