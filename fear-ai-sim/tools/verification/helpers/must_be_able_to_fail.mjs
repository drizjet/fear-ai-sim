#!/usr/bin/env node

/**
 * tools/verification/helpers/must_be_able_to_fail.mjs
 *
 * Shared machinery for the question every demonstration has to answer before its
 * green means anything: **can it go red?**
 *
 * Why this is shared rather than copied. `examples/cli/neutral-horror-demo.mjs`
 * printed `VERDICT: ... executed successfully!` unconditionally for as long as it
 * existed, next to output that contradicted its own phase labels, because nothing
 * in the repository ran it. `examples/python/neutral_horror_demo.py` did the same
 * thing. `examples/reference-game/simulation_runner.js` hardcoded
 * `status: 'SUCCESS'` in its report object. Three separate files, one defect, and
 * the fix is not three patches — it is one pattern applied everywhere, so that
 * the next demonstration added here is checked by default instead of by whoever
 * happens to read it.
 *
 * Two mechanisms, both deliberately blunt:
 *
 * 1. `assertMutationsCatch` runs a source file, then runs MUTATED copies of it and
 *    requires the mutation to be caught. A mutation that should go red and does
 *    not is the failure this catches. A CONTROL mutation that disables the
 *    assertion mechanism must go GREEN, otherwise a file whose red came from a
 *    crash rather than from a check would pass the first two cases for the wrong
 *    reason.
 *
 * 2. `unguardedVerdicts` is a STATIC scan for a success verdict in a file that
 *    contains no mechanism by which it could fail. It is a heuristic and is
 *    documented as one — see the limits at the bottom of this file — but it is
 *    the check that would have caught all three of the defects above on the day
 *    they were written, without running anything.
 *
 * Hard Rule 9 compliant: helpers for standalone deterministic probes, no runner.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

/**
 * A standalone module source, run in a child process.
 *
 * `cwd` matters: a relative import in `--input-type=module -e` source resolves
 * against the working directory, so a mutated copy of a file can reach the same
 * modules the real file does without anything being written to disk. That is what
 * keeps a mutation test from leaving debris in the repository if it crashes
 * halfway through.
 */
export function runModuleSource(source, { cwd, timeoutMs = 120_000 } = {}) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
        cwd,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024
    });
    return {
        status: result.status,
        output: `${result.stdout || ''}${result.stderr || ''}`,
        timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT')
    };
}

/**
 * An on-disk script, run in a child process.
 *
 * `command` lets a caller run a non-Node example (the Python reference demo),
 * and `env` lets it be pointed at a server the caller started, rather than at a
 * hardcoded port something else might already be using.
 */
export function runFile(file, { cwd, args = [], timeoutMs = 120_000, command = process.execPath, env } = {}) {
    const result = spawnSync(command, [...args, file], {
        cwd,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: env ? { ...process.env, ...env } : process.env
    });
    return {
        status: result.status,
        output: `${result.stdout || ''}${result.stderr || ''}`,
        timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
        missing: Boolean(result.error && result.error.code === 'ENOENT')
    };
}

/**
 * Apply a mutation matrix to one source file.
 *
 * @param {object} spec
 * @param {string} spec.label               what is being mutated
 * @param {string} spec.source              the original source text
 * @param {string} spec.cwd                 working directory for relative imports
 * @param {Array<{label: string, mutate: (src: string) => string, expect: 'red'|'green', mustMention?: RegExp}>} spec.mutations
 * @param {(source: string) => {status: number|null, output: string}} spec.run
 * @returns {Array<{label: string, status: number|null, ok: boolean, detail: string}>}
 * @throws {Error} on the first mutation whose expectation is not met
 */
export function assertMutationsCatch({ label, source, mutations, run, onResult = () => {} }) {
    if (!Array.isArray(mutations) || mutations.length === 0) {
        throw new Error(`${label}: a mutation matrix with no mutations proves nothing`);
    }
    const results = [];
    for (const mutation of mutations) {
        const mutated = mutation.mutate(source);
        // A mutation that does not change the source is a broken test, and a
        // broken mutation test silently passes: it runs the unmutated file and
        // reports whatever that does.
        if (mutated === source) {
            throw new Error(`${label}: mutation "${mutation.label}" did not change the source — its anchor moved`);
        }
        const outcome = run(mutated);
        const expectedRed = mutation.expect !== 'green';
        const wentRed = outcome.status !== 0;
        if (expectedRed && !wentRed) {
            throw new Error(`${label}: mutation "${mutation.label}" still exited ${outcome.status}. `
                + `${mutation.expect === 'green' ? '' : 'The claim it breaks is not actually checked. '}`
                + `Output tail:\n${outcome.output.split(/\r?\n/).slice(-12).join('\n')}`);
        }
        if (!expectedRed && wentRed) {
            throw new Error(`${label}: control mutation "${mutation.label}" exited ${outcome.status}. `
                + 'The red cases above are therefore not coming from the assertions — they would have failed '
                + `anyway. Output tail:\n${outcome.output.split(/\r?\n/).slice(-12).join('\n')}`);
        }
        if (expectedRed && mutation.mustMention && !mutation.mustMention.test(outcome.output)) {
            throw new Error(`${label}: mutation "${mutation.label}" failed, but not by naming the claim it broke `
                + `(${mutation.mustMention}). A failure a reader cannot attribute is barely better than a pass.`);
        }
        const ok = expectedRed ? wentRed : !wentRed;
        results.push({ label: mutation.label, status: outcome.status, ok, output: outcome.output });
        onResult(mutation, outcome);
    }
    return results;
}

