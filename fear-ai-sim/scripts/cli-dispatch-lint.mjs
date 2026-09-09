#!/usr/bin/env node
/** CLI dispatch lint (Sections CLXXXIII-CCV tooling).
 * Fails on duplicate `case '...':` labels in bin/fear-ai.js — duplicate
 * labels silently shadow earlier handlers (first match wins), which has
 * twice broken incumbent commands ('frontier-valley', 'memory').
 * Usage: node scripts/cli-dispatch-lint.mjs [--json]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(root, 'bin', 'fear-ai.js');
const text = readFileSync(cliPath, 'utf8');

const re = /case\s+'([^']+)'\s*:/g;
const seen = new Map();
let m;
while ((m = re.exec(text)) !== null) {
    const label = m[1];
    if (!seen.has(label)) seen.set(label, []);
    seen.get(label).push(m.index);
}

const duplicates = [...seen.entries()]
    .filter(([, locs]) => locs.length > 1)
    .map(([label, locs]) => ({ label, occurrences: locs.length }))
    .sort((a, b) => a.label.localeCompare(b.label));

const report = { cli: 'bin/fear-ai.js', labels: seen.size, duplicates, clean: duplicates.length === 0 };

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
} else if (report.clean) {
    console.log(`CLI dispatch lint: CLEAN (${report.labels} unique case labels, 0 duplicates)`);
} else {
    console.log(`CLI dispatch lint: ${duplicates.length} DUPLICATE label(s) — later cases shadow earlier handlers:`);
    for (const d of duplicates) console.log(`  • '${d.label}' x${d.occurrences}`);
}

process.exit(report.clean ? 0 : 1);
