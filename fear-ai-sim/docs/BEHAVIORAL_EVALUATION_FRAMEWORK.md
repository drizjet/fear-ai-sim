---
title: Fear AI Behavioral Evaluation Benchmark (FABE & FABE v2) Specification
created: 2026-09-06
updated: 2026-09-07
type: specification
status: active
---

> Evaluation and research artifact, not a release certificate or live-integration proof. Negative findings stay on the record (cross-scenario Utility AI win; K=60 raw Fear-vs-Utility not established). Layer 3 human evaluation is not executed. Reported benchmark figures are scoped to their named harnesses and should not be read as evidence that FABE is a live `RuntimeSimulation` service or an externally validated game behavior. Product map: `SYSTEM_MAP.md`.

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

### 5.3 Cross-Scenario Behavioral Invariance & Variance Decomposition Benchmark (`cross_scenario_invariance_benchmark.mjs` - LOSO V2.1 Methodological Closure Candidate)

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

*Note: Seed is factored out as an ordinary ANOVA blocking factor ($<0.15\%$ variance across all features; within-cell residual is deterministic/bounded).*

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

*Substantive Conclusion: Within the tested persona/scenario grid, pro-social behavior is dominated by systematic persona × scenario variation rather than seed-level stochastic variation (65.6% mixed-model share, 57.0% ANOVA $\eta^2$, residual noise < 0.15%).*

#### Transductive Calibration Curve: How Much Unseen Target Data Does Fear AI Require?

To empirically disentangle **Mode B (Sample-Limited Transductive Domain Adaptation)** from **Mode C (Target Diagnostic Oracle)**, we evaluate how many unlabelled trajectories ($m \in \{5, 10, 20, 40\}$) are required to recover latent persona identity in an unseen scenario, **strictly excluding the evaluated query individual from the calibration sample (leave-query-persona-out)**:

| Calibration Sample Size ($m$) | Fear AI Top-1 ($K=12$) [Task 95% CI] | Fear AI Top-1 ($K=60$) [Task 95% CI] | Operational Regime |
| :--- | :---: | :---: | :--- |
| **Mode A ($m=0$ / Inductive Ridge)** | 31.0% [22.7% - 41.0%] | 9.0% [4.8% - 13.8%] | Zero target data (inductive descriptor transfer) |
| **Mode B ($m=5$ unlabelled trajectories)** | **56.2% [51.4% - 61.8%]** | **19.8% [17.4% - 22.5%]** | Minimal field adaptation (+25.2pp jump at $K=12$) |
| **Mode B ($m=10$ trajectories)** | 61.4% [56.2% - 66.8%] | 25.4% [21.3% - 30.2%] | Low-sample adaptation |
| **Mode B ($m=20$ trajectories)** | 66.3% [58.9% - 73.1%] | 28.1% [23.2% - 33.4%] | Medium-sample adaptation (approaches oracle) |
| **Mode B ($m=40$ trajectories)** | 66.9% [59.7% - 73.6%] | 30.7% [25.1% - 36.9%] | High-sample adaptation (saturates oracle) |
| **Mode C (Diagnostic Oracle)** | **66.7% [59.7% - 73.1%]** | **32.4% [25.1% - 40.2%]** | Theoretical upper bound (full target cohort) |

*Key Takeaway: Under strict leave-query-persona-out calibration, just $m=5$ unlabelled trajectories from other individuals jumps persona recoverability from 31.0% to 56.2% at $K=12$, and at $m=40$ ($66.9\%$) virtually saturates oracle performance without target individual data leakage.*

#### Disentangled Normalization Provenance & Clustered Paired Inference ($K=12$, $N=1,440$ Queries)

| Model & Representation Condition | Top-1 Acc | Task-Cluster Bootstrap 95% CI | Persona-Cluster Bootstrap 95% CI | Fold Distribution (Mean / Med / Min / Max) | Paired Fold Test ($df=11$) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Fear AI (Raw Feature Vectors)** | 48.1% | [36.2% - 58.6%] | [32.9% - 63.5%] | 48.1% / 54.2% / 8.3% / 75.0% | Baseline |
| **Fear AI (Mode A: Inductive SD Normalized)** | 31.0% | [22.7% - 41.0%] | [21.5% - 43.5%] | 31.0% / 25.0% / 8.3% / 58.3% | $\Delta = -17.1\%$ ($t=-2.66, p=0.0223$) |
| **Fear AI (Mode A: Mean Residualization Only)**| 42.9% | [32.6% - 52.8%] | [29.0% - 57.4%] | 42.9% / 45.8% / 8.3% / 75.0% | **+11.9% over SD normalization** |
| **Fear AI (Mode B: $m=20$ Transductive)** | 66.3% | [58.9% - 73.1%] | [51.5% - 79.2%] | 66.3% / 65.4% / 49.2% / 83.3% | $+18.2\%$ over Raw ($t=+3.12, p=0.0098$) |
| **Fear AI (Mode C: Population Oracle)** | **66.7%** | **[59.7% - 73.1%]** | **[51.8% - 81.6%]** | **66.7% / 66.7% / 49.2% / 83.3%** | **$+18.6\%$ over Raw ($t=+3.34, p=0.0066$)** |
| **Utility AI Baseline (Raw Vectors)** | 35.1% | [29.3% - 40.7%] | [20.7% - 51.3%] | 35.1% / 35.8% / 16.7% / 50.0% | Fear vs Util Raw: $t=+2.28, p=0.043$, $W=11.0$ ($p=0.034$) |
| **Utility AI Baseline (Mode C: Oracle)** | 35.7% | [28.1% - 43.1%] | [22.5% - 49.9%] | 35.7% / 33.3% / 8.3% / 58.3% | Fear vs Util Oracle: $t=+5.79, p=1.2 \times 10^{-4}$, $W=0.0$ ($p=0.00049$) |

#### High-Dimensional Extended Cohort ($K=60$, $N=7,200$ Queries) & Direct Paired Inference

| Condition / Representation | Fear AI Top-1 ($K=60$) [Task 95% CI] | Utility AI Top-1 ($K=60$) [Task 95% CI] | Random Floor | Direct Paired Inference ($df=11$) |
| :--- | :---: | :---: | :---: | :--- |
| **Raw Behavioral Vectors** | 15.1% [10.8% - 19.5%] | 11.3% [8.5% - 15.0%] | 1.67% | $t=+1.49, p=0.165$; Wilcoxon $W=19.0$ ($p=0.126$) (higher point estimate, but paired comparison does not establish statistically reliable raw advantage) |
| **Mode A: Source-Only Inductive (SD)** | 10.2% [4.8% - 13.8%] | 10.7% [7.5% - 13.8%] | 1.67% | Mismatched variance scaling penalty |
| **Mode A: Mean Residualization Only** | 14.7% [9.9% - 21.1%] | 11.2% [8.2% - 14.7%] | 1.67% | Preserves feature geometry (+4.5pp over SD) |
| **Mode B: $m=20$ Transductive Adaptation** | 28.1% [23.2% - 33.4%] | 14.5% [11.8% - 17.5%] | 1.67% | Transductive adaptation recovers latent separation |
| **Mode C: Population Diagnostic Oracle** | **32.4% [25.1% - 40.2%]** | **17.4% [14.2% - 19.9%]** | 1.67% | **$t=+4.51, p=0.0009$; Wilcoxon $W=0.0$ ($p=0.0005$) (12/12 folds won decisively)** |

#### Near-Neighbor Cross-Scenario Discrimination with Multiway Crossed Clustering & Trait Classification ($\Delta = 0.10$, 5,760 Decisions)

To connect cross-scenario transfer directly to construct validity, we evaluate pairwise discrimination between canonical archetypes and their single-trait perturbed near-neighbors ($\Delta = 0.10$) across all 12 held-out scenarios using a **true multiway crossed-cluster bootstrap** ($B=1,000$ joint scenario $\times$ pair resamples) and a **cluster-level permutation test** ($N_{\text{perm}}=10,000$ randomizations across pair clusters), replacing naive decision-level inference:

| Trait Perturbed ($\Delta=0.10$) | Methodological Classification | Pairs | Decisions | Correct | Accuracy % | Scenario 95% CI | Pair 95% CI | Empirical Construct Linkage |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Conscientiousness ($C$)** | **`DEMONSTRATED_STRONG`** | 4 | 960 | 768 | **80.0%** | [76.0% - 85.2%] | [60.0% - 100.0%] | Decisive cross-scenario transfer ($p < 10^{-15}$) |
| **Resilience ($R$)** | **`DEMONSTRATED_MODERATE`** | 4 | 960 | 590 | **61.5%** | [55.8% - 67.9%] | [54.8% - 70.1%] | Robust cross-scenario transfer |
| **Neuroticism ($N$)** | **`DEMONSTRATED_WEAK`** | 4 | 960 | 532 | **55.4%** | [51.5% - 60.4%] | [50.4% - 61.5%] | Modest threat sensitivity modulation ($p < 0.01$) |
| **Extraversion ($E$)** | **`INCONCLUSIVE_BORDERLINE`**| 4 | 960 | 504 | **52.5%** | [50.0% - 56.1%] | [50.2% - 56.6%] | Lower bound touches 50.0% chance floor |
| **Openness ($O$)** | **`NON_RESOLVED`** | 4 | 960 | 482 | **50.2%** | [49.4% - 51.2%] | [48.8% - 51.5%] | Hovers at 50.0% chance floor |
| **Agreeableness ($A$)** | **`NON_RESOLVED_SITUATION_CONTINGENT`** | 4 | 960 | 469 | **48.9%** | [46.7% - 50.0%] | [45.8% - 52.1%] | Hovers at 50.0% chance floor |
| **AGGREGATE NEAR-NEIGHBOR** | **`VALIDATED_CROSS_SCENARIO`** | **24** | **5,760** | **3,345** | **58.1%** | **[56.1% - 60.2%]** | **[53.2% - 64.6%]** | **Multiway Crossed CI: [52.4% - 64.5%], Cluster Permutation $p = 0.0005$** |

