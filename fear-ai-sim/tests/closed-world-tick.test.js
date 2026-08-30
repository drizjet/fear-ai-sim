import { describe, expect, it } from '@jest/globals';
import {
    createClosedWorldScenario,
    resolveBanditAttack,
    runClosedWorldScenario,
    runClosedWorldForTicks,
    tickClosedWorld
} from '../closed-world.js';
import { executeRetaliation } from '../escalation.js';

describe('tickClosedWorld', () => {
    it('throws on missing world', () => {
        expect(() => tickClosedWorld(null)).toThrow(TypeError);
        expect(() => tickClosedWorld(undefined)).toThrow(TypeError);
    });

    it('is a no-op when there are no events to process', () => {
        const world = createClosedWorldScenario();
        const before = world.events.length;
        const after = tickClosedWorld(world, { tick: 5 });
        // Only the per-tick side effects fire: reassessments and snapshot.
        expect(after.events.length).toBeGreaterThan(before);
        expect(after.tickHistory).toHaveLength(1);
        expect(after.tickHistory[0].tick).toBe(5);
    });

    it('records a tick snapshot with bandit, faction, and merchant state', () => {
        const world = runClosedWorldScenario();
        tickClosedWorld(world, { tick: 2 });
        const snapshot = world.tickHistory[0];
        expect(snapshot.tick).toBe(2);
        expect(snapshot.banditRoads[0].roadId).toBeTruthy();
        expect(snapshot.factionEscalations.length).toBeGreaterThan(0);
        expect(snapshot.merchantCargo[0].id).toBe('merchant-1');
    });

    it('respawns merchants whose cargo is depleted', () => {
        const world = createClosedWorldScenario();
        resolveBanditAttack(world, { tick: 1 });
        expect(world.merchants[0].cargo).toBe(0);
        tickClosedWorld(world, { tick: 2 });
        expect(world.merchants[0].cargo).toBe(20);
        const respawn = world.events.find(event => event.type === 'MERCHANT_RESPAWN');
        expect(respawn).toBeTruthy();
        expect(respawn.tick).toBe(2);
    });

    it('grievance compounds across ticks when attacks persist', () => {
        const world = createClosedWorldScenario();
        resolveBanditAttack(world, { tick: 1 });
        const before = world.factions[0].grievance;
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.8 });
        const after = world.factions[0].grievance;
        expect(after).toBeGreaterThanOrEqual(before);
    });

    it('grievance does NOT keep growing from stale attacks after the current tick', () => {
        // Critical regression test for the audit finding: a faction that
        // experienced one attack on tick 1 must NOT receive a second dose
        // of `confirmedLoss` on tick 2 just because the historical attack
        // is still in `world.events`. The old `attacksUpToTick` filter
        // re-charged the faction every tick. The fix is to use the
        // current-tick flow only. With griefDecayPerTick=0 also passed,
        // we can isolate the flow-vs-stock semantics: tick 2's flow is 0
        // and grievance is unchanged.
        const world = createClosedWorldScenario();
        // Feed the towns to keep supplyShortage at 0, so the only
        // contribution to `grievance` on a tick is from the attack flow.
        for (const town of world.towns.values()) {
            for (const kind of Object.keys(town.consumes)) {
                town.market.deliverCargo(kind, 100, { routeRisk: 0 });
            }
        }
        // Seed an attack on tick 1; reducer will count it as the current
        // flow. Tick 2 has no new attack — the historical event is in
        // world.events but the flow filter rejects it.
        resolveBanditAttack(world, { tick: 1 });
        const faction = world.factions[0];
        faction.grievance = 0;
        // Disable grief decay so we can isolate the flow-vs-stock
        // semantics. (Default 3%/tick decay is correct for production
        // but would mask the audit finding here.)
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, griefDecayPerTick: 0.0 });
        const afterTick1 = faction.grievance;
        // Tick 2: newAttacksThisTick = 0, confirmedLoss = 0, no decay
        // either. Grievance should be exactly unchanged.
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0, griefDecayPerTick: 0.0 });
        expect(faction.grievance).toBeCloseTo(afterTick1, 8);
    });

    it('derives supplyShortage from the real market, not a hardcoded constant', () => {
        // The audit found that `supplyShortage: 0.1` was hardcoded into
        // the reducer, which contributed grievance every tick even when
        // the market was not actually short. The fix derives shortage
        // from the market quotes: mean shortage across consumed goods.
        const world = createClosedWorldScenario();
        // Pre-fill both goods to make shortage exactly 0.
        for (const town of world.towns.values()) {
            for (const kind of Object.keys(town.consumes)) {
                town.market.deliverCargo(kind, 100, { routeRisk: 0 });
            }
        }
        const faction = world.factions[0];
        faction.grievance = 0;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        // With a fed market, the per-tick contribution to grievance from
        // supplyShortage is exactly 0. Grievance should remain 0 (the
        // market step is run AFTER the reassess in the reducer, so even
        // if shortage rises after consumption, it does not feed back into
        // the same tick's reassess).
        expect(faction.grievance).toBe(0);
    });

    it('memoryOfLoss decays multiplicatively based on memoryDecayPerTick', () => {
        // Stock-flow split: the reducer accumulates new loss into
        // `memoryOfLoss` each tick and then applies multiplicative decay
        // so historical trauma decays rather than saturating.
        const world = createClosedWorldScenario();
        // Stop the bandit and feed the towns so the only non-trivial
        // signal is the attack we seed.
        for (const town of world.towns.values()) {
            for (const kind of Object.keys(town.consumes)) {
                town.market.deliverCargo(kind, 100, { routeRisk: 0 });
            }
        }
        const faction = world.factions[0];
        // Seed an attack on tick 1. memoryOfLoss after tick 1's reducer
        // = (0 * (1 - decay)) + 0.1 = 0.1 with the default 5% decay.
        resolveBanditAttack(world, { tick: 1 });
        tickClosedWorld(world, { tick: 1, memoryDecayPerTick: 0.05, perceivedDanger: 0.0 });
        expect(faction.memoryOfLoss).toBeCloseTo(0.1, 8);
        // Tick 2: no new attack, decay applied: 0.1 * 0.95 = 0.095.
        tickClosedWorld(world, { tick: 2, memoryDecayPerTick: 0.05, perceivedDanger: 0.0 });
        expect(faction.memoryOfLoss).toBeCloseTo(0.095, 8);
        // Higher decay (10%) drains faster: 0.095 * 0.9 = 0.0855.
        tickClosedWorld(world, { tick: 3, memoryDecayPerTick: 0.10, perceivedDanger: 0.0 });
        expect(faction.memoryOfLoss).toBeCloseTo(0.0855, 8);
        // 0% decay freezes the memory: 0.0855 * 1.0 + 0 = 0.0855.
        tickClosedWorld(world, { tick: 4, memoryDecayPerTick: 0.0, perceivedDanger: 0.0 });
        expect(faction.memoryOfLoss).toBeCloseTo(0.0855, 8);
    });

    it('does not emit a FACTION_REASSESSMENT event when escalation is unchanged', () => {
        const world = createClosedWorldScenario();
        // Strip the alternate road so the bandit cannot relocate, and use
        // zero danger so escalation stays NORMAL. Then the reducer should
        // produce zero FACTION_REASSESSMENT events even though it still
        // touches each faction.
        for (const bandit of world.bandits) {
            bandit.alternateRoadId = null;
            bandit.lootExpectation = 0;
        }
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const reassessments = world.events.filter(
            event => event.type === 'FACTION_REASSESSMENT' && event.tick === 1
        );
        expect(reassessments).toHaveLength(0);
    });

    it('emits a MARKET_TICK event for every town and every good each tick', () => {
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const marketEvents = world.events.filter(event => event.type === 'MARKET_TICK');
        // The default scenario declares 2 goods per town (food, tools), so
        // the total is towns.size * goods.size.
        const goodsPerTown = Object.keys(world.towns.get('north').consumes).length;
        expect(marketEvents).toHaveLength(world.towns.size * goodsPerTown);
        const townIds = new Set(marketEvents.map(event => event.townId));
        const kinds = new Set(marketEvents.map(event => event.kind));
        expect(townIds.has('north')).toBe(true);
        expect(townIds.has('south')).toBe(true);
        expect(kinds.has('food')).toBe(true);
        expect(kinds.has('tools')).toBe(true);
    });

    it('records market prices in the tick snapshot for every (town, kind)', () => {
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const snapshot = world.tickHistory[0];
        const goodsPerTown = Object.keys(world.towns.get('north').consumes).length;
        expect(snapshot.marketPrices).toHaveLength(world.towns.size * goodsPerTown);
        const keys = new Set(snapshot.marketPrices.map(entry => `${entry.townId}::${entry.kind}`));
        for (const [townId, town] of world.towns) {
            for (const kind of Object.keys(town.consumes)) {
                expect(keys.has(`${townId}::${kind}`)).toBe(true);
            }
        }
    });

    it('a starved town has a higher shortage than a fed one', () => {
        const world = createClosedWorldScenario();
        // Pre-stock the south market with plenty of food so it has supply.
        const south = world.towns.get('south');
        south.market.deliverCargo('food', 100, { routeRisk: 0 });
        // Drain the north market and zero its inventory.
        const north = world.towns.get('north');
        north.market.deliverCargo('food', 0, { routeRisk: 0 });
        // Both have population 1 so demand is identical. Starvation should
        // appear as a higher shortage in the north quote.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const marketEvents = world.events.filter(event => event.type === 'MARKET_TICK');
        const northQuote = marketEvents.find(event => event.townId === 'north');
        const southQuote = marketEvents.find(event => event.townId === 'south');
        expect(northQuote.shortage).toBeGreaterThan(southQuote.shortage);
    });

    it('a town that received deliveries has inventory above zero after the tick', () => {
        // With the new produce/consume/spoil loop and a storage capacity
        // of 100 for south's food, the inventory math is:
        //   next = (current + produce * pop) - consume * pop, then spoil
        //   by `spoilageRate` of the post-consume amount.
        // South's defaults after the calibration fix: produces 1.2 food,
        // consumes 1 food, spoils 5%. Starting from 50 (under the 100
        // cap): 50 + 1.2 = 51.2, -1 = 50.2, spoil 5% of 50.2 = 2.51
        // → final = 47.69.
        const world = createClosedWorldScenario();
        const south = world.towns.get('south');
        south.market.deliverCargo('food', 50, { routeRisk: 0 });
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const marketEvents = world.events.filter(event => event.type === 'MARKET_TICK');
        const southQuote = marketEvents.find(event => event.townId === 'south' && event.kind === 'food');
        // The post-spoil supply should be ~47.69 (within float epsilon).
        expect(southQuote.supply).toBeCloseTo(47.69, 2);
        expect(southQuote.supply).toBeGreaterThan(0);
    });

    it('drives every good in town.consumes through the market step', () => {
        // The default scenario declares food and tools. Stock both, then
        // verify that the reducer runs the full stock-flow loop per
        // (town, kind). North produces 1.5 food / 0.1 tools, south
        // produces 0.5 food / 0.3 tools, both spoil 5% of food, and
        // both have a storage capacity of 100 food / 50 tools. Pre-stocking
        // 100 of each good exercises the cap on north food and south
        // tools; the other paths use the headroom.
        //   north food: produce 1.5 (capped at 100), -1 = 99, spoil 5% = 94.05
        //   north tools: 100 + 0.1 = 100.1 (capped at 50), -0.2 = 49.8, spoil 0 = 49.8
        //   south food: 100 + 0.5 = 100.5 (capped at 100), -1 = 99, spoil 5% = 94.05
        //   south tools: 100 + 0.3 = 100.3 (capped at 50), -0.2 = 49.8, spoil 0 = 49.8
        const world = createClosedWorldScenario();
        const north = world.towns.get('north');
        const south = world.towns.get('south');
        north.market.deliverCargo('food', 100, { routeRisk: 0 });
        north.market.deliverCargo('tools', 100, { routeRisk: 0 });
        south.market.deliverCargo('food', 100, { routeRisk: 0 });
        south.market.deliverCargo('tools', 100, { routeRisk: 0 });
        // Disable the bandit so relocation doesn't perturb state.
        world.bandits[0].alternateRoadId = null;
        world.bandits[0].lootExpectation = 0;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        expect(north.market.inventory.get('food')).toBeCloseTo(94.05, 2);
        expect(north.market.inventory.get('tools')).toBeCloseTo(49.8, 2);
        expect(south.market.inventory.get('food')).toBeCloseTo(94.05, 2);
        expect(south.market.inventory.get('tools')).toBeCloseTo(49.8, 2);
    });

    it('suppresses MARKET_TICK events per (town, kind) pair when the quote is unchanged', () => {
        // The skip rule now keys on the (townId, kind) pair, so a change
        // in one good's quote should still emit an event for that good
        // while the other good stays quiet. With the produce/consume/spoil
        // loop added, identical state across ticks requires BOTH a zero
        // population (so produce and consume are no-ops) AND zero spoilage
        // (so spoil is a no-op too). The default scenario spoilage on food
        // is 5%/tick, so we zero it for the test.
        const world = createClosedWorldScenario();
        const north = world.towns.get('north');
        for (const town of world.towns.values()) {
            town.population = 0;
            // Zero spoilage so the post-spoil quote is identical across ticks.
            for (const kind of Object.keys(town.consumes)) {
                town.market.setSpoilageRate(kind, 0);
            }
        }
        north.market.deliverCargo('food', 100, { routeRisk: 0 });
        north.market.deliverCargo('tools', 100, { routeRisk: 0 });
        world.bandits[0].alternateRoadId = null;
        world.bandits[0].lootExpectation = 0;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const firstTickEvents = world.events.filter(
            event => event.type === 'MARKET_TICK' && event.tick === 1
        );
        const goodsPerTown = Object.keys(world.towns.get('north').consumes).length;
        expect(firstTickEvents).toHaveLength(world.towns.size * goodsPerTown);

        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0 });
        const secondTickEvents = world.events.filter(
            event => event.type === 'MARKET_TICK' && event.tick === 2
        );
        // Second tick matches the first; the skip rule fires.
        expect(secondTickEvents).toHaveLength(0);
    });

    it('emits a JUSTICE_RESOLVED event per town when attacks occur', () => {
        const world = createClosedWorldScenario();
        // Seed an attack so reportedCrime = true.
        resolveBanditAttack(world, { tick: 1 });
        tickClosedWorld(world, { tick: 2 });
        const justiceEvents = world.events.filter(
            event => event.type === 'JUSTICE_RESOLVED' && event.tick === 2
        );
        expect(justiceEvents).toHaveLength(world.towns.size);
        for (const event of justiceEvents) {
            expect(event.migrationPressure).toBeGreaterThanOrEqual(0);
            expect(event.legitimacy).toBeGreaterThanOrEqual(0);
        }
    });

    it('justice state compounds across ticks with sustained attacks', () => {
        const world = createClosedWorldScenario();
        // Tick 1: attack. Tick 2: another attack. The second tick should
        // see greater migration pressure than the first.
        resolveBanditAttack(world, { tick: 1 });
        tickClosedWorld(world, { tick: 2 });
        const firstGrievance = world.justiceState.get('north').grievance;

        resolveBanditAttack(world, { tick: 2 });
        tickClosedWorld(world, { tick: 3 });
        const secondGrievance = world.justiceState.get('north').grievance;
        expect(secondGrievance).toBeGreaterThanOrEqual(firstGrievance);
    });

    it('records justice state in the tick snapshot', () => {
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const snapshot = world.tickHistory[0];
        expect(snapshot.justice).toHaveLength(world.towns.size);
        for (const entry of snapshot.justice) {
            expect(entry.townId).toBeTruthy();
            expect(entry.legitimacy).toBeGreaterThanOrEqual(0);
            expect(entry.migrationPressure).toBeGreaterThanOrEqual(0);
        }
    });

    it('emits a REPORT_FILED event when a guard reports a bandit', () => {
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const reports = world.events.filter(event => event.type === 'REPORT_FILED');
        expect(reports.length).toBeGreaterThan(0);
        expect(world.reports.length).toBe(reports.length);
    });

    it('emits no JUSTICE_RESOLVED event when there is no reported crime', () => {
        // The reducer resolves justice only when `attacksUpToTick > 0`. With
        // no bandit attacks in the world, the resolver is not called and
        // no JUSTICE_RESOLVED event is emitted. The state is preserved at
        // its idle baseline.
        const world = createClosedWorldScenario();
        // Strip the bandit so no attack can be seeded.
        world.bandits = [];
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const firstTickJustice = world.events.filter(
            event => event.type === 'JUSTICE_RESOLVED' && event.tick === 1
        );
        expect(firstTickJustice).toHaveLength(0);

        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0 });
        const secondTickJustice = world.events.filter(
            event => event.type === 'JUSTICE_RESOLVED' && event.tick === 2
        );
        expect(secondTickJustice).toHaveLength(0);
    });

    it('emits an INVASION event when a faction with resources is in RAID state', () => {
        // Build a faction whose `reassess` formula lands in RAID state.
        // The reducer reassesses every tick, so we configure parameters
        // that produce raidScore >= 0.55 (RAIDING) under the reducer's
        // `perceivedDanger: 0.0, supplyShortage: 0.1, enemyWeakness: 0.5`
        // inputs: grievance: 0.5, militaryConfidence: 1.0, riskTolerance: 1.0
        // yields raidScore = 0.5 + 0.2 + 0.2 = 0.9, which is RETALIATORY.
        const world = createClosedWorldScenario();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.resources = 2;
        south.maxResources = 2;
        // The bandit must be on a road that connects to the faction's town.
        // South has road-a and road-c connecting it to north. The default
        // bandit is on road-a, so this should resolve.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const invasions = world.events.filter(event => event.type === 'INVASION');
        expect(invasions.length).toBeGreaterThan(0);
        expect(invasions[0].factionId).toBe('south-faction');
        // Resource consumed: 2 -> 1.
        expect(south.resources).toBe(1);
    });

    it('emits exactly one FACTION_ACTION and one INVASION per raid, sharing actionId/causationId', () => {
        // Critical regression test: the audit found that `runClosedWorldStep`
        // and `tickClosedWorld` could each call the mutating retaliation
        // function, double-charging the raid. The fix splits planning from
        // execution and tags both events with the same actionId so an
        // external auditor can confirm one raid == one resource consumed.
        const world = createClosedWorldScenario();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.resources = 2;
        south.maxResources = 2;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const factionActions = world.events.filter(event => event.type === 'FACTION_ACTION' && event.tick === 1);
        const invasions = world.events.filter(event => event.type === 'INVASION' && event.tick === 1);
        expect(factionActions).toHaveLength(1);
        expect(invasions).toHaveLength(1);
        // The FACTION_ACTION carries the plan's actionId; the INVASION
        // cites it as causationId. Same plan, same action, no duplication.
        expect(factionActions[0].action.actionId).toBe(invasions[0].causationId);
        // Resource consumed exactly once: 2 -> 1, not 2 -> 0.
        expect(south.resources).toBe(1);
    });

    it('drops resources from 1 to 0 in a single raid (not -1)', () => {
        // Edge case the user explicitly called out: a faction at the
        // minimum resources should end the raid with exactly 0, never
        // negative and never -1.
        const world = createClosedWorldScenario();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.resources = 1;
        south.maxResources = 1;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        expect(south.resources).toBe(0);
        const invasions = world.events.filter(event => event.type === 'INVASION' && event.tick === 1);
        expect(invasions).toHaveLength(1);
    });

    it('refuses to double-execute the same plan (executedActions is an idempotency guard)', () => {
        // Direct test of the guard: even if some caller tries to feed the
        // same plan back into `executeRetaliation`, the faction's
        // `executedActions` set rejects it.
        const world = createClosedWorldScenario();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.resources = 2;
        south.maxResources = 2;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        // After the first tick, the plan was applied. Re-applying the
        // recorded actionId must not consume another resource.
        const invasion = world.events.find(event => event.type === 'INVASION' && event.tick === 1);
        expect(invasion).toBeTruthy();
        const planActionId = invasion.causationId;
        // Reset resources to 2 to make any double-charge visible.
        south.resources = 2;
        // Build a fake plan that references the same actionId.
        const replay = { ok: true, action: { actionId: planActionId, type: 'RETALIATION' } };
        const result = executeRetaliation(south, world.bandits[0], replay);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('ALREADY_EXECUTED');
        // Resources unchanged.
        expect(south.resources).toBe(2);
    });

    it('does not invade when the faction is in HOLD state', () => {
        const world = createClosedWorldScenario();
        // Default faction parameters: low grievance, low military confidence,
        // low risk tolerance — reassess yields raidScore well below 0.55.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const invasions = world.events.filter(event => event.type === 'INVASION');
        expect(invasions).toHaveLength(0);
    });

    it('does not invade when the faction has no resources', () => {
        // RAID-capable parameters but resources = 0.
        const world = createClosedWorldScenario();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.resources = 0;
        south.maxResources = 2;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const invasions = world.events.filter(event => event.type === 'INVASION');
        expect(invasions).toHaveLength(0);
    });

    it('marks the bandit as threatened after a successful invasion', () => {
        const world = createClosedWorldScenario();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.resources = 2;
        south.maxResources = 2;
        const bandit = world.bandits[0];
        expect(bandit.threatened).toBeFalsy();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        expect(bandit.threatened).toBe(true);
    });

    it('refills faction resources by 1 each tick, capped at maxResources', () => {
        const world = createClosedWorldScenario();
        // Feed both towns so the market-derived shortage is 0 and the
        // faction does not enter RAID. Without feeding, the south faction
        // correctly enters RAID on the first tick (the town is starving)
        // and the refill rule skips RAIDing factions — which is a
        // different test.
        for (const town of world.towns.values()) {
            for (const kind of Object.keys(town.consumes)) {
                town.market.deliverCargo(kind, 100, { routeRisk: 0 });
            }
        }
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.resources = 1;
        south.maxResources = 3;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        // Refill brings resources from 1 to 2 (capped at 3).
        expect(south.resources).toBe(2);
        // Already at cap; refill is a no-op.
        south.resources = 3;
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0 });
        expect(south.resources).toBe(3);
    });

    it('records faction resources in the tick snapshot', () => {
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const snapshot = world.tickHistory[0];
        expect(snapshot.factionResources).toHaveLength(world.factions.length);
        for (const entry of snapshot.factionResources) {
            expect(entry.resources).toBeGreaterThanOrEqual(0);
            expect(entry.maxResources).toBeGreaterThan(0);
        }
    });

    it('town.produces drives inventory toward the storage-capacity cap without overflow', () => {
        // The audit: "production greater than consumption creates the
        // opposite bug: inventory grows without bound forever." Run
        // 50 ticks of just the market step (no bandit, no faction) and
        // verify the cap holds. North produces 1.5 food/tick and
        // consumes 1 food/tick (net +0.5 before spoil, less after 5%
        // spoil), with a 100 cap. The cap must not be exceeded even
        // when production vastly outpaces consumption; spoil drives
        // the inventory to a steady state well below the cap.
        const world = createClosedWorldScenario();
        // Disable bandit and faction effects so only the market step runs.
        world.bandits[0].alternateRoadId = null;
        world.bandits[0].lootExpectation = 0;
        world.factions.forEach(f => {
            f.grievance = 0;
            f.fear = 0;
        });
        for (let i = 0; i < 50; i++) {
            tickClosedWorld(world, { tick: i + 1, perceivedDanger: 0.0 });
        }
        for (const [townId, town] of world.towns) {
            for (const [kind, capacity] of town.market.capacity) {
                const inv = town.market.inventory.get(kind) || 0;
                // Inventory must never exceed the storage capacity.
                expect(inv).toBeLessThanOrEqual(capacity + 1e-9);
                // Inventory must never be negative.
                expect(inv).toBeGreaterThanOrEqual(-1e-9);
            }
        }
        // Steady state: north food has net +0.5/tick produce, -1 consume,
        // 5% spoil. Equilibrium: 0.5 = 0.05 * inv → inv = 10. So after
        // 50 ticks, north food should be in the [5, 20] band. If the
        // cap were missing, the inventory would grow without bound
        // toward 100+ (or higher), so a low value here is the proof
        // that the cap-and-spoil system is working as intended.
        const north = world.towns.get('north');
        expect(north.market.inventory.get('food')).toBeGreaterThan(5);
        expect(north.market.inventory.get('food')).toBeLessThan(20);
        // Tools: net negative production; inventory should be near 0.
        expect(north.market.inventory.get('tools')).toBeLessThan(20);
    });
});

