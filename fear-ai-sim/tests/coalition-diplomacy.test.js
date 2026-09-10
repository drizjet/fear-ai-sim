/**
 * tests/coalition-diplomacy.test.js
 *
 * Frontier C / Sections 130–135:
 * Multi-Settlement Alliances, Dynamic Treaties, Diplomatic Espionage & Coalition Warfare Escalation.
 *
 * Comprehensive Test Battery:
 * 1. Multilateral Coalition Formation & Cohesion Index Dynamics
 * 2. Dynamic Treaties, Expiration, and Betrayal Penalty Ledger
 * 3. Covert Espionage Networks (Infiltration, Distrust Rumors, Sabotage & Casus Belli Discovery)
 * 4. Coalition Call-to-Arms Cascading Mobilization vs Opportunistic Defection
 * 5. Full Deterministic Replay & Snapshot Serialization
 */

import { describe, it, expect } from '@jest/globals';
import {
    CoalitionDiplomacyEngine,
    TREATY_TYPES,
    ESPIONAGE_OPERATIONS,
    COALITION_STATUS,
    CALL_TO_ARMS_RESPONSES,
    FactionSystem,
    FACTION_CULTURES
} from '../packages/core/index.js';

describe('Frontier C: Coalition Diplomacy, Treaties & Espionage (Sections 130-135)', () => {
    it('1. Creates multilateral coalitions and calculates dynamic cohesion index', () => {
        const engine = new CoalitionDiplomacyEngine({ seed: 777 });
        const factionSystem = new FactionSystem();

        factionSystem.registerFaction({ id: 'kingdom_valoria', culture: FACTION_CULTURES.HONORABLE, militaryReadiness: 0.8 });
        factionSystem.registerFaction({ id: 'free_cantons', culture: FACTION_CULTURES.MERCANTILE, militaryReadiness: 0.6 });
        factionSystem.registerFaction({ id: 'northern_clans', culture: FACTION_CULTURES.MILITARISTIC, militaryReadiness: 0.7 });
        factionSystem.registerFaction({ id: 'iron_empire', culture: FACTION_CULTURES.EXPANSIONIST, militaryReadiness: 0.95 });

        // Set high bilateral trust among allies
        const s1 = factionSystem.getBilateralStance('kingdom_valoria', 'free_cantons');
        s1.trust = 0.85;
        const s2 = factionSystem.getBilateralStance('free_cantons', 'kingdom_valoria');
        s2.trust = 0.85;

        const coalition = engine.createCoalition('grand_covenant', {
            name: 'Grand Covenant of the Valley',
            type: TREATY_TYPES.MUTUAL_DEFENSE_PACT,
            memberFactionIds: ['kingdom_valoria', 'free_cantons', 'northern_clans'],
            leaderFactionId: 'kingdom_valoria'
        });

        expect(coalition.status).toBe(COALITION_STATUS.ACTIVE);
        expect(coalition.members.length).toBe(3);

        // Hostile external threat increases cohesion
        const sThreat1 = factionSystem.getBilateralStance('kingdom_valoria', 'iron_empire');
        sThreat1.stage = 'THREATEN';
        const sThreat2 = factionSystem.getBilateralStance('free_cantons', 'iron_empire');
        sThreat2.stage = 'THREATEN';

        const highCohesion = engine.computeCoalitionCohesion('grand_covenant', { factionSystem });
        expect(highCohesion).toBeGreaterThanOrEqual(0.60);
        expect(coalition.status).toBe(COALITION_STATUS.ACTIVE);

        // War weariness and high internal grievance degrades cohesion
        coalition.warWeariness = 0.80;
        s1.grievance = 0.70;
        s2.grievance = 0.70;

        const degradedCohesion = engine.computeCoalitionCohesion('grand_covenant', { factionSystem });
        expect(degradedCohesion).toBeLessThan(highCohesion);
    });

    it('2. Enforces treaty lifecycles, expirations, and violation honor penalties', () => {
        const engine = new CoalitionDiplomacyEngine({ seed: 888 });
        const factionSystem = new FactionSystem();

        factionSystem.registerFaction({ id: 'faction_A', culture: FACTION_CULTURES.HONORABLE });
        factionSystem.registerFaction({ id: 'faction_B', culture: FACTION_CULTURES.MERCANTILE });

        const initialHonor = engine.getFactionHonor('faction_A');
        expect(initialHonor).toBe(0.75);

        const treaty = engine.proposeTreaty('nap_AB', 'faction_A', 'faction_B', TREATY_TYPES.NON_AGGRESSION_PACT, {
            durationTicks: 10
        });
        expect(treaty.status).toBe('ACTIVE');

        // Advance 5 ticks: treaty still active
        engine.tick(5);
        expect(treaty.status).toBe('ACTIVE');

        // Record treaty betrayal: unprovoked surprise assault
        const violation = engine.recordTreatyViolation('nap_AB', 'faction_A', 'UNPROVOKED_SURPRISE_ATTACK', { factionSystem });
        expect(violation.recorded).toBe(true);
        expect(treaty.status).toBe('VIOLATED');

        const postViolationHonor = engine.getFactionHonor('faction_A');
        expect(postViolationHonor).toBeLessThan(initialHonor);
        expect(postViolationHonor).toBeCloseTo(0.40, 2);

        // Advance past expiry
        engine.tick(10);
        expect(treaty.status).toBe('VIOLATED'); // Remains violated, does not revert to EXPIRED
    });

    it('3. Executes covert espionage operations (Council Infiltration, Stockpile Sabotage, Distrust Rumors)', () => {
        const engine = new CoalitionDiplomacyEngine({ seed: 4242 });
        const factionSystem = new FactionSystem();

        factionSystem.registerFaction({ id: 'spy_guild', culture: FACTION_CULTURES.MERCANTILE, militaryReadiness: 0.6, economicStockpile: 0.7 });
        factionSystem.registerFaction({ id: 'target_fortress', culture: FACTION_CULTURES.ISOLATIONIST, militaryReadiness: 0.85, economicStockpile: 0.9 });
        factionSystem.registerFaction({ id: 'neutral_buffer', culture: FACTION_CULTURES.HONORABLE });

        // A. Infiltrate Council
        const opInfiltrate = engine.executeEspionageOperation('spy_guild', 'target_fortress', ESPIONAGE_OPERATIONS.INFILTRATE_COUNCIL, {
            operativeSkill: 0.95,
            counterVigilance: 0.20
        }, { factionSystem });

        expect(opInfiltrate.operation).toBe(ESPIONAGE_OPERATIONS.INFILTRATE_COUNCIL);
        if (opInfiltrate.success) {
            expect(opInfiltrate.payload.revealedReadiness).toBe(0.85);
            expect(opInfiltrate.payload.revealedStockpile).toBe(0.9);
        }

        // B. Sabotage Stockpile
        const initialStockpile = factionSystem.factions.get('target_fortress').economicStockpile;
        const opSabotage = engine.executeEspionageOperation('spy_guild', 'target_fortress', ESPIONAGE_OPERATIONS.SABOTAGE_STOCKPILE, {
            operativeSkill: 0.90,
            counterVigilance: 0.20
        }, { factionSystem });

        if (opSabotage.success) {
            const currentStockpile = factionSystem.factions.get('target_fortress').economicStockpile;
            expect(currentStockpile).toBeLessThan(initialStockpile);
        }

        // C. Discovery generates Casus Belli and escalates diplomatic hostility
        const opBusted = engine.executeEspionageOperation('spy_guild', 'target_fortress', ESPIONAGE_OPERATIONS.PROVOKE_BORDER_INCIDENT, {
            operativeSkill: 0.10,
            counterVigilance: 0.95
        }, { factionSystem });

        expect(opBusted.discovered).toBe(true);
        expect(opBusted.casusBelliGenerated).toBe(true);
        const postBustHonor = engine.getFactionHonor('spy_guild');
        expect(postBustHonor).toBeLessThan(0.75);

        const stance = factionSystem.getBilateralStance('target_fortress', 'spy_guild');
        expect(stance.grievance).toBeGreaterThan(0.30);
    });

    it('4. Deliberates cascading coalition call-to-arms (Loyal Mobilization vs Cowardly Defection)', () => {
        const engine = new CoalitionDiplomacyEngine({ seed: 999 });
        const factionSystem = new FactionSystem();

        factionSystem.registerFaction({ id: 'victim_canton', culture: FACTION_CULTURES.MERCANTILE, militaryReadiness: 0.5 });
        factionSystem.registerFaction({ id: 'noble_allies', culture: FACTION_CULTURES.HONORABLE, militaryReadiness: 0.8 });
        factionSystem.registerFaction({ id: 'fickle_tribes', culture: FACTION_CULTURES.ISOLATIONIST, militaryReadiness: 0.3 });
        factionSystem.registerFaction({ id: 'blood_horde', culture: FACTION_CULTURES.MILITARISTIC, militaryReadiness: 0.95 });

        engine.createCoalition('defense_league', {
            type: TREATY_TYPES.MUTUAL_DEFENSE_PACT,
            memberFactionIds: ['victim_canton', 'noble_allies', 'fickle_tribes']
        });

        // Set high trust with noble allies, low trust with fickle tribes
        const sNoble = factionSystem.getBilateralStance('noble_allies', 'victim_canton');
        sNoble.trust = 0.90;
        engine.setFactionHonor('noble_allies', 0.90);

        const sFickle = factionSystem.getBilateralStance('fickle_tribes', 'victim_canton');
        sFickle.trust = 0.30;
        engine.setFactionHonor('fickle_tribes', 0.30);

        // Aggressor blood_horde attacks victim_canton
        const callToArms = engine.triggerCallToArms('blood_horde', 'victim_canton', { factionSystem });

        expect(callToArms.outcomes.length).toBe(2);

        const nobleOutcome = callToArms.outcomes.find(o => o.partnerFactionId === 'noble_allies');
        expect(nobleOutcome).toBeDefined();
        expect(nobleOutcome.decision).toBe(CALL_TO_ARMS_RESPONSES.HONOR_CALL_MOBILIZE);
        expect(nobleOutcome.advisoryDirective).toBe('MOBILIZE');

        const fickleOutcome = callToArms.outcomes.find(o => o.partnerFactionId === 'fickle_tribes');
        expect(fickleOutcome).toBeDefined();
        expect(fickleOutcome.decision).toBe(CALL_TO_ARMS_RESPONSES.REFUSE_DEFECT);
        expect(fickleOutcome.advisoryDirective).toBe('DEFECT');

        // Defection damages fickle tribes honor and creates victim grievance
        expect(engine.getFactionHonor('fickle_tribes')).toBeLessThan(0.30);
        const sVictimToFickle = factionSystem.getBilateralStance('victim_canton', 'fickle_tribes');
        expect(sVictimToFickle.grievance).toBeGreaterThan(0.40);
    });

    it('5. Exports and restores complete deterministic state snapshots', () => {
        const engine1 = new CoalitionDiplomacyEngine({ seed: 54321 });
        engine1.createCoalition('coalition_1', {
            memberFactionIds: ['f1', 'f2', 'f3']
        });
        engine1.proposeTreaty('t1', 'f1', 'f2', TREATY_TYPES.TRADE_LEAGUE);
        engine1.setFactionHonor('f1', 0.92);
        engine1.tick(12);

        const snapshot = engine1.getState();

        const engine2 = new CoalitionDiplomacyEngine();
        engine2.setState(snapshot);

        expect(engine2.currentTick).toBe(12);
        expect(engine2.coalitions.has('coalition_1')).toBe(true);
        expect(engine2.treaties.has('t1')).toBe(true);
        expect(engine2.getFactionHonor('f1')).toBe(0.92);
        expect(engine2.getState()).toEqual(snapshot);
    });
});

