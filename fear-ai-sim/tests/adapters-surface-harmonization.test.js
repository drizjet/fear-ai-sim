import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ProtocolValidator } from '../packages/protocol/src/validator.js';

describe('R42: Cross-Engine Adapter Surface Harmonization', () => {
    const root = process.cwd();

    it('1. C# Adapter conforms to Canonical Protocol audio schema with backwards compatibility', () => {
        const csharpTypes = fs.readFileSync(path.join(root, 'packages/adapters/csharp/FearTypes.cs'), 'utf8');
        expect(csharpTypes).toContain('[JsonPropertyName("shepard_mix")] public float ShepardMix');
        expect(csharpTypes).toContain('[JsonPropertyName("shepard_tone_mix")] public float ShepardToneMix');
        expect(csharpTypes).toContain('[JsonPropertyName("infrasound_intensity")] public float InfrasoundIntensity');
        expect(csharpTypes).toContain('[JsonPropertyName("vocalization_hint")] public string? VocalizationHint');
        expect(csharpTypes).toContain('[JsonPropertyName("vocalization_cue")] public string? VocalizationCue');
    });

    it('2. Unity Adapter (root and Runtime) exposes HostCapabilities, ReportOutcome, and peers', () => {
        const paths = [
            'packages/adapters/unity/FearTypes.cs',
            'packages/adapters/unity/Runtime/FearTypes.cs',
            'packages/adapters/unity/FearAIClient.cs',
            'packages/adapters/unity/Runtime/FearAIClient.cs',
            'packages/adapters/unity/FearAgent.cs',
            'packages/adapters/unity/Runtime/FearAgent.cs'
        ];

        for (const p of paths) {
            expect(fs.existsSync(path.join(root, p))).toBe(true);
        }

        const typesContent = fs.readFileSync(path.join(root, 'packages/adapters/unity/FearTypes.cs'), 'utf8');
        const runtimeTypesContent = fs.readFileSync(path.join(root, 'packages/adapters/unity/Runtime/FearTypes.cs'), 'utf8');
        expect(typesContent).toBe(runtimeTypesContent);
        expect(typesContent).toContain('public class VisiblePeer');
        expect(typesContent).toContain('public class CapabilityDowngrade');
        expect(typesContent).toContain('public class AffordanceDowngrade');
        expect(typesContent).toContain('public class OutcomeReceipt');
        expect(typesContent).toContain('public List<VisiblePeer> peers');

        const clientContent = fs.readFileSync(path.join(root, 'packages/adapters/unity/FearAIClient.cs'), 'utf8');
        const runtimeClientContent = fs.readFileSync(path.join(root, 'packages/adapters/unity/Runtime/FearAIClient.cs'), 'utf8');
        expect(clientContent).toBe(runtimeClientContent);
        expect(clientContent).toContain('hostCapabilities');
        expect(clientContent).toContain('ReportOutcome');
        expect(clientContent).toContain('ToJsonStringList');

        const agentContent = fs.readFileSync(path.join(root, 'packages/adapters/unity/FearAgent.cs'), 'utf8');
        const runtimeAgentContent = fs.readFileSync(path.join(root, 'packages/adapters/unity/Runtime/FearAgent.cs'), 'utf8');
        expect(agentContent).toBe(runtimeAgentContent);
        expect(agentContent).toContain('peerIds');
        expect(agentContent).toContain('CurrentCapabilityDowngrade');
        expect(agentContent).toContain('ReportExecutionOutcome');
    });

    it('3. Godot 4 Adapter exposes host_capabilities, report_outcome, and peers', () => {
        const clientGd = fs.readFileSync(path.join(root, 'packages/adapters/godot/fear_ai_client.gd'), 'utf8');
        expect(clientGd).toContain('host_capabilities');
        expect(clientGd).toContain('report_outcome');
        expect(clientGd).toContain('outcome_reported');
        expect(clientGd).toContain('payload["capabilities"] = host_capabilities');

        const agentGd = fs.readFileSync(path.join(root, 'packages/adapters/godot/fear_agent.gd'), 'utf8');
        expect(agentGd).toContain('peer_ids');
        expect(agentGd).toContain('capability_downgrade');
        expect(agentGd).toContain('affordance_downgrade');
        expect(agentGd).toContain('report_outcome');
    });

    it('4. Unreal 5 Adapter exposes HostCapabilities, VisiblePeerIds, and ReportOutcome', () => {
        const header = fs.readFileSync(path.join(root, 'packages/adapters/unreal/Source/FearAI/Public/FearAgentComponent.h'), 'utf8');
        expect(header).toContain('HostCapabilities');
        expect(header).toContain('VisiblePeerIds');
        expect(header).toContain('ReportOutcome');
        expect(header).toContain('FFearCapabilityDowngrade');
        expect(header).toContain('FFearAffordanceDowngrade');

        const cpp = fs.readFileSync(path.join(root, 'packages/adapters/unreal/Source/FearAI/Private/FearAgentComponent.cpp'), 'utf8');
        expect(cpp).toContain('capabilities');
        expect(cpp).toContain('peers');
        expect(cpp).toContain('INTENT_OUTCOME_REPORT');
        expect(cpp).toContain('CurrentCapabilityDowngrade');
    });

    it('5. Protocol validation certifies peer-aware observations, capabilities, and outcomes', () => {
        const obs = {
            agent_id: 'agent_alpha',
            x: 10, y: 0, z: 5,
            threats: [{ id: 'stalker', type: 'PREDATOR', distance: 5.0, intensity: 0.8 }],
            peers: [{ id: 'agent_beta' }]
        };

        const obsCheck = ProtocolValidator.validateObservation(obs);
        expect(obsCheck.valid).toBe(true);
        expect(obsCheck.value.peers).toEqual([{ id: 'agent_beta' }]);

        const caps = ProtocolValidator.sanitizeTickCapabilities(['supports_dialogue', 'supports_cover_points']);
        expect(caps).toEqual(['supports_dialogue', 'supports_cover_points']);

        const outcomeReq = {
            agent_id: 'agent_alpha',
            intent_type: 'SEEK_COVER',
            outcome: 'INTENT_REJECTED',
            reason: 'NO_PATH',
            tick: 42
        };
        const outcomeCheck = ProtocolValidator.validateOutcomeReport(outcomeReq);
        expect(outcomeCheck.valid).toBe(true);
        expect(outcomeCheck.value.outcome).toBe('INTENT_REJECTED');
        expect(outcomeCheck.value.reason).toBe('NO_PATH');
    });
});
