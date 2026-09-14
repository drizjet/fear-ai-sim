---
title: Fear AI Canonical Wire Protocol v1.0.0 Specification
created: 2026-09-06
updated: 2026-09-14
type: specification
status: active
---

> Live plug-in wire contract. Product map: `SYSTEM_MAP.md`. Host remains authoritative.

# Fear AI Canonical Wire Protocol Specification (v1.0.0)

## 1. Overview & Architectural Invariants

The Fear AI Wire Protocol is the “any game” layer: Unity, Unreal, Godot, or a custom engine speak the same JSON over loopback. Unreal is a deferred host (adapter kept, not current work). Missing Unreal does not change this contract.

### The Host Game Authority Invariant
1. **The host game engine is authoritative** over:
   - Transforms, positions, velocities, and physics simulation
   - Collision detection, line of sight, and spatial queries
   - Navigation mesh execution and movement steering
   - Damage, health deduction, death, and despawning
   - Animation states and visual rendering
2. **Fear AI is an advisory affective intelligence engine** that computes:
   - Multi-dimensional emotional states (Fear bands, Valence, Arousal, Dominance)
   - Psychological trauma memory and environmental dread
   - Social contagion cascades (panic contagion, screaming, leader calming)
   - Habituation and desensitization curves
   - Semantic action recommendations (`FLEE_FROM`, `SEEK_COVER`, `FREEZE`, etc.)
   - Psychoacoustic audio hints (Heartbeat BPM, Shepard tone, Low-pass filtering)

---

## 2. Transports

1. **WebSocket (`ws://127.0.0.1:8765`)**:
   - Primary transport for 60Hz/120Hz real-time game loops.
   - Low latency ($< 0.5$ ms on loopback).
   - Full-duplex JSON streaming.
2. **HTTP REST (`http://127.0.0.1:8765/api/v1/...`)**:
   - Zero-dependency transport for scripting languages (Python, Lua, REST-only environments).
   - Universal CORS support (`Access-Control-Allow-Origin: *`).

---

## 3. Message Vocabulary

### 3.1 Client $\to$ Server Messages

#### `HANDSHAKE_REQUEST`
```json
{
  "type": "HANDSHAKE_REQUEST",
  "protocol_version": "1.0.0",
  "client_id": "unity_player_instance_1",
  "client_name": "SurvivalHorrorGame",
  "engine": "Unity"
}
```

The response advertises the capability contract (R36): `host_capabilities`
lists every capability string a host may advertise, and
`capability_requirements` maps intent types to the capability they need.
Clients echo a subset back per tick as `capabilities` (see
`BATCH_TICK_REQUEST`). Additive fields: legacy clients ignore them.

#### `REGISTER_AGENT`
Registers an NPC character with customized Big-Five personality traits:
```json
{
  "type": "REGISTER_AGENT",
  "agent_id": "civilian_14",
  "name": "Terrified Scavenger",
  "traits": {
    "neuroticism": 0.85,
    "fear": 0.80,
    "resilience": 0.20,
    "extraversion": 0.60,
    "leadership": 0.10
  },
  "initial_position": { "x": 12.5, "y": 0.0, "z": 4.2 }
}
```

#### `BATCH_TICK_REQUEST`
Dispatches sensory observations across all active agents and requests updated affective states:
```json
{
  "type": "BATCH_TICK_REQUEST",
  "dt": 0.0166,
  "observations": [
    {
      "agent_id": "civilian_14",
      "x": 12.5,
      "y": 0.0,
      "z": 4.2,
      "velocity": { "x": 0.0, "y": 0.0, "z": 0.0 },
      "health": 0.9,
      "energy": 0.8,
      "threats": [
        {
          "id": "creature_alpha",
          "type": "PREDATOR",
          "distance": 8.5,
          "x": 18.0,
          "y": 0.0,
          "z": 4.2,
          "intensity": 0.95,
          "occluded": false
        }
      ],
      "sounds": [
        {
          "id": "distant_groan",
          "type": "SOUND",
          "distance": 22.0,
          "intensity": 0.6
        }
      ]
    }
  ]
}
```

#### Tick capabilities, peers, and outcome reports (R36/R38/R42)

