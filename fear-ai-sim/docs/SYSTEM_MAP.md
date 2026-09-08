---
title: "Fear AI — System Map (read this first)"
created: 2026-09-07
updated: 2026-09-07
type: navigation
status: active
---

# Fear AI — System Map

This is the durable map for humans and agents. It does **not** store volatile test counts or commit hashes.

## Product goal

Build the **best fear AI in the world that plugs into any game**.

Fear AI is **intelligence middleware**. The host game stays authoritative for movement, pathfinding, physics, combat, inventory, animation, spawning, and world geometry. Fear AI returns affect, intents, explanations, and confidence. It must not become a second game engine.

We are **not** making a Fear AI Godot/Unity/Unreal game.

### Engine policy (owner decision, 2026-09-07)

- **“Any game”** means a stable protocol + thin adapters. It does **not** mean you must install every engine *now*.
- **Unity and Unreal are different products.** You do **not** need Unreal to plug into Unity (or the reverse).
- **Unreal is wanted later, not now.** Keep `packages/adapters/unreal/` so an Unreal game *can* connect through the same protocol. Do **not** install UE5, do **not** make Unreal the current workstream, do **not** treat missing UE as blocking today’s work. When an Unreal host exists, use the existing plugin; do not rewrite the core for Unreal.
- **Unity** is the same pattern: keep the UPM adapter; verify only when a Unity host and Editor exist.
- **Godot** is available on this machine as an optional live check, not the product.

## Three live trees (siblings, not one binary)

| Tree | Path | Role | Authority |
|---|---|---|---|
| **Rust fear core** | `C:\tools\03-Projects\lains Tools\New Master Game\pixel-pets\src\engine\ai\fear.rs` | Original hysteresis / panic-lock / `FearSourceBreakdown` model, wired into Pixel Pets | **Canonical fear-band model** (0–5 score, dual thresholds, 10-tick panic lock) |
| **Elixir + Rust NIF** | `C:\tools\03-Projects\lains Tools\lainself\fear-ai-elixir` | BEAM backend, OTP agents, Phoenix, Rustler NIF (`native/fear_ai_nif`) for spatial/forces/diffusion/neural | **Server / scale research.** Not a game plugin. No `mix.lock` in tree → not a reproducible release. |
| **JS sim + middleware** | `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim` | Browser/Electron/Tauri research sim **and** later `@fear-ai/core` + protocol + local server + engine adapters | **Plug-in packaging lane.** Not bit-identical to Rust unless a parity vector says so. |

Vault archive (read-only copies, 2026-08-25): `C:\Text vault\clusters\fear-ai\research-collection\lainself-fear-ai-runtime\`

## What is in this JS repo

- **Research sim (old surface):** `simulation.js`, `brain.js`, `closed-world.js`, Pixi/Electron/Tauri. Useful, not the shippable SDK.
- **Middleware (plug-in surface):** `packages/core`, `packages/protocol`, `packages/runtime`, `packages/adapters/*`
- **Server:** `npm run server` → `packages/runtime/bin/fear-ai-server.js` (loopback `127.0.0.1:8765`)
- **Desktop sim launcher (not the middleware server):** `Launch-FearAI.ps1` / `Launch-FearAI.bat`
- **Tauri Rust (`src-tauri`):** RNG, logging, export. **Not** the fear band model.

## Engine gates (do not upgrade without a real editor run)

| Adapter | Status | Active work? |
|---|---|---|
| Node / Python / C# library | Runnable against the local server | Yes — language clients for the protocol |
| Godot 4.6 | Headless binary on this host. Adapter is advisory (`get_movement_hint()`). | Optional live check only |
| Unity UPM | `IMPLEMENTED_NOT_VERIFIED` — Editor not installed. Adapter is advisory (`RecommendedVector`). | Only if a Unity host is actually wanted |
| Unreal 5 plugin | `DEFERRED_KEEP_ADAPTER` / `IMPLEMENTED_NOT_VERIFIED` | Not now. Keep the plugin so Unreal games can connect later. Do not install UE5 today. |

## Scientific honesty (do not bury)

- Same-scenario persona retrieval can look strong.
- Cross-scenario identity retrieval collapsed; Utility AI beat Fear AI on that metric.
- K=60 raw Fear-vs-Utility advantage is **not** statistically established.
- N/R traits are entangled. O/A weak or unresolved.
- Human evaluation: prepared, **blocked** (no participants).
- “External game integration” so far is **in-repo demos** (`examples/reference-game/`, Outpost Omega), not an unrelated shipped game. Do not treat those as Milestone N complete.

## Source of truth vs stale files

**Trust (durable navigation):**

- this file
- `AGENTS.md` (this repo)
- `docs/PROVENANCE.md` (evidence rules)
- `docs/CANONICAL_PROTOCOL_V1.md` (wire contract)
- live code in the three trees above

**Do not treat as current product status:**

| File | Why |
|---|---|
| `PROJECT_STATUS.md` | Old MASAC / browser-sim scorecard |
| `CONTINUE_PROMPT.md` | Explicitly stale; 462-test world |
| `AUTONOMOUS_HANDOFF.md` | Closed-world empire slice log, not the plug-in mission |
| `FILE_STRUCTURE.md` | FearDataGen only |
| `docs/ARCHITECTURE.md` | 2026-08-26 sim grounding (`63d76f9`) |
| `docs/REMAINING_WORK.md` | Marked historical (24-suite world) |
| `docs/RUST_PARITY.md` (pre-2026-09-07) | Claimed “no Rust fear model exists”; the model lives in Pixel Pets |
| `docs/PART_0_GROUNDING.md`, `docs/PART_1_EXECUTION_PROMPT.md`, `docs/BASELINE.md` | Frozen at commit `63d76f9` / 514 tests |
| `docs/BADAI_MASTER_PLAN.md`, `docs/BADAI_MASTER_SPEC.md`, `docs/mvp-plan.md` | BadAI world-sim plan, not the plug-in SDK |
| `docs/MODULE_AUDIT.md`, `SUBAGENT_REPAIR_PLAYBOOK.md` | Closed-world / sim wiring history |
| `RESEARCH_AUDIT.md` | MASAC literature, not the product |
| Vault `THREE-LANGUAGE-MAP.md` | Useful concepts; paths are vault-relative and JS column is pre-middleware |

If a doc and this map disagree, **this map + live code win**. Re-measure before copying a `VERIFIED` label.
