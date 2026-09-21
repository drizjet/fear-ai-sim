#!/usr/bin/env node
/**
 * tools/codegen/generate_release_dossier.mjs — render the release dossier's
 * probe roster from a recorded probe-suite run, and its determinism section from
 * a recorded *repeated* run, so the dossier cannot claim more than the probes
 * proved.
 *
 * WHY THIS EXISTS. The certification dossier used to describe its verification
 * in prose ("all twenty-one probes were rerun and exited 0"), which is a claim
 * about a run written by hand next to the run itself. Prose and artifact drift;
 * a generated block cannot. Every row here comes from
 * `evidence/probe_suite_report.json`, which is the runner's own machine-readable
 * summary of a real run — including the rows that were NOT proven.
 *
 * WHY THERE ARE TWO BLOCKS. "This probe passed" and "this probe gave the same
 * answer every time it was asked" are different claims, and only the second is
 * about determinism — which is the property a manual regime depends on, because
 * an intermittent probe teaches its reader to re-run until green. So the
 * repeated run (`evidence/probe_stability_report.json`, `--repeat n`) gets its
 * own generated section rather than a footnote in the roster.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not re-run anything, and it does not
 * turn a recorded run into a live claim. Both recorded runs are dated and
 * platform-bound; CI re-runs the same suite and uploads its own summaries. A row
 * marked as a declared skip is printed as NOT PROVEN, because the failure this
 * guards against is a dossier that counts "we did not check" as a pass — and a
 * probe that is repeatable while still not proving its claim is printed the same
 * way, because repetition does not create evidence.
 *
 * ABSENCE IS RENDERED, NOT HIDDEN. If the repeated-run artifact is missing, or is
 * not a repeated run at all, the determinism section says so and lists **every**
 * probe as never repeated, rather than omitting the section and leaving the
 * reader to assume the good case.
 *
 * Determinism: a pure function of the committed JSON and this file. No
 * timestamps of its own, no clock, no git state — so `--check` is meaningful in
 * CI. (Regenerating after a NEW run changes a block, which is correct: a new run
 * is new evidence.)
 *
 * Usage:
 *   node tools/codegen/generate_release_dossier.mjs          # write the blocks
 *   node tools/codegen/generate_release_dossier.mjs --check  # fail if out of date
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The ledger aggregation lives with the tool that writes the ledger, so the
// dossier and the regression check cannot disagree about what a night counted as.
import { DRIFT_LIMITS, durationDrift, ledgerSummary, timingComparison, wilsonInterval } from '../verification/stability_regression.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOSSIER_PATH = join(repoRoot, 'docs', 'RELEASE_CANDIDATE_CERTIFICATION.md');
const REPORT_PATH = join(repoRoot, 'evidence', 'probe_suite_report.json');
const STABILITY_PATH = join(repoRoot, 'evidence', 'probe_stability_report.json');
const LEDGER_PATH = join(repoRoot, 'evidence', 'probe_stability_ledger.jsonl');

const BEGIN = '<!-- GENERATED:PROBE-ROSTER:BEGIN -->';
const END = '<!-- GENERATED:PROBE-ROSTER:END -->';
const DET_BEGIN = '<!-- GENERATED:PROBE-DETERMINISM:BEGIN -->';
const DET_END = '<!-- GENERATED:PROBE-DETERMINISM:END -->';

const RECORD_INSTRUCTION = 'node tools/verification/run_probe_suite.mjs --repeat 3 '
    + '--json evidence/probe_stability_report.json';

// The dossier and the CI gate must quote the same interval, so both call the one
// implementation of it (Wilson, 95%) that lives in the regression tool.
const interval = (disagreements, nights) => wilsonInterval(disagreements, nights);
const percent = value => `${(value * 100).toFixed(1)}%`;

function cell(text) {
    // Markdown table cells must not contain raw pipes.
    return String(text).replace(/\|/g, '\\|');
}

/** The append-only ledger of repeated runs, or null when none has been recorded. */
function loadLedger() {
    if (!existsSync(LEDGER_PATH)) return null;
    const lines = readFileSync(LEDGER_PATH, 'utf8').split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return null;
    return lines.map(line => JSON.parse(line));
}

