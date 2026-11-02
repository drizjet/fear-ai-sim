//! Fear AI Rust SDK & Engine Adapter
//!
//! Official Rust client and evaluation library for the Fear AI universal middleware.
//! Strictly adheres to the Host Game Authority Invariant.

pub mod evaluator;
pub mod host_ipc_receiver;
pub mod host_ipc_owned_child;
pub mod negotiator;
pub mod pack;
pub mod protocol;
pub mod psychoacoustics;

pub use evaluator::{EntityFearState, FearEvaluator, HysteresisThresholds};
pub use host_ipc_receiver::{HostIpcReceiver, HostIpcFrame, HostIpcPolicy, HostIpcRejection};
pub use host_ipc_owned_child::{HostIpcOwnedChild, HostIpcQueueLimits, HostIpcChildError, HostIpcTransportFault};
pub use negotiator::HostCapabilityNegotiator;
pub use pack::{PackCoordinator, PackMember, PackRole, TacticalFormation, TacticalPhase};
pub use protocol::{
    BrainAction, BrainIntent, BrainUiText, FearAffectState, FearBand, FearObservation,
    ThreatObservation,
};
pub use psychoacoustics::Psychoacoustics;
