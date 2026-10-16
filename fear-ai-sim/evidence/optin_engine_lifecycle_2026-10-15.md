# Opt-In Engine Lifecycle — 2026-10-15

**Scope:** the JS sim + middleware tree. The four per-agent opt-in services —
information propagation, epistemic belief, moral dissonance, pack coordination —
across the runtime lifecycle events `reset()` (soft and hard) and
`loadSnapshot()`, plus the epistemic contradiction log and the moral-profile
registration path.

**What this record does not claim.** No snapshot-format change: per-agent opt-in
inputs are construction-level state and are deliberately not serialized, so the
recorded format is unchanged. The host-keyed macro systems (economic feedback,
settlement migration) are excluded by construction — they hold no agent
references — and nothing here speaks for them. No engine, host or performance
claim.

---

## 1. The defect class: state that outlives its world

`reset()` and `loadSnapshot()` rebuilt the core world containers (`coreTrauma`,
`social`, `personaSignatures`, `factionGovernance`) from construction options,
but the four opt-in services were constructed once in the constructor and never
rebuilt. After a reset they still described the discarded world: rumors, listen
edges and inboxes keyed by agents the reset had deleted; belief records for
those agents; moral state and transgression history; packs whose members no
longer existed.

`loadSnapshot()` — the path a restarted middleware uses — rebuilt the
population without initializing any opt-in service for it: a restored agent had
no epistemic engine (so `recordEpistemicObservation()` refused with
`UNKNOWN_AGENT` even though the agent was registered) and no moral profile.

This is the same defect class the numeric-boundary audit hunted — state
describing a world that no longer exists — one layer up.

---

## 2. The fix: rebuild, don't carry

Every lifecycle event now **rebuilds** the opt-in engines from construction
shapes:

- information propagation gets the constructor's config and a seed derived from
  the simulation seed (`seed ^ 0x9e3779b9`);
- moral dissonance likewise (`seed ^ 0x6a09e667`);
- pack coordination is rebuilt on a hard reset (`seed ^ 0x85ebca6b`) — a soft
  reset **keeps** packs, matching the documented intent that packs are a social
  structure of the living population, not world state;
- the epistemic oracle and its per-agent engines are always rebuilt empty.

A per-agent construction registry (`_agentOptInConfig`) records the inputs each
living agent's services were built from — `{epistemicConfig, moralProfile}` —
written on fresh registration, kept current through the public moral endpoint,
deleted on unregister, cleared by a hard reset. A soft reset re-registers
survivors with the propagation engine and rebuilds each survivor's epistemic
engine and moral profile **empty but in the recorded shape**, falling back to
the construction-level configuration.

`loadSnapshot()` initializes propagation, epistemic and moral services for
every restored agent with construction defaults and records exactly that shape,
so a later soft reset rebuilds in the same shape.

Determinism: the rebuild introduces no randomness — `EpistemicBeliefEngine`
construction was audited line by line and contains none, and its belief maps
self-prune below `minBeliefConfidence` in `tick()`. The default-path byte-parity
controls in Section D pin that the shipped off-by-default configuration is
unchanged by all of this.

---

## 3. A second defect: the unbounded contradiction log

`EpistemicBeliefEngine.contradictionLog` appended a record when a rumor was
verified by observation (`RUMOR_VERIFIED_BY_OBSERVATION`) and when a belief was
disconfirmed by clear sight (`BELIEF_DISCONFIRMED_BY_CLEAR_SIGHT`), and was
never trimmed — the one unbounded structure in an engine whose other maps are
all bounded. A long-lived oracle accumulated the log for the life of the
process.

Fix: `maxContradictionLogEntries: 250` in the engine defaults, and a single
`_recordContradiction()` helper that appends and trims **oldest-first**. The
newest entries are always kept, the cap is asserted on **both** record paths,
and the exact cap semantics (which entries survive) are pinned rather than the
length alone.

