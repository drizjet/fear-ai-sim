#!/usr/bin/env python3
"""
Fear AI Python Reference Client (Zero-Dependency)
Connects to the Fear AI Universal Middleware Server (default http://127.0.0.1:8765).
Demonstrates agent registration, threat perception dispatch, intent consumption,
and panic contagion without third-party packages.
"""

import urllib.request
import urllib.error
import json
import time
import sys

class FearAIClient:
    def __init__(self, base_url="http://127.0.0.1:8765"):
        self.base_url = base_url.rstrip("/")
        self.client_id = f"python_client_{int(time.time())}"

    def _post(self, endpoint, data):
        url = f"{self.base_url}{endpoint}"
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as e:
            raise ConnectionError(f"Failed to connect to Fear AI server at {url}: {e}")

    def _get(self, endpoint):
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as e:
            raise ConnectionError(f"Failed to connect to Fear AI server at {url}: {e}")

    def check_health(self):
        """Check server health and protocol compatibility"""
        return self._get("/health")

    def handshake(self, client_name="PythonGameEngine"):
        """Perform initial protocol handshake"""
        payload = {
            "type": "HANDSHAKE_REQUEST",
            "protocol_version": "1.0.0",
            "client_id": self.client_id,
            "client_name": client_name,
            "engine": "Python"
        }
        return self._post("/api/v1/handshake", payload)

    def register_agent(self, agent_id, name=None, traits=None, initial_position=None):
        """Register an NPC/character with custom personality traits"""
        payload = {
            "type": "REGISTER_AGENT",
            "agent_id": agent_id,
            "name": name or agent_id,
            "traits": traits or {},
            "initial_position": initial_position or {"x": 0, "y": 0, "z": 0}
        }
        return self._post("/api/v1/register", payload)

    def unregister_agent(self, agent_id):
        """Unregister an agent upon despawn or death"""
        payload = {
            "type": "UNREGISTER_AGENT",
            "agent_id": agent_id
        }
        return self._post("/api/v1/unregister", payload)

    def tick(self, observations=None, dt=0.0166):
        """Advance simulation tick with per-agent sensory observations"""
        payload = {
            "type": "BATCH_TICK_REQUEST",
            "dt": dt,
            "observations": observations or []
        }
        return self._post("/api/v1/tick", payload)

    def add_trauma_zone(self, x, y, z=0, intensity=1.0, radius=150, lifetime_ticks=1800):
        """Mark spatial trauma coordinate where a horrific event occurred"""
        payload = {
            "x": x,
            "y": y,
            "z": z,
            "intensity": intensity,
            "radius": radius,
            "lifetimeTicks": lifetime_ticks
        }
        return self._post("/api/v1/trauma", payload)

    def report_social_event(self, event, actor_id, target_id, weight=1.0, witnesses=None, exposed=False, severity=None):
        """Report a host-observed semantic social event (betrayal, aid, ...)"""
        payload = {
            "event": event,
            "actor_id": actor_id,
            "target_id": target_id,
            "weight": weight,
            "witnesses": witnesses or [],
            "exposed": exposed,
            "severity": severity
        }
        return self._post("/api/v1/social/event", payload)

    def set_pacing_override(self, intensity=None):
        """Manually override narrative tension pacing multiplier"""
        payload = {"intensity": intensity}
        return self._post("/api/v1/pacing", payload)

    def reset_simulation(self):
        """Reset simulation state"""
        return self._post("/api/v1/reset", {})

    def save_snapshot(self):
        """Export full simulation snapshot"""
        return self._post("/api/v1/save", {})

    def load_snapshot(self, snapshot):
        """Restore simulation state from snapshot"""
        return self._post("/api/v1/load", {"snapshot": snapshot})


