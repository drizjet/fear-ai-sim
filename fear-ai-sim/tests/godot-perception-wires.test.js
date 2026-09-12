import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PerceptionRobustnessEngine } from '../packages/core/index.js';
import {
    ProtocolValidator,
    BinaryWireProtocol,
} from '../packages/protocol/index.js';

// R4: Godot perception-wire surface.
//
// Integration finding that motivates this slice: the Godot adapter only ever
// forwarded position/threat/health/energy, the protocol validator dropped
// visual/audio channels entirely, and RuntimeSimulation never feeds the
// PerceptionRobustnessEngine — so the NEXT-186/187/188 wires had NO host
// path at all. This slice opens it: fear_agent.gd emits opt-in
// visual/audio channels, the validator sanitizes and forwards them with
// engine-mirroring coercion, and the engine honors them. Binary v2 fixed
// slots still drop the channels by design (pinned in test 5).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENT_GD = path.join(__dirname, '..', 'packages', 'adapters', 'godot', 'fear_agent.gd');

// Exact mirror of the obs dict fear_agent.gd emits when the R4 exports are
// configured (visual 0.8 + flaky reliability, audio 0.6 fresh).
function godotShapedObs() {
    return {
        agent_id: 'godot_scout',
        x: 1.0, y: 2.0, z: 0.0,
        threats: [],
        visual: { intensity: 0.8, reliability: 0.01, ageTicks: 0 },
        audio: { loudness: 0.6, reliability: 0.99, ageTicks: 0 },
    };
}

function perceiveDirect(obs) {
    const e = new PerceptionRobustnessEngine({ seed: 5 });
    e.setProfile('a', { noiseStd: 0 });
    return e.perceive('a', 1, obs);
}

function perceiveValidated(rawObs) {
    const wire = JSON.parse(JSON.stringify(rawObs)); // adapter JSON path
    const validated = ProtocolValidator.validateObservation(wire);
    expect(validated.valid).toBe(true);
    return perceiveDirect(validated.value);
}

describe('R4: Godot perception wires ride the real adapter path', () => {
    it('1. fear_agent.gd exposes opt-in sensor exports with absent-by-default shape', () => {
        const gd = fs.readFileSync(AGENT_GD, 'utf8');
        for (const name of ['visual_intensity', 'audio_loudness', 'sensor_reliability', 'observation_age_ticks']) {
            expect(gd).toMatch(name);
        }
        // Channels attach conditionally; defaults keep legacy observations.
        expect(gd).toMatch('obs["visual"] = visual');
        expect(gd).toMatch('obs["audio"] = audio');
        expect(gd).toMatch('if visual_intensity >= 0.0:');
        expect(gd).toMatch('if audio_loudness >= 0.0:');
    });

    it('2. Godot-shaped obs drives the flaky-vs-trusted split end to end', () => {
        const viaWire = perceiveValidated(godotShapedObs());
        // Visual 0.01 + audio 0.99 -> fused rel 0.5 -> 0.15 + 0.25 = 0.4.
        expect(viaWire.fusedThreat).toBe(0.72);
        expect(viaWire.uncertainty).toBe(0.4);
        expect(viaWire.reliability).toEqual({ visual: 0.01, audio: 0.99, fused: 0.5 });
        const trusted = perceiveValidated({
            agent_id: 'godot_scout', x: 1, y: 2, z: 0, threats: [],
            visual: { intensity: 0.8 }, audio: { loudness: 0.6 },
        });
        expect(trusted.uncertainty).toBe(0.15);
        expect('reliability' in trusted).toBe(false);
    });

    it('3. Validator parity: validated obs behaves exactly like direct engine calls', () => {
        const cases = [
            { visual: { intensity: 0.8, reliability: 0, ageTicks: 12 }, audio: { loudness: 0.6, reliability: 0, ageTicks: 12 } },
            { visual: { intensity: 'garbage', reliability: NaN, ageTicks: -7 }, audio: { loudness: 'xx' } },
            { visual: { intensity: 5, reliability: 9 }, audio: {} },
            {},
        ];
        for (const channels of cases) {
            const raw = { agent_id: 'p', x: 0, y: 0, z: 0, threats: [], ...JSON.parse(JSON.stringify(channels)) };
            // NaN does not survive JSON; validated path must equal the
            // direct engine call on the SANITIZED shape instead.
            const validated = ProtocolValidator.validateObservation(JSON.parse(JSON.stringify(raw)));
            expect(validated.valid).toBe(true);
            const viaWire = perceiveDirect(validated.value);
            const { agent_id, x, y, z, threats, context, ...sanitized } = validated.value;
            void agent_id; void x; void y; void z; void threats; void context;
            const direct = perceiveDirect({ visual: null, audio: null, ...sanitized });
            expect(viaWire).toEqual(direct);
        }
    });

    it('4. Legacy observations keep their exact shape (no channel keys)', () => {
        const validated = ProtocolValidator.validateObservation(
            { agent_id: 'legacy', x: 1, y: 2, z: 3, threats: [] });
        expect(validated.valid).toBe(true);
        expect('visual' in validated.value).toBe(false);
        expect('audio' in validated.value).toBe(false);
        const r = perceiveDirect(validated.value);
        expect(r.uncertainty).toBe(0.4);
        expect(r.fusedThreat).toBe(0.05);
    });

    it('5. MEASURED GAP (kept): binary wire v2 drops perception channels by design', () => {
        const buf = BinaryWireProtocol.encodeObservationBatch(3, [{
            entityId: 3,
            position: { x: 1, y: 2, z: 0 },
            threatDistance: 4,
            threatIntensity: 0.9,
            health: 1, energy: 1,
            visual: { intensity: 0.8, reliability: 0 },
            audio: { loudness: 0.6, reliability: 0 },
        }]);
        const rec = BinaryWireProtocol.decodeObservationBatch(buf).records[0];
        expect(rec.visual).toBe(undefined);
        expect(rec.audio).toBe(undefined);
        expect(rec.position.x).toBe(1);
    });

    it('6. Validator rejects non-objects; garbage channels collapse safely', () => {
        expect(ProtocolValidator.validateObservation(null).valid).toBe(false);
        expect(ProtocolValidator.validateObservation([]).valid).toBe(false);
        const v = ProtocolValidator.validateObservation({
            agent_id: 'g', visual: 'nope', audio: [1, 2],
        });
        expect(v.valid).toBe(true);
        expect('visual' in v.value).toBe(false);
        expect('audio' in v.value).toBe(false);
        const r = perceiveDirect(v.value);
        expect(r.fusedThreat).toBe(0.05);
    });
});
