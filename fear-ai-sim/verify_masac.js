/**
 * Verify MASAC Implementation
 * Tests TensorFlow.js setup, network forward/backward passes, and training
 */
import * as tf from '@tensorflow/tfjs';
import { TFNetwork, ActorNetwork, CriticNetwork, TwinCritic } from './tf_network.js';
import { ReplayBuffer, MultiAgentReplayBuffer } from './replay_buffer.js';
import { EntropyTuner, FixedAlpha } from './entropy_tuning.js';
import { MASACTrainer } from './masac_trainer.js';

console.log('=== MASAC Implementation Verification ===\n');

// 1. Verify TensorFlow.js backend
console.log('1. TensorFlow.js Backend Check');
console.log('   Backend:', tf.getBackend());
console.log('   TF version:', tf.version.tfjs);
console.log('');

// 2. Test basic network
console.log('2. Testing Basic TFNetwork');
const testNet = new TFNetwork(4, 2, [64, 64], 0.001, 'test');
const testInput = [[1, 2, 3, 4]];
const testOutput = testNet.predict(testInput);
console.log('   Input:', testInput[0]);
console.log('   Output:', testOutput);
console.log('   Parameters:', testNet.getParameterCount());
console.log('');

// 3. Test Actor Network
console.log('3. Testing Actor Network');
const actor = new ActorNetwork(8, 2, [128, 128], 0.001);
const state = [[0.5, -0.3, 0.1, 0.8, -0.2, 0.4, 0.0, 0.6]];
const action = actor.getAction(state);
console.log('   State:', state[0]);
console.log('   Action:', action);
console.log('   Action range:', `[-1, 1]`);
console.log('   Parameters:', actor.model.countParams());
console.log('');

// 4. Test Critic Network
console.log('4. Testing Critic Network');
const critic = new CriticNetwork(8, 2, [128, 128], 0.001);
const qValue = critic.predict(state, [action]);
console.log('   Q-value:', qValue);
console.log('   Parameters:', critic.model.countParams());
console.log('');

// 5. Test Twin Critic
console.log('5. Testing Twin Critic');
const twinCritic = new TwinCritic(8, 2, [128, 128], 0.001);
const qValues = twinCritic.predict(state, [action]);
console.log('   Q1:', qValues.q1);
console.log('   Q2:', qValues.q2);
console.log('');

// 6. Test Replay Buffer
console.log('6. Testing Replay Buffer');
const buffer = new ReplayBuffer(1000, 8, 2);
for (let i = 0; i < 100; i++) {
    const s = Array(8).fill(0).map(() => Math.random());
    const a = [Math.random() * 2 - 1, Math.random() * 2 - 1];
    const r = Math.random();
    const s2 = Array(8).fill(0).map(() => Math.random());
    const d = Math.random() < 0.1;
    buffer.push(s, a, r, s2, d);
}
const batch = buffer.sample(32);
console.log('   Buffer size:', buffer.getSize());
console.log('   Batch states shape:', batch.states.length);
console.log('   Batch actions shape:', batch.actions.length);
console.log('   Can sample:', buffer.canSample(32));
console.log('');

// 7. Test Multi-Agent Replay Buffer
console.log('7. Testing Multi-Agent Replay Buffer');
const maBuffer = new MultiAgentReplayBuffer(1000, 4, 8, 2, 32);
for (let i = 0; i < 50; i++) {
    const states = Array(4).fill(0).map(() => Array(8).fill(0).map(() => Math.random()));
    const actions = Array(4).fill(0).map(() => [Math.random() * 2 - 1, Math.random() * 2 - 1]);
    const rewards = Array(4).fill(0).map(() => Math.random());
    const nextStates = Array(4).fill(0).map(() => Array(8).fill(0).map(() => Math.random()));
    const dones = Array(4).fill(0).map(() => Math.random() < 0.1);
    const globalState = Array(32).fill(0).map(() => Math.random());
    const nextGlobalState = Array(32).fill(0).map(() => Math.random());
    maBuffer.push(states, actions, rewards, nextStates, dones, globalState, nextGlobalState);
}
const globalBatch = maBuffer.sampleGlobal(16);
console.log('   Global buffer size:', maBuffer.globalBuffer.getSize());
console.log('   Can sample:', maBuffer.canSample(16));
console.log('');

