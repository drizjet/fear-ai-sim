#!/usr/bin/env node
/**
 * tools/verification/fold_stability_ledger.mjs — fold a nightly ledger artifact
 * back into the committed ledger, as one reviewable command.
 *
 * WHY THIS EXISTS. The ledger is what makes an intermittency rarer than the repeat
 * count visible, and it only works if nights accumulate. The nightly job appends its
 * run and uploads the ledger, but CI cannot commit, so a human has to bring the
 * artifact home. Left as "append the JSONL yourself", that step is done rarely, done
 * inconsistently, or done by hand-editing the authority record — and a rate measured
 * over one night bounds nothing useful.
 *
 * WHAT MAKES IT ONE COMMAND. It is a DRY RUN by default: it validates the incoming
 * artifact, shows exactly which nights are new, notes any night in which a probe
 * disagreed with itself, and prints the ledger's numbers before and after — including
 * each affected probe's flake rate and 95% Wilson interval, which is the thing the
 * rate gate will act on. `--write` then applies it. Reviewing and applying are the
 * same command with one flag between them, which is the closest thing to automatic
 * that still leaves a human answering for what entered the record.
 *
 * WHAT IT REFUSES, AND WHY REFUSING IS THE DEFAULT. A fold is a write into the
 * authority record for intermittency, so:
 *   - a malformed entry is refused rather than skipped, because silently dropping a
 *     night hides exactly the gap the ledger exists to expose;
 *   - an entry naming a probe that is not in the committed recording is refused,
 *     because a ledger line from a different tool or suite version would quietly
 *     change every probe's denominators;
 *   - an entry whose recordedAt is already present is skipped, so folding the same
 *     artifact twice cannot inflate the attempt counts;
 *   - a file that is not a ledger at all is refused (exit 2), not treated as empty.
 * A night that makes a probe look worse is NOT refused: that is the finding, not an
 * error, and the nightly job has already gated tonight's run. This tool's job is to
 * get the evidence into the record and show the reviewer the number it moves.
 *
 * A FOLD APPENDS; IT NEVER REWRITES. Every night already in the record is copied as
 * the exact line it had, only new nights are serialized, and the result is written to
 * a staging file whose bytes are verified (line count, every existing line present,
 * every line parseable) before it is renamed over the record. This matters because
 * the ledger is now written by CI as well as by hand: an unattended write into the
 * authority record for intermittency has to be safe without a reviewer watching, and
 * a truncated or reordered ledger would not look like a bad write — it would look
 * like a suite regression.
 *
 * Usage:
 *   node tools/verification/fold_stability_ledger.mjs --from <file-or-dir> [--write]
 *       [--into evidence/probe_stability_ledger.jsonl] [--json <path>]
 *       [--into-ref <git-ref>] [--require-ref <git-ref>]
 *   `--from` may be the JSONL itself or an unzipped artifact directory containing
 *   `probe_stability_ledger.jsonl`.
 *   Exit 0 = folded, or nothing to fold. Exit 2 = refused (unreadable, malformed,
 *   unknown probe), which needs a human, not a retry.
 *
 * --into-ref / --require-ref EXIST SO THAT THE RECORD IS READ BY NODE, NOT BY A SHELL.
 * The nightly CI job folds onto a review branch that may already carry nights a reviewer
 * has not merged, so the target of the fold is a *git ref*, not the working file. The
 * distinction is not cosmetic: reading the ledger through a shell's native-command
 * capture decodes UTF-8 with the console's code page, so a night containing any
 * non-ASCII character (the engine note contains an em dash) does not round-trip — the
 * fold would then refuse its own append-only check, or worse, write the mangled bytes
 * into the record. Node decodes the same bytes correctly, so the ledger is read here.
 *   --into-ref <ref>     read the ledger to append to from this git ref (the review
 *                        branch), instead of from the file at --into
 *   --require-ref <ref>   refuse unless every night present at this ref is present in
 *                        the result (the default branch, whose nights must survive)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ledgerSummary } from './stability_regression.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER_NAME = 'probe_stability_ledger.jsonl';
const RECORDING_PATH = join(repoRoot, 'evidence', 'probe_stability_report.json');

function refuse(message) {
    console.error(`REFUSED — ${message}`);
    process.exit(2);
}

function parseArgs(argv) {
    const args = {
        from: null,
        into: join(repoRoot, 'evidence', LEDGER_NAME),
        intoRef: null,
        requireRef: null,
        write: false,
        jsonPath: null
    };
    for (let i = 2; i < argv.length; i += 1) {
        if (argv[i] === '--from') args.from = resolve(repoRoot, argv[i + 1]);
        else if (argv[i] === '--into') args.into = resolve(repoRoot, argv[i + 1]);
        else if (argv[i] === '--into-ref') args.intoRef = argv[i + 1];
        else if (argv[i] === '--require-ref') args.requireRef = argv[i + 1];
        else if (argv[i] === '--json') args.jsonPath = resolve(repoRoot, argv[i + 1]);
        else if (argv[i] === '--write') args.write = true;
    }
    if (!args.from) refuse('--from <file-or-dir> is required: point it at the downloaded artifact.');
    return args;
}

/**
 * The ledger as committed at a git ref, read from the repository that owns `filePath`.
 * execFileSync decodes stdout as UTF-8, which is what keeps a record containing an em
 * dash intact — see the header note on --into-ref.
 */
