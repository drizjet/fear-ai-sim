using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace FearAI.Client
{
    public record Vector3D(
        [property: JsonPropertyName("x")] float X = 0f,
        [property: JsonPropertyName("y")] float Y = 0f,
        [property: JsonPropertyName("z")] float Z = 0f
    );

    public class PersonalityTraits
    {
        [JsonPropertyName("fear")] public float Fear { get; set; } = 0.5f;
        [JsonPropertyName("neuroticism")] public float Neuroticism { get; set; } = 0.5f;
        [JsonPropertyName("resilience")] public float Resilience { get; set; } = 0.5f;
        [JsonPropertyName("leadership")] public float Leadership { get; set; } = 0.5f;
        [JsonPropertyName("openness")] public float Openness { get; set; } = 0.5f;
        [JsonPropertyName("conscientiousness")] public float Conscientiousness { get; set; } = 0.5f;
        [JsonPropertyName("extraversion")] public float Extraversion { get; set; } = 0.5f;
        [JsonPropertyName("agreeableness")] public float Agreeableness { get; set; } = 0.5f;
    }

    public class PerceivedThreat
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("type")] public string Type { get; set; } = "PREDATOR";
        [JsonPropertyName("distance")] public float Distance { get; set; }
        [JsonPropertyName("intensity")] public float Intensity { get; set; } = 1.0f;
        [JsonPropertyName("x")] public float? X { get; set; }
        [JsonPropertyName("y")] public float? Y { get; set; }
        [JsonPropertyName("z")] public float? Z { get; set; }
    }

    public class AgentObservation
    {
        [JsonPropertyName("agent_id")] public string AgentId { get; set; } = "";
        [JsonPropertyName("x")] public float X { get; set; }
        [JsonPropertyName("y")] public float Y { get; set; }
        [JsonPropertyName("z")] public float Z { get; set; }
        [JsonPropertyName("health")] public float Health { get; set; } = 1.0f;
        [JsonPropertyName("energy")] public float Energy { get; set; } = 1.0f;
        [JsonPropertyName("threats")] public List<PerceivedThreat> Threats { get; set; } = new();
    }

    public class ActionIntent
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "IDLE_VIGILANT";
        [JsonPropertyName("urgency")] public float Urgency { get; set; }
        [JsonPropertyName("vector_hint")] public Vector3D? VectorHint { get; set; }
        [JsonPropertyName("suggested_posture")] public string? SuggestedPosture { get; set; }
    }

    public class AffectiveState
    {
        [JsonPropertyName("raw_fear")] public float RawFear { get; set; }
        [JsonPropertyName("valence")] public float Valence { get; set; }
        [JsonPropertyName("arousal")] public float Arousal { get; set; }
        [JsonPropertyName("dominance")] public float Dominance { get; set; }
        [JsonPropertyName("adrenaline")] public float Adrenaline { get; set; }
        [JsonPropertyName("morale")] public float Morale { get; set; }
    }

    public class AudioHints
    {
        [JsonPropertyName("heartbeat_bpm")] public int HeartbeatBpm { get; set; } = 60;
        [JsonPropertyName("shepard_tone_mix")] public float ShepardToneMix { get; set; }
        [JsonPropertyName("lowpass_cutoff_hz")] public float LowpassCutoffHz { get; set; } = 20000f;
        [JsonPropertyName("vocalization_cue")] public string? VocalizationCue { get; set; }
    }

    public class AgentTickResult
    {
        [JsonPropertyName("agent_id")] public string AgentId { get; set; } = "";
        [JsonPropertyName("fear_band")] public string FearBand { get; set; } = "CALM";
        [JsonPropertyName("affective_state")] public AffectiveState AffectiveState { get; set; } = new();
        [JsonPropertyName("action_intent")] public ActionIntent ActionIntent { get; set; } = new();
        [JsonPropertyName("audio_hints")] public AudioHints AudioHints { get; set; } = new();
    }

    public class BatchTickResponse
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "BATCH_TICK_RESPONSE";
        [JsonPropertyName("tick")] public int Tick { get; set; }
        [JsonPropertyName("results")] public List<AgentTickResult> Results { get; set; } = new();
    }
}
