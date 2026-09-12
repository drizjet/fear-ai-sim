/**
 * @fear-ai/core - SettlementMigrationSystem
 * Front C / Sections 46–47: Dynamic Migration Flow & Settlement Demographic Impact System.
 * 
 * STRICT INVARIANT:
 * Host game remains authoritative for physical world geometry, entity spawning,
 * and canonical inventories. SettlementMigrationSystem evaluates multi-driver migration
 * pressures (famine, war terror, overcrowding), models in-transit migrant caravans,
 * calculates arrival economic/labor/friction consequences, and guarantees world population
 * conservation.
 */

export const MIGRATION_DRIVERS = Object.freeze({
    FAMINE_SCARCITY: 'FAMINE_SCARCITY',
    WAR_TERROR: 'WAR_TERROR',
    OVERCROWDING_DENSITY: 'OVERCROWDING_DENSITY',
    ECONOMIC_OPPORTUNITY: 'ECONOMIC_OPPORTUNITY'
});

export const MIGRANT_PARTY_STATUS = Object.freeze({
    PREPARING: 'PREPARING',
    IN_TRANSIT: 'IN_TRANSIT',
    ARRIVED: 'ARRIVED',
    SCATTERED: 'SCATTERED'
});

export class SettlementMigrationSystem {
    constructor(config = {}) {
        this.config = Object.freeze({
            migrationPushThreshold: config.migrationPushThreshold ?? 0.30,
            maxEmigrationRate: config.maxEmigrationRate ?? 0.25, // max 25% of pop per wave
            minSettlementPop: config.minSettlementPop ?? 5,     // extinction floor
            laborMultiplier: config.laborMultiplier ?? 0.004,   // +0.4% production per migrant
            consumptionPerCapita: config.consumptionPerCapita ?? 0.5,
            frictionThresholdRatio: config.frictionThresholdRatio ?? 0.25, // >25% influx triggers friction
            ...config
        });

        this.settlements = new Map();
        this.inTransitParties = [];
        this.migrationHistory = [];
        this.totalWorldCasualties = 0;
    }

    /**
     * Registers a settlement with demographic and resource baselines.
     */
    registerSettlement(id, data = {}) {
        this.settlements.set(id, {
            id,
            population: data.population ?? 100,
            housingCapacity: data.housingCapacity ?? 120,
            foodStock: data.foodStock ?? 100.0,
            threatLevel: data.threatLevel ?? 0.1,
            garrisonStrength: data.garrisonStrength ?? 0.5,
            socialFriction: 0.0,
            laborBonus: 1.0,
            ...data
        });
    }

    /**
     * Calculates push pressure at a source settlement.
     */
    evaluatePushPressure(settlement) {
        // Famine pressure (food stock < 30)
        const faminePush = settlement.foodStock < 30.0
            ? Math.max(0, (30.0 - settlement.foodStock) / 30.0)
            : 0.0;

        // War/Terror threat pressure
        const terrorPush = Math.max(0, Math.min(1.0, settlement.threatLevel));

        // Overcrowding pressure
        const densityPush = settlement.population > settlement.housingCapacity
            ? Math.min(1.0, (settlement.population - settlement.housingCapacity) / settlement.housingCapacity)
            : 0.0;

        const netPush = (0.45 * faminePush) + (0.35 * terrorPush) + (0.20 * densityPush);

        let primaryDriver = MIGRATION_DRIVERS.ECONOMIC_OPPORTUNITY;
        if (faminePush >= terrorPush && faminePush >= densityPush && faminePush > 0) {
            primaryDriver = MIGRATION_DRIVERS.FAMINE_SCARCITY;
        } else if (terrorPush > faminePush && terrorPush >= densityPush) {
            primaryDriver = MIGRATION_DRIVERS.WAR_TERROR;
        } else if (densityPush > 0) {
            primaryDriver = MIGRATION_DRIVERS.OVERCROWDING_DENSITY;
        }

        return {
            netPush: Number(netPush.toFixed(4)),
            primaryDriver,
            factors: {
                famine: Number(faminePush.toFixed(3)),
                terror: Number(terrorPush.toFixed(3)),
                density: Number(densityPush.toFixed(3))
            }
        };
    }

    /**
     * Evaluates pull desirability of a destination settlement.
     */
    evaluatePullAttraction(destination, corridorDanger = 0.0) {
        // Food surplus factor
        const foodPull = Math.min(1.0, destination.foodStock / 100.0);
        // Safety factor (garrison minus threat)
        const safetyPull = Math.max(0.0, destination.garrisonStrength - destination.threatLevel);
        // Available capacity
        const capacityRoom = Math.max(0, destination.housingCapacity - destination.population);
        const capacityPull = Math.min(1.0, capacityRoom / 50.0);
        // Corridor security penalty
        const corridorPenalty = Math.min(0.5, corridorDanger * 0.5);

        const netPull = Math.max(0.0, (0.40 * foodPull + 0.35 * safetyPull + 0.25 * capacityPull) - corridorPenalty);

        return Number(netPull.toFixed(4));
    }

