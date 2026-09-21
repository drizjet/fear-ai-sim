#!/usr/bin/env node
/**
 * tools/verification/run_probe_suite.mjs — run every deterministic probe once.
 *
 * THIS IS NOT A TEST RUNNER AND THERE ARE NO SUITES. Hard Rule 9 (2026-09-15)
 * retired all 465 suites; what remains is a set of standalone deterministic
 * probes that each prove one named thing and print their own assertion count.
 * This script is that manual command list, executed in one place so CI can run
 * it — and so a human gets one summary instead of twenty-five terminals.
 *
 * The honesty rules it preserves, rather than working around:
 *   - a probe that exits non-zero FAILS the run;
 *   - a probe that reports SKIPPED (no Godot binary, no dotnet, no Unity
 *     Editor, no sibling host tree) is reported as NOT PROVEN, with the
 *     probe's own reason quoted. Skips are never folded into the pass count,
 *     because "we did not check" and "we checked" must not look alike;
 *   - a selection that matches nothing exits 2 instead of printing a summary of
 *     nothing;
 *   - `--expect-proven` lets a caller declare "this environment has the runtime,
 *     so a skip here is a defect of the environment, not an honest limitation".
 *     Without it, an environment that quietly lost its Godot binary would report
 *     the same green summary as one that never had it.
 *
 * Probes run SEQUENTIALLY: several bind loopback ports and spawn servers, so
 * running them concurrently would produce port collisions that look like
 * transport failures.
 *
 * Usage:
 *   node tools/verification/run_probe_suite.mjs [--timeout <seconds>]
 *       [--only <substring>] [--json <path>] [--expect-proven <substring>]...
 *       [--repeat <n>]
 *
 * `--repeat n` runs each probe n times and requires the same verdict every time,
 * reporting STABLE or FLAKY. A probe that passes once has shown its claim is
 * checkable; a probe that passes n times has shown it is DETERMINISTIC, which is
 * the property a manual regime actually depends on. An intermittent probe is the
 * most expensive kind of red there is: it trains the reader to re-run until
 * green, and a re-run-until-green suite is indistinguishable from one that
 * proves nothing. `npm run verify:probe-stability` is the nightly entry point.
 */

import { appendFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const probeDir = join(repoRoot, 'tools', 'verification');

function parseArgs(argv) {
    const args = { timeoutMs: 600_000, only: null, jsonPath: null, expectProven: [], repeat: 1 };
    for (let i = 2; i < argv.length; i += 1) {
        if (argv[i] === '--timeout') args.timeoutMs = Number(argv[i + 1]) * 1000;
        else if (argv[i] === '--only') args.only = argv[i + 1];
        else if (argv[i] === '--json') args.jsonPath = argv[i + 1];
        else if (argv[i] === '--expect-proven') args.expectProven.push(argv[i + 1]);
        // A non-numeric or zero repeat is read as 1 rather than as 0: a repeat
        // count of zero would run nothing and report a green suite of no runs.
        else if (argv[i] === '--repeat') args.repeat = Math.max(1, Number(argv[i + 1]) || 1);
    }
    // CI sets the expectation as a step-level environment variable rather than a
    // flag, so the workflow's one `run:` command stays inside the allowlist that
    // tools/guardian/hard-rule-9.mjs asserts it against.
    const fromEnv = process.env.FEAR_AI_EXPECT_PROVEN;
    if (fromEnv) {
        for (const name of fromEnv.split(',').map(part => part.trim()).filter(Boolean)) {
            args.expectProven.push(name);
        }
    }
    return args;
}

const SKIP_LINE = /\bSKIPPED\b/;
// Probes report their own counts in their own words ("All 210 adapter
// conformance assertions PASSED.", "All 169 Godot station-level assertions
// PASSED."). Not every probe counts, so the field is null when none is stated —
// an invented number would be worse than an absent one.
// The LAST count in the output wins: several probes state an in-engine or
// per-half subtotal before their final total ("37 in-engine assertions ..." then
// "SUCCESS: 46 encrypted-store assertions passed"), and taking the first match
// reported a subtotal as if it were the probe's whole claim.
const ASSERTION_COUNT = /(\d[\d,]*)\s+(?:[a-z-]+\s+){0,3}assertions?\b/gi;

function discover() {
    return readdirSync(probeDir)
        .filter(name => /^verify_.*\.mjs$/.test(name))
        .sort()
        .map(name => ({ name, path: join(probeDir, name) }));
}

// The last line a probe prints is usually a banner rule, which tells a reader of
// the roster nothing. Prefer the last line that states an outcome, and fall back
// to the last line with actual words in it.
function pickSummary(lines) {
    const substance = lines.filter(line => !/^[=\-_*#~^·•]+$/.test(line) && line.length > 2);
    const outcome = substance.filter(line => /SUCCESS|PASSED|CLEANLY|NOT PROVEN|REFUSED|OK\b|SKIPPED/i.test(line));
    if (outcome.length > 0) return outcome[outcome.length - 1];
    return substance.length > 0 ? substance[substance.length - 1] : '';
}

function runProbe(probe, timeoutMs) {
    const started = Date.now();
    const result = spawnSync(process.execPath, [probe.path], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024
    });
    const elapsedMs = Date.now() - started;
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const timedOut = result.error && result.error.code === 'ETIMEDOUT';
    const skipLines = lines.filter(line => SKIP_LINE.test(line));
    const assertionMatches = [...output.matchAll(ASSERTION_COUNT)];
    const assertionMatch = assertionMatches.length > 0 ? assertionMatches[assertionMatches.length - 1] : null;
    let verdict;
    if (timedOut) verdict = 'FAILED';
    else if (result.status !== 0) verdict = 'FAILED';
    else if (skipLines.length > 0) verdict = 'PARTIAL';
    else verdict = 'PASSED';
    return {
        verdict,
        elapsedMs,
        output,
        skipLines,
        summaryLine: pickSummary(lines),
        assertions: assertionMatch ? Number(assertionMatch[1].replace(/,/g, '')) : null,
        code: result.status,
        timedOut
    };
}

const args = parseArgs(process.argv);
const all = discover();
const probes = args.only ? all.filter(p => p.name.includes(args.only)) : all;

console.log('============================================================');
console.log(`RUN THE DETERMINISTIC PROBE SUITE (${probes.length} of ${all.length} probes)`);
console.log('============================================================');
/**
 * The suite's green means different things in different environments, and the
 * difference is invisible in the pass count: a machine with no engine reports the
 * same number of PASSED probes as one with the engine, and differs only in how
 * many claims are marked NOT PROVEN further down. So the environment is stated
 * once, up front, where it is read before the numbers rather than after them.
 */
const enginePath = process.env.FEAR_AI_GODOT || '';
// Stated as a fact about the environment, not a prediction about the outcome:
// the in-engine probes also fall back to their own discovery (the recorded
// Windows evidence was captured with no FEAR_AI_GODOT set at all), so an unset
// variable does not mean those halves were skipped — the roster already says
// which probes were NOT PROVEN, and this line must not contradict it.
const engineNote = !enginePath
    ? 'FEAR_AI_GODOT not set — in-engine probes fall back to their own engine discovery'
    : existsSync(enginePath)
        ? `FEAR_AI_GODOT=${enginePath}`
        : `FEAR_AI_GODOT=${enginePath} (MISSING FILE — in-engine halves will SKIP)`;

console.log(`  repo: ${repoRoot}`);
console.log(`  node: ${process.version} on ${process.platform}`);
console.log(`  engine: ${engineNote}`);
if (args.repeat > 1) {
    console.log(`  repeat: up to ${args.repeat}x per probe — a probe is STABLE only if every run agreed`);
}
console.log('');

// A run that selected nothing must not report a green summary. Discovery and
// --only are both checked: a filter that matches no probe is a mistake in the
// invocation, not evidence that everything is fine.
if (all.length === 0) {
    console.error('FAILED — no probes found under tools/verification/. A discovery path that');
    console.error('silently matches nothing would report a green run that proved nothing.');
    process.exit(2);
}
if (probes.length === 0) {
    console.error(`FAILED — --only ${JSON.stringify(args.only)} matched none of the ${all.length} probes.`);
    console.error('Exiting 2 rather than printing a summary of nothing.');
    process.exit(2);
}

const failures = [];
const skips = [];
const report = [];
let passed = 0;
let partial = 0;

for (const probe of probes) {
    const label = probe.name.padEnd(46);
    // Runs stop early on the first disagreement: a verdict that already differs
    // needs no further samples to be called flaky, and spending the extra runs
    // would only delay the report.
    const runs = [];
    for (let attempt = 0; attempt < args.repeat; attempt += 1) {
        runs.push(runProbe(probe, args.timeoutMs));
        if (attempt > 0 && runs[attempt].verdict !== runs[0].verdict) break;
    }
    const first = runs[0];
    const verdicts = runs.map(run => run.verdict);
    const varied = verdicts.some(verdict => verdict !== verdicts[0]);
    const elapsedMs = runs.reduce((total, run) => total + run.elapsedMs, 0);
    const seconds = `${(elapsedMs / 1000).toFixed(1)}s`;
    const entry = {
        name: probe.name,
        verdict: varied ? 'FLAKY' : first.verdict,
        assertions: first.assertions,
        // The total, for continuity, AND the individual run durations. A sum alone
        // cannot support a percentile: three runs of a probe that creeps from 100 ms
        // to 140 ms and one that jumps 40 -> 300 -> 320 both sum differently but
        // describe different probes, and a per-run sample pooled across nights is
        // what lets a slow drift be seen at all.
        durationsMs: runs.map(run => run.elapsedMs),
        durationMs: elapsedMs,
        summaryLine: first.summaryLine.slice(0, 300),
        skipLines: first.skipLines.map(line => line.slice(0, 300))
    };
    if (args.repeat > 1) entry.verdicts = verdicts;
    report.push(entry);
    if (varied) {
        console.log(`  FLAKY    ${label} ${seconds.padStart(7)}  ${verdicts.join(' ')}`);
        const outlier = runs.find(run => run.verdict !== verdicts[0]) ?? runs[runs.length - 1];
        failures.push({ name: probe.name, output: outlier.output, timedOut: outlier.timedOut });
    } else if (first.verdict === 'PASSED') {
        passed += 1;
        console.log(`  ${args.repeat > 1 ? 'STABLE' : 'PASS  '}   ${label} ${seconds.padStart(7)}`);
    } else if (first.verdict === 'PARTIAL') {
        partial += 1;
        console.log(`  PARTIAL  ${label} ${seconds.padStart(7)}  ${first.skipLines.length} declared skip line(s)`);
        for (const line of first.skipLines.slice(0, 2)) {
            console.log(`             -> ${line.slice(0, 150)}`);
        }
        skips.push({ name: probe.name, lines: first.skipLines });
    } else {
        console.log(`  FAIL     ${label} ${seconds.padStart(7)}  ${first.timedOut ? '(timed out)' : `exit ${first.code}`}`);
        failures.push({ name: probe.name, output: first.output, timedOut: first.timedOut });
    }
}

console.log('');
console.log('============================================================');
console.log(`  ${probes.length} probes: ${passed} passed, ${partial} passed with declared skips, ${failures.length} failed`);
if (args.repeat > 1) {
    console.log(`  each probe run up to ${args.repeat}x (a disagreement ends that probe early) — FLAKY counts as failed`);
}
if (skips.length > 0) {
    console.log('');
    console.log('  NOT PROVEN on this machine (the probe said so itself; this is not a failure');
    console.log('  and also not a pass — the claim has no evidence here):');
    for (const skip of skips) {
        console.log(`    - ${skip.name}`);
        console.log(`      ${skip.lines[0].slice(0, 170)}`);
    }
}
console.log('============================================================');

// The caller declared that this environment has the runtime a probe needs. A
// skip then means the environment lost it, which must not report as green.
const unmetExpectations = args.expectProven
    .map(name => skips.find(skip => skip.name.includes(name)))
    .filter(Boolean);
if (unmetExpectations.length > 0) {
    console.log('');
    console.log('FAILED EXPECTATION — the caller said this environment can prove:');
    for (const skip of unmetExpectations) {
        console.log(`    ${skip.name}: ${skip.lines[0].slice(0, 170)}`);
    }
    console.log('A skip here is an environment defect, not an honest limitation.');
}

// CI surfaces: the summary belongs where a reviewer is already looking, and a
// not-proven probe deserves an annotation rather than a line in a log nobody
// opens. Both are no-ops locally, because a local run is read in the terminal.
function writeCiSummary(rows, notProven, failed) {
    const markdown = [
        `## Deterministic probe suite — ${rows.length} probes`,
        '',
        `Engine: ${engineNote}`,
        '',
        ...(args.repeat > 1
            ? [`Repeated up to **${args.repeat}x** per probe — a probe is STABLE only if every run gave the same verdict, and `
                + 'FLAKY is counted as a failure.', '']
            : []),
        `**${rows.filter(r => r.verdict === 'PASSED').length} passed · `
            + `${rows.filter(r => r.verdict === 'PARTIAL').length} passed with declared skips · `
            + `${failed.length} failed**`,
        '',
        '| Probe | Verdict | Assertions |',
        '|---|---|---|',
        ...rows.map(r => `| \`${r.name}\` | ${r.verdict}${r.verdicts ? ` (${r.verdicts.join(', ')})` : ''} | ${r.assertions === null ? '—' : r.assertions} |`),
        '',
        notProven.length > 0
            ? `**Not proven on this runner (${notProven.length}) — neither a pass nor a failure:**\n\n`
                + notProven.map(skip => `- \`${skip.name}\`: ${skip.lines[0]}`).join('\n')
            : '**Every probe proved its claim on this runner.**',
        ''
    ].join('\n');
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
        appendFileSync(summaryPath, `${markdown}\n`);
        console.log('  wrote the roster to the GitHub step summary');
    }
    if (process.env.GITHUB_ACTIONS === 'true') {
        for (const skip of notProven) {
            console.log(`::warning title=Probe not proven::${skip.name}: ${skip.lines[0]}`.slice(0, 380));
        }
        for (const failure of failed) {
            console.log(`::error title=Probe failed::${failure.name}`);
        }
    }
}

if (args.jsonPath) {
    const payload = {
        kind: args.repeat > 1 ? 'recorded-probe-stability-run' : 'recorded-probe-suite-run',
        note: args.repeat > 1
            ? 'A REPEATED run of the deterministic probe suite. Each probe ran up to `repeat` times (a '
                + 'disagreement ends that probe early); a probe whose runs disagreed is recorded as FLAKY and counted as a failure, because a '
                + 'verdict that depends on the attempt is not a verdict. Durations are summed over runs.'
            : 'A RECORDED run of the deterministic probe suite. Verdicts, durations and skip lines '
                + 'are properties of THIS machine on THIS date. CI re-runs the suite and uploads its own '
                + 'summary; a PARTIAL here means the claim had no evidence on this machine, not that it failed.',
        recordedAt: new Date().toISOString(),
        node: process.version,
        platform: process.platform,
        repeat: args.repeat,
        engine: engineNote,
        expectedToBeProven: args.expectProven,
        totals: { probes: report.length, passed, passedWithSkips: partial, failed: failures.length },
        notProven: skips.map(skip => ({ name: skip.name, reason: skip.lines[0] })),
        failures: failures.map(failure => failure.name),
        probes: report
    };
    const target = resolve(repoRoot, args.jsonPath);
    writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`  wrote ${args.jsonPath}`);
}

writeCiSummary(report, skips, failures);

if (failures.length > 0) {
    console.log('');
    for (const failure of failures) {
        console.log(`--- ${failure.name} ${failure.timedOut ? '(timed out)' : ''} ---`);
        console.log(failure.output.trim().split(/\r?\n/).slice(-15).join('\n'));
        console.log('');
    }
    process.exit(1);
}
if (unmetExpectations.length > 0) process.exit(1);
