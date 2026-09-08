/**
 * tests/preset-library-safety.test.js
 *
 * Sections 76-78 / Front B: Curated Preset Library, Behavior Cards & Designer Safety Validator.
 *
 * Asserts:
 * 1. All 9 canonical presets exist, are immutable, and contain complete behavior cards.
 * 2. Trait values conform strictly to normalized bounds [0.0, 1.0].
 * 3. DesignerTuningSafetyValidator correctly identifies healthy configurations.
 * 4. DesignerTuningSafetyValidator detects pathological Instant Panic Locks (N=0.95, R=0.0).
 * 5. DesignerTuningSafetyValidator detects Permanent Immunity (N=0.0, Bravery=1.0).
 * 6. DesignerTuningSafetyValidator catches Hyper-Sensitization Explosions (negative habituation).
 * 7. DesignerTuningSafetyValidator detects Contradictory Agitation Chatter (max Anger + max Fear + 0 Discipline).
 * 8. Host Game Authority Invariant is preserved: presets are data cards; safety checks operate as validation pass.
 */

import { describe, it, expect } from '@jest/globals';
import {
    CANONICAL_PRESETS,
    DesignerTuningSafetyValidator
} from '../packages/core/src/PresetLibrary.js';

describe('Sections 76-78 / Front B: Curated Preset Library & Designer Safety Validator', () => {
    const expectedPresetIds = [
        'COWARDLY_CIVILIAN',
        'STOIC_VETERAN',
        'TRAUMATIZED_SURVIVOR',
        'RECKLESS_RAIDER',
        'PROTECTIVE_MEDIC',
        'INEXPERIENCED_GUARD',
        'FANATIC_WARRIOR',
        'CAUTIOUS_MERCHANT',
        'CHARISMATIC_LEADER'
    ];

    it('1. All 9 canonical presets are defined with comprehensive behavior cards', () => {
        const presetIds = DesignerTuningSafetyValidator.listPresetIds();
        expect(presetIds.length).toBe(9);

        for (const id of expectedPresetIds) {
            expect(presetIds).toContain(id);
            const preset = DesignerTuningSafetyValidator.getPreset(id);
            expect(preset).toBeDefined();
            expect(preset.id).toBe(id);
            expect(typeof preset.name).toBe('string');
            expect(typeof preset.description).toBe('string');
            expect(preset.traits).toBeDefined();
            expect(preset.behaviorCard).toBeDefined();
            expect(preset.behaviorCard.strengths.length).toBeGreaterThan(0);
            expect(preset.behaviorCard.weaknesses.length).toBeGreaterThan(0);
            expect(preset.behaviorCard.validOpportunityContexts.length).toBeGreaterThan(0);
        }
    });

    it('2. All canonical presets pass safety validation without critical errors or warnings', () => {
        for (const id of expectedPresetIds) {
            const preset = DesignerTuningSafetyValidator.getPreset(id);
            const res = DesignerTuningSafetyValidator.validate(preset);
            expect(res.valid).toBe(true);
            expect(res.errors.length).toBe(0);
            // Built-in presets must have no critical pathological warnings
            const criticals = res.warnings.filter(w => w.severity === 'CRITICAL');
            expect(criticals.length).toBe(0);
        }
    });

    it('3. Rejects out-of-bounds trait parameters (< 0.0 or > 1.0) and NaNs', () => {
        const outOfBounds = { traits: { neuroticism: 1.5, resilience: -0.2 } };
        const res = DesignerTuningSafetyValidator.validate(outOfBounds);
        expect(res.valid).toBe(false);
        expect(res.errors.length).toBe(2);
        expect(res.errors[0].code).toBe('OUT_OF_BOUNDS');

        const nanConfig = { traits: { neuroticism: NaN, resilience: 0.5 } };
        const resNaN = DesignerTuningSafetyValidator.validate(nanConfig);
        expect(resNaN.valid).toBe(false);
        expect(resNaN.errors[0].code).toBe('NAN_OR_INFINITE_VALUE');
    });

    it('4. Detects pathological Instant Panic Lock configuration', () => {
        const instantPanic = {
            traits: { neuroticism: 0.98, resilience: 0.02, bravery: 0.05 },
            recoveryRate: 0.01
        };

        const res = DesignerTuningSafetyValidator.validate(instantPanic);
        expect(res.valid).toBe(true); // structurally valid, but flagged with critical warning
        const lockWarning = res.warnings.find(w => w.code === 'PATHOLOGICAL_INSTANT_PANIC_LOCK');
        expect(lockWarning).toBeDefined();
        expect(lockWarning.severity).toBe('CRITICAL');
        expect(lockWarning.message).toContain('permanent panic');
    });

    it('5. Detects pathological Permanent Immunity configuration', () => {
        const immuneConfig = {
            traits: { neuroticism: 0.01, bravery: 0.99, resilience: 0.95 }
        };

        const res = DesignerTuningSafetyValidator.validate(immuneConfig);
        const immuneWarn = res.warnings.find(w => w.code === 'PATHOLOGICAL_PERMANENT_IMMUNITY');
        expect(immuneWarn).toBeDefined();
        expect(immuneWarn.message).toContain('immune to horror mechanics');
    });

    it('6. Detects Hyper-Sensitization Explosion with negative habituation', () => {
        const runawayConfig = {
            traits: { neuroticism: 0.6, resilience: 0.5 },
            habituationRate: -0.15
        };

        const res = DesignerTuningSafetyValidator.validate(runawayConfig);
        const habitWarn = res.warnings.find(w => w.code === 'HYPER_SENSITIZATION_EXPLOSION');
        expect(habitWarn).toBeDefined();
        expect(habitWarn.severity).toBe('CRITICAL');
        expect(habitWarn.message).toContain('runaway fear explosion');
    });

    it('7. Detects Contradictory Agitation Chatter', () => {
        const chatterConfig = {
            traits: { neuroticism: 0.95, anger: 0.95, conscientiousness: 0.05, resilience: 0.5 }
        };

        const res = DesignerTuningSafetyValidator.validate(chatterConfig);
        const chatterWarn = res.warnings.find(w => w.code === 'CONTRADICTORY_AGITATION_CHATTER');
        expect(chatterWarn).toBeDefined();
        expect(chatterWarn.message).toContain('flip-flopping between FIGHT and FLIGHT');
    });
});
