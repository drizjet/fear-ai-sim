import { describe, expect, it } from '@jest/globals';
import { createClosedWorldScenario, runClosedWorldScenario } from '../closed-world.js';

describe('closed-world causal chain', () => {
    it('connects attack evidence, rumor, rerouting, and faction escalation', () => {
        // Guardian §1.1 fix: the BANDIT_RELOCATION event
        // must remain in the chain. Previously the test
        // mutated lootExpectation AFTER the one-shot ran
        // and accepted "bandit may stay". Now we mutate
        // BEFORE the one-shot so the destination-utility
        // model picks a better road. With
        // `lootExpectation: 0.95` the other roads' belief
        // is `min(0.9, 1.05) = 0.9` vs the current road's
        // `0.2` — a gap the softmax at temperature 0.05
        // can overcome.
        //
        // We create the world, set the bandit's
        // lootExpectation, then run the one-shot. The
        // one-shot's `relocateBanditViaRoaming` will see
        // the high lootExpectation and reliably move the
        // bandit to a different road.
        const world = createClosedWorldScenario();
        world.bandits[0].lootExpectation = 0.95;
        // Disable the switchMargin so the destination-utility
        // model picks a clearly better road without the
        // anti-thrashing margin check. The chain test is
        // about the causal sequence, not the margin dial.
        world.bandits[0].switchMargin = 0;
        // Run the one-shot with the mutated bandit.
        const result = runClosedWorldScenario({ perceivedDanger: 0.8, world });
        // Guardian §1.1: BANDIT_RELOCATION must be in the
        // chain. The one-shot's order is: CONVOY_FORMED,
        // BANDIT_ATTACK, RUMOR, ROUTE_SELECTED,
        // FACTION_REASSESSMENT, FACTION_ACTION, INVASION,
        // then BANDIT_RELOCATION (the wrapper's
        // relocateBanditViaRoaming runs at the end of
        // resolveBanditAttack). The chain's causal
        // narrative includes the relocation even though
        // it's the last event. We assert the event types
        // are present (order-independent) and the bandit
        // actually moved.
        const eventTypes = result.events.map(event => event.type);
        expect(eventTypes).toContain('CONVOY_FORMED');
        expect(eventTypes).toContain('BANDIT_ATTACK');
        expect(eventTypes).toContain('RUMOR');
        expect(eventTypes).toContain('ROUTE_SELECTED');
        expect(eventTypes).toContain('FACTION_REASSESSMENT');
        expect(eventTypes).toContain('FACTION_ACTION');
        expect(eventTypes).toContain('INVASION');
        // BANDIT_RELOCATION is the chain's relocation event.
        // It must be present in the chain.
        expect(eventTypes).toContain('BANDIT_RELOCATION');
        expect(result.merchants[0].selectedRoute).toBe('road-b');
        expect(result.factions.find(faction => faction.id === 'south-faction').lastDecision).toBe('RAID');
        expect(result.beliefs.get('road-a', 'danger').layer).toBe('AGENT_BELIEF');
        // The bandit must have moved (BANDIT_RELOCATION in
        // the sequence proves this; we additionally assert
        // the roadId is NOT the default 'road-a').
        expect(result.bandits[0].roadId).not.toBe('road-a');
    });
});
