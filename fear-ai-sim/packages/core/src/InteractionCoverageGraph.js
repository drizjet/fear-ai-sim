/**
 * @file InteractionCoverageGraph.js — Sections CCIV-CCV: subsystem
 * interaction coverage.
 *
 * Nodes are packages/core/src modules. An edge between A and B exists when
 * one scanning root references both modules — by module base name OR by an
 * exported symbol alias (PascalCase / UPPER_SNAKE export names, so tests
 * that import { scoreSocialDecisions } still count for SocialBehaviorEffects):
 * - tested edge: a tests/ file (recursive) names both (joint test coverage).
 * - composed edge: a benchmarks/, runtime, protocol, example-host, or
 *   core-source file names both (runtime co-use without a joint test) —
 *   integration debt when no tested edge exists.
 * - bin/ excluded: the CLI imports every module, which would mark all
 *   pairs "composed" and drown real co-use signal in noise.
 * Alias attribution (anti-phantom rules, CCI-3):
 * - ambiguous symbols (exported by 2+ core modules) credit no module.
 * - an alias hit counts only with a core-attributable import naming the
 *   symbol from a core path; same-named exports from protocol/runtime
 *   (e.g. INTENT_CODES) must not credit core modules.
 * One-hop harness expansion: a test naming harness H also credits (H, M)
 * for core modules M referenced inside H's source — compositions
 * encapsulated in harnesses are exercised by their tests even when test
 * text names only the harness. Limit: only incident (H, M) pairs expand,
 * so unrelated (A, B) debt can never clear this way; constructor-only
 * tests may over-credit their harness's pairs (accepted, documented).
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

function listJsRecursive(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    const walk = (d) => {
        let entries = [];
        try {
            entries = readdirSync(d).sort();
        } catch {
            return;
        }
        for (const e of entries) {
            const full = join(d, e);
            let st = null;
            try {
                st = statSync(full);
            } catch {
                continue;
            }
            if (st.isDirectory()) {
                if (e === 'node_modules' || e === '.git') continue;
                walk(full);
            } else if (e.endsWith('.js') || e.endsWith('.mjs')) {
                out.push(full);
            }
        }
    };
    walk(dir);
    return out.sort();
}

function baseNameNoExt(path) {
    return basename(path, '.js').replace(/\.mjs$/, '');
}

function pairKey(a, b) {
    return a < b ? `${a} ${b}` : `${b} ${a}`;
}

function isCoreSource(spec) {
    if (typeof spec !== 'string') return false;
    const s = spec.replace(/\\/g, '/');
    // Barrel or file imports resolving into packages/core (any depth or
    // relative form). Protocol/runtime/example paths are NOT core: their
    // same-named exports (e.g. INTENT_CODES) must not credit core modules.
    return /(^|\/)packages\/core\/(index|src)(\/|$|\.)/.test(s)
        || /(^|\/)core\/(index|src)(\.js)?($|\?)/.test(s);
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect export symbol aliases per module: PascalCase and UPPER_SNAKE
 * exported names (classes, constants, enums). Short/generic identifiers
 * are excluded to avoid substring noise.
 */
