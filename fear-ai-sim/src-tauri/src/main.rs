// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
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

/// Initialize deterministic RNG with seeds (simplified - just returns seeds for JS to use)
#[tauri::command]
fn init_deterministic_rng(
    world_seed: u64,
    scenario_seed: u64,
) -> Result<HashMap<String, u64>, String> {
    let mut result = HashMap::new();
    result.insert("world_seed".to_string(), world_seed);
    result.insert("scenario_seed".to_string(), scenario_seed);
    Ok(result)
}

/// Generate deterministic random numbers (simplified)
#[tauri::command]
fn generate_random_numbers(count: usize) -> Vec<u64> {
    // Simplified - just return sequential numbers for now
    // In production, this would use a proper seeded RNG
    (0..count).map(|i| i as u64 * 12345).collect()
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
        let headers: Vec<&String> = first.keys().collect();
        content.push_str(&headers.join(","));
        content.push('\n');

        // Write records
        for summary in summaries {
            let values: Vec<String> = headers
                .iter()
                .map(|h| {
                    // Escape commas in values
                    let val = summary.get(*h).unwrap_or(&String::new());
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
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
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
