import {
    ScenarioInterventionSystem,
    INTERVENTION_TYPES,
    CONSEQUENCE_DOMAINS
} from '../packages/core/index.js';

describe('Front A: ScenarioInterventionSystem & Living-World Player Interventions', () => {
    let interventionSystem;

    beforeEach(() => {
        interventionSystem = new ScenarioInterventionSystem();
    });

    test('1. Acute Threat Injection triggers localized fear surge and advisory directives', () => {
        const intv = interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.INJECT_ACUTE_THREAT,
            parameters: {
                position: { x: 50, y: 50, z: 0 },
                intensity: 0.90,
                radius: 40.0
            },
            durationTicks: 5
        });

        expect(intv.id).toBeDefined();

        const mockWorldContext = {
            agents: [
                { id: 'agent_near', position: { x: 55, y: 50, z: 0 } }, // 5m away
                { id: 'agent_far', position: { x: 150, y: 150, z: 0 } }  // >100m away
            ]
        };

        const shocks = interventionSystem.evaluateInterventions(mockWorldContext);
        expect(shocks.length).toBe(1);
        expect(shocks[0].advisoryDirectives.length).toBe(1);
        expect(shocks[0].advisoryDirectives[0].targetAgentId).toBe('agent_near');
        expect(shocks[0].advisoryDirectives[0].directive).toBe('ELEVATE_FEAR_STIMULUS');
        expect(shocks[0].impactSnapshot.domain).toBe(CONSEQUENCE_DOMAINS.AFFECTIVE);
        expect(shocks[0].impactSnapshot.affectedEntitiesCount).toBe(1);
    });

    test('2. Leader Assassination emits leadership crisis and panic multiplier', () => {
        interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.ASSASSINATE_LEADER,
            target: 'SETTLERS_ALLIANCE',
            durationTicks: 10
        });

        const shocks = interventionSystem.evaluateInterventions({});
        expect(shocks.length).toBe(1);
        expect(shocks[0].advisoryDirectives[0].directive).toBe('LEADERSHIP_VACANCY_CRISIS');
        expect(shocks[0].advisoryDirectives[0].panicContagionMultiplier).toBe(2.0);
        expect(shocks[0].impactSnapshot.domain).toBe(CONSEQUENCE_DOMAINS.DIPLOMATIC);
    });

    test('3. Trade Corridor Blockade emits transit suspension and detour advisory', () => {
        interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.BLOCK_TRADE_CORRIDOR,
            target: 'HIGHLAND_PASS',
            parameters: { detourCorridorId: 'RIVER_DETOUR' },
            durationTicks: 8
        });

        const shocks = interventionSystem.evaluateInterventions({});
        expect(shocks.length).toBe(1);
        expect(shocks[0].advisoryDirectives[0].directive).toBe('CORRIDOR_TRANSIT_SUSPENDED');
        expect(shocks[0].advisoryDirectives[0].recommendedDetour).toBe('RIVER_DETOUR');
        expect(shocks[0].impactSnapshot.domain).toBe(CONSEQUENCE_DOMAINS.ECONOMIC);
    });

    test('4. Commodity Drought triggers famine desperation and migration push', () => {
        interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.INJECT_COMMODITY_DROUGHT,
            target: 'RIVERBEND',
            parameters: { severity: 0.80 },
            durationTicks: 5
        });

        const shocks = interventionSystem.evaluateInterventions({});
        expect(shocks.length).toBe(1);
        expect(shocks[0].advisoryDirectives[0].directive).toBe('FAMINE_DESPERATION_FEEDBACK');
        expect(shocks[0].advisoryDirectives[0].migrationPushTriggered).toBe(true);
        expect(shocks[0].impactSnapshot.domain).toBe(CONSEQUENCE_DOMAINS.DEMOGRAPHIC);
    });

    test('5. Brokered Peace enforces ceasefire summit and grievance dampening', () => {
        interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.BROKER_PEACE_OR_ALLIANCE,
            parameters: { factions: ['SETTLERS', 'BANDITS'] },
            durationTicks: 12
        });

        const shocks = interventionSystem.evaluateInterventions({});
        expect(shocks.length).toBe(1);
        expect(shocks[0].advisoryDirectives[0].directive).toBe('ENFORCE_CEASEFIRE_SUMMIT');
        expect(shocks[0].advisoryDirectives[0].targetStance).toBe('TRADE');
        expect(shocks[0].impactSnapshot.peaceEnforced).toBe(true);
    });

    test('6. Multi-tick consequence time-series persistence and Causal Report generation', () => {
        const record = interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.INJECT_COMMODITY_DROUGHT,
            target: 'OAKHAVEN',
            parameters: { severity: 0.75 },
            durationTicks: 4
        });

        // Run for 4 ticks
        for (let i = 0; i < 4; i++) {
            interventionSystem.evaluateInterventions({});
        }

        const report = interventionSystem.generateCausalReport(record);
        expect(report.ticksObserved).toBe(4);
        expect(report.effectSize).toBeGreaterThan(0.2);
        expect(report.immediateImpact).toBeDefined();
        expect(report.narrative).toContain('persistent causal influence');
    });

    test('7. State serialization and 100% bit-exact replay determinism', () => {
        interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.BLOCK_TRADE_CORRIDOR,
            target: 'EAST_HIGHWAY',
            durationTicks: 6
        });

        interventionSystem.evaluateInterventions({});

        const stateA = interventionSystem.getState();
        const systemB = new ScenarioInterventionSystem();
        systemB.setState(stateA);
        const stateB = systemB.getState();

        expect(JSON.stringify(stateA)).toBe(JSON.stringify(stateB));
    });

    test('8. Host Game Authority Invariant strictly preserved', () => {
        const mockAgent = { id: 'host_actor_1', position: { x: 10, y: 10 }, hp: 100 };
        const initialAgentState = JSON.stringify(mockAgent);

        interventionSystem.applyIntervention({
            type: INTERVENTION_TYPES.INJECT_ACUTE_THREAT,
            parameters: { position: { x: 10, y: 10 }, radius: 20 },
            durationTicks: 2
        });

        const shocks = interventionSystem.evaluateInterventions({ agents: [mockAgent] });
        expect(shocks.length).toBe(1);

        // Assert host actor object was not mutated by the middleware
        expect(JSON.stringify(mockAgent)).toBe(initialAgentState);
    });
});
