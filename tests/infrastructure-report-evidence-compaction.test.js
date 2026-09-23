import { describe, expect, it } from '@jest/globals';
import { AgentBelief, BeliefEvidence } from '../socialcore.js';

describe('RESP-INFRASTRUCTURE-REPORT-EVIDENCE-COMPACTION-001', () => {
    it('retains recent evidence and bounds repeated reports', () => {
        const belief = new AgentBelief('route:road:danger', null, 0, { now: () => 0, maxEvidence: 8 });
        for (let i = 0; i < 100; i++) belief.addEvidence(new BeliefEvidence({ claim: belief.claim, valueEstimate: i, source: `scout-${i % 2}`, sourceTrust: .5, confidence: .8, timestamp: i }));
        expect(belief.evidence).toHaveLength(8);
        expect(belief.estimate).toBe(99);
        expect(belief.evidence.at(-1).source).toBe('scout-1');
        expect(belief.evidence[0].timestamp).toBe(92);
    });

    it('does not allow compaction to change the latest decision value', () => {
        const full = new AgentBelief('route:road:danger', 0, .5, { now: () => 0, maxEvidence: 128 });
        const compact = new AgentBelief('route:road:danger', 0, .5, { now: () => 0, maxEvidence: 4 });
        for (let i = 0; i < 20; i++) {
            const evidence = { claim: full.claim, valueEstimate: i % 3, source: `source-${i}`, sourceTrust: i % 2 ? .25 : 1, confidence: .7, timestamp: i };
            full.addEvidence(evidence); compact.addEvidence(evidence);
        }
        expect(compact.estimate).toBe(full.estimate);
        expect(compact.confidence).toBeCloseTo(full.confidence);
        expect(compact.evidence.at(-1).source).toBe(full.evidence.at(-1).source);
    });
});