*Methodological Audits & Rationale*:
- **Cluster Permutation Test**: Across 10,000 pair-cluster sign randomizations, only 5 permutations met or exceeded the observed 58.1% accuracy ($p = 0.0005$), cleanly eliminating naive decision-level claims ($p < 10^{-20}$) while confirming genuine above-chance latent personality preservation.
- **Agreeableness Orientation Inversion Audit**: Inverting distance prediction yields 47.8% (vs 48.0% normal). 8 of 12 scenarios have `peerCount = 0`, inducing exact 50.0% non-discriminative ties; there is no global sign inversion, but decisive proof of situation-contingent affordance dependence.
- **Leadership ($L$) Exclusion Rationale**: Excluded from the $K=60$ hypercube ($12 \text{ archetypes} \times 2 \text{ perturbations} = 24 \text{ near-neighbors}$ across 6 Big-Five+Resilience traits) due to integer divisibility and because peer absence in 8/12 scenarios renders $L$ behaviorally inert (inducing 50% non-discriminative ties; overall cross-scenario accuracy 12.6%). Leadership construct validity is preserved in dedicated social sweeps.

#### Source-Only Inductive Model Selection & Representation Audit

| Estimator Model | Representation Logic | Target Data Used | $K=12$ Top-1 | $K=60$ Top-1 | Key Insight |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Linear Ridge (Mean + Pooled SD)** | Z-score normalization | Zero | 31.0% | 10.2% | Mismatched SD distorts feature geometry |
| **Linear Ridge (Mean-Only)** | Mean residualization | Zero | **42.9%** | **14.7%** | **+11.9pp jump without any target data** |
| **Interaction-Expanded Ridge** | Quadratic cue interactions | Zero | 40.7% | 14.0% | Minor overfitting to training scenario pairs |
| **Nearest-Scenario (1-NN) Transfer**| Discrete donor matching | Zero | 34.7% | 9.8% | Donor scenario distance mismatches |
| **Global Median Residualization** | Robust central tendency | Zero | 42.6% | 14.6% | Outlier-resistant inductive baseline |

*Framing*: Pooled training-SD scaling interacts badly with cosine retrieval under these cross-scenario feature distributions. Dividing by mismatched pooled SD inflates near-zero variance noise features, distorting feature geometry. Pure mean residualization alone recovers **42.9%** at $K=12$ (+11.9pp) without requiring a single byte of target scenario data.

#### Winner-Reversal Experimental Isolation: Old-4 Subset vs Balanced-12 Families

| Benchmark Battery | Fear AI Raw Top-1 | Utility AI Raw Top-1 | Fear AI Oracle Top-1 | Utility AI Oracle Top-1 | Isolation Resolution |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Old-4 Battery Subset (V2 $K=60$ Runner)** | 2.9% | 3.8% | 16.2% | 18.3% | **Both models collapse near floor**: short 20-tick high-intensity episodes with $N=4$ fold structure |
| **Balanced-12 Families (V2 $K=60$ Runner)** | **15.0%** | 11.3% | **32.3%** | 17.4% | **Latent dynamics emerge**: cue diversity and temporal distance profiles allow affective divergence |

*Resolution of the Distant Stalker Counterexample*:
In the diagnostic ledger below, Distant Stalker exhibits a **100% terminal panic lock** yet maintains **65.0% raw Top-1 retrieval**. Why?
While all personas reach terminal panic lock by tick 24 (100% terminal lock), **panic onset delay varies substantially across personas** (tick 6 for `frozen_bystander` vs tick 16 for `stoic_veteran`), generating a wide `panic_rate` range (36.0% to 76.0%) and preserving cumulative trajectory differentiability (65.0% raw Top-1). In contrast, the old 4 scenarios were instantaneous short shock traps that triggered immediate early panic locks, completely eliminating the pre-lock behavioral differentiation window.

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
   - *Old-4 Battery Isolation*: When evaluated inside the LOSO V2 $K=60$ runner, both models collapse near the floor on the original 4-scenario battery (Fear AI Raw 2.9% vs Utility AI Raw 3.8%; Oracle 16.2% vs 18.3%). The old episodes were short 20-tick high-intensity episodes with an $N=4$ fold structure that triggered early panic locks and suppressed affective divergence.
   - *Balanced-12 Families*: Across balanced Stalking, Ambush, and Social domains, Fear AI has a higher point estimate on Raw vectors (**48.1% vs 35.1%** at $K=12$, paired $t=+2.28, p=0.043$, $W=11.0, p=0.034$; **15.1% vs 11.3%** at $K=60$, $t=+1.49, p=0.165$, $W=19.0, p=0.126$), where the $K=60$ raw advantage is scientifically recognized as not statistically reliable across matched folds. Under Population Diagnostic Oracle normalization, Fear AI demonstrates decisive diagnostic superiority (**66.7% vs 35.7%** at $K=12$, $t=+5.79, p=1.2 \times 10^{-4}$, $W=0.0$; **32.4% vs 17.4%** at $K=60$, $t=+4.51, p=0.0009$, $W=0.0, p=0.0005$ with 12/12 folds won).
   - *Resolution of the Distant Stalker Counterexample*: Distant Stalker exhibits 100% terminal panic lock yet achieves 65.0% raw Top-1 retrieval because panic onset delay varies substantially across personas (tick 6 for `frozen_bystander` vs tick 16 for `stoic_veteran`), producing a wide `panic_rate` spread (36.0% to 76.0%) and rich pre-lock behavioral differentiation.

3. **Normalization Provenance Disentanglement & Evaluator vs Core Behavior Boundaries**:
   - What improved across LOSO V1, V2, and V2.1 is **Scenario-Conditioned Persona Recoverability** via representation/evaluator normalization, **NOT Fear AI personality invariance itself**. Core behavior (`packages/core/`) remains strictly untouched and frozen.
   - *Variance Components*: ANOVA decomposition confirms scenario effects dominate persona main effects ($42.6\%$ vs $41.1\%$, $1.04\times$). Mixed-model variance component estimation proves systematic interaction explains **65.6%** of pro-social variance with $0.0\%$ residual within-cell noise.
   - *Transductive Calibration Curve*: Under strict leave-query-persona-out calibration, just $m=5$ unlabelled trajectories jumps Fear AI recoverability from 31.0% to 56.2% at $K=12$, and at $m=40$ ($66.9\%$) virtually saturates oracle performance without target individual data leakage.
   - *Source-Only Representation Audit*: Linear Ridge with standard z-score scaling yields 31.0% ($K=12$) due to mismatched scenario variance envelopes. Pure mean residualization alone recovers **42.9%** (+11.9pp) without requiring a single byte of target scenario data.

4. **Construct Entanglement Resolution & Clustered Factorial Inference**:
   - Rather than claiming unearned construct isolation, recognizing $N$ and $R$ as coupled latent differential drivers ($R^2 = 94.2\%$) scientifically explains why univariate cross-talk occurs in biological and simulated affective systems.
   - Cluster-robust sandwich inference ($df=9$) confirms that $N \times R$ is predominantly an **additive main effect** of opposing inflow/outflow forces ($\Delta R^2_{\text{int}} = 0.97\%$), rather than a large non-linear interaction.

5. **Empirical Resolution Limits & Crossed Near-Neighbor Breakdown**:
   - Continuous expressivity is not universally unbounded: while $N, R, E, C, L$ resolve down to $\Delta^* = 0.05$ and $O$ resolves at $\Delta^* = 0.20$ ($p = 1.19 \times 10^{-5}$, surviving Bonferroni $\alpha/28 = 0.0018$), Agreeableness ($A$) at $\Delta^* = 0.10$ is strictly classified as **`PROVISIONAL EVIDENCE (PENDING REPLICATION)`** (nominal $p = 0.0325$, failing Bonferroni).
   - In cross-scenario near-neighbor discrimination across held-out environments ($\Delta = 0.10$, 5,760 decisions), aggregate accuracy is **58.1%** with Multiway Crossed-Cluster Bootstrap 95% CI **[52.4% - 64.5%]** and Cluster-Level Permutation Test **$p = 0.0005$** (10,000 randomizations).
   - Trait breakdown connects directly to construct validity: Conscientiousness (**80.0%**, `DEMONSTRATED_STRONG`) and Resilience (**61.5%**, `DEMONSTRATED_MODERATE`) drive robust transfer; Neuroticism (**55.4%**, `DEMONSTRATED_WEAK`) exhibits modest transfer; Extraversion (**52.5%**, `INCONCLUSIVE_BORDERLINE`), Openness (**50.2%**, `NON_RESOLVED`), and Agreeableness (**48.9%**, `NON_RESOLVED_SITUATION_CONTINGENT`) sit at chance floor.

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
   Citing foundational research on behavioral modeling (*From Representations to Behaviors: Exploring the Person–Situation–Behavior Triad in LLMs*, arXiv:2607.26853; *The Story Shapes the Agent*, arXiv:2608.06485), true personality resides in **systematic reaction norms** (person $\times$ situation response curves), rather than flat scalar outputs.

3. **Roadmap to FABE Functional Persona Signatures**:
   For the subsequent FABE research phase, the evaluation framework will transition from raw vector distances to estimating parametric response functions:
   - **Threat Sensitivity Response Function**: $\frac{\partial \text{Panic}}{\partial \text{PerceivedThreat}}$, capturing the individual slope of panic induction across distance thresholds.
   - **Recovery Half-Life Function**: $\tau_{1/2} = \frac{\ln 2}{\lambda_{\text{resilience}}}$, quantifying the empirical decay rate of physiological arousal after threat cessation.
   - **Contagion Susceptibility Coefficient**: $\beta_{\text{social}}$, measuring the change in agent fear per unit of peer panic arousal.
   - **Helping Probability per Opportunity**: $P(\text{Aid} \mid \text{WoundedAlly}, \text{Distance}, \text{SelfThreat})$, characterizing altruism conditioned on environmental danger.

