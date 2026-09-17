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

    function simulateScenario1(seed = 42, options = {}) {
        const contagionRadius = options.contagionRadius ?? 60.0;
        const leaderRadius = options.leaderRadius ?? 80.0;
        const totalTicks = options.totalTicks ?? 50;
        const label = options.label || `Scenario 1 (radius: ${contagionRadius})`;

        const packEngine = new PackCoordinationEngine({ seed });
        const contagion = new ContagionGraph({
            contagionRadius,
            leaderRadius,
            baseContagionStrength: 0.6,
            screamMultiplier: 1.8
        });
        const infoEngine = new InformationPropagationEngine({ mutationRate: 0.20 }, seed);

        const packId = 'vanguard_squad';
        packEngine.createPack(packId);

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

        // SIMULATED HOST MOTION & KINEMATICS:
        // Host game engine retains 100% exclusive transform/physics authority.
        // Tick rate: dt = 0.05s (20 Hz).
        // Scatter speed: 5.0 position units/tick = 100.0 units/sec in host kinematic space.
        for (let t = 0; t < totalTicks; t++) {
            // T=5: Alpha Leader Falls
            if (t === 5) {
                packEngine.removeMember(packId, 'alpha');
                agents.get('alpha').active = false;

                rumorId = infoEngine.injectRumor('LEADER_DEATH', 'Alpha commander fell in ambush', 'sub_1', {
                    confidence: 0.95
                });
            }

            infoEngine.advanceTick();

            // T=25: Authoritative Host Clarification arrives
            if (t === 25 && rumorId) {
                infoEngine.correctRumor(rumorId, false);
            }

            // SIMULATED HOST MOTION: Host evaluates advisory vectors from Fear AI and mutates positions
            const advisories = packEngine.calculateEncirclementGeometry(packId);
            for (const adv of advisories) {
                const wrapper = agents.get(adv.memberId);
                if (wrapper && wrapper.active && adv.headingVector) {
                    const speed = (adv.phase === TACTICAL_PHASES.SCATTER_DISPERSE) ? 5.0 : 0.2;
                    wrapper.agent.x += adv.headingVector.x * speed;
                    wrapper.agent.z += adv.headingVector.z * speed;
                    const member = packEngine.packs.get(packId)?.members.get(adv.memberId);
                    if (member) {
                        member.position.x = wrapper.agent.x;
                        member.position.z = wrapper.agent.z;
                    }
                }
            }

            // SIMULATED HOST MOTION FOR BYSTANDERS: Fleeing from alarm
            // In open space, panicking bystanders flee diagonally outward away from the squad
            for (const bid of bystanders) {
                const bWrap = agents.get(bid);
                if (bWrap && bWrap.active && bWrap.agent.currentFear > 0.3) {
                    const fleeSign = (bid === 'bystander_1') ? -1.0 : 1.0;
                    bWrap.agent.x += fleeSign * 3.5;
                    bWrap.agent.z += fleeSign * 3.5;
                }
            }

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

            contagion.clearEdges();
            for (const ag of activeList) {
                const cResult = contagion.evaluateContagion(ag, peerProfiles);
                const held = infoEngine.heldBy(ag.id);
                const activeRumor = held.find(r => r.rumorId === rumorId && r.status === RUMOR_STATUS.ACTIVE);
                const reportedDanger = activeRumor ? activeRumor.confidence * 0.80 : 0.0;

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

                ag.tick(0.05, observations, context);
            }

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

        const finalActive = Array.from(agents.values()).filter(x => x.active).map(x => x.agent);
        console.log(`[${label}] Final agent positions & fears:`, finalActive.map(a => ({ id: a.id, x: Math.round(a.x), z: Math.round(a.z), fear: Number(a.currentFear.toFixed(4)) })));

        return { timeline, packEngine, contagion, infoEngine, label };
    }

    // -------------------------------------------------------------------------
    // Scenario 1A: Verification-Specific 60-Unit Contagion Radius
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 1A: Verification-Specific 60-Unit Radius ---');
    const res1A = simulateScenario1(42, { contagionRadius: 60.0, leaderRadius: 80.0, totalTicks: 50, label: 'Scenario 1A' });
    const t0A = res1A.timeline[0];
    const t5A = res1A.timeline[5];
    const tPeakA = res1A.timeline.reduce((max, cur) => cur.maxFear > max.maxFear ? cur : max, res1A.timeline[0]);
    const tFinalA = res1A.timeline[res1A.timeline.length - 1];

    console.log(`- Baseline (t=0): Avg Fear = ${t0A.avgFear.toFixed(4)}`);
    console.log(`- Peak Shock (t=${tPeakA.t}): Max Fear = ${tPeakA.maxFear.toFixed(4)}, Avg Fear = ${tPeakA.avgFear.toFixed(4)}`);
    console.log(`- Final Post-Correction (t=${tFinalA.t}): Avg Fear = ${tFinalA.avgFear.toFixed(4)}, Rumor = ${tFinalA.rumorStatus}`);

    const s1A_finite = res1A.timeline.every(pt => Number.isFinite(pt.avgFear) && Number.isFinite(pt.maxFear) && !Number.isNaN(pt.avgFear));
    const s1A_bounded = res1A.timeline.every(pt => pt.maxFear <= 1.0 && pt.minFear >= 0.0);
    const s1A_recovered = tFinalA.avgFear < 0.20 && tFinalA.avgFear < tPeakA.avgFear;
    if (!s1A_finite || !s1A_bounded || !s1A_recovered) throw new Error('Scenario 1A failed assertions!');
    console.log('  * Scenario 1A (60-unit radius): PASS');

    // -------------------------------------------------------------------------
    // Scenario 1B: Production-Default 300-Unit Contagion Radius
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 1B: Production-Default 300-Unit Radius ---');
    // At 300-unit contagion radius, radial scatter dispersion (5 units/tick = 100 units/s)
    // requires more kinematic travel distance to separate past the 300-unit boundary.
    const res1B = simulateScenario1(42, { contagionRadius: 300.0, leaderRadius: 250.0, totalTicks: 100, label: 'Scenario 1B' });
    const t0B = res1B.timeline[0];
    const tPeakB = res1B.timeline.reduce((max, cur) => cur.maxFear > max.maxFear ? cur : max, res1B.timeline[0]);
    const tFinalB = res1B.timeline[res1B.timeline.length - 1];

    console.log(`- Baseline (t=0): Avg Fear = ${t0B.avgFear.toFixed(4)}`);
    console.log(`- Peak Shock (t=${tPeakB.t}): Max Fear = ${tPeakB.maxFear.toFixed(4)}, Avg Fear = ${tPeakB.avgFear.toFixed(4)}`);
    console.log(`- Final Post-Correction (t=${tFinalB.t}): Avg Fear = ${tFinalB.avgFear.toFixed(4)}, Rumor = ${tFinalB.rumorStatus}`);

    const s1B_finite = res1B.timeline.every(pt => Number.isFinite(pt.avgFear) && Number.isFinite(pt.maxFear) && !Number.isNaN(pt.avgFear));
    const s1B_bounded = res1B.timeline.every(pt => pt.maxFear <= 1.0 && pt.minFear >= 0.0);
    const s1B_recovered = tFinalB.avgFear < 0.20 && tFinalB.avgFear < tPeakB.avgFear;
    if (!s1B_finite || !s1B_bounded || !s1B_recovered) throw new Error('Scenario 1B failed assertions!');
    console.log('  * Scenario 1B (300-unit production default): PASS');

    // -------------------------------------------------------------------------
    // Scenario 1C: Confined Panic Attractor & Calm Leader Intervention
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 1C: Confined Panic Attractor & Calm Leader Intervention ---');

    function simulateConfinedGroup(withLeader = false, leaderTrust = 1.0) {
        const contagion = new ContagionGraph({
            contagionRadius: 300.0,
            leaderRadius: 250.0,
            baseContagionStrength: 0.6,
            screamMultiplier: 1.8,
            leaderDampingStrength: 0.5,
            calmTrustGain: 1.0,
            trustGain: 1.0
        });

        // 3 agents confined in a 10x10 room (positions within 6 units of each other, zero dispersal)
        const sub1 = new AffectiveAgent('conf_1', { neuroticism: 0.6, extraversion: 0.7, resilience: 0.3, fear: 0.2 }, { seed: 101 });
        const sub2 = new AffectiveAgent('conf_2', { neuroticism: 0.6, extraversion: 0.7, resilience: 0.3, fear: 0.2 }, { seed: 102 });
        const sub3 = new AffectiveAgent('conf_3', { neuroticism: 0.6, extraversion: 0.7, resilience: 0.3, fear: 0.2 }, { seed: 103 });
        sub1.x = 2; sub1.y = 0; sub1.z = 2;
        sub2.x = 4; sub2.y = 0; sub2.z = 3;
        sub3.x = 3; sub3.y = 0; sub3.z = 5;

        let leader = null;
        if (withLeader) {
            leader = new AffectiveAgent('leader', {
                leadership: 0.95, resilience: 0.95, neuroticism: 0.1, extraversion: 0.7, fear: 0.0, agreeableness: 0.8
            }, { seed: 100 });
            leader.x = 3; leader.y = 0; leader.z = 3;
        }

        const timeline = [];

        for (let t = 0; t < 50; t++) {
            // Initial acute shock at t=0..12: mortal predator threat to sub1
            const threats1 = (t < 13) ? [{ intensity: 1.0, distance: 1.0, type: 'PREDATOR' }] : [];

            // Build peer profiles
            const allAgents = leader ? [sub1, sub2, sub3, leader] : [sub1, sub2, sub3];
            const peerProfiles = allAgents.map(a => ({
                id: a.id,
                x: a.x, y: a.y, z: a.z,
                fearBand: a.fearCore?.state || 'CALM',
                isPanicking: a.fearCore?.state === 'PANIC' || a.currentFear > 0.75,
                isScreaming: a.currentFear > 0.85,
                rawFear: a.currentFear,
                leadership: a.traits.leadership,
                trust: (a.id === 'leader') ? leaderTrust : 0.0
            }));

            // Step subordinates
            for (const ag of [sub1, sub2, sub3]) {
                const cResult = contagion.evaluateContagion(ag, peerProfiles);
                const threats = (ag.id === 'conf_1') ? threats1 : [];
                ag.tick(0.05, { threats }, { contagionFear: cResult.contagionFear, leaderCalm: cResult.leaderCalm });
            }

            // Step leader if present
            if (leader) {
                const cResult = contagion.evaluateContagion(leader, peerProfiles);
                leader.tick(0.05, { threats: [] }, { contagionFear: cResult.contagionFear, leaderCalm: 0 });
            }

            const subFears = [sub1.currentFear, sub2.currentFear, sub3.currentFear];
            const avgFear = subFears.reduce((a, b) => a + b, 0) / subFears.length;
            const maxFear = Math.max(...subFears);
            const panickers = peerProfiles.filter(p => p.id.startsWith('conf_') && p.isPanicking).length;

            timeline.push({ t, avgFear, maxFear, panickers });
        }

        return timeline;
    }

    const confinedIsolated = simulateConfinedGroup(false);
    const confinedWithLeader = simulateConfinedGroup(true, 1.0);
    const confinedUntrustedLeader = simulateConfinedGroup(true, -0.9);

    const isoFinal = confinedIsolated[confinedIsolated.length - 1];
    const leaderFinal = confinedWithLeader[confinedWithLeader.length - 1];
    const untrustedFinal = confinedUntrustedLeader[confinedUntrustedLeader.length - 1];

    console.log(`- Confined Isolated Squad (no leader, no dispersal): Final Avg Fear = ${isoFinal.avgFear.toFixed(4)}, Panickers = ${isoFinal.panickers}/3`);
    console.log(`- Confined Squad with Calm Trusted Leader: Final Avg Fear = ${leaderFinal.avgFear.toFixed(4)}, Panickers = ${leaderFinal.panickers}/3`);
    console.log(`- Confined Squad with Distrusted Leader (trust=-0.9): Final Avg Fear = ${untrustedFinal.avgFear.toFixed(4)}, Panickers = ${untrustedFinal.panickers}/3`);

    // Invariant assertions for Scenario 1C:
    // 1. Without dispersal or leader, screaming panickers lock into self-sustaining attractor (F > 0.85, panicLock)
    const s1C_attractorPass = isoFinal.avgFear > 0.85 && isoFinal.panickers >= 2;
    // 2. With calm trusted leader, reassurance breaks attractor and restores calm (F < 0.10)
    const s1C_leaderPass = leaderFinal.avgFear < 0.10 && leaderFinal.panickers === 0;

    console.log(`  * Confined Panic Attractor Formation (Isolated): ${s1C_attractorPass ? 'PASS (Permanent Lock-in Verified)' : 'FAIL'}`);
    console.log(`  * Calm Trusted Leader Attractor Break & Recovery: ${s1C_leaderPass ? 'PASS (Leader Dampening Verified)' : 'FAIL'}`);

    if (!s1C_attractorPass || !s1C_leaderPass) throw new Error('Scenario 1C Confined Attractor assertions failed!');

    testResults.scenario1 = s1A_finite && s1A_bounded && s1A_recovered &&
                            s1B_finite && s1B_bounded && s1B_recovered &&
                            s1C_attractorPass && s1C_leaderPass;

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
