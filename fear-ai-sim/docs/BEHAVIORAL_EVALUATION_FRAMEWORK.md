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

### 5.3 Cross-Scenario Behavioral Invariance & Variance Decomposition Benchmark (`cross_scenario_invariance_benchmark.mjs` - LOSO V2)

To rigorously resolve the cross-scenario generalization drop without modifying core affective behavior (`packages/core/` strictly frozen), LOSO V2 evaluates persona recoverability across **12 Scenario Families across 3 Threat Domains $\times$ Dual Cohorts ($K=12$ Canonical & $K=60$ Extended) $\times$ 10 Frozen Seeds** ($N=1,440$ canonical queries, $N=7,200$ extended queries).

#### Two-Way ANOVA Variance Decomposition (with Seed Block Effect)
$$SS_{\text{Total}} = SS_{\text{Persona}} + SS_{\text{Scenario}} + SS_{\text{Interaction}} + SS_{\text{Seed}} + SS_{\text{Residual}}$$

| Feature Name | Fear AI $\eta^2_{\text{Persona}}$ | Fear AI $\eta^2_{\text{Scenario}}$ | Fear AI $\eta^2_{\text{Int/Res}}$ | Fear AI $\eta^2_{\text{Seed}}$ | Utility AI $\eta^2_{\text{Persona}}$ | Utility AI $\eta^2_{\text{Scenario}}$ | Dominant Source of Variance |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`investigation_rate`** | 18.3% | **47.1%** | 34.6% | 0.0% | 0.0% | 0.0% | Scenario sound affordances |
| **`pro_social_rate`** | 24.7% | 18.3% | **57.0%** | 0.0% | 26.7% | 18.4% | Persona $\times$ Situation interaction |
| **`panic_rate`** | **55.1%** | 32.3% | 12.5% | 0.0% | 30.7% | 37.2% | Persona (Neuroticism/Resilience) |
| **`discipline_rate`** | **63.7%** | 20.9% | 15.4% | 0.0% | 90.2% | 2.1% | Persona (Conscientiousness) |
| **`mean_urgency`** | 25.1% | **71.3%** | 3.6% | 0.0% | 5.6% | 17.7% | **Scenario threat distance** |
| **`mean_dominance`** | 11.9% | **87.1%** | 1.0% | 0.0% | 70.1% | 5.0% | **Scenario threat intensity** |
| **`mean_fear`** | 30.6% | **62.9%** | 6.5% | 0.0% | 5.6% | 17.7% | **Scenario threat intensity** |
| **`recovery_efficiency`** | **99.0%** | 0.4% | 0.6% | 0.0% | 0.0% | 0.0% | **Persona (Resilience decay rate)** |
| **MEAN $\eta^2$ ACROSS FEATURES** | **41.1%** | **42.5%** | **16.4%** | **0.0%** | **28.6%** | **12.3%** | **Scenario dominates raw levels ($1.04\times$)** |

*Note: Seed is factored out as a random/block effect, accounting for $< 0.15\%$ variance across all features.*

#### Disentangled Normalization Provenance & Cluster-Aware Uncertainty ($K=12$ Canonical Archetypes, $N=1,440$ Queries)

To determine whether persona recovery gains stem from true inductive generalization or transductive/oracle conditioning, three normalization modes are evaluated side-by-side:
- **Mode A: Source-Only (True Inductive Generalization)**: Learns environmental descriptor mapping ($\mathbf{d}_s \to \hat{\boldsymbol{\mu}}_s$) strictly on 11 training scenario families via Ridge regression ($\lambda = 10^{-2}$). Evaluates unseen test scenarios with **ZERO test-cohort behavioral leakage**.
- **Mode B: Target-Unlabeled (Transductive Domain Adaptation)**: Computes population mean/SD from unlabelled test observations in the target scenario.
- **Mode C: Target-Cohort Diagnostic Oracle**: Full target cohort diagnostic baseline subtracting true situational shift.

