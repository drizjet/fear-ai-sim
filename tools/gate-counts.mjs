#!/usr/bin/env node
// RESP-GATE-COUNT-DERIVATION-001 — the gate counts in the four orientation docs are DERIVED from the
// test runner, not hand-maintained. `npm test` reports them; this tool runs the same command with
// jest's machine-readable reporter, writes what it saw into docs/GATE_COUNTS.json (the copy a test
// can read back offline), and rewrites the LIVE gate sentences in README.md,
// docs/CAMPAIGN_STATE.md, docs/FEAR_AI_GLOBAL_WORK_LEDGER.md and
// docs/IMPLEMENTATION_STATUS_2026-08-26.md.
//
//   node tools/gate-counts.mjs           # re-derive and rewrite the docs in place (npm run gate:sync)
//   node tools/gate-counts.mjs --check   # re-derive and FAIL if anything is stale (npm run gate:check)
//
// Why it exists: a hand-copied count drifted into print — the combat row's negative-control count
// reached four documents as "6/6" when the campaign had actually killed 9/9 mutants, and nothing in
// the repository could tell, because only the suite count was guarded. The count a test can verify
// offline is the number of cases the runner executes, so that is the number this tool owns; counts
// that are NOT derivable from a test run (how many mutants a campaign killed) stay prose and are
// deliberately out of scope.
//
// Three safety properties, each learned from a failure in this tool's own drafts:
//   1. Gate sites are ANCHORED. A blanket "N suites / M tests" rewrite silently rewrote frozen
//      history — this repository's audit narrative records the gate as it stood on the day
//      ("142 suites / 405 tests", "144 suites / 421 tests") — so a site that does not match its
//      anchor EXACTLY ONCE is a hard error: a reworded live gate fails loudly instead of quietly
//      stepping around the number it was supposed to own.
//   2. Citations are attributed, not pattern-matched. "`tests/x.test.js` 9/9 with 12/12 negative
//      controls" must read 9 as cases (the runner knows that) and leave 12 alone (it does not), while
//      "`a.test.js`, `b.test.js` (3/3)" must attach 3 to b — see `citationMismatches`, which is pure
//      and unit-tested in `tests/gate-counts-derivation.test.js`.
//   3. The artifact is order-stable, so a re-run of an unchanged tree reports no change.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = 'docs/GATE_COUNTS.json';

