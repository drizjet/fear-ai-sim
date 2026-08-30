// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

mod engine;

use std::fs::File;
use std::io::{BufWriter, Write};
use crate::engine::{EngineState, SimulationEngine, RustAgent};

// Export state tracking
pub struct ExportState {
    export_dir: Mutex<PathBuf>,
    session_id: Mutex<String>,
}

// High-speed logging state
pub struct LoggingState {
    file: Mutex<Option<BufWriter<File>>>,
}

/// Deterministic RNG state shared with the JS host.
///
/// The stream is a Marsaglia xorshift64* generator. The seed is mixed from the
/// world and scenario seeds supplied by `init_deterministic_rng`, so the same
/// pair of seeds always produces the same sequence on any platform. No external
/// dependency is required: this is the spec's "deterministic core first" path
/// for the Rust lane.
pub struct RngState {
    stream: Mutex<u64>,
}

impl RngState {
    fn new() -> Self {
        Self {
            stream: Mutex::new(0x9E3779B97F4A7C15),
        }
    }

    fn seed(&self, world_seed: u64, scenario_seed: u64) {
        let mixed = mix_seeds(world_seed, scenario_seed);
        if let Ok(mut guard) = self.stream.lock() {
            *guard = if mixed == 0 { 0x9E3779B97F4A7C15 } else { mixed };
        }
    }

    fn next_u64(&self) -> u64 {
        let mut guard = match self.stream.lock() {
            Ok(g) => g,
            Err(_) => return 0,
        };
        let mut x = *guard;
        if x == 0 {
            x = 0x9E3779B97F4A7C15;
        }
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        *guard = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }
}

fn mix_seeds(world_seed: u64, scenario_seed: u64) -> u64 {
    // SplitMix64 finalizer — keeps the state well-distributed even when the
    // caller passes 0 or simple constants.
    let mut z = world_seed.wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31) ^ scenario_seed
}

impl ExportState {
    fn new() -> Self {
        let export_dir = PathBuf::from("./exports");
        std::fs::create_dir_all(&export_dir).ok();

        Self {
            export_dir: Mutex::new(export_dir),
            session_id: Mutex::new(format!("session_{}", chrono::Local::now().timestamp())),
        }
    }

    fn get_session_path(&self) -> PathBuf {
        let base = self.export_dir.lock().unwrap().clone();
        let session = self.session_id.lock().unwrap().clone();
        let path = base.join(&session);
        std::fs::create_dir_all(&path).ok();
        path
    }
}

// ============================================
// COMMANDS
// ============================================

/// Sync JavaScript agents into the Rust physics engine
#[tauri::command]
fn sync_agents_to_rust(agents: Vec<RustAgent>, engine_state: State<'_, EngineState>) {
    let mut engine = engine_state.engine.lock().unwrap();
    engine.agents = agents;
}

/// Run a high-speed physics tick in Rust and return updated positions
#[tauri::command]
fn tick_rust_engine(engine_state: State<'_, EngineState>) -> Vec<RustAgent> {
    let mut engine = engine_state.engine.lock().unwrap();
    engine.update();
    engine.agents.clone()
}

/// Start a high-speed logging session
#[tauri::command]
fn start_logging_session(
    filename: String,
    export_state: State<'_, ExportState>,
    logging_state: State<'_, LoggingState>,
) -> Result<String, String> {
    let session_path = export_state.get_session_path();
    let filepath = session_path.join(&filename);

    let file = File::create(&filepath).map_err(|e| e.to_string())?;
    let writer = BufWriter::new(file);

    let mut log_file = logging_state.file.lock().unwrap();
    *log_file = Some(writer);

    Ok(filepath.to_string_lossy().to_string())
}

/// Append frame data to the active logging session (High Speed)
#[tauri::command]
fn log_frame_data(data: String, logging_state: State<'_, LoggingState>) -> Result<(), String> {
    let mut log_file = logging_state.file.lock().unwrap();

    if let Some(ref mut writer) = *log_file {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.write_all(b"\n").map_err(|e| e.to_string())?;
        // We don't flush every frame for performance; BufWriter handles it.
        Ok(())
    } else {
        Err("No active logging session".to_string())
    }
}

/// Stop the active logging session and flush to disk
#[tauri::command]
fn stop_logging_session(logging_state: State<'_, LoggingState>) -> Result<(), String> {
    let mut log_file = logging_state.file.lock().unwrap();

    if let Some(mut writer) = log_file.take() {
        writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Ok(())
    }
}

