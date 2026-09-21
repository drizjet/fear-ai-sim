#!/usr/bin/env python3
"""
Fear AI Python Reference Client (Zero-Dependency)
Connects to the Fear AI Universal Middleware Server (default http://127.0.0.1:8765).
Demonstrates agent registration, threat perception dispatch, intent consumption,
and panic contagion without third-party packages.

CONTROL PLANE PARITY
--------------------
This client carries the same control-plane contract as the Godot reference
client, because a host that cannot register a crowd cheaply or be recognised on
reconnect is a second-class citizen of the middleware:

  * SESSION IDENTITY. `session_id` names the host's crowd; `session_token` is
    server-issued and proves continuity. The token is returned exactly once,
    when the session is established, and a host that PERSISTS it is recognised
    unconditionally on reconnect - even after the middleware itself restarted.
    A host that loses its token can still adopt its own name once the incumbent
    is not live. A host that merely knows someone else's live name is refused.
  * BATCHED CONTROL. `register_agents`, `unregister_agents` and
    `add_trauma_zones` each cost ONE round trip per call, not one per item.
  * LEGACY FALLBACK. A 404 on a batch route means the server predates batching,
    so the client degrades to the singular routes for the rest of the session
    instead of retrying an endpoint that is not there.
  * NOTHING IS SILENTLY DROPPED. A refused claim (409), an unregister the server
    declined, or a malformed entry is COUNTED and reported, because partial
    application that looks like complete application is the failure mode a host
    cannot debug.
"""

import base64
import hashlib
import os
import urllib.request
import urllib.error
import json
import time
import sys

# Mirrors MAX_BATCH_CONTROL_ITEMS on the server. Used to split oversized calls
# rather than letting the server reject the whole request.
BATCH_LIMIT = 512

# The canonical signing input's version tag. Must match RequestSigning.js.
SIGNING_VERSION = "FEAR-AI-SIGN-V1"


