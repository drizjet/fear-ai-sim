# Fear AI (JS tree)

**Product goal:** the best fear AI you can plug into any game.

This repository is **one of three live trees**. Start here: [`docs/SYSTEM_MAP.md`](docs/SYSTEM_MAP.md).

| You want | Use |
|---|---|
| Canonical fear bands / hysteresis / panic lock | Rust `fear.rs` in Pixel Pets (see system map) |
| BEAM server + Rust NIF | `fear-ai-elixir` |
| Local middleware server + engine adapters | **this repo** (`packages/`) |
| 2000-agent horror research sim | this repo’s root JS (`simulation.js`, Electron/Tauri) |

## Middleware (plug-in)

```bash
npm install
npm run server
# http://127.0.0.1:8765/health
# ws://127.0.0.1:8765
```

### Unified CLI

```bash
# Start server, inspect decisions, simulate, benchmark, or verify
npm run cli -- help
npm run cli -- explain --neuroticism 0.8 --distance 12
npm run cli -- explain-faction --factionA HumanKingdom --factionB OrcDominion
npm run cli -- sim --turns 50
npm run cli -- benchmark --entities 1000 --ticks 20
npm run cli -- adversarial
npm run cli -- counterfactual
npm run cli -- verify
```

Adapters live in `packages/adapters/`. Unreal is **kept so Unreal games can connect later**; it is not current work and is not required to use Unity.

### See it work, in one command

```bash
node examples/cli/neutral-horror-demo.mjs
```

Two NPCs, one predator reported to only one of them, and fear crossing between
them by contagion alone — printed tick by tick, with the veteran recovering fast
and the novice still fleeing. It is **self-asserting**: every claim it narrates is
checked, and it exits non-zero naming the claim that broke rather than printing a
success banner over states that contradict it.

**Host game stays in charge** of movement and combat. Fear AI returns affective state and semantic intents.

### Verification honesty

- Node: current standalone probes exercise the local HTTP/WebSocket server and JavaScript middleware/protocol paths; they do not certify an arbitrary game runtime.
- Python / C#: recorded fixture or build evidence exists, but this audit does not treat it as live external-engine adoption or a fresh current client run.
- Godot 4.6: headless execution on this machine (not a shipped Godot game)
- Unity: **partially verified outside the Editor.** The control plane is executed against a live `FearServer` through a shared UnityEngine shim, the 41 EditMode fixtures compile **and run** against that shim, and the lifecycle bodies are driven in Unity's order. No **Unity Editor** has executed them (`npm run verify:unity-editor` reports a skip here), so the row keeps `IMPLEMENTED_NOT_EDITOR_VERIFIED`: when Unity calls the lifecycle, frame scheduling, the player scripting profile and anything rendered remain unverified.
- Unreal: **deferred, adapter kept.** Plugin source is how an Unreal game would connect. Do not install UE5 unless that host exists. You do not need Unreal to use Unity.

For the current release boundary, use `docs/CURRENT_TRUTH_LEDGER.md` and `docs/RELEASE_CANDIDATE_CERTIFICATION.md`. The repository contains additional standalone world-simulation and research modules; their presence or CLI demos does not make them automatic `RuntimeSimulation` services.

## Research sim (not the SDK)

```bash
npm run start-app    # Electron
# or
.\Launch-FearAI.ps1
```

## Docs agents and humans should actually read

1. `docs/SYSTEM_MAP.md` — trees, goal, stale-file list
2. `AGENTS.md` — working rules
3. `docs/CANONICAL_PROTOCOL_V1.md` — wire contract
4. `docs/ENGINE_INTEGRATION_GUIDE.md` — adapter how-to (check gates; launchers in that file were wrong before 2026-09-07)
5. `docs/PROVENANCE.md` — how to label evidence

Do **not** start from `PROJECT_STATUS.md` or `CONTINUE_PROMPT.md`. They describe older sim phases.
