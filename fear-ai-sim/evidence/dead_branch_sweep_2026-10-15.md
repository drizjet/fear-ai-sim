# Dead-Branch Sweep — 2026-10-15

**Scope:** the three surfaces the extended-scale record parked in its §7
"cosmetic queue" — `packages/core/src/FearCore.js` `_evaluateExtendedBands()`
(unreachable `FORCE_*` Phase-3 chain, duplicate `PRESENCE_BREAK` entry compare,
CRAWLING guard clauses), `packages/core/src/HostFeedbackLoop.js`
(`fallbackFor`'s unknown-type default), and `packages/runtime/src/RequestSigning.js`
(the challenge record's write-only `sessionId` field) — plus the call-site and
probe updates those removals force (`packages/runtime/src/FearServer.js`,
`tools/verification/verify_determinism_contract.mjs`).

**What this record does not claim.** No behavioural change: every removal is
proven unreachable-equivalent, and the probe pins that the live paths those
dead branches shadowed behave exactly as before. No claim about the root sim
twin `fearcore.js` (frozen; it carries its own copies of the same dead
branches — deliberately not patched, same convention as the extended-scale
tranche §7). No claim about FIFO eviction, `receivedTime`, `hashSessionToken`,
or `verdict.sessionId` — those were re-examined and recorded clean (§5), not
changed. No claim that the host vocabulary is closed: the fallback default
change makes the open-vocabulary answer *one* answer, not an exhaustive one.

---

## 1. The findings

Manual line-by-line audit of `_evaluateExtendedBands()` and its queue notes
(`log.md` 2026-10-15: "challenge records carry a `sessionId` the verifier never
reads; agent-map eviction is FIFO not LRU (advisory semantics, fine);
`fallbackFor`'s unknown-type default is `FLEE_FROM` while the universal safe
intent is `IDLE_VIGILANT`").

**FearCore — three dead spots.** All three were proven unreachable by reading
the dispatch order, not by coverage:

- **`FORCE_*` Phase-3 chain.** The trailing `else if
  (EXTENDED_BANDS.includes(this.state))` branch (FORCE_PANIC / FORCE_FREEZE /
  FORCE_HIDE / FORCE_RECOVER variants) sat behind Phase 2.5, which returns
  *every* extended band except `RECOVER` — and `RECOVER` has its own branch
  earlier in the same chain. No state could reach the `FORCE_*` branch at all.
  Its `FORCE_PANIC` mirror was doubly shadowed: Phase 0 fires the
  PANIC → PRESENCE_BREAK compare first, and the HIDE escape fires below it.
- **`PRESENCE_BREAK` duplicate.** The evaluator re-implemented the Phase-0
  entry compare (`PANIC` + normalized ≥ `0.95` + `stateTimer` ≥ 200 →
  `PRESENCE_BREAK`). Phase 0 runs first and returns, so the evaluator copy
  could never fire.
- **CRAWLING guards.** Entry: `this.state === 'HIDE' && obstaclePresent &&
  this.state !== 'CRAWLING'` — the third clause is redundant under the first.
  Exit: `this.state === 'CRAWLING' && (!obstaclePresent || this.state ===
  'HIDE')` — the second clause is provably false under the first.

**HostFeedbackLoop — two answers to one question.** `fallbackFor()` returned
`'FLEE_FROM'` (a specific action) for any type outside the named map, while
`rankIntents()`' all-rejected branch answers `{ type: 'IDLE_VIGILANT',
safeFallback: true }` (`UNIVERSAL_SAFE_INTENT`). A host asking "what do I do
with a type you can't rank?" got `FLEE_FROM` in one path and `IDLE_VIGILANT`
in another. The seven named mappings were, and remain, intentional per-type
answers — only the unnamed default was doubled.

**RequestSigning — a record field nobody reads.** `_challenges` held
`{ challenge, sessionId, issuedAt }`; `issueChallenge(sessionId = null)`
stringified and stored the caller's session at both call sites (FearServer's
pre-auth WebSocket connect passed `null`; the AUTH_RESPONSE refusal path
passed the session). No reader exists: `verifyChallengeResponse` checks
`record.issuedAt` for TTL and builds the signed message from the
*responder-supplied* `sessionId` and the responder's own `sessionRecord` —
the stored field could never participate in a decision. Its only "reader" was
the determinism probe pinning the field's own existence.

## 2. The fix

- **`FearCore.js`**: `FORCE_*` branch removed; the RECOVER branch comment
  rewritten (NOW-20: renewed lethal threat overrides convalescence; the
  `FORCE_*` chain it once mirrored was unreachable behind Phase 2.5 and was
  removed in this sweep). Duplicate `PRESENCE_BREAK` compare removed with a
  comment naming Phase 0 as the owner. CRAWLING entry/exit guards simplified
  to `state === 'HIDE' && obstaclePresent` / `state === 'CRAWLING' &&
  !obstaclePresent`.
- **`HostFeedbackLoop.js`**: the default is now `UNIVERSAL_SAFE_INTENT`, with
  the rationale in a comment ("the host vocabulary is open by design … the
  same answer rankIntents() gives when nothing is viable").
- **`RequestSigning.js`**: `issueChallenge()` loses its parameter; the record
  is `{ challenge, issuedAt }` (a comment marks the field's removal and why
  it could never have been read). `FearServer.js`: both call sites updated.
- **`verify_determinism_contract.mjs`**: the sessionId pin replaced by a
  trimmed-shape pin (`!('sessionId' in record) && record.issuedAt ===
  fakeNow`); the `'sess_a'` arguments dropped from three call sites.
- **New probe** `tools/verification/verify_dead_code_sweep.mjs` (52
  assertions, sections A–D).

## 3. The probe

- **Section A** — FearCore: PRESENCE_BREAK / VAULTING / FREEZE holds at
  extreme fear (the scenarios `FORCE_*` claimed) and the guarantee that no
  `FORCE_` reason ever surfaces; the HIDE escape above `0.95` with threats
  (and hold below it, and the no-threats → RECOVER exit); the CRAWLING
  entry / hold / exit truth table plus the non-HIDE band that must not crawl;
  a 200-tick PANIC warmup where `EXTREME_FEAR_LOCK` fires exactly once, one
  decision per update (`maxTraceLength: 300`), and PRESENCE_BREAK then holds;
  RECOVER's panic override, its progress path, and the corrupted-band
  SNAP_TO_CALM guard.
- **Section B** — `fallbackFor` truth table: the seven mapped entries
  unchanged; the five unmapped known `ACTION_INTENTS` members, an unknown
  host type, and a non-string all resolve to `IDLE_VIGILANT`; the universal
  answer stays inside the action vocabulary; the all-rejected downgrade's
  `top.type` equals the unknown-type fallback (one answer); mapped and
  unknown unavailable types carry the right fallback through
  `rankIntents`/`getAgentSummary`.
- **Section C** — the challenge record is exactly `{challenge, issuedAt}`,
  carries the injected issue time, never a `sessionId`; an attempted
  verification of an unanswered challenge returns `SIGNATURE_UNKNOWN_KEY`
  (session resolved from the responder's record, never the stored field),
  a replay returns `SIGNATURE_UNKNOWN_CHALLENGE` (single-use retirement), and
  an over-TTL challenge expires — all under injected clock and randomness.
- **Section D** — two same-seed `FearCore` instances crossing every sweep
  scenario produce byte-identical decision traces, and no trace contains
  `FORCE_`.

## 4. Verification

```
node tools/verification/verify_dead_code_sweep.mjs
  -> 52 assertions, 0 failed

node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 51 probes: 50 passed, 1 declared skip, 0 failed
     (verify_dead_code_sweep PASS; verify_determinism_contract PASS with its
      re-pinned shape; verify_host_feedback_bounds PASS — the mapped
      SEEK_COVER fallback assertion is untouched)

node tools/verification/run_probe_suite.mjs --repeat 3 --json <artifact>
node tools/verification/stability_regression.mjs --fresh <artifact>
  -> verdicts: every probe STABLE, 0 verdict regressions; all 51 probes agree
     on every run, debug-sweep included
  -> timing gate: verify_host_provenance flagged 3.3x slower than the
     ledger's comparable nights (2411 ms -> 8071 ms). Machine-speed drift,
     not this tranche: an A/B with the sweep edits stashed ran the same probe
     at [2695, 2599, 2472] ms against [2886, 2528, 2657] ms with them —
     indistinguishable. The gate compares all probes against nights from a
     quieter machine state; every verdict in both arms was PASSED.

npm run guardian:check            -> CLEAN
npm run verify:release-claims     -> SUCCESS
codegen:{maturity-map,release-dossier,godot-fallback,rust-fear-oracle}:check
  -> all current (the dossier roster was regenerated from the recorded run;
     the Godot fallback and Rust oracle artifacts did not move)
node tools/verification/verify_examples_inventory.mjs -> 23 assertions, SUCCESS
npm run verify:hard-rule-9
  -> 28/28 once the new probe and edits are committed (pre-commit the only red
     is gate-inputs-are-committed, by design)
```

The integrity gate earned its keep twice this tranche: it refused the
dossier before the report was regenerated (DRIFT caught at exactly the
moment it existed), and then refused a first transcription of the
certification count line that inserted em-dashes inside the enumeration
window `documented-counts-match-the-derived-counts` reads ("not followed by
a bounded list of counts") — repaired before commit.

## 5. Recorded clean (re-examined, deliberately unchanged)

- **brain.js double update** (`brain.js:390`, then `468`/`487`): the inline
  gate calls `fearCore.update()` and, when the result is not
  `PRESENCE_BREAK` (its always-true branch), the tick falls through to a
  second `update()` in either the `skill > 0.4` (468) or else (487) branch.
  This is the root sim consuming the frozen twin — record-only, same
  no-patch convention as §7 of the extended-scale record.
- **FIFO, not LRU, agent-map eviction** (`ensureAgentRecord`): advisory
  statistics semantics; the oldest key is dropped at `MAX_AGENTS_TRACKED`.
  Working as designed.
- **`receivedTime`**: jitter-buffer arrival stamp, observability only
  (`evidence/advisory_numeric_hygiene_2026-10-15.md:162`;
  `evidence/determinism_contract_2026-10-15.md:28`).
- **`hashSessionToken`**: bounded input (`validator.js:323` slices
  `session_token` to 512 chars), SHA-256 at rest, `timingSafeEqual`
  comparison, no salt needed (`docs/CURRENT_TRUTH_LEDGER.md:230`).
- **`verdict.sessionId`**: used for no authorization decision (recorded in
  the same audit note).

## 6. Results

Probe counts moved 50 → 51 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run. The
extended-scale record's §7 cosmetic queue is now closed: every item it
parked is either fixed here (this file's §1–§2) or recorded clean (§5).

## 7. Boundaries

| Surface | Outcome |
|---|---|
| `FORCE_*` Phase-3 chain | removed; unreachable behind Phase 2.5; live paths pinned by Section A |
| `PRESENCE_BREAK` duplicate | removed; Phase 0 owns the entry; single-fire pinned by Section A |
| CRAWLING guards | redundant / provably-false clauses removed; truth table pinned by Section A |
| `fallbackFor` default | `FLEE_FROM` → `UNIVERSAL_SAFE_INTENT`; mapped entries unchanged; pinned by Section B |
| Challenge record | `{challenge, issuedAt}`; write-only `sessionId` removed; pinned by Section C |
| Determinism probe | sessionId pin → trimmed-shape pin; assertion count preserved |
| Root sim twin `fearcore.js` | **not patched** — carries the same dead branches; ownership reconciliation remains the project owner's call |
| Host vocabulary | open by design; the default is *an* answer, not a closure |
| brain.js double update / FIFO / receivedTime / hashSessionToken / verdict.sessionId | recorded clean, unchanged (§5) |

**Evidence refs:** `evidence/fearcore_extended_scale_2026-10-15.md` §7 (the
queue this closes); `evidence/host_feedback_bounds_2026-10-15.md`;
`evidence/determinism_contract_2026-10-15.md`;
`evidence/advisory_numeric_hygiene_2026-10-15.md`;
`docs/CURRENT_TRUTH_LEDGER.md`; `packages/core/src/IntentResolver.js`
(`ACTION_INTENTS`); freeze ref `47240c3`.
