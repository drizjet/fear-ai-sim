import { describe, expect, it } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

const NORTH = 'north-faction';
const SOUTH = 'south-faction';

function actionReadyWorld({
    northStance = StanceLadder.TOLERANT,
    northInformationConfidence = 0.1,
    northPressure = 1,
} = {}) {
    const world = createClosedWorldScenario();
    const north = world.factions.find(faction => faction.id === NORTH);
    const south = world.factions.find(faction => faction.id === SOUTH);
    const pair = world.relationships.values().next().value;

    // The faction decision model independently wants to raid. The relationship
    // reducer must still decide whether that intent is valid for this target.
    north.grievance = 1;
    north.militaryConfidence = 1;
    north.riskTolerance = 1;
    north.resources = 5;
    north.maxResources = 5;
    north.informationConfidence = northInformationConfidence;

    // Keep the reverse perspective visibly hostile. The legacy `pair.stance`
    // is the peak across perspectives, so this is exactly the asymmetric case
    // that an any-neighbor/symmetric action gate gets wrong.
    south.informationConfidence = 1;
    pair.setTrustFrom(NORTH, 0);
    pair.setTrustFrom(SOUTH, 0);
    pair.setGrievanceFrom(NORTH, northPressure);
    pair.setFearFrom(NORTH, northPressure);
    pair.setTerritorialPressureFrom(NORTH, northPressure);
    pair.setGrievanceFrom(SOUTH, 1);
    pair.setFearFrom(SOUTH, 1);
    pair.setTerritorialPressureFrom(SOUTH, 1);
    pair.observeFrom(NORTH, northStance, 0);
    pair.observeFrom(SOUTH, StanceLadder.HOSTILE, 0);

    expect(world.bandits[0].factionId).toBe(SOUTH);
    return { world, pair };
}

function northInvasions(world) {
    return world.events.filter(event => event.type === 'INVASION' && event.factionId === NORTH);
}

function northGate(world) {
    return world.events.find(event =>
        event.type === 'FACTION_ACTION_GATE'
        && event.factionId === NORTH
        && event.targetId === 'bandits-1'
    );
}

describe('directional stance governs the selected production target', () => {
    it('blocks a raid when the attacker is TOLERANT toward the target even if the reverse/legacy stance is hostile', () => {
        const { world, pair } = actionReadyWorld();

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.8 });

        expect(pair.stanceFrom(NORTH)).toBe(StanceLadder.TOLERANT);
        expect(pair.stanceFrom(SOUTH)).toBeGreaterThanOrEqual(StanceLadder.HOSTILE);
        expect(pair.stance).toBeGreaterThanOrEqual(StanceLadder.HOSTILE);
        expect(northInvasions(world)).toHaveLength(0);
        expect(northGate(world)).toMatchObject({
            evaluatorId: NORTH,
            targetFactionId: SOUTH,
            pairId: `${NORTH}::${SOUTH}`,
            stance: StanceLadder.TOLERANT,
            threshold: StanceLadder.WATCHFUL,
            allowed: false,
            reason: 'TARGET_STANCE_BELOW_THRESHOLD',
        });
        expect(northGate(world).why).toEqual(expect.arrayContaining([
            'Faction decision is RAID',
            'Target bandit is reachable',
        ]));
        expect(northGate(world).whyNot).toHaveLength(1);
        expect(northGate(world).whyNot[0]).toContain('below WATCHFUL');
    });

    it('allows the same target when the attacker perspective is WATCHFUL or higher', () => {
        const { world, pair } = actionReadyWorld({
            northStance: StanceLadder.WATCHFUL,
            northInformationConfidence: 1,
            northPressure: 0.4,
        });

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.8 });

        expect(pair.stanceFrom(NORTH)).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
        expect(northInvasions(world)).toHaveLength(1);
        expect(northGate(world)).toMatchObject({
            evaluatorId: NORTH,
            targetFactionId: SOUTH,
            stance: pair.stanceFrom(NORTH),
            threshold: StanceLadder.WATCHFUL,
            allowed: true,
            reason: 'TARGET_STANCE_AUTHORIZES_ACTION',
        });
        expect(northGate(world).whyNot).toEqual([]);
    });

    it('keeps an explicit relationshipGate=false override observable and action-capable', () => {
        const { world, pair } = actionReadyWorld();

        tickClosedWorld(world, {
            tick: 1,
            perceivedDanger: 0.8,
            relationshipGate: false,
        });

        expect(pair.stanceFrom(NORTH)).toBe(StanceLadder.TOLERANT);
        expect(northInvasions(world)).toHaveLength(1);
        expect(northGate(world)).toMatchObject({
            evaluatorId: NORTH,
            targetFactionId: SOUTH,
            allowed: true,
            reason: 'RELATIONSHIP_GATE_DISABLED',
        });
    });
});
