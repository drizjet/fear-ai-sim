import { describe, it, expect } from '@jest/globals';
import {
    PsychoacousticEngine,
    VOCALIZATION_HINTS,
    CARDIAC_RHYTHM_STATUS,
    MUSICAL_INTERVALS
} from '../packages/core/index.js';

describe('Frontier D: Procedural Psychoacoustic Audio Synthesis Engine', () => {

    it('1. Generates deterministic evaluation frames across repeated runs', () => {
        const params = {
            affectiveState: {
                rawFear: 0.65,
                arousal: 0.58,
                adrenaline: 0.45,
                energy: 0.85,
                state: 'ANXIOUS'
            },
            dF_dt: 0.15,
            threatDistance: 15.0,
            occlusion: 0.25,
            enclosure: 0.60,
            activeThreatFrequencies: [440, 466.16]
        };

        const eval1 = PsychoacousticEngine.evaluate(params);
        const eval2 = PsychoacousticEngine.evaluate(params);

        expect(eval1).toEqual(eval2);
        expect(eval1.fear_level).toBe(0.65);
        expect(eval1.fear_band).toBe('ANXIOUS');
    });

    it('2. Demonstrates monotonic heartbeat & respiratory rate acceleration with rising fear', () => {
        const fearSteps = [0.1, 0.3, 0.5, 0.7, 0.9];
        let previousBpm = 0;
        let previousCpm = 0;

        for (const fear of fearSteps) {
            const result = PsychoacousticEngine.evaluate({
                affectiveState: {
                    rawFear: fear,
                    arousal: fear,
                    adrenaline: fear * 0.8,
                    energy: 1.0,
                    state: fear >= 0.8 ? 'PANIC' : fear >= 0.5 ? 'ANXIOUS' : 'ALERT'
                }
            });

            expect(result.cardiac.heartbeat_bpm).toBeGreaterThanOrEqual(previousBpm);
            expect(result.cardiac.respiration_rate_cpm).toBeGreaterThanOrEqual(previousCpm);

            previousBpm = result.cardiac.heartbeat_bpm;
            previousCpm = result.cardiac.respiration_rate_cpm;
        }

        expect(previousBpm).toBeGreaterThan(140);
        expect(previousCpm).toBeGreaterThan(30);
    });

    it('3. Triggers cardiac arrhythmia exclusively under extreme shock (fear >= 0.85 and dF/dt >= 0.50)', () => {
        const highSteady = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.90, arousal: 0.85, state: 'PANIC' },
            dF_dt: 0.10
        });
        expect(highSteady.cardiac.arrhythmia_triggered).toBe(false);
        expect(highSteady.cardiac.rhythm_status).toBe(CARDIAC_RHYTHM_STATUS.PALPITATION);

        const midJump = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.60, arousal: 0.60, state: 'ANXIOUS' },
            dF_dt: 0.60
        });
        expect(midJump.cardiac.arrhythmia_triggered).toBe(false);

        const acuteShock = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.88, arousal: 0.90, state: 'PANIC' },
            dF_dt: 0.55
        });
        expect(acuteShock.cardiac.arrhythmia_triggered).toBe(true);
        expect(acuteShock.cardiac.rhythm_status).toBe(CARDIAC_RHYTHM_STATUS.ARRHYTHMIA_SKIPPED_BEAT);
    });

    it('4. Filters high frequencies under physical occlusion barriers and acute sensory deprivation', () => {
        const openAir = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.05, arousal: 0.1, state: 'CALM' },
            occlusion: 0.0,
            threatDistance: 5.0
        });
        expect(openAir.acoustic_filter.lowpass_cutoff_hz).toBeGreaterThan(18000);
        expect(openAir.acoustic_filter.reverb_wet_ratio).toBeLessThan(0.35);

        const occluded = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.05, arousal: 0.1, state: 'CALM' },
            occlusion: 0.8,
            threatDistance: 5.0
        });
        expect(occluded.acoustic_filter.lowpass_cutoff_hz).toBeLessThan(1000);
        expect(occluded.acoustic_filter.reverb_wet_ratio).toBeGreaterThan(0.45);

        const terrorTunnel = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.95, arousal: 0.95, adrenaline: 0.90, state: 'PANIC' },
            occlusion: 0.0,
            threatDistance: 5.0
        });
        expect(terrorTunnel.acoustic_filter.lowpass_cutoff_hz).toBeLessThan(3500);
        expect(terrorTunnel.acoustic_filter.sensory_deprivation_attenuation_db).toBeLessThan(-12.0);
    });

    it('5. Computes Shepard glissando curves and infrasound resonance', () => {
        const alertRes = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.25, state: 'ALERT' }
        });
        expect(alertRes.shepard.mix).toBe(0.25);
        expect(alertRes.shepard.direction).toBe('ASCENDING');

        const freezeRes = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.85, state: 'FREEZE' }
        });
        expect(freezeRes.shepard.direction).toBe('DESCENDING');
        expect(freezeRes.shepard.glissando_rate_octaves_per_min).toBeLessThan(0);
        expect(freezeRes.infrasound.intensity).toBeGreaterThan(0.80);
        expect(freezeRes.infrasound.peak_frequency_hz).toBe(18.9);
    });

    it('6. Evaluates Plomp-Levelt harmonic roughness and dissonance index', () => {
        const consonant = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.1, state: 'CALM' },
            activeThreatFrequencies: [440, 880]
        });
        expect(consonant.dissonance.musical_tension_tier).toBe('CONSONANT');

        const dissonant = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.8, state: 'PANIC' },
            activeThreatFrequencies: [440, 466.16]
        });
        expect(dissonant.dissonance.musical_tension_tier).toBe('HARSH_DISCORD');
        expect(dissonant.dissonance.roughness_index).toBeGreaterThan(0.60);
    });

    it('7. Character vocalization suggestions transition realistically across affective bands', () => {
        expect(PsychoacousticEngine.selectVocalization(0.1, 'CALM', 0.1, 1.0)).toBe(VOCALIZATION_HINTS.SILENT);
        expect(PsychoacousticEngine.selectVocalization(0.4, 'ANXIOUS', 0.2, 1.0)).toBe(VOCALIZATION_HINTS.WHIMPER);
        expect(PsychoacousticEngine.selectVocalization(0.7, 'FREEZE', 0.5, 0.9)).toBe(VOCALIZATION_HINTS.GASP);
        expect(PsychoacousticEngine.selectVocalization(0.6, 'HIDE', 0.3, 0.8)).toBe(VOCALIZATION_HINTS.SUPPRESSED_BREATH);
        expect(PsychoacousticEngine.selectVocalization(0.9, 'PANIC', 0.8, 0.5)).toBe(VOCALIZATION_HINTS.SCREAM);
        expect(PsychoacousticEngine.selectVocalization(0.3, 'CALM', 0.5, 0.2)).toBe(VOCALIZATION_HINTS.PANTING);
        expect(PsychoacousticEngine.selectVocalization(1.0, 'PRESENCE_BREAK', 0.9, 0.1)).toBe(VOCALIZATION_HINTS.SHOCKED_SILENCE);
    });

    it('8. Emits audio_hints payload fully certified by Canonical Protocol', () => {
        const res = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.72, arousal: 0.65, state: 'PANIC' },
            threatDistance: 8.0,
            occlusion: 0.3
        });

        expect(res.audio_hints).toBeDefined();
        expect(typeof res.audio_hints.heartbeat_bpm).toBe('number');
        expect(typeof res.audio_hints.shepard_mix).toBe('number');
        expect(typeof res.audio_hints.lowpass_cutoff_hz).toBe('number');
        expect(typeof res.audio_hints.infrasound_intensity).toBe('number');
        expect(typeof res.audio_hints.vocalization_hint).toBe('string');
        expect(res.audio_hints.heartbeat_bpm).toBeGreaterThanOrEqual(60);
        expect(res.audio_hints.heartbeat_bpm).toBeLessThanOrEqual(185);
        expect(res.audio_hints.shepard_mix).toBeGreaterThanOrEqual(0);
        expect(res.audio_hints.shepard_mix).toBeLessThanOrEqual(1);
    });

    it('9. Strictly maintains Host Game Authority Invariant', () => {
        const res = PsychoacousticEngine.evaluate({
            affectiveState: { rawFear: 0.80, state: 'PANIC' }
        });

        expect(res).not.toHaveProperty('audioBuffer');
        expect(res).not.toHaveProperty('audioContext');
        expect(res).not.toHaveProperty('play');
        expect(res).toHaveProperty('cardiac');
        expect(res).toHaveProperty('shepard');
        expect(res).toHaveProperty('infrasound');
        expect(res).toHaveProperty('acoustic_filter');
        expect(res).toHaveProperty('dissonance');
    });
});

