/**
 * AdaptiveBatchLogger: High-performance logging with buffering and asynchronous flushing.
 * Designed for 1000+ events per second without UI/Sim stutter.
 */
export class Logger {
    constructor() {
        this.buffer = [];
        this.persistentLogs = [];
        this.maxPersistent = 1000;
        this.batchSize = 100;
        this.flushInterval = 500; // ms
        
        // High-performance position buffer (TypedArray)
        // Stores [x, y, state] for 2000 agents over 100 snapshots
        this.maxAgents = 2000;
        this.maxSnapshots = 60; // 1 second of 60fps data
        this.posBuffer = new Float32Array(this.maxAgents * this.maxSnapshots * 3);
        this.snapshotIndex = 0;

        // Phase 10/11: Omniverse & Native Context
        this.isNative = !!window.__TAURI__;
        this.currentContext = {
            viewMode: 'DOTS',
            powerMode: 'HIGH_PERFORMANCE'
        };

        this.initAutoFlush();
    }

    log(event, metadata = {}) {
        const payload = { ...metadata, context: { ...this.currentContext } };
        const logEntry = {
            t: Date.now(),
            e: event,
            d: payload
        };
        
        this.buffer.push(logEntry);

        // Phase 10/11: Native Secure Logging (Tauri)
        if (this.isNative) {
            try {
                if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
                    const { invoke } = window.__TAURI__.core;
                    invoke('secure_log_event', { event, payload });
                }
            } catch (e) {
                // Silently fail if native invoke not available during tests
            }
        }
        
        // Immediate flush if buffer is huge to prevent OOM
        if (this.buffer.length >= this.batchSize * 5) {
            this.flush();
        }
    }

    /**
     * Efficiently records positions for all agents in a single pass.
     * @param {Array} agents Array of Agent objects
     */
    recordPositions(agents) {
        const offset = this.snapshotIndex * this.maxAgents * 3;
        for (let i = 0; i < Math.min(agents.length, this.maxAgents); i++) {
            const a = agents[i];
            const idx = offset + i * 3;
            this.posBuffer[idx] = a.x;
            this.posBuffer[idx + 1] = a.y;
            this.posBuffer[idx + 2] = a.brain.state === 'PANIC' ? 1 : 0;
        }
        this.snapshotIndex = (this.snapshotIndex + 1) % this.maxSnapshots;
    }

    initAutoFlush() {
        setInterval(() => this.flush(), this.flushInterval);
    }

    flush() {
        if (this.buffer.length === 0) return;
        
        const batch = this.buffer;
        this.buffer = [];

        // Archive into persistent logs for export (keeping last N)
        this.persistentLogs.push(...batch);
        if (this.persistentLogs.length > this.maxPersistent) {
            this.persistentLogs.splice(0, this.persistentLogs.length - this.maxPersistent);
        }

        // Notify UI of major events (sampled)
        const majorEvents = batch.filter(l => l.e === 'EVOLUTION_START' || l.e === 'THREAT_DEPLOYED' || l.e === 'MASS_PANIC');
        majorEvents.forEach(entry => {
            window.dispatchEvent(new CustomEvent('simulation-log', { detail: {
                timestamp: new Date(entry.t).toISOString(),
                event: entry.e,
                details: entry.d
            }}));
        });
    }

    getLogs() {
        return this.persistentLogs;
    }

    exportJSON() {
        return JSON.stringify({
            events: this.persistentLogs,
            metrics: {
                snapshotCount: this.maxSnapshots,
                agentCount: this.maxAgents
            }
        }, null, 2);
    }

    clear() {
        this.buffer = [];
        this.persistentLogs = [];
        this.posBuffer.fill(0);
        this.snapshotIndex = 0;
    }
}
