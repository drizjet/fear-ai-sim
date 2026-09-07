#!/usr/bin/env python3
"""
Fear AI Python Conformance V2 Runner
Executes canonical scenario fixtures against FearServer via the Python reference client.
"""

import os
import sys
import json
import argparse
from pathlib import Path

# Add python adapter to sys.path
SCRIPT_DIR = Path(__file__).parent.resolve()
ROOT_DIR = (SCRIPT_DIR / "../..").resolve()
PYTHON_ADAPTER_DIR = (ROOT_DIR / "packages/adapters/python").resolve()
FIXTURES_DIR = (ROOT_DIR / "packages/protocol/fixtures").resolve()

sys.path.insert(0, str(PYTHON_ADAPTER_DIR))
from fear_ai_client import FearAIClient


def load_fixture(fixture_name):
    path = FIXTURES_DIR / fixture_name
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_fixtures(base_url="http://127.0.0.1:8765"):
    print(f"Connecting to Fear AI Server at {base_url}...")
    client = FearAIClient(base_url=base_url)

    try:
        health = client.check_health()
        print(f"[PASS] Health check: status={health.get('status')}, version={health.get('protocol_version')}")
    except Exception as e:
        print(f"[FAIL] Health check failed: {e}")
        return 1

    handshake = client.handshake("PythonConformanceRunner")
    print(f"[PASS] Handshake accepted: status={handshake.get('status')}")

    passed = 0
    total = 0

    # 1. Calm Baseline
    total += 1
    print("\n--- Testing Fixture 1: Calm Baseline Stability (calm.json) ---")
    client.reset_simulation()
    fix = load_fixture("calm.json")
    for ag in fix["agents"]:
        client.register_agent(ag["id"], traits=ag["personality"], initial_position=ag["position"])

    last_res = None
    for t in range(fix["total_ticks"]):
        obs_list = []
        for item in fix["stimuli_timeline"]:
            if item["from_tick"] <= t <= item["to_tick"]:
                for ag_id, o in item["observations"].items():
                    obs_list.append({"agent_id": ag_id, **o})
        res = client.tick(observations=obs_list, dt=fix["dt"])
        results = res.get("results", [])
        for r in results:
            if r["agent_id"] == "agent_calm":
                last_res = r

    assert last_res is not None, "Did not get result for agent_calm"
    assert last_res["fear_band"] == fix["assertions"]["agent_calm"]["fear_band"], f"Expected CALM, got {last_res['fear_band']}"
    assert last_res["affective_state"]["arousal"] < fix["assertions"]["agent_calm"]["arousal_max"]
    assert last_res["action_intent"]["type"] == fix["assertions"]["agent_calm"]["intent_type"]
    print("[PASS] Fixture 1 calm.json verified successfully")
    passed += 1

    # 2. Sudden Threat
    total += 1
    print("\n--- Testing Fixture 2: Immediate Threat Proximity Escalation (sudden-threat.json) ---")
    client.reset_simulation()
    fix = load_fixture("sudden-threat.json")
    for ag in fix["agents"]:
        client.register_agent(ag["id"], traits=ag["personality"], initial_position=ag["position"])

    last_res = None
    for t in range(fix["total_ticks"]):
        obs_list = []
        for item in fix["stimuli_timeline"]:
            if item["from_tick"] <= t <= item["to_tick"]:
                for ag_id, o in item["observations"].items():
                    obs_list.append({"agent_id": ag_id, **o})
        res = client.tick(observations=obs_list, dt=fix["dt"])
        for r in res.get("results", []):
            if r["agent_id"] == "agent_escalate":
                last_res = r

    assert last_res is not None
    assert last_res["fear_band"] == fix["assertions"]["agent_escalate"]["fear_band"]
    assert last_res["action_intent"]["type"] == fix["assertions"]["agent_escalate"]["intent_type"]
    assert last_res["action_intent"]["urgency"] > fix["assertions"]["agent_escalate"]["urgency_min"]
    assert last_res["audio_hints"]["heartbeat_bpm"] > fix["assertions"]["agent_escalate"]["heartbeat_bpm_min"]
    print("[PASS] Fixture 2 sudden-threat.json verified successfully")
    passed += 1

    # 3. Spatial Trauma Zone
    total += 1
    print("\n--- Testing Fixture 7: Spatial Trauma Memory Dread (trauma.json) ---")
    client.reset_simulation()
    fix = load_fixture("trauma.json")
    for tz in fix["trauma_zones"]:
        client.add_trauma_zone(tz["x"], tz["y"], tz.get("z", 0), tz["intensity"], tz["radius"], tz["decay"])
    for ag in fix["agents"]:
        client.register_agent(ag["id"], traits=ag["personality"], initial_position=ag["position"])

    last_res = None
    for t in range(fix["total_ticks"]):
        res = client.tick(observations=[], dt=fix["dt"])
        for r in res.get("results", []):
            if r["agent_id"] == "wanderer":
                last_res = r

    assert last_res is not None
    assert last_res["affective_state"]["raw_fear"] > fix["assertions"]["wanderer"]["fear_min"]
    assert last_res["fear_band"] in fix["assertions"]["wanderer"]["fear_band_options"]
    print("[PASS] Fixture 7 trauma.json verified successfully")
    passed += 1

    # 4. Snapshot Save and Load Restoration
    total += 1
    print("\n--- Testing Fixture 8: Snapshot Save/Load (save-load.json) ---")
    client.reset_simulation()
    fix = load_fixture("save-load.json")
    for ag in fix["agents"]:
        client.register_agent(ag["id"], traits=ag["personality"], initial_position=ag["position"])

    saved_snapshot = None
    for t in range(fix["total_ticks"]):
        obs_list = []
        for item in fix["stimuli_timeline"]:
            if item["from_tick"] <= t <= item["to_tick"]:
                for ag_id, o in item["observations"].items():
                    obs_list.append({"agent_id": ag_id, **o})
        res = client.tick(observations=obs_list, dt=fix["dt"])
        if t == fix["save_at_tick"]:
            saved_snapshot = client.save_snapshot().get("snapshot")

    final_without_reset = [r for r in res.get("results", []) if r["agent_id"] == "surv_01"][0]["affective_state"]["raw_fear"]

    # Restore snapshot and tick from checkpoint
    client.reset_simulation()
    client.load_snapshot(saved_snapshot)
    for t in range(fix["save_at_tick"] + 1, fix["total_ticks"]):
        obs_list = []
        for item in fix["stimuli_timeline"]:
            if item["from_tick"] <= t <= item["to_tick"]:
                for ag_id, o in item["observations"].items():
                    obs_list.append({"agent_id": ag_id, **o})
        res = client.tick(observations=obs_list, dt=fix["dt"])

    final_with_restore = [r for r in res.get("results", []) if r["agent_id"] == "surv_01"][0]["affective_state"]["raw_fear"]
    diff = abs(final_with_restore - final_without_reset)
    assert diff < 0.001, f"State difference after restore exceeded tolerance: {diff}"
    print(f"[PASS] Fixture 8 save-load.json verified successfully (diff = {diff:.6f})")
    passed += 1

    print("\n" + "=" * 60)
    print(f"PYTHON CONFORMANCE SUMMARY: {passed}/{total} FIXTURE TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    sys.exit(run_fixtures(base_url=args.url))
