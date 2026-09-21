# Catching Flakes, Pinning the Engine, and Making the Roster Legible — 2026-09-20

**Scope:** three changes that harden *how* this repository proves things, plus the
viva for each. None of them touches the affective core; all of them touch whether a
green result here means anything.

The starting point was concrete rather than theoretical. The previous record
(`ledger_retirement_and_ci_probes_2026-09-20.md`) documents a real flake found in
this repository: `verify_transport_signing.mjs` failed **2 of 4 observed runs**
before it was fixed, and one of those failures was inside a full suite run that had
otherwise been green. That is the defect class this record is about. A flake is the
most expensive kind of red there is, because the cheapest human response to it is to
re-run until green — and a re-run-until-green suite cannot be distinguished from a
suite that proves nothing. Fixing one instance does not prove the class is gone,
because a single run cannot observe a property of repeated runs.

## 1. The suite now checks its own determinism, on a clock

`tools/verification/run_probe_suite.mjs` gained `--repeat <n>`. Each probe is run up
to `n` times; the verdict is `STABLE` only if every run agreed, `FLAKY` if they
disagreed, and `FLAKY` is counted as a failure and makes the run exit 1. A
disagreement ends that probe early — a verdict that already differs needs no further
samples to be called flaky. The JSON report changes kind accordingly
(`recorded-probe-stability-run`, with a `verdicts` array per probe), so a repeated
run cannot be mistaken for the single-run recording the release dossier is generated
from.

`npm run verify:probe-stability` is the entry point (`--repeat 3`), and
`.github/workflows/test.yml` gained a third job, `probe-stability`, that runs it
**nightly** (`schedule`) and on `workflow_dispatch` — never on push. Nightly rather
than per-push for two reasons: a flake is by definition invisible to the run that
missed it, and tripling the suite on every pull request buys latency instead of
signal. The job fetches the same pinned engine as the per-push job and declares the
same `FEAR_AI_EXPECT_PROVEN`, so its in-engine halves are exercised rather than
skipped, and it uploads `probe-stability-report` with `if: always()` — the evidence
of a flake is the sequence of verdicts, so the report matters most in the run that
failed.

**Proven, by running it.** A throwaway probe that alternated verdicts on a counter
was placed in `tools/verification/`, run with `--repeat 3`, and deleted in the same
command:

```
  FLAKY    verify_zzz_throwaway_flake.mjs                    0.1s  PASSED FAILED
  1 probes: 0 passed, 0 passed with declared skips, 1 failed
  exit=1
  report: recorded-probe-stability-run { probes: 1, passed: 0, failed: 1 } ["PASSED","FAILED"]
```

A stable probe reports `STABLE` and the same `verdicts` array without the failure
(`verify_release_claim_boundaries.mjs`, 3×, `["PASSED","PASSED","PASSED"]`).

**The gate keeps it honest.** `probe-stability-is-wired-and-repeats` asserts the npm
script actually repeats (`/run_probe_suite\.mjs --repeat [2-9]\d*/`). Without it, a
later edit to `--repeat 1` would leave the nightly job green, uploading a report, and
proving nothing — which is precisely the shape of rot the retirement gate exists to
catch. The stability command is also in the CI allowlist, and `SYSTEM_MAP.md` now
states the three-job contract, so the map and the workflow are compared rather than
merely adjacent.

## 2. The engine CI installs is now verified against two published digests

`tools/ci/fetch_godot.ps1` previously printed the SHA-256 of what it downloaded and
pinned nothing, on the stated grounds that "claiming integrity we do not verify
would be worse than saying what was checked". That was honest but weak: the job
installs a binary and then **executes** it, and HTTPS authenticates the transport,
not the bytes. A re-uploaded or substituted asset under the same tag would arrive
looking exactly as trustworthy — and would invalidate the recorded in-engine
evidence, which names this exact version.

The archive is now checked against:

- **SHA-512** `3b2f0b4b3c490cb1a78db8fd2afc924412edab996b436c08e38957388976e9dfaf203cb50a8916036bc810f68da3dd6b9f16561e6549062ef225b4a97877081b`, from the release's own `SHA512-SUMS.txt`;
- **SHA-256** `5c9177625c0dca18c92ba6328203c7b5a9596c85ef9d7c968396f0272d8f10d9`, the digest GitHub computes over the uploaded asset and serves from the release API for tag `4.6-stable`;
- **size** 79,418,197 bytes, which catches a truncated transfer before hashing 79 MB.

