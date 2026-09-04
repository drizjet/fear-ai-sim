// World-Completion Directive §12 (Diplomacy) + §28.
//
// The 500-tick sensitivity audit
// (EVID-2026-08-28-SENSITIVITY-500TICK) found that the
// default `createClosedWorldScenario` did not set
// `bandit.factionId`, so the §12 / §28 diplomatic
// machinery (encounter-enforcement, invasion-gate) was
// not exercised by default. This slice sets the default
// and proves the diplomatic chain is live out of the box.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { requestNonAggression, requestPassage } from '../treaty.js';
import { Evidence } from '../beliefs.js';

function seedMerchantBelief(merchant, routeId, value) {
    merchant.beliefs.observe(new Evidence({
        subject: routeId,
        claim: 'perceivedDanger',
        value,
        sourceId: 'seed',
        sourceTrust: 1.0,
        confidence: 1.0,
        tick: 0,
    }));
}

describe('default scenario exercises the diplomatic machinery (Constitution §12 / §28)', () => {
    it('the default bandit has a factionId so treaty enforcement is live out of the box', () => {
        // The audit finding: the default bandit had no
        // factionId, so the encounter-enforcement and
        // invasion-gate logic never fired. The default
        // now sets `bandit.factionId = 'south-faction'`
        // so production callers can exercise the
        // diplomatic machinery without explicit setup.
        const world = createClosedWorldScenario();
        expect(world.bandits[0].factionId).toBe('south-faction');
    });

    it('the default scenario emits a TREATY_VIOLATED event when a passage treaty is violated', () => {
        // With the bandit now associated with
        // south-faction, a north↔south passage treaty
        // on road-a is violated by a bandit-ambush on
        // road-a. The encounter reducer should fire
        // checkTreatyCompliance and emit the violation
        // event.
        const world = createClosedWorldScenario();
        requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world, tick: 1 });
        // Set up: bandit on road-a, merchant stays on
        // road-a (false belief so the reroute keeps the
        // merchant there).
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        tickClosedWorld(world, {
            tick: 2,
            perceivedDanger: 0.5,
            encounterRng: () => 0.999,
            pinBanditRoadId: 'road-a',
        });
        const violation = world.events.find(e => e.type === 'TREATY_VIOLATED');
        expect(violation).toBeDefined();
        expect(violation.violator).toBe('south-faction');
    });

    it('the default scenario emits a TREATY_BLOCKED_RAID event when a non-aggression pact is in place', () => {
        // With the bandit now associated with
        // south-faction, a north↔south non-aggression
        // pact blocks the north-faction's invasion. The
        // invasion-gate should fire and emit the
        // TREATY_BLOCKED_RAID event.
        const world = createClosedWorldScenario();
        // E3 staging: pop 100 so the tools-deficit pressure outruns
        // the merchant shuttle (at pop 1 trade pacifies the fixture
        // and no raid is ever attempted). Gate logic untouched.
        for (const [, town] of world.towns) town.population = 100;
        requestNonAggression({ actor: 'north-faction', target: 'south-faction', world, tick: 1 });
        // Set up: bandit on road-a (a road the north
        // faction can reach), merchant on road-a (false
        // belief so the bandit-ambush keeps firing).
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-a';
        seedMerchantBelief(world.merchants[0], 'road-a', 0.01);
        for (let t = 2; t <= 30; t += 1) {
            tickClosedWorld(world, {
                tick: t,
                perceivedDanger: 0.9,
                encounterRng: () => 0.999,
                pinBanditRoadId: 'road-a',
            });
        }
        const invasions = world.events.filter(e => e.type === 'INVASION' && e.factionId === 'north-faction').length;
        const blocked = world.events.filter(e => e.type === 'TREATY_BLOCKED_RAID').length;
        // The treaty must block every NORTH invasion (south-faction
        // raids against the bandit are out of this pact's scope).
        expect(invasions).toBe(0);
        // At least one TREATY_BLOCKED_RAID event must have fired.
        expect(blocked).toBeGreaterThan(0);
    });
});
