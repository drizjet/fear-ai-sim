# Declared Runtimes and the Unity Lifecycle — 2026-09-21

**Scope:** two changes that both narrow the same claim from different sides. The
first makes the Unity fixture run a *proven* step in CI rather than a step that
merely does not fail; the second makes the adapter's lifecycle **bodies** execute
instead of being written down as untestable. The Unity row is still
`PARTIAL (BEHAVIOR_VERIFIED_OUTSIDE_EDITOR, IMPLEMENTED_NOT_EDITOR_VERIFIED)`:
no Editor has run anything, and nothing here changes that.

## 1. A probe that skips is not a probe that ran

`verify_dotnet_adapters_compile.mjs` reports `SKIPPED` when `dotnet` is missing
from `PATH`. The probe runner treats a `SKIPPED` line as **NOT PROVEN**, which is
correct — it is neither a pass nor a failure — but it means the job still exits 0.
So the 41 Unity fixture cases that the previous change put into CI could be
silently unexecuted on a runner that had lost its .NET SDK, with the same green
suite summary as a runner that had it.

Both Windows jobs now declare it:

```yaml
FEAR_AI_EXPECT_PROVEN: store_encryption,host_token_persistence,transport_signing,verify_dotnet_adapters_compile
```

`FEAR_AI_EXPECT_PROVEN` means "this environment HAS the runtime, so a skip here is
an environment defect". The runner image ships the .NET SDK, so the declaration is
true, and a skip on the runner is now a failure rather than a comfortable green.

Demonstrated both ways on this machine by hiding `dotnet` from `PATH`:

| Run | Result |
|---|---|
| `dotnet` hidden, no declaration | exit **0** — probe listed as NOT PROVEN, suite still green |
| `dotnet` hidden, declared | exit **1** — `FAILED EXPECTATION` naming the probe |
| `dotnet` present, declared (CI) | `verify_dotnet_adapters_compile.mjs` **PASS** in 29.6s on `windows-latest` |

### The declaration has to be checkable, or it is decoration

The runner promotes a skip by testing `probeFilename.includes(declaredName)`. A
renamed probe, a typo, or a declaration copied from another job therefore turns
the expectation back into a no-op: the gate keeps passing and the thing it was
declared to prove is checked nowhere. That is the same shape of silent rot as the
Editor gate's incomplete fixture roster, so it gets the same treatment.

`expect-proven-names-match-a-real-probe` (in `tools/guardian/hard-rule-9.mjs`)
derives the probe roster from `tools/verification/` and requires every declared
name to match one. It also fails when the list is empty, because a workflow that
declares no runtimes never promotes a skip at all — a gate that can only pass
when the feature is switched off is not a gate.

Proven by mutation, each required to fire with the workflow restored
byte-identically:

- a declared name that matches no probe (`verify_dotnet_compilers`) → fires;
- declarations present **only inside a comment** → fires, because the check reads
  the comment-stripped workflow (the same trap the ledger-PR assertions fell into
  once, where the header comment satisfied the check on its own).

One mutation deliberately does *not* count as rot: `verify_dotnet_adapter`, a
prefix of the real name, still matches — and it has to, because that is exactly
the string the runner would promote a skip on. The check mirrors the runner's
semantics rather than being stricter than the thing it guards.

### And the fixtures run on a clock

The nightly job declares the same runtimes. `verify:probe-stability` runs each
probe three times and fails on a probe whose verdicts disagree, so the 41 fixture
cases are re-executed on every scheduled run. Repetition is the only thing that
would show a fixture body that is *intermittently* wrong rather than wrong every
time, and these fixtures are the kind that could be: they use fresh GUIDs,
temporary directories and freshly generated RSA-2048 keys, so a collision or a
race would present as a flake rather than as a failure.

## 2. Five of the adapter's six lifecycle bodies had never been executed

`FearAIClient` declares `Awake`, `Start`, `OnDestroy` and `FixedUpdate`. The
harness invoked `Awake` by reflection, and **nothing invoked `Start`, `OnEnable`,
`Update`, `OnDisable` or `OnDestroy` at all** — `Object.DestroyImmediate` was an
empty method. So the connection bootstrap in `Start` and the teardown in
`OnDestroy` were in exactly the position the EditMode fixtures were in before:
code that could never work and code that works perfectly looked identical.