// The live gate sentences, anchored to the exact wording the docs use today.
const gateSites = gate => [
    { doc: 'README.md', label: 'current-gate banner', pattern: /\*\*Current gate: \d+ suites \/ \d+ tests passing\*\*/g, replacement: () => `**Current gate: ${gate.suites} suites / ${gate.tests} tests passing**` },
    { doc: 'README.md', label: 'npm test comment', pattern: /# full gate: \d+ suites \/ \d+ tests \(ESM/g, replacement: () => `# full gate: ${gate.suites} suites / ${gate.tests} tests (ESM` },
    { doc: 'docs/CAMPAIGN_STATE.md', label: 'current automated suite', pattern: /- Current automated suite: \*\*\d+ suites \/ \d+ tests passing\*\*/g, replacement: () => `- Current automated suite: **${gate.suites} suites / ${gate.tests} tests passing**` },
    { doc: 'docs/CAMPAIGN_STATE.md', label: 'full gate line', pattern: /- Full gate: \*\*\d+\/\d+ suites, \d+\/\d+ tests passing\*\*/g, replacement: () => `- Full gate: **${gate.suites}/${gate.suites} suites, ${gate.tests}/${gate.tests} tests passing**` },
    { doc: 'docs/FEAR_AI_GLOBAL_WORK_LEDGER.md', label: 'CURRENT_TEST_GATE', pattern: /`CURRENT_TEST_GATE`: \d+ suites \/ \d+ tests green/g, replacement: () => `\`CURRENT_TEST_GATE\`: ${gate.suites} suites / ${gate.tests} tests green` },
    { doc: 'docs/FEAR_AI_GLOBAL_WORK_LEDGER.md', label: 'full Jest gate line', pattern: /- Full Jest gate: \d+\/\d+ suites and \d+\/\d+ tests passing\./g, replacement: () => `- Full Jest gate: ${gate.suites}/${gate.suites} suites and ${gate.tests}/${gate.tests} tests passing.` },
    { doc: 'docs/IMPLEMENTATION_STATUS_2026-08-26.md', label: 'current gate pointer', pattern: /Current gate: \*\*\d+ suites \/ \d+ tests\*\*/g, replacement: () => `Current gate: **${gate.suites} suites / ${gate.tests} tests**` },
];

// Documents the tool only READS: they cite suite case counts but own no live gate sentence.
const CITED_DOCS = ['completion-ledger.md', 'docs/SOURCE_ABSENT_RECONCILIATION.md'];

// A citation's case count is the FIRST equal N/N that follows it — the nearest preceding citation
// wins, and each citation is claimed exactly once, because the pairs that follow in the same
// sentence are something else the runner cannot know ("`tests/x.test.js` 9/9 with 12/12 negative
// controls"). Ordering matters in both directions: this attributes "`a.test.js`, `b.test.js` (3/3)"
// to b (the nearest, which is the one the count was written for) and leaves x's 12/12 alone.
export const citationMismatches = (text, casesByFile) => {
    const mismatches = [];
    const claimed = new Set();
    const citations = [...text.matchAll(/[\w.-]+\.test\.js/g)].map(match => ({ file: match[0], end: match.index + match[0].length }));
    for (const pair of text.matchAll(/(?<![\d/])(\d+)\/(\d+)(?![\d/])/g)) {
        const [, claimedCount, total] = pair;
        if (claimedCount !== total) continue; // an unequal pair is prose, not a case count
        const citation = citations.filter(entry => entry.end <= pair.index && pair.index - entry.end <= 60).at(-1);
        if (!citation || claimed.has(citation.file)) continue;
        claimed.add(citation.file);
        const actual = casesByFile[citation.file];
        if (actual === undefined || Number(claimedCount) === actual) continue;
        mismatches.push({ file: citation.file, claimed: Number(claimedCount), actual });
    }
    return mismatches;
};

export const derive = (root = ROOT) => {
    const output = path.join(os.tmpdir(), `gate-counts-${process.pid}.json`);
    try {
        execFileSync(process.execPath, ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--json', `--outputFile=${output}`], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
        // jest exits non-zero when anything fails; the report is still written and is what we want.
        if (!fs.existsSync(output)) throw new Error(`gate-counts: the test run produced no report — ${error.stderr ?? ''}`);
    }
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    fs.rmSync(output, { force: true });
    // Sorted, because the artifact is compared byte-for-byte on the next run and jest's result
    // order follows however many workers it spread the run across.
    const byName = new Map(report.testResults.map(result => [path.basename(result.name), result.assertionResults.length]));
    const casesByFile = {};
    for (const name of [...byName.keys()].sort()) casesByFile[name] = byName.get(name);
    return { suites: report.numTotalTestSuites, tests: report.numTotalTests, failing: report.numFailedTests, casesByFile };
};

export const renderArtifact = derived => `${JSON.stringify({ note: 'Generated by tools/gate-counts.mjs from the jest run — do not edit by hand.', suites: derived.suites, tests: derived.tests, casesByFile: derived.casesByFile }, null, 2)}\n`;

const main = () => {
    const check = process.argv.includes('--check');
    const derived = derive(ROOT);
    const gate = { suites: derived.suites, tests: derived.tests };
    console.log(`derived from the runner: ${gate.suites} suites / ${gate.tests} tests${derived.failing ? ` (${derived.failing} FAILING)` : ''}`);

    const problems = [];
    // A count derived from a red run describes a broken gate; `--check` refuses to bless one. Sync
    // still writes, because making a stale gate current is exactly what a caller runs it for.
    if (derived.failing > 0) {
        const message = `the runner reported ${derived.failing} failing test(s) — the gate is red`;
        console.error(`WARNING: ${message}`);
        if (check) problems.push(message);
    }

    const sites = gateSites(gate);
    const docs = new Set([...sites.map(site => site.doc), ...CITED_DOCS]);
    const contents = new Map([...docs].map(doc => [doc, fs.readFileSync(path.join(ROOT, doc), 'utf8')]));

    for (const site of sites) {
        const before = contents.get(site.doc);
        const matches = [...before.matchAll(site.pattern)];
        if (matches.length !== 1) {
            problems.push(`${site.doc}: the ${site.label} anchor matched ${matches.length} time(s), expected exactly 1 — a reworded gate must fail here rather than skip the number it owns`);
            continue;
        }
        const after = before.replace(site.pattern, site.replacement);
        if (after === before) continue;
        if (check) problems.push(`${site.doc}: the ${site.label} is stale (should read "${gate.suites} suites / ${gate.tests} tests")`);
        else { contents.set(site.doc, after); console.log(`updated ${site.doc} — ${site.label}`); }
    }

    for (const doc of docs) {
        for (const stale of citationMismatches(fs.readFileSync(path.join(ROOT, doc), 'utf8'), derived.casesByFile)) {
            problems.push(`${doc}: cites ${stale.file} at ${stale.claimed} cases, the runner reports ${stale.actual}`);
        }
    }

    const artifactPath = path.join(ROOT, ARTIFACT);
    const artifact = renderArtifact(derived);
    if (!fs.existsSync(artifactPath) || fs.readFileSync(artifactPath, 'utf8') !== artifact) {
        if (check) problems.push(`${ARTIFACT}: stale or missing (re-run \`npm run gate:sync\`)`);
        else { fs.writeFileSync(artifactPath, artifact); console.log(`updated ${ARTIFACT}`); }
    }

    if (!check) {
        for (const [doc, text] of contents) fs.writeFileSync(path.join(ROOT, doc), text);
    }
    for (const problem of problems) console.error(`STALE: ${problem}`);
    if (!problems.length) console.log('gate counts current');
    else if (check) {
        console.error('gate counts are stale — run `npm run gate:sync`');
        process.exit(1);
    } else {
        console.error('gate counts rewritten where they were stale; the STALE lines above are prose the tool cannot own');
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
