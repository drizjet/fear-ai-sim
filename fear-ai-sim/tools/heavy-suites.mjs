/**
 * @file heavy-suites.mjs - NOW-6: serialized retry runner for engine-spawn suites.
 *
 * Heavy suites (Godot binary spawns, cargo builds) flake when jest runs them
 * in parallel with 330+ other suites: CPU starvation slows the spawned
 * engine/binary past assertion windows that pass in isolation.
 *
 * This runner executes each heavy suite alone (--runInBand, one suite per
 * jest invocation) with one retry on failure, and writes a machine-readable
 * verdict log. A suite that fails twice is a REAL failure, not a flake.
 * A suite that passes on retry is recorded as FLAKY-PASS, not green.
 *
 * Host authority: runs tests only; mutates no game state.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

export const HEAVY_SUITES = [
  'tests/godot-binary-websocket-loopback.test.js',
  'tests/godot-civilization-showcase.test.js',
  'tests/godot-roundtrip-budget.test.js',
  'tests/godot-server-failure.test.js',
  'tests/godot-showcase-verification.test.js',
  'tests/external-pixel-pets-integration.test.js',
  'tests/external-reference-game.test.js',
];

export function runHeavySuites({ suites = HEAVY_SUITES, maxAttempts = 2, logDir = null } = {}) {
  const verdicts = [];
  for (const suite of suites) {
    let attempt = 0;
    let passed = false;
    let lastOutput = '';
    while (attempt < maxAttempts && !passed) {
      attempt += 1;
      const res = spawnSync(
        process.execPath,
        ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--runInBand', suite],
        { cwd: REPO, encoding: 'utf8', timeout: 420000 },
      );
      lastOutput = `${res.stdout || ''}\n${res.stderr || ''}`.slice(-2000);
      passed = res.status === 0;
    }
    verdicts.push({
      suite,
      verdict: passed ? (attempt === 1 ? 'PASS' : 'FLAKY-PASS') : 'FAIL',
      attempts: attempt,
      tail: lastOutput,
    });
    // eslint-disable-next-line no-console
    console.log(`${passed ? (attempt === 1 ? 'PASS' : `FLAKY-PASS(retry ${attempt})`) : 'FAIL'} ${suite}`);
  }
  const report = { when: new Date().toISOString(), verdicts };
  if (logDir) {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, 'heavy-suites.json'), JSON.stringify(report, null, 2));
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runHeavySuites({ logDir: join(REPO, 'evidence') });
  const fails = report.verdicts.filter((v) => v.verdict === 'FAIL');
  const flaky = report.verdicts.filter((v) => v.verdict === 'FLAKY-PASS');
  // eslint-disable-next-line no-console
  console.log(`\nheavy suites: ${report.verdicts.length - fails.length}/${report.verdicts.length} passed, ${flaky.length} flaky-pass, ${fails.length} failed`);
  process.exit(fails.length > 0 ? 1 : 0);
}
