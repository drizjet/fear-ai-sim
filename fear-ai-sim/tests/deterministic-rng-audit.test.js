import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DeterministicRng,
    InformationPropagationEngine,
    SocialEventEngine,
    RelationshipTensorSystem,
    TraumaZoneSystem,
    TraumaCrystallizationEngine,
    ContagionGraph,
    TRAUMA_TYPES,
} from '../packages/core/index.js';

// Post-25 audit candidate 20: DeterministicRng sweep over social/trauma paths.
//
// MATH.RANDOM INVENTORY (probed 2026-09-11 via `grep -rn "Math\.random" packages/core/src packages/runtime/src`):
//   Real `Math.random()` CALL SITES (regex /Math\.random\s*\(/): exactly 3, in 3 files —
//     1. packages/core/src/BehavioralParetoFrontier.js:77 — candidateId fallback
//        (`candidate_${Math.random().toString(36)...}`), benchmark harness only.
//     2. packages/core/src/ScenarioInterventionSystem.js:62 — intervention record id
//        (`intv_${Date.now()}_${Math.random()...}`), advisory id only.
//     3. packages/core/src/ScenarioStepper.js:320 — live-intervention record id
//        (`live_${Date.now()}_${Math.random()...}`), advisory id only.
//   Comment-only mentions (NOT call sites, no parens): AffectiveAgent.js:35,
//   FearCore.js:107, FunctionalPersonaSignatures.js:168.
//   NONE of the 3 call sites sits on a social/trauma path: InformationPropagationEngine
//   uses a seeded LCG (makeRng), SocialEventEngine/TraumaZoneSystem/
//   TraumaCrystallizationEngine/ContagionGraph use NO randomness at all
//   (only Math.min/max/sqrt/hypot/pow clamps), and RuntimeSimulation wires a
//   DeterministicRng instance as context.rng into agent ticks.

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIRS = [join(HERE, '..', 'packages', 'core', 'src'), join(HERE, '..', 'packages', 'runtime', 'src')];

// Social/trauma-path files that MUST stay free of unseeded randomness.
const SOCIAL_TRAUMA_FILES = new Set([
    'InformationPropagationEngine.js',
    'SocialEventEngine.js',
    'TraumaZoneSystem.js',
    'TraumaCrystallizationEngine.js',
    'ContagionGraph.js',
    'RuntimeSimulation.js',
    'AffectiveAgent.js',
    'FearCore.js',
]);