---

## 4. A third defect the probe found: two meanings for one string

`MoralDissonanceEngine.registerAgentMoralProfile` read each foundation weight
off whatever it was handed. A **string** profile name
(`'COLD_UTILITARIAN'`) therefore produced a uniform `0.2/0.2/0.2/0.2/0.2`
profile — none of the five documented profiles, silently — because
`profile[CARE] ?? 0.2` and its siblings all fell back. Meanwhile the runtime's
public endpoint resolved profile names through `DEFAULT_MORAL_PROFILES`, and
`registerAgent()` passed raw strings — so the two entry points **disagreed about
the same input**: a named profile meant one thing through the runtime API and
another through `registerAgent()`.

Fix: the engine resolves string names (trimmed, uppercased) against
`DEFAULT_MORAL_PROFILES` or throws `MORAL_PROFILE_UNKNOWN`; a non-object throws
`MORAL_PROFILE_INVALID`; the per-key `?? 0.2` fallback remains only for partial
custom **objects**, where it is the documented merge semantic.
`registerAgent()` now routes through the public resolver, so both entry points
agree bit-for-bit.

Checked before changing: no existing probe pinned the silent-string behaviour —
the three moral probes use profile objects or aliases through the resolver.

---

## 5. Verification

```
node tools/verification/verify_optin_engine_lifecycle.mjs
  -> 85 assertions, 0 failed
  -> stable across 3 consecutive runs
```

- **Section A** — a hard reset leaves every opt-in service empty and
  ghost-free, the registry cleared, and re-registration works after a reset.
- **Section B** — a soft reset rebuilds each survivor's services empty but in
  shape: a scholar registered with a custom epistemic config and the
  `COLD_UTILITARIAN` profile keeps both, guilt clears, unrelated worlds stay
  clean.
- **Section C** — the load round trip: restored agents get live, empty
  services; the registry records the construction shapes; a soft reset after a
  load rebuilds in the recorded shape; the pre-save world does not leak. (The
  probe's first expectation here — an empty registry — was contradicted by the
  load path's own registration, which by design records what it built; the
  assertion was corrected to the true semantics rather than the write being
  suppressed.)
- **Section D** — the default path is a control: with the opt-ins disabled,
  `reset()` output equals a fresh construction byte for byte, and the opt-in
  fields are `null`/empty exactly as before.
- **Section E** — the contradiction log stays at the 250 cap on both record
  paths, keeping the newest entry and dropping the oldest.
- **Section F** — named profiles agree on every entry point: engine-direct and
  runtime-resolver produce identical scores, and the silent fallback's uniform
  score is distinguished from the named profile's real score.

Regression: the full suite — **45 probes, 44 passed, 1 declared skip (no Unity
Editor), 0 failed**; repeat-3 stability clean; every neighbor probe from the
opt-in family (belief, propagation, packs, settlement, moral, server moral,
runtime wiring, persistence round-trip) still passes.

## 6. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 45 probes: 44 passed, 1 declared skip, 0 failed

node tools/verification/run_probe_suite.mjs --repeat 3 --json <artifact>
node tools/verification/stability_regression.mjs --fresh <artifact>
  -> OK — nothing gated

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe is committed (gate-inputs-are-committed)
```

Probe counts moved 44 → 45 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run.

## 7. Boundaries

| System | Outcome |
|---|---|
| Information propagation | rebuilt on every lifecycle event; survivors restored from the registry |
| Epistemic belief (oracle + per-agent) | rebuilt empty; contradiction log bounded at 250 |
| Moral dissonance | rebuilt empty; named profiles resolve identically at every entry point |
| Pack coordination | rebuilt on hard reset; soft reset keeps packs by documented intent |
| Economic feedback / settlement migration | excluded — host-keyed macro state with no agent references |
| Snapshot format | unchanged — per-agent opt-in inputs are construction state, not persisted |
