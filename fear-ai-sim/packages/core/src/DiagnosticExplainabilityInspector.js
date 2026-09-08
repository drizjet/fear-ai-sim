/**
 * Designer diagnostic explanations. Advisory only — never issues host commands.
 * Prefers numbers already computed by AffectiveAgent.tick (debug_trace.perception_breakdown).
 */

function fmt(n, digits = 2) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(digits) : '0';
}

function coord(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(1) : '0.0';
}

export class DiagnosticExplainabilityInspector {
    static explainAgentDecision(agent, observations = {}, context = {}) {
        if (!agent) throw new Error('Agent is required for diagnostic explanation');

        const traits = agent.traits || {};
        const threats = observations.threats || [];
        const sounds = observations.sounds || [];
        const peers = observations.peers || [];
        const breakdown = agent.lastResult?.debug_trace?.perception_breakdown || null;

        let sensoryWeighted;
        let traumaWeighted;
        let contagionWeighted;

        if (breakdown) {
            sensoryWeighted = breakdown.sensory_weighted || 0;
            traumaWeighted = breakdown.trauma_weighted || 0;
            contagionWeighted = breakdown.contagion_weighted || 0;
        } else {
            let rawThreatComponent = 0;
            for (const t of threats) {
                const dist = t.distance || 10.0;
                const intensity = t.intensity ?? 1.0;
                rawThreatComponent += intensity * (1.0 / (1.0 + dist * 0.05));
            }
            for (const s of sounds) {
                const dist = s.distance || 10.0;
                const intensity = s.intensity ?? 0.5;
                rawThreatComponent += intensity * (1.0 / (1.0 + dist * 0.08)) * 0.6;
            }
            const neuroticismFactor = 0.5 + (traits.neuroticism ?? 0.5) * 0.9;
            sensoryWeighted = rawThreatComponent * neuroticismFactor;
            traumaWeighted = (context.traumaDread || 0) * 0.8;
            contagionWeighted = context.contagionFear || 0;
        }

        const totalRaw = sensoryWeighted + traumaWeighted + contagionWeighted;
        const threatContributors = [];
        if (totalRaw > 0.001) {
            if (sensoryWeighted > 0) {
                threatContributors.push({
                    factor: 'SENSORY_PROXIMITY_THREAT',
                    weight: Number((sensoryWeighted / totalRaw).toFixed(3)),
                    description: `Active sensory threat cues (${threats.length} threats, ${sounds.length} sounds)`
                });
            }
            if (traumaWeighted > 0) {
                threatContributors.push({
                    factor: 'SPATIAL_TRAUMA_DREAD',
                    weight: Number((traumaWeighted / totalRaw).toFixed(3)),
                    description: `Dread memory imprint near (${coord(agent.x)}, ${coord(agent.y)})`
                });
            }
            if (contagionWeighted > 0) {
                threatContributors.push({
                    factor: 'SOCIAL_PANIC_CONTAGION',
                    weight: Number((contagionWeighted / totalRaw).toFixed(3)),
                    description: `Emotional contagion from ${peers.length} nearby peers`
                });
            }
        } else {
            threatContributors.push({
                factor: 'BASELINE_TRANQUILITY',
                weight: 1.0,
                description: 'No active threat stimuli, trauma dread, or peer contagion detected'
            });
        }

        const traitImpacts = [];
        const nDev = (traits.neuroticism ?? 0.5) - 0.5;
        if (Math.abs(nDev) > 0.05) {
            traitImpacts.push({
                trait: 'NEUROTICISM',
                value: traits.neuroticism,
                impact: nDev > 0 ? 'THREAT_AMPLIFICATION' : 'THREAT_ATTENUATION',
                percentage_delta: Number((nDev * 180).toFixed(1))
            });
        }
        const rDev = (traits.resilience ?? 0.5) - 0.5;
        if (Math.abs(rDev) > 0.05) {
            traitImpacts.push({
                trait: 'RESILIENCE',
                value: traits.resilience,
                impact: rDev > 0 ? 'ACCELERATED_RECOVERY' : 'PROLONGED_PANIC_RETENTION',
                percentage_delta: Number((rDev * 160).toFixed(1))
            });
        }

        const currentFear = agent.currentFear || 0;
        const fearBand = agent.lastResult?.fear_band || agent.fearCore?.state || 'CALM';
        const activeIntent = agent.lastResult?.action_intent || { type: 'IDLE_VIGILANT', urgency: 0 };
        const intentType = activeIntent.type || 'IDLE_VIGILANT';

        const rejectedAlternatives = [];
        if (intentType === 'FLEE_FROM' || intentType === 'DESPERATE_FLAIL' || intentType === 'SEEK_COVER') {
            rejectedAlternatives.push({
                alternative: 'CONFRONT_THREAT',
                reason: `Perceived threat and fear (${fmt(currentFear)}) exceeded composure threshold (0.40)`
            });
            rejectedAlternatives.push({
                alternative: 'CAUTIOUS_EXPLORE',
                reason: 'Arousal and panic lock override exploratory impulses'
            });
        } else if (intentType === 'CONFRONT_THREAT') {
            rejectedAlternatives.push({
                alternative: 'FLEE_FROM',
                reason: `High resilience (${fmt(traits.resilience ?? 0.5)}) and dominance (${fmt(agent.currentDominance || 0.5)}) maintained tactical resolve`
            });
        } else {
            rejectedAlternatives.push({
                alternative: 'FLEE_FROM',
                reason: `Fear level (${fmt(currentFear)}) is below escape activation threshold`
            });
        }

        return {
            agent_id: agent.id,
            fear_band: fearBand,
            current_fear: Number(currentFear.toFixed(3)),
            active_intent: activeIntent,
            threat_attribution: threatContributors,
            trait_impacts: traitImpacts,
            rejected_alternatives: rejectedAlternatives,
            habituation_status: {
                active: agent.enableHabituation ?? true,
                exposure_count: agent.habituation ? agent.habituation.totalExposures : 0
            }
        };
    }