function mathRandomCallSites() {
    const hits = [];
    for (const dir of SRC_DIRS) {
        for (const file of readdirSync(dir).sort()) {
            if (!file.endsWith('.js')) continue;
            const text = readFileSync(join(dir, file), 'utf8');
            const lines = text.split('\n');
            lines.forEach((line, idx) => {
                if (/Math\.random\s*\(/.test(line)) hits.push(`${file}:${idx + 1}: ${line.trim()}`);
            });
        }
    }
    return hits.sort();
}

// JSON-stable snapshot: Sets -> sorted arrays, Maps -> sorted entries.
function stable(value) {
    return JSON.stringify(value, (_k, v) => {
        if (v instanceof Set) return [...v].sort();
        if (v instanceof Map) return [...v.entries()].sort();
        return v;
    });
}

// Full social+trauma run with COMPLETE re-instantiation (no shared state).
// Rumor spread with seeded mutation rolls + social events + trauma ticks.
function runSocialTrauma(seed) {
    const net = new InformationPropagationEngine({ mutationRate: 0.5 }, seed);
    for (const a of ['a', 'b', 'c', 'd', 'e']) net.registerAgent(a, 0.6);
    net.addListenEdge('b', 'a');
    net.addListenEdge('c', 'b');
    net.addListenEdge('d', 'c');
    net.addListenEdge('e', 'd');
    net.injectRumor('ROAD_AMBUSH', 'ambush north', 'a', { confidence: 0.9 });
    net.injectRumor('LEADER_DEATH', 'elder fallen', 'c', { confidence: 0.7 });
    for (let i = 0; i < 12; i++) net.advanceTick();

    const rel = new RelationshipTensorSystem();
    const events = new SocialEventEngine();
    events.applyEvent(rel, 'BETRAYAL', 'perpetrator', 'victim', { weight: 1.0, witnesses: ['bystander'] });

    const zones = new TraumaZoneSystem();
    zones.addZone(0, 0, 0, 0.9, 150, 1800);
    for (let i = 0; i < 5; i++) zones.tick(1);

    const trauma = new TraumaCrystallizationEngine();
    trauma.incurTrauma('victim', { traumaType: TRAUMA_TYPES.BETRAYAL_ABANDONMENT, severity: 1.0 });
    for (let i = 0; i < 50; i++) trauma.tick(1);

    const contagion = new ContagionGraph({ traumaAmplifier: 1.0 });
    const spread = contagion.evaluateContagion(
        { id: 'bystander', x: 0, y: 0, z: 0, traits: {} },
        [{ id: 'victim', x: 10, y: 0, z: 0, fearBand: 'PANIC', isPanicking: true, rawFear: 0.95, traumaLoad: 0.5 }]
    );

    return {
        stats: net.networkStats(),
        mutations: [...net.rumors.values()].map((r) => r.mutations),
        heldByE: net.heldBy('e'),
        zones: zones.getState(),
        traumaRecord: trauma.agentRecords.get('victim'),
        spread,
    };
}

describe('deterministic-rng audit over social/trauma paths (post-25 candidate 20)', () => {
    it('1. Math.random inventory: exactly the 3 known unseeded call sites, no new ones', () => {
        const sites = mathRandomCallSites();
        // Snapshot the COUNT: a NEW unseeded source anywhere in core+runtime fails here.
        expect(sites.length).toBe(3);
        const files = sites.map((s) => s.split(':')[0]);
        expect([...new Set(files)].sort()).toEqual([
            'BehavioralParetoFrontier.js',
            'ScenarioInterventionSystem.js',
            'ScenarioStepper.js',
        ]);
    });

    it('2. No unseeded Math.random on any social/trauma path (defect probe: currently CLEAN)', () => {
        // If an unseeded Math.random ever lands on a social/trauma path this
        // assertion FAILS WITH EVIDENCE (the offending file:line is printed).
        // Pinned 2026-09-11: zero hits — no defect present, nothing fixed.
        const sites = mathRandomCallSites();
        const onPath = sites.filter((s) => SOCIAL_TRAUMA_FILES.has(s.split(':')[0]));
        expect({ onPath }).toEqual({ onPath: [] });
    });

    it('3. Same-seed social+trauma runs replay bit-identically across full re-instantiation', () => {
        const a = stable(runSocialTrauma(42));
        const b = stable(runSocialTrauma(42));
        expect(b).toBe(a);
        // Pinned seed-42 rumor outcomes (mutationRate 0.5, 12 ticks, 5-agent chain):
        const run = runSocialTrauma(42);
        expect(run.mutations).toEqual([3, 2]);
        expect(run.stats.totalReach).toBe(8);
        expect(run.heldByE[0]).toMatchObject({ rumorId: 'rumor_2', confidence: 0.3237, hops: 2 });
        expect(run.heldByE[1]).toMatchObject({ rumorId: 'rumor_1', confidence: 0.1924, hops: 4 });
    });

    it('4. Different seeds diverge in mutation outcomes (seed actually matters)', () => {
        const a = runSocialTrauma(42);
        const b = runSocialTrauma(43);
        // Pinned: seed 43 mutates [4, 1] vs seed 42 [3, 2]; comparison is live.
        expect(b.mutations).toEqual([4, 1]);
        expect(stable(b)).not.toBe(stable(a));
        expect(b.mutations).not.toEqual(a.mutations);
    });

    it('5. Reseed determinism: same-seed DeterministicRng instances emit identical sequences', () => {
        const rngA = new DeterministicRng(99);
        const rngB = new DeterministicRng(99);
        const seqA = [rngA.random(), rngA.random(), rngA.random()];
        const seqB = [rngB.random(), rngB.random(), rngB.random()];
        expect(seqB).toEqual(seqA);
        // Pinned Mulberry32 sequence for seed 99:
        expect(seqA).toEqual([0.2604658124037087, 0.8048227655235678, 0.5408715349622071]);
        // A different seed diverges on the very first draw (pinned: 0.2043598669115454).
        const rngC = new DeterministicRng(100);
        expect(rngC.random()).toBe(0.2043598669115454);
        expect(rngC.random()).not.toBe(seqA[1]);
        // getState/setState rewind replays the identical tail.
        const rngD = new DeterministicRng(7);
        const snap = rngD.getState();
        const tail1 = [rngD.random(), rngD.random(), rngD.random()];
        rngD.setState(snap);
        expect([rngD.random(), rngD.random(), rngD.random()]).toEqual(tail1);
        // next() is a true alias of random().
        const rngE = new DeterministicRng(7);
        rngE.setState(snap);
        expect([rngE.next(), rngE.next(), rngE.next()]).toEqual(tail1);
    });
});
