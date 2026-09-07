using System;
using System.Collections.Generic;
using UnityEngine;

namespace FearAI
{
    [Serializable]
    public enum FearBand
    {
        CALM,
        ALERT,
        ANXIOUS,
        PANIC,
        PRESENCE_BREAK,
        RECOVER,
        AGGRESSIVE,
        HIDE,
        FREEZE,
        VAULTING,
        CRAWLING
    }

    [Serializable]
    public enum ActionIntentType
    {
        IDLE_VIGILANT,
        CAUTIOUS_EXPLORE,
        INVESTIGATE_SOUND,
        FLEE_FROM,
        SEEK_COVER,
        FREEZE,
        CONFRONT_THREAT,
        APPROACH_ALLY,
        WARN_GROUP,
        DESPERATE_FLAIL,
        COLLAPSE_EXHAUSTED,
        RECOVERING
    }

    [Serializable]
    public struct Vector3Hint
    {
        public float x;
        public float y;
        public float z;

        public Vector3 ToUnityVector() => new Vector3(x, y, z);
    }

    [Serializable]
    public class AffectiveState
    {
        public float valence;     // -1 to 1
        public float arousal;     // 0 to 1
        public float dominance;   // 0 to 1
        public float raw_fear;    // 0 to 1
        public float adrenaline;  // 0 to 1
        public float morale;      // 0 to 1
    }

    [Serializable]
    public class ActionIntent
    {
        public string type;
        public string target_id;
        public float urgency;
        public Vector3Hint vector_hint;
        public string suggested_posture;
    }

    [Serializable]
    public class AudioHints
    {
        public int heartbeat_bpm;
        public float shepard_mix;
        public float lowpass_cutoff_hz;
        public float infrasound_intensity;
        public string vocalization_hint;
    }

    [Serializable]
    public class AgentStateOutput
    {
        public string agent_id;
        public int tick;
        public string fear_band;
        public AffectiveState affective_state;
        public ActionIntent action_intent;
        public AudioHints audio_hints;
    }

    [Serializable]
    public class BatchTickResponse
    {
        public string type;
        public int tick;
        public List<AgentStateOutput> results;
    }

    [Serializable]
    public class StimulusObservation
    {
        public string id;
        public string type; // "PREDATOR", "SOUND", "LIGHT_FLICKER", "GORE_OBJECT", "SCREAM"
        public float distance;
        public float x;
        public float y;
        public float z;
        public float intensity = 1.0f;
        public float confidence = 1.0f;
        public bool occluded = false;
    }

    [Serializable]
    public class AgentObservation
    {
        public string agent_id;
        public float x;
        public float y;
        public float z;
        public float health = 1.0f;
        public float energy = 1.0f;
        public bool inSafeHaven = false;
        public bool obstacleAhead = false;
        public bool obstaclePresent = false;
        public List<StimulusObservation> threats = new List<StimulusObservation>();
        public List<StimulusObservation> sounds = new List<StimulusObservation>();
    }

    [Serializable]
    public class PersonalityTraits
    {
        [Range(0f, 1f)] public float openness = 0.5f;
        [Range(0f, 1f)] public float conscientiousness = 0.5f;
        [Range(0f, 1f)] public float extraversion = 0.5f;
        [Range(0f, 1f)] public float agreeableness = 0.5f;
        [Range(0f, 1f)] public float neuroticism = 0.5f;
        [Range(0f, 1f)] public float fear = 0.5f;
        [Range(0f, 1f)] public float curiosity = 0.5f;
        [Range(0f, 1f)] public float leadership = 0.5f;
        [Range(0f, 1f)] public float resilience = 0.5f;
    }
}
