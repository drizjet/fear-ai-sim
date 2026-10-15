# The Front Door, the Contagion Gap, the First §3 Promotion, and a Process-Global Seed — 2026-09-21

**Scope:** four changes to the JavaScript tree, plus the viva for each. The
narrative demo is now self-asserting and gated; the runtime's own contagion
transmission path has behavioural coverage for the first time;
`InformationPropagationEngine` became the first module to leave
`RELEASE_SURFACE.md` §2 by the §3 policy; and the agent fallback RNG seed stopped
being a process-global counter. The release surface was then frozen.

**What this record does not claim.** Nothing here is an Editor result, an engine
result, or a host result. The middleware's research modules remain
`EXPERIMENTAL`. The performance and flake numbers are unchanged by any of this
and remain one machine's figures for one workload.

---

## 1. The demo narrated a cascade it could not produce

`examples/cli/neutral-horror-demo.mjs` is the one command a newcomer runs to see
the product. It was referenced by **no probe, no workflow, no CI job and no
document** — a repository-wide search returned nothing — and it ended in
unconditional `console.log` calls whose final line was
`VERDICT: Canonical horror behavioral sequence executed successfully!`. Its only
failure path was an unhandled exception, so it could not fail.

Its printed output contradicted its own phase labels:

| Phase label | Printed state |
|---|---|
| 3 — "Contagion Cascade (**Both in Panic**)" | Chen `CALM Fear=0.00` |
| 4 — "Immediate Aftermath (**Panic Lock Hysteresis**)" | both `CALM Fear=0.00` |
| 5 — "Chen **still hyper-vigilant**" | Chen `CALM Fear=0.00` |

### The middleware was not at fault

Reproducing the same scenario against `RuntimeSimulation` shows the cascade
working: Chen rises `0.000 → 0.563 → 0.805 PANIC` with `contagionFear 0.60` and
two live edges. The demo's window was simply too short for the model's own
thresholds, and the reason is a real, measurable property:

- A source is transmitted **quantized by band and by scream**, not continuously.
  `PANIC`, or any source above raw fear `0.8`, transmits `sourceFear = 0.9`;
  `ANXIOUS` transmits exactly `0.4`; below that the source transmits its actual
  fear. A scream multiplies by `1.8`.
- For the demo's geometry (8 m apart, radius 300, base strength 0.4), the ANXIOUS
  tier is a flat `0.149504` — **just under** the `0.15` threshold at which an
  edge is recorded as telemetry. So a source climbing `0.55 → 0.85` transmitted a
  constant, drew **no edge**, and could never lift its neighbour.
- The source must be genuinely `PANIC` (~35 ticks of held contact) before a
  neighbour climbs at all. The demo allowed 6 within the window it narrated.

Transmission also **lags the source by exactly one tick**, because the runtime
gathers its peer snapshot before any agent advances. Reading a trace by post-tick
band mixes that lag into every conclusion — which is how this probe's own first
draft "discovered" that ANXIOUS transmission was unstable when it was in fact
perfectly flat.

### The demo is now self-asserting

Every narrated claim is a `check()`; phase windows are chosen from measurement;
the banner is gated on `failures.length` with `process.exitCode = 1`. Its first
run **exited 1 and named four broken claims** — all four the probe author's phase
boundaries rather than the model, which is what a demonstration that has never
been checked should do. It now reports `CHECKS: 18/18 held`, and prints

```
[tick 018] Diaz: PANIC  Fear=0.927 Intent=FLEE_FROM        Heartbeat=180 BPM
           Chen: CALM   Fear=0.000 Intent=CAUTIOUS_EXPLORE Heartbeat=60 BPM
[tick 053] Diaz: RECOVER Fear=0.003 Intent=RECOVERING       Heartbeat=60 BPM
           Chen: PANIC  Fear=0.413 Intent=FLEE_FROM         Heartbeat=130 BPM
```

which is the claim, stated where it can be read.

---

## 2. The contagion gap underneath it was real

Eight probes referenced `contagion`, and every one checked **bookkeeping**:
`lastContagion` cardinality per live agent, `activeEdges <= maxEdges`, no stale
source/target ids, unregister clearing both. `verify_compound_collisions.mjs`
exercises `ContagionGraph` directly but constructs it itself and feeds
`contagionFear` in by hand — so it proved the arithmetic and proved nothing about
the runtime's own peer-gathering path.

**Nothing asserted that a panicking agent makes a calm neighbour more afraid.**

`tools/verification/verify_contagion_transmission.mjs` (47 assertions) now does:

- **End to end**: a directly-threatened agent escalates an unthreatened neighbour
  to `PANIC`, with the neighbour's empty threat list asserted on every one of 45
  ticks and its direct sensory term asserted to stay exactly `0` — so the
  escalation cannot be attributed to perception.