Both digests are recorded together because they corroborate each other: two parties
published a digest for the same bytes, and a download must satisfy both. A mismatch
is not treated as a flaky network — the script deletes the file and fails with both
values printed.

**Proven, in both directions.** A fresh download into a space-free destination
satisfied all three checks, and the engine it produced ran and warmed the import
cache:

```
  received: 79418197 bytes
            sha256 5c9177625c0dca18c92ba6328203c7b5a9596c85ef9d7c968396f0272d8f10d9
            sha512 3b2f0b4b3c490cb1a78db8fd2afc924412edab996b436c08e38957388976e9dfaf203cb50a8916036bc810f68da3dd6b9f16561e6549062ef225b4a97877081b
  verified: size and both digests match the published values
  engine: 4.6.stable.official.89cea1439
  FEAR_AI_GODOT would be set to: C:\tmp\godot-pin-ok\godot-4.6-stable\Godot_v4.6-stable_win64_console.exe
```

The failure branch was exercised for real with `-Url` pointed at a 1,149-byte file
and a deliberately wrong expected digest: `size expected 79418197, received 1149`,
the download deleted, exit 1, no archive left behind.

### 2a. A space in an ancestor directory breaks the engine, and that is now checked

Fetching is not the same as running, and running it is how this was found. The first
attempt extracted the engine into a directory **inside this repository** and the
engine refused to start:

```
  engine: CreateProcess failed, error 193
```

Error 193 is "not a valid Win32 application" — a message that blames the binary. The
binary was byte-perfect: the same bytes (`sha256 63913d01…` for
`Godot_v4.6-stable_win64.exe`) ran correctly when copied elsewhere, and the
pre-existing install used by every recorded in-engine artifact
(`C:\tools\02-Dev\godot`) reports `4.6.stable.official.89cea1439` from the same
build. Copying the identical bytes to several paths isolated the variable:

