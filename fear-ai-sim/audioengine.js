/**
 * Fear-Audio Engine: Procedural Affective Synthesis
 * Part of the Fear-AI Omniverse (Phase 10/11)
 * 
 * Uses psychoacoustic triggers to dynamically scale audio based on AI fear levels.
 * Triggers: Heartbeat (Arousal), Shepard Tone (Suspense), Infrasound (Unease).
 */

export class FearAudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.lowPass = null;
        
        // Oscillators
        this.infraOsc = null; // 18.9Hz Infrasound
        this.heartbeatInterval = null;
        
        // Phase 11: Shepard Tone (Suspense)
        this.shepardOscillators = [];
        this.shepardGains = [];
        this.shepardCount = 6;
        
        this.isStarted = false;
    }

    init() {
        if (this.isStarted) return;
        
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3;
        
        // Master Low-pass Filter (Scaled by Fear)
        this.lowPass = this.ctx.createBiquadFilter();
        this.lowPass.type = 'lowpass';
        this.lowPass.frequency.value = 20000; // Open by default
        
        this.masterGain.connect(this.lowPass);
        this.lowPass.connect(this.ctx.destination);

        this.initInfrasound();
        this.initShepardTone();
        
        this.isStarted = true;
        console.log('[AUDIO] Fear-Audio Engine Initialized');
    }

    /**
     * Shepard Tone: The Illusion of Infinite Pitch Ascent
     */
    initShepardTone() {
        for (let i = 0; i < this.shepardCount; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            // Space octaves
            const freq = 440 * Math.pow(2, i - this.shepardCount / 2);
            osc.frequency.value = freq;
            
            gain.gain.value = 0; // Silent by default
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start();
            
            this.shepardOscillators.push(osc);
            this.shepardGains.push(gain);
        }
    }

    /**
     * Update audio parameters based on global simulation emotions (Phase 16)
     */
    update(stats) {
        if (!this.isStarted) return;

        const fear = parseFloat(stats.avgFear);
        const anger = parseFloat(stats.avgAnger || 0);
        const energy = parseFloat(stats.avgEnergy || 100) / 100;

        // 1. Scale Filter Cutoff (Fear)
        const cutoff = 20000 - (fear * 18000);
        this.lowPass.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.1);

        // 2. Heartbeat Tempo (Arousal - Fear + Anger)
        const arousal = Math.min(1.0, fear + anger * 0.5);
        this.updateHeartbeat(arousal);

        // 3. Shepard Tone Intensity (Suspense & Aggression)
        this.updateShepardTone(fear, anger);

        // 4. Energy-based Infrasound (Breathing)
        if (this.infraGain) {
            const breathingRate = 0.5 + (1.0 - energy) * 2.0;
            this.infraGain.gain.setTargetAtTime(0.1 + (1.0 - energy) * 0.2, this.ctx.currentTime, 0.1);
        }
    }

    updateShepardTone(fearIndex, angerIndex) {
        const time = this.ctx.currentTime;
        const volume = (fearIndex * 0.1) + (angerIndex * 0.05);

        this.shepardGains.forEach((gain, i) => {
            const baseFreq = angerIndex > 0.5 ? 220 : 440; // Drop pitch for anger
            const speed = 0.05 + fearIndex * 0.2 + angerIndex * 0.1;
            const offset = (time * speed + i / this.shepardCount) % 1;
            const freq = baseFreq * Math.pow(2, offset * this.shepardCount - this.shepardCount / 2);
            
            this.shepardOscillators[i].frequency.setTargetAtTime(freq, time, 0.1);
            const edgeFade = Math.sin(offset * Math.PI);
            gain.gain.setTargetAtTime(volume * edgeFade, time, 0.1);
        });
    }

    updateHeartbeat(fearIndex) {
        // Clear existing interval
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        // Map fear 0-1 to BPM 60-160
        const bpm = 60 + (fearIndex * 100);
        const ms = (60 / bpm) * 1000;

        this.heartbeatInterval = setInterval(() => {
            this.playThump();
        }, ms);
    }

    playThump() {
        if (!this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    stop() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.infraOsc) this.infraOsc.stop();
        if (this.ctx) this.ctx.close();
        this.isStarted = false;
    }
}
