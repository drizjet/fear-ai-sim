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

// E27 — nomadic inter-confederation steppe diplomacy and khaganate unification.
// Multi-confederation steppe geopolitics:
// 1. Balanced peers seal demarcation pacts that protect mutual tributary networks.
// 2. Hegemonic superiority or crisis vulnerability triggers khaganate unification
//    with zero-sum power pooling and clan/tribute absorption.
// 3. Unpacted confederations sharing seasonal pastures contest them via skirmishes
//    with proportional power attrition.

describe('E27 nomadic inter-confederation steppe diplomacy and unification', () => {
    it('peer confederations seal demarcation pacts (CONFEDERATION_DEMARCATION_SEALED)', () => {
        const confA = createNomadicConfederation({
            id: 'golden-horde',
            name: 'Golden Horde',
            power: 10,
            seasonalCapitals: { summer: 'north-steppe', winter: 'east-shelter' },
            currentCapital: 'north-steppe',
        });
        const confB = createNomadicConfederation({
            id: 'silver-horde',
            name: 'Silver Horde',
            power: 8,
            seasonalCapitals: { summer: 'south-steppe', winter: 'west-shelter' },
            currentCapital: 'south-steppe',
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [confA, confB],
        });

        tickClosedWorld(world, { tick: 1 });

        const sealedEvents = world.events.filter(e => e.type === 'CONFEDERATION_DEMARCATION_SEALED');
        expect(sealedEvents.length).toBe(1);
        expect(sealedEvents[0].confederationIdA).toBe('golden-horde');
        expect(sealedEvents[0].confederationIdB).toBe('silver-horde');
        expect(sealedEvents[0].powerA).toBe(10);
        expect(sealedEvents[0].powerB).toBe(8);

        const treaty = (world.treaties ?? []).find(t => t.terms?.kind === 'demarcation');
        expect(treaty).toBeDefined();
        expect(treaty.participants).toContain('golden-horde');
        expect(treaty.participants).toContain('silver-horde');
    });

    it('demarcation pact blocks punitive raid on partner tributary town (CONFEDERATION_DEMARCATION_BLOCKED_RAID)', () => {
        const confA = createNomadicConfederation({
            id: 'golden-horde',
            name: 'Golden Horde',
            power: 10,
            tributeAgreements: [
                { townId: 'north', controllerId: 'north-faction', rate: 1, status: 'ACTIVE' },
            ],
        });
        const confB = createNomadicConfederation({
            id: 'silver-horde',
            name: 'Silver Horde',
            power: 8,
            tributeAgreements: [
                { townId: 'north', controllerId: 'north-faction', rate: 1, status: 'ACTIVE' },
            ],
        });
        const treaty = createTreaty({
            id: 'treaty-demarcation-golden-silver',
            participants: ['golden-horde', 'silver-horde'],
            terms: { kind: 'demarcation', scope: 'steppe-pastures' },
            startTick: 0,
        });

        const world = createClosedWorldScenario({
            season: 'SPRING',
            confederations: [confA, confB],
        });
        world.treaties.push(treaty);

        // Controller enters WAR stance toward golden-horde
        const pair = new FactionRelationshipVector('north-faction', 'golden-horde');
        pair.observeFrom('north-faction', StanceLadder.WAR, 1);
        world.relationships.set('north-faction::golden-horde', pair);

        tickClosedWorld(world, { tick: 1 });

        const blockedEvents = world.events.filter(e => e.type === 'CONFEDERATION_DEMARCATION_BLOCKED_RAID');
        expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
        const raidEvents = world.events.filter(e => e.type === 'CONFEDERATION_RAID_MOBILIZED');
        expect(raidEvents.length).toBe(0);
    });

    it('hegemonic power disparity triggers khaganate unification with zero-sum power transfer', () => {
        const dominant = createNomadicConfederation({
            id: 'great-khaganate',
            name: 'Great Khaganate',
            power: 25,
            clans: [{ id: 'clan-alpha', name: 'Alpha Clan', influence: 10, loyalty: 0.9 }],
            seasonalCapitals: { summer: 'high-plateau', winter: 'canyon-shelter' },
            currentCapital: 'high-plateau',
        });
        const weaker = createNomadicConfederation({
            id: 'splinter-horde',
            name: 'Splinter Horde',
            power: 5,
            clans: [{ id: 'clan-beta', name: 'Beta Clan', influence: 3, loyalty: 0.6 }],
            tributeAgreements: [{ townId: 'south', controllerId: 'south-faction', rate: 0.5, status: 'ACTIVE' }],
            seasonalCapitals: { summer: 'low-meadow', winter: 'river-bend' },
            currentCapital: 'low-meadow',
        });

        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [dominant, weaker],
        });

        tickClosedWorld(world, { tick: 1 });

        const unifiedEvents = world.events.filter(e => e.type === 'KHAGANATE_UNIFICATION_SEALED');
        expect(unifiedEvents.length).toBe(1);
        expect(unifiedEvents[0].dominantId).toBe('great-khaganate');
        expect(unifiedEvents[0].absorbedId).toBe('splinter-horde');
        expect(unifiedEvents[0].transferredPower).toBeCloseTo(5, 1);
        expect(unifiedEvents[0].totalPower).toBeCloseTo(30, 1);
        expect(unifiedEvents[0].reason).toBe('HEGEMONIC_SUPERIORITY');

        expect(dominant.power).toBeCloseTo(30, 1);
        expect(weaker.power).toBe(0);
        expect(weaker.status).toBe('ABSORBED');
        expect(weaker.dissolved).toBe(true);

        // Clans absorbed with dampened loyalty
        expect(dominant.clans.some(c => c.id === 'clan-beta')).toBe(true);
        // Tribute agreements transferred
        expect(dominant.tributeAgreements.some(a => a.townId === 'south')).toBe(true);
    });

    it('succession crisis vulnerability induces khaganate unification', () => {
        const dominant = createNomadicConfederation({
            id: 'neighbor-khaganate',
            name: 'Neighbor Khaganate',
            power: 12,
            seasonalCapitals: { summer: 'high-plateau', winter: 'canyon-shelter' },
            currentCapital: 'high-plateau',
        });
        const weaker = createNomadicConfederation({
            id: 'crisis-horde',
            name: 'Crisis Horde',
            power: 8,
            successionCrisis: { active: true, reason: 'KHAGAN_DEATH', tickStarted: 0 },
            seasonalCapitals: { summer: 'low-meadow', winter: 'river-bend' },
            currentCapital: 'low-meadow',
        });

        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [dominant, weaker],
        });

        tickClosedWorld(world, { tick: 1 });

        const unifiedEvents = world.events.filter(e => e.type === 'KHAGANATE_UNIFICATION_SEALED');
        expect(unifiedEvents.length).toBe(1);
        expect(unifiedEvents[0].dominantId).toBe('neighbor-khaganate');
        expect(unifiedEvents[0].absorbedId).toBe('crisis-horde');
        expect(unifiedEvents[0].reason).toBe('CRISIS_SUBJUGATION');
        expect(dominant.power).toBe(20);
        expect(weaker.power).toBe(0);
    });

    it('overlapping seasonal pasture migration triggers pasture skirmish with attrition', () => {
        const confA = createNomadicConfederation({
            id: 'horde-north',
            name: 'Horde North',
            power: 15,
            seasonalCapitals: { summer: 'shared-pasture', winter: 'north-winter' },
            currentCapital: 'shared-pasture',
        });
        const confB = createNomadicConfederation({
            id: 'horde-south',
            name: 'Horde South',
            power: 10,
            seasonalCapitals: { summer: 'shared-pasture', winter: 'south-winter' },
            currentCapital: 'shared-pasture',
        });

        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [confA, confB],
        });

        // Set hostile relations between horde-north and horde-south so they do not demarcate
        const pair = new FactionRelationshipVector('horde-north', 'horde-south');
        pair.observeFrom('horde-north', StanceLadder.WAR, 1);
        world.relationships.set('horde-north::horde-south', pair);

        tickClosedWorld(world, { tick: 1 });

        const skirmishEvents = world.events.filter(e => e.type === 'PASTURE_SKIRMISH_CONTESTED');
        expect(skirmishEvents.length).toBe(1);
        expect(skirmishEvents[0].pastureId).toBe('shared-pasture');
        expect(skirmishEvents[0].winnerId).toBe('horde-north');
        expect(skirmishEvents[0].loserId).toBe('horde-south');
        expect(skirmishEvents[0].attrition).toBe(1.0); // 10 * 0.1

        expect(confA.power).toBe(14.0);
        expect(confB.power).toBe(9.0);
    });

    it('negative control: single-confederation and sedentary worlds emit zero steppe diplomacy events', () => {
        const conf = createNomadicConfederation({
            id: 'lone-horde',
            name: 'Lone Horde',
            power: 10,
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
        });

        tickClosedWorld(world, { tick: 1 });

        expect(world.events.some(e => e.type === 'CONFEDERATION_DEMARCATION_SEALED')).toBe(false);
        expect(world.events.some(e => e.type === 'KHAGANATE_UNIFICATION_SEALED')).toBe(false);
        expect(world.events.some(e => e.type === 'PASTURE_SKIRMISH_CONTESTED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_DEMARCATION_BLOCKED_RAID')).toBe(false);
    });

    it('save/load resume equivalence preserves steppe diplomacy and treaties', () => {
        const confA = createNomadicConfederation({
            id: 'horde-a',
            name: 'Horde A',
            power: 12,
            seasonalCapitals: { summer: 'pasture-a', winter: 'winter-a' },
            currentCapital: 'pasture-a',
        });
        const confB = createNomadicConfederation({
            id: 'horde-b',
            name: 'Horde B',
            power: 10,
            seasonalCapitals: { summer: 'pasture-b', winter: 'winter-b' },
            currentCapital: 'pasture-b',
        });

        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [confA, confB],
        });

        tickClosedWorld(world, { tick: 1 });
        const json = saveWorld(world);
        const restored = loadWorld(json);

        tickClosedWorld(world, { tick: 2 });
        tickClosedWorld(restored, { tick: 2 });

        expect(restored.events.length).toBe(world.events.length);
        const restoredTreaty = (restored.treaties ?? []).find(t => t.terms?.kind === 'demarcation');
        const originalTreaty = (world.treaties ?? []).find(t => t.terms?.kind === 'demarcation');
        expect(restoredTreaty?.id).toBe(originalTreaty?.id);
    });
});
