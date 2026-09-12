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

    public class VisiblePeer
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
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
        // R36: opt-in visible peers for peer-aware intents (WARN_GROUP).
        // Null serializes explicitly; the server ignores non-arrays, so
        // null behaves exactly like legacy peerless observations.
        [JsonPropertyName("peers")] public List<VisiblePeer>? Peers { get; set; }
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

    public class CapabilityDowngrade
    {
        [JsonPropertyName("original_intent")] public string? OriginalIntent { get; set; }
        [JsonPropertyName("required_capability")] public string? RequiredCapability { get; set; }
        [JsonPropertyName("reason")] public string? Reason { get; set; }
    }

    public class AffordanceDowngrade
    {
        [JsonPropertyName("original_intent")] public string? OriginalIntent { get; set; }
        [JsonPropertyName("fallback")] public string? Fallback { get; set; }
        [JsonPropertyName("reason")] public string? Reason { get; set; }
    }

    public class AgentTickResult
    {
        [JsonPropertyName("agent_id")] public string AgentId { get; set; } = "";
        [JsonPropertyName("fear_band")] public string FearBand { get; set; } = "CALM";
        [JsonPropertyName("affective_state")] public AffectiveState AffectiveState { get; set; } = new();
        [JsonPropertyName("action_intent")] public ActionIntent ActionIntent { get; set; } = new();
        [JsonPropertyName("audio_hints")] public AudioHints AudioHints { get; set; } = new();
        // R36: present only when the server filtered this output.
        [JsonPropertyName("capability_downgrade")] public CapabilityDowngrade? CapabilityDowngrade { get; set; }
        [JsonPropertyName("affordance_downgrade")] public AffordanceDowngrade? AffordanceDowngrade { get; set; }
    }


    public class BatchTickResponse
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "BATCH_TICK_RESPONSE";
        [JsonPropertyName("tick")] public int Tick { get; set; }
        [JsonPropertyName("results")] public List<AgentTickResult> Results { get; set; } = new();
    }

    public class OutcomeReceipt
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "INTENT_OUTCOME_ACK";
        [JsonPropertyName("status")] public string Status { get; set; } = "";
        [JsonPropertyName("agent_id")] public string? AgentId { get; set; }
        [JsonPropertyName("intent_type")] public string? IntentType { get; set; }
        [JsonPropertyName("outcome")] public string? Outcome { get; set; }
        [JsonPropertyName("reason")] public string? Reason { get; set; }
        [JsonPropertyName("reliability")] public float? Reliability { get; set; }
        [JsonPropertyName("unavailable")] public bool? Unavailable { get; set; }
    }
}
