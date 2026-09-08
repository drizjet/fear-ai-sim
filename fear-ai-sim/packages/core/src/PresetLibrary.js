/**
 * packages/core/src/PresetLibrary.js
 *
 * Sections 76-78 / Front B: Curated Preset Library, Behavior Cards & Designer Tuning Safety Validator.
 *
 * Provides game designers with:
 * 1. 9 Curated Canonical Presets with structured behavior cards defining expected reaction curves,
 *    strengths, vulnerabilities, and valid opportunity contexts.
 * 2. DesignerTuningSafetyValidator: Analyzes NPC configs and detects pathological states
 *    (instant panic locks, permanent immunity, hyper-sensitization explosions, contradictory agitation).
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Provides semantic configuration profiles and diagnostic parameter validation.
 */

export const CANONICAL_PRESETS = Object.freeze({
    COWARDLY_CIVILIAN: Object.freeze({
        id: 'COWARDLY_CIVILIAN',
        name: 'Cowardly Civilian',
        description: 'Easily startled townsperson or refugee who panics rapidly and recovers slowly.',
        traits: Object.freeze({
            openness: 0.30,
            conscientiousness: 0.40,
            extraversion: 0.45,
            agreeableness: 0.60,
            neuroticism: 0.90,
            resilience: 0.15,
            bravery: 0.10,
            anger: 0.05,
            leadership: 0.05
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.25,
            recoveryHalfLifeTicks: 45.0,
            contagionGain: 0.85,
            helpingUnderDanger: 0.10,
            strengths: ['Early threat detection via high vigilance', 'Quick to flee dangerous ambush areas'],
            weaknesses: ['Vulnerable to crowd panic cascades', 'Extremely slow recovery from shock'],
            validOpportunityContexts: ['Refugee columns', 'Town panic scenarios', 'Stealth horror evasion']
        })
    }),

    STOIC_VETERAN: Object.freeze({
        id: 'STOIC_VETERAN',
        name: 'Stoic Veteran',
        description: 'Hardened combatant with exceptional resilience and controlled affective response.',
        traits: Object.freeze({
            openness: 0.40,
            conscientiousness: 0.80,
            extraversion: 0.40,
            agreeableness: 0.50,
            neuroticism: 0.15,
            resilience: 0.90,
            bravery: 0.85,
            anger: 0.25,
            leadership: 0.60
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.85,
            recoveryHalfLifeTicks: 8.0,
            contagionGain: 0.15,
            helpingUnderDanger: 0.70,
            strengths: ['Immune to low/medium acoustic panics', 'Swift post-shock recovery', 'Maintains formation discipline'],
            weaknesses: ['May underestimate overwhelming supernatural or explosive threats'],
            validOpportunityContexts: ['Castle guards', 'Veteran escorts', 'Boss fight vanguard']
        })
    }),

    TRAUMATIZED_SURVIVOR: Object.freeze({
        id: 'TRAUMATIZED_SURVIVOR',
        name: 'Traumatized Survivor',
        description: 'Scout or survivor haunted by past catastrophic encounters; hyper-sensitive to trauma dread zones.',
        traits: Object.freeze({
            openness: 0.25,
            conscientiousness: 0.50,
            extraversion: 0.20,
            agreeableness: 0.45,
            neuroticism: 0.75,
            resilience: 0.30,
            bravery: 0.35,
            anger: 0.20,
            leadership: 0.10
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.40,
            recoveryHalfLifeTicks: 38.0,
            contagionGain: 0.65,
            helpingUnderDanger: 0.30,
            strengths: ['Immediate spatial avoidance of known dread/ambush zones'],
            weaknesses: ['Subject to flashback dread relapses upon sensory cue triggers'],
            validOpportunityContexts: ['Haunted settlements', 'Survival horror witnesses', 'Post-battle wanderers']
        })
    }),

    RECKLESS_RAIDER: Object.freeze({
        id: 'RECKLESS_RAIDER',
        name: 'Reckless Raider',
        description: 'Aggressive marauder who converts threat pressure into retaliatory fury rather than cowering.',
        traits: Object.freeze({
            openness: 0.50,
            conscientiousness: 0.25,
            extraversion: 0.75,
            agreeableness: 0.15,
            neuroticism: 0.30,
            resilience: 0.70,
            bravery: 0.80,
            anger: 0.85,
            leadership: 0.40
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.80,
            recoveryHalfLifeTicks: 12.0,
            contagionGain: 0.20,
            helpingUnderDanger: 0.15,
            strengths: ['Flips high fear into offensive counter-charge', 'High intimidation presence'],
            weaknesses: ['Refuses prudent tactical retreat', 'Prone to reckless overextension'],
            validOpportunityContexts: ['Bandit highwaymen', 'Berserker warbands', 'Pirate boarding parties']
        })
    }),

    PROTECTIVE_MEDIC: Object.freeze({
        id: 'PROTECTIVE_MEDIC',
        name: 'Protective Medic',
        description: 'Pro-social specialist willing to endure personal peril to aid fallen or distressed companions.',
        traits: Object.freeze({
            openness: 0.60,
            conscientiousness: 0.85,
            extraversion: 0.55,
            agreeableness: 0.90,
            neuroticism: 0.45,
            resilience: 0.70,
            bravery: 0.65,
            anger: 0.05,
            leadership: 0.50
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.65,
            recoveryHalfLifeTicks: 15.0,
            contagionGain: 0.35,
            helpingUnderDanger: 0.95,
            strengths: ['Highest helping probability per wounded ally opportunity', 'Calming social presence'],
            weaknesses: ['Self-sacrifice vulnerability under hopeless surrounded odds'],
            validOpportunityContexts: ['Military field hospitals', 'Caravan doctors', 'Defensive bunker squads']
        })
    }),

    INEXPERIENCED_GUARD: Object.freeze({
        id: 'INEXPERIENCED_GUARD',
        name: 'Inexperienced Guard',
        description: 'New recruit susceptible to false acoustic alarms and rapid peer fear contagion.',
        traits: Object.freeze({
            openness: 0.50,
            conscientiousness: 0.55,
            extraversion: 0.50,
            agreeableness: 0.50,
            neuroticism: 0.60,
            resilience: 0.40,
            bravery: 0.40,
            anger: 0.20,
            leadership: 0.15
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.50,
            recoveryHalfLifeTicks: 25.0,
            contagionGain: 0.70,
            helpingUnderDanger: 0.40,
            strengths: ['Diligent routine patrolling', 'Responsive to leader orders'],
            weaknesses: ['High false-alarm rate on ambiguous acoustic bursts', 'Slow habituation'],
            validOpportunityContexts: ['Outpost night sentries', 'Militia recruits', 'Dungeon gatekeepers']
        })
    }),

    FANATIC_WARRIOR: Object.freeze({
        id: 'FANATIC_WARRIOR',
        name: 'Fanatic Warrior',
        description: 'Zealot who maintains rigid formation discipline and rejects surrender regardless of casualties.',
        traits: Object.freeze({
            openness: 0.10,
            conscientiousness: 0.95,
            extraversion: 0.40,
            agreeableness: 0.20,
            neuroticism: 0.10,
            resilience: 0.95,
            bravery: 0.95,
            anger: 0.60,
            leadership: 0.70
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.95,
            recoveryHalfLifeTicks: 5.0,
            contagionGain: 0.05,
            helpingUnderDanger: 0.60,
            strengths: ['Zero surrender probability', 'Maximum discipline retention under horror'],
            weaknesses: ['Incapable of de-escalating diplomatic conflicts', 'Fight-to-the-death attrition'],
            validOpportunityContexts: ['Temple guardians', 'Inquisition shock troops', 'Last-stand fortresses']
        })
    }),

    CAUTIOUS_MERCHANT: Object.freeze({
        id: 'CAUTIOUS_MERCHANT',
        name: 'Cautious Merchant',
        description: 'Risk-averse trader who dynamically evaluates route safety and avoids contested corridors.',
        traits: Object.freeze({
            openness: 0.70,
            conscientiousness: 0.85,
            extraversion: 0.70,
            agreeableness: 0.75,
            neuroticism: 0.55,
            resilience: 0.50,
            bravery: 0.30,
            anger: 0.05,
            leadership: 0.45
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.45,
            recoveryHalfLifeTicks: 20.0,
            contagionGain: 0.50,
            helpingUnderDanger: 0.35,
            strengths: ['Dynamic trade rerouting upon danger perception', 'Strong negotiation preference'],
            weaknesses: ['Abandons high-profit routes at minimal threat signals'],
            validOpportunityContexts: ['Caravan convoys', 'Town market guilds', 'Diplomatic envoys']
        })
    }),

    CHARISMATIC_LEADER: Object.freeze({
        id: 'CHARISMATIC_LEADER',
        name: 'Charismatic Leader',
        description: 'Commander whose high resilience and pro-social presence actively calms panicking followers.',
        traits: Object.freeze({
            openness: 0.65,
            conscientiousness: 0.85,
            extraversion: 0.90,
            agreeableness: 0.75,
            neuroticism: 0.10,
            resilience: 0.90,
            bravery: 0.85,
            anger: 0.15,
            leadership: 0.95
        }),
        behaviorCard: Object.freeze({
            panicOnsetThreshold: 0.80,
            recoveryHalfLifeTicks: 7.0,
            contagionGain: 0.10,
            helpingUnderDanger: 0.85,
            strengths: ['High calm transmission coefficient (-40% peer panic)', 'Marshals defensive formations'],
            weaknesses: ['If broken or killed, triggers catastrophic squad rout cascade'],
            validOpportunityContexts: ['Squad commanders', 'Rebel figures', 'Expedition captains']
        })
    })
});

