import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FROZEN_V1_PATH = path.resolve(__dirname, '../../packages/protocol/fixtures/save-v1-frozen.json');

describe('Persistence Versioning & Migration Harness', () => {

    it('1. Frozen v1 Snapshot Restoration: restores exact agent, trauma, habituation, and pacing state', () => {
        const frozen = JSON.parse(fs.readFileSync(FROZEN_V1_PATH, 'utf-8'));
        const sim = new RuntimeSimulation({ seed: 999 }); // Initial seed will be overwritten by snapshot

        const result = sim.loadSnapshot(frozen);
        expect(result.success).toBe(true);
        expect(result.version).toBe(1);
        expect(result.agentCount).toBe(1);

        expect(sim.seed).toBe(42);
        expect(sim.tickCount).toBe(1);
        expect(sim.trauma.zones.length).toBe(1);
        expect(sim.trauma.zones[0].x).toBe(10);
        expect(sim.trauma.zones[0].y).toBe(20);

        const agent = sim.agents.get('survivor_01');
        expect(agent).toBeDefined();
        expect(agent.x).toBe(10);
        expect(agent.y).toBe(20);
        expect(agent.fearCore.state).toBe('ALERT');
        expect(agent.habituation.getHabituationLevel('SOUND', 'thump')).toBe(0);
        expect(agent.habituation.totalExposures).toBe(1);

        // Verify custom host metadata preserved
        expect(sim.customMetadata).toEqual({
            gameLevel: 'Bunker_04',
            checkpointName: 'GeneratorRoom'
        });

        // Tick simulation forward and verify deterministic progress
        const tickOut = sim.tick(0.016);
        expect(sim.tickCount).toBe(2);
        expect(tickOut.length).toBe(1);
        expect(tickOut[0].agent_id).toBe('survivor_01');
    });

    it('2. Legacy v0 Unversioned Snapshot: migrates transparently to v1', () => {
        const legacySnapshot = {
            seed: 1234,
            tickCount: 5,
            agents: [
                {
                    id: 'legacy_npc',
                    traits: { neuroticism: 0.4 },
                    x: 5,
                    y: 5,
                    currentFear: 0.3
                }
            ]
        };

        const sim = new RuntimeSimulation();
        const res = sim.loadSnapshot(legacySnapshot);

        expect(res.success).toBe(true);
        expect(res.version).toBe(1);
        expect(sim.agents.has('legacy_npc')).toBe(true);
        expect(sim.agents.get('legacy_npc').x).toBe(5);
    });

    it('3. Round-Trip Custom Host Metadata Preservation: saves and restores arbitrary host engine keys', () => {
        const sim = new RuntimeSimulation({ seed: 777 });
        sim.customMetadata = {
            unrealWorldSessionId: 'ue5_sess_8912',
            godotScenePath: 'res://levels/Level03.tscn',
            customFlag: 42
        };
        sim.registerAgent('hero', { neuroticism: 0.2 });

        const snapshot = sim.saveSnapshot();
        expect(snapshot.version).toBe(1);
        expect(snapshot.customMetadata.unrealWorldSessionId).toBe('ue5_sess_8912');

        const sim2 = new RuntimeSimulation();
        sim2.loadSnapshot(snapshot);

        expect(sim2.customMetadata).toEqual(sim.customMetadata);
        expect(sim2.agents.has('hero')).toBe(true);
    });

    it('4. Defensive Malformed and Truncated Save Handling: rejects safely without simulation crash', () => {
        const sim = new RuntimeSimulation();
        sim.registerAgent('existing_agent', { neuroticism: 0.5 });

        // Null snapshot
        const resNull = sim.loadSnapshot(null);
        expect(resNull.success).toBe(false);

        // String snapshot
        const resStr = sim.loadSnapshot('not-an-object');
        expect(resStr.success).toBe(false);

        // Snapshot with corrupted agent entries (missing ID, null objects)
        const corruptedSnapshot = {
            version: 1,
            seed: 100,
            agents: [
                null,
                {},
                { id: 'valid_agent', traits: { fear: 0.1 } },
                'corrupt_entry'
            ]
        };

        const resCorrupt = sim.loadSnapshot(corruptedSnapshot);
        expect(resCorrupt.success).toBe(true);
        expect(sim.agents.size).toBe(1);
        expect(sim.agents.has('valid_agent')).toBe(true);
    });

    it('5. RNG and Habituation Continuity: habituation state resumes and continues accumulating accurately', () => {
        const sim = new RuntimeSimulation({ seed: 555 });
        sim.registerAgent('test_hab_agent', { neuroticism: 0.5 });

        // Expose 5 times to sound
        for (let i = 0; i < 5; i++) {
            sim.queueObservation('test_hab_agent', {
                sounds: [{ id: 'creak', type: 'SOUND', distance: 10, intensity: 0.8 }]
            });
            sim.tick(0.016);
        }

        const agentBefore = sim.agents.get('test_hab_agent');
        const countBefore = agentBefore.habituation.getExposureCount('SOUND', 'creak');
        expect(countBefore).toBe(5);

        // Save and reload
        const snap = sim.saveSnapshot();
        const sim2 = new RuntimeSimulation();
        sim2.loadSnapshot(snap);

        const agentAfter = sim2.agents.get('test_hab_agent');
        expect(agentAfter.habituation.getExposureCount('SOUND', 'creak')).toBe(5);

        // Add 5 more exposures
        for (let i = 0; i < 5; i++) {
            sim2.queueObservation('test_hab_agent', {
                sounds: [{ id: 'creak', type: 'SOUND', distance: 10, intensity: 0.8 }]
            });
            sim2.tick(0.016);
        }

        expect(agentAfter.habituation.getExposureCount('SOUND', 'creak')).toBe(10);
        expect(agentAfter.habituation.getHabituationLevel('SOUND', 'creak')).toBeGreaterThan(0.15);
    });
});
