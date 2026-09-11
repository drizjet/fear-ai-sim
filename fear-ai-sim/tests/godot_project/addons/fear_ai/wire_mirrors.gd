# wire_mirrors.gd
# NEXT-125 (CCI-28 frontier 9): headless GDScript mirrors of the three JS
# identity wires so Godot showcase stations can observe them.
#
# STRICT ARCHITECTURAL INVARIANT:
# These are simplified deterministic showcase mirrors, not the canonical
# simulation. Canonical behavior lives in the JS core:
#   identity blend .... packages/core/src/AffectiveAgent.js (NEXT-114)
#   trauma feed ....... packages/core/src/TraumaCrystallizationEngine.js (NEXT-115)
#   vault cycle ....... packages/core/src/IdentityVault.js + LodVaultCycle.js (NEXT-116)
# Godot owns movement/collision; mirrors output advisory numbers only.
class_name WireMirrors

static func _clamp01(v: float) -> float:
	return clampf(v, 0.0, 1.0)

# Condensed CharacterIdentityArchitecture.decide(): stable tendency gains
# (identity) modulated by adaptive weights and immediate state pressure.
# traits: neuroticism, resilience, agreeableness, openness, extraversion,
#         leadership, risk_tolerance, loyalty
# state: fear, urgency, panic, perceived_danger, confidence
static func identity_tendencies(traits: Dictionary, state: Dictionary) -> Dictionary:
	var n: float = _clamp01(float(traits.get("neuroticism", 0.5)))
	var r: float = _clamp01(float(traits.get("resilience", 0.5)))
	var a: float = _clamp01(float(traits.get("agreeableness", 0.5)))
	var o: float = _clamp01(float(traits.get("openness", 0.5)))
	var e: float = _clamp01(float(traits.get("extraversion", 0.5)))
	var l: float = _clamp01(float(traits.get("leadership", 0.5)))
	var fear: float = _clamp01(float(state.get("fear", 0.0)))
	var danger: float = _clamp01(float(state.get("perceived_danger", 0.0)))
	var confidence: float = _clamp01(float(state.get("confidence", 0.5)))
	var stand_gain: float = _clamp01(0.3 + r * 0.4 + l * 0.2 - n * 0.15)
	var flee_gain: float = _clamp01(0.3 + n * 0.4 + (1.0 - _clamp01(float(traits.get("risk_tolerance", 0.5)))) * 0.3 - r * 0.15)
	var help_gain: float = _clamp01(0.2 + a * 0.45 + e * 0.25 - n * 0.1)
	var pressure: float = _clamp01(fear * 0.6 + danger * 0.5 - confidence * 0.2)
	return {
		"stand": _clamp01(stand_gain + 0.1 - pressure * 0.35),
		"flee": _clamp01(flee_gain + pressure * 0.45),
		"help": _clamp01(help_gain * (1.0 - pressure * 0.5)),
		"investigate": _clamp01((0.2 + o * 0.45) * (1.0 - pressure * 0.55)),
		"rally": _clamp01(0.15 + l * 0.5 + e * 0.2),
		"state_pressure": pressure
	}

# NEXT-114 mirror: bias resolved urgency along the matching tendency axis.
static func blend_urgency(base_urgency: float, tendency: float, weight: float) -> float:
	return _clamp01(base_urgency + weight * (tendency - 0.5) * 0.3)

# NEXT-115 mirror: episode latch (one trauma per crossing with hysteresis)
# plus condensed crystallization (floor + panic offset after sustained
# terror) and cue-conditioned dread readout.
static func new_trauma_state() -> Dictionary:
	return { "episode_open": false, "terror_ticks": 0, "crystallized": false, "floor": 0.0, "offset": 0.0, "cues": {} }

static func trauma_tick(tstate: Dictionary, fear: float, cue: String, threshold: float = 0.85, rearm: float = 0.2) -> Dictionary:
	var episode := false
	if not bool(tstate["episode_open"]) and fear >= threshold:
		tstate["episode_open"] = true
		episode = true
		tstate["terror_ticks"] = 0
		if cue != "":
			tstate["cues"][cue] = true
	elif bool(tstate["episode_open"]) and fear < threshold - rearm:
		tstate["episode_open"] = false
	if bool(tstate["episode_open"]):
		tstate["terror_ticks"] = int(tstate["terror_ticks"]) + 1
	if not bool(tstate["crystallized"]) and int(tstate["terror_ticks"]) >= 150:
		tstate["crystallized"] = true
		tstate["floor"] = 0.25 * fear
		tstate["offset"] = 0.18 * fear
	var dread := 0.0
	if bool(tstate["crystallized"]) and cue != "" and bool(tstate["cues"].get(cue, false)):
		dread = 0.2
	return { "episode": episode, "dread": dread, "floor": float(tstate["floor"]), "offset": float(tstate["offset"]), "crystallized": bool(tstate["crystallized"]) }

# NEXT-116/NEXT-119 mirror: seal preserves identity + adaptive + trauma
# blob; restore returns clones. Dictionaries are value types in transit
# here via duplicate(), mirroring the JS clone-both-ways contract.
static func vault_seal(snapshot: Dictionary) -> Dictionary:
	if not snapshot.has("identity"):
		return { "ok": false, "reason": "SEAL_NEEDS_IDENTITY" }
	return {
		"ok": true,
		"identity": (snapshot["identity"] as Dictionary).duplicate(),
		"adaptive": (snapshot.get("adaptive", {}) as Dictionary).duplicate(),
		"trauma": (snapshot.get("trauma", {}) as Dictionary).duplicate() if snapshot.has("trauma") else {},
		"trauma_sealed": snapshot.has("trauma"),
		"abstract_ticks": 0
	}

static func vault_restore(sealed: Dictionary) -> Dictionary:
	if not bool(sealed.get("ok", false)):
		return { "ok": false, "reason": "NOT_SEALED" }
	return {
		"ok": true,
		"identity": (sealed["identity"] as Dictionary).duplicate(),
		"adaptive": (sealed["adaptive"] as Dictionary).duplicate(),
		"trauma": (sealed.get("trauma", {}) as Dictionary).duplicate(),
		"trauma_exact": bool(sealed.get("trauma_sealed", false)),
		"abstract_ticks": int(sealed.get("abstract_ticks", 0))
	}
