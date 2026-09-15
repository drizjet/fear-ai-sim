//! Fear AI Rust SDK & Engine Adapter
//!
//! Official Rust client and evaluation library for the Fear AI universal middleware.
//! Strictly adheres to the Host Game Authority Invariant.

pub mod evaluator;
pub mod negotiator;
pub mod pack;
pub mod protocol;
pub mod psychoacoustics;

pub use evaluator::{EntityFearState, FearEvaluator, HysteresisThresholds};
pub use negotiator::HostCapabilityNegotiator;
pub use pack::{PackCoordinator, PackMember, PackRole, TacticalFormation, TacticalPhase};
pub use protocol::{
    BrainAction, BrainIntent, BrainUiText, FearAffectState, FearBand, FearObservation,
    ThreatObservation,
};
pub use psychoacoustics::Psychoacoustics;
