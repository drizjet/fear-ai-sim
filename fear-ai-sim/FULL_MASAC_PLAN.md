# FULL MASAC IMPLEMENTATION PLAN
## Complete Deep RL System with TensorFlow.js

**Objective:** Replace simplified Q-tables with full neural network-based MASAC  
**Timeline:** 5-phase implementation  
**Target:** Production-quality deep RL with GPU acceleration

---

## PHASE 1: FOUNDATION (TensorFlow.js Setup)

### 1.1 Install TensorFlow.js
```bash
npm install @tensorflow/tfjs @tensorflow/tfjs-backend-webgl
```

### 1.2 Create Neural Network Base Class
**File:** `tf_network.js`

Features needed:
- Layer definitions (Dense, Activation)
- Forward pass
- Backward pass with gradients
- Weight saving/loading
- GPU acceleration support

```javascript
// Expected API:
class TFNetwork {
    constructor(layers)
    async forward(input) // Returns output tensor
    async backward(grads, learningRate) // Applies gradients
    save() // Returns serializable weights
    load(weights) // Restores weights
    softUpdate(other, tau) // Polyak averaging
}
```

### 1.3 Verify GPU Support
- Check WebGL backend availability
- Fallback to CPU if needed
- Performance benchmarking

**Deliverable:** Working TF.js with GPU acceleration

---

## PHASE 2: SAC COMPONENTS (Proper Implementation)

### 2.1 Actor Network (Gaussian Policy)
**File:** `sac_actor.js`

Architecture:
```
Input: state (batch, state_dim)
├─ Dense(256, relu)
├─ Dense(256, relu)
├─ Split into:
│   ├─ mean_head: Dense(action_dim, linear)
│   └─ log_std_head: Dense(action_dim, linear)
└─ Output: actions sampled from N(mean, std)
```

Features:
- Reparameterization trick
- Tanh squashing with log_prob correction
- Entropy computation
- Gradient computation for policy loss

### 2.2 Critic Network (Twin Q-Networks)
**File:** `sac_critic.js`

Architecture:
```
Input: [state, action] concatenated
├─ Dense(256, relu)
├─ Dense(256, relu)
└─ Dense(1, linear) // Q-value
```

Features:
- Two Q-networks (Q1, Q2)
- Target networks (Q1_target, Q2_target)
- Soft updates (Polyak averaging)
- Gradient computation for MSE loss

### 2.3 Experience Replay Buffer
**File:** `replay_buffer.js`

