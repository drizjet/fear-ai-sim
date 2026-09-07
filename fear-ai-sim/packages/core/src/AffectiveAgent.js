/**
 * AffectiveAgent - Core intelligent agent affective state machine.
 * Fuses Big-Five (OCEAN) personality traits, PAD emotional vectors,
 * deterministic FearCore hysteresis, habituation, trauma memory, and semantic action intents.
 */

import { FearCore } from './FearCore.js';
import { HabituationSystem } from './HabituationSystem.js';
import { IntentResolver } from './IntentResolver.js';
import { PsychoacousticSynthesizer } from './PsychoacousticSynthesizer.js';

export const DEFAULT_TRAITS = Object.freeze({
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.5,
    fear: 0.5,
    curiosity: 0.5,
    leadership: 0.5,
    resilience: 0.5
});

export class AffectiveAgent {
    /**
     * @param {string} id - Unique agent identifier
     * @param {object} [traits={}] - Personality profile (OCEAN & behavioral traits)
     * @param {object} [options={}] - Configuration options
     */
    constructor(id, traits = {}, options = {}) {
        this.id = String(id || 'agent_0');
        this.name = options.name || this.id;

        // Personality profile
        this.traits = {
            ...DEFAULT_TRAITS,
            ...(traits || {})
        };

        // Spatial state (reported by host game)
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.z = options.z ?? 0;
        this.lastVelocity = { x: 0, y: 0, z: 0 };

        // Physiological & Psychological status
        this.energy = options.energy ?? 1.0;
        this.health = options.health ?? 1.0;
        this.morale = options.morale ?? 1.0;
        this.adrenaline = 0.0;
        this.uncertainty = 0.5;

        // PAD Emotional Model Coordinates
        // Pleasure/Valence: -1.0 (terror/despair) to +1.0 (calm/euphoria)
        // Arousal: 0.0 (lethargic) to 1.0 (hyper-aroused)
        // Dominance: 0.0 (submissive/helpless) to 1.0 (empowered/dominant)
        this.valence = 0.5;
        this.arousal = 0.1;
        this.currentDominance = 0.5;

        // Fear & Anger levels in [0, 1]
        this.currentFear = 0.0;
        this.currentAnger = 0.0;

        // Subsystems
        this.fearCore = new FearCore(options.fearCoreConfig || {});
        this.habituation = new HabituationSystem(options.habituationConfig || {});

        // History trace
        this.tickCount = 0;
        this.lastResult = null;
    }

    /**
     * Scale 0..1 fear to FearCore's 0..5 raw fear threshold scale
     * (PANIC threshold is 3.8)
     */
    _fearScale(normalizedFear) {
        return Math.max(0, normalizedFear * 4.2);
    }

