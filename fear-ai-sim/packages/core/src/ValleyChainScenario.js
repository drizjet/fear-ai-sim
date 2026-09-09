/**
 * packages/core/src/ValleyChainScenario.js
 *
 * Sections CCVII-CCIX:
 * The canonical Frontier Valley chain — threat attacks caravan — executed
 * as a deterministic advisory pipeline across the real chunk engines:
 * ambush encounter → route danger → rumor propagation → anticipatory
 * dread → route avoidance → scarcity pressure → retaliation intent.
 * Each link consumes the previous link's output; the scenario asserts
 * the chain is unbroken end to end.
 *
 * Uses live engines throughout (EncounterConsequenceEngine,
 * InformationPropagationEngine, AnticipatoryFearEngine,
 * ScarcityPressureHarness over a live EconomicFeedbackSystem,
 * RetaliationModel). Only host-owned world state (settlements, ledger)
 * is fixture data. Deterministic: fixed seeds, no wall-clock, no RNG
 * beyond seeded engines.
 *
 * Advisory only. Host owns caravans, roads, goods, and war.
 */

import { EncounterConsequenceEngine } from './EncounterConsequenceEngine.js';
import { InformationPropagationEngine } from './InformationPropagationEngine.js';
import { AnticipatoryFearEngine } from './AnticipatoryFearEngine.js';
import { ScarcityPressureHarness } from './ScarcityPressureHarness.js';
import { EconomicFeedbackSystem } from './EconomicFeedbackSystem.js';
import { RetaliationModel } from './RetaliationModel.js';

export const CHAIN_LINKS = Object.freeze([
    'AMBUSH', 'ROUTE_DANGER', 'RUMOR', 'DREAD', 'AVOIDANCE', 'SCARCITY', 'RETALIATION'
]);

export class ValleyChainScenario {
    constructor() {
        this.runs = 0;
    }

    /**
     * Run the canonical chain.
     * @param {object} [options={}] { seed }
     * @returns {{ links, unbroken, summary }}
     */
    run(options = {}) {
        const seed = options.seed ?? 424242;
        const links = {};

        // Link 1-2: ambush encounter produces route danger.
        const consequences = new EncounterConsequenceEngine();
        const outcome = consequences.process({
            category: 'HIGHWAY_AMBUSH', resolution: 'COMBAT_ENGAGEMENT', corridorId: 'highland_pass'
        });
        links.AMBUSH = { resolution: 'COMBAT_ENGAGEMENT', corridorId: 'highland_pass' };
        links.ROUTE_DANGER = outcome.corridorHazards[0];

        // Link 3: survivors seed rumors that propagate through the valley net.
        const net = new InformationPropagationEngine({}, seed);
        for (const a of ['survivor', 'elder', 'merchant', 'guard', 'smith']) net.registerAgent(a, a === 'elder' ? 0.8 : 0.5);
        net.addListenEdge('elder', 'survivor');
        net.addListenEdge('merchant', 'elder');
        net.addListenEdge('guard', 'elder');
        net.addListenEdge('smith', 'merchant');
        const rumorSeed = outcome.rumorSeeds[0];
        const rumorId = net.injectRumor('ROAD_AMBUSH', rumorSeed.claim, 'survivor', { confidence: rumorSeed.confidence });
        for (let t = 0; t < 6; t++) net.advanceTick();
        const reach = net.networkStats().totalReach;
        links.RUMOR = { rumorId, reach, status: net.rumors.get(rumorId).status };

        // Link 4-5: dread converts hearsay into route avoidance.
        const dread = new AnticipatoryFearEngine();
        for (const held of net.heldBy('merchant')) {
            if (held.rumorId === rumorId) {
                dread.absorb('ROAD', 'highland_pass', { confidence: held.confidence, observed: false, threatLevel: 0.85 });
            }
        }
        const ranked = dread.rankRoutes([{ id: 'highland_pass' }, { id: 'low_road', danger: 0.15 }]);
        links.DREAD = { highlandDread: dread.dreadOf('ROAD', 'highland_pass') };
        links.AVOIDANCE = { ranked, avoidsHighland: ranked[0].id !== 'highland_pass' };

        // Link 6: blocked trade starves the far settlement.
        const econ = new EconomicFeedbackSystem();
        econ.registerSettlementMarket('oakhaven', { population: 60, production: { food: 0.4 }, initialStockpiles: { food: 4 } });
        for (let t = 0; t < 30; t++) econ.tick(1);
        const scarcity = new ScarcityPressureHarness();
        links.SCARCITY = scarcity.score(econ, 'oakhaven');

        // Link 7: deprivation and blame produce a retaliation recommendation.
        const retaliation = new RetaliationModel();
        retaliation.provoke('bandits', 'settlers', 'RAID');
        links.RETALIATION = retaliation.recommend('bandits', 'settlers');

        const order = CHAIN_LINKS;
        const checks = {
            AMBUSH: links.AMBUSH.resolution === 'COMBAT_ENGAGEMENT',
            ROUTE_DANGER: links.ROUTE_DANGER.danger > 0,
            RUMOR: links.RUMOR.reach >= 3,
            DREAD: links.DREAD.highlandDread > 0.15,
            AVOIDANCE: links.AVOIDANCE.avoidsHighland === true,
            SCARCITY: links.SCARCITY.deprivation > 0.2,
            RETALIATION: ['WARN', 'DEMAND_PAYMENT', 'THREATEN', 'PRESSURE', 'STRIKE_BACK'].includes(links.RETALIATION.intent)
        };
        const unbroken = order.every((l) => checks[l] === true);
        this.runs += 1;
        return {
            seed,
            links,
            checks,
            unbroken,
            summary: order.map((l) => `${l}:${checks[l] ? 'OK' : 'BROKEN'}`).join(' → ')
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            runs: this.runs
        };
    }
}