The limit had been written down honestly — "whether Unity calls this when I think
it does is an Editor question" — and that sentence was true. What it concealed
was that nothing *called* them either.

### The shim now owns the order

`UnityLifecycle` in `UnityEngineShim.cs` runs:

```
Wake   ->  Awake, OnEnable
Frame  ->  Start (once per component), then Update
Destroy ->  OnDisable, then OnDestroy   (on the object, and on every component
                                         attached to a GameObject)
```

Methods are found **by name** through reflection including private ones, because
that is how Unity finds them — `MonoBehaviour` declares none of the six.

`AddComponent` still attaches **without** waking, and that is a stated divergence
rather than an oversight. Unity wakes inside `AddComponent` for a component added
from code, and for that case there are no serialized values to apply first. The
harness needs the other case, which is the one every host actually ships: a
component that **arrives with its values**, as a scene or prefab component does.
So construction and waking are separate phases, and the harness says which order
it means instead of a comment claiming one.

### The order is asserted before it is used

Phase 1 drives an instrumented `LifecycleOrderProbe` and requires the exact
sequence at each step — `""` → `Awake,OnEnable` → `Awake,OnEnable,Start,Update` →
`Awake,OnEnable,Start,Update,Update` → `…,OnDisable,OnDestroy`. That pins the
once-only rule for `Start` and the destruction order on something the harness can
interrogate, so the model cannot be quietly changed into something that would make
the adapter assertions vacuous.

Only then does it assert the adapter:

- `FearAIClient.Instance` is this client — which only `Awake` sets, so the shim's
  wake is demonstrably what ran it;
- a frame runs the adapter's `async void Start` without throwing;
- destroying the host runs `OnDestroy` without throwing;
- teardown did **not** take the persisted credential with it.

Phase 1 is **25 assertions** (from 18); the probe's own total stays 37 and all
four phases pass in their own processes.

## What was run

| Check | Result |
|---|---|
| `npm run verify:unity-behavior` | SUCCESS — 37 probe assertions, 4 phases, phase 1 at 25/25 |
| `npm run verify:dotnet-adapters` | SUCCESS — 27 checks, 41 fixture cases, unchanged by the shim edit |
| `npm run verify:hard-rule-9` | **26/26** with the new declaration check |
| `expect-proven` drift matrix (throwaway, deleted) | 3/3 — both mutations fired, workflow restored byte-identically |
| hidden-`dotnet` matrix | exit 0 undeclared / exit 1 declared |

## Scope boundary

The lifecycle **bodies** are driven; the **timing** is not modelled. Still
Editor-only: when Unity calls any of these relative to `AddComponent`, a scene
load or a frame boundary; script execution order; `Reset`, `OnValidate`,
`OnApplicationPause`, `OnApplicationFocus`, `LateUpdate`; domain reload; and any
player-loop timing.

Three narrower caveats worth stating rather than implying:

- `FixedUpdate` is deliberately **not** invoked from the frame pump. It is the
  async control-plane tick that then awaits HTTP, and driving it beside the
  requests the harness pumps by hand would make the run racy rather than more
  faithful. The tick path stays explicit.
- An `async void` body is invoked and **not awaited** — as Unity does not await it
  either, but Unity keeps ticking frames and there is no frame loop here. So a
  call proves the synchronous prologue ran, not that its continuations completed.
- `FearAgent.cs` and `FearAgentHUD.cs` are still compiled by nothing (they need
  NavMesh, Physics, GUI and Texture2D), so their `Awake`/`Update`/`OnDestroy`
  remain unexecuted. The new coverage is `FearAIClient`'s, not the package's.

A declaration is also not an installation: `python` needed a pinned wheel because
the runner image ships python without it, while `dotnet` needs nothing because the
image ships the SDK. That reliance is stated rather than hidden — if a future
image drops it, the scheduled run fails and names the probe that skipped.