| Model & Representation Condition | Top-1 Acc | Task-Cluster Bootstrap 95% CI | Persona-Cluster Bootstrap 95% CI | Fold Distribution (Mean / Med / Min / Max) | Paired Fold Test ($df=11$) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Fear AI (Raw Feature Vectors)** | 48.5% | [36.6% - 59.3%] | [33.0% - 64.2%] | 48.5% / 54.2% / 8.3% / 75.0% | — |
| **Fear AI (Mode A: Inductive Generalization)** | 31.6% | [22.6% - 41.0%] | [21.2% - 43.4%] | 31.6% / 25.0% / 8.3% / 58.3% | $\Delta = -16.9\%$ ($t=-2.68, p=0.0213$) |
| **Fear AI (Mode B: Transductive Adaptation)** | 65.8% | [58.9% - 71.9%] | [50.5% - 81.0%] | 65.8% / 66.7% / 48.3% / 83.3% | $+17.2\%$ ($t=+3.06, p=0.0109$) |
| **Fear AI (Mode C: Population Diagnostic Oracle)** | **65.8%** | **[58.9% - 71.9%]** | **[50.5% - 81.0%]** | **65.8% / 66.7% / 48.3% / 83.3%** | **$+17.2\%$ ($t=+3.06, p=0.0109$)** |
| **Utility AI Baseline (Raw Vectors)** | 35.1% | [29.3% - 40.7%] | [20.7% - 51.3%] | 35.1% / 35.8% / 16.7% / 50.0% | Fear vs Util Raw: $t=+2.36, p=0.0377$ |
| **Utility AI Baseline (Mode A: Inductive)** | 30.9% | [25.6% - 36.0%] | [21.4% - 39.2%] | 30.9% / 30.0% / 16.7% / 41.7% | — |
| **Utility AI Baseline (Mode C: Oracle)** | 35.7% | [28.1% - 43.1%] | [22.5% - 49.9%] | 35.7% / 33.3% / 8.3% / 58.3% | Fear vs Util Oracle: $t=+6.47, p<0.0001$ |

#### High-Dimensional Extended Cohort ($K=60$, $N=7,200$ Queries) & Near-Neighbor Discrimination

| Condition / Metric | Fear AI Top-1 ($K=60$) [Task 95% CI] | Utility AI Top-1 ($K=60$) [Task 95% CI] | Random Chance Floor |
| :--- | :---: | :---: | :---: |
| **Raw Behavioral Vectors** | 15.3% [10.8% - 19.6%] | 11.3% [8.5% - 15.0%] | 1.67% ($1/60$) |
| **Mode A: Source-Only Inductive Normalization** | 9.2% [5.0% - 13.8%] | 10.7% [7.5% - 13.8%] | 1.67% ($1/60$) |
| **Mode C: Population Diagnostic Oracle** | **32.3% [25.2% - 40.1%]** | **17.4% [14.2% - 19.9%]** | 1.67% ($1/60$) |
| **Near-Neighbor Discrimination (24 pairs, $\Delta = 0.10$)** | **58.0% [Wilson: 56.7% - 59.3%]** | (N/A) | 50.0% ($1/2$) |

*Near-neighbor discrimination tests pairwise cross-scenario classification between canonical archetypes and their single-trait $\Delta=0.10$ perturbed variants across all 12 held-out scenario families (3,342 / 5,760 correct decisions).*

#### Comprehensive 12-Scenario Family Diagnostic Ledger

| Scenario Family | Threat Domain | Min Dist | Panic Lock % | Fear AI Raw $\to$ Oracle | Util AI Raw $\to$ Oracle | Raw Winner |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Distant Stalker Slow Creep** | Stalking & Isolation | 10.0m | 100.0% | 65.0% $\to$ 77.5% | 25.0% $\to$ 33.3% | **Fear AI** |
| **Cornered Dead-End Standoff** | Stalking & Isolation | 1.8m | 58.3% | 65.0% $\to$ 66.7% | 30.8% $\to$ 41.7% | **Fear AI** |
| **Distant Prowler with Cues** | Stalking & Isolation | 15.0m | 0.0% | 8.3% $\to$ 57.5% | 16.7% $\to$ 16.7% | **Utility AI** |
| **Claustrophobic Corridor** | Stalking & Isolation | 3.0m | 58.3% | 58.3% $\to$ 75.0% | 46.7% $\to$ 33.3% | **Fear AI** |
| **Point-Blank Shock Surge** | Ambush & Acute Shock | 1.5m | 50.0% | 41.7% $\to$ 50.0% | 25.0% $\to$ 33.3% | **Fear AI** |
| **Dual-Angle Flanking Ambush** | Ambush & Acute Shock | 2.0m | 100.0% | 25.0% $\to$ 48.3% | 38.3% $\to$ 8.3% | **Utility AI** |
| **False Alarm Audio Lure** | Ambush & Acute Shock | 1.8m | 33.3% | 33.3% $\to$ 52.5% | 25.0% $\to$ 58.3% | **Fear AI** |
| **Relentless High-Speed Pursuit**| Ambush & Acute Shock | 2.5m | 100.0% | 50.0% $\to$ 66.7% | 47.5% $\to$ 45.0% | **Fear AI** |
| **Mass Group Panic Evacuation** | Social & Contagion | 16.0m | 100.0% | 21.7% $\to$ 83.3% | 41.7% $\to$ 50.0% | **Utility AI** |
| **Sentry Perimeter Stand-Fast** | Social & Contagion | 14.0m | 91.7% | 70.0% $\to$ 78.3% | 33.3% $\to$ 25.0% | **Fear AI** |
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