By comparing functional response curves rather than unadjusted raw vectors, personality can be rigorously identified across arbitrary, never-before-seen environments without requiring target diagnostic data.

---

## 7. Milestone B: FABE Functional Persona Signatures (FPS v1)

Following the empirical findings of LOSO V2.1, Milestone B operationalizes **Functional Persona Signatures (FPS v1)**. Rather than evaluating aggregate state vectors $\mathbf{x} = \frac{1}{T}\sum_t \mathbf{s}_t$ whose magnitudes are dominated by scenario threat intensity ($\eta^2 = 42.6\%$), an FPS characterizes the agent's dynamic stimulus-response transfer function $f_{\boldsymbol{\theta}}(\text{stimulus}) \to \text{response}$ across 6 canonical response surfaces.

### 7.1 The 6 Parametric Response Surfaces

1. **Threat-Appraisal Sensitivity Curve**:
   - Sweeps distance $d \in [1\text{m}, 30\text{m}]$ under controlled predatory threat.
   - Measures onset distance threshold $D_{50}$ (where acute fear $\ge 0.50$), threat gain $k_{\text{threat}} = \frac{\partial \text{Fear}}{\partial \text{Proximity}}$, and point-blank peak fear $F_{\max}$.
2. **Recovery Half-Life & Decay Dynamics**:
   - Pulses agent to peak acute fear ($F = 1.0$) and removes threat to measure decay in complete silence.
   - Measures empirical recovery half-life $\tau_{1/2}$ (ticks to $50\%$ decay), ticks to calm $\tau_{\text{calm}}$, and exponential decay rate $\hat{\lambda} = \exp\left(-\frac{\ln 2}{\tau_{1/2}}\right)$.
3. **Social Contagion & Reassurance Susceptibility**:
   - Evaluates peer panic coupling $\beta_{\text{social}} = \frac{\Delta \text{Fear}}{\Delta \text{Contagion}}$ and leader reassurance mitigation $\beta_{\text{reassure}} = \frac{\Delta \text{Fear}}{\Delta \text{LeaderCalm}}$.
4. **Altruism & Pro-Social Dilemma Function**:
   - Measures pro-social action selection rate $P(\text{Help/Warn} \mid \text{danger}, \text{peers})$ under anxiety vs self-preservation flight.
5. **Tactical Discipline Retention Function**:
   - Evaluates composure maintenance (`DEFENSIVE_STANCE` / `SPRINTING` vs `STUMBLING` / `DESPERATE_FLAIL`) under mounting acute stress and close-quarters confrontation at $d < 1.5\text{m}$.
6. **Curiosity Under Ambiguity Curve**:
   - Sweeps acoustic stimulus intensity ($0.10 \to 0.90$) at $15\text{m}$ to measure sound volume investigation threshold $S_{\text{threshold}}$ and acoustic sensitivity $\gamma_{\text{curiosity}}$.

### 7.2 Canonical Response Surface Parameters ($K=12$ Archetypes)

| Persona | $D_{50}$ (m) | $\tau_{1/2}$ (ticks) | $\hat{\lambda}$ | $\beta_{\text{social}}$ | $\beta_{\text{reassure}}$ | CQB Disc | Faint Cur |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Cowardly Civilian** | 30 | 35 | 0.9800 | 0.848 | 0.273 | 0.00 | 0.00 |
| **Stoic Veteran** | 1 | 7 | 0.8932 | 0.564 | 0.195 | 0.00 | 0.90 |
| **Impulsive Scout** | 27 | 17 | 0.9580 | 0.880 | 0.404 | 0.00 | 0.90 |
| **Protective Leader** | 3 | 8 | 0.9061 | 0.755 | 0.276 | 0.00 | 0.90 |
| **Paranoid Watcher** | 30 | 32 | 0.9785 | 0.824 | 0.155 | 0.80 | 0.00 |
| **Curious Scholar** | 11 | 11 | 0.9334 | 0.744 | 0.393 | 0.00 | 0.90 |
| **Compliant Follower** | 25 | 14 | 0.9491 | 0.746 | 0.588 | 0.00 | 0.00 |
| **Aggressive Defender** | 13 | 9 | 0.9201 | 0.778 | 0.267 | 0.00 | 0.90 |
| **Frozen Bystander** | 30 | 35 | 0.9800 | 0.867 | 0.127 | 0.00 | 0.00 |
| **Reckless Daredevil** | 1 | 7 | 0.8994 | 0.694 | 0.214 | 0.00 | 0.90 |
| **Resilient Medic** | 6 | 8 | 0.9085 | 0.648 | 0.321 | 0.00 | 0.90 |
| **Despondent Fatalist** | 30 | 35 | 0.9800 | 0.775 | 0.272 | 0.00 | 0.00 |

### 7.3 Reference Probe Battery Noise Robustness ($K=60$ Extended Cohort)

Evaluated across all 60 continuous hypercube personas and near-neighbors ($\Delta = 0.10$) under varying sensor perturbation:

| Test Condition | Perturbation Level | Top-1 Retrieval | Top-3 Retrieval | Chance Floor |
| :--- | :---: | :---: | :---: | :---: |
| **Nominal Repeatability** | $0\%$ noise | **83.3%** | **100.0%** | 1.67% |
| **Mild Sensor Noise** | $\pm 5\%$ distance noise | **78.3%** | **100.0%** | 1.67% |
| **Stress Sensor Noise** | $\pm 20\%$ distance noise | **61.7%** | **93.3%** | 1.67% |

*Conclusion*: Across the entire $K=60$ continuous hypercube, the 10-parameter Functional Persona Signature maintains 100% Top-3 retrieval under mild noise and 93.3% under severe $\pm 20\%$ distance distortion, demonstrating that multi-surface parametric characterization uniquely identifies personas under sensor noise.

### 7.4 Cross-Scenario Invariance & Domain Stratification (79,200 Decision Pairs, 10 Seeds)

Evaluated across the 12 LOSO scenario families, comparing unadjusted raw vectors vs Observational FPS estimated directly from uncontrolled scenario traces:

| Cohort | Metric | Raw Baseline | Observational FPS | Delta ($\Delta$) |
| :--- | :--- | :---: | :---: | :---: |
| **Canonical ($K=12$)** | **Overall Top-1** | 37.67% [36.92%, 38.43%] | **38.32% [37.57%, 39.08%]** | **+0.65%** |
| | *Within-Domain* | 38.63% | **39.91%** | **+1.27%** |
| | *Cross-Domain* | 37.31% | **37.73%** | **+0.42%** |
| **Extended ($K=60$)** | **Overall Top-1** | 11.73% [11.51%, 11.96%] | 11.50% [11.28%, 11.72%] | -0.23% |
| | *Within-Domain* | 12.84% | 12.52% | -0.32% |
| | *Cross-Domain* | 11.31% | 11.11% | -0.20% |

### 7.5 Essential Negative Finding: The Single-Scenario Observational Transfer Gap

When attempting to directly match an observational signature $\hat{\boldsymbol{\theta}}_{\text{obs}}$ estimated from a single uncontrolled scenario against the complete Reference Probe gallery $\boldsymbol{\theta}^*$, accuracy drops to **17.36%** ($K=12$) and **4.86%** ($K=60$).

*Mechanistic Root Cause*:
A single uncontrolled scenario (e.g. 20 ticks of `stalk_cornered_deadend`) only excites a narrow slice of the stimulus space (no peers, no sounds, single threat trajectory). Consequently:
1. Social susceptibility, reassurance gain, and acoustic curiosity remain completely unexcited during that episode, falling back to uninformative priors ($0.5$).
2. The Reference Probe gallery, in contrast, excites the complete multi-modal spectrum.
3. Matching a sparse, single-modality observation against a dense multi-modal gallery induces systematic domain distance.

*Methodological Principle*:
Parametric response surface matching across scenarios requires either:
- **Stimulus-rich episodes** that excite all relevant modalities, or
- **Multi-scenario trajectory aggregation** before gallery comparison, or
- **Subspace projection / masking** that restricts distance metrics strictly to the stimulus modalities excited in that scenario.

---

## 8. Milestone C: Personality Identity vs Dynamic State & Long-Horizon Affect

Milestone C establishes the formal separation between **Stable Personality Identity** (traits that are strictly immutable invariants of the agent) and **Dynamic Affective State** (time-varying arousal, threat, and habituation), spanning long-horizon simulation across 5 distinct environmental epochs ($T=5,000$ ticks per agent, 60,000 total ticks across 12 canonical archetypes).

### 8.1 Tripartite Architectural State Decomposition

To eliminate conflation between trait disposition and situational arousal, Fear AI decomposes agent state into three distinct mathematical tiers:

$$\mathbf{S}(t) = \langle \mathbf{\Theta}_{\text{identity}},\, \mathbf{A}(t),\, \mathbf{M}(t) \rangle$$

1. **Stable Identity ($\mathbf{\Theta}_{\text{identity}}$)**:
   - Trait vector $\mathbf{\Theta} = \langle N, R, E, A, C, O, L \rangle \in [0, 1]^7$.
   - Strictly constant across simulation time: $\frac{d\mathbf{\Theta}}{dt} = \mathbf{0}$.
   - Evaluated as an architectural invariant: maximum trait drift across 5,000 ticks must equal exactly $0.0000$.

2. **Dynamic Affective State ($\mathbf{A}(t)$)**:
   - Instantaneous coordinates: $\mathbf{A}(t) = \langle \text{fear}(t),\, \text{urgency}(t),\, \text{valence}(t),\, \text{arousal}(t),\, \text{dominance}(t),\, \text{intent}(t) \rangle$.
   - Rapidly shifting response to sensory inputs, proximity, and physiological hysteresis.

