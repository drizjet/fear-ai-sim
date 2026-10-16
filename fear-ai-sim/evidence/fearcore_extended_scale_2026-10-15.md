# FearCore Extended-Band Scale + Pareto Reset — 2026-10-15

**Scope:** `packages/core/src/FearCore.js` — the extended-band literals
(`PRESENCE_BREAK`, `RECOVER`, `HIDE`, `FREEZE` entry) in the config, their
comparison sites in `update()` and `_evaluateExtendedBands()`, and the
`DecisionTrace` thresholds they emit; plus `packages/core/src/BehavioralParetoFrontier.js`
`_resetAgent`.

**What this record does not claim.** No claim about the root sim twin
`fearcore.js` (see §7 — recorded, deliberately not patched). No claim about
scenario-level emergent behaviour: the probe pins the state machine on the
authored units, not that any particular scenario now plays out differently.
No claim that the FREEZE 4× entry correction matches every historical tuning
pass — it restores the authored rate, which `docs/PROVENANCE.md:619` documents
as "5% roll at every PANIC tick". Rootedness to the pre-migration inline
machine is limited to commit `bf6e5d0:fear-ai-sim/brain.js` and the two named
documents; the pre-migration tuning history itself is not re-derived here.

---

## 1. The finding

Manual line-by-line audit of the extended bands. The pre-migration inline
machine compared a **normalized** fear (`currentFear`, 0..1 — `bf6e5d0`
`brain.js`, `f > 85` HIDE escape, `f < 20` RECOVER completion,
`currentFear < 0.5` PRESENCE exit, `> 0.95` extreme, FREEZE `rand < 0.05`).
The port kept the core thresholds on the raw `0.0–4.6+` scale by re-expressing
them through `_fearScale` — but the **extended-band literals were copied at
their normalized values and then compared against raw `fear`**. Every one of
those comparisons was therefore in mixed units:

- `PRESENCE_BREAK.enterFear: 0.95` compared against raw fear fires at
  `0.95 / 4.2 = 0.226` normalized — the *extreme* gate locked the state machine
  at ordinary, non-extreme fear.
- `HIDE.exitPanicFear: 0.85` compared raw is `0.2024` normalized — a hide
  could not hold; it escaped on the first calm-ish tick.
- `PRESENCE_BREAK.exitFear: 0.5` compared raw is `0.119` normalized — the
  break exited far below the authored boundary.
- `RECOVER.exitFear: 0.2` compared raw is `0.048` normalized — recovery
  completion was effectively unreachable inside any live scenario.
- `FREEZE` entry rolled `rng() < exitProbability * 10` = `0.2` — four times
  the authored `0.05`, a silent multiplier disguised as a scale correction.

Separately, `BehavioralParetoFrontier._resetAgent` "reset" a defeated agent by
writing `agent.fearCore.currentBand = 'CALM'` and
`agent.fearCore.panicLockCounter = 0` — both **phantom properties** the
FearCore class never reads; the real `currentBand` stayed `RECOVER`/`Broken`
with its panic lock and decision trace intact when a clone replaced the
defeated member.

Doc evidence that these literals are normalized: `docs/PROVENANCE.md` §332 and
lines 1119/1125 (core thresholds adapted via `_fearScale`, extended literals
never re-scaled); `docs/BADAI_MASTER_SPEC.md:57` ("5% roll").

## 2. The fix

- `FearCore` config: `HIDE.exitPanicFear` 0.85 → **0.95**, with the
  re-derivation in the comment (the authored 0.85 sat +0.05 above the 0.8-era
  panic onset; with onset `panicOnsetRawFear()` = `3.8 / 4.2 = 0.9048`, the
  escape is lifted to the adjacent extreme literal so the hold window
  `(0.9048, 0.95]` is non-empty). `FREEZE.enterProbability: 0.05` added as its
  own key (authored rate restored); `exitProbability: 0.02` unchanged.
