import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-RUMOR-REPUTATION-EVIDENCE-001 — the Rumors row's last remaining item: a delivered
// REPUTATION claim judges its subject from the evidence that ARRIVED, not the published intent.
// The verdict is the estimate the recipient actually ended up believing (≤1, clamped) and the
// weight is the confidence that survived latency, distortion, and source trust — so a rumor
// that decays in transit moves standing less, and a rumor with no arrived confidence moves
// nothing at all (no event). Both channels move: world-public standing and the recipient's own
// private opinion, each as a canonical REPUTATION_UPDATE chained to the delivery that carried
// it. Claims outside the `reputation:` namespace stay exactly as they were.
// Mutants pinned: published estimate judged instead of the arrived one; weight not taken from
// arrived confidence; private channel skipped; namespace guard removed (every claim judges);
// delivery parent chain dropped.

const world = () => {
    const society = new SocietyCore({ seed: 7 });
    society.actors.set('scout', { id: 'scout', beliefs: new Map() });
    society.actors.set('merchant', { id: 'merchant', beliefs: new Map() });
    return society;
};

const deliver = (society, claim, extra = {}, queue = {}) => {
    const rumor = society.rumors.publish({ claim, valueEstimate: .8, confidence: .9, source: 'scout', sourceTrust: .9, timestamp: 0, ...extra });
    society.queueRumor(rumor, { id: extra.recipientId ?? 'merchant' }, { delay: 1, ttl: 20, ...queue });
    for (let i = 0; i < 3; i += 1) society.tick({ actions: [{ kind: 'RUMOR_DELIVER', recipients: [extra.recipientId ?? 'merchant'] }] });
    return rumor;
};

const eventsOf = (society, type) => society.events.filter(event => event.type === type);

