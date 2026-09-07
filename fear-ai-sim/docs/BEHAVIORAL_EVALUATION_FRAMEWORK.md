---
title: Fear AI Behavioral Evaluation Benchmark (FABE & FABE v2) Specification
created: 2026-09-06
updated: 2026-09-07
type: specification
status: active
---

# Fear AI Behavioral Evaluation Benchmark (FABE & FABE v2) Specification

> **Attribution Note**:
> Evaluation design informed by controlled, replayable affective-simulation principles seen in work such as *AffectSim* (August 2026). While *AffectSim* studies embodied affective perception across 27k+ 3D episodes focusing on observation-gap recovery, Macro-F1, and path-aware E-SPL under sensory occlusion, **FABE** specifically isolates agentic emotional cognition, hysteresis stability, personality differentiation, and social contagion across game AI architectures.

---

## 1. Thesis: Universal Architecture $\neq$ World's Best Fear AI

Proving that Fear AI functions as a universal, engine-agnostic middleware is an architectural milestone. However, claiming that Fear AI is the **world's premier affective intelligence system** requires an empirical, scientific evaluation program, not merely passing unit tests or maximizing raw variance.

The goal of this framework is to establish an authoritative, three-layer scientific evaluation stack comparing Fear AI against both naive and competitive game AI paradigms, systematic component ablations, and controlled sensor perturbations.

---

## 2. The Three-Layer Evaluation Stack

To transition from metric maximization toward defensible behavioral science, FABE is organized into three distinct verification tiers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 3: Ecological Realism & Blinded Player Believability Trials       │
│ • Double-blind force-choice and Likert trials with human players        │
│ • Standardized scenario pairs exported via Blinded Protocol             │
├─────────────────────────────────────────────────────────────────────────┤
│ Layer 2: Generalization, Calibration, and Trajectory Traceability       │
│ • Persona Traceability: Nearest-Neighbor retrieval (Top-1 / Top-3)      │
│ • Spearman Rank Correlation: rho(Delta_OCEAN, Delta_Behavior)           │
│ • Target-Calibrated Desirability Curves (CDS): Non-lethal habituation   │
│ • Sensor Noise Battery: +/-20% Gaussian distance error + occlusion      │
├─────────────────────────────────────────────────────────────────────────┤
│ Layer 1: Internal Mechanisms & Component Ablations                      │
│ • Subsystem isolation: OCEAN, Hysteresis, Habituation, Contagion        │
│ • Competitive Baselines: FSM, FSM+Memory, BT, BT+Blackboard, Utility AI │
│ • Execution Latency: Isolated microsecond budget per agent              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Competitive Baselines & Ablation Matrix

Rather than comparing against trivial or crippled baselines, FABE tests Fear AI against six competitive game AI architectures and four component ablations:

### 3.1 The Competitive Baselines

1. **Baseline 1: Standard Finite State Machine (FSM)**
   - 4 discrete states: `IDLE` $\to$ `ALERT` $\to$ `FLEE` $\to$ `FREEZE`.
   - Rigid distance thresholds (`dist < 3m` $\to$ `FREEZE`, `dist < 8m + 4m * N` $\to$ `FLEE`).
   - Memoryless: instantaneous state collapse upon stimulus removal.

2. **Baseline 2: FSM + Habituation Memory**
   - Incorporates per-threat exposure counters.
   - Dampens stimulus impact via $1 / (1 + \text{count} \cdot 0.20)$.
   - Evaluates whether basic state machines with memory can match continuous habituation.

3. **Baseline 3: Standard Behavior Tree (BT)**
   - Hierarchical Selector/Sequence tree evaluating condition nodes per tick.
   - Cooldown hold timers (5 ticks) to prevent immediate state flicker.

4. **Baseline 4: Behavior Tree + Shared Blackboard Contagion**
   - Extends the BT with a shared global blackboard tracking `panickingCount`.
   - Evaluates group panic sensing through standard game AI blackboard coordination.

5. **Baseline 5: Continuous Scalar Fear with Hysteresis**
   - Maintains a single float fear value $F \in [0.0, 1.0]$ with exponential cooldown decay ($F_{t+1} = F_t \cdot 0.94$).
   - Implements dual-threshold hysteresis (Enter Panic $\ge 0.75$, Exit Panic $< 0.40$).
   - Tests whether a scalar float without Big-Five personality or PAD vectors suffices.

6. **Baseline 6: Utility AI with Multi-Trait Personality Curves**
   - Action set: $\{\text{FLEE}, \text{FREEZE}, \text{CONFRONT}, \text{EXPLORE}\}$.
   - Multi-trait utility curves based on neuroticism, resilience, extraversion, openness, and agreeableness.
   - Tests personality differentiation in utility decision-making without dynamic emotional trajectories.

### 3.2 Fear AI Component Ablations

To answer *"how much value does each subsystem actually buy?"*, Fear AI is evaluated under four distinct ablations:

1. **Full Fear AI (Production)**: Complete fusion of Big-Five (OCEAN), 3D PAD emotional vectors, FearCore 11-band hysteresis, Habituation, ContagionGraph, and Psychoacoustics.
2. **Ablation 1: Fear AI (No OCEAN)**: All personality traits neutralized to $0.5$. Tests whether Big-Five traits drive behavioral variance or are cosmetic.
3. **Ablation 2: Fear AI (No Hysteresis)**: Zero panic lock (`panicLockTicks = 0`) and collapsed enter/exit thresholds. Tests the necessity of hysteresis for transition stability.
4. **Ablation 3: Fear AI (No Habituation)**: Threat exposure desensitization bypassed. Tests repeated stimulus response.
5. **Ablation 4: Fear AI (No Contagion)**: Agents ticked with zero peer contagion influence. Tests social realism.

---

## 4. FABE v2 Advanced Formulations & Methodology

### 4.1 Construct Validity & Latent Factor Dynamics (*Beyond Asking* Standard)

Merely defining personality parameters in an agent profile does not establish that the simulation possesses **construct validity**. Under the *Beyond Asking* standard (arXiv:2608.16196), traits cannot be assumed to function simply because an author labeled them; each claimed trait must earn admission through empirical falsification:

1. **Univariate Monotonicity Sweeps**:
   - For each trait $T \in \{O, C, E, A, N, R, L\}$, the parameter is swept across its domain ($0.10$ to $1.00$ in increments of $0.15$) while holding all orthogonal traits at neutral $0.50$ across 10 deterministic frozen seeds.
   - The dedicated behavioral signature is measured (e.g., flight threat sensitivity for $N$, recovery speed for $R$, auditory investigation dwell for $O$, contagion fear absorption for $E$, pro-social warning/clustering for $A$, tactical posture discipline for $C$, calm transmission for $L$).
   - The Spearman rank correlation $\rho(T, \text{Signature})$ is calculated. Monotonicity criterion: $\rho(T, \text{Signature}) \ge 0.85$.

