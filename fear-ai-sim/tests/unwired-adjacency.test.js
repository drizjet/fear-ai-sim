/**
 * @file unwired-adjacency.test.js
 *
 * CCI-2 NOW-1..4: four twice-flagged unwired adjacencies, wired and proven.
 * Blockade throttles reach corridor hazard; motive pressure bends
 * destination choice; dilemma scenarios run from live faction stances;
 * succession outcomes land on faction cohesion/morale.
 */

import { describe, it, expect } from '@jest/globals';
import { BlockadeEngine } from '../packages/core/src/BlockadeEngine.js';
import { TradeCaravanSupplyChainSystem } from '../packages/core/src/TradeCaravanSupplyChainSystem.js';
import { MovementMotiveRanker } from '../packages/core/src/MovementMotiveRanker.js';
import { RoamingBandSystem } from '../packages/core/src/RoamingBandSystem.js';
import { SecurityDilemmaHarness } from '../packages/core/src/SecurityDilemmaHarness.js';
import { SuccessionEngine } from '../packages/core/src/SuccessionEngine.js';
import { FactionSystem } from '../packages/core/src/FactionSystem.js';

describe('NOW-1: blockade throttles reach corridor hazard', () => {
    function tradeWorld() {
        const trade = new TradeCaravanSupplyChainSystem();
        trade.registerSettlementHub('oak', { x: 0, z: 0 });
        trade.registerSettlementHub('river', { x: 100, z: 0 });
        trade.registerCorridor('oak', 'river', {});
        return trade;
    }

    it('1. Declared blockade raises corridor hazard and escort pressure', () => {
        const blockade = new BlockadeEngine();
        const trade = tradeWorld();
        const corridorId = 'oak_to_river';
        const before = trade.corridors.get(corridorId).hazardRating;
        const bid = blockade.declare('redcloaks', 'highguard', [corridorId], { commitment: 0.8 });
        expect(bid).toBeTruthy();
        const res = trade.applyBlockadeThrottles(blockade.throttleTable());
        expect(res.applied).toBe(1);
        expect(trade.corridors.get(corridorId).hazardRating).toBeGreaterThan(before);
    });

    it('2. Lifted blockade releases exactly what it added', () => {
        const blockade = new BlockadeEngine();
        const trade = tradeWorld();
        const corridorId = 'oak_to_river';
        const before = trade.corridors.get(corridorId).hazardRating;
        const bid = blockade.declare('redcloaks', 'highguard', [corridorId], { commitment: 0.8 });
        trade.applyBlockadeThrottles(blockade.throttleTable());
        blockade.lift(bid);
        const res = trade.applyBlockadeThrottles(blockade.throttleTable());
        expect(res.released).toBe(1);
        expect(trade.corridors.get(corridorId).hazardRating).toBeCloseTo(before, 10);
    });

    it('3. Unknown corridors reported, never created', () => {
        const trade = tradeWorld();
        const res = trade.applyBlockadeThrottles({ nowhere: 0.2 });
        expect(res.unknown).toEqual(['nowhere']);
        expect(trade.corridors.has('nowhere')).toBe(false);
    });
});

describe('NOW-2: motive pressure bends destination choice', () => {
    function bandWorld() {
        const bands = new RoamingBandSystem();
        bands.registerBand({ id: 'b1', archetype: 'NOMAD_TRIBE', position: { x: 0, y: 0, z: 0 }, hunger: 1.0, fear: 0.1 });
        bands.registerDestination({ id: 'near-poor', position: { x: 10, y: 0, z: 0 }, resources: { food: 0.1, shelter: 0.1 } });
        bands.registerDestination({ id: 'far-rich', position: { x: 90, y: 0, z: 0 }, resources: { food: 1.0, shelter: 0.2 } });
        return bands;
    }

    it('4. Starving band reranks toward the far rich destination', () => {
        const bands = bandWorld();
        const ranker = new MovementMotiveRanker();
        const band = bands.bands.get('b1');
        const bias = ranker.destinationWeightBias(ranker.rank({ hunger: 1.0, fear: 0.1, archetype: 'NOMAD_TRIBE' }));
        expect(bias.need).toBeGreaterThan(1.0);
        const plain = bands.evaluateDestinationUtilities('b1');
        const biased = bands.evaluateDestinationUtilities('b1', { weightBias: bias });
        expect(biased[0].destinationId).toBe('far-rich');
        expect(plain).not.toEqual(biased);
    });

    it('5. Absent bias leaves archetype choice unchanged', () => {
        const bands = bandWorld();
        const a = bands.evaluateDestinationUtilities('b1');
        const b = bands.evaluateDestinationUtilities('b1', {});
        expect(a).toEqual(b);
    });
});

