#!/usr/bin/env node
/**
 * tools/verification/stability_regression.mjs — compare a fresh repeated run
 * against the committed recording, keep a rolling ledger of repeated runs, and
 * answer the three questions a single night cannot.
 *
 * WHY THIS EXISTS. `run_probe_suite.mjs --repeat 3` answers "did this probe agree
 * with itself tonight?". That is a question about one night, and three separate
 * gaps follow from it:
 *
 *   1. NOTHING COMPARED A NIGHT TO THE RECORD. A probe that was repeatable when
 *      the recording was taken, and is intermittent now, produced a red nightly
 *      run and no statement about *what changed*. The verdict comparison below
 *      names the probe, the sequence it used to give and the one it gives now.
 *
 *   2. ONE NIGHT CANNOT SEE A RARE FLAKE. Three attempts catch a defect that fires
 *      a third of the time; a defect that fires one night in three looks like a
 *      clean probe every time it is looked at. So each repeated run is appended to
 *      an append-only ledger, and the ledger is asked the only question it can
 *      answer: across every night recorded so far, how many nights has each probe
 *      disagreed with itself on? With enough nights that becomes a *measured rate*
 *      with a Wilson score interval, which is what turns "stable tonight" into
 *      "disagreed on 0 of 7 nights, 95% interval 0–41%" — a bounded, honest claim.
 *
 *   3. NOTHING LOOKED AT TIME. A probe that has quietly become ten times slower is
 *      a defect in the same family — its green no longer means what it did — and
 *      the ledger already holds the evidence. Durations are compared against a
 *      baseline drawn from *comparable* nights only (same platform and Node major),
 *      because a duration ratio across two different machines measures the
 *      machines, not the probe.
 *
 * WHAT A CLEAN LEDGER IS NOT. It is not determinism, and this file never prints it
 * as such. A probe that has never disagreed may still be broken; the interval does
 * the talking, and with one clean night the 95% upper bound on a probe's flake rate
 * is still ~66%. That number is the argument for extending the ledger.
 *
 * WHAT IS GATED AND WHAT IS ONLY REPORTED. Gated: a verdict regression in tonight's
 * run, a timing regression that survives the comparability check, and a flake *rate*
 * over enough nights that the measurement, not one night's luck, is the finding.
 * Reported: everything historical, and any single historical flake — a recorded fact
 * cannot be failed away, and a job that went red on every run because of one would
 * teach everyone that red means nothing.
 *
 * Usage:
 *   node tools/verification/stability_regression.mjs
 *       [--fresh <path>]            # default probe_stability_report.json (CI's run)
 *       [--recording <path>]        # default evidence/probe_stability_report.json
 *       [--append-history <path>]   # append the fresh run to this ledger (JSONL)
 *       [--json <path>]             # machine-readable comparison
 *   Exit 0 = nothing gated. Exit 1 = something gated. Exit 2 = cannot compare
 *   (missing or wrong-kind artifact, corrupt ledger line), which is a repository
 *   defect rather than a probe one.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const REPEATED_KIND = 'recorded-probe-stability-run';

// A rate needs a sample before it is a finding. Below this many nights the flake
// rate is printed and the gate stays out of the way: five nights is 15 attempts at
// the default repeat, and a rate measured over fewer than that is mostly noise that
// would make the nightly job red for no defensible reason.
const MIN_NIGHTS_FOR_RATE_GATE = 5;
// One night in five. A probe that disagrees with itself that often is not a probe
// whose green means anything, and unlike a single flake this is a *property* of the
// probe rather than an incident — so it is the one historical signal worth gating.
const FLAKE_RATE_GATE = 0.2;
// 95% two-sided. Wilson rather than normal-approximation because k is often 0 and
// the normal interval collapses to zero width there, which would turn "never seen
// disagree" into "cannot possibly disagree" — exactly the overclaim to avoid.
const WILSON_Z = 1.959964;

// Timing: a slowdown must be large RELATIVE to a baseline that was already long
// enough to measure, and large in absolute terms. Without the floor, a probe that
// takes 40 ms and one night takes 400 ms reads as a 10x regression, which is noise.
const TIMING_SLOWDOWN_RATIO = 3;
const TIMING_MIN_BASELINE_MS = 500;
const TIMING_MIN_DELTA_MS = 1000;
// Reported, never gated: much faster than its baseline can mean a cache, or it can
// mean the probe stopped doing the work it used to do. Worth a human's eye, not a
// failure, because "faster" is not a regression and guessing which cause it is would
// be exactly the kind of unfalsifiable claim this repository keeps trying to remove.
const TIMING_FASTER_RATIO = 0.25;

// Drift: the step threshold above catches a probe that jumped, and nothing catches
// one that creeps. A creep has to be measured against the probe's OWN distribution
// over many nights, so the rule is distributional rather than a ratio of two single
// numbers: the recent median must sit above 90% of everything the probe has ever
// recorded, AND be at least 1.5x the earlier median, from a baseline long enough that
// 1.5x is not a millisecond effect. Fewer than four comparable nights is not a
// history; it is two numbers and a mood.
const MIN_NIGHTS_FOR_DRIFT_GATE = 4;
const DRIFT_RECENT_NIGHTS = 2;
const DRIFT_RATIO = 1.5;
const DRIFT_RISING_RATIO = 1.25;
const DRIFT_MIN_BASELINE_MS = 100;
// Percentiles need per-run samples, and a pooled sample of a few values says nothing.
const DRIFT_MIN_RECENT_SAMPLES = 2;
const DRIFT_MIN_BASELINE_SAMPLES = 4;

function parseArgs(argv) {
    const args = {
        fresh: resolve(repoRoot, 'probe_stability_report.json'),
        recording: resolve(repoRoot, 'evidence', 'probe_stability_report.json'),
        history: null,
        jsonPath: null
    };
    for (let i = 2; i < argv.length; i += 1) {
        if (argv[i] === '--fresh') args.fresh = resolve(repoRoot, argv[i + 1]);
        else if (argv[i] === '--recording') args.recording = resolve(repoRoot, argv[i + 1]);
        else if (argv[i] === '--append-history') args.history = resolve(repoRoot, argv[i + 1]);
        else if (argv[i] === '--json') args.jsonPath = resolve(repoRoot, argv[i + 1]);
    }
    return args;
}

function loadRepeatedRun(path, label) {
    if (!existsSync(path)) {
        console.error(`CANNOT COMPARE — ${label} is missing: ${path}`);
        console.error('  fresh:     node tools/verification/run_probe_suite.mjs --repeat 3 --json <path>');
        console.error('  recording: node tools/verification/run_probe_suite.mjs --repeat 3 --json evidence/probe_stability_report.json');
        process.exit(2);
    }
    const report = JSON.parse(readFileSync(path, 'utf8'));
    if (report.kind !== REPEATED_KIND || !(Number(report.repeat) > 1)) {
        console.error(`CANNOT COMPARE — ${label} is not a repeated run: kind ${JSON.stringify(report.kind)}, `
            + `repeat ${JSON.stringify(report.repeat)}. A single-run artifact cannot be compared for `
            + 'determinism; re-record with --repeat n.');
        process.exit(2);
    }
    return report;
}

function verdictsOf(probe) {
    const verdicts = Array.isArray(probe.verdicts) ? probe.verdicts : [];
    return verdicts.length > 0 ? verdicts : [probe.verdict];
}

const stable = verdicts => new Set(verdicts).size === 1;
const sequence = verdicts => verdicts.join(', ');

/**
 * Compare tonight against the recording. Every probe on either side is placed on
 * the report: a probe that exists on only one side is named rather than skipped,
 * because a suite that quietly grew or shrank would otherwise look like agreement.
 */
