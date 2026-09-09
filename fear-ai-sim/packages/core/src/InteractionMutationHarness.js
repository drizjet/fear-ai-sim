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
 *
 * Deterministic. Advisory-only. Zero engine source changes by design.
 */

import { AffectiveAgent } from './AffectiveAgent.js';
import { LayeredMemorySystem } from './LayeredMemorySystem.js';
import { GroupContagionSystem, GROUP_TYPES, GROUP_DOCTRINES } from './GroupContagionSystem.js';
import { CivilizationSimulationSystem } from './CivilizationSimulationSystem.js';
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

    runAll() {
        const experiments = [
            this.lesionLeaderCalming(),
            this.lesionRouteDanger(),
            this.lesionTraumaDread()
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
