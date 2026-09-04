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
        target: 'perCapitaProduction *= Math.max(0, 1 - stormSev * 0.3);',
        replacement: 'perCapitaProduction *= 1;',
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
                applied = true;`,
        replacement: `result.destinationTownId = destination.id;
                result.refugeeCount = refugeeCount;
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
        const beforeHash = sha(original);
        writeFileSync(path, original.replace(mutation.target, mutation.replacement));
        const run = runDetectors(mutation.detectors);
        entry.exitCode = run.exitCode;
        entry.failedTests = failedCount(run.output);
        entry.durationMs = run.durationMs;
        entry.verdict = run.exitCode !== 0 && entry.failedTests > 0 ? 'KILLED' : 'SURVIVED';
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
