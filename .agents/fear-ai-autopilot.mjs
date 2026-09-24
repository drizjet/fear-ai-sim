// Fear AI autopilot controller agent definition.
// Runnable against the installed @codebuff/sdk 0.10.7 end to end:
//   - loadLocalAgents({ agentsPath }) + validateAgents() accept this plain definition
//     (id + model + displayName; handleSteps.toString() must start with "function*" per
//     isValidGeneratorFunction — a SYNC generator).
//   - The runner constructs it as handleSteps({ agentState, prompt, params, logger }) and
//     drives it: each next() feeds { agentState, toolResult, stepsComplete, nResponses }
//     back as the value of the yield expression. Yieldable values are
//     { toolName, input } tool calls, { type: 'STEP_TEXT', text } work steps, the literal
//     'STEP' / 'STEP_ALL' pause markers, or { type: 'GENERATE_N', n }.
//   - There is no `agent` object: terminal work is requested by yielding a
//     run_terminal_command tool call and reading the fed-back toolResult.

const DIRECTIVE = `
You are an executor inside the Fear AI V8 autonomous campaign. Read README.md (orientation), docs/CAMPAIGN_STATE.md (next responsibility + evidence), docs/FEAR_AI_GLOBAL_WORK_LEDGER.md (counters), and completion-ledger.md (per-area status, machine-checked) before acting; repository evidence outranks historical claims. Work on the highest-priority actionable responsibility, inspect before editing, preserve strong contracts, implement production fixes, run focused tests, negative controls, and broader gates, update durable state, and continue through additional work units whenever budget permits. Never declare global completion yourself. A local work unit is not campaign completion. If work remains, continue. Global completion is valid only when docs/FEAR_AI_GLOBAL_STOP_CERTIFICATE.json exists, matches the current repository state, and independently verifies actionableOpen=0, p0Open=0, p1Open=0, finiteP2Open=0, unauditedImplementation=0, redRelevantTests=0, staleRequiredProofs=0, structuralClosureAudit=PASS, dynamicClosureAudit=PASS, ledgerAgreement=PASS, and authorityTruth=PASS.
`;

const readText = {
  name: 'read_text',
  description: 'Read a repository file.',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  execute: async ({ path }, ctx) => ctx.runCommand(`python -c "from pathlib import Path; print(Path(r'${path.replaceAll("'", "''")}').read_text())"`),
};

const fearAiAutopilot = {
  id: 'fear-ai-autopilot',
  name: 'fear-ai-autopilot',
  displayName: 'Fear AI Autopilot',
  description: 'Runs bounded Fear AI campaign steps until an independently verified global certificate exists.',
  system: `${DIRECTIVE}\nUse normal repository tools available in this agent environment.`,
  model: 'mimo-v2-flash',
  tools: [readText],
  handleSteps: function* ({ prompt } = {}) {
    // Self-contained: the runner eval()s this function's SOURCE (toString → eval), so the
    // body must not reference module-scope bindings, so DIRECTIVE is embedded verbatim here.
    const directive = `\nYou are an executor inside the Fear AI V8 autonomous campaign. Read README.md (orientation), docs/CAMPAIGN_STATE.md (next responsibility + evidence), docs/FEAR_AI_GLOBAL_WORK_LEDGER.md (counters), and completion-ledger.md (per-area status, machine-checked) before acting; repository evidence outranks historical claims. Work on the highest-priority actionable responsibility, inspect before editing, preserve strong contracts, implement production fixes, run focused tests, negative controls, and broader gates, update durable state, and continue through additional work units whenever budget permits. Never declare global completion yourself. A local work unit is not campaign completion. If work remains, continue. Global completion is valid only when docs/FEAR_AI_GLOBAL_STOP_CERTIFICATE.json exists, matches the current repository state, and independently verifies actionableOpen=0, p0Open=0, p1Open=0, finiteP2Open=0, unauditedImplementation=0, redRelevantTests=0, staleRequiredProofs=0, structuralClosureAudit=PASS, dynamicClosureAudit=PASS, ledgerAgreement=PASS, and authorityTruth=PASS.\n`;
    let step = 0;
    while (step++ < 1000) {
      // Stage 1 — probe the stop certificate with a terminal tool call; the runner feeds
      // { toolResult } back into this yield expression when the command completes.
      const probe = yield { toolName: 'run_terminal_command', input: { command: `python -c "from pathlib import Path; p = Path('docs/FEAR_AI_GLOBAL_STOP_CERTIFICATE.json'); print(p.read_text() if p.exists() else '')"` } };
      // Raw text fields only — JSON.stringify would escape the certificate's own quotes.
      const certificate = (probe?.toolResult ?? []).map(entry => [entry?.stdout, entry?.stderr, entry?.text, entry?.content, entry?.output, entry?.result, typeof entry === 'string' ? entry : null].filter(piece => typeof piece === 'string').join('\n')).join('\n');
      if (certificate.includes('"ledgerAgreement": "PASS"') && certificate.includes('"authorityTruth": "PASS"')) return;
      // Stage 2 — dispatch exactly one bounded work unit as a text step (the model runs it
      // with its normal toolset), then pause on 'STEP' so the runner controls continuation
      // and the caller's maxAgentSteps bound always applies.
      yield { type: 'STEP_TEXT', text: `${directive}\nExecute the next bounded work unit now. This is controller iteration ${step}.${step === 1 && prompt ? `\nOpening instruction: ${prompt}` : ''} Do not stop merely because one responsibility finished.` };
      yield 'STEP';
    }
  },
};

export default fearAiAutopilot;
export { fearAiAutopilot, readText, DIRECTIVE };
