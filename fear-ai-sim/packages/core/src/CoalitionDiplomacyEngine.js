/**
 * packages/core/src/CoalitionDiplomacyEngine.js
 *
 * Frontier C / Sections 130–135:
 * Multi-Settlement Alliances, Dynamic Treaties, Diplomatic Espionage & Coalition Warfare Escalation.
 *
 * Implements:
 * 1. Multilateral Coalitions & Defense Pacts:
 *    - Alliances of 2+ factions with leader/hegemon, shared external threat bonding, and dynamic cohesion index Phi.
 * 2. Dynamic Treaties & Non-Aggression Pacts:
 *    - Formal contracts with duration, demilitarized zones, economic concessions, and violation penalties.
 * 3. Covert Espionage & Sabotage Networks:
 *    - Clandestine operations (council infiltration, distrust rumors, stockpile sabotage, false-flag border incidents).
 *    - Probabilistic discovery mechanics triggering Casus Belli, honor loss, and bilateral tension escalation.
 * 4. Coalition Call-to-Arms & Cascading Mobilization:
 *    - Multi-party defense pact activations evaluating trust, honor, coalition cohesion, and power ratios.
 *    - Resolves into HONOR_CALL_MOBILIZE, HONOR_CALL_SUBSIDY, or REFUSE_DEFECT.
 * 5. Diplomatic Honor & Treaty Violation Ledger:
 *    - Dynamic honor rating [0..1] per faction; betrayal incurs severe diplomatic blowback and sticky grievances.
 *
 * STRICT INVARIANT:
 * Host game maintains absolute authority over physical geometry, entity positioning, damage, and inventory.
 * Middleware evaluates semantic diplomatic stances, pacts, cohesion, and advisory mobilization recommendations.
 */

import { DeterministicRng } from './DeterministicRng.js';
import { ESCALATION_STAGES, FACTION_CULTURES, INCIDENT_TYPES } from './FactionSystem.js';
import { TradeDependencyEngine } from './TradeDependencyEngine.js';

export const TREATY_TYPES = Object.freeze({
    MUTUAL_DEFENSE_PACT: 'MUTUAL_DEFENSE_PACT',
    NON_AGGRESSION_PACT: 'NON_AGGRESSION_PACT',
    TRADE_LEAGUE: 'TRADE_LEAGUE',
    DEMILITARIZED_BUFFER: 'DEMILITARIZED_BUFFER'
});

export const ESPIONAGE_OPERATIONS = Object.freeze({
    INFILTRATE_COUNCIL: 'INFILTRATE_COUNCIL',
    SOW_DISTRUST_RUMOR: 'SOW_DISTRUST_RUMOR',
    SABOTAGE_STOCKPILE: 'SABOTAGE_STOCKPILE',
    PROVOKE_BORDER_INCIDENT: 'PROVOKE_BORDER_INCIDENT'
});

export const COALITION_STATUS = Object.freeze({
    ACTIVE: 'ACTIVE',
    FRACTURING: 'FRACTURING',
    DISSOLVED: 'DISSOLVED'
});

export const CALL_TO_ARMS_RESPONSES = Object.freeze({
    HONOR_CALL_MOBILIZE: 'HONOR_CALL_MOBILIZE',
    HONOR_CALL_SUBSIDY: 'HONOR_CALL_SUBSIDY',
    REFUSE_DEFECT: 'REFUSE_DEFECT'
});

function clamp01(v) {
    if (!Number.isFinite(v)) return 0.0;
    return Math.max(0.0, Math.min(1.0, v));
}

