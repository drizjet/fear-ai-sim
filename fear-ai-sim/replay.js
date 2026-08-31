/**
 * ReplaySystem: Captures and replays simulation snapshots
 * Allows saving "interesting moments" and playing them back
 */

export class ReplaySystem {
    constructor(maxFrames = 3000) {
        this.maxFrames = maxFrames; // ~50 seconds at 60fps
        this.frames = [];
        this.isRecording = false;
        this.isPlaying = false;
        this.playbackFrame = 0;
        this.playbackSpeed = 1;
        this.recordedPlaybackSpeed = 1;
        this.playbackAccumulator = 0;
        this.recordingStartTime = 0;
        this.interestingEvents = []; // Timestamps of notable events
    }

    startRecording() {
        this.frames = [];
        this.isRecording = true;
        // §121 determinism: do NOT use Date.now() for the
        // recording start time. The caller can pass a tick
        // counter to captureFrame instead. We default to 0
        // for backward compatibility.
        this.recordingStartTime = 0;
        this.interestingEvents = [];
        this.recordedPlaybackSpeed = this.playbackSpeed;
        console.log('[REPLAY] Recording started');
    }

    stopRecording() {
        this.isRecording = false;
        console.log(`[REPLAY] Recording stopped. Captured ${this.frames.length} frames`);
        return this.exportRecording();
    }

    /**
     * Capture a frame of the simulation state
     */
    captureFrame(agents, predators, stats, { tick = null } = {}) {
        if (!this.isRecording) return;

        // Only capture every 2nd frame to save memory (30fps recording)
        if (this.frames.length >= this.maxFrames) {
            this.frames.shift(); // Remove oldest frame
        }

        // §121 determinism: the frame timestamp is the
        // injected tick, not wall-clock time. If no tick is
        // provided (backward compat), use the frame index.
        const timestamp = Number.isInteger(tick) ? tick : this.frames.length;

        // Capture compressed frame data
        const frame = {
            timestamp,
            agents: agents.slice(0, 100).map(a => ({ // Sample 100 agents to save memory
                x: Math.floor(a.x ?? 0),
                y: Math.floor(a.y ?? 0),
                // §121 / directive §22: support both the
                // old `agent.brain.state` shape and the
                // new closed-world merchant shape
                // (`merchant.state` or `merchant.location`).
                state: a.brain?.state ?? a.state ?? a.location ?? 'unknown',
                id: a.id,
                fear: Math.floor((a.brain?.currentFear ?? a.fear ?? 0) * 100) / 100,
                fearTrace: a.brain?.fearCore?.getDecisionTrace?.() ?? a.fearTrace ?? []
            })),
            predators: predators.map(p => ({
                x: Math.floor(p.x ?? 0),
                y: Math.floor(p.y ?? 0),
                // §22: preserve the predator's id for
                // replay inspection.
                id: p.id,
                // Support both `p.type` and the
                // closed-world predator shape
                // (`p.roadId`, `p.mode`).
                type: p.type ?? `predator-${p.id ?? 'unknown'}`,
                roadId: p.roadId,
                mode: p.mode
            })),
            stats: {
                population: stats.count,
                avgFear: stats.avgFear,
                panicLevel: stats.panicLevel
            }
        };

        this.frames.push(frame);
    }

    /**
     * Mark current moment as interesting
     */
    markEvent(eventType, data) {
        if (!this.isRecording) return;
        // §121 determinism: the event timestamp is the frame
        // index (or the injected tick if provided), not
        // wall-clock time.
        const eventTick = Number.isInteger(data?.tick) ? data.tick : this.frames.length - 1;
        this.interestingEvents.push({
            frameIndex: this.frames.length - 1,
            timestamp: eventTick,
            type: eventType,
            data: data,
            agentId: data?.agentId ?? data?.id ?? null
        });

        console.log(`[REPLAY] Event marked: ${eventType}`);
    }

    /**
     * Export recording as JSON
     */
    exportRecording() {
        const recording = {
            version: '1.2',
            playbackSpeed: this.recordedPlaybackSpeed,
            duration: this.frames.length * 33, // ~33ms per frame
            frameCount: this.frames.length,
            events: this.interestingEvents,
            frames: this.frames
        };
        
        return JSON.stringify(recording);
    }

