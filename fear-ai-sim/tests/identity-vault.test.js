/**
 * @file identity-vault.test.js
 *
 * Section LXXVII: abstraction preserves the person.
 */

import { IdentityVault } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';

const TRAITS = { neuroticism: 0.3, resilience: 0.8, agreeableness: 0.6, openness: 0.5, extraversion: 0.4, loyalty: 0.9, leadership: 0.7, riskTolerance: 0.6, conscientiousness: 0.7 };

function bonds(n) {
    return Array.from({ length: n }, (_, i) => ({
        targetId: `friend_${i}`,
        trust: 0.9 - i * 0.05,
        familiarity: 0.8 - i * 0.03,
        respect: 0.5
    }));
}

describe('Section LXXVII: Identity Vault', () => {
    test('1. Seal and restore returns the same person', () => {
        const vault = new IdentityVault();
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('guard', TRAITS);
        arch.tick('guard', { trauma: 0.05 }, { fear: 0.6 });
        vault.seal('guard', {
            identity: arch.identityFor('guard'),
            adaptive: arch.adaptiveFor('guard'),
            relationships: bonds(5),
            tick: 42
        });
        const restored = vault.restore('guard');
        expect(restored.identity).toEqual(arch.identityFor('guard'));
        expect(restored.adaptive).toEqual(arch.adaptiveFor('guard'));
        expect(restored.bonds.length).toBe(5);
        expect(restored.fidelity.identityExact).toBe(true);
        expect(vault.isSealed('guard')).toBe(false);
    });

    test('2. Bond cap keeps twelve, drops the rest with a count', () => {
        const vault = new IdentityVault();
        const receipt = vault.seal('popular', { identity: TRAITS, adaptive: {}, relationships: bonds(30) });
        expect(receipt.bondsKept).toBe(12);
        expect(receipt.droppedEdges).toBe(18);
        const restored = vault.restore('popular');
        expect(restored.bonds[0].targetId).toBe('friend_0');
    });

    test('3. Abstract drift stays bounded and auditable', () => {
        const vault = new IdentityVault();
        vault.seal('scout', { identity: TRAITS, adaptive: { trauma: 0.1, confidence: 0.6 } });
        const ticks = vault.applyAbstractDrift('scout', { trauma: 0.5 }, 100);
        expect(ticks).toBe(100);
        const restored = vault.restore('scout');
        expect(restored.adaptive.trauma).toBeGreaterThan(0.1);
        expect(restored.adaptive.trauma).toBeLessThan(0.2);
        expect(restored.abstractTicks).toBe(100);
    });

    test('4. Restored characters resume identical decisions', () => {
        const vault = new IdentityVault();
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('vet', TRAITS);
        const before = arch.tick('vet', {}, { fear: 0.5, perceivedDanger: 0.5 });
        vault.seal('vet', { identity: arch.identityFor('vet'), adaptive: arch.adaptiveFor('vet') });
        const restored = vault.restore('vet');
        const arch2 = new CharacterIdentityArchitecture();
        arch2.registerCharacter('vet2', restored.identity);
        const after = arch2.tick('vet2', {}, { fear: 0.5, perceivedDanger: 0.5 });
        expect(after.topIntent).toBe(before.topIntent);
    });

    test('5. Seal protocol fails loudly and audits clean', () => {
        const vault = new IdentityVault();
        expect(() => vault.seal('x', {})).toThrow(/SEAL_NEEDS_IDENTITY/);
        vault.seal('x', { identity: TRAITS });
        expect(() => vault.seal('x', { identity: TRAITS })).toThrow(/ALREADY_SEALED/);
        expect(() => vault.restore('ghost')).toThrow(/NOT_SEALED/);
        expect(() => vault.applyAbstractDrift('ghost', {})).toThrow(/NOT_SEALED/);
        expect(vault.sealedCount()).toBe(1);
        expect(vault.auditImmutability().isClean).toBe(true);
        expect(vault.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