| path | result |
|---|---|
| `<repo>/g46test/` — space in an ancestor (`lains Tools`) | `CreateProcess failed, error 193` |
| `<repo>/.godot-pin-check/godot-4.6-stable/` — same | `CreateProcess failed, error 193` |
| `C:\tools\03-Projects\g46\` — no spaces at all | `4.6.stable.official.89cea1439` |
| `/tmp/g46 b/` — space in the engine's own leaf directory | `4.6.stable.official.89cea1439` |

Godot's `_console.exe` is a 198 KB wrapper that relaunches the real binary, and a
space in an **ancestor** directory breaks that relaunch; a space in the engine's own
directory does not. The fetch script now refuses a destination whose path contains a
space, with the reason in the message, so the failure surfaces at the cause rather
than as an in-engine probe failing or timing out three minutes later. CI is
unaffected — `windows-latest` checks out to `D:\a\fear-ai-sim\fear-ai-sim` — but this
repository's own working copy lives under `...\lains Tools\...`, so a developer
following the CI recipe by hand hits it immediately. That asymmetry is the reason the
check belongs in the script rather than in a README nobody reads at 2 a.m.

## 3. The roster says what its green means

The runner now states the engine environment in its header, in the JSON report
(`engine`), and in the GitHub step summary: `FEAR_AI_GODOT=<path>`, or that the
variable is unset and the in-engine probes fall back to their own discovery. The
wording is deliberate — an unset variable does **not** mean those halves were
skipped (every recorded Windows artifact was captured with no `FEAR_AI_GODOT` set),
and a summary that predicted a skip the roster contradicts would be a new lie in the
place people read first. A set-but-missing path is called out as `MISSING FILE`.

The step summary also gained the repeat line when the run is repeated
(`Repeated up to 3× per probe … FLAKY is counted as a failure`), so a reviewer
reading the nightly job's summary sees the stricter rule rather than inferring the
per-push one.

## Drift tests

Every new tripwire was mutated and required to fire, then restored and verified by
hash:

| mutation | required result | outcome |
|---|---|---|
| `verify:probe-stability` changed to `--repeat 1` | gate fails `probe-stability-is-wired-and-repeats` | FIRED |
| the nightly job's `run:` step deleted | gate reports it as `missing` | FIRED |
| an unallowlisted `run:` added to the workflow | gate reports it as `unexpected` | FIRED |
| a probe that alternates verdicts, run with `--repeat 3` | `FLAKY`, counted as failed, exit 1 | FIRED |

Both restored files hash-identical to their pre-mutation state
(`098c65b2da16…`, `9bdfbe83b577…`), and the gate returns to 17/17 green.

## 4. The Unity Editor gate is wired, and deliberately inert

`verify_unity_editor_tests.mjs` is the single declared skip in the suite, and it
will stay one here: this machine has no Unity Editor and no Hub install (the usual
roots — `C:\Program Files\Unity\Hub\Editor`, `%APPDATA%\UnityHub\Editor` — are
absent), so the probe prints `SKIPPED`, names what was not compiled or run, and
exits 0.

A fourth CI job, `unity-editmode`, now runs it. The job is **inert until a runner is
provisioned for it**: it is gated on `if: vars.UNITY_EDITOR_AVAILABLE == 'true'`, runs
on `${{ vars.UNITY_RUNNER || 'windows-latest' }}`, and passes
`vars.UNITY_EDITOR` through as `FEAR_AI_UNITY` (the probe also discovers Hub install
roots itself). This is not caution for its own sake. No GitHub-hosted runner has a
Unity Editor or a license, so a job that tried to install one would need a license
secret this repository does not have — and a job that ran anyway would be red on
every push forever, which is exactly the defect `.github/workflows/test.yml` was
rewritten in the previous record to remove. An inert job that proves nothing is
worse than no job only if nobody knows it is inert, so the ledger and the release
dossier say so.

When it does run, it is strict: `FEAR_AI_UNITY_REQUIRED=1` makes a missing Editor a
failure rather than a comfortable skip, and the probe already fails on a red test, a
missing results file, or **zero tests executed**. The integrity gate asserts both
markers (`unity-editor-gate-is-inert-until-configured`), so a later edit cannot make
the job unconditional, and cannot quietly drop the strict flag either — the two ways
this job could lie are both tripwired.

What is still true, and stays true: **no Unity Editor has executed these tests.**
The EditMode sources are compiled outside the Editor by
`verify_dotnet_adapters_compile.mjs` against a shim plus a minimal NUnit surface, so
they are not shipped unread by a compiler — but compiling a test is not running it,
and nothing in this record promotes the Unity adapter row.

## 4b. The dossier now states its own determinism, including where it has none

A second generated block was added to `docs/RELEASE_CANDIDATE_CERTIFICATION.md`,
rendered by `tools/codegen/generate_release_dossier.mjs` from
`evidence/probe_stability_report.json` — a real `--repeat 3` pass of the whole suite,
recorded here rather than described. It carries the recorded date, machine, engine
and repeat count; a per-probe table of the **runs actually observed** and the verdict
sequence; the honest split between probes that were repeatable and probes that proved
their claim; and the list of probes that were **never repeated at all**.

The recorded run: **25 of 25 probes gave the same verdict on every attempt**, 24
proving their claim and 1 (`verify_unity_editor_tests.mjs`) reporting its declared
skip three times over. The section says explicitly that this is repeatability on one
machine at one date, not determinism in general, and that repeating a skip does not
turn it into a pass.

Two design choices are worth naming, because both are about not lying by omission:

- **`Runs` can be lower than the repeat count.** A disagreement ends that probe
  early, so a flaky probe is reported as 2 runs of 3 with the sequence
  `PASSED, FAILED` and `FLAKY` rather than being printed as three runs that mostly
  agreed.
- **An absent artifact is rendered, not omitted.** With the recorded repeated run
  missing — or present but not a repeated run (`kind`/`repeat` checked) — the section
  says so in the document and lists **all 25 probes as never repeated**, naming the
  command that produces one. A dossier that silently dropped the section would read
  exactly like a dossier whose every probe repeated cleanly, which is the failure
  mode this whole block exists to prevent. The release-claim probe now requires the
  section to be present, so deleting it fails a probe.

**Recording order matters, and the tripwire enforces it.** Regenerating the block is
what keeps the dossier honest, and `verify_release_claim_boundaries.mjs` runs the
generator's `--check`, so recording a new run *without* regenerating makes that probe
fail with `DRIFT` inside the next suite run. That happened here, twice, and the
failure is correct: for a moment the dossier described a run that was no longer the
recorded one. The order is regenerate → record → regenerate, and the release-claim
probe is the thing that refuses to let it be done in the wrong order quietly.

Drift-tested in six directions, all restored byte-identical by hash: a `repeat` of 1
in the artifact (refused as "not a repeated run"), a deliberately disagreeing probe
(rendered `PASSED, FAILED, PASSED **FLAKY**` and listed under *Disagreed across
runs*), the artifact deleted (rendered as never-repeated for all 25 plus the
re-record command), and `--check` failing in each of the first two and third cases
before the generator was run.

## 4c. A night is compared to the recording, and every night is kept

Recording a run proves something about that night and nothing about the next one.
Two gaps followed, and both are now closed by
`tools/verification/stability_regression.mjs` (`npm run verify:stability-regression`).

**The comparison.** The fresh repeated run is checked against the committed
recording (`evidence/probe_stability_report.json`) and fails on three kinds of
regression, each naming the probe and what changed:

- **intermittent now** — the recording had `PASSED, PASSED, PASSED` and tonight has
  `PASSED, FAILED, PASSED`;
- **fails consistently now** — the recording had a pass and tonight every attempt
  failed;
- **lost the proof** — `PASSED` in the recording and not `PASSED` tonight, which is
  either a broken probe or an environment that lost the engine the probe needs.

A probe that exists on only one side is **suite drift** and is reported, not
failed: a suite that legitimately gained or lost a probe is not a regression, and
gating it would create a job that cannot pass. A missing artifact, or one whose
`kind`/`repeat` says it is not a repeated run, exits **2** with the command that
produces a real one, because comparing two incomparable things is worse than
refusing. The nightly job runs this step with `if: always()`, so the run that went
red is the one that says which probe changed.

**The ledger.** Three attempts catch a defect that fires a third of the time and
nothing rarer — which is most intermittency. So every repeated run is appended to
`evidence/probe_stability_ledger.jsonl`, one JSONL entry per night, and the
aggregate question is asked of the whole file: across all recorded nights, how many
attempts has each probe made, and on how many nights did it disagree with itself?
Tonight's clean run stops being "stable" and becomes "never observed disagreeing in
75 attempts across 1 recorded night". The sentence ends there on purpose: that is
still a bound, not a proof, and a probe nobody has seen disagree may be broken.

Two details are deliberate rather than incidental. A malformed ledger line exits 2
instead of being skipped, because silently dropping a night hides exactly the gap the
ledger exists to expose. And **ledger flakiness is reported and never gated**: a
recorded fact cannot be failed away, and a job that went red every night because of
one would teach everyone that red means nothing — the failure mode this whole thread
of work exists to remove. The dossier renders those probes in an *ever intermittent*
table with their night and attempt counts.

The CI job passes `--append-history evidence/probe_stability_ledger.jsonl`, so the
artifact it uploads is the committed ledger **plus tonight**; folding a night back
into the repository is reviewing that diff. What is committed right now is **one** night:
`2026-09-21T03:44:24Z`, the recording, seeded into the ledger with this tool — 25
probes, 75 attempts, no probe ever observed disagreeing. It becomes a rolling ledger
the first time the nightly job's artifact is folded back in. Idempotency was verified
separately, on a temp ledger: appending the same `recordedAt` twice leaves one line,
so a re-run of the same recording cannot inflate the attempt counts.

**Drift-tested in ten directions**, all on synthetic artifacts in a temp directory so
the committed recording was never mutated: intermittent-now, consistent-failure and
lost-proof each exit 1 with the right sentence; dropped and newly added probes are
reported and exit 0; a single-run recording, a missing fresh run and a corrupt ledger
line each exit 2; a ledger whose one disagreement night is 1 of 4 with 11 attempts
reports exactly that; a clean ledger prints its own bound; and the dossier renders a
flaky ledger as an ever-intermittent row while its own `--check` still passes (a
committed-file round trip, restored byte-identical by hash). Two of my assertions
initially failed for the same reason as one earlier in this record — they required
text that only appears in the *degraded* case (the flaky wording, the "8 attempts" of
an intermediate ledger) — which is why the probe assertions now target the generator
for branch-specific wording and the document only for text that is always rendered.

## 4d. Time is a signal too, and a rate needs a sample

**Timing.** Every ledger entry already carried each probe's `durationMs`, so a probe
that has quietly become much slower was a defect the record could see and nothing was
looking at. `timingComparison()` — one implementation, called by both the nightly gate
and the dossier generator — compares a night against a baseline drawn from **earlier
nights on the same platform and Node major only**, because a ratio across two
machines measures the machines; a cross-platform ratio is refused as *incomparable*
rather than guessed. It gates at ≥ 3× from a baseline of ≥ 500 ms with a delta of
≥ 1000 ms; the floors exist because without them a 40 ms probe becoming 400 ms reads
as a 10× regression, which is noise wearing the costume of a finding. Much **faster**
than baseline is reported and never gated — a cache explains it, and so would a probe
that stopped doing the work it used to do, and picking between those stories without
evidence is the kind of unfalsifiable claim this repository keeps removing.

**The rate.** A night is a Bernoulli trial — the probe either agreed with itself or it
did not — and a night's attempts are not independent, so a per-attempt rate would be
biased where it matters: the early exit on disagreement makes flaky nights *shorter*.
So the rate is disagreement-nights over nights, with a **95% Wilson score interval**.
Wilson rather than the normal approximation because k is usually 0, where the normal
interval collapses to zero width and would turn "never seen disagreeing" into "cannot
disagree". The bound is the headline: one clean night still bounds a probe's rate at
**79.3%**, five clean nights at **43.4%**. That number is the argument for extending
the ledger, and it is printed in the dossier beside the clean result rather than being
left as an implication. The gate fires at **≥ 20% over ≥ 5 nights**, so the nightly job
cannot go red on one night's luck, and a probe that has ever flaked stays reported and
un-gated until the rate is a measurement rather than an incident.

**Drift-tested**, all on synthetic artifacts with the committed recording untouched: a
10× slowdown from a long enough baseline exits 1 and prints `9.9x slower than 1
comparable night(s) (34391 ms -> 342000 ms) — GATED`; the same slowdown on a `linux`
platform is refused as incomparable and exits 0; a sub-500 ms baseline cannot trip it;
a probe at a quarter of its baseline is reported and not gated (`FASTER … reported, not
gated`); two disagreements over seven nights exits 1 with `2 of 7 night(s), 28.6%
observed, 95% interval 8.2%–64.1% — GATED (rate)`; the same rate over four nights is
reported only, with the minimum-nights rule printed beside it; and the Wilson bounds
were asserted numerically (0/1 → 79.3%, 2/7 → [8.2%, 64.1%]).

**One bug here belongs in the record, because it is this thread's whole subject.** The
first version of the comparability test compared a Node major version against the
*array* returned by `split('.')`, so it was false for every input: the timing gate
could never fire, and it would have printed "no probe ran slower than its baseline" on
every run, forever — a check that always passes and never checks, which is exactly the
thing every piece of work in this record exists to find. It surfaced only because the
drift test *required the gate to fire* rather than trusting the output. Three
assertions of mine were wrong in the same session (a stale baseline number, and two
forgotten `+ tonight` denominators in the ledger), and the difference between those and
this one is that here the code was wrong and my expectation was right — which is the
only reason it was not filed as one more bad expectation.

## 4e. Folding a night in is one reviewed command, because otherwise nights do not accumulate

The ledger is what makes an intermittency rarer than the repeat count visible, and it
only works if nights accumulate. CI can append and upload but it cannot commit, so the
last step — getting the artifact into the record — was left to a human with a text
editor. That step is done rarely, done inconsistently, or done by hand-editing the
authority record, and a rate measured over one night bounds nothing useful.

`npm run fold:stability-ledger -- --from <artifact>` (`tools/verification/fold_stability_ledger.mjs`)
is that step, and it is a **dry run by default**. It validates the artifact, lists the
new nights, flags any night on which a probe disagreed with itself, notes nights that
carry no per-run durations, and prints the ledger's nights and attempts plus every
affected probe's rate and 95% interval **before and after** — which is what the rate
gate will act on. `--write` applies it. Reviewing and applying are one command with one
flag between them, which is the closest thing to automatic that still leaves a human
answering for what entered the record.

**Refusing is the default posture**, because a fold is a write into the record that
every rate is computed from: a malformed entry, a truncated artifact, an entry that is
not a repeated run, an empty file, or an entry naming a probe absent from the
committed recording all exit **2** rather than being skipped — a dropped night or a
foreign probe name rewrites every other probe's denominators. An entry already present
is skipped, so folding the same artifact twice cannot inflate the attempt counts. And a
night that makes a probe look *worse* is never refused: that is the finding, not an
error, and the nightly job has already gated tonight's run.

**Drift-tested in nine directions** (synthetic artifacts, temp ledger): a dry run
showing new nights and a disagreement; the before/after effect on nights, attempts and
rates; a dry run that writes nothing; `--write` folding two nights; the same artifact
again as a no-op; an unknown probe refused; a truncated artifact refused rather than
shortened; a single-run entry refused; an empty artifact refused.

## 4f. A step is not the only shape a timing regression takes

The step gate catches a probe that jumped. It cannot catch one that creeps: a probe
losing 10% a night, every night, never reaches 3× and is exactly the kind of quiet decay
that makes a green result stop meaning what it meant. So the runner now records each
probe's **per-run durations** beside the night's total, and `durationDrift()` pools them
across comparable nights and asks a distributional question instead: is the median of
the **most recent two** comparable nights at least **1.5×** the median of the earlier
nights **and** above the probe's own pooled **p90**, from a baseline of at least 100 ms?
All three conditions, because any one alone is noise — the ratio alone fires on a noisy
probe, and the p90 alone fires on a probe with one wild night.

It needs **4 comparable nights** carrying per-run durations, so it says "not yet
measurable" rather than making a weak claim, and nights from before the runner emitted
per-run durations are **excluded from the pool and counted in the output**: a pooled
sample that quietly shrank would be the same class of silence this ledger exists to
break. A rise that passes 1.25× without passing the gate is reported as **RISING** and
never gated, for the same reason the FASTER note is not: it may be real, and it may be a
cached dependency resolving differently.

Drift-tested in five directions: a 2× creep gated (exit 1, `above the probe's own p90`);
a 1.3× creep reported as RISING (exit 0); three nights reported as not yet measurable;
a pool with two legacy nights excluded and the exclusion stated while still gating the
creep; and a rise that stays inside the probe's own spread reported as no drift. One of
those tests found a real defect: the "not yet measurable" branch returned an object
without the arrays the report loop reads, so the first time that branch ran the tool
crashed with a `TypeError` instead of printing the result. Every branch now returns
every field a caller reads, and the drift matrix is what forced the branch to execute.

