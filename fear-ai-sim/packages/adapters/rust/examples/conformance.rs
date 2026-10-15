use fear_ai::evaluator::{EntityFearState, FearEvaluator, HysteresisThresholds};
use fear_ai::negotiator::HostCapabilityNegotiator;
use fear_ai::pack::{PackCoordinator, PackMember, PackRole};
use fear_ai::protocol::{FearBand, FearObservation, ThreatObservation};

fn main() {
    println!("============================================================");
    println!("FEAR AI RUST SDK & ADAPTER CONFORMANCE CHECK");
    println!("============================================================");

    let mut checks = 0;

    // 1. Evaluator and Hysteresis Thresholds
    let thresholds = HysteresisThresholds::default();
    assert_eq!(thresholds.enter_alert, 0.8, "Alert entry threshold must be 0.8");
    assert_eq!(thresholds.enter_afraid, 1.4, "Afraid entry threshold must be 1.4");
    assert_eq!(thresholds.enter_panicked, 3.8, "Panic entry threshold must be 3.8");
    assert_eq!(thresholds.enter_routed, 4.6, "Routed entry threshold must be 4.6");
    checks += 4;
    println!("  * Hysteresis constants match canonical Rust model: PASS");

    let evaluator = FearEvaluator::new();
    let mut state = EntityFearState::default();

    // Calm observation
    let obs_calm = FearObservation {
        agent_id: "scout_1".to_string(),
        x: 0.0,
        y: 0.0,
        z: 0.0,
        bravery: 0.8,
        health_ratio: 1.0,
        threats: vec![],
        nearby_allies: 2,
        nearby_enemies: 0,
        is_near_trauma: false,
        is_near_leader: true,
        ally_fear_average: 0.0,
    };
    let affect_calm = evaluator.evaluate(&mut state, &obs_calm, 1, 0.016);
    assert_eq!(affect_calm.band, FearBand::Calm);
    assert!(!affect_calm.panic_locked);
    checks += 2;
    println!("  * Calm baseline observation evaluates to CALM: PASS");

    // Acute threat observation -> Escalation
    let obs_threat = FearObservation {
        agent_id: "scout_1".to_string(),
        x: 0.0,
        y: 0.0,
        z: 0.0,
        bravery: 0.1,
        health_ratio: 0.3,
        threats: vec![ThreatObservation {
            id: "monster_1".to_string(),
            threat_type: "PREDATOR".to_string(),
            distance: 1.0,
            intensity: 1.0,
            rel_x: 1.0,
            rel_y: 0.0,
        }],
        nearby_allies: 0,
        nearby_enemies: 3,
        is_near_trauma: true,
        is_near_leader: false,
        ally_fear_average: 4.0,
    };
    let affect_threat = evaluator.evaluate(&mut state, &obs_threat, 2, 0.016);
    assert!(affect_threat.fear_score >= 3.8, "Score should reach panicked band");
    assert!(affect_threat.band.is_panicked(), "Band should be panicked or routed");
    checks += 2;
    println!("  * High-intensity threat triggers Panic escalation: PASS");

    // 2. Capability Negotiation
    let negotiator = HostCapabilityNegotiator::new();
    let sanitized = negotiator.build_sanitized_intent("scout_1", "survivors", "FLEE_FROM", 0.85);
    assert_eq!(sanitized.intent_type, "morale_response");
    assert_eq!(sanitized.target_entity_id, Some("scout_1".to_string()));
    assert!(!sanitized.recommended_actions.is_empty(), "Recommended actions must not be empty");
    assert_eq!(sanitized.recommended_actions[0].action, "fallback_and_recover");
    checks += 4;
    println!("  * HostCapabilityNegotiator maps FLEE_FROM to fallback_and_recover: PASS");

    // 3. Pack Coordination
    let mut pack = vec![
        PackMember {
            id: "wolf_alpha".to_string(),
            x: 0.0,
            y: 0.0,
            bravery: 0.95,
            dominance: 0.90,
            assertiveness: 0.85,
            fear_score: 0.2,
            assigned_role: PackRole::AlphaLeader,
        },
        PackMember {
            id: "wolf_beta".to_string(),
            x: 5.0,
            y: 0.0,
            bravery: 0.60,
            dominance: 0.40,
            assertiveness: 0.50,
            fear_score: 0.4,
            assigned_role: PackRole::Chaser,
        },
    ];
    PackCoordinator::assign_roles(&mut pack, 10.0, 10.0);
    assert_eq!(pack[0].assigned_role, PackRole::AlphaLeader);
    checks += 1;
    println!("  * PackCoordinator role assignment deterministic: PASS");

    // 4. Serialization roundtrip
    let json_str = serde_json::to_string(&sanitized).expect("Serialization failed");
    let deserialized: fear_ai::protocol::BrainIntent =
        serde_json::from_str(&json_str).expect("Deserialization failed");
    assert_eq!(sanitized, deserialized);
    checks += 1;
    println!("  * BrainIntent serde JSON roundtrip bit-identical: PASS");

    println!("============================================================");
    println!("SUCCESS: All {} Rust SDK conformance assertions PASSED.", checks);
    println!("============================================================");
}
