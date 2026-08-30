import { describe, expect, it, beforeEach } from '@jest/globals';
import { Simulation } from '../simulation.js';
import { SpatialHash } from '../spatialhash.js';

function makeFakeSimulation(obstacles) {
    return {
        obstacles,
        obstacleSpatialHash: new SpatialHash(1000, 1000, 100)
    };
}

function populateObstacleHash(fakeSim) {
    fakeSim.obstacleSpatialHash.clear();
    for (let i = 0; i < fakeSim.obstacles.length; i++) {
        const obs = fakeSim.obstacles[i];
        if (!obs) continue;
        fakeSim.obstacleSpatialHash.insert(
            obs.x + (obs.w || 0) / 2,
            obs.y + (obs.h || 0) / 2,
            obs
        );
    }
}

describe('Simulation.queryNearbyObstacles', () => {
    let obstacles;
    let fakeSim;

    beforeEach(() => {
        obstacles = [
            { x: 50, y: 50, w: 40, h: 40 },       // center (70, 70) — near origin
            { x: 500, y: 500, w: 40, h: 40 },     // center (520, 520) — far
            { x: 800, y: 100, w: 40, h: 40 }      // center (820, 120) — far
        ];
        fakeSim = makeFakeSimulation(obstacles);
        populateObstacleHash(fakeSim);
    });

    it('returns obstacles within the agent perception radius', () => {
        const result = Simulation.prototype.queryNearbyObstacles.call(fakeSim, 70, 70);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(obstacles[0]);
    });

    it('returns empty array when there are no obstacles', () => {
        const empty = makeFakeSimulation([]);
        populateObstacleHash(empty);
        const result = Simulation.prototype.queryNearbyObstacles.call(empty, 70, 70);
        expect(result).toEqual([]);
    });

    it('returns empty array when obstacleSpatialHash is missing', () => {
        const noHash = { obstacles: [{ x: 0, y: 0, w: 10, h: 10 }] };
        const result = Simulation.prototype.queryNearbyObstacles.call(noHash, 0, 0);
        expect(result).toEqual([]);
    });

    it('pads query radius by the cell size to cover cell boundaries', () => {
        // Place an obstacle whose center is in a different cell than the agent
        // but still within the 60-unit perception radius plus a 100-unit cell
        // pad. The agent is at (140, 50); the obstacle center is at (220, 50)
        // — 80 units away, beyond the raw 60-unit radius, but inside the
        // padded 160-unit radius.
        const cellBoundaryObs = { x: 200, y: 30, w: 40, h: 40 }; // center (220, 50)
        const localObstacles = [cellBoundaryObs];
        const localSim = makeFakeSimulation(localObstacles);
        populateObstacleHash(localSim);

        const result = Simulation.prototype.queryNearbyObstacles.call(localSim, 140, 50);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(cellBoundaryObs);
    });
});

describe('obstacle hash population', () => {
    it('rebuilds the obstacle hash from the obstacles array on each populate', () => {
        const obs = { x: 10, y: 10, w: 20, h: 20 };
        const fakeSim = makeFakeSimulation([obs]);
        populateObstacleHash(fakeSim);
        expect(fakeSim.obstacleSpatialHash.query(20, 20, 100).length).toBe(1);

        // Swap the obstacles list and re-populate; the hash reflects the new
        // set rather than the old one.
        const obs2 = { x: 600, y: 600, w: 20, h: 20 };
        fakeSim.obstacles = [obs2];
        populateObstacleHash(fakeSim);
        expect(fakeSim.obstacleSpatialHash.query(20, 20, 100).length).toBe(0);
        expect(fakeSim.obstacleSpatialHash.query(610, 610, 100).length).toBe(1);
    });
});
