/**
 * databridge.js - High-Performance Simulation Data Bridge (Phase 2)
 * Buffers and streams simulation state to the Rust backend for zero-lag logging.
 */

import { getTauriExporter, isTauri } from './tauri-bridge.js';

export class DataBridge {
    constructor(simulation) {
        this.simulation = simulation;
        this.exporter = getTauriExporter();
        this.active = false;
        this.frameCount = 0;
        this.buffer = [];
        this.bufferSize = 30; // Flush every 30 frames
        
        // Sampling configuration
        this.sampleRate = 1; // 1 = every frame, 2 = every 2nd, etc.
        this.maxAgentsToLog = 1000; // Limit per-agent data if population is huge
    }

    /**
     * Start a new logging session
     */
    async startSession(prefix = 'fear_ai_sim') {
        if (!isTauri()) {
            console.warn('[DataBridge] Not running in Tauri. Data bridge disabled.');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${prefix}_${timestamp}.jsonl`;
        
        const result = await this.exporter.startLoggingSession(filename);
        if (result.success) {
            this.active = true;
            console.log('[DataBridge] Session started. Streaming to:', result.path);
        }
    }

    /**
     * Stop the current logging session
     */
    async stopSession() {
        if (!this.active) return;
        
        // Flush remaining buffer
        if (this.buffer.length > 0) {
            await this._flush();
        }

        await this.exporter.stopLoggingSession();
        this.active = false;
        console.log('[DataBridge] Session stopped.');
    }

    /**
     * Capture current simulation state and queue for streaming
     */
    captureFrame() {
        if (!this.active) return;
        
        this.frameCount++;
        if (this.frameCount % this.sampleRate !== 0) return;

        // Efficient state capture — single stats pass (getStats is O(n))
        const stats = this.simulation.getStats();
        const frameData = {
            f: this.simulation.frameCount,
            t: Date.now(),
            p: this.simulation.predators.length,
            a: stats.aliveCount,
            fps: Math.round(this.simulation.currentFPS || 0),
            // High-level metrics (numeric — not formatted strings)
            fear: stats.avgFear || 0,
            panic: stats.panicRatio || 0,
            panicCount: stats.panicCount || 0,
            panicRatio: stats.panicRatio || 0,
            // Sample agents (limit population to prevent massive files)
            agents: this.simulation.agents
                .filter(a => !a.dead)
                .slice(0, this.maxAgentsToLog)
                .map(a => ({
                    id: a.id,
                    x: Math.round(a.x),
                    y: Math.round(a.y),
                    s: a.brain.state,
                    f: parseFloat(a.brain.currentFear.toFixed(2)),
                    e: Math.round(a.energy)
                })),
            // All predators (usually few)
            predators: this.simulation.predators.map(p => ({
                id: p.id,
                x: Math.round(p.x),
                y: Math.round(p.y),
                s: p.state,
                t: p.targetAgent ? p.targetAgent.id : null
            }))
        };

        this.buffer.push(JSON.stringify(frameData));

        if (this.buffer.length >= this.bufferSize) {
            this._flush();
        }
    }

    /**
     * Send buffered data to Rust
     */
    async _flush() {
        const dataToFlush = this.buffer.join('\n');
        this.buffer = [];
        
        // Non-blocking call to Rust
        this.exporter.logFrameData(dataToFlush);
    }
}

export default DataBridge;
