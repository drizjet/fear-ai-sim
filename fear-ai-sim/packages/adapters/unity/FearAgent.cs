using System.Collections.Generic;
using UnityEngine;

namespace FearAI
{
    public class FearAgent : MonoBehaviour
    {
        [Header("Agent Identity & Personality")]
        [SerializeField] private string agentId = "";
        [SerializeField] private PersonalityTraits personality = new PersonalityTraits();

        [Header("Perception Configuration")]
        [SerializeField] private float sightRange = 25.0f;
        [SerializeField] private float sightAngle = 110.0f;
        [SerializeField] private LayerMask threatLayer;
        [SerializeField] private LayerMask obstacleLayer;

        [Header("Peer Detection & Social Awareness (R38)")]
        [SerializeField] private List<string> peerIds = new List<string>();
        public List<string> PeerIds => peerIds;

        [Header("Runtime Affective State (Read-Only)")]
        [SerializeField] private string currentFearBand = "CALM";
        [SerializeField] private float rawFear = 0.0f;
        [SerializeField] private float arousal = 0.0f;
        [SerializeField] private float valence = 0.5f;
        [SerializeField] private string currentIntent = "IDLE_VIGILANT";
        [SerializeField] private float intentUrgency = 0.0f;

        [Header("Advisory Speed Hints (host applies)")]
        [SerializeField] private float panicSpeedMultiplier = 1.6f;
        [SerializeField] private float anxiousSpeedMultiplier = 1.1f;
        [SerializeField] private float calmSpeed = 3.5f;

        private AudioSource heartbeatAudio;
        public Vector3 RecommendedVector { get; private set; } = Vector3.zero;
        public string CurrentIntent => currentIntent;
        public string CurrentFearBand => currentFearBand;
        public float IntentUrgency => intentUrgency;
        public CapabilityDowngrade CurrentCapabilityDowngrade { get; private set; }
        public AffordanceDowngrade CurrentAffordanceDowngrade { get; private set; }

        private void Awake()
        {
            if (string.IsNullOrEmpty(agentId))
            {
                agentId = $"agent_{GetInstanceID()}";
            }
            heartbeatAudio = GetComponent<AudioSource>();
        }

        private void Start()
        {
            FearAIClient.Instance.RegisterAgentCallback(agentId, OnFearStateUpdated);
        }

        private void OnDestroy()
        {
            if (FearAIClient.Instance != null)
            {
                FearAIClient.Instance.UnregisterAgentCallback(agentId);
            }
        }

        private void Update()
        {
            // Gather per-frame sensory observation
            var peersList = new List<VisiblePeer>();
            if (peerIds != null)
            {
                foreach (var pid in peerIds)
                {
                    if (!string.IsNullOrEmpty(pid))
                        peersList.Add(new VisiblePeer { id = pid });
                }
            }

            var observation = new AgentObservation
            {
                agent_id = agentId,
                x = transform.position.x,
                y = transform.position.y,
                z = transform.position.z,
                threats = ScanForThreats(),
                peers = peersList
            };

            FearAIClient.Instance.QueueObservation(observation);
        }

        private List<StimulusObservation> ScanForThreats()
        {
            var threats = new List<StimulusObservation>();
            var colliders = Physics.OverlapSphere(transform.position, sightRange, threatLayer);

            foreach (var col in colliders)
            {
                Vector3 toTarget = col.transform.position - transform.position;
                float dist = toTarget.magnitude;
                float angle = Vector3.Angle(transform.forward, toTarget);

                if (angle < sightAngle * 0.5f)
                {
                    bool occluded = Physics.Raycast(transform.position + Vector3.up, toTarget.normalized, dist, obstacleLayer);

                    threats.Add(new StimulusObservation
                    {
                        id = col.gameObject.name,
                        type = "PREDATOR",
                        distance = dist,
                        x = col.transform.position.x,
                        y = col.transform.position.y,
                        z = col.transform.position.z,
                        intensity = 1.0f,
                        occluded = occluded
                    });
                }
            }

            return threats;
        }

        private void OnFearStateUpdated(AgentStateOutput state)
        {
            currentFearBand = state.fear_band;
            rawFear = state.affective_state.raw_fear;
            arousal = state.affective_state.arousal;
            valence = state.affective_state.valence;

            var intent = state.action_intent;
            currentIntent = intent.type;
            intentUrgency = intent.urgency;
            RecommendedVector = intent.vector_hint.ToUnityVector();
            CurrentCapabilityDowngrade = state.capability_downgrade;
            CurrentAffordanceDowngrade = state.affordance_downgrade;

            // Host game applies NavMesh / character movement from CurrentIntent + RecommendedVector.
            if (heartbeatAudio != null && state.audio_hints != null)
            {
                heartbeatAudio.pitch = Mathf.Clamp(state.audio_hints.heartbeat_bpm / 60.0f, 0.8f, 2.2f);
            }
        }

        public void ReportExecutionOutcome(string outcome, string reason = null, int tick = 0, System.Action<OutcomeReceipt> onReceipt = null)
        {
            FearAIClient.Instance?.ReportOutcome(agentId, currentIntent, outcome, reason, tick, onReceipt);
        }

        public float SuggestedSpeed()
        {
            if (currentFearBand == "PANIC") return calmSpeed * panicSpeedMultiplier;
            if (currentFearBand == "ANXIOUS") return calmSpeed * anxiousSpeedMultiplier;
            return calmSpeed;
        }
    }
}