class FearAIClient:
    def __init__(self, base_url="http://127.0.0.1:8765", session_id=None, claim="join"):
        self.base_url = base_url.rstrip("/")
        # A host-chosen NAME. It survives a host process restart, but it is not a
        # credential: anyone can write down a name they saw.
        self.session_id = session_id or f"python_client_{int(time.time())}"
        # The CREDENTIAL. Server-issued; persist this if the host should be
        # recognised rather than merely re-adopt its own name.
        self.session_token = None
        self.claim = claim

        # Counters a host can log. Zero here does NOT mean "nothing happened" for
        # the batch counters - it can also mean the legacy fallback was used, so
        # `batch_unsupported` is tracked separately.
        self.batched_registration_requests = 0
        self.individual_registration_requests = 0
        self.register_agents_requests = 0
        self.batched_unregistration_requests = 0
        self.batched_trauma_requests = 0
        self.refused_claims = 0
        self.registration_failures = 0
        self.unregistration_rejections = 0
        # Ids the server REFUSED to remove because a live session owned them.
        # Distinct from `unregistration_rejections` (malformed entries): nothing
        # was wrong with the request, this host simply may not retire another
        # session's agents, and it needs to know that rather than assume success.
        self.unregistration_refusals = 0
        self.trauma_zones_rejected = 0
        self.session_token_issued = False
        # Set once a 404 proves the server predates the batch control routes.
        self.batch_unsupported = False

        # Request signing. A token is a BEARER credential: whoever holds the
        # string can act as this host. Signing replaces that with proof of a
        # private key, which never leaves this process; the server stores only
        # the public half, so a token lifted from a log or a file is no longer
        # sufficient on its own. Off by default, and nothing changes for a host
        # that leaves it alone.
        self.signing_enabled = False
        self.signing_private_key = None
        self.signing_public_key_pem = ""
        self.signing_key_id = ""
        # Whether the SERVER has confirmed the key. Until it has, every claim
        # carries the public key (which is what registers it); after that there
        # is no reason to send 450 bytes of PEM on every request.
        self.signing_key_registered = False
        self.signing_requests_signed = 0
        self.signing_refusals = 0
        self.signing_refusal_reason = ""
        self.signing_error = ""

    # ------------------------------------------------------------------
    # Transport
    # ------------------------------------------------------------------

    @staticmethod
    def _parse(raw):
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except ValueError:
            return {}

    def _request(self, method, endpoint, data=None):
        """Return `(status_code, parsed_body)`.

        An HTTP error status is a NORMAL result here, not an exception: 404 means
        "this server predates this route" and 409 means "refused", and both are
        decisions the caller has to make. Only a transport failure raises.
        """
        url = f"{self.base_url}{endpoint}"
        payload = None if data is None else json.dumps(data).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        headers.update(self._signature_headers(method, endpoint, payload))
        req = urllib.request.Request(url, data=payload, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, self._parse(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = self._parse(e.read().decode("utf-8", "replace"))
            if e.code == 401 and str(body.get("code", "")).startswith("SIGNATURE"):
                self._handle_signature_refusal(body)
            return e.code, body
        except urllib.error.URLError as e:
            raise ConnectionError(f"Failed to connect to Fear AI server at {url}: {e}")

    # ------------------------------------------------------------------
    # Request signing (RS256)
    # ------------------------------------------------------------------

    def enable_signing(self, key_path=None):
        """Turn on request signing, generating a keypair if there is not one.

        `key_path` persists the private key as a PKCS#8 PEM so a restarted host
        is still able to PROVE itself rather than only name itself. The file is
        a private key: treat it as the credential it is.
        """
        self.signing_enabled = True
        if key_path:
            self.load_signing_key(key_path)
        if self.signing_private_key is None:
            self.generate_signing_key(key_path)
        return self.signing_private_key is not None

    def generate_signing_key(self, key_path=None):
        """Generate an RSA-2048 keypair. Needs the `cryptography` package."""
        try:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.primitives.asymmetric import rsa
        except ImportError:
            self.signing_error = "request signing needs the 'cryptography' package"
            return False
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.signing_private_key = private_key
        self._set_public_pem(
            private_key.public_key().public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            ).decode("ascii")
        )
        if key_path:
            self.save_signing_key(key_path)
        return True

    def _set_public_pem(self, pem):
        """Derive the key id from the SPKI DER, the same way the server does."""
        try:
            from cryptography.hazmat.primitives import serialization
        except ImportError:
            self.signing_error = "request signing needs the 'cryptography' package"
            return
        der = serialization.load_pem_public_key(pem.encode("ascii")).public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.signing_public_key_pem = pem
        self.signing_key_id = hashlib.sha256(der).hexdigest()[:16]

    def save_signing_key(self, key_path):
        from cryptography.hazmat.primitives import serialization
        pem = self.signing_private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        with open(key_path, "wb") as handle:
            handle.write(pem)
        return True

    def load_signing_key(self, key_path):
        """Load a private key. A key that will not load is reported, not fatal."""
        from cryptography.hazmat.primitives import serialization
        try:
            with open(key_path, "rb") as handle:
                raw = handle.read()
        except OSError:
            return False
        try:
            private_key = serialization.load_pem_private_key(raw, password=None)
        except (ValueError, TypeError) as exc:
            self.signing_error = f"stored signing key could not be loaded: {exc}"
            return False
        self.signing_private_key = private_key
        self._set_public_pem(
            private_key.public_key().public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            ).decode("ascii")
        )
        return True

    @staticmethod
    def _sha256_hex(data):
        return hashlib.sha256(data if data is not None else b"").hexdigest()

    def _canonical_http(self, method, target, issued_at, nonce, body_bytes):
        """The exact bytes RequestSigning.js verifies.

        `issued_at` MUST be an integer. Python renders it correctly here, but the
        same trap bit the Godot client (its JSON parser returns floats, so a
        timestamp read back out of JSON becomes "1758400000000.0") - see
        RequestSigning.js.
        """
        return "\n".join([
            SIGNING_VERSION,
            "HTTP",
            method.upper(),
            target,
            self._sha256_hex(body_bytes),
            self.session_id,
            str(int(issued_at)),
            str(nonce),
            "",
        ])

    def _signature_headers(self, method, endpoint, body_bytes):
        """Sign one request, or return nothing when signing is not in play.

        Signing starts only once the server has CONFIRMED the key. Signing the
        first claim would be refused as an unknown key (no session exists yet for
        it to belong to) - and that first claim is the one carrying the public
        key, so refusing it would leave this host unable to ever establish one.
        """
        if not self.signing_enabled or self.signing_private_key is None:
            return {}
        if not self.signing_key_registered or not self.session_id:
            return {}
        try:
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.asymmetric import padding
        except ImportError:
            self.signing_error = "request signing needs the 'cryptography' package"
            return {}
        issued_at = int(time.time() * 1000)
        # A real random nonce. Deriving it from the clock would repeat whenever two
        # requests land in the same millisecond, and the server would correctly
        # refuse the second one as a replay.
        nonce = os.urandom(16).hex()
        canonical = self._canonical_http(method, endpoint, issued_at, nonce, body_bytes)
        signature = self.signing_private_key.sign(
            canonical.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256()
        )
        self.signing_requests_signed += 1
        headers = {
            "x-fear-signature-session": self.session_id,
            "x-fear-signature-issued-at": str(issued_at),
            "x-fear-signature-nonce": nonce,
            "x-fear-signature": base64.b64encode(signature).decode("ascii"),
            "x-fear-signature-algorithm": "RS256",
        }
        if self.signing_key_id:
            headers["x-fear-signature-key-id"] = self.signing_key_id
        return headers

    def _handle_signature_refusal(self, body):
        """A signature refusal tells us the server holds a key for this session.

        That is the recovery path for the worst case: the request that registered
        the key succeeded and its response was lost, leaving this host believing
        it has no key while the server refuses everything it says.
        """
        self.signing_refusals += 1
        self.signing_refusal_reason = str(body.get("code", ""))
        self.signing_key_registered = True

    def _post(self, endpoint, data):
        """POST and raise on a non-2xx status (for the simple call sites)."""
        status, body = self._request("POST", endpoint, data)
        if status >= 400:
            raise ConnectionError(f"POST {endpoint} failed with status {status}: {body}")
        return body

    def _get(self, endpoint):
        status, body = self._request("GET", endpoint)
        if status >= 400:
            raise ConnectionError(f"GET {endpoint} failed with status {status}: {body}")
        return body

    # ------------------------------------------------------------------
    # Session identity
    # ------------------------------------------------------------------

    def _claim_fields(self):
        """Identity fields attached to every claim.

        The claim travels with each registration so the server can attribute
        ownership; without it the host has no identity and cannot be recognised
        on reconnect, which is the whole point of the session.
        """
        fields = {"session_id": self.session_id, "claim": self.claim}
        if self.session_token:
            fields["session_token"] = self.session_token
        # Offered with the claim, because a claim is the moment the server has a
        # session for the key to belong to. Sent only until it is confirmed.
        if self.signing_enabled and not self.signing_key_registered and self.signing_public_key_pem:
            fields["signing_public_key"] = self.signing_public_key_pem
        return fields

    def _adopt_session_token(self, body):
        """Store a token the server just issued. Returns True when adopted."""
        if not isinstance(body, dict):
            return False
        # Handled first: a response that replaced an already-known key carries no
        # new token at all, so the token path below would never reach it.
        key_report = body.get("signing_key")
        if isinstance(key_report, dict):
            outcome = str(key_report.get("outcome", ""))
            if outcome.endswith("REGISTERED") or outcome.endswith("REPLACED"):
                self.signing_key_registered = True
            elif outcome.startswith("SIGNING_KEY_REFUSED"):
                self.signing_refusals += 1
                self.signing_error = outcome
        token = body.get("session_token")
        if not isinstance(token, str) or not token:
            return False
        self.session_token = token
        self.session_token_issued = True
        return True

    def session_ownership(self):
        """Read-only ownership summary (GET /api/v1/sessions).

        Lets a host CONFIRM it owns what it thinks it owns instead of assuming
        it. No token material is returned by the server, so this is safe to log.
        """
        return self._get("/api/v1/sessions")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def check_health(self):
        """Check server health and protocol compatibility"""
        return self._get("/health")

    def handshake(self, client_name="PythonGameEngine"):
        """Perform initial protocol handshake.

        Naming the session here binds this client's identity immediately, so the
        server sees the host as live from the first message rather than only
        once it registers an agent. The token, when present, is what lets the
        server bind on PROOF rather than on a name.
        """
        payload = {
            "type": "HANDSHAKE_REQUEST",
            "protocol_version": "1.0.0",
            "client_id": self.session_id,
            "client_name": client_name,
            "session_id": self.session_id,
            "engine": "Python"
        }
        if self.session_token:
            payload["session_token"] = self.session_token
        body = self._post("/api/v1/handshake", payload)
        self._adopt_session_token(body)
        return body

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register_agent(self, agent_id, name=None, traits=None, initial_position=None):
        """Register one NPC/character with custom personality traits.

        Returns the response body; raises on a transport failure. A 409 means a
        LIVE session owns this agent and nothing was mutated - see
        `refused_claims`, which this method increments, rather than retrying.
        """
        payload = {
            "type": "REGISTER_AGENT",
            "agent_id": agent_id,
            "name": name or agent_id,
            "traits": traits or {},
            "initial_position": initial_position or {"x": 0, "y": 0, "z": 0}
        }
        payload.update(self._claim_fields())
        status, body = self._request("POST", "/api/v1/register", payload)
        if status == 409:
            # Refused, not failed: the caller learns the owner instead of
            # discovering silence later.
            self.refused_claims += 1
            return body
        if status >= 400:
            self.registration_failures += 1
            raise ConnectionError(f"register_agent({agent_id}) failed with status {status}: {body}")
        self.individual_registration_requests += 1
        self._adopt_session_token(body)
        return body

    @staticmethod
    def _registration_entry(agent):
        if isinstance(agent, str):
            return {"agent_id": agent, "name": agent, "traits": {}, "initial_position": {"x": 0, "y": 0, "z": 0}}
        entry = dict(agent)
        entry.setdefault("name", entry.get("agent_id"))
        entry.setdefault("traits", {})
        entry.setdefault("initial_position", {"x": 0, "y": 0, "z": 0})
        return entry

    def register_agents(self, agents):
        """Register many agents in ONE HTTP round trip.

        `agents` is a list of dicts (`{"agent_id": ..., "traits": {...}}`) or
        plain ids. Returns a dict shaped like the batch response:
        `{"registered": [...], "refused": [...], "count": n, "session_id": ..., ...}`.

        Falls back to per-agent registration when the server predates the batch
        route, and re-attempts individual registration for entries the server
        neither confirmed nor refused - an unconfirmed agent reads to the host
        as "the middleware returned nothing", so it is retried rather than
        assumed present.
        """
        entries = [self._registration_entry(a) for a in agents]
        if not entries:
            return {"registered": [], "refused": [], "count": 0, "session_id": self.session_id}

        if not self.batch_unsupported:
            payload = {"agents": entries[:BATCH_LIMIT]}
            payload.update(self._claim_fields())
            status, body = self._request("POST", "/api/v1/register/batch", payload)
            if status == 404:
                # The server predates batching. Degrade for the rest of the
                # session rather than retrying an endpoint that is not there.
                self.batch_unsupported = True
            elif status == 200 and isinstance(body, dict):
                self.batched_registration_requests += 1
                self._adopt_session_token(body)
                refused = body.get("refused") or []
                registered = set(body.get("registered") or [])
                self.refused_claims += len(refused)
                sent_ids = [str(e.get("agent_id")) for e in entries[:BATCH_LIMIT]]
                unconfirmed = [
                    e for e in entries[:BATCH_LIMIT]
                    if str(e.get("agent_id")) not in registered
                    and str(e.get("agent_id")) not in {str(r.get("agent_id")) for r in refused if isinstance(r, dict)}
                ]
                # Entries past the cap were never sent, and unconfirmed entries
                # were not acknowledged: both go down the individual path.
                tail = entries[BATCH_LIMIT:]
                for entry in unconfirmed + tail:
                    result = self._register_individually(entry)
                    if result.get("status") == "REGISTERED":
                        registered.add(str(entry.get("agent_id")))
                body["registered"] = [i for i in sent_ids if i in registered]
                body["count"] = len(body["registered"])
                return body

        registered, refused = [], []
        for entry in entries:
            result = self._register_individually(entry)
            if result.get("status") == "REGISTERED":
                registered.append(str(entry.get("agent_id")))
            else:
                refused.append({"agent_id": entry.get("agent_id"), "reason": result.get("code", "REFUSED")})
        return {
            "status": "REGISTERED" if registered else "REFUSED",
            "count": len(registered),
            "registered": registered,
            "refused": refused,
            "session_id": self.session_id,
            "session_token": self.session_token
        }

    def _register_individually(self, entry):
        """One singular registration. Used by the legacy fallback and for the
        tail the batch route could not accommodate."""
        payload = dict(entry)
        payload["type"] = "REGISTER_AGENT"
        payload.update(self._claim_fields())
        status, body = self._request("POST", "/api/v1/register", payload)
        self.individual_registration_requests += 1
        if status == 200:
            self._adopt_session_token(body)
            return body
        if status == 409:
            self.refused_claims += 1
        else:
            self.registration_failures += 1
        return body if isinstance(body, dict) else {"status": "FAILED"}

    # ------------------------------------------------------------------
    # Teardown
    # ------------------------------------------------------------------

    def unregister_agent(self, agent_id):
        """Unregister an agent upon despawn or death"""
        payload = {"type": "UNREGISTER_AGENT", "agent_id": agent_id}
        payload.update(self._claim_fields())
        return self._post("/api/v1/unregister", payload)

    def unregister_agents(self, agent_ids):
        """Retire many agents in ONE round trip.

        `NOT_FOUND` is terminal and not an error: the caller asked for the agent
        to be gone and it is gone. Only `rejected` entries were NOT removed, and
        they are counted and reported rather than dropped, because a host that
        believes an agent is gone while the middleware still holds it is a host
        that cannot debug what happens next.
        """
        ids = [str(a) for a in agent_ids]
        if not ids:
            return {"unregistered": [], "not_found": [], "rejected": [], "count": 0}

        if not self.batch_unsupported:
            # Teardown is ownership-gated on the server, so the CREDENTIAL travels
            # with it: a request carrying only the session NAME is refused as a
            # stranger's, which would leave a host unable to retire its own crowd.
            status, body = self._request("POST", "/api/v1/unregister/batch", {
                "agent_ids": ids[:BATCH_LIMIT],
                **self._claim_fields()
            })
            if status == 404:
                self.batch_unsupported = True
            elif status == 200 and isinstance(body, dict):
                self.batched_unregistration_requests += 1
                rejected = body.get("rejected") or []
                self.unregistration_rejections += len(rejected)
                refused = body.get("refused") or []
                self.unregistration_refusals += len(refused)
                return body

        unregistered, not_found = [], []
        for agent_id in ids:
            result = self.unregister_agent(agent_id)
            if result.get("status") == "UNREGISTERED":
                unregistered.append(agent_id)
            else:
                not_found.append(agent_id)
        return {
            "status": "UNREGISTERED",
            "count": len(unregistered),
            "unregistered": unregistered,
            "not_found": not_found,
            "rejected": []
        }

    # ------------------------------------------------------------------
    # Trauma authoring
    # ------------------------------------------------------------------

    def add_trauma_zone(self, x, y, z=0, intensity=1.0, radius=150, lifetime_ticks=1800):
        """Mark spatial trauma coordinate where a horrific event occurred.

        The middleware owns the dread memory; the host owns where and how strong
        the shock was.
        """
        payload = {
            "x": x,
            "y": y,
            "z": z,
            "intensity": intensity,
            "radius": radius,
            "lifetimeTicks": lifetime_ticks
        }
        return self._post("/api/v1/trauma", payload)

    def add_trauma_zones(self, zones):
        """Author many trauma zones in ONE round trip.

        Zones are world state, so partial application is a normal outcome: only
        entries the server explicitly rejected are dropped, and they are counted
        rather than retried, because a malformed zone will be malformed again.
        """
        if not zones:
            return {"count": 0, "rejected": []}
        if not self.batch_unsupported:
            status, body = self._request("POST", "/api/v1/trauma/batch", {"zones": list(zones)[:BATCH_LIMIT]})
            if status == 404:
                self.batch_unsupported = True
            elif status == 200 and isinstance(body, dict):
                self.batched_trauma_requests += 1
                self.trauma_zones_rejected += len(body.get("rejected") or [])
                return body

        applied, rejected = 0, []
        for zone in list(zones)[:BATCH_LIMIT]:
            try:
                self.add_trauma_zone(
                    zone.get("x", 0), zone.get("y", 0), zone.get("z", 0),
                    zone.get("intensity", 1.0), zone.get("radius", 150),
                    zone.get("lifetimeTicks", 1800)
                )
                applied += 1
            except ConnectionError:
                rejected.append(zone)
        self.trauma_zones_rejected += len(rejected)
        return {"status": "ADDED", "count": applied, "rejected": rejected}

    # ------------------------------------------------------------------
    # Data plane
    # ------------------------------------------------------------------

    def tick(self, observations=None, dt=0.0166, capabilities=None):
        """Advance simulation tick with per-agent sensory observations.

        capabilities: optional host capability advertisement (R36). A list
        (or capability->bool map) such as ["supports_dialogue"]. When
        omitted, tick output is unfiltered legacy. An explicitly empty
        list filters every gated intent. Observations may include
        "peers": [{"id": ...}] for peer-aware intents (WARN_GROUP).
        """
        payload = {
            "type": "BATCH_TICK_REQUEST",
            "dt": dt,
            "observations": observations or []
        }
        if capabilities is not None:
            payload["capabilities"] = capabilities
        return self._post("/api/v1/tick", payload)

    def report_outcome(self, agent_id, intent_type, outcome, reason=None, tick=0):
        """Report what the host actually did with an advised intent (R36).

        outcome is one of GOAL_COMPLETED, INTENT_REJECTED, EXECUTION_FAILED,
        ACTION_INTERRUPTED; reason is one of NO_PATH, BLOCKED, UNSUPPORTED,
        STALE_INTENT, HOST_BUSY, UNKNOWN. Structural failures park the
        intent for future ticks until a GOAL_COMPLETED clears it.
        """
        payload = {
            "agent_id": agent_id,
            "intent_type": intent_type,
            "outcome": outcome,
            "tick": tick
        }
        if reason is not None:
            payload["reason"] = reason
        return self._post("/api/v1/outcome", payload)

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

    def reset_simulation(self, clear_agents=True):
        """Reset simulation state.

        Ownership is a SERVER-level fact, so `clear_agents=True` also retires the
        session's claims on the server. The client keeps its token: the identity
        is still valid, only its agents are gone.
        """
        return self._post("/api/v1/reset", {"clear_agents": clear_agents})

    def save_snapshot(self):
        """Export full simulation snapshot (server-level session ownership included)"""
        return self._post("/api/v1/save", {})

    def load_snapshot(self, snapshot):
        """Restore simulation state from snapshot.

        Restored sessions come back UNBOUND: a host that kept its token is
        recognised, and a host that lost it adopts its own name once the
        incumbent is not live. A restored session never blocks its own host.
        """
        return self._post("/api/v1/load", {"snapshot": snapshot})


