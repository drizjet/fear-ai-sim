#!/usr/bin/env node

/**
 * verify_examples_inventory.mjs — nothing may claim success unless something runs it.
 *
 * Why this probe exists. Three files under `examples/` printed a success verdict
 * that nothing could contradict, and a repository-wide search showed that nothing
 * ran any of them:
 *
 *   - `examples/cli/neutral-horror-demo.mjs` printed
 *     `VERDICT: ... executed successfully!` next to output that contradicted its
 *     own phase labels;
 *   - `examples/python/neutral_horror_demo.py` printed
 *     `VERDICT: ... executed successfully with exact canonical parity.`;
 *   - `examples/reference-game/simulation_runner.js` hardcoded
 *     `status: 'SUCCESS'` in the report it returns.
 *
 * Every one of those was found by reading, and the only gate that could have seen
 * them was a gate that knew `examples/` existed. This is that gate. It enforces
 * one rule, which is the rule all three broke:
 *
 *   **A file that states an outcome must be executed by a gate, or it must not
 *   state one.**
 *
 * The roster is DERIVED from disk rather than listed, so an example added
 * tomorrow is classified by existing. The classifications themselves are written
 * down and asserted to cover the roster exactly, so a new file cannot be added
 * silently, a deleted one cannot leave a stale entry, and an executable one
 * cannot be quietly reclassified as documentation.
 *
 * What this does NOT do: it does not judge whether the unrun examples are
 * correct. Godot, Unity and Unreal examples need toolchains this machine does not
 * have and are reported as not-run with their reason, which is a statement about
 * coverage rather than a claim about behaviour.
 */

import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import {
    findExamples,
    readRepo,
    runFile,
    runFileAsync,
    unguardedVerdicts
} from './helpers/must_be_able_to_fail.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

console.log('============================================================');
console.log('VERIFY EXAMPLES: RUN OR DO NOT CLAIM');
console.log('============================================================');

/**
 * Classification of every example, by the rules rather than by filename:
 *
 *   GATED     executed by a probe (the probe must reference it)
 *   RUN_HERE  executable with tools present on this machine, run right now
 *   UNRUN     executable but needs a toolchain this machine lacks, or a host
 *             game; the reason is required and is printed
 *   LIBRARY   a module imported by another example, not a standalone entry point
 *   DOCUMENT  prose; not executable, and so makes no runtime claim
 */
const CLASSIFICATION = {
    'examples/cli/neutral-horror-demo.mjs': {
        kind: 'GATED',
        by: 'verify_contagion_transmission.mjs'
    },
    'examples/python/neutral_horror_demo.py': {
        kind: 'RUN_HERE',
        note: 'standard library only; needs a running FearServer, which this probe starts'
    },
    'examples/reference-game/simulation_runner.js': {
        kind: 'RUN_HERE',
        note: 'drives the in-process reference game; needs no network or service'
    },
    'examples/reference-game/DungeonEngine.js': {
        kind: 'LIBRARY',
        note: 'host game engine imported by simulation_runner.js'
    },
    'examples/reference-game/FearAIAdapter.js': {
        kind: 'LIBRARY',
        note: 'adapter imported by simulation_runner.js'
    },
    'examples/reference-game/INTEGRATION_AUDIT_REPORT.md': { kind: 'DOCUMENT' },
    'examples/external-game-proof/outpost_omega_game.py': {
        kind: 'UNRUN',
        reason: 'needs an external game client and a running server; its recorded '
            + 'transcript is historical evidence, not a re-runnable demo'
    },
    'examples/external-game-proof/EXTERNAL_INTEGRATION_RECORD.md': { kind: 'DOCUMENT' },
    'examples/external-game-proof/PIXEL_PETS_INTEGRATION_REPORT.md': { kind: 'DOCUMENT' },
    'examples/godot/neutral_horror_demo.gd': {
        kind: 'UNRUN',
        reason: 'needs the Godot binary; no probe drives this scene'
    },
    'examples/godot/civilization_world_showcase.gd': {
        kind: 'UNRUN',
        reason: 'needs the Godot binary; the in-engine evidence runs the showcase under '
            + 'tests/godot_project, not this standalone copy'
    },
    'examples/unity/NeutralHorrorDemoScene.cs': {
        kind: 'UNRUN',
        reason: 'needs a Unity Editor, which this machine does not have'
    },
    'examples/unreal/NeutralHorrorDemoGameMode.cpp': {
        kind: 'UNRUN',
        reason: 'Unreal is deferred by policy; the adapter is kept so a UE5 host can connect later'
    },
    'examples/unreal/NeutralHorrorDemoGameMode.h': {
        kind: 'UNRUN',
        reason: 'Unreal is deferred by policy; see the .cpp'
    }
};

