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

**Host game stays in charge** of movement and combat. Fear AI returns affective state and semantic intents.

### Verification honesty

- Node / Python / C# clients: exercised against the local server
- Godot 4.6: headless execution on this machine (not a shipped Godot game)
- Unity: **not verified** (Editor not installed). Adapter kept for when a Unity host exists.
- Unreal: **deferred, adapter kept.** Plugin source is how an Unreal game would connect. Do not install UE5 unless that host exists. You do not need Unreal to use Unity.

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
