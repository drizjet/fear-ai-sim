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
