/**
 * @file interaction-coverage.test.js
 *
 * Sections CCIV-CCV: interaction coverage graph mines real co-use edges,
 * is deterministic, and honestly reports debt.
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InteractionCoverageGraph } from '../packages/core/src/InteractionCoverageGraph.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function build() {
    return new InteractionCoverageGraph(ROOT).build();
}

describe('Sections CCIV-CCV: InteractionCoverageGraph', () => {
    it('1. Mines nodes from core src with tested and composed edges', () => {
        const r = build();
        expect(r.nodeCount).toBeGreaterThan(50);
        expect(r.testedEdges.length).toBeGreaterThan(20);
        expect(r.composedEdges.length).toBeGreaterThan(0);
    });

    it('2. Known tested edge present with real evidence file', () => {
        const r = build();
        const edge = r.testedEdges.find((e) =>
            e.pair.includes('MemoryRelevanceScorer') && e.pair.includes('LayeredMemorySystem'));
        expect(edge).toBeDefined();
        expect(edge.evidence).toContain('tests/memory-relevance-pathology.test.js');
    });

    it('3. Build deterministic across repeated runs', () => {
        expect(build()).toEqual(build());
    });

    it('4. Debt pairs (if any) are genuinely untested and coherent', () => {
        const r = build();
        const testedKeys = new Set(r.testedEdges.map((e) => e.pair.join(' ')));
        for (const d of r.debt) {
            expect(testedKeys.has(d.pair.join(' '))).toBe(false);
            expect(d.composedIn).toMatch(/\.m?js$/);
        }
        expect(r.testedEdges.length + r.debt.length).toBeGreaterThan(0);
    });

    it('5. Isolated list contains only modules with no reference anywhere', () => {
        const r = build();
        for (const name of r.isolated) {
            expect(r.nodes).toContain(name);
        }
        // Former false positives now resolve via export-symbol aliases and
        // recursive consumer scans: ComparativeBaselines (baseline agent
        // classes), SocialBehaviorEffects (scoring functions), IntentResolver
        // and PsychoacousticSynthesizer (AffectiveAgent composition),
        // PacingDirector (runtime + conformance), DeclarativeScenarioEngine
        // (ScenarioStepper composition).
        for (const name of ['ComparativeBaselines', 'SocialBehaviorEffects', 'IntentResolver', 'PsychoacousticSynthesizer', 'PacingDirector', 'DeclarativeScenarioEngine']) {
            expect(r.isolated).not.toContain(name);
        }
        for (const e of r.testedEdges) {
            expect(e.evidence).not.toContain('InteractionCoverageGraph');
        }
    });
    it('7. Cross-package alias collision no longer fabricates debt', () => {
        const r = build();
        const phantom = r.debt.find((d) =>
            d.pair.includes('ParallelBatchEvaluator') && d.pair.includes('ValleyChainScenario'));
        expect(phantom).toBeUndefined();
        // Unit: INTENT_CODES imported from protocol credits no core module.
        const g = new InteractionCoverageGraph(ROOT);
        const refs = g.referencedModules(
            "import { INTENT_CODES } from '../../protocol/index.js';\nconst x = INTENT_CODES.FLEE;\n");
        expect(refs).not.toContain('ParallelBatchEvaluator');
    });

    it('8. Harness-encapsulated compositions count as tested (one-hop expansion)', () => {
        const r = build();
        const edges = r.testedEdges.filter((e) => e.pair.includes('InteractionMutationHarness'));
        expect(edges.length).toBeGreaterThanOrEqual(5);
        const via = r.expandedEvidence.filter((e) => e.via === 'InteractionMutationHarness');
        expect(via.length).toBeGreaterThan(0);
        expect(via.some((e) => e.file === 'tests/interaction-mutations.test.js')).toBe(true);
    });
    it('9. Ambiguous symbols credit neither claimant without attribution', () => {
        const r = build();
        expect(r.ambiguousAliases).toContain('COMMODITY_TYPES');
        // COMMODITY_TYPES is exported by both CivilizationSimulationSystem
        // and EconomicFeedbackSystem: a bare mention credits neither.
        const g = new InteractionCoverageGraph(ROOT);
        const refs = g.referencedModules('const x = COMMODITY_TYPES.FOOD;\n');
        expect(refs).not.toContain('CivilizationSimulationSystem');
        expect(refs).not.toContain('EconomicFeedbackSystem');
    });

    it('10. Alias credits the module only with a core-attributable import', () => {
        const g = new InteractionCoverageGraph(ROOT);
        const withCore = g.referencedModules(
            "import { DEFAULT_CASCADE_CONFIG } from '../packages/core/index.js';\nconst c = DEFAULT_CASCADE_CONFIG;\n");
        expect(withCore).toContain('MisinformationCascadeHarness');
        const viaProtocol = g.referencedModules(
            "import { DEFAULT_CASCADE_CONFIG } from '../../protocol/index.js';\nconst c = DEFAULT_CASCADE_CONFIG;\n");
        expect(viaProtocol).not.toContain('MisinformationCascadeHarness');
    });
});

describe('Section CLXXXIII tooling: CLI dispatch lint', () => {
    it('6. Dispatch lint passes with zero duplicate case labels', () => {
        const out = execFileSync('node', [join(ROOT, 'scripts', 'cli-dispatch-lint.mjs')], { encoding: 'utf8' });
        expect(out).toContain('CLEAN');
        expect(out).toMatch(/0 duplicates/);
    });
});
