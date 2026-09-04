import { chooseMerchantRouteDecision } from '../canonical-trade-system.js';
import { selectRoute, routeCost } from '../routing.js';

const ROUTES = [
    { id: 'road-a', from: 'north', to: 'south', distance: 5, actualDanger: 0.8, condition: 1 },
    { id: 'road-b', from: 'north', to: 'south', distance: 9, actualDanger: 0.1, condition: 1 },
];

function merchant(overrides = {}) {
    return {
        id: 'm1', location: 'north', cargo: 10, cargoKind: null,
        riskTolerance: 0.5, cargoValueSensitivity: 0.5,
        routeFamiliarity: { 'road-a': 0.5, 'road-b': 0.5 },
        routeBeliefs: {
            'road-a': { perceivedDanger: 0.8, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.05, confidence: 0.9 },
        },
        ...overrides,
    };
}

const BARE_WORLD = { towns: new Map(), merchants: [] };

describe('routing owns the merchant base cost (slice AD)', () => {
    // TM-VAC-01 scope note: the reconstruction test below and the
    // ranking-identity test pin the 10x perception MAPPING (they
    // pass for any implementation computing the same linear blend,
    // including an inlined fork). Single-ownership is proven by the
    // routing-only fork detectors at the bottom (toll, weather):
    // those terms have no legacy-blend equivalent and vanish if the
    // routeCost() call is replaced by inline math.
    test('routingBaseCost reconstructs the legacy blend exactly (mapping consistency)', () => {
        const decision = chooseMerchantRouteDecision(merchant(), ROUTES, {}, { tick: 0, world: BARE_WORLD });
        for (const item of decision.ranked) {
            const legacy = item.distanceCost + item.dangerPenalty + item.cargoLossRisk / 100 - item.familiarityBonus;
            expect(item.routingBaseCost).toBeCloseTo(legacy, 10);
            expect(item.score).toBeCloseTo(legacy, 10);
        }
    });

    test('live ranking order matches routing cost order exactly', () => {
        const m = merchant();
        const decision = chooseMerchantRouteDecision(m, ROUTES, {}, { tick: 0, world: BARE_WORLD });
        // The meaningful contract is score-order === routeCost-order:
        // the decision ranks routes exactly as routing prices them.
        const costs = new Map(ROUTES.map(r => {
            const b = m.routeBeliefs[r.id];
            return [r.id, routeCost(r, {
                perceivedDanger: b.perceivedDanger,
                fearSensitivity: (1 - m.riskTolerance) * 40,
                expectedCargoLoss: (m.cargo * 0.5 * b.perceivedDanger) / 10,
                routeFamiliarity: 0.05 * 10,
                confidence: 1,
            })];
        }));
        const ranked = [...decision.ranked].sort((a, b) => a.score - b.score);
        const byCost = [...costs.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
        expect(ranked.map(r => r.route.id)).toEqual(byCost);
    });

    test('known danger still flips the merchant to the long safe road', () => {
        const decision = chooseMerchantRouteDecision(merchant(), ROUTES, {}, { tick: 0, world: BARE_WORLD });
        expect(decision.chosenRoute).toBe('road-b');
    });

    test('road condition flows through routing: degraded short loses to pristine long', () => {
        const degraded = ROUTES.map(r => r.id === 'road-a' ? { ...r, condition: 0.5 } : r);
        const evenBeliefs = merchant({
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.1, confidence: 0.9 },
                'road-b': { perceivedDanger: 0.1, confidence: 0.9 },
            },
        });
        const decision = chooseMerchantRouteDecision(evenBeliefs, degraded, {}, { tick: 0, world: BARE_WORLD });
        expect(decision.chosenRoute).toBe('road-b');
    });

    test('market opportunity layers on top of the routing base', () => {
        const world = {
            towns: new Map([
                ['south', { market: { getQuote: () => ({ price: 3.0 }) } }],
            ]),
            merchants: [],
        };
        const m = merchant({ cargoKind: 'food' });
        const decision = chooseMerchantRouteDecision(m, ROUTES, {}, { tick: 0, world });
        for (const item of decision.ranked) {
            expect(item.opportunityBonus).toBeGreaterThan(0);
            expect(item.score).toBeCloseTo(item.routingBaseCost - item.opportunityBonus, 10);
        }
    });

    test('selectRoute agrees with the live decision on identical beliefs', () => {
        const m = merchant({
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.0, confidence: 1 },
                'road-b': { perceivedDanger: 0.0, confidence: 1 },
            },
        });
        const decision = chooseMerchantRouteDecision(m, ROUTES, {}, { tick: 0, world: BARE_WORLD });
        const picked = selectRoute(ROUTES, {
            perceivedDanger: 0, fearSensitivity: (1 - m.riskTolerance) * 40,
            expectedCargoLoss: 0, routeFamiliarity: 0.5, confidence: 1,
        });
        expect(decision.chosenRoute).toBe(picked.route.id);
    });

    test('routing-only toll term steers the live decision (no canonical equivalent)', () => {
        // The tolled road is listed first: a legacy distance/danger-only
        // blend ties and the index tiebreak would keep it. Routing prices
        // the toll, so the merchant pays to avoid it.
        const tolled = [
            { id: 'road-toll', from: 'north', to: 'south', distance: 5, actualDanger: 0.1, condition: 1, tollCost: 3 },
            { id: 'road-free', from: 'north', to: 'south', distance: 5, actualDanger: 0.1, condition: 1 },
        ];
        const m = merchant({
            routeBeliefs: {
                'road-toll': { perceivedDanger: 0.1, confidence: 1 },
                'road-free': { perceivedDanger: 0.1, confidence: 1 },
            },
        });
        const decision = chooseMerchantRouteDecision(m, tolled, {}, { tick: 0, world: BARE_WORLD });
        expect(decision.chosenRoute).toBe('road-free');
        const tollItem = decision.ranked.find(r => r.route.id === 'road-toll');
        const freeItem = decision.ranked.find(r => r.route.id === 'road-free');
        expect(tollItem.routingBaseCost - freeItem.routingBaseCost).toBeCloseTo(0.3, 10);
    });

    test('routing-only weather term flows into the live base cost (fork detector)', () => {
        // weatherCost has no legacy-blend equivalent: replacing the
        // routeCost() call with the inline legacy formula drops this
        // term while the mapping-consistency tests above stay green.
        // Toll proves the same for tolls; weather is the second
        // independent routing-only term.
        const stormed = [
            { id: 'road-storm', from: 'north', to: 'south', distance: 5, actualDanger: 0.1, condition: 1, weatherCost: 3 },
            { id: 'road-calm', from: 'north', to: 'south', distance: 5, actualDanger: 0.1, condition: 1 },
        ];
        const m = merchant({
            routeBeliefs: {
                'road-storm': { perceivedDanger: 0.1, confidence: 1 },
                'road-calm': { perceivedDanger: 0.1, confidence: 1 },
            },
        });
        const decision = chooseMerchantRouteDecision(m, stormed, {}, { tick: 0, world: BARE_WORLD });
        expect(decision.chosenRoute).toBe('road-calm');
        const stormItem = decision.ranked.find(r => r.route.id === 'road-storm');
        const calmItem = decision.ranked.find(r => r.route.id === 'road-calm');
        expect(stormItem.routingBaseCost - calmItem.routingBaseCost).toBeCloseTo(0.3, 10);
    });
});
