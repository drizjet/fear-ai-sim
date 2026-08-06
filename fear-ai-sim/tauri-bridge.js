/**
 * tauri-bridge.js - Bridge between FearDataGen and Tauri Rust backend
 * Replaces browser downloads with native file system access
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * TauriExporter - Native file exports via Rust backend
 */
export class TauriExporter {
    constructor() {
        this.initialized = false;
        this.sessionSeeds = null;
    }

    /**
     * Initialize with deterministic seeds
     */
    async initialize(worldSeed, scenarioSeed) {
        try {
            const seeds = await invoke('init_deterministic_rng', {
                worldSeed,
                scenarioSeed
            });
            this.sessionSeeds = seeds;
            this.initialized = true;
            console.log('[TauriBridge] Initialized with seeds:', seeds);
            return seeds;
        } catch (error) {
            console.error('[TauriBridge] Failed to initialize:', error);
            // Fall back to JS implementation
            return null;
        }
    }

    /**
     * Start a high-speed logging session (Phase 2 Data Bridge)
     */
    async startLoggingSession(filename) {
        try {
            const path = await invoke('start_logging_session', { filename });
            console.log('[TauriBridge] Logging session started at:', path);
            return { success: true, path };
        } catch (error) {
            console.error('[TauriBridge] Failed to start logging session:', error);
            return { success: false, error };
        }
    }

    /**
     * Log a single frame of data (High Speed)
     */
    async logFrameData(data) {
        if (!isTauri()) return;
        try {
            const dataString = typeof data === 'string' ? data : JSON.stringify(data);
            await invoke('log_frame_data', { data: dataString });
        } catch (error) {
            // Silently fail to avoid lag, but log once
            if (!this._logErrorCount) this._logErrorCount = 0;
            if (this._logErrorCount < 1) {
                console.error('[TauriBridge] Frame logging failed:', error);
                this._logErrorCount++;
            }
        }
    }

    /**
     * Stop the current logging session
     */
    async stopLoggingSession() {
        try {
            await invoke('stop_logging_session');
            console.log('[TauriBridge] Logging session stopped.');
            return { success: true };
        } catch (error) {
            console.error('[TauriBridge] Failed to stop logging session:', error);
            return { success: false, error };
        }
    }

    /**
     * Phase 3: Sync agents to Rust physics engine
     */
    async syncAgentsToRust(agents) {
        if (!isTauri()) return;
        try {
            await invoke('sync_agents_to_rust', { agents });
        } catch (error) {
            console.error('[TauriBridge] Failed to sync agents:', error);
        }
    }

    /**
     * Phase 3: Run Rust physics tick and get updated agents
     */
    async tickRustEngine() {
        if (!isTauri()) return null;
        try {
            return await invoke('tick_rust_engine');
        } catch (error) {
            console.error('[TauriBridge] Rust tick failed:', error);
            return null;
        }
    }

    /**
     * Export trajectories to JSONL file
     */
    async exportTrajectoriesJSONL(trajectories, filename) {
        try {
            const path = await invoke('export_trajectories_jsonl', {
                trajectories,
                filename
            });
            console.log('[TauriBridge] Exported to:', path);
            return { success: true, path };
        } catch (error) {
            console.error('[TauriBridge] Export failed:', error);
            // Fall back to browser download
            return this._fallbackDownload(trajectories, filename || 'trajectories.jsonl');
        }
    }

    /**
     * Export summary to CSV
     */
    async exportSummaryCSV(summaries, filename) {
        try {
            const path = await invoke('export_summary_csv', {
                summaries,
                filename
            });
            console.log('[TauriBridge] Exported CSV to:', path);
            return { success: true, path };
        } catch (error) {
            console.error('[TauriBridge] CSV export failed:', error);
            return this._fallbackCSV(summaries, filename || 'summary.csv');
        }
    }

    /**
     * Export features as binary JSON
     */
    async exportFeaturesBinary(features, filename) {
        try {
            const path = await invoke('export_features_binary', {
                features,
                filename
            });
            return { success: true, path };
        } catch (error) {
            console.error('[TauriBridge] Features export failed:', error);
            return this._fallbackDownload(features, filename || 'features.json');
        }
    }

    /**
     * Compress all exports to ZIP
     */
    async compressExports() {
        try {
            const path = await invoke('compress_exports');
            console.log('[TauriBridge] Compressed to:', path);
            return { success: true, path };
        } catch (error) {
            console.error('[TauriBridge] Compression failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * List all exported files
     */
    async listExports() {
        try {
            const files = await invoke('list_exports');
            return files;
        } catch (error) {
            console.error('[TauriBridge] List exports failed:', error);
            return [];
        }
    }

    /**
     * Validate dataset integrity
     */
    async validateDataset(trajectories) {
        try {
            const result = await invoke('validate_dataset', { trajectories });
            return result;
        } catch (error) {
            console.error('[TauriBridge] Validation failed:', error);
            return null;
        }
    }

    /**
     * Open export directory in file manager
     */
    async openExportDirectory() {
        try {
            await invoke('open_export_directory');
            return { success: true };
        } catch (error) {
            console.error('[TauriBridge] Open directory failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get system info
     */
    async getSystemInfo() {
        try {
            const info = await invoke('get_system_info');
            return info;
        } catch (error) {
            console.error('[TauriBridge] Get info failed:', error);
            return null;
        }
    }

    /**
     * Get data directory path
     */
    async getDataDirectory() {
        try {
            const path = await invoke('get_data_directory');
            return path;
        } catch (error) {
            console.error('[TauriBridge] Get directory failed:', error);
            return null;
        }
    }

    /**
     * Generate deterministic random numbers (for testing)
     */
    async generateRandomNumbers(count) {
        try {
            const numbers = await invoke('generate_random_numbers', { count });
            return numbers;
        } catch (error) {
            console.error('[TauriBridge] RNG failed:', error);
            return null;
        }
    }

    // ============================================
    // Fallback methods (browser-based)
    // ============================================

    _fallbackDownload(data, filename) {
        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true, fallback: true };
    }

    _fallbackCSV(summaries, filename) {
        if (summaries.length === 0) return { success: false };

        const headers = Object.keys(summaries[0]);
        const csv = [
            headers.join(','),
            ...summaries.map(row => 
                headers.map(h => row[h] || '').join(',')
            )
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true, fallback: true };
    }
}

/**
 * Check if running in Tauri environment
 */
export function isTauri() {
    return typeof window !== 'undefined' && 
           window.__TAURI__ !== undefined;
}

/**
 * Get appropriate exporter (Tauri if available, browser fallback)
 */
export function getExporter() {
    if (isTauri()) {
        console.log('[TauriBridge] Using native Tauri exporter');
        return new TauriExporter();
    } else {
        console.log('[TauriBridge] Running in browser, using fallback');
        return null;
    }
}

// Singleton instance
let tauriExporterInstance = null;

export function getTauriExporter() {
    if (!tauriExporterInstance) {
        tauriExporterInstance = new TauriExporter();
    }
    return tauriExporterInstance;
}
