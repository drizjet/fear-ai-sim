# Finishing the Test Retirement — the Loud Tombstone and the CI Scope — 2026-09-20

**Scope:** the surface around the 2026-09-15 retirement, not the retirement
itself. All 465 suites were already deleted at tag `v-test-retirement-complete`;
what remained was an entry point that lied in one direction and a CI workflow
that failed in the other. Changes: `tools/guardian/hard-rule-9.mjs` (new),
`package.json`, `.github/workflows/test.yml`, the deletion of
`fear-ai-sim/.github/workflows/test.yml`, `bin/fear-ai.js`, and the doc
reconciliation in `AGENTS.md`, `docs/SYSTEM_MAP.md`, `docs/DOMAIN_MATURITY.md`,
`docs/PROVENANCE.md` and `docs/CURRENT_TRUTH_LEDGER.md` §29.

**Verification (all commands from `fear-ai-sim/`, this state):**

| Command | Result |
|---|---|
| `npm test` | exit **9** — refusal banner, no suite executed |
| `npm run verify:hard-rule-9` | **15/15** checks pass |
| `npm run guardian:check` | `{"result": "CLEAN", "fileCount": 1}` |
| all 25 `tools/verification/verify_*.mjs` | 25 passed, 0 failed |
| `npm run build` | exit 0 (6.85 s, the usual chunk-size warning) |
| `.github/workflows/test.yml` parsed as YAML | 1 job, 4 steps |

No `cargo test` / Jest / automated runner was executed (Hard Rule 9). The gate
itself is not a runner: it reads declaration files and spawns only the
tombstone.

## 1. The defect: a tombstone that read as a passing suite

`npm test` was `node -e "console.log('...retired...'); process.exit(0)"`. It
printed the truth and returned **success**. So the one artifact a candidate
would run first, and the one step CI's `test` job ran, both produced a green
result belonging to no suite. The same file listed `npm test` under
`AGENTS.md` → "Commands (this repo)" three paragraphs below the rule that
forbids running it.

`npm test` now runs `tools/guardian/hard-rule-9.mjs`, which prints the
retirement (465 suites / 67,524 lines, 2026-09-15, tag
`v-test-retirement-complete`, recovery branches), says what to run instead, and
exits **9**. Code 9 is reserved for this: it cannot be mistaken for a suite
failure, because there is no suite to fail.

## 2. The gate: `verify:hard-rule-9` (15 checks)

`node tools/guardian/hard-rule-9.mjs --verify`. It asserts:

1. `scripts.test` is the tombstone script; `scripts["verify:hard-rule-9"]` is
   the gate script.
2. The tombstone **actually** exits 9 and names the retirement (spawned, not
   assumed from text).
3. No runner/coverage package in `dependencies` / `devDependencies`
   (jest, vitest, mocha, jasmine, ava, tap, qunit, karma, nyc, c8, istanbul,
   Cypress, Playwright); no coverage script; no runner config file; no
   `*.test.*` / `*.spec.*` file outside `node_modules`.
4. No workflow file anywhere GitHub cannot read (`fear-ai-sim/.github/` must
   not exist — an unreachable copy reads as CI that exists).
5. CI's `run:` commands equal an allowlist of exactly two, comments stripped so
   the workflow may still explain what it dropped; its executable text
   references no `npm test`, `test:coverage`, Codecov or Jest; and its steps
   declare `working-directory: fear-ai-sim`.
6. No operational surface (`bin/`, `packages/`, launcher `.ps1`/`.bat`/`.sh`)
   still tells a user to run the retired entry point.
7. `docs/SYSTEM_MAP.md` still states this same contract
   (`verify:hard-rule-9`, `guardian:check`, "advisory", "non-zero exit code").

**Drift test.** Each tripwire was proved by mutation, then restored
byte-identically by hash:

| Mutation | Fired |
|---|---|
| CI gains a `run: npm test` step | `ci-runs-exactly-the-allowlist`, `ci-free-of-retired-paths` |
| `jest` re-declared + a stray `*.spec.js` | `no-runner-dependencies`, `no-test-or-spec-files` |
| `npm test` reverted to exit 0 | `npm-test-is-the-tombstone` |
| unreachable workflow copy restored | `no-inert-workflow-inside-the-subtree` |

All four restores verified byte-identical (SHA-256 before/after).

## 3. CI now matches the map

`docs/SYSTEM_MAP.md` ("CI Gate Split NOW-9") claimed CI ran "Hard Rule 9
advisory check + `guardian:check` only", while the live workflow ran a Jest
matrix on two Node versions, a `npm run test:coverage` step for a **script that
does not exist**, a Codecov upload, plus an evidence gate that exits 1, the
build, and the guardian. Two of the four meaningful steps could never pass.Removed: the whole `test` job (Jest matrix, coverage, Codecov), the evidence gate, and the build. Kept: the advisory integrity check and `guardian:check`, in one `repository-integrity` job. No dependency install — both checks use Node builtins only, and the workflow says so.

**Amended the same day (2026-09-20, later commit):** a second job, `probes`
(`windows-latest`, `npm ci` + `npm run verify:probes`), now runs the deterministic
probe suite, and the integrity check's CI allowlist consequently includes `npm ci`
and `npm run verify:probes`. "CI runs exactly two commands" was true of the
integrity job and is no longer a description of the workflow as a whole; the
authority for what CI runs is the allowlist in `tools/guardian/hard-rule-9.mjs`,
and `docs/SYSTEM_MAP.md` ("CI Gate Split NOW-9") describes both jobs. See
`evidence/ledger_retirement_and_ci_probes_2026-09-20.md`.

Also deleted: `fear-ai-sim/.github/workflows/test.yml`. It asserted the
compliance regime the root file contradicted, and GitHub reads only the
repository root, so it could never run. Its existence made "does CI run a
runner?" depend on which file you opened.

## 4. What deliberately is not a CI gate

- `npm run lint:evidence` — **exits 1** (10,134 rows; ledger last updated
  2026-09-06; declared-vs-derived divergence in `combat`, `diplomacy`,
  `relationships`, `law`, `demography`, `analytics`, `performance`). A
  permanently red gate is what made the last CI unreadable, so it stays manual.
  `docs/DOMAIN_MATURITY.md` gained a dated limitation note: its lead sentence
  makes the linter's derived label the authority, which cannot be defended while
  the linter is red.
- The production build and the 25 probes — manual-audit steps
  (`docs/PROVENANCE.md` §8).

## 5. Limits

This is repository-integrity enforcement, **not middleware verification**. A
green CI here proves the retirement surface is intact and the control plane has
not drifted; it proves nothing about the affective core, adapters, persistence
or hosts, which remain covered by the manual probe regime and the evidence
records in this directory. The gate asserts a documented contract, not that the
contract is good — if the two-command CI scope should change, the allowlist in
`tools/guardian/hard-rule-9.mjs` and `docs/SYSTEM_MAP.md` change together, on
purpose.
