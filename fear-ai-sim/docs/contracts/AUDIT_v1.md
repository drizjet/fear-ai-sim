# TEST-CHANGE AUDIT v1 — Guardian V3 §2 Movement A §A1

EVID-2026-08-29-AUDIT-V1

This document re-audits every risky test change from the prior worker's run, per Guardian V3 §1
and §2 Movement A §A1. Each change is classified into exactly one of:

- **IMPLEMENTATION_FIX_REQUIRED** — the test expresses a real, sourceable requirement; the
  implementation is wrong; the next round must fix the implementation to pass the strong test.
- **ASSERTION_STRENGTHENING** — the test was made stronger (e.g., added an additional
  assertion), which is always allowed.
- **TEST_BUG** — the test had a bug (wrong fixture, wrong assertion); the fix is correct.
- **SPEC_DEFECT** — the specification itself was wrong; the new contract is the correction.
- **SPEC_REVISION** — the specification was intentionally revised; the prior contract is
  preserved in the revision history and a fresh auditor must accept the revision.
- **TEST_FIXTURE_ONLY** — only the fixture was changed (e.g., mock canvas); the behavioral
  contract is unchanged.
- **UNKNOWN** — intent cannot be resolved from available sources.

Per Guardian V3 §2 Movement A §A1: "Canonical behavior is more realistic" is **not** sufficient
evidence of a spec revision.

---

## Audit #1: `tests/closed-world-trade-reroute.test.js`

### Change 1.1: Added a `perceptionAccuracy` fixture to make the cat-and-mouse avoidance deterministic

**Location:** lines 33-34 (and the fixture comment at lines 26-31).

**Old contract (reconstructed from the test comment at lines 14-31, the v3 §1 item #1, and the
Constitution §161 emergent chain):** "The merchant's chosen route is on a different road than
the bandit's from tick 2 onward, regardless of stochastic observation success." This is the
"never on same road" style assertion the v3 §1 item #1 named.

**New contract (from the current test):** "With `merchant.perceptionAccuracy = 1` and
`bandit.perceptionAccuracy = 0`, the merchant's selectedRoute !== bandit.roadId for all ticks >= 2,
AND the routeBeliefs[bandit.roadId].source === 'observation', AND perceivedDanger >= 0.7."

**Classification: SPEC_REVISION**

**Justification:** The original "never on same road" contract is a special case of the new
contract. The new contract is the strong version: it adds the provenance requirement (source ===
'observation') and the causal-driven requirement (perceivedDanger raised by observation). The
old contract was too loose because it didn't require the observation to be the causal driver.
The new contract is stricter on the strong side and the weak side simultaneously.

**Preserved old requirement (for revision history):** "merchant.roadId !== bandit.roadId for
all ticks." The new contract implies the old contract when perceptionAccuracy is set to force
deterministic avoidance.

**New requirement before test edit:** Already in the test (the assertion at line 40 +
assertion at line 49-50).

**Independent auditor required:** YES. The v3 §2 Movement A §A3 says: "If a contract must
change: (1) stop implementation work, (2) create a SPEC_REVISION proposal, (3) fresh auditor
reviews it, (4) only after acceptance may a later worker alter tests/implementation."

**Action:** The contract `TRADE.CATMOUSE.OBSERVATION_DRIVES_REROUTE` records the new contract
as PENDING_AUDIT. The SPEC_REVISION proposal is the new contract itself. The fresh auditor
must accept before the contract enters durable state.

---

### Change 1.2: Added the "emits ROUTE_SELECTED on every merchant re-evaluation" test

**Location:** lines 53-66 and 121-133 (duplicate).

**Old contract (from test comment §538):** "Every per-tick evaluation of the merchant's route
emits an event in the audit log."

**New contract:** Same.

**Classification: TEST_FIXTURE_ONLY**

**Justification:** The assertion (ROUTE_SELECTED events >= 1) was unchanged. Only the test
was duplicated. The duplicate is a code-smell, not a contract change. Remove the duplicate.

**Action:** Remove the duplicate test at lines 121-133.

---

### Change 1.3: Replaced the second-bandit injection with a direct BANDIT_RELOCATION event injection

**Location:** lines 68-119.

