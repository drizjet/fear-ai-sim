/**
 * @fear-ai/core - Spatial3DAdapter
 * Front D / Section 9: External Host Integration Matrix Phase 2 (3D Spatial Raycast & Obstacle Navigation Adapter).
 * 
 * STRICT INVARIANT:
 * The host game engine (Godot 3D, Unity, Unreal, custom C++/Rust engine)
 * remains strictly authoritative for world geometry, physics raycasting,
 * collision boundaries, navmesh pathfinding, and entity transforms.
 * Spatial3DAdapter only evaluates 3D spatial sensory stimuli, calculates
 * elevation advantages, processes raycast occlusion results, and provides
 * non-binding advisory 3D steering/escape vectors.
 */

export const TACTICAL_ELEVATION_STATUS = Object.freeze({
    COMMANDING_HIGH_GROUND: 'COMMANDING_HIGH_GROUND',
    LEVEL_GROUND: 'LEVEL_GROUND',
    VULNERABLE_LOW_GROUND: 'VULNERABLE_LOW_GROUND'
});

export const OCCLUSION_STATUS = Object.freeze({
    CLEAR_LINE_OF_SIGHT: 'CLEAR_LINE_OF_SIGHT',
    PARTIALLY_OBSCURED: 'PARTIALLY_OBSCURED',
    FULLY_OCCLUDED: 'FULLY_OCCLUDED'
});

export const COORDINATE_CONVENTIONS = Object.freeze({
    Y_UP: 'Y_UP',   // Standard OpenGL, Godot 3D, Unity (+Y up)
    Z_UP: 'Z_UP'    // Standard Unreal Engine, 3ds Max (+Z up)
});

/**
 * Pure immutable 3D vector arithmetic helpers.
 */
export const Vector3 = Object.freeze({
    create(x = 0, y = 0, z = 0) {
        return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
    },

    clone(v) {
        return { x: v.x, y: v.y, z: v.z };
    },

    add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    },

    subtract(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    },

    scale(v, s) {
        return { x: v.x * s, y: v.y * s, z: v.z * s };
    },

    dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    },

    cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    },

    magnitude(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    },

    magnitudeSquared(v) {
        return v.x * v.x + v.y * v.y + v.z * v.z;
    },

    normalize(v) {
        const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (mag < 1e-7) {
            return { x: 0, y: 0, z: 0 };
        }
        return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
    },

    distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    distanceSquared(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return dx * dx + dy * dy + dz * dz;
    },

    angleDeg(a, b) {
        const magA = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        const magB = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
        if (magA < 1e-7 || magB < 1e-7) return 0;
        const cosTheta = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (magA * magB)));
        return (Math.acos(cosTheta) * 180) / Math.PI;
    }
});

export class Spatial3DAdapter {
    constructor(config = {}) {
        this.config = Object.freeze({
            convention: config.convention || COORDINATE_CONVENTIONS.Y_UP,
            defaultFovHorizontalDeg: config.defaultFovHorizontalDeg ?? 110.0,
            defaultFovVerticalDeg: config.defaultFovVerticalDeg ?? 70.0,
            highGroundThreshold: config.highGroundThreshold ?? 2.0, // meters
            highGroundBonusMax: config.highGroundBonusMax ?? 0.35,  // 35% fear discount
            lowGroundPenaltyMax: config.lowGroundPenaltyMax ?? 0.45, // 45% threat amplification
            startleMultiplier: config.startleMultiplier ?? 1.50,
            occlusionThreshold: config.occlusionThreshold ?? 0.85,
            escapeSafetyMargin: config.escapeSafetyMargin ?? 2.5,   // meters
            ...config
        });
    }