- **The quantization**: each `(tier, scream)` cell transmits a flat impact across
  a climbing source, the scream ratio is `1.8`, sub-ANXIOUS transmission tracks
  actual fear instead, and a source **still labelled `ANXIOUS`** transmits at
  panic strength once past the `0.8` override.
- **Both sides of the `0.15` edge threshold**, so the explanation for a demo that
  drew no edge cannot rot into folklore.
- **The negatives**: beyond the radius nothing transmits, and
  `enableContagion:false` transmits nothing even to an adjacent panicking peer.
- **Determinism**: bit-identical across 45 ticks for a fixed seed, and different
  for another seed.
- **The one-tick lag**, asserted rather than assumed.
- **A three-case mutation matrix with a control**: starving the cascade window
  must fail; removing the stimulus must fail and be attributed correctly;
  neutralizing `check()` must turn the same mutation **green**, proving the red
  came from the assertions rather than from an incidental crash.

The demo is gated by this probe, so it cannot go back to being prose.

---

## 3. The first §3 promotion

`InformationPropagationEngine` left `RELEASE_SURFACE.md` §2 and joined §1 as an
opt-in service. §3's fourth condition is the one easiest to satisfy dishonestly —
deleting a name from the negative tripwire is exactly what an accidental
promotion looks like — so `verify_runtime_wiring.mjs` **inverted** instead of
shrinking. It now requires the module to be constructed, to default to `false`,
to be constructed *only* inside its opt-in guard, and to be absent from a default
`RuntimeSimulation` at runtime. The optional list went from eight names to seven.

`verify_information_propagation_optin.mjs` (41 assertions) makes the central
claim the **negative** one: a default run, a run with the flag explicitly
`false`, and a run with it **enabled** are byte-identical across 30 ticks in both
advisory outputs and the persistence snapshot, with an identical RNG stream. The
service cannot perturb the affect path because its own RNG is seeded from the
simulation seed and it draws nothing from `this.rng`.

It is a service rather than an object a caller holds: it advances once per tick,
tracks the roster (registration joins the listening network, retirement drops
edges, beliefs and reported reach, and a retired source stops being heard), and
refuses rather than silently no-oping when the service is off, when an origin is
not a registered agent, or on an unknown topic or rumor id. `removeAgent` was
added to the module for the retirement path, and it strips the departed from every
rumor's recipient set so reported reach does not count the dead.

**Bounded**: the wiring is promoted, the research is not. The module's claims stay
`EXPERIMENTAL`, its state is deliberately not in the persistence snapshot, and no
host or adapter consumes it.

---

## 4. A process-global seed, found by a verifier that could not otherwise proceed

`AffectiveAgent` derived its fallback RNG seed from
`${id}#${AGENT_FALLBACK_RNG_COUNTER++}`, where the counter is a **module global
that is never reset**. So `fearCore.rng.initialSeed` could be `a#0` or `a#1` or
`a#47` depending on how much unrelated construction had already happened in the
process — and since `initialSeed` and `state` are serialized, the persisted
artefacts differed too. The code's own comment claimed the seed "derives from id
plus construction order, so replay with the same construction sequence is
bit-identical", which is true **within** a process and false **across** processes
or instances.

The opt-in probe compares a default run against an enabled one and requires
identical snapshots; it failed on this, and the honest reading was not to weaken
the comparison but to fix the seed. `RuntimeSimulation.registerAgent` now passes
a seed derived from **this simulation's** seed and this instance's registration
counter: `${id}#${this.seed}#${n}`. A host-supplied seed still wins, and
`loadState` already seeded restores deterministically (`${this.seed}:${id}`), so
restoration was never affected — the change brings registration in line with a
principle the restore path already followed. The module counter is retained as a
last-resort fallback for direct construction, with a comment stating that it is
process-wide.

Verified as a strict improvement: same seed and same agent id now give identical
state across instances and in either order; distinct agents still differ; a
different simulation seed still differs. **No probe required modification for
this change**, and the full suite stayed green.

---

## 5. Standing after the freeze

Recorded at the frozen surface: `npm run verify:probes` → **27 probes, 26 passed,
1 declared skip, 0 failed**; `verify_contagion_transmission.mjs` 47 assertions;
`verify_information_propagation_optin.mjs` 41 assertions;
`verify_runtime_wiring.mjs` green with seven optional modules absent and the
opt-in service asserted present-only-when-asked-for; the narrative demo exit 0 at
`18/18`.

The release surface was frozen on the same date (see §1b of the dossier). The
Unity Editor gap, the Godot rendering gap, Unreal, the Tier 2/3 modules and the
security limits are now recorded as **permanent declared limits of this RC**
rather than open work items.