describe('runClosedWorldForTicks', () => {
    it('runs the seed scenario plus the requested additional ticks', () => {
        const world = runClosedWorldForTicks({ ticks: 3, perceivedDanger: 0.8 });
        // Tick 1 produces the original 7 events from runClosedWorldScenario;
        // ticks 2 and 3 add reassessment + relocation + respawn + snapshot
        // events. The history should have 2 entries (ticks 2 and 3).
        expect(world.tickHistory).toHaveLength(2);
        expect(world.tickHistory.map(s => s.tick)).toEqual([2, 3]);
    });

    it('rejects non-positive tick counts', () => {
        expect(() => runClosedWorldForTicks({ ticks: 0 })).toThrow(RangeError);
        expect(() => runClosedWorldForTicks({ ticks: -1 })).toThrow(RangeError);
        expect(() => runClosedWorldForTicks({ ticks: 1.5 })).toThrow(RangeError);
    });

    it('is deterministic for identical inputs', () => {
        const a = runClosedWorldForTicks({ ticks: 4, perceivedDanger: 0.7 });
        const b = runClosedWorldForTicks({ ticks: 4, perceivedDanger: 0.7 });
        expect(a.tickHistory).toEqual(b.tickHistory);
        expect(a.bandits[0].roadId).toBe(b.bandits[0].roadId);
    });
});