    /**
     * Advance agent affective state by one simulation tick
     * @param {number} dt - Elapsed seconds (e.g. 0.016 for 60Hz)
     * @param {object} [observations={}] - Host game sensory snapshot
     * @param {object} [context={}] - World context (trauma, contagion, pacing, rng)
     * @returns {object} AgentAffectiveStateOutput
     */
    tick(dt = 0.016, observations = {}, context = {}) {
        this.tickCount++;

        const rng = typeof context.rng === 'function' ? context.rng : Math.random;
        const pacingIntensity = context.pacingIntensity ?? 1.0;
        const contagionFear = context.contagionFear ?? 0.0;
        const leaderCalm = context.leaderCalm ?? 0.0;
        const traumaDread = context.traumaDread ?? 0.0;

        // 1. Update Spatial Coordinates if supplied by host
        if (typeof observations.x === 'number') this.x = observations.x;
        if (typeof observations.y === 'number') this.y = observations.y;
        if (typeof observations.z === 'number') this.z = observations.z;
        if (observations.velocity) {
            this.lastVelocity = {
                x: observations.velocity.x ?? 0,
                y: observations.velocity.y ?? 0,
                z: observations.velocity.z ?? 0
            };
        }
        if (typeof observations.energy === 'number') this.energy = Math.max(0, Math.min(1.0, observations.energy));
        if (typeof observations.health === 'number') this.health = Math.max(0, Math.min(1.0, observations.health));

        // 2. Evaluate Stimuli & Perceived Threats
        const threats = observations.threats || [];
        const sounds = observations.sounds || [];
        let rawThreatSum = 0;

        for (let i = 0; i < threats.length; i++) {
            const threat = threats[i];
            const dist = Math.max(0.1, threat.distance ?? Math.hypot(
                (threat.x ?? 0) - this.x,
                (threat.y ?? 0) - this.y,
                (threat.z ?? 0) - this.z
            ));
            const intensity = threat.intensity ?? 1.0;
            const occlusion = threat.occluded ? 0.35 : 1.0;
            const distanceAtten = 1.0 / (1.0 + dist * 0.05);

            // Habituate threat
            const habituated = this.habituation.getEffectiveFear(
                intensity,
                threat.type || 'PREDATOR',
                threat.id || null,
                this.tickCount
            );

            rawThreatSum += habituated * distanceAtten * occlusion;
        }

        // Auditory stimuli
        for (let i = 0; i < sounds.length; i++) {
            const sound = sounds[i];
            const dist = Math.max(0.1, sound.distance ?? 10);
            const intensity = sound.intensity ?? 0.5;
            const distanceAtten = 1.0 / (1.0 + dist * 0.08);

            const habituated = this.habituation.getEffectiveFear(
                intensity,
                sound.type || 'SOUND',
                sound.id || null,
                this.tickCount
            );

            rawThreatSum += habituated * distanceAtten * 0.6;
        }

        // 3. OCEAN Trait Modulation & Threat Weighting
        const neuroticismMod = 0.5 + this.traits.neuroticism * 0.9;
        const extraversionMod = 0.5 + this.traits.extraversion * 0.5;

        // Acute close threats (< 20m) break through narrative pacing filters
        const effectivePacing = (threats.length > 0 && (threats[0].distance ?? 10) < 20)
            ? Math.max(1.0, pacingIntensity)
            : pacingIntensity;

        let totalPerceivedThreat = (rawThreatSum * neuroticismMod * effectivePacing)
            + (traumaDread * 0.8 * neuroticismMod)
            + (contagionFear * extraversionMod)
            - (leaderCalm * 0.7);

        totalPerceivedThreat = Math.max(0, totalPerceivedThreat);

        // 4. Update Dominance
        const agentPower = (this.energy * 0.5) + (this.health * 0.5) + (this.traits.resilience * 0.3);
        const threatPower = (threats.length * 1.2) + totalPerceivedThreat + (traumaDread * 0.5) + 0.1;
        this.currentDominance = Math.max(0, Math.min(1.0, agentPower / (agentPower + threatPower)));

        // 5. Fear Dynamics: Decay and Integration
        const fearDecayRate = Math.min(0.98, 0.92 + (this.traits.neuroticism * 0.05));
        const fearInput = totalPerceivedThreat * (0.4 + this.traits.fear * 0.8);

        if (threats.length > 0 || contagionFear > 0.4 || traumaDread > 0.4) {
            // Sustained threat presence builds acute fear
            this.currentFear = Math.min(1.0, Math.max(this.currentFear + 0.08, fearInput));
        } else {
            this.currentFear = Math.max(0, this.currentFear * Math.pow(fearDecayRate, dt / 0.016));
        }

        // 6. Anger / Fight Response Dynamics
        // Anger only grows when actively provoked or facing rivals, never during calm resting
        if (observations.provoked || observations.hasRivals) {
            this.currentAnger = Math.min(1.0, this.currentAnger + 0.05 * (dt / 0.016));
        } else if (threats.length > 0) {
            // Predatory threat suppresses anger in favor of survival fear
            this.currentAnger *= 0.85;
        } else {
            this.currentAnger *= 0.95;
        }

        // 7. Update Adrenaline & Morale
        if (this.currentFear > 0.6 || this.currentAnger > 0.6) {
            this.adrenaline = Math.min(1.0, this.adrenaline + 0.08 * (dt / 0.016));
        } else {
            this.adrenaline = Math.max(0.0, this.adrenaline - 0.02 * (dt / 0.016));
        }

        if (observations.inSafeHaven) {
            this.morale = Math.min(1.0, this.morale + 0.03 * (dt / 0.016));
            this.currentFear *= 0.85;
        } else if (threats.length > 0) {
            this.morale = Math.max(0.1, this.morale - 0.02 * (dt / 0.016));
        }

        // 8. Update PAD Vector
        this.arousal = Math.max(0, Math.min(1.0, this.currentFear * 0.7 + this.adrenaline * 0.3));
        this.valence = Math.max(-1.0, Math.min(1.0, (1.0 - this.currentFear * 1.8) + (this.morale * 0.3)));

        // 9. Update FearCore State Machine
        const fearContext = {
            currentAnger: this.currentAnger,
            morale: this.morale,
            threats: threats.length,
            skill: this.traits.resilience,
            obstacleAhead: Boolean(observations.obstacleAhead),
            obstaclePresent: Boolean(observations.obstaclePresent),
            rng
        };

        const coreResult = this.fearCore.update(this._fearScale(this.currentFear), fearContext);

        // 10. Resolve Action Intent & Audio Hints
        const actionIntent = IntentResolver.resolveIntent(this, observations);
        const audioHints = PsychoacousticSynthesizer.computeAudioHints({
            rawFear: this.currentFear,
            arousal: this.arousal,
            valence: this.valence,
            dominance: this.currentDominance,
            adrenaline: this.adrenaline,
            energy: this.energy,
            state: coreResult.state
        });

        // 11. Habituation tick
        this.habituation.tick(1);

        const result = {
            agent_id: this.id,
            tick: this.tickCount,
            fear_band: coreResult.state,
            affective_state: {
                valence: parseFloat(this.valence.toFixed(3)),
                arousal: parseFloat(this.arousal.toFixed(3)),
                dominance: parseFloat(this.currentDominance.toFixed(3)),
                raw_fear: parseFloat(this.currentFear.toFixed(3)),
                adrenaline: parseFloat(this.adrenaline.toFixed(3)),
                morale: parseFloat(this.morale.toFixed(3))
            },
            action_intent: actionIntent,
            audio_hints: audioHints,
            debug_trace: {
                previous_band: coreResult.previousState,
                transition_reason: coreResult.reason,
                panic_locked: coreResult.panicLocked,
                panic_locked_until: coreResult.panicLockedUntil
            }
        };

        this.lastResult = result;
        return result;
    }

