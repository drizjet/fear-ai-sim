# One Panic Class, and Run-Or-Do-Not-Claim — 2026-09-21

**Scope:** two changes to the JavaScript tree and its verification harness. The
panic class stopped being three disagreeing literals and became one band-derived
predicate; and every file under `examples/` is now either executed by a gate or
declared unrun with a reason, with a shared helper that makes "can this
demonstration go red?" one implementation rather than one per probe.

**What this record does not claim.** Neither change is an Editor, engine or host
result. The six examples that need a Godot binary, a Unity Editor, a UE5 host or
an external game client are **still not run**, and this change reports that
rather than closing it.

---

## 1. The panic class had three definitions, and none matched the band

`"Is this agent panicking?"` was answered by literals in three places:

| Site | Rule |
|---|---|
| `RuntimeSimulation` peer snapshot | `fearCore.state === 'PANIC' \|\| currentFear > 0.8` |
| `RuntimeSimulation` trauma recorder | `fearCore.state === 'PANIC' \|\| currentFear > 0.8` |
| `GroupContagionSystem` | `isPanicking \|\| fearBand === 'PANIC' \|\| fear >= 0.70` |

The band the first clause names turns PANIC at `enter.PANIC / FEAR_SCALE` =
`3.8 / 4.2` = **0.9048**. So:

- the **0.8** override declared a source panicking across a tenth of the fear
  range *before its own band agreed* — a source still labelled `ANXIOUS`
  transmitted at panic strength, which is the contradiction the contagion probe
  had documented as a curiosity rather than fixed;
- **0.70** agreed with neither.

The fix is not to pick one of the three numbers but to have one:

- `FearCore.FEAR_SCALE` is exported, so the normalized↔core representation has a
  single source;
- `FearCore.panicOnsetRawFear(config)` **derives** the onset from `enter.PANIC`,
  so a custom config moves both together and they cannot disagree by a
  hand-written margin;
- `FearCore.isPanicClass({ fearBand, rawFear })` is band-first with that derived
  threshold. It keeps the extended bands honest: `FREEZE`, `HIDE` and
  `PRESENCE_BREAK` are reached *from* PANIC and do not contain the word, so they
  are caught by the onset rather than by their name;
- `AffectiveAgent` exposes it as `panicClass`, evaluated against **that agent's**
  thresholds, and all three former sites now ask for it.

A tripwire guards the **defect shape**, not any raw-fear comparison: honest
thresholds live nearby (fear below 0.2 resolves an active trauma; a panicking
leader above 0.75 is treated as broken), so what is forbidden is specifically the
OR of a band test with a typed-in literal, in either file.

### The blast radius, and why it matters that it was loud

The change broke the Godot fallback's codegen anchor, which grepped
`AffectiveAgent._fearScale` for a literal (`/normalizedFear \* ([0-9.]+)/`). The
anchor was lost the moment that expression named the constant instead, and
`verify_godot_fallback_parity.mjs` **failed with `CODEGEN ANCHOR LOST`** rather
than emitting a stale fallback — the generator doing exactly what its header
promises. The generator now imports the exported constant and additionally emits
`PANIC_ONSET_RAW_FEAR`, so the GDScript fallback cannot pick its own onset.

The narrative demo's 18 claims still held unchanged, so the unification did not
disturb the canonical scenario.

### The probe had to be rewritten twice

Worth recording, because both drafts were wrong in instructive ways:

1. The first mirrored the old rule inline (`band === 'PANIC' || rawFear > 0.8`)
   and therefore could not have noticed the rule changing. It now calls
   `isPanicClass`, so it tests the shipped function.
2. The second demanded `spread > 0.05` within each tier to prove a plateau was
   non-trivial. With the onset at 0.9048 the source saturates at 1.0 within a few
   ticks, so the panic cell had zero spread and the assertion failed for the
   uninteresting reason that the source stopped moving. Non-triviality is now
   proven on a **controlled** range against `ContagionGraph` (0.92…1.0 holds a
   flat `0.262800`; the anxious tier a flat `0.116800`; only below ANXIOUS does
   the impact vary).

---

## 2. Nothing may claim success unless something runs it

`verify_contagion_transmission.mjs` had gated the CLI demo. A derived roster
showed the rest of `examples/` was referenced only by historical evidence JSON:

- `examples/python/neutral_horror_demo.py` printed
  `VERDICT: ... executed successfully with exact canonical parity.`
- `examples/reference-game/simulation_runner.js` hardcoded `status: 'SUCCESS'`

Both are in the same class as the CLI demo, and `examples/` is where a newcomer
goes first.

`verify_examples_inventory.mjs` enforces one rule: **a file that states an outcome
must be executed by a gate, or it must not state one.** The roster is derived
from disk (14 files), the classification is asserted to cover it **exactly** — a
new example cannot be added silently, a deleted one cannot leave a stale entry,
an executable one cannot be reclassified as documentation — every `UNRUN` entry
must carry a reason, and every `GATED` entry must actually be referenced by the
probe it names.

### Both runnable examples were fixed, and one of them had real defects

- `simulation_runner.js` now derives `status` from real checks — every living NPC
  produced an advisory on every turn, 50 turns executed, finite latencies — and
  exits non-zero on failure. **It passes**, so the game worked and only the
  verdict was unearned.
- `neutral_horror_demo.py` was rewritten as a self-asserting narrative using the
  **measured** windows (15 ticks of contact to reach the panic class, ~22 more for
  the cascade, then recovery), reading its URL from `FEAR_AI_URL`. The probe
  starts a `FearServer` on an ephemeral port and runs it: **15/15 claims held,
  exit 0**.

### The reusable half

`tools/verification/helpers/must_be_able_to_fail.mjs` carries:

- `assertMutationsCatch` — the mutation matrix, including the requirement that a
  mutation **actually change the source** (a no-op mutation silently runs the
  unmutated file and reports whatever that does) and that a **control** mutation
  disable the assertions and go green;
- `unguardedVerdicts` — the static scan for a success verdict in a file with no
  assertion, exit code or exception;
- `runFileAsync` — because `spawnSync` blocks the event loop and therefore
  deadlocks a child that must talk to a server living in this process. That
  deadlock presented as a request timeout, which is a failure mode worth naming
  rather than rediscovering.

`verify_contagion_transmission.mjs` was refactored onto the helper in the same
change, so the pattern is proven by use rather than asserted.

**Stated limits:** `unguardedVerdicts` proves a file has *no* failure mechanism,
not that its mechanism is connected to its verdict. And the probe audits which
examples are executed, not whether the unrun ones are correct.

---

## 3. Standing

`npm run verify:probes` → **28 probes, 27 passed, 1 declared skip, 0 failed**.
`verify_contagion_transmission.mjs` 62 assertions;
`verify_examples_inventory.mjs` 23 assertions; the Python demo 15/15 held against
a live server; the reference-game runner exit 0. Unchanged: the six examples that
need a toolchain this machine does not have.
