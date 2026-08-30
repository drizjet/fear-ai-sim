# BadAI / Fear AI — Canonical Master Plan

**Status:** `CANONICAL PLANNING INDEX`  
**Version:** 1.0  
**Date:** 2026-08-26  
**Scope:** Fear AI simulator → BadAI perceived-reality simulation platform  
**Authority:** This file is the operational index. Detailed source documents remain authoritative for their stated subject areas; current code, tests, and runtime evidence remain authoritative for implementation facts.

> This document consolidates the plan. It does not replace or erase the detailed specifications, historical chats, research archive, or knowledge database.

---

## 1. What this project is

Fear AI is the existing simulation and research foundation. BadAI is the proposed successor/platform built from that inheritance.

**BadAI vision:** one explainable, deterministic decision architecture drives intelligent actors at multiple scales: individual agents, predators, vampires, merchants, caravans, factions, towns, courts, and institutions.

The central loop is:

```text
Ground truth
→ perception
→ belief and uncertainty
→ appraisal
→ emotion and needs
→ affordances
→ hard prerequisites
→ utility scoring
→ intent
→ planning
→ execution
→ world consequences
→ memory, reputation, rumors
→ updated beliefs
```

The project is not merely a combat-AI system. Fear is the inheritance and first subsystem; the long-term target includes social behavior, trade, routing, diplomacy, crime, justice, migration, faction conflict, and emergent macro behavior.

---

## 2. Source-of-truth rules

### 2.1 Evidence hierarchy

For current implementation claims, use this order:

1. Reproducible runtime behavior and passing tests.
2. Current source code and actual import/call wiring.
3. Current configuration and build artifacts.
4. Current project documentation.
5. Historical chats and audit reports.
6. External research and assistant proposals.

### 2.2 Mandatory labels

Use these labels whenever status matters:

- `CODE_VERIFIED` — confirmed by current repository code.
- `RUNTIME_VERIFIED` — confirmed by an executed reproducible run.
- `TEST_VERIFIED` — covered by a passing automated test.
- `DOCUMENTED_CLAIM` — stated in a document but not independently confirmed.
- `RESEARCH_ONLY` — external support; not proof of implementation.
- `PROPOSED` — design idea not implemented.
- `ASSUMPTION` — temporary interpretation awaiting evidence.
- `UNKNOWN` — insufficient evidence.
- `STALE` — superseded or contradicted.

Never convert a research result, user goal, old audit, or assistant suggestion into an implementation fact without repository/runtime evidence.

### 2.3 Epistemic separation

These must remain separate everywhere:

```text
GROUND_TRUTH
AGENT_BELIEF
FACTION_BELIEF
PUBLIC_RUMOR
PUBLIC_REPUTATION
INSTITUTIONAL_RECORD
PREDICTION
```

Likewise, retain the distinction between:

```text
USER REQUIREMENT
ASSISTANT PROPOSAL
RESEARCH FINDING
CODE AUDIT
IMPLEMENTATION CLAIM
VERIFIED FACT
```

---

## 3. Existing documentation and evidence estate

### 3.1 Repository documents

| File | Purpose |
|---|---|
| `docs/BADAI_MASTER_PLAN.md` | This canonical index and phase register |
| `docs/BADAI_MASTER_SPEC.md` | Detailed BadAI vision, doctrine, inheritance, layers, epochs, and named tests |
| `docs/mvp-plan.md` | Comprehensive product specification and work-package plan |
| `docs/ARCHITECTURE.md` | Current architecture map and grounding requirements |
| `docs/BASELINE.md` | Dated baseline verification record |
| `docs/DECISIONS.md` | Design decision register |
| `docs/PROVENANCE.md` | Evidence/provenance operating rules |
| `docs/PROVENANCE_RECORD_TEMPLATES.md` | Templates for evidence, proposals, and worklogs |
| `CONTINUE_PROMPT.md` | Historical continuation context |
| `PROJECT_STATUS.md` | Historical/current status reference; verify against newer evidence |
| `RESEARCH_AUDIT.md` | Historical research/audit material |

### 3.2 Desktop/reference documents

The current evidence set also includes:

