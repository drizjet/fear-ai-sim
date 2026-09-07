using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace FearAI
{
    [RequireComponent(typeof(NavMeshAgent))]
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

        [Header("Runtime Affective State (Read-Only)")]
        [SerializeField] private string currentFearBand = "CALM";
        [SerializeField] private float rawFear = 0.0f;
        [SerializeField] private float arousal = 0.0f;
        [SerializeField] private float valence = 0.5f;
        [SerializeField] private string currentIntent = "IDLE_VIGILANT";
        [SerializeField] private float intentUrgency = 0.0f;

        [Header("Host Execution Tuning")]
        [SerializeField] private float panicSpeedMultiplier = 1.6f;
        [SerializeField] private float anxiousSpeedMultiplier = 1.1f;
        [SerializeField] private float calmSpeed = 3.5f;

        private NavMeshAgent navAgent;
        private AudioSource heartbeatAudio;

        private void Awake()
        {
            if (string.IsNullOrEmpty(agentId))
            {
                agentId = $"agent_{GetInstanceID()}";
            }
            navAgent = GetComponent<NavMeshAgent>();
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
            var observation = new AgentObservation
            {
                agent_id = agentId,
                x = transform.position.x,
                y = transform.position.y,
                z = transform.position.z,
                threats = ScanForThreats()
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

            // Host game steers NavMesh execution based on recommended intent
            ExecuteIntentOnNavMesh(intent, state.fear_band);

            // Audio synthesis hints
            if (heartbeatAudio != null && state.audio_hints != null)
            {
                heartbeatAudio.pitch = Mathf.Clamp(state.audio_hints.heartbeat_bpm / 60.0f, 0.8f, 2.2f);
            }
        }

        private void ExecuteIntentOnNavMesh(ActionIntent intent, string band)
        {
            if (navAgent == null || !navAgent.isOnNavMesh) return;

            // Scale speed by emotional urgency
            if (band == "PANIC")
            {
                navAgent.speed = calmSpeed * panicSpeedMultiplier;
            }
            else if (band == "ANXIOUS")
            {
                navAgent.speed = calmSpeed * anxiousSpeedMultiplier;
            }
            else
            {
                navAgent.speed = calmSpeed;
            }

            Vector3 vectorHint = intent.vector_hint.ToUnityVector();

            switch (intent.type)
            {
                case "FREEZE":
                    navAgent.isStopped = true;
                    navAgent.velocity = Vector3.zero;
                    break;

                case "FLEE_FROM":
                    navAgent.isStopped = false;
                    Vector3 fleeDest = transform.position + vectorHint.normalized * (10.0f * intent.urgency);
                    navAgent.SetDestination(fleeDest);
                    break;

                case "SEEK_COVER":
                    navAgent.isStopped = false;
                    Vector3 coverDest = transform.position + vectorHint.normalized * 8.0f;
                    navAgent.SetDestination(coverDest);
                    break;

                case "IDLE_VIGILANT":
                    navAgent.isStopped = true;
                    break;

                default:
                    navAgent.isStopped = false;
                    break;
            }
        }
    }
}
