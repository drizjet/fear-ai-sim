#!/usr/bin/env node
// Bounded live runner for the fear-ai-autopilot agent.
// Executes ONE step through @codebuff/sdk run() using the local credential store
// (getConfigDir()/credentials.json — authToken + fingerprintId feed runOnce directly).
// MUST live outside .agents/: loadLocalAgents globs every .mjs in that directory, and a
// runner that itself calls loadLocalAgents deadlocks the circular module import.
// Usage: node tools/run-autopilot-step.mjs ["bounded prompt (optional)"]
// Bound: maxAgentSteps defaults to 6 and the default prompt forbids file edits.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadLocalAgents, run } from '@codebuff/sdk';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const configDir = process.env.CODEBUFF_CONFIG_DIR ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.config', 'manicode');
const credPath = process.env.CODEBUFF_CREDENTIALS ?? path.join(configDir, 'credentials.json');
const DEFAULT_PROMPT = 'Single bounded work unit: run `npm test` once, report the suite and test counts, then stop. Do not edit any files.';
const prompt = process.argv.slice(2).join(' ').trim() || DEFAULT_PROMPT;
const maxAgentSteps = Number(process.env.MAX_AGENT_STEPS ?? 6);

if (!fs.existsSync(credPath)) {
    console.error(`[abort] no credentials at ${credPath} — run a codebuff login first or set CODEBUFF_CREDENTIALS`);
    process.exit(2);
}
const credential = JSON.parse(fs.readFileSync(credPath, 'utf8')).default ?? {};
if (!credential.authToken) {
    console.error('[abort] credentials.json has no default.authToken');
    process.exit(2);
}

const loaded = await loadLocalAgents({ agentsPath: path.join(ROOT, '.agents'), validate: true });
const registry = loaded && loaded.agents ? loaded.agents : loaded;
const agent = Object.values(registry ?? {})[0];
if (!agent?.id) {
    console.error('[abort] fear-ai-autopilot definition did not load via loadLocalAgents');
    process.exit(2);
}
if (loaded.validationErrors?.length) {
    console.error('[warn] validation errors:', JSON.stringify(loaded.validationErrors).slice(0, 400));
}

console.log(`[run] agent=${agent.id} model=${process.env.AUTOPILOT_MODEL ?? agent.model} steps<=${maxAgentSteps} cwd=${process.cwd()}`);
const result = await run({
    apiKey: credential.authToken,
    fingerprintId: credential.fingerprintId,
    cwd: process.cwd(),
    agent: process.env.AUTOPILOT_MODEL ? { ...agent, model: process.env.AUTOPILOT_MODEL } : agent,
    prompt,
    maxAgentSteps,
    handleEvent: event => {
        const label = typeof event === 'string' ? event : (event?.type ?? event?.kind ?? event?.name ?? JSON.stringify(event));
        console.log('[event]', String(label).slice(0, 160));
    },
});
const output = result?.output ?? result ?? null;
console.log('[done]', JSON.stringify(output).slice(0, 2000));