    /**
     * Load a recording for playback
     */
    loadRecording(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            this.frames = data.frames || [];
            this.interestingEvents = data.events || [];
            this.recordedPlaybackSpeed = Number.isFinite(data.playbackSpeed) && data.playbackSpeed > 0
                ? data.playbackSpeed
                : 1;
            this.setPlaybackSpeed(this.recordedPlaybackSpeed);
            this.playbackFrame = 0;
            console.log(`[REPLAY] Loaded ${this.frames.length} frames`);
            return true;
        } catch (e) {
            console.error('[REPLAY] Failed to load recording:', e);
            return false;
        }
    }

    /**
     * Start playback
     */
    startPlayback() {
        if (this.frames.length === 0) {
            console.warn('[REPLAY] No frames to play');
            return false;
        }
        
        this.isPlaying = true;
        this.playbackFrame = 0;
        console.log('[REPLAY] Playback started');
        return true;
    }

    /**
     * Get current playback frame
     */
    getPlaybackFrame() {
        if (!this.isPlaying || this.frames.length === 0) return null;

        this.playbackAccumulator += this.playbackSpeed;
        if (this.playbackAccumulator < 1) return this.frames[this.playbackFrame];
        const framesToAdvance = Math.floor(this.playbackAccumulator);
        this.playbackAccumulator -= framesToAdvance;
        const frame = this.frames[this.playbackFrame];
        this.playbackFrame = Math.min(this.playbackFrame + framesToAdvance, this.frames.length - 1);
        
        if (this.playbackFrame >= this.frames.length - 1) {
            this.isPlaying = false;
            this.playbackFrame = this.frames.length - 1;
            console.log('[REPLAY] Playback finished');
        }
        
        return frame;
    }

    stopPlayback() {
        this.isPlaying = false;
        this.playbackFrame = 0;
        this.playbackAccumulator = 0;
    }

    setPlaybackSpeed(speed) {
        const value = Number(speed);
        if (!Number.isFinite(value) || value <= 0) return this.playbackSpeed;
        this.playbackSpeed = value;
        return this.playbackSpeed;
    }

    /**
     * Return the historical FearCore trace for one sampled agent in a frame.
     * Frames sample agents by array order, so this uses the sampled index.
     */
    getHistoricalTrace(frameIndex, agentIndex = 0) {
        const frame = this.frames[frameIndex];
        return frame?.agents?.[agentIndex]?.fearTrace || [];
    }

    getEventsAtFrame(frameIndex) {
        return this.interestingEvents.filter(event => event.frameIndex === frameIndex);
    }

    getEventMarkers() {
        return this.interestingEvents.map(event => ({
            ...event,
            frameIndex: Math.max(0, Math.min(this.frames.length - 1, event.frameIndex))
        }));
    }

    jumpToEvent(eventIndex) {
        const event = this.interestingEvents[eventIndex];
        return event ? this.seek(event.frameIndex) : null;
    }

    getFrame(frameIndex) {
        if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= this.frames.length) {
            return null;
        }
        return this.frames[frameIndex];
    }

    seek(frameIndex) {
        if (this.frames.length === 0) return null;
        const target = Math.max(0, Math.min(this.frames.length - 1, Math.floor(frameIndex)));
        this.playbackFrame = target;
        return this.getFrame(target);
    }

    /**
     * Auto-capture when interesting events happen
     */
    shouldAutoCapture(agents, predators) {
        // Detect mass panic
        const panicCount = agents.filter(a => a.brain.state === 'PANIC').length;
        const panicRatio = panicCount / agents.length;
        
        // Detect predation events
        const recentKills = agents.filter(a => a.dead && a.deathCause === 'predation').length;
        
        return panicRatio > 0.3 || recentKills > 0;
    }
}

/**
 * ReplayRenderer: Renders replay frames to canvas
 */
export class ReplayRenderer {
    constructor(ctx) {
        this.ctx = ctx;
    }

    renderFrame(frame) {
        if (!frame) return;

        const ctx = this.ctx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw agents
        frame.agents.forEach(agent => {
            ctx.beginPath();
            ctx.arc(agent.x, agent.y, 3, 0, Math.PI * 2);
            
            // Color based on state
            switch (agent.state) {
                case 'PANIC':
                    ctx.fillStyle = '#ff0000';
                    break;
                case 'HIDE':
                    ctx.fillStyle = '#888888';
                    break;
                case 'RECOVER':
                    ctx.fillStyle = '#00ff88';
                    break;
                default:
                    ctx.fillStyle = `rgb(${Math.floor(agent.fear * 255)}, 100, 200)`;
            }
            
            ctx.fill();
        });

        // Draw predators
        frame.predators.forEach(pred => {
            ctx.beginPath();
            ctx.arc(pred.x, pred.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = pred.type === 'TANK' ? '#ff0055' : 
                           pred.type === 'STALKER' ? '#9d00ff' : '#00ff88';
            ctx.fill();
        });

        // Draw stats overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 150, 60);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText(`Pop: ${frame.stats.population}`, 15, 25);
        ctx.fillText(`Fear: ${frame.stats.avgFear}`, 15, 40);
        ctx.fillText(`Panic: ${frame.stats.panicLevel}`, 15, 55);
    }
}