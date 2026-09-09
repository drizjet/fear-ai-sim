/**
 * @file InteractionCoverageGraph.js — Sections CCIV-CCV: subsystem
 * interaction coverage.
 *
 * Nodes are packages/core/src modules. An edge between A and B exists when
 * one scanning root references both modules — by module base name OR by any
 * exported symbol alias (PascalCase / UPPER_SNAKE export names, so tests
 * that import { scoreSocialDecisions } still count for SocialBehaviorEffects):
 * - tested edge: a tests/ file (recursive) names both (joint test coverage).
 * - composed edge: a benchmarks/, runtime, protocol, example-host, or
 *   core-source file names both (runtime co-use without a joint test) —
 *   integration debt when no tested edge exists.
 * - bin/ excluded: the CLI imports every module, which would mark all
 *   pairs "composed" and drown real co-use signal in noise.
 *
 * Fully deterministic: directory scans sorted, pairs canonicalized,
 * rankings by (debt rank, name). Read-only; never executes scanned code.
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

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect export symbol aliases per module: PascalCase and UPPER_SNAKE
 * exported names (classes, constants, enums). Short/generic identifiers
 * are excluded to avoid substring noise.
 */
function collectAliases(coreDir, moduleNames) {
    const aliasToModule = new Map(); // symbol -> module
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
        const add = (sym) => {
            const clean = sym.trim().split(/\s+as\s+/).pop().trim();
            if (isAlias(clean) && !aliasToModule.has(clean)) {
                aliasToModule.set(clean, name);
            }
        };
        let m;
        while ((m = declRe.exec(text)) !== null) add(m[1]);
        while ((m = listRe.exec(text)) !== null) {
            for (const part of m[1].split(',')) add(part);
        }
    }
    return aliasToModule;
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
        this.aliasToModule = collectAliases(this.coreDir, this.moduleNames);
    }

    referencedModules(text) {
        const found = new Set();
        for (const name of this.moduleNames) {
            if (text.includes(name)) found.add(name);
        }
        for (const [sym, mod] of this.aliasToModule) {
            if (found.has(mod)) continue;
            const re = new RegExp(`\\b${escapeRegExp(sym)}\\b`);
            if (re.test(text)) found.add(mod);
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
        scanFiles(listJsRecursive(join(this.repoRoot, 'tests')), tested);
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
            isolated
        };
    }
}

export default InteractionCoverageGraph;
