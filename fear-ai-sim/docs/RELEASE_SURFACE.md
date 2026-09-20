---
title: "Fear AI — Release Surface Definition (RC1)"
created: 2026-09-20
updated: 2026-09-20
type: specification
status: active
---

# Fear AI — Release Surface Definition (RC1)

This is the **binding scope boundary** for the Fear AI middleware release
candidate. It answers one question unambiguously: *what is the thing we are
releasing, and what is deliberately not part of it?*

It exists because the repository contains far more than the shippable
middleware. Optional world-simulation, analytics, and research modules are real
and partly proven, but they are **not** the product. Per `SYSTEM_MAP.md`: *Fear
AI is intelligence middleware. The host game stays authoritative … it must not
become a second game engine.*

The authoritative line-by-line status of every capability remains
`docs/CURRENT_TRUTH_LEDGER.md`. This document does not re-certify anything; it
classifies the surface.

---

## 1. In scope — the RC1 middleware contract

These are the components the release candidate is responsible for. Each is
either `VERIFIED_CURRENT` or a bounded adapter with a named caveat.

| Surface | What ships | Status |
|---|---|---|
| `packages/core` — affective core | `FearCore`, `AffectiveAgent`, `RuntimeSimulation` and the services it constructs (pacing, cadence/time discipline, trauma, core trauma, contagion, social, habituation, pending observations, scheduling) | `VERIFIED_CURRENT` |
| `packages/core` — intent/host negotiation | `IntentResolver`, `HostCapabilityNegotiator` | `VERIFIED_CURRENT` |
| `packages/runtime` — transport | `FearServer` HTTP `/api/v1/*` + WebSocket dispatcher, registration/lifecycle, snapshot endpoints | `VERIFIED_CURRENT` |
| `packages/protocol` | `validator`, `BinaryWireProtocol`, `BinaryFrameReader` (Protocol V2) | `VERIFIED_CURRENT` |
| `packages/adapters/godot` | Godot 4.6 client + advisory badges | `PARTIAL` — protocol-conformant; station-level visual proof not yet independent |
| `packages/adapters/unity` | Unity UPM package | `PARTIAL` (`IMPLEMENTED_NOT_EDITOR_VERIFIED`) |
| `packages/adapters/csharp` | Generic C# client | build recorded 0/0; not rerun in current audit |
| Designer tooling | `DesignerDashboardServer` + `fear-ai dashboard` | `VERIFIED_CURRENT` (observability only) |
| Verification | `tools/verification/*.mjs` standalone harnesses | current |

**The release claim is:** a deterministic, advisory affect-and-intent middleware
layer with validated protocol adapters, bounded persistence, lifecycle handling,
and an observability dashboard. The host engine retains authority over
movement, physics, combat, damage, inventory, and world mutation.

---

## 2. Out of scope — standalone modules, tools, and research

These are **not** part of the RC1 contract. They must not be described as
runtime services, and no release claim may depend on them being automatically
available in a `RuntimeSimulation` session. They remain reachable through their
own explicit CLI/scenario entry points, labelled as standalone.

| Module / surface | Why out of scope | How it remains available |
|---|---|---|
| `PackCoordinationEngine` | Tactical world-sim; not constructed by `RuntimeSimulation` | `fear-ai pack`, reference/collision scenarios |
| `EconomicFeedbackSystem` | Economic world-sim; host owns inventory/world mutation | `fear-ai economy`, collision harness |
| `SettlementMigrationSystem` | Demographic world-sim | `fear-ai migration` |
| `EpistemicBeliefEngine` | Belief/perception simulation; the core consumes host-reported danger, it does not compute rumor internally | `fear-ai epistemic-fog`, scenario paths |
| `InformationPropagationEngine` | Rumor-diffusion simulation | `fear-ai rumor` |
| `WorldCounterfactualEngine` / `FrontierValleySimulation` | Analytics tool over a reference world | `fear-ai counterfactual-world` |
| Standalone world-sim tail (`FactionGovernanceSystem`, `CoalitionDiplomacyEngine`, trade chains, memory consolidation, trauma crystallization, Pareto frontier, streaming buffers, …) | Research sandbox exposed through ~60 CLI commands | individual `fear-ai <command>` paths |
| `FunctionalPersonaSignatures` (FABE) | Research; decoupled math proven, no live host consumer, human evaluation blocked | `fear-ai fabe-world` / `persona` |
| `MoralDissonanceEngine` | Research; advisory math proven, no live host consumer | `fear-ai moral` |
| `packages/adapters/unreal` | `DEFERRED` by owner policy | present so an Unreal host *can* connect later |
| Elixir + Rust NIF tree | Divergent research backend; no `mix.lock`, no toolchain on this host | separate repository, excluded |

A module leaves this list only by changing the code, not the prose — see §3.

---

## 3. How this boundary is enforced

The scope is not maintained by good intentions. It is checked:

- **Code boundary** — `tools/verification/verify_runtime_wiring.mjs` asserts that
  `RuntimeSimulation` constructs **none** of the optional modules, and that each
  optional module still has an explicit CLI/scenario entry point. It is a
  deliberate tripwire: if a future change wires one into the core constructor,
  the probe fails and the ledger and this document must be revisited rather than
  silently inheriting a broader claim.
- **Document boundary** — `tools/verification/verify_release_claim_boundaries.mjs`
  asserts this document exists with its in-scope and out-of-scope sections, lists
  the named out-of-scope modules, and is referenced by the truth ledger.

### Change policy — how a module joins the RC surface

A module moves from §2 to §1 only when **all** of the following hold:

1. It is wired into `RuntimeSimulation` as an explicit **opt-in** service (never
   auto-constructed, never mutating host state);
2. A standalone deterministic verifier proves the opt-in path and the unchanged
   default path;
3. Its ledger row is promoted with bounded evidence;
4. `verify_runtime_wiring.mjs`'s negative tripwire and this document are updated
   in the same change.

Until then it ships as a separate tool, if at all.

---

## 4. What this does not do

- It does not delete or deprecate any module; everything stays in the tree.
- It does not certify the in-scope items beyond their existing ledger rows.
- It does not change the overall release verdict, which remains
  `RELEASE CANDIDATE: PROVISIONAL / NOT CERTIFIED` in
  `docs/RELEASE_CANDIDATE_CERTIFICATION.md`.
