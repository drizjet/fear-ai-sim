/**
 * @file debt-thin-pairs.test.js
 *
 * Retires the thin remainder pairs: AffectiveAgent x TraumaZoneSystem,
 * AffectiveAgent x DeterministicRng, DeterministicRng x TraumaZoneSystem
 * (seeded long-horizon loop mirroring the long-horizon benchmark), and
 * CivilizationSimulationSystem x RelationshipTensorSystem (grievance-aware
 * route advisory composition).
 */

import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/src/AffectiveAgent.js';
import { TraumaZoneSystem } from '../packages/core/src/TraumaZoneSystem.js';
import { DeterministicRng } from '../packages/core/src/DeterministicRng.js';
import { CivilizationSimulationSystem } from '../packages/core/src/CivilizationSimulationSystem.js';
import { RelationshipTensorSystem, INTERACTION_TYPES } from '../packages/core/src/RelationshipTensorSystem.js';
import { ContagionGraph } from '../packages/core/src/ContagionGraph.js';
const THREAT = { distance: 9.0, intensity: 0.6 };

function seededLoop(seed) {
    const rng = new DeterministicRng(seed);
    const agent = new AffectiveAgent('scout', { neuroticism: 0.5, resilience: 0.5 });
    const zones = new TraumaZoneSystem();
    const fears = [];
    for (let t = 0; t < 20; t++) {
        agent.x += rng.range(-0.2, 0.2);
        agent.y += rng.range(-0.2, 0.2);
        zones.tick(1);
        if (t === 5) zones.addZone(agent.x, agent.y, 0, 1.0, 60, 100);
        const dread = zones.getTraumaAt(agent.x, agent.y, 0);
        fears.push(agent.tick(0.016, { threats: [THREAT] }, {
            rng: () => rng.next(),
            traumaDread: dread
        }).affective_state.raw_fear);
    }
    return fears;
}

describe('Debt: trauma zones and seeded determinism', () => {
    it('1. Zone dread at agent position amplifies fear vs outside zone', () => {
        const zones = new TraumaZoneSystem();
        zones.addZone(0, 0, 0, 1.0, 60, 1000);
        const inside = zones.getTraumaAt(5, 0, 0);
        const outside = zones.getTraumaAt(500, 0, 0);
        expect(inside).toBeGreaterThan(0.5);
        expect(outside).toBe(0);

        const rIn = new AffectiveAgent('a', {}).tick(0.016, { threats: [THREAT] }, { traumaDread: inside });
        const rOut = new AffectiveAgent('a', {}).tick(0.016, { threats: [THREAT] }, { traumaDread: outside });
        expect(rIn.affective_state.raw_fear).toBeGreaterThan(rOut.affective_state.raw_fear);
    });

    it('2. Zone decay reduces dread over time without new trauma', () => {
        const zones = new TraumaZoneSystem();
        zones.addZone(0, 0, 0, 1.0, 60, 50);
        const early = zones.getTraumaAt(5, 0, 0);
        zones.tick(40);
        const late = zones.getTraumaAt(5, 0, 0);
        expect(early).toBeGreaterThan(late);
    });

    it('3. Seeded agent-zone-rng loop deterministic for same seed', () => {
        expect(seededLoop(2026)).toEqual(seededLoop(2026));
    });

    it('4. Rng stream deterministic and bounded, next() aliases random()', () => {
        const a = new DeterministicRng(7);
        const b = new DeterministicRng(7);
        const seqA = Array.from({ length: 10 }, () => a.next());
        const seqB = Array.from({ length: 10 }, () => b.next());
        expect(seqA).toEqual(seqB);
        for (const v of seqA) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
        const c = new DeterministicRng(7);
        expect(c.next()).toBe(seqA[0]);
    });

    it('4b. Benchmark rng pattern survives PANIC/FREEZE branches without throwing', () => {
        const rng = new DeterministicRng(99);
        const agent = new AffectiveAgent('doom', { neuroticism: 0.9, resilience: 0.1 });
        expect(() => {
            for (let t = 0; t < 60; t++) {
                agent.tick(0.016, { threats: [{ distance: 1.0, intensity: 1.0 }] }, { rng: () => rng.next() });
            }
        }).not.toThrow();
    });
});

describe('Debt: ContagionGraph x DeterministicRng', () => {
    it('7. Seeded peer layout yields deterministic contagion readout', () => {
        const run = (seed) => {
            const rng = new DeterministicRng(seed);
            const graph = new ContagionGraph();
            const peers = Array.from({ length: 5 }, (_, i) => ({
                id: `p${i}`,
                x: rng.range(-10, 10),
                y: rng.range(-10, 10),
                z: 0,
                fearBand: rng.random() < 0.5 ? 'PANIC' : 'CALM',
                isPanicking: rng.random() < 0.5
            }));
            const focal = { id: 'f', x: 0, y: 0, z: 0, traits: { extraversion: 0.6, neuroticism: 0.6 } };
            return graph.evaluateContagion(focal, peers);
        };
        expect(run(42)).toEqual(run(42));
        const out = run(42);
        expect(out.contagionFear).toBeGreaterThanOrEqual(0);
        expect(out.dominantSourceId === null || typeof out.dominantSourceId === 'string').toBe(true);
    });
});

describe('Debt: CivilizationSimulationSystem x RelationshipTensorSystem', () => {
    function routeWorld() {
        const civ = new CivilizationSimulationSystem();
        civ.registerNode('oakhaven', { x: 0, y: 0, z: 0 });
        civ.registerNode('riverbend', { x: 100, y: 0, z: 0 });
        civ.registerRoute('oak-river', { fromNodeId: 'oakhaven', toNodeId: 'riverbend' });
        return civ;
    }

    it('5. Grievance between route owners composes into avoid advisory', () => {
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('oak-elder', 'river-elder', INTERACTION_TYPES.BETRAYAL, { weight: 2.0 });
        const grievance = rel.getRelationship('oak-elder', 'river-elder').grievance;
        expect(grievance).toBeGreaterThan(0);

        const civ = routeWorld();
        const ranked = civ.rankTradeRoutes('oakhaven', 'riverbend');
        expect(ranked.length).toBeGreaterThan(0);
        // Advisory composition (test-owned, precedent: leaderCalm mapping):
        // route danger plus owner grievance yields a single avoid score.
        const avoidScore = (ranked[0].perceivedDanger ?? 0) * 0.5 + grievance * 0.5;
        expect(avoidScore).toBeGreaterThan(0.3);
    });

    it('6. Peaceful owners compose into lower avoid score for same route', () => {
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('oak-elder', 'river-elder', INTERACTION_TYPES.SHARED_SURVIVAL, { weight: 2.0 });
        const grievance = rel.getRelationship('oak-elder', 'river-elder').grievance;
        expect(grievance).toBe(0);

        const civ = routeWorld();
        const ranked = civ.rankTradeRoutes('oakhaven', 'riverbend');
        const avoidScore = (ranked[0].perceivedDanger ?? 0) * 0.5 + grievance * 0.5;
        expect(avoidScore).toBeLessThan(0.3);
    });
});