describe('NEXT-29: trade-dependency restraint in coalition incidents', () => {
    // The valley banditry paths already cool dependent grudges; the three
    // coalition incident recorders (treaty breach, false-flag border,
    // discovered-espionage blowback) take an optional context.tradeLedger
    // and apply the same curve. Absent ledger means zero restraint.
    function setup() {
        const engine = new CoalitionDiplomacyEngine({ seed: 4242 });
        const factionSystem = new FactionSystem();
        for (const id of ['faction_A', 'faction_B', 'faction_C']) {
            factionSystem.registerFaction({ id, culture: FACTION_CULTURES.HONORABLE });
        }
        return { engine, factionSystem };
    }
    // importer depends ~90% on exporter (0.9 ratio -> 0.63 restraint).
    function ledger(importer, exporter) {
        const rows = [];
        for (let i = 0; i < 9; i++) {
            rows.push({ tick: 0, sourceId: exporter, destId: importer, commodity: 'grain', amount: 10 });
        }
        rows.push({ tick: 0, sourceId: 'faction_C', destId: importer, commodity: 'grain', amount: 10 });
        return rows;
    }

    it('treaty breach cools when the victim depends on the violator', () => {
        const run = (withLedger) => {
            const { engine, factionSystem } = setup();
            engine.proposeTreaty('nap_AB', 'faction_A', 'faction_B', TREATY_TYPES.NON_AGGRESSION_PACT, { durationTicks: 100 });
            engine.recordTreatyViolation('nap_AB', 'faction_A', 'X', {
                factionSystem, ...(withLedger ? { tradeLedger: ledger('faction_B', 'faction_A') } : {})
            });
            return factionSystem.getBilateralStance('faction_B', 'faction_A').grievance;
        };
        expect(run(false)).toBeCloseTo(0.75, 10);
        expect(run(true)).toBeCloseTo(0.75 * (1 - 0.9 * 0.7), 10);
    });

    it('false-flag border grudge cools with the framed holder dependence', () => {
        const run = (withLedger) => {
            const { engine, factionSystem } = setup();
            const op = engine.executeEspionageOperation('faction_A', 'faction_B',
                ESPIONAGE_OPERATIONS.PROVOKE_BORDER_INCIDENT,
                { operativeSkill: 0.95, counterVigilance: 0.05 },
                { factionSystem, ...(withLedger ? { tradeLedger: ledger('faction_A', 'faction_B') } : {}) });
            expect(op.success).toBe(true);
            return factionSystem.getBilateralStance('faction_A', 'faction_B').grievance;
        };
        expect(run(false)).toBeCloseTo(0.20, 10);
        expect(run(true)).toBeCloseTo(0.20 * (1 - 0.9 * 0.7), 10);
    });

    it('discovered blowback cools both the recorded and direct grudge lines', () => {
        const run = (withLedger) => {
            const { engine, factionSystem } = setup();
            const op = engine.executeEspionageOperation('faction_A', 'faction_B',
                ESPIONAGE_OPERATIONS.PROVOKE_BORDER_INCIDENT,
                { operativeSkill: 0.10, counterVigilance: 0.95 },
                { factionSystem, ...(withLedger ? { tradeLedger: ledger('faction_B', 'faction_A') } : {}) });
            expect(op.discovered).toBe(true);
            return factionSystem.getBilateralStance('faction_B', 'faction_A');
        };
        const plain = run(false);
        expect(plain.grievance).toBeCloseTo(0.35 + 0.40, 10);
        const cooled = run(true);
        expect(cooled.grievance).toBeCloseTo((0.35 + 0.40) * (1 - 0.9 * 0.7), 10);
        // Facts stand: trust loss identical with and without restraint.
        expect(cooled.trust).toBe(plain.trust);
    });
});

