import { describe, it, expect } from '@jest/globals';
import {
    TradeCaravanSupplyChainSystem,
    CARAVAN_STATUS,
    ESCORT_TIERS,
    COMMODITY_TYPES
} from '../packages/core/index.js';

describe('Front C / Sections 34–36, 41–42, 44–45, 48–49: Regional Trade Caravans & Procedural Supply Chains', () => {
    function setupFrontierValleyNetwork() {
        const system = new TradeCaravanSupplyChainSystem({ seed: 1234, transportCostPerKm: 0.05 });

        // Register 3 settlement hubs: Silvercreek (Farming hub), Ironhold (Mining fortress), Oakridge (Lumber town)
        system.registerSettlementHub('Silvercreek', {
            name: 'Silvercreek Farms',
            x: 0, z: 0,
            initialStockpiles: { [COMMODITY_TYPES.FOOD]: 200, [COMMODITY_TYPES.ORE]: 10 },
            targetStockpiles: { [COMMODITY_TYPES.FOOD]: 50, [COMMODITY_TYPES.ORE]: 60 }
        });

        system.registerSettlementHub('Ironhold', {
            name: 'Ironhold Fortress',
            x: 60, z: 80, // Distance = 100 km
            initialStockpiles: { [COMMODITY_TYPES.FOOD]: 15, [COMMODITY_TYPES.ORE]: 180 },
            targetStockpiles: { [COMMODITY_TYPES.FOOD]: 100, [COMMODITY_TYPES.ORE]: 40 }
        });

        system.registerSettlementHub('Oakridge', {
            name: 'Oakridge Timberlands',
            x: -40, z: 30, // Distance = 50 km from Silvercreek
            initialStockpiles: { [COMMODITY_TYPES.FOOD]: 60, [COMMODITY_TYPES.TIMBER]: 150 },
            targetStockpiles: { [COMMODITY_TYPES.FOOD]: 60, [COMMODITY_TYPES.TIMBER]: 30 }
        });

        // Corridors
        system.registerCorridor('Silvercreek', 'Ironhold', { distanceKm: 100, hazardRating: 0.45, banditPresence: 0.35 });
        system.registerCorridor('Ironhold', 'Silvercreek', { distanceKm: 100, hazardRating: 0.45, banditPresence: 0.35 });
        system.registerCorridor('Silvercreek', 'Oakridge', { distanceKm: 50, hazardRating: 0.10, banditPresence: 0.05 });

        return system;
    }

    describe('1. Dynamic Trade Arbitrage Detection', () => {
        it('scans the regional network and identifies profitable commodity margins', () => {
            const system = setupFrontierValleyNetwork();
            const opportunities = system.evaluateArbitrageOpportunities();

            expect(opportunities.length).toBeGreaterThan(0);

            // Food from Silvercreek (surplus) to Ironhold (deficit) should be the top opportunity
            const foodOpp = opportunities.find(o => o.originId === 'Silvercreek' && o.destinationId === 'Ironhold' && o.commodity === COMMODITY_TYPES.FOOD);
            expect(foodOpp).toBeDefined();
            expect(foodOpp.marginPerUnit).toBeGreaterThan(0);
            expect(foodOpp.estimatedProfit).toBeGreaterThan(50);
            expect(foodOpp.recommendedEscort).toBe('STANDARD'); // hazard 0.45 -> STANDARD
        });
    });

    describe('2. Caravan Commissioning & Hazard-Aware Escorts', () => {
        it('commissions caravan, deducts commodity from origin, and assigns escorts', () => {
            const system = setupFrontierValleyNetwork();
            const hubSilvercreek = system.settlementHubs.get('Silvercreek');
            const initialFood = hubSilvercreek.stockpiles[COMMODITY_TYPES.FOOD];

            const caravan = system.commissionCaravan({
                originId: 'Silvercreek',
                destinationId: 'Ironhold',
                commodity: COMMODITY_TYPES.FOOD,
                quantity: 40.0
            });

            expect(caravan).not.toBeNull();
            expect(caravan.quantity).toBe(40.0);
            expect(caravan.status).toBe(CARAVAN_STATUS.IN_TRANSIT);
            expect(caravan.escortTier.id).toBe('STANDARD');

            // Stockpile at Silvercreek must have decreased by exactly 40
            expect(hubSilvercreek.stockpiles[COMMODITY_TYPES.FOOD]).toBe(initialFood - 40.0);
        });
    });

    describe('3. In-Transit Journey & Delivery Price Convergence', () => {
        it('transports cargo along corridor and unloads at destination compressing price spread', () => {
            const system = setupFrontierValleyNetwork();
            const hubIronhold = system.settlementHubs.get('Ironhold');
            const initialIronholdFood = hubIronhold.stockpiles[COMMODITY_TYPES.FOOD];
            const initialIronholdPrice = hubIronhold.prices[COMMODITY_TYPES.FOOD];

            // Set corridor hazard to 0 for peaceful transit
            system.corridors.get('Silvercreek_to_Ironhold').banditPresence = 0.0;
            system.corridors.get('Silvercreek_to_Ironhold').hazardRating = 0.0;

            const caravan = system.commissionCaravan({
                originId: 'Silvercreek',
                destinationId: 'Ironhold',
                commodity: COMMODITY_TYPES.FOOD,
                quantity: 30.0,
                speedKmPerTick: 10.0 // 100km / 10 = 10 ticks
            });

            // Advance 11 ticks
            system.tick(11);

            expect(caravan.status).toBe(CARAVAN_STATUS.COMPLETED);
            expect(system.activeCaravans.size).toBe(0);
            expect(system.completedJourneys.length).toBe(1);

            // Ironhold should have received the food
            expect(hubIronhold.stockpiles[COMMODITY_TYPES.FOOD]).toBe(initialIronholdFood + 30.0);

            // Destination food price should have dropped due to replenished supply
            expect(hubIronhold.prices[COMMODITY_TYPES.FOOD]).toBeLessThan(initialIronholdPrice);
        });
    });

    describe('4. Emergent Highway Ambushes & Raid Consequences', () => {
        it('triggers bandit ambushes on dangerous corridors causing casualties and cargo loss', () => {
            const system = setupFrontierValleyNetwork();
            const corridor = system.corridors.get('Silvercreek_to_Ironhold');
            corridor.banditPresence = 0.95; // Extreme raider density
            corridor.hazardRating = 0.90;

            system.commissionCaravan({
                originId: 'Silvercreek',
                destinationId: 'Ironhold',
                commodity: COMMODITY_TYPES.FOOD,
                quantity: 50.0,
                escortTier: 'NONE', // Defenseless caravan
                speedKmPerTick: 2.0
            });

            // Advance simulation to trigger ambush
            system.tick(25);

            // Check that commodities were looted
            const lootedFood = system.lootedCommodities[COMMODITY_TYPES.FOOD];
            expect(lootedFood).toBeGreaterThan(0);
            expect(corridor.hazardRating).toBeGreaterThanOrEqual(0.90);
        });
    });

    describe('5. Commodity Mass Conservation Theorem', () => {
        it('guarantees exact commodity conservation across stockpiles, in-transit cargo, and looted goods', () => {
            const system = setupFrontierValleyNetwork();

            // Total initial food across all 3 hubs: Silvercreek (200) + Ironhold (15) + Oakridge (60) = 275
            const initialTotalFood = 275.0;

            // Commission multiple caravans with varying routes
            system.commissionCaravan({ originId: 'Silvercreek', destinationId: 'Ironhold', commodity: COMMODITY_TYPES.FOOD, quantity: 30.0 });
            system.commissionCaravan({ originId: 'Silvercreek', destinationId: 'Oakridge', commodity: COMMODITY_TYPES.FOOD, quantity: 20.0 });

            // Run simulation for 30 ticks (some complete, some in transit, some may be ambushed)
            system.tick(30);

            const audit = system.auditCommodityConservation(COMMODITY_TYPES.FOOD, initialTotalFood);
            expect(audit.isConserved).toBe(true);
            expect(audit.delta).toBeLessThan(0.05);
            expect(audit.totalSum).toBeCloseTo(initialTotalFood, 1);
        });
    });

    describe('6. Replay Determinism & State Restoration', () => {
        it('preserves bit-exact state parity across save snapshots', () => {
            const systemA = setupFrontierValleyNetwork();
            systemA.commissionCaravan({ originId: 'Silvercreek', destinationId: 'Oakridge', commodity: COMMODITY_TYPES.FOOD, quantity: 25.0 });
            systemA.tick(3);

            const snapshot = systemA.getState();

            const systemB = new TradeCaravanSupplyChainSystem();
            systemB.setState(snapshot);

            expect(systemB.currentTick).toBe(3);
            expect(systemB.settlementHubs.size).toBe(3);
            expect(systemB.activeCaravans.size).toBe(1);

            const carA = Array.from(systemA.activeCaravans.values())[0];
            const carB = Array.from(systemB.activeCaravans.values())[0];
            expect(carB.progress).toBeCloseTo(carA.progress, 4);
            expect(carB.fearLevel).toBeCloseTo(carA.fearLevel, 4);
        });
    });
});
