/**
 * @fear-ai/core - PsychoacousticEngine
 * Frontier D / Audio Subsystem: Procedural Psychoacoustic Audio Synthesis & Dynamic Ambience Engine.
 * 
 * STRICT INVARIANT:
 * The host game engine (Unity, Unreal, Godot, custom C++/Rust engine)
 * remains strictly authoritative for audio playback, audio device buffers,
 * DSP pipelines, mixer routing, and spatial sound positioning.
 * PsychoacousticEngine only evaluates affective state, threat kinematics,
 * and spatial occlusions to generate deterministic psychoacoustic synthesis
 * parameters, procedural Shepard glissando curves, physiological cardiac/respiratory
 * pacing, acoustic occlusion filter frequencies, and dissonance roughness indexes.
 */

export const VOCALIZATION_HINTS = Object.freeze({
    SILENT: 'SILENT',
    SUPPRESSED_BREATH: 'SUPPRESSED_BREATH',
    PANTING: 'PANTING',
    WHIMPER: 'WHIMPER',
    GASP: 'GASP',
    DESPERATE_SHOUT: 'DESPERATE_SHOUT',
    SCREAM: 'SCREAM',
    SHOCKED_SILENCE: 'SHOCKED_SILENCE'
});

export const CARDIAC_RHYTHM_STATUS = Object.freeze({
    REGULAR: 'REGULAR',
    ELEVATED_SINUS: 'ELEVATED_SINUS',
    PALPITATION: 'PALPITATION',
    ARRHYTHMIA_SKIPPED_BEAT: 'ARRHYTHMIA_SKIPPED_BEAT'
});

/**
 * Standard pitch intervals for harmonic tension / dissonance modeling.
 */
export const MUSICAL_INTERVALS = Object.freeze({
    UNISON: 0,
    MINOR_SECOND: 1,
    MAJOR_SECOND: 2,
    MINOR_THIRD: 3,
    MAJOR_THIRD: 4,
    PERFECT_FOURTH: 5,
    TRITONE: 6,
    PERFECT_FIFTH: 7,
    MINOR_SIXTH: 8,
    MAJOR_SIXTH: 9,
    MINOR_SEVENTH: 10,
    MAJOR_SEVENTH: 11,
    OCTAVE: 12
});

