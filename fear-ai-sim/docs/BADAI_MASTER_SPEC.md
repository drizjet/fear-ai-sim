# BADAI — MASTER LONG-TERM SPEC, ROADMAP & EXECUTION PROMPT (v3.0 — 2026-08-26)

> **The mission:** Fear AI is not the end product — it's the inheritance. This plan transforms it, feature by feature, into **BadAI**: a new, better, original system that is yours. Long-term horizon: no deadline, six epochs, each shippable, each with hard exit criteria.
>
> Provenance discipline applies throughout: code facts VERIFIED at `63d76f9`, equations PROPOSED, assumptions labeled. Nothing presented below is a claim about the codebase unless it carries a status tag.

---

## 0 · THE VISION — what BadAI is

**BadAI is a Perceived-Reality Simulation platform.** One decision machine runs every intelligent actor at every scale — an agent, a vampire, a caravan, a faction, a town, a court. Fear is its deepest root emotion and its first proven subsystem; the rest of the affective/social/macro spectrum grows from that root. The world has ground truth; every actor has an imperfect model of it; actions change both — and those two layers drifting apart is where all the interesting behavior lives.

### The BadAI Doctrine (10 principles — these survive every epoch)

1. **GROUND TRUTH ≠ AGENT BELIEF ≠ FACTION INTELLIGENCE ≠ PUBLIC RUMOR** — four layers, never collapsed.
2. **One machine, all scales** — a vampire decision and a kingdom decision are the same code with different catalogs.
3. **Affordance → Prerequisite → Utility → Planning** — never merge the four; a failed prerequisite disqualifies, it never just lowers a score.
4. **Fear is not cowardice. Anger is not fear. Justice is not punishment.** — research-backed separations, hardcoded as doctrine.
5. **Explainability is a product requirement** — every decision renders as `+recruitmentNeed .91 −fearOfHunters .52, blockers: [], alternatives: Feed .66 / Leave .41`.
6. **Deterministic core first; LLM only as a gated advisor** — the validator owns the door, the LLM never owns the world.
7. **Estimates ≠ actuals everywhere** — deception, scouting, spies, rumors, bluffing are features, not hacks.
8. **Emergence over scripting** — bandits relocate because economics moved, not because a director said so.
9. **Evidence over claims** — the DB journals every fact, every decision, every session; nothing becomes truth without a test.
10. **It's yours** — original naming, original architecture, every design decision documented and reasoned. The Fear AI lineage is preserved as history, not as identity.

---

## 1 · THE INHERITANCE — what Fear AI hands BadAI (CODE_VERIFIED at `63d76f9`)

### 1.1 Keep — upgrade, never remove

| Artifact | Verified behavior |
|---|---|
| DE stimulus-response formula | `variance = threatCount·1.5 + neighborPanic·2.0 + 0.1; deValue = 0.5·ln(2πe·variance); return max(0, deValue·0.2)` |
| Max-fear update rule | `currentFear = max(currentFear·(0.95 + neuroticism·0.04), habituatedThreat·traits.fear)` — fear never accumulates, new threat is scaled by `traits.fear` |
| OCEAN weighting | neuroticism scales threat input ×`(0.5 + neuroticism)`; extraversion scales mirror-fear ×`(0.5 + extraversion)` |
| Mirror-fear contagion | `mirrorFear · 0.4 · extraversionScale` in the threat chain; panicking neighbors feed the DE variance |
| Trauma zones | 30s fade; `traumaIntensity · 0.8 · neuroticismScale` in the threat chain |
| Markov evasion | PANIC/ANXIOUS movement uses predator `predictedNextPos` when `skill > 0.5` |
| AGGRESSIVE rule | never charges predators — flees at 1.5×; anger decays ×0.8 when threats present |
| Morale field + loop | already live in brain.js: safe-haven `+0.05` cap 2.0; base `+0.01 gain − 0.002 loss` clamp `[0.2, 2.0]`; `energy < 30` adds `(30−energy)·0.01` to fear; `morale < 0.4` gates FREEZE (5% roll) |
| 8 GOAP actions + dynamic costs | `move_to_safe_haven(2), hide(1), flee(3), attack(5), eat_food(2), form_group(1), scout(2), distract(6)`; live modifiers: `flee.cost /= max(0.1, 1+fear·2)`, `attack.cost /= max(0.1, 1+anger·5)`, loss-aversion `flee *= 0.5` / `eat *= 1.2`, `distract.cost /= 1 + (agreeableness·2 − fear)·5`, skill>0.6 → hide 0.5, curiosity>0.7 → scout 1 |
| 6-emotion model | `emotions.js`: fear/anger/energy/hunger/thirst/boredom (0–1); BERSERK at anger ≥ 0.9 → fear ×0.5, effectiveFear ×0.3, speed ×1.3; panic drains energy 0.01/frame; angerFearSuppression 0.5. **Importer status = UNVERIFIED — check in E0** |
| Hardened foundation | numeric alive-only `getStats`, `panicCount/panicRatio/panicLevel`, `ANTI_FLEE` clamp `[0,1]`, `>=` cooldown fix, CSP/eval/DevTools production gates, xmldom/form-data overrides, 514/514 tests |

