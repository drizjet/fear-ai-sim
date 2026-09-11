import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';

// NEXT-132: duty and role identity as first-class traits (CCI-28
// frontier 16). Duty is a continuous scalar that stiffens stand/help/rally
// with a neutral center (0.5 = legacy output bit-identical); role is an
// advisory tag that never gates behavior by itself.
describe('NEXT-132: duty and role identity traits', () => {
    const BASE = { resilience: 0.6, conscientiousness: 0.5, loyalty: 0.5, neuroticism: 0.4, agreeableness: 0.5, extraversion: 0.5, leadership: 0.4 };

    it('1. Duty 0.5 reproduces legacy decide values exactly', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('plain', BASE);
        c.registerCharacter('neutral', { ...BASE, duty: 0.5 });
        const { agentId: _p, ...plain } = c.decide('plain');
        const { agentId: _n, ...neutral } = c.decide('neutral');
        expect(neutral).toEqual(plain);
    });

    it('2. High duty stiffens stand/help/rally, low duty relaxes them', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('dutiful', { ...BASE, duty: 1.0 });
        c.registerCharacter('lax', { ...BASE, duty: 0.0 });
        const d = c.decide('dutiful');
        const l = c.decide('lax');
        expect(d.tendencies.stand).toBeGreaterThan(l.tendencies.stand);
        expect(d.tendencies.help).toBeGreaterThan(l.tendencies.help);
        expect(d.tendencies.rally).toBeGreaterThan(l.tendencies.rally);
        // Duty never touches flee or investigate channels.
        expect(d.tendencies.flee).toBe(l.tendencies.flee);
        expect(d.tendencies.investigate).toBe(l.tendencies.investigate);
    });

    it('3. Role tag surfaces in frames but never alters tendencies', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('guard', BASE, { role: 'GUARD' });
        c.registerCharacter('civ', BASE, { role: '' });
        const g = c.decide('guard');
        expect(g.role).toBe('GUARD');
        expect(c.roleFor('guard')).toBe('GUARD');
        expect(c.roleFor('civ')).toBe('');
        expect(c.roleFor('ghost')).toBeNull();
        const v = c.decide('civ');
        expect({ ...g.tendencies }).toEqual({ ...v.tendencies });
    });

    it('4. Duty and role round-trip through snapshots', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('a', { ...BASE, duty: 0.9 }, { role: 'MEDIC' });
        const c2 = new CharacterIdentityArchitecture();
        c2.setState(JSON.parse(JSON.stringify(c.getState())));
        expect(c2.identityFor('a').duty).toBe(0.9);
        expect(c2.roleFor('a')).toBe('MEDIC');
        expect(c2.decide('a')).toEqual(c.decide('a'));
    });

    it('5. Agent forwards duty overrides and role to the architecture', () => {
        const arch = new CharacterIdentityArchitecture();
        const a = new AffectiveAgent('r1', { neuroticism: 0.4 }, {
            seed: 'role-seed',
            identityArchitecture: arch,
            identityBlend: 1.0,
            identityTraits: { duty: 1.0 },
            identityRole: 'GUARD'
        });
        expect(arch.roleFor('r1')).toBe('GUARD');
        const r = a.tick(0.016, {});
        expect(r.identity_frame.role).toBe('GUARD');
        expect(arch.identityFor('r1').duty).toBe(1.0);
    });

    it('6. Registers deterministically under repetition', () => {
        const run = () => {
            const c = new CharacterIdentityArchitecture();
            c.registerCharacter('x', { ...BASE, duty: 0.75 }, { role: 'SCOUT' });
            return c.decide('x');
        };
        expect(run()).toEqual(run());
    });
});
