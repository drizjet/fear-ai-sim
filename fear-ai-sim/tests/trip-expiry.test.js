import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario, schedulePendingTradeTrip,
    advancePendingWorldObligations, getWorldEvents,
} from '../closed-world.js';
import { createPatrol } from '../canonical-trade-system.js';

// R7 (V8 audit MAT-004): an ARRIVED trip whose delivery can never
// complete must reach a terminal state — not sit ARRIVED forever
// with its consequence PENDING and its commitment/assignment
// ACTIVE forever.

describe('R7 — undeliverable arrivals expire instead of lingering', () => {
    it('arrival with a missing delivery market expires, closes, and prunes', () => {
        const world = createClosedWorldScenario();
        const faction = world.factions.find(f => f.id === 'north-faction');
        faction.resources = 5;
        faction.maxResources = 10;
        world.patrols = [createPatrol({ id: 'p1', route: 'road-a', factionId: 'north-faction' })];
        const merchant = world.merchants[0];
        merchant.cargo = 20;
        const trip = schedulePendingTradeTrip(world, {
            merchantId: merchant.id, routeId: 'road-a', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 5, travelTicks: 1, startTick: 0, patrolId: 'p1',
        });
        // The destination market vanishes before the consequence fires
        // (dueTick is startTick + travelTicks = 1, so tick 1 both
        // arrives and attempts delivery).
        world.towns.get('south').market = { id: 'south' };
        advancePendingWorldObligations(world, { tick: 1 });
        // The trip did arrive (arrival precedes consequences) and then
        // expired instead of lingering ARRIVED with a PENDING tail.
        expect(trip.arrivedTick).toBe(1);
        const expired = getWorldEvents(world, { types: ['TRIP_EXPIRED'] });
        expect(expired.length).toBe(1);
        expect(expired[0].tripId).toBe(trip.tripId);
        expect(expired[0].reason).toBe('NO_DELIVERY_MARKET');
        const consequence = world.scheduledConsequences.find(c => c.tripId === trip.tripId);
        expect(consequence.status).toBe('EXPIRED');
        expect(world.pendingTrips.some(t => t.tripId === trip.tripId)).toBe(false);
        expect(world.routeCommitments.find(c => c.tripId === trip.tripId).status).toBe('EXPIRED');
        expect(world.patrolAssignments.find(a => a.tripId === trip.tripId).status).toBe('EXPIRED');
    });

    it('a healthy arrival still delivers (expiry does not swallow success)', () => {
        const world = createClosedWorldScenario();
        const merchant = world.merchants[0];
        merchant.cargo = 20;
        const trip = schedulePendingTradeTrip(world, {
            merchantId: merchant.id, routeId: 'road-a', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 5, travelTicks: 1, startTick: 0,
        });
        advancePendingWorldObligations(world, { tick: 1 });
        advancePendingWorldObligations(world, { tick: 2 });
        const delivered = getWorldEvents(world, { types: ['PENDING_CARGO_DELIVERED'] });
        expect(delivered.length).toBe(1);
        expect(getWorldEvents(world, { types: ['TRIP_EXPIRED'] }).length).toBe(0);
        expect(world.scheduledConsequences.find(c => c.tripId === trip.tripId).status).toBe('APPLIED');
    });
});