3. **Mid-Term Adaptation & Memory ($\mathbf{M}(t)$)**:
   - Situational adaptation: $\mathbf{M}(t) = \langle \text{habituation}(t),\, \text{traumaCount}(t),\, \text{lastPanicTick}(t) \rangle$.
   - Habituation desensitization: $h(t) \in [0, 1]$ dampens acute fear upon repeated harmless exposure.
   - Trauma dread zone sensitivity: re-exposure to scarred coordinates triggers memory-induced dread spikes.

### 8.2 5,000-Tick Multi-Epoch Environmental Stress Protocol

The evaluation protocol subjects agents to 5 distinct ecological epochs:
- **Epoch 1: Baseline Exploration ($t \in [1, 1000]$)**: Peaceful environment with distant ambient cues ($d \ge 50\text{m}$).
- **Epoch 2: Acute Ambush & Trauma Conditioning ($t \in [1001, 2000]$)**: High-intensity lethal ambush ($d = 1.0\text{m}$, threat $= 1.0$) inducing peak panic lock ($F = 1.0$) and spatial trauma imprint at location $(15, 0, 15)$.
- **Epoch 3: Sanctuary Safe Zone & Healing ($t \in [2001, 3000]$)**: Complete removal of threats ($d = 100\text{m}$, zero threat stimuli) allowing affective cooldown and physiological recovery to baseline ($F \to 0.0$).
- **Epoch 4: Trauma Zone Re-Exposure ($t \in [3001, 4000]$)**: Agent re-enters the spatial coordinates of Epoch 2 trauma without active threats present.
- **Epoch 5: Periodic Shock Perturbations ($t \in [4001, 5000]$)**: Intermittent pulse shocks every 100 ticks testing state-machine stability and habituation under cyclic disturbance.

### 8.3 Long-Horizon Empirical Findings

Evaluated via `benchmarks/behavioral-evaluation/long_horizon_affect_identity_benchmark.mjs` (runtime: 0.93s across 60,000 ticks):

| Persona Archetype | Total Ticks | Max Trait Drift | Checkpoint Replay Determinism | Relapse Fear Peak | 3-Gram Motifs | Shannon Entropy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Cowardly Civilian** | 5,000 | **0.0000** | **100.0%** | **0.322** | 11 | 1.397 bits |
| **Stoic Veteran** | 5,000 | **0.0000** | **100.0%** | **0.000** | 16 | 1.494 bits |
| **Impulsive Scout** | 5,000 | **0.0000** | **100.0%** | **0.000** | 16 | 1.517 bits |
| **Protective Leader** | 5,000 | **0.0000** | **100.0%** | **0.000** | 15 | 1.488 bits |
| **Paranoid Watcher** | 5,000 | **0.0000** | **100.0%** | **0.324** | 12 | 1.411 bits |
| **Curious Scholar** | 5,000 | **0.0000** | **100.0%** | **0.000** | 16 | 1.517 bits |
| **Compliant Follower** | 5,000 | **0.0000** | **100.0%** | **0.298** | 12 | 1.407 bits |
| **Aggressive Defender** | 5,000 | **0.0000** | **100.0%** | **0.000** | 16 | 1.498 bits |
| **Frozen Bystander** | 5,000 | **0.0000** | **100.0%** | **0.374** | 12 | 1.408 bits |
| **Reckless Daredevil** | 5,000 | **0.0000** | **100.0%** | **0.000** | 16 | 1.487 bits |
| **Resilient Medic** | 5,000 | **0.0000** | **100.0%** | **0.000** | 15 | 1.409 bits |
| **Despondent Fatalist**| 5,000 | **0.0000** | **100.0%** | **0.290** | 11 | 1.400 bits |
| **COHORT SUMMARY** | **60,000** | **0.0000** | **100.0%** | **0.134 (mean)**| **13.6 (mean)**| **1.453 bits** |

### 8.4 Key Insights & Invariants

1. **Zero-Drift Invariant Verified**: Across 60,000 simulation ticks, traits remain strictly immutable ($| \Delta \mathbf{\Theta} | = 0.0000$), verifying that long-term adaptation occurs through explicit state/memory channels rather than silent trait corruption.
2. **Deterministic Checkpoint Restoration**: Checkpoint save at tick 2,500 and restore reproduced the remaining 2,500 ticks with **100% bit-for-bit trajectory equivalence** across all intent sequences and PAD coordinates.
3. **Clinical Trauma Relapse Gradient**: In Epoch 4 (sanctuary-healed agent re-entering the trauma zone without active threats), low-neuroticism / high-resilience archetypes (`stoic_veteran`, `reckless_daredevil`, `resilient_medic`) experience **zero relapse** ($\text{fear} = 0.000$), whereas high-neuroticism / low-resilience archetypes experience marked situational relapse (`cowardly_civilian`: $0.322$, `paranoid_watcher`: $0.324$, `frozen_bystander`: $0.374$).
4. **Behavioral Repertoire Complexity**: Shannon entropy across 3-gram intent motifs averages **1.453 bits** (with resilient inquisitive archetypes reaching 1.517 bits across 16 distinct motif patterns), confirming rich behavioral diversity under repeated long-horizon cycles without single-state lockouts.

---

## 9. Milestone D: Layered Memory Architecture & Directed Relationship Tensors

Milestone D establishes a reusable, bounded **Multi-Layer Cognitive Memory Architecture** and **Directed Multi-Dimensional Relationship Tensors** (`packages/core/src/LayeredMemorySystem.js` and `packages/core/src/RelationshipTensorSystem.js`), evaluating social evolution, asymmetric obligations, contagion modulation, and forgiveness dynamics over 2,000-tick horizons.

### 9.1 The 4-Tier Cognitive Memory Architecture

$$\mathbf{M}_{\text{agent}} = \langle \mathbf{M}_{\text{sensory}},\, \mathbf{M}_{\text{episodic}},\, \mathbf{M}_{\text{trauma}},\, \mathbf{M}_{\text{semantic}} \rangle$$

1. **Sensory Working Memory ($\mathbf{M}_{\text{sensory}}$)**:
   - Rolling FIFO buffer of active perceptual inputs (capacity: 10 observations).
   - Tracks threat distances, audio stimuli, and nearby peer IDs for immediate appraisal.
2. **Episodic Memory ($\mathbf{M}_{\text{episodic}}$)**:
   - Discrete salient historical incidents (`SURVIVED_AMBUSH`, `REASSURED_BY_LEADER`, `ABANDONED_BY_PEER`, `ALLIED_EXTRACTION`).
   - Salience decay function: $\text{salience}(t + \Delta t) = \text{salience}(t) \cdot (1.0 - \lambda_{\text{decay}})^{\Delta t}$.
   - **Flashbulb Retention Property**: Highly salient traumatic or heroic memories ($\text{salience} \ge 0.80$) decay at $0.1\times$ the rate of mundane episodes ($\lambda_{\text{flash}} = 0.1 \cdot \lambda_{\text{base}}$), ensuring long-term behavioral persistence.
   - Bounded Capacity: Strictly capped at 50 episodes; lowest-salience entries are pruned upon capacity breach.
3. **Trauma Memory ($\mathbf{M}_{\text{trauma}}$)**:
   - Cue-conditioned dread associations: spatial coordinates and entity cues that trigger anticipatory dread before active threats appear.
   - Distance falloff: $\text{dread}(d) = \text{intensity} \cdot \left(1.0 - \frac{d}{r}\right)$.
4. **Semantic World Knowledge ($\mathbf{M}_{\text{semantic}}$)**:
   - Factual beliefs (`HAZARD`, `SANCTUARY`, `CHOKEPOINT`, `RESOURCE`).
   - **Conflict Resolution Engine**: When conflicting observations arrive for the same coordinate or key, newer observations with higher confidence override outdated beliefs. Stale unrefreshed knowledge degrades slowly over time.

### 9.2 Directed Multi-Dimensional Relationship Tensors ($\mathbf{R}_{ij}$)

Social relationships are modeled as an asymmetric directed tensor: $\mathbf{R}_{ij} \neq \mathbf{R}_{ji}$, where agent $i$'s internal perception of agent $j$ is characterized across 8 continuous dimensions:

$$\mathbf{R}_{ij} = \langle \text{trust} \in [-1, 1],\, \text{fear} \in [0, 1],\, \text{respect} \in [0, 1],\, \text{affection} \in [-1, 1],\, \text{grievance} \in [0, 1],\, \text{familiarity} \in [0, 1],\, \text{obligation} \in [0, 1],\, \text{dominance} \in [-1, 1] \rangle$$

#### Interpersonal Interaction Dynamics

| Interaction Type | Primary Impact on $\mathbf{R}_{\text{source} \to \text{target}}$ | Psychological Mechanism |
| :--- | :--- | :--- |
| **`SHARED_SURVIVAL`** | $+0.15\ \text{trust},\, +0.10\ \text{affection},\, +0.12\ \text{familiarity},\, -0.10\ \text{fear}$ | Mutual bonding under acute stress |
| **`LEADER_CALMING`** | $+0.20\ \text{respect},\, +0.15\ \text{trust},\, -0.15\ \text{fear},\, -0.15\ \text{dominance}$ | Recognition of authority and calming presence |
| **`RESCUE_CONFIRMED`** | $+0.60\ \text{trust},\, +0.40\ \text{affection},\, +0.50\ \text{obligation},\, +0.30\ \text{respect}$ | Deep gratitude and moral debt to rescuer |
| **`AID_PROVIDED`** | $+0.20\ \text{trust},\, +0.20\ \text{affection},\, -0.25\ \text{obligation}$ | Warmth towards aided peer, debt repayment |
| **`ABANDONMENT`** | $-0.50\ \text{trust},\, +0.60\ \text{grievance},\, -0.40\ \text{affection},\, +0.10\ \text{fear}$ | Resentment from perceived cowardice |
| **`BETRAYAL`** | $-0.85\ \text{trust},\, +0.85\ \text{grievance},\, -0.70\ \text{affection},\, -0.40\ \text{respect}$ | Destructive breach of social contract |
| **`ATTACK`** | $-0.80\ \text{trust},\, +0.80\ \text{grievance},\, +0.50\ \text{fear},\, -0.60\ \text{affection}$ | Violent hostility and intimidation |
| **`PEACEFUL_COEXISTENCE`** | $-0.0008/\text{tick}\ \text{grievance},\, -0.0005/\text{tick}\ \text{obligation}$ | Gradual forgiveness and debt decay |