- `Fear_AI_State_and_Build_Plan_2026-08-26.md`
- `Fear_AI_Implemented_Code_Facts_2026-08-26.md`
- `Fear_AI_Knowledge_Complete_Dump_2026-08-26.md`
- `Fear_AI_Archive_Extraction_2026-08-26.md`
- `BadAI_Master_Spec_Roadmap_2026-08-26.md`
- `BADAI_EXECUTION_PROMPT.md`
- `Fear_AI_Master_Prompt.md`
- `Fear_AI_Readiness_2026-08-26.md`
- `fear_ai_knowledge.db`

The SQLite database is a provenance and knowledge system. Historical ledger tables are read-only. New work belongs only in its designated write-safe tables: `agent_worklog`, `implementation_evidence`, and `design_proposals`.

### 3.3 Coverage boundary

The available archive contains substantial material, including the deep-dive and extracted claims. Expected historical chats that are not accessible must remain marked inaccessible. Never report them as reviewed merely because their titles or summaries are known.

---

## 4. Current grounded state

### 4.1 Confirmed inheritance baseline

The existing simulator has verified or documented foundations in:

- simulation orchestration;
- `LearningAgent` and predator behavior;
- fear/emotion processing;
- perception and trauma systems;
- memory, causal inference, trust, betrayal, reputation, and tribes;
- escape behavior and co-evolution;
- metrics, replay, data bridge, and exports;
- browser/Vite and desktop wrapper surfaces;
- extensive automated tests;
- numeric and security hardening from the prior baseline.

The exact current test/build result must be rerun at the beginning of each implementation phase. Historical counts are not automatically current facts.

### 4.2 Known gaps and conflicts

These are planning targets or audit findings until reverified in the current checkout:

- fear threshold/scale ownership is not unified across JavaScript, dead modules, and the Rust target;
- panic-lock behavior is not proven in the live JavaScript path;
- GOAP planning exists but its invocation and execution boundary require verification;
- utility AI is not yet a shared first-class decision layer;
- morale is not yet a first-class module;
- personality exists partially through traits but has no finalized subsystem contract;
- structured belief/evidence/rumor modeling is incomplete;
- Hope, Guilt, and Shame are not separate established emotion systems;
- multiple modules may be orphaned or test-only;
- CI placement/discovery requires verification;
- Elixir and VR work are future/platform tracks, not immediate implementation targets;
- equations such as `crimeUtility`, `routeCost`, `RaidUtility`, `reportProbability`, and `AccessToJustice` remain proposed until implemented and validated;
- the Rust scale mapping remains an assumption until the authoritative Rust source is inspected.

### 4.3 Current priority

The next work is **not** to build every feature. It is to establish the shared contracts that prevent isolated, contradictory systems:

```text
baseline → fear contract → decision contract → social information → macro loops
```

---

## 5. Architecture target

### 5.1 Layer model

| Layer | Responsibility | First phase |
|---|---|---|
| L0 Evidence | provenance, source status, worklog, decisions | P0 |
| L1 FearCore | fear scale, bands, hysteresis, panic lock, habituation, trauma | P1 |
| L2 DecisionCore | affordances, prerequisites, utility, intent, traces | P2 |
| L3 SocialCore | personality, morale, beliefs, rumors, reputation | P3 |
| L4 MacroCore | factions, routing, trade, crime, justice, escalation | P4 |
| L5 Advisory | validator-gated LLM/scenario/mod surface | P5 |
| L6 Platform | batch research, Elixir, VR, multiplayer, distribution | P6 |

### 5.2 Shared decision contract

Every scale should eventually use the same conceptual pipeline:

```text
Enumerate affordances
→ validate hard prerequisites
→ calculate utility considerations
→ select an eligible action
→ create intent
→ plan
→ execute
→ emit consequences
→ update memory/social/beliefs
```

A decision trace should include:

```js
{
  actorId,
  scope,
  actionId,
  targetId,
  valid,
  blockers,
  considerations,
  finalScore,
  selected,
  confidence,
  alternatives,
  createdAtTick,
  explanation
}
```