Features:
- Circular buffer (capacity: 100,000)
- Store: (s, a, r, s', done)
- Sample batches (size: 256)
- Prioritized experience replay (optional)

### 2.4 Automatic Entropy Tuning
**File:** `entropy_tuning.js`

Features:
- Learnable temperature α (alpha)
- Target entropy: -dim(action_space)
- Gradient descent on log(α)
- Ensures proper exploration

**Deliverable:** All SAC components working individually

---

## PHASE 3: MASAC MULTI-AGENT SYSTEM

### 3.1 Centralized Critic
**File:** `masac_critic.js`

Architecture:
```
Input: Global state (all agents' observations)
       + All agents' actions
├─ Dense(256, relu)
├─ Dense(256, relu)
└─ Output: Joint Q-value for team
```

Features:
- Takes concatenated observations from all agents
- Takes all agents' actions
- Outputs single Q-value for the team
- Used during training only

### 3.2 Decentralized Actors
**File:** `masac_actors.js`

Each agent has:
- Individual actor network (local observations only)
- Shared critic (during training)
- Independent action selection

### 3.3 MASAC Training Loop
**File:** `masac_trainer.js`

Algorithm per update:
```python
# 1. Sample batch from replay buffer
states, actions, rewards, next_states, dones = sample_batch()

# 2. Compute Q-targets
with torch.no_grad():
    next_actions, next_log_probs = actor(next_states)
    q1_next = q1_target(next_states, next_actions)
    q2_next = q2_target(next_states, next_actions)
    q_next = min(q1_next, q2_next)
    target_q = rewards + gamma * (1 - dones) * (q_next - alpha * next_log_probs)

# 3. Update Q-networks
q1_values = q1(states, actions)
q2_values = q2(states, actions)
q_loss = mse_loss(q1_values, target_q) + mse_loss(q2_values, target_q)
q_loss.backward()
optimizer_q.step()

# 4. Update policy
new_actions, log_probs = actor(states)
q1_new = q1(states, new_actions)
q2_new = q2(states, new_actions)
q_new = min(q1_new, q2_new)
policy_loss = (alpha * log_probs - q_new).mean()
policy_loss.backward()
optimizer_policy.step()

# 5. Update alpha (temperature)
alpha_loss = -(log_alpha * (log_probs + target_entropy).detach()).mean()
alpha_loss.backward()
optimizer_alpha.step()
alpha = log_alpha.exp()

# 6. Soft update target networks
q1_target = tau * q1 + (1 - tau) * q1_target
q2_target = tau * q2 + (1 - tau) * q2_target
```

**Deliverable:** Complete MASAC algorithm ready for training

---

## PHASE 4: SIMULATION INTEGRATION

### 4.1 State Extractors
**File:** `state_extractors.js`

Predator State (16 dimensions):
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
[15]    Current strategy one-hot
```

Prey State (20 dimensions):
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

### 4.2 Reward Functions
**File:** `reward_functions.js`

Predator Rewards:
```python
reward = 0.0

# Base survival
reward += 0.01

# Kill bonus
if kill_made:
    reward += 10.0

# Proximity to prey (shaping)
if nearest_prey_dist < 50:
    reward += 0.5
elif nearest_prey_dist < 100:
    reward += 0.2
elif nearest_prey_dist < 200:
    reward += 0.05

# Pack coordination bonus
if pack_members_nearby > 2:
    reward += 0.1

# Penalty for being alone
if isolated:
    reward -= 0.05

# Energy management
if energy_low:
    reward -= 0.02
```

Prey Rewards:
```python
reward = 0.0

# Base survival
reward += 0.01

# Distance from predators
if nearest_predator > 300:  # Safe zone
    reward += 0.3
elif nearest_predator > 200:
    reward += 0.1
elif nearest_predator < 100:  # Danger zone
    reward -= 1.0
elif nearest_predator < 50:   # Critical
    reward -= 3.0

# Herding bonus
if herd_size > 3:
    reward += 0.1

# Safe haven proximity
if near_safe_haven:
    reward += 0.2

# Death penalty
if captured:
    reward -= 10.0

# Calm bonus (successful escape without panic)
if fear_level < 0.3 and survived:
    reward += 0.5
```

### 4.3 Action Application
**File:** `action_applier.js`

Continuous Actions (2D):
```python
# Action from MASAC: [-1, 1] for each dimension
steer_x, steer_y = action

# Convert to acceleration
acceleration_x = steer_x * max_acceleration
acceleration_y = steer_y * max_acceleration

# Update velocity
vx += acceleration_x
vy += acceleration_y

# Clamp to max speed
speed = sqrt(vx^2 + vy^2)
if speed > max_speed:
    vx = (vx / speed) * max_speed
    vy = (vy / speed) * max_speed

# Apply damping
vx *= 0.98
vy *= 0.98

# Update position
x += vx
y += vy
```

### 4.4 Training Integration
**File:** `masac_integration_v2.js`

Components:
- Initialize MASAC with correct agent counts
- Pre-step: Select actions from all actors
- Post-step: Store transitions, trigger training
- Handle dynamic spawning
- Sync new agents with existing knowledge
- Export metrics and models

**Deliverable:** MASAC fully integrated with simulation

---

## PHASE 5: TESTING & OPTIMIZATION

### 5.1 Unit Tests
**File:** `tests/masac.test.js`

Tests needed:
- Actor forward pass returns valid actions
- Critic computes correct Q-values
- Replay buffer stores and samples correctly
- Training reduces loss over time
- Soft updates modify target networks correctly
- State extractors return correct dimensions

### 5.2 Integration Tests
**File:** `tests/masac_integration.test.js`

Tests needed:
- MASAC initializes without errors
- Agents select actions after initialization
- Training loop runs without crashing
- New predators are handled correctly
- Metrics are collected properly
- Models save and load correctly

### 5.3 Performance Optimization

Targets:
- Training step: < 50ms
- Action selection: < 5ms per agent
- Memory usage: < 500MB
- FPS with MASAC: > 30

Optimizations:
- Batch processing
- WebGL backend
- Gradient checkpointing
- Lazy tensor creation

### 5.4 Hyperparameter Tuning

Grid search over:
- Learning rates: [1e-4, 3e-4, 1e-3]
- Batch sizes: [64, 128, 256]
- Network sizes: [[64,64], [128,128], [256,256]]
- Entropy coefficients: [0.1, 0.2, 0.3]
- Discount factors: [0.95, 0.99, 0.995]

**Deliverable:** Optimized, tested, production-ready system

---

## IMPLEMENTATION ORDER

### Week 1: Foundation
- Day 1-2: TensorFlow.js setup and base network class
- Day 3-4: Actor network with proper distributions
- Day 5-7: Critic networks and target updates

### Week 2: MASAC Core
- Day 8-9: Replay buffer and entropy tuning
- Day 10-11: MASAC training loop
- Day 12-14: Multi-agent coordination

### Week 3: Integration
- Day 15-16: State extractors
- Day 17-18: Reward functions
- Day 19-21: Full simulation integration

### Week 4: Testing & Polish
- Day 22-24: Unit and integration tests
- Day 25-26: Performance optimization
- Day 27-28: Hyperparameter tuning

---

## TECHNICAL SPECIFICATIONS

### Neural Network Architecture

**Actor (Policy Network):**
```
Input: (batch_size, state_dim)
Layer 1: Dense(256), ReLU
Layer 2: Dense(256), ReLU
Output Mean: Dense(action_dim), Linear
Output Log-Std: Dense(action_dim), Linear (clamped [-20, 2])
```

**Critic (Q-Network):**
```
Input: (batch_size, state_dim + action_dim)
Layer 1: Dense(256), ReLU
Layer 2: Dense(256), ReLU
Output: Dense(1), Linear
```

### Hyperparameters (Final)
```yaml
learning_rate: 3e-4
gamma: 0.99
tau: 0.005
alpha: 0.2 (auto-tuned)
batch_size: 256
buffer_size: 100000
hidden_dims: [256, 256]
update_interval: 1
warmup_steps: 1000
```

### State Dimensions
- Predator: 16
- Prey: 20
- Action: 2 (continuous)

### Training Schedule
- Train every 1 step (after warmup)
- Gradient steps per update: 1
- Target network update: Soft (tau=0.005)
- Warmup: 1000 random steps

---

## DELIVERABLES CHECKLIST

### Phase 1
- [ ] TensorFlow.js installed
- [ ] TFNetwork base class
- [ ] GPU acceleration working
- [ ] Performance benchmark

### Phase 2
- [ ] Actor network
- [ ] Critic networks (twin)
- [ ] Target networks
- [ ] Replay buffer
- [ ] Entropy tuning
- [ ] Individual component tests

### Phase 3
- [ ] Centralized critic
- [ ] Decentralized actors
- [ ] MASAC training loop
- [ ] Multi-agent coordination
- [ ] Training metrics

### Phase 4
- [ ] State extractors
- [ ] Reward functions
- [ ] Action application
- [ ] Simulation integration
- [ ] Dynamic spawning support
- [ ] UI updates

### Phase 5
- [ ] Unit tests
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Hyperparameter tuning
- [ ] Documentation
- [ ] Demo video

---

## SUCCESS CRITERIA

1. **Functional:** Agents learn to hunt/evade better over time
2. **Performance:** 30+ FPS with 2000 agents + MASAC training
3. **Stability:** No crashes after 1 hour of continuous training
4. **Measurable:** Clear improvement in kill rates / survival rates
5. **Exportable:** Research data can be exported and analyzed
6. **Reproducible:** Same seed produces similar results

---

## RISK MITIGATION

| Risk | Mitigation |
|------|------------|
| TF.js performance issues | Fallback to smaller networks, CPU backend |
| Gradient instability | Gradient clipping, smaller learning rate |
| Memory overflow | Smaller buffer, gradient checkpointing |
| Browser compatibility | Multiple backend support, feature detection |
| Training divergence | Multiple random seeds, conservative hyperparameters |

---

## BUDGET (Time Estimate)

- **Phase 1:** 20 hours
- **Phase 2:** 25 hours
- **Phase 3:** 25 hours
- **Phase 4:** 20 hours
- **Phase 5:** 15 hours
- **Buffer:** 10 hours
- **Total:** ~115 hours (~3 weeks full-time)

---

## NEXT IMMEDIATE STEP

**START WITH PHASE 1.1:**
```bash
cd C:\Users\hippo\Desktop\fear-ai-sim
npm install @tensorflow/tfjs @tensorflow/tfjs-backend-webgl
```

Then create `tf_network.js` with basic layer functionality.

---

**Ready to proceed?** This plan will give you the full, non-simplified MASAC system with real neural networks, proper backpropagation, and all advanced features.