### 1.2 Upgrade — fix in E1/E2

| Divergence | Evidence |
|---|---|
| Thresholds: live 0–100 vs dead 0–1 vs Rust | live `brain.js`: CALM→ALERT 20, →ANXIOUS 30, ANXIOUS→PANIC 80, PANIC→ANXIOUS 70 (instant downgrade, skips bands); dead `hysteresis.js` (0–1): 0.25/0.55/0.75 enter, 0.65/0.60 etc. exits, 10-frame min duration; Rust (RUNTIME-VERIFIED): enter 0.8/1.4/3.8/4.6, exit 0.55/0.8/1.2/3.0, panic lock 10 ticks. **Scale mapping (0–5 → ÷5) is an ASSUMPTION until Rust source is read (DECISION-0001)** |
| GOAP dead in the loop | `updatePlan()` fully implemented; `decide()` never calls it; behavior tree ticks only for `skill > 0.4` |
| Panic lock absent | JS downgrades PANIC→ANXIOUS at f<70 with no minimum duration |
| CRLF + comment-format drift | source files mixed line endings and block-comment styles — normalize in E1 |

### 1.3 Discard / revive-verdict

| Module | Verdict in BadAI |
|---|---|
| `hysteresis.js` | **REVIVE** as the single transition controller (all states, min duration, band-by-band exits) |
| `habituation.js` | **REVIVE** — 6 stimulus types (PREDATOR 1.0 / PHEROMONE 1.5 / SOUND 0.8 / VISUAL 1.2 / MEMORY 0.5 / GROUP_PANIC 2.0 decay speeds), 8%/exposure, 60% max, novelty boost 0.15 |
| `featureengineer.js, ddasystem.js, groupbehaviors.js, vrsystem.js, biofeedback.js, agentmemory.js, masac_predator.js` | wire / delete / archive verdicts — one decision row + EV row each (P8/E1–E4) |
| CHAT-02/03 archives | still inaccessible — never represent as reviewed |
| Rust scale mapping | ASSUMPTION until the Rust source is actually read |

### 1.4 Knowledge estate (yours, never lose)

724 ledger records · 1288 edges · 100 evidence rows · 71 design proposals · 6 extracted equations (all PROPOSED-labeled) · 5 worklog rows · 3 DB backups · 3 desktop reference docs · vault research collections.

---

## 2 · THE LONG-TERM ARCHITECTURE — BadAI core spec

### 2.1 The pipeline (every entity in the platform runs this)

```
REAL WORLD → PERCEPTION → BELIEF STATE → APPRAISAL → EMOTION
→ AFFORDANCE/PREREQUISITE GATE → UTILITY SCORING → INTENT
→ GOAP/HTN PLAN → BEHAVIOR TREE EXECUTION → WORLD CONSEQUENCE
→ MEMORY + REPUTATION + RUMOR → NEW BELIEFS
```

Four concepts, never merged:
- **AFFORDANCE** — "what could I possibly do?" (catalog)
- **PREREQUISITE** — "am I allowed/capable?" (hard gate — failure DISQUALIFIES, never just lowers score)
- **UTILITY** — "how much do I want to?" (considerations × response curves)
- **PLANNING** — "how do I accomplish it?" (GOAP/HTN → behavior tree)

