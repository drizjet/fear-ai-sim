#!/usr/bin/env node
// Every rule in `doc-guards.mjs` exists because a real failure got past the retired corpus — and the
// campaign's own recurring defect was guards that had only ever been exercised PASSING. This proves
// each rule CAN fail: it builds a throwaway tree holding copies of the files the rules read, injects
// that rule's canonical drift into the copy, runs `docProblems()` from the copy, and requires the
// rule's own message. Nothing in the working tree is touched, so it is safe to run anywhere.
//
//   node tools/guard-selftest.mjs     # or: npm run gate:prove
//
// The copy carries a `.git` gitdir pointer so `origin/master` resolves exactly as CI's full checkout
// does; where this checkout has no `origin/master`, the SOURCE_ABSENT blob case is skipped (not
// silently passed) rather than failing a guard that was never given a remote.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = ['societycore.js', 'socialcore.js', 'utilitycore.js', 'decisioncore.js', 'interactioncore.js', 'advisorygate.js', 'macrocore.js', 'randomcore.js'];
const FILES = [
    ...MODULES,
    'README.md', 'completion-ledger.md', 'package.json',
    '.github/workflows/ci.yml',
    'tools/doc-guards.mjs',
    // Two files the completion ledger cites only for their existence, so the copy matches the tree.
    '.agents/fear-ai-autopilot.mjs', 'persistence-probe.txt',
    'legacy/PROVENANCE.md',
    ...fs.readdirSync(path.join(ROOT, 'legacy')).map(name => `legacy/${name}`),
    ...fs.readdirSync(path.join(ROOT, 'docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`),
];

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-selftest-'));
const pristine = new Map();
for (const rel of FILES) {
    const target = path.join(temp, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), target);
    pristine.set(rel, fs.readFileSync(target, 'utf8'));
}
fs.writeFileSync(path.join(temp, '.git'), `gitdir: ${ROOT.replace(/\\/g, '/')}/.git\n`);
fs.writeFileSync(path.join(temp, '__probe.mjs'), "import { docProblems } from './tools/doc-guards.mjs';\nconsole.log(JSON.stringify(docProblems()));\n");

const runGuard = () => {
    const result = spawnSync(process.execPath, [path.join(temp, '__probe.mjs')], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`the guard threw: ${result.stderr}`);
    return JSON.parse(result.stdout);
};
const restore = () => {
    for (const [rel, text] of pristine) fs.writeFileSync(path.join(temp, rel), text);
    if (fs.existsSync(path.join(temp, 'vrsystem.js'))) fs.rmSync(path.join(temp, 'vrsystem.js'));
};

const upstream = spawnSync('git', ['rev-parse', '--verify', 'origin/master'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).status === 0;
const flipHex = (hex) => `${hex.slice(0, -1)}${hex.endsWith('f') ? 'e' : 'f'}`;

// Each case mutates the copy and names the substring the rule must emit. `extra` writes a file the
// mutation needs (the extraction case); `skip` marks the one case that needs a remote.
const cases = [
    ['ledgerCitations', { 'completion-ledger.md': t => t.replace('| Utility/affordances | IMPLEMENTED_AND_VERIFIED | ', '| Utility/affordances | IMPLEMENTED_AND_VERIFIED | `ghost-module.js` ') }, 'cites the missing file ghost-module.js'],
    ['suiteReferences', { 'README.md': t => t.replace('Orientation for this repository.', 'Orientation for this repository (see `ghost-suite.test.js`).') }, 'cites ghost-suite.test.js, which is neither on disk nor registered'],
    ['provenanceHashes', { 'legacy/PROVENANCE.md': t => t.replace(/[0-9a-f]{64}/, flipHex) }, 'legacy/PROVENANCE.md pins'],
    ['hiddenTruthInert', { 'macrocore.js': t => `${t}\n// hidden route truth field: actualDanger\n` }, 'names the hidden-truth field'],
    ['marketConservation', { 'societycore.js': t => t.replace('destinationMarket.receive(trip.good, trip.quantity);', 'destinationMarket.receive(trip.good, trip.quantity * .9);') }, 'mass must survive the trip'],
    ['timeOwnership', { 'macrocore.js': t => `${t}\nconst wallClockProbe = Date.now();\n` }, 'references a wall-clock or global random source'],
    ['eventGraphIntegrity', { 'societycore.js': t => t.replace('this.events.some(e => e.id === record.id)', "this.events.some(e => e.id === 'never-matches')") }, 'a duplicate event id was accepted'],
    ['factionLootConservation', { 'societycore.js': t => t.replace('winnerFaction.loot = num(winnerFaction.loot, 0) + stolen;', 'winnerFaction.loot = num(winnerFaction.loot, 0) + stolen * 2;') }, 'spoils transfer between owners'],
    ['settlementResourceLedger', { 'societycore.js': t => t.replace('const resourceGain = settlement ? Math.min(requestedResourceGain, Math.max(0, settlement.resourceCapacity - settlement.resources)) : 0;', 'const resourceGain = settlement ? requestedResourceGain : 0;') }, 'a gain may not exceed capacity'],
    ['autonomousDeploy: cohort bound', { 'societycore.js': t => t.replace('if (units.length >= cap) {', 'if (units.length >= cap + 99) {') }, 'the cohort bound must hold'],
    ['autonomousDeploy: lineage', { 'societycore.js': t => t.replace('parentId: veteran?.id ?? null, location:', 'parentId: null, location:') }, 'a later levy is not drawn off a living veteran'],
    ['autonomousDeploy: parentage', { 'societycore.js': t => t.replace('}, recruit);', '}, tick);') }, 'a self-raised actor was not deployed through the recruit tail'],
    ['autonomousDeploy: HOLD gate', { 'societycore.js': t => t.replace("decision.selected === 'HOLD'", 'false') }, 'the production decision must gate the levy'],
    ['autonomousDeploy: save/load', { 'societycore.js': t => t.replace('if (json.combat) society.combat.loadState', 'if (false && json.combat) society.combat.loadState') }, 'does not survive save/load'],
    ['autonomousDeploy: determinism', { 'societycore.js': t => t.replace('location: veteran?.location ?? null', 'location: veteran?.location ?? null, maxHp: 100 + (SocietyCore._flaky = (SocietyCore._flaky || 0) + 1)') }, 'two identical seeded worlds diverged'],
    ['sourceAbsentRows: row agreement', { 'docs/SOURCE_ABSENT_RECONCILIATION.md': t => t.replace('| PRESENT | VR/biofeedback |', '| PRESENT | VR/biofeedback-ghost |') }, 'which is not a SOURCE_ABSENT row in completion-ledger.md'],
    ['sourceAbsentRows: extraction tripwire', {}, 'a manifest source exists in this checkout', { 'vrsystem.js': '// extracted without the lockstep manifest/ledger update\n' }],
    ['sourceAbsentRows: blob re-resolution', { 'docs/SOURCE_ABSENT_RECONCILIATION.md': t => t.replace(/[0-9a-f]{64}/, flipHex) }, 'but the manifest pins', null, !upstream],
    ['nextResponsibility', { 'docs/CAMPAIGN_STATE.md': t => t.replace(/(## Next responsibility[\s\S]*?`)(RESP-[A-Z0-9-]+)/, '$1RESP-GHOST-001') }, 'the campaign state names RESP-GHOST-001 as next while the work ledger selects'],
    ['ciWiring: test flag', { 'package.json': t => t.replace(' --passWithNoTests', '') }, 'lost `--passWithNoTests`'],
    ['ciWiring: prove step', { '.github/workflows/ci.yml': t => t.replace('      - run: npm run gate:prove\n', '') }, 'no longer proves the rules can fail'],
];

let failures = 0;
try {
    const baseline = runGuard();
    if (baseline.length) {
        failures += 1;
        console.error(`FAIL baseline: the untouched copy already reports ${baseline.length} problem(s):\n  ${baseline.join('\n  ')}`);
    }
    for (const [label, mutations, expected, extra, skip] of cases) {
        if (skip) { console.log(`SKIP ${label} (no origin/master in this checkout)`); continue; }
        restore();
        for (const [rel, mutate] of Object.entries(mutations)) fs.writeFileSync(path.join(temp, rel), mutate(pristine.get(rel)));
        for (const [rel, content] of Object.entries(extra ?? {})) fs.writeFileSync(path.join(temp, rel), content);
        const problems = runGuard();
        if (problems.some(problem => problem.includes(expected))) console.log(`PASS ${label}`);
        else {
            failures += 1;
            console.error(`FAIL ${label}: expected a problem containing "${expected}", got:\n  ${problems.join('\n  ') || '(none)'}`);
        }
    }
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
console.log(failures ? `guard selftest: ${failures} failure(s)` : `guard selftest: every rule can fail (${cases.filter(entry => !entry[4]).length} proven)`);
process.exit(failures ? 1 : 0);
