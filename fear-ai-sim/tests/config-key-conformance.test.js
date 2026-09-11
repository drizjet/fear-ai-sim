/**
 * NEXT-86: config-key conformance. Constructors spread unknown keys
 * silently, so a typo'd or renamed option (rngSeed twice: NEXT-82/83)
 * deploys a dead knob with zero feedback. This test replays the audit:
 * every literal key at each `new System({ ... })` call site must exist
 * in that system's DEFAULT_*_CONFIG, or the test names the offender.
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
    ['WorldSimulationSystem', 'packages/core/src/WorldSimulationSystem.js', 'DEFAULT_WORLD_CONFIG'],
    ['RelationshipTensorSystem', 'packages/core/src/RelationshipTensorSystem.js', 'DEFAULT_RELATIONSHIP_CONFIG'],
    ['FactionSystem', 'packages/core/src/FactionSystem.js', 'DEFAULT_FACTION_CONFIG'],
    ['CivilizationSimulationSystem', 'packages/core/src/CivilizationSimulationSystem.js', 'DEFAULT_CIV_CONFIG'],
    ['AnticipatoryFearEngine', 'packages/core/src/AnticipatoryFearEngine.js', 'DEFAULT_DREAD_CONFIG'],
    ['InformationPropagationEngine', 'packages/core/src/InformationPropagationEngine.js', 'DEFAULT_PROPAGATION_CONFIG'],
    ['LayeredMemorySystem', 'packages/core/src/LayeredMemorySystem.js', 'DEFAULT_MEMORY_CONFIG'],
    ['GroupContagionSystem', 'packages/core/src/GroupContagionSystem.js', 'DEFAULT_GROUP_CONFIG'],
    ['TradeDependencyEngine', 'packages/core/src/TradeDependencyEngine.js', 'DEFAULT_DEPENDENCY_CONFIG'],
    ['RetaliationModel', 'packages/core/src/RetaliationModel.js', 'DEFAULT_RETALIATION_CONFIG'],
    ['RoamingBandSystem', 'packages/core/src/RoamingBandSystem.js', 'DEFAULT_BAND_CONFIG'],
];

function listJs(dir, out = []) {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) {
            if (e !== 'node_modules') listJs(p, out);
        } else if (p.endsWith('.js')) out.push(p);
    }
    return out;
}

function topKeys(src, openIdx) {
    const keys = [];
    let i = openIdx + 1;
    let depth = 1;
    let q = null;
    let lineComment = false;
    let blockComment = false;
    let tok = '';
    while (i < src.length && depth > 0) {
        const c = src[i];
        const n = src[i + 1];
        if (lineComment) {
            if (c === '\n') lineComment = false;
            i++;
            continue;
        }
        if (blockComment) {
            if (c === '*' && n === '/') {
                blockComment = false;
                i += 2;
                continue;
            }
            i++;
            continue;
        }
        if (q) {
            if (c === '\\') {
                i += 2;
                continue;
            }
            if (c === q) q = null;
            i++;
            continue;
        }
        if (c === '/' && n === '/') {
            lineComment = true;
            i += 2;
            continue;
        }
        if (c === '/' && n === '*') {
            blockComment = true;
            i += 2;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            q = c;
            i++;
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) break;
        } else if (depth === 1) {
            if (/[A-Za-z0-9_$]/.test(c)) tok += c;
            else {
                let j = i;
                while (src[j] === ' ' || src[j] === '\t' || src[j] === '\n') j++;
                if (src[j] === ':' && tok) keys.push(tok);
                tok = '';
            }
        }
        i++;
    }
    return keys;
}

describe('NEXT-86: config-key conformance', () => {
    test('1. Every literal call-site key exists in its system defaults', async () => {
        const files = [
            ...listJs(join(ROOT, 'packages/core/src')),
            ...listJs(join(ROOT, 'tests')),
            ...listJs(join(ROOT, 'benchmarks/behavioral-evaluation')),
        ];
        const offenders = [];
        for (const [cls, mod, def] of TARGETS) {
            const m = await import(join(ROOT, mod));
            const defaults = new Set(Object.keys(m[def] ?? {}));
            const re = new RegExp(`new\\s+${cls}\\s*\\(`, 'g');
            for (const f of files) {
                const src = readFileSync(f, 'utf8');
                let mt;
                while ((mt = re.exec(src))) {
                    let j = mt.index + mt[0].length;
                    while (j < src.length && /\s/.test(src[j])) j++;
                    if (src[j] !== '{') continue;
                    const line = src.slice(0, mt.index).split('\n').length;
                    for (const key of topKeys(src, j)) {
                        if (!defaults.has(key)) {
                            offenders.push(`${cls} '${key}' at ${f}:${line}`);
                        }
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