    getState() {
        return {
            id: this.id,
            name: this.name,
            traits: { ...this.traits },
            x: this.x,
            y: this.y,
            z: this.z,
            lastVelocity: { ...this.lastVelocity },
            energy: this.energy,
            health: this.health,
            morale: this.morale,
            adrenaline: this.adrenaline,
            uncertainty: this.uncertainty,
            valence: this.valence,
            arousal: this.arousal,
            currentDominance: this.currentDominance,
            currentFear: this.currentFear,
            currentAnger: this.currentAnger,
            tickCount: this.tickCount,
            fearCore: this.fearCore.getState(),
            habituation: this.habituation.getState()
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        this.id = snapshot.id || this.id;
        this.name = snapshot.name || this.name;
        if (snapshot.traits) this.traits = { ...snapshot.traits };
        this.x = snapshot.x ?? this.x;
        this.y = snapshot.y ?? this.y;
        this.z = snapshot.z ?? this.z;
        if (snapshot.lastVelocity) this.lastVelocity = { ...snapshot.lastVelocity };
        this.energy = snapshot.energy ?? 1.0;
        this.health = snapshot.health ?? 1.0;
        this.morale = snapshot.morale ?? 1.0;
        this.adrenaline = snapshot.adrenaline ?? 0.0;
        this.uncertainty = snapshot.uncertainty ?? 0.5;
        this.valence = snapshot.valence ?? 0.5;
        this.arousal = snapshot.arousal ?? 0.1;
        this.currentDominance = snapshot.currentDominance ?? 0.5;
        this.currentFear = snapshot.currentFear ?? 0.0;
        this.currentAnger = snapshot.currentAnger ?? 0.0;
        this.tickCount = snapshot.tickCount ?? 0;
        if (snapshot.fearCore) this.fearCore.setState(snapshot.fearCore);
        if (snapshot.habituation) this.habituation.setState(snapshot.habituation);
    }
}

export default AffectiveAgent;
