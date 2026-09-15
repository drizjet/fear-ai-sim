//! Psychoacoustic physiological bridge and vocalization cues.

use crate::protocol::FearBand;

pub struct Psychoacoustics;

impl Psychoacoustics {
    /// Computes cardiac rate in beats per minute (BPM) from fear (0.0 .. 1.0).
    pub fn cardiac_bpm(norm_fear: f32) -> u16 {
        (60.0 + norm_fear.clamp(0.0, 1.0) * 120.0).round() as u16
    }

    /// Checks if acute shock arrhythmia should trigger.
    pub fn is_arrhythmia(norm_fear: f32, df_dt: f32) -> bool {
        norm_fear >= 0.85 && df_dt >= 0.50
    }

    /// Generates contextual vocalization barks matching fear intensity.
    pub fn vocalization_hint(band: FearBand, arousal: f32) -> &'static str {
        match band {
            FearBand::Calm => "SILENT",
            FearBand::Alert => {
                if arousal > 0.5 {
                    "SUPPRESSED_BREATH"
                } else {
                    "SILENT"
                }
            }
            FearBand::Afraid => {
                if arousal > 0.7 {
                    "WHIMPER"
                } else {
                    "PANTING"
                }
            }
            FearBand::Panicked => {
                if arousal > 0.85 {
                    "SCREAM"
                } else {
                    "DESPERATE_SHOUT"
                }
            }
            FearBand::Routed => "SHOCKED_SILENCE",
            FearBand::BerserkOverride => "WAR_CRY",
        }
    }
}