2. **Orthogonal Cross-Talk Verification & Latent Entanglement Classification**:
   - Evaluates whether varying trait $T_i$ induces off-diagonal shifts on orthogonal behavioral signatures $S_j$ ($i \ne j$).
   - Under the *Beyond Asking* criterion, any off-diagonal $|\rho(T_i, S_j)| > 0.50$ flags cross-talk and disqualifies a trait from clean isolation.
   - Empirical sweeps reveal that **$O, E, A, C, L$ achieve clean isolation**, whereas **$N$ and $R$ fail independent isolation** due to strong off-diagonal coupling ($N \to R = -1.00, O = -0.51, A = -0.80, C = -1.00$; $R \to C = 1.00$).
   - Rather than masking this leakage, FABE v2 reclassifies $N$ and $R$ as **`ENTANGLED / NOT_ISOLATED (COUPLED LATENT DRIVERS)`**.

3. **Multivariate Factorial Validation of Coupled Latent Drivers**:
   - To rigorously model coupled latent drivers without assuming artificial orthogonality, FABE v2 fits 2-way response surface regressions over $5 \times 5$ factorial grid sweeps (25 design points $\times$ 10 deterministic seeds = 250 simulation runs per pair):
     $$Y = \beta_0 + \beta_1 T_1 + \beta_2 T_2 + \beta_{12}(T_1 \times T_2)$$
   - Decomposes variance into Main Effect $T_1$, Main Effect $T_2$, and Non-Linear Interaction $T_1 \times T_2$, proving whether coupling represents architectural dynamics or metric leakage.

4. **Statistical Power & Empirical Near-Neighbor Resolution Thresholds ($\Delta^*$)**:
   - Near-neighbor trials are expanded to $N=50$ trials per $\Delta \in \{0.05, 0.10, 0.15, 0.20\}$ across 5 scenario regimes $\times$ 2 seeds.
   - Exact Wilson 95% CIs, Clopper-Pearson exact binomial intervals, and exact one-sided binomial $p$-values against 50% chance are computed.
   - Defines the empirical resolution threshold $\Delta^*$ as the minimum increment achieving statistically significant discrimination ($p < 0.05$, Lower Wilson $> 50\%$). Small-$\Delta$ regimes falling short are honestly classified as **`INCONCLUSIVE`**.

### 4.2 Expanded Persona Traceability ($K=60$ Continuous & Near-Neighbor Cohort)

Inspired by *One Policy, Infinite NPCs* and *AffectSim*, FABE v2 evaluates whether an agent's behavioral trajectory uniquely identifies its psychological persona under perturbation:

1. **Expanded $K=60$ Cohort**:
   - **12 Canonical Archetypes**: Diverse polar profiles (*Cowardly Civilian*, *Stoic Veteran*, *Impulsive Scout*, *Protective Leader*, *Paranoid Watcher*, *Curious Scholar*, *Compliant Follower*, *Aggressive Defender*, *Frozen Bystander*, *Reckless Daredevil*, *Resilient Medic*, *Despondent Fatalist*).
   - **24 Continuous Hypercube Samples**: Uniformly sampled across the multi-dimensional Big-Five hypercube ($[0.10, 0.90]$).
   - **24 Near-Neighbor Variants**: Derived by applying fine-grained perturbations ($\Delta = 0.10$) to canonical archetypes.

2. **Dual-Regime Evaluation**:
   - **Regime 1: Within-Scenario Repeatability**: Calibration battery (Stalker Proximity, Jump-Scare Ambush, Auditory Whispers, Social Contagion; 80 ticks) under $\pm 5\%$ distance perturbation.
   - **Regime 2: Frozen Held-Out Generalization**: 4 completely unseen evaluation scenarios with distinct threat schedules and maps:
     1. *Claustrophobic Intermittent Stalker* (20 ticks): Non-linear corridor approach with sudden acoustic metallic clangs.
     2. *Multi-Threat Pincer with Environmental Distraction* (20 ticks): Dual converging threats with steam vent distraction.
     3. *Asymmetric Squad Evacuation* (20 ticks): Panicking civilian crowd with distant leader calm.
     4. *Sensory Deprivation & Delayed Shock Ambush* (20 ticks): Tense anticipation followed by sudden monster breach and extended recovery cooldown.

3. **Paired Statistical Inference (McNemar Test on $K=60$)**:
   - To determine whether Fear AI's persona retrieval superiority over personality-weighted Utility AI is statistically significant, FABE v2 executes a paired **McNemar test** on the $K=60$ personas:
     $$\chi^2 = \frac{(|b - c| - 1)^2}{b + c}$$
     where $b$ is Fear AI only success, and $c$ is Utility AI only success (Edwards continuity correction), alongside exact two-tailed binomial $p$-values.

4. **The Spearman Rank Correlation Disconnect**:
   - Evaluates rank correlation $\rho(\Delta_{\text{OCEAN}}, \Delta_{\text{Behavior}})$ across all 1,770 persona pairs.
   - **Scientific Insight**: Crude 1D threshold models (BT, FSM) can achieve high Spearman rank correlation ($\rho \approx 0.58 - 0.60$) because scalar mapping is strictly monotonic along a line, yet they collapse to just $2/60$ ($3.3\%$) Top-1 retrieval. Fear AI preserves multidimensional behavioral dispersion, achieving high Top-1 retrieval ($93.3\%$) alongside continuous affective modulation.

### 4.3 Designer-Calibrated Ludological Desirability Curves (CDS)

> [!NOTE]
> Habituation targets are explicitly classified as **`DESIGNER_CALIBRATED / LUDOLOGICAL_EXPERIMENTAL_TARGETS`**. Human empirical literature demonstrates that fear habituation varies widely across individuals (studies show ~37% habituate, ~47% sensitize, and ~16% remain stable). In game AI, 25% habituation is an intentional ludological target designed to prevent both infinite unplayable terror loops and suicidal predator indifference.

- **Non-Lethal Habituation Target**: **$25\%$** ($0.25$).
- **Leader Panic Damping Target**: **$40\%$** ($0.40$).
- **Hysteresis Smoothness Target (HRS)**: **$1.00$**.
$$\text{Score}_{\text{hab}} = \max\left(0, 1.0 - \frac{|\text{Actual}_{\text{hab}} - 0.25|}{0.25}\right), \quad \text{Score}_{\text{damp}} = \max\left(0, 1.0 - \frac{|\text{Actual}_{\text{damp}} - 0.40|}{0.40}\right)$$
$$\text{CDS} = \frac{\text{Score}_{\text{hab}} + \text{Score}_{\text{damp}} + \text{HRS}}{3}$$

### 4.4 Layer 2 Generalization & Sensor Noise Battery (Robust Under Tested Noise Conditions)

- Evaluated over **10 frozen deterministic seeds** (`[1337, 2026, 3141, 4096, 5555, 6789, 7777, 8888, 9123, 9999]`).
- Tests hovering threat near decision threshold ($8.0\text{m} \pm 20\%$ Gaussian noise) with $20\%$ intermittent occlusion.
- Quantifies **State Chatter Transitions** (flips per episode) and **Urgency Trajectory Variance**.

