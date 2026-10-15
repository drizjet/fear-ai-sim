# The Unity EditMode Fixtures, Executed Without an Editor — 2026-09-21

**Scope:** three new files and two corrected ones, plus the tripwires that keep
them honest. The Unity adapter row is **not promoted** by any of it: what changed
is that the package's EditMode fixtures now RUN somewhere rather than only
compiling, so a test body that can never pass is caught without an Editor.

## The gap was not the one the ledger was tracking

The standing Unity limitation was "no Editor has run these tests". Underneath it
sat a second, quieter one: the five fixtures in
`packages/adapters/unity/Tests/EditMode/` were **compiled on every run and
executed nowhere**. `verify_unity_editor_tests.mjs` self-skips on every machine
this repository has ever run on, and CI's `unity-editmode` job is inert until a
runner is provisioned with a licence, so for the whole life of the test project
its standard has been "does this compile".

That is the same defect class the repository already found once in the
UnityEngine shim — a gate satisfied by code that cannot work — and it has a
specific cost: an assertion that can never hold on *any* machine is discovered
the day someone finally installs an Editor, or never. Compiling a test is not
running it, and the ledger said so; the fix is to run it.

## What runs

`tools/verification/unity/NUnitTestRunner.cs` reflects over the compiled
fixtures, runs `[OneTimeSetUp]` → `[SetUp]` → `[Test]` → `[TearDown]` →
`[OneTimeTearDown]` in NUnit's order (including **no `[TearDown]` after a failed
`[SetUp]`**, so a teardown on half-built state cannot be reported as a second
failure), honours `[Ignore]` with its reason, prints every outcome, and writes a
machine-readable result. It is compiled and launched by
`verify_dotnet_adapters_compile.mjs` Section C — the probe that already
assembled exactly this project — so it lands in CI through the existing probe
suite with no workflow or allowlist change.

Four things make its green mean something rather than merely appear.

1. **It must pass its own self-test first.** A fixture in
   `FearAI.EditModeFixtureRunner.SelfTest` requires the runner to report a pass,
   an assertion failure, an unexpected exception and an `[Ignore]` correctly.
   Without that, "0 failed" would be a claim about a runner whose ability to say
   "failed" had never been exercised — and a runner that swallows exceptions
   prints exactly the same green summary as a perfectly correct suite. Those
   fixtures are excluded from a real run by namespace, and a real run
   **fails** if they are missing.
2. **What ran is checked against what the sources declare.**
   `tools/verification/helpers/editmode_fixtures.mjs` reads the fixture roster
   and the `[Test]` count out of the test sources; the probe requires the cases
   that ran to equal the count declared and the roster the runner found to equal
   the roster declared. A runner that discovered 39 of 41 tests and printed
   "39 passed" would otherwise be indistinguishable from the real thing.
3. **Every undeliverable test is a named failure.** Non-public, an argument
   list, a non-void return, a `[TestFixture]` declaring no `[Test]`, a fixture
   with no usable constructor: each is reported with its reason rather than
   dropped from the count. The last two were filtered out of discovery in the
   first version of the runner, which is precisely the silent-shrink pattern
   this repository keeps finding; the filter was removed so the refusal branches
   are reachable.
4. **Zero discovered tests exits 2.** A green run of nothing and a green run of
   everything are otherwise indistinguishable.

## It found a test that could never pass

`FearRequestSignerEditModeTests.GeneratedPublicKeyDerIsAValidRsa2048SubjectPublicKeyInfo`
contained:

```csharp
CollectionAssert.AreEqual(new byte[] { 0x05, 0x00 }, algorithmReader.Tagged(0x05),
    "the algorithm parameters must be an explicit NULL for rsaEncryption");
```

`Tagged` returns a TLV's **content**. An explicit NULL on the wire is the two
bytes `05 00`, but its content is empty, so the actual is always a zero-length
array — and a two-element expected collection cannot equal a zero-length actual
under any collection comparison, in this shim or in NUnit. The assertion had
survived review, a compile and every gate in this repository because **nothing
had ever run it**. It was the first failure the runner produced, and it named the
test.

