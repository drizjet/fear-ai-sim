import { runHeavySuites } from '../tools/heavy-suites.mjs';

describe('NOW-6: heavy-suite quarantine runner', () => {
  it('passes a fast healthy suite on the first attempt', () => {
    const report = runHeavySuites({ suites: ['tests/interaction-mutations.test.js'], maxAttempts: 2 });
    expect(report.verdicts).toHaveLength(1);
    expect(report.verdicts[0].verdict).toBe('PASS');
    expect(report.verdicts[0].attempts).toBe(1);
  }, 120000);

  it('marks a perpetually failing suite FAIL after exhausting retries', () => {
    const report = runHeavySuites({ suites: ['tests/definitely-not-a-real-suite.test.js'], maxAttempts: 2 });
    expect(report.verdicts[0].verdict).toBe('FAIL');
    expect(report.verdicts[0].attempts).toBe(2);
  }, 180000);
});

describe('NOW-9: default-gate split', () => {
  it('config excludes heavy suites by default but lists them with FEAR_AI_HEAVY_RUN=1', async () => {
    const { spawnSync } = await import('node:child_process');
    const list = (env) => spawnSync(
      process.execPath,
      ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--listTests'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } },
    ).stdout.split('\n').filter(Boolean).map((t) => t.replace(/\\/g, '/'));
    const { HEAVY_SUITES } = await import('../tools/heavy-suites.mjs');
    const closed = list({});
    const open = list({ FEAR_AI_HEAVY_RUN: '1' });
    expect(open.length - closed.length).toBe(HEAVY_SUITES.length);
    for (const suite of HEAVY_SUITES) {
      expect(closed.some((t) => t.includes(suite))).toBe(false);
      expect(open.some((t) => t.includes(suite))).toBe(true);
    }
  }, 180000);
});