def run_demo():
    print("=" * 65)
    print("   FEAR AI PYTHON REFERENCE INTEGRATION DEMO")
    print("=" * 65)

    client = FearAIClient()

    try:
        health = client.check_health()
        print(f"[+] Server Status: {health.get('status')} | Version: {health.get('protocol_version')}")
    except ConnectionError:
        print("[-] Could not connect to Fear AI Server at 127.0.0.1:8765.")
        print("    Please start the server using:")
        print("    node fear-ai-sim/fear-ai-sim/packages/runtime/bin/fear-ai-server.js")
        sys.exit(1)

    # 1. Handshake
    handshake = client.handshake("SurvivalHorrorDemo")
    print(f"[+] Handshake Accepted: {handshake.get('status')}")

    # 2. Reset clean
    client.reset_simulation()

    # 3. Register Agents
    print("\n[+] Registering Agents:")
    # Alice: Anxious, nervous civilian
    alice_traits = {
        "neuroticism": 0.85,
        "fear": 0.80,
        "resilience": 0.25,
        "extraversion": 0.60
    }
    client.register_agent("alice", name="Survivor Alice", traits=alice_traits, initial_position={"x": 10, "y": 0, "z": 0})
    print("    - Alice: High Neuroticism (0.85), Low Resilience (0.25)")

    # Bob: Calm, resilient squad leader
    bob_traits = {
        "neuroticism": 0.15,
        "fear": 0.20,
        "resilience": 0.90,
        "leadership": 0.95,
        "extraversion": 0.70
    }
    client.register_agent("bob", name="Veteran Bob", traits=bob_traits, initial_position={"x": 12, "y": 0, "z": 0})
    print("    - Bob: High Resilience (0.90), High Leadership (0.95)")

    # 4. Simulation Sequence: Predator Approaches Alice
    print("\n[+] Simulating Threat Escalation Sequence (Monster Approaching Alice):")
    threat_distances = [45, 30, 18, 10, 5, 2]

    for step, dist in enumerate(threat_distances):
        alice_obs = {
            "agent_id": "alice",
            "x": 10, "y": 0, "z": 0,
            "threats": [
                {
                    "id": "creature_1",
                    "type": "PREDATOR",
                    "distance": dist,
                    "x": 10 + dist, "y": 0, "z": 0,
                    "intensity": 0.95
                }
            ]
        }

        # Bob is initially far away (distance 80)
        bob_obs = {
            "agent_id": "bob",
            "x": 90, "y": 0, "z": 0,
            "threats": []
        }

        res = client.tick([alice_obs, bob_obs], dt=0.0166)
        results = {r["agent_id"]: r for r in res.get("results", [])}

        alice_state = results.get("alice", {})
        band = alice_state.get("fear_band")
        intent = alice_state.get("action_intent", {})
        audio = alice_state.get("audio_hints", {})
        affect = alice_state.get("affective_state", {})

        print(f"  Step {step + 1} (Monster dist={dist}m):")
        print(f"    Alice Fear Band:    {band:<12} | Raw Fear: {affect.get('raw_fear'):.2f}")
        print(f"    Alice Action Intent: {intent.get('type')} (urgency: {intent.get('urgency'):.2f}, vector: {intent.get('vector_hint')})")
        print(f"    Audio Synthesis:     Heartbeat: {audio.get('heartbeat_bpm')} BPM | LowPass: {audio.get('lowpass_cutoff_hz')} Hz | Vocal: {audio.get('vocalization_hint')}")

    # 5. Leader Reassurance Demonstration
    print("\n[+] Simulating Leader Reassurance (Bob runs over to Alice's position):")
    for step in range(3):
        alice_obs = {
            "agent_id": "alice",
            "x": 10, "y": 0, "z": 0,
            "threats": [] # Monster retreated
        }
        bob_obs = {
            "agent_id": "bob",
            "x": 11, "y": 0, "z": 0, # Close proximity (1m)
            "threats": []
        }
        res = client.tick([alice_obs, bob_obs], dt=0.0166)
        results = {r["agent_id"]: r for r in res.get("results", [])}
        alice_state = results.get("alice", {})
        print(f"  Recovery Tick {step + 1}: Alice Band: {alice_state.get('fear_band'):<10} | Raw Fear: {alice_state.get('affective_state', {}).get('raw_fear'):.2f} | Intent: {alice_state.get('action_intent', {}).get('type')}")

    print("\n[+] Demo complete! Fear AI successfully drove affective dynamics & behavioral intents.")

if __name__ == "__main__":
    run_demo()