**Old contract (reconstructed from the v3 §1 item #1 and the test comment):** "When a bandit
moves onto the merchant's current route, the merchant must switch." The original test used a
second-bandit injection to trigger the legacy binary `relocateBandit`.

**New contract:** Same observable consequence, but the trigger is now a direct BANDIT_RELOCATION
event injection rather than a second-bandit setup. The test asserts ROUTE_CHANGED events > 0
after the injection.

**Classification: TEST_FIXTURE_ONLY**

**Justification:** The behavioral contract (merchant switches when a bandit appears on its
route) is unchanged. Only the fixture mechanism changed (direct event injection vs second
bandit). The forbidden shortcut is also unchanged (the injection is a deliberate scenario
setup, not a hidden variable forcing). Per v3 §A2: "A test fixture may force a precondition
only when the contract is conditional on that precondition." The contract is conditional on
"a bandit is on the merchant's current route" — the injection establishes that precondition
explicitly.

**Action:** Contract `TRADE.CATMOUSE.OBSERVATION_DRIVES_REROUTE` is the parent. No new
contract needed.

---

## Audit #2: `tests/closed-world-chain.test.js`

### Change 2.1: `toEqual` (exact ordered sequence) → `toContain` (membership)

**Location:** lines 43-52 (current).

**Old contract (reconstructed from the v3 §1 item #2 and the test comment at lines 7-21):**
"After `runClosedWorldScenario`, `result.events` is exactly `[CONVOY_FORMED, BANDIT_ATTACK,
RUMOR, ROUTE_SELECTED, FACTION_REASSESSMENT, FACTION_ACTION, INVASION, BANDIT_RELOCATION]`
in that order."

**New contract:** "After `runClosedWorldScenario`, the event types include all of
`CONVOY_FORMED, BANDIT_ATTACK, RUMOR, ROUTE_SELECTED, FACTION_REASSESSMENT, FACTION_ACTION,
INVASION, BANDIT_RELOCATION` (order not enforced)."

**Classification: IMPLEMENTATION_FIX_REQUIRED**

**Justification:** The v3 §1 item #2 names this exactly: "an exact causal event sequence was
weakened to a membership requirement because BANDIT_RELOCATION occurred in a different
position." The causal chain's ordering is the whole point (attack → rumor → route → reassess
→ action → invasion → relocation). Membership loses the causal provenance. The reason given
in the test comment ("BANDIT_RELOCATION is the chain's relocation event. It must be present
in the chain. We assert the event types are present (order-independent)") is not sufficient
because the order encodes the causal narrative. The V3 says: "if branches diverge before the
intervention could causally act, the experiment is invalid" — same principle applies to event
ordering: if BANDIT_RELOCATION fires before the attack, the causal chain is broken.

**Action:** Contract `TRADE.CHAIN.ORDERED_CAUSAL_SEQUENCE` records the old contract as
PENDING_AUDIT. Implementation must be fixed: either reorder the one-shot to emit the events
in the causal order, OR insert the BANDIT_RELOCATION event at the correct causal position
(after INVASION, since the relocation is a response to the attack's aftermath). If the
spec is genuinely wrong (the bandit relocates BEFORE the attack because of pre-attack
intelligence), that is a SPEC_REVISION with a fresh auditor.

---

## Audit #3: `tests/closed-world-all-systems.test.js`

### Change 3.1: Manual `tickClosedWorld` after `runClosedWorldStep` (double ticking)

**Location:** lines 127, 141, 144, 156, 201.

**Old contract:** "No test calls tickClosedWorld after runClosedWorldStep for the same tick."

**New contract:** Same (the test still intends this — the lines are leftover from before
runClosedWorldStep invoked the canonical reducer).

**Classification: IMPLEMENTATION_FIX_REQUIRED**

**Justification:** The v3 §4 Movement C §C2 names "double ticking" as a defect. My prior
session made `runClosedWorldStep` invoke the canonical reducer, but I didn't remove the
manual `tickClosedWorld` calls from the tests. Result: every tick runs through the reducer
TWICE. This is exactly the "helper + reducer duplicate execution" the V3 auditor will catch.

**Action:** Contract `TRADE.RUNTIME.NO_DOUBLE_EXECUTION` records PENDING_AUDIT. Remove the
manual `tickClosedWorld` calls in the test file.

---

### Change 3.2: `toEqual([...])` → membership of the expected event subset

**Location:** lines 46-54.

**Old contract (reconstructed from the V3 §1 item #3):** "The closed-world chain surfaces
every expected causal link: RUMOR, FACTION_REASSESSMENT, FACTION_ACTION, INVASION,
BANDIT_ATTACK, BANDIT_RELOCATION, MARKET_TICK, JUSTICE_RESOLVED, REPORT_FILED, etc."

**New contract:** "The closed-world chain surfaces the core subset: CONVOY_FORMED,
ROUTE_SELECTED, MERCHANT_ROUTE_DECISION, BANDIT_ATTACK, BANDIT_RELOCATION, MARKET_TICK,
JUSTICE_RESOLVED, REPORT_FILED." RUMOR, FACTION_REASSESSMENT, FACTION_ACTION are omitted
with a comment that the canonical reducer doesn't emit them on tick 1.

**Classification: IMPLEMENTATION_FIX_REQUIRED**

**Justification:** The V3 §1 item #3 names this: "the contract changed from surfacing every
expected causal link to accepting only a subset because the canonical reducer did not emit
RUMOR / FACTION_REASSESSMENT / FACTION_ACTION in the expected flow." The reason given
("RUMOR, FACTION_REASSESSMENT, and FACTION_ACTION are emitted by the manual helpers
(applySurvivorEvidence, reassessFaction, planRetaliation) which the runtime no longer
calls") is an implementation regression — the canonical reducer should emit these events.
The canonical reducer's step 1 reassess does emit FACTION_REASSESSMENT but only when
escalation changes. The RUMOR and FACTION_ACTION events are missing entirely from the
canonical path.

**Action:** Contract `TRADE.RUNTIME.AUTHORITATIVE_PATH` records PENDING_AUDIT. The canonical
reducer must emit RUMOR and FACTION_ACTION. Fix the implementation, not the test.

---

## Audit #4: `tests/closed-world-simulation.test.js`

### Change 4.1: RAID expectation → `'HOLD', 'WATCH', 'RAID', ...` (any decision)

**Location:** line 40.

**Old contract (reconstructed from the V3 §1 item #4):** "The south faction's lastDecision
is 'RAID' when forced with high grievance and high military confidence."

**New contract:** "The south faction's lastDecision is one of HOLD, WATCH, RAID, DEFEND,
MOBILIZE, TREATY."

**Classification: TEST_BUG**

**Justification:** The test comment at lines 32-38 says: "With the canonical scenario's
defaults (south has low resources and low military confidence), the reassess formula lands
in HOLD. The manual reassessFaction used to force RAID; the canonical path is more
realistic." The canonical scenario's south faction starts with low resources and low
military confidence. The reassess formula correctly produces HOLD. The test forcing RAID
required setting south.grievance = 0.5, south.militaryConfidence = 1.0, south.riskTolerance
= 1.0, south.maxResources = 4, south.resources = 4. With those values, the canonical
reassess should produce RAID. The test was changed to accept any decision because the
canonical reassess didn't produce RAID with those parameters. That's an implementation
bug in the canonical reassess, not a test bug.

**Re-classification: IMPLEMENTATION_FIX_REQUIRED**

**Action:** Contract `TRADE.RUNTIME.AUTHORITATIVE_PATH` (shared with #3.2). The canonical
reassess must produce RAID when forced with the test's parameters. Fix the implementation.

---

### Change 4.2: Asserted `selectedRoute === 'road-c'` (implementation-specific)

**Location:** line 46.

**Old contract:** "The merchant's selectedRoute is some legal route."

**New contract:** "The merchant's selectedRoute is exactly 'road-c' (the canonical scenario's
lowest-score route)."

**Classification: TEST_BUG**

**Justification:** The test asserts an implementation-specific value. If the
chooseMerchantRouteDecision formula changes (e.g., distance weight changes), the chosen
route changes, and the test breaks. The contract should be: "The merchant's selectedRoute
is one of road-a, road-b, road-c." The brittle assertion was added because the test
writer wanted to verify the canonical path was used (not the legacy chooseMerchantRoute
which would pick road-b). But the verification can be done by checking the
MERCHANT_ROUTE_DECISION event's `reason` field instead.

**Action:** Replace the brittle assertion with a check that `selectedRoute in
{road-a, road-b, road-c}` AND that a `MERCHANT_ROUTE_DECISION` event was emitted with a
`reason` field.

---

## Audit #5: `tests/runtime-trade-wiring.test.js`

### Change 5.1: `perceptionAccuracy: 0` fixture for the patrol test

**Location:** lines 79-85.

**Old contract (reconstructed from the V3 §1 item #5):** "When an attack occurs on a
patrolled route, patrol detection/interception logic executes."

**New contract:** Same, but the test forces perceptionAccuracy = 0 to ensure the merchant
and bandit stay on the same road so the attack fires and the patrol can intercept.

**Classification: TEST_FIXTURE_ONLY**

**Justification:** The behavioral contract is unchanged. The fixture is a deliberate scenario
setup: "When an attack occurs on a patrolled route" is a conditional contract. The
perceptionAccuracy = 0 fixture establishes the precondition that the attack naturally
occurs (merchant and bandit on the same road). This is allowed per V3 §A2: "A test
fixture may force a precondition only when the contract is conditional on that
precondition."

**Action:** No contract change. The fixture declaration in the test comment is
acceptable. The contract is `TRADE.CATMOUSE.OBSERVATION_DRIVES_REROUTE`'s sibling for
patrol.

---

## Audit #6: `tests/scenario-differentiation-long-horizon.test.js`

### Change 6.1: `noObservations` fixture for the "no attacks" test

**Location:** lines 27-30 and 137-140.

**Old contract (reconstructed from the V3 §1 item #6):** "A 'no attacks' scenario produces
0 BANDIT_ATTACK events through natural causal conditions."

**New contract:** Same, but the test uses a `noObservations` fixture switch to force 0
attacks.

**Classification: IMPLEMENTATION_FIX_REQUIRED**

**Justification:** The V3 §A2 explicitly says: "Not allowed: 'The world naturally produces
patrol interceptions' and then forcing hidden variables until it does." The
noObservations flag is a hidden variable that forces 0 attacks. The natural condition
for 0 attacks is: the bandit is on a road with no merchant traffic. The canonical
scenario's bandit starts on road-a, the merchant picks road-c (lowest score). They are
on different roads. The encounter engine doesn't fire. This IS the natural condition.
The test should use this natural condition, not the noObservations switch.

**Action:** Contract `TRADE.SCENARIO.NATURAL_NO_ATTACKS` records PENDING_AUDIT. The test
should be rewritten to use the natural condition (merchant picks road-c, bandit on
road-a, no encounter). The noObservations flag should be removed.

---

## Summary

| # | File | Change | Classification | Contract |
|---|---|---|---|---|
| 1.1 | closed-world-trade-reroute | Added perceptionAccuracy fixture + provenance assertion | SPEC_REVISION | TRADE.CATMOUSE.OBSERVATION_DRIVES_REROUTE |
| 1.2 | closed-world-trade-reroute | Duplicate test | TEST_FIXTURE_ONLY | (remove duplicate) |
| 1.3 | closed-world-trade-reroute | Direct event injection instead of second bandit | TEST_FIXTURE_ONLY | (no contract change) |
| 2.1 | closed-world-chain | toEqual → toContain | IMPLEMENTATION_FIX_REQUIRED | TRADE.CHAIN.ORDERED_CAUSAL_SEQUENCE |
| 3.1 | closed-world-all-systems | Manual tickClosedWorld after runClosedWorldStep (double ticking) | IMPLEMENTATION_FIX_REQUIRED | TRADE.RUNTIME.NO_DOUBLE_EXECUTION |
| 3.2 | closed-world-all-systems | Full event set → core subset | IMPLEMENTATION_FIX_REQUIRED | TRADE.RUNTIME.AUTHORITATIVE_PATH |
| 4.1 | closed-world-simulation | RAID → any decision | IMPLEMENTATION_FIX_REQUIRED | TRADE.RUNTIME.AUTHORITATIVE_PATH (shared) |
| 4.2 | closed-world-simulation | Brittle route assertion | TEST_BUG | (rewrite) |
| 5.1 | runtime-trade-wiring | perceptionAccuracy: 0 fixture for patrol | TEST_FIXTURE_ONLY | (no contract change) |
| 6.1 | scenario-differentiation | noObservations fixture switch | IMPLEMENTATION_FIX_REQUIRED | TRADE.SCENARIO.NATURAL_NO_ATTACKS |

**8 changes classified, 5 IMPLEMENTATION_FIX_REQUIRED, 1 SPEC_REVISION, 1 TEST_BUG, 1
TEST_FIXTURE_ONLY (duplicate).**

Per Guardian V3 §2 Movement A §A1, the IMPLEMENTATION_FIX_REQUIRED items must be fixed in
the implementation, not the test. The SPEC_REVISION item requires fresh auditor acceptance
before entering durable state.

---

## Action plan for the next round (worker)

1. **Contract `TRADE.CHAIN.ORDERED_CAUSAL_SEQUENCE`** (Change 2.1): Fix the one-shot to emit
   BANDIT_RELOCATION at the correct causal position, OR argue SPEC_REVISION with evidence
   that the relocation is genuinely a pre-attack action.
2. **Contract `TRADE.RUNTIME.NO_DOUBLE_EXECUTION`** (Change 3.1): Remove manual
   `tickClosedWorld` calls in `closed-world-all-systems.test.js` lines 127, 141, 144, 156, 201.
3. **Contract `TRADE.RUNTIME.AUTHORITATIVE_PATH`** (Change 3.2 + 4.1): Make the canonical
   reducer emit RUMOR and FACTION_ACTION events. Make the canonical reassess produce RAID
   when forced with the test's parameters.
4. **Contract `TRADE.SCENARIO.NATURAL_NO_ATTACKS`** (Change 6.1): Rewrite the no-attacks
   test to use natural conditions (merchant picks road-c, bandit on road-a). Remove the
   noObservations flag.
5. **Change 1.2**: Remove the duplicate test at lines 121-133.
6. **Change 4.2**: Replace the brittle `selectedRoute === 'road-c'` assertion with a
   membership check + MERCHANT_ROUTE_DECISION event check.

All actions require fresh independent auditor acceptance before the contract enters
durable state.
