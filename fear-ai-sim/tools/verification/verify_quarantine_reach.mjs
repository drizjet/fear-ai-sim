/**
 * tools/verification/verify_quarantine_reach.mjs
 *
 * Re-establishes the quarantine negative invariant as a standalone probe.
 *
 * The manifest `config/quarantined-modules.json` states that "the
 * production-reach audit enforces this list: production code MUST NOT
 * import any module listed here". That enforcement lived in
 * `tests/quarantine.test.js`, which was retired with the suite era, leaving
 * the manifest's sentence unenforced. This probe restores the retired
 * semantics under the standalone-probe rules (no test framework):
 *
 *   1. The manifest is readable, non-empty, and every entry is a real file.
 *   2. Starting from the five live entry points (`closed-world.js`,
 *      `simulation.js`, `brain.js`, `agent.js`, `learningagent.js`), a walk
 *      over sibling relative imports (`from './x'`) reaches NO quarantined
 *      module. That is the invariant: production does not import them.
 *   3. The reachable set and each quarantined module's direct root-level
 *      importers are printed for the audit trail (the retired test's third
 *      case was documentation too, not a claim about coverage).
 *
 * Faithful to the retired walk: the same import regex
 * `from\s+['"]\.\/([\w-]+)(?:\.js)?['"]` over bare sibling names, bounded
 * by the visited set. The retired version also carried a `maxDepth = 6`
 * parameter whose guard (`if (maxDepth <= 0) continue;`) never triggered
 * because the value was never decremented — a dead clause — so this probe
 * drops it rather than preserving it; the walk is bounded by the visited
 * set, and reaching a module through a deeper chain still counts as
 * reachable, which is the stricter reading of the invariant.
 *
 * The manifest is the declared intent; this probe enforces the invariant.
 * A future refactor that imports a quarantined module fails here, which is
 * the point: the list is executable intent, not a graveyard note.
 *
 * Deterministic: reads files from disk only; no wall-clock reads, no
 * network, no host mutation, no test framework (Hard Rule 9).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const ENTRY_POINTS = ['closed-world.js', 'simulation.js', 'brain.js', 'agent.js', 'learningagent.js'];
const IMPORT_RE = /from\s+['"]\.\/([\w-]+)(?:\.js)?['"]/g;

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

function importsOf(source) {
    return [...source.matchAll(IMPORT_RE)].map(match => match[1] + '.js');
}

function walkReachable(entryFile) {
    const visited = new Set();
    const queue = [entryFile];
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        const full = join(ROOT, current);
        if (!existsSync(full)) continue;
        for (const next of importsOf(readFileSync(full, 'utf-8'))) queue.push(next);
    }
    return visited;
}

console.log('============================================================');
console.log('VERIFY QUARANTINE REACH (production does not import quarantined modules)');
console.log('============================================================\n');

// ---------------------------------------------------------------- Section A
console.log('--- A. The manifest is readable, non-empty, and every entry is a real file ---');

const manifestPath = join(ROOT, 'config', 'quarantined-modules.json');
assert(existsSync(manifestPath), `Missing manifest: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
assert(Array.isArray(manifest.modules) && manifest.modules.length > 0,
    'The manifest must carry a non-empty modules array.');
const quarantined = manifest.modules.map(entry => entry.module);
for (const entry of manifest.modules) {
    assert(typeof entry.module === 'string' && entry.module.length > 0,
        `Manifest entry without a module name: ${JSON.stringify(entry)}`);
}
for (const module of quarantined) {
    assert(existsSync(join(ROOT, module)),
        `Quarantined module does not exist on disk: ${module}`);
}
console.log(`  * manifest: ${quarantined.length} quarantined modules, all present on disk`);

// ---------------------------------------------------------------- Section B
console.log('\n--- B. Production reach: the five entry points do not reach any quarantined module ---');

for (const entry of ENTRY_POINTS) {
    assert(existsSync(join(ROOT, entry)), `Entry point does not exist on disk: ${entry}`);
}
const reachable = new Set();
for (const entry of ENTRY_POINTS) {
    for (const file of walkReachable(entry)) reachable.add(file);
}
assert(reachable.size >= ENTRY_POINTS.length,
    `The reach walk returned ${reachable.size} files; at least the entry points themselves are expected.`);
assert(ENTRY_POINTS.every(entry => reachable.has(entry)),
    'Every live entry point must appear in its own reachable set.');
for (const module of quarantined) {
    assert(!reachable.has(module),
        `Quarantined module is reachable from production: ${module} (the manifest says production must not import it)`);
}
console.log(`  * reachable set: ${reachable.size} modules; none of the ${quarantined.length} quarantined modules is reachable`);

// ---------------------------------------------------------------- Section C
console.log('\n--- C. Audit trail: reachable set and direct importers of each quarantined module ---');

const rootFiles = readdirSync(ROOT).filter(name => name.endsWith('.js'));
const importerMap = new Map(quarantined.map(module => [module, new Set()]));
for (const file of rootFiles) {
    for (const imported of importsOf(readFileSync(join(ROOT, file), 'utf-8'))) {
        if (importerMap.has(imported) && file !== imported) importerMap.get(imported).add(file);
    }
}
assert([...importerMap.values()].every(list => list instanceof Set),
    'The direct-importer scan must produce one list per quarantined module.');
console.log(`  * live reachable set: ${[...reachable].sort().join(', ')}`);
for (const module of quarantined) {
    const importers = [...importerMap.get(module)].sort();
    console.log(`  * ${module}: ${importers.length === 0 ? 'no root-level importer' : `root-level importers: ${importers.join(', ')}`}`);
}

console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} quarantine-reach assertions passed.`);
console.log('============================================================');