def run_demo():
    print("=" * 65)
    print("   FEAR AI PYTHON REFERENCE INTEGRATION DEMO")
    print("=" * 65)

    client = FearAIClient(session_id="python_demo_session")

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
    print(f"[+] Handshake Accepted: {handshake.get('status')} (session: {client.session_id})")

    # 2. Reset clean
    client.reset_simulation()

    # 3. Register Agents - ONE round trip for the whole cast
    print("\n[+] Registering Agents (single batched request):")
    alice_traits = {
        "neuroticism": 0.85,
        "fear": 0.80,
        "resilience": 0.25,
        "extraversion": 0.60
    }
    bob_traits = {
        "neuroticism": 0.15,
        "fear": 0.20,
        "resilience": 0.90,
        "leadership": 0.95,
        "extraversion": 0.70
    }
    batch = client.register_agents([
        {"agent_id": "alice", "name": "Survivor Alice", "traits": alice_traits, "initial_position": {"x": 10, "y": 0, "z": 0}},
        {"agent_id": "bob", "name": "Veteran Bob", "traits": bob_traits, "initial_position": {"x": 12, "y": 0, "z": 0}}
    ])
    print(f"    - Registered: {batch.get('registered')} (refused: {len(batch.get('refused') or [])})")
    print(f"    - Alice: High Neuroticism (0.85), Low Resilience (0.25)")
    print(f"    - Bob: High Resilience (0.90), High Leadership (0.95)")
    if client.session_token_issued:
        print("    - Server issued a session token: persist it to be recognised on reconnect")
    if client.batch_unsupported:
        print("    - NOTE: server predates the batch control routes; fell back to per-agent requests")

    # 4. Ownership is verifiable, not assumed
    ownership = client.session_ownership()
    mine = [s for s in ownership.get("sessions", []) if s.get("session_id") == client.session_id]
    if mine:
        print(f"[+] Ownership confirmed: {mine[0].get('agent_count')} agent(s) owned by {client.session_id} "
              f"(live: {mine[0].get('live')}, can prove continuity: {mine[0].get('has_token')})")

    # 5. Simulation Sequence: Predator Approaches Alice
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

    # 6. Leader Reassurance Demonstration
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

    # 7. Session identity: a rival that knows the name but not the token is refused
    print("\n[+] Session Identity Check (a rival claiming the same name is REFUSED):")
    rival = FearAIClient(session_id=client.session_id)
    refusal = rival.register_agent("alice", traits=alice_traits)
    print(f"    - Rival claim on a live session's agent: {refusal.get('claim') or refusal.get('status')} "
          f"(owner: {refusal.get('owner_session_id', client.session_id)})")
    print(f"    - Rival refused claims: {rival.refused_claims}; the original host still owns alice")

    # 8. Teardown in one request
    print("\n[+] Retiring the cast (single batched request):")
    teardown = client.unregister_agents(["alice", "bob"])
    print(f"    - Unregistered: {teardown.get('unregistered')} (not found: {teardown.get('not_found')}, rejected: {teardown.get('rejected')})")
    print(f"    - Batched control requests: {client.batched_registration_requests} register, "
          f"{client.batched_unregistration_requests} unregister, {client.batched_trauma_requests} trauma; "
          f"individual registrations: {client.individual_registration_requests}")

    print("\n[+] Demo complete! Fear AI successfully drove affective dynamics & behavioral intents.")