export class PsychoacousticEngine {
    /**
     * Compute full psychoacoustic audio frame from agent state, threats, and environment.
     * @param {object} params
     * @param {object} params.affectiveState - { rawFear, arousal, valence, dominance, adrenaline, energy, state }
     * @param {number} [params.dF_dt=0] - Fear acceleration / derivative over time
     * @param {number} [params.threatDistance=Infinity] - Distance to nearest primary threat
     * @param {number} [params.occlusion=0] - Acoustic barrier / occlusion factor [0..1]
     * @param {number} [params.enclosure=0.5] - Room / environment enclosure factor [0..1]
     * @param {Array<number>} [params.activeThreatFrequencies=[]] - Frequencies (Hz) of concurrent threats for dissonance
     * @returns {object} Full Psychoacoustic Audio Evaluation Frame
     */
    static evaluate(params = {}) {
        const state = params.affectiveState || {};
        const rawFear = Number(state.rawFear ?? state.raw_fear ?? 0);
        const fear = Number.isFinite(rawFear) ? Math.max(0, Math.min(1.0, rawFear)) : 0;

        const rawArousal = Number(state.arousal ?? 0);
        const arousal = Number.isFinite(rawArousal) ? Math.max(0, Math.min(1.0, rawArousal)) : 0;

        const rawAdrenaline = Number(state.adrenaline ?? 0);
        const adrenaline = Number.isFinite(rawAdrenaline) ? Math.max(0, Math.min(1.0, rawAdrenaline)) : 0;

        const rawEnergy = Number(state.energy ?? 1.0);
        const energy = Number.isFinite(rawEnergy) ? Math.max(0, Math.min(1.0, rawEnergy)) : 1.0;

        const band = state.state || state.fearBand || state.fear_band || 'CALM';
        const dF_dt = Number.isFinite(params.dF_dt) ? Number(params.dF_dt) : 0;
        const threatDist = Number.isFinite(params.threatDistance) ? Math.max(0, Number(params.threatDistance)) : 50.0;
        const occlusion = Number.isFinite(params.occlusion) ? Math.max(0, Math.min(1.0, Number(params.occlusion))) : 0;
        const enclosure = Number.isFinite(params.enclosure) ? Math.max(0, Math.min(1.0, Number(params.enclosure))) : 0.5;

        // 1. Cardiac & Respiratory Pacing
        const cardiac = this.computeCardiacPacing(fear, arousal, adrenaline, dF_dt);

        // 2. Shepard-Risset Continuous Glissando
        const shepard = this.computeShepardParameters(fear, band, dF_dt);

        // 3. Infrasound & Resonant Dread (16-30 Hz)
        const infrasound = this.computeInfrasoundCurve(fear, band, energy, enclosure);

        // 4. Acoustic Occlusion & Spatial Muffling (Low-Pass Filter)
        const acousticFilter = this.computeAcousticOcclusion(fear, adrenaline, occlusion, threatDist);

        // 5. Dissonance Index & Harmonic Tension
        const dissonance = this.computeDissonanceIndex(params.activeThreatFrequencies, fear);

        // 6. Character Vocalization Suggestion
        const vocalization = this.selectVocalization(fear, band, adrenaline, energy, dF_dt);

        return {
            fear_level: parseFloat(fear.toFixed(4)),
            fear_band: band,
            cardiac: {
                heartbeat_bpm: cardiac.bpm,
                beat_interval_ms: parseFloat(cardiac.intervalMs.toFixed(1)),
                rhythm_status: cardiac.rhythmStatus,
                arrhythmia_triggered: cardiac.arrhythmiaTriggered,
                respiration_rate_cpm: cardiac.respirationRateCpm,
                breath_envelope_depth: parseFloat(cardiac.breathDepth.toFixed(3))
            },
            shepard: {
                mix: parseFloat(shepard.mix.toFixed(3)),
                glissando_rate_octaves_per_min: parseFloat(shepard.glissandoRate.toFixed(3)),
                base_frequency_hz: parseFloat(shepard.baseFrequencyHz.toFixed(1)),
                spectral_octave_spread: shepard.octaveSpread,
                direction: shepard.direction
            },
            infrasound: {
                intensity: parseFloat(infrasound.intensity.toFixed(3)),
                peak_frequency_hz: parseFloat(infrasound.peakFrequencyHz.toFixed(1)),
                bandwidth_hz: parseFloat(infrasound.bandwidthHz.toFixed(1)),
                rumble_gain_db: parseFloat(infrasound.rumbleGainDb.toFixed(2))
            },
            acoustic_filter: {
                lowpass_cutoff_hz: Math.round(acousticFilter.cutoffHz),
                highpass_cutoff_hz: Math.round(acousticFilter.highpassHz),
                reverb_wet_ratio: parseFloat(acousticFilter.reverbWet.toFixed(3)),
                sensory_deprivation_attenuation_db: parseFloat(acousticFilter.sensoryDeprivationDb.toFixed(2)),
                distance_attenuation_gain: parseFloat(acousticFilter.distanceGain.toFixed(3))
            },
            dissonance: {
                roughness_index: parseFloat(dissonance.roughness.toFixed(3)),
                musical_tension_tier: dissonance.tensionTier,
                dissonant_harmonic_weight: parseFloat(dissonance.harmonicWeight.toFixed(3))
            },
            vocalization_hint: vocalization,
            // Protocol-compatible audio_hints subset (zero-drift drop-in for adapters)
            audio_hints: {
                heartbeat_bpm: cardiac.bpm,
                shepard_mix: parseFloat(shepard.mix.toFixed(3)),
                lowpass_cutoff_hz: Math.round(acousticFilter.cutoffHz),
                infrasound_intensity: parseFloat(infrasound.intensity.toFixed(3)),
                vocalization_hint: vocalization
            }
        };
    }

    /**
     * Physiological cardiac & respiratory modeling.
     * Cardiac interval ramps from 60 BPM (quiescent) to 180 BPM (panic-locked).
     * Extreme acute shock (fear >= 0.85 and dF/dt >= 0.50) triggers cardiac arrhythmia (skipped beat).
     */
    static computeCardiacPacing(fear, arousal, adrenaline, dF_dt = 0) {
        const effectiveStress = Math.min(1.0, arousal * 0.55 + fear * 0.30 + adrenaline * 0.25);
        const bpm = Math.min(185, Math.max(55, Math.round(60 + effectiveStress * 120)));
        const intervalMs = (60.0 / bpm) * 1000.0;

        let rhythmStatus = CARDIAC_RHYTHM_STATUS.REGULAR;
        let arrhythmiaTriggered = false;

        if (fear >= 0.85 && dF_dt >= 0.50) {
            rhythmStatus = CARDIAC_RHYTHM_STATUS.ARRHYTHMIA_SKIPPED_BEAT;
            arrhythmiaTriggered = true;
        } else if (effectiveStress >= 0.70) {
            rhythmStatus = CARDIAC_RHYTHM_STATUS.PALPITATION;
        } else if (effectiveStress >= 0.35) {
            rhythmStatus = CARDIAC_RHYTHM_STATUS.ELEVATED_SINUS;
        }

        // Respiration: 12 breaths/min resting to 40 breaths/min hyperventilation
        const respirationRateCpm = Math.round(12 + effectiveStress * 28);
        const breathDepth = Math.max(0.2, Math.min(1.0, 0.3 + fear * 0.5 + adrenaline * 0.2));

        return {
            bpm,
            intervalMs,
            rhythmStatus,
            arrhythmiaTriggered,
            respirationRateCpm,
            breathDepth
        };
    }