/** Success verdicts a file might print, and the mechanisms that make one earnable. */
const VERDICT_PATTERNS = [
    /\bVERDICT\b/i,
    /\bSUCCESS\b/,
    /\bPASSED\b/,
    /\bstatus\s*:\s*['"]SUCCESS['"]/,
    /\bALL\s+CHECKS\s+PASS/i
];

const GUARD_PATTERNS = [
    /\bassert\b/i,
    /\bAssert\./,
    /\bcheck\s*\(/,
    /\bexpect\s*\(/,
    /process\.exitCode\s*=/,
    /process\.exit\s*\(\s*[1-9]/,
    /sys\.exit\s*\(\s*[1-9]/,
    /raise\s+SystemExit/,
    /\bthrow\b/
];

/**
 * STATIC scan: does this source print a success verdict it has no way to withhold?
 *
 * Returns the verdict lines, plus the guard it found (or none). A file with a
 * verdict and no guard is exactly the shape that shipped three times here.
 *
 * Limits, stated because a heuristic that pretends to be a proof is worse than no
 * check: this does not verify the guard is *connected* to the verdict — a file
 * could contain an unrelated `throw` and pass. It is a tripwire against the
 * specific omission of having no failure mechanism at all, and it is deliberately
 * not cleverer than that.
 *
 * @returns {{verdictLines: string[], guards: string[], unguarded: boolean}}
 */
export function unguardedVerdicts(source) {
    const lines = source.split(/\r?\n/);
    const verdictLines = [];
    const guards = [];
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Comments describe verdicts; they do not print them. A file is not
        // unguarded because its header explains that an older version was.
        const isComment = /^(\/\/|#|\*|--)/.test(trimmed) || trimmed === '';
        if (isComment) return;
        if (VERDICT_PATTERNS.some(pattern => pattern.test(trimmed))) {
            verdictLines.push(`${index + 1}: ${trimmed.slice(0, 160)}`);
        }
        if (GUARD_PATTERNS.some(pattern => pattern.test(trimmed))) guards.push(`${index + 1}: ${trimmed.slice(0, 80)}`);
    });
    return { verdictLines, guards, unguarded: verdictLines.length > 0 && guards.length === 0 };
}/**
 * The ASYNC twin of `runFile`, for the case where the thing being run must talk
 * to a server living in THIS process.
 *
 * `spawnSync` blocks the event loop, so an in-process `FearServer` cannot answer
 * a single request while it runs and the child times out on its first call — a
 * deadlock that presents as a mysterious network failure. Anything run against a
 * server started in this process must use this.
 */
export function runFileAsync(file, { cwd, args = [], timeoutMs = 120_000, command = process.execPath, env } = {}) {
    return new Promise((resolvePromise) => {
        const child = spawn(command, [...args, file], {
            cwd,
            env: env ? { ...process.env, ...env } : process.env
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (error) => {
            clearTimeout(timer);
            resolvePromise({ status: null, output: `${stdout}${stderr}${error.message}`, timedOut, missing: error.code === 'ENOENT' });
        });
        child.on('close', (status) => {
            clearTimeout(timer);
            resolvePromise({ status, output: `${stdout}${stderr}`, timedOut, missing: false });
        });
    });
}

/** Directory names never walked when deriving a roster. */
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'bin', 'obj', '.godot']);

/**
 * Derive the runnable/reference example roster from disk. Derived rather than
 * listed, so an example added tomorrow is in the inventory by existing instead of
 * by someone remembering to add it.
 *
 * @returns {string[]} repo-relative POSIX paths of every example file
 */
export function findExamples(repoRoot, { root = 'examples' } = {}) {
    const found = [];
    const walk = (absolute) => {
        for (const entry of readdirSync(absolute).sort()) {
            const full = join(absolute, entry);
            if (statSync(full).isDirectory()) {
                if (SKIP_DIRS.has(entry)) continue;
                walk(full);
            } else {
                found.push(relative(repoRoot, full).split(sep).join('/'));
            }
        }
    };
    walk(join(repoRoot, root));
    return found.sort();
}

/** Read a repo-relative file as text. */
export function readRepo(repoRoot, relativePath) {
    return readFileSync(join(repoRoot, ...relativePath.split('/')), 'utf8');
}
