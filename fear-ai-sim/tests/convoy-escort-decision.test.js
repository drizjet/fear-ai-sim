import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld, decideConvoyEscort } from '../closed-world.js';
import { resolveConvoyAmbush } from '../convoy.js';

// E11 — endogenous convoys / paid escorts. Merchants hire protection
// when the expected avoided loss beats the escort price, pay from
// E9 capital, and travel real trips. Escorts are local guards, never
// teleports; heat and beliefs run through the existing channels.

const FEE = 5;

function escortWorld({ danger = 0.9, cargo = 20, capital = 100 } = {}) {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    const merchant = world.merchants[0];
    merchant.cargo = cargo;
    merchant.cargoKind = 'food';
    merchant.capital = capital;
    merchant.routeBeliefs['road-a'] = { perceivedDanger: danger, confidence: 0.9 };
    merchant.routeBeliefs['road-b'] = { perceivedDanger: 1, confidence: 0.9 };
    merchant.routeBeliefs['road-c'] = { perceivedDanger: 1, confidence: 0.9 };
    return world;
}

describe('E11 convoy escort decisions', () => {
    it('A: a safe route hires nothing under matched conditions', () => {
        const world = escortWorld({ danger: 0.05 });
        const d = decideConvoyEscort(world.merchants[0], world, { routeId: 'road-a', tick: 1 });
        expect(d.decision).toBe('REFUSE');
        expect(d.escortCost).toBe(0);
        expect(d.whyNot.join(' ')).toMatch(/safe/i);
    });

    it('B: a risky route hires the local guard when avoided loss beats price', () => {
        const world = escortWorld({ danger: 0.9 });
        const d = decideConvoyEscort(world.merchants[0], world, { routeId: 'road-a', tick: 1 });
        expect(d.decision).toBe('HIRE');
        expect(d.chosenEscortIds).toEqual(['guard-1']);
        expect(d.escortCost).toBe(FEE);
        expect(d.expectedUnescortedLoss).toBeGreaterThan(d.escortCost + d.expectedEscortedLoss);
        expect(d.why.join(' ')).toMatch(/avoided loss/i);
    });

    it('C: an overpriced escort is rationally refused', () => {
        const world = escortWorld({ danger: 0.9, cargo: 2 });
        const d = decideConvoyEscort(world.merchants[0], world, { routeId: 'road-a', tick: 1 });
        expect(d.decision).toBe('REFUSE');
        expect(d.whyNot.join(' ')).toMatch(/exceed/i);
    });

    it('D: insufficient capital blocks protection even when desirable', () => {
        const world = escortWorld({ danger: 0.9, capital: 3 });
        const d = decideConvoyEscort(world.merchants[0], world, { routeId: 'road-a', tick: 1 });
        expect(d.decision).toBe('REFUSE');
        expect(d.whyNot.join(' ')).toMatch(/capital/i);
    });

    it('E: escort strength materially reduces ambush loss', () => {
        const convoy = { id: 'c', merchantIds: ['m'], cargo: 20 };
        const lone = resolveConvoyAmbush({ ...convoy }, { roadId: 'road-a' },
            { roadDanger: 0.8, escortStrength: 0, tick: 1 });
        const escorted = resolveConvoyAmbush({ ...convoy }, { roadId: 'road-a' },
            { roadDanger: 0.8, escortStrength: 1, tick: 1 });
        expect(lone.lost).toBeCloseTo(16, 10);
        expect(escorted.lost).toBeCloseTo(6, 10);
        expect(escorted.lost).toBeLessThan(lone.lost);
    });

    it('H: a committed guard cannot protect a second simultaneous trip', () => {
        const world = escortWorld({ danger: 0.9 });
        world.merchants.push({
            id: 'merchant-2', location: 'north', cargo: 20, cargoKind: 'food',
            capital: 100, selectedRoute: 'road-a',
            routeBeliefs: { 'road-a': { perceivedDanger: 0.9, confidence: 0.9 } },
        });
        // Guard-1 is mid-convoy elsewhere: committed, not free.
        world.guards[0].convoyId = 'convoy-elsewhere';
        world.convoy = { id: 'convoy-elsewhere', merchantIds: ['merchant-9'], escortIds: ['guard-1'] };
        const d = decideConvoyEscort(world.merchants[1], world, { routeId: 'road-a', tick: 1 });
        expect(d.decision).toBe('REFUSE');
        expect(d.whyNot.join(' ')).toMatch(/guard/i);
    });

    it('J: a lone convoy ambush teaches route beliefs without any BANDIT_ATTACK', async () => {
        const mod = await import('../closed-world.js');
        const { tickMerchant } = await import('../canonical-trade-system.js');
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        const merchant = world.merchants[0];
        merchant.selectedRoute = 'road-a';
        merchant.routeBeliefs['road-a'] = { perceivedDanger: 0.1, confidence: 0.9 };
        mod.appendWorldEvent(world, {
            type: 'CONVOY_AMBUSH', roadId: 'road-a', convoyId: 'convoy-x',
            lost: 8, survivors: true, merchantIds: ['merchant-1'],
            derived: false, tick: 5,
        }, []);
        expect(world.events.some(e => e.type === 'BANDIT_ATTACK')).toBe(false);
        tickMerchant(world, 'merchant-1', { tick: 5, rng: () => 0 });
        expect(merchant.routeBeliefs['road-a'].perceivedDanger).toBeGreaterThan(0.5);
    });
});
