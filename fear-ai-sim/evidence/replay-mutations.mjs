#!/usr/bin/env node
// evidence/replay-mutations.mjs
//
// EVID-2026-09-03-PREAUDIT-5-MUTATION-REPLAY
//
// Mechanically re-applies a sample of the mutations recorded in
// AUTONOMOUS_HANDOFF entries, runs the named detectors, confirms each
// one FAILS (kill), restores the sources byte-identically, and reports
// kill / SURVIVED / ERROR per mutation.
//
// A detector that does not kill its mutation is assurance theater:
// this script converts the historical kill accounting from testimony
// into re-runnable evidence. Exit 0 iff every mutation is killed and
// every file is restored with zero residue.
//
// Usage:
//   node evidence/replay-mutations.mjs   (from the fear-ai-sim package dir)

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JEST = ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--runInBand'];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// Each entry: neutralize exactly one production gate. `target` must occur
// exactly once in `file`, or the entry aborts as ERROR (never guess).
const MUTATIONS = [
    {
        id: 'storm-pricing',
        file: 'closed-world.js',
        target: '? clamp01(Number(world.storm.severity) || 0) * (Number(route.distance) || 0)',
        replacement: '? 0',
        detectors: 'storm-weather-routing',
        note: 'storm road prices zero; merchant must not flip',
    },
    {
        id: 'bandit-weather',
        file: 'canonical-trade-system.js',
        target: 'const weatherFactor = distance > 0 ? distance / (distance + weatherCost) : 1;',
        replacement: 'const weatherFactor = 1;',
        detectors: 'storm-bandit-suppression',
        note: 'bandit ignores storm suppression; must hunt through the storm',
    },
    {
        id: 'patrol-weather',
        file: 'canonical-trade-system.js',
        target: 'const patrolWeatherCost = Number(deployedRoute?.weatherCost) || 0;',
        replacement: 'const patrolWeatherCost = 0;',
        detectors: 'storm-patrol-detection',
        note: 'patrol unblinded; detection must not flip with weather',
    },
    {
        id: 'storm-production',
        file: 'closed-world.js',
        target: 'if (stormRoad) pcp *= Math.max(0, 1 - clamp01(Number(world.storm.severity) || 0) * 0.3);',
        replacement: 'if (stormRoad) pcp *= 1;',
        detectors: 'storm-production',
        note: 'Slice AI ratio/monotonicity/supply must fail',
    },
    {
        id: 'scheduler-cadence',
        file: 'closed-world.js',
        target: '&& candidates.length > 0 && tick % everyTicks === 0) {',
        replacement: '&& candidates.length > 0 && false) {',
        detectors: 'storm-scheduler',
        note: 'scheduled storms never start; cadence/rotation must fail',
    },
    {
        id: 'wagon-wear',
        file: 'closed-world.js',
        target: '- 0.01 * wagons);',
        replacement: '- 0);',
        detectors: 'logistics-wagon-capacity',
        note: 'road wear unpriced; 20-unit double wear must fail',
    },
    {
        id: 'investigation-ratchet',
        file: 'closed-world.js',
        target: 'townRef.crime.investigationQuality = Math.min(0.9, current + 0.05);',
        replacement: 'townRef.crime.investigationQuality = current;',
        detectors: 'crime-investigation',
        note: 'patrol ratchet removed; upward drift must fail',
    },
    {
        id: 'routing-base',
        file: 'canonical-trade-system.js',
        target: '}) / 10;',
        replacement: '}) * 0;',
        detectors: 'routing-merchant-base',
        note: 'routing base zeroed; ranking identity must fail',
    },
    {
        id: 'stance-gate',
        file: 'closed-world.js',
        target: `? (structuredDecision.to >= threshold
                && !structuredDecision.blocked
                && !structuredEvidenceBlocksAction)`,
        replacement: `? (structuredDecision.to >= threshold
                && !structuredDecision.blocked)`,
        detectors: 'stance-invasion-gate',
        note: 'Slice P authorization gate removed; blocked raid must escape',
    },
    {
        id: 'retaliation-clamp',
        file: 'escalation.js',
        target: 'faction.resources = Math.max(0, resources - 1);',
        replacement: 'faction.resources = resources - 1;',
        detectors: 'escalation|long-horizon-invariant-health',
        note: 'pre-audit item 1 fix reverted; unit floor + ALWAYS bound must fail',
    },
    {
        id: 'ledger-guard',
        file: 'evidence/lint.mjs',
        target: "else if (freshness === 'FRESH' || contentMatches) status = 'ADMISSIBLE';",
        replacement: "else if (freshness === 'FRESH') status = 'ADMISSIBLE';",
        detectors: 'evidence-linter',
        note: 'content-match currency removed; head-only drift must fail',
    },
    {
        id: 'merchant-gate',
        file: 'canonical-trade-system.js',
        target: 'if (!canObserve(merchant, event, world)) continue;',
        replacement: 'if (false) continue;',
        detectors: 'observation-boundary',
        note: 'R1 merchant gate removed; distant bandit must enter beliefs',
    },
    {
        id: 'bandit-gate',
        file: 'canonical-trade-system.js',
        target: 'if (!route || route !== bandit.roadId) continue;',
        replacement: 'if (!route) continue;',
        detectors: 'observation-boundary',
        note: 'R1 bandit gate widened to all roads; distant merchant must be learned',
    },
    {
        id: 'history-window',
        file: 'canonical-trade-system.js',
        target: 'minTick: tick - 1,',
        replacement: 'minTick: tick - 10,',
        detectors: 'observation-boundary',
        note: 'R1b evidence window widened to deep history; stale attacks must be learned',
    },
    {
        id: 'canobserve-universal',
        file: 'closed-world.js',
        target: 'if (actorRoute === roadId) return true;',
        replacement: 'return true;',
        detectors: 'observation-boundary',
        note: 'R1b canObserve proximity removed; distant events must be learned',
    },
    {
        id: 'formation-accuracy',
        file: 'closed-world.js',
        target: 'if (nextEncounterRandom(world) >= accuracy) continue;',
        replacement: 'if (false) continue;',
        detectors: 'observation-boundary|closed-world-trade-reroute',
        note: 'R1b 2.4 accuracy flip removed; accuracy-0 must learn via BeliefStore',
    },
    {
        id: 'rumor-locality',
        file: 'closed-world.js',
        target: 'if (recipient.location !== witness.location) continue;',
        replacement: 'if (recipient.location === witness.location) continue;',
        detectors: 'rumor-auto-share',
        note: 'R1b rumor gate reverted to cross-town teleport; exclusion must fail',
    },
    {
        id: 'season-chain',
        file: 'ecology.js',
        target: `const priorSeason = [...world.events].reverse().find(event =>
        event.type === 'SEASON_CHANGE' && typeof event.eventId === 'string');`,
        replacement: 'const priorSeason = null;',
        detectors: 'event-parentage',
        note: 'R2 season chain severed; chained parentage must fail',
    },
    {
        id: 'treaty-chain',
        file: 'treaty.js',
        target: "if (typeof event.eventId === 'string') return event.eventId;",
        replacement: 'if (false) return event.eventId;',
        detectors: 'event-parentage',
        note: 'R2 treaty chain severed; FORMED->VIOLATED->TERMINATED must fail',
    },
    {
        id: 'encounter-parent',
        file: 'closed-world.js',
        target: 'parentEventIds: [candidateEvent.eventId]',
        replacement: 'parentEventIds: []',
        detectors: 'event-parentage',
        note: 'R2 encounter parent dropped; candidate parentage must fail',
    },
    {
        id: 'bandit-delivery-booking',
        file: 'closed-world.js',
        target: 'cumulative.deliveryOverflow = (Number(cumulative.deliveryOverflow) || 0) + (Number(marketResult.overflow) ?? 0);',
        replacement: 'cumulative.deliveryOverflow = (Number(cumulative.deliveryOverflow) || 0) + 0;',
        detectors: 'conservation-r3',
        note: 'R3 bandit overflow unbooked; capacity residual must drift',
    },
    {
        id: 'refugee-applied',
        file: 'encounters.js',
        target: `result.destinationTownId = destination.id;
                result.refugeeCount = refugeeCount;
                result.campId = camp.id;
                applied = true;`,
        replacement: `result.destinationTownId = destination.id;
                result.refugeeCount = refugeeCount;
                result.campId = camp.id;
                applied = false;`,
        detectors: 'conservation-r3',
        note: 'R3 refugee apply reverted; inflow booking must vanish',
    },
    {
        id: 'demography-receipt',
        file: 'demography.js',
        target: 'const received = Boolean(dest && (dest.population || 0) > 0);',
        replacement: 'const received = true;',
        detectors: 'conservation-r3',
        note: 'R3 floor bypassed; phantom immigration must return',
    },
    {
        id: 'law-apportion',
        file: 'closed-world.js',
        target: `const lawViolations = checkAllLawCompliance({
        world,
        action: { type: 'BANDIT_ATTACK', roadId, actorId: emitted.banditId, tick },
        tick,
    });`,
        replacement: `const lawViolations = checkAllLawCompliance({
        world,
        action: { type: 'BANDIT_ATTACK', roadId, actorId: emitted.banditId, tick },
        tick,
    }).slice(0, 1);`,
        detectors: 'law-apportionment',
        note: 'Slice Y first-match starvation restored; south must go blind',
    },
    {
        id: 'law-restitution',
        file: 'closed-world.js',
        target: 'const transferred = Math.min(violatorBefore, amount);',
        replacement: 'const transferred = 0;',
        detectors: 'law-restitution',
        note: 'Slice X restitution zeroed; violator keeps everything',
    },
    {
        id: 'law-justice-penalty',
        file: 'justice.js',
        target: 'const lawDebit = clamp(lawPenalty) * 0.15;',
        replacement: 'const lawDebit = clamp(lawPenalty) * 0;',
        detectors: 'law-justice-penalty',
        note: 'Slice W lawPenalty coupling cut; justice ignores violations',
    },
    {
        id: 'law-lawfulness',
        file: 'closed-world.js',
        target: 'if (observerFaction && violatorFactionId && !isSelfLoop) {',
        replacement: 'if (false && violatorFactionId && !isSelfLoop) {',
        detectors: 'law-lawfulness-enforcement',
        note: 'Slice V observer gate shut; lawfulness never recorded',
    },
    {
        id: 'wildlife-factor',
        file: 'canonical-trade-system.js',
        target: '* belief.recency * seasonMod * wildlifeFactor * weatherFactor;',
        replacement: '* belief.recency * seasonMod * weatherFactor;',
        detectors: 'wildlife-competition',
        note: 'Slice AA predator discount removed; crowded road must not hold',
    },
    {
        id: 'condition-divisor',
        file: 'routing.js',
        target: 'const conditionSurcharge = distance * (1 / roadCondition - 1);',
        replacement: 'const conditionSurcharge = 0;',
        detectors: 'road-condition',
        note: 'Slice AD surcharge removed (distanceCost is WHY-only since AD); degraded short road must win',
    },
    {
        id: 'market-theft',
        file: 'closed-world.js',
        target: "bookTransitLoss(world, merchant.cargoKind ?? 'food', lost);",
        replacement: 'void lost;',
        detectors: 'w1-material-loss-sink',
        note: 'R2-W1 theft booking removed; mass residual must go positive',
    },
    {
        id: 'market-delivery-merge',
        file: 'closed-world.js',
        target: 'tickFlow.delivered += delivery.stored ?? 0;',
        replacement: 'tickFlow.delivered += 0;',
        detectors: 'pending-trip-market-conservation|market-tick-flows',
        note: 'trip delivery merge disabled; delivered quantum must vanish',
    },
    {
        id: 'market-exactonce-trip',
        file: 'closed-world.js',
        target: "trip.status = 'DELIVERED';",
        replacement: "trip.status = 'ARRIVED';",
        detectors: 'pending-trip',
        note: 'trip closure left open; delivery must repeat',
    },
    // R4 note: a consequence-status-only entry (status APPLIED->PENDING)
    // was tried and SURVIVED: with trip.status DELIVERED the guard
    // still blocks re-application, so the consequence line alone has
    // no independent observable effect. Coverage of the closure lives
    // in market-exactonce-trip. A PENDING-forever consequence leak has
    // no detector (minor gap, recorded).
    {
        id: 'chain-merchant',
        file: 'closed-world.js',
        target: 'ensureWorldEventIdentity(world, routeResult.event, beliefParentIds);',
        replacement: 'ensureWorldEventIdentity(world, routeResult.event, []);',
        detectors: 'causal-chain',
        note: 'decision re-parenting cut at the live site; chain must break',
    },
    {
        id: 'chain-migration',
        file: 'closed-world.js',
        target: '}, decision.eventId ? [decision.eventId] : []);',
        replacement: '}, []);',
        detectors: 'migration-decision-chain',
        note: 'MIGRATION-to-decision parent link cut; chain must break',
    },
    {
        id: 'maturity-live-rows',
        file: 'evidence/maturity.mjs',
        target: 'const rows = liveRows.filter(r => r.dimension === dim);',
        replacement: 'const rows = evidenceRows.filter(r => r.dimension === dim);',
        detectors: 'evidence-linter',
        note: 'retired-row poison returns; superseded placeholders must veto',
    },
    {
        id: 'shipment-scaling',
        file: 'closed-world.js',
        target: 'Math.max(1, Math.floor(merchantCargo * (1 - believedDanger * 0.5) * (1 - worldCaution * 0.4)))',
        replacement: 'Math.max(1, Math.floor(merchantCargo))',
        detectors: 'materialization-scaling',
        note: 'R5 danger-scaled shipment neutralized; volume must stop responding',
    },
    {
        id: 'travel-time',
        file: 'closed-world.js',
        target: 'Math.max(1, Math.round((route.distance ?? 1) / (Number.isFinite(route.condition) ? route.condition : 1)))',
        replacement: 'Math.max(1, Math.round((route.distance ?? 1)))',
        detectors: 'materialization-scaling',
        note: 'R5 condition travel divisor dropped; degraded road must not delay',
    },
    {
        id: 'drought-recovery',
        file: 'closed-world.js',
        target: 'pcp *= Math.max(0.1, 1 - clamp01(Number(world.drought.severity) || 0) * 0.6);',
        replacement: 'pcp *= 1;',
        detectors: 'long-horizon-invariant-health',
        note: 'R5 drought shock neutralized; convergence must fail',
    },
    {
        id: 'settler-formation',
        file: 'demography.js',
        target: 'formSettlerGroup(world, { originTownId: update.townId, size: update.emigration, tick, reason: \'MIGRATION_FLOOR_ZERO_POP\' });',
        replacement: 'void update.emigration;',
        detectors: 'settler-founding|conservation-r3',
        note: 'E1 dropped-transfer formation skipped; camps and settler conservation must fail',
    },
    {
        id: 'traffic-relocation-bridge',
        file: 'closed-world.js',
        target: 'if (trafficSignal > lootOpportunity) {',
        replacement: 'if (false && trafficSignal > lootOpportunity) {',
        detectors: 'bandit-traffic-relocation',
        note: 'E2 traffic bridge disabled; observed-road pull must fail while stale/empty/live-agreement hold',
    },
    {
        id: 'settler-founding',
        file: 'closed-world.js',
        target: 'group.beliefs[site] = { perceivedDanger: 0.2, confidence: 0.5, tick, source: \'settler-survey\' };',
        replacement: 'void site;',
        detectors: 'settler-founding',
        note: 'E1 survey belief never sticks; survey-only camps must never found',
    },
    {
        id: 'merchant-tools-selection',
        file: 'canonical-trade-system.js',
        target: 'const switched = best !== hold && margin > 0.2',
        replacement: 'const switched = false && best !== hold && margin > 0.2',
        detectors: 'merchant-tools-trade|sensitivity-500tick',
        note: 'E3 cargo selection frozen on hold; exchange/trip/relief detectors and the pacification pin must fail',
    },
    {
        id: 'merchant-travels-with-trip',
        file: 'closed-world.js',
        target: 'if (traveler && trip.destinationTownId) traveler.location = trip.destinationTownId;',
        replacement: 'if (false && traveler && trip.destinationTownId) traveler.location = trip.destinationTownId;',
        detectors: 'merchant-tools-trade',
        note: 'E3 arrival relocation disabled; merchant never reaches the surplus end so no tools loop forms',
    },
    {
        id: 'settlement-remainder-resolution',
        file: 'demography.js',
        target: 'const birthsTotal = birthsExact + (Number(rem.births) || 0);',
        replacement: 'const birthsTotal = birthsExact;',
        detectors: 'settlement-lifecycle',
        note: 'E4 fractional births frozen; sub-scale decline/growth must fail',
    },
    {
        id: 'settlement-abandonment',
        file: 'demography.js',
        target: '} else if (town.everInhabited && !town.abandoned) {',
        replacement: '} else if (false && town.everInhabited && !town.abandoned) {',
        detectors: 'settlement-lifecycle',
        note: 'E4 abandonment hook cut; decline never terminates, husk silence must fail',
    },
    {
        id: 'settlement-insecurity-penalty',
        file: 'demography.js',
        target: 'const score = candShortage + insecurityOf(candId);',
        replacement: 'const score = candShortage;',
        detectors: 'settlement-lifecycle',
        note: 'E4 raid exposure ignored; migrants must not divert from the raided road',
    },
    {
        id: 'merchant-bankruptcy-gate',
        file: 'closed-world.js',
        target: '&& destinationTownId !== merchant.location && !alreadyTraveling && !destAbandoned && !bankrupt;',
        replacement: '&& destinationTownId !== merchant.location && !alreadyTraveling && !destAbandoned;',
        detectors: 'merchant-capital',
        note: 'E9 bankruptcy gate cut; broke merchants keep shipping',
    },
    {
        id: 'merchant-delivery-revenue',
        file: 'closed-world.js',
        target: 'bookMerchantCapital(\n            (world.merchants ?? []).find(item => item.id === trip.merchantId),\n            deliveryRevenue);',
        replacement: 'void deliveryRevenue;',
        detectors: 'merchant-capital',
        note: 'E9 delivery revenue cut; sales stop earning',
    },
    {
        id: 'takeover-transfer',
        file: 'closed-world.js',
        target: 'town.controlledBy = faction.id;',
        replacement: 'void town;',
        detectors: 'settlement-takeover',
        note: 'E8 control transfer cut; authorized wins must fail',
    },
    {
        id: 'takeover-war-gate',
        file: 'closed-world.js',
        target: '} else if (!Number.isFinite(stance) || stance < StanceLadder.WAR) {',
        replacement: '} else if (false) {',
        detectors: 'settlement-takeover',
        note: 'E8 WAR threshold cut; HOSTILE must not take towns',
    },
    {
        id: 'refugee-camp-formation',
        file: 'encounters.js',
        target: 'world.refugeeCamps.push(camp);',
        replacement: 'destination.population = (destination.population ?? 0) + refugeeCount;',
        detectors: 'refugee-camps',
        note: 'E7 arrival camps cut; instant teleport absorption must fail',
    },
    {
        id: 'refugee-camp-integration',
        file: 'closed-world.js',
        target: 'tickRefugeeCamps(world, { tick });',
        replacement: 'void tick;',
        detectors: 'refugee-camps',
        note: 'E7 integration pass cut; camps never empty, trickle must fail',
    },
    {
        id: 'patrol-familiarity-bonus',
        file: 'canonical-trade-system.js',
        target: 'const familiarityBonus = Math.min(1, roadSeen / 10) * 0.2;',
        replacement: 'const familiarityBonus = 0;',
        detectors: 'patrol-road-familiarity',
        note: 'E6 road learning cut; exposure no longer sharpens detection',
    },
    {
        id: 'production-recipe-gate',
        file: 'closed-world.js',
        target: 'gated = Math.min(desired, Math.max(0, inputLimit));',
        replacement: 'gated = desired;',
        detectors: 'production-chain',
        note: 'E5 recipe gate cut; ore blockade no longer starves the forge',
    },
    {
        id: 'production-input-deduction',
        file: 'closed-world.js',
        target: 'const used = market.consume(input, gated * perUnit);',
        replacement: 'const used = { consumed: 0 };',
        detectors: 'production-chain',
        note: 'E5 input deduction cut; chain identity and conservation must fail',
    },
    {
        id: 'settlement-refound',
        file: 'closed-world.js',
        target: 'if (!existing?.abandoned) {',
        replacement: 'if (!existing?.abandoned || true) {',
        detectors: 'settlement-lifecycle',
        note: 'E4 revival refused; husks never re-found, sprawl returns',
    },
];

