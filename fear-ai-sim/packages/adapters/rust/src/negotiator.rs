//! Host capability negotiation and intent translation.

use crate::protocol::{BrainAction, BrainIntent, BrainUiText};
use std::collections::HashSet;

pub struct HostCapabilityNegotiator {
    pub supported_actions: HashSet<String>,
}

impl Default for HostCapabilityNegotiator {
    fn default() -> Self {
        let mut supported = HashSet::new();
        supported.insert("hold_line".to_string());
        supported.insert("retreat_to_hq".to_string());
        supported.insert("stabilize_fear".to_string());
        supported.insert("focus_boss".to_string());
        supported.insert("spread_out".to_string());
        supported.insert("secure_objective".to_string());
        supported.insert("escort".to_string());
        supported.insert("fallback_and_recover".to_string());
        supported.insert("protect_support".to_string());
        supported.insert("avoid_hotspot".to_string());
        supported.insert("regroup_at_sanctuary".to_string());
        supported.insert("rotate_frontline".to_string());
        supported.insert("panic_breaker".to_string());
        supported.insert("fortify_sanctuary".to_string());
        supported.insert("controlled_withdrawal".to_string());
        supported.insert("stagger_relief".to_string());
        supported.insert("triage_support".to_string());
        supported.insert("anchor_defense".to_string());
        supported.insert("surge_counterpush".to_string());
        supported.insert("raise_alert_level".to_string());
        supported.insert("lower_alert_level".to_string());
        supported.insert("enable_voice_lines".to_string());

        Self {
            supported_actions: supported,
        }
    }
}

impl HostCapabilityNegotiator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Maps recommended intent type to validated actions matching host capabilities.
    pub fn build_sanitized_intent(
        &self,
        entity_id: &str,
        faction_id: &str,
        raw_intent: &str,
        urgency: f32,
    ) -> BrainIntent {
        let (primary_action, secondary_action, headline, subtext) = match raw_intent {
            "PANIC_BREAKER" => (
                "panic_breaker",
                "retreat_to_hq",
                "Unit Panicked - Immediate Dispersal",
                "Catastrophic fear reached; breaking panic line.",
            ),
            "FALLBACK_AND_RECOVER" | "FLEE_FROM" => (
                "fallback_and_recover",
                "controlled_withdrawal",
                "Unit Retreating Under Pressure",
                "Hostile proximity critical; withdrawing to recovery area.",
            ),
            "AVOID_HOTSPOT" => (
                "avoid_hotspot",
                "controlled_withdrawal",
                "High Threat Proximity",
                "Maintaining safety buffer around danger hotspot.",
            ),
            "RAISE_ALERT_LEVEL" => (
                "raise_alert_level",
                "hold_line",
                "Hostile Presence Detected",
                "Entity alerted; scanning perimeter.",
            ),
            "SURGE_COUNTERPUSH" => (
                "surge_counterpush",
                "focus_boss",
                "Berserk Frenzy",
                "Fear converted to furious counter-attack.",
            ),
            _ => (
                "hold_line",
                "anchor_defense",
                "Unit Composed",
                "Defensive posture maintained; no acute hazard.",
            ),
        };

        let mut actions = Vec::new();
        if self.supported_actions.contains(primary_action) {
            actions.push(BrainAction {
                action: primary_action.to_string(),
                weight: urgency.clamp(0.1, 1.0),
                duration_s: 8.0,
            });
        }
        if self.supported_actions.contains(secondary_action) {
            actions.push(BrainAction {
                action: secondary_action.to_string(),
                weight: (urgency * 0.8).clamp(0.1, 1.0),
                duration_s: 10.0,
            });
        }

        BrainIntent {
            intent_type: "morale_response".to_string(),
            scope: "entity".to_string(),
            confidence: urgency.clamp(0.2, 1.0),
            target_faction_id: Some(faction_id.to_string()),
            target_entity_id: Some(entity_id.to_string()),
            recommended_actions: actions,
            ui_text: Some(BrainUiText {
                headline: Some(headline.to_string()),
                subtext: Some(subtext.to_string()),
            }),
        }
    }
}
