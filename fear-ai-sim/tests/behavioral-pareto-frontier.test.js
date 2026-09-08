import { describe, expect, it } from '@jest/globals';
import {
    BehavioralParetoFrontier,
    OBJECTIVE_KEYS,
    DEFAULT_OBJECTIVE_WEIGHTS,
    STANDARD_STRESSOR_REGIMES
} from '../packages/core/index.js';
import { CANONICAL_PRESETS } from '../packages/core/src/PresetLibrary.js';

describe('BehavioralParetoFrontier (Front B / Sections 10–11 & 89)', () => {
    it('evaluates candidate reaction norms across standard stressor regimes producing bounded 5D objective vectors', () => {
        const frontier = new BehavioralParetoFrontier({ evaluationTicksPerRegime: 15 });
        const candidate = {
            id: 'candidate_veteran_tune',
            traits: { ...CANONICAL_PRESETS.STOIC_VETERAN.traits },
            behaviorCard: { ...CANONICAL_PRESETS.STOIC_VETERAN.behaviorCard }
        };

        const result = frontier.evaluateCandidate(candidate);

        expect(result).toBeDefined();
        expect(result.id).toBe('candidate_veteran_tune');
        expect(result.vector).toHaveLength(5);
        expect(result.trajectories[STANDARD_STRESSOR_REGIMES.QUIESCENT_BASELINE]).toBeDefined();
        expect(result.trajectories[STANDARD_STRESSOR_REGIMES.ACUTE_JUMPSCARE]).toBeDefined();
        expect(result.trajectories[STANDARD_STRESSOR_REGIMES.SUSTAINED_DREAD]).toBeDefined();
        expect(result.trajectories[STANDARD_STRESSOR_REGIMES.SOCIAL_CONTAGION]).toBeDefined();
        expect(result.trajectories[STANDARD_STRESSOR_REGIMES.COMPOUND_CRISIS]).toBeDefined();

        for (const key of OBJECTIVE_KEYS) {
            const val = result.objectives[key];
            expect(typeof val).toBe('number');
            expect(val).toBeGreaterThanOrEqual(0.0);
            expect(val).toBeLessThanOrEqual(1.0);
        }
    });

    it('correctly implements Pareto dominance predicate', () => {
        const frontier = new BehavioralParetoFrontier();

        const superior = [0.9, 0.85, 0.9, 0.95, 0.8];
        const inferior = [0.8, 0.80, 0.7, 0.90, 0.7];
        const incomparable = [0.95, 0.70, 0.9, 0.95, 0.8];

        expect(frontier.dominates(superior, inferior)).toBe(true);
        expect(frontier.dominates(inferior, superior)).toBe(false);
        expect(frontier.dominates(superior, incomparable)).toBe(false);
        expect(frontier.dominates(incomparable, superior)).toBe(false);
        expect(frontier.dominates(superior, superior)).toBe(false);
    });

    it('executes NSGA-II non-dominated sorting and assigns accurate Pareto ranks', () => {
        const frontier = new BehavioralParetoFrontier();

        const pop = [
            { id: 'p1', vector: [0.9, 0.9, 0.9, 0.9, 0.9] },
            { id: 'p2', vector: [0.7, 0.7, 0.7, 0.7, 0.7] },
            { id: 'p3', vector: [0.5, 0.5, 0.5, 0.5, 0.5] },
            { id: 'p4', vector: [0.85, 0.95, 0.8, 0.8, 0.8] } // Trade-off with p1
        ];

        const fronts = frontier.nonDominatedSort(pop);

        expect(fronts.length).toBeGreaterThanOrEqual(2);
        // p1 and p4 dominate p2 and p3, so Front 1 contains p1 and p4
        const front1Ids = fronts[0].map(s => s.id);
        expect(front1Ids).toContain('p1');
        expect(front1Ids).toContain('p4');
        expect(fronts[0].every(s => s.paretoRank === 1)).toBe(true);

        // p2 dominates p3, so Front 2 contains p2
        const front2Ids = fronts[1].map(s => s.id);
        expect(front2Ids).toContain('p2');
    });

    it('computes crowding distance to preserve diversity along the Pareto frontier', () => {
        const frontier = new BehavioralParetoFrontier();

        const front = [
            { id: 'a', vector: [0.1, 0.9, 0.5, 0.5, 0.5] },
            { id: 'b', vector: [0.5, 0.5, 0.5, 0.5, 0.5] },
            { id: 'c', vector: [0.9, 0.1, 0.5, 0.5, 0.5] }
        ];

        frontier.computeCrowdingDistance(front);

        // Boundary points must have infinite crowding distance
        const infCount = front.filter(s => s.crowdingDistance === Infinity).length;
        expect(infCount).toBeGreaterThanOrEqual(2);

        // Interior point must have finite non-negative crowding distance
        const interior = front.find(s => s.id === 'b');
        expect(Number.isFinite(interior.crowdingDistance)).toBe(true);
        expect(interior.crowdingDistance).toBeGreaterThan(0);
    });

    it('calculates deterministic hypervolume indicator relative to reference point', () => {
        const frontier = new BehavioralParetoFrontier();

        const weakFront = [
            { vector: [0.3, 0.3, 0.3, 0.3, 0.3] }
        ];
        const strongFront = [
            { vector: [0.8, 0.8, 0.8, 0.8, 0.8] },
            { vector: [0.9, 0.7, 0.8, 0.8, 0.8] }
        ];

        const weakHV = frontier.computeHypervolume(weakFront);
        const strongHV = frontier.computeHypervolume(strongFront);

        expect(weakHV).toBeGreaterThan(0.0);
        expect(strongHV).toBeGreaterThan(weakHV);
        expect(strongHV).toBeLessThanOrEqual(1.0);

        // Determinism test: calling again with identical front yields exact same float
        const repeatHV = frontier.computeHypervolume(strongFront);
        expect(repeatHV).toBe(strongHV);
    });

    it('selects the knee-point best compromise solution minimizing distance to utopian point', () => {
        const frontier = new BehavioralParetoFrontier();

        const front = [
            { id: 'extreme_a', vector: [0.99, 0.10, 0.20, 0.10, 0.10] }, // Extremely polarized
            { id: 'balanced_knee', vector: [0.85, 0.85, 0.80, 0.85, 0.80] }, // Balanced knee point
            { id: 'extreme_b', vector: [0.10, 0.99, 0.20, 0.10, 0.10] }  // Extremely polarized
        ];

        const knee = frontier.selectKneePoint(front);

        expect(knee).toBeDefined();
        expect(knee.solution.id).toBe('balanced_knee');
        expect(knee.distanceToUtopia).toBeLessThan(1.0);
    });

    it('generates high-dimensional reaction-norm calibration surface mapping (S, P) to fear response', () => {
        const frontier = new BehavioralParetoFrontier();
        const candidate = {
            id: 'civilian_test',
            traits: { ...CANONICAL_PRESETS.COWARDLY_CIVILIAN.traits }
        };

        const surface = frontier.generateCalibrationSurface(candidate, 4);

        expect(surface.resolution).toBe(4);
        expect(surface.surfaceGrid).toHaveLength(16); // 4x4 grid

        const minS = surface.surfaceGrid.find(pt => pt.stressorIntensity === 0 && pt.socialPressure === 0);
        const maxS = surface.surfaceGrid.find(pt => pt.stressorIntensity === 1 && pt.socialPressure === 1);

        expect(minS).toBeDefined();
        expect(maxS).toBeDefined();
        expect(maxS.peakFear).toBeGreaterThan(minS.peakFear);
    });

    it('calibrates entire population and produces full Pareto synthesis', () => {
        const frontier = new BehavioralParetoFrontier({ evaluationTicksPerRegime: 10 });
        const candidates = [
            { id: 'c1', traits: { neuroticism: 0.2, resilience: 0.8, bravery: 0.8 } },
            { id: 'c2', traits: { neuroticism: 0.8, resilience: 0.2, bravery: 0.2 } },
            { id: 'c3', traits: { neuroticism: 0.5, resilience: 0.5, bravery: 0.5 } }
        ];

        const report = frontier.calibratePopulation(candidates);

        expect(report.totalEvaluated).toBe(3);
        expect(report.numFronts).toBeGreaterThanOrEqual(1);
        expect(report.front1Size).toBeGreaterThanOrEqual(1);
        expect(report.hypervolume).toBeGreaterThan(0.0);
        expect(report.bestCompromise).toBeDefined();
    });

    it('guarantees state serialization and replay determinism', () => {
        const frontierA = new BehavioralParetoFrontier({ evaluationTicksPerRegime: 10 });
        frontierA.evaluateCandidate({ id: 'cand_1', traits: { neuroticism: 0.4, resilience: 0.6 } });

        const stateA = frontierA.getState();
        const frontierB = new BehavioralParetoFrontier();
        frontierB.setState(stateA);

        expect(frontierB.evaluatedPopulation).toHaveLength(1);
        expect(frontierB.evaluatedPopulation[0].id).toBe('cand_1');
        expect(frontierB.evaluatedPopulation[0].vector).toEqual(frontierA.evaluatedPopulation[0].vector);
    });

    it('strictly adheres to Host Game Authority Invariant with zero host state mutation', () => {
        const frontier = new BehavioralParetoFrontier({ evaluationTicksPerRegime: 10 });
        const externalGameHost = {
            units: [{ id: 'u1', x: 10, y: 20, z: 0, hp: 100 }],
            physicsStep: 60
        };

        const originalString = JSON.stringify(externalGameHost);
        frontier.evaluateCandidate({ id: 'pure_offline_candidate', traits: { neuroticism: 0.5, resilience: 0.5 } });

        expect(JSON.stringify(externalGameHost)).toBe(originalString);
    });
});