    /**
     * Shepard-Risset infinite ascending/descending glissando parameters.
     * Computes the mix, glissando rate, and Gaussian spectral octave envelope.
     */
    static computeShepardParameters(fear, band, dF_dt = 0) {
        let mix = 0.0;
        let direction = 'ASCENDING';
        let glissandoRate = 0.5; // Octaves per minute

        switch (band) {
            case 'ALERT':
                mix = 0.25;
                glissandoRate = 0.4;
                break;
            case 'ANXIOUS':
                mix = 0.65;
                glissandoRate = 0.8;
                break;
            case 'HIDE':
                mix = 0.80;
                glissandoRate = 0.25; // Slow, suffocating glissando
                break;
            case 'PANIC':
                mix = 0.50;
                glissandoRate = 1.5; // Rapid pitch ascension
                break;
            case 'FREEZE':
                mix = 0.40;
                glissandoRate = -0.3; // Chilling descending pitch
                direction = 'DESCENDING';
                break;
            case 'PRESENCE_BREAK':
                mix = 0.90;
                glissandoRate = 2.0;
                break;
            default:
                mix = Math.max(0, fear * 0.3);
                glissandoRate = 0.2 + fear * 0.5;
                break;
        }

        // Accelerated glissando during sudden panic spikes
        if (dF_dt > 0.2) {
            glissandoRate += dF_dt * 1.5;
        }

        return {
            mix: Math.min(1.0, Math.max(0.0, mix)),
            glissandoRate: Math.max(-3.0, Math.min(4.0, glissandoRate)),
            baseFrequencyHz: 55.0, // A1 anchor
            octaveSpread: 6, // 6 concurrent octave sinusoids with bell curve weighting
            direction
        };
    }

    /**
     * Sub-bass Infrasound & Resonant Rumble (16–30 Hz) calculation.
     * Emulates visceral physical fear in enclosed or claustrophobic spaces.
     */
    static computeInfrasoundCurve(fear, band, energy, enclosure = 0.5) {
        let baseIntensity = 0.0;
        let peakHz = 18.9; // Peak human resonant eye/chest frequency (NASA/Tandy study)

        if (band === 'PRESENCE_BREAK') {
            baseIntensity = 1.0;
            peakHz = 17.5;
        } else if (band === 'PANIC' || band === 'FREEZE') {
            baseIntensity = 0.85;
            peakHz = 18.9;
        } else {
            baseIntensity = Math.min(1.0, fear * 0.70 + (1.0 - energy) * 0.30);
            peakHz = 18.9 + (1.0 - fear) * 5.0; // 18.9 - 23.9 Hz
        }

        // Enclosure amplifies infrasonic standing resonance
        const intensity = Math.min(1.0, baseIntensity * (0.8 + enclosure * 0.4));
        const bandwidthHz = 6.0 + (1.0 - fear) * 4.0;
        const rumbleGainDb = -36.0 + intensity * 30.0; // -36 dB up to -6 dB

        return {
            intensity,
            peakFrequencyHz: peakHz,
            bandwidthHz,
            rumbleGainDb
        };
    }