Hard prerequisite failure disqualifies an action. It must never merely reduce utility.

---

## 6. Phase register

Each phase is independently shippable. Do not call a phase complete until its exit gate is met and its evidence/worklog records are updated.

### P0 — Grounding and inheritance lock

**Purpose:** establish exactly what exists before changing behavior.

**Detailed record:** `docs/PART_0_GROUNDING.md`

**Work:**

- rerun tests, build, syntax checks, and a seeded smoke run;
- confirm Git root, package root, CI location, and working directory;
- map production entry points and module reachability;
- verify fear/emotion ownership and scale usage;
- inspect the authoritative Rust source or record it unavailable;
- freeze known inherited behavior with regression tests;
- update baseline, architecture, decisions, and provenance notes;
- write evidence/worklog rows after a database backup.

**Exit gate:** reproducible baseline, current architecture map, explicit unknowns, no ambiguity about the P1 target.

### P1 — FearCore parity and stability

**Purpose:** create one authoritative fear-state contract.

**Execution prompt:** `docs/PART_1_EXECUTION_PROMPT.md`  
**Parity record:** `docs/RUST_PARITY.md`

**Work:**

- decide the canonical internal scale;
- create table-driven parity vectors;
- implement explicit state transitions and panic lock;
- decide ownership of hysteresis and habituation;
- preserve intentionally inherited behavior;
- test invalid/boundary numeric inputs;
- ensure fear updates cannot produce invalid movement/state values.

**Exit gate:** documented transition matrix, parity tests, panic-lock tests, no accidental scale conversions, regression suite green. Current status: isolated FearCore is implemented and integrated into the reactive Brain path; authoritative Rust parity remains open.

### P2 — DecisionCore vertical slice

**Purpose:** establish one shared action-selection architecture.

**Work:**

- define action/affordance schema;
- separate prerequisites from utility;
- implement considerations and response curves;
- produce decision traces and alternatives;
- wire one existing action end-to-end through intent, planning, and execution;
- preserve compatibility with the old path until migration is proven.

**Exit gate:** one deterministic, explainable action works from affordance through execution and has normal, boundary, invalid, integration, and replay tests.

### P3 — SocialCore

**Purpose:** make social information and social state first-class.

**Work:**

- define personality contract;
- define individual/group/faction morale ownership;
- implement belief evidence and confidence;
- implement rumor propagation and mutation;
- integrate reputation and trust;
- test divergence between actual, belief, and rumor.

**Exit gate:** a rumor can change belief and change a decision without a scripted direct command.

### P4 — MacroCore closed world

**Purpose:** demonstrate fear-driven social/economic/faction emergence.

**Work:**

- faction state and escalation output;
- perceived versus actual intelligence;
- route/trade/convoy behavior;
- bandit/adversarial adaptation;
- crime/reporting/justice/legitimacy slices;
- causal event log and experiment dashboard.

**Exit gate:** a seeded closed-world run reproduces and explains at least one multi-step emergent chain without cinematic scripting.

### P5 — Research and advisory surface

**Purpose:** make the system usable for experimentation and safe external advice.

**Work:**

- scenario definitions and validation;
- headless/batch runs;
- versioned exports and comparisons;
- provenance-linked reports;
- validator-gated LLM advisory path;
- data-driven actor/action definitions.

**Exit gate:** another user can reproduce a documented experiment, and an advisory suggestion cannot bypass validation or mutate the world directly.

### P6 — Platform expansion

**Purpose:** scale and distribute only after the core is reliable.

**Work:**

- Elixir/backend experiments;
- larger populations and measured budgets;
- VR/spectator integration;
- multiplayer/remote execution if still justified;
- packaging and distribution.

**Exit gate:** every scale/platform claim has a measured benchmark, reproducible run, security review, and operational documentation.

---

## 7. Cross-phase workstreams

These run throughout, but never replace the phase exit gates.

### Evidence and provenance

- backup the knowledge DB before every write;
- log every meaningful session;
- distinguish evidence, proposals, assumptions, and unknowns;
- link new facts to files/tests/runtime evidence;
- preserve contradictions and supersession history.

### Reliability

