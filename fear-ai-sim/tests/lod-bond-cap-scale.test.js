import { describe, it, expect } from '@jest/globals';
import { IdentityVault, DeterministicRng } from '../packages/core/index.js';

// R5 (audit 190): LOD bond-cap scale probe.
//
// The vault keeps the top 12 relationship edges by |trust|+familiarity per
// sealed agent (IMPORTANT_EDGE_K). The 183 soak proved bit-identical
// restore for 12 citizens with <= 20 edges. This probe stresses a
// hundred-agent population with dense edge lists and asks the falsifier:
// does the cap drop a strongest-trust bond, and does restore stay exact
// and fast at scale? Probe-only: no production change.

const AGENTS = 120;
const EDGES = 30;

function buildPopulation(seed) {
    const rng = new DeterministicRng(seed);
    const pop = [];
    for (let i = 0; i < AGENTS; i++) {
        const relationships = [];
        for (let e = 0; e < EDGES; e++) {
            relationships.push({
                targetId: `agent_${(i + e + 1) % AGENTS}`,
                trust: rng.random() * 2 - 1,
                familiarity: rng.random(),
            });
        }
        pop.push({
            agentId: `villager_${i}`,
            identity: { n: rng.random(), a: rng.random() },
            adaptive: { trauma: rng.random() * 0.2 },
            relationships,
        });
    }
    return pop;
}

function sealAll(vault, pop) {
    const receipts = [];
    for (const snap of pop) receipts.push(vault.seal(snap.agentId, snap));
    return receipts;
}

describe('R5: bond-cap pressure at hundred-agent scale', () => {
    it('1. All 120 agents seal with exactly 12 kept and 18 dropped each', () => {
        const vault = new IdentityVault();
        const receipts = sealAll(vault, buildPopulation(7));
        expect(receipts).toHaveLength(AGENTS);
        for (const r of receipts) {
            expect(r.bondsKept).toBe(12);
            expect(r.droppedEdges).toBe(EDGES - 12);
        }
    });

    it('2. Kept edges are champion plus top-11 of the rest; restore is exact', () => {
        const pop = buildPopulation(7);
        const vault = new IdentityVault();
        sealAll(vault, pop);
        for (const snap of pop) {
            const ranked = [...snap.relationships]
                .sort((a, b) => (Math.abs(b.trust) + b.familiarity) - (Math.abs(a.trust) + a.familiarity));
            let champ = ranked[0];
            for (const e of ranked) {
                if (Math.abs(e.trust) > Math.abs(champ.trust)) champ = e;
            }
            const expected = ranked.includes(champ) && ranked.indexOf(champ) < 12
                ? ranked.slice(0, 12)
                : [champ, ...ranked.filter((e) => e !== champ).slice(0, 11)]
                    .sort((a, b) => (Math.abs(b.trust) + b.familiarity) - (Math.abs(a.trust) + a.familiarity));
            const restored = vault.restore(snap.agentId);
            expect(restored.bonds).toEqual(expected);
            expect(restored.identity).toEqual(snap.identity);
            expect(restored.adaptive).toEqual(snap.adaptive);
            expect(restored.fidelity.identityExact).toBe(true);
        }
    });

    it('3. BUILT (R5b): the trust champion always survives the cap', () => {
        // R5 pinned 85/600 champion losses (83 above 0.9) under the pure
        // |trust|+familiarity rank. Champion protection keeps the argmax-
        // |trust| edge and fills the other 11 slots by rank, so losses go
        // to zero on the identical populations. History in git plus ledger
        // milestone R5.
        let losses = 0;
        let checked = 0;
        for (const seed of [7, 8, 9, 10, 11]) {
            const pop = buildPopulation(seed);
            const vault = new IdentityVault();
            sealAll(vault, pop);
            for (const snap of pop) {
                const champ = snap.relationships.reduce((a, b) =>
                    (Math.abs(b.trust) > Math.abs(a.trust) ? b : a));
                const restored = vault.restore(snap.agentId);
                checked += 1;
                expect(restored.bonds).toHaveLength(12);
                if (!restored.bonds.some((b) => b.targetId === champ.targetId)) losses += 1;
            }
        }
        expect(checked).toBe(AGENTS * 5);
        expect(losses).toBe(0);
    });

    it('3b. Champion displaces the lowest-ranked kept edge; ties keep input order', () => {
        const vault = new IdentityVault();
        // Twelve lukewarm familiar edges outrank a pure-trust champion.
        const relationships = Array.from({ length: 12 }, (_, i) => ({
            targetId: `lukewarm_${i}`, trust: 0.55, familiarity: 0.55,
        }));
        relationships.push({ targetId: 'champion', trust: 0.99, familiarity: 0 });
        vault.seal('hero', { identity: { n: 0.5 }, relationships });
        const back = vault.restore('hero');
        expect(back.bonds.map((b) => b.targetId)).toContain('champion');
        expect(back.bonds).toHaveLength(12);
        // Ranked order preserved: champion sorts by its own key (0.99),
        // displacing exactly one lukewarm edge.
        const keys = back.bonds.map((b) => Math.abs(b.trust) + b.familiarity);
        const sorted = [...keys].sort((a, b) => b - a);
        expect(keys).toEqual(sorted);
        // Tie on |trust|: first in ranked order wins the protection.
        const tied = new IdentityVault();
        const edges = Array.from({ length: 12 }, (_, i) => ({
            targetId: `warm_${i}`, trust: 0.5, familiarity: 0.6,
        }));
        edges.push({ targetId: 'twin_a', trust: 0.95, familiarity: 0 });
        edges.push({ targetId: 'twin_b', trust: 0.95, familiarity: 0 });
        tied.seal('twins', { identity: { n: 0.5 }, relationships: edges });
        const twins = tied.restore('twins').bonds.map((b) => b.targetId);
        expect(twins).toContain('twin_a');
        expect(twins).toHaveLength(12);
    });

    it('4. Seal/restore throughput stays interactive at this scale', () => {
        const pop = buildPopulation(21);
        const vault = new IdentityVault();
        const t0 = Date.now();
        sealAll(vault, pop);
        for (const snap of pop) vault.restore(snap.agentId);
        const elapsedMs = Date.now() - t0;
        // Generous bound: documents order of magnitude, not a benchmark.
        expect(elapsedMs).toBeLessThan(30000);
    });

    it('5. Same seed twice seals byte-identical bond sets (deterministic)', () => {
        const run = () => {
            const vault = new IdentityVault();
            sealAll(vault, buildPopulation(7));
            return JSON.stringify(vault.restore('villager_0'));
        };
        expect(run()).toBe(run());
    });
});
