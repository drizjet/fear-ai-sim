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

    it('2. Kept edges are the exact top-12 by |trust|+familiarity; restore is exact', () => {
        const pop = buildPopulation(7);
        const vault = new IdentityVault();
        sealAll(vault, pop);
        for (const snap of pop) {
            const expected = [...snap.relationships]
                .sort((a, b) => (Math.abs(b.trust) + b.familiarity) - (Math.abs(a.trust) + a.familiarity))
                .slice(0, 12);
            const restored = vault.restore(snap.agentId);
            expect(restored.bonds).toEqual(expected);
            expect(restored.identity).toEqual(snap.identity);
            expect(restored.adaptive).toEqual(snap.adaptive);
            expect(restored.fidelity.identityExact).toBe(true);
        }
    });

    it('3. FALSIFIER FIRED: the cap drops strongest-trust bonds (pinned finding)', () => {
        // The rank key couples trust with familiarity, so a pure-trust
        // champion with low familiarity loses to twelve lukewarm familiar
        // edges. Measured over five deterministic populations (120 agents,
        // 30 uniform-random edges each): 85 of 600 agents lose their single
        // strongest-trust bond, 83 of those with |trust| > 0.9. This is a
        // pinned FINDING, not a code failure: the vault behaves exactly as
        // designed (test 2 proves rank-exactness), but the design drops
        // near-maximum-trust bonds under dense edge lists. Follow-up: a
        // champion-protecting rank (e.g. always keep argmax-|trust|) or a
        // raised/configurable cap with perf data from test 4. The seal
        // receipt already reports droppedEdges so hosts can detect pressure.
        let losses = 0;
        let strongLosses = 0;
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
                if (!restored.bonds.some((b) => b.targetId === champ.targetId)) {
                    losses += 1;
                    if (Math.abs(champ.trust) > 0.9) strongLosses += 1;
                }
            }
        }
        expect(checked).toBe(AGENTS * 5);
        expect(losses).toBe(85);
        expect(strongLosses).toBe(83);
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
