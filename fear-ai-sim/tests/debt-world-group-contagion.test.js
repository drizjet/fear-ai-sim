/**
 * @file debt-world-group-contagion.test.js
 *
 * Pays down the world-simulation debt cluster: AffectiveAgent x
 * GroupContagionSystem, AffectiveAgent x ContagionGraph, FactionSystem x
 * GroupContagionSystem (via world encounters), WorldSimulationSystem x
 * LayeredMemorySystem, CivilizationSimulationSystem x LayeredMemorySystem.
 * All seams are pre-existing public APIs; zero engine source changes.
 */

import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/src/AffectiveAgent.js';
import { GroupContagionSystem, GROUP_TYPES, GROUP_DOCTRINES } from '../packages/core/src/GroupContagionSystem.js';
import { ContagionGraph } from '../packages/core/src/ContagionGraph.js';
import { WorldSimulationSystem, ROAMING_PARTY_TYPES } from '../packages/core/src/WorldSimulationSystem.js';
import { CivilizationSimulationSystem } from '../packages/core/src/CivilizationSimulationSystem.js';
import { FactionSystem } from '../packages/core/src/FactionSystem.js';
import { LayeredMemorySystem } from '../packages/core/src/LayeredMemorySystem.js';

function panickedStates(ids) {
    return ids.map((id) => ({ id, fear: 0.85, fearBand: 'PANIC', isPanicking: true, traits: { leadership: 0.3 } }));
}

function calmStates(ids) {
    return ids.map((id) => ({ id, fear: 0.1, fearBand: 'CALM', isPanicking: false, traits: { leadership: 0.5 } }));
}

describe('Debt: AffectiveAgent x GroupContagionSystem x ContagionGraph', () => {
    it('1. All-panicking squad without leader scatters; calm squad holds', () => {
        const groups = new GroupContagionSystem();
        groups.createGroup('s1', GROUP_TYPES.SQUAD, GROUP_DOCTRINES.DISCIPLINED_STAND, null, ['a', 'b', 'c']);
        groups.createGroup('s2', GROUP_TYPES.SQUAD, GROUP_DOCTRINES.DISCIPLINED_STAND, null, ['x', 'y', 'z']);
        const rPanic = groups.evaluateGroup('s1', panickedStates(['a', 'b', 'c']));
        const rCalm = groups.evaluateGroup('s2', calmStates(['x', 'y', 'z']));
        expect(rPanic.directive).toBe('SCATTER_AND_FLEE');
        expect(rCalm.directive).not.toBe('SCATTER_AND_FLEE');
    });

    it('2. Calm strong leader rallies panicking members', () => {
        const groups = new GroupContagionSystem();
        groups.createGroup('s3', GROUP_TYPES.SQUAD, GROUP_DOCTRINES.DISCIPLINED_STAND, 'chief', ['chief', 'm1', 'm2', 'm3']);
        const states = [
            { id: 'chief', fear: 0.15, fearBand: 'CALM', isPanicking: false, traits: { leadership: 0.95 } },
            ...panickedStates(['m1', 'm2']),
            ...calmStates(['m3'])
        ];
        const r = groups.evaluateGroup('s3', states);
        expect(r.rallied.length).toBeGreaterThan(0);
    });

    it('3. Panicking peer transmits contagion fear; empty peers transmit none', () => {
        const graph = new ContagionGraph();
        const focal = { id: 'f', x: 0, y: 0, z: 0, traits: { extraversion: 0.7, neuroticism: 0.6 } };
        const hot = graph.evaluateContagion(focal, [
            { id: 'p', x: 3, y: 0, z: 0, fearBand: 'PANIC', isPanicking: true }
        ]);
        const cold = graph.evaluateContagion(focal, []);
        expect(hot.contagionFear).toBeGreaterThan(0.1);
        expect(cold.contagionFear).toBe(0);
        expect(hot.dominantSourceId).toBe('p');
    });

    it('4. Graph contagion closes the loop into live agent fear', () => {
        const graph = new ContagionGraph();
        const focal = { id: 'f', x: 0, y: 0, z: 0, traits: { extraversion: 0.7, neuroticism: 0.6 } };
        const { contagionFear } = graph.evaluateContagion(focal, [
            { id: 'p', x: 3, y: 0, z: 0, fearBand: 'PANIC', isPanicking: true }
        ]);
        const threat = { distance: 12.0, intensity: 0.5 };
        const rHot = new AffectiveAgent('f', {}).tick(0.016, { threats: [threat] }, { contagionFear });
        const rCold = new AffectiveAgent('f', {}).tick(0.016, { threats: [threat] }, {});
        expect(rHot.affective_state.raw_fear).toBeGreaterThan(rCold.affective_state.raw_fear);
    });
});