function loadReport() {
    if (!existsSync(REPORT_PATH)) {
        throw new Error(`missing ${REPORT_PATH}; run: node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json`);
    }
    return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
}

export function render() {
    const report = loadReport();
    const totals = report.totals || {};
    const verdictLabel = {
        PASSED: 'PASSED',
        PARTIAL: 'PASSED WITH DECLARED SKIPS',
        FAILED: 'FAILED'
    };
    const lines = [
        BEGIN,
        '<!-- Generated by tools/codegen/generate_release_dossier.mjs from',
        '     evidence/probe_suite_report.json. Do not edit by hand: run the generator,',
        '     or `--check`. Drift fails the release-claim probe. -->',
        '',
        '### Probe roster (recorded run, generated)',
        '',
        `**Recorded ${report.recordedAt} — ${report.probes.length} probes, ${totals.passed} passed, `
            + `${totals.passedWithSkips} passed with declared skips, ${totals.failed} failed, on `
            + `Node ${report.node} / ${report.platform}.**`,
        'This is a **recorded** run of the same suite CI re-runs (`npm run verify:probes`, the `probes`',
        'job, `windows-latest`), taken from `evidence/probe_suite_report.json`. A row marked',
        '**PASSED WITH DECLARED SKIPS** is *not* a pass: it is a probe that reported, in its own words,',
        'that part of its claim had no evidence on this machine. Rows marked FAILED would be listed',
        'here too — the roster renders whatever happened rather than only what succeeded.',
        '',
        '| Probe | Verdict | Assertions | Its own last line |',
        '|---|---|---|---|'
    ];
    for (const probe of report.probes) {
        const label = verdictLabel[probe.verdict] || probe.verdict;
        lines.push(`| \`${probe.name}\` | ${label} | ${probe.assertions === null ? '—' : probe.assertions} | ${cell(probe.summaryLine || '—')} |`);
    }
    lines.push('');
    if (Array.isArray(report.notProven) && report.notProven.length > 0) {
        lines.push('**Not proven on the recorded machine — the probe said so itself, and it is neither a');
        lines.push('pass nor a failure:**');
        lines.push('');
        for (const entry of report.notProven) {
            lines.push(`- \`${entry.name}\` — ${cell(entry.reason)}`);
        }
    } else {
        lines.push('**Every probe in the recorded run proved its claim on that machine.**');
    }
    lines.push('');
    lines.push('Probes that state no assertion count print `—` in that column: the number is absent');
    lines.push('rather than invented, and each probe\'s own last line is quoted beside it.');
    lines.push(END);
    return lines.join('\n');
}

/**
 * The determinism section. Reads the recorded repeated run if there is one, and
 * renders every probe from the single-run roster as `never` when there is not —
 * because a dossier that silently drops this section reads exactly like one whose
 * probes all repeated cleanly.
 */
