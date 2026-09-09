/**
 * @file host-time-discipline.test.js
 *
 * Front D/E / Sections 163–164, 223–226: Multi-Rate Scheduling & Clock Discipline.
 */

import { HostTimeDiscipline } from '../packages/core/index.js';

describe('Front D/E / Sections 163–164, 223–226: Host Time Discipline', () => {
    test('1. Variable dt converges without overshoot or NaN', () => {
        const fine = new HostTimeDiscipline();
        let f1 = 0.1;
        for (let i = 0; i < 600; i++) f1 = fine.integrateFear(f1, 0.9, 1 / 60);
        const coarse = new HostTimeDiscipline();
        let f2 = 0.1;
        for (let i = 0; i < 60; i++) f2 = coarse.integrateFear(f2, 0.9, 1 / 6);
        expect(Number.isFinite(f1)).toBe(true);
        expect(Number.isFinite(f2)).toBe(true);
        expect(f1).toBeGreaterThan(0.85);
        expect(Math.abs(f1 - f2)).toBeLessThan(0.05);
        expect(f1).toBeLessThanOrEqual(1);
    });

    test('2. Pause freezes time and resume continues bit-identical', () => {
        const a = new HostTimeDiscipline();
        a.advance(1 / 60);
        a.advance(1 / 60);
        a.pause();
        const p1 = a.advance(1 / 60);
        const p2 = a.advance(1 / 60);
        expect(p1.paused).toBe(true);
        expect(p2.simTime).toBe(p1.simTime);
        a.resume();
        const r1 = a.advance(1 / 60);

        const b = new HostTimeDiscipline();
        b.advance(1 / 60);
        b.advance(1 / 60);
        b.advance(1 / 60);
        expect(r1.tick).toBe(b.tick - 1);
        expect(r1.simTime).toBeCloseTo(3 / 60, 5);
        expect(a.pausedTicks).toBe(2);
    });

    test('3. Time dilation scales applied dt deterministically', () => {
        const c = new HostTimeDiscipline();
        c.setTimeScale(2.0);
        c.advance(1 / 60);
        c.advance(1 / 60);
        expect(c.simTime).toBeCloseTo(4 / 60, 5);
        const half = new HostTimeDiscipline();
        half.setTimeScale(0.5);
        half.advance(1 / 60);
        expect(half.simTime).toBeCloseTo(0.5 / 60, 5);
    });

    test('4. Multi-rate schedule fires affect/social/faction on cadence', () => {
        const c = new HostTimeDiscipline();
        expect(c.dueSubsystems(0).sort()).toEqual(['affect', 'faction', 'social']);
        expect(c.dueSubsystems(1)).toEqual(['affect']);
        expect(c.dueSubsystems(5).sort()).toEqual(['affect', 'social']);
        expect(c.dueSubsystems(20).sort()).toEqual(['affect', 'faction', 'social']);
        const ran = [];
        expect(c.runDue(20, { affect: () => ran.push('affect'), social: () => ran.push('social'), faction: () => ran.push('faction') })).toEqual(['affect', 'faction', 'social']);
    });

    test('5. Host clock faults fall back safely and are counted', () => {
        const c = new HostTimeDiscipline();
        c.advance(NaN);
        c.advance(-5);
        c.advance(Infinity);
        expect(c.corrections).toBe(3);
        expect(Number.isFinite(c.simTime)).toBe(true);
        expect(c.integrateFear(0.5, 0.9, NaN)).toBeGreaterThanOrEqual(0.5);
    });

    test('6. Ten-thousand-tick soak stays bounded and finite', () => {
        const c = new HostTimeDiscipline();
        let fear = 0.2;
        for (let i = 0; i < 10000; i++) {
            const dt = i % 97 === 0 ? 0.2 : 1 / 60;
            fear = c.integrateFear(fear, i % 500 < 250 ? 0.9 : 0.1, dt);
        }
        expect(Number.isFinite(fear)).toBe(true);
        expect(fear).toBeGreaterThanOrEqual(0);
        expect(fear).toBeLessThanOrEqual(1);
    });

    test('7. Identical dt sequences replay bit-identically', () => {
        const run = () => {
            const c = new HostTimeDiscipline();
            const dts = [1 / 60, 1 / 30, 0.1, 1 / 60, 1 / 120];
            let fear = 0.2;
            const out = [];
            for (const dt of dts) {
                const s = c.advance(dt);
                fear = c.integrateFear(fear, 0.8, s.dtApplied);
                out.push([s.simTime, fear]);
            }
            return out;
        };
        expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
        const audit = new HostTimeDiscipline().auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.hostPhysicsMutations).toBe(0);
    });
});
