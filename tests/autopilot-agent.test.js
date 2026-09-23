import { describe, expect, it } from '@jest/globals';
import autopilot, { DIRECTIVE, fearAiAutopilot, readText } from '../.agents/fear-ai-autopilot.mjs';

// The autopilot controller must be runnable from this checkout: the module loads against
// the installed @codebuff/sdk (0.10.7) — no phantom helper imports — exposes the exact
// shape the SDK loader schema requires (id, model, displayName, sync `function*` per
// isValidGeneratorFunction's startsWith("function*") check on the stringified source),
// and its handleSteps loop actually executes co-style: probe the stop certificate, yield
// a bounded STEP, dispatch the work unit, and halt on a verified certificate.

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
        expect(fearAiAutopilot.system).toContain('FEAR_AI_GLOBAL_STOP_CERTIFICATE.json');
        expect(readText.name).toBe('read_text');
        expect(typeof readText.execute).toBe('function');
        expect(DIRECTIVE).toContain('Never declare global completion yourself');
    });

    it('drives the controller loop co-style: certificate probe → STEP → bounded work unit', async () => {
        const commands = [];
        const prompts = [];
        const agent = {
            runCommand: command => { commands.push(command); return Promise.resolve(''); }, // no certificate yet
            run: ({ prompt }) => { prompts.push(prompt); return Promise.reject(new Error('STOP_SMOKE')); },
        };
        const iterator = fearAiAutopilot.handleSteps({ agent, prompt: 'begin' });
        const probe = await iterator.next(); // yields the certificate probe promise
        expect(typeof probe.value?.then).toBe('function');
        expect(await probe.value).toBe('');
        const marker = await iterator.next(await probe.value); // result fed back → STEP marker
        expect(marker.value).toBe('STEP');
        expect(marker.done).toBe(false);
        const work = await iterator.next(); // yields the bounded work-unit promise
        expect(typeof work.value?.then).toBe('function');
        await expect(work.value).rejects.toThrow('STOP_SMOKE'); // runner surfaces the rejection
        expect(commands).toHaveLength(1);
        expect(commands[0]).toContain('FEAR_AI_GLOBAL_STOP_CERTIFICATE.json');
        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain('Execute the next bounded work unit');
        expect(prompts[0]).toContain(DIRECTIVE.trim().slice(0, 40));
    });

    it('halts immediately when a verified stop certificate exists', async () => {
        const runs = [];
        const agent = {
            runCommand: () => Promise.resolve('{ "ledgerAgreement": "PASS", "authorityTruth": "PASS" }'),
            run: step => { runs.push(step); return Promise.resolve(); },
        };
        const iterator = fearAiAutopilot.handleSteps({ agent, prompt: 'x' });
        const probe = await iterator.next();
        const done = await iterator.next(await probe.value);
        expect(done.done).toBe(true);
        expect(runs).toHaveLength(0); // no work unit once the certificate verifies
    });
});
