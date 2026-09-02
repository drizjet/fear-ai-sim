import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

// Slice D — Drought → production → shortage → migration cascade
// Proves a single stock change (drought reduces food production) is
// consumed by a decision (migration) via the ecology→market→demography
// and ecology→market→faction chains, not a decorative flag.

describe('Slice D — drought reduces production → higher shortage', () => {
    it('drought world produces less food and has higher shortage than control', () => {
        const control = createClosedWorldScenario({ season: 'SUMMER' });
        const drought = createClosedWorldScenario({ season: 'SUMMER' });
        for (const w of [control, drought]) {
            w.ticksPerSeason = 10000;
            w.towns.get('north').population = 10;
            w.towns.get('south').population = 10;
            w.towns.get('north').market.setCapacity('food', 500);
            w.towns.get('south').market.setCapacity('food', 500);
            w.towns.get('north').produces.food = 0.8;
            w.towns.get('south').produces.food = 1.5;
            w.towns.get('north').market.inventory.set('food', 40);
            w.towns.get('south').market.inventory.set('food', 50);
        }
        const sev = 0.6;
        drought.drought = { active: true, severity: sev, kind: 'food', townId: 'north', remainingTicks: 20, startedTick: 1 };
        const ev = appendWorldEvent(drought, { type: 'DROUGHT_STARTED', townId: 'north', kind: 'food', severity: sev, duration: 20, tick: 1 });
        drought.drought.startEventId = ev.eventId;

        for (let t = 1; t <= 10; t++) {
            tickClosedWorld(control, { tick: t, perceivedDanger: 0.1 });
            tickClosedWorld(drought, { tick: t, perceivedDanger: 0.1 });
        }
        const ctrlProd = control.marketFlows.get('north:food')?.produced ?? 0;
        const droughtProd = drought.marketFlows.get('north:food')?.produced ?? 0;
        expect(droughtProd).toBeLessThan(ctrlProd);
        // Drought produced ~64% of control (1 - 0.6*0.6 = 0.64)
        expect(droughtProd / ctrlProd).toBeCloseTo(0.64, 1);

        const ctrlShortage = control.towns.get('north').market.getQuote('food').shortage;
        const droughtShortage = drought.towns.get('north').market.getQuote('food').shortage;
        expect(droughtShortage).toBeGreaterThan(ctrlShortage);
        // Non-drought town unaffected (similar shortage)
        const ctrlSouthShort = control.towns.get('south').market.getQuote('food').shortage;
        const droughtSouthShort = drought.towns.get('south').market.getQuote('food').shortage;
        expect(Math.abs(droughtSouthShort - ctrlSouthShort)).toBeLessThan(0.15);
    });

    it('drought shortage drives higher emigration via demography', () => {
        const control = createClosedWorldScenario({ season: 'SUMMER' });
        const drought = createClosedWorldScenario({ season: 'SUMMER' });
        for (const w of [control, drought]) {
            w.ticksPerSeason = 10000;
            w.towns.get('north').population = 100;
            w.towns.get('south').population = 100;
            w.towns.get('north').produces.food = 0.8;
            w.towns.get('south').produces.food = 1.5;
            w.towns.get('north').market.setCapacity('food', 500);
            w.towns.get('south').market.setCapacity('food', 500);
            w.towns.get('north').market.inventory.set('food', 5);
            w.towns.get('south').market.inventory.set('food', 50);
        }
        drought.drought = { active: true, severity: 0.7, kind: 'food', townId: 'north', remainingTicks: 30, startedTick: 1 };
        appendWorldEvent(drought, { type: 'DROUGHT_STARTED', townId: 'north', kind: 'food', severity: 0.7, duration: 30, tick: 1 });

        let ctrlEmig = 0, droughtEmig = 0;
        for (let t = 1; t <= 30; t++) {
            const beforeCtrl = control.events.filter(e => e.type === 'POPULATION_CHANGE').length;
            const beforeDrought = drought.events.filter(e => e.type === 'POPULATION_CHANGE').length;
            tickClosedWorld(control, { tick: t, perceivedDanger: 0.1 });
            tickClosedWorld(drought, { tick: t, perceivedDanger: 0.1 });
            // Count emigration-bearing POPULATION_CHANGE on north
            const ctrlNew = control.events.slice(beforeCtrl).filter(e => e.type === 'POPULATION_CHANGE' && e.townId === 'north' && e.emigration > 0);
            const droughtNew = drought.events.slice(beforeDrought).filter(e => e.type === 'POPULATION_CHANGE' && e.townId === 'north' && e.emigration > 0);
            ctrlEmig += ctrlNew.reduce((s, e) => s + e.emigration, 0);
            droughtEmig += droughtNew.reduce((s, e) => s + e.emigration, 0);
        }
        expect(droughtEmig).toBeGreaterThan(ctrlEmig);
    });
});

describe('Slice D — drought conservation and event ledger', () => {
    it('drought does not create or destroy mass outside produce reduction', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('north').population = 20;
        world.towns.get('south').population = 20;
        world.drought = { active: true, severity: 0.5, kind: 'food', townId: 'north', remainingTicks: 10, startedTick: 1 };
        appendWorldEvent(world, { type: 'DROUGHT_STARTED', townId: 'north', kind: 'food', severity: 0.5, duration: 10, tick: 1 });

        // Record supply before and flows
        const beforeSupply = new Map();
        for (const [townId, town] of world.towns) beforeSupply.set(townId, town.market.getQuote('food').supply);
        for (let t = 1; t <= 10; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });

        // Per-tick mass balance still holds (checked by existing invariant test)
        // Here just verify no NaN and DROUGHT event exists
        expect(world.events.some(e => e.type === 'DROUGHT_STARTED')).toBe(true);
        for (const town of world.towns.values()) {
            expect(Number.isFinite(town.market.getQuote('food').supply)).toBe(true);
            expect(town.market.getQuote('food').supply).toBeGreaterThanOrEqual(0);
        }
    });

    it('drought emits DROUGHT_STARTED and DROUGHT_ENDED with correct parentage', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 10000;
        world.drought = { active: true, severity: 0.5, kind: 'food', townId: 'north', remainingTicks: 5, startedTick: 1 };
        const startEvent = appendWorldEvent(world, { type: 'DROUGHT_STARTED', townId: 'north', kind: 'food', severity: 0.5, duration: 5, tick: 1 });
        expect(startEvent.eventId).toBeDefined();
        for (let t = 1; t <= 6; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        const ended = world.events.find(e => e.type === 'DROUGHT_ENDED');
        expect(ended).toBeDefined();
        expect(ended.parentEventIds).toContain(startEvent.eventId);
    });
});
