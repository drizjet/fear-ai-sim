#!/usr/bin/env node
/** Memory Relevance + Pathology runner (Sections XV-XVII). Runs the
 * MemoryPathologyBattery plus a scripted relevance demo and writes
 * a results JSON snapshot.
 * Usage: node benchmarks/behavioral-evaluation/memory_relevance_pathology.mjs [--json]
 */
import { writeFileSync } from 'node:fs';
import { LayeredMemorySystem } from '../../packages/core/src/LayeredMemorySystem.js';
import { MemoryRelevanceScorer } from '../../packages/core/src/MemoryRelevanceScorer.js';
import { MemoryPathologyBattery } from '../../packages/core/src/MemoryPathologyBattery.js';

const outPath = new URL('./memory_relevance_pathology_results.json', import.meta.url);

const sys = new LayeredMemorySystem();
sys.recordEpisodic({ type: 'SURVIVED_AMBUSH', valence: -0.9, arousal: 0.9, salience: 0.85, participants: ['orc-7'], location: { x: 10, y: 0, z: 0 }, tick: 90 });
sys.recordEpisodic({ type: 'ABANDONED_BY_PEER', valence: -0.6, arousal: 0.6, salience: 0.6, participants: ['guard-3'], location: { x: 40, y: 0, z: 0 }, tick: 70 });
sys.recordEpisodic({ type: 'RESOURCE_DISCOVERED', valence: 0.5, arousal: 0.2, salience: 0.35, participants: ['elf-2'], location: { x: 500, y: 0, z: 0 }, tick: 10 });
sys.recordSemantic('glen', 'SANCTUARY', { x: 12, y: 0, z: 0 }, 0.85, {}, 95);
sys.recordSemantic('far-quarry', 'RESOURCE', { x: 900, y: 0, z: 0 }, 0.7, {}, 20);
sys.tickCount = 100;

const scorer = new MemoryRelevanceScorer();
const ranking = scorer.rank(sys, {
    nowTick: 100,
    entityIds: ['orc-7'],
    position: { x: 12, y: 0, z: 0 },
    locationRadius: 50,
    goalTags: ['ambush', 'hazard']
}, 5);

const battery = new MemoryPathologyBattery().runAll();

const report = {
    relevanceDemo: {
        evaluated: ranking.evaluated,
        top: ranking.ranked.map((r) => ({ layer: r.layer, id: r.id, type: r.type, score: +r.score.toFixed(4) }))
    },
    pathology: {
        passCount: battery.passCount,
        probeCount: battery.probeCount,
        allPass: battery.allPass,
        probes: battery.probes
    },
    hostAuthority: { hostMutations: 0, note: 'Advisory memory only; no host physics/inventory/world writes' }
};

writeFileSync(outPath, JSON.stringify(report, null, 2));
if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(`Memory relevance: evaluated ${ranking.evaluated}, top=${report.relevanceDemo.top[0]?.type} (${report.relevanceDemo.top[0]?.score})`);
    console.log(`Pathology: ${battery.passCount}/${battery.probeCount} probes pass (allPass=${battery.allPass})`);
    console.log(`Results written to ${outPath}`);
}