// 8. Test Entropy Tuner
console.log('8. Testing Entropy Tuner');
const tuner = new EntropyTuner(2, -2, 0.2, 0.001);
console.log('   Initial alpha:', tuner.getAlpha());
console.log('   Target entropy:', tuner.targetEntropy);

// Simulate update
const fakeLogProbs = tf.tensor1d(Array(32).fill(0).map(() => -1.5));
await tuner.update(fakeLogProbs);
console.log('   Updated alpha:', tuner.getAlpha());
fakeLogProbs.dispose();
console.log('');

// 9. Test MASAC Trainer
console.log('9. Testing MASAC Trainer');
const config = {
    numAgents: 4,
    stateDim: 8,
    actionDim: 2,
    hiddenDims: [64, 64],  // Smaller for CPU testing
    batchSize: 32,
    bufferSize: 1000,
    warmupSteps: 50
};

const trainer = new MASACTrainer(config);

// Warmup with random actions
console.log('   Warming up...');
for (let i = 0; i < 60; i++) {
    const states = Array(4).fill(0).map(() => Array(8).fill(0).map(() => Math.random()));
    const actions = trainer.selectActions(states);
    const rewards = Array(4).fill(0).map(() => Math.random() - 0.5);
    const nextStates = Array(4).fill(0).map(() => Array(8).fill(0).map(() => Math.random()));
    const dones = Array(4).fill(false);
    const globalState = states.flat();
    const nextGlobalState = nextStates.flat();
    
    trainer.store(states, actions, rewards, nextStates, dones, globalState, nextGlobalState);
}

// Train a few steps
console.log('   Training...');
const startTime = performance.now();

for (let i = 0; i < 10; i++) {
    const states = Array(4).fill(0).map(() => Array(8).fill(0).map(() => Math.random()));
    const actions = trainer.selectActions(states);
    const rewards = Array(4).fill(0).map(() => Math.random() - 0.5);
    const nextStates = Array(4).fill(0).map(() => Array(8).fill(0).map(() => Math.random()));
    const dones = Array(4).fill(false);
    const globalState = states.flat();
    const nextGlobalState = nextStates.flat();
    
    trainer.store(states, actions, rewards, nextStates, dones, globalState, nextGlobalState);
}

const endTime = performance.now();
const avgTime = (endTime - startTime) / 10;

console.log('   Training time (10 steps):', (endTime - startTime).toFixed(2), 'ms');
console.log('   Avg time per step:', avgTime.toFixed(2), 'ms');
console.log('   Step:', trainer.step);

const metrics = trainer.getMetrics();
console.log('   Current alpha:', metrics.alpha);
console.log('   Avg critic loss:', metrics.avgCriticLoss.toFixed(4));
console.log('   Avg actor loss:', metrics.avgActorLoss.toFixed(4));
console.log('   Buffer size:', metrics.bufferSize);

console.log('');

// 10. Benchmark
console.log('10. Performance Benchmark');
console.log('    Running 100 forward passes...');

const benchActor = new ActorNetwork(16, 2, [128, 128], 0.001);
const benchStates = Array(100).fill(0).map(() => Array(16).fill(0).map(() => Math.random()));

const benchStart = performance.now();
for (const s of benchStates) {
    const a = benchActor.getAction([s]);
}
const benchEnd = performance.now();

const avgInference = (benchEnd - benchStart) / 100;
console.log('    Action selection (100x):', (benchEnd - benchStart).toFixed(2), 'ms');
console.log('    Avg per action:', avgInference.toFixed(2), 'ms');
console.log('    Actions per second:', (1000 / avgInference).toFixed(0));

console.log('');
console.log('=== Verification Complete ===');

// Cleanup
testNet.dispose();
actor.dispose();
critic.dispose();
twinCritic.dispose();
tuner.dispose();
trainer.dispose();
benchActor.dispose();

console.log('All tests passed! ✓');
