import { describe, it, expect } from '@jest/globals';
import {
    AffectiveAgent,
    FactionSystem,
    INCIDENT_TYPES,
    DiagnosticExplainabilityInspector
} from '../packages/core/index.js';

describe('Designer Control & Diagnostic Explainability Inspector (Sections XXXI & XXXII)', () => {

    it('1. Generates structured threat attribution decomposing sensory, trauma, and contagion weights', () => {
        const agent = new AffectiveAgent('coward_01', { neuroticism: 0.9, resilience: 0.1 });
        const obs = {
            threats: [{ id: 'apex_stalker', distance: 5.0, intensity: 1.0 }],
            sounds: [{ id: 'whisper', distance: 12.0, intensity: 0.4 }],
            peers: [{ id: 'panicked_peer', distance: 8.0 }]
        };
        const context = {
            traumaDread: 0.5,
            contagionFear: 0.4
        };

        // Tick agent
        agent.tick(0.016, obs, context);

        const explanation = DiagnosticExplainabilityInspector.explainAgentDecision(agent, obs, context);

        expect(explanation).toBeDefined();
        expect(explanation.agent_id).toBe('coward_01');
        expect(explanation.threat_attribution.length).toBeGreaterThanOrEqual(2);

        const factors = explanation.threat_attribution.map(f => f.factor);
        expect(factors).toContain('SENSORY_PROXIMITY_THREAT');
        expect(factors).toContain('SPATIAL_TRAUMA_DREAD');
        expect(factors).toContain('SOCIAL_PANIC_CONTAGION');

        // Weights must sum to approximately 1.0
        const weightSum = explanation.threat_attribution.reduce((sum, f) => sum + f.weight, 0);
        expect(weightSum).toBeCloseTo(1.0, 1);
    });

    it('2. Explains trait impacts as percentage deltas against neutral baseline', () => {
        const agent = new AffectiveAgent('stoic_01', { neuroticism: 0.1, resilience: 0.9 });
        agent.tick(0.016, { threats: [] });

        const explanation = DiagnosticExplainabilityInspector.explainAgentDecision(agent, { threats: [] });

        expect(explanation.trait_impacts).toBeDefined();
        const neuroticismImpact = explanation.trait_impacts.find(t => t.trait === 'NEUROTICISM');
        const resilienceImpact = explanation.trait_impacts.find(t => t.trait === 'RESILIENCE');

        expect(neuroticismImpact.impact).toBe('THREAT_ATTENUATION');
        expect(resilienceImpact.impact).toBe('ACCELERATED_RECOVERY');
    });

    it('3. Explicitly explains why alternative intents were rejected', () => {
        const panickingAgent = new AffectiveAgent('panicked_01', { neuroticism: 0.85, resilience: 0.15 });

        // Acute ambush inducing panic
        for (let t = 0; t < 10; t++) {
            panickingAgent.tick(0.016, { threats: [{ distance: 1.0, intensity: 1.0 }] });
        }

        const explanation = DiagnosticExplainabilityInspector.explainAgentDecision(panickingAgent, {
            threats: [{ distance: 1.0, intensity: 1.0 }]
        });

        expect(explanation.rejected_alternatives).toBeDefined();
        expect(explanation.rejected_alternatives.length).toBeGreaterThanOrEqual(1);

        const altNames = explanation.rejected_alternatives.map(a => a.alternative);
        expect(altNames).toContain('CONFRONT_THREAT');
        expect(explanation.rejected_alternatives[0].reason).toContain('exceeded composure threshold');
    });

    it('4. Explains faction strategic and diplomatic decisions', () => {
        const factionSys = new FactionSystem();
        factionSys.registerFaction({ id: 'Kingdom', militaryReadiness: 0.9, territories: ['capital'] });
        factionSys.registerFaction({ id: 'Empire', militaryReadiness: 0.8, territories: ['frontier'] });

        for (let i = 0; i < 5; i++) {
            factionSys.recordIncident('Empire', 'Kingdom', INCIDENT_TYPES.BORDER_TRESPASS, { severity: 0.8 });
        }

        factionSys.advanceTick(1);
        factionSys.evaluateStance('Kingdom', 'Empire');

        const explanation = DiagnosticExplainabilityInspector.explainFactionDecision(factionSys, 'Kingdom', 'Empire');

        expect(explanation).toBeDefined();
        expect(explanation.faction_a).toBe('Kingdom');
        expect(explanation.faction_b).toBe('Empire');
        expect(explanation.bilateral_metrics.power_ratio).toBeGreaterThan(0);
        expect(explanation.contributing_factors.length).toBeGreaterThanOrEqual(1);
    });

    it('5. Pure diagnostic reflection preserves the Host Game Authority Invariant', () => {
        const agent = new AffectiveAgent('scout', { neuroticism: 0.5, resilience: 0.5 });
        const obs = { threats: [{ distance: 10, intensity: 0.5 }] };
        agent.tick(0.016, obs);

        const beforeFear = agent.currentFear;
        const beforeDominance = agent.currentDominance;

        // Calling explain multiple times
        DiagnosticExplainabilityInspector.explainAgentDecision(agent, obs);
        DiagnosticExplainabilityInspector.explainAgentDecision(agent, obs);

        // Ensures zero internal mutation
        expect(agent.currentFear).toBe(beforeFear);
        expect(agent.currentDominance).toBe(beforeDominance);
    });
});