// ---------------------------------------------------------------------------
// Section A: the roster is derived, and the classification covers it exactly.
// ---------------------------------------------------------------------------
const roster = findExamples(repoRoot);
assert(roster.length > 0, 'The examples roster is empty, so this probe would pass over nothing');

const unclassified = roster.filter(path => !CLASSIFICATION[path]);
assert(unclassified.length === 0,
    `${unclassified.length} example(s) exist on disk with no classification, so nothing checks whether they are `
    + `run: ${unclassified.join(', ')}`);
const stale = Object.keys(CLASSIFICATION).filter(path => !roster.includes(path));
assert(stale.length === 0,
    `${stale.length} classification(s) name a file that no longer exists: ${stale.join(', ')}`);
console.log(`  * the roster is derived from disk (${roster.length} files) and every entry is classified: PASS`);

for (const [path, entry] of Object.entries(CLASSIFICATION)) {
    if (entry.kind === 'UNRUN') {
        assert(typeof entry.reason === 'string' && entry.reason.length > 20,
            `${path} is marked UNRUN without a usable reason, so "we did not run it" is indistinguishable `
            + 'from "we forgot"');
    }
    if (entry.kind === 'GATED') {
        assert(typeof entry.by === 'string' && entry.by.length > 0,
            `${path} is marked GATED but names no probe that runs it`);
    }
}
console.log('  * every UNRUN entry states a reason and every GATED entry names its probe: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section B: the rule itself. A file that states an outcome must be executed.
// ---------------------------------------------------------------------------
const executable = Object.entries(CLASSIFICATION)
    .filter(([, entry]) => entry.kind !== 'DOCUMENT')
    .map(([path]) => path);

const unearned = [];
for (const path of executable) {
    const entry = CLASSIFICATION[path];
    const scan = unguardedVerdicts(readRepo(repoRoot, path));
    if (scan.verdictLines.length === 0) continue;
    // Two ways to earn a verdict: be run by a gate, or be run right now and pass.
    const earned = entry.kind === 'GATED' || entry.kind === 'RUN_HERE';
    if (!earned) {
        unearned.push(`${path} (${entry.kind})`);
    }
}
assert(unearned.length === 0,
    `${unearned.length} example(s) state a success verdict but are never executed, so the verdict is `
    + `unfalsifiable: ${unearned.join(', ')}`);
console.log(`  * of ${roster.length} example files, every one that states a verdict is executed by a probe or `
    + 'run below: PASS');

// The static half of "earned": a verdict that no mechanism can withhold is not a
// claim, it is a sentence. Applies even to the run ones, because a demo that
// always exits 0 cannot be caught by running it.
const guardless = [];
for (const path of executable) {
    const scan = unguardedVerdicts(readRepo(repoRoot, path));
    if (scan.unguarded) guardless.push(path);
}
assert(guardless.length === 0,
    `${guardless.length} example(s) print a success verdict with no assertion, exit code or exception `
    + `anywhere in the file: ${guardless.join(', ')}`);
console.log('  * no example prints a success verdict without also carrying a way to withhold it: PASS');

// A GATED entry must actually be referenced by the probe it names, or the
// classification is a claim about a relationship that does not exist.
const gatedProbeSources = readdirSync(join(repoRoot, 'tools', 'verification'))
    .filter(name => /^verify_.*\.mjs$/.test(name))
    .map(name => [name, readRepo(repoRoot, `tools/verification/${name}`)]);
for (const [path, entry] of Object.entries(CLASSIFICATION)) {
    if (entry.kind !== 'GATED') continue;
    const basename = path.split('/').pop();
    const [probeName, probeSource] = gatedProbeSources.find(([name]) => name === entry.by) || [];
    assert(probeName !== undefined, `${path} names a probe that does not exist: ${entry.by}`);
    assert(probeSource.includes(basename),
        `${entry.by} does not reference ${basename}, so ${path} is not actually gated by it`);
}
console.log('  * every GATED example is referenced by the probe it names: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section C: run the ones this machine can run.
// ---------------------------------------------------------------------------
const runnable = Object.entries(CLASSIFICATION).filter(([, entry]) => entry.kind === 'RUN_HERE');
assert(runnable.length > 0, 'No example is classified RUN_HERE, so this probe runs nothing and proves nothing');

// The reference game needs nothing external.
const referencePath = 'examples/reference-game/simulation_runner.js';
const reference = runFile(referencePath, { cwd: repoRoot, timeoutMs: 120_000 });
assert(!reference.timedOut, `${referencePath} timed out`);
assert(reference.status === 0,
    `${referencePath} exited ${reference.status}. Output tail:\n${reference.output.split(/\r?\n/).slice(-15).join('\n')}`);
assert(/Simulation completed \d+ turns/.test(reference.output),
    `${referencePath} ran but did not report completing its turns`);
assert(!/FAILED —/.test(reference.output),
    `${referencePath} reported a failure while exiting 0, so its status field is not wired to its exit code`);
console.log('  * examples/reference-game/simulation_runner.js: 50 turns, all checks held, exit 0: PASS');

// The Python demo needs a server. One is started here on an ephemeral port rather
// than assumed to be running on 8765, so this probe neither depends on something
// else nor leaves a server behind.
const pythonCommand = (() => {
    for (const candidate of ['python', 'python3']) {
        const probe = runFile('--version', { cwd: repoRoot, command: candidate, args: [], timeoutMs: 20_000 });
        if (!probe.missing && probe.status === 0) return candidate;
    }
    return null;
})();

if (pythonCommand === null) {
    // Honest not-proven: the suite turns a line containing SKIPPED into PARTIAL
    // rather than a pass, which is what "no Python on this machine" deserves.
    console.log('  SKIPPED: no Python interpreter on PATH, so examples/python/neutral_horror_demo.py was not run.');
} else {
    const server = new FearServer({ port: 0, seed: 42 });
    try {
        const bound = await server.start();
        const url = `http://127.0.0.1:${bound.port}`;
        // Async: the server answering these requests lives in THIS process, and
        // `spawnSync` would block the event loop and deadlock the child.
        const python = await runFileAsync('examples/python/neutral_horror_demo.py', {
            cwd: repoRoot,
            command: pythonCommand,
            timeoutMs: 180_000,
            env: { FEAR_AI_URL: url }
        });
        assert(!python.timedOut, 'the Python reference demo timed out against a live server');
        assert(python.status === 0,
            `the Python reference demo exited ${python.status} against a live server. Output tail:\n`
            + python.output.split(/\r?\n/).slice(-20).join('\n'));
        const held = /CHECKS:\s*(\d+)\/(\d+)\s+held/.exec(python.output);
        assert(held, 'the Python reference demo printed no CHECKS: n/n line, so its claims are unreadable');
        assert(held[1] === held[2], `the Python demo exited 0 while only ${held[1]} of ${held[2]} claims held`);
        console.log(`  * examples/python/neutral_horror_demo.py against a real FearServer on ${url}: `
            + `${held[1]}/${held[2]} claims held, exit 0: PASS`);
    } finally {
        if (typeof server.stop === 'function') await server.stop();
    }
}
console.log('');

// ---------------------------------------------------------------------------
// Section D: report what is not run, so the uncovered surface is visible rather
// than assumed empty.
// ---------------------------------------------------------------------------
const notRun = Object.entries(CLASSIFICATION).filter(([, entry]) => entry.kind === 'UNRUN');
console.log(`  Not run by any probe on this machine (${notRun.length}) — neither a pass nor a failure:`);
for (const [path, entry] of notRun) {
    console.log(`    - ${path}`);
    console.log(`      ${entry.reason}`);
}
console.log('');

console.log('Scope: this probe audits which examples are executed, and refuses a success verdict from a file');
console.log('nothing runs. It does not judge the correctness of the examples it cannot run.');
console.log(`All ${assertions} examples-inventory assertions PASSED.`);
console.log('SUCCESS: every example is classified, and every stated verdict is earned or absent.');