### 4.5 Layer 3 Protocol: Blinded Human Evaluation Preparation

- Status: **`HUMAN_EVALUATION_PREPARED (BLOCKED_EXTERNAL_PARTICIPANTS)`**.
- Exports `benchmarks/behavioral-evaluation/blinded_evaluation_pairs.json` with 20 randomized, double-blinded trajectory pairs.
- Calibrated to acknowledge baseline human annotator difficulty (~0.558 accuracy, Fleiss' $\kappa \approx 0.303$).

---

## 5. Empirical Scorecards

### 5.1 Construct Validity & Latent Factor Analysis (`construct_validity_sweeps.mjs`)

#### Primary Trait Monotonicity & Isolation Classification

| Trait | Dedicated Behavioral Signature | Spearman $\rho$ | Isolation Status | Verdict |
| :--- | :--- | :---: | :---: | :---: |
| **Neuroticism (N)** | Flight Initiation Distance (FID) | **1.0000** | Cross-Talk Leaks ($R, O, A, C$) | **ENTANGLED / NOT_ISOLATED** |
| **Resilience (R)** | Post-Threat Recovery Speed | **1.0000** | Cross-Talk Leak ($C$) | **ENTANGLED / NOT_ISOLATED** |
| **Openness (O)** | Auditory Curiosity & Investigation | **0.9636** | Bounded ($|\rho| \le 0.00$) | **ISOLATED (PASS)** |
| **Extraversion (E)** | Social Contagion Fear Susceptibility | **1.0000** | Bounded ($|\rho| \le 0.00$) | **ISOLATED (PASS)** |
| **Agreeableness (A)** | Pro-Social Warning & Calm Receptivity | **0.9910** | Bounded ($|\rho| \le 0.00$) | **ISOLATED (PASS)** |
| **Conscientiousness (C)** | Tactical Posture Discipline & Composure | **1.0000** | Bounded ($|\rho| \le 0.00$) | **ISOLATED (PASS)** |
| **Leadership (L)** | Leader Calm Transmission to Follower | **1.0000** | Bounded ($|\rho| \le 0.00$) | **ISOLATED (PASS)** |

#### Orthogonal Cross-Talk Matrix ($|\rho(T_i, S_j)|$)

| Trait ($T_i$) | NEUR ($S_N$) | RESI ($S_R$) | OPEN ($S_O$) | EXTR ($S_E$) | AGRE ($S_A$) | CONS ($S_C$) | LEAD ($S_L$) | Flagged Leaks ($|\rho| > 0.50$) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Neuroticism (N)** | **1.00** | **-1.00** | **-0.51** | 0.00 | **-0.80** | **-1.00** | 0.00 | $R(-1.00), O(-0.51), A(-0.80), C(-1.00)$ |
| **Resilience (R)** | 0.00 | **1.00** | 0.00 | 0.00 | 0.00 | **1.00** | 0.00 | $C(+1.00)$ |
| **Openness (O)** | 0.00 | 0.00 | **0.96** | 0.00 | 0.00 | 0.00 | 0.00 | None |
| **Extraversion (E)** | 0.00 | 0.00 | 0.00 | **1.00** | 0.00 | 0.00 | 0.00 | None |
| **Agreeableness (A)** | 0.00 | 0.00 | 0.00 | 0.00 | **0.99** | 0.00 | 0.00 | None |
| **Conscientiousness (C)** | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | **1.00** | 0.00 | None |
| **Leadership (L)** | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | **1.00** | None |

#### Multivariate Factorial Validation (`multivariate_trait_analysis.mjs`)

*Design: $5 \times 5$ Factorial Grid Sweeps across 10 Frozen Seeds ($N=250$ runs, $G=10$ seed clusters, $df=9$, Cluster-Robust Sandwich Covariance Matrix CRVE)*

| Trait Pair | Target Behavioral Metric | Full $R^2$ | Additive $R^2$ | Partial Int $\Delta R^2_{\text{int}}$ | Clustered Coefs ($\beta$, $SE_{\text{clust}}$, $p$-val, 95% CI) | Substantive Classification & Mechanism |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **$N \times R$** | Post-Threat Recovery Speed | **94.19%** | **93.22%** | **0.97%** | $\beta_1=-49.26$ ($SE=0.13, p=3.3\times 10^{-20}$)<br>$\beta_2=32.47$ ($SE=0.08, p=2.0\times 10^{-20}$)<br>$\beta_{12}=24.55$ ($SE=0.13, p=2.2\times 10^{-17}$) | **PREDOMINANTLY ADDITIVE MAIN EFFECTS**: Opposing dynamic interplay of acute fear inflow ($N$) and exponential decay ($\lambda_{\text{decay}}$). Additive model captures 93.2% of variance; non-linear interaction contribution is $<1\%$. |
| **$N \times C$** | Tactical Posture Discipline | **56.95%** | **56.12%** | **0.83%** | $\beta_1=-32.28$ ($SE=0.49, p=2.2\times 10^{-13}$)<br>$\beta_2=35.65$ ($SE=0.49, p=8.8\times 10^{-14}$)<br>$\beta_{12}=26.55$ ($SE=0.43, p=3.6\times 10^{-13}$) | **PREDOMINANTLY ADDITIVE (Hierarchical Gating)**: Conscientiousness elevates baseline composure; high Neuroticism triggers acute PANIC band override, selectively suppressing deliberate posture. |
| **$N \times A$** | Pro-Social Warning & Calm | **56.54%** | **56.40%** | **0.14%** | $\beta_1=-1.75$ ($SE=0.05, p=6.6\times 10^{-11}$)<br>$\beta_2=10.59$ ($SE=0.01, p=3.2\times 10^{-23}$)<br>$\beta_{12}=2.48$ ($SE=0.06, p=2.4\times 10^{-11}$) | **PREDOMINANTLY ADDITIVE (Affiliation Budget)**: Agreeableness drives cooperative warning frequency, while Neuroticism reallocates cognitive-affective bandwidth toward egocentric survival. |
| **$R \times C$** | Post-Shock Composure Retention | **53.79%** | **53.77%** | **0.03%** | $\beta_1=6.43$ ($SE=0.07, p=1.2\times 10^{-14}$)<br>$\beta_2=51.30$ ($SE=0.36, p=2.3\times 10^{-16}$)<br>$\beta_{12}=-4.45$ ($SE=0.15, p=2.2\times 10^{-10}$) | **PREDOMINANTLY ADDITIVE (Recovery Synergy)**: Resilience rapidly evacuates residual acute fear, allowing Conscientiousness-driven defensive stances to re-engage with minimal post-threat disorientation. |

#### Near-Neighbor Sensitivity & Empirical Resolution Thresholds ($N=50$ Trials per $\Delta$)

*Multiple Comparison Correction: 7 traits $\times$ 4 $\Delta$ levels = 28 tests ($\alpha_{\text{Bonferroni}} = 0.05 / 28 = 0.00179$)*

| Trait | $\Delta = 0.05$ [Wilson 95%] | $\Delta = 0.10$ [Wilson 95%] | $\Delta = 0.15$ [Wilson 95%] | $\Delta = 0.20$ [Wilson 95%] | Empirical $\Delta^*$ | Resolution Status | Multiple Comparisons Audit |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Neuroticism (N)** | **100% [93-100%]** | 100% [93-100%] | 100% [93-100%] | 100% [93-100%] | **$\Delta = 0.05$** | **VERIFIED** | $p = 8.88 \times 10^{-16}$ (survives Bonferroni) |
| **Resilience (R)** | **88% [76-94%]** | 100% [93-100%] | 100% [93-100%] | 100% [93-100%] | **$\Delta = 0.05$** | **VERIFIED** | $p = 1.62 \times 10^{-8}$ (survives Bonferroni) |
| **Openness (O)** | 60% [46-72%] | 60% [46-72%] | 60% [46-72%] | **80% [67-89%]** | **$\Delta = 0.20$** | **VERIFIED** | $p = 1.19 \times 10^{-5}$ (survives Bonferroni; inconclusive at $\Delta \le 0.15$) |
| **Extraversion (E)** | **100% [93-100%]** | 100% [93-100%] | 100% [93-100%] | 100% [93-100%] | **$\Delta = 0.05$** | **VERIFIED** | $p = 8.88 \times 10^{-16}$ (survives Bonferroni) |
| **Agreeableness (A)** | 44% [31-58%] | **64% [50-76%]** | 64% [50-76%] | 64% [50-76%] | **$\Delta = 0.10$** | **PROVISIONAL EVIDENCE (PENDING REPLICATION)** | Nominal $p = 0.0325$ (32/50 correct); fails Bonferroni ($\alpha = 0.00179$). Requires multi-scenario suite before freezing. |
| **Conscientiousness (C)** | **100% [93-100%]** | 100% [93-100%] | 100% [93-100%] | 100% [93-100%] | **$\Delta = 0.05$** | **VERIFIED** | $p = 8.88 \times 10^{-16}$ (survives Bonferroni) |
| **Leadership (L)** | **100% [93-100%]** | 100% [93-100%] | 100% [93-100%] | 100% [93-100%] | **$\Delta = 0.05$** | **VERIFIED** | $p = 8.88 \times 10^{-16}$ (survives Bonferroni) |

### 5.2 Layer 2: FABE v2 Persona Traceability ($K=60$ Cohort, `fabe_v2_benchmark.mjs`)

#### Within-Scenario Repeatability ($\pm 5\%$ Perturbation)

| Model Architecture | Top-1 Acc [Wilson CI] [Clopper-Pearson] | Top-3 Acc [Wilson CI] [Clopper-Pearson] | Spearman $\rho$ |
| :--- | :---: | :---: | :---: |
| **Fear AI (Full Middleware)** | **93.3% [84.1-97.4%] [83.8-98.2%]** (56/60) | **98.3% [91.1-99.7%] [91.1-100.0%]** (59/60) | 0.5498 |
| **Utility AI (Personality-Weighted)** | 66.7% [54.1-77.3%] [53.3-78.3%] (40/60) | 100.0% [94.0-100.0%] [94.0-100.0%] (60/60) | 0.5025 |
| **Standard Behavior Tree** | 3.3% [0.9-11.4%] [0.4-11.5%] (2/60) | 6.7% [2.6-15.9%] [1.8-16.2%] (4/60) | 0.5809 |
| **Standard FSM Baseline** | 3.3% [0.9-11.4%] [0.4-11.5%] (2/60) | 13.3% [6.9-24.2%] [5.9-24.6%] (8/60) | 0.5999 |

#### Frozen Held-Out Generalization (4 Unseen Scenarios, $\pm 5\%$ Perturbation)

| Model Architecture | Top-1 Acc [Wilson CI] [Clopper-Pearson] | Top-3 Acc [Wilson CI] [Clopper-Pearson] | Spearman $\rho$ |
| :--- | :---: | :---: | :---: |
| **Fear AI (Full Middleware)** | **18.3% [10.6-29.9%] [9.5-30.4%]** (11/60) | **41.7% [30.1-54.3%] [29.1-55.1%]** (25/60) | 0.4092 |
| **Utility AI (Personality-Weighted)** | **76.7% [64.6-85.6%] [64.0-86.6%]** (46/60) | **100.0% [94.0-100.0%] [94.0-100.0%]** (60/60) | 0.5449 |
| **Standard Behavior Tree** | 3.3% [0.9-11.4%] [0.4-11.5%] (2/60) | 16.7% [9.3-28.0%] [8.3-28.5%] (10/60) | 0.5954 |
| **Standard FSM Baseline** | 8.3% [3.6-18.1%] [2.8-18.4%] (5/60) | 25.0% [15.8-37.2%] [14.7-37.9%] (15/60) | 0.6059 |

#### Paired McNemar Test (Fear AI vs Utility AI on $K=60$)

| Evaluation Regime | Both (+) | Fear AI Only ($b$) | Utility AI Only ($c$) | Both (-) | Exact Paired McNemar Test | Edwards $\chi^2$ | Statistical Inference |
| :--- | :---: | :---: | :---: | :---: | :--- | :---: | :--- |
| **Repeatability ($\pm 5\%$)** | 37 | **19** | 3 | 1 | **19 Fear-only vs 3 Utility-only, two-sided $p = 8.55 \times 10^{-4}$** | 10.23 | **Fear AI Statistically Superior ($p < 0.001$)** |
| **Held-Out Unseen ($\pm 5\%$)** | 8 | 3 | **38** | 11 | **3 Fear-only vs 38 Utility-only, two-sided $p = 1.05 \times 10^{-8}$** | 28.20 | **Utility AI Statistically Superior on Cross-Scenario Identity ($p < 10^{-7}$)** |

> [!WARNING]
> **Major Empirical Discovery: The Cross-Scenario Generalization Gap**
> Fear AI Top-1 persona retrieval drops by over 75 percentage points ($93.3\% \to 18.3\%$) when transitioning from calibrated to unseen scenarios, whereas Utility AI achieves $76.7\%$.
> This is NOT merely "Utility AI lacks temporal dynamics" — on cross-scenario persona identity preservation, Utility AI currently wins decisively.
> This discovery establishes **Cross-Scenario Personality Invariance as the P1 Research Priority**.

---

### 5.3 Cross-Scenario Behavioral Invariance & Variance Decomposition Benchmark (`cross_scenario_invariance_benchmark.mjs` - LOSO V2.1 Scientific Closure)

To rigorously resolve the cross-scenario generalization drop without modifying core affective behavior (`packages/core/` strictly frozen), LOSO V2.1 evaluates persona recoverability across **12 Scenario Families across 3 Threat Domains $\times$ Dual Cohorts ($K=12$ Canonical & $K=60$ Extended) $\times$ 10 Frozen Seeds** ($N=1,440$ canonical queries, $N=7,200$ extended queries).

#### Two-Way ANOVA Variance Decomposition (with Seed Block Factor)
$$SS_{\text{Total}} = SS_{\text{Persona}} + SS_{\text{Scenario}} + SS_{\text{Persona} \times \text{Scenario}} + SS_{\text{Seed}} + SS_{\text{Residual}}$$

| Feature Name | Fear AI $\eta^2_{\text{Persona}}$ | Fear AI $\eta^2_{\text{Scenario}}$ | Fear AI $\eta^2_{\text{Interaction}}$ | Fear AI $\eta^2_{\text{Seed}}$ (Block) | Fear AI $\eta^2_{\text{Residual}}$ | Dominant Source of Variance |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`investigation_rate`** | 18.3% | **47.1%** | 34.6% | 0.00% | 0.00% | Scenario sound affordances |
| **`pro_social_rate`** | 24.7% | 18.3% | **57.0%** | 0.00% | 0.00% | **Systematic Persona $\times$ Situation interaction** |
| **`panic_rate`** | **55.1%** | 32.4% | 12.5% | 0.00% | 0.08% | Persona (Neuroticism/Resilience) |
| **`discipline_rate`** | **63.7%** | 20.9% | 15.2% | 0.00% | 0.14% | Persona (Conscientiousness) |
| **`mean_urgency`** | 25.1% | **71.3%** | 3.5% | 0.00% | 0.02% | **Scenario threat distance** |
| **`mean_dominance`** | 11.9% | **87.1%** | 1.0% | 0.00% | 0.00% | **Scenario threat intensity** |
| **`mean_fear`** | 30.6% | **62.9%** | 6.5% | 0.00% | 0.01% | **Scenario threat intensity** |
| **`recovery_efficiency`** | **99.1%** | 0.4% | 0.4% | 0.00% | 0.11% | **Persona (Resilience decay rate)** |
| **MEAN $\eta^2$ ACROSS FEATURES** | **41.1%** | **42.6%** | **16.3%** | **0.00%** | **0.05%** | **Scenario main effect dominates ($1.04\times$)** |

*Note: Seed is factored out as an ordinary ANOVA blocking factor ($<0.01\%$ variance across all features; within-cell residual is deterministic/bounded).*

#### Hierarchical Mixed-Model Variance Components (EMS Method of Moments)
$$\text{Model: } y_{pskr} = \mu + \alpha_p + \beta_s + (\alpha\beta)_{ps} + \gamma_k + \epsilon_{pskr}$$

| Feature Name | $\sigma^2_{\text{Persona}}$ Share | $\sigma^2_{\text{Scenario}}$ Share | $\sigma^2_{P \times S}$ Share | $\sigma^2_{\text{Seed}}$ Share | $\sigma^2_{\text{Residual}}$ Share | Scientific Substantive Interpretation |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`investigation_rate`** | 15.6% | 45.4% | 39.0% | 0.00% | 0.00% | High situation dependence modulated by curiosity |
| **`pro_social_rate`** | 20.6% | 13.8% | **65.6%** | 0.00% | 0.00% | **Decisive proof: systematic interaction, 0.0% within-cell noise** |
| **`panic_rate`** | 54.5% | 31.6% | 13.7% | 0.00% | 0.09% | Persona-dominant thresholding across acute stressors |
| **`discipline_rate`** | 63.2% | 19.8% | 16.8% | 0.00% | 0.15% | Persona-dominant action persistence |
| **`mean_urgency`** | 24.9% | 71.2% | 3.9% | 0.00% | 0.02% | Environmental distance drives subjective urgency |
| **`mean_dominance`** | 11.8% | 87.1% | 1.1% | 0.00% | 0.00% | Environmental threat severity dominates internal control |
| **`mean_fear`** | 30.2% | 62.6% | 7.1% | 0.00% | 0.01% | Environmental threat shock with moderate persona modulation |
| **`recovery_efficiency`** | 99.1% | 0.3% | 0.4% | 0.00% | 0.11% | Persona decay parameter dominates post-stress cooldown |
| **MEAN VARIANCE SHARE** | **40.0%** | **41.5%** | **18.5%** | **0.00%** | **0.05%** | **Situational shift ($41.5\%$) vs Persona ($40.0\%$) vs Interaction ($18.5\%$)** |

#### Transductive Calibration Curve: How Much Unseen Target Data Does Fear AI Require?

To empirically disentangle **Mode B (Sample-Limited Transductive Domain Adaptation)** from **Mode C (Target Diagnostic Oracle)**, we evaluate how many unlabelled trajectories ($m \in \{5, 10, 20, 40\}$) are required to recover latent persona identity in an unseen scenario, strictly excluding the evaluated query trajectory itself:

| Calibration Sample Size ($m$) | Fear AI Top-1 ($K=12$) [Task 95% CI] | Fear AI Top-1 ($K=60$) [Task 95% CI] | Operational Regime |
| :--- | :---: | :---: | :--- |
| **Mode A ($m=0$ / Inductive Ridge)** | 31.7% [22.7% - 41.0%] | 9.0% [4.8% - 13.8%] | Zero target data (inductive descriptor transfer) |
| **Mode B ($m=5$ unlabelled trajectories)** | **55.7% [50.6% - 61.0%]** | **19.7% [17.3% - 22.4%]** | Minimal field adaptation (+24.0pp jump at $K=12$) |
| **Mode B ($m=10$ trajectories)** | 60.8% [54.9% - 66.7%] | 25.3% [21.1% - 30.1%] | Low-sample adaptation |
| **Mode B ($m=20$ trajectories)** | 64.2% [57.1% - 71.0%] | 28.1% [23.2% - 33.3%] | Medium-sample adaptation (approaches oracle) |
| **Mode B ($m=40$ trajectories)** | 65.6% [58.4% - 71.8%] | 30.5% [24.9% - 36.7%] | High-sample adaptation (saturates oracle) |
| **Mode C (Diagnostic Oracle)** | **66.1% [59.1% - 72.4%]** | **32.4% [25.2% - 40.2%]** | Theoretical upper bound (full target cohort) |

*Key Takeaway: With just $m=5$ unlabelled trajectories, Fear AI recovers +24.0 percentage points of persona retrieval accuracy at $K=12$ and more than doubles its accuracy at $K=60$ ($9.0\% \to 19.7\%$). At $m=40$, transductive adaptation virtually saturates oracle diagnostic performance.*

#### Disentangled Normalization Provenance & Clustered Paired Inference ($K=12$, $N=1,440$ Queries)

| Model & Representation Condition | Top-1 Acc | Task-Cluster Bootstrap 95% CI | Persona-Cluster Bootstrap 95% CI | Fold Distribution (Mean / Med / Min / Max) | Paired Fold Test ($df=11$) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Fear AI (Raw Feature Vectors)** | 48.1% | [36.2% - 58.6%] | [32.9% - 63.5%] | 48.1% / 54.2% / 8.3% / 75.0% | Baseline |
| **Fear AI (Mode A: Inductive SD Normalized)** | 31.7% | [22.7% - 41.0%] | [21.5% - 43.5%] | 31.7% / 25.0% / 8.3% / 58.3% | $\Delta = -16.4\%$ ($t=-2.66, p=0.0223$) |
| **Fear AI (Mode A: Mean Residualization Only)**| 42.9% | [32.6% - 52.8%] | [29.0% - 57.4%] | 42.9% / 45.8% / 8.3% / 75.0% | **+11.2% over SD normalization** |
| **Fear AI (Mode B: $m=20$ Transductive)** | 64.2% | [57.1% - 71.0%] | [49.9% - 77.9%] | 64.2% / 62.1% / 47.5% / 82.5% | $+16.1\%$ over Raw ($t=+2.92, p=0.0139$) |
| **Fear AI (Mode C: Population Oracle)** | **66.1%** | **[59.1% - 72.4%]** | **[51.0% - 81.0%]** | **66.1% / 66.7% / 49.2% / 83.3%** | **$+18.0\%$ over Raw ($t=+3.21, p=0.0084$)** |
| **Utility AI Baseline (Raw Vectors)** | 35.1% | [29.3% - 40.7%] | [20.7% - 51.3%] | 35.1% / 35.8% / 16.7% / 50.0% | Fear vs Util Raw: $t=+2.36, p=0.0379$, $W=14.5$ ($p=0.042$) |
| **Utility AI Baseline (Mode C: Oracle)** | 35.7% | [28.1% - 43.1%] | [22.5% - 49.9%] | 35.7% / 33.3% / 8.3% / 58.3% | Fear vs Util Oracle: $t=+6.41, p<0.0001$, $W=1.0$ ($p=0.00098$) |

#### High-Dimensional Extended Cohort ($K=60$, $N=7,200$ Queries) & Direct Paired Inference

| Condition / Representation | Fear AI Top-1 ($K=60$) [Task 95% CI] | Utility AI Top-1 ($K=60$) [Task 95% CI] | Random Floor | Direct Paired Inference ($df=11$) |
| :--- | :---: | :---: | :---: | :--- |
| **Raw Behavioral Vectors** | 15.2% [10.8% - 19.5%] | 11.3% [8.5% - 15.0%] | 1.67% | $t=+1.52, p=0.156$; Wilcoxon $W=18.0$ ($p=0.107$) (modest advantage) |
| **Mode A: Source-Only Inductive (SD)** | 9.0% [4.8% - 13.8%] | 10.7% [7.5% - 13.8%] | 1.67% | Mismatched variance scaling penalty |
| **Mode A: Mean Residualization Only** | 14.8% [9.9% - 21.1%] | 11.2% [8.2% - 14.7%] | 1.67% | Preserves feature geometry (+5.8pp over SD) |
| **Mode B: $m=20$ Transductive Adaptation** | 28.1% [23.2% - 33.4%] | 14.5% [11.8% - 17.5%] | 1.67% | Transductive adaptation recovers latent separation |
| **Mode C: Population Diagnostic Oracle** | **32.3% [25.1% - 40.2%]** | **17.4% [14.2% - 19.9%]** | 1.67% | **$t=+4.44, p=0.0010$; Wilcoxon $W=0.0$ ($p=0.00049$) (12/12 folds won)** |

#### Near-Neighbor Cross-Scenario Discrimination with Crossed Clustering & Trait Breakdown ($\Delta = 0.10$, 5,760 Decisions)

To connect cross-scenario transfer directly to construct validity, we evaluate pairwise discrimination between canonical archetypes and their single-trait perturbed near-neighbors ($\Delta = 0.10$) across all 12 held-out scenarios using a crossed cluster bootstrap ($B=1,000$ scenario resamples $\times$ $B=1,000$ persona-pair resamples):

| Trait Perturbed ($\Delta=0.10$) | Pairs Tested | Pairwise Decisions | Correct | Accuracy % | Scenario-Cluster 95% CI | Pair-Cluster 95% CI | Construct Linkage Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Conscientiousness ($C$)** | 4 | 960 | 768 | **80.0%** | [76.0% - 85.0%] | [60.0% - 100.0%] | Decisive cross-scenario transfer ($p < 10^{-15}$) |
| **Resilience ($R$)** | 4 | 960 | 581 | **60.5%** | [55.8% - 65.6%] | [52.3% - 69.8%] | Robust cross-scenario transfer |
| **Neuroticism ($N$)** | 4 | 960 | 532 | **55.4%** | [51.2% - 60.4%] | [50.4% - 60.4%] | Statistically significant transfer ($p < 0.001$) |
| **Extraversion ($E$)** | 4 | 960 | 503 | **52.4%** | [50.0% - 55.4%] | [50.0% - 56.3%] | Weak transfer (contingent on peer presence) |
| **Openness ($O$)** | 4 | 960 | 482 | **50.2%** | [49.4% - 51.2%] | [48.8% - 51.5%] | Chance floor (requires acute sensory cues) |
| **Agreeableness ($A$)** | 4 | 960 | 457 | **47.6%** | [43.3% - 50.0%] | [45.8% - 49.4%] | Chance floor (substantiates construct audit) |
| **AGGREGATE NEAR-NEIGHBOR** | **24** | **5,760** | **3,323** | **57.7%** | **[55.8% - 59.7%]** | **[52.7% - 64.3%]** | **Significantly above 50% chance floor ($p < 10^{-20}$)** |

*Validation with Construct Validity: Conscientiousness (80.0%), Resilience (60.5%), and Neuroticism (55.4%) strongly drive cross-scenario discrimination, while Openness (50.2%) and Agreeableness (47.6%) sit at or below the chance floor, reproducing the construct validity audit findings exactly.*

#### Source-Only Inductive Model Selection & Representation Audit

| Estimator Model | Representation Logic | Target Data Used | $K=12$ Top-1 | $K=60$ Top-1 | Key Insight |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Linear Ridge (Mean + Pooled SD)** | Z-score normalization | Zero | 31.7% | 10.4% | Mismatched SD distorts feature geometry |
| **Linear Ridge (Mean-Only)** | Mean residualization | Zero | **42.9%** | **14.8%** | **+11.2pp jump without any target data** |
| **Interaction-Expanded Ridge** | Quadratic cue interactions | Zero | 40.1% | 14.1% | Minor overfitting to training scenario pairs |
| **Nearest-Scenario (1-NN) Transfer**| Discrete donor matching | Zero | 34.7% | 10.1% | Donor scenario distance mismatches |
| **Global Median Residualization** | Robust central tendency | Zero | 42.5% | 14.5% | Outlier-resistant inductive baseline |

*Key Finding: Dividing by pooled training standard deviation severely distorts feature geometry when transferring to unseen scenarios with different variance envelopes. Pure mean residualization alone recovers +11.2 percentage points ($31.7\% \to 42.9\%$ at $K=12$) without requiring a single byte of target scenario data.*

#### Winner-Reversal Experimental Isolation: Old-4 Subset vs Balanced-12 Families

| Benchmark Battery | Fear AI Raw Top-1 | Utility AI Raw Top-1 | Fear AI Oracle Top-1 | Utility AI Oracle Top-1 | Isolation Resolution |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Old-4 Battery Subset (V2 $K=60$ Runner)** | 2.9% | 3.8% | 15.7% | 18.3% | **Both models collapse near floor**: episodes were uniform shock traps devoid of sound or peer opportunities |
| **Balanced-12 Families (V2 $K=60$ Runner)** | **15.2%** | 11.3% | **32.3%** | 17.4% | **Fear AI decisively wins**: cue diversity and distance profiles allow rich affective divergence |

*Resolution of the Distant Stalker Counterexample*:
In the diagnostic ledger below, Distant Stalker exhibits a **100% terminal panic lock** yet maintains **64.2% raw Top-1 retrieval**. Why?
Because the scenario features a **30-tick gradual creep** (approaching slowly from 28.0m to 2.5m). During the 25-tick pre-panic approach, agents with high Conscientiousness maintain investigation and patrol discipline, while agents with high Neuroticism build panic early. Even though all agents eventually panic when the stalker reaches 2.5m, the cumulative trajectory vectors preserve clear, distinct persona signatures. In contrast, the old 4 scenarios were instantaneous zero-distance shock traps that triggered immediate tick-0 panic locks, completely eliminating the pre-lock behavioral differentiation window.

#### Comprehensive 12-Scenario Family Diagnostic Ledger

| Scenario Family | Threat Domain | Min Dist | Panic Lock % | Fear AI Raw $\to$ Oracle | Util AI Raw $\to$ Oracle | Raw Winner |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Distant Stalker Slow Creep** | Stalking & Isolation | 10.0m | 100.0% | 64.2% $\to$ 76.7% | 25.0% $\to$ 33.3% | **Fear AI** |
| **Cornered Dead-End Standoff** | Stalking & Isolation | 1.8m | 58.3% | 65.0% $\to$ 66.7% | 30.8% $\to$ 41.7% | **Fear AI** |
| **Distant Prowler with Cues** | Stalking & Isolation | 15.0m | 0.0% | 8.3% $\to$ 57.5% | 16.7% $\to$ 16.7% | **Utility AI** |
| **Claustrophobic Corridor** | Stalking & Isolation | 3.0m | 58.3% | 58.3% $\to$ 75.0% | 46.7% $\to$ 33.3% | **Fear AI** |
| **Point-Blank Shock Surge** | Ambush & Acute Shock | 1.5m | 50.0% | 41.7% $\to$ 50.0% | 25.0% $\to$ 33.3% | **Fear AI** |
| **Dual-Angle Flanking Ambush** | Ambush & Acute Shock | 2.0m | 100.0% | 25.0% $\to$ 50.8% | 38.3% $\to$ 8.3% | **Utility AI** |
| **False Alarm Audio Lure** | Ambush & Acute Shock | 1.8m | 33.3% | 33.3% $\to$ 52.5% | 25.0% $\to$ 58.3% | **Fear AI** |
| **Relentless High-Speed Pursuit**| Ambush & Acute Shock | 2.5m | 100.0% | 50.0% $\to$ 66.7% | 47.5% $\to$ 45.0% | **Fear AI** |
| **Mass Group Panic Evacuation** | Social & Contagion | 16.0m | 100.0% | 24.2% $\to$ 83.3% | 41.7% $\to$ 50.0% | **Utility AI** |
| **Sentry Perimeter Stand-Fast** | Social & Contagion | 14.0m | 91.7% | 70.0% $\to$ 81.7% | 33.3% $\to$ 25.0% | **Fear AI** |
| **Wounded Ally Extraction** | Social & Contagion | 5.0m | 50.0% | 75.0% $\to$ 66.7% | 50.0% $\to$ 33.3% | **Fear AI** |
| **Conflicting Calm vs Panic** | Social & Contagion | 15.0m | 50.0% | 66.7% $\to$ 66.7% | 41.7% $\to$ 50.0% | **Fear AI** |

---

### 5.4 Layer 2: Designer-Calibrated Ludological Desirability Curves (CDS)

| Model Architecture | Habituation (T=25%) | Leader Damping (T=40%) | HRS (0..1) | Calibrated Desirability Score (CDS) |
| :--- | :---: | :---: | :---: | :---: |
| **Fear AI (Full Middleware)** | **46.3%** | **49.0%** | **0.9863** | **0.6360** |
| **FSM + Habituation Memory** | 100.0% | 0.0% | 0.8571 | 0.2857 |
| **Utility AI Baseline** | 0.0% | 0.0% | 1.0000 | 0.3333 |
| **BT + Shared Blackboard** | 0.0% | 0.0% | 0.5000 | 0.1667 |
| **Standard FSM Baseline** | 0.0% | 0.0% | 0.1000 | 0.0333 |

### 5.5 Layer 2: Generalization Under Sensor Noise ($\pm 20\%$) & Occlusion ($20\%$)

| Model Architecture | State Chatter Transitions (Flicker) | Urgency Trajectory Variance | Noise Assessment |
| :--- | :---: | :---: | :--- |
| **Fear AI (Full Middleware)** | **3.4 $\pm$ 0.45** | **0.0357 $\pm$ 0.0139** | **Robust under tested noise conditions** |
| **Utility AI Baseline** | 16.4 $\pm$ 4.25 | 0.0130 $\pm$ 0.0017 | Severe chattering across close utilities |
| **Standard Behavior Tree** | 0.2 $\pm$ 0.40 | 0.0292 $\pm$ 0.0095 | Rigid lockout (insufficient responsiveness) |
| **Standard FSM Baseline** | 19.5 $\pm$ 4.50 | 0.1226 $\pm$ 0.0216 | Severe border flickering |

---

## 6. Scientific Insights & Defensive Superiority

1. **Resolution of the Saturated Archetype Artifact**:
   - On coarse 12-archetype evaluations, both Utility AI and Fear AI appeared saturated at 100% Top-1 retrieval, yielding wide Wilson confidence intervals ($[75.8\%, 100\%]$).
   - When expanded to $K=60$ continuous hypercube and near-neighbor variations ($\Delta = 0.10$), Utility AI collapses to **66.7% [54.1-77.3%]**, while Fear AI maintains **93.3% [84.1-97.4%]** with non-overlapping confidence intervals and paired McNemar significance ($p = 8.55 \times 10^{-4}$).

2. **The Winner-Reversal Resolution & Old-4 Battery Isolation**:
   - *Old-4 Battery Isolation*: When evaluated inside the LOSO V2 $K=60$ runner, both models collapse near the floor on the original 4-scenario battery (Fear AI Raw 2.9% vs Utility AI Raw 3.8%; Oracle 15.7% vs 18.3%). The old episodes were uniform shock traps devoid of audio cues or peer interactions, causing immediate tick-0 panic locks that completely suppressed affective divergence.
   - *Balanced-12 Families*: Across balanced Stalking, Ambush, and Social domains, Fear AI wins on Raw vectors (**48.1% vs 35.1%** at $K=12$, paired $t=+2.36, p=0.0379$, $W=14.5$; **15.2% vs 11.3%** at $K=60$, $t=+1.52, p=0.156$, $W=18.0$) and massively outperforms Utility AI under Population Diagnostic Oracle normalization (**66.1% vs 35.7%** at $K=12$, $t=+6.41, p<0.0001$, $W=1.0$; **32.3% vs 17.4%** at $K=60$, $t=+4.44, p=0.0010$, $W=0.0$ with 12/12 folds won).
   - *Resolution of the Distant Stalker Counterexample*: Distant Stalker exhibits 100% terminal panic lock yet achieves 64.2% raw Top-1 retrieval because its 30-tick gradual creep allows discipline, vigilance, and urgency separation *prior* to terminal panic lock.

3. **Normalization Provenance Disentanglement & Evaluator vs Core Behavior Boundaries**:
   - What improved across LOSO V1, V2, and V2.1 is **Scenario-Conditioned Persona Recoverability** via representation/evaluator normalization, **NOT Fear AI personality invariance itself**. Core behavior (`packages/core/`) remains strictly untouched and frozen.
   - *Variance Components*: ANOVA decomposition confirms scenario effects dominate persona main effects ($42.6\%$ vs $41.1\%$, $1.04\times$). Mixed-model variance component estimation proves systematic interaction explains **65.6%** of pro-social variance with $0.0\%$ residual within-cell noise.
   - *Transductive Calibration Curve*: With just $m=5$ unlabelled trajectories, Fear AI recovers +24.0 percentage points of persona retrieval accuracy ($31.7\% \to 55.7\%$ at $K=12$; $9.0\% \to 19.7\%$ at $K=60$). At $m=40$, transductive adaptation virtually saturates oracle diagnostic performance ($65.6\%$ vs $66.1\%$).
   - *Source-Only Representation Audit*: Linear Ridge with standard z-score scaling yields 31.7% ($K=12$) due to mismatched scenario variance envelopes. Pure mean residualization alone recovers **42.9%** (+11.2pp) without requiring a single byte of target scenario data.

4. **Construct Entanglement Resolution & Clustered Factorial Inference**:
   - Rather than claiming unearned construct isolation, recognizing $N$ and $R$ as coupled latent differential drivers ($R^2 = 94.2\%$) scientifically explains why univariate cross-talk occurs in biological and simulated affective systems.
   - Cluster-robust sandwich inference ($df=9$) confirms that $N \times R$ is predominantly an **additive main effect** of opposing inflow/outflow forces ($\Delta R^2_{\text{int}} = 0.97\%$), rather than a large non-linear interaction.

5. **Empirical Resolution Limits & Crossed Near-Neighbor Breakdown**:
   - Continuous expressivity is not universally unbounded: while $N, R, E, C, L$ resolve down to $\Delta^* = 0.05$ and $O$ resolves at $\Delta^* = 0.20$ ($p = 1.19 \times 10^{-5}$, surviving Bonferroni $\alpha/28 = 0.0018$), Agreeableness ($A$) at $\Delta^* = 0.10$ is strictly classified as **`PROVISIONAL EVIDENCE (PENDING REPLICATION)`** (nominal $p = 0.0325$, failing Bonferroni).
   - In cross-scenario near-neighbor discrimination across held-out environments ($\Delta = 0.10$, 5,760 decisions), aggregate accuracy is **57.7% [Scenario CI: 55.8% - 59.7%] [Pair CI: 52.7% - 64.3%]**.
   - Trait breakdown connects directly to construct validity: Conscientiousness (**80.0%**), Resilience (**60.5%**), and Neuroticism (**55.4%**) drive robust transfer, while Openness (**50.2%**) and Agreeableness (**47.6%**) sit at chance floor.

6. **The Spearman Rank Correlation Disconnect**:
   - Behavior Tree ($\rho = 0.5809$) and FSM ($\rho = 0.5999$) achieve higher rank correlation than Fear AI ($\rho = 0.5498$) while collapsing to only $2/60$ ($3.3\%$) Top-1 retrieval.
   - Mechanism: 1D threshold models map trait distances monotonically along a line, inflating rank correlation while destroying individual persona expressivity. As established in *AffectSim* and *One Policy, Infinite NPCs*, believable affective agency requires multidimensional behavioral dispersion that preserves unique persona trajectories under pressure.

---

### 6.4 The Future Scientific Horizon: Toward FABE Functional Persona Signatures

The empirical results of LOSO V2.1 deliver a fundamental scientific conclusion: **Cross-scenario personality preservation should NOT be conceptualized as static surface vector invariance across heterogeneous environments.**

1. **The Fallacy of Surface Vector Invariance**:
   When an agent moves from an unthreatening reconnaissance mission to an acute point-blank ambush, expecting surface behaviors (e.g. `discipline_rate = 0.85` or `panic_rate = 0.05`) to remain unchanged is scientifically flawed. A resilient, disciplined agent *should* panic when cornered by lethal threats.
   As proven by our Two-Way ANOVA ($\eta^2_{\text{Scenario}} = 42.6\%$ vs $\eta^2_{\text{Persona}} = 41.1\%$) and Hierarchical Mixed Model ($\sigma^2_{P \times S} = 65.6\%$ for pro-social behavior), behavioral variance is inherently dominated by situation and person–situation interactions.

2. **The Person–Situation–Behavior Triad**:
   Citing foundational research on behavioral modeling (*From Representations to Behaviors: Exploring the Person–Situation–Behavior Triad in LLMs* and *The Story Shapes the Agent*), true personality resides in **systematic reaction norms** (person $\times$ situation response curves), rather than flat scalar outputs.

3. **Roadmap to FABE Functional Persona Signatures**:
   For the subsequent FABE research phase, the evaluation framework will transition from raw vector distances to estimating parametric response functions:
   - **Threat Sensitivity Response Function**: $\frac{\partial \text{Panic}}{\partial \text{PerceivedThreat}}$, capturing the individual slope of panic induction across distance thresholds.
   - **Recovery Half-Life Function**: $\tau_{1/2} = \frac{\ln 2}{\lambda_{\text{resilience}}}$, quantifying the empirical decay rate of physiological arousal after threat cessation.
   - **Contagion Susceptibility Coefficient**: $\beta_{\text{social}}$, measuring the change in agent fear per unit of peer panic arousal.
   - **Helping Probability per Opportunity**: $P(\text{Aid} \mid \text{WoundedAlly}, \text{Distance}, \text{SelfThreat})$, characterizing altruism conditioned on environmental danger.

By comparing functional response curves rather than unadjusted raw vectors, personality can be rigorously identified across arbitrary, never-before-seen environments without requiring target diagnostic data.