```json
{
  "type": "BATCH_TICK_REQUEST",
  "dt": 0.0166,
  "capabilities": ["supports_dialogue"],
  "observations": [
    {
      "agent_id": "civilian_14",
      "threats": [{ "id": "creature_alpha", "type": "PREDATOR", "distance": 8.5, "intensity": 0.95 }],
      "peers": [{ "id": "civilian_15" }]
    }
  ]
}
```

- `capabilities` (optional): host capability advertisement. Omitted means
  legacy unfiltered output. An explicitly empty array filters every gated
  intent (`SEEK_COVER` needs `supports_cover_points`, `WARN_GROUP` needs
  `supports_dialogue`). Downgraded outputs carry a `capability_downgrade`
  annotation (`original_intent`, `required_capability`, `reason`) and stay
  inside runtime intent vocabulary.
- `peers` (optional): visible peer ids. Enables peer-aware intents
  (`WARN_GROUP`, `APPROACH_ALLY`). Attach-only: legacy observations
  without peers behave exactly as before.
- Outcome reports close the loop: `POST /api/v1/outcome` (or WS
  `INTENT_OUTCOME_REPORT`) with `agent_id`, `intent_type`, `outcome`
  (`GOAL_COMPLETED` | `INTENT_REJECTED` | `EXECUTION_FAILED` |
  `ACTION_INTERRUPTED`) and `reason` (`NO_PATH` | `BLOCKED` |
  `UNSUPPORTED` | `STALE_INTENT` | `HOST_BUSY` | `UNKNOWN`). Three
  consecutive structural failures park the intent (replaced by a safe
  fallback annotated `affordance_downgrade`) until a `GOAL_COMPLETED`
  clears it.

---

### 3.2 Server $\to$ Client Messages

#### `BATCH_TICK_RESPONSE`
Returns updated affective states, semantic action intents, and audio synthesis hints:
```json
{
  "type": "BATCH_TICK_RESPONSE",
  "tick": 342,
  "results": [
    {
      "agent_id": "civilian_14",
      "tick": 342,
      "fear_band": "PANIC",
      "affective_state": {
        "valence": -0.85,
        "arousal": 0.92,
        "dominance": 0.12,
        "raw_fear": 0.88,
        "adrenaline": 0.75,
        "morale": 0.25
      },
      "action_intent": {
        "type": "FLEE_FROM",
        "target_id": "creature_alpha",
        "urgency": 0.95,
        "vector_hint": { "x": -0.98, "y": 0.0, "z": -0.19 },
        "suggested_posture": "SPRINTING"
      },
      "audio_hints": {
        "heartbeat_bpm": 164,
        "shepard_mix": 0.50,
        "lowpass_cutoff_hz": 3400,
        "infrasound_intensity": 0.85,
        "vocalization_hint": "SCREAM"
      },
      "debug_trace": {
        "previous_band": "ANXIOUS",
        "transition_reason": "ENTER_PANIC",
        "panic_locked": true,
        "panic_locked_until": 352
      }
    }
  ]
}
```

---

## 4. Emotional Bands Vocabulary

| Emotional Band | Trigger Condition | Characteristic Behavior |
|---|---|---|
| `CALM` | $Fear < 0.55$ | Idle relaxation, relaxed pacing, curious exploration |
| `ALERT` | $Fear \ge 0.80$ | Sound localization, head-turning, cautious pause |
| `ANXIOUS` | $Fear \ge 1.40$ | Cautious retreat, ally clustering, whimpering |
| `PANIC` | $Fear \ge 3.80$ | Sprinting away from threat, screaming, tunnel vision |
| `PRESENCE_BREAK` | Sustained extreme panic ($> 200$ ticks) | Stupefied freeze, sensory collapse, stunned shock |
| `RECOVER` | Exiting extreme terror ($Fear < 0.2$) | Catching breath, trembling composure regain |
| `AGGRESSIVE` | Anger $> 0.60$ overrides fear | Defensive stand, confronting rivals, intimidation |
| `HIDE` | Panic + skill $> 0.60$ + cover available | Seeking hiding spot, crouching, suppressed breathing |
| `FREEZE` | Panic + low morale ($< 0.40$) | Tonic immobility, gasping, rigid posture |
| `VAULTING` | High panic + low obstacle ahead | Jumping over low obstacles |
| `CRAWLING` | Hiding behind low cover | Prone crawling, low silhouette |
