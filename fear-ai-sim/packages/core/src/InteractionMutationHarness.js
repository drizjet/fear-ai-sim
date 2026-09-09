/**
 * @file InteractionMutationHarness.js — Sections CCXXXI-CCXXXII:
 * lesion sensitivity proofs for joint behavior.
 *
 * Each experiment runs a baseline joint composition, then re-runs it with
 * one interaction feed cut (black-box: inputs changed, never monkey-patched
 * internals) and asserts the outcome degrades in the predicted direction.
 * A benchmark that cannot tell the lesioned run from the intact run is
 * insensitive by construction — this harness proves ours can.
 *
 * Lesions:
 * - leader-calming: calm high-leadership leader removed -> rally count drops.
 * - route-danger: incident feed cut -> trade utility stops demoting danger.
 * - trauma-dread: recalled dread zeroed -> live fear appraisal drops.
 * - perception-noise: heavy sensor degradation raises uncertainty.
 * - belief-contradiction: clear-sight disconfirmation lowers confidence.
 * - misinformation-trust: corrected false rumor costs origin trust.
 */
import { AffectiveAgent } from './AffectiveAgent.js';
import { LayeredMemorySystem } from './LayeredMemorySystem.js';
import { GroupContagionSystem, GROUP_TYPES, GROUP_DOCTRINES } from './GroupContagionSystem.js';
import { CivilizationSimulationSystem } from './CivilizationSimulationSystem.js';
import { PerceptionRobustnessEngine } from './PerceptionRobustnessEngine.js';
import { EpistemicBeliefEngine } from './EpistemicBeliefEngine.js';
import { MisinformationCascadeHarness } from './MisinformationCascadeHarness.js';
function rallyCount(leaderLeadership) {
    const groups = new GroupContagionSystem();
    const ids = ['chief', 'm1', 'm2', 'm3'];
    groups.createGroup('squad', GROUP_TYPES.SQUAD, GROUP_DOCTRINES.DISCIPLINED_STAND, 'chief', ids);
    // Single-factor lesion: the same calm, present leader either commands
    // respect (0.95, rallies) or does not (0.20, ignored). No panic, no
    // removal, no cohesion shatter — only the calming channel is cut.
    const states = [
        { id: 'chief', fear: 0.15, fearBand: 'CALM', isPanicking: false, traits: { leadership: leaderLeadership } },
        { id: 'm1', fear: 0.85, fearBand: 'PANIC', isPanicking: true, traits: { leadership: 0.3 } },
        { id: 'm2', fear: 0.85, fearBand: 'PANIC', isPanicking: true, traits: { leadership: 0.3 } },
        { id: 'm3', fear: 0.1, fearBand: 'CALM', isPanicking: false, traits: { leadership: 0.5 } }
    ];
    return groups.evaluateGroup('squad', states).rallied.length;
}

function routeDrop(recordIncident) {
    const civ = new CivilizationSimulationSystem();
    civ.registerNode('oakhaven', { x: 0, y: 0, z: 0 });
    civ.registerNode('riverbend', { x: 100, y: 0, z: 0 });
    civ.registerRoute('oak-river', { fromNodeId: 'oakhaven', toNodeId: 'riverbend' });
    const before = civ.rankTradeRoutes('oakhaven', 'riverbend')[0]?.utility ?? null;
    if (recordIncident) civ.recordRouteIncident('oak-river', 'AMBUSH', 0.9);
    const after = civ.rankTradeRoutes('oakhaven', 'riverbend')[0]?.utility ?? null;
    return { before, after };
}

function fearedWithDread(dread) {
    const mem = new LayeredMemorySystem();
    mem.recordTrauma('SPATIAL', 'gate', 0.9, { x: 0, y: 0, z: 0 }, 50);
    const agent = new AffectiveAgent('guard', { neuroticism: 0.5, resilience: 0.5 });
    return agent.tick(
        0.016,
        { threats: [{ distance: 8.0, intensity: 0.7 }] },
        { traumaDread: dread }
    ).affective_state.raw_fear;
}