function runDetectors(pattern) {
    const started = Date.now();
    try {
        const out = execFileSync('node', [...JEST, `--testPathPatterns=${pattern}`], {
            cwd: ROOT,
            timeout: 300000,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { exitCode: 0, output: out, durationMs: Date.now() - started };
    } catch (err) {
        const output = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
        return { exitCode: err.status ?? 1, output, durationMs: Date.now() - started };
    }
}

function failedCount(output) {
    const m = /Tests:\s+(\d+) failed/i.exec(output);
    return m ? Number(m[1]) : 0;
}

const results = [];
for (const mutation of MUTATIONS) {
    const path = resolve(ROOT, mutation.file);
    const entry = { id: mutation.id, detectors: mutation.detectors, note: mutation.note };
    let original = null;
    try {
        original = readFileSync(path, 'utf8');
        const occurrences = original.split(mutation.target).length - 1;
        if (occurrences !== 1) {
            throw new Error(`anchor occurs ${occurrences}x, expected exactly 1`);
        }
        // TM-KILL-04: measure the green baseline BEFORE mutating. A
        // detector that is already red cannot witness a kill — without
        // this, pre-existing red would count as KILLED.
        const baseline = runDetectors(mutation.detectors);
        entry.baselineExit = baseline.exitCode;
        entry.baselineFailed = failedCount(baseline.output);
        if (baseline.exitCode !== 0) {
            entry.verdict = 'BASELINE_RED';
        } else {
            writeFileSync(path, original.replace(mutation.target, mutation.replacement));
            const run = runDetectors(mutation.detectors);
            entry.exitCode = run.exitCode;
            entry.failedTests = failedCount(run.output);
            entry.durationMs = run.durationMs;
            entry.verdict = run.exitCode !== 0 && entry.failedTests > 0 ? 'KILLED' : 'SURVIVED';
        }
    } catch (err) {
        entry.verdict = 'ERROR';
        entry.error = String(err?.message ?? err).slice(0, 300);
    } finally {
        if (original !== null) {
            writeFileSync(path, original);
            // Byte-identical restore is the residue check. (A substring
            // search for the replacement is unsound: short replacements
            // like `? 0` occur naturally throughout the sources.)
            entry.restored = sha(readFileSync(path, 'utf8')) === sha(original);
        } else {
            entry.restored = false;
        }
    }
    results.push(entry);
    const residue = entry.restored ? '' : ' RESIDUE-WARNING';
    console.log(`${entry.verdict}  ${entry.id}  (${entry.detectors}, ${entry.failedTests ?? 0} failed, restored=${entry.restored})${residue}`);
}

const killed = results.filter((r) => r.verdict === 'KILLED').length;
const clean = results.every((r) => r.restored);
console.log(`\n${killed}/${results.length} mutations killed; all restored: ${clean}`);
if (killed !== results.length || !clean) {
    const bad = results.filter((r) => r.verdict !== 'KILLED' || !r.restored).map((r) => r.id);
    console.log(`FAILING: ${bad.join(', ')}`);
    process.exit(1);
}
