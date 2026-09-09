/**
 * @file heavy-suites.mjs - NOW-6/NOW-9: serialized retry runner for engine-spawn suites.
 *
 * Heavy suites (Godot binary spawns, cargo builds) flake when jest runs them
 * in parallel with 330+ other suites: CPU starvation slows the spawned
 * engine/binary past assertion windows that pass in isolation.
 *
 * Gate split: jest.config.js imports HEAVY_IGNORE_PATTERNS so `npm test`
 * runs the fast deterministic matrix only; this runner executes each heavy
 * suite alone (--runInBand, one suite per jest invocation) with one retry
 * on failure, and writes a machine-readable verdict log. A suite that fails
 * twice is a REAL failure, not a flake. A suite that passes on retry is
 * recorded as FLAKY-PASS, not green.
 *
 * Spawned invocations set FEAR_AI_HEAVY_RUN=1 so the config-level ignore
 * does not exclude the very suites this runner exists to execute (a CLI
 * --testPathIgnorePatterns override is unusable: the array option gobbles
 * the suite positional).
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
  'tests/world-soak-10k.test.js',
  'tests/world-degeneration-tripwires.test.js',
  'tests/world-scale-overhead.test.js',
];

// Single source of truth for the default-gate split: jest.config.js imports
// this so `npm test` skips these suites; `npm run test:heavy` runs them
// serialized. Add new slow or engine-spawn suites here, never in
// jest.config.js directly (the gate-split test enforces this).
export const HEAVY_IGNORE_PATTERNS = HEAVY_SUITES.map((s) => s.replace(/\./g, '\\.'));

export function runHeavySuites({ suites = HEAVY_SUITES, maxAttempts = 2, logDir = null } = {}) {
  const verdicts = [];
  for (const suite of suites) {
    let attempt = 0;
    let passed = false;
    let lastOutput = '';
    // Gate override via environment, not CLI: jest's array-type
    // --testPathIgnorePatterns gobbles the suite positional, so the gate
    // opens with FEAR_AI_HEAVY_RUN instead (see jest.config.js).
    while (attempt < maxAttempts && !passed) {
      attempt += 1;
      const res = spawnSync(
        process.execPath,
        ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--runInBand', suite],
        { cwd: REPO, encoding: 'utf8', timeout: 420000, env: { ...process.env, FEAR_AI_HEAVY_RUN: '1' } },
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
