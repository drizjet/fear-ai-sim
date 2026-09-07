---
title: Fear AI Canonical Wire Protocol v1.0.0 Specification
created: 2026-09-06
updated: 2026-09-06
type: specification
status: active
---

# Fear AI Canonical Wire Protocol Specification (v1.0.0)

## 1. Overview & Architectural Invariants

The Fear AI Wire Protocol defines the contract between game engines (Unity, Unreal Engine 5, Godot 4, custom engines) and the headless Fear AI simulation runtime.

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
