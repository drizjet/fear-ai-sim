// tests/causal-chain.test.js — V7 §22 MUT-CHAIN-001
//
// Defect: remove or mis-parent a required causal edge in the closed-world chain.
//
// Required chain: OBSERVATION → BELIEF_UPDATE → ROUTE_DECISION →
// TRIP_COMMITMENT → EXPOSURE → ENCOUNTER → CONSEQUENCE →
// MEMORY/REPUTATION/FACTION REACTION.
//
// For MUT-CHAIN-001, we test that FACTION_REASSESSMENT is emitted when
// a faction's escalation changes. The mutation removes this event.
// Without the event, downstream consumers (patrol, market, diplomacy)
// cannot react to faction state changes.

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('V7 §22 MUT-CHAIN-001 — causal edge present', () => {
    it('FACTION_REASSESSMENT is emitted when faction escalation changes', () => {
        // Run a scenario where the faction reassess should produce a
        // different escalation level than the initial.
        const world = createClosedWorldScenario();
        // Force a faction escalation by setting up a severe attack scenario.
        for (const faction of world.factions) {
            faction.escalation = 0;
            faction.territorialPressure = 0;
        }
        // Add bandit attacks to drive pressure up.
        for (let i = 0; i < 10; i += 1) {
            world.events.push({
                type: 'BANDIT_ATTACK',
                tick: i,
                roadId: 'road-a',
                attackerId: 'bandit-1',
                targetMerchantId: 'merchant-1',
                stolen: 5,
            });
        }
        // Run 5 ticks with high perceivedDanger to force escalation.
        for (let tick = 1; tick <= 5; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.9, relationshipGate: true });
        }
        const reassessments = world.events.filter(e => e.type === 'FACTION_REASSESSMENT');
        // At least one faction should have reassessed.
        // With MUT-CHAIN-001, the event is never pushed.
        expect(reassessments.length).toBeGreaterThan(0);
    });
});
