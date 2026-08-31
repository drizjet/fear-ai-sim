# SUBAGENT REPAIR PLAYBOOK

**Project:** `/c/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim`
**Head at authoring:** `99e439a` (Slice C: justice → faction legitimacy)
**Green:** 141 suites / 1136 tests, `lint:evidence` exit 1 expected (0 admissible — Lane B).
**Lane:** B (supervisor admitted = no). Do not claim otherwise.

This doc exists because two rounds of 5-subagent deep dives (10 total) agreed on a
single failure mode: **decorative wiring** — code that looks connected in a unit test
but is never exercised by the production tick path. Every prompt below is written to
make the *production* `tickClosedWorld` path prove the fix, not just an isolated unit.

---

## How to use this playbook

Each task is a **self-contained subagent prompt**. Copy the block verbatim into a fresh
subagent. The prompt names the **outcome** and the **proof**; it deliberately does *not*
prescribe line numbers or exact edits, because (a) the tree drifts and (b) the agent
that receives it does better work when it finds the real anchors itself. The "anchors"
section after each prompt is for *you* (the orchestrator) to verify the agent landed on
the right code — it is not part of the prompt.

**Hard rules for every subagent (state these at the top of each dispatch):**
1. Run the focused test before and after your change. Paste both outputs.
2. Run the full suite (`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathIgnorePatterns="long-horizon-5000tick"`). It must stay 141/141.
3. Do a **mutation**: break your own fix in the obvious way, show the test goes red, revert. If the test stays green with the fix broken, your test is decorative — fix the test, not the code.
4. Update `AUTONOMOUS_HANDOFF.md` with a `## Verification` block (test counts, mutation result).
5. **Do not commit or push.** Leave changes uncommitted for the orchestrator.
6. **Do not touch the evidence ledger or the evidence linter** unless your task is literally the ledger/linter. Those are Lane B quarantine boundaries.

---

## P0 — Close the market accounting hole (Slice A follow-up)

The single biggest finding: `advancePendingWorldObligations` calls `deliverCargo` and
mutates supply, but the delivery is never booked into `marketFlows.delivered` or
`MARKET_TICK.flows.delivered`. The per-tick mass-balance invariant
`delta = produced − overflow − consumed − spoiled` therefore *violates* by exactly the
delivered amount on any tick where a pending trip arrives. The existing 20-tick
conservation test passes only because it asserts `finalTotal ∈ [0, 200]` — a vacuous
bound, not a reconciliation.

**Subagent prompt:**

> Wire pending-trip cargo delivery into the market mass-balance. Today,
> `advancePendingWorldObligations` in `closed-world.js` calls `market.deliverCargo`
> for an arrived trip, but the `delivery.stored` amount never reaches
> `world.marketFlows.get("town:kind").delivered` nor the `MARKET_TICK` event's flows.
> As a result the per-tick conservation identity
> `supply_after − supply_before = produced − overflow − consumed − spoiled + delivered`
> is false on delivery ticks. Fix it so the delivery amount is added to both the
> cumulative `marketFlows` and the per-tick `MARKET_TICK.flows` for that town+kind, and
> prove with a new test `tests/pending-trip-market-conservation.test.js` that: (1)
> scheduling a trip of N units, advancing to arrival, and ticking produces
> `flows.delivered === N`; (2) the per-tick mass-balance identity holds *with the
> `+ delivered` term* on the arrival tick and without it on non-arrival ticks; (3)
> a BANDIT_ATTACK that reduces the delivered amount shows up as a smaller `delivered`
> and a correspondingly larger `disrupted`. Mutation: delete your wiring, show the
> identity test fails by exactly N, revert.

