#!/usr/bin/env python3
"""
Fear AI Canonical Horror Demo (Python engine reference) — the Python front door.

Two NPCs, one predator reported to only one of them, and fear crossing between
them by contagion alone — driven over the real HTTP control plane against a
running FearServer. Zero external dependencies (standard library only).

Why it is written this way. This file previously printed

    VERDICT: Python Reference Demo executed successfully with exact canonical parity.

unconditionally, next to phase output it never checked, and nothing in the
repository ran it. Its window was also too short for the model: a source needs
~15 consecutive ticks of contact to reach the PANIC class and a further ~20 for a
neighbour to climb off nothing but contagion, while the old phases allowed 11.

Every narrated claim below is now a CHECK, the phase windows are the measured
ones, and the final banner is gated on the failure list with a non-zero exit.

Usage:
    FEAR_AI_URL=http://127.0.0.1:8765 python examples/python/neutral_horror_demo.py
Exit:
    0  every claim held
    1  a claim broke (the narrative no longer holds), printed by name
"""

import json
import os
import sys
import urllib.error
import urllib.request

SERVER_URL = os.environ.get("FEAR_AI_URL", "http://127.0.0.1:8765")
TICK_S = 0.1
THREAT_DISTANCE = 3.0
DIAZ = "diaz_veteran"
CHEN = "chen_novice"

FAILURES = []
CHECKS = {"run": 0, "passed": 0}


def check(label, condition, detail=""):
    """A printed claim that can go red. Every narrative statement is one."""
    CHECKS["run"] += 1
    if condition:
        CHECKS["passed"] += 1
        print(f"   [ok]   {label}")
        return True
    FAILURES.append(f"{label} ({detail})" if detail else label)
    print(f"   [FAIL] {label}{f' — {detail}' if detail else ''}")
    return False


def http_post(endpoint, data):
    url = f"{SERVER_URL}{endpoint}"
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        print(f"[!] Network error connecting to {url}: {exc}")
        return None


def tick(threat_diaz=False):
    """One tick. Chen is NEVER given a threat: any fear he develops is contagion."""
    observations = [
        {
            "agent_id": DIAZ,
            "x": 0.0, "y": 0.0, "z": 0.0,
            "threats": (
                [{"id": "apex_stalker", "type": "PREDATOR",
                  "distance": THREAT_DISTANCE, "intensity": 1.0}]
                if threat_diaz else []
            ),
        },
        {"agent_id": CHEN, "x": 8.0, "y": 0.0, "z": 0.0, "threats": []},
    ]
    res = http_post("/api/v1/tick", {"dt": TICK_S, "observations": observations})
    if res is None:
        print("[!] The server stopped answering mid-run; the demo cannot continue.")
        sys.exit(1)
    return {r["agent_id"]: r for r in res.get("results", [])}


def band(result):
    return result.get("fear_band")


def fear(result):
    return result.get("affective_state", {}).get("raw_fear") or 0.0


def intent(result):
    return result.get("action_intent", {}).get("type")


def show(label, results):
    diaz, chen = results.get(DIAZ, {}), results.get(CHEN, {})
    print(f"   Diaz: Band={band(diaz)} Fear={fear(diaz)} Intent={intent(diaz)} "
          f"Heartbeat={diaz.get('audio_hints', {}).get('heartbeat_bpm')} BPM")
    print(f"   Chen: Band={band(chen)} Fear={fear(chen)} Intent={intent(chen)} "
          f"Heartbeat={chen.get('audio_hints', {}).get('heartbeat_bpm')} BPM")