    /**
     * Evaluates and dispatches a migration wave if push pressure exceeds threshold.
     */
    evaluateMigrationWave(sourceId, destId, corridorDanger = 0.0, tick = 0) {
        const source = this.settlements.get(sourceId);
        const dest = this.settlements.get(destId);
        if (!source || !dest) return null;

        const push = this.evaluatePushPressure(source);
        if (push.netPush < this.config.migrationPushThreshold) {
            return null; // Pressure insufficient to trigger migration wave
        }

        const pull = this.evaluatePullAttraction(dest, corridorDanger);
        if (pull < 0.15) {
            return null; // Destination deemed uninhabitable or corridor too deadly
        }

        // Calculate migrant cohort size with conservation floor
        const availablePop = Math.max(0, source.population - this.config.minSettlementPop);
        const desiredMigrants = Math.round(availablePop * Math.min(this.config.maxEmigrationRate, (push.netPush - this.config.migrationPushThreshold) * 0.60));
        const count = Math.max(1, desiredMigrants);

        if (count <= 0 || source.population - count < this.config.minSettlementPop) {
            return null;
        }

        // Emigration departure from source
        source.population -= count;

        const party = {
            partyId: `mig_${sourceId}_to_${destId}_t${tick}`,
            sourceId,
            destId,
            headcount: count,
            departureTick: tick,
            estimatedArrivalTick: tick + 5,
            primaryDriver: push.primaryDriver,
            corridorDanger,
            status: MIGRANT_PARTY_STATUS.IN_TRANSIT
        };

        this.inTransitParties.push(party);
        this.migrationHistory.push({
            event: 'DEPARTURE',
            partyId: party.partyId,
            headcount: count,
            source: sourceId,
            dest: destId,
            tick
        });

        return party;
    }

    /**
     * Resolves in-transit movement and settlement arrival consequences.
     */
    tick(currentTick = 0) {
        const remainingParties = [];

        for (const party of this.inTransitParties) {
            if (currentTick >= party.estimatedArrivalTick) {
                // Arrival processing
                const dest = this.settlements.get(party.destId);
                if (dest) {
                    // Calculate corridor attrition if any
                    let survivors = party.headcount;
                    if (party.corridorDanger > 0.5) {
                        const casualtyRate = (party.corridorDanger - 0.5) * 0.40;
                        const casualties = Math.round(party.headcount * casualtyRate);
                        survivors = Math.max(1, party.headcount - casualties);
                        this.totalWorldCasualties += casualties;
                    }

                    // 1. Population influx. New mouths eat on arrival: each
                    // survivor consumes one per-capita meal from the
                    // destination stockpile (R12 loop: influx dilutes food
                    // security, so migration can raise downstream scarcity).
                    const previousPop = dest.population;
                    dest.population += survivors;
                    const arrivalMeal = survivors * this.config.consumptionPerCapita;
                    dest.foodStock = Math.max(0, Number((dest.foodStock - arrivalMeal).toFixed(3)));

                    // 2. Labor productivity boost (+0.4% per migrant)
                    dest.laborBonus = Number((dest.laborBonus + (survivors * this.config.laborMultiplier)).toFixed(4));

                    // 3. Social friction if massive influx
                    const influxRatio = survivors / Math.max(1, previousPop);
                    if (influxRatio > this.config.frictionThresholdRatio) {
                        dest.socialFriction = Number(Math.min(1.0, dest.socialFriction + (influxRatio * 0.50)).toFixed(3));
                    }

                    party.status = MIGRANT_PARTY_STATUS.ARRIVED;
                    party.survivors = survivors;

                    this.migrationHistory.push({
                        event: 'ARRIVAL',
                        partyId: party.partyId,
                        survivors,
                        dest: party.destId,
                        influxRatio: Number(influxRatio.toFixed(3)),
                        tick: currentTick
                    });
                }
            } else {
                remainingParties.push(party);
            }
        }

        this.inTransitParties = remainingParties;
    }

    /**
     * Audits total world population conservation.
     * Guaranteed: Sum(Settlements) + Sum(InTransit) + TotalCasualties === InitialPopulation
     */
    auditPopulationConservation(initialTotalWorldPop) {
        let currentSettlementPop = 0;
        for (const s of this.settlements.values()) {
            currentSettlementPop += s.population;
        }

        let inTransitPop = 0;
        for (const p of this.inTransitParties) {
            inTransitPop += p.headcount;
        }

        const accountedTotal = currentSettlementPop + inTransitPop + this.totalWorldCasualties;

        return {
            initialTotal: initialTotalWorldPop,
            currentSettlementPop,
            inTransitPop,
            casualties: this.totalWorldCasualties,
            accountedTotal,
            isConserved: accountedTotal === initialTotalWorldPop
        };
    }

    /**
     * Strictly verifies the Host Game Authority Invariant.
     */
    validateHostAuthorityInvariant(hostSettlement) {
        const snapshot = JSON.stringify(hostSettlement);
        this.registerSettlement(hostSettlement.id, hostSettlement);
        this.evaluatePushPressure(hostSettlement);
        const after = JSON.stringify(hostSettlement);
        return snapshot === after;
    }
}
