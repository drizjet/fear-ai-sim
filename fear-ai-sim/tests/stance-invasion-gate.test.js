import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';
import { requestNonAggression } from '../treaty.js';

const NORTH = 'north-faction';
const SOUTH = 'south-faction';

function raidReadyWorld({
    northInformationConfidence = 1,
    northTrust = 0,
    northPressure = 1,
    northStance = StanceLadder.HOSTILE,
} = {}) {
    const world = createClosedWorldScenario();
    const north = world.factions.find(faction => faction.id === NORTH);
    const pair = world.relationships.get(`${NORTH}::${SOUTH}`);

    // Keep the faction's independent intent in RAID. The tests below isolate
    // the relationship consumer: whether that intent is authorized against
    // this particular target is decided by the directed structured stance.
    north.grievance = 1;
    north.militaryConfidence = 1;
    north.riskTolerance = 1;
    north.resources = 5;
    north.maxResources = 5;
    north.informationConfidence = northInformationConfidence;
    north.lastDecision = 'RAID';

    // Set the attacker's directed view independently from the reverse view.
    // The legacy pair stance is the peak, so the reverse hostile observation
    // makes a symmetric/legacy gate insufficient for this detector.
    pair.setTrustFrom(NORTH, northTrust);
    pair.setTrustFrom(SOUTH, 0);
    pair.setGrievanceFrom(NORTH, northPressure);
    pair.setFearFrom(NORTH, northPressure);
    pair.setTerritorialPressureFrom(NORTH, northPressure);
    pair.setGrievanceFrom(SOUTH, 1);
    pair.setFearFrom(SOUTH, 1);
    pair.setTerritorialPressureFrom(SOUTH, 1);
    pair.observeFrom(NORTH, northStance, 0);
    pair.observeFrom(SOUTH, StanceLadder.HOSTILE, 0);

    // Keep the selected target reachable during the reducer's roaming pass.
    // The invasion gate runs before the optional encounter pin, so use the
    // roaming cooldown to keep the candidate on road-a at gate time.
    const bandit = world.bandits[0];
    bandit.roadId = 'road-a';
    bandit.factionId = SOUTH;
    bandit._lastRelocationTick = 0;
    bandit.relocationCooldownTicks = 10;
    return { world, pair, north };
}

function northGate(world) {
    return [...world.events].reverse().find(event =>
        event.type === 'FACTION_ACTION_GATE'
        && event.factionId === NORTH
        && event.targetId === 'bandits-1'
    );
}

function northInvasions(world) {
    return world.events.filter(event =>
        event.type === 'INVASION' && event.factionId === NORTH
    );
}

function tickForGate(world, options = {}) {
    return tickClosedWorld(world, {
        tick: 1,
        perceivedDanger: 0,
        encounterRng: () => 0.999,
        ...options,
    });
}