export class DesignerTuningSafetyValidator {
    /**
     * Validates an NPC personality/affect configuration for pathological tuning errors.
     * @param {Object} config
     * @returns {{
     *   valid: boolean,
     *   errors: Array<{ code: string, message: string }>,
     *   warnings: Array<{ code: string, message: string, severity: 'WARN'|'CRITICAL' }>
     * }}
     */
    static validate(config) {
        const errors = [];
        const warnings = [];

        if (!config || typeof config !== 'object') {
            return {
                valid: false,
                errors: [{ code: 'INVALID_CONFIG_OBJECT', message: 'Config must be a non-null object' }],
                warnings: []
            };
        }

        const traits = config.traits || config;

        // Check range bounds [0.0, 1.0] for all numerical properties
        for (const [key, val] of Object.entries(traits)) {
            if (typeof val === 'number') {
                if (Number.isNaN(val) || !Number.isFinite(val)) {
                    errors.push({
                        code: 'NAN_OR_INFINITE_VALUE',
                        message: `Trait '${key}' contains NaN or non-finite number: ${val}`
                    });
                } else if (val < 0.0 || val > 1.0) {
                    errors.push({
                        code: 'OUT_OF_BOUNDS',
                        message: `Trait '${key}' (${val}) exceeds normalized range [0.0, 1.0]`
                    });
                }
            }
        }

        if (errors.length > 0) {
            return { valid: false, errors, warnings };
        }

        const N = traits.neuroticism ?? 0.5;
        const R = traits.resilience ?? 0.5;
        const B = traits.bravery ?? 0.5;
        const A = traits.anger ?? 0.0;
        const C = traits.conscientiousness ?? 0.5;
        const habituationRate = config.habituationRate ?? 0.05;
        const recoveryRate = config.recoveryRate ?? R;

        // 1. Instant Panic Lock Check
        if (N >= 0.95 && R <= 0.05 && recoveryRate <= 0.02) {
            warnings.push({
                code: 'PATHOLOGICAL_INSTANT_PANIC_LOCK',
                message: `Neuroticism (${N}) is near maximum while Resilience (${R}) and recovery rate are near zero. Entity will lock into permanent panic upon any threat and may never recover.`,
                severity: 'CRITICAL'
            });
        }

        // 2. Permanent Immunity Check
        if (N <= 0.02 && B >= 0.98) {
            warnings.push({
                code: 'PATHOLOGICAL_PERMANENT_IMMUNITY',
                message: `Neuroticism (${N}) is near zero with Bravery (${B}) near 1.0. Entity is functionally immune to horror mechanics; affective state machine will never leave CALM.`,
                severity: 'WARN'
            });
        }

        // 3. Hyper-Sensitization Runaway
        if (habituationRate < 0.0) {
            warnings.push({
                code: 'HYPER_SENSITIZATION_EXPLOSION',
                message: `Habituation rate is negative (${habituationRate}). Repeated stimuli will cause runaway fear explosion rather than natural desensitization.`,
                severity: 'CRITICAL'
            });
        }

        // 4. Contradictory High Agitation / Chatter Flap
        if (A >= 0.90 && N >= 0.90 && C <= 0.10) {
            warnings.push({
                code: 'CONTRADICTORY_AGITATION_CHATTER',
                message: `Simultaneous maximum Anger (${A}) and Neuroticism (${N}) with minimal Conscientiousness (${C}) causes rapid flip-flopping between FIGHT and FLIGHT actions under boundary noise.`,
                severity: 'WARN'
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Gets a canonical preset by ID.
     * @param {string} presetId
     * @returns {Object|null}
     */
    static getPreset(presetId) {
        return CANONICAL_PRESETS[presetId] || null;
    }

    /**
     * Returns all canonical preset IDs.
     * @returns {Array<string>}
     */
    static listPresetIds() {
        return Object.keys(CANONICAL_PRESETS);
    }
}

export class PresetLibrary {
    static getPreset(presetId) {
        return CANONICAL_PRESETS[presetId] || null;
    }
    static listPresetIds() {
        return Object.keys(CANONICAL_PRESETS);
    }
    static getAllPresets() {
        return Object.values(CANONICAL_PRESETS);
    }
}
