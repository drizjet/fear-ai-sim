/**
 * tests/spatial-3d-adapter.test.js
 * Front D / Section 9: 3D Spatial Raycast & Obstacle Navigation Adapter Test Suite.
 */

import {
    Spatial3DAdapter,
    TACTICAL_ELEVATION_STATUS,
    OCCLUSION_STATUS,
    COORDINATE_CONVENTIONS,
    Vector3
} from '../packages/core/index.js';

describe('Front D / Section 9: 3D Spatial Raycast & Obstacle Navigation Adapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new Spatial3DAdapter();
    });

    test('1. Vector3 math primitives execute deterministic arithmetic without mutations', () => {
        const v1 = Vector3.create(3, 4, 0);
        expect(Vector3.magnitude(v1)).toBe(5);

        const norm = Vector3.normalize(v1);
        expect(norm.x).toBeCloseTo(0.6);
        expect(norm.y).toBeCloseTo(0.8);
        expect(norm.z).toBe(0);

        const v2 = Vector3.create(0, 5, 0);
        expect(Vector3.dot(v1, v2)).toBe(20);

        const vRight = Vector3.create(1, 0, 0);
        const vFwd = Vector3.create(0, 0, 1);
        const cross = Vector3.cross(vRight, vFwd);
        // (1,0,0) x (0,0,1) = (0, -1, 0)
        expect(cross.x).toBe(0);
        expect(cross.y).toBe(-1);
        expect(cross.z).toBe(0);

        const angle = Vector3.angleDeg(vRight, vFwd);
        expect(angle).toBeCloseTo(90.0, 1);
    });

    test('2. 3D Field-of-View cone identifies targets in-front, peripheral, and behind', () => {
        const observer = {
            position: Vector3.create(0, 0, 0),
            forward: Vector3.create(0, 0, 1), // Looking down +Z
            eyeHeight: 1.6,
            fovHorizontalDeg: 110,
            fovVerticalDeg: 70
        };

        // Directly ahead in line of sight
        const targetAhead = {
            position: Vector3.create(0, 1.6, 10),
            threatIntensity: 0.8
        };
        const stimulusAhead = adapter.evaluate3DSpatialStimulus(observer, targetAhead);
        expect(stimulusAhead.inFieldOfView).toBe(true);
        expect(stimulusAhead.isBehind).toBe(false);
        expect(stimulusAhead.azimuthDeg).toBeCloseTo(0, 1);
        expect(stimulusAhead.pitchDeg).toBeCloseTo(0, 1);

        // Sneaking behind observer (+Z backward, target at -Z)
        const targetBehind = {
            position: Vector3.create(0, 1.6, -10),
            threatIntensity: 0.8
        };
        const stimulusBehind = adapter.evaluate3DSpatialStimulus(observer, targetBehind);
        expect(stimulusBehind.inFieldOfView).toBe(false);
        expect(stimulusBehind.isBehind).toBe(true);
        expect(stimulusBehind.azimuthDeg).toBeCloseTo(180, 1);
    });

    test('3. Tactical elevation differential models high-ground threat and commanding security', () => {
        const observer = {
            position: Vector3.create(0, 0, 0),
            forward: Vector3.create(0, 0, 1),
            eyeHeight: 1.6
        };

        // Threat has extreme high ground (snipers on roof at +8m)
        const sniperThreat = {
            position: Vector3.create(0, 8.0, 10),
            threatIntensity: 0.6
        };
        const stimulusSniper = adapter.evaluate3DSpatialStimulus(observer, sniperThreat);
        expect(stimulusSniper.tacticalElevation.status).toBe(TACTICAL_ELEVATION_STATUS.VULNERABLE_LOW_GROUND);
        expect(stimulusSniper.tacticalElevation.modifier).toBeGreaterThan(1.0); // Threat amplified

        // Observer commands the high ground (observer at y=10, threat at y=0)
        const highObserver = {
            position: Vector3.create(0, 10, 0),
            forward: Vector3.create(0, 0, 1),
            eyeHeight: 1.6
        };
        const groundThreat = {
            position: Vector3.create(0, 0, 10),
            threatIntensity: 0.6
        };
        const stimulusHigh = adapter.evaluate3DSpatialStimulus(highObserver, groundThreat);
        expect(stimulusHigh.tacticalElevation.status).toBe(TACTICAL_ELEVATION_STATUS.COMMANDING_HIGH_GROUND);
        expect(stimulusHigh.tacticalElevation.modifier).toBeLessThan(1.0); // Fear discounted
    });

    test('4. Raycast occlusion from host physics reduces visual threat', () => {
        const observer = {
            position: Vector3.create(0, 0, 0),
            forward: Vector3.create(0, 0, 1),
            eyeHeight: 1.6
        };
        const target = {
            position: Vector3.create(0, 1.6, 5),
            threatIntensity: 0.9
        };

        // Clear line of sight
        const clearStim = adapter.evaluate3DSpatialStimulus(observer, target, { raycastOcclusion: 0.0 });
        expect(clearStim.occlusion.status).toBe(OCCLUSION_STATUS.CLEAR_LINE_OF_SIGHT);
        expect(clearStim.effectiveThreatIntensity).toBeCloseTo(0.9, 2);

        // Half obscured (behind low barricade)
        const halfStim = adapter.evaluate3DSpatialStimulus(observer, target, { raycastOcclusion: 0.5 });
        expect(halfStim.occlusion.status).toBe(OCCLUSION_STATUS.PARTIALLY_OBSCURED);
        expect(halfStim.effectiveThreatIntensity).toBeLessThan(clearStim.effectiveThreatIntensity);

        // Fully occluded (behind solid concrete wall)
        const occludedStim = adapter.evaluate3DSpatialStimulus(observer, target, { raycastOcclusion: 1.0 });
        expect(occludedStim.occlusion.status).toBe(OCCLUSION_STATUS.FULLY_OCCLUDED);
        expect(occludedStim.effectiveThreatIntensity).toBe(0.0);
    });

    test('5. Acoustic blind-spot sound triggers acute startle arousal', () => {
        const observer = {
            position: Vector3.create(0, 0, 0),
            forward: Vector3.create(0, 0, 1),
            eyeHeight: 1.6
        };
        // Threat behind observer at (0, 0, -4)
        const quietTarget = {
            position: Vector3.create(0, 1.6, -4),
            threatIntensity: 0.5,
            acousticSignature: 0.0
        };
        const quietStim = adapter.evaluate3DSpatialStimulus(observer, quietTarget);
        expect(quietStim.effectiveThreatIntensity).toBe(0.0); // Unseen and silent

        // Threat snaps twig or roars behind observer
        const noisyTarget = {
            position: Vector3.create(0, 1.6, -4),
            threatIntensity: 0.5,
            acousticSignature: 0.8
        };
        const noisyStim = adapter.evaluate3DSpatialStimulus(observer, noisyTarget);
        expect(noisyStim.isBehind).toBe(true);
        expect(noisyStim.acoustic.startleArousal).toBeGreaterThan(0.5);
        expect(noisyStim.effectiveThreatIntensity).toBeGreaterThan(0.5);
    });

    test('6. Advisory 3D escape vector steers away from threat and deflects around obstacles', () => {
        const observer = {
            position: Vector3.create(0, 0, 10),
            forward: Vector3.create(0, 0, -1)
        };
        const threatPos = Vector3.create(0, 0, 5); // Threat is at Z=5, observer at Z=10

        // Direct escape without obstacles should point towards +Z
        const clearEscape = adapter.computeAdvisoryEscapeVector(observer, threatPos, []);
        expect(clearEscape.obstacleDeflectionApplied).toBe(false);
        expect(clearEscape.recommendedVector.z).toBeCloseTo(1.0, 2);

        // Place a massive rock column directly behind observer in escape path at (0, 0, 12)
        const obstacles = [
            { position: Vector3.create(0, 0, 12), radius: 1.5 }
        ];
        const deflectedEscape = adapter.computeAdvisoryEscapeVector(observer, threatPos, obstacles);
        expect(deflectedEscape.obstacleDeflectionApplied).toBe(true);
        expect(Math.abs(deflectedEscape.recommendedVector.x)).toBeGreaterThan(0.3); // Deflected sideways
        expect(deflectedEscape.deflectionAngleDeg).toBeGreaterThan(15);
    });

    test('7. Supports Unreal Engine Z-UP coordinate convention seamlessly', () => {
        const unrealAdapter = new Spatial3DAdapter({ convention: COORDINATE_CONVENTIONS.Z_UP });
        const observer = {
            position: Vector3.create(0, 0, 0),
            forward: Vector3.create(1, 0, 0), // Looking down +X in Unreal
            eyeHeight: 160 // cm in Unreal
        };

        const target = {
            position: Vector3.create(500, 0, 400), // Elevated on Z axis
            threatIntensity: 0.7
        };

        const stim = unrealAdapter.evaluate3DSpatialStimulus(observer, target);
        expect(stim.tacticalElevation.status).toBe(TACTICAL_ELEVATION_STATUS.VULNERABLE_LOW_GROUND);
        expect(stim.tacticalElevation.deltaHeight).toBe(400);
    });

    test('8. Generates structured host raycast requests without mutating entities', () => {
        const observer = {
            position: Vector3.create(10, 0, 20),
            eyeHeight: 1.6
        };
        const targets = [
            { id: 'bandit_1', position: Vector3.create(15, 0, 30), collisionLayerMask: 0x02 },
            { id: 'monster_2', position: Vector3.create(5, 5, 25), collisionLayerMask: 0x04 }
        ];

        const requests = adapter.generateHostRaycastRequests(observer, targets);
        expect(requests).toHaveLength(2);
        expect(requests[0].rayId).toContain('bandit_1');
        expect(requests[0].maxDistance).toBeGreaterThan(0);
        expect(requests[0].collisionLayerMask).toBe(0x02);
    });

    test('9. Strictly preserves Host Game Authority Invariant with zero host state mutation', () => {
        const hostEntity = {
            id: 'host_actor_42',
            position: { x: 12.5, y: 0.0, z: -8.2 },
            velocity: { x: 0.0, y: 0.0, z: 1.5 },
            health: 100,
            inventory: ['sword', 'shield']
        };

        const isUnmutated = adapter.validateHostAuthorityInvariant(hostEntity);
        expect(isUnmutated).toBe(true);
        expect(hostEntity.health).toBe(100);
        expect(hostEntity.position.x).toBe(12.5);
    });
});
