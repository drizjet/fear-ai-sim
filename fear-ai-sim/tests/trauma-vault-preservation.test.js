import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { TraumaCrystallizationEngine } from '../packages/core/index.js';
import { IdentityVault } from '../packages/core/index.js';
import { LodDirector } from '../packages/core/index.js';
import { LodVaultCycle } from '../packages/core/index.js';

// NEXT-119: trauma preservation across vault seal/restore (CCI-28 frontier 3).
// A sealed-then-restored agent keeps its fears, not just its traits.
describe('NEXT-119: trauma across vault seal/restore', () => {
    const T = { neuroticism: 0.8, fear: 0.9, resilience: 0.3 };
    const TERROR = { threats: [{ id: 't', type: 'WOLF', intensity: 1.0, distance: 2 }] };
    const PROBE = { sensoryCues: [{ category: 'PREDATOR_TYPE', cue: 'WOLF', intensity: 0.5 }] };
    const traumatize = (id, seed) => {
        const eng = new TraumaCrystallizationEngine();
        const ag = new AffectiveAgent(id, T, { seed, traumaEngine: eng });
        for (let i = 0; i < 200; i++) ag.tick(0.016, TERROR);
        return { eng, ag };
    };

    it('1. No trauma history snapshots to null', () => {
        const eng = new TraumaCrystallizationEngine();
        eng.registerAgent('fresh', T);
        expect(eng.agentTraumaSnapshot('fresh')).toBe(null);
        expect(eng.agentTraumaSnapshot('unknown')).toBe(null);
    });

    it('2. Seal carries trauma; restore returns it with dread intact', () => {
        const { eng } = traumatize('s', 's119');
        const vault = new IdentityVault();
        const receipt = vault.seal('s', {
            identity: { neuroticism: 0.8 },
            adaptive: {},
            trauma: eng.agentTraumaSnapshot('s')
        });
        expect(receipt.traumaSealed).toBe(true);
        const back = vault.restore('s');
        expect(back.fidelity.traumaExact).toBe(true);
        const eng2 = new TraumaCrystallizationEngine();
        expect(eng2.restoreAgentTrauma('s', back.trauma)).toBe(true);
        expect(eng2.evaluateAgentState('s', PROBE).phobicDread)
            .toBe(eng.evaluateAgentState('s', PROBE).phobicDread);
        expect(eng2.evaluateAgentState('s', PROBE).phobicDread).toBeGreaterThan(0);
    });

    it('3. Seal without trauma still works and reports honestly', () => {
        const vault = new IdentityVault();
        const receipt = vault.seal('plain', { identity: { neuroticism: 0.5 }, adaptive: {} });
        expect(receipt.traumaSealed).toBe(false);
        const back = vault.restore('plain');
        expect(back.trauma).toBe(null);
        expect(back.fidelity.traumaExact).toBe(false);
    });

    it('4. Vault save/load keeps the sealed trauma blob', () => {
        const { eng } = traumatize('v', 'v119');
        const vault = new IdentityVault();
        vault.seal('v', {
            identity: { neuroticism: 0.8 },
            adaptive: {},
            trauma: eng.agentTraumaSnapshot('v')
        });
        const vaultB = new IdentityVault();
        vaultB.setState(JSON.parse(JSON.stringify(vault.getState())));
        const back = vaultB.restore('v');
        expect(back.fidelity.traumaExact).toBe(true);
        const eng2 = new TraumaCrystallizationEngine();
        eng2.restoreAgentTrauma('v', back.trauma);
        expect(eng2.evaluateAgentState('v', PROBE).phobicDread)
            .toBe(eng.evaluateAgentState('v', PROBE).phobicDread);
    });

    it('5. Full LOD cycle preserves trauma across demote and promote', () => {
        const { eng } = traumatize('scout', 'scout119');
        const director = new LodDirector({ demoteHysteresisTicks: 1, promoteHysteresisTicks: 1 });
        const vault = new IdentityVault();
        const consumed = {};
        const cycle = new LodVaultCycle({
            director,
            vault,
            snapshotProvider: (id) => ({
                identity: { neuroticism: 0.8 },
                adaptive: {},
                trauma: eng.agentTraumaSnapshot(id)
            }),
            restoreConsumer: (id, state) => {
                consumed[id] = state;
                eng.restoreAgentTrauma(id, state.trauma);
            }
        });
        director.register('scout', { priority: 0.0 });
        director.observe('scout', { fear: 0.0, visible: false });
        for (let i = 0; i < 4; i++) cycle.step({ lod0Cap: 1, lod1Cap: 1 });
        expect(vault.isSealed('scout')).toBe(true);
        // Engine record dropped while abstracted (host owns live engines).
        eng.agentRecords.delete('scout');
        eng.phobicRegistry.agentPhobias.delete('scout');
        director.observe('scout', { fear: 0.9, visible: true, priority: 1.0 });
        for (let i = 0; i < 4; i++) cycle.step({ lod0Cap: 1, lod1Cap: 1 });
        expect(vault.isSealed('scout')).toBe(false);
        expect(consumed.scout.fidelity.traumaExact).toBe(true);
        expect(eng.evaluateAgentState('scout', PROBE).phobicDread).toBeGreaterThan(0);
    });

    it('6. Restored-then-retraumatized agent does not double-count floors', () => {
        const { eng } = traumatize('w', 'w119');
        const floorBefore = eng.agentRecords.get('w').quiescentFearFloor;
        const vault = new IdentityVault();
        vault.seal('w', {
            identity: { neuroticism: 0.8 },
            adaptive: {},
            trauma: eng.agentTraumaSnapshot('w')
        });
        const back = vault.restore('w');
        const eng2 = new TraumaCrystallizationEngine();
        eng2.restoreAgentTrauma('w', back.trauma);
        expect(eng2.agentRecords.get('w').quiescentFearFloor).toBe(floorBefore);
    });
});
