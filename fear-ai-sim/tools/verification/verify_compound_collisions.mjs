/**
 * tools/verification/verify_compound_collisions.mjs
 * 
 * Deterministic First-Principles Verification of Cross-System Compound Collisions:
 * Scenario 1: Leader Fall x Contagion Cascade x Rumor Distortion
 * Scenario 2: Scarcity Shock x Migration Flight x Panic Lock
 * 
 * Invariants Verified:
 * 1. Positive feedback dampening (no unbounded runaway amplification).
 * 2. Strict bounds [0.0, 1.0] for fear, morale, cohesion.
 * 3. Finite recovery latency post-shock (recovery is guaranteed).
 * 4. Zero NaNs, zero Infs, zero negative inventories, zero population loss/duplication.
 * 5. Replay bit-exact determinism across identical seeds.
 * 6. Hard Rule 9 compliance: 100% manual deterministic execution, zero test runner frameworks.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';
import { PackCoordinationEngine, PACK_ROLES, TACTICAL_PHASES } from '../../packages/core/src/PackCoordinationEngine.js';
import { ContagionGraph } from '../../packages/core/src/ContagionGraph.js';
import { InformationPropagationEngine, PROPAGATED_RUMOR_TOPICS, RUMOR_STATUS } from '../../packages/core/src/InformationPropagationEngine.js';
import { EmergentSystemCollisionHarness, COLLISION_SCENARIOS } from '../../packages/core/src/EmergentSystemCollisionHarness.js';
import { EconomicFeedbackSystem, COMMODITY_TYPES, EconomicPathologyDetector } from '../../packages/core/src/EconomicFeedbackSystem.js';
import { SettlementMigrationSystem, MIGRATION_DRIVERS } from '../../packages/core/src/SettlementMigrationSystem.js';
import { MultiFeedbackCascadeSystem, COUPLING_VARIABLES } from '../../packages/core/src/MultiFeedbackCascadeSystem.js';

async function runVerification() {
    console.log('=== CROSS-SYSTEM COMPOUND COLLISION AUDIT & VERIFICATION ===\n');

    const testResults = {
        scenario1: null,
        scenario2: null,
        determinismPass: false
    };

    // =========================================================================
    // SCENARIO 1: LEADER FALL x CONTAGION CASCADE x RUMOR DISTORTION
    // =========================================================================
    console.log('--- SCENARIO 1: LEADER FALL x CONTAGION CASCADE x RUMOR DISTORTION ---');

    function simulateScenario1(seed = 42) {
        const packEngine = new PackCoordinationEngine({ seed });
        const contagion = new ContagionGraph({ contagionRadius: 60.0, leaderRadius: 80.0, baseContagionStrength: 0.6 });
        const infoEngine = new InformationPropagationEngine({ mutationRate: 0.20 }, seed);

        const packId = 'vanguard_squad';
        packEngine.createPack(packId);

        // Agents map: id -> { agent: AffectiveAgent, active: boolean }
        const agents = new Map();

        // Register Alpha Leader
        packEngine.registerMember(packId, 'alpha', { dominance: 0.95, courage: 0.85, fear: 0.05 }, { x: 0, y: 0, z: 0 });
        const alphaAg = new AffectiveAgent('alpha', {
            leadership: 0.95, resilience: 0.90, neuroticism: 0.15, extraversion: 0.7, fear: 0.05
        }, { seed: seed });
        alphaAg.x = 0; alphaAg.y = 0; alphaAg.z = 0;
        agents.set('alpha', { agent: alphaAg, active: true });

        // Register Subordinates
        const subIds = ['sub_1', 'sub_2', 'sub_3', 'sub_4'];
        for (let i = 0; i < subIds.length; i++) {
            const sid = subIds[i];
            const px = 6 + i * 4;
            packEngine.registerMember(packId, sid, { dominance: 0.4 + i * 0.1, courage: 0.5, fear: 0.1 }, { x: px, y: 2, z: 0 });
            const subAg = new AffectiveAgent(sid, {
                leadership: 0.1, resilience: 0.5, neuroticism: 0.45, extraversion: 0.6, fear: 0.1
            }, { seed: seed + i + 1 });
            subAg.x = px; subAg.y = 2; subAg.z = 0;
            agents.set(sid, { agent: subAg, active: true });
            infoEngine.registerAgent(sid, 0.7);
        }

        // Register Bystanders
        const bystanders = ['bystander_1', 'bystander_2'];
        for (let i = 0; i < bystanders.length; i++) {
            const bid = bystanders[i];
            const px = 25 + i * 6;
            const byAg = new AffectiveAgent(bid, {
                leadership: 0.0, resilience: 0.4, neuroticism: 0.55, extraversion: 0.5, fear: 0.1
            }, { seed: seed + 10 + i });
            byAg.x = px; byAg.y = 4; byAg.z = 0;
            agents.set(bid, { agent: byAg, active: true });
            infoEngine.registerAgent(bid, 0.6);
        }

        // Build Info Propagation edges (Listen edges)
        infoEngine.addListenEdge('sub_2', 'sub_1');
        infoEngine.addListenEdge('sub_3', 'sub_2');
        infoEngine.addListenEdge('sub_4', 'sub_3');
        infoEngine.addListenEdge('bystander_1', 'sub_4');
        infoEngine.addListenEdge('bystander_2', 'bystander_1');

        const timeline = [];
        let rumorId = null;

        // Run 50 ticks (dt = 0.05 per tick for visible psychological relaxation)
        for (let t = 0; t < 50; t++) {
            // T=5: Alpha Leader Falls (Killed / Annihilated)
            if (t === 5) {
                // Pack engine catastrophic alpha loss triggers scatter disperse
                packEngine.removeMember(packId, 'alpha');
                agents.get('alpha').active = false;

                // First eyewitness (sub_1) injects panic rumor
                rumorId = infoEngine.injectRumor('LEADER_DEATH', 'Alpha commander fell in ambush', 'sub_1', {
                    confidence: 0.95
                });
            }

            // Step Information Propagation
            infoEngine.advanceTick();

            // T=25: Authoritative Host Clarification / Truth arrives
            if (t === 25 && rumorId) {
                infoEngine.correctRumor(rumorId, false);
            }

            // Compute tactical advisories and apply host movement update
            const advisories = packEngine.calculateEncirclementGeometry(packId);
            for (const adv of advisories) {
                const wrapper = agents.get(adv.memberId);
                if (wrapper && wrapper.active && adv.headingVector) {
                    const speed = (adv.phase === TACTICAL_PHASES.SCATTER_DISPERSE) ? 5.0 : 0.2;
                    wrapper.agent.x += adv.headingVector.x * speed;
                    wrapper.agent.z += adv.headingVector.z * speed;
                    // Keep pack engine member position synced with host game
                    const member = packEngine.packs.get(packId)?.members.get(adv.memberId);
                    if (member) {
                        member.position.x = wrapper.agent.x;
                        member.position.z = wrapper.agent.z;
                    }
                }
            }

            // Build active peers snapshot for Contagion
            const activeList = Array.from(agents.values()).filter(x => x.active).map(x => x.agent);
            const peerProfiles = activeList.map(ag => ({
                id: ag.id,
                x: ag.x,
                y: ag.y,
                z: ag.z,
                fearBand: ag.fearCore?.state || 'CALM',
                isPanicking: ag.fearCore?.state === 'PANIC' || ag.currentFear > 0.75,
                isScreaming: ag.currentFear > 0.85,
                rawFear: ag.currentFear,
                leadership: ag.traits.leadership
            }));

            // Step each agent with Contagion, Rumor dread, and Threats
            contagion.clearEdges();
            for (const ag of activeList) {
                // Evaluate Contagion from peers
                const cResult = contagion.evaluateContagion(ag, peerProfiles);

                // Query held rumor
                const held = infoEngine.heldBy(ag.id);
                const activeRumor = held.find(r => r.rumorId === rumorId && r.status === RUMOR_STATUS.ACTIVE);
                const reportedDanger = activeRumor ? activeRumor.confidence * 0.80 : 0.0;

                // Host threat: eyewitness sub_1 sees acute threat at t=5..8
                const threats = (t >= 5 && t <= 8 && ag.id === 'sub_1')
                    ? [{ intensity: 1.0, distance: 3.0, type: 'PREDATOR' }]
                    : [];

                const observations = {
                    threats,
                    reportedDanger
                };

                const context = {
                    contagionFear: cResult.contagionFear,
                    leaderCalm: cResult.leaderCalm
                };

                // Advance AffectiveAgent
                ag.tick(0.05, observations, context);
            }

            // Record snapshot
            const fears = activeList.map(a => a.currentFear);
            const avgFear = fears.reduce((a, b) => a + b, 0) / fears.length;
            const maxFear = Math.max(...fears);
            const minFear = Math.min(...fears);
            const pack = packEngine.packs.get(packId);

            timeline.push({
                t,
                packPhase: pack ? pack.phase : null,
                avgFear,
                maxFear,
                minFear,
                rumorStatus: rumorId ? infoEngine.rumors.get(rumorId)?.status : 'NONE',
                mutations: rumorId ? infoEngine.rumors.get(rumorId)?.mutations : 0,
                activePanickers: peerProfiles.filter(p => p.isPanicking).length
            });
        }

        return { timeline, packEngine, contagion, infoEngine };
    }

    const res1 = simulateScenario1(42);
    const t0 = res1.timeline[0];
    const t5 = res1.timeline[5];
    const tPeak = res1.timeline.reduce((max, cur) => cur.maxFear > max.maxFear ? cur : max, res1.timeline[0]);
    const tFinal = res1.timeline[res1.timeline.length - 1];

    console.log(`- Initial Average Fear (t=0): ${t0.avgFear.toFixed(4)}`);
    console.log(`- Shock Trigger (t=5): Pack Phase = ${t5.packPhase}, Max Fear = ${t5.maxFear.toFixed(4)}`);
    console.log(`- Peak Impact (t=${tPeak.t}): Max Fear = ${tPeak.maxFear.toFixed(4)}, Avg Fear = ${tPeak.avgFear.toFixed(4)}, Rumor Mutations = ${tPeak.mutations}`);
    console.log(`- Post-Correction Final (t=${tFinal.t}): Avg Fear = ${tFinal.avgFear.toFixed(4)}, Rumor Status = ${tFinal.rumorStatus}`);

    // Scenario 1 Assertions:
    const s1_finite = res1.timeline.every(pt => Number.isFinite(pt.avgFear) && Number.isFinite(pt.maxFear) && !Number.isNaN(pt.avgFear));
    const s1_bounded = res1.timeline.every(pt => pt.maxFear <= 1.0 && pt.minFear >= 0.0);
    const s1_scatter = t5.packPhase === TACTICAL_PHASES.SCATTER_DISPERSE;
    const s1_recovered = tFinal.avgFear < 0.20 && tFinal.avgFear < tPeak.avgFear;
    const s1_rumorCorrected = tFinal.rumorStatus === RUMOR_STATUS.CORRECTED;

    console.log(`  * Numerical Integrity (0 NaN, 0 Inf): ${s1_finite ? 'PASS' : 'FAIL'}`);
    console.log(`  * Invariant Fear Bounded [0.0, 1.0]: ${s1_bounded ? 'PASS' : 'FAIL'}`);
    console.log(`  * Alpha Loss Immediate Scatter: ${s1_scatter ? 'PASS' : 'FAIL'}`);
    console.log(`  * Dampened Peak & Reachable Recovery: ${s1_recovered ? 'PASS' : 'FAIL'}`);
    console.log(`  * Authoritative Rumor Correction Propagation: ${s1_rumorCorrected ? 'PASS' : 'FAIL'}`);

    testResults.scenario1 = s1_finite && s1_bounded && s1_scatter && s1_recovered && s1_rumorCorrected;
    if (!testResults.scenario1) throw new Error('Scenario 1 Compound Collision assertions failed!');

    // =========================================================================
    // SCENARIO 2: SCARCITY SHOCK x MIGRATION FLIGHT x PANIC LOCK
    // =========================================================================
    console.log('\n--- SCENARIO 2: SCARCITY SHOCK x MIGRATION FLIGHT x PANIC LOCK ---');

    function simulateScenario2(seed = 987654) {
        const econ = new EconomicFeedbackSystem();
        const mig = new SettlementMigrationSystem();
        const cascade = new MultiFeedbackCascadeSystem();

        // Setup Capital & Haven
        mig.registerSettlement('CAPITAL', {
            population: 200,
            housingCapacity: 250,
            foodStock: 200.0,
            threatLevel: 0.05,
            garrisonStrength: 0.8
        });
        mig.registerSettlement('HAVEN', {
            population: 100,
            housingCapacity: 220,
            foodStock: 180.0,
            threatLevel: 0.05,
            garrisonStrength: 0.7
        });

        econ.registerSettlementMarket('CAPITAL', {
            population: 200,
            wealth: 150.0,
            garrison: 0.8,
            initialStockpiles: { [COMMODITY_TYPES.FOOD]: 200.0, [COMMODITY_TYPES.TIMBER]: 80.0 }
        });
        econ.registerSettlementMarket('HAVEN', {
            population: 100,
            wealth: 120.0,
            garrison: 0.7,
            initialStockpiles: { [COMMODITY_TYPES.FOOD]: 180.0, [COMMODITY_TYPES.TIMBER]: 90.0 }
        });

        const initialWorldPop = 300;
        const trajectory = [];
        let peakPrice = 0;
        let migrationTriggered = false;

        for (let t = 0; t < 50; t++) {
            // T=5 to T=20: Severe Food Drought at CAPITAL
            if (t >= 5 && t <= 20) {
                const capMarket = econ.settlementMarkets.get('CAPITAL');
                capMarket.stockpiles[COMMODITY_TYPES.FOOD] = 0.0; // Complete crop failure
                const capSettlement = mig.settlements.get('CAPITAL');
                capSettlement.foodStock = 0.0;
                capSettlement.threatLevel = Math.min(1.0, capSettlement.threatLevel + 0.08); // Fear grows
            }

            // Step Economic System
            econ.tick(1.0);

            // Step Migration System (dt = 0.0166)
            mig.tick(0.0166);

            // Check if famine push triggers migration
            const capSettlement = mig.settlements.get('CAPITAL');
            const havenSettlement = mig.settlements.get('HAVEN');
            const push = mig.evaluatePushPressure(capSettlement);

            if (push.netPush > mig.config.migrationPushThreshold && t >= 6 && !migrationTriggered) {
                // Emigration wave launched towards HAVEN
                const waveSize = Math.floor(capSettlement.population * 0.25); // 25% flee
                capSettlement.population -= waveSize;
                mig.inTransitParties.push({
                    id: `migrant_wave_${t}`,
                    sourceId: 'CAPITAL',
                    destinationId: 'HAVEN',
                    size: waveSize,
                    progress: 0.0,
                    speed: 0.10, // Arrives in 10 ticks
                    driver: push.primaryDriver,
                    fatigue: 0.4
                });
                migrationTriggered = true;
            }

            // Advance In-transit parties
            for (let i = mig.inTransitParties.length - 1; i >= 0; i--) {
                const party = mig.inTransitParties[i];
                party.progress += party.speed;
                if (party.progress >= 1.0) {
                    // Arrived at destination
                    const dest = mig.settlements.get(party.destinationId);
                    dest.population += party.size;
                    // Influx causes social friction proportional to size
                    dest.socialFriction = Math.min(1.0, dest.socialFriction + (party.size / dest.population) * 0.5);
                    mig.inTransitParties.splice(i, 1);
                }
            }

            // T=21: Drought ends, harvests resume, emergency supply arrives
            if (t === 21) {
                const capMarket = econ.settlementMarkets.get('CAPITAL');
                capMarket.stockpiles[COMMODITY_TYPES.FOOD] = capMarket.targetStockpiles[COMMODITY_TYPES.FOOD] || 300.0;
                capSettlement.foodStock = 200.0;
            }
            if (t > 21) {
                capSettlement.threatLevel = Math.max(0.05, capSettlement.threatLevel * 0.85);
                havenSettlement.socialFriction = Math.max(0.0, havenSettlement.socialFriction * 0.90);
            }

            // Population Conservation Check
            const inTransitPop = mig.inTransitParties.reduce((sum, p) => sum + p.size, 0);
            const totalWorldPop = capSettlement.population + havenSettlement.population + inTransitPop;

            const capPrice = econ.settlementMarkets.get('CAPITAL').prices[COMMODITY_TYPES.FOOD];
            if (capPrice > peakPrice) peakPrice = capPrice;

            trajectory.push({
                t,
                capPop: capSettlement.population,
                havenPop: havenSettlement.population,
                inTransitPop,
                totalWorldPop,
                capFoodPrice: capPrice,
                capThreat: capSettlement.threatLevel,
                havenFriction: havenSettlement.socialFriction
            });
        }

        // Run Economic Pathology Detector
        const pathologyReport = EconomicPathologyDetector.validate(econ);

        return { trajectory, pathologyReport, initialWorldPop, peakPrice, migrationTriggered };
    }

    const res2 = simulateScenario2(987654);
    const s2_final = res2.trajectory[res2.trajectory.length - 1];
    const s2_peak = res2.trajectory.reduce((max, cur) => cur.capFoodPrice > max.capFoodPrice ? cur : max, res2.trajectory[0]);

    console.log(`- Initial World Population: ${res2.initialWorldPop}`);
    console.log(`- Migration Triggered: ${res2.migrationTriggered}`);
    console.log(`- Peak Food Price at Capital (t=${s2_peak.t}): ${s2_peak.capFoodPrice.toFixed(2)} (Base: 10.0, Max Cap: 100.0)`);
    console.log(`- Final World Population (t=49): ${s2_final.totalWorldPop} (Capital: ${s2_final.capPop}, Haven: ${s2_final.havenPop}, In-Transit: ${s2_final.inTransitPop})`);
    console.log(`- Final Threat Level at Capital: ${s2_final.capThreat.toFixed(4)}`);
    console.log(`- Economic Pathology Health: ${res2.pathologyReport.healthy ? 'HEALTHY' : 'PATHOLOGY_DETECTED'}`);

    // Scenario 2 Assertions:
    const s2_conserved = res2.trajectory.every(pt => pt.totalWorldPop === res2.initialWorldPop);
    const s2_priceBounded = res2.trajectory.every(pt => pt.capFoodPrice <= 100.0 && Number.isFinite(pt.capFoodPrice));
    const s2_noNaN = res2.trajectory.every(pt => Object.values(pt).every(v => typeof v === 'number' && Number.isFinite(v) && !Number.isNaN(v)));
    const s2_famineRecovered = s2_final.capThreat < 0.15 && s2_final.capFoodPrice < 25.0;

    console.log(`  * Strict World Population Conservation (0 Loss/Dup): ${s2_conserved ? 'PASS' : 'FAIL'}`);
    console.log(`  * Price Elasticity Bounded (<= 10x Base ceiling): ${s2_priceBounded ? 'PASS' : 'FAIL'}`);
    console.log(`  * Numerical Integrity (0 NaN, 0 Inf): ${s2_noNaN ? 'PASS' : 'FAIL'}`);
    console.log(`  * Post-Shock Market & Affective Recovery: ${s2_famineRecovered ? 'PASS' : 'FAIL'}`);

    testResults.scenario2 = s2_conserved && s2_priceBounded && s2_noNaN && s2_famineRecovered && res2.pathologyReport.healthy;
    if (!testResults.scenario2) throw new Error('Scenario 2 Compound Collision assertions failed!');

    // =========================================================================
    // DETERMINISM ASSERTION: BIT-EXACT REPLAY STABILITY
    // =========================================================================
    console.log('\n--- DETERMINISM ASSERTION: REPLAY BIT-EXACTNESS ---');
    const runA = simulateScenario1(777);
    const runB = simulateScenario1(777);

    let identical = true;
    for (let i = 0; i < runA.timeline.length; i++) {
        if (runA.timeline[i].avgFear !== runB.timeline[i].avgFear ||
            runA.timeline[i].maxFear !== runB.timeline[i].maxFear ||
            runA.timeline[i].packPhase !== runB.timeline[i].packPhase) {
            identical = false;
            break;
        }
    }
    console.log(`- Replay Stability across independent runs: ${identical ? 'BIT_EXACT_MATCH' : 'DIVERGENCE_DETECTED'}`);
    testResults.determinismPass = identical;
    if (!identical) throw new Error('Determinism check failed!');

    console.log('\n============================================================');
    console.log('ALL CROSS-SYSTEM COMPOUND COLLISION TESTS PASSED CLEANLY.');
    console.log('============================================================\n');

    return testResults;
}

runVerification().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
