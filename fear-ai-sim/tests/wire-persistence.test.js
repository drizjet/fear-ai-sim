import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';
import { TraumaCrystallizationEngine } from '../packages/core/index.js';
import { IdentityVault } from '../packages/core/index.js';

// NEXT-117: persistence round-trips for the three new wires (CCI-28 frontier 1).
// Engine instances stay host-owned; snapshots are JSON-safe plain data.
describe('NEXT-117: wire persistence round-trips', () => {
    const clone = (s) => JSON.parse(JSON.stringify(s));

    it('1. CIA identity plus adaptive plus drift round-trip exactly', () => {
        const a = new CharacterIdentityArchitecture();
        a.registerCharacter('a', { neuroticism: 0.8 }, { constraints: ['HOLD_POST'] });
        a.tick('a', { trauma: 0.1 }, { fear: 0.7 });
        const b = new CharacterIdentityArchitecture();
        b.setState(clone(a.getState()));
        expect(b.identityFor('a')).toEqual(a.identityFor('a'));
        expect(b.adaptiveFor('a')).toEqual(a.adaptiveFor('a'));
        expect(b.drift('a')).toBe(a.drift('a'));
        const situation = { fear: 0.7 };
        a.tick('a', {}, situation);
        b.tick('a', {}, situation);
        expect(b.decide('a').tendencies).toEqual(a.decide('a').tendencies);
    });

    it('2. Trauma records plus conditioned phobias round-trip exactly', () => {
        const T = { neuroticism: 0.8, fear: 0.9, resilience: 0.3 };
        const eng = new TraumaCrystallizationEngine();
        const ag = new AffectiveAgent('v', T, { seed: 'v117', traumaEngine: eng });
        const terror = { threats: [{ id: 't', type: 'WOLF', intensity: 1.0, distance: 2 }] };
        for (let i = 0; i < 200; i++) ag.tick(0.016, terror);
        const engB = new TraumaCrystallizationEngine();
        engB.setState(clone(eng.getState()));
        const cues = { sensoryCues: [{ category: 'PREDATOR_TYPE', cue: 'WOLF', intensity: 0.5 }] };
        expect(engB.evaluateAgentState('v', cues).phobicDread)
            .toBe(eng.evaluateAgentState('v', cues).phobicDread);
        expect(engB.evaluateAgentState('v', cues).phobicDread).toBeGreaterThan(0);
        expect(engB.agentRecords.get('v').quiescentFearFloor)
            .toBe(eng.agentRecords.get('v').quiescentFearFloor);
    });

    it('3. Sealed vault records restore with bonds and drift intact', () => {
        const vault = new IdentityVault();
        vault.seal('s', {
            identity: { neuroticism: 0.6 },
            adaptive: { trust: 0.7 },
            relationships: [{ targetId: 'c', trust: 0.9, familiarity: 0.8 }],
            tick: 5
        });
        vault.applyAbstractDrift('s', { trust: 50 }, 10);
        const vaultB = new IdentityVault();
        vaultB.setState(clone(vault.getState()));
        expect(vaultB.isSealed('s')).toBe(true);
        const back = vaultB.restore('s');
        expect(back.adaptive.trust).toBeGreaterThan(0.7);
        expect(back.bonds[0].targetId).toBe('c');
        expect(back.abstractTicks).toBe(10);
        expect(back.fidelity.identityExact).toBe(true);
    });

    it('4. Restored mid-episode agent incurs no duplicate trauma', () => {
        const T = { neuroticism: 0.8, fear: 0.9, resilience: 0.3 };
        const terror = { threats: [{ id: 't', type: 'WOLF', intensity: 1.0, distance: 2 }] };
        const eng = new TraumaCrystallizationEngine();
        const ag = new AffectiveAgent('dup', T, { seed: 'dup117', traumaEngine: eng });
        ag.tick(0.016, terror);
        ag.tick(0.016, terror);
        expect(eng.agentRecords.get('dup').activeTraumas.length).toBe(1);
        // Save mid-episode, restore into a fresh agent on the same engine.
        const snap = clone(ag.getState());
        const ag2 = new AffectiveAgent('dup', T, { seed: 'dup117', traumaEngine: eng });
        ag2.setState(snap);
        for (let i = 0; i < 10; i++) ag2.tick(0.016, terror);
        const rec = eng.agentRecords.get('dup');
        expect(rec.activeTraumas.length + rec.crystallizedTraumas.length).toBe(1);
    });

    it('5. Wire config round-trips through agent state', () => {
        const ag = new AffectiveAgent('cfg', {}, {
            seed: 'cfg117',
            identityBlend: 0.5,
            traumaFearThreshold: 0.7,
            traumaRearmDelta: 0.15,
            traumaAdvanceClock: false
        });
        const ag2 = new AffectiveAgent('cfg', {}, { seed: 'cfg117' });
        ag2.setState(clone(ag.getState()));
        expect(ag2.identityBlend).toBe(0.5);
        expect(ag2.traumaFearThreshold).toBe(0.7);
        expect(ag2.traumaRearmDelta).toBe(0.15);
        expect(ag2.traumaAdvanceClock).toBe(false);
    });

    it('6. Snapshots are JSON-stable strings', () => {
        const cia = new CharacterIdentityArchitecture();
        cia.registerCharacter('j', { openness: 0.3 });
        const vault = new IdentityVault();
        vault.seal('j', { identity: { openness: 0.3 }, adaptive: {} });
        for (const s of [cia.getState(), vault.getState()]) {
            expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
        }
    });
});
