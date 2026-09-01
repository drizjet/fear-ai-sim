import { describe, expect, test } from '@jest/globals';
import {
    createClosedWorldScenario,
    loadWorld,
    saveWorld,
    schedulePendingTradeTrip,
    tickClosedWorld,
} from '../closed-world.js';
import { createPatrol } from '../canonical-trade-system.js';
import { InteractionEngine } from '../interactions.js';
import { requestNonAggression } from '../treaty.js';

function seedPendingWorld() {
    const world = createClosedWorldScenario();
    world.patrols = [createPatrol({
        id: 'patrol-save-1',
        route: 'road-b',
        detectionRate: 0.75,
        interceptionRate: 0.5,
        travelCost: 1,
    })];

    // This cooldown is a pending behavioral obligation: a resumed world
    // must not allow the guard to act earlier than an uninterrupted world.
    world.interactionEngine = new InteractionEngine({ cooldown: 4 });
    world.interactionEngine.lastAction.set('guard-1', 0);

    requestNonAggression({
        actor: 'north-faction',
        target: 'south-faction',
        world,
        tick: 0,
    });

    const trip = schedulePendingTradeTrip(world, {
        merchantId: 'merchant-1',
        routeId: 'road-b',
        destinationTownId: 'south',
        cargoKind: 'food',
        cargoAmount: 6,
        travelTicks: 2,
        startTick: 0,
        patrolId: 'patrol-save-1',
    });

    world.rumorsInTransit.push({
        rumorId: 'rumor-save-1',
        subject: 'road-b',
        claim: 'safe-passage',
        remainingTicks: 2,
        status: 'IN_TRANSIT',
        parentEventIds: [trip.commitmentEventId],
    });
    world.migrationJourneys.push({
        journeyId: 'migration-save-1',
        factionId: 'north-faction',
        destinationTownId: 'south',
        remainingTicks: 3,
        status: 'IN_TRANSIT',
        parentEventIds: [trip.commitmentEventId],
    });
    return { world, trip };
}

describe('MUT-SAVE-001 pending-effect preservation', () => {
    test('save/load preserves pending obligations and resumes to the identical trajectory', () => {
        const { world: uninterrupted, trip } = seedPendingWorld();
        const checkpoint = saveWorld(uninterrupted);
        const resumed = loadWorld(checkpoint);

        // Non-vacuity at the checkpoint: every obligation is actually live.
        expect(trip.status).toBe('IN_TRANSIT');
        expect(resumed.pendingTrips).toHaveLength(1);
        expect(resumed.pendingTrips[0].cargo).toEqual({ kind: 'food', amount: 6 });
        expect(resumed.scheduledConsequences[0].status).toBe('PENDING');
        expect(resumed.routeCommitments[0].status).toBe('ACTIVE');
        expect(resumed.patrolAssignments[0].status).toBe('ACTIVE');
        expect(resumed.rumorsInTransit[0].status).toBe('IN_TRANSIT');
        expect(resumed.migrationJourneys[0].status).toBe('IN_TRANSIT');
        expect(resumed.treaties.some(treaty => treaty.status === 'ACTIVE')).toBe(true);
        expect(resumed.interactionEngine.lastAction.get('guard-1')).toBe(0);
        expect(typeof resumed.interactionEngine.execute).toBe('function');

        const initialRngState = resumed.rngStreams.pendingEffects.state;
        for (let tick = 1; tick <= 3; tick += 1) {
            tickClosedWorld(uninterrupted, { tick, perceivedDanger: 0.2 });
            tickClosedWorld(resumed, { tick, perceivedDanger: 0.2 });
        }

        // The pending cargo becomes a material market delivery, while every
        // associated obligation reaches the same terminal state. The trip
        // itself is pruned from pendingTrips once delivered (its durable
        // record is the PENDING_CARGO_DELIVERED ledger event, and its
        // route commitment / patrol assignment close out below) — so the
        // in-flight set stays small instead of growing without bound.
        // (The merchant auto-ships a fresh trip once idle, which is why
        // pendingTrips is not empty — it holds that NEW in-flight trip,
        // never the delivered seed trip.)
        expect(resumed.pendingTrips.some(t => t.tripId === trip.tripId)).toBe(false);
        expect(resumed.pendingTrips.length).toBeLessThanOrEqual(1);
        expect(resumed.scheduledConsequences[0].status).toBe('APPLIED');
        expect(resumed.routeCommitments[0].status).toBe('COMPLETED');
        expect(resumed.patrolAssignments[0].status).toBe('COMPLETED');
        expect(resumed.rumorsInTransit[0].status).toBe('DELIVERED');
        expect(resumed.migrationJourneys[0].status).toBe('ARRIVED');
        expect(resumed.towns.get('south').market.delivered.get('food')).toBeGreaterThan(0);
        expect(resumed.rngStreams.pendingEffects.state).not.toBe(initialRngState);

        const delivered = resumed.events.find(event => event.type === 'PENDING_CARGO_DELIVERED');
        expect(delivered).toBeDefined();
        expect(delivered.eventId).toBeDefined();
        expect(delivered.actionId).toBe(trip.actionId);
        expect(delivered.parentEventIds.length).toBeGreaterThan(0);
        // The delivery actually booked into the §155 market flow audit
        // trail (the production trade axis this slice activates).
        expect((resumed.marketFlows?.get('south:food')?.delivered ?? 0)).toBeGreaterThan(0);

        // Allocate once more after the checkpoint. If the next action/event
        // counters were dropped, the resumed branch would duplicate IDs.
        const nextA = schedulePendingTradeTrip(uninterrupted, {
            merchantId: 'merchant-1', routeId: 'road-b', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 1, travelTicks: 1, startTick: 3,
        });
        const nextB = schedulePendingTradeTrip(resumed, {
            merchantId: 'merchant-1', routeId: 'road-b', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 1, travelTicks: 1, startTick: 3,
        });
        expect(nextB.actionId).toBe(nextA.actionId);
        expect(nextB.commitmentEventId).toBe(nextA.commitmentEventId);

        // Strict trajectory/state equivalence, including event IDs, causal
        // parents, RNG stream position, queues, markets, and cooldown state.
        expect(saveWorld(resumed)).toBe(saveWorld(uninterrupted));
    });
});
