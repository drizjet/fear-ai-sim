import { describe, expect, it } from '@jest/globals';
import { BeliefStore, Evidence, INFORMATION_LAYERS } from '../beliefs.js';

describe('Evidence and belief primitives', () => {
    it('weights observations by confidence and source trust', () => {
        const store = new BeliefStore();
        const belief = store.observe(new Evidence({ subject: 'road-a', claim: 'danger', value: 0.9, sourceTrust: 1, confidence: 1, tick: 1 }));
        expect(belief.layer).toBe(INFORMATION_LAYERS.AGENT_BELIEF);
        expect(belief.value).toBe(0.9);
        expect(belief.confidence).toBeGreaterThan(0.4);
    });

    it('preserves conflicting evidence without collapsing it into ground truth', () => {
        const store = new BeliefStore();
        store.observe({ subject: 'road-a', claim: 'danger', value: 1, sourceTrust: 1, confidence: 1 });
        const belief = store.observe({ subject: 'road-a', claim: 'danger', value: 0, sourceTrust: 1, confidence: 1 });
        expect(belief.layer).toBe(INFORMATION_LAYERS.AGENT_BELIEF);
        expect(belief.value).toBeCloseTo(0.5);
        expect(store.evidence).toHaveLength(2);
    });

    it('round-trips beliefs and evidence without changing information layers', () => {
        const store = new BeliefStore({ decay: 0.2 });
        store.observe({ subject: 'road-a', claim: 'danger', value: 0.7, sourceId: 'scout', confidence: 0.8, sourceTrust: 0.9, tick: 3 });
        const restored = new BeliefStore().deserialize(store.serialize());
        expect(restored.get('road-a', 'danger')).toMatchObject({
            layer: INFORMATION_LAYERS.AGENT_BELIEF,
            value: 0.7,
            lastTick: 3
        });
        expect(restored.evidence[0]).toBeInstanceOf(Evidence);
        expect(restored.decay).toBe(0.2);
    });

    it('decays confidence and creates a distinct public rumor', () => {
        const store = new BeliefStore({ decay: 0.1 });
        store.observe({ subject: 'road-a', claim: 'danger', value: 0.8, confidence: 1, sourceTrust: 1 });
        const before = store.get('road-a', 'danger');
        store.decayAll();
        const rumor = store.createRumor('road-a', 'danger', 'survivor-1', { distortion: 0.1, tick: 4 });
        expect(store.get('road-a', 'danger').confidence).toBeLessThan(before.confidence);
        expect(rumor.layer).toBe(INFORMATION_LAYERS.PUBLIC_RUMOR);
        expect(rumor.value).toBeCloseTo(0.9);
        expect(rumor.sourceId).toBe('survivor-1');
    });
});
