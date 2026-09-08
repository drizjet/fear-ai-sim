/**
 * tests/settlement-migration-system.test.js
 * Front C / Sections 46–47: Dynamic Migration Flow & Settlement Demographic Impact System Test Suite.
 */

import {
    SettlementMigrationSystem,
    MIGRATION_DRIVERS,
    MIGRANT_PARTY_STATUS
} from '../packages/core/index.js';

describe('Front C / Sections 46–47: Dynamic Settlement Migration & Demographic Impact System', () => {
    let system;

    beforeEach(() => {
        system = new SettlementMigrationSystem();
        system.registerSettlement('Northwatch', {
            population: 100,
            housingCapacity: 120,
            foodStock: 80.0,
            threatLevel: 0.1,
            garrisonStrength: 0.8
        });
        system.registerSettlement('Riverbend', {
            population: 80,
            housingCapacity: 100,
            foodStock: 10.0, // Famine conditions!
            threatLevel: 0.7, // War/terror conditions!
            garrisonStrength: 0.3
        });
    });

    test('1. Famine and war terror generate strong push pressure at origin settlement', () => {
        const riverbend = system.settlements.get('Riverbend');
        const push = system.evaluatePushPressure(riverbend);

        expect(push.netPush).toBeGreaterThan(0.40);
        expect([MIGRATION_DRIVERS.FAMINE_SCARCITY, MIGRATION_DRIVERS.WAR_TERROR]).toContain(push.primaryDriver);
    });

    test('2. High food stocks and strong garrisons generate high pull attraction at destination', () => {
        const northwatch = system.settlements.get('Northwatch');
        const pull = system.evaluatePullAttraction(northwatch, 0.1);

        expect(pull).toBeGreaterThan(0.50);
    });

    test('3. Dispatches bounded migrant wave while enforcing minimal settlement population floor', () => {
        const wave = system.evaluateMigrationWave('Riverbend', 'Northwatch', 0.2, 1);
        expect(wave).toBeDefined();
        expect(wave.headcount).toBeGreaterThan(0);
        expect(wave.headcount).toBeLessThanOrEqual(20); // <= 25% of pop

        const riverbend = system.settlements.get('Riverbend');
        expect(riverbend.population).toBeGreaterThanOrEqual(5); // Non-extinction floor
    });

    test('4. In-transit party arrives and applies labor boost and social friction consequences', () => {
        const wave = system.evaluateMigrationWave('Riverbend', 'Northwatch', 0.1, 1);
        expect(wave.status).toBe(MIGRANT_PARTY_STATUS.IN_TRANSIT);

        const initialNorthwatchPop = system.settlements.get('Northwatch').population;

        // Advance simulation ticks past arrival
        system.tick(6);

        const northwatch = system.settlements.get('Northwatch');
        expect(northwatch.population).toBe(initialNorthwatchPop + wave.headcount);
        expect(northwatch.laborBonus).toBeGreaterThan(1.0); // Boosted economic productivity
    });

    test('5. World population conservation theorem holds across multi-wave migrations', () => {
        const initialWorldPop = 100 + 80; // Northwatch (100) + Riverbend (80)

        // Wave 1
        system.evaluateMigrationWave('Riverbend', 'Northwatch', 0.1, 1);
        let audit = system.auditPopulationConservation(initialWorldPop);
        expect(audit.isConserved).toBe(true);

        // Advance to mid-transit
        system.tick(3);
        audit = system.auditPopulationConservation(initialWorldPop);
        expect(audit.isConserved).toBe(true);

        // Advance to arrival
        system.tick(8);
        audit = system.auditPopulationConservation(initialWorldPop);
        expect(audit.isConserved).toBe(true);
        expect(audit.accountedTotal).toBe(initialWorldPop);
    });

    test('6. Strictly preserves Host Game Authority Invariant during demographic calculations', () => {
        const hostSettlement = {
            id: 'IronHills',
            population: 150,
            foodStock: 90.0,
            garrisonStrength: 0.6
        };

        const isUnmutated = system.validateHostAuthorityInvariant(hostSettlement);
        expect(isUnmutated).toBe(true);
        expect(hostSettlement.population).toBe(150);
    });
});
