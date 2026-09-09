/**
 * @file MemoryPathologyBattery.js — Section XVII: adversarial memory tests.
 *
 * Exercises LayeredMemorySystem guarantees the consolidation pathology suite
 * does not cover: reinforcement saturation, duplicate storms, trauma
 * runaway, memory explosion bounds, entity rename coherence, semantic flip
 * oscillation, flashbulb retention of the important, and decay of trivia.
 *
 * Each probe returns { probe, pass, observed, expected }. Deterministic:
 * no RNG; fixed ticks, ids, and payloads.
 */

import { LayeredMemorySystem } from './LayeredMemorySystem.js';

function result(probe, pass, observed, expected) {
    return { probe, pass: Boolean(pass), observed, expected };
}

export const MEMORY_PATHOLOGY_PROBES = Object.freeze([
    'duplicate-storm',
    'reinforcement-saturation',
    'trauma-runaway',
    'memory-explosion',
    'entity-rename',
    'semantic-flip',
    'flashbulb-retention',
    'trivia-decay'
]);

export class MemoryPathologyBattery {
    /**
     * @param {object} [config={}] - LayeredMemorySystem config overrides
     */
    constructor(config = {}) {
        this.config = { ...config };
    }

    runAll() {
        const probes = [
            this.probeDuplicateStorm(),
            this.probeReinforcementSaturation(),
            this.probeTraumaRunaway(),
            this.probeMemoryExplosion(),
            this.probeEntityRename(),
            this.probeSemanticFlip(),
            this.probeFlashbulbRetention(),
            this.probeTriviaDecay()
        ];
        return {
            probes,
            passCount: probes.filter((p) => p.pass).length,
            probeCount: probes.length,
            allPass: probes.every((p) => p.pass)
        };
    }

    /** Same event at same tick 20x -> single entry, salience capped at 1. */
    probeDuplicateStorm() {
        const sys = new LayeredMemorySystem(this.config);
        let id = null;
        for (let i = 0; i < 20; i++) {
            id = sys.recordEpisodic({ type: 'COMBAT_CONFRONTATION', salience: 0.5, participants: ['orc-1'], tick: 10 });
        }
        const match = sys.episodic.filter((e) => e.type === 'COMBAT_CONFRONTATION');
        return result('duplicate-storm',
            match.length === 1 && match[0].salience <= 1.0,
            `entries=${match.length} salience=${match[0]?.salience?.toFixed(2)} id=${id}`,
            'entries=1 salience<=1.00');
    }

    /** Repeated reinforce() never exceeds salience 1. */
    probeReinforcementSaturation() {
        const sys = new LayeredMemorySystem(this.config);
        const id = sys.recordEpisodic({ type: 'SURVIVED_AMBUSH', salience: 0.5, tick: 1 });
        for (let i = 0; i < 50; i++) sys.reinforce(id, 0.2);
        const mem = sys.episodic.find((e) => e.id === id);
        return result('reinforcement-saturation',
            mem && mem.salience === 1.0,
            `salience=${mem?.salience}`,
            'salience=1');
    }

    /** Repeated trauma reinforcement caps at 1 and still decays to removal. */
    probeTraumaRunaway() {
        const sys = new LayeredMemorySystem(this.config);
        for (let i = 0; i < 30; i++) sys.recordTrauma('ENTITY', 'dreadlord', 1.0);
        const tr = sys.trauma.find((t) => t.cueValue === 'dreadlord');
        const capped = tr && tr.dreadIntensity <= 1.0;
        sys.tick(20000);
        const gone = !sys.trauma.some((t) => t.cueValue === 'dreadlord');
        return result('trauma-runaway',
            capped && gone,
            `capped=${capped} decayedAway=${gone}`,
            'capped=true decayedAway=true');
    }

    /** 500 episodic inserts respect maxEpisodicEntries bound. */
    probeMemoryExplosion() {
        const sys = new LayeredMemorySystem({ ...this.config, maxEpisodicEntries: 50 });
        for (let i = 0; i < 500; i++) {
            sys.recordEpisodic({ type: 'RESOURCE_DISCOVERED', salience: 0.1 + (i % 10) / 20, participants: [`npc-${i}`], tick: i });
        }
        return result('memory-explosion',
            sys.episodic.length <= 50,
            `entries=${sys.episodic.length}`,
            'entries<=50');
    }

    /** purge + re-record under new id keeps memory coherent, drops stale id. */
    probeEntityRename() {
        const sys = new LayeredMemorySystem(this.config);
        sys.recordEpisodic({ type: 'ABANDONED_BY_PEER', salience: 0.7, participants: ['guard-old'], tick: 5 });
        sys.recordTrauma('ENTITY', 'guard-old', 0.8);
        sys.purgeEntityReferences('guard-old');
        sys.recordEpisodic({ type: 'REASSURED_BY_LEADER', salience: 0.7, participants: ['guard-new'], tick: 6 });
        const staleEp = sys.episodic.some((e) => e.participants.includes('guard-old'));
        const staleTr = sys.trauma.some((t) => t.cueValue === 'guard-old');
        const fresh = sys.episodic.some((e) => e.participants.includes('guard-new'));
        return result('entity-rename',
            !staleEp && !staleTr && fresh,
            `staleEpisodic=${staleEp} staleTrauma=${staleTr} fresh=${fresh}`,
            'staleEpisodic=false staleTrauma=false fresh=true');
    }

    /** Rapid category flips resolve to latest higher-confidence claim, one entry. */
    probeSemanticFlip() {
        const sys = new LayeredMemorySystem(this.config);
        const loc = { x: 0, y: 0, z: 0 };
        sys.recordSemantic('crossroads', 'HAZARD', loc, 0.6, {}, 1);
        sys.recordSemantic('crossroads', 'SANCTUARY', loc, 0.7, {}, 2);
        sys.recordSemantic('crossroads', 'HAZARD', loc, 0.9, {}, 3);
        const entry = sys.semantic.get('crossroads');
        return result('semantic-flip',
            sys.semantic.size === 1 && entry.category === 'HAZARD' && entry.confidence === 0.9,
            `size=${sys.semantic.size} category=${entry?.category} conf=${entry?.confidence}`,
            'size=1 category=HAZARD conf=0.9');
    }

    /** Flashbulb (salience>=0.8) survives 1000 ticks; still present. */
    probeFlashbulbRetention() {
        const sys = new LayeredMemorySystem(this.config);
        sys.recordEpisodic({ type: 'NEAR_DEATH_PANIC', salience: 0.95, arousal: 1.0, valence: -1.0, tick: 1 });
        sys.tick(1000);
        const kept = sys.episodic.some((e) => e.type === 'NEAR_DEATH_PANIC');
        return result('flashbulb-retention', kept, `retained=${kept}`, 'retained=true');
    }

    /** Trivia (salience 0.1) is forgotten well before 1000 ticks. */
    probeTriviaDecay() {
        const sys = new LayeredMemorySystem(this.config);
        sys.recordEpisodic({ type: 'RESOURCE_DISCOVERED', salience: 0.1, arousal: 0.1, tick: 1 });
        sys.tick(1000);
        const gone = !sys.episodic.some((e) => e.type === 'RESOURCE_DISCOVERED');
        return result('trivia-decay', gone, `forgotten=${gone}`, 'forgotten=true');
    }
}

export default MemoryPathologyBattery;