describe('RESP-RUMOR-REPUTATION-EVIDENCE-001: delivered rumors as reputation evidence', () => {
    it('moves both channels from the arrived evidence, chained to the delivery that carried it', () => {
        const society = world();
        const rumor = deliver(society, 'reputation:mira', { subject: 'mira' });

        const updates = eventsOf(society, 'REPUTATION_UPDATE');
        expect(updates).toHaveLength(2);
        const [publicUpdate, privateUpdate] = updates;

        const [delivered] = eventsOf(society, 'RUMOR_DELIVERED');
        const [belief] = eventsOf(society, 'BELIEF_UPDATED');
        expect(publicUpdate).toMatchObject({ scope: 'public', origin: 'RUMOR_DELIVERED', rumorId: rumor.id, subjectId: 'mira', observerId: null });
        expect(privateUpdate).toMatchObject({ scope: 'private', origin: 'RUMOR_DELIVERED', rumorId: rumor.id, subjectId: 'mira', observerId: 'merchant' });

        // the weight is the ARRIVED confidence (latency/trust attrition already applied), not the published .9
        expect(publicUpdate.weight).toBeCloseTo(belief.confidence, 10);
        expect(publicUpdate.weight).toBeLessThan(.9);
        expect(publicUpdate.value).toBeCloseTo(belief.estimate, 10);
        expect(publicUpdate.valueBefore).toBe(.5); // first judgment: no prior standing
        // an unjudged subject is anchored at neutral .5 against the arrived weight, so favorable
        // evidence raises standing — it can never drag it below neutral — and confidence decides
        // how far toward the verdict it lands
        expect(publicUpdate.valueAfter).toBeCloseTo(.5 * (1 - publicUpdate.weight) + publicUpdate.value * publicUpdate.weight, 10);
        expect(publicUpdate.valueAfter).toBeGreaterThan(.5);
        expect(publicUpdate.valueAfter).toBeLessThan(publicUpdate.value);

        // both channels moved identically for a first judgment, and each chained to the delivery
        expect(privateUpdate.valueAfter).toBeCloseTo(publicUpdate.valueAfter, 10);
        expect(publicUpdate.parentId).toBe(delivered.id);
        expect(privateUpdate.parentId).toBe(delivered.id);
        expect(society.reputation.get('mira')).toBeCloseTo(publicUpdate.valueAfter, 10);
        expect(society.reputation.getPrivate('merchant', 'mira')).toBeCloseTo(privateUpdate.valueAfter, 10);

        expect(society.causalChain(privateUpdate.id).lineage.map(event => event.type))
            .toEqual(['TURN', 'RUMOR_DELIVER', 'RUMOR_DELIVERED', 'REPUTATION_UPDATE']);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('judges what arrived, not what was published: distortion moves the verdict and attrition the weight', () => {
        const distorted = world();
        const rumor = deliver(distorted, 'reputation:mira', { subject: 'mira' }, { distortion: .5 });

        const [belief] = eventsOf(distorted, 'BELIEF_UPDATED');
        const [update] = eventsOf(distorted, 'REPUTATION_UPDATE');
        expect(belief.estimate).not.toBeCloseTo(rumor.valueEstimate, 10); // the message was distorted in transit
        expect(update.value).toBe(Math.min(1, Math.max(0, belief.estimate))); // the arrived estimate, clamped to [0,1]
        expect(update.value).not.toBeCloseTo(rumor.valueEstimate, 10);
        expect(update.weight).toBeCloseTo(belief.confidence, 10);

        // the same rumor delivered promptly and late: attrition decides how much standing moves
        const publish = society => {
            const source = society.rumors.publish({ claim: 'reputation:mira', subject: 'mira', valueEstimate: .8, confidence: .9, source: 'scout', sourceTrust: .9, timestamp: 0 });
            return source;
        };
        const prompt = world();
        prompt.queueRumor(publish(prompt), { id: 'merchant' }, { delay: 1, ttl: 40 });
        for (let i = 0; i < 4; i += 1) prompt.tick({ actions: [{ kind: 'RUMOR_DELIVER', recipients: ['merchant'] }] });
        const late = world();
        late.queueRumor(publish(late), { id: 'merchant' }, { delay: 12, ttl: 40 });
        for (let i = 0; i < 14; i += 1) late.tick({ actions: [{ kind: 'RUMOR_DELIVER', recipients: ['merchant'] }] });

        const [quick] = eventsOf(prompt, 'REPUTATION_UPDATE');
        const [decayed] = eventsOf(late, 'REPUTATION_UPDATE');
        expect(decayed.weight).toBeLessThan(quick.weight); // confidence did not survive the delay
        expect(prompt.reputation.get('mira')).toBeGreaterThan(.5); // favorable evidence raises standing
        expect(late.reputation.get('mira')).toBeGreaterThan(.5);
        expect(late.reputation.get('mira')).toBeLessThan(prompt.reputation.get('mira'));
    });

    it('emits nothing when no confidence arrived, and nothing for claims outside the namespace', () => {
        const unconvincing = world();
        deliver(unconvincing, 'reputation:mira', { subject: 'mira', confidence: 0 });
        expect(eventsOf(unconvincing, 'REPUTATION_UPDATE')).toHaveLength(0); // a weightless judgment is not evidence
        expect(unconvincing.reputation.get('mira')).toBe(.5);

        const ordinary = world();
        deliver(ordinary, 'route:north:danger', { subject: 'north', valueEstimate: .9 });
        expect(eventsOf(ordinary, 'RUMOR_DELIVERED')).toHaveLength(1); // the rumor still arrives as a belief…
        expect(eventsOf(ordinary, 'REPUTATION_UPDATE')).toHaveLength(0); // …but judges nobody
        expect(ordinary.reputation.get('north')).toBe(.5);
        expect(ordinary.reputation.getPrivate('merchant', 'north')).toBe(.5);
        expect(ordinary.auditEventGraph().ok).toBe(true);
    });

    it('falls back to the claim suffix when the rumor carries no subject field', () => {
        const society = world();
        deliver(society, 'reputation:aldric');
        const [update] = eventsOf(society, 'REPUTATION_UPDATE');
        expect(update.subjectId).toBe('aldric');
        expect(society.reputation.get('aldric')).toBeGreaterThan(.5);
    });

    it('keeps one private channel per recipient while the public channel accumulates', () => {
        const society = world();
        society.actors.set('caravan', { id: 'caravan', beliefs: new Map() });
        const rumor = society.rumors.publish({ claim: 'reputation:mira', subject: 'mira', valueEstimate: .9, confidence: .8, source: 'scout', sourceTrust: .8, timestamp: 0 });
        society.queueRumor(rumor, { id: 'merchant' }, { delay: 1, ttl: 20 });
        society.queueRumor(rumor, { id: 'caravan' }, { delay: 1, ttl: 20 });
        for (let i = 0; i < 3; i += 1) society.tick({ actions: [{ kind: 'RUMOR_DELIVER', recipients: ['merchant', 'caravan'] }] });

        const updates = eventsOf(society, 'REPUTATION_UPDATE');
        expect(updates).toHaveLength(4); // two recipients × (public + private)
        expect(updates.filter(event => event.scope === 'public')).toHaveLength(2);
        expect(updates.map(event => event.observerId)).toEqual([null, 'merchant', null, 'caravan']);
        // the second public judgment blended against the first, so public standing is shared…
        expect(updates[2].valueBefore).toBeCloseTo(updates[0].valueAfter, 10);
        // …while each recipient's private channel is its own
        expect(society.reputation.getPrivate('merchant', 'mira')).toBeCloseTo(updates[1].valueAfter, 10);
        expect(society.reputation.getPrivate('caravan', 'mira')).toBeCloseTo(updates[3].valueAfter, 10);
        expect(society.reputation.getPrivate('stranger', 'mira')).toBe(.5);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('round-trips both channels and stays deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = world();
            deliver(society, 'reputation:mira', { subject: 'mira' });
            return society;
        };
        const control = run();
        const interrupted = world();
        interrupted.rumors.publish({ claim: 'reputation:mira', subject: 'mira', valueEstimate: .8, confidence: .9, source: 'scout', sourceTrust: .9, timestamp: 0 });
        const rumorId = interrupted.rumors.rumors.at(-1).id;
        interrupted.queueRumor(interrupted.rumors.rumors.at(-1), { id: 'merchant' }, { delay: 1, ttl: 20 });
        interrupted.tick({ actions: [{ kind: 'RUMOR_DELIVER', recipients: ['merchant'] }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));
        restored.tick({ actions: [{ kind: 'RUMOR_DELIVER', recipients: ['merchant'] }] });
        restored.tick({ actions: [{ kind: 'RUMOR_DELIVER', recipients: ['merchant'] }] });

        expect(restored.reputation.get('mira')).toBeCloseTo(control.reputation.get('mira'), 10);
        expect(restored.reputation.getPrivate('merchant', 'mira')).toBeCloseTo(control.reputation.getPrivate('merchant', 'mira'), 10);
        expect(eventsOf(restored, 'REPUTATION_UPDATE')).toHaveLength(2);
        expect(eventsOf(restored, 'REPUTATION_UPDATE').map(event => event.rumorId)).toEqual([rumorId, rumorId]);
        expect(restored.serialize()).toEqual(control.serialize());
        expect(restored.auditEventGraph().ok).toBe(true);

        expect(JSON.stringify(run().serialize())).toBe(JSON.stringify(run().serialize()));
    });
});
