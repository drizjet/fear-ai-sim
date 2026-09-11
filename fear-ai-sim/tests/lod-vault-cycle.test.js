import { describe, it, expect } from '@jest/globals';
import { LodDirector } from '../packages/core/index.js';
import { IdentityVault } from '../packages/core/index.js';
import { LodVaultCycle } from '../packages/core/index.js';

// NEXT-116: vault seal/restore cycle (wire-or-retire triage execution).
// Director demotions into abstract tiers seal identity; promotions restore it.
describe('NEXT-116: LOD vault seal/restore cycle', () => {
    const SNAP = {
        identity: { neuroticism: 0.6, resilience: 0.4 },
        adaptive: { trust: 0.7 },
        relationships: [{ targetId: 'captain', trust: 0.9, familiarity: 0.8 }],
        tick: 100
    };
    const setup = (provider = () => ({ ...SNAP })) => {
        const director = new LodDirector({ demoteHysteresisTicks: 1, promoteHysteresisTicks: 1 });
        const vault = new IdentityVault();
        const consumed = {};
        const cycle = new LodVaultCycle({
            director,
            vault,
            snapshotProvider: provider,
            restoreConsumer: (id, state) => { consumed[id] = state; }
        });
        return { director, vault, consumed, cycle };
    };
    const demote = (ctx) => {
        ctx.director.register('scout', { priority: 0.0 });
        ctx.director.observe('scout', { fear: 0.0, visible: false });
        let out;
        for (let i = 0; i < 4; i++) out = ctx.cycle.step({ lod0Cap: 1, lod1Cap: 1 });
        return out;
    };
    const promote = (ctx) => {
        ctx.director.observe('scout', { fear: 0.9, visible: true, priority: 1.0 });
        let out;
        let promotions = 0;
        for (let i = 0; i < 4; i++) {
            out = ctx.cycle.step({ lod0Cap: 1, lod1Cap: 1 });
            promotions += out.promotions.length;
        }
        out.totalPromotions = promotions;
        return out;
    };

    it('1. Demotion into an abstract tier seals the agent', () => {
        const ctx = setup();
        const out = demote(ctx);
        expect(out.assignments.scout).toBe('LOD4');
        expect(ctx.vault.isSealed('scout')).toBe(true);
        expect(ctx.cycle.stats().sealed).toBe(1);
    });

    it('2. Promotion restores identity, adaptive state, and bonds exactly', () => {
        const ctx = setup();
        demote(ctx);
        const out = promote(ctx);
        expect(ctx.vault.isSealed('scout')).toBe(false);
        expect(ctx.cycle.stats().restored).toBe(1);
        const back = ctx.consumed.scout;
        expect(out.totalPromotions).toBeGreaterThan(0);
        expect(back.identity.neuroticism).toBe(0.6);
        expect(back.adaptive.trust).toBe(0.7);
        expect(back.bonds[0].targetId).toBe('captain');
        expect(back.fidelity.identityExact).toBe(true);
    });

    it('3. Abstract drift while sealed is visible after restore', () => {
        const ctx = setup();
        demote(ctx);
        ctx.vault.applyAbstractDrift('scout', { trust: 50 }, 10);
        promote(ctx);
        expect(ctx.consumed.scout.adaptive.trust).toBeGreaterThan(0.7);
        expect(ctx.consumed.scout.abstractTicks).toBe(10);
    });

    it('4. Missing snapshot skips the seal without throwing', () => {
        const ctx = setup(() => null);
        const out = demote(ctx);
        expect(out.assignments.scout).toBe('LOD4');
        expect(ctx.vault.isSealed('scout')).toBe(false);
        expect(ctx.cycle.stats().skipped).toBe(1);
    });

    it('5. Intermediate-tier demotions do not seal', () => {
        const director = new LodDirector({ demoteHysteresisTicks: 1, promoteHysteresisTicks: 1 });
        const vault = new IdentityVault();
        const cycle = new LodVaultCycle({
            director,
            vault,
            snapshotProvider: () => ({ ...SNAP })
        });
        director.register('watcher', { priority: 0.3 });
        director.observe('watcher', { fear: 0.1, visible: true });
        let out;
        for (let i = 0; i < 4; i++) out = cycle.step({ lod0Cap: 0, lod1Cap: 1 });
        expect(['LOD1', 'LOD2'].includes(out.assignments.watcher)).toBe(true);
        expect(vault.isSealed('watcher')).toBe(false);
    });

    it('6. Cycle steps are deterministic on identical input sequences', () => {
        const run = () => {
            const ctx = setup();
            const d = demote(ctx);
            const p = promote(ctx);
            return { demoted: d.assignments.scout, promoted: p.assignments.scout, stats: ctx.cycle.stats() };
        };
        expect(run()).toEqual(run());
    });
});