**Orchestrator anchors (verify, don't hand to agent):**
- `closed-world.js` ~line 278-300: `advancePendingWorldObligations` calls
  `destination.market.deliverCargo(...)` and emits `PENDING_CARGO_DELIVERED` with the
  `delivery` object — but `marketFlows` and `MARKET_TICK` are populated by the separate
  per-town market loop (~1485-1580) which has no link to `scheduledConsequences`.
- `closed-world.js:1492`: `tickFlow = { produced: 0, delivered: 0, ... }` — `delivered`
  is initialized but never assigned anywhere in the file.
- `economy.js:43-58`: `deliverCargo` returns `{ shipped, delivered, stored, lost,
  overflow }` — `stored` is the number to book.

---

## P0 — Make merchant opportunity fire in production (not just the harness)

`opportunityBonus` (Slice A fix) works in `market-material-loop.test.js` because that
test sets `merchant.cargoKind = 'food'`. In the default closed-world scenario the
merchant's `cargo` is a **number** (`20`), and `cargoKind` is `undefined` — so the
`if (merchant.cargoKind && route.to)` guard at `canonical-trade-system.js:176` is
false, `opportunityBonus` stays 0, and price never influences the default sim's route
choice. The Slice A "no decorative price" proof only holds in the harness.

**Subagent prompt:**

> The merchant opportunity bonus added in Slice A only fires when a caller sets
> `merchant.cargoKind`. In the default closed-world scenario the canonical merchant
> carries `cargo` as a bare number with no `cargoKind`, so the destination price
> never reaches the route score in production. Make the default merchant carry a
> `cargoKind` (e.g. `"food"`) in `createClosedWorldScenario`, and add a production-path
> test (using `tickClosedWorld`, not a direct `chooseMerchantRouteDecision` call) that
> proves: when the destination town has high food shortage (price > 2) and a second
> destination has low shortage (price ≈ 1), the merchant's `selectedRoute` after a
> tick points toward the high-price town, *and* that this choice flips to the
> low-price town when the shortage is inverted. Mutation: delete the `cargoKind`
> assignment, show the production test goes red (choice becomes distance/price-blind),
> revert.

**Anchors:**
- `canonical-trade-system.js:176`: `if (merchant.cargoKind && route.to)`.
- `closed-world.js` `createClosedWorldScenario`: find where the canonical merchant is
  constructed (`cargo: 20`, no `cargoKind`). The Slice A test sets it manually at
  `tests/market-material-loop.test.js` — production must not rely on that.

---

## P0 — Kill the five omniscience leaks

Five places read ground truth instead of belief. Each one is a §9 partial-observability
violation that the existing tests don't catch because the tests assert the *accurate*
edge (accuracy 0 vs 1) but never the *fallback* path.

**Subagent prompt (one prompt, five sub-fixes — they're all small and coupled):**

> Close five ground-truth leaks in `closed-world.js` where the merchant/faction/bandit
> reads world state directly instead of through belief + rng-gated observation:
> (1) the route-danger fallback that does `world.bandits.some(b => b.roadId ===
> route.id) ? route.actualDanger : route.actualDanger * 0.1` — this injects the true
> bandit location into `routeDanger` whenever a belief is missing; replace with a
> neutral prior (0.5) so a missing belief is uncertainty, not omniscience. (2) The
> patrol-to-merchant belief update that sets `routeBeliefs[bandit.roadId] = max(cur,
> 0.7)` with no rng/perception-accuracy gate — gate it on the same `rng() <
> perceptionAccuracy` check the merchant-observes-bandit path uses. (3) The
> `confirmedLoss` broadcast that lets `north-faction` learn about a `south`-only
> attack — scope it per-town the way `recentAttacksByTown` already is. (4) The
> instant-global-rumor block that hardcodes road-a/b/c * 0.5 in a single hop — route
> it through the existing `rumorsInTransit` queue (1-tick delay + graph distance). (5)
> The `canObserve` check that makes a merchant at `north` see every adjacent road as a
> panopticon — constrain it to the merchant's `selectedRoute` plus an rng draw. Add
> one test per leak that fails with the leak present and passes with it closed.
> Mutation: for each, revert the single leak and show its test goes red.

**Anchors:**
- Leak 1: `closed-world.js` ~1276 (`banditOnRoute ? route.actualDanger : ...`).
- Leak 2: `closed-world.js` ~564 (patrol → merchant belief, no rng).
- Leak 3: `closed-world.js` ~769 (`confirmedLoss` global).
- Leak 4: `closed-world.js` ~1172-1209 (hardcoded rumor).
- Leak 5: `closed-world.js` ~2550 (`canObserve` panopticon).

---

## P0 — Fix the evidence linter gate so a fresh tree can go green

The linter *cannot* exit 0 even on a freshly-seeded tree because of two bugs, not
because the evidence is genuinely bad. This is the one task that *does* touch the
ledger/linter.

**Subagent prompt:**

> The evidence linter at `evidence/lint.mjs` exits 1 unconditionally because of two
> predicate bugs, not because evidence is stale. (1) The admissibility count at
> ~line 174 does `ledger.some(r => r.freshness !== 'ADMISSIBLE')` — but
> `EVIDENCE_SUPERSESSION` rows are intentionally append-only records with a freshness
> of `SUPERSESSION`, and they are *not* inadmissible claims. Exclude them:
> `r.freshness !== 'ADMISSIBLE' && r.dimension !== 'EVIDENCE_SUPERSESSION'`. (2) The
> `DEFAULT_ROOT` at ~line 23 is `C:/tools/...` which under WSL/Git-Bash resolves to a
> non-existent `/mnt/c/C:/...` style path, so `readLedger` returns 0 rows and the gate
> exits 0 *vacuously* — meaning a broken tree looks clean. Make `DEFAULT_ROOT` resolve
> correctly (use `fileURLToPath(import.meta.url)` + `dirname` to anchor to the
> module's own location). Prove both: a synthetic ledger with one ADMISSIBLE row + one
> SUPERSESSION row exits 0; the same ledger with a genuinely STALE row exits 1. Do NOT
> reseed the real ledger or touch any EVID- rows — only fix the two predicates.
> Mutation: revert each predicate fix independently and show the corresponding test
> fails.

**Anchors:**
- `evidence/lint.mjs:23`: `DEFAULT_ROOT = 'C:/tools/...'`.
- `evidence/lint.mjs:174`: `const hasInadmissible = ledger.some(r => r.freshness !== 'ADMISSIBLE')`.
- `evidence/receipt.mjs:196`: the `JEST_WORKER_ID` guard (already fixed for the
  old `NODE_ENV=test` bypass — leave it).

---

## P1 — Close the causal-trace orphans

15+ event types are emitted via bare `world.events.push({ ... })` with no
`parentEventIds`, then `finalizeWorldEventLedger` backfills `parentEventIds: []` — so
the causal chain walks gap-free on the *isolated* fixtures but breaks on any tick that
emits one of the orphaned types. This is why the deep-dive called the trace
"CAUSALLY_DECORATIVE."

**Subagent prompt:**

> Make every world event flow through `appendWorldEvent` with explicit parents, so the
> causal chain is gap-free in the production tick path, not just in isolated fixtures.
> Today, `ROUTE_SELECTED`, `ROUTE_CHANGED`, `CONVOY_FORMED`, `MARKET_TICK`,
> `REPORT_FILELED`, `FACTION_REASSESSMENT`, `STANCE_TRANSITION`, `INTRUSION`, and the
> legacy `BANDIT_RELOCATION` are pushed via bare `world.events.push(...)` with no
> `parentEventIds`, and `finalizeWorldEventLedger` backfills them with `[]`. For each,
> route it through `appendWorldEvent` and give it the real causal parent(s):
> `ROUTE_SELECTED` → the `MERCHANT_ROUTE_DECISION` that produced it; `MARKET_TICK` →
> the `POPULATION_CHANGE` / production that moved supply; `FACTION_REASSESSMENT` → the
> attack or justice event that changed emotion; etc. Also: three event types
> (`MERCHANT_ROUTE_DECISION-${tick}-${id}`, `BANDIT_RELOCATION-${tick}-`,
> `PATROL_INTERCEPTION-${tick}-`) bypass the `allocateWorldEventId` allocator by
> hardcoding a template string eventId — the `ensureWorldEventIdentity` guard lets them
> stick because "if eventId exists, don't overwrite." Route them through the allocator
> so eventIds are globally unique and fork-safe. Add a test that walks the *entire*
> event ledger of a 20-tick `tickClosedWorld` run and asserts every event (except the
> first tick's seeds) has at least one parent that resolves to an earlier eventId.
> Mutation: revert one `appendWorldEvent` call to `world.events.push`, show the walk
> test reports an orphan, revert.

**Anchors:**
- `closed-world.js:110` `appendWorldEvent` (the right way).
- `closed-world.js:119` `finalizeWorldEventLedger` (backfills `[]`).
- `closed-world.js:1310,1316,1338,1573,1949,853,939,1029,1070` — bare pushes.
- `canonical-trade-system.js:359,495,573` — template-string eventIds.
- `closed-world.js:101` `ensureWorldEventIdentity` guard.

---

## P1 — Persist the encounter rng so save/load is byte-identical on restart

`saveWorld` serializes `rngStreams` but `encounterRng` (a function passed as a
`tickClosedWorld` option) is a closure — dropped on save. A real restart constructs a
fresh `mkRng(seed)`, so the resumed run diverges from the uninterrupted run. The
existing save/load test hides this by reusing the same closure object.

**Subagent prompt:**

> `tickClosedWorld` accepts an `encounterRng` function option used at
> `closed-world.js:1241,2209,2306,2310`. Because it's a closure, `saveWorld` drops it,
> and a real restart with a fresh rng diverges from the uninterrupted run. Fold
> encounter rng state into `world.rngStreams.encounter` (persist `{ state, draws }` or
> a seed + counter) so a saved-then-loaded world reproduces the exact same encounter
> rng sequence. Then tighten `tests/save-load-pending.test.js` and
> `tests/statistical-validation-trade-loop.test.js` so they construct the world from a
> seed, save, construct a *fresh* world from the same seed, load, and assert
> `saveWorld(loaded) === saveWorld(uninterrupted)` byte-for-byte (not just event count
> equality). Mutation: revert the rng persistence, show the byte-equality test fails,
> revert.

**Anchors:**
- `closed-world.js:726` `tickClosedWorld({ ..., encounterRng = null, ... })`.
- `closed-world.js:49-54` existing `rngStreams.pendingEffects` pattern — mirror it for
  `encounter`.
- `closed-world.js:1241,2209,2306,2310` — the four `encounterRng ?? deterministicRng(...)`
  call sites.
- `tests/save-load-pending.test.js:122` — current byte-equality test that reuses the
  same closure (the loophole).
- `tests/statistical-validation-trade-loop.test.js:145,174` — asserts `events.length`
  + `BANDIT_ATTACK` count, not save equality.

---

## P1 — Calibrate migration destination weights

The Slice B utility `0.4*(1-shortage) + 0.3*(1-danger) + 0.2*(1/(1+dist/10)) +
0.1*trust` beats `lowestPop`, but the deep-dive flagged: weights are unjustified,
safety is a binary `banditOnRoad ? 0.7 : 0.2` that ignores `actualDanger` (0.8 vs 0.1),
distance saturates, trust is never decisive, and the road-a north↔south topology makes
`recentAttacksByTown` count for *both* towns symmetrically — so a "flee north" world
looks identical to a "flee south" world.

**Subagent prompt:**

> The migration destination utility in `closed-world.js` uses fixed weights and a
> binary safety signal. (1) Make safety read `route.actualDanger` (continuous) instead
> of the `banditOnRoad ? 0.7 : 0.2` binary, aggregating the max actualDanger across
> incident roads. (2) Add a third town reachable only from north (a north-exclusive
> road) so the `recentAttacksByTown` counts are no longer symmetric between the two
> existing towns. (3) Run a parameter sweep over the four weights (keep them summing
> to 1) and assert the chosen destination is stable under ±0.05 weight perturbation
> for the canonical high-shortage-beats-low-pop scenario — i.e. the choice isn't a
> knife-edge artifact of the exact 0.4/0.3/0.2/0.1 split. (4) Add a test where trust is
> the *only* differentiator (equal shortage, equal danger, equal distance) and prove
> the high-trust town wins — showing the 0.1 trust weight is genuinely decisive, not
> decorative. Mutation: zero the trust weight, show the trust-differentiator test
> fails; zero the safety weight, show a bandit-road test fails.

**Anchors:**
- `closed-world.js` ~1782-1840 (the utility block added in Slice B).
- `demography.js` ~142 (separate single-factor lowest-shortage logic — the divergence
  the deep-dive flagged; reconcile or document the split).

---

## P2 — Verify (don't assume) the resource-refill cap

The deep-dive claimed north resources grow 42→83→247 "exceeding maxResources 2." But
`closed-world.js:2154-2155` already reads `faction.resources = Math.min(cap,
faction.resources + 1)` with `cap = faction.maxResources`. Either the claim is wrong,
or `maxResources` is set high in `createClosedWorldScenario`, or growth happens in a
second code path. This is exactly the kind of decorative claim the playbook is meant to
catch — so verify it, don't repeat it.

**Subagent prompt:**

> A prior audit claimed faction `resources` grows unboundedly past `maxResources`. The
> refill site at `closed-world.js:2154-2155` already caps via
> `Math.min(maxResources, resources + 1)`. Determine the truth: search the entire
> codebase for every site that mutates `faction.resources` (or any faction's
> `resources` field), and report which ones cap and which don't. If *any* path is
> uncapped, fix it and add a test that runs 200 ticks and asserts
> `faction.resources <= faction.maxResources` for every faction at every tick. If all
> paths cap, write a one-paragraph finding to `AUTONOMOUS_HANDOFF.md` under
> `## Verification` stating the claim was a misread and the cap is correct — and add
> the 200-tick cap assertion test anyway as a regression guard. Do not fabricate a bug.

**Anchors:**
- `closed-world.js:2154-2155` (the capped refill).
- `grep -n "resources" closed-world.js canonical-trade-system.js factioncore.js` for
  every mutation site.

---

## Orchestrator dispatch order

Run in this order; each builds on the last:

1. **Evidence linter gate** (P0) — unblocks the ability to *trust* green. Do this first
   so every later task's "full suite green" actually means something.
2. **Market accounting hole** (P0) — the conservation identity is the spine everything
   else hangs on.
3. **Merchant opportunity in production** (P0) — small, but it's the proof that Slice A
   wasn't decorative.
4. **Omniscience leaks** (P0) — five coupled sub-fixes; dispatch as one agent.
5. **Causal-trace orphans** (P1) — only meaningful after the market wiring lands, since
   `MARKET_TICK` parenting depends on it.
6. **Encounter rng persistence** (P1) — independent; can run in parallel with 5.
7. **Migration weight calibration** (P1) — independent; can run in parallel.
8. **Resource-refill verification** (P2) — cheap, dispatch last or as a breather.

Max three subagents in flight at once (the suite is 141 suites / ~34s parallel; more
than three causes flaky timeouts on this WSL box).

---

## Non-goals (do NOT dispatch these)

- **Lane A / frozen-core mutation kills (0/10).** Quarantined. Supervisor hasn't
  admitted. Do not start.
- **Evidence re-seeding.** The 235 STALE rows are honest — head moved from `63d76f9`
  to `99e439a`. Re-seeding is supervisor work, not subagent work.
- **FearCore vs Brain dual-ownership.** Parked.
- **Vite build (`vite build` fails — rollup native missing in WSL).** Not a code bug;
  don't chase it.
- **A new evidence-framework slice.** The handoff explicitly says: do not start another
  evidence-framework slice unless a P0 ledger-write bug reappears. The linter gate fix
  above is a *predicate* fix, not a new framework — that's the exception.