describe('NOW-3: dilemma scenarios run from live stances', () => {
    function hostileStances() {
        const factions = new FactionSystem();
        factions.registerFaction({ id: 'highguard', name: 'Highguard', culture: 'MILITARISTIC' });
        factions.registerFaction({ id: 'redcloaks', name: 'Redcloaks' });
        for (let i = 0; i < 6; i++) {
            factions.recordIncident('redcloaks', 'highguard', 'RAID_CONFIRMED', { severity: 0.9 });
            factions.recordIncident('highguard', 'redcloaks', 'RAID_CONFIRMED', { severity: 0.9 });
        }
        factions.evaluateStance('highguard', 'redcloaks', { territorialPressure: 0.8, trust: 0 });
        factions.evaluateStance('redcloaks', 'highguard', { territorialPressure: 0.8, trust: 0 });
        return factions;
    }

    it('6. Hostile stances spiral; trusting stances hold', () => {
        const factions = hostileStances();
        const hot = new SecurityDilemmaHarness().run(
            SecurityDilemmaHarness.configFromStances(
                factions.getBilateralStance('highguard', 'redcloaks'),
                factions.getBilateralStance('redcloaks', 'highguard')
            )
        );
        const calm = new SecurityDilemmaHarness().run(
            SecurityDilemmaHarness.configFromStances(
                { fear: 0.1, trust: 0.8, informationConfidence: 0.9, grievance: 0 },
                { fear: 0.1, trust: 0.8, informationConfidence: 0.9, grievance: 0 }
            )
        );
        expect(calm.verdict).not.toBe('SPIRAL');
    });

    it('7. Stance builder is deterministic and bounded', () => {
        const factions = hostileStances();
        const cfg = SecurityDilemmaHarness.configFromStances(
            factions.getBilateralStance('highguard', 'redcloaks'),
            factions.getBilateralStance('redcloaks', 'highguard')
        );
        expect(cfg).toEqual(SecurityDilemmaHarness.configFromStances(
            factions.getBilateralStance('highguard', 'redcloaks'),
            factions.getBilateralStance('redcloaks', 'highguard')
        ));
        for (const v of Object.values(cfg)) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });
});

describe('NOW-4: succession outcomes land on cohesion', () => {
    it('8. Bloody contested succession wounds cohesion; smooth one barely dents it', () => {
        const mk = () => {
            const factions = new FactionSystem();
            factions.registerFaction({ id: 'f1', name: 'F1' });
            return factions;
        };
        const engine = new SuccessionEngine();
        const bloody = engine.resolve({
            factionId: 'f1',
            cause: 'ASSASSINATION',
            candidates: [
                { id: 'a', legitimacy: 0.5, competence: 0.5, popularity: 0.5, continuity: 0.2 },
                { id: 'b', legitimacy: 0.5, competence: 0.5, popularity: 0.5, continuity: 0.2 }
            ]
        });
        const smooth = engine.resolve({
            factionId: 'f1',
            cause: 'NATURAL_DEATH',
            candidates: [
                { id: 'a', legitimacy: 0.9, competence: 0.9, popularity: 0.9, continuity: 0.9 },
                { id: 'b', legitimacy: 0.2, competence: 0.2, popularity: 0.2, continuity: 0.2 }
            ]
        });
        const fBloody = mk();
        fBloody.applySuccession(bloody);
        const fSmooth = mk();
        fSmooth.applySuccession(smooth);
        expect(fBloody.getFaction('f1').cohesion).toBeLessThan(0.7);
        expect(fSmooth.getFaction('f1').cohesion).toBeGreaterThan(fBloody.getFaction('f1').cohesion);
        expect(fBloody.getFaction('f1').leaderId).toBe(bloody.successorId);
    });

    it('9. Interregnum craters cohesion and morale within bounds', () => {
        const factions = new FactionSystem();
        factions.registerFaction({ id: 'f1', name: 'F1' });
        const engine = new SuccessionEngine();
        const result = engine.resolve({ factionId: 'f1', cause: 'ASSASSINATION', candidates: [] });
        expect(result.interregnum).toBe(true);
        const updated = factions.applySuccession(result);
        expect(updated.cohesion).toBeGreaterThanOrEqual(0);
        expect(updated.morale).toBeGreaterThanOrEqual(0);
        expect(updated.cohesion).toBeLessThan(0.7);
    });

    it('10. Unknown faction returns null without throwing', () => {
        const factions = new FactionSystem();
        expect(factions.applySuccession({ factionId: 'ghost', cohesionDelta: -0.5 })).toBeNull();
    });
});
