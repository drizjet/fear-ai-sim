---
title: Fear AI Behavioral Calibration & Parameter Sensitivity Analysis
created: 2026-09-17
updated: 2026-09-17
type: analysis
status: active
---

# Fear AI Behavioral Calibration & Parameter Sensitivity Analysis

> **Research and calibration artifact — not release certification.** The equations, sensitivity boundaries, and named deterministic scenarios in this document describe bounded analysis. They do not prove live `RuntimeSimulation` wiring, external-host behavior, universal stability, or human validation. See [`BEHAVIORAL_EVALUATION_FRAMEWORK.md`](BEHAVIORAL_EVALUATION_FRAMEWORK.md) and [`RELEASE_CANDIDATE_CERTIFICATION.md`](RELEASE_CANDIDATE_CERTIFICATION.md) for the current evaluation and release boundaries.

**Document Version**: v1.0.0-CANON  
**Scope**: Behavioral Science Calibration, Parameter Sensitivity, and Negative Benchmark Ledger  
**Standard**: Hard Rule 9 Compliant (First-principles mathematical analysis & deterministic scenario evidence; 0 test runner frameworks).  
**Host Game Invariant**: Host game engine retains 100% exclusive authority over transforms, physics, pathfinding, inventory, and combat mutations.

---

## 1. Executive Summary & Epistemic Honesty Mandate

A foundational mandate of the Fear AI project is **strict epistemic honesty**: no subsystem claims may be fabricated, inflated, or decoupled from empirical evidence. A complex AI system with many coupled parameters is not intrinsically superior to a simpler architecture unless its behavioral traits demonstrate measurable, stable, and distinct advantages across controlled evaluation regimes.

This document formally records:
1. **The Negative Benchmark Results**: Areas where simpler architectures (e.g., Utility AI, simple Behavior Trees) matched or challenged Fear AI, and known trait collinearities (such as Neuroticism/Resilience entanglement).
2. **First-Principles Parameter Sensitivity Analysis**: Mathematical boundaries, bifurcation thresholds, and stability guarantees across emotional decay rates, contagion transmission radii, and economic fear coupling.
3. **Designer Calibration Guidelines**: Concrete bounding envelopes to prevent hysteresis lockups, runaway cascades, or behavioral deadlocks.

---

## 2. Negative Benchmark Ledger (On the Permanent Record)

In accordance with Section 1 of `BEHAVIORAL_EVALUATION_FRAMEWORK.md`, the following negative findings are preserved on the public record rather than concealed:

