#!/usr/bin/env node
/**
 * FABE Chunk Integration Benchmark runner (Sections CXLVI-CXLIX).
 *
 * Runs FabeChunkIntegrationSuite and writes a results JSON snapshot.
 * Usage: node benchmarks/behavioral-evaluation/fabe_chunk_integration.mjs [--seeds 11,22,33]
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FabeChunkIntegrationSuite } from '../../packages/core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function runFabeChunkIntegrationBenchmark(options = {}) {
    const suite = new FabeChunkIntegrationSuite(options);
    const report = suite.runBenchmark();
    return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const seedArg = process.argv.find((a) => a.startsWith('--seeds='));
    const seeds = seedArg ? seedArg.slice(8).split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite) : undefined;
    const report = runFabeChunkIntegrationBenchmark(seeds ? { seeds } : {});
    const outPath = join(__dirname, 'fabe_chunk_integration_results.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`FABE chunk integration: ${Object.values(report.passes).filter(Boolean).length}/6 dimensions pass (allPass=${report.allPass})`);
    console.log(`Results written to ${outPath}`);
}