**DecisionContext** (shared across scales): `actor, worldBeliefs, confidence, needs, goals, emotions, personality, doctrine, relationships, reputation, legalNorms, socialNorms, capabilities, resources, recentMemory, threats, opportunities, availableActions[]`.

**Decision record** (explainability = product requirement):

```js
{ action, target, valid, baseUtility,
  considerations: [{ name, rawValue, normalizedValue, responseCurve, contribution }],
  finalScore, blockers: [], explanation: [] }
```

UI renders: `DECISION: Transform Elena — 0.78` with `+recruitmentNeed .91, +targetMagicalValue .88, −fearOfHunters .52`, blockers, and alternatives (`Feed .66 / Recruit .74 / Leave .41 / Kill .29`).

**Selection rule:** hard gates first; then weighted pick inside a narrow utility band (best .81 vs second .78 both eligible) — band width is set by personality/doctrine (chaotic vampire wide, disciplined military narrow). Never blindly take the maximum; never pick far below the best.

### 2.2 Platform layers (end-state, each with owning epoch)

| Layer | Contents | Epoch |
|---|---|---|
| **L1 FearCore** | FearBand (Rust parity), panic lock, habituation, hysteresis, OCEAN, contagion, trauma, DE stimulus | E1 |
| **L2 DecisionCore** | DecisionContext, considerations/response curves, zero-score gates, band selection, decision traces | E2 |
| **L3 SocialCore** | Personality, morale, belief/evidence, rumors, reputation, trust/betrayal, memory w/ causal inference | E3 |
| **L4 MacroCore** | Factions (24-dim state), escalation 0–8, raids, trade/routing, markets, justice/legitimacy, institutions | E4 |
| **L5 Advisory** | LLM validator gate, scenario director, sandbox world editor, mod API | E5 |
| **L6 Platform** | Elixir simulation backend, VR presence, multiplayer/spectator, packaging, brand | E6 |

### 2.3 The eight living loops (all emergent, all sharing Layers 1–4)

1. **Combat** (exists)
2. **Trade** (E4): prices, shortages, risk premiums, smuggling, market displacement
3. **Routing** (E4): contested routes, predictability penalty, convoys, escorts
4. **Predation / vampirism** (E2): `TransformTarget` affordance — fear + hunger + doctrine + witnesses choose it; the vampire never "inherently" transforms anybody
5. **Crime** (E4): `crimeUtility`, learned perceived apprehension
6. **Diplomacy** (E4): treaties, deterrence, bluffing, spillover/spies
7. **Raiding / war** (E4): `RaidUtility` from bad intel is a feature
8. **Justice** (E4): legitimacy closed loop

**Flagship demo (E4 exit criterion):** the player-damage→invasion chain — one wounded player outside a town, and ~14 emergent steps later (witnesses → rumor → perceived danger → rerouting → trade fall → shortage → theft → patrols → unjust arrests → legitimacy fall → witness silence → organized crime → fear → exodus → taxes fall → defenses weaken → enemy detects vulnerability → **INVASION**). No script.

### 2.4 Capability horizons (what "better" means, long term)

- **H1 — Behavior:** agents that flinch, freeze, hide, bluff, and sacrifice for family — believable second-to-second.
- **H2 — Society:** towns that distrust, courts that fail, markets that panic, rumors that move caravans.
- **H3 — Emergence:** macro outcomes (wars, exoduses, famines, vampire pogroms) that NO ONE scripted.
- **H4 — Explainability:** click any entity, see exactly why it did what it did.
- **H5 — Moddability:** every action, curve, threshold, and doctrine is data — content lives in JSON/SQLite, not code.
- **H6 — Scale:** Elixir backend runs thousands of entities; VR presence for research monitoring.
- **H7 — Originality:** a documented architecture with a complete decision log — not a clone of anything.

### 2.5 Equation registry (all verbatim, status-labeled — PROPOSED until runtime tests exist)