### 9.3 Behavioral Modulation & Social Invariants

1. **Panic Contagion Filtering**:
   Peer panic susceptibility is modulated by relationship:
   $$\beta_{\text{social}}(i \leftarrow j) = \beta_{\text{base}} \cdot (0.5 + 0.5 \cdot \text{familiarity}_{ij}) \cdot \max(0.2,\, 1.0 - 0.8 \cdot \text{grievance}_{ij}) \cdot (0.75 + 0.25 \cdot \max(0, \text{trust}_{ij}))$$
   *Empirical Result*: Panic from a trusted leader propagates at $0.361$, while panic from a resented betrayer is discounted to $0.095$ ($73.7\%$ reduction), modeling psychological skepticism of hysterical or untrustworthy peers.

2. **Leader Reassurance Gating**:
   Reassurance requires baseline respect and trust:
   $$\text{reassurance}(i \leftarrow \text{leader}) = \begin{cases} 0.0 & \text{if } \text{grievance}_{i,\text{leader}} > 0.4 \text{ or } \text{trust}_{i,\text{leader}} < -0.3 \\ \text{base} \cdot (0.4 + 0.6 \cdot \text{respect}) \cdot (0.5 + 0.5 \cdot \text{trust}) & \text{otherwise} \end{cases}$$
   *Empirical Result*: Followers are effectively calmed by trusted leaders ($0.323$), but reassurance from corrupt/resented actors is completely rejected ($0.000$).

3. **Pro-Social Altruism Gating (Refusal to Aid Betrayers)**:
   Helping/warning propensity is mediated by the relationship tensor:
   $$\text{willingness}(i \to j) = \begin{cases} 0.0 & \text{if } \text{grievance}_{ij} > 0.5 \\ \text{clamp}_{[0, 1]}\left(A_i + 0.3\,\text{trust} + 0.25\,\text{affection} + 0.25\,\text{obligation} - 0.2\,\text{fear} - 0.5\,\text{grievance}\right) & \text{otherwise} \end{cases}$$
   *Empirical Result*: Highly agreeable follower ($A = 0.80$) shows $0.800$ willingness to help an allied rescuer, but strictly $0.000$ willingness to help a cowardly betrayer.

4. **Directed Asymmetry Invariant Verified**:
   When Medic rescues Watcher: Watcher develops $\text{obligation} = 0.660$ and $\text{trust} = 0.900$ towards Medic, while Medic holds $\text{obligation} = 0.000$ towards Watcher, confirming $\mathbf{R}_{ij} \neq \mathbf{R}_{ji}$.

5. **Bounded Resource Policies & Determinism**:
   - Under 5,000 rapid event insertions, memory stores remained strictly bounded: sensory (10/10), episodic (50/50), semantic (100/100), and social relationships (50/50).
   - Entity despawn completely purged all inbound and outbound edges (`purgeAgent`).
   - Checkpoint restoration at tick 700 produced **100% bit-for-bit trajectory equivalence** to tick 2,000.

---

## 10. Milestone E: Group Contagion Cascades & Emergent Rally Dynamics

Milestone E establishes structured group intelligence, non-linear panic cascades, and heroic rally dynamics (`packages/core/src/GroupContagionSystem.js`). It models collective emergent states for squads, patrols, caravans, crowds, and settlement defenders while strictly adhering to the **Host Game Authority Invariant** (recommending formation directives, cohesion indices, and contagion multipliers without usurping host engine movement or physics).

### 10.1 Structured Group Architecture & Doctrinal Policies

Groups are modeled as collective social units characterized by type, behavioral doctrine, leadership hierarchy, and dynamic morale:

$$\mathbf{G} = \langle \text{id},\, \text{type},\, \text{doctrine},\, \text{leaderId},\, \mathbf{M},\, S_G,\, D_G,\, C_G,\, M_G \rangle$$

1. **Group Types**:
   - `SQUAD`: Cohesive tactical military unit with assigned command structure.
   - `PATROL`: Roaming reconnaissance squad evaluating perimeter danger.
   - `CARAVAN`: High-value escorted transport sensitive to escort integrity.
   - `CIVILIAN_CROWD`: Unstructured civilian gathering highly susceptible to stampedes.
   - `SETTLEMENT_DEFENSE`: Defensive militia anchoring fortified locations.

2. **Group Doctrines & Bifurcation Modifiers**:
   - `DISCIPLINED_STAND`: High panic threshold ($\theta_{\text{base}} + 0.15$), coordinated fighting stand under stress.
   - `TACTICAL_RETREAT`: Coordinated retrograde movement when pressured.
   - `SELF_PRESERVATION`: Low panic threshold ($\theta_{\text{base}} - 0.15$), quick to scatter.
   - `ESCORT`: Prioritizes designated VIP/cargo preservation over individual survival.

3. **Emergent Collective States ($S_G$)**:
   - `COHESIVE_CALM`: Disciplined formation, normal vigilance.
   - `VIGILANT_ALERT`: Elevated tension, defensive posture.
   - `CONTESTED_STAND`: Squad absorbing acute isolated stress without breaking.
   - `RALLYING`: Calm leader actively projecting authority to restore wavering peers.
   - `CASCADE_TRIGGERED`: Tipping point breached; viral spread of panic throughout unit.
   - `SCATTERED_STAMPEDE`: Total loss of cohesion; chaotic flight and crowd crushing risk.
   - `FRAGMENTED`: Squad integrity dissolved due to heavy desertion ($\ge 50\%$).

### 10.2 Critical Mass Bifurcation Point (Non-Linear Tipping Points)

Panic contagion is governed by a dynamic bifurcation threshold:

$$\theta_{\text{bifurcation}} = \theta_{\text{base}} + \Delta_{\text{doctrine}} + \begin{cases} 0.10 \cdot L_{\text{leader}} & \text{if leader is calm} \\ 0.0 & \text{otherwise} \end{cases}$$

When the panicking ratio $\rho_{\text{panic}} = \frac{N_{\text{panicking}}}{N_{\text{active}}} \ge \theta_{\text{bifurcation}}$, the collective experiences a phase transition into `CASCADE_TRIGGERED` or `SCATTERED_STAMPEDE`.

- **Isolated Stress Absorption**: A single panicking recruit in a 6-man disciplined squad ($\rho = 16.7\%$) is absorbed within `CONTESTED_STAND` ($\theta = 64.0\%$), maintaining squad cohesion at $0.90$.
- **Civilian Crowd Bifurcation**: In an unstructured crowd with `SELF_PRESERVATION` doctrine ($\theta = 25.0\%$), panic spreading to 2 of 4 civilians ($50.0\%$) instantly triggers an irreversible stampede cascade.

### 10.3 Heroic Leader Rally Dynamic & Reassurance Gating

When multiple squad members waver ($N_{\text{panicking}} \ge 2$) but the overall threshold is not yet breached, a calm leader ($F_{\text{leader}} < 0.35, L_{\text{leader}} \ge 0.50$) initiates a **Heroic Rally**:
1. Unit transitions to `RALLYING` state with `RALLY_TO_LEADER` directive.
2. Contagion susceptibility is cut in half across the squad ($0.5\times$ contagion multiplier).
3. Leaders calm wavering members within spatial radius $r \le 35\text{m}$.
4. **Relationship Gating**: Rally is strictly gated by the directed relationship tensor $\mathbf{R}_{i \to \text{leader}}$. Members who harbor grievance ($\text{grievance} > 0.40$) or lack respect ($\text{respect} < 0.30$) reject the leader's calming influence.

### 10.4 Leader Break Catastrophe

If the squad leader's fear breaches critical panic ($F_{\text{leader}} > 0.75$ with active panic lock):
1. Squad cohesion collapses immediately by $\ge 50\%$.
2. Follower panic contagion is magnified by `leaderPanicMultiplier` ($2.0\times$), scaling up to $3.6\times$ total contagion in a stampede.
3. This reliably reproduces the historical military phenomenon where the flight of a commander produces an instantaneous, uncoordinated rout.

### 10.5 Cowardly Desertion & Social Abandonment Grievance

Under cascade conditions, individual agents evaluate desertion based on personal disposition:

$$\text{score}_{\text{desert}} = 0.7 \cdot F_i - 0.4 \cdot C_i - 0.3 \cdot R_i$$

- If $\text{score}_{\text{desert}} > 0.45$ and $F_i \ge 0.70$, the cowardly agent abandons the unit.
- **Social Grievance Propagation**: Upon desertion, an `ABANDONMENT` interaction is automatically registered across all remaining loyal members toward the deserter, permanently spiking grievance ($\ge 0.20$) and destroying trust ($\le 0.50$).
- If $\ge 50\%$ of members desert, the unit collapses into `FRAGMENTED`.

### 10.6 Empirical Benchmark Validation (1,000 Ticks)

