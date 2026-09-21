# The Closed Evidence Ledger, the Generated Maturity Map, and the Probe Suite in CI — 2026-09-20

**Scope:** three changes to the repository's integrity infrastructure, none of
them to the middleware. `evidence/lint.mjs` (retired gate + report mode),
`tools/codegen/generate_maturity_map.mjs` (new), `docs/DOMAIN_MATURITY.md`
(historical-superseded, status section generated), `tools/verification/run_probe_suite.mjs`
(new) and the `probes` CI job, plus one probe fix in
`tools/verification/verify_transport_signing.mjs`.

## 1. The audit's first answer was wrong, and rebuilding the comparison showed why

The audit that opened this thread reported that 32 of 47 domains "over-declare"
their maturity, read off the linter's declared-vs-derived divergences
(`combat` declared `UNIT_VERIFIED` → derived `SPECIFIED`, and so on).

Rebuilding the comparison **as recorded** — every ledger row treated as
admissible, so the labels are compared as of the date the ledger was maintained
— gives a different answer:

| Result | Count |
|---|---|
| Domains whose hand-written label matches the label their own rows supported | **36** |
| Genuine record-time disagreements | **0** (the one candidate, `ecology`, is settled in §1b — the hand-written label was right) |
| Declared scope verdicts (allowlisted by the linter) | **1** (`visualization` — `BLOCKED` deliberately) |
| Rows invisible to the comparison (domain cell is not a single token) | **4** (`individual cognition`, `trade routes`, `roaming groups`, `chronicle/history`) |
| Receipt-test artifact domains in the record | **2** (`__receipt_test__`, `__supersession__`) |

So the map did **not** quietly promote labels above their evidence while the
ledger was alive. The seven divergences the live linter prints are **currency**:
rows written up to 2026-09-06 predate the edits made after them, so their tracked
files no longer hash as recorded and the live derivation falls to `SPECIFIED`.

The general lesson is narrow and worth keeping: an exit code that aggregates
dozens of causes was read as if it named one cause. The per-cause breakdown only
appeared when the comparison was rebuilt from scratch, in a form whose semantics
were chosen rather than inherited.

### 1b. The `ecology` row, settled — and it took three answers to get there

**Verdict: the hand-written `CONSEQUENCE_VERIFIED` is the true reading.** The
derivation said `SPECIFIED` twice before the third pass explained why, and the
cause was in the tooling, not the record.

The five vetoing rows are the **original five ecology claims** (`C-ecology-class`,
`C-ecology-unit`, `C-ecology-live-producer`, `C-ecology-live-consumer`,
`C-ecology-consequence` — one per required maturity dimension), all created
**2026-09-03T23:51**, each recording one command
(`--runInBand tests/ecology-season-system.test.js tests/market-cumulative-flows-invariant.test.js`)
that **exited 1**. That timestamp is inside the F3 taint window
(2026-08-30..2026-09-03), which is precisely the window the ledger treats as
admitted-invalid.

The same command was **re-run at 2026-09-04T00:43 and exited 0**, and the record
already holds that successor: 33 later ok rows carry the same
`domain|claimId|dimension` key for each of the five. The ledger's own retirement
rule therefore retires the failed rows, and the domain's five dimensions are all
satisfied: 43 rows each, 42 ok, 1 superseded — `CODE_EXISTS`, `UNIT_VERIFIED`,
`LIVE_PRODUCER`, `LIVE_CONSUMER`, `CONSEQUENCE_VERIFIED`, which is exactly the
`CONSEQUENCE_VERIFIED` label the table declared.

Why the first two passes got it wrong: the generator's "as recorded" mode treated
every row as admissible to remove the git-dependent freshness term, and in doing
so it also discarded the record's **retirement** rule — which is not
git-dependent at all, only the *freshness* term is. Reading a superseded row as a
live veto is the same class of error as the hand-written label it was auditing:
both state more than the evidence says, in opposite directions. The generator now
applies supersession and `EVIDENCE_SUPERSESSION` invalidation statically (pure
function of the committed file), and the block reports the retired-row count per
domain so the adjustment is visible rather than implicit.

