// tests/closed-world-relationship-integration.test.js
//
// Vertical integration test (Constitution §538): connect the new
// FactionRelationshipVector + StanceLadder to the closed-world chain.
// Before this slice, the breadth MVP was a standalone module (§416:
// "No feature is done if disconnected"). After this slice, the
// relationship vector drives the closed-world faction's escalation
// decisions, and trespass / trade / attack events from the closed-world
// reducer feed back into the relationship vector.
//
// This file encodes the §407 integration scenario plus the §23
// hysteresis and §344 explanation contracts as they apply to the
// live closed-world chain.

import { describe, expect, it } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

describe('closed-world relationship integration (Constitution §538)', () => {
    it('exposes a relationship vector on each faction pair', () => {
        const world = createClosedWorldScenario();
        const factionA = world.factions.find(f => f.id === 'south-faction');
        const factionB = world.factions.find(f => f.id === 'north-faction');
        // The relationship vector must be reachable from the faction
        // and must produce a stance for the pair.
        const pair = factionA.relationships.get(factionB.id);
        expect(pair).toBeTruthy();
        expect(typeof pair.pressure()).toBe('number');
    });

    it('records a trespass event into the relationship vector when a bandit attacks', () => {
        const world = createClosedWorldScenario();
        // Pick a faction with a known townId so we can pick a target.
        const southFaction = world.factions.find(f => f.id === 'south-faction');
        const northFaction = world.factions.find(f => f.id === 'north-faction');
        const pair = southFaction.relationships.get(northFaction.id);
        const pressureBefore = pair.territorialPressure;
        // Find the bandit on the same town and record a trespass.
        const bandit = world.bandits[0];
        // Drive the reducer once: the bandit attack should register
        // a trespass against the relationship vector of the
        // bandit-hosting faction (the south faction hosts 'south-faction').
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5 });
        // After one tick, the relationship vector should have either
        // seen a trespass event (territorial pressure rose) or
        // recorded a stance transition.
        const pressureAfter = pair.territorialPressure;
        const observedSomething = pressureAfter > pressureBefore || pair.events.length > 0;
        expect(observedSomething).toBe(true);
    });

    it('does NOT enter INVASION on tick 1 of the chain', () => {
        // §407 + §538: the first tick of a fresh chain must not produce
        // an immediate invasion; the relationship vector must be the
        // gating signal, not the legacy raidScore formula.
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        const invasions = world.events.filter(event => event.type === 'INVASION');
        expect(invasions).toHaveLength(0);
    });

    it('escalates past TOLERANT under chronic supply shortage', () => {
        // §22 / §518: a faction that is chronically short of food
        // escalates the relationship vector past TOLERANT (the
        // economy→war feedback of §514). The relationship vector's
        // stance is the auditable surface; the invasion step is now
        // gated by the pair's stance, but the test asserts the
        // *relationship state*, not the *invasion event count*
        // (the latter depends on resource/cooldown dynamics that
        // are tested separately in tests/closed-world-tick.test.js).
        const world = createClosedWorldScenario();
        for (let tick = 1; tick <= 60; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.5, relationshipGate: true });
        }
        const pair = world.relationships.values().next().value;
        // The pair must have escalated past TOLERANT.
        expect(pair.stance).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
    });

    it('escalates past TOLERANT and records the bandit attacks as material signals', () => {
        // §22 / §538: the structural wiring. Bandit attacks register
        // as material signals on the relationship vector (visible in
        // the event log as STANCE_TRANSITION events with the attack
        // pressure), and the pair escalates past TOLERANT. The
        // threshold calibration to reach LIMITED_CONFLICT is a
        // separate, sensitivity-sweep concern (Constitution §142);
        // this slice is about *wiring* the relationship vector into
        // the live path so future slices have a real escalation
        // surface to work with.
        const world = createClosedWorldScenario();
        for (let tick = 1; tick <= 60; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.5, relationshipGate: true });
            // Drive a bandit attack each tick. resolveBanditAttack is
            // a no-op once the merchant cargo is 0, so seed cargo
            // back to 20 each tick to keep the bandit eating.
            world.merchants[0].cargo = 20;
            resolveBanditAttack(world, { tick });
        }
        const pair = world.relationships.values().next().value;
        // The pair must have escalated past TOLERANT.
        expect(pair.stance).toBeGreaterThan(StanceLadder.TOLERANT);
        // And at least one STANCE_TRANSITION event must have been
        // emitted during the 60-tick run.
        const transitions = world.events.filter(event => event.type === 'STANCE_TRANSITION');
        expect(transitions.length).toBeGreaterThan(0);
    });

    it('emits a STANCE_TRANSITION event when the faction pair escalates', () => {
        const world = createClosedWorldScenario();
        for (let tick = 1; tick <= 60; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.5 });
        }
        const transitions = world.events.filter(event => event.type === 'STANCE_TRANSITION');
        expect(transitions.length).toBeGreaterThan(0);
        // The first transition must be from TOLERANT to at least WATCHFUL.
        const firstTransition = transitions[0];
        expect(firstTransition.from).toBe(StanceLadder.TOLERANT);
        expect(firstTransition.to).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
    });

    it('records the top decision factors on the relationship vector at the peak', () => {
        const world = createClosedWorldScenario();
        for (let tick = 1; tick <= 60; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.5 });
        }
        // The relationship vector should expose an explanation.
        const southFaction = world.factions.find(f => f.id === 'south-faction');
        const northFaction = world.factions.find(f => f.id === 'north-faction');
        const pair = southFaction.relationships.get(northFaction.id);
        const explanation = pair.explain();
        expect(explanation).toMatchObject({
            decision: expect.any(String),
            topFactors: expect.any(Array),
        });
    });
});