function collectAliases(coreDir, moduleNames) {
    const aliasToModule = new Map(); // symbol -> module (unambiguous only)
    const claimants = new Map(); // symbol -> Set(modules exporting it)
    const declRe = /export\s+(?:const|class|function|async\s+function)\s+([A-Za-z0-9_]+)/g;
    const listRe = /export\s*\{([^}]*)\}/g;
    const isAlias = (s) => s.length >= 6 && (/[A-Z]/.test(s) || /_/.test(s));
    for (const name of moduleNames) {
        const file = join(coreDir, `${name}.js`);
        let text = '';
        try {
            text = readFileSync(file, 'utf8');
        } catch {
            continue;
        }
        const add = (sym, claimant) => {
            const clean = sym.trim().split(/\s+as\s+/).pop().trim();
            if (!isAlias(clean)) return;
            if (!claimants.has(clean)) claimants.set(clean, new Set());
            claimants.get(clean).add(claimant);
        };
        let m;
        while ((m = declRe.exec(text)) !== null) add(m[1], name);
        while ((m = listRe.exec(text)) !== null) {
            for (const part of m[1].split(',')) add(part, name);
        }
    }
    // Ambiguous symbols (claimed by 2+ modules, e.g. INTENT_CODES exported
    // by both ParallelBatchEvaluator and the protocol package) credit no
    // module: first-to-claim used to fabricate phantom compositions.
    const ambiguousAliases = [];
    for (const [sym, owners] of claimants) {
        if (owners.size === 1) aliasToModule.set(sym, [...owners][0]);
        else ambiguousAliases.push(sym);
    }
    return { aliasToModule, ambiguousAliases: ambiguousAliases.sort() };
}

