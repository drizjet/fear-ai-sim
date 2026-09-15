//! In-process canonical Fear AI evaluator.
//!
//! Evaluates observations against canonical psychological fear formulas,
//! dual hysteresis thresholds, and panic recovery locks with zero allocations.

use crate::protocol::{FearAffectState, FearBand, FearObservation};

const MAX_FEAR_SCORE: f32 = 5.0;
const DEFAULT_PANIC_LOCK_TICKS: u64 = 10;

#[derive(Clone, Copy, Debug)]
pub struct HysteresisThresholds {
    pub enter_alert: f32,
    pub enter_afraid: f32,
    pub enter_panicked: f32,
    pub enter_routed: f32,
    pub exit_alert: f32,
    pub exit_afraid: f32,
    pub exit_panicked: f32,
    pub exit_routed: f32,
}

impl Default for HysteresisThresholds {
    fn default() -> Self {
        Self {
            enter_alert: 0.8,
            enter_afraid: 1.4,
            enter_panicked: 3.8,
            enter_routed: 4.6,
            exit_alert: 0.55,
            exit_afraid: 0.8,
            exit_panicked: 1.2,
            exit_routed: 3.0,
        }
    }
}

/// In-process canonical Fear AI evaluator state for an entity.
#[derive(Clone, Debug, Default)]
pub struct EntityFearState {
    pub current_score: f32,
    pub current_band: FearBand,
    pub previous_score: f32,
    pub recovery_lock_until: u64,
    pub last_eval_tick: u64,
}

pub struct FearEvaluator {
    pub thresholds: HysteresisThresholds,
}

impl Default for FearEvaluator {
    fn default() -> Self {
        Self {
            thresholds: HysteresisThresholds::default(),
        }
    }
}

