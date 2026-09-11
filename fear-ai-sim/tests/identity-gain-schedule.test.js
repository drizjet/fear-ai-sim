import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';

// NEXT-130: adaptive blend-gain scheduling (CCI-28 frontier 14). Fixed
// blend holds constant; threat-compression scales identity influence down
// as immediate state pressure rises (weak situations show personality,
// strong situations compress it).
describe('NEXT-130: adaptive blend-gain scheduling', () => {
    const TRAITS = { neuroticism: 0.9, fear: 0.85, resilience: 0.2 };
    const CALM = {};
    const HOT = { threats: [{ id: 't', intensity: 0.9, distance: 4 }] };
    const MODERATE = { threats: [{ id: 't', intensity: 0.45, distance: 12 }] };
    const mk = (id, opts = {}) => new AffectiveAgent(id, TRAITS, {
        seed: `${id}-seed`,
        identityArchitecture: new CharacterIdentityArchitecture(),
        identityBlend: 1,
        ...opts
    });

    it('1. Fixed schedule holds full gain in calm and threat alike', () => {
        const a = mk('fix');
        a.tick(0.016, CALM);
        expect(a.tick(0.016, CALM).identity_frame.appliedGain).toBe(1);
        for (let i = 0; i < 6; i++) a.tick(0.016, HOT);
        const r = a.tick(0.016, HOT);
        expect(r.identity_frame.appliedGain).toBe(1);
        expect(r.identity_frame.gainSchedule).toBe('fixed');
    });

    it('2. Threat-compression drops gain under threat, restores in calm', () => {
        const a = mk('sched', { identityGainSchedule: 'threat-compression' });
        a.tick(0.016, CALM);
        const calmGain = a.tick(0.016, CALM).identity_frame.appliedGain;
        for (let i = 0; i < 6; i++) a.tick(0.016, HOT);
        const hotGain = a.tick(0.016, HOT).identity_frame.appliedGain;
        expect(calmGain).toBe(1);
        expect(hotGain).toBeLessThan(calmGain);
        expect(hotGain).toBeGreaterThanOrEqual(0);
    });

    it('3. Scheduled urgency converges toward legacy under severe threat', () => {
        const fixed = mk('fixu');
        const sched = mk('schedul', { identityGainSchedule: 'threat-compression' });
        const plain = new AffectiveAgent('plainu', TRAITS, { seed: 'plainu-seed' });
        for (let i = 0; i < 6; i++) {
            fixed.tick(0.016, HOT);
            sched.tick(0.016, HOT);
            plain.tick(0.016, HOT);
        }
        const rf = fixed.tick(0.016, HOT).action_intent.urgency;
        const rs = sched.tick(0.016, HOT).action_intent.urgency;
        const rp = plain.tick(0.016, HOT).action_intent.urgency;
        expect(Math.abs(rs - rp)).toBeLessThanOrEqual(Math.abs(rf - rp));
    });

    it('4. Compression strength scales the effect monotonically', () => {
        const gains = [];
        for (const strength of [0, 0.5, 1]) {
            const a = mk(`str${strength}`, {
                identityGainSchedule: 'threat-compression',
                identityCompression: strength
            });
            for (let i = 0; i < 6; i++) a.tick(0.016, HOT);
            gains.push(a.tick(0.016, HOT).identity_frame.appliedGain);
        }
        expect(gains[0]).toBe(1);
        expect(gains[1]).toBeGreaterThan(gains[2]);
    });

    it('5. Schedule and strength round-trip through agent state', () => {
        const a = mk('persist', { identityGainSchedule: 'threat-compression', identityCompression: 0.4 });
        const b = new AffectiveAgent('persist', TRAITS, { seed: 'persist-seed' });
        b.setState(JSON.parse(JSON.stringify(a.getState())));
        expect(b.identityGainSchedule).toBe('threat-compression');
        expect(b.identityCompression).toBe(0.4);
    });

    it('6. Base fear and tick count round-trip through agent state', () => {
        const a = mk('base');
        for (let i = 0; i < 10; i++) a.tick(0.016, MODERATE);
        const b = new AffectiveAgent('base', TRAITS, { seed: 'base-seed' });
        b.setState(JSON.parse(JSON.stringify(a.getState())));
        expect(b.currentFear).toBe(a.currentFear);
        expect(b.tickCount).toBe(a.tickCount);
    });

    it('7. Scheduled runs are deterministic', () => {
        const run = () => {
            const a = mk('det', { identityGainSchedule: 'threat-compression' });
            let r;
            for (let i = 0; i < 10; i++) r = a.tick(0.016, i % 2 === 0 ? HOT : MODERATE);
            return r;
        };
        expect(run()).toEqual(run());
    });
});
