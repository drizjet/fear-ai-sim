#!/usr/bin/env node
/**
 * K5: Runtime consumers should import their own named core dependencies without
 * evaluating the entire public core barrel on normal import. The public barrel
 * must still re-export the exact same symbols for external consumers.
 */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const app = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const coreRoot = join(app, 'packages/core');
const simSource = readFileSync(join(app, 'packages/runtime/src/RuntimeSimulation.js'), 'utf8');
const serverSource = readFileSync(join(app, 'packages/runtime/src/FearServer.js'), 'utf8');
const barrelSource = readFileSync(join(coreRoot, 'index.js'), 'utf8');

function assert(ok, reason) {
    if (!ok) throw new Error('K5 runtime/core import boundary: ' + reason);
}

function imports(source) {
    const found = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.\.\/\.\.\/core\/[^'"]+)['"]/g)];
    return found.flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean));
}
const simSymbols = imports(simSource);
const serverSymbols = imports(serverSource);
assert(simSymbols.length === 28, 'RuntimeSimulation needs exactly its 28 public core names (review this check if the API grows)');
assert(serverSymbols.length === 6, 'FearServer needs exactly its 6 public core names (review this check if the API grows)');
assert(!/from\s*['"]\.\.\/\.\.\/core\/index\.js['"]/.test(simSource + '\n' + serverSource),
    'runtime has regressed to an eager public-barrel import');

const loaded = new Set();
if (typeof registerHooks === 'function') {
    registerHooks({
        load(url, ctx, nextLoad) {
            if (url.includes('/packages/core/')) loaded.add(url);
            return nextLoad(url, ctx);
        }
    });
}
const simulation = await import(pathToFileURL(join(app, 'packages/runtime/src/RuntimeSimulation.js')).href);
assert(typeof simulation.RuntimeSimulation === 'function', 'simulation constructor is exported');
const simCount = loaded.size;
const server = await import(pathToFileURL(join(app, 'packages/runtime/src/FearServer.js')).href);
assert(typeof server.FearServer === 'function', 'server constructor is exported');
const serverCount = loaded.size;
if (typeof registerHooks === 'function') {
    assert(simCount <= 24, 'simulation evaluated too many core modules: ' + simCount);
    assert(serverCount <= 32, 'server evaluated too many core modules: ' + serverCount);
    assert(![...loaded].some(u => u.endsWith('/packages/core/index.js')), 'public core barrel evaluated eagerly');
}

const publicCore = await import(pathToFileURL(join(coreRoot, 'index.js')).href);
const exported = new Map();
for (const m of barrelSource.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"](\.\/src\/[^'"]+)['"]/g)) {
    for (const entry of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
        const [local, alias] = entry.split(/\s+as\s+/);
        const name = (alias || local).trim();
        assert(!exported.has(name), 'duplicate public symbol: ' + name);
        exported.set(name, { file: m[2], local: local.trim() });
    }
}
assert(exported.size === Object.keys(publicCore).length && exported.size >= 300,
    'public core namespace differs from declared reexports');

let identityChecks = 0;
for (const name of new Set([...simSymbols, ...serverSymbols])) {
    const mapping = exported.get(name);
    assert(mapping, 'unmapped runtime-bound symbol: ' + name);
    const direct = await import(pathToFileURL(join(coreRoot, mapping.file)).href);
    assert(publicCore[name] === direct[mapping.local], 'public core symbol identity differs: ' + name);
    identityChecks += 1;
}

console.log('SUCCESS: runtime core import boundary, module-load budgets, and ' + identityChecks +
    ' public runtime symbol identities verified (sim=' + simCount + ', server=' + serverCount +
    ', public names=' + exported.size + ').');
