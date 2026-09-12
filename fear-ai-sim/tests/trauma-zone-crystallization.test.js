import { describe, it, expect } from '@jest/globals';
import {
    TraumaZoneSystem,
    TraumaCrystallizationEngine,
    TRAUMA_TYPES,
    TRAUMA_STAGES,
    PHOBIC_CATEGORIES,
} from '../packages/core/index.js';

/**
 * Post-25 audit candidate 17: TraumaZoneSystem x TraumaCrystallizationEngine joint.
 *
 * Measured ground truth (probed live, pinned below): the two systems have NO
 * automatic coupling. The zone system is agent-blind (getTraumaAt is a pure
 * spatial read) and the engine never reads zones. The real joint is
 * compositional: an integrator sums zone dread + crystallized resting fear,
 * and spatial phobic cues (SPATIAL_COORDINATE) let a crystallized agent dread
 * a zone a fresh agent walks through calmly.
 */

const HOT = { x: 0, y: 0, z: 0 };
const COLD = { x: 500, y: 0, z: 0 };

function hotZone() {
    const zones = new TraumaZoneSystem();
    zones.addZone(HOT.x, HOT.y, HOT.z, 1.0, 150, 1800);
    return zones;
}

/** Drive one agent from incur through full crystallization. */
function crystallize(engine, agentId, severity = 0.9) {
    engine.incurTrauma(agentId, {
        traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
        severity,
    });
    engine.tick(20); // ACUTE_SHOCK -> SENSITIZATION_WINDOW
    engine.tick(50); // past window -> CONSOLIDATION_LOCKING
    engine.tick(30); // -> CRYSTALLIZED_MUTATION
}