def run_self_check(base_url, agent_count=8):
    """Exercise the control-plane contract against a live server and report JSON.

    Exists so a host (and the repository's verification pass) can check what this
    adapter can ACTUALLY do against a real middleware rather than trusting that
    the code paths look right. Read-only apart from the agents it creates and
    removes, all under its own session name.
    """
    client = FearAIClient(base_url=base_url, session_id=f"python_selfcheck_{int(time.time() * 1000)}")
    report = {"base_url": base_url, "checks": {}}

    client.handshake("PythonSelfCheck")
    ids = [f"selfcheck_npc_{i}" for i in range(agent_count)]
    batch = client.register_agents(ids)
    report["checks"]["batch_registration_confirms_every_agent"] = sorted(batch.get("registered") or []) == sorted(ids)
    report["checks"]["registration_took_one_round_trip"] = client.batched_registration_requests == 1
    report["checks"]["no_individual_registrations_needed"] = client.individual_registration_requests == 0
    report["checks"]["session_token_issued"] = bool(client.session_token)

    ownership = client.session_ownership()
    mine = [s for s in ownership.get("sessions", []) if s.get("session_id") == client.session_id]
    report["checks"]["ownership_readable"] = len(mine) == 1
    report["checks"]["ownership_reports_every_agent"] = bool(mine) and mine[0].get("agent_count") == agent_count
    report["checks"]["ownership_exposes_no_token_material"] = not any(
        isinstance(v, str) and "token" in k.lower()
        for session in ownership.get("sessions", [])
        for k, v in session.items()
    )

    # A rival that knows the NAME but not the TOKEN must be refused, and the
    # original host must still own what it registered.
    rival = FearAIClient(base_url=base_url, session_id=client.session_id)
    refused = rival.register_agent(ids[0])
    report["checks"]["name_only_rival_is_refused"] = rival.refused_claims == 1
    report["checks"]["refusal_names_the_owner"] = refused.get("owner_session_id") == client.session_id
    ownership_after = client.session_ownership()
    mine_after = [s for s in ownership_after.get("sessions", []) if s.get("session_id") == client.session_id]
    report["checks"]["refusal_does_not_transfer_ownership"] = bool(mine_after) and mine_after[0].get("agent_count") == agent_count

    # The token, not the name, is what proves continuity across a reconnect.
    reconnect = FearAIClient(base_url=base_url, session_id=client.session_id)
    reconnect.session_token = client.session_token
    reclaimed = reconnect.register_agent(ids[0])
    report["checks"]["proven_token_reconnects"] = reclaimed.get("status") == "REGISTERED" and reconnect.refused_claims == 0

    trauma = client.add_trauma_zones([{"x": 1, "y": 0, "z": 0, "intensity": 0.8},
                                      {"x": 4, "y": 0, "z": 0, "intensity": 0.4}])
    report["checks"]["trauma_batch_applies_every_zone"] = trauma.get("count") == 2
    report["checks"]["trauma_took_one_round_trip"] = client.batched_trauma_requests == 1

    teardown = client.unregister_agents(ids)
    report["checks"]["unregister_batch_confirms_every_agent"] = teardown.get("count") == agent_count
    report["checks"]["unregister_took_one_round_trip"] = client.batched_unregistration_requests == 1
    report["checks"]["nothing_silently_dropped"] = (
        not (teardown.get("rejected") or [])
        and client.registration_failures == 0
        and client.trauma_zones_rejected == 0
    )
    report["checks"]["no_legacy_fallback_triggered"] = client.batch_unsupported is False
    report["counters"] = {
        "batched_registration_requests": client.batched_registration_requests,
        "individual_registration_requests": client.individual_registration_requests,
        "batched_unregistration_requests": client.batched_unregistration_requests,
        "batched_trauma_requests": client.batched_trauma_requests,
        "refused_claims": client.refused_claims,
        "registration_failures": client.registration_failures
    }
    report["passed"] = all(report["checks"].values())
    return report


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--self-check":
        target = sys.argv[2] if len(sys.argv) >= 3 else "http://127.0.0.1:8765"
        result = run_self_check(target)
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["passed"] else 1)
    run_demo()