**The general check that came out of it:** across the whole ledger there are 174
rows whose commands are not ok. 30 are re-proved later by the same claim. The
other **144 are all in `__receipt_test__`**, a receipt-test artifact domain that
was never a product domain — so after the fix, no product domain is vetoed by a
superseded row, and the settled result is **36 agree, 0 disagree, 1 declared
scope verdict**.

## 2. The gate is retired; the report continues

`npm run lint:evidence` had one honest possible future — green — and no honest
route to it: the ledger is a closed record, and 0 could only have been reached by
bulk-invalidating the unproved rows, which is a declaration rather than a proof.
So:

| Command | Behaviour |
|---|---|
| `npm run lint:evidence` | **refuses**, exit **9**, says what replaced it |
| `npm run evidence:report` | prints the closed-record derivation, exit **0**, banner on stderr, `regime: CLOSED_HISTORICAL_RECORD` in the JSON |
| `node evidence/lint.mjs` | unchanged gate semantics (exit 1 on drift), deliberately not in CI |

The report's exit 0 is not a verdict claim: the question it answers ("how much of
the closed record still re-proves?") has been answered when it prints, and it
states in both the banner and the JSON that it is not current verification.
`docs/SYSTEM_MAP.md`, `AGENTS.md` and `docs/PROVENANCE.md` all now name the
closure and the replacement, because the previous failure mode was a reader
following a retired entry point.

## 3. The map is generated from the record it summarises

`docs/DOMAIN_MATURITY.md` is `status: historical-superseded`
(`superseded_by: docs/CURRENT_TRUTH_LEDGER.md`). Its status section is rendered
between markers by `tools/codegen/generate_maturity_map.mjs` and verified by
`--check` (wired as `npm run codegen:maturity-map:check` and asserted inside
`verify_release_claim_boundaries.mjs`).

**Determinism was a constraint, not a detail.** The derivation is a pure function
of the two committed JSONL files. The linter's live derivation depends on whether
each row's tracked files still hash as recorded — which changes with every commit
— and a generated artifact that changes on every commit cannot be checked in CI.

The block reports, per domain: the label the record supports (as recorded), the
row count, the label the hand-written table declares, and whether they agree. It
also names the four rows the linter cannot see. The document now shows its own
divergence instead of leaving two artifacts to be reconciled by whoever reads
both.

## 4. CI runs the probe suite — and says what it could not prove

New `probes` job (`windows-latest`, `npm ci` then `npm run verify:probes`) running
`tools/verification/run_probe_suite.mjs` over all 25 probes, sequentially
(they bind loopback ports; concurrency would produce port collisions that read
like transport failures).

Verdicts are `PASS`, `PARTIAL` (the probe printed `SKIPPED` — its own reason is
quoted under "NOT PROVEN on this machine") or `FAIL`. Skips are never folded into
the pass count. On this machine: **25 probes, 24 passed, 1 declared skip, 0
failed**. A selection that matches no probe exits **2** instead of printing a
green summary — the runner's own first run did exactly that, which is why the
guard exists.

Windows is deliberate: the probes' external halves resolve Windows tool paths and
every `evidence/` artifact in this directory was captured on Windows/Node, so a
Linux run would report `SKIPPED` for those halves while looking identical.

**One probe could not skip honestly.** `verify_transport_signing.mjs` spawned
`python` unconditionally, so a machine without Python would report five failing
checks that read as "the Python client is broken". It now resolves the interpreter
first and reports the cross-language section as `SKIPPED` for a stated reason with
exit 0 — conservatively skipping the whole section even when a Godot binary is
present, because under-claiming is the safe direction for evidence. The skip
branch was drift-tested by mutation: banner present, **51** assertions instead of
**61**, exit 0.

### 4b. The suite had a flake, and running it is the only reason anybody knows

`verify_transport_signing.mjs` failed **2 of 4 observed runs** — including one
inside a full suite run — with a bare `fetch failed` at the section that restarts
a server. Not random noise: section 4 restarts the server **on the port it just
stopped** (which is what a host does), and the first `fetch` after the rebind
raced the OS releasing that socket. The probe had no readiness wait, so a
transient bind race was reported as a signing failure.