Evaluated via `benchmarks/behavioral-evaluation/group_contagion_rally_benchmark.mjs`:
- **Phase 1 (Isolated Stress)**: Squad maintained `CONTESTED_STAND` (cohesion $0.90$, panicking ratio $16.7\% < 64.0\%$).
- **Phase 2 (Heroic Rally)**: Leader rallied all 5 eligible squad members within 35m, dampening fear by $>0.20$.
- **Phase 3 (Bifurcation Point)**: Civilian crowd triggered cascade when panicking ratio hit $50.0\% \ge 25.0\%$.
- **Phase 4 (Leader Break Catastrophe)**: Leader panic at $0.95$ induced cohesion collapse and $3.6\times$ stampede contagion multiplier.
- **Phase 5 (Desertion & Grievance)**: Deserter defected; remaining loyalists recorded abandonment grievances.
- **Determinism**: 100% bit-for-bit replay equivalence from snapshot restoration.

---

## 11. Milestone F: Multi-Faction Diplomacy & The 14-Stage Bilateral Escalation Matrix

Milestone F establishes macro-level strategic faction intelligence, inter-faction diplomacy, and the **14-Stage Bilateral Escalation Matrix** (`packages/core/src/FactionSystem.js`). It models emergent geopolitical friction, commercial trade pacts, mobilization, armed conflict, capability-gated warfare, and capitulation while maintaining the **Host Game Authority Invariant** (evaluating diplomatic stances, casus belli, and strategic directives without controlling host unit spawning, physics, or damage).

### 11.1 The 14-Stage Bilateral Escalation Architecture

$$\mathbf{E}(A \to B) = \langle \text{stage},\, \text{compositePressure},\, \text{lastTransitionTick},\, \text{casusBelli},\, \text{incidents} \rangle$$

The system establishes a 14-stage discrete progression matrix:
1. `UNAWARE`: Faction has had zero contact or perceptual awareness of target faction.
2. `OBSERVE`: Remote monitoring without approaching or posturing.
3. `AVOID`: Cautious evasion under elevated threat or low certainty.
4. `WARN`: Formal border posturing, alert horns, and verbal ultimatums.
5. `NEGOTIATE`: Diplomatic mediation, dialogue channels, and truce talks.
6. `TRADE`: Peaceful commercial exchange, open borders, and tariff agreements.
7. `SHADOW`: Covert tracking from perimeter to discern enemy movements.
8. `THREATEN`: Explicit coercive show of force, demands for tribute or concessions.
9. `MOBILIZE`: Garrison alerts, force muster, and staging offensive formations.
10. `SKIRMISH`: Probing armed clashes, border skirmishing, and warning shots.
11. `ATTACK`: Lethal coordinated offensive warfare.
12. `RETREAT`: Tactical disengagement under overwhelming military threat.
13. `SURRENDER`: Laying down arms, suing for terms, accepting vassalage.
14. `ALLY`: Mutual defense pact, joint defense, and open intelligence sharing.

### 11.2 Cultural Bias Modulation

Factions possess distinct cultural profiles that mathematically skew escalation tendencies:
- `MILITARISTIC`: Elevated aggression ($\Delta_{\text{aggression}} = +0.15$), lower threshold for mobilization and attack.
- `EXPANSIONIST`: High territorial sensitivity ($\Delta_{\text{aggression}} = +0.20$), aggressively threatens neighbors.
- `MERCANTILE`: High trade affinity ($\Delta_{\text{trade}} = +0.25$, $\Delta_{\text{aggression}} = -0.10$), favors economic negotiation.
- `ISOLATIONIST`: Avoids external contact ($\Delta_{\text{aggression}} = -0.05$), quick to shadow and avoid.
- `HONORABLE`: Suppresses aggression when trust is maintained ($\Delta_{\text{aggression}} = -0.15$), strictly honors peace treaties.
- `DEVOUT`: Highly sensitive to border sacrilege and unprovoked strikes ($\Delta_{\text{aggression}} = +0.10$ under grievance).

### 11.3 Composite Hostility Pressure & Decision Dynamics

$$P_{\text{composite}} = \text{clamp}_{[0, 1]}\left(0.40 \cdot \text{grievance} + 0.30 \cdot P_{\text{territorial}} + 0.20 \cdot P_{\text{economic}} - 0.35 \cdot \text{trust} + \Delta_{\text{culture}}\right)$$

### 11.4 Key Invariants & Gates

1. **Directed Asymmetry Invariant**:
   $\mathbf{E}(A \to B) \neq \mathbf{E}(B \to A)$. Cult aggressively threatens Kingdom ($P = 0.54 \to \text{MOBILIZE}$), while Kingdom remains calm and watchful ($P = 0.05 \to \text{OBSERVE}$).
2. **Capability Gate**:
   A faction cannot initiate offensive war (`ATTACK`, `SKIRMISH`, `MOBILIZE`) if `militaryReadiness < 0.35` or `economicStockpile < 0.10`. Exhausted factions attempting to wage war are blocked and redirected to `RETREAT` or `SHADOW`.
3. **Uncertainty Gate**:
   A faction cannot escalate beyond `OBSERVE` or `AVOID` if `informationConfidence < 0.30`. Low certainty restricts premature mobilization on unverified rumors.
4. **Involuntary Capitulation vs Hysteresis**:
   Severe terror ($F > 0.85$) combined with military depletion ($< 0.15$) triggers involuntary `SURRENDER`, which cleanly bypasses hostility hysteresis.
5. **Peaceful De-Escalation Hysteresis**:
   Downward transitions require pressure to fall below the stage threshold minus $\Delta_{\text{hysteresis}} = 0.12$, preventing rapid 1-tick border oscillation.

### 11.5 Empirical Benchmark Validation (1,000 Ticks)

Evaluated via `benchmarks/behavioral-evaluation/faction_escalation_benchmark.mjs` (runtime 2.43 ms, 412,201 ticks/sec):
- **Phase 1 (Contact & Encroachment)**: Escalated from `UNAWARE` $\to$ `SHADOW` $\to$ `THREATEN` on territorial trespass.
- **Phase 2 (Diplomacy & Trade)**: Settlers established commercial exchange (`TRADE`) with Iron Clans upon signing treaty.
- **Phase 3 (Treachery & War)**: Border raid and treaty breach triggered casus belli and rapid escalation to `SKIRMISH` ($P = 0.65$).
- **Phase 4 (Capability Gating)**: Starved Settlers blocked from `ATTACK`, preventing offensive suicide.
- **Phase 5 (Surrender & Alliance)**: Exhausted Settlers sued for `SURRENDER`; Forest Wardens and Iron Clans forged mutual defense `ALLY`.
- **Determinism**: 100% bit-for-bit trajectory equivalence from snapshot restore.

---

## 12. Milestone G: Civilization-Scale Simulation, Dynamic Trade Routes & 5-Tier Cognitive LOD Engine

Milestone G establishes civilization-scale world simulation, dynamic economic route evaluation with danger rerouting, and a 5-tier **Cognitive Level-of-Detail (LOD)** engine (`packages/core/src/CivilizationSimulationSystem.js`). It allows worlds with thousands of nomadic agents, patrols, trade caravans, and settlements to execute with high computational efficiency while adhering strictly to the **Host Game Authority Invariant** (middleware evaluates perceived dangers, route utilities, and cognitive cadences while the host engine controls physical pathfinding, collision, and rendering).

### 12.1 5-Tier Cognitive Level-of-Detail (LOD) Engine

To achieve massive scale without unbounded CPU consumption, cognitive processing is stratified into 5 spatial distance tiers around the primary focus origin (e.g. camera, active player, or viewport):

| LOD Tier | Spatial Distance ($d$) | Update Cadence | Cognitive Processing Scope |
| :--- | :---: | :---: | :--- |
| **`LOD0_IMMEDIATE`** | $d < 30\text{m}$ | **1 tick** | Full per-tick simulation: micro-intent ranking, continuous PAD affect, precise audio and threat perception, direct social tensors. |
| **`LOD1_TACTICAL`** | $30\text{m} \le d < 80\text{m}$ | **5 ticks** | Squad-level tracking, amortized fear updates, formation coordination, group doctrine adherence. |
| **`LOD2_REGIONAL`** | $80\text{m} \le d < 250\text{m}$ | **20 ticks** | Macro-state machine (`HOLD`, `PATROL`, `FORAGE`, `RETREAT`), bounding-box proximity, aggregate unit morale. |
| **`LOD3_MACRO_ROUTE`** | $250\text{m} \le d < 1000\text{m}$ | **100 ticks** | Corridor waypoint progression, travel speed modulation, encounter probability sampling, trade delivery flows. |
| **`LOD4_OFFSCREEN`** | $d \ge 1000\text{m}$ | **500 ticks** | Statistical macro-simulation: regional economic supply/demand, background faction territory pressure, demographic shifts. |

### 12.2 State Continuity Invariant Across LOD Boundaries

When camera or player movement triggers rapid tier promotion or demotion (e.g. a camera cut promoting an entity directly from `LOD4_OFFSCREEN` to `LOD0_IMMEDIATE`):
- All internal affective coordinates ($\text{fear}$, $\text{morale}$, $\text{wealth}$, $\text{cargo}$) remain strictly continuous.
- Discontinuous resets, state amnesia, and numerical NaN corruptions are mathematically forbidden.
- *Empirical Result*: Focus shifts across 363 simultaneous entity tier transitions verified 100% state continuity preservation with zero numerical discontinuity.

### 12.3 Dynamic Economic Route Appraisal & Danger Rerouting

Trade caravans select travel routes by optimizing a multi-criteria utility function over candidate corridors:

$$U(\text{route}) = \text{clamp}_{[0, 1]}\left(\frac{\Delta \text{Price}}{50}\right) - \left(\text{Danger} \cdot (1 - \text{RiskTolerance}) \cdot 1.5\right) - \left(\frac{\text{Distance}}{500} \cdot 0.3\right) - \left(\frac{\text{Toll}}{50} \cdot 0.2\right)$$