describe('Slice P — structured chooseStance routes into invasion gate', () => {
    it('blocks a raid when low information confidence makes the structured action unsafe', () => {
        const { world, pair } = raidReadyWorld({
            northInformationConfidence: 0.1,
            northTrust: 0,
            northPressure: 1,
            northStance: StanceLadder.HOSTILE,
        });

        tickForGate(world);

        const gate = northGate(world);
        expect(pair.stanceFrom(NORTH)).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
        expect(gate).toMatchObject({
            evaluatorId: NORTH,
            targetFactionId: SOUTH,
            pairId: `${NORTH}::${SOUTH}`,
            allowed: false,
            reason: 'STRUCTURED_STANCE_BLOCKS_RAID',
            structuredAllows: false,
            structuredEvidenceBlocksAction: true,
        });
        expect(gate.stance).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
        expect(gate.structuredDecision).toMatchObject({
            evidence: { informationConfidence: 0.1, gateActive: true },
            actionBlocked: true,
        });
        expect(gate.why).toEqual(expect.arrayContaining([
            'Faction decision is RAID',
            'Target bandit is reachable',
        ]));
        expect(gate.whyNot).toHaveLength(1);
        expect(gate.whyNot[0]).toMatch(/structured decision|uncertain information/i);
        expect(northInvasions(world)).toHaveLength(0);
    });

    it('uses directed pressure and trust to block a stale hostile peak when the attacker view is tolerant', () => {
        const { world, pair } = raidReadyWorld({
            northInformationConfidence: 1,
            northTrust: 0.95,
            northPressure: 0,
            northStance: StanceLadder.WATCHFUL,
        });

        tickForGate(world);

        const gate = northGate(world);
        expect(pair.stance).toBeGreaterThanOrEqual(StanceLadder.HOSTILE);
        expect(pair.stanceFrom(NORTH)).toBeLessThan(StanceLadder.WATCHFUL);
        expect(gate).toMatchObject({
            evaluatorId: NORTH,
            targetFactionId: SOUTH,
            stance: StanceLadder.TOLERANT,
            allowed: false,
            reason: 'STRUCTURED_STANCE_BLOCKS_RAID',
            structuredAllows: false,
        });
        expect(gate.structuredDecision).toMatchObject({
            from: StanceLadder.TOLERANT,
            to: StanceLadder.TOLERANT,
            blocked: false,
        });
        expect(gate.whyNot[0]).toContain('structured decision');
        expect(northInvasions(world)).toHaveLength(0);
    });

    it('authorizes the action when directed pressure and evidence support a hostile decision', () => {
        const { world, pair } = raidReadyWorld({
            northInformationConfidence: 1,
            northTrust: 0,
            northPressure: 1,
            northStance: StanceLadder.HOSTILE,
        });

        tickForGate(world);

        const gate = northGate(world);
        expect(pair.stanceFrom(NORTH)).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
        expect(gate).toMatchObject({
            evaluatorId: NORTH,
            targetFactionId: SOUTH,
            allowed: true,
            structuredAllows: true,
            structuredEvidenceBlocksAction: false,
        });
        expect(gate.reason).toMatch(/^STRUCTURED_STANCE_AUTHORIZES_ACTION:/);
        expect(gate.structuredDecision).toMatchObject({
            to: expect.any(Number),
            blocked: false,
            evidence: { informationConfidence: 1, gateActive: false },
            actionBlocked: false,
        });
        expect(gate.structuredDecision.to).toBeGreaterThanOrEqual(StanceLadder.WATCHFUL);
        expect(gate.whyNot).toEqual([]);
        expect(northInvasions(world)).toHaveLength(1);
    });

    it('gives an active non-aggression treaty priority over stance and bypass overrides', () => {
        const { world } = raidReadyWorld({
            northInformationConfidence: 1,
            northTrust: 0,
            northPressure: 1,
            northStance: StanceLadder.HOSTILE,
        });
        const { treaty } = requestNonAggression({
            actor: NORTH,
            target: SOUTH,
            world,
            tick: 0,
        });

        // The explicit relationship-gate override cannot bypass a treaty.
        tickForGate(world, { relationshipGate: false });

        const gate = northGate(world);
        expect(gate).toMatchObject({
            allowed: false,
            reason: 'TREATY_BLOCKED_RAID',
            treatyId: treaty.id,
            structuredAllows: true,
        });
        expect(gate.whyNot).toEqual([
            `Active non-aggression treaty ${treaty.id} blocks action against ${SOUTH}`,
        ]);
        expect(northInvasions(world)).toHaveLength(0);
        expect(world.events.filter(event =>
            event.type === 'TREATY_BLOCKED_RAID'
            && event.factionId === NORTH
            && event.treatyId === treaty.id
        )).toHaveLength(1);
    });
    it('authorizes action against unaffiliated targets with WHY audit (A5-F8 boundary)', () => {
        // A5-F8: the relationship vector covers FACTION pairs. A
        // factionless target bypasses stance by design (there is no
        // pair to consult), recorded as TARGET_HAS_NO_FACTION with
        // the reason in WHY — not silently, not via the stance
        // threshold. This pins the documented scope boundary.
        const { world } = raidReadyWorld({
            northInformationConfidence: 1,
            northTrust: 0,
            northPressure: 1,
            northStance: StanceLadder.HOSTILE,
        });
        world.bandits[0].factionId = null;

        tickForGate(world);

        const gate = northGate(world);
        expect(gate).toMatchObject({
            evaluatorId: NORTH,
            targetFactionId: null,
            allowed: true,
            reason: 'TARGET_HAS_NO_FACTION',
        });
        expect(gate.why).toEqual(
            expect.arrayContaining([
                'Unaffiliated targets do not require an inter-faction stance',
            ]),
        );
        expect(northInvasions(world)).toHaveLength(1);
    });
    });
