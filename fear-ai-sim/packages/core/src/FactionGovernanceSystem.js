/**
 * packages/core/src/FactionGovernanceSystem.js
 *
 * Front C / Section 33: Collective Faction Governance & Deliberation Structures.
 *
 * Implements:
 * 1. 5 Distinct Governance Archetypes:
 *    - AUTOCRATIC_DESPOT: Single leader traits dominate; volatile and persona-sensitive.
 *    - MERCHANT_OLIGARCHY: Trade profit, stockpile risk, and corridor security dominate; prefers negotiation.
 *    - MILITARY_JUNTA: Martial power ratio, boundary sovereignty, and combat readiness dominate; rapid escalation.
 *    - TRIBAL_CONSENSUS: Distributed clan council requiring supermajority (>= 67%) consensus; high inertia.
 *    - ECCLESIASTICAL_DEVOUT: Moral doctrine and sanctuary sanctity dominate; low physical fear sensitivity.
 * 2. Internal Council Deliberation:
 *    - The faction produces ONE unified semantic diplomatic directive, but the internal
 *      deliberation process differs completely by governance archetype.
 * 3. Proportional Escalation & De-escalation:
 *    - Prevents single insults from causing eternal war or major attacks from being instantly forgotten.
 * 4. Preserves Host Game Authority Invariant:
 *    - Output is strictly advisory semantic directives (WARN, NEGOTIATE, MOBILIZE, ATTACK, RETREAT, ALLY).
 */

export const GOVERNANCE_ARCHETYPES = Object.freeze({
    AUTOCRATIC_DESPOT: 'AUTOCRATIC_DESPOT',
    MERCHANT_OLIGARCHY: 'MERCHANT_OLIGARCHY',
    MILITARY_JUNTA: 'MILITARY_JUNTA',
    TRIBAL_CONSENSUS: 'TRIBAL_CONSENSUS',
    ECCLESIASTICAL_DEVOUT: 'ECCLESIASTICAL_DEVOUT'
});

export const FACTION_DIRECTIVES = Object.freeze({
    OBSERVE: 'OBSERVE',
    WARN: 'WARN',
    NEGOTIATE: 'NEGOTIATE',
    PAY_TRIBUTE: 'PAY_TRIBUTE',
    TRADE_PROPOSAL: 'TRADE_PROPOSAL',
    MOBILIZE: 'MOBILIZE',
    SKIRMISH: 'SKIRMISH',
    ATTACK: 'ATTACK',
    RETREAT: 'RETREAT',
    SURRENDER: 'SURRENDER',
    ALLY: 'ALLY'
});

export class FactionGovernanceSystem {
    /**
     * @param {string} factionId
     * @param {string} archetype From GOVERNANCE_ARCHETYPES
     * @param {object} [options={}]
     */
    constructor(factionId, archetype = GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS, options = {}) {
        this.factionId = String(factionId || 'faction_0');
        this.archetype = archetype;

        // Governance specific members / council configuration
        this.leader = options.leader || null; // For AUTOCRATIC_DESPOT (traits: fear, anger, bravery, etc.)
        this.councilMembers = options.councilMembers || []; // Array of council member objects
        this.consensusThreshold = options.consensusThreshold ?? (2 / 3); // For TRIBAL_CONSENSUS (two-thirds supermajority)

        // Faction internal metrics
        this.resources = options.resources ?? 1.0;
        this.militaryReadiness = options.militaryReadiness ?? 1.0;
        this.tradeDependence = options.tradeDependence ?? 0.5;
        this.grievanceLevel = 0.0;
        this.currentDirective = FACTION_DIRECTIVES.OBSERVE;
    }

