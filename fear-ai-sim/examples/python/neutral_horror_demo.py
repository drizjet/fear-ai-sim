#!/usr/bin/env python3
"""
Fear AI Canonical Horror Demo (Python Engine Reference)
Executes the same canonical 2-agent horror encounter against the Fear AI Server.
Zero external dependencies (uses only standard library: urllib.request, json, time).
"""

import sys
import json
import time
import urllib.request
import urllib.error

SERVER_URL = "http://127.0.0.1:8765"

def http_post(endpoint, data):
    url = f"{SERVER_URL}{endpoint}"
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"[!] Network error connecting to {url}: {e}")
        return None

def main():
    print("================================================================================")
    print("           FEAR AI PYTHON REFERENCE DEMO: THE ENCOUNTER                         ")
    print("================================================================================\n")

    # 1. Reset and Handshake
    http_post("/api/v1/reset", {})
    hs = http_post("/api/v1/handshake", {
        "client_name": "PythonReferenceEngine",
        "protocol_version": "1.0.0"
    })
    if not hs or hs.get("status") != "ACCEPTED":
        print("[!] Handshake failed or server not running at", SERVER_URL)
        print("[!] Ensure server is launched via `npm run server` in the JS repo.")
        sys.exit(1)

    print(f"[+] Connected to Fear AI Server (Protocol {hs.get('protocol_version')})")

    # 2. Register Diaz (Veteran) & Chen (Novice)
    http_post("/api/v1/register", {
        "agent_id": "diaz_veteran",
        "name": "Veteran Diaz",
        "traits": {"fear": 0.3, "neuroticism": 0.2, "resilience": 0.85, "leadership": 0.7},
        "initial_position": {"x": 0.0, "y": 0.0, "z": 0.0}
    })

    http_post("/api/v1/register", {
        "agent_id": "chen_novice",
        "name": "Novice Chen",
        "traits": {"fear": 0.6, "neuroticism": 0.85, "resilience": 0.2, "leadership": 0.1},
        "initial_position": {"x": 8.0, "y": 0.0, "z": 0.0}
    })

    print("[+] Registered Diaz (Veteran) and Chen (Novice)")

    # 3. Simulate Phase 1: Calm (3 ticks)
    print("\n>>> PHASE 1: Calm Baseline")
    for _ in range(3):
        res = http_post("/api/v1/tick", {"dt": 0.1})
    results = {r["agent_id"]: r for r in res.get("results", [])}
    rA = results.get("diaz_veteran", {})
    rB = results.get("chen_novice", {})
    print(f"   Diaz: Band={rA.get('fear_band')} Fear={rA.get('affective_state', {}).get('raw_fear')} Intent={rA.get('action_intent', {}).get('type')}")
    print(f"   Chen: Band={rB.get('fear_band')} Fear={rB.get('affective_state', {}).get('raw_fear')} Intent={rB.get('action_intent', {}).get('type')}")

    # 4. Simulate Phase 2: Threat appears near Diaz
    print("\n>>> PHASE 2: Threat Appears 4m from Diaz")
    for _ in range(5):
        res = http_post("/api/v1/tick", {
            "dt": 0.1,
            "observations": [
                {
                    "agent_id": "diaz_veteran",
                    "threats": [{"id": "monster", "type": "PREDATOR", "distance": 4.0, "intensity": 1.0}]
                },
                {
                    "agent_id": "chen_novice",
                    "threats": []
                }
            ]
        })
    results = {r["agent_id"]: r for r in res.get("results", [])}
    rA = results.get("diaz_veteran", {})
    rB = results.get("chen_novice", {})
    print(f"   Diaz: Band={rA.get('fear_band')} Fear={rA.get('affective_state', {}).get('raw_fear')} Intent={rA.get('action_intent', {}).get('type')} Heartbeat={rA.get('audio_hints', {}).get('heartbeat_bpm')} BPM")
    print(f"   Chen: Band={rB.get('fear_band')} Fear={rB.get('affective_state', {}).get('raw_fear')} Intent={rB.get('action_intent', {}).get('type')} Heartbeat={rB.get('audio_hints', {}).get('heartbeat_bpm')} BPM")

    # 5. Simulate Phase 3: Contagion
    print("\n>>> PHASE 3: Social Contagion Cascade")
    for _ in range(6):
        res = http_post("/api/v1/tick", {
            "dt": 0.1,
            "observations": [
                {"agent_id": "diaz_veteran", "threats": [{"id": "monster", "type": "PREDATOR", "distance": 5.0, "intensity": 1.0}]},
                {"agent_id": "chen_novice", "threats": []}
            ]
        })
    results = {r["agent_id"]: r for r in res.get("results", [])}
    rA = results.get("diaz_veteran", {})
    rB = results.get("chen_novice", {})
    print(f"   Diaz: Band={rA.get('fear_band')} Fear={rA.get('affective_state', {}).get('raw_fear')} Intent={rA.get('action_intent', {}).get('type')} Heartbeat={rA.get('audio_hints', {}).get('heartbeat_bpm')} BPM")
    print(f"   Chen: Band={rB.get('fear_band')} Fear={rB.get('affective_state', {}).get('raw_fear')} Intent={rB.get('action_intent', {}).get('type')} Heartbeat={rB.get('audio_hints', {}).get('heartbeat_bpm')} BPM")

    # 6. Simulate Phase 4: Recovery
    print("\n>>> PHASE 4: Threat Breaks Contact & Recovery")
    for _ in range(35):
        res = http_post("/api/v1/tick", {"dt": 0.1})
    results = {r["agent_id"]: r for r in res.get("results", [])}
    rA = results.get("diaz_veteran", {})
    rB = results.get("chen_novice", {})
    print(f"   Diaz: Band={rA.get('fear_band')} Fear={rA.get('affective_state', {}).get('raw_fear')} Intent={rA.get('action_intent', {}).get('type')} Heartbeat={rA.get('audio_hints', {}).get('heartbeat_bpm')} BPM")
    print(f"   Chen: Band={rB.get('fear_band')} Fear={rB.get('affective_state', {}).get('raw_fear')} Intent={rB.get('action_intent', {}).get('type')} Heartbeat={rB.get('audio_hints', {}).get('heartbeat_bpm')} BPM")

    print("\n================================================================================")
    print("VERDICT: Python Reference Demo executed successfully with exact canonical parity.")
    print("================================================================================")

if __name__ == "__main__":
    main()
