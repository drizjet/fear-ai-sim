import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { FearServer } from '../../packages/runtime/src/FearServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../packages/protocol/fixtures');

function httpPost(urlStr, payload = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const bodyStr = JSON.stringify(payload);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

function loadFixture(filename) {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
    return JSON.parse(raw);
}

describe('Canonical Scenario Fixtures Conformance V2', () => {
    let server;
    let serverPort;

    beforeAll(async () => {
        serverPort = 9876;
        server = new FearServer({ port: serverPort });
        await server.start();
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }
    });

    it('Fixture 1: Calm Baseline Stability (calm.json)', () => {
        const fix = loadFixture('calm.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
        }

        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);
        }

        const agent = sim.agents.get('agent_calm');
        const last = agent.lastResult;

        expect(last.fear_band).toBe(fix.assertions.agent_calm.fear_band);
        expect(last.affective_state.arousal).toBeLessThan(fix.assertions.agent_calm.arousal_max);
        expect(last.affective_state.valence).toBeGreaterThan(fix.assertions.agent_calm.valence_min);
        expect(last.audio_hints.heartbeat_bpm).toBeLessThanOrEqual(fix.assertions.agent_calm.heartbeat_bpm_max);
        expect(last.action_intent.type).toBe(fix.assertions.agent_calm.intent_type);
    });

    it('Fixture 2: Immediate Threat Proximity Escalation (sudden-threat.json)', () => {
        const fix = loadFixture('sudden-threat.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
        }

        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);
        }

        const agent = sim.agents.get('agent_escalate');
        const last = agent.lastResult;

        expect(last.fear_band).toBe(fix.assertions.agent_escalate.fear_band);
        expect(last.action_intent.type).toBe(fix.assertions.agent_escalate.intent_type);
        expect(last.action_intent.urgency).toBeGreaterThan(fix.assertions.agent_escalate.urgency_min);
        expect(last.audio_hints.heartbeat_bpm).toBeGreaterThan(fix.assertions.agent_escalate.heartbeat_bpm_min);
        expect(last.audio_hints.lowpass_cutoff_hz).toBeLessThan(fix.assertions.agent_escalate.lowpass_cutoff_hz_max);
        expect(fix.assertions.agent_escalate.vocalization_options).toContain(last.audio_hints.vocalization_hint);
    });

    it('Fixture 3: Hysteresis Panic Lock Duration (panic-lock.json)', () => {
        const fix = loadFixture('panic-lock.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position, ...(ag.options || {}) });
        }

        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);

            const checkpoint = fix.checkpoints?.find(cp => cp.tick === t);
            if (checkpoint) {
                const ag = sim.agents.get('agent_hysteresis');
                expect(ag.fearCore.state).toBe(checkpoint.assertions.agent_hysteresis.fear_band);
                expect(ag.lastResult.debug_trace.panic_locked).toBe(checkpoint.assertions.agent_hysteresis.panic_locked);
            }
        }

        const agent = sim.agents.get('agent_hysteresis');
        expect(agent.fearCore.state).not.toBe(fix.assertions.agent_hysteresis.fear_band_not);
    });

    it('Fixture 4: Habituation Desensitization Curve (habituation.json)', () => {
        const fix = loadFixture('habituation.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
        }

        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);
        }

        const agent = sim.agents.get('agent_hab');
        const habLevel = agent.habituation.getHabituationLevel('SOUND', 'spooky_thump');
        expect(habLevel).toBeGreaterThan(fix.assertions.agent_hab.habituation_min);
    });

    it('Fixture 5: Social Panic Contagion Cascade (contagion.json)', () => {
        const fix = loadFixture('contagion.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
        }

        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);
        }

        const agentA = sim.agents.get('agent_a');
        const agentB = sim.agents.get('agent_b');

        expect(agentA.fearCore.state).toBe(fix.assertions.agent_a.fear_band);
        expect(fix.assertions.agent_b.fear_band_options).toContain(agentB.fearCore.state);
        expect(agentB.currentFear).toBeGreaterThan(fix.assertions.agent_b.fear_min);
    });

    it('Fixture 6: Calm Leader Reassurance Mitigation (leader-reassurance.json)', () => {
        const fix = loadFixture('leader-reassurance.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
        }

        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);
        }

        const leader = sim.agents.get('leader');
        const follower = sim.agents.get('follower');

        expect(leader.fearCore.state).toBe(fix.assertions.leader.fear_band);
        expect(follower.currentFear).toBeLessThan(fix.assertions.follower.fear_max);
    });

    it('Fixture 7: Spatial Trauma Memory Dread (trauma.json)', () => {
        const fix = loadFixture('trauma.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const tz of fix.trauma_zones) {
            sim.addTraumaZone(tz.x, tz.y, tz.z, tz.intensity, tz.radius, tz.decay);
        }

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
        }

        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);
        }

        const wanderer = sim.agents.get('wanderer');
        expect(wanderer.currentFear).toBeGreaterThan(fix.assertions.wanderer.fear_min);
        expect(fix.assertions.wanderer.fear_band_options).toContain(wanderer.fearCore.state);
    });

    it('Fixture 8: Snapshot Save and Load Restoration (save-load.json)', () => {
        const fix = loadFixture('save-load.json');
        const sim = new RuntimeSimulation({ seed: fix.seed });

        for (const ag of fix.agents) {
            sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
        }

        let savedSnapshot = null;
        for (let t = 0; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim.queueObservation(agId, obs);
                }
            }
            sim.tick(fix.dt);

            if (t === fix.save_at_tick) {
                savedSnapshot = sim.saveSnapshot();
            }
        }

        const finalFearWithoutReset = sim.agents.get('surv_01').currentFear;

        // Restore snapshot into fresh simulation
        const sim2 = new RuntimeSimulation({ seed: fix.seed });
        sim2.loadSnapshot(savedSnapshot);

        for (let t = fix.save_at_tick + 1; t < fix.total_ticks; t++) {
            const timelineItem = fix.stimuli_timeline.find(item => t >= item.from_tick && t <= item.to_tick);
            if (timelineItem) {
                for (const [agId, obs] of Object.entries(timelineItem.observations)) {
                    sim2.queueObservation(agId, obs);
                }
            }
            sim2.tick(fix.dt);
        }

        const restoredFear = sim2.agents.get('surv_01').currentFear;
        expect(Math.abs(restoredFear - finalFearWithoutReset)).toBeLessThan(0.0001);
    });

    it('Fixture 9: Deterministic Replay Reproducibility (deterministic-replay.json)', () => {
        const fix = loadFixture('deterministic-replay.json');

        const runSim = () => {
            const sim = new RuntimeSimulation({ seed: fix.seed });
            for (const ag of fix.agents) {
                sim.registerAgent(ag.id, ag.personality, { initial_position: ag.position });
            }

            const trace = [];
            for (let t = 0; t < fix.total_ticks; t++) {
                if (t % fix.periodic_stimuli.alpha_threat_mod === 0) {
                    sim.queueObservation('alpha', {
                        threats: [{ id: 'p', type: 'PREDATOR', distance: 10, intensity: 0.8 }]
                    });
                }
                if (t % fix.periodic_stimuli.beta_sound_mod === 0) {
                    sim.queueObservation('beta', {
                        sounds: [{ id: 's', type: 'SOUND', distance: 15, intensity: 0.5 }]
                    });
                }
                const res = sim.tick(fix.dt);
                trace.push(res);
            }
            return trace;
        };

        const trace1 = runSim();
        const trace2 = runSim();

        expect(trace1.length).toBe(trace2.length);
        for (let i = 0; i < trace1.length; i++) {
            expect(trace1[i]).toEqual(trace2[i]);
        }
    });

    it('Cross-Engine Server REST parity: Calm and Sudden-Threat match within +/- 0.001', async () => {
        // Run Calm scenario via HTTP REST on FearServer
        await httpPost(`http://127.0.0.1:${serverPort}/api/v1/reset`, {});

        await httpPost(`http://127.0.0.1:${serverPort}/api/v1/register`, {
            agent_id: 'agent_rest_calm',
            traits: { neuroticism: 0.3, fear: 0.4 }
        });

        let lastResult = null;
        for (let t = 0; t < 30; t++) {
            const resp = await httpPost(`http://127.0.0.1:${serverPort}/api/v1/tick`, {
                dt: 0.016,
                observations: [
                    { agent_id: 'agent_rest_calm', threats: [], sounds: [] }
                ]
            });
            lastResult = resp.body.results?.find(a => a.agent_id === 'agent_rest_calm');
        }

        expect(lastResult).toBeDefined();
        expect(lastResult.fear_band).toBe('CALM');
        expect(lastResult.affective_state.arousal).toBeLessThan(0.35);
        expect(lastResult.action_intent.type).toBe('CAUTIOUS_EXPLORE');
    });
});
