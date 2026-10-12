//! Rust fear oracle.
//!
//! Executes the REAL host `fear.rs` (copied verbatim next to this file as
//! `src/fear.rs` by the generator, never edited) against the `rust_scenario`
//! records in `evidence/rust_js_parity_vectors.json`, plus a fixed set of
//! lock/clamp/berserk observations, and prints one JSON document on stdout.
//!
//! It reads no network, writes no files, and holds no opinion about JS: the
//! comparison against `FearCore.js` happens in `verify_cross_tree_parity.mjs`.
#[allow(dead_code)]
mod fear;

use fear::{FearBand, FearState};
use serde_json::{json, Value};
use std::{env, fs};

fn band_from(name: &str) -> FearBand {
    match name {
        "Calm" => FearBand::Calm,
        "Alert" => FearBand::Alert,
        "Afraid" => FearBand::Afraid,
        "Panicked" => FearBand::Panicked,
        "Routed" => FearBand::Routed,
        "BerserkOverride" => FearBand::BerserkOverride,
        other => panic!("unknown Rust band in scenario: {other}"),
    }
}

fn score_of(v: &Value) -> f32 {
    // JSON null stands for NaN (JSON has no NaN literal).
    if v.is_null() {
        f32::NAN
    } else {
        v.as_f64().expect("score must be a number or null") as f32
    }
}

fn tick_of(v: &Value) -> Option<u64> {
    if v.is_null() {
        None
    } else {
        Some(v.as_u64().expect("eval_tick must be an integer or null"))
    }
}

fn main() {
    let path = env::args().nth(1).expect("usage: rust_fear_oracle <scenarios.json>");
    let scenarios: Vec<Value> =
        serde_json::from_str(&fs::read_to_string(path).expect("read scenarios"))
            .expect("parse scenarios");

    let mut results = Vec::new();
    for sc in &scenarios {
        let mut s = FearState::default();
        s.band = band_from(sc["initial_band"].as_str().expect("initial_band"));
        s.recovery_lock_until = sc["recovery_lock_until"].as_u64().expect("recovery_lock_until");
        s.apply_score(score_of(&sc["score"]), None, tick_of(&sc["eval_tick"]));
        results.push(json!({
            "id": sc["id"],
            "initial_band": sc["initial_band"],
            "final_band": format!("{:?}", s.band),
            // f32 printed as Rust prints it, so the value is stable text rather than a widened double.
            "final_score": format!("{}", s.fear_score),
            "recovery_lock_until": s.recovery_lock_until,
        }));
    }

    // --- observations (fixed; independent of the scenario file) ---
    // Lock armed when a tick is supplied.
    let mut a = FearState::default();
    a.apply_score(4.0, None, Some(10));
    let lock_with_tick = a.recovery_lock_until;

    // No tick supplied: no lock is armed.
    let mut b = FearState::default();
    b.apply_score(4.0, None, None);
    let lock_without_tick = b.recovery_lock_until;

    // Consecutive evaluation: how many further evaluations at score 1.0 (>= exit.afraid 0.8) stay Panicked.
    let mut c = FearState::default();
    c.apply_score(4.0, None, Some(10));
    let mut held = 0u32;
    for t in 11..=40u64 {
        c.apply_score(1.0, None, Some(t));
        if c.band == FearBand::Panicked {
            held += 1;
        } else {
            break;
        }
    }

    // Sparse host ticks: entered at 10, next evaluation happens at host tick 25.
    let mut d = FearState::default();
    d.apply_score(4.0, None, Some(10));
    d.apply_score(1.0, None, Some(25));
    let sparse_band = format!("{:?}", d.band);

    // Panicked -> Routed does not re-arm the lock.
    let mut e = FearState::default();
    e.apply_score(4.0, None, Some(10));
    let before = e.recovery_lock_until;
    e.apply_score(4.7, None, Some(14));
    let routed_band = format!("{:?}", e.band);
    let after = e.recovery_lock_until;

    // Clamp.
    let mut f = FearState::default();
    f.apply_score(999.0, None, Some(1));
    let clamped = format!("{}", f.fear_score);

    // BerserkOverride is absorbing.
    let mut g = FearState::default();
    g.band = FearBand::BerserkOverride;
    g.apply_score(0.0, None, Some(1));
    let berserk_after_zero = format!("{:?}", g.band);
    g.apply_score(5.0, None, Some(2));
    let berserk_after_five = format!("{:?}", g.band);

    let out = json!({
        "results": results,
        "observations": {
            "lock_armed_with_eval_tick": { "entered_at_tick": 10, "recovery_lock_until": lock_with_tick },
            "lock_armed_without_eval_tick": { "recovery_lock_until": lock_without_tick },
            "consecutive_hold_at_score_1_0": { "entered_at_tick": 10, "further_evaluations_held": held },
            "sparse_host_tick_release": { "entered_at_tick": 10, "next_eval_tick": 25, "score": "1.0", "band": sparse_band },
            "panicked_to_routed_lock": { "band": routed_band, "lock_until_before": before, "lock_until_after": after },
            "clamp_999": { "final_score": clamped },
            "berserk_override": { "after_score_0": berserk_after_zero, "after_score_5": berserk_after_five }
        }
    });
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
}
