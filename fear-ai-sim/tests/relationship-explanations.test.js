import { describe, it, expect } from '@jest/globals';
import {
    DiagnosticExplainabilityInspector,
    RelationshipTensorSystem,
    INTERACTION_TYPES,
} from '../packages/core/index.js';

// NEXT-163 (post-25 candidate 3): causal explanations citing
// relationships. explainAgentDecision gains opt-in
// context.relationshipSystem: observed peers with explicit tensor
// entries are cited with directed trust, and the top-trust peer of the
// two trusted-peer-resolution intents (APPROACH_ALLY, WARN_GROUP) is
// named the selected target. Reads never fabricate tensor entries.
function tensor() {
    const t = new RelationshipTensorSystem();
    t.recordInteraction('me', 'friend', 'AID_RECEIVED');
    t.recordInteraction('me', 'friend', 'AID_RECEIVED');
    t.recordInteraction('me', 'rival', 'BETRAYAL');
    return t;
}

const agentWith = (intentType) => ({
    id: 'me',
    traits: { neuroticism: 0.5, resilience: 0.5 },
    currentFear: 0.3,
    lastResult: { action_intent: { type: intentType, urgency: 0.5 }, fear_band: 'ALERT' },
});

const OBS = { peers: [{ id: 'friend' }, { id: 'rival' }, { id: 'stranger' }] };

describe('NEXT-163: explanations citing relationships', () => {
    it('1. Legacy calls report empty factors and unchanged shape', () => {
        const e = DiagnosticExplainabilityInspector.explainAgentDecision(agentWith('FLEE_FROM'), OBS, {});
        expect(e.relationship_factors).toEqual([]);
        expect(e.agent_id).toBe('me');
        expect(e.threat_attribution).toBeDefined();
    });

    it('2. Trusted-peer intents name the top-trust peer as selected target', () => {
        const t = tensor();
        for (const intent of ['APPROACH_ALLY', 'WARN_GROUP']) {
            const e = DiagnosticExplainabilityInspector.explainAgentDecision(
                agentWith(intent), OBS, { relationshipSystem: t });
            expect(e.relationship_factors[0]).toMatchObject({ peer_id: 'friend', role: 'selected-target' });
            expect(Number(e.relationship_factors[0].trust)).toBeGreaterThan(0);
        }
    });

    it('3. Other intents cite the landscape without causal roles', () => {
        const t = tensor();
        const e = DiagnosticExplainabilityInspector.explainAgentDecision(
            agentWith('FLEE_FROM'), OBS, { relationshipSystem: t });
        expect(e.relationship_factors.length).toBe(2);
        expect(e.relationship_factors.map((r) => r.peer_id)).toEqual(['friend', 'rival']);
        for (const r of e.relationship_factors) expect(r.role).toBe('observed');
        expect(Number(e.relationship_factors[1].trust)).toBeLessThan(0);
    });

    it('4. Explaining never fabricates tensor entries', () => {
        const t = tensor();
        expect(t.hasRelationship('me', 'stranger')).toBe(false);
        DiagnosticExplainabilityInspector.explainAgentDecision(agentWith('FLEE_FROM'), OBS, { relationshipSystem: t });
        expect(t.hasRelationship('me', 'stranger')).toBe(false);
    });

    it('5. Hostile or malformed systems degrade to empty factors', () => {
        const agent = agentWith('APPROACH_ALLY');
        expect(DiagnosticExplainabilityInspector.explainAgentDecision(agent, OBS, { relationshipSystem: null }).relationship_factors).toEqual([]);
        expect(DiagnosticExplainabilityInspector.explainAgentDecision(agent, OBS, { relationshipSystem: {} }).relationship_factors).toEqual([]);
        const throwing = {
            hasRelationship: () => { throw new Error('boom'); },
            getRelationship: () => { throw new Error('boom'); },
        };
        expect(DiagnosticExplainabilityInspector.explainAgentDecision(agent, OBS, { relationshipSystem: throwing }).relationship_factors).toEqual([]);
    });

    it('6. Explanations replay exactly', () => {
        const run = () => DiagnosticExplainabilityInspector.explainAgentDecision(
            agentWith('APPROACH_ALLY'), OBS, { relationshipSystem: tensor() });
        expect(run()).toEqual(run());
    });
});
