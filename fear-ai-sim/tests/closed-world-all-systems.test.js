import { describe, expect, it, jest } from '@jest/globals';
import { Simulation } from '../simulation.js';
import { tickClosedWorld } from '../closed-world.js';

function makeSimulation() {
    const ctx = {
        getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
        createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
        putImageData: jest.fn(), clearRect: jest.fn(), fillRect: jest.fn()
    };
    const canvas = { width: 320, height: 240, getContext: () => ctx, parentElement: null };
    return new Simulation(canvas, { initialPopulation: 0, spawnRate: 0, mutationRate: 0 });
}

describe('closed-world all-systems integration', () => {
    it('drives the chain through 5 ticks and produces the expected event mix', () => {
        const simulation = makeSimulation();
        const world = simulation.configureClosedWorld();
        // R1: the bandit's trafficBelief is prior observation history.
        // With the panopticon closed, an idle bandit acquires no new
        // distant beliefs on its own; seed a lawful prior (scouted road-c
        // traffic) so the relocation leg of the mix can fire.
        world.bandits[0].trafficBelief['road-c'] = { estimatedTraffic: 3, recency: 1.0, lastDecayTick: 1 };
        const eventTypesSeen = new Set();
        const collect = () => {
            for (const event of world.events) eventTypesSeen.add(event.type);
        };

        // Drive 5 ticks via the canonical runtime path.
        // EVID-2026-08-29-RUNTIME-AUTHORITATIVE: `runClosedWorldStep`
        // now invokes the canonical reducer itself, so we
        // don't need to call `tickClosedWorld` separately.
        // The internal counter advances 1..5.
        for (let i = 0; i < 5; i++) {
            simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
            collect();
        }

        // The chain must surface the core causal links.
        // EVID-2026-08-29-RUNTIME-AUTHORITATIVE: the canonical
        // path emits a subset of the manual helpers' events
        // on tick 1. RUMOR, FACTION_REASSESSMENT, and
        // FACTION_ACTION are emitted by the manual helpers
        // (applySurvivorEvidence, reassessFaction,
        // planRetaliation) which the runtime no longer
        // calls. The canonical reducer has its own versions
        // of these steps but they may not fire on tick 1
        // (e.g., FACTION_REASSESSMENT only fires when
        // escalation changes). We assert the events the
        // canonical path GUARANTEES to produce.
        const expected = [
            'CONVOY_FORMED', 'ROUTE_SELECTED', 'MERCHANT_ROUTE_DECISION',
            'BANDIT_ATTACK', 'BANDIT_RELOCATION', 'MARKET_TICK',
            'JUSTICE_RESOLVED', 'REPORT_FILED'
        ];
        const missing = expected.filter(type => !eventTypesSeen.has(type));
        if (missing.length) {
            throw new Error(`Missing event types: ${missing.join(', ')}; got: ${[...eventTypesSeen].join(', ')}`);
        }
    });

    it('records a tickHistory entry for every reducer tick', () => {
        const simulation = makeSimulation();
        const world = simulation.configureClosedWorld();
        for (let i = 0; i < 5; i++) {
            simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
        }
        expect(world.tickHistory).toHaveLength(5);
        expect(world.tickHistory.map(s => s.tick)).toEqual([1, 2, 3, 4, 5]);
    });

    it('emits an INVASION event when the south faction is raid-capable', () => {
        // The seed scenario configures `south-faction` with low grievance
        // and low military confidence, so its `reassess` formula lands in
        // HOLD. Crank the parameters so the formula lands in RAID. The
        // north-faction will also eventually escalate through grievance
        // accumulation; starve it of resources so only south invades.
        const simulation = makeSimulation();
        const world = simulation.configureClosedWorld();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.maxResources = 4;
        south.resources = 4;
        const north = world.factions.find(faction => faction.id === 'north-faction');
        north.resources = 0;
        north.maxResources = 0;

        const step1 = simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
        for (let i = 0; i < 4; i++) {
            simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
        }

        const invasions = world.events.filter(event => event.type === 'INVASION');
        expect(invasions.length).toBeGreaterThan(0);
        if (!invasions.every(event => event.factionId === 'south-faction')) {
            const factions = [...new Set(invasions.map(event => event.factionId))];
            throw new Error(`Expected only south-faction invasions; got: ${factions.join(', ')}`);
        }
        for (const event of invasions) {
            expect(event.resourcesLeft).toBeGreaterThanOrEqual(0);
            expect(event.resourcesLeft).toBeLessThanOrEqual(south.maxResources);
        }
    });

    it('marks the bandit as threatened after a successful invasion', () => {
        const simulation = makeSimulation();
        const world = simulation.configureClosedWorld();
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.maxResources = 4;
        south.resources = 4;

        const bandit = world.bandits[0];
        const step1 = simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
        expect(bandit.threatened).toBe(true);
    });

    it('drives market prices across ticks via the per-town consume loop', () => {
        const simulation = makeSimulation();
        const world = simulation.configureClosedWorld();
        for (const town of world.towns.values()) {
            town.market.deliverCargo('food', 50, { routeRisk: 0 });
            town.market.deliverCargo('tools', 50, { routeRisk: 0 });
        }
        for (let i = 0; i < 5; i++) {
            simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
        }
        const marketEvents = world.events.filter(event => event.type === 'MARKET_TICK');
        expect(marketEvents.length).toBeGreaterThan(0);
        const north = world.towns.get('north');
        // E5: the market loop touches consumes UNION produces (ore/metal
        // intermediates produce/consume without demand), so count that union.
        const goodsPerTown = new Set([...Object.keys(north.consumes ?? {}), ...Object.keys(north.produces ?? {})]).size;
        for (const snapshot of world.tickHistory) {
            expect(snapshot.marketPrices).toHaveLength(world.towns.size * goodsPerTown);
        }
    });

    it('justice state compounds across ticks when attacks persist', () => {
        const simulation = makeSimulation();
        const world = simulation.configureClosedWorld();
        simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
        const tick2Grievance = world.justiceState.get('north').grievance;
        simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
        const tick3Grievance = world.justiceState.get('north').grievance;
        expect(tick3Grievance).toBeGreaterThanOrEqual(tick2Grievance);
    });

    it('is deterministic for identical inputs', () => {
        function runOnce() {
            const simulation = makeSimulation();
            const world = simulation.configureClosedWorld();
            for (let i = 0; i < 5; i++) {
                simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
            }
            return {
                eventTypes: world.events.map(event => event.type),
                ticks: world.tickHistory.map(s => s.tick),
                banditRoad: world.bandits[0].roadId
            };
        }
        const a = runOnce();
        const b = runOnce();
        expect(a.eventTypes).toEqual(b.eventTypes);
        expect(a.ticks).toEqual(b.ticks);
        expect(a.banditRoad).toBe(b.banditRoad);
    });

    it('INVASION is the single execution of FACTION_ACTION (actionId/causationId correlation)', () => {
        // This is the verification gap the audit called out: the original
        // all-systems test asserted event types but not the causal
        // relationship between the decision and the execution. With the
        // plan/execute split, every FACTION_ACTION must cite a unique
        // actionId, every INVASION must cite the same actionId as its
        // causationId, and the FACTION_ACTION must appear in the event log
        // strictly before the INVASION that shares its actionId.
        const simulation = makeSimulation();
        const world = simulation.configureClosedWorld();
        // Force south into RAID and starve north so only south invades.
        const south = world.factions.find(faction => faction.id === 'south-faction');
        south.grievance = 0.5;
        south.militaryConfidence = 1.0;
        south.riskTolerance = 1.0;
        south.maxResources = 4;
        south.resources = 4;
        const north = world.factions.find(faction => faction.id === 'north-faction');
        north.resources = 0;
        north.maxResources = 0;

        // Drive 5 ticks. Pre-seed resources so the south faction is raid-
        // capable for at least the first two ticks.
        for (let i = 0; i < 5; i++) {
            simulation.runClosedWorldStep({ perceivedDanger: 0.8, attackRoadId: 'road-a' });
            // Replenish so the south faction keeps raiding.
            if (south.resources < 2) {
                south.resources = 4;
                south.maxResources = 4;
            }
        }

        // Every INVASION's causationId must match a prior FACTION_ACTION's
        // action.actionId, and the FACTION_ACTION must come first. Walk
        // the event log in order, tracking every actionId we have seen,
        // and assert that every INVASION cites an actionId we already
        // saw. Also assert unique actionIds across all FACTION_ACTIONs.
        const factionActions = world.events.filter(event => event.type === 'FACTION_ACTION');
        const invasions = world.events.filter(event => event.type === 'INVASION');
        expect(factionActions.length).toBeGreaterThan(0);
        expect(invasions.length).toBeGreaterThan(0);
        // Every FACTION_ACTION's actionId is unique.
        const actionIds = factionActions.map(event => event.action && event.action.actionId);
        const uniqueActionIds = new Set(actionIds);
        expect(uniqueActionIds.size).toBe(actionIds.length);
        // Walk the event log forward; every INVASION must cite an actionId
        // that was emitted by a FACTION_ACTION earlier in the log.
        const seenActionIds = new Set();
        let orderViolations = 0;
        for (const event of world.events) {
            if (event.type === 'FACTION_ACTION' && event.action && event.action.actionId) {
                seenActionIds.add(event.action.actionId);
            } else if (event.type === 'INVASION') {
                expect(typeof event.causationId).toBe('string');
                if (!seenActionIds.has(event.causationId)) {
                    orderViolations += 1;
                }
            }
        }
        if (orderViolations > 0) {
            throw new Error(`Found ${orderViolations} INVASION events that cited a FACTION_ACTION that did not appear earlier in the log`);
        }
        // Every INVASION's causationId must match exactly one FACTION_ACTION.
        for (const invasion of invasions) {
            const matches = factionActions.filter(event => event.action && event.action.actionId === invasion.causationId);
            expect(matches).toHaveLength(1);
        }
    });
});
