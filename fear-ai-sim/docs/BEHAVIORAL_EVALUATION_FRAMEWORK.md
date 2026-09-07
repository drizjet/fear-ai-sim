---
title: Fear AI Behavioral Evaluation Framework & AffectSim Benchmark Specification
created: 2026-09-06
updated: 2026-09-06
type: specification
status: active
---

# Fear AI Behavioral Evaluation Framework & AffectSim Benchmark Specification

## 1. Thesis: Universal Architecture $\neq$ World's Best Fear AI

Proving that Fear AI functions as a universal, engine-agnostic middleware is an architectural milestone. However, claiming that Fear AI is the **world's premier affective intelligence system** requires an empirical, scientific evaluation program, not merely passing unit tests.

The goal of this framework is to establish a rigorous, reproducible, and interactive evaluation standard (inspired by the August 2026 *AffectSim* benchmark paradigm) that directly compares Fear AI against common game AI paradigms across multidimensional behavioral, psychological, and computational axes.

---

## 2. The AffectSim Evaluation Paradigm

Fixed offline observation feeds fail to capture how affective agents behave when perception, occlusion, navigation meshes, dynamic distance, and group contagion interact in real time. The evaluation must test:

$$\text{Scenario Stimuli} \times \text{Personality Trait Vectors} \times \text{Environment Topologies} \times \text{Observation Uncertainty} \longrightarrow \text{Behavioral Vector Trajectories}$$

### 2.1 The Baseline Models

To evaluate whether Fear AI's continuous PAD (Pleasure-Arousal-Dominance) affective model, hysteresis state transitions, and habituation curves deliver superior believability and designer control, Fear AI is evaluated against three industry-standard baselines:

1. **Baseline A: Classic Finite State Machine (FSM)**
   - 4 discrete states: `IDLE` $\to$ `ALERT` $\to$ `FLEE` $\to$ `FREEZE`.
   - Transitions triggered by rigid distance/intensity thresholds (e.g. `distance < 5m` $\to$ `FLEE`).
   - Zero internal memory of prior trauma; instantaneous state snapping upon threshold crossing.

2. **Baseline B: Behavior Tree (BT) Fear Selector**
   - Hierarchical Selector/Sequence tree evaluating condition nodes per tick.
   - Priority sequence: `IsUnderDirectThreat` $\to$ `FleeToCover`; `IsSoundNearby` $\to$ `InvestigateSound`; `Fallback` $\to$ `Patrol`.
   - Memory implemented as simple cooldown timers rather than emotional integration.

3. **Baseline C: Rule-Based Flocking Panic (Boids Heuristic)**
   - Classic Reynolds steering vectors with an inverted threat force.
   - Contagion modeled by simple radius counting ($N$ panicking neighbors within radius $R$ triggers panic).

---

## 3. Core Evaluation Metrics

Rather than aggregating results into an arbitrary single score, the framework evaluates six complementary orthogonal dimensions:

### 3.1 Personality Differentiation Index (PDI)
- **Definition**: Quantifies the statistical separation of behavioral trajectories between different personality profiles (e.g., High Neuroticism Civilian vs. High Resilience Veteran) under identical environmental stimuli.
- **Formulation**:
  $$\text{PDI} = \frac{1}{|\mathcal{S}|} \sum_{s \in \mathcal{S}} \mathcal{W}_1\left(\mathcal{P}_{\text{Neurotic}}(s), \mathcal{P}_{\text{Stoic}}(s)\right)$$
  where $\mathcal{W}_1$ is the Wasserstein-1 (Earth Mover's) distance between the velocity/action distributions.
- **Target**: Fear AI must produce $\text{PDI} > 0.40$ (clear, distinctive personalities), whereas FSM and BT models typically collapse to $\text{PDI} < 0.10$ due to rigid threshold sharing.

### 3.2 Hysteresis & Recovery Smoothness (HRS)
- **Definition**: Measures the physiological plausibility of calming down after acute terror.
- **Failure Mode in Baselines**: FSMs instantly snap from `FLEE` to `IDLE` the instant a monster rounds a corner (state flicker).
- **Target**: Physiological exponential recovery decay ($Fear(t) = Fear_0 \cdot e^{-\lambda t}$) and panic-lock prevention of rapid state oscillation.

### 3.3 Social Contagion Fidelity (SCF)
- **Definition**: Measures the propagation velocity of vocalized panic through clustered groups, as well as the damping effect of a high-leadership agent.
- **Metric**:
  - Panic cascade speed across distance.
  - Leader damping factor: reduction in cluster panic area when a leader with `leadership > 0.7` is present.

### 3.4 Sensory Ambiguity Resilience (SAR)
- **Definition**: Measures how agents behave under degraded observations (e.g. occluded targets, distant sounds in fog of war).
- **Metric**:
  - Ability to synthesize sound intensity and spatial proximity into directional caution without seeing the monster.
  - Absence of omniscient "radar" behaviors.

### 3.5 Designer Controllability & Predictability (DCP)
- **Definition**: The degree to which changing a tuning knob (e.g., `neuroticism` or `pacing_intensity`) produces monotonic, predictable behavioral shifts without chaotic simulation collapse.

### 3.6 Computational Efficiency (CE)
- **Definition**: Cost per agent evaluation in microseconds, ensuring that advanced affective intelligence does not exceed game engine frame budgets.
- **Target**: Headless compute $< 0.005$ ms per agent; loopback WebSocket overhead $< 0.05$ ms.

---

## 4. Benchmark Scenarios

1. **Scenario Alpha: The Lone Stalker**
   - 1 NPC exploring a maze corridor encounters an apex predator at a blind corner.
   - Evaluates: Alert transition speed, scream vocalization, panic-lock duration, and flee vector.

2. **Scenario Beta: The False Alarm & Habituation**
   - Repeated harmless scary stimuli (e.g. flickering lights, loud steam pipes) delivered every 5 seconds.
   - Evaluates: Habituation curve desensitization vs FSM endless repetition.

3. **Scenario Gamma: Mass Evacuation & Leadership Damping**
   - 20 NPCs in a settlement hall; 1 creature breaches the rear exit.
   - Evaluates: Contagion cascade, crowd screaming, and leader reassurance containment.

4. **Scenario Delta: The Haunted Ruins (Persistent Dread)**
   - NPCs pass through an area where allies were previously slain (spatial trauma zone).
   - Evaluates: Ambient anxiety buildup in the absence of visible threats.