The projection is unchanged: tag `0x05` (asserted by the call), zero length, i.e.
an explicit NULL. It now reads
`Assert.AreEqual(0, algorithmReader.Tagged(0x05).Length, …)`, and reverting it to
the broken form is a mutation the drift test requires to fail.

This is worth stating plainly: the fixture was written by hand, never executed,
and its original comment records that a *previous* draft of the same test
asserted two wrong constants that "would have 'passed' review by looking
plausible". The class of defect is not hypothetical here; it is what hand-written,
never-run assertions do.

## The Editor gate's own roster was incomplete

`verify_unity_editor_tests.mjs` carried a hand-written list of four expected
fixtures that **omitted `FearEncryptedStoreEditModeTests`**. Every assertion the
encrypted store fixture makes could have gone uncompiled in the Editor and that
gate would still have reported success — a check satisfied by the absence of the
thing it checks.

Both probes now read the roster and the count from the one shared helper, so the
run outside the Editor and the run inside one cannot hold different ideas of
which fixtures exist. The Editor probe additionally fails when the Editor ran
**fewer** cases than the sources declare, so a fixture that compiled while its
tests never ran cannot hide behind a green `failed 0`.

`verify_unity_editor_tests.mjs`'s skip text also said the tests were "NOT
compiled or run", which stopped being true the moment they started running
against the shims. It now states what a skip does and does not mean: no Editor
executed them, what only an Editor can answer is still unanswered, and the
fixtures *are* run — against the shims — by the other probe.

## What was run

| Check | Result |
|---|---|
| `node tools/verification/verify_dotnet_adapters_compile.mjs` | **SUCCESS — 27 checks**, `41 case(s) over 5 fixture(s)`, 0 failed, 0 ignored |
| the runner's `--selftest` | 4/4 outcome branches distinguished (pass, assertion failure, exception, `[Ignore]`) |
| `node tools/verification/verify_unity_editor_tests.mjs` | `SKIPPED: no Unity Editor found`, exit 0, stating that the fixtures are run against the shims |
| drift matrix (`zzz_throwaway_editmode_runner_drift.mjs`, deleted in the same session) | **8/8**, every mutation fired, every restore byte-identical by SHA-256 |

The drift matrix mutates, requires the probe to fail with the expected message,
and restores:

- an assertion that can never pass → caught **and the test named**;
- the DER NULL assertion reverted to the broken form → caught (the finding is pinned);
- a non-public `[Test]` → `not public`;
- a test class the source roster does not declare → roster comparison fires;
- a `[TestFixture]` declaring no tests → `declares no [Test] method`;
- a fixture with no usable constructor → `could not be instantiated`;
- a runner mutated so it cannot report a failure → its own self-test fires.

Two of those cases initially "did not fire" against the message the harness
expected, and both were the harness being wrong rather than the probe: a more
specific check fired first (the fixture floor, then the case-count comparison).
That exposed a real diagnostics gap, which is now fixed — the runner's failing
cases and structural refusals are printed **before** any check runs, so the
reason a fixture could not run is on screen whichever check fails first.

## Scope boundary

This closes the "a test body that can never pass" class, and only outside the
Editor. A shim run is not an Editor result:

- `NUnitShim.cs` is not Unity's `nunit.framework` — message formats, comparer
  semantics and `Assert.Throws`' behaviour all differ;
- `UnityEngineShim.cs` is not Unity's API — a signature that differs from the
  real one compiles and passes here and fails in the Editor;
- `PlayerPrefs` here is an in-process dictionary, not a registry or plist;
- MonoBehaviour lifecycle is not exercised at all: `AddComponent` does not call
  `Awake`, and the EditMode fixture set deliberately does not test it;
- frame scheduling, the player scripting profile and anything rendered remain
  outside every probe.

So the Unity row keeps `PARTIAL (BEHAVIOR_VERIFIED_OUTSIDE_EDITOR,
IMPLEMENTED_NOT_EDITOR_VERIFIED)`. The new evidence is about the fixture
**bodies**; whether Unity's runtime behaves as the shims do is still open, and
`npm run verify:unity-editor` on a machine with an Editor remains the only thing
that can answer it.

One bookkeeping consequence worth naming: the three new files under `tools/`
are exactly what `gate-inputs-are-committed` requires be committed. Uncommitted,
this change is a gate failure rather than a working tree.