- `FEAR_SCALE` doc block now states that all extended-band literals are
  authored **normalized** and compared as `rawFear / FEAR_SCALE`.
- `update()`: a single `const normalizedFear = fear / FEAR_SCALE;` now feeds
  the Phase-0 `PRESENCE_BREAK` gate and the Phase-3 `RECOVER` completion;
  core thresholds stay on the raw scale exactly as before.
- `_evaluateExtendedBands()`: its own `normalizedFear` local; four swaps —
  PRESENCE enter duplicate, PRESENCE exit, HIDE escape, and the FREEZE entry
  roll (`< ext.FREEZE.enterProbability`). The PRESENCE_BREAK duplicate compare
  had to be swapped too: left raw it would have become the one live source of
  the old mixed-unit behaviour once the first compare was fixed.
- `DecisionTrace` thresholds keep their normalized literals (0.95 / 0.5 / 0.2 /
  0.94 for custom configs) — now truthful to what was actually compared.
- `BehavioralParetoFrontier._resetAgent`: the two phantom writes are replaced
  by `agent.fearCore.reset('CALM')` — the real reset, the minimal fix the
  phantom lines were evidently trying to be (habituation `records.clear()` and
  everything outside `fearCore` untouched; `agent.reset()` is not called).

## 3. The probe, pinned

`tools/verification/verify_fearcore_extended_scale.mjs` — 57 assertions, seven
sections, no network, no server:

- **Section A** — the extreme gate: after a 200-tick PANIC warmup
  (`lockedTicks === 9`), raw `3.9` (`0.9286` normalized) causes
  **NO_TRANSITION**, raw `4.0` (`0.9524`) causes `EXTREME_FEAR_LOCK`, and the
  trace threshold is `0.95`.
- **Section B** — the break exit: raw `2.2` holds, raw `2.0` (`0.4762`)
  fires `EXIT_PRESENCE_BREAK` into `RECOVER`, trace threshold `0.5`.
- **Section C** — recovery completion: seven updates at raw `0.9` accumulate
  to ≈ `0.7` (the fear gate blocks full progress above the raw exit literal),
  the eighth at `0.9` books partial `RECOVER_PROGRESS` ≈ `0.8`, and the ninth
  at raw `0.8` (`0.1905 < 0.2`) completes into `CALM`, trace threshold `0.2`;
  a second instance pins that `RECOVER_PANIC_OVERRIDE` still preempts.
- **Section D** — the hide window: entry via `reset('PANIC')` with cleared
  lock, skill `0.7`, one threat and rng `0.1`; hold at raw `3.9`; escape at
  raw `4.0` with trace threshold `0.95`; the invariant
  `panicOnsetRawFear() < exitPanicFear` is asserted directly; threats `0`
  still exits as `EXIT_HIDE_NO_THREATS`.
- **Section E** — the FREEZE roll: rng `0.049` enters, `0.05` does **not**
  (strict `<`), `0.06` does not; exit at `0.01`, hold at `0.03`; config pins
  `0.05` / `0.02`.
- **Section F** — custom configs: `enterFear: 0.94` behaves normalized (raw
  `3.94` holds, `3.95` fires with threshold `0.94`), merged configs keep
  defaults, neighbouring literals pinned.
- **Section G** — the Pareto reset: a dirtied defeated agent (PANIC,
  `tickCount 2`, `stateTimer 2`, `panicLockedUntil 11`, 2 trace entries)
  comes back as CALM with zero/null counters, an empty trace, no
  `currentBand`/`panicLockCounter` phantom properties, and a consistent
  `getState()` snapshot.

## 4. Verification

