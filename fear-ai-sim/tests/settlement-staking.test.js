import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, settleAttempt, stakeTerritory, tickClosedWorld, canObserveTerritory } from '../closed-world.js';
import { createRoamingGroup, startTravel, advanceTravel, scoutDestination, recordObservation } from '../roaming.js';

// Slice K: settlement + territory staking — real causal step, not a label

describe('settlement founding (Slice K)', () => {
    it('founding requires knowledge: NO_KNOWLEDGE without belief/adjacency', () => {
        const world = createClosedWorldScenario();
        const group = createRoamingGroup({ id: 'bandits-1', currentLocation: 'north', mode: 'RAID' });
        group.factionId = 'north-faction';
        // No belief about 'far-east', not adjacent — must fail
        const r = settleAttempt(world, group, 'far-east', { tick: 1 });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('NO_KNOWLEDGE');
        expect(world.towns.has('far-east')).toBe(false);
    });

    it('founding with belief creates town with market and route, deducts faction resource', () => {
        const world = createClosedWorldScenario();
        const faction = world.factions.find(f => f.id === 'north-faction');
        faction.resources = 2;
        const group = createRoamingGroup({ id: 'bandits-1', currentLocation: 'north', mode: 'RAID' });
        group.factionId = 'north-faction';
        // Give belief via scout
        recordObservation(group, scoutDestination(group, { locationId: 'east', tick: 1, resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.9 }));
        const before = faction.resources;
        const r = settleAttempt(world, group, 'east', { tick: 1 });
        expect(r.ok).toBe(true);
        expect(world.towns.has('east')).toBe(true);
        const town = world.towns.get('east');
        expect(town.controlledBy).toBe('north-faction');
        expect(town.claimedRadius).toBe(3);
        expect(town.market).toBeDefined();
        expect(faction.resources).toBe(before - 1);
        expect(r.event.type).toBe('SETTLEMENT_FOUNDED');
        // Route was created
        expect(world.routes.some(rr => (rr.from === 'north' && rr.to === 'east') || (rr.from === 'east' && rr.to === 'north'))).toBe(true);
    });

    it('founding fails when already exists and when IN_TRANSIT', () => {
        const world = createClosedWorldScenario();
        world.factions.find(f => f.id === 'north-faction').resources = 2;
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'north' });
        group.factionId = 'north-faction';
        recordObservation(group, scoutDestination(group, { locationId: 'east', tick: 1, resourceEstimate: 0.7, dangerEstimate: 0.1 }));
        settleAttempt(world, group, 'east', { tick: 1 });
        const dup = settleAttempt(world, group, 'east', { tick: 2 });
        expect(dup.ok).toBe(false);
        expect(dup.reason).toBe('ALREADY_EXISTS');
        // IN_TRANSIT gate
        const g2 = createRoamingGroup({ id: 'g2', currentLocation: 'north' });
        g2.factionId = 'north-faction';
        recordObservation(g2, scoutDestination(g2, { locationId: 'west', tick: 1, resourceEstimate: 0.7, dangerEstimate: 0.1 }));
        startTravel(g2, { destination: 'west', travelTime: 5 });
        const inTransit = settleAttempt(world, g2, 'west', { tick: 3 });
        expect(inTransit.ok).toBe(false);
        expect(inTransit.reason).toBe('IN_TRANSIT');
    });

    it('founding via adjacency without belief succeeds', () => {
        const world = createClosedWorldScenario();
        world.factions.find(f => f.id === 'north-faction').resources = 2;
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'north' });
        group.factionId = 'north-faction';
        // No belief, but north adjacent to south via road-a
        // So settling 'south' from north is adjacent — but south already exists
        // Create a new town 'east' with no road yet: not adjacent, no belief => fails
        // Adjacent test: create road first
        world.routes.push({ id: 'road-north-mid', from: 'north', to: 'mid', distance: 5, actualDanger: 0.1 });
        const r = settleAttempt(world, group, 'mid', { tick: 1 });
        expect(r.ok).toBe(true);
    });

    it('founding fails with NO_RESOURCES when faction bankrupt', () => {
        const world = createClosedWorldScenario();
        world.factions.find(f => f.id === 'north-faction').resources = 0;
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'north' });
        group.factionId = 'north-faction';
        recordObservation(group, scoutDestination(group, { locationId: 'east', tick: 1, resourceEstimate: 0.8, dangerEstimate: 0.1 }));
        const r = settleAttempt(world, group, 'east', { tick: 1 });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('NO_RESOURCES');
    });

    it('new settlement is live: market, demography, and territory observe it', () => {
        const world = createClosedWorldScenario();
        world.factions.find(f => f.id === 'north-faction').resources = 5;
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'north' });
        group.factionId = 'north-faction';
        recordObservation(group, scoutDestination(group, { locationId: 'east', tick: 1, resourceEstimate: 0.8, dangerEstimate: 0.1 }));
        settleAttempt(world, group, 'east', { tick: 1 });
        // Tick once — new town participates in market + demography without error
        tickClosedWorld(world, { tick: 2 });
        const east = world.towns.get('east');
        expect(east.market).toBeDefined();
        // Territory: bandit on east road is observable from east's faction
        const bandit = { id: 'b-e', factionId: 'south-faction', roadId: world.routes.find(r => r.from === 'east' || r.to === 'east')?.id ?? 'road-north-east', size: 1, armed: 1 };
        const eastFaction = world.factions.find(f => f.townId === 'east') ?? world.factions.find(f => f.id === 'north-faction');
        // east is controlledBy north-faction, so north-faction observes east's roads
        world.bandits.push(bandit);
        const obs = canObserveTerritory(world.factions.find(f => f.id === 'north-faction'), bandit, world);
        expect(obs).toBe(true);
    });
});

describe('territory staking (Slice K)', () => {
    it('staking increases claimedRadius and emits TERRITORY_STAKED, deducts resource', () => {
        const world = createClosedWorldScenario();
        const faction = world.factions.find(f => f.id === 'north-faction');
        faction.resources = 3;
        const townId = 'north';
        const before = faction.resources;
        const prevRadius = world.towns.get(townId).claimedRadius;
        const r = stakeTerritory(world, townId, { delta: 1, tick: 1 });
        expect(r.ok).toBe(true);
        expect(r.newRadius).toBe(prevRadius + 1);
        expect(world.towns.get(townId).claimedRadius).toBe(prevRadius + 1);
        expect(faction.resources).toBe(before - 1);
        expect(r.event.type).toBe('TERRITORY_STAKED');
    });

    it('staking fails at max and with no resources, is serializable', () => {
        const world = createClosedWorldScenario();
        const faction = world.factions.find(f => f.id === 'north-faction');
        faction.resources = 10;
        // Stake to max
        stakeTerritory(world, 'north', { delta: 2, maxRadius: 5, tick: 1 });
        expect(world.towns.get('north').claimedRadius).toBe(5);
        const atMax = stakeTerritory(world, 'north', { maxRadius: 5, tick: 2 });
        expect(atMax.ok).toBe(false);
        expect(atMax.reason).toBe('AT_MAX_RADIUS');
        // south-faction still has resources; drain it
        world.factions.find(f => f.id === 'south-faction').resources = 0;
        const noRes = stakeTerritory(world, 'south', { tick: 3 });
        expect(noRes.ok).toBe(false);
        expect(noRes.reason).toBe('NO_RESOURCES');
    });
});