export function renderDeterminism(rosterReport = loadReport()) {
    const lines = [
        DET_BEGIN,
        '<!-- Generated by tools/codegen/generate_release_dossier.mjs from',
        '     evidence/probe_stability_report.json. Do not edit by hand: run the generator,',
        '     or `--check`. Drift fails the release-claim probe. -->',
        '',
        '### Determinism (recorded repeated run, generated)',
        ''
    ];
    const neverRepeatedTable = (why) => {
        lines.push(why, '');
        lines.push('| Probe | Repeated |', '|---|---|');
        for (const probe of rosterReport.probes) {
            lines.push(`| \`${probe.name}\` | never |`);
        }
        lines.push('', `To record one: \`${RECORD_INSTRUCTION}\` — or \`npm run verify:probe-stability\`,`);
        lines.push('which is the same thing, and is what the CI `probe-stability` job runs nightly.');
        lines.push(DET_END);
        return lines.join('\n');
    };

    if (!existsSync(STABILITY_PATH)) {
        return neverRepeatedTable(
            '**No repeated run has been recorded.** '
                + '`evidence/probe_stability_report.json` is absent, so **every probe in the roster above '
                + 'is listed as never repeated**: a verdict observed once says nothing about whether it '
                + 'survives being asked again.'
        );
    }
    const report = JSON.parse(readFileSync(STABILITY_PATH, 'utf8'));
    if (report.kind !== 'recorded-probe-stability-run' || !(Number(report.repeat) > 1)) {
        return neverRepeatedTable(
            '**The recorded repeated-run artifact is not a repeated run.** '
                + `\`evidence/probe_stability_report.json\` declares kind ${JSON.stringify(report.kind)} and `
                + `repeat ${JSON.stringify(report.repeat)}; a single-run artifact cannot support a `
                + 'determinism claim, so **every probe in the roster above is listed as never repeated**. '
                + `Re-record it with \`${RECORD_INSTRUCTION}\`.`
        );
    }

    const repeated = report.probes || [];
    const flaky = repeated.filter(probe => (probe.verdicts || []).some(v => v !== (probe.verdicts || [])[0]));
    const repeatedNames = new Set(repeated.map(probe => probe.name));
    const neverRepeated = rosterReport.probes.filter(probe => !repeatedNames.has(probe.name)).map(probe => probe.name);
    const notInRoster = repeated.filter(probe => !rosterReport.probes.some(r => r.name === probe.name)).map(probe => probe.name);
    const stable = repeated.filter(probe => !flaky.includes(probe));
    const provenStable = stable.filter(probe => probe.verdict === 'PASSED').length;

    lines.push(
        `**Recorded ${report.recordedAt} — up to ${report.repeat}× per probe, on `
            + `Node ${report.node} / ${report.platform}.**`,
        `Engine: ${cell(report.engine || 'not recorded')}`,
        '',
        `This is **repeatability on that machine at that date, not determinism in general**. `
            + `\`--repeat ${report.repeat}\` bounds the observation: a defect that fires once in ten will `
            + 'usually survive three runs, so the value here is catching the expensive kind — '
            + 'intermittency frequent enough to be seen, which is exactly the kind that teaches a reader '
            + 'to re-run until green. A probe that repeated cleanly is still only a probe that repeated '
            + 'cleanly; repetition does not create evidence it did not have.',
        '',
        `**Repeatable on the recorded machine: ${stable.length} of ${repeated.length} repeated probes gave `
            + `the same verdict on every run** — ${provenStable} of them proving their claim, and `
            + `${stable.length - provenStable} reporting a declared skip on every run. Both are repeatable; `
            + 'only the first is proof, because repeating a skip does not turn it into a pass. The probes in '
            + 'the second group are named under *Repeatable but still not proven* below.',
        ''
    );
    if (report.node !== rosterReport.node || report.platform !== rosterReport.platform) {
        lines.push('> **Machine note:** the repeated run and the recorded single run above were taken on '
            + `different environments (Node ${report.node} / ${report.platform} versus `
            + `Node ${rosterReport.node} / ${rosterReport.platform}), so the two are not directly comparable `
            + 'row for row.', '');
    }
    lines.push('| Probe | Runs | Verdicts | Assertions | Total time |', '|---|---|---|---|---|');
    for (const probe of repeated) {
        const verdicts = probe.verdicts || [];
        const same = verdicts.every(v => v === verdicts[0]);
        const sequence = same ? `${verdicts.length}× ${verdicts[0]}` : verdicts.join(', ');
        const assertions = (probe.assertions === undefined || probe.assertions === null) ? '—' : probe.assertions;
        lines.push(`| \`${probe.name}\` | ${verdicts.length} | ${sequence}${same ? '' : ' **FLAKY**'} | ${assertions} | ${(probe.durationMs / 1000).toFixed(1)}s |`);
    }
    lines.push('', 'The `Runs` column can be lower than the repeat count: a disagreement ends that probe '
        + 'early, because a verdict that already differs needs no further samples.', '');
    if (flaky.length > 0) {
        lines.push('**Disagreed across runs — counted as failures, and the reason this section exists:**', '');
        for (const probe of flaky) {
            lines.push(`- \`${probe.name}\` — ${(probe.verdicts || []).join(', ')}`);
        }
    } else {
        lines.push('**No probe disagreed with itself across the recorded runs.** That is a statement about '
            + `these ${repeated.length} probes on this machine over up to ${report.repeat} attempts each, not `
            + 'about determinism in general, and not about any machine but the recorded one.');
    }
    lines.push('');
    if (neverRepeated.length > 0) {
        lines.push(`**Never repeated at all (${neverRepeated.length}) — in the recorded single run, absent `
            + 'from the repeated one, so nothing is known about whether they are deterministic:**', '');
        for (const name of neverRepeated) lines.push(`- \`${name}\``);
    } else {
        lines.push('**Every probe in the recorded single run also appears in the repeated run**, so no '
            + 'probe in the roster above is left without a repetition result.');
    }
    if (notInRoster.length > 0) {
        lines.push('', `**Repeated but not in the recorded single run (${notInRoster.length}) — added to the `
            + 'suite after that run was taken:**', '');
        for (const name of notInRoster) lines.push(`- \`${name}\``);
    }
    // The ledger is the only thing here that can see an intermittency rarer than
    // the repeat count: one night cannot, and no number of nights is a proof.
    const ledger = loadLedger();
    lines.push('');
    if (!ledger) {
        lines.push('**No ledger of repeated runs has been recorded** — `evidence/probe_stability_ledger.jsonl` is '
            + 'absent or empty, so nothing at all is known about whether these probes are intermittent beyond '
            + 'the single night above. Each nightly CI run appends an entry and uploads the ledger; a recording '
            + 'can be made locally with:');
        lines.push('');
        lines.push('`npm run verify:stability-regression -- --append-history evidence/probe_stability_ledger.jsonl`');
    } else {
        const summary = ledgerSummary(ledger, rosterReport.probes.map(probe => probe.name));
        lines.push(`**Across the ledger of recorded repeated runs (${summary.nights} night(s), `
            + `${summary.attempts} probe attempts):**`);
        lines.push('');
        if (summary.everIntermittent.length === 0) {
            const bound = interval(0, summary.nights);
            lines.push(`No probe has ever disagreed with itself in the ledger. That is a statement about `
                + `${summary.attempts} recorded attempts across ${summary.nights} repeated run(s), and over that `
                + `many clean night(s) the 95% Wilson upper bound on any one probe's flake rate is still `
                + `**${percent(bound.upper)}** — which is the honest reason to keep extending the ledger: the same `
                + 'clean result over more nights is a smaller number, and none of them is a proof of determinism. '
                + 'A probe that has never disagreed may still be broken.');
        } else {
            lines.push('Probes observed disagreeing with themselves on at least one recorded night, with the rate '
                + 'that observation supports. Reported here and never gated: a recorded fact cannot be failed away, '
                + 'and a job that renders on every run for it would teach everyone that red means nothing. The CI '
                + 'nightly job does gate on the measured rate, once there are enough nights for it to be a '
                + 'measurement rather than one night\'s luck.');
            lines.push('');
            lines.push('| Probe | Nights | Attempts | Nights with a disagreement | Observed rate | 95% Wilson interval | Verdicts seen |');
            lines.push('|---|---|---|---|---|---|---|');
            for (const probe of summary.everIntermittent) {
                lines.push(`| \`${probe.name}\` | ${probe.nights} | ${probe.attempts} | ${probe.disagreementNights} | `
                    + `${percent(probe.flakeRate)} | ${percent(probe.flakeInterval.lower)}–${percent(probe.flakeInterval.upper)} | `
                    + `${cell(JSON.stringify(probe.verdicts))} |`);
            }
            lines.push('');
            lines.push(summary.rateGated.length > 0
                ? `**${summary.rateGated.length} probe(s) cross the CI flake-rate gate** (>= 20% over >= 5 nights): `
                    + summary.rateGated.map(probe => `\`${probe.name}\``).join(', ')
                    + '. A single flake is an incident and is only reported; a rate is a property of the probe.'
                : `No probe crosses the CI flake-rate gate (>= 20% over >= 5 nights); below that many nights the `
                    + 'rate is reported and the gate stays out of the way.');
        }
        // Timing: the ledger holds durations, and a probe that quietly became much
        // slower is the same family of defect as one that became intermittent — its
        // green no longer means what it did. Compared only against earlier nights on
        // the same platform and Node major, because a ratio across two machines
        // measures the machines.
        const lastNight = ledger[ledger.length - 1];
        const timing = timingComparison(lastNight, ledger.slice(0, -1), null);
        lines.push('');
        if (timing.slower.length > 0) {
            lines.push(`**Timing — ${timing.slower.length} probe(s) at least 3x slower than their comparable baseline `
                + '(gated in CI):**');
            lines.push('');
            lines.push('| Probe | Baseline | Most recent night |');
            lines.push('|---|---|---|');
            for (const row of timing.slower) {
                lines.push(`| \`${row.name}\` | ${Math.round(row.baselineMs)} ms | ${row.currentMs} ms |`);
            }
        } else {
            lines.push(`**Timing — no probe is 3x slower than its baseline** (drawn from earlier nights on the same `
                + `platform and Node major${timing.notComparable.length > 0
                    ? `; ${timing.notComparable.length} probe(s) had no comparable baseline, because a ratio across `
                        + 'two machines measures the machines'
                    : ''}).`);
        }
        if (timing.faster.length > 0) {
            lines.push('');
            lines.push(`Reported, not gated: ${timing.faster.length} probe(s) ran at a quarter of their baseline or `
                + `below (${timing.faster.map(row => `\`${row.name}\``).join(', ')}) — a cache explains that, and so `
                + 'would a probe that stopped doing the work it used to do.');
        }
        // Drift: a probe that creeps never trips a step gate, so the recent nights are
        // pooled per run and compared against the probe's own earlier distribution.
        const drift = durationDrift(lastNight, ledger.slice(0, -1));
        lines.push('');
        if (drift.status === 'INSUFFICIENT') {
            const excluded = drift.excludedNightsWithoutPerRunDurations > 0
                ? `; ${drift.excludedNightsWithoutPerRunDurations} `
                    + `${drift.excludedNightsWithoutPerRunDurations === 1 ? 'predates' : 'predate'} per-run duration `
                    + `recording and ${drift.excludedNightsWithoutPerRunDurations === 1 ? 'is' : 'are'} excluded `
                    + 'rather than treated as zero'
                : '';
            lines.push(`**Timing drift — not yet measurable:** a drift needs ${drift.neededNights} comparable nights that `
                + `carry per-run durations, and ${drift.nightsWithPerRunDurations} of ${drift.comparableNights} do${excluded}`
                + '. A probe that creeps 10% a night never trips a step threshold, which is why the check pools per-run '
                + 'samples instead of comparing single totals — and it stays silent until there is a history worth '
                + 'calling a distribution.');
        } else if (drift.rows.length === 0) {
            lines.push('**Timing drift — no probe had enough pooled samples to judge** across the recorded nights.');
        } else if (drift.drifted.length > 0) {
            lines.push(`**Timing drift — ${drift.drifted.length} probe(s) whose recent median sits above their own p90 `
                + `(gated in CI at ${DRIFT_LIMITS.ratio}x over the last ${DRIFT_LIMITS.recentNights} of `
                + `${drift.nightsWithPerRunDurations} comparable nights):**`);
            lines.push('');
            lines.push('| Probe | Baseline median | Baseline p90 | Recent median | Ratio |');
            lines.push('|---|---|---|---|---|');
            for (const row of drift.drifted) {
                lines.push(`| \`${row.name}\` | ${Math.round(row.baselineMedianMs)} ms | ${Math.round(row.baselineP90Ms)} ms | `
                    + `${Math.round(row.recentMedianMs)} ms | ${row.ratio.toFixed(2)}x |`);
            }
        } else {
            lines.push(`**Timing drift — no probe is creeping** (${drift.rows.length} probe(s) had enough pooled samples `
                + `across ${drift.nightsWithPerRunDurations} comparable night(s); none reached ${DRIFT_LIMITS.ratio}x its `
                + 'earlier median while also exceeding its own p90).');
        }
        if (drift.status === 'MEASURED' && drift.excludedNightsWithoutPerRunDurations > 0) {
            lines.push('');
            lines.push(`The pooled sample excludes ${drift.excludedNightsWithoutPerRunDurations} of `
                + `${drift.comparableNights} comparable night(s) that predate per-run duration recording — stated `
                + 'rather than left as a sample that quietly shrank.');
        }
        if (drift.rising && drift.rising.length > 0) {
            lines.push('');
            lines.push(`Reported, not gated: ${drift.rising.length} probe(s) rose past ${DRIFT_LIMITS.risingRatio}x their `
                + `earlier median without passing the drift gate (${drift.rising.map(row => `\`${row.name}\``).join(', ')}).`);
        }
        lines.push('');
        if (summary.neverRecorded.length > 0) {
            lines.push(`**Never recorded in the ledger (${summary.neverRecorded.length})** — nothing is known about `
                + 'whether these are deterministic:');
            for (const name of summary.neverRecorded) lines.push(`- \`${name}\``);
        } else {
            lines.push('**Every probe in the roster appears in the ledger**, so no probe is left without a '
                + 'cross-night result.');
        }
    }
    if (Array.isArray(report.notProven) && report.notProven.length > 0) {
        lines.push('', '**Repeatable but still not proven** — these probes gave the same answer every time, '
            + 'and that answer was that part of their claim had no evidence on this machine:');
        lines.push('');
        for (const entry of report.notProven) {
            lines.push(`- \`${entry.name}\` — ${cell(entry.reason)}`);
        }
    }
    lines.push(DET_END);
    return lines.join('\n');
}

