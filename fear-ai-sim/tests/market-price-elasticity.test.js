import { describe, it, expect } from '@jest/globals';
import { Market } from '../economy.js';

describe('Slice N — market price elasticity (history-dependent bid curve)', () => {
    it('getQuote remains instantaneous (backward compat)', () => {
        const m = new Market('test');
        m.setCapacity('food', 100);
        m.setDemand('food', 50, 1);
        m.inventory.set('food', 30);
        expect(m.getQuote('food').price).toBeCloseTo(1.8, 5);
    });

    it('getElasticQuote: sustained shortage costs more than brief shortage (momentum)', () => {
        const sustained = new Market('sustained');
        sustained.setCapacity('food', 100);
        sustained.setDemand('food', 50, 1);
        sustained.inventory.set('food', 10); // shortage 0.8
        // Prime the EMA with 5 ticks of shortage 0.8
        for (let i = 0; i < 5; i++) sustained.getElasticQuote('food');
        const sustainedPrice = sustained.getElasticQuote('food').price;

        const brief = new Market('brief');
        brief.setCapacity('food', 100);
        brief.setDemand('food', 50, 1);
        brief.inventory.set('food', 50); // shortage 0
        for (let i = 0; i < 5; i++) brief.getElasticQuote('food');
        // Brief spike to 0.8 for one tick
        brief.inventory.set('food', 10);
        const briefPrice = brief.getElasticQuote('food').price;

        // Sustained should be more expensive than a single-tick spike
        expect(sustainedPrice).toBeGreaterThan(briefPrice);
        // Both above base instant price
        expect(briefPrice).toBeGreaterThan(2.0);
    });

    it('getElasticQuote: recovering market price drops with negative momentum', () => {
        const m = new Market('recover');
        m.setCapacity('food', 100);
        m.setDemand('food', 50, 1);
        m.inventory.set('food', 5); // shortage 0.9
        for (let i = 0; i < 5; i++) m.getElasticQuote('food');
        const high = m.getElasticQuote('food').price;
        // Recover
        m.inventory.set('food', 45); // shortage 0.1
        const low = m.getElasticQuote('food').price;
        expect(low).toBeLessThan(high);
        expect(low).toBeLessThan(high * 0.7);
    });

    it('getElasticQuote serializes via Market.serialize roundtrip', () => {
        const m = new Market('test');
        m.setCapacity('food', 100);
        m.setDemand('food', 50, 1);
        m.inventory.set('food', 10);
        m.getElasticQuote('food');
        m.getElasticQuote('food');
        const ser = m.serialize();
        const m2 = Market.deserialize(ser);
        // Next quote should be close (EMA preserved)
        m.inventory.set('food', 10);
        m2.inventory.set('food', 10);
        const q1 = m.getElasticQuote('food').price;
        const q2 = m2.getElasticQuote('food').price;
        expect(q2).toBeCloseTo(q1, 5);
    });

    it('getElasticQuote: momentum adds premium on worsening shortage', () => {
        const m = new Market('mom');
        m.setCapacity('food', 100);
        m.setDemand('food', 50, 1);
        m.inventory.set('food', 30); // 0.4
        m.getElasticQuote('food');
        m.inventory.set('food', 10); // 0.8 delta +0.4
        const worsening = m.getElasticQuote('food');
        // momentum is positive on worsening
        expect(worsening.momentum).toBeGreaterThan(0);
        expect(worsening.price).toBeGreaterThan(2.4);
    });
});