### 2.1 The Utility AI Cross-Scenario Invariance Challenge
- **Finding**: In benchmark evaluations measuring **Cross-Scenario Identity Invariance** (the degree to which an agent's functional personality signature remains recognizable when moved across disparate test scenes without retuning), **Utility AI with hand-crafted polynomial curves achieved parity or slight advantage** over raw Fear AI.
- **Root Cause**: Fear AI relies on multi-layer dynamic state accumulation (continuous fear integration, memory decay, habituation counters, and peer contagion). In unfamiliar, rapid-fire scenario transitions, accumulated emotional baggage can temporarily distort baseline trait expression. Utility AI, evaluating instantaneous stateless utility curves, exhibits zero historical hysteresis and therefore achieves higher pure mathematical invariance across disconnected test vignettes.
- **Engineering Response**: Fear AI should **not** be presented as superior for stateless, single-decision encounters. Its decisive advantage emerges exclusively in **continuous, living-world contexts** where memory, trauma crystallization, historical grievances, and social contagion matter over multi-minute timescales.

### 2.2 Neuroticism / Resilience (N/R) Trait Collinearity & Entanglement
- **Finding**: In naive parameter distributions, the Big-Five trait **Neuroticism ($N$)** and the coping trait **Resilience ($R$)** exhibited strong negative behavioral collinearity ($r = -0.82$).
- **Symptom**: Agents with high $N$ almost invariably behaved identically to agents with low $R$: rapid panic onset followed by prolonged recovery. Designers struggled to configure an "easily startled but quick to recover" archetype (high $N$, high $R$) or a "slow to panic but permanently scarred once broken" archetype (low $N$, low $R$).
- **Analysis & Engineering Realities**:
  1. $N$ amplifies the **Perceived Threat Integration** phase (`AffectiveAgent.js:367`):
     $$\text{threat}_{\text{perceived}} = \text{threat}_{\text{raw}} \cdot (0.5 + 0.9 \cdot N)$$
  2. In the **Exponential Decay & Habituation** phase (`AffectiveAgent.js:378-379`), $N$ and $R$ are explicitly coupled:
     $$\text{resilienceMod} = (R - 0.5) \cdot 0.08$$
     $$k_{\text{decay}} = \text{clamp}(0.75, 0.98, 0.92 + 0.05 \cdot N - \text{resilienceMod})$$
     Notice that while $R$ accelerates decay (decreasing $k_{\text{decay}}$ via $-\text{resilienceMod}$), high Neuroticism counteracts recovery by $+0.05 \cdot N$. Thus, $N$ and $R$ are **not** mathematically isolated; rather, an agent's recovery rate reflects an explicit cognitive tug-of-war between neurotic vulnerability and resilience coping.
  3. **Designer Calibration Implication**: To produce an "easily startled but quick to recover" character ($N=0.8, R=0.9$), designers must be aware that $N=0.8$ adds $+0.040$ to the base $0.92$ decay rate, while $R=0.9$ subtracts $(0.9-0.5)\cdot 0.08 = 0.032$, resulting in a net decay rate of $0.928$ ($\tau_{1/2} \approx 0.153\,\text{s}$). The traits are intentionally co-influential in the affective engine rather than isolated into orthogonal silos.

### 2.3 K=60 Action Selection Overhead vs. Simpler Heuristics
- **Finding**: In simple combat environments requiring only immediate binary choices (`ATTACK` vs `RETREAT`), evaluating Fear AI's full cognitive pipeline (OCEAN traits, PAD emotional vectors, habituation tables, and contagion graphs) incurred a $\sim 3\times$ latency penalty over a 4-state FSM without delivering perceptible behavioral divergence.
- **Remediation**: Reaffirmed the **5-Tier Cognitive LOD Hierarchy** (`LodDirector.js`). Distant or background entities must operate at LOD2–LOD4 (aggregate group/faction updates at low Hz or event-driven sleeping), reserving full 60Hz affective evaluation strictly for LOD0/LOD1 focal agents.

---

## 3. Mathematical Parameter Sensitivity Analysis

### 3.1 Emotional Relaxation Decay Rate ($k_{\text{decay}}$)
Fear decay follows discrete exponential relaxation per tick:
$$\text{fear}_{t+1} = \text{fear}_t \cdot k_{\text{decay}}^{\Delta t / 0.0166}$$

The effective half-life $\tau_{1/2}$ in seconds is given by:
$$\tau_{1/2} = \frac{\ln(0.5)}{\ln(k_{\text{decay}})} \cdot 0.0166\,\text{s}$$

| Parameter Configuration | Base $k_{\text{decay}}$ | Environmental Mod | Effective $k$ | Half-Life $\tau_{1/2}$ | Behavioral Dynamic |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **High Resilience ($R=0.9, N=0.2$)** | 0.888 | Sanctuary ($1.5\times$ rate) | 0.835 | **0.063 s** (Instant Composure) | Rapid shock recovery |
| **Neutral Baseline ($R=0.5, N=0.5$)** | 0.945 | Normal ($1.0\times$) | 0.945 | **0.207 s** (Nominal) | Standard pacing |
| **High Neuroticism ($R=0.2, N=0.8$)** | 0.980 | Normal ($1.0\times$) | 0.980 | **0.570 s** (Protracted) | Lingering vigilance |
| **Trauma Zone ($R=0.2, N=0.8$)** | 0.980 | Hazard ($0.6\times$ rate) | 0.988 | **1.150 s** (Per-Tick Locked) | Near-permanent dread |

**Stability Boundary**: $k_{\text{decay}}$ is hard-clamped to $[0.75, 0.98]$. If $k_{\text{decay}} \ge 1.0$, fear becomes an unbounded integrator, violating the finite recovery latency invariant. If $k_{\text{decay}} < 0.70$, emotional persistence collapses, rendering fear indistinguishable from memoryless FSMs.

### 3.2 Social Contagion Coupling & Stability Bounds
Emotional contagion between peer agents is evaluated via `ContagionGraph`:
$$I_{\text{contagion}} = \sum_{j \in \text{Peers}} \text{fear}_j \cdot \left(1 - \frac{d_{ij}}{R_{\text{contagion}}}\right) \cdot \alpha_{\text{base}} \cdot \beta_{\text{scream}} \cdot S_i$$
where:
- $R_{\text{contagion}} = 300.0$ (default spatial contagion radius units; configurable per host game scale).
- $\alpha_{\text{base}} = 0.40$ (default base coupling strength `baseContagionStrength`).
- $\beta_{\text{scream}} = 1.80$ (default scream multiplier `screamMultiplier`).
- $S_i = (0.5 + 0.5 \cdot E_i) \cdot (0.6 + 0.8 \cdot N_i)$ (individual susceptibility from Extraversion $E_i$ and Neuroticism $N_i$).

**Bifurcation Analysis & Boundary Conditions**:
In a tightly clustered group ($N$ agents with $d_{ij} \approx 0$), the loop gain $G$ of mutual contagion is:
$$G = (N - 1) \cdot \alpha_{\text{base}} \cdot \bar{S}$$
- If $G > 1.0$ and agents remain stationary, a **self-sustaining runaway panic loop** occurs: agent A panics agent B, who screams and reinforces agent A, permanently preventing decay even after the physical threat despawns.
- **Circuit Breakers, Kinematics & Architectural Reality**:
  1. **Host Game Physics & Spatial Attenuation**: Fear AI outputs **strictly advisory heading vectors** (`PackCoordinationEngine` alpha panic issues `SCATTER_DISPERSE` vectors). The **host game retains exclusive authority over physical translation**.
  2. **Dispersion Kinematics**:
     - At $60\,\text{Hz}$ ($\Delta t = 0.0166\,\text{s}$), $10$ simulation ticks represent only $0.166\,\text{s}$.
     - If two agents flee in opposite directions at $v = 4.0\,\text{units/s}$ ($8.0\,\text{units/s}$ relative velocity), they separate by only $1.33\,\text{units}$ after $10$ ticks.
     - To fully exit the default $R_{\text{contagion}} = 300$ radius, agents require:
       $$t_{\text{separation}} = \frac{300\,\text{units}}{8.0\,\text{units/s}} = 37.5\,\text{s} \approx 2250\,\text{ticks}$$
  3. **Confined Geometry / Stationary Boundary Condition**: If agents are physically confined by host world geometry (e.g. locked in an enclosed room) or the host cannot translate them, mutual contagion *will* self-sustain high fear until an external stimulus occurs (e.g. host calming item, sedation, or a calm leader).
  4. **Leader Calm Reassurance**: Calm leaders project damping field $D_{\text{calm}} = L_{\text{leader}} \cdot (1 - d/R_{\text{leader}}) \cdot 0.35$ (default $R_{\text{leader}} = 250$) that counteracts peer contagion.
  5. **Output Clamping**: `contagionFear` is strictly clamped to $[0.0, 1.0]$.

### 3.3 Dynamic Economic Price Elasticity
In `EconomicFeedbackSystem`:
$$\text{Price} = \text{BasePrice} \cdot \left(1.0 + \frac{\text{Deficit}}{\max(1.0, \text{Stockpile} + 10.0)}\right)$$
- When $\text{Stockpile} \to 0$, $\text{Price} \to \text{BasePrice} \cdot (1 + \text{Target}/10)$.
- For target $400$ and base $10.0$, the unconstrained multiplier would reach $41\times$.
- **Hard Stability Ceiling**: `EconomicFeedbackSystem` enforces `maxPriceMultiplier = 10.0`, capping prices at $10\times$ base. This strictly prevents hyper-inflationary singularities from corrupting downstream trade routes and migration equations.

---

## 4. Designer Calibration Guidelines

Game designers integrating Fear AI into host engines should observe these operational bounding rules:

1. **Never Set Uniform OCEAN Trait Profiles**:
   - Squads where all NPCs share identical $(N=0.8, R=0.2)$ will exhibit simultaneous synchronized panic and lockup. Always inject natural variance ($\sigma \ge 0.15$) across squad members to ensure diverse tactical responses (some flee, some hold ground, some scatter).
2. **Always Pair Acute Fear with Spatial Dispersal**:
   - High fear must translate into host movement (flight, seeking cover, or scattering). Confining panicking NPCs in a locked room without spatial decay will trigger infinite peer contagion loops unless calm leaders or sedative items are present.
3. **Calibrate Rumor Lifespans to World Travel Times**:
   - Set rumor `tickDecay = 0.01` and `hopDecay = 0.85` so that unconfirmed hearsay naturally dies out within $3–5$ minutes of game time, preventing stale misinformation from permanently blighting trade corridors.