## 4g. Recording order, and a night that had to be repaired

One more failure mode surfaced here, and it is worth stating because it is easy to walk
into twice. Because the release-claim probe runs the dossier generator's `--check`, **any**
new recording invalidates the dossier until it is regenerated. So recording the suite and
then the repeated run in one sitting makes the release-claim probe fail *inside* the
second recording. The order is record → regenerate → record → regenerate.

The consequence was concrete: the ledger briefly held a night whose
`verify_release_claim_boundaries.mjs` verdicts were `FAILED, FAILED, FAILED`. That is a
**bookkeeping** failure — the probe was right, the dossier was stale when it ran — and
not a middleware defect. Leaving it in would have put a permanently failing probe in the
denominators of every rate this repository reports, so the night was removed and
re-recorded cleanly, and the removal is stated here rather than being an edit nobody can
see. The committed ledger now holds **two** nights: `2026-09-21T03:44:24Z` (recorded
before the runner emitted per-run durations, so it counts for the rate and is excluded
from the pooled timing sample, and the output says so) and `2026-09-21T04:11:51Z` — 150
probe attempts, no probe ever observed disagreeing, and a 95% Wilson bound of **65.8%**
on any probe's flake rate. Two nights is still a weak bound, which is the argument for
the fold command in §4e.

## Limits, stated plainly

- The nightly job has been exercised **locally** on Windows; it has not yet run on
  `windows-latest` itself. The first scheduled run is the first real test of it, and
  the same is true of the `probes` job's Godot step before it.
- `--repeat 3` bounds the observation, it does not prove determinism. A flake that
  fires one time in ten will usually survive three runs; raising the count raises the
  cost linearly and the detection probability sub-linearly. The value is in catching
  the *cheap* flakes — the ones that fail a third of the time, like the
  `verify_transport_signing` race that motivated this — not in certifying the
  absence of all of them.
- The digest pin covers the **archive**. Extraction is not re-verified, and the
  extracted binaries carry no independent pin; a cached extraction is trusted as-is,
  which the script prints. File-level hashes would be stronger and are not available
  from the release.
- The Unity Editor gate is still the single declared skip. No Unity Editor exists on
  this machine (no Hub install, no editor root), so `verify_unity_editor_tests.mjs`
  reports `SKIPPED` and names what was not compiled or run. It is designed for CI
  (`FEAR_AI_UNITY_REQUIRED=1` turns a skip into a failure), but nothing here has run
  it in a real Editor. §4 wires it into CI as an inert-until-configured job, which
does not change that.
