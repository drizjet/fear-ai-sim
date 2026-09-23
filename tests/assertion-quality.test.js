import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// RESP-ASSERTION-QUALITY-GUARD-001 — the corpus audit of 2026-09-23 found two suites whose
// negative controls passed for the WRONG reason (an optional-chained actual short-circuits to
// undefined, and `not.toBe(true)` / `toBeDefined()` are satisfied by undefined) plus a delivery
// control that never let the evicted item's own delay elapse. One-off fixes decay; this guard
// makes the findings permanent by refusing the signatures that let an assertion pass while
// proving nothing. It is deliberately narrow — only signatures that can NEVER be meaningful:
//   EMPTY_MATCH_OBJECT       toMatchObject({}) matches any object
//   LITERAL_EXPECT           expect(true) / expect(false) cannot fail
//   VACUOUS_OPTIONAL_CHAIN   a `?.` actual with a matcher that undefined satisfies
//   ASSERTION_IN_CATCH       an assertion inside a catch block masks the real failure
//   SILENT_TEST              an `it` with no assertion at all
// This file excludes itself (it contains these signatures as pattern data), and asserts it
// actually saw the corpus, so a broken glob fails instead of passing silently.

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = 'assertion-quality.test.js';
const MATCHERS_UNDEFINED_SATISFIES = /\.(?:not\.)?(?:toBeDefined|toBeUndefined|toBeFalsy|toBeNull)\(\)|\.not\.toBe\((?:true|false)\)/;

const suiteFiles = () => readdirSync(HERE).filter(name => name.endsWith('.test.js') && name !== SELF).sort();

const inspect = source => {
    const violations = [];
    const lines = source.split('\n');
    lines.forEach((line, index) => {
        const at = index + 1;
        if (/toMatchObject\(\s*\{\s*\}\s*\)/.test(line)) violations.push({ at, rule: 'EMPTY_MATCH_OBJECT', line: line.trim() });
        if (/expect\(\s*(?:true|false)\s*\)/.test(line)) violations.push({ at, rule: 'LITERAL_EXPECT', line: line.trim() });
        if (line.includes('expect(') && line.includes('?.') && MATCHERS_UNDEFINED_SATISFIES.test(line)) {
            violations.push({ at, rule: 'VACUOUS_OPTIONAL_CHAIN', line: line.trim() });
        }
    });
    // A catch block that asserts is hiding the throw it caught.
    const catchPattern = /catch\s*(?:\([^)]*\))?\s*\{[^}]*\bexpect\(/g;
    for (const match of source.matchAll(catchPattern)) {
        violations.push({ at: source.slice(0, match.index).split('\n').length, rule: 'ASSERTION_IN_CATCH', line: match[0].split('\n')[0].trim() });
    }
    // Every test must assert something.
    const starts = [...source.matchAll(/\bit\(\s*['"`]/g)].map(match => match.index);
    starts.forEach((start, index) => {
        const body = source.slice(start, index + 1 < starts.length ? starts[index + 1] : source.length);
        if (!/\bexpect\(/.test(body)) violations.push({ at: source.slice(0, start).split('\n').length, rule: 'SILENT_TEST', line: body.split('\n')[0].trim() });
    });
    return violations;
};

describe('RESP-ASSERTION-QUALITY-GUARD-001: no suite may assert nothing', () => {
    it('scans the whole corpus and finds no vacuous assertion signature', () => {
        const files = suiteFiles();
        expect(files.length).toBeGreaterThan(150); // a blind guard must fail, not pass

        const offences = [];
        for (const file of files) {
            for (const violation of inspect(readFileSync(join(HERE, file), 'utf8'))) {
                offences.push(`${file}:${violation.at} [${violation.rule}] ${violation.line.slice(0, 120)}`);
            }
        }
        expect(offences).toEqual([]);
    });

    it('would catch each banned signature if it appeared', () => {
        // The guard is only worth its name if it actually rejects — pin every rule it claims.
        const samples = {
            EMPTY_MATCH_OBJECT: 'expect(payload).toMatchObject({});',
            LITERAL_EXPECT: 'expect(true).toBe(true);',
            VACUOUS_OPTIONAL_CHAIN: "expect(actor.beliefs?.has('old')).not.toBe(true);",
            VACUOUS_OPTIONAL_CHAIN_DEFINED: "expect(run.quiet.beliefs?.get('quiet')).toBeDefined();",
            ASSERTION_IN_CATCH: 'try { risky(); } catch (error) { expect(error).toBeTruthy(); }',
            SILENT_TEST: "it('does nothing', () => { society.tick(); });",
        };
        for (const [rule, source] of Object.entries(samples)) {
            const rules = inspect(source).map(violation => violation.rule);
            expect(rules).toContain(rule.startsWith('VACUOUS_OPTIONAL_CHAIN') ? 'VACUOUS_OPTIONAL_CHAIN' : rule);
        }
        // …and leaves an honest assertion alone
        expect(inspect("expect(actor.beliefs.get('old').estimate).toBe(null);\nit('real', () => { expect(1).toBe(1); });")).toEqual([]);
    });
});