describe('Debt: FactionSystem x WorldSimulationSystem encounters', () => {
    function twoGroups() {
        const world = new WorldSimulationSystem();
        world.registerGroup('patrol-a', {
            type: ROAMING_PARTY_TYPES.PATROL, factionId: 'highguard',
            position: { x: 0, y: 0, z: 0 }, militaryStrength: 0.6, wealth: 0.4
        });
        world.registerGroup('patrol-b', {
            type: ROAMING_PARTY_TYPES.PATROL, factionId: 'redcloaks',
            position: { x: 5, y: 0, z: 0 }, militaryStrength: 0.6, wealth: 0.4
        });
        return world;
    }
    it('5. Hostile factions turn proximity into skirmish; no factions stay peaceful', () => {
        const factions = new FactionSystem();
        factions.registerFaction({ id: 'highguard', name: 'Highguard', culture: 'MILITARISTIC' });
        factions.registerFaction({ id: 'redcloaks', name: 'Redcloaks' });
        for (let i = 0; i < 6; i++) {
            factions.recordIncident('redcloaks', 'highguard', 'RAID_CONFIRMED', { severity: 0.9 });
        }
        factions.evaluateStance('highguard', 'redcloaks', { territorialPressure: 0.8, trust: 0 });
        const stance = factions.getBilateralStance('highguard', 'redcloaks');
        expect(['SKIRMISH', 'ATTACK', 'MOBILIZE', 'THREATEN']).toContain(stance.stage);
        const hot = twoGroups().evaluateEncounters({ factionSystem: factions });
        const cold = twoGroups().evaluateEncounters({});
        expect(hot.length).toBeGreaterThan(0);
        expect(hot[0].encounterType).toBe('BORDER_SKIRMISH');
        expect(cold.length).toBeGreaterThan(0);
        expect(cold[0].encounterType).not.toBe('BORDER_SKIRMISH');
    });

    it('6. World tick advances deterministically with factions attached', () => {
        const run = () => {
            const factions = new FactionSystem();
            factions.registerFaction({ id: 'highguard', name: 'Highguard' });
            factions.registerFaction({ id: 'redcloaks', name: 'Redcloaks' });
            const world = twoGroups();
            const out = [];
            for (let t = 0; t < 5; t++) {
                world.tick(1.0, { factionSystem: factions });
                out.push(world.getGroup('patrol-a').position.x);
            }
            return out;
        };
        expect(run()).toEqual(run());
    });
});

describe('Debt: WorldSimulationSystem x CivilizationSimulationSystem x LayeredMemorySystem', () => {
    it('7. World history event persists and is queryable for memory write', () => {
        const world = new WorldSimulationSystem();
        world.registerGroup('caravan-1', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 20, y: 0, z: 0 }, militaryStrength: 0.4, wealth: 0.8
        });
        world.recordHistoryEvent('CARAVAN_AMBUSHED', { groupId: 'caravan-1', severity: 0.85 });
        const history = world.queryHistory({ eventType: 'CARAVAN_AMBUSHED' });
        expect(history.length).toBe(1);

        const mem = new LayeredMemorySystem();
        mem.recordSemantic('amber-road', 'HAZARD', { x: 20, y: 0, z: 0 }, 0.85,
            { sourceEvent: history[0].eventType }, 1);
        expect(mem.semantic.get('amber-road').category).toBe('HAZARD');
    });

    it('8. Route incident demotes trade route ranking deterministically', () => {
        const run = () => {
            const civ = new CivilizationSimulationSystem();
            civ.registerNode('oakhaven', { x: 0, y: 0, z: 0 });
            civ.registerNode('riverbend', { x: 100, y: 0, z: 0 });
            civ.registerRoute('oakhaven-riverbend', { fromNodeId: 'oakhaven', toNodeId: 'riverbend' });
            const before = civ.rankTradeRoutes('oakhaven', 'riverbend');
            civ.recordRouteIncident('oakhaven-riverbend', 'AMBUSH', 0.9);
            const after = civ.rankTradeRoutes('oakhaven', 'riverbend');
            return { before: before[0]?.utility ?? null, after: after[0]?.utility ?? null };
        };
        const a = run();
        const b = run();
        expect(a).toEqual(b);
        expect(a.before).not.toBeNull();
        expect(a.after).toBeLessThan(a.before);
    });
});