function replaceBlock(text, block, begin, end) {
    const start = text.indexOf(begin);
    const stop = text.indexOf(end);
    if (start === -1 || stop === -1 || stop < start) {
        throw new Error(`${DOSSIER_PATH} is missing the generated markers.\n`
            + `Add ${begin} ... ${end} where that block belongs.`);
    }
    return `${text.slice(0, start)}${block}${text.slice(stop + end.length)}`;
}

function main() {
    const check = process.argv.includes('--check');
    const current = readFileSync(DOSSIER_PATH, 'utf8');
    const roster = loadReport();
    let expected = replaceBlock(current, render(), BEGIN, END);
    expected = replaceBlock(expected, renderDeterminism(roster), DET_BEGIN, DET_END);
    if (check) {
        if (current !== expected) {
            console.error('DRIFT — the release dossier does not match the recorded runs');
            console.error('(evidence/probe_suite_report.json for the roster, evidence/probe_stability_report.json');
            console.error('for the determinism section).');
            console.error('Run: node tools/codegen/generate_release_dossier.mjs');
            return 1;
        }
        console.log('OK — the generated probe roster and determinism section match the recorded runs.');
        return 0;
    }
    if (current !== expected) {
        writeFileSync(DOSSIER_PATH, expected);
        console.log('WROTE — the release dossier was regenerated from the recorded runs.');
    } else {
        console.log('OK — already up to date.');
    }
    return 0;
}

// Only run the CLI when invoked directly, so a probe can import `render`.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main());
}
