//! Canonical Fear AI protocol types and data transfer objects.

use serde::{Deserialize, Serialize};

/// Discrete behavioral fear band matching Fear AI canonical spec.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FearBand {
    #[default]
    Calm,
    Alert,
    Afraid,
    Panicked,
    Routed,
    BerserkOverride,
}

impl FearBand {
    pub fn is_afraid(self) -> bool {
        matches!(self, Self::Afraid | Self::Panicked | Self::Routed)
    }

    pub fn is_panicked(self) -> bool {
        matches!(self, Self::Panicked | Self::Routed)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Calm => "CALM",
            Self::Alert => "ALERT",
            Self::Afraid => "AFRAID",
            Self::Panicked => "PANICKED",
            Self::Routed => "ROUTED",
            Self::BerserkOverride => "BERSERK_OVERRIDE",
        }
    }
}

/// A sensed threat stimulus reported by the host game engine.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThreatObservation {
    pub id: String,
    pub threat_type: String,
    pub distance: f32,
    pub intensity: f32,
    #[serde(default)]
    pub rel_x: f32,
    #[serde(default)]
    pub rel_y: f32,
}

/// An entity sensory observation passed from host game to Fear AI.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FearObservation {
    pub agent_id: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub bravery: f32,
    #[serde(default = "default_one")]
    pub health_ratio: f32,
    #[serde(default)]
    pub threats: Vec<ThreatObservation>,
    #[serde(default)]
    pub nearby_allies: usize,
    #[serde(default)]
    pub nearby_enemies: usize,
    #[serde(default)]
    pub is_near_trauma: bool,
    #[serde(default)]
    pub is_near_leader: bool,
    #[serde(default)]
    pub ally_fear_average: f32,
}

fn default_one() -> f32 {
    1.0
}

/// A concrete recommended action within an advisory intent.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BrainAction {
    pub action: String,
    pub weight: f32,
    pub duration_s: f32,
}

/// Optional descriptive UI text for debug inspectors or overhead banners.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BrainUiText {
    pub headline: Option<String>,
    pub subtext: Option<String>,
}

/// Sanitized BrainIntent emitted by Fear AI according to public contract.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BrainIntent {
    pub intent_type: String,
    pub scope: String,
    pub confidence: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_faction_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_entity_id: Option<String>,
    pub recommended_actions: Vec<BrainAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui_text: Option<BrainUiText>,
}

/// Live affective output returned by Fear AI for an entity.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FearAffectState {
    pub fear_score: f32,
    pub band: FearBand,
    pub arousal: f32,
    pub panic_locked: bool,
    pub cardiac_bpm: u16,
    pub arrhythmia_triggered: bool,
    pub primary_intent: String,
}
