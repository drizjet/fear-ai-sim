import { describe, expect, it } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';
import { BeliefStore } from '../beliefs.js';

// NEXT-120: rumor-driven trade reroute (CCI-28 frontier 4). The halves
// existed uncombined: bandit-relocation reroute on direct observation
// (closed-world-trade-reroute) and gossip into BeliefStores (rumor
// auto-share). This pins the combination: a merchant that NEVER observes
// the attack reroutes on hearsay alone, with the rumor source attributed.
describe('rumor-driven trade reroute (CCI-28 frontier 4)', () => {
    function twoMerchantWorld() {
        const world = createClosedWorldScenario();
        const witness = world.merchants[0];
        witness.perceptionAccuracy = 1;
        witness.selectedRoute = 'road-a';
        witness.lastRoute = 'road-a';
        // Blind hearer in the same town: gossip reaches it, observation never does.
        const hearer = {
            ...witness,
            id: 'merchant-2',
            beliefs: new BeliefStore(),
            observedEventIds: new Set(),
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
                'road-b': { perceivedDanger: 0.4, confidence: 0.5 },
                'road-c': { perceivedDanger: 0.4, confidence: 0.5 }
            },
            selectedRoute: 'road-a',
            lastRoute: 'road-a',
            perceptionAccuracy: 0
        };
        hearer.location = witness.location;
        world.merchants.push(hearer);
        world.bandits[0].perceptionAccuracy = 0; // bandit cannot chase
        world.bandits[0].roadId = 'road-a';
        return { world, witness, hearer };
    }

    it('1. Hearer reroutes on gossip without ever observing the attack', () => {
        const { world, witness, hearer } = twoMerchantWorld();
        appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 1, banditId: 'bandit-1', merchantId: witness.id });
        for (let tick = 1; tick <= 4; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        // Witness learned by observation; hearer only by rumor.
        expect(witness.routeBeliefs['road-a'].source).toBe('observation');
        expect(hearer.observedEventIds.size).toBe(0);
        expect(hearer.routeBeliefs['road-a'].source).toBe('rumor');
        expect(hearer.routeBeliefs['road-a'].perceivedDanger).toBeGreaterThan(0.4);
        expect(hearer.selectedRoute).not.toBe('road-a');
    });

    it('2. No rumor, no reroute: blind merchant holds its prior', () => {
        const { world, hearer } = twoMerchantWorld();
        // No attack at all: gossip channel silent.
        for (let tick = 1; tick <= 4; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        expect(hearer.selectedRoute).toBe('road-a');
        expect(hearer.routeBeliefs['road-a'].source ?? 'none').not.toBe('rumor');
    });

    it('3. Direct observation keeps the observation tag (no rumor downgrade)', () => {
        const { world, witness } = twoMerchantWorld();
        appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 1, banditId: 'bandit-1', merchantId: witness.id });
        for (let tick = 1; tick <= 6; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        // Later gossip must not relabel what the witness saw itself.
        expect(witness.routeBeliefs['road-a'].source).toBe('observation');
    });

    it('4. Combined run is deterministic on identical inputs', () => {
        const run = () => {
            const { world, witness, hearer } = twoMerchantWorld();
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 1, banditId: 'bandit-1', merchantId: witness.id });
            for (let tick = 1; tick <= 4; tick += 1) {
                tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
            }
            return { route: hearer.selectedRoute, danger: hearer.routeBeliefs['road-a'].perceivedDanger, source: hearer.routeBeliefs['road-a'].source };
        };
        expect(run()).toEqual(run());
    });
});
