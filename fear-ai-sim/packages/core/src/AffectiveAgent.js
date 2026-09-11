/**
 * AffectiveAgent - Core intelligent agent affective state machine.
 * Fuses Big-Five (OCEAN) personality traits, PAD emotional vectors,
 * deterministic FearCore hysteresis, habituation, trauma memory, and semantic action intents.
 */

import { FearCore } from './FearCore.js';
import { HabituationSystem } from './HabituationSystem.js';
import { IntentResolver } from './IntentResolver.js';
import { PsychoacousticSynthesizer } from './PsychoacousticSynthesizer.js';
import { DeterministicRng } from './DeterministicRng.js';

let AGENT_FALLBACK_RNG_COUNTER = 0;
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
        // Deterministic fallback RNG (CCIII red-team fix): Math.random as a
        // default made identical cross-process runs diverge on PANIC/FREEZE
        // branches. Seed derives from id plus construction order, so replay
        // with the same construction sequence is bit-identical.
        this.fallbackSeed = options.seed ?? `${this.id}#${AGENT_FALLBACK_RNG_COUNTER++}`;
        this._defaultRng = new DeterministicRng(this.fallbackSeed);
        this._defaultRngFn = () => this._defaultRng.random();

        // Personality profile with defensive numeric clamping
        const sanitizeTrait = (val, fallback) => {
            if (typeof val === 'number') {
                if (Number.isNaN(val)) return fallback;
                if (val > 1.0) return 1.0;
                if (val < 0.0) return 0.0;
                return val;
            }
            return fallback;
        };

        this.traits = {
            fear: sanitizeTrait(traits?.fear, DEFAULT_TRAITS.fear),
            neuroticism: sanitizeTrait(traits?.neuroticism, DEFAULT_TRAITS.neuroticism),
            resilience: sanitizeTrait(traits?.resilience, DEFAULT_TRAITS.resilience),
            leadership: sanitizeTrait(traits?.leadership, DEFAULT_TRAITS.leadership),
            openness: sanitizeTrait(traits?.openness, DEFAULT_TRAITS.openness),
            conscientiousness: sanitizeTrait(traits?.conscientiousness, DEFAULT_TRAITS.conscientiousness),
            extraversion: sanitizeTrait(traits?.extraversion, DEFAULT_TRAITS.extraversion),
            agreeableness: sanitizeTrait(traits?.agreeableness, DEFAULT_TRAITS.agreeableness),
            curiosity: sanitizeTrait(traits?.curiosity ?? traits?.openness, DEFAULT_TRAITS.curiosity)
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

        // Subsystem configuration & ablation flags
        this.enableHabituation = options.enableHabituation ?? true;
        this.enablePsychoacoustics = options.enablePsychoacoustics ?? true;
        this.enableOCEAN = options.enableOCEAN ?? true;
        this.enableHysteresis = options.enableHysteresis ?? true;

        if (!this.enableOCEAN) {
            for (const key of Object.keys(this.traits)) {
                this.traits[key] = 0.5;
            }
        }

        const fearCoreConfig = { ...(options.fearCoreConfig || {}) };
        if (fearCoreConfig.seed === undefined) fearCoreConfig.seed = this.fallbackSeed;
        if (!this.enableHysteresis) {
            fearCoreConfig.panicLockTicks = 0;
            fearCoreConfig.exit = {
                CALM: fearCoreConfig.enter?.ALERT ?? 0.8,
                ALERT: fearCoreConfig.enter?.ANXIOUS ?? 1.4,
                ANXIOUS: fearCoreConfig.enter?.PANIC ?? 3.8
            };
        }

        // Subsystems
        this.fearCore = new FearCore(fearCoreConfig);
        this.habituation = new HabituationSystem(options.habituationConfig || {});
        // NEXT-114: opt-in identity-architecture attachment (wire-or-retire
        // triage execution). A CharacterIdentityArchitecture instance may be
        // supplied via options.identityArchitecture with a blend weight in
        // [0,1] (default 0 = fully detached, bit-identical legacy behavior).
        // When attached, agent OCEAN+resilience traits seed the CIA identity
        // (riskTolerance/socialOrientation/loyalty default from fear,
        // extraversion, agreeableness; options.identityTraits overrides).
        // CIA output only modulates resolved intent urgency (never movement,
        // damage, or host state) and is exposed as result.identity_frame.
        this.identityArch = options.identityArchitecture ?? null;
        const rawBlend = Number(options.identityBlend ?? 0);
        this.identityBlend = Number.isFinite(rawBlend)
            ? Math.max(0, Math.min(1, rawBlend))
            : 0;
        // NEXT-130 (CCI-28 frontier 14): adaptive gain scheduling. 'fixed'
        // (default) holds the blend weight constant; 'threat-compression'
        // scales it down as immediate state pressure rises, so identity
        // speaks loudest in weak/ambiguous situations and yields to
        // survival pressure under extreme threat (situation-strength).
        const sched = options.identityGainSchedule ?? 'fixed';
        this.identityGainSchedule = sched === 'threat-compression' ? 'threat-compression' : 'fixed';
        const rawComp = Number(options.identityCompression ?? 0.8);
        this.identityCompression = Number.isFinite(rawComp)
            ? Math.max(0, Math.min(1, rawComp))
            : 0.8;
        if (this.identityArch) {
            const override = options.identityTraits || {};
            const identitySeed = {
                openness: this.traits.openness,
                conscientiousness: this.traits.conscientiousness,
                extraversion: this.traits.extraversion,
                agreeableness: this.traits.agreeableness,
                neuroticism: this.traits.neuroticism,
                riskTolerance: 1 - this.traits.fear,
                socialOrientation: this.traits.extraversion,
                loyalty: this.traits.agreeableness,
                leadership: this.traits.leadership,
                resilience: this.traits.resilience,
                ...override
            };
            try {
                this.identityArch.registerCharacter(this.id, identitySeed, {
                    constraints: Array.isArray(options.identityConstraints)
                        ? options.identityConstraints
                        : [],
                    role: typeof options.identityRole === 'string' ? options.identityRole : ''
                });
            } catch (err) {
                // Shared architecture across re-constructed agents: reuse the
                // existing registration instead of failing construction.
                if (!String(err?.message || '').startsWith('CHARACTER_ALREADY_REGISTERED')) throw err;
            }
        }
        // NEXT-115: opt-in trauma-engine attachment (wire-or-retire triage
        // execution). A TraumaCrystallizationEngine supplied via
        // options.traumaEngine closes the loop both ways: extreme-fear
        // episodes feed incurTrauma, and crystallized state (phobic dread,
        // resting-fear floor, panic-onset offset) feeds back as the existing
        // traumaDread / panicFearBias inputs via max() so host-supplied
        // values are never reduced. Detached by default (legacy path
        // bit-identical). traumaAdvanceClock lets one attached agent own the
        // shared engine clock; set false when several agents share an engine.
        this.traumaEngine = options.traumaEngine ?? null;
        const rawThreshold = Number(options.traumaFearThreshold ?? 0.85);
        this.traumaFearThreshold = Number.isFinite(rawThreshold)
            ? Math.max(0, Math.min(1, rawThreshold))
            : 0.85;
        const rawRearm = Number(options.traumaRearmDelta ?? 0.2);
        this.traumaRearmDelta = Number.isFinite(rawRearm)
            ? Math.max(0, Math.min(1, rawRearm))
            : 0.2;
        this.traumaAdvanceClock = options.traumaAdvanceClock !== false;
        this._traumaEpisodeOpen = false;
        if (this.traumaEngine && typeof this.traumaEngine.registerAgent === 'function'
            && this.traumaEngine.agentRecords && !this.traumaEngine.agentRecords.has(this.id)) {
            this.traumaEngine.registerAgent(this.id, { ...this.traits });
        }

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
        const safeDt = (typeof dt === 'number' && Number.isFinite(dt) && dt >= 0) ? Math.min(dt, 1.0) : 0.016;

        const rng = typeof context.rng === 'function' ? context.rng : this._defaultRngFn;
        const pacingIntensity = context.pacingIntensity ?? 1.0;
        const contagionFear = context.contagionFear ?? 0.0;
        const leaderCalm = context.leaderCalm ?? 0.0;
        let traumaDread = context.traumaDread ?? 0.0;
        let traumaEngineState = null;

        // 1. Update Spatial Coordinates if supplied by host
        if (typeof observations.x === 'number' && Number.isFinite(observations.x)) this.x = observations.x;
        if (typeof observations.y === 'number' && Number.isFinite(observations.y)) this.y = observations.y;
        if (typeof observations.z === 'number' && Number.isFinite(observations.z)) this.z = observations.z;
        if (observations.velocity) {
            this.lastVelocity = {
                x: Number.isFinite(observations.velocity.x) ? observations.velocity.x : 0,
                y: Number.isFinite(observations.velocity.y) ? observations.velocity.y : 0,
                z: Number.isFinite(observations.velocity.z) ? observations.velocity.z : 0
            };
        }
        if (typeof observations.energy === 'number' && Number.isFinite(observations.energy)) {
            this.energy = Math.max(0, Math.min(1.0, observations.energy));
        }
        if (typeof observations.health === 'number' && Number.isFinite(observations.health)) {
            this.health = Math.max(0, Math.min(1.0, observations.health));
        }

        // 2. Evaluate Stimuli & Perceived Threats
        const threats = observations.threats || [];
        const sounds = observations.sounds || [];
        let rawThreatSum = 0;

        for (let i = 0; i < threats.length; i++) {
            const threat = threats[i];
            let dist = 10.0;
            if (typeof threat.distance === 'number' && Number.isFinite(threat.distance) && threat.distance > 0) {
                dist = threat.distance;
            } else {
                const tx = Number.isFinite(threat.x) ? threat.x : this.x;
                const ty = Number.isFinite(threat.y) ? threat.y : this.y;
                const tz = Number.isFinite(threat.z) ? threat.z : this.z;
                const calculated = Math.hypot(tx - this.x, ty - this.y, tz - this.z);
                dist = Math.max(0.1, Number.isFinite(calculated) ? calculated : 10.0);
            }
            const rawIntensity = Number(threat.intensity);
            const intensity = (Number.isFinite(rawIntensity) && rawIntensity >= 0) ? Math.min(1.0, rawIntensity) : 1.0;
            const occlusion = threat.occluded ? 0.35 : 1.0;
            const distanceAtten = 1.0 / (1.0 + dist * 0.05);

            // Habituate threat
            const habituated = this.enableHabituation
                ? this.habituation.getEffectiveFear(
                    intensity,
                    threat.type || 'PREDATOR',
                    threat.id || null,
                    this.tickCount
                )
                : intensity;

            rawThreatSum += habituated * distanceAtten * occlusion;
        }

        // Auditory stimuli
        for (let i = 0; i < sounds.length; i++) {
            const sound = sounds[i];
            let dist = 10.0;
            if (typeof sound.distance === 'number' && Number.isFinite(sound.distance) && sound.distance > 0) {
                dist = sound.distance;
            } else {
                const sx = Number.isFinite(sound.x) ? sound.x : this.x;
                const sy = Number.isFinite(sound.y) ? sound.y : this.y;
                const sz = Number.isFinite(sound.z) ? sound.z : this.z;
                const calculated = Math.hypot(sx - this.x, sy - this.y, sz - this.z);
                dist = Math.max(0.1, Number.isFinite(calculated) ? calculated : 10.0);
            }
            const rawIntensity = Number(sound.intensity);
            const intensity = (Number.isFinite(rawIntensity) && rawIntensity >= 0) ? Math.min(1.0, rawIntensity) : 0.5;
            const distanceAtten = 1.0 / (1.0 + dist * 0.08);

            const habituated = this.enableHabituation
                ? this.habituation.getEffectiveFear(
                    intensity,
                    sound.type || 'SOUND',
                    sound.id || null,
                    this.tickCount
                )
                : intensity;

            // Openness modulates auditory curiosity vs dread (neutral at 0.5 -> 1.0)
            const opennessSoundMod = this.enableOCEAN ? (1.5 - (this.traits.openness ?? 0.5)) : 1.0;
            rawThreatSum += habituated * distanceAtten * 0.6 * opennessSoundMod;
        }
        // 2b. NEXT-115 trauma-engine readback. Crystallized state re-enters
        // through the pre-existing traumaDread / panicFearBias inputs via
        // max(), so host-supplied values are never reduced. Skipped when
        // detached (traumaDread keeps its context value above).
        let traumaPanicBias = 0;
        if (this.traumaEngine && typeof this.traumaEngine.evaluateAgentState === 'function') {
            const cues = [];
            for (const t of threats) {
                cues.push({ category: 'PREDATOR_TYPE', cue: t.type || 'PREDATOR', intensity: t.intensity ?? 1.0 });
            }
            for (const s of sounds) {
                cues.push({ category: 'ENVIRONMENT_CUE', cue: s.type || 'SOUND', intensity: s.intensity ?? 0.5 });
            }
            traumaEngineState = this.traumaEngine.evaluateAgentState(this.id, {
                sensoryCues: cues,
                position: { x: this.x, y: this.y, z: this.z }
            });
            const engineDread = (traumaEngineState.phobicDread || 0)
                + (traumaEngineState.effectiveRestingFear || 0);
            if (engineDread > traumaDread) traumaDread = engineDread;
            traumaPanicBias = traumaEngineState.effectivePanicThresholdOffset || 0;
        }

        // 3. OCEAN Trait Modulation & Threat Weighting
        const neuroticismMod = 0.5 + this.traits.neuroticism * 0.9;
        const extraversionMod = 0.5 + this.traits.extraversion * 0.5;
        // Agreeableness modulates responsiveness to leader reassurance (neutral at 0.5 -> 1.0)
        const agreeablenessMod = this.enableOCEAN ? (0.5 + (this.traits.agreeableness ?? 0.5) * 1.0) : 1.0;

        // Acute close threats (< 20m) break through narrative pacing filters
        const effectivePacing = (threats.length > 0 && (threats[0].distance ?? 10) < 20)
            ? Math.max(1.0, pacingIntensity)
            : pacingIntensity;

        let totalPerceivedThreat = (rawThreatSum * neuroticismMod * effectivePacing)
            + (traumaDread * 0.8 * neuroticismMod)
            + (contagionFear * extraversionMod)
            - (leaderCalm * 0.7 * agreeablenessMod);
        // NEXT-149 (audit candidate 13): heard information feeds fear.
        // Host supplies observations.reportedDanger in [0,1] (e.g. from
        // AnticipatoryFearEngine dread of a rumored threat). Hearsay weighs
        // below direct observation; absent input is legacy exactly.
        const rawReported = Number(observations.reportedDanger ?? 0);
        const reportedDanger = Number.isFinite(rawReported) ? Math.max(0, Math.min(1, rawReported)) : 0;
        totalPerceivedThreat += reportedDanger * 0.6 * neuroticismMod;

        totalPerceivedThreat = Math.max(0, totalPerceivedThreat);

        // 4. Update Dominance (Conscientiousness promotes disciplined composure, neutral at 0.5 -> 0.0)
        const conscientiousnessBonus = this.enableOCEAN ? (((this.traits.conscientiousness ?? 0.5) - 0.5) * 0.2) : 0.0;
        const agentPower = (this.energy * 0.5) + (this.health * 0.5) + (this.traits.resilience * 0.3) + conscientiousnessBonus;
        const threatPower = (threats.length * 1.2) + totalPerceivedThreat + (traumaDread * 0.5) + 0.1;
        this.currentDominance = Math.max(0, Math.min(1.0, agentPower / (agentPower + threatPower)));

        // 5. Fear Dynamics: Decay and Integration
        const resilienceMod = (this.traits.resilience - 0.5) * 0.08;
        const fearDecayRate = Math.min(0.98, Math.max(0.75, 0.92 + (this.traits.neuroticism * 0.05) - resilienceMod));
        const fearInput = totalPerceivedThreat * (0.4 + this.traits.fear * 0.8);

        if (threats.length > 0 || contagionFear > 0.4 || traumaDread > 0.4 || reportedDanger > 0.4 || (sounds.length > 0 && fearInput > 0.15)) {
            // Sustained threat presence or alarming sounds build acute fear
            this.currentFear = Math.min(1.0, Math.max(this.currentFear + 0.05, fearInput));
        } else {
            this.currentFear = Math.max(0, this.currentFear * Math.pow(fearDecayRate, safeDt / 0.016));
        }
        // 5b. NEXT-115 trauma-episode feed. A rising crossing of the fear
        // threshold opens one episode: a single incurTrauma whose severity is
        // the live fear and whose cues are the live threats. Re-arms only
        // after fear falls threshold-minus-hysteresis below, so sustained
        // terror cannot farm traumas tick after tick. Advisory state only.
        let traumaEpisode = false;
        if (this.traumaEngine && typeof this.traumaEngine.incurTrauma === 'function') {
            if (!this._traumaEpisodeOpen && this.currentFear >= this.traumaFearThreshold) {
                this._traumaEpisodeOpen = true;
                traumaEpisode = true;
                const cues = threats.map((t) => ({
                    category: 'PREDATOR_TYPE',
                    cue: t.type || 'PREDATOR'
                }));
                this.traumaEngine.incurTrauma(this.id, {
                    traumaType: observations.betrayed
                        ? 'BETRAYAL_ABANDONMENT'
                        : (observations.hasRivals ? 'MASSACRE_HORROR' : 'NEAR_DEATH_SURVIVAL'),
                    severity: this.currentFear,
                    associatedCues: cues,
                    description: `Live fear episode at tick ${this.tickCount} (fear ${this.currentFear.toFixed(3)})`
                });
            } else if (this._traumaEpisodeOpen
                && this.currentFear < this.traumaFearThreshold - this.traumaRearmDelta) {
                this._traumaEpisodeOpen = false;
            }
            if (this.traumaAdvanceClock && typeof this.traumaEngine.tick === 'function') {
                this.traumaEngine.tick(1);
            }
        }

        // 6. Anger / Fight Response Dynamics
        // Anger only grows when actively provoked or facing rivals, never during calm resting
        if (observations.provoked || observations.hasRivals) {
            this.currentAnger = Math.min(1.0, this.currentAnger + 0.05 * (safeDt / 0.016));
        } else if (threats.length > 0) {
            // Predatory threat suppresses anger in favor of survival fear
            this.currentAnger *= 0.85;
        } else {
            this.currentAnger *= 0.95;
        }

        // 7. Update Adrenaline & Morale
        if (this.currentFear > 0.6 || this.currentAnger > 0.6) {
            this.adrenaline = Math.min(1.0, this.adrenaline + 0.08 * (safeDt / 0.016));
        } else {
            this.adrenaline = Math.max(0.0, this.adrenaline - 0.02 * (safeDt / 0.016));
        }

        if (observations.inSafeHaven) {
            this.morale = Math.min(1.0, this.morale + 0.03 * (safeDt / 0.016));
            this.currentFear *= 0.85;
        } else if (threats.length > 0) {
            this.morale = Math.max(0.1, this.morale - 0.02 * (safeDt / 0.016));
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

        // NOW-17: optional panic-threshold bias (for example crystallized
        // trauma onset offset). Added to the SCALED fear at the threshold
        // only: stored currentFear, decay, contagion, and outputs are
        // untouched. Zero by default; negative values are ignored. Skipped
        // while RECOVERing: recovery completion needs near-zero scaled fear,
        // and any floor or bias would lock RECOVER permanently.
        const recovering = this.fearCore.state === 'RECOVER';
        const panicBias = recovering ? 0 : Math.max(0, Number(context.panicFearBias ?? 0), Number(traumaPanicBias) || 0);
        const coreResult = this.fearCore.update(this._fearScale(this.currentFear) + panicBias * 4.2, fearContext);

        // 10. Resolve Action Intent & Audio Hints
        const actionIntent = IntentResolver.resolveIntent(this, observations);
        // 10b. NEXT-114 opt-in identity blend. CIA tendencies bias the urgency
        // of the already-resolved intent along the matching tendency axis.
        // Skipped entirely when detached or blend is 0 (legacy path untouched).
        let identityFrame = null;
        if (this.identityArch && this.identityBlend > 0) {
            const frame = this.identityArch.tick(this.id, {}, {
                fear: this.currentFear,
                urgency: Number.isFinite(actionIntent.urgency) ? actionIntent.urgency : 0,
                panic: coreResult.state === 'PANIC' ? 1 : 0,
                arousal: this.arousal,
                perceivedDanger: Math.max(0, Math.min(1, totalPerceivedThreat)),
                fatigue: 1 - this.energy,
                groupPanic: Math.max(0, Math.min(1, contagionFear)),
            });
            identityFrame = frame;
            const t = frame.tendencies;
            const axisFor = (type) => {
                if (type === 'FLEE_FROM' || type === 'SEEK_COVER') return t.flee;
                if (type === 'CONFRONT_THREAT') return t.stand;
                if (type === 'APPROACH_ALLY' || type === 'WARN_GROUP') {
                    return Math.max(t.help, t.rally);
                }
                if (type === 'INVESTIGATE_SOUND' || type === 'CAUTIOUS_EXPLORE') return t.investigate;
                return 0.5;
            };
            const axis = axisFor(actionIntent.type);
            const base = Number.isFinite(actionIntent.urgency) ? actionIntent.urgency : 0;
            let appliedGain = this.identityBlend;
            if (this.identityGainSchedule === 'threat-compression') {
                const pressure = frame.layers && Number.isFinite(frame.layers.statePressure)
                    ? frame.layers.statePressure
                    : 0;
                appliedGain = Math.max(0, Math.min(1,
                    this.identityBlend * (1 - pressure * this.identityCompression)));
            }
            actionIntent.urgency = Math.max(0, Math.min(1,
                base + appliedGain * (axis - 0.5) * 0.3));
            identityFrame.appliedGain = Math.round(appliedGain * 10000) / 10000;
            identityFrame.gainSchedule = this.identityGainSchedule;
        }
        const audioHints = this.enablePsychoacoustics
            ? PsychoacousticSynthesizer.computeAudioHints({
                rawFear: this.currentFear,
                arousal: this.arousal,
                valence: this.valence,
                dominance: this.currentDominance,
                adrenaline: this.adrenaline,
                energy: this.energy,
                state: coreResult.state
            })
            : {
                heartbeat_bpm: 60,
                shepard_intensity: 0.0,
                lpf_cutoff_hz: 20000,
                infrasound_mix: 0.0,
                vocalization_hint: 'NONE'
            };

        // 11. Habituation tick
        if (this.enableHabituation) {
            this.habituation.tick(1);
        }

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
                panic_locked_until: coreResult.panicLockedUntil,
                perception_breakdown: {
                    sensory_raw: rawThreatSum,
                    sensory_weighted: rawThreatSum * neuroticismMod * effectivePacing,
                    trauma_weighted: traumaDread * 0.8 * neuroticismMod,
                    contagion_weighted: contagionFear * extraversionMod,
                    leader_calm_weighted: leaderCalm * 0.7 * agreeablenessMod,
                    total_perceived_threat: totalPerceivedThreat
                }
            }
        };
        if (identityFrame) result.identity_frame = identityFrame;
        if (traumaEngineState) {
            result.trauma_frame = {
                episode: traumaEpisode,
                episodeOpen: this._traumaEpisodeOpen,
                isTraumatized: traumaEngineState.isTraumatized,
                phobicDread: traumaEngineState.phobicDread,
                restingFear: traumaEngineState.effectiveRestingFear,
                triggeredPhobias: (traumaEngineState.triggeredPhobias || []).length,
                panicOffset: traumaEngineState.effectivePanicThresholdOffset || 0,
                hasFlashback: traumaEngineState.hasFlashback
            };
        }

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
            habituation: this.habituation.getState(),
            // NEXT-117/NEXT-130: wire-attachment state. Engine instances stay
            // host-owned; config round-trips so a re-attached agent resumes
            // identically (episode latch included: without it a restored
            // mid-episode agent would incur a duplicate trauma).
            identityBlend: this.identityBlend ?? 0,
            identityGainSchedule: this.identityGainSchedule ?? 'fixed',
            identityCompression: this.identityCompression ?? 0.8,
            traumaFearThreshold: this.traumaFearThreshold ?? 0.85,
            traumaRearmDelta: this.traumaRearmDelta ?? 0.2,
            traumaAdvanceClock: this.traumaAdvanceClock !== false,
            traumaEpisodeOpen: this._traumaEpisodeOpen === true
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
        // NEXT-117: wire config plus the trauma episode latch. Instances
        // (identityArch, traumaEngine) are re-attached by the host.
        if (typeof snapshot.identityBlend === 'number') this.identityBlend = snapshot.identityBlend;
        if (snapshot.identityGainSchedule === 'threat-compression' || snapshot.identityGainSchedule === 'fixed') {
            this.identityGainSchedule = snapshot.identityGainSchedule;
        }
        if (typeof snapshot.identityCompression === 'number') this.identityCompression = snapshot.identityCompression;
        if (typeof snapshot.traumaFearThreshold === 'number') this.traumaFearThreshold = snapshot.traumaFearThreshold;
        if (typeof snapshot.traumaRearmDelta === 'number') this.traumaRearmDelta = snapshot.traumaRearmDelta;
        if (typeof snapshot.traumaAdvanceClock === 'boolean') this.traumaAdvanceClock = snapshot.traumaAdvanceClock;
        this._traumaEpisodeOpen = snapshot.traumaEpisodeOpen === true;
    }
}

export default AffectiveAgent;