| ID | Equation | Status |
|---|---|---|
| DP-020 | `AccessToJustice = (ExpectedRemedy · Legitimacy) / (InstitutionalFriction + Risk + ε)` — "a fair court 200 miles away provides almost no justice" | PROPOSED (archive) |
| DP-025 | `crimeUtility = expectedReward + revengeUtility + desperationPressure − perceivedApprehensionProbability·expectedSanction − expectedSocialCost − victimEmpathy − personalMoralCost − immediateFear` — **perceivedApprehensionProbability is LEARNED** | PROPOSED (archive) |
| DP-026 | `reportProbability = authorityLegitimacy + trustInInvestigator + moralDuty + victimRelationship + witnessProtection − retaliationFear − corruptionBelief − offenderLoyalty − authorityFear − uncertainty` | PROPOSED (archive) |
| DP-027 | `routeCost = travelDistance + actualKnownDanger·knowledgeConfidence + perceivedDanger·fearSensitivity + darknessRisk − familiarity − escortConfidence − authorityTrust − socialPresence` — "different agents compute different optimal routes (psychology in pathfinding)" | PROPOSED (archive) |
| DP-055 | `RaidUtility = expectedLoot + resourceNeed + revengeValue + prestigeValue + intelligenceValue + destabilizationValue − expectedLosses − retaliationRisk − escalationRisk − supplyCost − diplomaticCost − legitimacyCost − opportunityCost` — **using PERCEIVED values, not omniscient → terrible raid decisions from bad intel is a feature** | PROPOSED (SRC-B1) |
| DP-059 | `RouteCost(edge) = travelTime + tollCost + weatherCost + perceivedDanger×fearSensitivity + perceivedAmbushProbability×expectedCargoLoss + politicalRisk + borderRisk + monsterRisk + legalRisk + informationUncertainty×uncertaintyAversion − escortConfidence − routeFamiliarity − friendlyTerritoryConfidence` — extended variant | PROPOSED (SRC-B1) |
| — | FearBand enter/exit thresholds + panic lock 10 ticks | RUNTIME-VERIFIED (Rust lane) |
| — | Perceived-threat chain, DE formula, OCEAN scales, GOAP cost modifiers (§1.1) | CODE_VERIFIED at `63d76f9` |

---

## 3 · THE ROADMAP — six epochs, hard exits, shippable at every stop

### E0 — INHERITANCE LOCK (now, ~immediate)
- Re-verify the `63d76f9` baseline (514/514), confirm `emotions.js` importer status, write the BadAI founding decision rows (naming, doctrine, scale DECISION-0001), rename the identity in docs/DB (lineage preserved as history).
- **Interleaved ops (blockers):** CI workflow to repo root `.github/workflows/` + `working-directory: fear-ai-sim`; vault additive refresh; orphan-verdict scoping.
- **Exit:** baseline green; founding decisions logged; BadAI naming locked.

### E1 — FEARCORE v0.1 ("BadAI 0.1")
- Rust-parity FearBand, panic lock 10 ticks, revive `hysteresis.js` + stimulus-aware `habituation.js`, wire GOAP into `decide()`, remove `skill > 0.4` gate, keep every §1 behavior regression-locked.
- **Exit:** 514 + ~30 named tests green (§5); `docs/RUST_PARITY.md` divergence matrix closed; panic lock + band-by-band exits proven.

### E2 — DECISIONCORE v0.2 ("BadAI 0.2")
- Utility AI (SYS-0058): DecisionContext, considerations with response curves, zero-score disqualification, band selection, decision-trace records + explainability panel; affordance data build-out 8 → 20 → 46.
- **Exit:** utility suite green; UI shows a vampire's `Transform Elena — 0.78` trace with blockers and alternatives.

### E3 — SOCIALCORE v0.3 ("BadAI 0.3")
- Personality (SYS-0014) + Morale (SYS-0025) as first-class modules; BeliefEvidence / AgentBelief / rumor engine; reputation as weighted private+public info.
- **Exit:** rumor→behavior loop demo; echo-chamber / deception / opinion-freezing tests.