    /**
     * Deliberate an external incident or diplomatic event across internal governance structures.
     * @param {object} incident Incident details
     * @param {string} incident.type Incident type (e.g. BORDER_TRESPASS, RAID_CARAVAN, SCOUT_KILLED, PEACE_OFFER)
     * @param {number} [incident.severity=0.5] Severity of incident in [0, 1]
     * @param {string} incident.targetFactionId Adversary / counterpart faction
     * @param {object} [context={}] Additional context (power ratio, route danger, trade volume)
     * @returns {object} DeliberationResult
     */
    deliberateIncident(incident, context = {}) {
        const severity = Math.max(0.0, Math.min(1.0, incident.severity ?? 0.5));
        const powerRatio = context.powerRatio ?? 1.0; // My military / target military
        const tradeVolume = context.tradeVolume ?? 0.0;

        // Accumulate grievance based on incident severity
        this.grievanceLevel = Math.min(1.0, this.grievanceLevel + severity * 0.4);

        let directive = FACTION_DIRECTIVES.OBSERVE;
        let voteBreakdown = null;
        let rationale = '';

        switch (this.archetype) {
            case GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT:
                ({ directive, rationale } = this._deliberateAutocrat(incident, severity, powerRatio));
                break;

            case GOVERNANCE_ARCHETYPES.MERCHANT_OLIGARCHY:
                ({ directive, rationale, voteBreakdown } = this._deliberateMerchantOligarchy(incident, severity, tradeVolume, powerRatio));
                break;

            case GOVERNANCE_ARCHETYPES.MILITARY_JUNTA:
                ({ directive, rationale, voteBreakdown } = this._deliberateMilitaryJunta(incident, severity, powerRatio));
                break;

            case GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS:
                ({ directive, rationale, voteBreakdown } = this._deliberateTribalConsensus(incident, severity, powerRatio));
                break;

            case GOVERNANCE_ARCHETYPES.ECCLESIASTICAL_DEVOUT:
                ({ directive, rationale } = this._deliberateEcclesiastical(incident, severity));
                break;

            default:
                directive = FACTION_DIRECTIVES.WARN;
                rationale = 'Default fallback governance.';
        }
        // R15: succession aftermath fractures commitment. Opt-in context
        // carries the SuccessionEngine aftermath: splinterRisk [0,1],
        // leaderVacant bool (interregnum, no successor), cohesion [0,1].
        // A headless autocracy can will nothing (councils survive their
        // leaders); a fractured faction steps high-commitment directives
        // down one rung. Absent/garbage reproduces legacy exactly.
        const rawRisk = Number(context.splinterRisk);
        const splinterRisk = Number.isFinite(rawRisk) ? Math.max(0, Math.min(1, rawRisk)) : 0;
        const rawCohesion = Number(context.cohesion);
        const cohesion = Number.isFinite(rawCohesion) ? Math.max(0, Math.min(1, rawCohesion)) : 1;
        const fractured = splinterRisk >= 0.5 || cohesion <= 0.35;
        if (context.leaderVacant === true && this.archetype === GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT) {
            rationale = `Headless autocracy cannot will ${directive}: no successor enthroned; the apparatus watches and waits.`;
            directive = FACTION_DIRECTIVES.OBSERVE;
        } else if (fractured) {
            const stepDown = {
                [FACTION_DIRECTIVES.ATTACK]: FACTION_DIRECTIVES.MOBILIZE,
                [FACTION_DIRECTIVES.SKIRMISH]: FACTION_DIRECTIVES.MOBILIZE,
                [FACTION_DIRECTIVES.MOBILIZE]: FACTION_DIRECTIVES.WARN
            };
            if (stepDown[directive]) {
                rationale = `${rationale} Fractured council (splinter risk ${splinterRisk.toFixed(2)}) could not commit to ${directive}; stepped down to ${stepDown[directive]}.`;
                directive = stepDown[directive];
            }
        }

        this.currentDirective = directive;

        return {
            factionId: this.factionId,
            archetype: this.archetype,
            incidentType: incident.type,
            directive,
            rationale,
            voteBreakdown,
            grievanceLevel: Number(this.grievanceLevel.toFixed(4)),
            isHostAuthoritative: true
        };
    }