export function compare(fresh, recording) {
    const rows = [];
    const names = [...new Set([...recording.probes, ...fresh.probes].map(probe => probe.name))].sort();
    for (const name of names) {
        const was = recording.probes.find(probe => probe.name === name);
        const now = fresh.probes.find(probe => probe.name === name);
        if (!now) {
            rows.push({ name, status: 'DROPPED', detail: `in the recording (${sequence(verdictsOf(was))}) but not in tonight's run` });
            continue;
        }
        if (!was) {
            rows.push({ name, status: 'NEW', detail: `not in the recording; tonight ${sequence(verdictsOf(now))}` });
            continue;
        }
        const wasVerdicts = verdictsOf(was);
        const nowVerdicts = verdictsOf(now);
        if (!stable(nowVerdicts)) {
            rows.push({
                name,
                status: 'REGRESSION',
                detail: `intermittent now (${sequence(nowVerdicts)}); the recording had ${sequence(wasVerdicts)}`,
                historical: sequence(wasVerdicts),
                current: sequence(nowVerdicts)
            });
        } else if (now.verdict === 'FAILED') {
            rows.push({
                name,
                status: 'REGRESSION',
                detail: `fails consistently now (${sequence(nowVerdicts)}); the recording had ${sequence(wasVerdicts)}`,
                historical: sequence(wasVerdicts),
                current: sequence(nowVerdicts)
            });
        } else if (was.verdict === 'PASSED' && now.verdict !== 'PASSED') {
            rows.push({
                name,
                status: 'REGRESSION',
                detail: `proved its claim in the recording (${sequence(wasVerdicts)}) but not tonight `
                    + `(${sequence(nowVerdicts)}) — the proof was lost, which is either a broke probe or an `
                    + 'environment that lost what the probe needs',
                historical: sequence(wasVerdicts),
                current: sequence(nowVerdicts)
            });
        } else {
            rows.push({ name, status: 'OK', detail: sequence(nowVerdicts) });
        }
    }
    return rows;
}

