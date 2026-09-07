using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using FearAI;

namespace FearAI.Examples
{
    /// <summary>
    /// NeutralHorrorDemoScene - Demonstrates the canonical 2-agent horror scenario in Unity.
    /// Spawns Veteran Diaz and Novice Chen, drives a mock stalker threat, and observes
    /// Fear AI affective transitions, social contagion, and NavMesh fleeing execution.
    /// </summary>
    public class NeutralHorrorDemoScene : MonoBehaviour
    {
        [Header("Fear AI Client Bridge")]
        public FearAIClient fearClient;

        [Header("Agents")]
        public FearAgent veteranDiaz;
        public FearAgent noviceChen;

        [Header("Threat Entity")]
        public Transform stalkerTransform;
        public bool stalkerActive = false;

        private int demoStep = 0;

        private void Start()
        {
            if (fearClient == null)
            {
                fearClient = FindObjectOfType<FearAIClient>();
                if (fearClient == null)
                {
                    GameObject clientGo = new GameObject("FearAI_Client");
                    fearClient = clientGo.AddComponent<FearAIClient>();
                }
            }

            StartCoroutine(RunHorrorEncounterSequence());
        }

        private IEnumerator RunHorrorEncounterSequence()
        {
            Debug.Log("[FearAI Demo] Waiting for Fear AI Server Connection...");
            while (!fearClient.IsConnected)
            {
                yield return new WaitForSeconds(0.2f);
            }
            Debug.Log("[FearAI Demo] Connected! Initializing Agents.");

            // 1. Configure Diaz (Veteran)
            if (veteranDiaz != null)
            {
                veteranDiaz.agentId = "diaz_veteran";
                veteranDiaz.agentName = "Veteran Diaz";
                veteranDiaz.fear = 0.3f;
                veteranDiaz.neuroticism = 0.2f;
                veteranDiaz.resilience = 0.85f;
                veteranDiaz.leadership = 0.7f;
                veteranDiaz.OnIntentChanged.AddListener(OnDiazIntent);
            }

            // 2. Configure Chen (Novice)
            if (noviceChen != null)
            {
                noviceChen.agentId = "chen_novice";
                noviceChen.agentName = "Novice Chen";
                noviceChen.fear = 0.6f;
                noviceChen.neuroticism = 0.85f;
                noviceChen.resilience = 0.2f;
                noviceChen.leadership = 0.1f;
                noviceChen.OnIntentChanged.AddListener(OnChenIntent);
            }

            // PHASE 1: Calm Patrol (3 seconds)
            Debug.Log("[FearAI Demo] Phase 1: Calm Patrol. Both agents calm.");
            stalkerActive = false;
            yield return new WaitForSeconds(3.0f);

            // PHASE 2: Threat Appears 4m from Diaz
            Debug.Log("[FearAI Demo] Phase 2: Apex Stalker appears near Diaz!");
            stalkerActive = true;
            if (stalkerTransform != null && veteranDiaz != null)
            {
                stalkerTransform.position = veteranDiaz.transform.position + new Vector3(4.0f, 0, 0);
            }
            yield return new WaitForSeconds(5.0f);

            // PHASE 3: Contagion (Chen hears Diaz screaming)
            Debug.Log("[FearAI Demo] Phase 3: Social Contagion propagates to Chen.");
            yield return new WaitForSeconds(4.0f);

            // PHASE 4: Threat Breaks Contact & Vanishes
            Debug.Log("[FearAI Demo] Phase 4: Stalker vanishes into shadows. Recovery starts.");
            stalkerActive = false;
            if (stalkerTransform != null)
            {
                stalkerTransform.position = new Vector3(-999, -999, -999);
            }
            yield return new WaitForSeconds(6.0f);

            Debug.Log("[FearAI Demo] Scenario complete. Diaz recovered; Chen stabilizing.");
        }

        private void OnDiazIntent(ActionIntent intent)
        {
            Debug.Log($"[Diaz Intent Callback] {intent.type} (Urgency: {intent.urgency})");
            // Host game maps intent to NavMesh or Animation
            if (intent.type == "FLEE_FROM" && veteranDiaz != null)
            {
                NavMeshAgent nav = veteranDiaz.GetComponent<NavMeshAgent>();
                if (nav != null && nav.isOnNavMesh)
                {
                    Vector3 fleeDir = -veteranDiaz.transform.forward;
                    nav.SetDestination(veteranDiaz.transform.position + fleeDir * 10.0f);
                }
            }
        }

        private void OnChenIntent(ActionIntent intent)
        {
            Debug.Log($"[Chen Intent Callback] {intent.type} (Urgency: {intent.urgency})");
            if (intent.type == "SEEK_COVER" || intent.type == "FLEE_FROM")
            {
                NavMeshAgent nav = noviceChen?.GetComponent<NavMeshAgent>();
                if (nav != null && nav.isOnNavMesh)
                {
                    nav.speed = 5.5f; // Sprint in panic
                }
            }
        }
    }
}