describe('Audit-17: TraumaZoneSystem x TraumaCrystallizationEngine joint', () => {
    describe('1. Same dose hot vs cold: INCONCLUSIVE — no automatic coupling', () => {
        it('zone reads differ but crystallization outcomes are identical', () => {
            const zones = hotZone();
            // Spatial ground truth: hot center is maximal, far field is zero.
            expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(1.0);
            expect(zones.getTraumaAt(COLD.x, COLD.y, COLD.z)).toBe(0);

            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 50 });
            engine.registerAgent('hot_dweller');
            engine.registerAgent('cold_dweller');
            // Identical dose; the engine has no zone input, so dwelling is
            // simulated only by the identical tick schedule both agents share.
            for (const id of ['hot_dweller', 'cold_dweller']) {
                engine.incurTrauma(id, {
                    traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                    severity: 0.8,
                });
            }
            engine.tick(20);
            engine.tick(50);
            engine.tick(30);

            const hot = engine.agentRecords.get('hot_dweller');
            const cold = engine.agentRecords.get('cold_dweller');
            // Measured absence: both crystallize exactly once with identical
            // mutations — zone heat does not accelerate or deepen locking.
            expect(hot.crystallizedTraumas.length).toBe(1);
            expect(cold.crystallizedTraumas.length).toBe(1);
            expect(hot.quiescentFearFloor).toBe(cold.quiescentFearFloor);
            expect(hot.quiescentFearFloor).toBeCloseTo(0.2, 10);
            expect(hot.currentTraits.neuroticism).toBe(cold.currentTraits.neuroticism);
            expect(hot.currentTraits.neuroticism).toBeCloseTo(0.66, 10);
            expect(hot.currentTraits.resilience).toBe(cold.currentTraits.resilience);
            expect(hot.currentTraits.resilience).toBeCloseTo(0.36, 10);
        });
    });

    describe('2. Crystallized vs fresh agent at the same coordinates', () => {
        it('zone read is agent-blind but composed dread differs via resting fear', () => {
            const zones = hotZone();
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 50 });
            engine.registerAgent('fresh');
            engine.registerAgent('scarred');
            crystallize(engine, 'scarred', 0.9);

            // Agent-blind spatial read: identical for both agents.
            expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(1.0);

            const freshState = engine.evaluateAgentState('fresh', {});
            const scarredState = engine.evaluateAgentState('scarred', {});
            // Pinned: severity-0.9 floor shift = 0.25 * 0.9 = 0.225.
            expect(freshState.effectiveRestingFear).toBe(0);
            expect(scarredState.effectiveRestingFear).toBe(0.225);
            expect(scarredState.isTraumatized).toBe(true);
            expect(freshState.isTraumatized).toBe(false);

            // Compositional joint: perceived zone dread = spatial + resting.
            const freshComposed = zones.getTraumaAt(HOT.x, HOT.y, HOT.z) + freshState.effectiveRestingFear;
            const scarredComposed = zones.getTraumaAt(HOT.x, HOT.y, HOT.z) + scarredState.effectiveRestingFear;
            expect(freshComposed).toBe(1.0);
            expect(scarredComposed).toBe(1.225);
        });

        it('conditioned spatial cue makes the scarred agent dread the zone; the fresh agent feels nothing extra', () => {
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 50 });
            engine.registerAgent('fresh');
            engine.registerAgent('scarred');
            engine.incurTrauma('scarred', {
                traumaType: TRAUMA_TYPES.MASSACRE_HORROR,
                severity: 0.9,
                associatedCues: [{ category: PHOBIC_CATEGORIES.SPATIAL_COORDINATE, cue: '0,0,0' }],
            });
            engine.tick(20);
            engine.tick(50);
            engine.tick(30);
            expect(engine.agentRecords.get('scarred').crystallizedTraumas.length).toBe(1);

            const zoneCue = {
                category: PHOBIC_CATEGORIES.SPATIAL_COORDINATE,
                cue: '0,0,0',
                intensity: 1.0,
                position: { ...HOT },
            };
            const fresh = engine.evaluateAgentState('fresh', {
                sensoryCues: [zoneCue],
                position: { ...HOT },
            });
            const scarred = engine.evaluateAgentState('scarred', {
                sensoryCues: [zoneCue],
                position: { x: 10, y: 0, z: 0 },
            });
            // Pinned: sensitivity 0.9*1.1=0.99 x dreadGain 0.9*0.7=0.63 = 0.6237.
            expect(fresh.phobicDread).toBe(0);
            expect(fresh.hasFlashback).toBe(false);
            expect(scarred.phobicDread).toBe(0.6237);
            expect(scarred.hasFlashback).toBe(true);
            expect(scarred.triggeredPhobias.length).toBe(1);
            // Repulsive vector points away from the zone center (+x here).
            expect(scarred.avoidanceVector.x).toBeGreaterThan(0.99);
        });
    });

    describe('3. Solace/extinction vs zone exposure: solace wins locking, zone dread persists', () => {
        it('timely solace prevents crystallization even for a hot-zone dweller; the zone is unmoved', () => {
            const zones = hotZone();
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 50 });
            engine.registerAgent('solaced');
            engine.registerAgent('abandoned');
            for (const id of ['solaced', 'abandoned']) {
                engine.incurTrauma(id, {
                    traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                    severity: 0.8,
                });
            }
            engine.tick(20); // both enter SENSITIZATION_WINDOW
            expect(engine.agentRecords.get('solaced').activeTraumas[0].stage).toBe(
                TRAUMA_STAGES.SENSITIZATION_WINDOW
            );
            // Peer solace above the 0.65 threshold defuses the hot-zone dweller.
            engine.administerSolace('solaced', 0.7, 'PEER_SOLACE');
            engine.tick(50);
            engine.tick(30);

            expect(engine.agentRecords.get('solaced').crystallizedTraumas.length).toBe(0);
            expect(engine.agentRecords.get('abandoned').crystallizedTraumas.length).toBe(1);
            expect(engine.evaluateAgentState('solaced', {}).effectiveRestingFear).toBe(0);
            expect(engine.evaluateAgentState('abandoned', {}).effectiveRestingFear).toBe(0.2);
            // The zone never participated: no ticks ran on it, intensity intact.
            expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(1.0);
            expect(zones.getTraumaAt(COLD.x, COLD.y, COLD.z)).toBe(0);
        });
    });

    describe('4. Malformed spatial inputs degrade safely', () => {
        it('never throws and pins the real coercion behavior', () => {
            const zones = hotZone();
            expect(() => zones.getTraumaAt(NaN, undefined, null)).not.toThrow();
            expect(() => zones.getTraumaAt('abc', {}, [])).not.toThrow();
            expect(() => zones.getTraumaAt(Infinity, 0, 0)).not.toThrow();
            // Number(x)||0 coerces NaN/undefined/non-numeric strings to the
            // origin — which is the hot center here, so they read maximal.
            expect(zones.getTraumaAt(NaN, NaN, NaN)).toBe(1.0);
            expect(zones.getTraumaAt('abc', 'def', 'ghi')).toBe(1.0);
            // Unbounded coordinates fall outside every radius and read zero.
            expect(zones.getTraumaAt(Infinity, 0, 0)).toBe(0);
            // Empty system reads zero everywhere, never NaN.
            const empty = new TraumaZoneSystem();
            expect(empty.getTraumaAt(0, 0, 0)).toBe(0);
            expect(empty.getTraumaAt(NaN, NaN, NaN)).toBe(0);
        });
    });

    describe('5. Exact replay of the joint snapshot', () => {
        it('zone + engine snapshots restore bit-exact joint reads', () => {
            const zones = hotZone();
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 50 });
            engine.registerAgent('replay');
            crystallize(engine, 'replay', 0.9);
            zones.tick(100); // pinned decay: 0.999^100 at center
            engine.tick(100);

            const zoneSnap = JSON.parse(JSON.stringify(zones.getState()));
            const engineSnap = JSON.parse(JSON.stringify(engine.getState()));
            const dreadBefore = zones.getTraumaAt(HOT.x, HOT.y, HOT.z);
            expect(dreadBefore).toBeCloseTo(0.9047921471, 8);
            const stateBefore = engine.evaluateAgentState('replay', {});

            const zones2 = new TraumaZoneSystem();
            zones2.setState(zoneSnap);
            const engine2 = new TraumaCrystallizationEngine();
            engine2.setState(engineSnap);

            expect(zones2.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(dreadBefore);
            expect(engine2.evaluateAgentState('replay', {})).toEqual(stateBefore);
            expect(JSON.stringify(zones2.getState())).toBe(JSON.stringify(zoneSnap));
            expect(JSON.stringify(engine2.getState())).toBe(JSON.stringify(engineSnap));

            // Deterministic continuation: twin advances from the same snapshot
            // produce identical joint reads.
            zones.tick(50);
            engine.tick(50);
            zones2.tick(50);
            engine2.tick(50);
            expect(zones2.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(zones.getTraumaAt(HOT.x, HOT.y, HOT.z));
            expect(engine2.evaluateAgentState('replay', {})).toEqual(engine.evaluateAgentState('replay', {}));
        });
    });
});