### E4 — MACROCORE v0.4 ("BadAI 0.4")
- Factions (24 dims, escalation output 0–8, RaidUtility DP-055), trade/routing (routeCost DP-027 + DP-059 + predictabilityPenalty, convoy), justice (crimeUtility DP-025, reportProbability DP-026, AccessToJustice DP-020, legitimacy loop), institutions.
- **Exit:** all eight loops running; player-damage→invasion chain passes end-to-end.

### E5 — ADVISORY v1.0 ("BadAI 1.0")
- LLM advisory gate (SYS-0061), config-gated; scenario director; sandbox world editor; mod API; public docs/identity.
- **Exit:** validator-only LLM proven; a non-designer can build a scenario.

### E6 — PLATFORM v2.0 ("BadAI 2.0")
- Elixir simulation backend, VR wiring (`vrsystem.js` verdict from E1–E4), multiplayer/spectator, packaging, brand launch.
- **Exit:** 1000+ live entities; VR presence session recorded; distribution build.

**Interleaved ops track (runs throughout):** CI green · vault refresh · `npm audit --omit=dev` 0 · no eval/DevTools/LIVE_FIX in packaged builds · orphan verdicts with one EV row each · DB journal after every session.

---

## 4 · DECISIONS LOG (each gets a design_proposals row with rationale)

| ID | Decision | Status |
|---|---|---|
| 0001 | Fear scale reconciliation: **0–1 internal (recommended)** vs 0–100 vs 0–5. Candidate mapping (Rust ÷5): enter 16/28/76/92, exit 11/16/24/60 (fear ×100 → 0–100). Verify against Rust source before locking | OPEN |
| 0002 | Panic lock semantics: pure Rust 10-tick PANIC lock vs hysteresis all-state min-duration (10 frames) | OPEN |
| 0003 | Habituation: stimulus-aware module (rec.) vs keep inline GENERAL | OPEN |
| 0004 | Hysteresis: revived module (rec.) vs rewrite inside brain.js | OPEN |
| 0005 | GOAP wiring: GOAP-first with BT executor (rec.) vs keep BT for skilled agents | OPEN |
| 0006 | Naming/identity: **BadAI** (working title) — final lock in E0 | OPEN — yours to confirm |
| 0007 | 9 orphan verdicts (wire / delete / archive) | OPEN per module |

---

## 5 · NAMED TEST MATRIX (cumulative; baseline 514 always green)

**E1 (~30):** `FearBand.enter.exact` · `FearBand.exit.bandByBand` · `FearBand.panicLock.min10Ticks` · `FearBand.panicLock.releasesAfter10` · `FearBand.flap.resistant` · `Habituation.stimulusSpecific` · `Habituation.maxCap60` · `Habituation.noveltyBoost` · `GOAP.decideInvokesUpdatePlan` · `GOAP.btExecutorRunsPlan` · `Reactive.skillBelowGateStillDecides` · `NoNaN.sweep1000` · `Morale.loopBounds` · `Morale.freezeGatePreserved`

**E2 (~25):** `Curve.zeroScoreDisqualifies` · `Curve.responseCurveShapes` · `Band.selectionWithin` · `Band.personalityWidth` · `Triple.actorTargetContext` · `Trace.explainableRecord` · `Trace.blockersListed` · `Affordance.prerequisiteBlocks` · `Affordance.catalog46`

**E3 (~20):** `Personality.plasticity` · `Personality.bandWidth` · `Personality.planInterval` · `Morale.factionAggregate` · `Rumor.mutation` · `Rumor.echoChamber` · `Rumor.sourceTrustWeighting` · `Belief.confidenceDecays` · `Belief.evidenceCorroboration`

**E4 (~35):** `Escalation.ladderOutput0to8` · `Escalation.threatNotHostility` · `Escalation.preemptionFromFear` · `Raid.badIntelLeadsToBadRaid` · `Raid.perceivedVsActualValues` · `Intel.estimateVsActual` · `Intel.spyCorruptsEstimate` · `Route.predictabilityPenalty` · `Route.psychologyDiffers` · `Ecology.banditRelocation` · `Ecology.rumorShiftsRoute` · `Convoy.thresholds` · `Crime.utilityLearnsApprehension` · `Report.retaliationFearReduces` · `Justice.accessFriction` · `Loop.legitimacyCooperationSolveRate` · `Anger.notFear.drivesPunitiveness` · `Chain.playerDamageToInvasion`

