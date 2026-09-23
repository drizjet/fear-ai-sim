// Fear AI autopilot controller agent definition.
// The installed @codebuff/sdk (0.10.7) exports no createAgent/createTool helpers, and its
// loader schema (isValidGeneratorFunction) requires handleSteps.toString() to start with
// "function*" — a SYNC generator driven co-style: the runner awaits each yielded promise
// and feeds the resolved value back into the yield expression. Agent modules export a
// plain definition object with id + model + displayName; loadLocalAgents({ agentsPath }) +
// validateAgents() consume this shape, and tests/autopilot-agent.test.js drives
// handleSteps() headlessly on every gate run.

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
  handleSteps: function* ({ agent, prompt }) {
    let step = 0;
    while (step++ < 1000) {
      const certificate = yield agent.runCommand(`python -c "from pathlib import Path; p = Path('docs/FEAR_AI_GLOBAL_STOP_CERTIFICATE.json'); print(p.read_text() if p.exists() else '')"`);
      if (certificate?.includes('"ledgerAgreement": "PASS"') && certificate.includes('"authorityTruth": "PASS"')) return;
      yield 'STEP';
      yield agent.run({ prompt: `${DIRECTIVE}\nExecute the next bounded work unit now. This is controller iteration ${step}. Do not stop merely because one responsibility finished.`, input: prompt });
    }
  },
};

export default fearAiAutopilot;
export { fearAiAutopilot, readText, DIRECTIVE };
