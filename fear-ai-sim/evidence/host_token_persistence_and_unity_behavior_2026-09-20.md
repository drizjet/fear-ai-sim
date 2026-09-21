# Host Credential Persistence, and Unity Behaviour Running Instead of Compiling — 2026-09-20

**Scope:** two things a HOST has to do that no server-side probe could test — keep
its session credential across its own process restart, and be driven by the real
adapter logic rather than by a human reading it. Engine-level evidence for the
Godot and Unity control-plane clients. **Not** a rendering, host-game, Editor,
performance, or cross-engine-parity claim.

## Why it exists

The token model was verified from Node probes, which always hold the token in
memory. That leaves the actual host obligation untested: write the credential
somewhere that outlives the process, and load it *before* the first claim of the
next run. A host that loses its token is not broken — it adopts its own name once
the previous session is not live — but it comes back as a stranger to its own
crowd, and every claim it makes in that state reports `ADOPTED` instead of
`GRANTED`. No single-process probe can tell those two apart.

Separately, the standing Unity limitation was "verified only statically", which
had been narrowed to "type-checks outside the Editor". Neither answers whether the
adapter's batched control plane actually registers a crowd, notices a refusal,
carries its credential, or persists it.

## Part 1 — Godot, across three engine processes

`tests/godot_project/run_session_persistence.gd` is a phase-driven in-engine
scenario; `tools/verification/verify_host_token_persistence.mjs` runs it three
times in three separate processes, with one store file between them, and also
inspects the artifact and restarts the middleware in between.

| Phase | Setup | What it proves |
| --- | --- | --- |
| 1 | fresh store, live server | the crowd registers in **one** batched request; the server issues a credential; the adapter writes it to disk **at the moment it exists**; the first claim is `GRANTED` |
| 2 | **new process**, same store, same server | the identity is *loaded*, not regenerated; the same crowd comes back `GRANTED` with **zero** adoptions; and a tokenless rival is still refused the live owner's agent and refused a teardown of it |
| 3 | **new process**, same store, server **restarted from a snapshot** | a credential hashed in a *previous server process* still proves continuity (`GRANTED`, 0 adoptions); a tokenless claim on the restored session is `ADOPTED`, because a restored session is unbound and therefore not live; and the reset gate refuses an honest host a wipe that would destroy another live session's agent, then allows it once nothing live is in the way |

`9 / 13 / 12` in-engine checks plus 19 probe-level assertions, including on the
artifact itself: the store exists, holds the session NAME and a 64-hex credential,
and the server's own `/api/v1/sessions` listing **never contains that credential**.

Phase 3 is ordered deliberately and that ordering was learned by failing: the
rival has to run *before* the returning host claims anything. Once the token
holder claims, its session is live again and a tokenless rival is correctly
refused instead of adopting — so the first version of this phase asserted the
opposite of the truth and caught itself.

## Part 2 — Unity, executed against a live server

| Piece | Shape |
| --- | --- |
| `tools/verification/unity/UnityEngineShim.cs` | backs the UnityEngine surface with **real behaviour**: `UnityWebRequest` over `HttpClient`, a field-based `JsonUtility`, real file and PlayerPrefs storage, and a coroutine runner |
| `tools/verification/unity/UnityBehaviorHarness.cs` | drives the real adapter through its public API plus reflection, and **fails loudly** if a field or method it depends on is renamed |
| `tools/verification/verify_unity_adapter_behavior.mjs` | builds those against `FearAIClient.cs`, `FearTypes.cs` and `FearSessionStore.cs` **unmodified**, then runs two phases in two OS processes against a live FearServer |
| `Runtime/FearSessionStore.cs` | `ISessionStore` with `InMemorySessionStore` (the default), `FileSessionStore` and `PlayerPrefsSessionStore` |

Phase 1 (`15` harness checks): the crowd goes out as one batched request, the
claim is `GRANTED`, the credential is written to a real file, a tokenless rival is
refused a claim **and** refused a teardown of the owner's agent, and the owner's
own teardown and trauma authoring are *not* refused. Phase 2 (`7`): a new process
loads that file and is `GRANTED` with zero refusals — an assertion that only means
something because phase 1's session is still **live** on the server, so a
name-only claim would have been refused.

The probe also asserts server-side truth: the Unity host is credited with its
crowd, is seen as able to prove continuity, claim and teardown refusals are
counted in **separate** server tallies, and the stored credential never appears in
the ownership listing.

The old compile check's stub set was replaced with this same shim, because the
stub was actively misleading: `JsonUtility.FromJson<T>` returned
`Activator.CreateInstance<T>()` and `responseCode` was hardcoded to `200`, so
every control-plane path read as a success and a compile pass proved nothing about
behaviour.

## What is still not proven

* **MonoBehaviour lifecycle.** The harness invokes `Awake` by reflection. Whether
  the engine calls it at the expected time remains an **Editor-only** question,
  and no in-Editor run has been performed.
* **Frame scheduling.** The shim runs coroutines to completion synchronously;
  Unity resumes them on a later frame. Sequencing *within* one control-plane pump
  is exercised, timing across frames is not.
* **API fidelity.** The shim is an implementation, not Unity. A shim-vs-real
  signature mismatch would compile and pass here and fail in the Editor.
* **The non-control-plane Unity files.** `FearAgent.cs` and `FearAgentHUD.cs`
  (NavMesh, Physics, GUI, Texture2D) are not compiled or run by either probe.
* **Godot persistence is opt-in and off by default.** The store holds a bearer
  credential in plaintext; a host with nowhere safe to put it should leave the
  default alone and recover by adopting its own name.
* **Unreal and the other engines have no equivalent run.** Nothing here
  generalizes to a universal multi-engine claim.

## Reproduce

```
node tools/verification/verify_host_token_persistence.mjs   # Godot, 3 processes
node tools/verification/verify_unity_adapter_behavior.mjs    # Unity, 2 processes
npm run godot:evidence                                       # 4/4 in-engine suites
node tools/verification/verify_godot_live_pipeline.mjs       # 128 source tripwires
node tools/verification/verify_dotnet_adapters_compile.mjs   # compiles vs the same shim
```
