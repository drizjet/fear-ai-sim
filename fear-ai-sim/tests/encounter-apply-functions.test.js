// World-Completion Directive §89 / §96 / §532.
//
// The prior slice (EVID-2026-08-28-ENCOUNTER-LIVE-INSTANTIATE)
// wired the `bandit-ambush` encounter into the live closed-world
// reducer. The other 4 templates (`broken-caravan`,
// `patrol-checkpoint`, `refugee-group`, `wildlife-encounter`)
// were no-op defaults — the encounter was observed but caused
// no state change. This slice adds the `apply` functions for
// the remaining 4 templates.
//
// Each template mutates authoritative world state in a way
// that matches its narrative:
//   - broken-caravan: a merchant with low cargo limps toward
//     a settlement. The apply consumes a fraction of the
//     merchant's remaining cargo as a "settling cost" and
//     delivers the rest to the nearest town.
//   - patrol-checkpoint: a guard faction with resources
//     inspects a merchant. The apply levies a small toll
//     (resources flow from the merchant's cargo to the
//     guard's faction.resources) and records the inspection.
//   - refugee-group: a war-driven refugee group approaches
//     a settlement. The apply increments the destination
//     town's population (the refugees are absorbed) and
//     emits a population-change signal.
//   - wildlife-encounter: wildlife appears on an undefended
//     route. The apply leaves no cargo loss but adds a
//     wildlife observation to the world's wildlife
//     collection (a new `world.wildlife` array).
//
// The §91 contract: "Do not spawn impossible actors. ... World
// state determines plausibility." Each apply function checks
// the precondition before mutating; if the precondition is not
// met, the function returns null (and no event is emitted).

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { instantiateEncounter, encounterCatalog } from '../encounters.js';

describe('encounter apply functions (Constitution §89 / §96 / §532)', () => {
    it('broken-caravan apply delivers merchant cargo to the nearest town', () => {
        // The merchant has low cargo (post-raid). The
        // apply: take 20% as settling cost, deliver the
        // rest to the merchant's current town.
        const world = createClosedWorldScenario();
        const template = encounterCatalog().find(t => t.id === 'broken-caravan');
        const merchant = world.merchants[0];
        merchant.cargo = 5;
        merchant.location = 'north';
        const before = merchant.cargo;
        const result = instantiateEncounter(template, world, { tick: 1, rng: () => 0.5 });
        expect(result).toBeDefined();
        // The §96 contract: the encounter mutates world
        // state. The merchant's cargo should decrease
        // (some was consumed as settling cost).
        expect(merchant.cargo).toBeLessThan(before);
        const encEvent = world.events.find(e => e.type === 'ENCOUNTER' && e.encounterId === 'broken-caravan');
        expect(encEvent).toBeDefined();
        expect(encEvent.result.merchantId).toBe('merchant-1');
        // The remaining cargo after settling cost.
        expect(encEvent.result.settlingCost).toBeGreaterThan(0);
    });

    it('patrol-checkpoint apply levies a toll from merchant cargo to guard faction resources', () => {
        // The patrol encounters a merchant with cargo.
        // The apply: 10% of merchant cargo becomes guard
        // faction resources. The merchant's cargo decreases.
        const world = createClosedWorldScenario();
        const template = encounterCatalog().find(t => t.id === 'patrol-checkpoint');
        const merchant = world.merchants[0];
        merchant.cargo = 20;
        const guardFaction = world.factions[0]; // north-faction
        // Ensure guard not at cap so toll can increase within ALWAYS cap
        guardFaction.resources = 0;
        guardFaction.maxResources = 5;
        const beforeFactionResources = guardFaction.resources;
        const beforeMerchantCargo = merchant.cargo;
        const result = instantiateEncounter(template, world, { tick: 1, rng: () => 0.5 });
        expect(result).toBeDefined();
        // The merchant's cargo decreased.
        expect(merchant.cargo).toBeLessThan(beforeMerchantCargo);
        // The guard faction's resources increased (the
        // toll flows from the merchant to the faction).
        expect(guardFaction.resources).toBeGreaterThan(beforeFactionResources);
        const encEvent = world.events.find(e => e.type === 'ENCOUNTER' && e.encounterId === 'patrol-checkpoint');
        expect(encEvent).toBeDefined();
        expect(encEvent.result.toll).toBeGreaterThan(0);
        expect(encEvent.result.guardFactionId).toBe('north-faction');
    });

    it('refugee-group apply camps the arrivals at the destination town', () => {
        // E7: a refugee group of size N (a fraction of the source
        // faction's grievance, capped at 3) approaches a settlement.
        // Arrival camps — the town population does not move until
        // heads integrate via tickRefugeeCamps.
        const world = createClosedWorldScenario();
        const template = encounterCatalog().find(t => t.id === 'refugee-group');
        // Set up the precondition: faction with grievance > 0.3.
        world.factions[0].grievance = 0.6;
        const northPop = world.towns.get('north').population;
        const result = instantiateEncounter(template, world, { tick: 1, rng: () => 0.5 });
        expect(result).toBeDefined();
        expect(world.towns.get('north').population).toBe(northPop);
        const camps = (world.refugeeCamps ?? []).filter(c => c.status === 'CAMPED');
        expect(camps.length).toBe(1);
        expect(camps[0].size).toBe(result.refugeeCount);
        expect(result.campId).toBe(camps[0].id);
        const encEvent = world.events.find(e => e.type === 'ENCOUNTER' && e.encounterId === 'refugee-group');
        expect(encEvent).toBeDefined();
        expect(encEvent.result.refugeeCount).toBeGreaterThan(0);
    });

    it('wildlife-encounter apply adds a wildlife sighting to the world', () => {
        // The apply: no cargo loss, but a wildlife sighting
        // is recorded on world.wildlife (a new collection).
        const world = createClosedWorldScenario();
        const template = encounterCatalog().find(t => t.id === 'wildlife-encounter');
        const result = instantiateEncounter(template, world, { tick: 1, rng: () => 0.5 });
        expect(result).toBeDefined();
        // A wildlife sighting was added.
        expect(Array.isArray(world.wildlife)).toBe(true);
        expect(world.wildlife.length).toBe(1);
        expect(world.wildlife[0].route).toBeDefined();
        expect(world.wildlife[0].tick).toBe(1);
        const encEvent = world.events.find(e => e.type === 'ENCOUNTER' && e.encounterId === 'wildlife-encounter');
        expect(encEvent).toBeDefined();
        expect(encEvent.result.sightingId).toBeDefined();
    });

    it('apply functions return null when the precondition is not met', () => {
        // The §91 contract: "Do not spawn impossible
        // actors." If the precondition is not met (e.g.
        // broken-caravan requires low cargo, refugee-group
        // requires grievance > 0.3), the apply returns
        // null and no event is emitted.
        const world = createClosedWorldScenario();
        // Merchant has high cargo, so broken-caravan is
        // not plausible.
        world.merchants[0].cargo = 100;
        const bcTemplate = encounterCatalog().find(t => t.id === 'broken-caravan');
        const result = instantiateEncounter(bcTemplate, world, { tick: 1, rng: () => 0.5 });
        expect(result).toBeNull();
        // No ENCOUNTER event was pushed.
        const encEvent = world.events.find(e => e.type === 'ENCOUNTER' && e.encounterId === 'broken-caravan');
        expect(encEvent).toBeUndefined();
    });
});
