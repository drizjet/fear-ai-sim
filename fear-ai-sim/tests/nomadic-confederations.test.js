import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    createNomadicConfederation,
    saveWorld,
    loadWorld,
} from '../closed-world.js';
import { StanceLadder, FactionRelationshipVector } from '../factionrelationship.js';
import { FactionDecisionModel } from '../factioncore.js';

// E25 — nomadic confederations and dynamic seasonal capitals.
// Non-territorial nomadic empires operate without fixed walls:
// they shift seasonal capitals as pasture and climate dictate,
// extract protection tribute from sedentary border towns, lend
// nomadic cavalry defense weight to their tributary walls, and
// mobilize punitive raids when tribute is refused or defaulted.

describe('E25 nomadic confederations and dynamic seasonal capitals', () => {
    it('seasonal capital relocates when season advances', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            name: 'Steppe Horde',
            seasonalCapitals: { summer: 'north-plains', winter: 'south-shelter' },
            currentCapital: 'north-plains',
            power: 10,
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [conf],
        });
        world.ticksPerSeason = 10; // Season advances every 10 ticks

        // Summer ticks: capital remains north-plains
        for (let t = 1; t <= 5; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        }
        expect(conf.currentCapital).toBe('north-plains');
        expect(world.events.some(e => e.type === 'SEASONAL_CAPITAL_RELOCATED')).toBe(false);

        // Tick past 10: Summer -> Autumn transition
        for (let t = 6; t <= 11; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        }
        expect(world.season).toBe('AUTUMN');
        expect(conf.currentCapital).toBe('south-shelter');

        const moveEvents = world.events.filter(e => e.type === 'SEASONAL_CAPITAL_RELOCATED');
        expect(moveEvents.length).toBeGreaterThan(0);
        expect(moveEvents[0]).toMatchObject({
            confederationId: 'steppe-horde',
            fromCapital: 'north-plains',
            toCapital: 'south-shelter',
            season: 'AUTUMN',
        });
    });

    it('tribute paid to confederation transfers resources and increases confederation power', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            seasonalCapitals: { summer: 'north', winter: 'south' },
            currentCapital: 'south',
            power: 5,
            tributeAgreements: [
                { townId: 'south', controllerId: 'south-faction', tributeRate: 0.2, status: 'ACTIVE' },
            ],
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [conf],
        });
        world.towns.get('south').population = 30;

        const initialPower = conf.power;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        const tributeEvents = world.events.filter(e => e.type === 'CONFEDERATION_TRIBUTE_PAID');
        expect(tributeEvents.length).toBe(1);
        const ev = tributeEvents[0];
        expect(ev.confederationId).toBe('steppe-horde');
        expect(ev.townId).toBe('south');
        expect(ev.controllerId).toBe('south-faction');
        expect(ev.amount).toBeGreaterThan(0);

        expect(conf.power).toBeCloseTo(initialPower + ev.amount, 9);
    });

    it('nomadic confederation lends defense weight to tributary town walls', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            seasonalCapitals: { summer: 'north', winter: 'south' },
            currentCapital: 'south',
            power: 8,
            tributeAgreements: [
                { townId: 'south', controllerId: 'south-faction', tributeRate: 0.2, status: 'ACTIVE' },
            ],
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [conf],
        });
        world.towns.get('south').population = 20;

        // Add external attacker at WAR stance
        const eastFaction = new FactionDecisionModel({ id: 'east-faction', townId: 'east', resources: 10, maxResources: 10 });
        eastFaction.grievance = 1;
        eastFaction.lastDecision = 'RAID';
        eastFaction.informationConfidence = 1;
        world.factions.push(eastFaction);

        const pair = new FactionRelationshipVector('east-faction', 'south-faction');
        pair.setGrievanceFrom('east-faction', 1);
        pair.setTrustFrom('east-faction', 0);
        pair.observeFrom('east-faction', StanceLadder.WAR, 1);
        world.relationships.set('east-faction::south-faction', pair);

        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        const gates = world.events.filter(e => e.type === 'TAKEOVER_GATE' && e.townId === 'south' && e.factionId === 'east-faction');
        expect(gates.length).toBeGreaterThan(0);
        const gate = gates[0];
        // Base defense is south-faction resources + pop * 0.1, capped allied weight includes conf.power * 0.5 = 4
        expect(gate.alliedWeight).toBeGreaterThan(0);
    });

    it('punitive raid mobilized when town controller defaults or enters WAR', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            seasonalCapitals: { summer: 'north', winter: 'south' },
            currentCapital: 'south',
            power: 6,
            tributeAgreements: [
                { townId: 'south', controllerId: 'south-faction', tributeRate: 0.2, status: 'ACTIVE' },
            ],
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [conf],
        });

        // Controller enters WAR stance toward the confederation
        const pair = new FactionRelationshipVector('south-faction', 'steppe-horde');
        pair.observeFrom('south-faction', StanceLadder.WAR, 1);
        world.relationships.set('south-faction::steppe-horde', pair);

        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        const raidEvents = world.events.filter(e => e.type === 'CONFEDERATION_RAID_MOBILIZED');
        expect(raidEvents.length).toBe(1);
        expect(raidEvents[0]).toMatchObject({
            confederationId: 'steppe-horde',
            townId: 'south',
            controllerId: 'south-faction',
            reason: 'CONTROLLER_WAR_STANCE',
        });
        expect(conf.tributeAgreements[0].status).toBe('BROKEN');
    });

    it('sedentary worlds without confederations emit zero confederation events', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 5;
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        }
        expect(world.events.some(e => e.type === 'SEASONAL_CAPITAL_RELOCATED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_TRIBUTE_PAID')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_RAID_MOBILIZED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_DISSOLVED')).toBe(false);
    });

    it('nomadic confederations survive save/load round-trip with resume equivalence', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            seasonalCapitals: { summer: 'north-plains', winter: 'south-shelter' },
            currentCapital: 'north-plains',
            power: 10,
            tributeAgreements: [
                { townId: 'south', controllerId: 'south-faction', tributeRate: 0.2, status: 'ACTIVE' },
            ],
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [conf],
        });
        world.ticksPerSeason = 5;

        for (let t = 1; t <= 5; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        }

        const resumed = loadWorld(saveWorld(world));

        for (let t = 6; t <= 10; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
            tickClosedWorld(resumed, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        }

        const worldMoves = world.events.filter(e => e.type === 'SEASONAL_CAPITAL_RELOCATED');
        const resumedMoves = resumed.events.filter(e => e.type === 'SEASONAL_CAPITAL_RELOCATED');
        expect(resumedMoves.length).toBe(worldMoves.length);
        expect(resumedMoves[0].toCapital).toBe(worldMoves[0].toCapital);

        const worldTributes = world.events.filter(e => e.type === 'CONFEDERATION_TRIBUTE_PAID');
        const resumedTributes = resumed.events.filter(e => e.type === 'CONFEDERATION_TRIBUTE_PAID');
        expect(resumedTributes.length).toBe(worldTributes.length);

        expect(resumed.confederations[0].power).toBeCloseTo(world.confederations[0].power, 9);
        expect(resumed.confederations[0].currentCapital).toBe(world.confederations[0].currentCapital);
    });
});
