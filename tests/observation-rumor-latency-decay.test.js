import { describe, expect, it } from '@jest/globals';
import { ReputationBook } from '../socialcore.js';
import { SocietyCore } from '../societycore.js';

describe('RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001: delayed delivery, decay, distortion, recipient-local propagation', () => {
    it('decays delivered confidence with in-transit latency beyond the nominal hop', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'bandits-approaching', valueEstimate: 4, confidence: .9, source: 'scout', sourceTrust: 1 });
        const fast = { id: 'fast', beliefs: new Map(), sourceTrust: 1 };
        const slow = { id: 'slow', beliefs: new Map(), sourceTrust: 1 };
        society.queueRumor(rumor, fast, { delay: 1, ttl: 20 });
        society.queueRumor(rumor, slow, { delay: 6, ttl: 20 });
        for (let t = 0; t < 6; t += 1) { society.tick(); society.deliverRumors([fast, slow]); }
        const fastBelief = fast.beliefs.get(rumor.claim);
        const slowBelief = slow.beliefs.get(rumor.claim);
        // The nominal one-tick handoff carries the source confidence untouched...
        expect(fastBelief.evidence[0].confidence).toBeCloseTo(.9, 5);
        expect(fastBelief.evidence[0].latency).toBe(0);
        // ...while five extra ticks of latency decay at the default half-life of 10.
        expect(slowBelief.evidence[0].confidence).toBeCloseTo(.9 * Math.pow(.5, 5 / 10), 5);
        expect(slowBelief.evidence[0].latency).toBe(5);
        expect(slowBelief.confidence).toBeLessThan(fastBelief.confidence);
        // Decay never rewrites the estimate or the evidence subject.
        expect(slowBelief.estimate).toBe(4);
        expect(slowBelief.evidence[0].subject).toBe(rumor.subject);
    });

    it('compounds distortion with latency on delivered confidence and value', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'raid-imminent', valueEstimate: 2, confidence: .8, source: 'scout', sourceTrust: 1 });
        const quick = { id: 'quick', beliefs: new Map(), sourceTrust: 1 };
        const slow = { id: 'slow', beliefs: new Map(), sourceTrust: 1 };
        society.queueRumor(rumor, quick, { delay: 1, ttl: 20, distortion: .5 });
        society.queueRumor(rumor, slow, { delay: 6, ttl: 20, distortion: .5 });
        for (let t = 0; t < 6; t += 1) { society.tick(); society.deliverRumors([quick, slow]); }
        // Value distortion is additive for both deliveries.
        expect(quick.beliefs.get(rumor.claim).estimate).toBe(2.5);
        expect(slow.beliefs.get(rumor.claim).estimate).toBe(2.5);
        // Confidence: distortion penalty (1 - |d| * .1) compounds with latency decay.
        expect(quick.beliefs.get(rumor.claim).evidence[0].confidence).toBeCloseTo(.8 * .95, 5);
        expect(slow.beliefs.get(rumor.claim).evidence[0].confidence).toBeCloseTo(.8 * .95 * Math.pow(.5, 5 / 10), 5);
        expect(slow.beliefs.get(rumor.claim).confidence).toBeLessThan(quick.beliefs.get(rumor.claim).confidence);
    });

    it('resolves source trust per recipient and lets skepticism gate belief weight', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'mine-caved-in', valueEstimate: 1, confidence: 1, source: 'miner', sourceTrust: .5 });
        const trusting = { id: 'trusting', beliefs: new Map(), trustFor: source => (source === 'miner' ? 1 : .5) };
        const wary = { id: 'wary', beliefs: new Map(), trustFor: source => (source === 'miner' ? .1 : .5) };
        const skeptic = { id: 'skeptic', beliefs: new Map(), trustFor: () => 1, skepticism: .8 };
        society.queueRumor(rumor, trusting, { delay: 1, ttl: 10 });
        society.queueRumor(rumor, wary, { delay: 1, ttl: 10 });
        society.queueRumor(rumor, skeptic, { delay: 1, ttl: 10 });
        society.tick(); society.deliverRumors([trusting, wary, skeptic]);
        expect(trusting.beliefs.get(rumor.claim).evidence[0].sourceTrust).toBe(1);
        expect(wary.beliefs.get(rumor.claim).evidence[0].sourceTrust).toBe(.1);
        expect(skeptic.beliefs.get(rumor.claim).evidence[0].sourceTrust).toBeCloseTo(.2, 5);
        const trustingConfidence = trusting.beliefs.get(rumor.claim).confidence;
        const skepticConfidence = skeptic.beliefs.get(rumor.claim).confidence;
        const waryConfidence = wary.beliefs.get(rumor.claim).confidence;
        expect(trustingConfidence).toBeGreaterThan(skepticConfidence);
        expect(skepticConfidence).toBeGreaterThan(waryConfidence);
    });

    it('falls back to a reputation book for source trust', () => {
        const society = new SocietyCore();
        const reputation = new ReputationBook();
        reputation.update('miner', .05, 1);
        const rumor = society.rumors.publish({ claim: 'shaft-unsafe', valueEstimate: 1, confidence: .9, source: 'miner' });
        const recipient = { id: 'merchant', beliefs: new Map(), reputation };
        society.queueRumor(rumor, recipient, { delay: 1, ttl: 10 });
        society.tick(); society.deliverRumors([recipient]);
        expect(recipient.beliefs.get(rumor.claim).evidence[0].sourceTrust).toBeCloseTo(.05, 5);
    });

    it('propagates a rumor through the relayer-local belief, not the raw rumor', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'trade-route-blocked', valueEstimate: 3, confidence: .9, source: 'scout', sourceTrust: 1 });
        const relay = { id: 'relay', beliefs: new Map(), sourceTrust: 1 };
        const merchant = { id: 'merchant', beliefs: new Map(), sourceTrust: 1 };
        society.queueRumor(rumor, relay, { delay: 6, ttl: 20 }); // long latency erodes the relay's belief
        for (let t = 0; t < 6; t += 1) { society.tick(); society.deliverRumors([relay]); }
        const queued = society.relayRumor(rumor, relay, merchant, { delay: 1, ttl: 10 });
        expect(queued).not.toBeNull();
        society.tick(); society.deliverRumors([merchant]);
        const belief = merchant.beliefs.get(rumor.claim);
        expect(belief.evidence[0].source).toBe('relay');
        expect(belief.estimate).toBe(3);
        // The relayed rumor carries the relay's decayed local confidence, never the scout's original .9.
        expect(belief.evidence[0].confidence).toBeGreaterThan(0);
        expect(belief.evidence[0].confidence).toBeLessThan(.9);
    });

    it('refuses to relay what the relayer has not internalized', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'frontier-fort-fallen', valueEstimate: 1, confidence: 1, source: 'scout' });
        const bystander = { id: 'bystander', beliefs: new Map() };
        const merchant = { id: 'merchant', beliefs: new Map() };
        expect(society.relayRumor(rumor, bystander, merchant, { delay: 1 })).toBeNull();
        expect(merchant.beliefs.size).toBe(0);
    });

    it('ages delivered rumor beliefs as the world clock advances', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'wolves-near-camp', valueEstimate: 2, confidence: 1, source: 'hunter', sourceTrust: 1 });
        const recipient = { id: 'herder', beliefs: new Map(), sourceTrust: 1 };
        society.queueRumor(rumor, recipient, { delay: 1, ttl: 10 });
        society.tick(); society.deliverRumors([recipient]);
        const belief = recipient.beliefs.get(rumor.claim);
        const before = belief.confidence;
        expect(before).toBeGreaterThan(0);
        for (let t = 0; t < 20; t += 1) society.tick();
        expect(belief.confidence).toBeLessThan(before);
        expect(belief.estimate).toBe(2); // aging never rewrites the estimate
    });

    it('keeps latency decay deterministic across identical worlds and save/load', () => {
        const run = () => {
            const society = new SocietyCore({ seed: 42 });
            const rumor = society.rumors.publish({ claim: 'caravan-delayed', valueEstimate: 1, confidence: .7, source: 'courier', sourceTrust: .8 });
            const recipient = { id: 'merchant', beliefs: new Map(), sourceTrust: 1 };
            society.queueRumor(rumor, recipient, { delay: 5, ttl: 20 });
            for (let t = 0; t < 5; t += 1) { society.tick(); society.deliverRumors([recipient]); }
            return recipient.beliefs.get(rumor.claim).evidence[0].confidence;
        };
        expect(run()).toBe(run());
        // A restored world preserves queuedAt/sourceConfidence and decays identically.
        const society = new SocietyCore({ seed: 42 });
        const rumor = society.rumors.publish({ claim: 'caravan-delayed', valueEstimate: 1, confidence: .7, source: 'courier', sourceTrust: .8 });
        const recipient = { id: 'merchant', beliefs: new Map(), sourceTrust: 1 };
        society.queueRumor(rumor, recipient, { delay: 5, ttl: 20 });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const restoredRecipient = { id: 'merchant', beliefs: new Map(), sourceTrust: 1 };
        for (let t = 0; t < 5; t += 1) { restored.tick(); restored.deliverRumors([restoredRecipient]); }
        expect(restoredRecipient.beliefs.get(rumor.claim).evidence[0].confidence).toBeCloseTo(run(), 10);
    });

    it('drives rumor belief clocks from the world clock, never Date.now', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'night-watch-report', valueEstimate: 1, confidence: .8, source: 'watch', sourceTrust: 1 });
        expect(rumor.timestamp).toBe(0); // published on the world clock
        const recipient = { id: 'watchman', beliefs: new Map(), sourceTrust: 1 };
        society.queueRumor(rumor, recipient, { delay: 3, ttl: 10 });
        for (let t = 0; t < 3; t += 1) { society.tick(); society.deliverRumors([recipient]); }
        const evidence = recipient.beliefs.get(rumor.claim).evidence[0];
        expect(evidence.timestamp).toBe(0);   // evidence timestamp stays on the world clock
        expect(evidence.deliveredAt).toBe(3); // arrival is stamped with the world clock
        expect(evidence.latency).toBe(2);
        expect(recipient.beliefs.get(rumor.claim).lastUpdated).toBe(0);
    });

    it('round-trips the network confidence half-life across save/load', () => {
        const society = new SocietyCore();
        society.rumors.confidenceHalfLife = 3;
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.rumors.confidenceHalfLife).toBe(3); // unserialized-field mutant restores the default 10 here
        // and delivery actually decays at the restored rate, not the constructor default
        const rumor = restored.rumors.publish({ claim: 'beacon-relit', valueEstimate: 1, confidence: 1, source: 'scout', sourceTrust: 1 });
        const recipient = { id: 'keeper', beliefs: new Map(), sourceTrust: 1 };
        restored.queueRumor(rumor, recipient, { delay: 6, ttl: 20 });
        for (let t = 0; t < 6; t += 1) { restored.tick(); restored.deliverRumors([recipient]); }
        expect(recipient.beliefs.get(rumor.claim).evidence[0].confidence).toBeCloseTo(Math.pow(.5, 5 / 3), 5);
    });

    it('honors a per-item half-life override on delayed delivery', () => {
        const society = new SocietyCore();
        const rumor = society.rumors.publish({ claim: 'siege-preparations', valueEstimate: 1, confidence: 1, source: 'scout', sourceTrust: 1 });
        const fastDecay = { id: 'fastDecay', beliefs: new Map(), sourceTrust: 1 };
        const slowDecay = { id: 'slowDecay', beliefs: new Map(), sourceTrust: 1 };
        society.queueRumor(rumor, fastDecay, { delay: 6, ttl: 20, halfLife: 3 });
        society.queueRumor(rumor, slowDecay, { delay: 6, ttl: 20, halfLife: 30 });
        for (let t = 0; t < 6; t += 1) { society.tick(); society.deliverRumors([fastDecay, slowDecay]); }
        const fast = fastDecay.beliefs.get(rumor.claim).evidence[0].confidence;
        const slow = slowDecay.beliefs.get(rumor.claim).evidence[0].confidence;
        expect(fast).toBeCloseTo(Math.pow(.5, 5 / 3), 5);
        expect(slow).toBeCloseTo(Math.pow(.5, 5 / 30), 5);
        expect(fast).toBeLessThan(slow);
    });
});