    /**
     * Acoustic Occlusion, Distance Muffling & Sensory Deprivation Low-Pass Filter.
     * Distance + physical barriers attenuate high frequencies; terror induces auditory exclusion.
     */
    static computeAcousticOcclusion(fear, adrenaline, occlusion = 0, threatDist = 50.0) {
        // Base lowpass: open air 20,000 Hz, fully occluded down to 400 Hz
        const wallMuffleCutoff = 20000.0 * Math.pow(0.02, occlusion);

        // Acute fear sensory deprivation (auditory tunnel vision): drops high frequencies
        const fearDampening = (fear * 0.75 + adrenaline * 0.25);
        const sensoryCutoff = 20000.0 - (fearDampening * 18200.0);

        // Combined lowpass cutoff
        const cutoffHz = Math.max(250.0, Math.min(20000.0, Math.min(wallMuffleCutoff, sensoryCutoff)));

        // Highpass: acute panic rolls off sub-bass to create hollow, disorienting sound
        const highpassHz = fear > 0.7 ? (fear - 0.7) * 400.0 : 20.0;

        // Reverb wet/dry ratio: occlusion and distance increase wet environmental reverberation
        const distFactor = Math.min(1.0, threatDist / 40.0);
        const reverbWet = Math.max(0.1, Math.min(0.9, 0.15 + occlusion * 0.45 + distFactor * 0.25));

        // Attenuation dB under sensory deprivation
        const sensoryDeprivationDb = -1.0 * (fear * 14.0 + adrenaline * 4.0);

        // Inverse-distance gain (clamped at 2m min distance)
        const distanceGain = threatDist <= 2.0 ? 1.0 : Math.max(0.05, 2.0 / threatDist);

        return {
            cutoffHz,
            highpassHz,
            reverbWet,
            sensoryDeprivationDb,
            distanceGain
        };
    }

    /**
     * Acoustic Roughness / Dissonance Index.
     * Evaluates harmonic collision based on the Plomp-Levelt psychoacoustic dissonance curve.
     */
    static computeDissonanceIndex(threatFrequencies = [], fear = 0.0) {
        if (!Array.isArray(threatFrequencies) || threatFrequencies.length < 2) {
            // Synthesize dissonance from fear alone if no specific chord stems provided
            const roughness = Math.min(1.0, Math.max(0.0, fear * 0.85));
            return {
                roughness,
                tensionTier: roughness > 0.7 ? 'HARSH_DISCORD' : roughness > 0.35 ? 'MODERATE_TENSION' : 'CONSONANT',
                harmonicWeight: roughness * 0.75
            };
        }

        let totalRoughness = 0.0;
        let pairs = 0;

        for (let i = 0; i < threatFrequencies.length; i++) {
            for (let j = i + 1; j < threatFrequencies.length; j++) {
                const f1 = Math.min(threatFrequencies[i], threatFrequencies[j]);
                const f2 = Math.max(threatFrequencies[i], threatFrequencies[j]);
                if (f1 <= 0 || f2 <= 0) continue;

                // Plomp-Levelt critical bandwidth roughness approximation
                const df = f2 - f1;
                const s = 0.24 / (0.021 * f1 + 19.0);
                const r = Math.exp(-3.5 * s * df) - Math.exp(-5.75 * s * df);
                totalRoughness += Math.max(0, r);
                pairs++;
            }
        }

        const normalizedRoughness = pairs > 0 ? Math.min(1.0, (totalRoughness / pairs) * 4.0 + fear * 0.3) : fear * 0.5;
        const tier = normalizedRoughness >= 0.75 ? 'HARSH_DISCORD' : normalizedRoughness >= 0.40 ? 'MODERATE_TENSION' : 'CONSONANT';

        return {
            roughness: normalizedRoughness,
            tensionTier: tier,
            harmonicWeight: Math.min(1.0, normalizedRoughness * 1.1)
        };
    }

    /**
     * Select character vocalization hint.
     */
    static selectVocalization(fear, band, adrenaline, energy, dF_dt = 0) {
        if (band === 'PRESENCE_BREAK') {
            return VOCALIZATION_HINTS.SHOCKED_SILENCE;
        }
        if (band === 'PANIC') {
            if (adrenaline > 0.6 || fear > 0.85 || dF_dt > 0.4) {
                return VOCALIZATION_HINTS.SCREAM;
            }
            return VOCALIZATION_HINTS.DESPERATE_SHOUT;
        }
        if (band === 'FREEZE') {
            return VOCALIZATION_HINTS.GASP;
        }
        if (band === 'HIDE' || band === 'CRAWLING') {
            return VOCALIZATION_HINTS.SUPPRESSED_BREATH;
        }
        if (band === 'ANXIOUS') {
            return VOCALIZATION_HINTS.WHIMPER;
        }
        if (energy < 0.35 || adrenaline > 0.4) {
            return VOCALIZATION_HINTS.PANTING;
        }
        return VOCALIZATION_HINTS.SILENT;
    }
}

export default PsychoacousticEngine;
