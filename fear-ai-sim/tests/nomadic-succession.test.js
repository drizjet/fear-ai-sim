import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    createNomadicConfederation,
    saveWorld,
    loadWorld,
} from '../closed-world.js';

// E26 — confederation tribal councils and nomadic succession dynamics.
// When a nomadic khagan falls or succession is vacant, the constituent
// clans convene in tribal council (kurultai). Votes are weighed by clan
// influence and loyalty. Loyal clans accept the council's majority
// verdict, while dissident low-loyalty clans fracture away into splinter
// hordes, dividing power strictly according to their influence.

describe('E26 nomadic confederation tribal councils and succession dynamics', () => {
    it('khagan mortality triggers succession crisis and tribal council election', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            power: 12,
            khagan: { id: 'old-khagan', name: 'Batu Khagan', health: 0, age: 65 },
            clans: [
                { id: 'clan-gold', name: 'Golden Clan', influence: 8, loyalty: 0.9, candidate: 'mongke' },
                { id: 'clan-silver', name: 'Silver Clan', influence: 6, loyalty: 0.8, candidate: 'mongke' },
                { id: 'clan-bronze', name: 'Bronze Clan', influence: 4, loyalty: 0.7, candidate: 'chagatai' },
            ],
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [conf],
        });

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        // Crisis was triggered
        const triggerEvents = world.events.filter(e => e.type === 'CONFEDERATION_SUCCESSION_TRIGGERED');
        expect(triggerEvents.length).toBe(1);
        expect(triggerEvents[0]).toMatchObject({
            confederationId: 'steppe-horde',
            previousKhaganId: 'old-khagan',
            reason: 'KHAGAN_DEATH',
        });

        // Council convened
        const councilEvents = world.events.filter(e => e.type === 'CONFEDERATION_COUNCIL_CONVENED');
        expect(councilEvents.length).toBe(1);
        expect(councilEvents[0].attendees).toEqual(['clan-gold', 'clan-silver', 'clan-bronze']);
        expect(councilEvents[0].votes.mongke).toBeGreaterThan(councilEvents[0].votes.chagatai);

        // Succession resolved with Mongke
        const resolveEvents = world.events.filter(e => e.type === 'CONFEDERATION_SUCCESSION_RESOLVED');
        expect(resolveEvents.length).toBe(1);
        expect(resolveEvents[0]).toMatchObject({
            confederationId: 'steppe-horde',
            newKhaganId: 'mongke',
        });

        // New khagan installed and crisis cleared
        expect(conf.khagan.id).toBe('mongke');
        expect(conf.khagan.health).toBe(1.0);
        expect(conf.successionCrisis).toBeNull();
        expect(conf.status).toBe('ACTIVE');
        expect(conf.power).toBe(12); // No fracture, power conserved
    });

    it('dissident low-loyalty clan fractures away and splits power proportionally', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            power: 24,
            khagan: { id: 'dying-khagan', name: 'Temur', health: 0, age: 70 },
            clans: [
                { id: 'clan-a', name: 'Clan A', influence: 12, loyalty: 0.9, candidate: 'candidate-a' },
                { id: 'clan-b', name: 'Clan B', influence: 6, loyalty: 0.7, candidate: 'candidate-a' },
                { id: 'clan-rebel', name: 'Rebel Clan', influence: 6, loyalty: 0.1, candidate: 'candidate-rebel' },
            ],
        });
        const world = createClosedWorldScenario({
            season: 'SUMMER',
            confederations: [conf],
        });

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        // Rebel clan backed candidate-rebel and lost, with loyalty 0.1 < 0.35 -> fractures
        const fractureEvents = world.events.filter(e => e.type === 'CONFEDERATION_FRACTURED');
        expect(fractureEvents.length).toBe(1);
        expect(fractureEvents[0]).toMatchObject({
            confederationId: 'steppe-horde',
            splinterClanId: 'clan-rebel',
        });

        // Proportional power split: totalInfluence = 12 + 6 + 6 = 24.
        // Rebel influence = 6 / 24 = 25%. 25% of 24 power = 6 power.
        expect(fractureEvents[0].powerSplit).toBeCloseTo(6, 4);
        expect(fractureEvents[0].remainingPower).toBeCloseTo(18, 4);
        expect(conf.power).toBeCloseTo(18, 4);

        // Splinter clan marked separated
        const rebelClan = conf.clans.find(c => c.id === 'clan-rebel');
        expect(rebelClan.status).toBe('SEPARATED');

        // Remaining clans installed candidate-a
        expect(conf.khagan.id).toBe('candidate-a');
        expect(conf.status).toBe('ACTIVE');
    });

    it('catastrophic power loss from fracturing can dissolve confederation', () => {
        const conf = createNomadicConfederation({
            id: 'fragile-horde',
            power: 0,
            khagan: { id: 'weak-khagan', health: 0 },
            clans: [
                { id: 'dominant-splinter', influence: 10, loyalty: 0.1, candidate: 'splinter-leader' },
                { id: 'remnant-clan', influence: 0.1, loyalty: 0.9, candidate: 'remnant-leader' },
            ],
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
        });

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        expect(conf.power).toBe(0);
        expect(conf.status).toBe('DISSOLVED');
        expect(world.events.some(e => e.type === 'CONFEDERATION_DISSOLVED')).toBe(true);
    });

    it('negative control: stable confederations with healthy khagan emit no council events', () => {
        const conf = createNomadicConfederation({
            id: 'peaceful-horde',
            power: 10,
            khagan: { id: 'strong-khagan', health: 1.0, age: 35 },
            clans: [
                { id: 'clan-1', influence: 5, loyalty: 0.9 },
                { id: 'clan-2', influence: 5, loyalty: 0.9 },
            ],
        });
        const world = createClosedWorldScenario({
            confederations: [conf],
        });

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        expect(world.events.some(e => e.type === 'CONFEDERATION_SUCCESSION_TRIGGERED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_COUNCIL_CONVENED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_SUCCESSION_RESOLVED')).toBe(false);
        expect(world.events.some(e => e.type === 'CONFEDERATION_FRACTURED')).toBe(false);
        expect(conf.khagan.id).toBe('strong-khagan');
    });

    it('negative control: worlds without nomadic confederations emit no nomadic events', () => {
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        expect(world.events.some(e => e.type.startsWith('CONFEDERATION_'))).toBe(false);
    });

    it('strict save/load resume equivalence across succession and council assembly', () => {
        const conf = createNomadicConfederation({
            id: 'steppe-horde',
            power: 15,
            khagan: { id: 'khagan-1', health: 0 },
            clans: [
                { id: 'clan-alpha', influence: 8, loyalty: 0.8, candidate: 'candidate-alpha' },
                { id: 'clan-beta', influence: 7, loyalty: 0.8, candidate: 'candidate-alpha' },
            ],
        });
        const world1 = createClosedWorldScenario({ confederations: [conf] });
        const savedJson = saveWorld(world1);
        const world2 = loadWorld(savedJson);

        tickClosedWorld(world1, { tick: 1, perceivedDanger: 0.2, encounterRng: () => 0.5 });
        tickClosedWorld(world2, { tick: 1, perceivedDanger: 0.2, encounterRng: () => 0.5 });

        expect(world1.events.length).toBe(world2.events.length);
        expect(world1.confederations[0].khagan).toEqual(world2.confederations[0].khagan);
        expect(world1.confederations[0].power).toBe(world2.confederations[0].power);
        expect(world1.confederations[0].status).toBe(world2.confederations[0].status);
    });
});