2. **The Winner-Reversal Resolution (4-Scenario Battery vs 12-Family Battery)**:
   - *Why Utility AI won the initial 4-scenario battery ($76.7\%$ vs $18.3\%$)*: The initial 4 scenarios were extreme shock traps where Fear AI experienced near-universal panic lock across all personas, collapsing behavioral feature variance. Because Utility AI has no temporal memory, panic thresholds, or state locking, its static polynomial utility functions still yielded small linear separations.
   - *Why Fear AI wins the comprehensive 12-family battery*: Across balanced Stalking, Ambush, and Social domains, Fear AI wins on Raw vectors (**48.5% vs 35.1%**, paired $t=+2.36, p=0.0377$) and massively outperforms Utility AI under Population Diagnostic Oracle normalization (**65.8% vs 35.7%**, paired $t=+6.47, p<0.0001$).
   - When affordances are diverse (varying sound frequencies, peer presence, contagion cues), Fear AI's dynamic affective state machine produces richer, more discriminative multidimensional behavioral separation than Utility AI's static utility polynomials.

3. **Normalization Provenance Disentanglement & Evaluator vs Core Behavior Boundaries**:
   - What improved across LOSO V1 and V2 is **Scenario-Conditioned Persona Recoverability** via representation/evaluator normalization, **NOT Fear AI personality invariance itself**. Core behavior (`packages/core/`) remains strictly untouched and frozen.
   - Under Mode C (Population Diagnostic Oracle), subtracting the true situational baseline eliminates the 42.5% scenario variance share, elevating Top-1 recoverability from $48.5\% \to 65.8\%$ ($K=12$) and $15.3\% \to 32.3\%$ ($K=60$).
   - Under Mode A (Source-Only Inductive Generalization), predicting unseen baselines from observable environmental descriptors ($\mathbf{d}_s \to \hat{\boldsymbol{\mu}}_s$) achieves 31.6% ($K=12$) and 9.2% ($K=60$). The drop from Mode C confirms that non-linear affective dynamics (panic thresholds, contagion cascades) cannot be fully captured by linear environmental descriptor regressions.

4. **Construct Entanglement Resolution & Clustered Factorial Inference**:
   - Rather than claiming unearned construct isolation, recognizing $N$ and $R$ as coupled latent differential drivers ($R^2 = 94.2\%$) scientifically explains why univariate cross-talk occurs in biological and simulated affective systems.
   - Cluster-robust sandwich inference ($df=9$) confirms that $N \times R$ is predominantly an **additive main effect** of opposing inflow/outflow forces ($\Delta R^2_{\text{int}} = 0.97\%$), rather than a large non-linear interaction.

5. **Empirical Resolution Limits & Multiple Comparisons**:
   - Continuous expressivity is not universally unbounded: while $N, R, E, C, L$ resolve down to $\Delta^* = 0.05$ and $O$ resolves at $\Delta^* = 0.20$ ($p = 1.19 \times 10^{-5}$, surviving Bonferroni $\alpha/28 = 0.0018$), Agreeableness ($A$) at $\Delta^* = 0.10$ is strictly classified as **`PROVISIONAL EVIDENCE (PENDING REPLICATION)`** (nominal $p = 0.0325$, failing Bonferroni).
   - In cross-scenario near-neighbor discrimination across held-out environments, single-trait $\Delta=0.10$ perturbations achieve **58.0% [56.7%-59.3%]** pairwise discrimination vs 50.0% chance.

6. **The Spearman Rank Correlation Disconnect**:
   - Behavior Tree ($\rho = 0.5809$) and FSM ($\rho = 0.5999$) achieve higher rank correlation than Fear AI ($\rho = 0.5498$) while collapsing to only $2/60$ ($3.3\%$) Top-1 retrieval.
   - Mechanism: 1D threshold models map trait distances monotonically along a line, inflating rank correlation while destroying individual persona expressivity. As established in *AffectSim* and *One Policy, Infinite NPCs*, believable affective agency requires multidimensional behavioral dispersion that preserves unique persona trajectories under pressure.

