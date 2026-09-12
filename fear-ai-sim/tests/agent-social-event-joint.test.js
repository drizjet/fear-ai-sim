import { describe, it, expect } from '@jest/globals';
import {
    RelationshipTensorSystem,
    SocialEventEngine,
    ContagionGraph,
    AffectiveAgent,
} from '../packages/core/index.js';

// Post-25 audit candidate 13: AffectiveAgent x SocialEventEngine joint.
// Full live chain: social event -> RelationshipTensorSystem trust ->
// ContagionGraph trust-scaled calm reassurance -> AffectiveAgent.tick
// context (contagionFear/leaderCalm) + peerTrust observations -> affect.
//
// The social channel is the calm-leader path: a peer with high leadership
// standing nearby while CALM damps focal fear via leaderCalm, scaled by
// focal trust in that peer (calmTrustGain). Betrayal craters trust, so a
// betrayed peer reassures less and focal fear stays higher.

const makeThreats = () => [{ id: 'wolf', type: 'PREDATOR', intensity: 0.7, distance: 30 }];
const makeCloseThreats = () => [{ id: 'wolf', type: 'PREDATOR', intensity: 0.95, distance: 8 }];
const FOCAL_BODY = { id: 'focal', x: 0, y: 0, z: 0, traits: { extraversion: 0.5, neuroticism: 0.5 } };

// One full pass of the joint. Every object is live: the engine writes the
// tensor, the tensor's trust feeds the contagion peer, and the contagion
// outputs feed the agent tick. event=null skips the engine for a no-event
// neutral (fresh tensor trust is 0).
function runChain(event, { seed = 'joint', peerId = 'peer', ticks = 5, threatFactory = makeThreats } = {}) {
    const tensor = new RelationshipTensorSystem();
    const engine = new SocialEventEngine();
    if (event !== null) engine.applyEvent(tensor, event, peerId, 'focal');
    const trust = tensor.getRelationship('focal', peerId).trust;
    const contagion = new ContagionGraph({ trustGain: 0.6, calmTrustGain: 0.8 });
    const socialPeer = {
        id: peerId, x: 10, y: 0, z: 0,
        fearBand: 'CALM', rawFear: 0.05, leadership: 0.9, trust,
    };
    const { contagionFear, leaderCalm } = contagion.evaluateContagion(FOCAL_BODY, [socialPeer]);
    const agent = new AffectiveAgent('focal', {}, { seed });
    let result = null;
    for (let i = 0; i < ticks; i++) {
        result = agent.tick(
            0.016,
            { threats: threatFactory(), peers: [{ id: peerId, x: 10, y: 0, z: 0 }], peerTrust: { [peerId]: trust } },
            { contagionFear, leaderCalm },
        );
    }
    return { trust, contagionFear, leaderCalm, result };
}

describe('AffectiveAgent x SocialEventEngine joint', () => {
    it('1. BETRAYAL lowers trust vs AID raising it through the live tensor', () => {
        const betrayed = runChain('BETRAYAL', { seed: 't1b' });
        const aided = runChain('AID', { seed: 't1a' });
        expect(betrayed.trust).toBeCloseTo(-0.85, 10);
        expect(aided.trust).toBeCloseTo(0.35, 10);
        expect(betrayed.trust).toBeLessThan(0);
        expect(aided.trust).toBeGreaterThan(0);
    });

    it('2. Betrayed-peer observations raise fear vs allied-peer, all else equal', () => {
        const betrayed = runChain('BETRAYAL', { seed: 't2' });
        const allied = runChain('AID', { seed: 't2' });
        // The social channel carries the signal: less trust -> less calm.
        expect(betrayed.leaderCalm).toBeCloseTo(0.199584, 10);
        expect(allied.leaderCalm).toBeCloseTo(0.344736, 10);
        expect(betrayed.leaderCalm).toBeLessThan(allied.leaderCalm);
        // Identical threats, ticks, and seeds: only the social path differs.
        expect(betrayed.result.affective_state.raw_fear).toBeCloseTo(0.301, 10);
        expect(allied.result.affective_state.raw_fear).toBeCloseTo(0.25, 10);
        expect(betrayed.result.affective_state.raw_fear)
            .toBeGreaterThan(allied.result.affective_state.raw_fear);
    });

    it('3. LEADERSHIP_SUCCESS vs FAILURE move affect in opposite directions', () => {
        const opts = { seed: 't3', threatFactory: makeCloseThreats };
        const success = runChain('LEADERSHIP_SUCCESS', opts);
        const failure = runChain('LEADERSHIP_FAILURE', opts);
        const neutral = runChain(null, opts);
        expect(success.trust).toBeCloseTo(0.3, 10);
        expect(failure.trust).toBeCloseTo(-0.6, 10);
        expect(neutral.trust).toBe(0);
        expect(success.leaderCalm).toBeCloseTo(0.338688, 10);
        expect(failure.leaderCalm).toBeCloseTo(0.229824, 10);
        // Opposite sides of the live no-event neutral through the same chain.
        expect(success.result.affective_state.raw_fear).toBeCloseTo(0.526, 10);
        expect(neutral.result.affective_state.raw_fear).toBeCloseTo(0.546, 10);
        expect(failure.result.affective_state.raw_fear).toBeCloseTo(0.587, 10);
        expect(success.result.affective_state.raw_fear)
            .toBeLessThan(neutral.result.affective_state.raw_fear);
        expect(failure.result.affective_state.raw_fear)
            .toBeGreaterThan(neutral.result.affective_state.raw_fear);
    });

    it('4. No social contact leaves the social channel neutral', () => {
        const contagion = new ContagionGraph({ trustGain: 0.6, calmTrustGain: 0.8 });
        const empty = contagion.evaluateContagion(FOCAL_BODY, []);
        expect(empty).toEqual({ contagionFear: 0, leaderCalm: 0, dominantSourceId: null });
        const withEmpty = new AffectiveAgent('focal', {}, { seed: 't4' });
        let rEmpty = null;
        for (let i = 0; i < 5; i++) {
            rEmpty = withEmpty.tick(
                0.016,
                { threats: makeThreats(), peers: [] },
                { contagionFear: empty.contagionFear, leaderCalm: empty.leaderCalm },
            );
        }
        const bare = new AffectiveAgent('focal', {}, { seed: 't4' });
        let rBare = null;
        for (let i = 0; i < 5; i++) rBare = bare.tick(0.016, { threats: makeThreats() }, {});
        expect(rEmpty.affective_state.raw_fear).toBeCloseTo(0.413, 10);
        expect(JSON.stringify(rEmpty)).toBe(JSON.stringify(rBare));
    });

    it('5. Exact replay of the chain is byte-identical', () => {
        const first = runChain('BETRAYAL', { seed: 't5' });
        const second = runChain('BETRAYAL', { seed: 't5' });
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        expect(second.result.affective_state.raw_fear).toBeCloseTo(0.301, 10);
        // The comparison is live: a different event diverges.
        const other = runChain('AID', { seed: 't5' });
        expect(JSON.stringify(other.result)).not.toBe(JSON.stringify(first.result));
    });
});