    static explainFactionDecision(factionSystem, factionAId, factionBId) {
        if (!factionSystem) throw new Error('FactionSystem required');

        const factA = factionSystem.getFaction(factionAId);
        const factB = factionSystem.getFaction(factionBId);
        const evalReport = (typeof factionSystem.evaluateStance === 'function')
            ? factionSystem.evaluateStance(factionAId, factionBId)
            : null;
        const stanceObj = factionSystem.getBilateralStance(factionAId, factionBId);
        const stage = evalReport?.toStage || stanceObj?.stage || 'UNAWARE';
        const trust = stanceObj?.trust ?? 0;
        const grievance = stanceObj?.grievance ?? 0;

        const readiness = factA ? factA.militaryReadiness : 1.0;
        const powerRatio = (factA && factB && factB.militaryReadiness > 0)
            ? Number((factA.militaryReadiness / factB.militaryReadiness).toFixed(2))
            : 1.0;

        const reasons = [];
        if (evalReport?.explanation) {
            reasons.push(evalReport.explanation);
        }
        if (evalReport?.reason) {
            reasons.push(evalReport.reason);
        }
        if (stage === 'ATTACK' || stage === 'SKIRMISH') {
            reasons.push(`High territorial tension and accumulated grievances (${fmt(grievance)})`);
            reasons.push(`Favorable power ratio (${powerRatio}x) passed offensive capability gate`);
        } else if (stage === 'SURRENDER') {
            reasons.push(`Military readiness collapsed (${fmt(readiness)}) under severe combat casualties`);
        } else if (stage === 'ALLY') {
            reasons.push(`Deep mutual trust (${fmt(trust)}) and minimal grievances (${fmt(grievance)})`);
        } else if (reasons.length === 0) {
            reasons.push(`Bilateral status ${stage} under peace hysteresis barrier`);
        }

        return {
            faction_a: factionAId,
            faction_b: factionBId,
            current_stance: stage,
            bilateral_metrics: {
                trust,
                grievance,
                power_ratio: powerRatio,
                readiness_a: readiness
            },
            contributing_factors: reasons
        };
    }
}