**E5 (~12):** `Gate.validTargetApproved` · `Gate.illegalTargetRejected` · `Gate.prerequisiteMissingRejected` · `Gate.noLLMFallback` · `Gate.auditLogged`

---

## 6 · EXECUTION PROMPT (standalone artifact — also in `BADAI_EXECUTION_PROMPT.md`)

```
BADAI CONTINUATION PROMPT — senior engineer on the BadAI project (successor of Fear AI, lineage preserved).

READ FIRST (order):
1. C:\Users\badanalysis\Desktop\BadAI_Master_Spec_Roadmap_2026-08-26.md  (this spec — single source of truth)
2. C:\Users\badanalysis\Desktop\Fear_AI_Implemented_Code_Facts_2026-08-26.md  (inherited code facts)
3. C:\Users\badanalysis\Desktop\Fear_AI_Knowledge_Complete_Dump_2026-08-26.md  (724 ledger records)
4. C:\Users\badanalysis\Desktop\Fear_AI_Archive_Extraction_2026-08-26.md  (claims + equations, status-labeled)
5. C:\Users\badanalysis\Desktop\fear_ai_knowledge.db  (write ONLY agent_worklog / implementation_evidence /
   design_proposals; ledger read-only; back up before writing; Node 24 node:sqlite)

REPO: C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim
(git root one level up; branch master @ 63d76f9; 514/514 tests)

VISION: BadAI — Perceived-Reality Simulation. One decision machine, all scales.
Doctrine: 10 principles (spec §0). Epochs: E0 inheritance-lock → E1 FearCore →
E2 DecisionCore → E3 SocialCore → E4 MacroCore → E5 Advisory 1.0 → E6 Platform 2.0.

TRUTH RULES (mandatory):
- USER ≠ RESEARCH ≠ AUDIT_INFERENCE ≠ IMPLEMENTATION_CLAIM ≠ CODE_VERIFIED.
  Research supports a concept; it never proves implementation. Say UNKNOWN and propose.
- Never rebuild equations/thresholds from literature — only code, tests, the Rust lane, or PROPOSED rows.
- CHAT-02/03 remain inaccessible — never claim review. Rust scale mapping = ASSUMPTION until Rust source read.
- Every verified code fact → implementation_evidence row; every design → design_proposals row;
  every session → agent_worklog row. Back up the DB before writing.

TASK: take the epoch letter (E0…E6) from the user. Run its scope (§3), its open decisions (§4),
its named tests (§5). Do not skip ahead. Report: files changed, commands run, tests,
what remains UNKNOWN, next epoch letter.

DONE-WHEN (all four):
1. npm test green (baseline 514 + epoch tests), node --check + npm run build clean.
2. No production regressions: no eval, no DevTools in packaged builds, CSP intact.
3. Phase evidence/design/worklog rows written to the DB (backup taken first).
4. Spec epoch section checked off with a one-paragraph delta note appended.
```

---

## 7 · PROVENANCE RULES (carry-forward, permanent)

- The 6 extracted equations stay PROPOSED until runtime tests exist. Rust thresholds + panic lock are RUNTIME-VERIFIED. The 0–5 scale mapping is an ASSUMPTION pending Rust source.
- §1 behavior facts are the regression baseline (CODE_VERIFIED at `63d76f9`).
- Every session journals the DB (worklog + evidence + proposals); backups on every write; ledger tables never touched.
- CHAT-02/03 remain inaccessible; nothing from them is ever represented as reviewed.

## 8 · DELIVERABLES (this approval round)

1. `Desktop\BadAI_Master_Spec_Roadmap_2026-08-26.md` — this document
2. `Desktop\BADAI_EXECUTION_PROMPT.md` — §6 standalone
3. `fear-ai-sim\docs\BADAI_MASTER_SPEC.md` — repo copy
4. DB worklog `WORK-20260826-006` (backup `.pre-AI-20260826-3.bak` taken first)
5. No code changes — implementation begins when an epoch is picked (E0 recommended first)