    /**
     * Evaluates full 3D spatial sensory stimulus between an observer and a target.
     * Respects 3D field-of-view cone, elevation differential, and host raycast occlusion.
     */
    evaluate3DSpatialStimulus(observer, target, environmentQuery = {}) {
        if (!observer || !target) {
            throw new Error('Spatial3DAdapter: observer and target must be defined');
        }

        const convention = this.config.convention;
        const obsPos = observer.position || Vector3.create(0, 0, 0);
        const eyeHeight = observer.eyeHeight ?? 1.6; // default 1.6m human eye level
        
        // Observer eye position adjusted for convention
        const eyePos = convention === COORDINATE_CONVENTIONS.Y_UP
            ? Vector3.create(obsPos.x, obsPos.y + eyeHeight, obsPos.z)
            : Vector3.create(obsPos.x, obsPos.y, obsPos.z + eyeHeight);

        const targetPos = target.position || Vector3.create(0, 0, 0);
        const relVec = Vector3.subtract(targetPos, eyePos);
        const dist = Vector3.magnitude(relVec);
        const normRelVec = Vector3.normalize(relVec);

        const forward = Vector3.normalize(observer.forward || (convention === COORDINATE_CONVENTIONS.Y_UP ? Vector3.create(0, 0, 1) : Vector3.create(1, 0, 0)));

        // Azimuth (horizontal angle) and Pitch (vertical angle)
        let azimuthDeg = 0;
        let pitchDeg = 0;
        let deltaHeight = 0;

        if (convention === COORDINATE_CONVENTIONS.Y_UP) {
            deltaHeight = targetPos.y - obsPos.y;
            // 2D horizontal plane is (x, z)
            const forwardXZ = Vector3.normalize(Vector3.create(forward.x, 0, forward.z));
            const relXZ = Vector3.normalize(Vector3.create(relVec.x, 0, relVec.z));
            azimuthDeg = Vector3.angleDeg(forwardXZ, relXZ);
            
            if (dist > 1e-7) {
                const sinPitch = Math.max(-1, Math.min(1, relVec.y / dist));
                pitchDeg = (Math.asin(sinPitch) * 180) / Math.PI;
            }
        } else {
            deltaHeight = targetPos.z - obsPos.z;
            // 2D horizontal plane is (x, y)
            const forwardXY = Vector3.normalize(Vector3.create(forward.x, forward.y, 0));
            const relXY = Vector3.normalize(Vector3.create(relVec.x, relVec.y, 0));
            azimuthDeg = Vector3.angleDeg(forwardXY, relXY);
            
            if (dist > 1e-7) {
                const sinPitch = Math.max(-1, Math.min(1, relVec.z / dist));
                pitchDeg = (Math.asin(sinPitch) * 180) / Math.PI;
            }
        }

        const fovH = observer.fovHorizontalDeg ?? this.config.defaultFovHorizontalDeg;
        const fovV = observer.fovVerticalDeg ?? this.config.defaultFovVerticalDeg;

        const inHorizontalFov = Math.abs(azimuthDeg) <= fovH / 2.0;
        const inVerticalFov = Math.abs(pitchDeg) <= fovV / 2.0;
        const inFieldOfView = inHorizontalFov && inVerticalFov;
        const isBehind = Math.abs(azimuthDeg) > 90.0;

        // Tactical elevation appraisal
        let elevationStatus = TACTICAL_ELEVATION_STATUS.LEVEL_GROUND;
        let elevationModifier = 1.0;

        if (deltaHeight > this.config.highGroundThreshold) {
            // Target is high above observer -> observer is at vulnerable low ground
            elevationStatus = TACTICAL_ELEVATION_STATUS.VULNERABLE_LOW_GROUND;
            const excess = deltaHeight - this.config.highGroundThreshold;
            const scaling = Math.min(this.config.lowGroundPenaltyMax, excess * 0.10);
            elevationModifier = 1.0 + scaling;
        } else if (deltaHeight < -this.config.highGroundThreshold) {
            // Observer is high above target -> commanding high ground
            elevationStatus = TACTICAL_ELEVATION_STATUS.COMMANDING_HIGH_GROUND;
            const excess = Math.abs(deltaHeight) - this.config.highGroundThreshold;
            const discount = Math.min(this.config.highGroundBonusMax, excess * 0.08);
            elevationModifier = 1.0 - discount;
        }

        // Host raycast occlusion results
        const raycastOcclusion = Math.max(0.0, Math.min(1.0, environmentQuery.raycastOcclusion ?? 0.0));
        let occlusionStatus = OCCLUSION_STATUS.CLEAR_LINE_OF_SIGHT;
        if (raycastOcclusion >= this.config.occlusionThreshold) {
            occlusionStatus = OCCLUSION_STATUS.FULLY_OCCLUDED;
        } else if (raycastOcclusion > 0.0) {
            occlusionStatus = OCCLUSION_STATUS.PARTIALLY_OBSCURED;
        }

        // Raw visual threat calculation
        const baseThreat = target.threatIntensity ?? 0.5;
        const rawVisualThreat = inFieldOfView
            ? baseThreat * (1.0 - raycastOcclusion) * elevationModifier
            : 0.0;

        // Acoustic sensing (3D audio attenuation and blind-spot startle)
        const acousticSign = target.acousticSignature ?? 0.0;
        const acousticDamping = Math.max(0.0, Math.min(1.0, environmentQuery.acousticDamping ?? (raycastOcclusion * 0.5)));
        const distAttenuation = 1.0 / Math.max(1.0, (dist * dist) / 16.0); // 1/d^2 beyond 4m
        const perceivedAcoustic = acousticSign * (1.0 - acousticDamping) * distAttenuation;

        let startleArousal = 0.0;
        if (isBehind && perceivedAcoustic > 0.20) {
            // Behind-the-back sudden sound induces acute startle response
            startleArousal = perceivedAcoustic * this.config.startleMultiplier;
        }

        // Combined effective threat intensity
        const effectiveThreat = Math.min(1.0, Math.max(rawVisualThreat, perceivedAcoustic * 0.70) + (startleArousal * 0.30));

        return Object.freeze({
            distance: dist,
            azimuthDeg: Number(azimuthDeg.toFixed(2)),
            pitchDeg: Number(pitchDeg.toFixed(2)),
            inFieldOfView,
            isBehind,
            tacticalElevation: Object.freeze({
                status: elevationStatus,
                deltaHeight: Number(deltaHeight.toFixed(2)),
                modifier: Number(elevationModifier.toFixed(3))
            }),
            occlusion: Object.freeze({
                status: occlusionStatus,
                ratio: Number(raycastOcclusion.toFixed(3))
            }),
            acoustic: Object.freeze({
                perceivedVolume: Number(perceivedAcoustic.toFixed(3)),
                startleArousal: Number(startleArousal.toFixed(3))
            }),
            effectiveThreatIntensity: Number(effectiveThreat.toFixed(4)),
            stimulusDirection: normRelVec
        });
    }