export class CoalitionDiplomacyEngine {
    /**
     * @param {Object} [options={}]
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 133742;
        this.rng = new DeterministicRng(this.seed);
        this.currentTick = 0;

        this.coalitions = new Map();   // Map<coalitionId, CoalitionInstance>
        this.treaties = new Map();     // Map<treatyId, TreatyInstance>
        this.factionHonor = new Map(); // Map<factionId, number [0..1]>
        this.espionageLog = [];        // Array of executed covert operations
        this.violationsLog = [];       // Array of treaty betrayals
        // Sibling-bound sweep: rare-event diagnostic logs, newest retained.
        this.maxDiplomaticLogEntries = options.maxLogEntries ?? 200;
        // NEXT-29: trade-dependency restraint shares the valley curve.
        this.dependency = new TradeDependencyEngine();
    }

    /**
     * Restraint fraction for a grudge-holder toward a provocateur from an
     * optional host-reported trade ledger (context.tradeLedger, rows
     * {sourceId, destId, commodity, amount, tick}). Absent ledger means
     * independence means zero restraint: existing callers are untouched.
     * NOW-33 clock contract: staleness is relative to the READER's clock
     * (this engine's currentTick by default). A ledger from a foreign
     * clock must arrive with context.currentTick on the ROWS' basis, or
     * rows expire against the wrong clock: a fresh reader over-includes
     * (nothing is stale to a newborn), a long-ticked reader under-includes.
     */
    _restraintFromLedger(grudgeHolder, provocateur, context = {}) {
        const ledger = context.tradeLedger;
        if (!Array.isArray(ledger) || ledger.length === 0 || !grudgeHolder || !provocateur) return 0;
        // Tick basis defaults to this engine's clock; callers bridging a
        // foreign ledger (e.g. valley rows) pass context.currentTick.
        // NOTE: Infinity would stale every ticked row (cutoff arithmetic),
        // so it must never be the default here.
        const nowTick = typeof context.currentTick === 'number' ? context.currentTick : this.currentTick;
        return this.dependency.advise(ledger, grudgeHolder, provocateur, 1, nowTick).restraint;
    }
    /**
     * Set or initialize diplomatic honor rating for a faction.
     * @param {string} factionId
     * @param {number} [honor=0.75]
     */
    setFactionHonor(factionId, honor = 0.75) {
        this.factionHonor.set(String(factionId), clamp01(honor));
    }

    /**
     * Get diplomatic honor rating for a faction.
     * @param {string} factionId
     * @returns {number}
     */
    getFactionHonor(factionId) {
        if (!this.factionHonor.has(String(factionId))) {
            this.factionHonor.set(String(factionId), 0.75);
        }
        return this.factionHonor.get(String(factionId));
    }

    /**
     * Create and register a multilateral coalition.
     * @param {string} id
     * @param {Object} options
     * @returns {Object} Created coalition
     */
    createCoalition(id, {
        name = null,
        type = TREATY_TYPES.MUTUAL_DEFENSE_PACT,
        memberFactionIds = [],
        leaderFactionId = null,
        durationTicks = 500,
        metadata = {}
    } = {}) {
        if (!id) throw new Error('Coalition ID must be specified');
        const members = Array.from(new Set(memberFactionIds.map(String)));
        if (members.length < 2) {
            throw new Error('A coalition requires at least 2 distinct member factions');
        }

        const coalition = {
            id: String(id),
            name: name ? String(name) : String(id),
            type: TREATY_TYPES[type] || TREATY_TYPES.MUTUAL_DEFENSE_PACT,
            members,
            leaderFactionId: leaderFactionId ? String(leaderFactionId) : members[0],
            foundingTick: this.currentTick,
            expiryTick: this.currentTick + Math.max(10, durationTicks),
            cohesion: 0.80,
            status: COALITION_STATUS.ACTIVE,
            warWeariness: 0.0,
            metadata: { ...metadata }
        };

        this.coalitions.set(coalition.id, coalition);
        return coalition;
    }