#### Dynamic Rerouting Behavior:
- Under peacetime conditions, caravans choose the direct highland mountain pass ($150\text{m}$) despite minor elevation, maximizing profit ($U = 0.58 > U_{\text{detour}} = 0.39$).
- Upon a lethal bandit ambush on the pass, route danger spikes ($\text{Danger} = 0.85 \to \text{BLOCKED}$).
- The system automatically re-evaluates alternatives; caravans immediately reroute through the longer river valley detour ($350\text{m}$, toll 5), choosing safety over distance until the threat subsides.

### 12.4 Temporal Danger Decay

Perceived route hazards decay exponentially toward baseline during peaceful intervals:

$$\text{Danger}(t + \Delta t) = \text{BaseDanger} + (\text{Danger}(t) - \text{BaseDanger}) \cdot 2^{-\frac{\Delta t}{\tau_{\text{danger}}}}$$

With $\tau_{\text{danger}} = 80$ ticks, route danger drops by over $70\%$ across 200 ticks of quiet traversal, allowing merchants to safely resume primary routes once patrols secure the pass.

### 12.5 Empirical Benchmark Validation (1,000 Entities, 1,000 Ticks)

Evaluated via `benchmarks/behavioral-evaluation/civilization_lod_trade_benchmark.mjs`:
- **Phase 1 (LOD Partitioning)**: All 5 tiers populated across 1,000 entities (LOD0: 20, LOD1: 40, LOD2: 140, LOD3: 400, LOD4: 400).
- **Phase 2 (Continuity Invariant)**: Focus shifted by 500m inducing 363 tier transitions; 100% continuity preserved.
- **Phase 3 (Danger Rerouting)**: Highland pass blocked by raid; caravans dynamically diverted to river detour.
- **Phase 4 (Danger Decay)**: Danger decayed from $1.00$ to $0.30$ across 200 peaceful ticks.
- **Phase 5 (Replay Determinism)**: 100% bit-for-bit trajectory equivalence across all entity coordinates and route states.
- **Performance**: Executed in **14.69 ms** (**27,223,107 entity updates/sec**).

---

## 13. Milestone H: Interactive Multi-Agent Godot 4 Showcase Integration

Milestone H delivers native engine verification and an interactive multi-agent civilization world showcase within the official **Godot 4.6 Engine** (`examples/godot/civilization_world_showcase.gd` and `tests/godot_project/run_civilization_godot_conformance.gd`). It validates cross-subsystem synthesis—connecting group contagion, rally mechanics, trade route danger rerouting, and 5-tier cognitive LOD inside an authentic game engine runtime while strictly adhering to the **Host Game Authority Invariant**.

### 13.1 Real Godot 4.6 Engine Architecture & Authority Boundaries

The showcase operates under a strict architectural contract:
- **Godot 4 Authority**:
  - Authoritative `CharacterBody3D` instances and physical velocities.
  - Pathfinding navigation meshes, physics raycasts, spatial collisions, and `move_and_slide()`.
  - Health pools, weapon legality, item ownership, and inventory transactions.
- **Fear AI Intelligence Scope**:
  - Ingests semantic observations (distances, threat intensities, peer states).
  - Evaluates internal affective states (PAD coordinates, raw fear, urgency, heartbeat BPM).
  - Emits semantic group directives (`MAINTAIN_FORMATION`, `RALLY_TO_LEADER`, `TACTICAL_FALLBACK`, `SCATTER_AND_FLEE`).
  - Evaluates trade route utilities and signals danger state changes (`SAFE`, `CONTESTED`, `BLOCKED`).

### 13.2 Headless Godot 4.6 Engine Conformance Verification

Executed via the official headless binary (`C:\tools\02-Dev\godot\Godot_v4.6-stable_win64_console.exe`):
1. **Multi-Agent Squad Rally Check**:
   - Leader at $(0, 0, 0)$ and wavering soldier at $(10, 0, 10)$ ($d = 14.14\text{m} < 35\text{m}$).
   - Godot calculates normalized steering vector $(-0.71, 0, -0.71)$ towards leader upon receiving `RALLY_TO_LEADER` directive. Verified [PASS].
2. **Dynamic Danger Rerouting Check**:
   - Highland Pass attacked ($\text{danger} = 0.85 \ge 0.75 \to \text{BLOCKED}$).
   - Godot trade caravan dynamically evaluates candidate routes and reroutes through River Detour ($\text{danger} = 0.10$). Verified [PASS].
3. **5-Tier Cognitive LOD Spatial Partitioning**:
   - Spatial distance evaluation verifies strict alignment across all 5 thresholds:
     - LOD0 ($15.0\text{m} < 30\text{m}$)
     - LOD1 ($50.0\text{m} < 80\text{m}$)
     - LOD2 ($120.0\text{m} < 250\text{m}$)
     - LOD3 ($400.0\text{m} < 1000\text{m}$)
     - LOD4 ($1200.0\text{m} \ge 1000\text{m}$)
   - Verified [PASS].

### 13.3 Empirical Engine Parity
- **Result**: 3 / 3 Engine Conformance Checks Passed (100% parity).
- **Execution Time**: Under 200 ms in headless console mode.

---

## 14. Milestone I: Integrated World Simulation, Roaming Nomads, Systemic Encounters & History Ledger

Milestone I integrates world-scale simulation dynamics into `packages/core/src/WorldSimulationSystem.js`, establishing an engine-agnostic middleware layer for roaming and nomadic groups, Fallout-style emergent systemic encounters, rumor and belief propagation across physical encounters, and a causally linked world history ledger.

### 14.1 Roaming & Nomadic Groups Architecture

The world simulation supports 7 distinct roaming party topologies:
- `PATROL`: Military scouting, border enforcement, territory protection.
- `CARAVAN`: Commercial traders transporting goods between nodes.
- `REFUGEES`: Displaced civilians fleeing famine, war, or disaster.
- `BANDITS`: Predatory raiders stalking contested transit corridors.
- `NOMAD_TRIBE`: Seasonal migration between forage and water grounds.
- `MERCENARIES`: Armed mercenary company seeking contracts or territory.
- `WILDLIFE_PACK`: Predators or territorial beasts driven by hunger.

#### Motivational Driver Vectors:
Each group maintains internal motivational drivers:
$$\mathbf{M}_{\text{group}} = \langle \text{fatigue},\, \text{hunger},\, \text{threatPressure},\, \text{morale} \rangle$$

- **Camp Lifecycle**:
  - Fatigue accumulates during travel ($\Delta f = +0.005/\text{tick}$).
  - When $\text{fatigue} \ge 0.80$, the group establishes a camp site (`INTENT_ESTABLISH_CAMP`) and rests.
  - While camped, fatigue recovers ($\Delta f = -0.020/\text{tick}$).
  - When $\text{fatigue} \le 0.10$, the group breaks camp (`INTENT_BREAK_CAMP`) and resumes route traversal.
- **Foraging & Subsistence**:
  - When hunger breaches starvation threshold ($\text{hunger} \ge 0.75$), groups transition to `FORAGING` (`INTENT_FORAGE`).
  - Upon satiety ($\text{hunger} \le 0.15$), they resume their primary travel intent (`INTENT_MARCH`).

### 14.2 Systemic Emergent Encounters (Fallout-style Organic Intersections)

Rather than static authored encounter tables, encounters emerge organically when roaming groups cross within proximity ($r \le 35\text{m}$):
- **Contextual Synthesis**:
  - Evaluates Faction bilateral escalation stage from `FactionSystem` (`getBilateralStance`).
  - Evaluates Relationship tensor $\mathbf{R}_{ij}$ (trust, grievance, dominance) between party leaders.
  - Evaluates military power ratio $\frac{\text{Power}_A}{\text{Power}_B}$ and wealth levels.
- **Emergent Encounter Matrix**:
  - Bandits intercepting a wealthy caravan with a power ratio $> 1.4\times$ emit `AMBUSH_INTERCEPTION` with advisory resolution `EXTORTION_PAID` ($\text{urgency} = 0.85$).
  - Rival patrols belonging to factions in `MOBILIZE`, `SKIRMISH`, or `ATTACK` emit `BORDER_SKIRMISH` with advisory resolution `COMBAT_ENGAGEMENT` ($\text{urgency} = 0.90$).
  - Refugees encountering a benevolent patrol emit `REFUGEE_ENCOUNTER` with advisory resolution `AID_PROVIDED`.
  - Predator packs encountering travelers emit `WILDLIFE_AMBUSH` with advisory resolution `COMBAT_ENGAGEMENT`.
  - Peacetime trade caravans crossing paths emit `PEACEFUL_CONVERGENCE` with advisory resolution `PEACEFUL_TRADE`.

### 14.3 Information, Rumor & Belief Dynamics

Distinguishes ground truth from observation, belief, and rumor:
- **Rumor Model**:
  $$\mathbf{R} = \langle \text{id},\, \text{topic},\, \text{truthEventId},\, \text{originLocation},\, \text{severity} \in [0, 1],\, \text{fidelity} \in [0, 1],\, \text{credibility} \in [0, 1],\, \text{hops} \rangle$$
- **Transmission Mechanics**:
  - Rumors are exchanged during encounters and camp meetings.
  - Per-hop fidelity degradation: $\text{fidelity}' = \text{fidelity} \cdot (1.0 - \lambda_{\text{hop}})$, with $\lambda_{\text{hop}} = 0.12$.
  - Distortion jitter: Severity undergoes stochastic noise proportional to transmission distortion rate ($\pm 10\%$).
  - Trust & Neuroticism gating:
    $$\text{Credibility} = \text{clamp}_{[0, 1]}\left((0.35 + 0.65 \cdot \mathbf{R}_{\text{receiver} \to \text{sender}}.\text{trust}) \cdot \text{fidelity} + (\text{Neuroticism} \cdot \mathbf{1}_{\text{severity} > 0.6} \cdot 0.25)\right)$$
    High neuroticism specifically amplifies credulity toward alarming or catastrophic rumors, creating systemic misinformation cascades that can escalate faction border tensions.

