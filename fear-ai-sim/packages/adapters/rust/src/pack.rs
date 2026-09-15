//! Tactical Pack Coordination Engine in Rust.
//!
//! Models multi-agent collective swarm tactics:
//! - Deterministic role assignment (Alpha Leader, Flankers, Chasers, Rear Guard)
//! - Encirclement geometry (Circular Pincer, V-Formation, Crescent, Staggered Line)
//! - Phase state machine (Stalking -> Encircling -> Feint Probe -> Strike -> Scatter -> Regroup)
//! - Alpha Morale Damping & Alpha Fall Catastrophe collapse dynamics.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PackRole {
    #[default]
    AlphaLeader,
    FlankerLeft,
    FlankerRight,
    Chaser,
    RearGuard,
    Bait,
    Harasser,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TacticalFormation {
    #[default]
    CircularPincer,
    VFormation,
    CrescentSurround,
    StaggeredLine,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TacticalPhase {
    #[default]
    Stalking,
    Encircling,
    FeintProbe,
    SynchronizedStrike,
    ScatterDisperse,
    Regrouping,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PackMember {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub bravery: f32,
    pub dominance: f32,
    pub assertiveness: f32,
    pub fear_score: f32,
    pub assigned_role: PackRole,
}

pub struct PackCoordinator;

impl PackCoordinator {
    /// Deterministically assigns roles to members based on personality and fear.
    pub fn assign_roles(members: &mut [PackMember], target_x: f32, target_y: f32) {
        if members.is_empty() {
            return;
        }

        // 1. Score members for Alpha leadership:
        // S_alpha = 0.40 * dominance + 0.35 * assertiveness + 0.25 * (1.0 - norm_fear)
        let mut best_leader_idx = 0;
        let mut max_leader_score = -1.0_f32;

        for (i, m) in members.iter().enumerate() {
            let norm_fear = (m.fear_score / 5.0).clamp(0.0, 1.0);
            let score = 0.40 * m.dominance + 0.35 * m.assertiveness + 0.25 * (1.0 - norm_fear);
            if score > max_leader_score {
                max_leader_score = score;
                best_leader_idx = i;
            }
        }

        members[best_leader_idx].assigned_role = PackRole::AlphaLeader;

        // 2. Assign remaining roles by relative angle to target
        let mut flank_left = true;
        for (i, m) in members.iter_mut().enumerate() {
            if i == best_leader_idx {
                continue;
            }

            let dx = target_x - m.x;
            let dy = target_y - m.y;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist > 250.0 {
                m.assigned_role = PackRole::RearGuard;
            } else if dist < 80.0 {
                m.assigned_role = PackRole::Chaser;
            } else if flank_left {
                m.assigned_role = PackRole::FlankerLeft;
                flank_left = false;
            } else {
                m.assigned_role = PackRole::FlankerRight;
                flank_left = true;
            }
        }
    }

    /// Computes spatial advisory slot offsets around target for a given formation.
    pub fn compute_slot_offset(
        role: PackRole,
        formation: TacticalFormation,
        radius: f32,
    ) -> (f32, f32) {
        match formation {
            TacticalFormation::CircularPincer => match role {
                PackRole::AlphaLeader => (0.0, -radius),
                PackRole::FlankerLeft => (-radius * 0.866, radius * 0.5),
                PackRole::FlankerRight => (radius * 0.866, radius * 0.5),
                PackRole::Chaser => (0.0, radius),
                PackRole::RearGuard => (0.0, radius * 1.6),
                PackRole::Bait => (0.0, -radius * 0.5),
                PackRole::Harasser => (radius * 0.707, -radius * 0.707),
            },
            TacticalFormation::VFormation => match role {
                PackRole::AlphaLeader => (0.0, -radius),
                PackRole::FlankerLeft => (-radius * 0.5, -radius * 0.3),
                PackRole::FlankerRight => (radius * 0.5, -radius * 0.3),
                PackRole::Chaser => (0.0, 0.0),
                PackRole::RearGuard => (0.0, radius * 0.8),
                PackRole::Bait => (0.0, -radius * 1.3),
                PackRole::Harasser => (radius * 0.8, 0.0),
            },
            _ => (0.0, 0.0),
        }
    }

    /// Evaluates whether the Alpha leader has fallen, triggering immediate pack collapse.
    pub fn evaluate_alpha_fall(alpha: Option<&PackMember>) -> bool {
        match alpha {
            None => true, // Alpha incapacitated / dead
            Some(leader) => (leader.fear_score / 5.0) >= 0.85, // Alpha panics
        }
    }

    /// Alpha morale damping: when Alpha is calm, subordinate fear is actively buffered.
    pub fn damped_subordinate_fear(subordinate_fear: f32, alpha_fear: f32) -> f32 {
        let norm_alpha = (alpha_fear / 5.0).clamp(0.0, 1.0);
        if norm_alpha < 0.40 {
            // Buffer factor reduces effective fear
            let buffer = 1.0 - 0.35 * (1.0 - norm_alpha);
            (subordinate_fear * buffer).max(0.0)
        } else {
            subordinate_fear
        }
    }
}