    /**
     * Computes the multilateral cohesion index Phi in [0, 1] for a coalition.
     * Evaluates pairwise trust, mutual grievances, shared external threats, and war weariness.
     * @param {string} coalitionId
     * @param {Object} [context={}] Optional FactionSystem reference
     * @returns {number} Cohesion score
     */
    computeCoalitionCohesion(coalitionId, context = {}) {
        const coalition = this.coalitions.get(String(coalitionId));
        if (!coalition || coalition.status === COALITION_STATUS.DISSOLVED) {
            return 0.0;
        }

        const factionSystem = context.factionSystem || null;
        const members = coalition.members;
        const n = members.length;
        if (n < 2) return 0.0;

        let totalAffinity = 0;
        let pairCount = 0;
        const sharedRivals = new Set();

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const fA = members[i];
                const fB = members[j];
                pairCount++;

                let trust = 0.60;
                let grievance = 0.0;

                if (factionSystem) {
                    const stanceAB = factionSystem.getBilateralStance(fA, fB);
                    const stanceBA = factionSystem.getBilateralStance(fB, fA);
                    if (stanceAB && stanceBA) {
                        const tAB = (stanceAB.stage === 'UNAWARE' && stanceAB.trust === 0) ? 0.65 : stanceAB.trust;
                        const tBA = (stanceBA.stage === 'UNAWARE' && stanceBA.trust === 0) ? 0.65 : stanceBA.trust;
                        trust = (tAB + tBA) / 2.0;
                        grievance = Math.max(stanceAB.grievance, stanceBA.grievance);
                    }
                }

                // Pair affinity formula: Trust dampened by grievance
                const pairAffinity = trust * (1.0 - 0.70 * grievance);
                totalAffinity += pairAffinity;
            }
        }

        const avgAffinity = pairCount > 0 ? (totalAffinity / pairCount) : 0.5;

        // Shared external threat bonus: count external factions hostile to members
        let sharedThreatBonus = 0.0;
        if (factionSystem && factionSystem.factions) {
            for (const [otherFactionId] of factionSystem.factions.entries()) {
                if (members.includes(otherFactionId)) continue;
                let hostileCount = 0;
                for (const m of members) {
                    const stance = factionSystem.getBilateralStance(m, otherFactionId);
                    if (stance && ['THREATEN', 'MOBILIZE', 'SKIRMISH', 'ATTACK'].includes(stance.stage)) {
                        hostileCount++;
                    }
                }
                if (hostileCount >= 2) {
                    sharedThreatBonus += 0.08;
                }
            }
        }
        sharedThreatBonus = Math.min(0.25, sharedThreatBonus);

        // Calculate raw cohesion
        const wearinessPenalty = coalition.warWeariness * 0.20;
        const rawCohesion = avgAffinity + sharedThreatBonus - wearinessPenalty;
        const cohesion = clamp01(Number(rawCohesion.toFixed(4)));

        coalition.cohesion = cohesion;

        // Update coalition status based on cohesion thresholds
        if (cohesion < 0.20) {
            coalition.status = COALITION_STATUS.DISSOLVED;
        } else if (cohesion < 0.45) {
            coalition.status = COALITION_STATUS.FRACTURING;
        } else {
            coalition.status = COALITION_STATUS.ACTIVE;
        }

        return cohesion;
    }

    /**
     * Propose and register a formal treaty between factions.
     * @param {string} id
     * @param {string} sourceFactionId
     * @param {string} targetFactionId
     * @param {string} treatyType
     * @param {Object} [terms={}]
     * @returns {Object} Created treaty
     */
    proposeTreaty(id, sourceFactionId, targetFactionId, treatyType, terms = {}) {
        if (!id || !sourceFactionId || !targetFactionId) {
            throw new Error('Treaty requires id, sourceFactionId, and targetFactionId');
        }
        if (sourceFactionId === targetFactionId) {
            throw new Error('Treaty cannot be signed with self');
        }

        const treaty = {
            id: String(id),
            type: TREATY_TYPES[treatyType] || TREATY_TYPES.NON_AGGRESSION_PACT,
            signatories: [String(sourceFactionId), String(targetFactionId)],
            startTick: this.currentTick,
            durationTicks: terms.durationTicks ?? 200,
            expiryTick: this.currentTick + (terms.durationTicks ?? 200),
            terms: {
                demilitarizedCorridors: terms.demilitarizedCorridors || [],
                tariffDiscount: terms.tariffDiscount ?? 0.15,
                minStanceStage: terms.minStanceStage || 'TRADE',
                ...terms
            },
            status: 'ACTIVE',
            violationRecord: null
        };

        this.treaties.set(treaty.id, treaty);
        return treaty;
    }

    /**
     * Records a treaty violation (e.g. surprise aggression or border breach).
     * Automatically applies honor penalty and registers grievance.
     * @param {string} treatyId
     * @param {string} violatingFactionId
     * @param {string} reason
     * @param {Object} [context={}]
     * @returns {Object} Violation report
     */
    recordTreatyViolation(treatyId, violatingFactionId, reason = 'UNPROVOKED_ATTACK', context = {}) {
        const treaty = this.treaties.get(String(treatyId));
        if (!treaty || treaty.status !== 'ACTIVE') {
            return { recorded: false, error: 'Treaty not active or not found' };
        }

        treaty.status = 'VIOLATED';
        const violator = String(violatingFactionId);
        const victims = treaty.signatories.filter(s => s !== violator);

        // Apply honor penalty (-0.35)
        const currentHonor = this.getFactionHonor(violator);
        this.setFactionHonor(violator, currentHonor - 0.35);

        const record = {
            treatyId: treaty.id,
            violator,
            victims,
            tick: this.currentTick,
            reason: String(reason),
            honorPenalty: 0.35,
            resultingHonor: this.getFactionHonor(violator)
        };

        treaty.violationRecord = record;
        this.violationsLog.push(record);
        while (this.violationsLog.length > this.maxDiplomaticLogEntries) {
            this.violationsLog.shift();
        }

        // Escalate bilateral grievance in FactionSystem if provided
        const factionSystem = context.factionSystem;
        if (factionSystem) {
            for (const victim of victims) {
                // NEXT-29: a victim dependent on the violator cools its grudge.
                const restraint = this._restraintFromLedger(victim, violator, context);
                factionSystem.recordIncident(violator, victim, INCIDENT_TYPES.TREATY_BROKEN, {
                    severity: 0.85,
                    description: `Treaty ${treaty.id} broken by ${violator}: ${reason}`,
                    restraint
                });
            }
        }

        return { recorded: true, record };
    }

    /**
     * Executes a covert espionage or sabotage operation.
     * Computes success probability, detection risk, and diplomatic fallout.
     * @param {string} sourceFactionId
     * @param {string} targetFactionId
     * @param {string} operationType
     * @param {Object} [parameters={}]
     * @param {Object} [context={}]
     * @returns {Object} Espionage result
     */
    executeEspionageOperation(sourceFactionId, targetFactionId, operationType, parameters = {}, context = {}) {
        const source = String(sourceFactionId);
        const target = String(targetFactionId);
        const op = ESPIONAGE_OPERATIONS[operationType] || ESPIONAGE_OPERATIONS.INFILTRATE_COUNCIL;

        const operativeSkill = clamp01(parameters.operativeSkill ?? 0.70);
        let counterVigilance = clamp01(parameters.counterVigilance ?? 0.50);

        // Cultural vigilance modulation
        const factionSystem = context.factionSystem;
        if (factionSystem && factionSystem.factions.has(target)) {
            const targetCulture = factionSystem.factions.get(target).culture;
            if (targetCulture === FACTION_CULTURES.ISOLATIONIST || targetCulture === FACTION_CULTURES.MILITARISTIC) {
                counterVigilance = Math.min(0.95, counterVigilance + 0.15);
            } else if (targetCulture === FACTION_CULTURES.DEVOUT) {
                counterVigilance = Math.max(0.15, counterVigilance - 0.10);
            }
        }

        // Probabilities
        const pSuccess = Math.max(0.10, Math.min(0.95, operativeSkill * (1.0 - 0.40 * counterVigilance)));
        const pDiscovery = Math.max(0.05, Math.min(0.90, counterVigilance * (1.15 - operativeSkill)));

        const rollSuccess = this.rng.random();
        const rollDiscovery = this.rng.random();

        const success = rollSuccess <= pSuccess;
        const discovered = rollDiscovery <= pDiscovery;

        let payload = null;
        let casusBelliGenerated = false;

        if (success) {
            if (op === ESPIONAGE_OPERATIONS.INFILTRATE_COUNCIL) {
                payload = {
                    revealedReadiness: factionSystem && factionSystem.factions.has(target)
                        ? factionSystem.factions.get(target).militaryReadiness
                        : 0.65,
                    revealedStockpile: factionSystem && factionSystem.factions.has(target)
                        ? factionSystem.factions.get(target).economicStockpile
                        : 0.50,
                    strategicIntent: 'CONFIDENTIAL_COUNCIL_PLANS'
                };
            } else if (op === ESPIONAGE_OPERATIONS.SOW_DISTRUST_RUMOR) {
                const thirdParty = parameters.thirdPartyFactionId || 'neighbor_state';
                if (factionSystem) {
                    const stanceAB = factionSystem.getBilateralStance(target, thirdParty);
                    if (stanceAB) {
                        stanceAB.trust = Math.max(0, stanceAB.trust - 0.20);
                        stanceAB.grievance = Math.min(1.0, stanceAB.grievance + 0.15);
                    }
                }
                payload = { distrustSownWith: thirdParty, deltaTrust: -0.20 };
            } else if (op === ESPIONAGE_OPERATIONS.SABOTAGE_STOCKPILE) {
                if (factionSystem && factionSystem.factions.has(target)) {
                    const f = factionSystem.factions.get(target);
                    f.economicStockpile = Math.max(0, f.economicStockpile - 0.20);
                }
                payload = { resourceDepletion: 0.20, targetSector: 'FOOD_AND_ORDNANCE' };
            } else if (op === ESPIONAGE_OPERATIONS.PROVOKE_BORDER_INCIDENT) {
                if (factionSystem) {
                    // NEXT-29: the framed grudge-holder is `source`; its
                    // dependence on the apparent provocateur `target` cools it.
                    const restraint = this._restraintFromLedger(source, target, context);
                    factionSystem.recordIncident(target, source, INCIDENT_TYPES.BORDER_TRESPASS, {
                        severity: 0.70,
                        description: 'False-flag border incident staged by covert operative.',
                        restraint
                    });
                }
                payload = { incidentStaged: true, escalatedStage: 'MOBILIZE' };
            }
        }

        if (discovered) {
            casusBelliGenerated = true;
            // Target discovers source: severe diplomatic blowback
            const honor = this.getFactionHonor(source);
            this.setFactionHonor(source, honor - 0.20);

            if (factionSystem) {
                // NEXT-29: same restraint cools both the recorded provocation
                // and the direct blowback line below (one incident, one grudge).
                const restraint = this._restraintFromLedger(target, source, context);
                factionSystem.recordIncident(source, target, INCIDENT_TYPES.PROVOCATION, {
                    severity: 0.80,
                    description: `Hostile espionage operative from ${source} caught during ${op}.`,
                    restraint
                });
                const stanceTS = factionSystem.getBilateralStance(target, source);
                if (stanceTS) {
                    stanceTS.grievance = Math.min(1.0, stanceTS.grievance + 0.40 * (1 - restraint));
                    stanceTS.trust = Math.max(0, stanceTS.trust - 0.40);
                    if (stanceTS.stage === 'TRADE' || stanceTS.stage === 'NEGOTIATE') {
                        stanceTS.stage = 'THREATEN';
                    }
                }
            }
        }

        const report = {
            tick: this.currentTick,
            source,
            target,
            operation: op,
            success,
            discovered,
            casusBelliGenerated,
            payload,
            probabilities: {
                pSuccess: Number(pSuccess.toFixed(3)),
                pDiscovery: Number(pDiscovery.toFixed(3))
            }
        };

        this.espionageLog.push(report);
        while (this.espionageLog.length > this.maxDiplomaticLogEntries) {
            this.espionageLog.shift();
        }
        return report;
    }

    /**
     * Activates a mutual defense coalition call-to-arms when a member is attacked.
     * Evaluates honor, pairwise trust, cohesion, and power balance for each ally.
     * @param {string} aggressorFactionId
     * @param {string} victimFactionId
     * @param {Object} [context={}]
     * @returns {Object} Call-to-arms deliberation outcomes
     */
    triggerCallToArms(aggressorFactionId, victimFactionId, context = {}) {
        const aggressor = String(aggressorFactionId);
        const victim = String(victimFactionId);
        const factionSystem = context.factionSystem;

        const participatingCoalitions = [];
        for (const coalition of this.coalitions.values()) {
            if (coalition.type === TREATY_TYPES.MUTUAL_DEFENSE_PACT &&
                coalition.status !== COALITION_STATUS.DISSOLVED &&
                coalition.members.includes(victim)) {
                participatingCoalitions.push(coalition);
            }
        }

        const outcomes = [];

        for (const coalition of participatingCoalitions) {
            const cohesion = this.computeCoalitionCohesion(coalition.id, context);

            for (const partner of coalition.members) {
                if (partner === victim) continue;

                let trust = 0.60;
                if (factionSystem) {
                    const stancePV = factionSystem.getBilateralStance(partner, victim);
                    if (stancePV) trust = stancePV.trust;
                }

                const honor = this.getFactionHonor(partner);
                let cultureBonus = 0.0;
                let powerRatioPenalty = 0.0;

                if (factionSystem && factionSystem.factions.has(partner)) {
                    const cult = factionSystem.factions.get(partner).culture;
                    if (cult === FACTION_CULTURES.HONORABLE) cultureBonus = 0.25;
                    else if (cult === FACTION_CULTURES.MILITARISTIC) cultureBonus = 0.15;
                    else if (cult === FACTION_CULTURES.MERCANTILE) cultureBonus = -0.10;
                    else if (cult === FACTION_CULTURES.ISOLATIONIST) cultureBonus = -0.25;

                    // Power ratio comparison
                    if (factionSystem.factions.has(aggressor)) {
                        const pwrAgg = factionSystem.factions.get(aggressor).militaryReadiness;
                        const pwrPart = factionSystem.factions.get(partner).militaryReadiness;
                        if (pwrAgg > 1.5 * pwrPart) {
                            powerRatioPenalty = Math.min(0.35, (pwrAgg - 1.5 * pwrPart) * 0.4);
                        }
                    }
                }

                // Willingness composite formula
                const willingness = (trust * 0.40) + (honor * 0.30) + (cohesion * 0.20) + cultureBonus - powerRatioPenalty;

                let decision = CALL_TO_ARMS_RESPONSES.HONOR_CALL_MOBILIZE;
                let advisoryDirective = 'MOBILIZE';

                if (willingness >= 0.55) {
                    decision = CALL_TO_ARMS_RESPONSES.HONOR_CALL_MOBILIZE;
                    advisoryDirective = 'MOBILIZE';
                    if (factionSystem) {
                        const stance = factionSystem.getBilateralStance(partner, aggressor);
                        if (stance) {
                            stance.stage = 'MOBILIZE';
                            stance.grievance = Math.min(1.0, stance.grievance + 0.30);
                        }
                    }
                } else if (willingness >= 0.35) {
                    decision = CALL_TO_ARMS_RESPONSES.HONOR_CALL_SUBSIDY;
                    advisoryDirective = 'PAY_TRIBUTE'; // economic subsidy to victim
                } else {
                    decision = CALL_TO_ARMS_RESPONSES.REFUSE_DEFECT;
                    advisoryDirective = 'DEFECT';
                    // Suffer betrayal blowback
                    this.setFactionHonor(partner, honor - 0.25);
                    if (factionSystem) {
                        const stanceVP = factionSystem.getBilateralStance(victim, partner);
                        if (stanceVP) {
                            stanceVP.grievance = Math.min(1.0, stanceVP.grievance + 0.50);
                            stanceVP.trust = Math.max(0.0, stanceVP.trust - 0.50);
                        }
                    }
                }

                outcomes.push({
                    coalitionId: coalition.id,
                    partnerFactionId: partner,
                    victimFactionId: victim,
                    aggressorFactionId: aggressor,
                    willingnessScore: Number(willingness.toFixed(3)),
                    decision,
                    advisoryDirective
                });
            }
        }

        return {
            tick: this.currentTick,
            victim,
            aggressor,
            activeDefenseCoalitions: participatingCoalitions.length,
            outcomes
        };
    }

    /**
     * Advance simulation tick.
     * Updates treaty expirations, decays war weariness, and updates cohesion.
     * @param {number} [dt=1.0]
     * @param {Object} [context={}]
     */
    tick(dt = 1.0, context = {}) {
        this.currentTick += Math.max(1, Math.floor(dt));

        // 1. Advance Treaties & check expirations
        for (const treaty of this.treaties.values()) {
            if (treaty.status === 'ACTIVE' && this.currentTick >= treaty.expiryTick) {
                treaty.status = 'EXPIRED';
            }
        }

        // 2. Advance Coalitions & decay war weariness
        for (const coalition of this.coalitions.values()) {
            if (coalition.status === COALITION_STATUS.ACTIVE || coalition.status === COALITION_STATUS.FRACTURING) {
                if (coalition.warWeariness > 0.0) {
                    coalition.warWeariness = Math.max(0.0, coalition.warWeariness - 0.01 * dt);
                }
                this.computeCoalitionCohesion(coalition.id, context);
            }
        }
    }

    /**
     * Export complete deterministic state snapshot.
     * @returns {Object} Snapshot
     */
    getState() {
        return {
            seed: this.seed,
            currentTick: this.currentTick,
            coalitions: Array.from(this.coalitions.values()).map(c => ({ ...c, members: [...c.members] })),
            treaties: Array.from(this.treaties.values()).map(t => ({ ...t, signatories: [...t.signatories] })),
            factionHonor: Array.from(this.factionHonor.entries()),
            espionageLog: this.espionageLog.map(e => ({ ...e })),
            violationsLog: this.violationsLog.map(v => ({ ...v }))
        };
    }

    /**
     * Restore state from snapshot.
     * @param {Object} snapshot
     */
    setState(snapshot) {
        if (!snapshot) return;
        this.seed = snapshot.seed ?? this.seed;
        this.currentTick = snapshot.currentTick ?? 0;
        this.coalitions = new Map();
        if (Array.isArray(snapshot.coalitions)) {
            for (const c of snapshot.coalitions) {
                this.coalitions.set(c.id, { ...c, members: [...c.members] });
            }
        }
        this.treaties = new Map();
        if (Array.isArray(snapshot.treaties)) {
            for (const t of snapshot.treaties) {
                this.treaties.set(t.id, { ...t, signatories: [...t.signatories] });
            }
        }
        this.factionHonor = new Map(snapshot.factionHonor || []);
        this.espionageLog = Array.isArray(snapshot.espionageLog) ? snapshot.espionageLog.map(e => ({ ...e })) : [];
        this.violationsLog = Array.isArray(snapshot.violationsLog) ? snapshot.violationsLog.map(v => ({ ...v })) : [];
        while (this.espionageLog.length > this.maxDiplomaticLogEntries) this.espionageLog.shift();
        while (this.violationsLog.length > this.maxDiplomaticLogEntries) this.violationsLog.shift();
    }
}