### 14.4 Causally Linked World History Ledger

Maintains an immutable chronological record of world-shaping events:
- Event types: `ENCOUNTER_OCCURRED`, `BATTLE_FOUGHT`, `CAMP_ESTABLISHED`, `CAMP_ABANDONED`, `MIGRATION_COMPLETED`, `RUMOR_SPREAD`.
- Bounded ring buffer policy: strictly enforces `maxHistoryEvents = 1,000` to prevent memory explosion during million-tick simulations.
- Queryable by entity, faction, topic, or timestamp.

### 14.5 Empirical Benchmark Validation (100 Roaming Groups, 1,175 Entities, 1,000 Ticks)

Evaluated via `benchmarks/behavioral-evaluation/world_simulation_benchmark.mjs`:
- **Simulation Horizon**: 1,000 continuous ticks with authoritative host game movement.
- **Encounter Throughput**: 43,198 proximity encounter evaluations executed cleanly.
- **Rumor Spread**: 352 rumor instances propagated organically across roaming networks.
- **History Ledger**: 1,000 events recorded and ring-buffer bounded.
- **Replay Determinism**: 100% bit-for-bit trajectory equivalence across mid-point snapshot restore at tick 500.
- **Performance**: Executed in **79.85 ms** (**12,523 ticks/sec** | **14,714,483 entity updates/sec**).

---

## 15. Milestone J: Massive-Scale Simulation & Latency Distribution Profiling (1 to 10,000 Entities)

Milestone J benchmarks the architectural scalability and component-level computational costs across scales $N \in [1, 10, 100, 1,000, 5,000, 10,000]$ entities (`benchmarks/behavioral-evaluation/massive_scale_benchmark.mjs`), tracking latency distributions ($\text{Mean}, p_{50}, p_{95}, p_{99}$), memory allocations, and serialization snapshots.

### 15.1 Scalability Matrix across Cohort Sizes

| Entity Scale ($N$) | Mean Latency | Median ($p_{50}$) | 95th %ile ($p_{95}$) | 99th %ile ($p_{99}$) | Ticks / Sec | Entity Updates / Sec | Snapshot Payload |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **$N = 1$** | 0.0057 ms | 0.0027 ms | 0.0155 ms | 0.0610 ms | 175,439 | 175,439 | 0.9 KB (0.11 ms) |
| **$N = 10$** | 0.0115 ms | 0.0017 ms | 0.0052 ms | 0.4738 ms | 86,957 | 869,565 | 3.2 KB (0.04 ms) |
| **$N = 100$** | 0.0133 ms | 0.0111 ms | 0.0272 ms | 0.0311 ms | 75,188 | 7,518,797 | 30.2 KB (0.07 ms) |
| **$N = 1,000$** | 0.0633 ms | 0.0538 ms | 0.1754 ms | 0.3576 ms | 15,798 | 15,797,788 | 301.4 KB (0.32 ms) |
| **$N = 5,000$** | 0.0616 ms | 0.0512 ms | 0.0817 ms | 0.5651 ms | 16,234 | 81,168,831 | 1.3 MB (1.20 ms) |
| **$N = 10,000$** | **0.0758 ms** | **0.0674 ms** | **0.1176 ms** | **0.1882 ms** | **13,193** | **131,926,121** | **2.6 MB (2.76 ms)** |

### 15.2 Key Architectural Scaling Insights

1. **Subframe Budget Compliance**:
   - In a standard 60 FPS game engine, the total frame time budget is $16.67\text{ ms}$.
   - At **10,000 concurrent entities**, the middleware $p_{99}$ latency is **$0.1882\text{ ms}$**—consuming less than **$1.13\%$** of a single frame budget!
2. **Sub-linear Scaling via 5-Tier Cognitive LOD**:
   - As $N$ expands from $100$ to $10,000$ ($100\times$ increase), per-tick latency increases by only $5.7\times$ (from $0.0133\text{ ms}$ to $0.0758\text{ ms}$).
   - This sub-linear efficiency is directly enabled by the 5-Tier Cognitive LOD architecture, which throttles off-screen simulation cadences to once every 500 ticks while maintaining per-tick simulation for immediate actors.
3. **Snapshot Serialization**:
   - Full world state across 10,000 active agents, roaming groups, factions, and relationships serializes to **2.6 MB** in **2.76 ms**, supporting frictionless autosave checkpoints and network synchronization.

---

## 16. Milestone K: Multi-Language SDK Conformance & Protocol Extensibility

Milestone K validates cross-runtime protocol conformance across language ecosystems (Python 3.14, .NET 8 / C#, Godot 4.6 GDScript, and Node 24) and establishes protocol forward-compatibility and modular capability negotiation (`tests/conformance/cross-runtime-conformance.test.js` and `benchmarks/behavioral-evaluation/cross_runtime_benchmark.mjs`).

### 16.1 Protocol Forward Compatibility & Modular Extensibility

1. **Defensive Schema Parsing**:
   - The canonical protocol validator (`packages/protocol/src/validator.js`) defensively admits forward-compatible optional fields in incoming payloads (e.g. `future_subsystem_tensor`, `meta_spatial_biome_id`) without failing validation, preserving backwards/forwards interop across engine plugin upgrades.
   - Validation throughput achieves **8,460,666 validations/sec** ($0.000118\text{ ms/op}$).

2. **Optional Module Negotiation (`OPTIONAL_MODULES`)**:
   - Defined formal modular subsystem enumeration in `packages/protocol/src/types.js`:
     `affect`, `memory`, `relationships`, `groups`, `factions`, `civilization_lod`, `world_simulation`.
   - Engine runtimes can selectively query and handshake active modules at **15,385,089 handshakes/sec**.

### 16.2 Cross-Runtime Conformance Matrix

| Runtime / Engine | Conformance Suite | Checks / Fixtures | Result | Execution Time |
| :--- | :--- | :---: | :---: | :---: |
| **Node.js 24 / ES Modules** | Jest Full Conformance Suite | 240 suites, 1,720+ tests | **PASS (100%)** | Full CI Suite |
| **Python 3.14 SDK Client** | `tests/conformance/run_python_conformance.py` | 4/4 Canonical Fixtures | **PASS (100%)** | 879.49 ms |
| **.NET 8 / C# Package** | `tools/test_clean_csharp_install.ps1` | 4/4 Integration Models | **PASS (100%)** | 3,676.56 ms |
| **Godot 4.6 GDScript** | `tools/test_godot_civilization_conformance.ps1` | 3/3 3D Spatial Checks | **PASS (100%)** | 1,159.37 ms |
| **Unity UPM Package** | `packages/adapters/unity/` | External Editor Verification | `IMPLEMENTED_NOT_VERIFIED` | `BLOCKED_EXTERNAL_DEPENDENCY` |
| **Unreal Engine 5** | `packages/adapters/unreal/` | Adapter kept for later Unreal hosts | `DEFERRED_KEEP_ADAPTER` | not current work |

*Engine policy:* Unreal is **deferred, adapter kept** so Unreal games can connect later. Do not install UE5 now. Unity stays `IMPLEMENTED_NOT_VERIFIED` until a Unity host and Editor exist. Missing Unreal does not block today’s work. “Any game” is the wire protocol.

---

## 17. Milestone L: Comparative Behavioral Baselines & Systematic Subsystem Ablations

Milestone L evaluates Fear AI against standard game AI architectures (Finite State Machines, Utility AI, and Behavior Trees) under identical stress environments, and conducts systematic component ablations to prove the individual contribution of habituation, trauma memory, social contagion, and Big-Five identity (`tests/baseline-ablation-comparison.test.js` and `benchmarks/behavioral-evaluation/baseline_ablation_benchmark.mjs`).

### 17.1 Comparative Baseline Performance

| Metric | Finite State Machine (FSM) | Behavior Tree (BT) | Utility AI | Fear AI (Full) | Advantage |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Boundary Noise Chatter** ($200\text{ ticks, }\pm 5\%$) | 16 rapid flips | 16 rapid flips | 0 flips | **0 flips** | Eliminates edge oscillation via dual-threshold hysteresis |
| **Post-Threat Cooldown** ($\text{fear} < 0.1$) | 1 tick (instant drop) | 1 tick (instant drop) | 1 tick (instant drop) | **41 ticks** | Realistic biological decay gradient and trauma retention |
| **Archetype Expressiveness** (Shannon Entropy) | 0.0000 bits (monolithic) | 0.0000 bits (monolithic) | 0.4500 bits | **1.1489 bits** | Trait-differentiated intent diversity across archetypes |
| **Subsystem Memory** | None (stateless) | None (tick-local) | None (curve-only) | **4-Tier Cognitive** | Episodic retention, trauma dread, habituation |

### 17.2 Systematic Subsystem Ablation Matrix

| Ablation Condition | Mechanism Ablated | Observed Impact on Behavior | Significance |
| :--- | :--- | :--- | :--- |
| **`FULL_FEAR_AI`** | None (Nominal) | Fear cools to $0.204$ under repeated harmless ambient stimuli. | Baseline benchmark standard |
| **`ABLATION_NO_HABITUATION`** | Desensitization disabled | Fear remains locked at **$1.000$** ($+0.796$ gap); infinite terror loops on mundane stimuli. | Proves necessity of habituation for believable horror pacing |
| **`ABLATION_NO_IDENTITY`** | Uniform traits ($0.5$) | Cross-archetype response variance collapses from **$0.165$ to $0.000$** (100% loss of personality). | Proves Big-Five identity drives behavioral diversity |
| **`ABLATION_NO_TRAUMA`** | Dread zones disabled | Agents re-enter lethal ambush coordinates with zero dread amplification. | Validates persistent spatial trauma memory |
| **`ABLATION_NO_CONTAGION`** | Group contagion disabled | Units fail to exhibit collective panic tipping points or heroic leader rallies. | Proves collective intelligence dynamics |











