import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';

// NEXT-114: CIA opt-in blend (wire-or-retire triage execution). Default-off
// agents must behave bit-identically to legacy agents; blend > 0 modulates
// resolved intent urgency along the matching tendency axis, deterministically.
describe('NEXT-114: opt-in CIA identity blend', () => {
    const COWARD = { neuroticism: 0.9, fear: 0.85, resilience: 0.2 };
    const BRAVE = { neuroticism: 0.15, fear: 0.15, resilience: 0.9, leadership: 0.8 };
    const tick4 = (agent, obs) => {
        let r;
        for (let i = 0; i < 4; i++) r = agent.tick(0.016, obs);
        return r;
    };

    it('1. Default construction carries no identity frame and no new keys', () => {
        const a = new AffectiveAgent('n114_plain', COWARD, {});
        const r = a.tick(0.016, { threats: [{ id: 't', intensity: 0.5, distance: 10 }] });
        expect('identity_frame' in r).toBe(false);
    });

    it('2. Attached blend-0 agent is bit-identical to a detached agent', () => {
        const obs = { threats: [{ id: 't', intensity: 0.55, distance: 10 }] };
        const plain = new AffectiveAgent('n114', COWARD, {});
        const off = new AffectiveAgent('n114', COWARD, {
            identityArchitecture: new CharacterIdentityArchitecture(),
            identityBlend: 0
        });
        let rp;
        let ro;
        for (let i = 0; i < 4; i++) {
            rp = plain.tick(0.016, obs);
            ro = off.tick(0.016, obs);
        }
        expect(ro).toEqual(rp);
    });

    it('3. Blend raises FLEE urgency for a flee-prone persona', () => {
        const obs = { threats: [{ id: 't', intensity: 0.55, distance: 10 }] };
        const plain = new AffectiveAgent('cow', COWARD, {});
        const blended = new AffectiveAgent('cow', COWARD, {
            identityArchitecture: new CharacterIdentityArchitecture(),
            identityBlend: 1
        });
        const rp = tick4(plain, obs);
        const rb = tick4(blended, obs);
        expect(rp.action_intent.type).toBe('FLEE_FROM');
        expect(rb.action_intent.type).toBe('FLEE_FROM');
        expect(rb.action_intent.urgency).toBeGreaterThan(rp.action_intent.urgency);
        expect(rb.identity_frame.tendencies.flee).toBeGreaterThan(0.5);
        expect(rb.identity_frame.topIntent).toBe('flee');
    });

    it('4. Blend lowers FLEE urgency for a stand-prone persona', () => {
        const obs = { threats: [{ id: 't', intensity: 0.9, distance: 5 }] };
        const plain = new AffectiveAgent('brv', BRAVE, {});
        const blended = new AffectiveAgent('brv', BRAVE, {
            identityArchitecture: new CharacterIdentityArchitecture(),
            identityBlend: 1
        });
        const rp = tick4(plain, obs);
        const rb = tick4(blended, obs);
        expect(rp.action_intent.type).toBe('FLEE_FROM');
        expect(rb.action_intent.type).toBe('FLEE_FROM');
        expect(rb.action_intent.urgency).toBeLessThan(rp.action_intent.urgency);
    });

    it('5. Blended runs are deterministic across identical constructions', () => {
        const run = () => {
            const a = new AffectiveAgent('det', COWARD, {
                identityArchitecture: new CharacterIdentityArchitecture(),
                identityBlend: 1
            });
            return tick4(a, { threats: [{ id: 't', intensity: 0.9, distance: 3 }] });
        };
        expect(run()).toEqual(run());
    });

    it('6. Identity traits seed from agent traits and accept overrides', () => {
        const arch = new CharacterIdentityArchitecture();
        const a = new AffectiveAgent('seed', COWARD, {
            identityArchitecture: arch,
            identityBlend: 1,
            identityTraits: { leadership: 0.95 }
        });
        a.tick(0.016, {});
        expect(arch.identityFor('seed').leadership).toBe(0.95);
        expect(arch.identityFor('seed').neuroticism).toBe(COWARD.neuroticism);
    });
});
