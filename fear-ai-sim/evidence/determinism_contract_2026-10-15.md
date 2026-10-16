# Determinism Contract — 2026-10-15

**Scope:** the shipped JS trees (`packages/core`, `packages/runtime`,
`packages/protocol`) — every source of nondeterminism reachable from simulation
code, and the seed chain that makes a world reproducible from `seed` alone.

**What this record does not claim.** No cross-machine or cross-Node-version
bit-equality claim: the contract is same-input/same-output within one build, and
the probe runs on the machine that runs it. `DeterministicRng` is a statistical
generator (Mulberry32) and is not claimed as cryptographic. Security randomness
(token factories, challenge nonces, salts, IVs, keypairs) is `node:crypto` and
intentionally **not** deterministic — determinism of the sim must never come
from weakening a secret.

---

## 1. The sweep: where nondeterminism could enter, and where it doesn't

Source-level sweep of `packages/`:

- **`Math.random`: zero live uses in the entire tree.** Three mentions remain,
  all comments documenting the CCIII red-team fix (AffectiveAgent, FearCore,
  FunctionalPersonaSignatures). Every consumer of sim randomness uses
  `DeterministicRng` (16 core files import it).
- **Clocks**, classified occurrence by occurrence: injectable `now` options
  (`ClaimArbitration`, `RequestSigning`), measurement/reporting only (harness
  timings, dashboard, benchmark timestamps, store `saved_at`, streaming
  `receivedTime`, handshake ack labels). No clock read feeds simulation state.
- **`node:crypto` randomness** appears only in security surfaces
  (`ClaimArbitration` tokens, `RequestSigning` challenges, `EncryptedStore`
  keys/salts/IVs, `RequestSigner` keypairs) — correct by design.
- **Environment reads** (`process.env`, `os.*`, `process.platform`) appear only
  in `EncryptedStore`'s keyring-path resolution — I/O configuration, not
  simulation input.

## 2. The contract, pinned

The CCIII fix comments stated the design; nothing executable pinned it. A future
edit could have reintroduced a clock read or unseeded draw into a
simulation-definition file with every gate staying green. The new probe pins:

- **Section A** — `AffectiveAgent.js`, `FearCore.js`, `DeterministicRng.js` and
  `RuntimeSimulation.js` contain no live `Date.now` / `performance.now` /
  `new Date(` and no live `Math.random`; a synthetic control (two live and three
  comment lines) proves the classifier can tell the difference, so a passing
  verdict cannot be vacuous.
- **Section B** — `DeterministicRng`: same seed, same 100-draw sequence;
  different seed, different sequence; numeric seeds `0`/`NaN` and the empty
  string normalise to the documented `1337` fallback; string seeds hash stably;
  `next()` aliases `random()` one-for-one; `range`/`intRange`/`choice` are
  deterministic, in-window, and refuse an empty array without drawing.
- **Section C** — the seed chain: `fallbackSeed === 'id#simSeed#n'` in
  registration order; the counter is **scoped to the simulation instance** (a
  sibling instance interleaved between registrations consumes nothing from it);
  an owner-supplied seed wins over the derived default; two same-seed worlds
  fed identical observations persist **byte-identical snapshots after ten
  ticks**; and a different seed produces a different world, so that equality is
  not vacuous.
- **Section D** — `RequestSigning` honours injected `now` and `randomBytes`
  (challenge bytes, `issued_at`, and the challenge TTL sweep all read the
  injection; two instances with identical injection produce identical
  challenges), and without injection the default still produces a fresh
  challenge per call.

## 3. A near-miss in this probe's own first draft, recorded

Section D's first version injected a constant byte (`0xab`), which made the
pre- and post-expiry challenges **byte-identical** — so "the expired challenge
was swept" and "the same key was re-installed" were indistinguishable through
the challenge map, and the assertion failed against correct code. The fix was
the probe's, not the product's: the injector now emits a distinct value per
call, and the sweep assertion is meaningful again. Recorded because a probe that
cannot tell two states apart is the same defect class as the false positives
recorded in the wire-numeric tranche.

## 4. Verification

```
node tools/verification/verify_determinism_contract.mjs
  -> 55 assertions, 0 failed
  -> stable across 3 consecutive runs
```

Regression: the full suite — **47 probes, 46 passed, 1 declared skip (no Unity
Editor), 0 failed**; repeat-3 stability **OK — nothing gated**.

## 5. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 47 probes: 46 passed, 1 declared skip, 0 failed

node tools/verification/run_probe_suite.mjs --repeat 3 --json <artifact>
node tools/verification/stability_regression.mjs --fresh <artifact>
  -> OK — nothing gated

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe is committed (gate-inputs-are-committed)
```

Probe counts moved 46 → 47 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run.

## 6. Boundaries

| Surface | Outcome |
|---|---|
| Sim randomness (`packages/core`) | zero live `Math.random`; `DeterministicRng` everywhere; pinned by Section A |
| Sim-definition files (4 files) | no live clock reads; pinned by Section A |
| Seed chain (sim → agent) | `id#simSeed#n`, instance-scoped counter, owner seed wins; pinned by Section C |
| Same-seed reproducibility | byte-identical snapshots after 10 ticks; pinned by Section C |
| Injectable clocks (`RequestSigning`) | honoured, including TTL sweep; pinned by Section D |
| Security randomness (`node:crypto`) | intentionally nondeterministic — out of contract by design |
| Cross-machine / cross-Node equality | not claimed — one build, one machine |