def main():
    print("=" * 80)
    print("           FEAR AI PYTHON REFERENCE DEMO: THE ENCOUNTER")
    print("=" * 80)
    print(f"Server: {SERVER_URL}")
    print("Diaz: veteran scout (neuroticism 0.20, resilience 0.85) at x=0")
    print("Chen: novice medic  (neuroticism 0.85, resilience 0.20) at x=8")
    print("The predator is only ever reported to Diaz. Chen receives empty threat lists.")
    print()

    http_post("/api/v1/reset", {})
    hs = http_post("/api/v1/handshake", {
        "client_name": "PythonReferenceEngine",
        "protocol_version": "1.0.0",
    })
    if not hs or hs.get("status") != "ACCEPTED":
        print(f"[!] Handshake failed or no server at {SERVER_URL}")
        print("[!] Start one with `npm run server` in the JS repo.")
        sys.exit(1)
    print(f"[+] Connected (protocol {hs.get('protocol_version')})")

    http_post("/api/v1/register", {
        "agent_id": DIAZ, "name": "Veteran Diaz",
        "traits": {"fear": 0.0, "neuroticism": 0.2, "resilience": 0.85, "leadership": 0.7},
        "initial_position": {"x": 0.0, "y": 0.0, "z": 0.0},
    })
    http_post("/api/v1/register", {
        "agent_id": CHEN, "name": "Novice Chen",
        "traits": {"fear": 0.0, "neuroticism": 0.85, "resilience": 0.2, "leadership": 0.1},
        "initial_position": {"x": 8.0, "y": 0.0, "z": 0.0},
    })
    print("[+] Registered both agents\n")

    # ---------------------------------------------------------------- Phase 1
    print(">>> PHASE 1 — Calm baseline (no threats reported to anyone)")
    results = {}
    for _ in range(3):
        results = tick()
    show("Calm patrol", results)
    check("both agents start CALM", band(results.get(DIAZ)) == "CALM" and band(results.get(CHEN)) == "CALM")
    check("both agents are near zero fear", fear(results.get(DIAZ)) < 0.05 and fear(results.get(CHEN)) < 0.05)
    print()

    # ---------------------------------------------------------------- Phase 2
    # 15 consecutive ticks of contact is the first tick at which Diaz is PANIC
    # *while Chen is still 0.000 CALM* — the only moment that isolates "Diaz
    # panicked on his own, Chen has felt nothing yet".
    print(">>> PHASE 2 — The predator is 3 m from Diaz and reported only to him")
    for _ in range(15):
        results = tick(threat_diaz=True)
    show("First PANIC on direct contact", results)
    check("Diaz escalates to PANIC on sustained direct contact",
          band(results.get(DIAZ)) == "PANIC", f"band is {band(results.get(DIAZ))}")
    check("Chen is still CALM — he has been given no threat at all",
          band(results.get(CHEN)) == "CALM", f"band is {band(results.get(CHEN))} at fear {fear(results.get(CHEN))}")
    print()

    # ---------------------------------------------------------------- Phase 3
    print(">>> PHASE 3 — Contact held: fear crosses to Chen by contagion alone")
    for _ in range(22):
        results = tick(threat_diaz=True)
    show("Cascade complete", results)
    check("Chen reaches PANIC with no threat of his own",
          band(results.get(CHEN)) == "PANIC", f"band is {band(results.get(CHEN))} at fear {fear(results.get(CHEN))}")
    check("Chen is being advised to flee", intent(results.get(CHEN)) == "FLEE_FROM",
          f"intent is {intent(results.get(CHEN))}")
    print()

    # ---------------------------------------------------------------- Phase 4
    print(">>> PHASE 4 — Peak: both agents panicking at once")
    for _ in range(4):
        results = tick(threat_diaz=True)
    show("Peak", results)
    check("both agents are simultaneously in PANIC",
          band(results.get(DIAZ)) == "PANIC" and band(results.get(CHEN)) == "PANIC",
          f"Diaz {band(results.get(DIAZ))}, Chen {band(results.get(CHEN))}")
    print()

    # ---------------------------------------------------------------- Phase 5
    print(">>> PHASE 5 — Threat breaks contact: the veteran clears, the novice does not")
    for _ in range(9):
        results = tick()
    show("10 ticks after the threat vanished", results)
    check("the veteran stabilizes quickly", fear(results.get(DIAZ)) < 0.05,
          f"Diaz fear is {fear(results.get(DIAZ))}")
    check("the novice is still panicking", band(results.get(CHEN)) == "PANIC",
          f"band is {band(results.get(CHEN))} at fear {fear(results.get(CHEN))}")
    check("the novice is still being advised to flee", intent(results.get(CHEN)) == "FLEE_FROM",
          f"intent is {intent(results.get(CHEN))}")
    check("the differentiation is large, not a rounding artifact",
          fear(results.get(DIAZ)) + 0.4 < fear(results.get(CHEN)))
    print()

    # ---------------------------------------------------------------- Epilogue
    print(">>> EPILOGUE — Long recovery: both settle, at very different rates")
    for _ in range(7):
        results = tick()
    show("Seventeen ticks after the threat vanished", results)
    check("the veteran is fully calm", band(results.get(DIAZ)) == "CALM",
          f"band is {band(results.get(DIAZ))}")
    check("the novice is still measurably elevated above the veteran",
          fear(results.get(CHEN)) > fear(results.get(DIAZ)) + 0.1)
    print()

    # ---------------------------------------------------------------- Social path
    print(">>> SOCIAL PATH — host-reported relationship events, advisory only")
    abandonment = http_post("/api/v1/social/event", {
        "event": "ABANDONMENT", "actor_id": CHEN, "target_id": DIAZ, "weight": 1.5,
    })
    aid = http_post("/api/v1/social/event", {
        "event": "AID", "actor_id": CHEN, "target_id": DIAZ,
    })
    check("the abandonment is accepted by the server",
          bool(abandonment) and abandonment.get("status") is not None,
          f"response was {abandonment}")
    check("the returned aid is accepted by the server",
          bool(aid) and aid.get("status") is not None, f"response was {aid}")
    print()

    print("=" * 80)
    print(f"CHECKS: {CHECKS['passed']}/{CHECKS['run']} held")
    print("Advisory only: the host engine still owns movement, physics and combat.")
    if FAILURES:
        print()
        print(f"VERDICT: FAILED — the canonical sequence did NOT hold. {len(FAILURES)} claim(s) broke:")
        for failure in FAILURES:
            print(f"  - {failure}")
        print("=" * 80)
        sys.exit(1)
    print("VERDICT: the canonical horror sequence held, every claim above verified at runtime.")
    print("=" * 80)


if __name__ == "__main__":
    main()