Fixed at the source rather than by retrying the suite:

- `startServer` now waits for the endpoint to answer before returning, so every
  section benefits and the wait is a property of "a server I just started";
- `rawHttp` retries **transport-level** failures only — an HTTP response of any
  status is returned immediately, because every refusal this probe asserts is a
  4xx with a JSON body, so a retry cannot launder a refusal into a pass;
- after the fix: **8/8** consecutive runs (previously 2 failures in 4 observed
  runs; the rate was never measured, only observed).

The mechanism is worth keeping: this was invisible in every document, and obvious
within one execution of the suite. It is the argument for the roster below being
generated from real runs.

### 4c. The dossier's probe roster is generated from the run

`docs/RELEASE_CANDIDATE_CERTIFICATION.md` carried its verification as prose ("all
twenty-one probes were rerun and exited 0") — a claim about a run, written by
hand, that nothing compared to the run. The roster is now generated by
`tools/codegen/generate_release_dossier.mjs` from
`evidence/probe_suite_report.json` (the runner's `--json` summary) and
drift-checked inside the release-claim probe.

Each row carries the probe's verdict, its assertion count (the **last** count in
its output — the first attempt reported an in-engine subtotal as if it were the
probe's whole claim: 37 for the store probe whose total is 46), and its own last
meaningful line, because the final line was usually a banner rule. Rows that
were not proven are printed as NOT PROVEN; failures would be printed as FAILED.
A probe that states no count shows `—` rather than an invented number.

CI archives the same summary as the `probe-suite-report` artifact, so a run's
verdicts are queryable rather than only scrollable.

### 4d. CI now has an engine, and an expectation

The `probes` job fetches the pinned Godot 4.6 binary via `tools/ci/fetch_godot.ps1`
(the same version the recorded evidence used) and exports `FEAR_AI_GODOT`, so the
three probes with in-engine halves exercise them on the runner instead of
reporting SKIPPED. `FEAR_AI_EXPECT_PROVEN` declares that this runner has those
runtimes, so a skip there **fails the job**: otherwise an environment that lost
its engine would report the same green summary as one that never had it.

The script is a committed file rather than a multi-line workflow block so the CI
allowlist (asserted by the integrity check) keeps its meaning. It pins no
checksum and **prints the SHA-256 it received** rather than implying an integrity
check nobody performed. It was exercised locally end to end — download, extract,
`--version`, import-cache warm-up, env export — because a CI-only path that has
never run is a guess, and this one would have been the only untested step in the
whole job.

## 5. Drift tests

Each new tripwire was proved by mutation and restored byte-identically (SHA-256
compared before and after):

| Mutation | Fired |
|---|---|
| one character edited inside the generated map block | release-claim probe (`--check` reports DRIFT) |
| `evidence:report` script renamed away in `package.json` | release-claim probe |
| `docs/DOMAIN_MATURITY.md` reverted to `status: active` | release-claim probe (superseded-records loop) |
| `npm run evidence:report` removed from a doc that must name it | release-claim probe |
| run with `--only` matching no probe | probe runner, exit 2 |
| one character edited inside the generated dossier roster | release-claim probe (`--check` reports DRIFT) |
| `evidence/probe_suite_report.json` reverted to a non-recorded shape | release-claim probe (`"kind": "recorded-probe-suite-run"` absent) |
| a `run:` command added to CI that is not in the allowlist | integrity gate (`ci-runs-exactly-the-allowlist`) |

## 6. Limits

This is repository-integrity and document work. Nothing here verifies the
affective core, adapters, persistence or hosts; the probe job's green means the
probes passed **on the runner's platform**, with Godot in-engine evidence, the
Unity Editor gate and host-tree evidence still absent from CI and still manual.
The evidence ledger was **not** reconciled — it is closed, and its numbers must
not be read as current verification. The single genuine record-time disagreement
(`ecology`) is reported, not resolved: resolving it would mean re-proving that
domain's claims, which is a different task from this one.