    /**
     * Autocratic Despot: Sole leader's personal affective traits dominate.
     * @private
     */
    _deliberateAutocrat(incident, severity, powerRatio) {
        const leader = this.leader || {
            fear: 0.2,
            anger: 0.6,
            bravery: 0.7,
            neuroticism: 0.4
        };

        const effectiveAnger = leader.anger * (1.0 + severity * 0.5);
        const effectiveFear = leader.fear * (1.0 + (1.0 / Math.max(0.1, powerRatio)) * 0.5);

        if (effectiveFear > 0.75) {
            return {
                directive: FACTION_DIRECTIVES.RETREAT,
                rationale: `Despot terrified by threat (fear: ${effectiveFear.toFixed(2)}); ordered retreat.`
            };
        }

        if (effectiveAnger > 0.70 && leader.bravery > 0.40) {
            const directive = powerRatio >= 0.85 ? FACTION_DIRECTIVES.ATTACK : FACTION_DIRECTIVES.MOBILIZE;
            return {
                directive,
                rationale: `Despot enraged by incident (anger: ${effectiveAnger.toFixed(2)}); ordered ${directive}.`
            };
        }

        if (severity > 0.40) {
            return {
                directive: FACTION_DIRECTIVES.WARN,
                rationale: `Despot issued stern sovereign warning.`
            };
        }

        return {
            directive: FACTION_DIRECTIVES.OBSERVE,
            rationale: `Despot dismissed minor incident.`
        };
    }

    /**
     * Merchant Oligarchy: Prioritizes commerce, trade corridor continuity, and profit.
     * @private
     */
    _deliberateMerchantOligarchy(incident, severity, tradeVolume, powerRatio) {
        // Council of 4 trade guildmasters
        const council = this.councilMembers.length >= 3 ? this.councilMembers : [
            { name: 'Guildmaster Silk', riskTolerance: 0.2 },
            { name: 'Guildmaster Grain', riskTolerance: 0.4 },
            { name: 'Guildmaster Metal', riskTolerance: 0.6 },
            { name: 'Guildmaster Spice', riskTolerance: 0.3 }
        ];

        let warVotes = 0;
        let negotiateVotes = 0;

        for (const member of council) {
            // Highly profitable trade favors negotiation/appeasement over war
            if (tradeVolume > 20 && member.riskTolerance < 0.5) {
                negotiateVotes++;
            } else if (severity >= 0.80 && powerRatio >= 1.2) {
                warVotes++;
            } else {
                negotiateVotes++;
            }
        }

        if (warVotes > negotiateVotes) {
            return {
                directive: FACTION_DIRECTIVES.MOBILIZE,
                rationale: `Merchant council voted ${warVotes}-${negotiateVotes} to mobilize security forces to protect trade interests.`,
                voteBreakdown: { warVotes, negotiateVotes, totalCouncil: council.length }
            };
        }

        if (severity >= 0.60 && this.resources >= 0.50) {
            return {
                directive: FACTION_DIRECTIVES.PAY_TRIBUTE,
                rationale: `Merchant council resolved to pay bribe/tribute to maintain uninterrupted trade corridors.`,
                voteBreakdown: { warVotes, negotiateVotes, totalCouncil: council.length }
            };
        }

        return {
            directive: FACTION_DIRECTIVES.NEGOTIATE,
            rationale: `Merchant council voted to seek commercial diplomatic settlement.`,
            voteBreakdown: { warVotes, negotiateVotes, totalCouncil: council.length }
        };
    }