/**
 * The same path as the filesystem actually spells it. Both sides of the comparison below
 * have to be canonical or a legal path looks like it is outside the repository: Windows
 * hands out 8.3 short names (`BADANA~1`) for a long parent while git reports the long
 * form, and this repository's own checkout lives under a directory with a space in it.
 */
function canonical(pathname) {
    try {
        return realpathSync.native(pathname);
    } catch {
        // A ledger that does not exist yet is canonicalized through its parent, so a first
        // night (--into pointing at a file the fold is about to create) still compares.
        try {
            return join(realpathSync.native(dirname(pathname)), basename(pathname));
        } catch {
            return resolve(pathname);
        }
    }
}

function ledgerAtRef(ref, filePath) {
    let root;
    try {
        root = canonical(execFileSync('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
    } catch (error) {
        refuse(`could not locate the git repository containing ${filePath}: ${(error.stderr || error.message).toString().trim()}`);
    }
    const rel = relative(root, canonical(filePath)).split('\\').join('/');
    if (rel.startsWith('..')) refuse(`${filePath} is outside the git repository at ${root}.`);
    try {
        return execFileSync('git', ['-C', root, 'show', `${ref}:${rel}`], { encoding: 'utf8' });
    } catch (error) {
        refuse(`could not read ${rel} at ${ref}: ${(error.stderr || error.message).toString().trim()}`);
    }
    return null;
}

/** An artifact directory is the common case: the upload contains several files. */
function locateArtifact(from) {
    if (!existsSync(from)) refuse(`no such path: ${from}`);
    if (statSync(from).isDirectory()) {
        const candidates = readdirSync(from).filter(name => name.endsWith('.jsonl'));
        if (candidates.length === 0) {
            refuse(`${from} contains no .jsonl ledger; expected ${LEDGER_NAME} in the unzipped artifact.`);
        }
        if (candidates.length > 1) {
            refuse(`${from} contains ${candidates.length} .jsonl files (${candidates.join(', ')}); pass the one to fold.`);
        }
        return join(from, candidates[0]);
    }
    return from;
}

function readJsonl(path, label) {
    return readLedgerText(readFileSync(path, 'utf8'), label, path);
}

function readLedgerText(text, label, source) {
    // A repeated RUN is pretty-printed JSON; a ledger is JSONL. Pointing --from at the
    // former is the likeliest mistake a person makes here, and "line 1 is not JSON"
    // would send them looking for corruption that is not there.
    if (/^\s*\{[\s\S]*\n\s*"/.test(text) && text.includes('"kind": "recorded-probe-stability-run"')) {
        refuse(`${source} is a repeated-run report, not a ledger. The ledger is JSONL: one line per night. `
            + 'To add this run as a night, use: node tools/verification/stability_regression.mjs --fresh '
            + `<path> --append-history ${LEDGER_NAME}`);
    }
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) refuse(`${label} is empty: ${source}`);
    return lines.map((line, index) => {
        try {
            // The RAW line travels with the parsed entry. A fold appends to this
            // record, so the bytes of every night already in it must survive the
            // write untouched — re-serializing a parsed object would be a rewrite
            // that merely happens to look equivalent, and this file is the
            // denominator of every rate the repository reports. The write path
            // below is built so that a pre-existing night is copied, not rebuilt.
            return { line, entry: JSON.parse(line) };
        } catch (error) {
            refuse(`${label} line ${index + 1} is not JSON (${error.message}). A truncated artifact is not a `
                + 'shorter history — fix or re-download it.');
        }
        return null;
    });
}

/**
 * Validate an entry before it can enter the record. Deliberately strict: the ledger
 * is the denominator of every rate this repository reports, so an entry that is
 * merely plausible is not good enough.
 */
function validateEntry(entry, index, knownProbes, source) {
    const where = `${source} entry ${index + 1}`;
    if (typeof entry.recordedAt !== 'string' || Number.isNaN(Date.parse(entry.recordedAt))) {
        refuse(`${where} has no parseable recordedAt (${JSON.stringify(entry.recordedAt)}).`);
    }
    if (typeof entry.platform !== 'string' || typeof entry.node !== 'string') {
        refuse(`${where} does not name its platform and node; without them a duration comparison `
            + 'would measure machines rather than probes.');
    }
    if (!(Number(entry.repeat) > 1)) {
        refuse(`${where} has repeat ${JSON.stringify(entry.repeat)}; a single run is not a repeated run and `
            + 'cannot support a determinism or rate claim.');
    }
    if (!entry.probes || typeof entry.probes !== 'object' || Array.isArray(entry.probes)) {
        refuse(`${where} has no probes map.`);
    }
    const names = Object.keys(entry.probes);
    if (names.length === 0) refuse(`${where} recorded no probes.`);
    const unknown = names.filter(name => !knownProbes.has(name));
    if (unknown.length > 0) {
        refuse(`${where} names ${unknown.length} probe(s) absent from the committed recording `
            + `(${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ', …' : ''}). Folding them would change every `
            + 'other probe\'s denominators from a suite that is not the recorded one.');
    }
    for (const [name, data] of Object.entries(entry.probes)) {
        if (!data || !Array.isArray(data.verdicts) || data.verdicts.length === 0) {
            refuse(`${where} probe ${name} has no verdict sequence.`);
        }
        if (data.durationsMs !== undefined && !Array.isArray(data.durationsMs)) {
            refuse(`${where} probe ${name} has a durationsMs that is not an array.`);
        }
    }
    return entry;
}

const pct = value => `${(value * 100).toFixed(1)}%`;

/** What a reviewer needs about one night, for the pull request that carries it. */
function nightSummary(entry) {
    const probes = entry.probes || {};
    return {
        recordedAt: entry.recordedAt,
        node: entry.node,
        platform: entry.platform,
        repeat: entry.repeat,
        probes: Object.keys(probes).length,
        disagreeing: Object.entries(probes)
            .filter(([, data]) => new Set(data.verdicts).size > 1)
            .map(([name, data]) => `${name} (${data.verdicts.join(', ')})`)
    };
}

function main() {
    const args = parseArgs(process.argv);
    const artifactPath = locateArtifact(args.from);
    const incoming = readJsonl(artifactPath, 'artifact');
    const existing = args.intoRef
        ? readLedgerText(ledgerAtRef(args.intoRef, args.into), `ledger at ${args.intoRef}`, args.intoRef)
        : (existsSync(args.into) ? readJsonl(args.into, 'committed ledger') : []);
    if (args.intoRef) console.log(`  target:      the ledger at ${args.intoRef} (${existing.length} night(s))`);

    if (!existsSync(RECORDING_PATH)) refuse(`the committed recording is missing: ${RECORDING_PATH}`);
    const recording = JSON.parse(readFileSync(RECORDING_PATH, 'utf8'));
    const knownProbes = new Set((recording.probes || []).map(probe => probe.name));

    const validated = incoming.map((item, index) => validateEntry(item.entry, index, knownProbes, 'artifact'));
    // De-duplicate inside the artifact as well: a doubled line would double-count a night.
    const seen = new Set();
    const unique = [];
    for (const entry of validated) {
        if (seen.has(entry.recordedAt)) {
            console.log(`  note: artifact repeats recordedAt ${entry.recordedAt}; keeping the first, since a night `
                + 'counted twice is a night counted wrong.');
            continue;
        }
        seen.add(entry.recordedAt);
        unique.push(entry);
    }

    const existingTimes = new Set(existing.map(item => item.entry.recordedAt));
    const toAdd = unique.filter(entry => !existingTimes.has(entry.recordedAt));
    const duplicates = unique.filter(entry => existingTimes.has(entry.recordedAt));

    // --require-ref: nights that must survive this fold. The check is against the RESULT
    // rather than the inputs, because the review branch can legitimately be *behind* the
    // default branch (a night landed on the default branch while a review was open) —
    // the artifact then re-adds what the branch is missing, and the union is still a
    // superset. What must never happen is a night that exists at the ref being absent
    // from what is about to be written.
    let required = null;
    if (args.requireRef) {
        required = readLedgerText(ledgerAtRef(args.requireRef, args.into), `ledger at ${args.requireRef}`, args.requireRef);
        const resulting = new Set([...existing.map(item => item.entry.recordedAt), ...toAdd.map(entry => entry.recordedAt)]);
        const missing = required.map(item => item.entry.recordedAt).filter(time => !resulting.has(time));
        if (missing.length > 0) {
            refuse(`${missing.length} night(s) present at ${args.requireRef} are missing from the folded ledger `
                + `(${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}). A fold appends; it must not drop a night.`);
        }
    }

    const rosterNames = (recording.probes || []).map(probe => probe.name);
    const existingEntries = existing.map(item => item.entry);
    const mergedEntries = [...existingEntries, ...toAdd];
    const before = ledgerSummary(existingEntries, rosterNames);
    const after = ledgerSummary(mergedEntries, rosterNames);
    const withoutPerRun = unique.filter(entry => !Object.values(entry.probes).some(data => Array.isArray(data.durationsMs))).length;
    if (required) {
        console.log(`  required:    all ${required.length} night(s) at ${args.requireRef} survive this fold`);
    }

    console.log('============================================================');
    console.log('FOLD A NIGHTLY LEDGER ARTIFACT');
    console.log('============================================================');
    console.log(`  artifact: ${artifactPath}`);
    console.log(`  into:     ${args.into}`);
    console.log(`  artifact nights: ${unique.length} | already present: ${duplicates.length} | new: ${toAdd.length}`);
    console.log('');

    if (toAdd.length === 0) {
        console.log('  Nothing to fold — every night in this artifact is already in the ledger.');
    } else {
        for (const entry of toAdd.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
            const disagreeing = Object.entries(entry.probes)
                .filter(([, data]) => new Set(data.verdicts).size > 1)
                .map(([name, data]) => `${name} (${data.verdicts.join(', ')})`);
            console.log(`  + ${entry.recordedAt}  ${entry.node} / ${entry.platform}  up to ${entry.repeat}x  `
                + `${Object.keys(entry.probes).length} probes`);
            console.log(`      verdicts: ${Object.values(entry.probes).filter(d => new Set(d.verdicts).size === 1 && d.verdicts[0] === 'PASSED').length} clean, `
                + `${Object.values(entry.probes).filter(d => new Set(d.verdicts).size === 1 && d.verdicts[0] !== 'PASSED').length} consistently not-passed`);
            console.log(disagreeing.length === 0
                ? '      no probe disagreed with itself on this night'
                : `      DISAGREEMENTS on this night: ${disagreeing.join('; ')}`);
            if (!Object.values(entry.probes).some(data => Array.isArray(data.durationsMs))) {
                console.log('      note: this night carries no per-run durations, so it is excluded from the');
                console.log('            pooled percentile/drift analysis (but counted for the flake rate)');
            }
        }
    }

    console.log('');
    console.log('  EFFECT ON THE LEDGER');
    console.log(`    nights:   ${before.nights} -> ${after.nights}`);
    console.log(`    attempts: ${before.attempts} -> ${after.attempts}`);
    const touched = after.everIntermittent.filter(probe => {
        const was = before.everIntermittent.find(item => item.name === probe.name);
        return !was || was.disagreementNights !== probe.disagreementNights || was.nights !== probe.nights;
    });
    if (after.everIntermittent.length === 0) {
        console.log('    no probe has ever disagreed with itself, before or after this fold');
    } else {
        console.log('    probes with recorded disagreements, after this fold:');
        for (const probe of after.everIntermittent) {
            const marker = touched.includes(probe) ? ' (changed by this fold)' : '';
            console.log(`      - ${probe.name}: ${probe.disagreementNights} of ${probe.nights} night(s), `
                + `${pct(probe.flakeRate)} observed, 95% interval ${pct(probe.flakeInterval.lower)}–`
                + `${pct(probe.flakeInterval.upper)}${marker}`);
        }
    }
    if (after.rateGated.length > 0) {
        console.log(`    the rate gate (>= 20% over >= 5 nights) would fire for: `
            + after.rateGated.map(probe => probe.name).join(', '));
        console.log('    — that is what the next nightly run would report, not a refusal to fold this artifact');
    } else if (after.nights < 5) {
        console.log(`    the rate gate needs >= 5 nights and this fold reaches ${after.nights}`);
    }
    if (withoutPerRun > 0) {
        console.log(`    ${withoutPerRun} incoming night(s) carry no per-run durations and will be excluded from the`);
        console.log('    pooled percentile analysis, which is reported rather than hidden');
    }
    console.log('============================================================');

    if (args.jsonPath) {
        writeFileSync(args.jsonPath, `${JSON.stringify({
            kind: 'probe-stability-ledger-fold',
            foldedAt: new Date().toISOString(),
            artifact: artifactPath,
            into: args.into,
            artifactNights: unique.length,
            alreadyPresent: duplicates.length,
            nightsAdded: toAdd.map(entry => entry.recordedAt),
            nightsWithoutPerRunDurations: withoutPerRun,
            ledgerBefore: { nights: before.nights, attempts: before.attempts },
            ledgerAfter: { nights: after.nights, attempts: after.attempts },
            everIntermittentAfter: after.everIntermittent.map(probe => ({
                name: probe.name,
                nights: probe.nights,
                disagreementNights: probe.disagreementNights,
                flakeRate: probe.flakeRate,
                flakeInterval: probe.flakeInterval
            })),
            rateGatedAfter: after.rateGated.map(probe => probe.name),
            nightsAfter: after.nights,
            preservedNights: existing.length,
            intoRef: args.intoRef,
            nights: mergedEntries.map(nightSummary),
            requiredNights: required ? { ref: args.requireRef, recordedAt: required.map(item => item.entry.recordedAt) } : null,
            written: args.write
        }, null, 2)}\n`);
        console.log(`  wrote ${args.jsonPath}`);
    }

    if (!args.write) {
        console.log('');
        console.log('DRY RUN — nothing written. Review the nights above, then add --write to fold them in.');
        console.log('After writing, regenerate the document that quotes these numbers:');
        console.log('  npm run codegen:release-dossier   # then npm run verify:release-claims');
        return 0;
    }

    if (toAdd.length === 0) {
        console.log('');
        console.log('NOTHING WRITTEN — the ledger already holds every night in this artifact.');
        return 0;
    }
    // Each night already in the record keeps the exact line it had; only new nights
    // are serialized. That makes "a fold appends" true by construction rather than by
    // review, and it is the property an unattended fold (the nightly CI job) depends on.
    const merged = [
        ...existing.map(item => ({ entry: item.entry, line: item.line })),
        ...toAdd.map(entry => ({ entry, line: JSON.stringify(entry) }))
    ].sort((a, b) => a.entry.recordedAt.localeCompare(b.entry.recordedAt));
    const body = `${merged.map(item => item.line).join('\n')}\n`;

    // Write beside the record, then verify the bytes that actually landed, then
    // rename over it. A ledger half-written by an interrupted job would corrupt the
    // denominator of every rate the repository reports, and the failure would look
    // like a suite regression rather than like a truncated file.
    const staging = `${args.into}.fold-staging`;
    writeFileSync(staging, body);
    const landed = readFileSync(staging, 'utf8').split(/\r?\n/).filter(line => line.trim() !== '');
    const problems = [];
    if (landed.length !== merged.length) {
        problems.push(`staged ${landed.length} line(s), expected ${merged.length}`);
    }
    const lost = existing.filter(item => !landed.includes(item.line));
    if (lost.length > 0) {
        problems.push(`${lost.length} night(s) already in the record are missing from the staged file`);
    }
    const unparseable = landed.find(line => {
        try {
            JSON.parse(line);
            return false;
        } catch {
            return true;
        }
    });
    if (unparseable) problems.push(`a staged line is not JSON: ${unparseable.slice(0, 60)}…`);
    if (problems.length > 0) {
        rmSync(staging, { force: true });
        refuse(`${args.into} is untouched because the write failed its own verification: ${problems.join('; ')}`);
    }
    renameSync(staging, args.into);
    console.log('');
    console.log(`WROTE — ${toAdd.length} night(s) folded into ${args.into} (${merged.length} total, `
        + `${existing.length} preserved byte-for-byte).`);
    console.log('Next, so the dossier quotes the same numbers:');
    console.log('  npm run codegen:release-dossier   # then npm run verify:release-claims');
    return 0;
}

process.exit(main());