    /**
     * Generates an advisory 3D escape steering vector away from a threat,
     * taking into account nearby obstacle colliders provided by the host engine.
     */
    computeAdvisoryEscapeVector(observer, threatPosition, obstacles = [], options = {}) {
        if (!observer || !threatPosition) {
            throw new Error('Spatial3DAdapter: observer and threatPosition required');
        }

        const obsPos = observer.position || Vector3.create(0, 0, 0);
        const convention = this.config.convention;

        // Base escape vector: direct repulsion away from threat in 3D horizontal navigation plane
        let directAway = Vector3.subtract(obsPos, threatPosition);
        if (convention === COORDINATE_CONVENTIONS.Y_UP) {
            directAway.y = 0; // standard ground steering remains horizontal
        } else {
            directAway.z = 0;
        }

        let escapeDir = Vector3.normalize(directAway);
        if (Vector3.magnitude(escapeDir) < 1e-7) {
            // Observer and threat are at identical coordinates: default to observer reverse
            const fwd = observer.forward || Vector3.create(0, 0, 1);
            escapeDir = Vector3.scale(Vector3.normalize(fwd), -1);
        }

        const safetyMargin = options.safetyMargin ?? this.config.escapeSafetyMargin;
        let obstacleDeflectionApplied = false;
        let deflectionAccumulator = Vector3.create(0, 0, 0);
        let minObsDist = Infinity;

        // Evaluate obstacle proximity and deflection
        for (const obs of obstacles) {
            const obsCenter = obs.position || Vector3.create(0, 0, 0);
            const obsRadius = obs.radius ?? 1.0;
            const toObstacle = Vector3.subtract(obsCenter, obsPos);
            const distToObstacle = Vector3.magnitude(toObstacle);
            
            if (distToObstacle < minObsDist) {
                minObsDist = distToObstacle;
            }

            // Check if obstacle lies directly in the path of the proposed escape direction
            const clearanceDist = distToObstacle - obsRadius;
            if (clearanceDist < safetyMargin) {
                const normToObs = Vector3.normalize(toObstacle);
                const alignment = Vector3.dot(escapeDir, normToObs);

                if (alignment > 0.1) { // Obstacle is ahead in escape path
                    obstacleDeflectionApplied = true;
                    // Compute deflection vector perpendicular to the obstacle vector
                    let perp = convention === COORDINATE_CONVENTIONS.Y_UP
                        ? Vector3.cross(normToObs, Vector3.create(0, 1, 0))
                        : Vector3.cross(normToObs, Vector3.create(0, 0, 1));

                    // Choose deflection side that best matches escape vector
                    if (Vector3.dot(perp, escapeDir) < 0) {
                        perp = Vector3.scale(perp, -1);
                    }

                    const repulsionWeight = (safetyMargin - Math.max(0, clearanceDist)) / safetyMargin;
                    deflectionAccumulator = Vector3.add(deflectionAccumulator, Vector3.scale(perp, repulsionWeight * 1.5));
                }
            }
        }

        let finalVector = escapeDir;
        if (obstacleDeflectionApplied) {
            finalVector = Vector3.normalize(Vector3.add(escapeDir, deflectionAccumulator));
        }

        const initialAngle = Vector3.angleDeg(escapeDir, finalVector);
        const threatDist = Vector3.distance(obsPos, threatPosition);
        const speedRatio = threatDist < 5.0 ? 1.0 : Math.max(0.4, Math.min(1.0, 10.0 / Math.max(1.0, threatDist)));

        return Object.freeze({
            recommendedVector: finalVector,
            speedRatio: Number(speedRatio.toFixed(2)),
            obstacleDeflectionApplied,
            deflectionAngleDeg: Number(initialAngle.toFixed(2)),
            nearestObstacleDistance: minObsDist === Infinity ? null : Number(minObsDist.toFixed(2))
        });
    }

