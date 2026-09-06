import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    createNomadicConfederation,
    saveWorld,
    loadWorld,
} from '../closed-world.js';
import { createTreaty } from '../treaty.js';
import { FactionRelationshipVector, StanceLadder } from '../factionrelationship.js';

// E28 — nomadic steppe-sedentary peace conferences and frontier trade emporiums.
// Historical Steppe-Sedentary Equilibrium:
// 1. Bilateral peace conferences convene between confederations and sedentary towns.
// 2. Institutional trade emporiums are established on the frontier.
// 3. Bilateral market trade exchanges livestock/horses for grain/manufactured goods.
// 4. Frontier emporiums suppress punitive raids by fulfilling nomadic resource demands peacefully.
// 5. Hostility/war suspends emporiums, which can be resumed upon peace restoration.

describe('E28 nomadic steppe-sedentary peace conferences and frontier trade emporiums', () => {
    it('convenes peace conference and establishes frontier trade emporium (STEPPE_PEACE_CONFERENCE_CONVENED, CONFEDERATION_EMPORIUM_ESTABLISHED)', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            name: 'Steppe Horde',
            power: 10,
            tributeAgreements: [{ townId: 'south', controllerId: 'south-faction', rate: 0.5, status: 'ACTIVE', frontierEmporium: true }],
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
        });

        tickClosedWorld(world, { tick: 1 });

        const confEvents = world.events.filter(e => e.type === 'STEPPE_PEACE_CONFERENCE_CONVENED');
        expect(confEvents.length).toBeGreaterThanOrEqual(1);
        expect(confEvents[0].confederationId).toBe('steppe-horde');

        const estEvents = world.events.filter(e => e.type === 'CONFEDERATION_EMPORIUM_ESTABLISHED');
        expect(estEvents.length).toBeGreaterThanOrEqual(1);
        expect(estEvents[0].confederationId).toBe('steppe-horde');
        expect(estEvents[0].volume).toBe(10);

        const emporium = (world.emporiums ?? []).find(e => e.confederationId === 'steppe-horde');
        expect(emporium).toBeDefined();
        expect(emporium.status).toBe('ACTIVE');
        expect(emporium.volume).toBe(10);
    });

    it('active emporium blocks punitive raid on defaulting town (CONFEDERATION_EMPORIUM_BLOCKED_RAID)', () => {
        const conf = createNomadicConfederation({
            id: 'iron-horde',
            name: 'Iron Horde',
            power: 10,
            tributeAgreements: [{ townId: 'south', controllerId: 'south-faction', rate: 0.5, status: 'ACTIVE' }],
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
            emporiums: [{
                id: 'emporium-iron-horde-south',
                confederationId: 'iron-horde',
                townId: 'south',
                controllerId: 'south-faction',
                status: 'ACTIVE',
                volume: 10,
                establishedTick: 0,
            }],
        });

        // Controller enters WAR stance or has zero resources
        const pair = new FactionRelationshipVector('south-faction', 'iron-horde');
        pair.observeFrom('south-faction', StanceLadder.WAR, 1);
        world.relationships.set('south-faction::iron-horde', pair);

        tickClosedWorld(world, { tick: 1 });

        const blockedEvents = world.events.filter(e => e.type === 'CONFEDERATION_EMPORIUM_BLOCKED_RAID');
        expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
        expect(blockedEvents[0].confederationId).toBe('iron-horde');
        expect(blockedEvents[0].townId).toBe('south');

        const raidEvents = world.events.filter(e => e.type === 'CONFEDERATION_RAID_MOBILIZED');
        expect(raidEvents.length).toBe(0);
    });

    it('active emporium executes bilateral market trade (CONFEDERATION_EMPORIUM_TRADE_EXECUTED)', () => {
        const conf = createNomadicConfederation({
            id: 'silk-horde',
            name: 'Silk Horde',
            power: 8.0,
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
            emporiums: [{
                id: 'emporium-silk-horde-north',
                confederationId: 'silk-horde',
                townId: 'north',
                controllerId: 'north-faction',
                status: 'ACTIVE',
                volume: 10,
                establishedTick: 0,
            }],
        });

        const controller = (world.factions ?? []).find(f => f.id === 'north-faction');
        if (controller) {
            controller.resources = 0;
            controller.maxResources = 10;
        }

        tickClosedWorld(world, { tick: 1 });

        const tradeEvents = world.events.filter(e => e.type === 'CONFEDERATION_EMPORIUM_TRADE_EXECUTED');
        expect(tradeEvents.length).toBe(1);
        expect(tradeEvents[0].confederationId).toBe('silk-horde');
        expect(tradeEvents[0].volume).toBe(5);
        expect(tradeEvents[0].confederationPower).toBe(8.5);
        expect(tradeEvents[0].controllerResources).toBeGreaterThanOrEqual(1);

        // Power and resources incremented
        expect(conf.power).toBe(8.5);
        expect(controller.resources).toBeGreaterThan(0);
    });

    it('entering war stance suspends active emporium (CONFEDERATION_EMPORIUM_SUSPENDED)', () => {
        const conf = createNomadicConfederation({
            id: 'war-horde',
            name: 'War Horde',
            power: 10,
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
            emporiums: [{
                id: 'emporium-war-horde-north',
                confederationId: 'war-horde',
                townId: 'north',
                controllerId: 'north-faction',
                status: 'ACTIVE',
                volume: 10,
                establishedTick: 0,
            }],
        });

        // Controller declares WAR
        const pair = new FactionRelationshipVector('north-faction', 'war-horde');
        pair.observeFrom('north-faction', StanceLadder.WAR, 1);
        world.relationships.set('north-faction::war-horde', pair);

        tickClosedWorld(world, { tick: 1 });

        const suspendedEvents = world.events.filter(e => e.type === 'CONFEDERATION_EMPORIUM_SUSPENDED');
        expect(suspendedEvents.length).toBe(1);
        expect(suspendedEvents[0].confederationId).toBe('war-horde');
        expect(suspendedEvents[0].townId).toBe('north');
        expect(suspendedEvents[0].reason).toBe('FACTION_WAR_DECLARED');

        const emp = world.emporiums.find(e => e.id === 'emporium-war-horde-north');
        expect(emp.status).toBe('SUSPENDED');
    });

    it('re-establishing peaceful relations resumes suspended emporium (CONFEDERATION_EMPORIUM_RESUMED)', () => {
        const conf = createNomadicConfederation({
            id: 'peace-horde',
            name: 'Peace Horde',
            power: 10,
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
            emporiums: [{
                id: 'emporium-peace-horde-north',
                confederationId: 'peace-horde',
                townId: 'north',
                controllerId: 'north-faction',
                status: 'SUSPENDED',
                volume: 10,
                establishedTick: 0,
            }],
        });

        // Pair is at peaceful stance
        const pair = new FactionRelationshipVector('north-faction', 'peace-horde');
        pair.observeFrom('north-faction', StanceLadder.TOLERANT, 1);
        pair.observeFrom('peace-horde', StanceLadder.TOLERANT, 1);
        world.relationships.set('north-faction::peace-horde', pair);

        tickClosedWorld(world, { tick: 1 });

        const resumedEvents = world.events.filter(e => e.type === 'CONFEDERATION_EMPORIUM_RESUMED');
        expect(resumedEvents.length).toBe(1);
        expect(resumedEvents[0].confederationId).toBe('peace-horde');
        expect(resumedEvents[0].townId).toBe('north');

        const emp = world.emporiums.find(e => e.id === 'emporium-peace-horde-north');
        expect(emp.status).toBe('ACTIVE');
    });

    it('negative control: sedentary worlds without nomadic contact emit zero emporium events', () => {
        const world = createClosedWorldScenario();

        tickClosedWorld(world, { tick: 1 });

        expect(world.events.some(e => e.type === 'STEPPE_PEACE_CONFERENCE_CONVENED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_EMPORIUM_ESTABLISHED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_EMPORIUM_TRADE_EXECUTED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_EMPORIUM_BLOCKED_RAID')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_EMPORIUM_SUSPENDED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_EMPORIUM_RESUMED')).toBe(false);
    });

    it('save/load resume equivalence preserves emporiums, volumes, and state byte-identically', () => {
        const conf = createNomadicConfederation({
            id: 'frontier-horde',
            name: 'Frontier Horde',
            power: 10,
            tributeAgreements: [{ townId: 'north', controllerId: 'north-faction', rate: 0.5, status: 'ACTIVE', frontierEmporium: true }],
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
        });

        tickClosedWorld(world, { tick: 1 });
        const json = saveWorld(world);
        const restored = loadWorld(json);

        tickClosedWorld(world, { tick: 2 });
        tickClosedWorld(restored, { tick: 2 });

        expect(restored.events.length).toBe(world.events.length);
        expect(restored.emporiums.length).toBe(world.emporiums.length);
        expect(restored.emporiums[0].id).toBe(world.emporiums[0].id);
        expect(restored.emporiums[0].volume).toBe(world.emporiums[0].volume);
        expect(restored.emporiums[0].status).toBe(world.emporiums[0].status);
    });
});