export class InteractionCoverageGraph {
    /**
     * @param {string} repoRoot - absolute path to fear-ai-sim repo root
     */
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
        this.coreDir = join(repoRoot, 'packages', 'core', 'src');
        this.moduleNames = listJsRecursive(this.coreDir)
            .map(baseNameNoExt)
            .filter((n) => n !== 'batch_evaluator_worker');
        const { aliasToModule, ambiguousAliases } = collectAliases(this.coreDir, this.moduleNames);
        this.aliasToModule = aliasToModule;
        this.ambiguousAliases = ambiguousAliases;
    }

    referencedModules(text) {
        const found = new Set();
        for (const name of this.moduleNames) {
            if (text.includes(name)) found.add(name);
        }
        // Alias hits count only with a core-attributable import: a bare
        // textual mention may resolve to another package's same-named
        // export (e.g. INTENT_CODES from protocol, not core). Without an
        // import naming the symbol from a core path, the hit is skipped.
        const coreImports = new Set();
        const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
        const requireRe = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let im;
        while ((im = importRe.exec(text)) !== null) {
            if (!isCoreSource(im[2])) continue;
            for (const part of im[1].split(',')) coreImports.add(part.trim().split(/\s+as\s+/).pop().trim());
        }
        while ((im = requireRe.exec(text)) !== null) {
            if (!isCoreSource(im[2])) continue;
            for (const part of im[1].split(',')) coreImports.add(part.trim().split(/\s+as\s+/).pop().trim());
        }
        for (const [sym, mod] of this.aliasToModule) {
            if (found.has(mod)) continue;
            const re = new RegExp(`\\b${escapeRegExp(sym)}\\b`);
            if (re.test(text) && coreImports.has(sym)) found.add(mod);
        }
        return [...found].sort();
    }

    /**
     * Mine co-use edges across scanning roots.
     * @returns {{ nodes, testedEdges, composedEdges, debt, isolated }}
     */
    build() {
        const tested = new Map(); // pairKey -> sorted array of evidence files
        const composed = new Map();
        const touched = new Set();

        const shortName = (file) => relative(this.repoRoot, file).replace(/\\/g, '/');
        // touchOnly: count module touches without recording edges. Core-source
        // imports are compile-time coupling, not integration debt.
        const scanFiles = (files, store, touchOnly = false) => {
            for (const file of files) {
                let text = '';
                try {
                    text = readFileSync(file, 'utf8');
                } catch {
                    continue;
                }
                const refs = this.referencedModules(text);
                for (const r of refs) touched.add(r);
                if (touchOnly) continue;
                for (let i = 0; i < refs.length; i++) {
                    for (let j = i + 1; j < refs.length; j++) {
                        const key = pairKey(refs[i], refs[j]);
                        if (!store.has(key)) store.set(key, []);
                        const list = store.get(key);
                        const short = shortName(file);
                        if (!list.includes(short)) list.push(short);
                    }
                }
            }
        };

        const coreFiles = listJsRecursive(this.coreDir);
        // One-hop harness map: harness module -> core modules its source
        // references. A test naming only the harness still exercises the
        // composition encapsulated inside it, so those (harness, internal)
        // pairs count as tested-by-that-test. Approximation and its limit:
        // a test that never executes the composition (e.g. constructor-only)
        // over-credits; only incident (harness, internal) pairs expand, so
        // unrelated (A, B) debt can never be cleared this way.
        const coreRefs = new Map();
        for (const file of coreFiles) {
            let text = '';
            try {
                text = readFileSync(file, 'utf8');
            } catch {
                continue;
            }
            const self = baseNameNoExt(file);
            coreRefs.set(self, this.referencedModules(text).filter((r) => r !== self));
        }
        const expandedEvidence = [];
        const addTested = (a, b, short, via = null) => {
            const key = pairKey(a, b);
            if (!tested.has(key)) tested.set(key, []);
            const list = tested.get(key);
            if (!list.includes(short)) list.push(short);
            if (via) expandedEvidence.push({ pair: key.split(' '), file: short, via });
        };
        const scanTests = (files) => {
            for (const file of files) {
                let text = '';
                try {
                    text = readFileSync(file, 'utf8');
                } catch {
                    continue;
                }
                const refs = this.referencedModules(text);
                for (const r of refs) touched.add(r);
                const short = shortName(file);
                for (let i = 0; i < refs.length; i++) {
                    for (let j = i + 1; j < refs.length; j++) {
                        addTested(refs[i], refs[j], short);
                    }
                }
                for (const h of refs) {
                    for (const m of coreRefs.get(h) || []) {
                        touched.add(m);
                        addTested(h, m, short, h);
                    }
                }
            }
        };
        scanTests(listJsRecursive(join(this.repoRoot, 'tests')));
        scanFiles(listJsRecursive(join(this.repoRoot, 'benchmarks', 'behavioral-evaluation')), composed);
        scanFiles(coreFiles, composed, true);
        scanFiles(listJsRecursive(join(this.repoRoot, 'packages', 'runtime', 'src')), composed);
        scanFiles(listJsRecursive(join(this.repoRoot, 'packages', 'protocol', 'src')), composed);
        scanFiles(listJsRecursive(join(this.repoRoot, 'examples', 'reference-game')), composed);

        const debt = [];
        for (const [key, evidence] of [...composed.entries()].sort()) {
            if (!tested.has(key)) {
                const [a, b] = key.split(' ');
                debt.push({ pair: [a, b], composedIn: [...evidence].sort()[0] });
            }
        }
        // Rank debt by endpoint connectivity (most-connected first), then name.
        const degree = new Map();
        const bump = (key) => {
            for (const m of key.split(' ')) degree.set(m, (degree.get(m) || 0) + 1);
        };
        for (const k of tested.keys()) bump(k);
        for (const k of composed.keys()) bump(k);
        debt.sort((x, y) => {
            const dx = (degree.get(x.pair[0]) || 0) + (degree.get(x.pair[1]) || 0);
            const dy = (degree.get(y.pair[0]) || 0) + (degree.get(y.pair[1]) || 0);
            if (dy !== dx) return dy - dx;
            return x.pair.join(' ').localeCompare(y.pair.join(' '));
        });

        const isolated = this.moduleNames.filter((m) => !touched.has(m)).sort();

        return {
            nodes: this.moduleNames,
            nodeCount: this.moduleNames.length,
            testedEdges: [...tested.entries()].sort().map(([key, evidence]) => ({ pair: key.split(' '), evidence })),
            composedEdges: [...composed.entries()].sort().map(([key, evidence]) => ({ pair: key.split(' '), evidence })),
            debt,
            isolated,
            expandedEvidence: expandedEvidence.sort((a, b) => a.pair.join(' ').localeCompare(b.pair.join(' '))),
            ambiguousAliases: this.ambiguousAliases
        };
    }
}

export default InteractionCoverageGraph;
