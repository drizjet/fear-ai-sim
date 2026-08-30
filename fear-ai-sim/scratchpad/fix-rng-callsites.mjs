// One-shot fix: update every test callsite that calls
// `chooseRoamingDestination(...)` without an `rng` option.
// Audit rule: callers MUST be explicit; silent Math.random
// fallbacks hide non-determinism.
import { readFile, writeFile } from 'fs/promises';
import { glob } from 'fs/promises';

const files = [
    'tests/bandit-roaming.test.js',
    'tests/roaming-stay.test.js',
    'tests/roaming-learning.test.js',
    'tests/multi-target-raid.test.js',
    'tests/roaming-information-gain.test.js',
    'tests/exploration-vs-exploitation.test.js',
    'tests/roaming-inertia.test.js',
    'tests/roaming-faction.test.js',
    'tests/roaming-mode-profiles.test.js',
    'tests/roaming-scout.test.js',
];

let totalReplaced = 0;
for (const file of files) {
    const content = await readFile(file, 'utf-8');
    // Match `chooseRoamingDestination(..., { candidates: ... })` and
    // `chooseRoamingDestination(..., { candidates: ..., mode: ... })`
    // — but NOT ones that already have `rng:`. Use a negative
    // lookahead: don't add rng if the options object already
    // contains `rng:`.
    // The simplest pattern: any `chooseRoamingDestination(...)` that
    // does NOT have `rng:` in the call.
    // We do a multi-line match.
    const re = /chooseRoamingDestination\(([^()]*?)\)/g;
    const updated = content.replace(re, (match, args) => {
        // Don't touch calls that already have rng.
        if (/\brng\s*:/i.test(args)) return match;
        // Don't touch calls with no options object at all
        // (e.g. `chooseRoamingDestination(group)`). Those
        // need manual attention.
        if (!/\{/.test(args)) return match;
        // Inject `rng: deterministicRng(12345)` (we'll
        // import it at the top of the file if not already).
        // Insert before the closing `}` of the options.
        return `chooseRoamingDestination(${args.replace(/}\s*$/, ', rng: deterministicRng(12345) })')}`;
    });
    if (updated !== content) {
        const replaced = (content.match(re) || []).length - (updated.match(re) || []).length;
        totalReplaced += replaced;
        // Ensure deterministicRng is imported. Many of these
        // tests use `import { deterministicRng } from '...'` or
        // already have it. Add the import if not present.
        let withImport = updated;
        if (!/from\s+['"][^'"]*roaming['"]/.test(updated) && !/deterministicRng/.test(updated)) {
            // Add an import line. Find the last `import` line.
            const lines = withImport.split('\n');
            let lastImport = -1;
            for (let i = 0; i < lines.length; i += 1) {
                if (/^import /.test(lines[i])) lastImport = i;
            }
            if (lastImport >= 0) {
                lines.splice(lastImport + 1, 0, "import { deterministicRng } from '../roaming.js';");
                withImport = lines.join('\n');
            }
        }
        await writeFile(file, withImport, 'utf-8');
        console.log(`updated ${file} (${replaced} calls replaced)`);
    }
}
console.log(`total replacements: ${totalReplaced}`);