export class InteractionMutationHarness {
    lesionLeaderCalming() {
        const baseline = rallyCount(0.95);
        const lesioned = rallyCount(0.20);
        return { lesion: 'leader-calming', baseline, lesioned, degraded: lesioned < baseline };
    }

    lesionRouteDanger() {
        const intact = routeDrop(true);
        const lesioned = routeDrop(false);
        const baselineDrop = intact.before - intact.after;
        const lesionedDrop = lesioned.before - lesioned.after;
        return {
            lesion: 'route-danger',
            baselineDrop,
            lesionedDrop,
            degraded: lesionedDrop < baselineDrop && baselineDrop > 0
        };
    }

    lesionTraumaDread() {
        const mem = new LayeredMemorySystem();
        mem.recordTrauma('SPATIAL', 'gate', 0.9, { x: 0, y: 0, z: 0 }, 50);
        mem.tickCount = 10;
        const dread = mem.getTraumaDread({ x: 5, y: 0, z: 0 });
        const baseline = fearedWithDread(dread);
        const lesioned = fearedWithDread(0);
        return { lesion: 'trauma-dread', baseline, lesioned, degraded: lesioned < baseline };
    }

    lesionPerceptionNoise() {
        const obs = { visual: { intensity: 0.8 }, audio: { loudness: 0.7 } };
        const clean = new PerceptionRobustnessEngine({ seed: 7 });
        const noisy = new PerceptionRobustnessEngine({ seed: 7 });
        noisy.setProfile('scout', { noiseStd: 0.6, occlusion: 0.8, dropoutPeriod: 3, falseNegativeRate: 0.5 });
        let cleanUncertainty = 0;
        let noisyUncertainty = 0;
        for (let t = 0; t < 10; t++) {
            cleanUncertainty += clean.perceive('scout', t, obs).uncertainty;
            noisyUncertainty += noisy.perceive('scout', t, obs).uncertainty;
        }
        return {
            lesion: 'perception-noise',
            baseline: cleanUncertainty / 10,
            lesioned: noisyUncertainty / 10,
            degraded: noisyUncertainty > cleanUncertainty
        };
    }

    lesionBeliefContradiction() {
        const threat = [{ id: 'orc-1', x: 10, y: 0, distance: 10, intensity: 0.8 }];
        const confirmed = new EpistemicBeliefEngine('a', {});
        confirmed.observeDirect({ threats: threat });
        confirmed.observeDirect({ threats: threat });
        const contradicted = new EpistemicBeliefEngine('b', {});
        contradicted.observeDirect({ threats: threat });
        contradicted.observeDirect({ threats: [], clearZoneRadius: 50, agentX: 10, agentY: 0 });
        const cConf = confirmed.threatBeliefs.get('orc-1')?.confidence ?? 0;
        const xConf = contradicted.threatBeliefs.get('orc-1')?.confidence ?? 0;
        return {
            lesion: 'belief-contradiction',
            baseline: cConf,
            lesioned: xConf,
            degraded: xConf < cConf && contradicted.contradictionLog.length > 0
        };
    }

    lesionMisinformationTrust() {
        const exp = new MisinformationCascadeHarness().runExperiment({ agents: 8, ticks: 8, seed: 4242 });
        return {
            lesion: 'misinformation-trust',
            baseline: exp.trueArm.trustLoss,
            lesioned: exp.falseArm.trustLoss,
            degraded: exp.trustAsymmetry > 0 && exp.verdict === 'CASCADE_WITH_TRUST_COST'
        };
    }

    runAll() {
        const experiments = [
            this.lesionLeaderCalming(),
            this.lesionRouteDanger(),
            this.lesionTraumaDread(),
            this.lesionPerceptionNoise(),
            this.lesionBeliefContradiction(),
            this.lesionMisinformationTrust()
        ];
        return {
            experiments,
            detected: experiments.filter((e) => e.degraded).length,
            total: experiments.length,
            allDetected: experiments.every((e) => e.degraded)
        };
    }
}

export default InteractionMutationHarness;
