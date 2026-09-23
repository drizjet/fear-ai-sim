import { describe, expect, it } from '@jest/globals';
import { Morale, Personality } from '../socialcore.js';
import { mulberry32 } from '../randomcore.js';
import { DecisionCore } from '../decisioncore.js';
import { SocietyCore } from '../societycore.js';

// Personality/Morale have one canonical runtime owner (socialcore; brain.js is absent from
// this checkout): traits/morale register on the world, flow into decision scoring, and revive
// as class instances across save/load.
// Mutants pinned: DECISION wiring dropped; Personality.decisionBandWidth ownership dropped.

const ACTIONS = [
    { id: 'rest', considerations: [{ name: 'calm', value: 1 }] },
    { id: 'scout', considerations: [{ name: 'edge', value: .93 }] },
];
const DECISION = { kind: 'DECISION', actorId: 'scout', actions: ACTIONS };

describe('Personality/Morale canonical ownership', () => {
    it('Personality owns the decision band formula in production scoring', () => {
        class WideBand extends Personality { decisionBandWidth() { return 1; } }
        const wide = new WideBand({ conscientiousness: 1 }); // impulsiveness 0, but the class method widens to 1
        const calm = new Personality({ conscientiousness: 1 }); // impulsiveness 0 → band 0
        const pick = (personality, random) => new DecisionCore({ random }).evaluate({ personality }, ACTIONS).selected;

        expect(pick(calm, () => 0.999)).toBe('rest');          // band 0: only the best action qualifies
        expect(pick(wide, () => 0.999)).toBe('scout');         // the class method owns the formula → wider band reaches the runner-up
        expect(pick({ impulsiveness: 0 }, () => 0.999)).toBe('rest'); // plain-object fallback unchanged (back-compat)
    });

    it('seeded trait draws are reproducible, derived traits hold, Morale clamps', () => {
        const a = new Personality({}, { rng: mulberry32(7) });
        const b = new Personality({}, { rng: mulberry32(7) });
        expect([a.openness, a.conscientiousness, a.extraversion, a.agreeableness, a.neuroticism])
            .toEqual([b.openness, b.conscientiousness, b.extraversion, b.agreeableness, b.neuroticism]);
        expect(a.impulsiveness).toBeCloseTo(1 - a.conscientiousness);
        expect(a.riskTolerance).toBeCloseTo(1 - a.neuroticism);
        expect(a.decisionBandWidth()).toBeCloseTo(a.impulsiveness * .15);
        expect(new Morale(5).value).toBe(2);
        expect(new Morale(.01).value).toBe(.2);
    });

    it('registered personality and morale flow into DECISION (band + consideration)', () => {
        const society = new SocietyCore({ seed: 9 });
        society.setPersonality('scout', { conscientiousness: 1 }); // impulsiveness 0 → band 0

        for (let turn = 0; turn < 10; turn += 1) {
            society.tick({ actions: [DECISION] });
            const event = society.events.filter(item => item.type === 'DECISION').at(-1);
            expect(event.selected).toBe('rest'); // band excludes the runner-up regardless of RNG
        }

        society.setPersonality('scout', { conscientiousness: 0 }); // impulsiveness 1 → band .15
        const picks = [];
        for (let turn = 0; turn < 30; turn += 1) {
            society.tick({ actions: [DECISION] });
            picks.push(society.events.filter(item => item.type === 'DECISION').at(-1).selected);
        }
        expect(picks).toContain('scout'); // widened band makes the runner-up reachable

        society.setMorale('scout', .35);
        society.tick({ actions: [{ kind: 'DECISION', actorId: 'scout', actions: [{ id: 'rally', considerations: [{ name: 'morale', value: 'morale' }] }] }] });
        const rally = society.events.filter(item => item.type === 'DECISION').at(-1);
        expect(rally.selected).toBe('rally');
        expect(rally.score).toBeCloseTo(.35); // world-registered morale reached the consideration
    });

    it('MORALE_UPDATE drives canonical TURN children through Morale', () => {
        const society = new SocietyCore({ seed: 4 });
        const turn = (society.tick({ actions: [{ kind: 'MORALE_UPDATE', actorId: 'soldier', victories: 10 }] }), society.events.find(event => event.type === 'TURN'));
        const shift = society.events.find(event => event.type === 'MORALE_SHIFT');
        expect(shift).toMatchObject({ actorId: 'soldier', before: 1, parentId: turn.id });
        expect(shift.after).toBeCloseTo(1.11); // 1 + .01 base + 10 × .01 victory
        expect(shift.delta).toBeCloseTo(.11);
        expect(shift.freezeRisk).toBe(false);
        expect(society.getMorale('soldier').value).toBeCloseTo(1.11);

        society.tick({ actions: [{ kind: 'MORALE_UPDATE', actorId: 'soldier', losses: 1000, fear: 1 }] });
        const second = society.events.filter(event => event.type === 'MORALE_SHIFT').at(-1);
        expect(second.after).toBeLessThan(second.before);
        expect(second.after).toBe(.2); // clamped floor
        expect(second.freezeRisk).toBe(true);
        expect(society.getMorale('soldier').canFreeze()).toBe(second.freezeRisk);
    });

    it('personalities, morale, and actor types survive save/load as class instances', () => {
        const society = new SocietyCore({ seed: 12 });
        society.setPersonality('scout', { openness: .8, conscientiousness: .2 });
        society.setMorale('scout', 1.4);
        society.actors.set('scout', { id: 'scout', type: 'SCOUT' });
        society.tick({ actions: [{ kind: 'MORALE_UPDATE', actorId: 'scout', safe: true }] });

        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const personality = restored.getPersonality('scout');
        expect(personality).toBeInstanceOf(Personality);
        expect(personality.openness).toBeCloseTo(.8);
        expect(restored.getMorale('scout')).toBeInstanceOf(Morale);
        expect(restored.getMorale('scout').value).toBeCloseTo(1.45); // 1.4 + .05 safe bump
        expect(typeof restored.getMorale('scout').update).toBe('function'); // methods revive, not plain data
        expect(restored.actors.get('scout').type).toBe('SCOUT');
        expect(restored.events.map(event => event.type)).toEqual(society.events.map(event => event.type));
        expect(restored.auditEventGraph().ok).toBe(true);

        restored.tick({ actions: [{ kind: 'MORALE_UPDATE', actorId: 'scout', losses: 50 }] }); // the loop continues
        expect(restored.getMorale('scout').value).toBeLessThan(1.45);
        const ids = restored.events.map(event => event.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('two seeded worlds produce identical personality draws and morale histories', () => {
        const run = () => {
            const society = new SocietyCore({ seed: 77 });
            society.setPersonality('a', {}); // all traits drawn from the world RNG
            society.setPersonality('b', {});
            society.tick({ actions: [{ kind: 'MORALE_UPDATE', actorId: 'a', victories: 5 }, { kind: 'MORALE_UPDATE', actorId: 'b', fear: 1, losses: 3 }] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
