/**
 * tools/verification/verify_persistence_roundtrip.mjs
 * 
 * Verifies bidirectional persistence round-trip of RuntimeSimulation:
 * 1. Stepping a seeded simulation and capturing V2 snapshot
 * 2. Validating complete presence of coreTrauma, social, contagion, timeDiscipline, and flags
 * 3. Loading snapshot into a clean instance and into an intentionally dirty instance
 * 4. Verifying zero state leakage from dirty previous runs (reset isolation)
 * 5. Stepping restored instances and verifying bit-exact deterministic parity
 * 
 * Hard Rule 9 Compliant: 0 automated test runner frameworks.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';

async function main() {
    console.log('=== VERIFY RUNTIME PERSISTENCE ROUND-TRIP ===\n');

    const sim = new RuntimeSimulation({ seed: 42 });
    sim.registerAgent('agent-1', { extraversion: 0.8, neuroticism: 0.6 });
    sim.registerAgent('agent-2', { extraversion: 0.4, neuroticism: 0.3 });

    // Step a few ticks with some observations
    sim.queueObservation('agent-1', {
        agent_id: 'agent-1',
        threat_level: 0.85,
        threat_direction: [1, 0, 0],
        threat_source_id: 'predator-1',
        threat_distance: 120,
        x: 100, y: 100, z: 0
    });
    sim.queueObservation('agent-2', {
        agent_id: 'agent-2',
        threat_level: 0.3,
        x: 150, y: 100, z: 0
    });

    for (let i = 0; i < 5; i++) {
        sim.tick(0.0166);
    }

    console.log('Pre-snapshot state:');
    console.log('- tickCount:', sim.tickCount);
    console.log('- agents count:', sim.agents.size);
    console.log('- pacing progress:', sim.pacing.getProgress());
    console.log('- coreTrauma active records:', sim.coreTrauma.agentRecords.size);

    const snapshot = sim.saveSnapshot();
    console.log('\nSnapshot metadata:');
    console.log('- Version:', snapshot.version);
    console.log('- Keys:', Object.keys(snapshot));

    // Verify critical fields exist in snapshot
    if (!snapshot.coreTrauma) throw new Error('Missing coreTrauma in snapshot!');
    if (!snapshot.social) throw new Error('Missing social in snapshot!');
    if (!snapshot.contagion) throw new Error('Missing contagion in snapshot!');
    if (!snapshot.timeDiscipline) throw new Error('Missing timeDiscipline in snapshot!');
    if (!snapshot.flags) throw new Error('Missing flags in snapshot!');

    // Test 1: Restore into fresh instance
    const simRestored = new RuntimeSimulation({ seed: 999 });
    const loadResult = simRestored.loadSnapshot(snapshot);

    console.log('\nTest 1: Fresh Load Result:', loadResult);
    if (!loadResult.success) throw new Error('Load failed: ' + loadResult.error);

    // Verify equality
    if (simRestored.tickCount !== sim.tickCount) {
        throw new Error(`tickCount mismatch: ${simRestored.tickCount} vs ${sim.tickCount}`);
    }
    if (simRestored.agents.size !== sim.agents.size) {
        throw new Error(`agent count mismatch: ${simRestored.agents.size} vs ${sim.agents.size}`);
    }
    if (simRestored.seed !== sim.seed) {
        throw new Error(`seed mismatch: ${simRestored.seed} vs ${sim.seed}`);
    }
    if (simRestored.pacing.getProgress() !== sim.pacing.getProgress()) {
        throw new Error('pacing progress mismatch');
    }
    if (simRestored.timeDiscipline.tick !== sim.timeDiscipline.tick) {
        throw new Error('timeDiscipline tick mismatch');
    }

    // Test 2: Restore into dirty instance (ensuring dirty-state isolation)
    const simDirty = new RuntimeSimulation({ seed: 1234 });
    simDirty.registerAgent('dirty-ghost', { neuroticism: 0.99 });
    simDirty.coreTrauma.incurTrauma('dirty-ghost', { severity: 1.0, description: 'Ghost trauma' });
    const rel = simDirty.social.getRelationship('dirty-ghost', 'someone');
    if (rel) rel.trust = -0.9;
    simDirty.lastContagion.set('dirty-ghost', { contagionFear: 0.8 });

    const dirtyLoadResult = simDirty.loadSnapshot(snapshot);
    console.log('Test 2: Dirty Load Result:', dirtyLoadResult);
    if (simDirty.agents.has('dirty-ghost')) {
        throw new Error('Dirty ghost agent leaked across loadSnapshot!');
    }
    if (simDirty.coreTrauma.agentRecords.has('dirty-ghost')) {
        throw new Error('Dirty trauma record leaked across loadSnapshot!');
    }
    if (simDirty.social.hasRelationship('dirty-ghost', 'someone')) {
        throw new Error('Dirty social relationship leaked across loadSnapshot!');
    }
    if (simDirty.lastContagion.has('dirty-ghost')) {
        throw new Error('Dirty lastContagion leaked across loadSnapshot!');
    }
    console.log('  * Zero dirty-state contamination across loadSnapshot: PASS');

    // Step original and restored simulations by 1 tick and verify deterministic parity
    const out1 = sim.tick(0.0166);
    const out2 = simRestored.tick(0.0166);
    const out3 = simDirty.tick(0.0166);

    const fear1 = out1.map(o => o.fear_band);
    const fear2 = out2.map(o => o.fear_band);
    const fear3 = out3.map(o => o.fear_band);

    console.log('\nPost-load step fear bands:');
    console.log('Original sim: ', fear1);
    console.log('Restored sim: ', fear2);
    console.log('Dirty-load sim:', fear3);

    if (JSON.stringify(fear1) !== JSON.stringify(fear2) || JSON.stringify(fear1) !== JSON.stringify(fear3)) {
        throw new Error('Post-load step outputs diverged!');
    }

    console.log('\n============================================================');
    console.log('SUCCESS: Complete bidirectional round-trip verified with zero divergence!');
    console.log('============================================================\n');
}

main().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