```
node tools/verification/verify_fearcore_extended_scale.mjs
  -> 57 assertions, 0 failed
  -> stable across 3 consecutive runs

node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 50 probes: 49 passed, 1 declared skip, 0 failed

node tools/verification/run_probe_suite.mjs --repeat 3 --json <artifact>
node tools/verification/stability_regression.mjs --fresh <artifact>
  -> OK — nothing gated

npm run guardian:check            -> CLEAN
npm run verify:release-claims     -> SUCCESS
codegen:{maturity-map,release-dossier,godot-fallback,rust-fear-oracle}:check
  -> all current (the Godot fallback artifact did not move)
node tools/verification/verify_examples_inventory.mjs -> 23 assertions, SUCCESS
npm run verify:hard-rule-9
  -> 28/28 once the new probe and edits are committed (pre-commit the only red
     is gate-inputs-are-committed, by design)
```

The integrity gate earned its keep mid-tranche: a first transcription of the
certification count line inserted two em-dashes inside the enumeration window
`documented-counts-match-the-derived-counts` reads, and the check failed
loudly ("not followed by a bounded list of counts") rather than passing on a
number that had drifted — repaired before commit.

## 5. Results

Probe counts moved 49 → 50 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run
(`2026-10-16T14:45:50.275Z — 50 probes, 49 passed, 1 passed with declared
skips, 0 failed, on Node v24.20.0 / win32`).

## 6. Boundaries

| Surface | Outcome |
|---|---|
| Extreme gate (`PRESENCE_BREAK.enterFear`) | fires only at ≥ `0.95` normalized; pinned by Section A |
| Break exit (`PRESENCE_BREAK.exitFear`) | exits below `0.5` normalized; pinned by Section B |
| Recovery completion (`RECOVER.exitFear`) | completes below `0.2` normalized; pinned by Section C |
| Hide escape (`HIDE.exitPanicFear`) | 0.85 → 0.95; hold window `(0.9048, 0.95]`; pinned by Section D |
| FREEZE entry | `exitProbability * 10` → `enterProbability: 0.05`; pinned by Section E |
| Custom configs | same normalized semantics; pinned by Section F |
| Pareto `_resetAgent` | real `fearCore.reset('CALM')`; pinned by Section G |
| Core-band thresholds | untouched — raw-scale comparisons unchanged |
| Root sim twin `fearcore.js` | **not patched** — §7 |
| Scenario tuning | not re-derived; this restores authored units only |

## 7. Open surface — the frozen root twin

The root `fearcore.js` (the sim's copy, named beside the package by DEC-0002)
is a **frozen pre-fix twin**, last synchronised at `47240c3`. Its enumerated
divergences from `packages/core/src/FearCore.js`:

1. Extended-band literals compared on the raw scale (the defect this tranche
   just fixed in the package — still live there).
2. FREEZE entry roll is an inline `Math.random()` with no injectable rng —
   non-deterministic on the sim path.
3. Phase-3 `RECOVER` completion unreachable: its Phase-2.5 gate has no
   `RECOVER` exemption (the package's §NOW-17 fix).
4. `FORCE_*` branches unreachable; `tick` field where the package uses
   `tickCount`; its own docblock documents `rawFear` as 0..1 while its only
   caller (`brain.js`) feeds it `×3.8`.

It is deliberately **not patched here**: the literals are fixed in the
package, the sim path has no probe, and a literal-by-literal patch would leave
the other defects behind while implying coverage that does not exist.
`docs/DECISIONS.md` DEC-0002 carries the dated amendment note; "both paths,
one owner" now holds in name but not in verified behaviour, and ownership
reconciliation is the project owner's call.

Cosmetic queue (deliberately untouched, dead or redundant by construction):
the evaluator's PRESENCE_BREAK duplicate compare (kept dead-consistent by the
normalized swap); `FearCore` CRAWLING entry's redundant `!== 'CRAWLING'`
clause and exit's provably-false `|| === 'HIDE'` clause.

**Evidence refs:** `bf6e5d0:fear-ai-sim/brain.js` (pre-migration inline
machine, normalized); `docs/PROVENANCE.md` §332, 619, 1119, 1125;
`docs/BADAI_MASTER_SPEC.md:57`; `docs/DECISIONS.md` DEC-0002 amendment;
`docs/CANONICAL_PROTOCOL_V1.md` band table; commit `47240c3` (twin freeze).
