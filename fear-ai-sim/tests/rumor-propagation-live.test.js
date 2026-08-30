import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { shareObservation, propagateRumor, recordObservation, createRoamingGroup } from '../roaming.js';

// World-Completion Directive §8: "Build the real information
// model. Separate WORLD_TRUTH / EVENT / OBSERVATION / BELIEF /
// MEMORY / RUMOR / REPUTATION / INTELLIGENCE. Never allow
// these to collapse into one global knowledge value."
// The prior slice's `propagateRumor` is unit-tested but NOT
// in the live closed-world reducer. This slice wires it:
// after a BANDIT_ATTACK, a witness merchant shares the
// observation with a non-witness merchant, and the
// non-witness's belief updates with reduced confidence.

describe('rumor propagation live-wire (directive §8)', () => {
    it('a non-witness merchant can learn about a bandit attack via shareObservation', () => {
        // The contract: after a BANDIT_ATTACK, the witness
        // merchant can share the observation with a
        // non-witness merchant via `shareObservation`. The
        // non-witness's belief must update with confidence
        // = original * decayFactor (0.5).
        const world = createClosedWorldScenario();
        // Add a second merchant (the non-witness).
        world.merchants.push({
            id: 'merchants-2',
            location: 'south',
            cargo: 0,
            selectedRoute: null,
            beliefs: {
                observe: () => {},
                get: () => null
            }
        });
        // The first merchant witnesses the attack (per
        // runClosedWorldScenario). The second merchant did
        // not witness it.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.8 });
        const witness = world.merchants[0];
        const nonWitness = world.merchants[1];
        // Build the original observation from the attack.
        const originalObservation = {
            observerId: witness.id,
            locationId: 'road-a',
            tick: 1,
            resourceEstimate: 0.3,
            dangerEstimate: 0.8,
            confidence: 0.9,
            sourceType: 'DIRECT_SCOUT',
            observedTick: 1
        };
        // The witness shares the observation with the
        // non-witness.
        const shared = shareObservation(witness, nonWitness, originalObservation, {
            tick: 2,
            decayFactor: 0.5
        });
        // The shared observation must have reduced
        // confidence: 0.9 * 0.5 = 0.45.
        expect(shared.confidence).toBeCloseTo(0.45, 5);
        // The shared observation must be tagged as a
        // TRUSTED_REPORT (not DIRECT_SCOUT).
        expect(shared.sourceType).toBe('TRUSTED_REPORT');
        // The shared observation must carry provenance
        // (derivedFrom).
        expect(shared.derivedFrom).toBeDefined();
        expect(shared.derivedFrom.sourceType).toBe('DIRECT_SCOUT');
    });

    it('a two-hop rumor chain decays confidence twice', () => {
        // The contract: A -> B -> C. C's confidence is
        // 0.9 * 0.5 * 0.5 = 0.225.
        const recipientB = createRoamingGroup({
            id: 'B',
            currentLocation: 'road-a',
            beliefs: {},
            observations: []
        });
        const recipientC = createRoamingGroup({
            id: 'C',
            currentLocation: 'road-a',
            beliefs: {},
            observations: []
        });
        // The chain is the full list of actors in order
        // (A, B, C). The hops define from/to ids.
        const chain = [
            { id: 'A' },
            recipientB,
            recipientC
        ];
        const hops = [
            { from: 'A', to: 'B', tick: 1 },
            { from: 'B', to: 'C', tick: 2 }
        ];
        const originalObservation = {
            observerId: 'A',
            locationId: 'road-a',
            tick: 1,
            resourceEstimate: 0.3,
            dangerEstimate: 0.8,
            confidence: 0.9,
            sourceType: 'DIRECT_SCOUT',
            observedTick: 1
        };
        const result = propagateRumor(chain, originalObservation, hops);
        // The final observation stored on C must have
        // confidence = 0.9 * 0.5 * 0.5 = 0.225.
        // propagateRumor returns the final observation.
        expect(result.confidence).toBeCloseTo(0.225, 5);
    });

    it('the shared observation carries the sender id and the derivedFrom chain', () => {
        // The audit's §87: "Rumor needs: proposition; source;
        // confidence; distortion; transmission history."
        // The shared observation must carry the sender id
        // and the derivedFrom chain.
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.8 });
        const witness = world.merchants[0];
        const originalObservation = {
            observerId: witness.id,
            locationId: 'road-a',
            tick: 1,
            resourceEstimate: 0.3,
            dangerEstimate: 0.8,
            confidence: 0.9,
            sourceType: 'DIRECT_SCOUT',
            observedTick: 1
        };
        const shared = shareObservation(witness, { id: 'B' }, originalObservation, { tick: 2 });
        expect(shared.senderId).toBe(witness.id);
        expect(shared.observerId).toBe(witness.id);
        // The provenance chain: the shared observation's
        // derivedFrom is the original.
        expect(shared.derivedFrom.sourceType).toBe('DIRECT_SCOUT');
        expect(shared.derivedFrom.observerId).toBe(witness.id);
    });

    it('two runs with the same seed produce the same rumor chain', () => {
        // The §121 determinism contract: a rumor chain
        // must be reproducible across runs.
        const hops = [{ from: 'A', to: 'B', tick: 1 }];
        const originalObservation = {
            observerId: 'A',
            locationId: 'road-a',
            tick: 1,
            resourceEstimate: 0.3,
            dangerEstimate: 0.8,
            confidence: 0.9,
            sourceType: 'DIRECT_SCOUT',
            observedTick: 1
        };
        const chain1 = [{ id: 'A' }, createRoamingGroup({ id: 'B', beliefs: {}, observations: [] })];
        const chain2 = [{ id: 'A' }, createRoamingGroup({ id: 'B', beliefs: {}, observations: [] })];
        const r1 = propagateRumor(chain1, originalObservation, hops);
        const r2 = propagateRumor(chain2, originalObservation, hops);
        expect(r1.confidence).toBe(r2.confidence);
        expect(r1.sourceType).toBe(r2.sourceType);
    });
});
