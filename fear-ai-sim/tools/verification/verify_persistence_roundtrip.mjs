/**
 * tools/verification/verify_persistence_roundtrip.mjs
 * 
 * Verifies bidirectional persistence round-trip and state-isolation of RuntimeSimulation:
 * 1. Full-state bit-exact round-trip across 1, 10, and 100 future ticks (comparing entire normalized snapshots, not just fear bands)
 * 2. Complete eradication of stale state when loading into dirty instances
 * 3. Legacy V1 snapshot ingestion into dirty instance and 50-tick post-load parity
 * 4. Soft reset (clearAgents: false) vs Hard reset (clearAgents: true) verifying complete habituation, affective, and trauma clearing
 * 
 * Hard Rule 9 Compliant: 0 automated test runner frameworks. Standalone deterministic script.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeSnapshot(snap) {
    const copy = JSON.parse(JSON.stringify(snap));
    if (Array.isArray(copy.agents)) {
        for (const a of copy.agents) {
            if (a.fearCore && 'traceCount' in a.fearCore) {
                delete a.fearCore.traceCount;
            }
        }
    }
    return copy;
}

function assertBitExact(a, b, label) {
    const sA = JSON.stringify(a);
    const sB = JSON.stringify(b);
    if (sA !== sB) {
        for (let i = 0; i < Math.max(sA.length, sB.length); i++) {
            if (sA[i] !== sB[i]) {
                const contextA = sA.substring(Math.max(0, i - 30), Math.min(sA.length, i + 30));
                const contextB = sB.substring(Math.max(0, i - 30), Math.min(sB.length, i + 30));
                throw new Error(`${label} mismatch at char ${i}!\nA: ...${contextA}...\nB: ...${contextB}...`);
            }
        }
        throw new Error(`${label} mismatch (length ${sA.length} vs ${sB.length})`);
    }
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY RUNTIME PERSISTENCE ROUND-TRIP & STATE ISOLATION');
    console.log('============================================================\n');

    // ------------------------------------------------------------------------
    // TEST SUITE 1: Full-state Bit-Exact Round-Trip Across 1, 10, and 100 Future Ticks
    // ------------------------------------------------------------------------
    console.log('--- TEST SUITE 1: Full-state Bit-Exact Parity (1, 10, 100 Ticks) ---');
    const simOriginal = new RuntimeSimulation({ seed: 42 });
    simOriginal.registerAgent('agent-1', { extraversion: 0.8, neuroticism: 0.6, resilience: 0.4 });
    simOriginal.registerAgent('agent-2', { extraversion: 0.4, neuroticism: 0.3, resilience: 0.8 });

    // Seed 5 initial ticks with observations
    for (let i = 0; i < 5; i++) {
        simOriginal.queueObservation('agent-1', {
            agent_id: 'agent-1',
            threat_level: 0.5 + i * 0.08,
            threat_direction: [1, 0, 0],
            threat_source_id: 'stalker-1',
            threat_distance: 150 - i * 10,
            x: 100 + i, y: 100, z: 0
        });
        simOriginal.queueObservation('agent-2', {
            agent_id: 'agent-2',
            threat_level: 0.2 + i * 0.05,
            x: 160, y: 100, z: 0
        });
        simOriginal.tick(0.0166);
    }

    const snapshotV2 = simOriginal.saveSnapshot();
    console.log(`Captured V2 Snapshot: tickCount=${snapshotV2.tickCount}, version=${snapshotV2.version}, agents=${snapshotV2.agents.length}`);

    // Restore into fresh clean instance
    const simRestored = new RuntimeSimulation({ seed: 999 });
    const loadCleanResult = simRestored.loadSnapshot(snapshotV2);
    if (!loadCleanResult.success) throw new Error('Clean load failed: ' + loadCleanResult.error);

    // Restore into intentionally contaminated dirty instance
    const simDirty = new RuntimeSimulation({ seed: 8888 });
    simDirty.registerAgent('dirty-ghost', { neuroticism: 0.99 });
    simDirty.coreTrauma.incurTrauma('dirty-ghost', { severity: 1.0, description: 'Ghost trauma' });
    const dirtyRel = simDirty.social.getRelationship('dirty-ghost', 'someone');
    if (dirtyRel) {
        dirtyRel.trust = -0.9;
        dirtyRel.fear = 0.8;
    }
    simDirty.lastContagion.set('dirty-ghost', { contagionFear: 0.9 });
    simDirty.trauma.addZone({ x: 999, y: 999, z: 0, intensity: 0.9, radius: 200, lifetimeTicks: 500 });
    simDirty.tickCount = 777;

    const loadDirtyResult = simDirty.loadSnapshot(snapshotV2);
    if (!loadDirtyResult.success) throw new Error('Dirty load failed: ' + loadDirtyResult.error);

    // Verify complete eradication of dirty state
    if (simDirty.agents.has('dirty-ghost')) throw new Error('Dirty ghost agent leaked across loadSnapshot!');
    if (simDirty.coreTrauma.agentRecords.has('dirty-ghost')) throw new Error('Dirty trauma record leaked across loadSnapshot!');
    if (simDirty.social.hasRelationship('dirty-ghost', 'someone')) throw new Error('Dirty social relationship leaked!');
    if (simDirty.lastContagion.has('dirty-ghost')) throw new Error('Dirty lastContagion leaked!');
    if (simDirty.trauma.zones.some(z => z.x === 999)) throw new Error('Dirty trauma zone leaked!');
    console.log('  * Stale state isolation & eradication in dirty instance: PASS');

    // Tick 0 baseline check (immediately post-load)
    const normOrig0 = normalizeSnapshot(simOriginal.saveSnapshot());
    const normRest0 = normalizeSnapshot(simRestored.saveSnapshot());
    const normDirty0 = normalizeSnapshot(simDirty.saveSnapshot());
    assertBitExact(normOrig0, normRest0, 'Tick 0 [Orig vs Restored]');
    assertBitExact(normOrig0, normDirty0, 'Tick 0 [Orig vs Dirty]');
    console.log('  * Tick 0 immediate full-state parity: PASS');

    // Run identical future ticks over 1, 10, and 100 steps
    const testIntervals = [1, 9, 90]; // cumulative: 1, 10, 100 ticks
    let cumulativeTicks = 0;

    for (const stepCount of testIntervals) {
        for (let s = 0; s < stepCount; s++) {
            const stepIdx = cumulativeTicks + s;
            const obs1 = {
                agent_id: 'agent-1',
                threat_level: 0.4 + (Math.sin(stepIdx * 0.1) * 0.3),
                threat_direction: [Math.cos(stepIdx * 0.05), Math.sin(stepIdx * 0.05), 0],
                threat_source_id: 'stalker-1',
                threat_distance: 100 + (stepIdx % 40),
                x: 100 + stepIdx, y: 100, z: 0
            };
            const obs2 = {
                agent_id: 'agent-2',
                threat_level: 0.3 + (Math.cos(stepIdx * 0.1) * 0.2),
                x: 160 + stepIdx, y: 100, z: 0
            };

            simOriginal.queueObservation('agent-1', obs1);
            simOriginal.queueObservation('agent-2', obs2);
            simRestored.queueObservation('agent-1', obs1);
            simRestored.queueObservation('agent-2', obs2);
            simDirty.queueObservation('agent-1', obs1);
            simDirty.queueObservation('agent-2', obs2);

            const outOrig = simOriginal.tick(0.0166);
            const outRest = simRestored.tick(0.0166);
            const outDirty = simDirty.tick(0.0166);

            assertBitExact(outOrig, outRest, `Outputs tick ${stepIdx + 1} [Orig vs Restored]`);
            assertBitExact(outOrig, outDirty, `Outputs tick ${stepIdx + 1} [Orig vs Dirty]`);
        }
        cumulativeTicks += stepCount;

        const snapOrig = normalizeSnapshot(simOriginal.saveSnapshot());
        const snapRest = normalizeSnapshot(simRestored.saveSnapshot());
        const snapDirty = normalizeSnapshot(simDirty.saveSnapshot());

        assertBitExact(snapOrig, snapRest, `Full state at +${cumulativeTicks} ticks [Orig vs Restored]`);
        assertBitExact(snapOrig, snapDirty, `Full state at +${cumulativeTicks} ticks [Orig vs Dirty]`);
        console.log(`  * Full-state bit-exact parity at +${cumulativeTicks} ticks: PASS`);
    }

    // ------------------------------------------------------------------------
    // TEST SUITE 2: Legacy V1 Snapshot Ingestion into Dirty Instance
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 2: Legacy V1 Ingestion & 50-Tick Deterministic Stepping ---');
    const v1Path = path.resolve(__dirname, '../../packages/protocol/fixtures/save-v1-frozen.json');
    if (!fs.existsSync(v1Path)) throw new Error(`save-v1-frozen.json not found at ${v1Path}`);
    const v1Snapshot = JSON.parse(fs.readFileSync(v1Path, 'utf8'));

    const simV1Clean = new RuntimeSimulation({ seed: 1001 });
    const simV1Dirty = new RuntimeSimulation({ seed: 2002 });
    simV1Dirty.registerAgent('stale-agent-xyz', { neuroticism: 0.99 });
    simV1Dirty.trauma.addZone({ x: 50, y: 50, z: 0, intensity: 1.0, radius: 100, lifetimeTicks: 300 });

    const resV1Clean = simV1Clean.loadSnapshot(v1Snapshot);
    const resV1Dirty = simV1Dirty.loadSnapshot(v1Snapshot);
    if (!resV1Clean.success || !resV1Dirty.success) {
        throw new Error(`V1 snapshot loading failed: Clean=${resV1Clean.error}, Dirty=${resV1Dirty.error}`);
    }

    if (simV1Dirty.agents.has('stale-agent-xyz')) throw new Error('Stale agent leaked in V1 dirty load!');
    if (!simV1Clean.agents.has('survivor_01') || !simV1Dirty.agents.has('survivor_01')) {
        throw new Error('Failed to rehydrate survivor_01 from V1 snapshot');
    }

    // Verify survivor_01 is registered with coreTrauma
    if (!simV1Clean.coreTrauma.agentRecords.has('survivor_01') || !simV1Dirty.coreTrauma.agentRecords.has('survivor_01')) {
        throw new Error('V1 rehydrated agent not registered in coreTrauma!');
    }

    // Step 50 ticks with identical observations
    for (let tick = 0; tick < 50; tick++) {
        const obs = {
            agent_id: 'survivor_01',
            threat_level: 0.35 + (tick % 10) * 0.04,
            threat_distance: 100 - (tick % 20),
            x: 10 + tick, y: 20, z: 0
        };
        simV1Clean.queueObservation('survivor_01', obs);
        simV1Dirty.queueObservation('survivor_01', obs);

        const outClean = simV1Clean.tick(0.0166);
        const outDirty = simV1Dirty.tick(0.0166);
        assertBitExact(outClean, outDirty, `V1 50-tick step output at tick ${tick}`);
    }

    const snapV1Clean = normalizeSnapshot(simV1Clean.saveSnapshot());
    const snapV1Dirty = normalizeSnapshot(simV1Dirty.saveSnapshot());
    assertBitExact(snapV1Clean, snapV1Dirty, 'V1 50-tick post-step full state');
    console.log('  * V1 snapshot ingestion into dirty instance & 50-tick parity: PASS');

    // ------------------------------------------------------------------------
    // TEST SUITE 3: Reset Semantics (Soft Reset vs Hard Reset)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: Soft Reset vs Hard Baseline Reset ---');
    const simReset = new RuntimeSimulation({ seed: 777 });
    simReset.registerAgent('test-agent', { neuroticism: 0.7 });

    // Expose agent to sound stimulus to accumulate habituation & fear
    for (let i = 0; i < 10; i++) {
        simReset.queueObservation('test-agent', {
            agent_id: 'test-agent',
            threat_level: 0.8,
            sounds: [{ type: 'growl', intensity: 0.9, distance: 5 }],
            x: 0, y: 0, z: 0
        });
        simReset.tick(0.0166);
    }

    const agentPreReset = simReset.agents.get('test-agent');
    if (agentPreReset.habituation.totalExposures === 0) throw new Error('Agent failed to accumulate habituation');
    if (agentPreReset.tickCount === 0) throw new Error('Agent tickCount was 0 before reset');

    // Perform Soft Reset (clearAgents: false)
    simReset.reset({ clearAgents: false });
    const agentPostSoft = simReset.agents.get('test-agent');
    if (!agentPostSoft) throw new Error('Agent was removed during soft reset!');
    if (agentPostSoft.tickCount !== 0) throw new Error(`Agent tickCount not 0: ${agentPostSoft.tickCount}`);
    if (agentPostSoft.currentFear !== 0) throw new Error(`Agent fear not 0: ${agentPostSoft.currentFear}`);
    if (agentPostSoft.fearCore.state !== 'CALM') throw new Error(`Agent fearCore state not CALM: ${agentPostSoft.fearCore.state}`);
    if (agentPostSoft.habituation.totalExposures !== 0) throw new Error('Agent habituation exposures not cleared!');
    if (agentPostSoft.habituation.exposureMap.size !== 0) throw new Error('Agent habituation exposureMap not cleared!');
    if (simReset.tickCount !== 0) throw new Error('Sim tickCount not reset!');
    console.log('  * Soft Reset (agents retained, internal state/habituation wiped): PASS');

    // Perform Hard Reset (clearAgents: true)
    simReset.reset({ clearAgents: true });
    if (simReset.agents.size !== 0) throw new Error(`Agents not cleared during hard reset: ${simReset.agents.size}`);
    if (simReset.coreTrauma.agentRecords.size !== 0) throw new Error('CoreTrauma records not cleared!');
    if (simReset.trauma.zones.length !== 0) throw new Error('Trauma zones not cleared!');
    console.log('  * Hard Reset (all agents, records, and zones wiped): PASS');

    console.log('\n============================================================');
    console.log('SUCCESS: All persistence, migration, and reset tests PASSED!');
    console.log('============================================================\n');
}

main().catch(err => {
    console.error('VERIFICATION FAILURE:', err);
    process.exit(1);
});