    /**
     * Generates a batch of advisory RaycastQuery requests for the host game engine.
     * The host game executes these against its native physics engine (Godot, PhysX, Chaos, etc.)
     * and passes the occlusion ratios back to Fear AI.
     */
    generateHostRaycastRequests(observer, targets = [], maxDistance = 50.0) {
        const obsPos = observer.position || Vector3.create(0, 0, 0);
        const eyeHeight = observer.eyeHeight ?? 1.6;
        const convention = this.config.convention;

        const eyePos = convention === COORDINATE_CONVENTIONS.Y_UP
            ? Vector3.create(obsPos.x, obsPos.y + eyeHeight, obsPos.z)
            : Vector3.create(obsPos.x, obsPos.y, obsPos.z + eyeHeight);

        return targets.map(t => {
            const targetPos = t.position || Vector3.create(0, 0, 0);
            const rayVec = Vector3.subtract(targetPos, eyePos);
            const rayDist = Math.min(maxDistance, Vector3.magnitude(rayVec));
            const rayDir = Vector3.normalize(rayVec);

            return Object.freeze({
                rayId: `ray_${t.id || 'target'}_${Math.round(eyePos.x)}_${Math.round(eyePos.z)}`,
                origin: eyePos,
                target: targetPos,
                direction: rayDir,
                maxDistance: Number(rayDist.toFixed(2)),
                queryType: 'LINE_OF_SIGHT',
                collisionLayerMask: t.collisionLayerMask ?? 0x01
            });
        });
    }

    /**
     * Verifies the Host Game Authority Invariant.
     * Guarantees that passing external host entities does not mutate their coordinates or properties.
     */
    validateHostAuthorityInvariant(hostEntity) {
        const snapshot = JSON.stringify(hostEntity);
        const observer = {
            position: hostEntity.position,
            forward: hostEntity.forward || Vector3.create(0, 0, 1),
            eyeHeight: 1.6
        };
        const target = {
            position: Vector3.create(hostEntity.position.x + 5, hostEntity.position.y + 3, hostEntity.position.z + 5),
            threatIntensity: 0.8
        };

        this.evaluate3DSpatialStimulus(observer, target);
        this.computeAdvisoryEscapeVector(observer, target.position, []);
        this.generateHostRaycastRequests(observer, [target]);

        const afterSnapshot = JSON.stringify(hostEntity);
        return snapshot === afterSnapshot;
    }
}
