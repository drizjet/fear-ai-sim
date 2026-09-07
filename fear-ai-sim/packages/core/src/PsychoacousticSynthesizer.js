/**
 * PsychoacousticSynthesizer - Procedural horror audio cues derived from affective state.
 * Generates exact synthesis parameters for host games to render:
 * - Dynamic Heartbeat (Arousal & Dread)
 * - Shepard Tone Infinite Pitch Ascent (Suspense)
 * - Low-pass Sensory Deprivation Filter (Terror Tunnel Vision/Hearing)
 * - 18.9 Hz Infrasound Resonant Dread
 * - Character Vocalization Suggestions (Panting, Whimper, Gasp, Scream)
 */

export class PsychoacousticSynthesizer {
    /**
     * Compute procedural audio hints from affective state
     * @param {object} affectiveState - { rawFear, arousal, valence, dominance, adrenaline, energy, state }
     * @returns {object} AudioHints
     */
    static computeAudioHints(affectiveState) {
        if (!affectiveState || typeof affectiveState !== 'object') {
            affectiveState = {};
        }
        const rawFear = Number(affectiveState.rawFear);
        const fear = Number.isFinite(rawFear) ? Math.max(0, Math.min(1.0, rawFear)) : 0;

        const rawArousal = Number(affectiveState.arousal);
        const arousal = Number.isFinite(rawArousal) ? Math.max(0, Math.min(1.0, rawArousal)) : 0;

        const rawEnergy = Number(affectiveState.energy);
        const energy = Number.isFinite(rawEnergy) ? Math.max(0, Math.min(1.0, rawEnergy)) : 1.0;

        const rawAdrenaline = Number(affectiveState.adrenaline);
        const adrenaline = Number.isFinite(rawAdrenaline) ? Math.max(0, Math.min(1.0, rawAdrenaline)) : 0;

        const band = affectiveState.state || affectiveState.fearBand || 'CALM';

        // 1. Heartbeat Tempo: 60 BPM (resting) to 180 BPM (maximum panic)
        // Scaled primarily by arousal and adrenaline
        const effectiveStress = Math.min(1.0, arousal * 0.7 + fear * 0.3 + adrenaline * 0.2);
        const heartbeatBpm = Math.round(60 + effectiveStress * 120);

        // 2. Shepard Tone Suspense Mix: climbs in ALERT / ANXIOUS / HIDE
        let shepardMix = 0.0;
        if (band === 'ALERT') {
            shepardMix = 0.25;
        } else if (band === 'ANXIOUS') {
            shepardMix = 0.65;
        } else if (band === 'HIDE') {
            shepardMix = 0.80; // Peak suspense while hiding
        } else if (band === 'PANIC') {
            shepardMix = 0.50; // In panic, explosive sound overrides subtle shepard tones
        } else {
            shepardMix = Math.max(0, fear * 0.3);
        }

        // 3. Low-Pass Muffle Cutoff: 20,000 Hz down to 1,800 Hz under terror
        // Simulates auditory exclusion / sensory deprivation during acute panic
        const lowpassCutoffHz = Math.round(20000 - (fear * 17500) - (adrenaline * 1500));

        // 4. Infrasound Resonant Dread (18.9 Hz): Peak in ANXIOUS / PRESENCE_BREAK
        let infrasoundIntensity = 0.0;
        if (band === 'PRESENCE_BREAK') {
            infrasoundIntensity = 1.0;
        } else if (band === 'PANIC' || band === 'FREEZE') {
            infrasoundIntensity = 0.85;
        } else {
            infrasoundIntensity = Math.min(1.0, fear * 0.7 + (1.0 - energy) * 0.3);
        }

        // 5. Vocalization Cue Suggestion
        let vocalizationHint = 'SILENT';
        if (band === 'PRESENCE_BREAK') {
            vocalizationHint = 'SHOCKED_SILENCE';
        } else if (band === 'PANIC') {
            if (adrenaline > 0.6 || fear > 0.85) {
                vocalizationHint = 'SCREAM';
            } else {
                vocalizationHint = 'DESPERATE_SHOUT';
            }
        } else if (band === 'FREEZE') {
            vocalizationHint = 'GASP';
        } else if (band === 'HIDE' || band === 'CRAWLING') {
            vocalizationHint = 'SUPPRESSED_BREATH';
        } else if (band === 'ANXIOUS') {
            vocalizationHint = 'WHIMPER';
        } else if (energy < 0.35 || adrenaline > 0.4) {
            vocalizationHint = 'PANTING';
        }

        return {
            heartbeat_bpm: Math.min(185, Math.max(55, heartbeatBpm)),
            shepard_mix: parseFloat(shepardMix.toFixed(3)),
            lowpass_cutoff_hz: Math.max(1200, Math.min(20000, lowpassCutoffHz)),
            infrasound_intensity: parseFloat(infrasoundIntensity.toFixed(3)),
            vocalization_hint: vocalizationHint
        };
    }
}

export default PsychoacousticSynthesizer;
