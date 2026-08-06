# MASAC Implementation - TensorFlow.js

Full Multi-Agent Soft Actor-Critic implementation using TensorFlow.js for the Fear-AI simulation.

## Files Overview

| File | Description |
|------|-------------|
| `tf_network.js` | Neural network base classes (Actor, Critic, TwinCritic) |
| `replay_buffer.js` | Experience replay buffer (single and multi-agent) |
| `entropy_tuning.js` | Automatic entropy temperature tuning |
| `masac_trainer.js` | Core MASAC training algorithm |
| `state_extractors.js` | State extraction and reward functions |
| `masac_integration_v2.js` | Simulation integration layer |
| `verify_masac.js` | Verification and benchmark script |

## Architecture

### Actor Network (Gaussian Policy)
- Input: State (batch, state_dim)
- Hidden: Dense(256, relu) x 2
- Outputs: Mean and Log-Std for action distribution
- Reparameterization trick for sampling
- Tanh squashing for bounded actions

### Critic Network (Twin Q-Networks)
- Input: Concatenated state + action
- Hidden: Dense(256, relu) x 2
- Output: Q-value (single scalar)
- Twin networks to reduce overestimation
- Target networks with Polyak averaging

### Multi-Agent Setup
- **Decentralized Actors**: Each agent has its own policy network
- **Centralized Critic**: Single critic sees all agents' states and actions
- Shared replay buffer with global state

## CPU-Optimized Configuration

Since this runs on CPU, the following optimizations are applied:

```javascript
{
    hiddenDims: [128, 128],  // Reduced from [256, 256]
    batchSize: 32,           // Reduced from 256
    bufferSize: 10000,       // Reduced from 100000
    warmupSteps: 500,        // Reduced from 1000
    updateInterval: 1
}
```

Performance (measured on CPU):
- Action selection: ~1.5ms per agent
- Training step: ~20-50ms
- Actions per second: ~690

## Usage

### Basic Usage

```javascript
import { MASACIntegration } from './masac_integration_v2.js';

// Create integration
const masac = new MASACIntegration(simulation, {
    numPredators: 4,
    numPrey: 8,
    hiddenDims: [128, 128]
});

// Initialize
masac.initialize();

// In simulation loop:
// 1. Select actions
masac.selectActions();

// 2. After physics update
masac.postStep();

// Get metrics
const metrics = masac.getMetrics();
```

### Direct Trainer Usage

```javascript
import { MASACTrainer } from './masac_trainer.js';

const trainer = new MASACTrainer({
    numAgents: 4,
    stateDim: 16,
    actionDim: 2,
    hiddenDims: [128, 128],
    learningRate: 3e-4
});

// Select actions
const states = [[/* state 1 */], [/* state 2 */], ...];
const actions = trainer.selectActions(states);

// Store experience
trainer.store(states, actions, rewards, nextStates, dones, globalState, nextGlobalState);

// Training happens automatically after warmup
```

## State Dimensions

### Predator State (16 dimensions)
```
[0-1]   Position (x, y) normalized
[2-3]   Velocity (vx, vy) normalized
[4-5]   Nearest prey (distance, angle)
[6-7]   Pack center relative position
[8]     Number of nearby predators
[9]     Number of nearby prey
[10]    Average prey fear level
[11]    Time since last kill
[12-13] Heading to nearest safe zone
[14]    Energy level
[15]    Current strategy
```

### Prey State (20 dimensions)
```
[0-1]   Position (x, y) normalized
[2-3]   Velocity (vx, vy) normalized
[4-5]   Nearest predator (distance, angle)
[6]     Number of predators in danger zone
[7]     Number of predators in caution zone
[8]     Nearest prey (distance)
[9]     Number of nearby prey (herd size)
[10]    Fear level (0-1)
[11-14] Brain state one-hot (CALM, ANXIOUS, ALERT, PANIC)
[15]    Time in current state
[16-17] Nearest safe haven direction
[18]    Energy level
[19]    Trauma level
```

## Hyperparameters

```javascript
{
    learningRate: 3e-4,
    gamma: 0.99,          // Discount factor
    tau: 0.005,           // Soft update coefficient
    alpha: 0.2,           // Temperature (auto-tuned)
    batchSize: 32,        // CPU-optimized
    bufferSize: 10000,    // CPU-optimized
    targetEntropy: -2,    // -dim(action_space)
    gradientClip: 1.0     // Gradient clipping
}
```

## Reward Functions

### Predator Rewards
- Base survival: +0.01
- Kill bonus: +10.0
- Proximity to prey: +0.5 (close) to +0.05 (far)
- Pack coordination: +0.1
- Isolation penalty: -0.05

### Prey Rewards
- Base survival: +0.01
- Safe zone: +0.3 (distance > 300)
- Danger zone: -1.0 to -3.0 (distance < 100)
- Herding bonus: +0.1
- Death penalty: -10.0
- Calm escape bonus: +0.5

## Verification

Run the verification script:

```bash
node verify_masac.js
```

This tests:
1. TensorFlow.js backend
2. All network types
3. Replay buffer
4. Entropy tuning
5. Full MASAC training loop
6. Performance benchmarks

## Saving/Loading

```javascript
// Save
masac.save();

// Load
masac.load();
```

Models are saved to localStorage as JSON.

## References

- Soft Actor-Critic (SAC): Haarnoja et al., 2018
- Multi-Agent SAC: Same concept extended to multi-agent
- TensorFlow.js: https://js.tensorflow.org/