impl FearEvaluator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Evaluates a sensory observation, updating entity fear state and returning affect state.
    pub fn evaluate(
        &self,
        state: &mut EntityFearState,
        obs: &FearObservation,
        current_tick: u64,
        dt_seconds: f32,
    ) -> FearAffectState {
        // 1. Calculate raw threat perceived through distance attenuation
        let max_threat = obs.threats.iter().fold(0.0_f32, |acc, t| {
            let eff_dist = t.distance.max(0.1);
            let perceived = t.intensity / (1.0 + 0.01 * eff_dist);
            acc.max(perceived)
        });

        // 2. Base ratio scaled by bravery (0.0 .. 1.0)
        let bravery_factor = obs.bravery.clamp(0.0, 1.0).mul_add(1.5, 0.25);
        let base_ratio = (max_threat * 3.0) / bravery_factor;

        // 3. Numerical pressure
        let numerical_ratio = (obs.nearby_enemies as f32 + 1.0) / (obs.nearby_allies as f32 + 1.0);
        let numerical_pressure = 0.8 + (numerical_ratio * 0.4).min(2.0);
        let mut score = base_ratio * numerical_pressure;

        // 4. Contextual modifiers
        if obs.is_near_trauma {
            score *= 1.5;
        }
        if obs.ally_fear_average > 1.0 {
            score *= 1.0 + (obs.ally_fear_average - 1.0) * 0.5;
        }
        if obs.is_near_leader {
            score *= 0.5;
        }

        let clamped_score = if score.is_finite() {
            score.clamp(0.0, MAX_FEAR_SCORE)
        } else {
            0.0
        };

        // 5. Dual hysteresis band resolution & panic lock
        let panic_locked = current_tick < state.recovery_lock_until;
        let next_band = self.resolve_band(state.current_band, clamped_score, panic_locked);

        // Lock panic if newly entered
        if !state.current_band.is_panicked() && next_band.is_panicked() {
            state.recovery_lock_until = current_tick + DEFAULT_PANIC_LOCK_TICKS;
        }

        let prev_score = state.current_score;
        state.previous_score = prev_score;
        state.current_score = clamped_score;
        state.current_band = next_band;
        state.last_eval_tick = current_tick;

        // 6. Physiological cardiac & arrhythmia evaluation
        let norm_fear = (clamped_score / MAX_FEAR_SCORE).clamp(0.0, 1.0);
        let cardiac_bpm = (60.0 + norm_fear * 120.0).round() as u16;
        let delta_f = (norm_fear - (prev_score / MAX_FEAR_SCORE).clamp(0.0, 1.0)).max(0.0);
        let rate_of_change = if dt_seconds > 0.001 {
            delta_f / dt_seconds
        } else {
            0.0
        };
        let arrhythmia_triggered = norm_fear >= 0.85 && rate_of_change >= 0.50;

        // 7. Action intent mapping
        let primary_intent = match next_band {
            FearBand::Routed => "PANIC_BREAKER",
            FearBand::Panicked => "FALLBACK_AND_RECOVER",
            FearBand::Afraid => "AVOID_HOTSPOT",
            FearBand::Alert => "RAISE_ALERT_LEVEL",
            FearBand::Calm => "HOLD_LINE",
            FearBand::BerserkOverride => "SURGE_COUNTERPUSH",
        };

        FearAffectState {
            fear_score: clamped_score,
            band: next_band,
            arousal: (norm_fear * 0.7 + (if panic_locked { 0.3 } else { 0.0 })).clamp(0.0, 1.0),
            panic_locked,
            cardiac_bpm,
            arrhythmia_triggered,
            primary_intent: primary_intent.to_string(),
        }
    }

    fn resolve_band(
        &self,
        prev: FearBand,
        score: f32,
        panic_locked: bool,
    ) -> FearBand {
        if prev == FearBand::BerserkOverride {
            return FearBand::BerserkOverride;
        }

        match prev {
            FearBand::Calm => {
                if score >= self.thresholds.enter_routed {
                    FearBand::Routed
                } else if score >= self.thresholds.enter_panicked {
                    FearBand::Panicked
                } else if score >= self.thresholds.enter_afraid {
                    FearBand::Afraid
                } else if score >= self.thresholds.enter_alert {
                    FearBand::Alert
                } else {
                    FearBand::Calm
                }
            }
            FearBand::Alert => {
                if score < self.thresholds.exit_alert {
                    FearBand::Calm
                } else if score >= self.thresholds.enter_routed {
                    FearBand::Routed
                } else if score >= self.thresholds.enter_panicked {
                    FearBand::Panicked
                } else if score >= self.thresholds.enter_afraid {
                    FearBand::Afraid
                } else {
                    FearBand::Alert
                }
            }
            FearBand::Afraid => {
                if score < self.thresholds.exit_afraid {
                    if score < self.thresholds.exit_alert {
                        FearBand::Calm
                    } else {
                        FearBand::Alert
                    }
                } else if score >= self.thresholds.enter_routed {
                    FearBand::Routed
                } else if score >= self.thresholds.enter_panicked {
                    FearBand::Panicked
                } else {
                    FearBand::Afraid
                }
            }
            FearBand::Panicked => {
                if score >= self.thresholds.enter_routed {
                    FearBand::Routed
                } else if panic_locked && score >= self.thresholds.exit_afraid {
                    FearBand::Panicked
                } else if score < self.thresholds.exit_panicked {
                    if score < self.thresholds.exit_afraid {
                        if score < self.thresholds.exit_alert {
                            FearBand::Calm
                        } else {
                            FearBand::Alert
                        }
                    } else {
                        FearBand::Afraid
                    }
                } else {
                    FearBand::Panicked
                }
            }
            FearBand::Routed => {
                if panic_locked && score >= self.thresholds.exit_afraid {
                    FearBand::Routed
                } else if score < self.thresholds.exit_routed {
                    if score >= self.thresholds.exit_panicked {
                        FearBand::Panicked
                    } else if score >= self.thresholds.exit_afraid {
                        FearBand::Afraid
                    } else if score >= self.thresholds.exit_alert {
                        FearBand::Alert
                    } else {
                        FearBand::Calm
                    }
                } else {
                    FearBand::Routed
                }
            }
            FearBand::BerserkOverride => FearBand::BerserkOverride,
        }
    }
}
