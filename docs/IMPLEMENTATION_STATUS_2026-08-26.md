# Fear AI / BadAI Implementation Status

**Date:** 2026-08-26  
**Status:** Active engineering baseline  
**Evidence rule:** Current source, tests, and build output outrank historical claims.

> **Superseded snapshot (historical).** Counts and scope below describe 2026-08-26 only (66 tests / 18 suites) and are no longer the current state. For current state see [`../README.md`](../README.md) (orientation), `CAMPAIGN_STATE.md` (next responsibility + evidence), `FEAR_AI_GLOBAL_WORK_LEDGER.md` (counters), and `../completion-ledger.md` (per-area status, machine-checked by `tests/completion-ledger-integrity.test.js`). Current gate: **166 suites / 574 tests** — this pointer is machine-checked against the other three docs by `tests/doc-integrity.test.js` (it drifted to 142/405 unguarded before the 2026-09-22 audit; the historical counts in this snapshot itself remain 2026-08-26-only).

## Verified baseline

- Repository: nested application at `fear-ai-sim/`.
- Full automated suite: **66 tests passing across 18 suites** (`npm test`).
- This checkout does not contain the historical Vite/FearCore/Brain modules or 540-test suite; those claims are stale and are not accepted as current evidence.
- Shared DecisionCore: `decisioncore.js` separates action enumeration, hard prerequisites, considerations, utility scoring, narrow-band selection, and explainable traces.
- SocialCore: `socialcore.js` provides Personality, Morale, BeliefEvidence, AgentBelief, and ReputationBook primitives.
- MacroCore: `macrocore.js` provides perceived-risk route cost, raid utility, and faction escalation output.
- World tick contract (RESP-WORLD-TICK-001): `societycore.js` now runs canonical deterministic `tick()`/`step()` turns — a world clock (`SocietyCore.time`) drives event ticks, a monotonic allocator issues unique event ids with ordered parentage, `Market.trade` rejects oversell and records flows truthfully, all randomness flows through an injectable serializable RNG (`mulberry32`), and `serialize()`/`deserialize()` provide a save/load round-trip. Pinned by `tests/world-tick.test.js`.
- Test gate: `fear-ai-sim/package.json` (ESM, Jest) makes the declared test suite runnable: `npm test` -> 45 tests / 9 suites passing.
- Determinism ownership (RESP-RNG-OWNERSHIP-001): `randomcore.js` is the canonical RNG owner; `Personality` and `DecisionCore` draw randomness from injectable, serializable sources with seeded deterministic defaults; `BeliefEvidence`/`AgentBelief` timestamps are injectable via `now`. Pinned by `tests/determinism.test.js`; Math.random-restored semantic mutant killed and re-verified.
- Rumor ID authority (RESP-EVENT-ID-AUTHORITY-001): `RumorNetwork` ids come from a monotonic counter with duplicate rejection, and `rumorSeq` survives `SocietyCore` save/load so restored worlds never collide or regress to array-length template ids. Pinned by `tests/rumor-identity.test.js`; array-length-id mutant killed and re-verified.
- Market conservation (RESP-MARKET-CONSERVATION-001): `Market` now records every stock flow (production, destruction, filled demand, unmet demand, discard, settled trades); `balanceSheet()` reconciles exactly (`stock === initial + production - destroyed - consumption - tradeOut`); negative demand can no longer create material and stock can never go negative. Pinned by `tests/market-conservation.test.js`; semantic negative control (restored mutant) confirmed the tests discriminate.
- Campaign state: `docs/CAMPAIGN_STATE.md` is the authoritative manager view (repo identity, accepted-state vs claims, RESP registry, open findings, next contract).

## Important status boundaries

The FearCore thresholds currently in `fearcore.js` are the project’s documented normalized contract. The repository does not yet contain a clearly identified authoritative Rust implementation proving the historical threshold mapping. Therefore Rust parity remains `PARTIALLY_VERIFIED`, not complete.

The new DecisionCore, SocialCore, and MacroCore modules are implemented and unit-tested foundations. They are not yet a complete end-to-end trade/faction/vampire simulation loop.

Existing legacy brain morale and trait fields remain for compatibility. The new first-class classes are available for migration; wholesale migration should be done with integration tests rather than silently replacing legacy state.

## Remaining build work

1. Identify or obtain authoritative Rust FearBand source and lock parity vectors.
2. Wire DecisionCore into a live Brain/agent decision path while preserving GOAP planning and behavior-tree execution boundaries.
3. Migrate Brain traits to Personality without duplicating state.
4. Migrate legacy morale updates to Morale with compatibility adapters.
5. Add belief propagation, rumor mutation, and public/private reputation flows.
6. Add registered character interaction affordances such as Feed, Recruit, Transform, Protect, and Flee.
7. Add faction action catalogs, intelligence estimates, escalation/de-escalation, and raid execution.
8. Add route graph, merchant policy, convoy/escort behavior, market prices, shortages, and bandit relocation.
9. Add justice/crime/legitimacy loops and the player-damage-to-invasion integration scenario.
10. Audit each previously orphaned module and record keep/wire/archive decisions.
11. Add validator-gated advisory interfaces; no advisory process may mutate world state directly.
12. Refresh implementation evidence and worklog entries after each meaningful phase.

## Architecture target

```text
Ground truth
→ perception
→ belief/confidence
→ appraisal/emotion
→ affordances
→ hard prerequisites
→ utility/DecisionCore
→ intent
→ GOAP/HTN planning
→ behavior execution
→ world consequences
→ memory/reputation/rumors
→ updated beliefs
```

Ground truth, agent belief, faction intelligence, public rumor, and institutional records must remain distinct.