    /**
     * Military Junta: Martial supremacy, boundary sovereignty, and power ratios dominate.
     * @private
     */
    _deliberateMilitaryJunta(incident, severity, powerRatio) {
        const council = this.councilMembers.length >= 3 ? this.councilMembers : [
            { name: 'General Vanguard', aggression: 0.8 },
            { name: 'Admiral Flank', aggression: 0.7 },
            { name: 'Marshal Defense', aggression: 0.5 }
        ];

        if (this.militaryReadiness < 0.25) {
            return {
                directive: FACTION_DIRECTIVES.RETREAT,
                rationale: 'Military Junta acknowledged shattered readiness; tactical withdrawal ordered.',
                voteBreakdown: { readiness: this.militaryReadiness }
            };
        }

        if (severity >= 0.50 || powerRatio >= 1.0) {
            const directive = powerRatio >= 1.3 ? FACTION_DIRECTIVES.ATTACK : FACTION_DIRECTIVES.MOBILIZE;
            return {
                directive,
                rationale: `Military high command approved martial offensive (${directive}) based on favorable strength ratio (${powerRatio.toFixed(2)}).`,
                voteBreakdown: { powerRatio, readiness: this.militaryReadiness }
            };
        }

        return {
            directive: FACTION_DIRECTIVES.WARN,
            rationale: `Military high command deployed forward scouts and issued ultimatum.`,
            voteBreakdown: { powerRatio }
        };
    }

    /**
     * Tribal Consensus: Clan council requiring supermajority (>= 67%) to escalate.
     * @private
     */
    _deliberateTribalConsensus(incident, severity, powerRatio) {
        const elders = this.councilMembers.length >= 5 ? this.councilMembers : [
            { name: 'Elder Bear', hawkishness: 0.8 },
            { name: 'Elder Wolf', hawkishness: 0.7 },
            { name: 'Elder Deer', hawkishness: 0.2 },
            { name: 'Elder Owl', hawkishness: 0.3 },
            { name: 'Elder Raven', hawkishness: 0.4 },
            { name: 'Elder Boar', hawkishness: 0.6 }
        ];

        let escalateVotes = 0;
        for (const elder of elders) {
            // Elder votes to escalate if incident severity + hawkishness + grievance exceeds threshold
            const pressure = severity * 0.5 + elder.hawkishness * 0.3 + this.grievanceLevel * 0.2;
            if (pressure >= 0.65) {
                escalateVotes++;
            }
        }

        const ratio = escalateVotes / elders.length;
        const reachedSupermajority = ratio >= this.consensusThreshold;

        if (reachedSupermajority) {
            return {
                directive: powerRatio >= 1.0 ? FACTION_DIRECTIVES.MOBILIZE : FACTION_DIRECTIVES.SKIRMISH,
                rationale: `Tribal clan council achieved supermajority (${escalateVotes}/${elders.length} = ${(ratio * 100).toFixed(1)}% >= ${this.consensusThreshold * 100}%); approved mobilization.`,
                voteBreakdown: { escalateVotes, totalElders: elders.length, ratio, threshold: this.consensusThreshold }
            };
        }

        return {
            directive: FACTION_DIRECTIVES.WARN,
            rationale: `Clan council failed to achieve supermajority (${escalateVotes}/${elders.length} = ${(ratio * 100).toFixed(1)}% < ${this.consensusThreshold * 100}%); escalation blocked.`,
            voteBreakdown: { escalateVotes, totalElders: elders.length, ratio, threshold: this.consensusThreshold }
        };
    }

    /**
     * Ecclesiastical Devout: Religious doctrine and sanctuary violations dominate.
     * @private
     */
    _deliberateEcclesiastical(incident, severity) {
        const isSanctuaryViolation = incident.type === 'SANCTUARY_DESECRATED' || incident.type === 'HOLY_SHRINE_RAID';

        if (isSanctuaryViolation) {
            return {
                directive: FACTION_DIRECTIVES.ATTACK,
                rationale: 'Priesthood declared sacred crusade following desecration of holy sanctuary.'
            };
        }

        if (severity >= 0.70) {
            return {
                directive: FACTION_DIRECTIVES.WARN,
                rationale: 'Priesthood issued divine censure and warned of righteous retribution.'
            };
        }

        return {
            directive: FACTION_DIRECTIVES.OBSERVE,
            rationale: 'Priesthood offered prayers for peace and observed from temple sanctuary.'
        };
    }
}