describe('NOW-33: ledger-clock contract for coalition restraint', () => {
    // Staleness is relative to the reader's clock. A foreign ledger must
    // arrive with context.currentTick on the ROWS' basis (NOW-33 contract).
    function rowsAt(tick) {
        const rows = [];
        for (let i = 0; i < 9; i++) {
            rows.push({ tick, sourceId: 'faction_A', destId: 'faction_B', commodity: 'grain', amount: 10 });
        }
        rows.push({ tick, sourceId: 'faction_C', destId: 'faction_B', commodity: 'grain', amount: 10 });
        return rows;
    }

    it('absent ledger means zero restraint', () => {
        const engine = new CoalitionDiplomacyEngine({ seed: 1 });
        expect(engine._restraintFromLedger('faction_B', 'faction_A', {})).toBe(0);
        expect(engine._restraintFromLedger('faction_B', 'faction_A', { tradeLedger: [] })).toBe(0);
    });

    it('fresh reader over-includes, ticked reader expires, bridged reader restores', () => {
        const rows = rowsAt(500);
        const fresh = new CoalitionDiplomacyEngine({ seed: 1 });
        // Nothing is stale to a newborn: full restraint.
        expect(fresh._restraintFromLedger('faction_B', 'faction_A', { tradeLedger: rows }))
            .toBeCloseTo(0.9 * 0.7, 10);
        // Same rows against an old clock: expired to zero.
        const old = new CoalitionDiplomacyEngine({ seed: 1 });
        old.tick(800);
        expect(old._restraintFromLedger('faction_B', 'faction_A', { tradeLedger: rows })).toBe(0);
        // Bridging with the rows' own basis restores full restraint.
        expect(old._restraintFromLedger('faction_B', 'faction_A', { tradeLedger: rows, currentTick: 500 }))
            .toBeCloseTo(0.9 * 0.7, 10);
    });
});
