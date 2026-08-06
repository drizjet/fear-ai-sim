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
        this.recordingStartTime = 0;
        this.interestingEvents = []; // Timestamps of notable events
    }

    startRecording() {
        this.frames = [];
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.interestingEvents = [];
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
    captureFrame(agents, predators, stats) {
        if (!this.isRecording) return;

        // Only capture every 2nd frame to save memory (30fps recording)
        if (this.frames.length >= this.maxFrames) {
            this.frames.shift(); // Remove oldest frame
        }

        // Capture compressed frame data
        const frame = {
            timestamp: Date.now() - this.recordingStartTime,
            agents: agents.slice(0, 100).map(a => ({ // Sample 100 agents to save memory
                x: Math.floor(a.x),
                y: Math.floor(a.y),
                state: a.brain.state,
                fear: Math.floor(a.brain.currentFear * 100) / 100
            })),
            predators: predators.map(p => ({
                x: Math.floor(p.x),
                y: Math.floor(p.y),
                type: p.type
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
        
        this.interestingEvents.push({
            frameIndex: this.frames.length - 1,
            timestamp: Date.now() - this.recordingStartTime,
            type: eventType,
            data: data
        });
        
        console.log(`[REPLAY] Event marked: ${eventType}`);
    }

    /**
     * Export recording as JSON
     */
    exportRecording() {
        const recording = {
            version: '1.0',
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
        
        const frame = this.frames[this.playbackFrame];
        this.playbackFrame++;
        
        if (this.playbackFrame >= this.frames.length) {
            this.isPlaying = false;
            console.log('[REPLAY] Playback finished');
        }
        
        return frame;
    }

    stopPlayback() {
        this.isPlaying = false;
        this.playbackFrame = 0;
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