- finite numeric checks at subsystem boundaries;
- deterministic seeded randomness;
- bounded population/history/replay memory;
- explicit failure and partial-success states;
- no hidden mutation after failed operations.

### Security

- debug evaluation only in development;
- no unrestricted LLM execution;
- validate imported scenarios and exports;
- keep desktop capabilities separated and reviewed;
- maintain CSP and packaged-build checks.

### Observability

- run ID and seed;
- event/causal IDs;
- decision traces;
- actual versus believed values;
- replay metadata;
- export schema version.

---

## 8. Required documents by phase

| Phase | Required documentation |
|---|---|
| P0 | `BASELINE.md`, `ARCHITECTURE.md`, `DECISIONS.md`, provenance/worklog update |
| P1 | `RUST_PARITY.md`, transition matrix, scale decision, regression note |
| P2 | `DATA_SCHEMA.md`, action contract, decision-trace examples |
| P3 | social-state contract, belief/rumor schema, evidence update |
| P4 | `EXPERIMENTS.md`, closed-world scenario, causal-chain report |
| P5 | advisory validation contract, scenario/mod schema, security update |
| P6 | benchmark report, packaging/platform architecture, operations notes |

If a required document does not exist when its phase begins, create it before calling the phase complete.

---

## 9. Decision backlog

These decisions must be made explicitly and recorded in `docs/DECISIONS.md`:

1. Canonical internal fear scale and public display scale.
2. Rust-to-JavaScript threshold mapping.
3. Panic-only lock versus general minimum-duration hysteresis.
4. Inline versus stimulus-aware habituation.
5. GOAP/HTN planning ownership and behavior-tree execution boundary.
6. Morale ownership and update order.
7. Whether BadAI is a successor identity, rename, or separate package.
8. Revive/archive/delete verdict for each orphaned module.
9. Whether the knowledge DB is bundled with the application or remains research tooling.
10. Which first action becomes the DecisionCore vertical slice.

No decision should be hidden inside an implementation patch when it changes system semantics.

---

## 10. Definition of done for any phase

A phase is complete only when all conditions hold:

- scope is implemented or explicitly closed as deferred;
- relevant unit, contract, integration, boundary, and determinism tests pass;
- build and syntax checks pass;
- no new NaN/Infinity path is present;
- performance impact is measured where relevant;
- documentation is updated with a dated status;
- unknowns and remaining risks are listed;
- knowledge DB write-safe records are updated after backup;
- the next phase has a clear entry condition.

“Code exists” is not completion. “Tests pass” alone is not completion. Documentation, runtime evidence, provenance, and exit criteria are all required.

---

## 11. How to continue work safely

At the beginning of every session:

1. Read this file.
2. Read the relevant phase section in `docs/BADAI_MASTER_SPEC.md` and `docs/mvp-plan.md`.
3. Read current `BASELINE.md`, `ARCHITECTURE.md`, and `DECISIONS.md`.
4. Inspect the repository directly.
5. Check Git status and preserve unrelated user changes.
6. Pick exactly one phase and one narrow slice.
7. Write a todo plan.
8. Implement only after contracts and evidence are clear.
9. Run relevant tests/build checks.
10. Update docs and provenance records.
11. Report verified facts, unknowns, changed files, and the next phase.

### Recommended next session

Start with **P0**, then proceed to **P1**. Do not begin Morale, trade, faction warfare, VR, Elixir, or unrestricted LLM work until the FearCore and DecisionCore contracts are stable.

---

## 12. Canonical status summary

```text
VISION: documented
RESEARCH: extensively documented, not implementation proof
CURRENT CODE: partially grounded; verify each claim against repository/runtime
BASELINE: historical green result exists; rerun before relying on it
FEARCORE: not yet unified
DECISIONCORE: target architecture, not complete
SOCIALCORE: partial foundations, not complete
MACROCORE: proposed/integration target
ADVISORY: future gated surface
PLATFORM: future expansion
NEXT: P0 grounding → P1 FearCore parity
```

This file is now the place to start each future work session. Detailed evidence stays in the linked documents and knowledge base; phase completion notes should be appended to the relevant phase document and indexed here.