/// Initialize deterministic RNG with seeds.
///
/// Returns the seeds and the first 8 numbers of the resulting stream so the JS
/// host can verify it received the expected sequence.
#[tauri::command]
fn init_deterministic_rng(
    world_seed: u64,
    scenario_seed: u64,
    rng_state: State<'_, RngState>,
) -> Result<HashMap<String, u64>, String> {
    rng_state.seed(world_seed, scenario_seed);
    let mut result = HashMap::new();
    result.insert("world_seed".to_string(), world_seed);
    result.insert("scenario_seed".to_string(), scenario_seed);
    let preview: Vec<u64> = (0..8).map(|_| rng_state.next_u64()).collect();
    for (i, value) in preview.iter().enumerate() {
        result.insert(format!("preview_{}", i), *value);
    }
    Ok(result)
}

/// Generate deterministic random numbers from the seeded stream.
#[tauri::command]
fn generate_random_numbers(
    count: usize,
    rng_state: State<'_, RngState>,
) -> Vec<u64> {
    (0..count).map(|_| rng_state.next_u64()).collect()
}

/// Export trajectory data to JSONL file
#[tauri::command]
fn export_trajectories_jsonl(
    trajectories: Vec<serde_json::Value>,
    filename: Option<String>,
    export_state: State<'_, ExportState>,
) -> Result<String, String> {
    let session_path = export_state.get_session_path();

    let filename = filename.unwrap_or_else(|| {
        format!(
            "trajectories_{}.jsonl",
            chrono::Local::now().format("%Y%m%d_%H%M%S")
        )
    });

    let filepath = session_path.join(&filename);

    let mut content = String::new();
    for traj in trajectories {
        content.push_str(&serde_json::to_string(&traj).map_err(|e| e.to_string())?);
        content.push('\n');
    }

    std::fs::write(&filepath, content).map_err(|e| e.to_string())?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Export summary data to CSV (simplified)
#[tauri::command]
fn export_summary_csv(
    summaries: Vec<HashMap<String, String>>,
    filename: Option<String>,
    export_state: State<'_, ExportState>,
) -> Result<String, String> {
    let session_path = export_state.get_session_path();

    let filename = filename.unwrap_or_else(|| {
        format!(
            "summary_{}.csv",
            chrono::Local::now().format("%Y%m%d_%H%M%S")
        )
    });

    let filepath = session_path.join(&filename);

    let mut content = String::new();

    // Write headers from first record
    if let Some(first) = summaries.first() {
        let headers: Vec<String> = first.keys().cloned().collect();
        content.push_str(&headers.join(","));
        content.push('\n');

        // Write records
        let empty = String::new();
        for summary in summaries {
            let values: Vec<String> = headers
                .iter()
                .map(|h| {
                    // Escape commas in values
                    let val = summary.get(h).unwrap_or(&empty);
                    if val.contains(',') {
                        format!("\"{}\"", val)
                    } else {
                        val.clone()
                    }
                })
                .collect();
            content.push_str(&values.join(","));
            content.push('\n');
        }
    }

    std::fs::write(&filepath, content).map_err(|e| e.to_string())?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Export features as binary JSON
#[tauri::command]
fn export_features_binary(
    features: Vec<serde_json::Value>,
    filename: Option<String>,
    export_state: State<'_, ExportState>,
) -> Result<String, String> {
    let session_path = export_state.get_session_path();

    let filename = filename.unwrap_or_else(|| {
        format!(
            "features_{}.json",
            chrono::Local::now().format("%Y%m%d_%H%M%S")
        )
    });

    let filepath = session_path.join(&filename);

    let content = serde_json::to_string(&features).map_err(|e| e.to_string())?;

    std::fs::write(&filepath, content).map_err(|e| e.to_string())?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Simple file compression (creates manifest)
#[tauri::command]
fn compress_exports(export_state: State<'_, ExportState>) -> Result<String, String> {
    let session_path = export_state.get_session_path();
    let manifest_path = session_path.join("manifest.txt");

    // Create a manifest of files instead of ZIP
    let mut manifest = String::new();
    manifest.push_str("Fear AI Omniverse Export Manifest\n");
    manifest.push_str("================================\n\n");

    for entry in std::fs::read_dir(&session_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_file() {
            let name = path.file_name().unwrap().to_string_lossy();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            manifest.push_str(&format!("{} ({} bytes)\n", name, size));
        }
    }

    std::fs::write(&manifest_path, manifest).map_err(|e| e.to_string())?;

    Ok(manifest_path.to_string_lossy().to_string())
}

/// List all exported files
#[tauri::command]
fn list_exports(
    export_state: State<'_, ExportState>,
) -> Result<Vec<HashMap<String, String>>, String> {
    let session_path = export_state.get_session_path();

    let mut files = Vec::new();

    for entry in std::fs::read_dir(&session_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if let Ok(metadata) = entry.metadata() {
            let mut info = HashMap::new();
            info.insert(
                "name".to_string(),
                path.file_name().unwrap().to_string_lossy().to_string(),
            );
            info.insert("size".to_string(), metadata.len().to_string());
            info.insert(
                "modified".to_string(),
                metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_default(),
            );
            files.push(info);
        }
    }

    Ok(files)
}

/// Validate dataset integrity
#[tauri::command]
fn validate_dataset(trajectories: Vec<serde_json::Value>) -> HashMap<String, serde_json::Value> {
    let total = trajectories.len();
    let mut valid = 0;
    let mut errors = Vec::new();

    for (i, traj) in trajectories.iter().enumerate() {
        let has_id = traj.get("id").is_some();
        let has_frames = traj
            .get("frames")
            .and_then(|f| f.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);

        if has_id && has_frames {
            valid += 1;
        } else {
            let mut error = HashMap::new();
            error.insert("index".to_string(), serde_json::json!(i));
            error.insert("has_id".to_string(), serde_json::json!(has_id));
            error.insert("has_frames".to_string(), serde_json::json!(has_frames));
            errors.push(error);
        }
    }

    let mut result = HashMap::new();
    result.insert("total".to_string(), serde_json::json!(total));
    result.insert("valid".to_string(), serde_json::json!(valid));
    result.insert("invalid".to_string(), serde_json::json!(total - valid));
    result.insert(
        "validity_rate".to_string(),
        serde_json::json!(if total > 0 {
            valid as f64 / total as f64
        } else {
            0.0
        }),
    );
    result.insert("errors".to_string(), serde_json::json!(errors));

    result
}

/// Get system information
#[tauri::command]
fn get_system_info() -> HashMap<String, String> {
    let mut info = HashMap::new();

    info.insert("platform".to_string(), std::env::consts::OS.to_string());
    info.insert("arch".to_string(), std::env::consts::ARCH.to_string());
    info.insert("version".to_string(), env!("CARGO_PKG_VERSION").to_string());

    #[cfg(target_os = "windows")]
    info.insert("family".to_string(), "windows".to_string());
    #[cfg(target_os = "macos")]
    info.insert("family".to_string(), "macos".to_string());
    #[cfg(target_os = "linux")]
    info.insert("family".to_string(), "linux".to_string());

    info
}

/// Open export directory in file manager
#[tauri::command]
fn open_export_directory(export_state: State<'_, ExportState>) -> Result<(), String> {
    let path = export_state.get_session_path();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ============================================
// MAIN
// ============================================

fn main() {
    tauri::Builder::default()
        .manage(ExportState::new())
        .manage(LoggingState {
            file: Mutex::new(None),
        })
        .manage(EngineState {
            engine: Mutex::new(SimulationEngine::new(1400.0, 900.0)),
        })
        .manage(RngState::new())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_deterministic_rng,
            generate_random_numbers,
            sync_agents_to_rust,
            tick_rust_engine,
            start_logging_session,
            log_frame_data,
            stop_logging_session,
            export_trajectories_jsonl,
            export_summary_csv,
            export_features_binary,
            compress_exports,
            list_exports,
            open_export_directory,
            validate_dataset,
            get_system_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod rng_tests {
    use super::{RngState, mix_seeds};

    #[test]
    fn same_seeds_produce_same_stream() {
        let a = RngState::new();
        let b = RngState::new();
        a.seed(0x1234_5678, 0x9ABC_DEF0);
        b.seed(0x1234_5678, 0x9ABC_DEF0);
        for _ in 0..16 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let a = RngState::new();
        let b = RngState::new();
        a.seed(0x1234_5678, 0x9ABC_DEF0);
        b.seed(0x1234_5678, 0x9ABC_DEF1);
        let mut diffs = 0u32;
        for _ in 0..16 {
            if a.next_u64() != b.next_u64() {
                diffs += 1;
            }
        }
        assert!(diffs >= 14, "expected streams to diverge, got {} diffs", diffs);
    }

    #[test]
    fn zero_seed_does_not_deadlock() {
        let a = RngState::new();
        a.seed(0, 0);
        // xorshift64* must be rescued from a zero state.
        for _ in 0..8 {
            assert_ne!(a.next_u64(), 0);
        }
    }

    #[test]
    fn mix_seeds_is_deterministic() {
        assert_eq!(mix_seeds(1, 2), mix_seeds(1, 2));
        assert_ne!(mix_seeds(1, 2), mix_seeds(2, 1));
    }
}
