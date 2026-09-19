/**
 * tools/verification/verify_long_horizon_lifecycle.mjs
 *
 * Exercises the live RuntimeSimulation for a long deterministic horizon while
 * repeatedly registering/removing short-lived agents. The proof checks that
 * bounded subsystem state, caches, and serialized output remain aligned with
 * the live agent set and remain finite.
 *
 * Hard Rule 9 Compliant: standalone deterministic scenario; no test runner.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertFinite(value, path = 'root', seen = new Set()) {
    if (typeof value === 'number') {
        assert(Number.isFinite(value), `${path} is not finite.`);
        return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertFinite(item, `${path}[${index}]`, seen));
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        assertFinite(child, `${path}.${key}`, seen);
    }
}

function makeOptions() {
    return {
        seed: 20260919,
        traumaConfig: { maxZones: 16 },
        contagionConfig: { maxEdges: 32, contagionRadius: 75 },
        socialConfig: { maxRelationshipsPerAgent: 8 },
        socialCadence: 3,
        traumaCadence: 5,
        contagionCadence: 2,
        enablePacingCohesion: true
    };
}

function queuePersistentObservations(sim, tick) {
    for (let i = 0; i < 6; i++) {
        const id = `persistent-${i}`;
        const threat = tick % 29 === 0
            ? [{ id: 'long-horizon-predator', type: 'PREDATOR', distance: 6, intensity: 0.8 }]
            : [];
        sim.queueObservation(id, {
            agent_id: id,
            x: i * 3,
            y: 0,
            z: i * 2,
            health: 1,
            energy: 1,
            threats: threat,
            sounds: []
        });
    }
}

function assertStateBounded(sim, expectedLiveAgents, label) {
    assert(sim.agents.size === expectedLiveAgents, `${label}: live agent count drifted.`);
    assert(sim.pendingObservations.size === 0, `${label}: pending observations leaked.`);
    assert(sim.lastContagion.size === expectedLiveAgents, `${label}: contagion cache cardinality drifted.`);
    assert(sim.coreTrauma.agentRecords.size === expectedLiveAgents, `${label}: core-trauma records leaked.`);
    assert(sim.trauma.zones.length <= sim.trauma.maxZones, `${label}: trauma zone bound exceeded.`);
    assert(sim.contagion.activeEdges.length <= sim.contagion.maxEdges, `${label}: contagion edge bound exceeded.`);

    for (const edge of sim.contagion.activeEdges) {
        assert(sim.agents.has(edge.from), `${label}: stale contagion source ${edge.from}.`);
        assert(sim.agents.has(edge.to), `${label}: stale contagion target ${edge.to}.`);
    }
    for (const [agentId, phobias] of sim.coreTrauma.phobicRegistry.agentPhobias.entries()) {
        assert(sim.agents.has(agentId), `${label}: stale phobia owner ${agentId}.`);
        assert(phobias instanceof Map, `${label}: phobia registry shape changed.`);
    }
    for (const [sourceId, targets] of sim.social.relationships.entries()) {
        assert(sim.agents.has(sourceId), `${label}: stale social source ${sourceId}.`);
        for (const targetId of targets.keys()) {
            assert(sim.agents.has(targetId), `${label}: stale social target ${targetId}.`);
        }
    }
    assertFinite(sim.getStatus(), `${label}.status`);
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY LONG-HORIZON RUNTIME & REGISTRATION LIFECYCLE');
    console.log('============================================================\n');

    const options = makeOptions();
    const sim = new RuntimeSimulation(options);
    for (let i = 0; i < 6; i++) {
        sim.registerAgent(`persistent-${i}`, {
            neuroticism: 0.35 + i * 0.04,
            resilience: 0.75 - i * 0.03,
            leadership: i === 0 ? 0.85 : 0.2
        }, { initial_position: { x: i * 3, y: 0, z: i * 2 } });
    }

    const totalTicks = 5000;
    for (let tick = 1; tick <= totalTicks; tick++) {
        if (tick % 11 === 0) {
            sim.addTraumaZone(tick % 18, 0, (tick * 3) % 18, 0.8, 24, 1500);
        }
        if (tick % 7 === 0) {
            const relation = sim.social.getRelationship('persistent-0', 'persistent-1');
            relation.trust = Math.sin(tick / 13) * 0.5;
            relation.familiarity = Math.min(1, relation.familiarity + 0.01);
        }

        let transientId = null;
        if (tick % 17 === 0) {
            transientId = `transient-${tick}`;
            sim.registerAgent(transientId, { neuroticism: 0.6, resilience: 0.4 }, {
                initial_position: { x: 1, y: 0, z: 1 }
            });
            sim.social.getRelationship('persistent-0', transientId).grievance = 0.7;
        }

        queuePersistentObservations(sim, tick);
        if (transientId) {
            sim.queueObservation(transientId, {
                agent_id: transientId,
                x: 1,
                y: 0,
                z: 1,
                threats: [{ id: 'transient-threat', type: 'SOUND', distance: 8, intensity: 0.6 }],
                sounds: []
            });
        }

        sim.tick(0.0166);
        if (transientId) sim.unregisterAgent(transientId);

        if (tick % 500 === 0) {
            assertStateBounded(sim, 6, `tick-${tick}`);
            assertFinite(sim.saveSnapshot(), `tick-${tick}.snapshot`);
            console.log(`  * tick ${tick}: bounded state and finite snapshot PASS`);
        }
    }

    assertStateBounded(sim, 6, 'final');
    const snapshot = sim.saveSnapshot();
    assertFinite(snapshot, 'final.snapshot');
    const serialized = JSON.stringify(snapshot);
    assert(serialized.length < 2_000_000, `final snapshot unexpectedly large (${serialized.length} bytes).`);
    assert(!serialized.includes('transient-'), 'final snapshot contains a removed transient agent.');

    const restored = new RuntimeSimulation(options);
    const loaded = restored.loadSnapshot(snapshot);
    assert(loaded.success === true, 'long-horizon snapshot must reload successfully.');
    assertStateBounded(restored, 6, 'restored');
    for (let i = 0; i < 25; i++) {
        queuePersistentObservations(restored, totalTicks + i + 1);
        restored.tick(0.0166);
    }
    assertStateBounded(restored, 6, 'restored-plus-25');
    assertFinite(restored.saveSnapshot(), 'restored-plus-25.snapshot');

    console.log('\n============================================================');
    console.log('SUCCESS: Long-horizon runtime lifecycle verification passed.');
    console.log('============================================================\n');
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