function readLedger(path) {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter(line => line.trim() !== '')
        .map((line, index) => {
            try {
                return JSON.parse(line);
            } catch (error) {
                // A truncated line is a real corruption, and silently dropping it
                // would hide exactly the kind of gap this ledger exists to expose.
                console.error(`CANNOT COMPARE — ${path} line ${index + 1} is not JSON: ${error.message}`);
                process.exit(2);
            }
        });
}

/** One JSONL entry per repeated run: what each probe was asked and what it said. */
export function ledgerEntry(report) {
    const probes = {};
    for (const probe of report.probes) {
        probes[probe.name] = { verdicts: verdictsOf(probe), durationMs: probe.durationMs };
    }
    return {
        recordedAt: report.recordedAt,
        node: report.node,
        platform: report.platform,
        repeat: report.repeat,
        engine: report.engine || null,
        probes
    };
}

/** Nights are the trial, not attempts: a night's attempts are not independent. */
export function wilsonInterval(disagreements, nights, z = WILSON_Z) {
    if (nights === 0) return { lower: 0, upper: 1 };
    const p = disagreements / nights;
    const denominator = 1 + (z * z) / nights;
    const center = (p + (z * z) / (2 * nights)) / denominator;
    const half = (z / denominator) * Math.sqrt((p * (1 - p)) / nights + (z * z) / (4 * nights * nights));
    return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

// Exported so the dossier quotes the same thresholds the gate applies, instead of
// restating them in prose and drifting from the code that enforces them.
export const DRIFT_LIMITS = {
    minNights: MIN_NIGHTS_FOR_DRIFT_GATE,
    recentNights: DRIFT_RECENT_NIGHTS,
    ratio: DRIFT_RATIO,
    risingRatio: DRIFT_RISING_RATIO,
    minBaselineMs: DRIFT_MIN_BASELINE_MS
};

/** Linear-interpolation quantile over an ascending array (numpy's default method). */
function quantile(sorted, q) {
    if (sorted.length === 0) return null;
    const position = (sorted.length - 1) * q;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

const median = values => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * The ledger's whole reason to exist: aggregate every night so a probe that
 * disagrees with itself occasionally stops being invisible, and so the number it
 * disagrees at comes with an interval instead of a vibe.
 */
export function ledgerSummary(entries, rosterNames) {
    const perProbe = new Map();
    for (const entry of entries) {
        for (const [name, data] of Object.entries(entry.probes || {})) {
            const record = perProbe.get(name) || {
                name, nights: 0, attempts: 0, disagreementNights: 0, verdicts: {}, durationsMs: []
            };
            const verdicts = Array.isArray(data.verdicts) ? data.verdicts : [];
            record.nights += 1;
            record.attempts += verdicts.length;
            if (new Set(verdicts).size > 1) record.disagreementNights += 1;
            for (const verdict of verdicts) record.verdicts[verdict] = (record.verdicts[verdict] || 0) + 1;
            if (typeof data.durationMs === 'number') record.durationsMs.push(data.durationMs);
            perProbe.set(name, record);
        }
    }
    const probes = [...perProbe.values()].map(record => ({
        ...record,
        flakeRate: record.nights === 0 ? 0 : record.disagreementNights / record.nights,
        flakeInterval: wilsonInterval(record.disagreementNights, record.nights),
        medianDurationMs: median(record.durationsMs)
    })).sort((a, b) => b.disagreementNights - a.disagreementNights || a.name.localeCompare(b.name));
    return {
        nights: entries.length,
        attempts: probes.reduce((total, probe) => total + probe.attempts, 0),
        probes,
        everIntermittent: probes.filter(probe => probe.disagreementNights > 0),
        // The gate condition, stated once so the console, the JSON and the dossier
        // cannot disagree about which probes crossed it.
        rateGated: probes.filter(probe => probe.nights >= MIN_NIGHTS_FOR_RATE_GATE && probe.flakeRate >= FLAKE_RATE_GATE),
        neverRecorded: rosterNames.filter(name => !perProbe.has(name))
    };
}

const comparable = (a, b) => Boolean(a && b)
    && a.platform === b.platform
    && String(a.node || '').split('.')[0] === String(b.node || '').split('.')[0];

const asReport = entry => ({
    node: entry.node,
    platform: entry.platform,
    probes: Object.entries(entry.probes || {}).map(([name, data]) => ({ name, durationMs: data.durationMs }))
});

/**
 * Per-probe duration comparison against a baseline drawn from comparable nights.
 * `current` is a repeated run or a ledger entry; `baselineEntries` are ledger entries
 * to draw the baseline from. Sharing this between the nightly gate and the dossier
 * means the document and the gate cannot disagree about what counted as slower.
 */
export function timingComparison(current, baselineEntries, recording = null) {
    // `current` is a repeated-run report (probes as an array) or a ledger entry
    // (probes keyed by name). Testing the probes field for array-ness rather than
    // for presence matters: a ledger entry HAS a probes field, so a presence test
    // would pass it through unmapped and iterate an object.
    const now = Array.isArray(current.probes) ? current : asReport(current);
    const entries = baselineEntries.map(entry => (entry.probes && !Array.isArray(entry.probes) ? asReport(entry) : entry));
    const rows = [];
    for (const probe of now.probes || []) {
        const baselineSamples = entries
            .filter(entry => comparable(entry, now))
            .map(entry => (entry.probes || []).find(item => item.name === probe.name))
            .filter(item => item && typeof item.durationMs === 'number')
            .map(item => item.durationMs);
        let source = `${baselineSamples.length} comparable night(s)`;
        let baselineMs = median(baselineSamples);
        if (baselineMs === null && recording) {
            const recorded = recording.probes.find(item => item.name === probe.name);
            if (recorded && typeof recorded.durationMs === 'number' && comparable(recording, now)) {
                baselineMs = recorded.durationMs;
                source = 'the committed recording';
            }
        }
        if (baselineMs === null) {
            rows.push({ name: probe.name, status: 'NOT_COMPARABLE', currentMs: probe.durationMs, detail: 'no same-platform, same-Node-major baseline to compare against' });
            continue;
        }
        const ratio = baselineMs === 0 ? null : probe.durationMs / baselineMs;
        if (ratio !== null && ratio >= TIMING_SLOWDOWN_RATIO && baselineMs >= TIMING_MIN_BASELINE_MS
            && probe.durationMs - baselineMs >= TIMING_MIN_DELTA_MS) {
            rows.push({
                name: probe.name,
                status: 'SLOWER',
                currentMs: probe.durationMs,
                baselineMs,
                ratio,
                source,
                detail: `${ratio.toFixed(1)}x slower than ${source} (${Math.round(baselineMs)} ms -> ${probe.durationMs} ms)`
            });
        } else if (ratio !== null && ratio <= TIMING_FASTER_RATIO && baselineMs >= TIMING_MIN_BASELINE_MS) {
            rows.push({
                name: probe.name,
                status: 'FASTER',
                currentMs: probe.durationMs,
                baselineMs,
                ratio,
                source,
                detail: `${ratio.toFixed(2)}x its baseline (${Math.round(baselineMs)} ms -> ${probe.durationMs} ms) — worth a look, `
                    + 'not a failure: a cache explains this, and so would a probe that stopped doing work'
            });
        } else {
            rows.push({ name: probe.name, status: 'OK', currentMs: probe.durationMs, baselineMs, ratio, source, detail: 'within baseline' });
        }
    }
    return { rows, slower: rows.filter(row => row.status === 'SLOWER'), faster: rows.filter(row => row.status === 'FASTER'), notComparable: rows.filter(row => row.status === 'NOT_COMPARABLE') };
}

/**
 * Slow-drift analysis: pool each probe's PER-RUN durations across comparable nights
 * and ask whether the recent nights sit above the probe's own history. This is the
 * only question the ledger can answer that a single night's ratio cannot — a probe
 * that creeps 10% a night never trips a 3x step gate and is obvious here.
 *
 * Nights recorded before the runner emitted per-run durations are excluded, and the
 * count of them is returned rather than hidden: a sample that quietly shrank is the
 * kind of silence this ledger exists to break.
 */
export function durationDrift(reference, entries) {
    const now = Array.isArray(reference.probes) ? reference : asReport(reference);
    const comparableNights = entries
        .filter(entry => comparable(entry, now))
        .sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
    const withDurations = comparableNights.filter(entry => Object.values(entry.probes || {})
        .some(data => Array.isArray(data.durationsMs) && data.durationsMs.length > 0));
    const excluded = comparableNights.length - withDurations.length;

    if (withDurations.length < MIN_NIGHTS_FOR_DRIFT_GATE) {
        return {
            status: 'INSUFFICIENT',
            comparableNights: comparableNights.length,
            nightsWithPerRunDurations: withDurations.length,
            excludedNightsWithoutPerRunDurations: excluded,
            neededNights: MIN_NIGHTS_FOR_DRIFT_GATE,
            // Every field a caller reads is present in every branch. A "not yet
            // measurable" result that omitted them crashed the report loop the first
            // time this branch ran, which is exactly the kind of bug a shape change
            // between branches produces.
            rows: [],
            drifted: [],
            rising: []
        };
    }

    const recentNights = withDurations.slice(-DRIFT_RECENT_NIGHTS);
    const baselineNights = withDurations.slice(0, -DRIFT_RECENT_NIGHTS);
    const rows = [];
    for (const probe of now.probes || []) {
        const samples = nights => nights.flatMap(entry => {
            const data = (entry.probes || {})[probe.name];
            return data && Array.isArray(data.durationsMs) ? data.durationsMs : [];
        }).sort((a, b) => a - b);
        const baseline = samples(baselineNights);
        const recent = samples(recentNights);
        if (baseline.length < DRIFT_MIN_BASELINE_SAMPLES || recent.length < DRIFT_MIN_RECENT_SAMPLES) continue;
        const baselineMedian = quantile(baseline, 0.5);
        const baselineP90 = quantile(baseline, 0.9);
        const recentMedian = quantile(recent, 0.5);
        if (baselineMedian < DRIFT_MIN_BASELINE_MS) continue;
        const ratio = recentMedian / baselineMedian;
        const row = {
            name: probe.name,
            baselineNights: baselineNights.length,
            recentNights: recentNights.length,
            baselineSamples: baseline.length,
            recentSamples: recent.length,
            baselineMedianMs: baselineMedian,
            baselineP90Ms: baselineP90,
            recentMedianMs: recentMedian,
            recentMaxMs: Math.max(...recent),
            ratio
        };
        if (ratio >= DRIFT_RATIO && recentMedian > baselineP90) {
            rows.push({
                ...row,
                status: 'DRIFT',
                detail: `recent median ${Math.round(recentMedian)} ms vs baseline median ${Math.round(baselineMedian)} ms `
                    + `(${ratio.toFixed(2)}x, above the probe's own p90 of ${Math.round(baselineP90)} ms) over the last `
                    + `${recentNights.length} of ${withDurations.length} comparable nights`
            });
        } else if (ratio >= DRIFT_RISING_RATIO) {
            rows.push({
                ...row,
                status: 'RISING',
                detail: `${ratio.toFixed(2)}x its earlier median (${Math.round(baselineMedian)} ms -> `
                    + `${Math.round(recentMedian)} ms), below the drift gate — reported, not gated`
            });
        } else {
            rows.push({ ...row, status: 'OK', detail: 'within its own history' });
        }
    }
    return {
        status: 'MEASURED',
        comparableNights: comparableNights.length,
        nightsWithPerRunDurations: withDurations.length,
        excludedNightsWithoutPerRunDurations: excluded,
        neededNights: MIN_NIGHTS_FOR_DRIFT_GATE,
        rows,
        drifted: rows.filter(row => row.status === 'DRIFT'),
        rising: rows.filter(row => row.status === 'RISING')
    };
}

const pct = value => `${(value * 100).toFixed(1)}%`;

function main() {
    const args = parseArgs(process.argv);
    const fresh = loadRepeatedRun(args.fresh, 'the fresh run');
    const recording = loadRepeatedRun(args.recording, 'the committed recording');

    const rows = compare(fresh, recording);
    const regressions = rows.filter(row => row.status === 'REGRESSION');
    const notes = rows.filter(row => row.status === 'DROPPED' || row.status === 'NEW');

    // The baseline is every night recorded BEFORE tonight: comparing a night to
    // itself would report a ratio of exactly 1.0 and call it agreement.
    let historyPath = null;
    let priorNights = [];
    let ledger = [];
    if (args.history) {
        historyPath = args.history;
        priorNights = readLedger(historyPath);
        const entry = ledgerEntry(fresh);
        const already = priorNights.some(item => item.recordedAt === entry.recordedAt);
        if (!already) {
            mkdirSync(dirname(historyPath), { recursive: true });
            appendFileSync(historyPath, `${JSON.stringify(entry)}\n`);
        }
        ledger = already ? priorNights : [...priorNights, entry];
    } else {
        // Without an explicit ledger, the committed one is read so the cross-night
        // picture is reported rather than silently absent.
        const defaultLedger = resolve(repoRoot, 'evidence', 'probe_stability_ledger.jsonl');
        if (existsSync(defaultLedger)) {
            historyPath = defaultLedger;
            ledger = readLedger(defaultLedger);
            priorNights = ledger;
        }
    }
    const summary = ledgerSummary(ledger, recording.probes.map(probe => probe.name));
    const timing = timingComparison(fresh, priorNights, recording);
    const drift = durationDrift(fresh, priorNights);

    console.log('============================================================');
    console.log('STABILITY REGRESSION CHECK');
    console.log('============================================================');
    console.log(`  fresh:     ${args.fresh}`);
    console.log(`  recording: ${args.recording}`);
    console.log(`  recording taken ${recording.recordedAt} on Node ${recording.node} / ${recording.platform}, `
        + `up to ${recording.repeat}x per probe`);
    console.log(`  fresh run taken ${fresh.recordedAt} on Node ${fresh.node} / ${fresh.platform}, `
        + `up to ${fresh.repeat}x per probe`);
    if (fresh.engine || recording.engine) {
        console.log(`  engine:    recording: ${recording.engine || 'not recorded'}`);
        console.log(`             fresh:     ${fresh.engine || 'not recorded'}`);
    }
    console.log('');

    for (const row of rows) {
        console.log(`  ${String(row.status).padEnd(11)} ${row.name.padEnd(44)} ${row.detail}`);
    }

    console.log('');
    console.log('------------------------------------------------------------');
    console.log('  VERDICT REGRESSIONS above are GATED: an intermittent or newly-failing probe, or one');
    console.log('  that has lost the proof the recording recorded. Suite drift (NEW / DROPPED) is not.');
    console.log('');
    console.log(`  TIMING — compared only against nights with the same platform and Node major, because a`);
    console.log(`  ratio across two different machines measures the machines. Threshold: >= ${TIMING_SLOWDOWN_RATIO}x, `
        + `from a baseline >= ${TIMING_MIN_BASELINE_MS} ms, delta >= ${TIMING_MIN_DELTA_MS} ms.`);
    if (timing.slower.length === 0) {
        console.log(`    no probe ran slower than its baseline (${timing.notComparable.length} probe(s) had no comparable baseline)`);
    } else {
        for (const row of timing.slower) console.log(`    SLOWER  ${row.name.padEnd(44)} ${row.detail} — GATED`);
    }
    for (const row of timing.faster) console.log(`    FASTER  ${row.name.padEnd(44)} ${row.detail} — reported, not gated`);

    console.log('');
    console.log(`  DRIFT — slow movement, measured against each probe's OWN pooled per-run durations over`);
    console.log(`  comparable nights. Gate: the recent ${DRIFT_RECENT_NIGHTS}-night median >= ${DRIFT_RATIO}x the earlier median, AND above the`);
    console.log(`  probe's own p90, from a baseline >= ${DRIFT_MIN_BASELINE_MS} ms. Needs >= ${MIN_NIGHTS_FOR_DRIFT_GATE} comparable nights with per-run durations.`);
    if (drift.status === 'INSUFFICIENT') {
        console.log(`    not yet measurable: ${drift.nightsWithPerRunDurations} comparable night(s) carry per-run durations, `
            + `${MIN_NIGHTS_FOR_DRIFT_GATE} needed`);
        console.log(`    (${drift.excludedNightsWithoutPerRunDurations} night(s) predate per-run duration recording)`);
    } else if (drift.drifted.length > 0) {
        for (const row of drift.drifted) console.log(`    DRIFT   ${row.name.padEnd(44)} ${row.detail} — GATED`);
    } else {
        console.log(`    no probe is drifting (${drift.rows.length} probe(s) had enough samples to judge, `
            + `${drift.nightsWithPerRunDurations} comparable nights)`);
    }
    for (const row of drift.rising || []) console.log(`    RISING  ${row.name.padEnd(44)} ${row.detail}`);
    // Stated in the measured case too, not only when the sample came up short: a pooled
    // distribution is only as broad as the nights that fed it, and a reviewer deciding
    // what a clean drift result is worth needs to know how many nights it covers.
    if (drift.status === 'MEASURED' && drift.excludedNightsWithoutPerRunDurations > 0) {
        console.log(`    note: ${drift.excludedNightsWithoutPerRunDurations} of ${drift.comparableNights} comparable `
            + 'night(s) predate per-run duration recording and are excluded from the pooled sample');
    }

    console.log('');
    console.log('------------------------------------------------------------');
    if (summary.nights > 0) {
        console.log(`  LEDGER — ${summary.nights} repeated run(s), ${summary.attempts} probe attempts recorded`);
        if (summary.everIntermittent.length === 0) {
            const bound = wilsonInterval(0, summary.nights);
            console.log('  No probe has ever disagreed with itself across the recorded ledger.');
            console.log(`  Over ${summary.nights} clean night(s) that bounds any probe's flake rate at ${pct(bound.upper)} (95% Wilson).`);
            console.log('  It is a bound on a sample, not a proof of determinism.');
        } else {
            console.log('  Probes observed disagreeing with themselves on at least one recorded night:');
            for (const probe of summary.everIntermittent) {
                const interval = probe.flakeInterval;
                const gated = summary.rateGated.includes(probe) ? ' — GATED (rate)' : '';
                console.log(`    - ${probe.name}: ${probe.disagreementNights} of ${probe.nights} night(s), `
                    + `${pct(probe.flakeRate)} observed, 95% interval ${pct(interval.lower)}–${pct(interval.upper)}${gated}`);
            }
            if (summary.rateGated.length === 0) {
                console.log(`  The rate gate needs >= ${MIN_NIGHTS_FOR_RATE_GATE} nights (and a rate >= ${pct(FLAKE_RATE_GATE)});`);
                console.log('  below that the rate is reported and the gate stays out of the way.');
            }
        }
        if (summary.neverRecorded.length > 0) {
            console.log(`  Never recorded in the ledger (${summary.neverRecorded.length}) — nothing is known about`);
            console.log('  whether these are deterministic:');
            for (const name of summary.neverRecorded) console.log(`    - ${name}`);
        }
    } else {
        console.log('  LEDGER — absent or empty, so nothing is known about intermittency beyond tonight.');
        console.log('  Record one with: --append-history evidence/probe_stability_ledger.jsonl');
    }
    console.log('============================================================');

    const payload = {
        kind: 'probe-stability-comparison',
        note: 'A comparison of one fresh repeated run against the committed recording, plus the rolling '
            + 'ledger of repeated runs. Gated: verdict regressions in tonight\'s run, timing regressions that '
            + 'survive the comparability check, and a flake rate measured over enough nights to be a finding. '
            + 'Reported only: everything historical, because a recorded fact cannot be failed away.',
        comparedAt: new Date().toISOString(),
        fresh: { path: args.fresh, recordedAt: fresh.recordedAt, node: fresh.node, platform: fresh.platform, repeat: fresh.repeat, engine: fresh.engine || null },
        recording: { path: args.recording, recordedAt: recording.recordedAt, node: recording.node, platform: recording.platform, repeat: recording.repeat, engine: recording.engine || null },
        thresholds: {
            flakeRateGate: FLAKE_RATE_GATE,
            minNightsForRateGate: MIN_NIGHTS_FOR_RATE_GATE,
            wilsonZ: WILSON_Z,
            timingSlowdownRatio: TIMING_SLOWDOWN_RATIO,
            timingMinBaselineMs: TIMING_MIN_BASELINE_MS,
            timingMinDeltaMs: TIMING_MIN_DELTA_MS,
            driftRatio: DRIFT_RATIO,
            driftRecentNights: DRIFT_RECENT_NIGHTS,
            driftMinBaselineMs: DRIFT_MIN_BASELINE_MS,
            minNightsForDriftGate: MIN_NIGHTS_FOR_DRIFT_GATE
        },
        drift: {
            status: drift.status,
            comparableNights: drift.comparableNights,
            nightsWithPerRunDurations: drift.nightsWithPerRunDurations,
            excludedNightsWithoutPerRunDurations: drift.excludedNightsWithoutPerRunDurations,
            neededNights: drift.neededNights,
            drifted: drift.rows.filter(row => row.status === 'DRIFT').map(row => ({
                name: row.name,
                baselineMedianMs: row.baselineMedianMs,
                baselineP90Ms: row.baselineP90Ms,
                recentMedianMs: row.recentMedianMs,
                ratio: row.ratio
            })),
            rising: drift.rising.map(row => ({ name: row.name, ratio: row.ratio, detail: row.detail }))
        },
        regressions: regressions.map(row => ({ name: row.name, detail: row.detail, historical: row.historical, current: row.current })),
        timing: {
            slower: timing.slower.map(row => ({ name: row.name, currentMs: row.currentMs, baselineMs: row.baselineMs, ratio: row.ratio, source: row.source })),
            faster: timing.faster.map(row => ({ name: row.name, currentMs: row.currentMs, baselineMs: row.baselineMs, ratio: row.ratio })),
            notComparable: timing.notComparable.map(row => row.name)
        },
        suiteDrift: notes.map(row => ({ name: row.name, status: row.status, detail: row.detail })),
        ledger: {
            path: historyPath,
            nights: summary.nights,
            attempts: summary.attempts,
            everIntermittent: summary.everIntermittent.map(probe => ({
                name: probe.name,
                nights: probe.nights,
                attempts: probe.attempts,
                disagreementNights: probe.disagreementNights,
                flakeRate: probe.flakeRate,
                flakeInterval: probe.flakeInterval,
                verdicts: probe.verdicts
            })),
            rateGated: summary.rateGated.map(probe => probe.name),
            neverRecorded: summary.neverRecorded
        },
        rows
    };
    if (args.jsonPath) {
        writeFileSync(args.jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
        console.log(`  wrote ${args.jsonPath}`);
    }

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
        const cleanBound = wilsonInterval(0, summary.nights);
        const markdown = [
            '## Stability regression check',
            '',
            `Fresh run: ${fresh.recordedAt} — up to ${fresh.repeat}× per probe, Node ${fresh.node} / ${fresh.platform}`,
            `Recording: ${recording.recordedAt} — up to ${recording.repeat}× per probe`,
            `Ledger: ${summary.nights} repeated run(s), ${summary.attempts} probe attempts`,
            '',
            `**${regressions.length} verdict regression(s)** — a probe that was repeatable and now disagrees `
                + 'with itself, fails, or has lost the proof the recording recorded.',
            '',
            ...(regressions.length > 0
                ? ['| Probe | Was | Now |', '|---|---|---|', ...regressions.map(row => `| \`${row.name}\` | ${row.historical} | ${row.current} |`)]
                : ['No probe regressed against the recording.']),
            '',
            `**${timing.slower.length} timing regression(s)** — ≥ ${TIMING_SLOWDOWN_RATIO}× a baseline drawn from `
                + 'same-platform, same-Node-major nights only'
                + (timing.notComparable.length > 0 ? `; ${timing.notComparable.length} probe(s) had no comparable baseline.` : '.'),
            '',
            ...(timing.slower.length > 0
                ? ['| Probe | Baseline | Now |', '|---|---|---|', ...timing.slower.map(row => `| \`${row.name}\` | ${Math.round(row.baselineMs)} ms | ${row.currentMs} ms |`), '']
                : []),
            `**${drift.drifted ? drift.drifted.length : 0} timing drift(s)** — `
                + (drift.status === 'INSUFFICIENT'
                    ? `${drift.nightsWithPerRunDurations} comparable night(s) carry per-run durations and a drift needs >= `
                        + `${MIN_NIGHTS_FOR_DRIFT_GATE}, so slow movement is not yet measurable.`
                    : (drift.drifted.length > 0
                        ? 'the recent median sits above the probe\'s own p90.'
                        : `no probe's recent ${DRIFT_RECENT_NIGHTS}-night median sits above its own p90.`)),
            '',
            ...(summary.everIntermittent.length > 0
                ? ['**Ever intermittent in the ledger:**', '',
                    '| Probe | Nights | Attempts | Disagreement nights | Observed rate | 95% Wilson |',
                    '|---|---|---|---|---|---|',
                    ...summary.everIntermittent.map(probe => `| \`${probe.name}\` | ${probe.nights} | ${probe.attempts} | `
                        + `${probe.disagreementNights} | ${pct(probe.flakeRate)} | ${pct(probe.flakeInterval.lower)}–${pct(probe.flakeInterval.upper)} |`),
                    '',
                    summary.rateGated.length > 0
                        ? `**${summary.rateGated.length} probe(s) exceed the ${pct(FLAKE_RATE_GATE)} flake-rate gate over `
                            + `${MIN_NIGHTS_FOR_RATE_GATE}+ nights: ${summary.rateGated.map(probe => '`' + probe.name + '`').join(', ')}.**`
                        : `No probe exceeds the ${pct(FLAKE_RATE_GATE)} flake-rate gate (which needs >= ${MIN_NIGHTS_FOR_RATE_GATE} nights).`]
                : ['**No probe has ever disagreed with itself across the recorded ledger.** '
                    + `Over ${summary.nights} clean night(s) that bounds any probe's flake rate at ${pct(cleanBound.upper)} `
                    + '(95% Wilson) — a bound on a sample, not a proof of determinism.']),
            '',
            ...(notes.length > 0 ? ['**Suite drift:** ' + notes.map(row => `${row.name} (${row.status})`).join(', '), ''] : []),
            ''
        ].join('\n');
        appendFileSync(summaryPath, `${markdown}\n`);
    }

    const drifted = drift.status === 'MEASURED' ? drift.drifted : [];
    const gated = regressions.length + timing.slower.length + summary.rateGated.length + drifted.length;
    if (gated > 0) {
        console.log('');
        console.log(`FAILED — ${regressions.length} verdict regression(s), ${timing.slower.length} step timing regression(s), `
            + `${drifted.length} timing drift(s), ${summary.rateGated.length} rate-gated probe(s).`);
        return 1;
    }
    console.log('');
    console.log(`OK — nothing gated (${rows.length} probes compared${notes.length > 0 ? `, ${notes.length} suite drift note(s)` : ''}`
        + `${timing.notComparable.length > 0 ? `, ${timing.notComparable.length} timing comparison(s) skipped as incomparable` : ''}).`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main());
}
