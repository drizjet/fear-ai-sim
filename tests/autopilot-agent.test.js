import { describe, expect, it } from '@jest/globals';
import autopilot, { DIRECTIVE, fearAiAutopilot, readText } from '../.agents/fear-ai-autopilot.mjs';

// The autopilot controller must be runnable against the installed @codebuff/sdk (0.10.7)
// end to end: the module loads (no phantom helper imports), exposes the exact shape the
// loader schema validates (id, model, displayName, sync `function*` per
// isValidGeneratorFunction's startsWith("function*") check on the stringified source), and
// its handleSteps loop speaks the runner's real protocol — constructor
// ({ agentState, prompt, params, logger }), next() feeds back { toolResult, ... },
// yields are { toolName, input } tool calls, { type: 'STEP_TEXT' } work steps, and the
// literal 'STEP' pause marker. Verified live 2026-09-23 (tools/run-autopilot-step.mjs).

describe('fear-ai-autopilot agent', () => {
    it('loads with the definition shape the SDK loader validates', () => {
        expect(autopilot).toBe(fearAiAutopilot);
        expect(fearAiAutopilot.id).toBe('fear-ai-autopilot'); // loadLocalAgents requires id + model
        expect(fearAiAutopilot.name).toBe('fear-ai-autopilot');
        expect(fearAiAutopilot.displayName).toBe('Fear AI Autopilot'); // schema requires it
        expect(fearAiAutopilot.model).toBe('mimo-v2-flash');
        expect(typeof fearAiAutopilot.handleSteps).toBe('function');
        // the SDK's isValidGeneratorFunction check, exactly:
        expect(Function.prototype.toString.call(fearAiAutopilot.handleSteps).trim().startsWith('function*')).toBe(true);
        // the runner eval()s the generator source, so the embedded directive copy must stay
        // byte-equal to the exported one (module-scope bindings are invisible to eval):
        const embedded = fearAiAutopilot.handleSteps.toString().match(/const directive = `([\s\S]*?)`;/)?.[1];
        // toString() yields SOURCE text, so its \n escapes normalize to DIRECTIVE's newlines:
        expect((embedded ?? '').replace(/\\n/g, '\n')).toBe(DIRECTIVE);
        expect(fearAiAutopilot.system).toContain('FEAR_AI_GLOBAL_STOP_CERTIFICATE.json');
        expect(readText.name).toBe('read_text');
        expect(typeof readText.execute).toBe('function');
        expect(DIRECTIVE).toContain('Never declare global completion yourself');
    });

    it('drives the runner protocol: certificate tool call → STEP_TEXT unit → STEP pause → re-probe', () => {
        const iterator = fearAiAutopilot.handleSteps({ prompt: 'begin' });

        // Stage 1: terminal probe for the stop certificate
        const probe = iterator.next();
        expect(probe.value).toEqual({
            toolName: 'run_terminal_command',
            input: { command: expect.stringContaining('FEAR_AI_GLOBAL_STOP_CERTIFICATE.json') },
        });

        // No certificate yet (fed back as { toolResult }) → dispatch one bounded unit
        const unit = iterator.next({ agentState: { runId: 'r1' }, toolResult: [{ stdout: '' }] });
        expect(unit.value.type).toBe('STEP_TEXT');
        expect(unit.value.text).toContain('Execute the next bounded work unit now');
        expect(unit.value.text).toContain('controller iteration 1');
        expect(unit.value.text).toContain('Opening instruction: begin');
        expect(unit.value.text).toContain(DIRECTIVE.trim().slice(0, 40));

        // Pause marker hands control back to the runner
        const pause = iterator.next({ agentState: { runId: 'r1' }, toolResult: [] });
        expect(pause.value).toBe('STEP');

        // Next resume re-probes the certificate before any further unit
        const reprobe = iterator.next({ agentState: { runId: 'r1' }, toolResult: [] });
        expect(reprobe.value.toolName).toBe('run_terminal_command');
    });

    it('halts immediately when a verified stop certificate exists', () => {
        const iterator = fearAiAutopilot.handleSteps({ prompt: 'x' });
        const probe = iterator.next();
        expect(probe.value.toolName).toBe('run_terminal_command');
        const done = iterator.next({
            agentState: { runId: 'r1' },
            toolResult: [{ stdout: '{ "ledgerAgreement": "PASS", "authorityTruth": "PASS" }' }],
        });
        expect(done.done).toBe(true); // verified certificate ends the controller, no units run
    });
});
