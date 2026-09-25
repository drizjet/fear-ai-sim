#!/usr/bin/env node

/**
 * Runtime wiring inventory for the release-claim audit.
 *
 * This is a standalone source/runtime probe, not a test-runner suite. It
 * records the boundary between the live RuntimeSimulation middleware path,
 * the FearServer owner of that path, the explicitly attached dashboard
 * session, and optional modules exposed through direct CLI/scenario entry
 * points.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { DesignerDashboardServer } from '../../packages/runtime/src/DesignerDashboardServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function hasConstructor(source, name) {
    return new RegExp(`\\bnew\\s+${name}\\b`).test(source);
}

console.log('============================================================');
console.log('VERIFY FEAR AI RUNTIME WIRING BOUNDARIES');
console.log('============================================================');

const runtimeSource = read('packages/runtime/src/RuntimeSimulation.js');
const serverSource = read('packages/runtime/src/FearServer.js');
const dashboardSource = read('packages/runtime/src/DesignerDashboardServer.js');
const cliSource = read('bin/fear-ai.js');

// Exercise the actual live RuntimeSimulation path once, then inspect the
// services that its constructor owns. This distinguishes runtime wiring from
// source files that are merely available to callers elsewhere.
const sim = new RuntimeSimulation({ seed: 91337 });
sim.registerAgent('wiring-probe', {
    neuroticism: 0.65,
    resilience: 0.45,
    leadership: 0.55
});
sim.queueObservation('wiring-probe', {
    threats: [{ id: 'probe-threat', type: 'PREDATOR', distance: 4, intensity: 0.8 }]
});
const outputs = sim.tick(0.0166);
const output = outputs[0];

const coreServices = [
    ['agents', sim.agents instanceof Map],
    ['pendingObservations', sim.pendingObservations instanceof Map],
    ['trauma', Boolean(sim.trauma && typeof sim.trauma.tick === 'function')],
    ['coreTrauma', Boolean(sim.coreTrauma && typeof sim.coreTrauma.tick === 'function')],
    ['contagion', Boolean(sim.contagion && typeof sim.contagion.evaluateContagion === 'function')],
    ['pacing', Boolean(sim.pacing && typeof sim.pacing.tick === 'function')],
    ['social', Boolean(sim.social && typeof sim.social.tick === 'function')],
    ['socialEvents', Boolean(sim.socialEvents && typeof sim.socialEvents.applyEvent === 'function')],
    ['timeDiscipline', Boolean(sim.timeDiscipline && typeof sim.timeDiscipline.dueSubsystems === 'function')],
    ['lastContagion', sim.lastContagion instanceof Map]
];
for (const [name, present] of coreServices) {
    assert(present, `RuntimeSimulation core service missing: ${name}`);
}
assert(sim.tickCount === 1, 'RuntimeSimulation live tick did not advance exactly once.');
assert(output?.agent_id === 'wiring-probe', 'RuntimeSimulation did not return the registered agent output.');
assert(typeof output?.fear_band === 'string', 'RuntimeSimulation output has no fear band.');
assert(typeof output?.action_intent?.type === 'string', 'RuntimeSimulation output has no semantic action intent.');
console.log('  * Core RuntimeSimulation services and live tick path: PASS');

// These are intentionally optional for the middleware runtime. The negative
// source checks are deliberate tripwires: if a future change constructs one
// here, the ledger and release scope must be revisited rather than silently
// inheriting a broader "core" claim.
// InformationPropagationEngine, PackCoordinationEngine, EconomicFeedbackSystem,
// SettlementMigrationSystem, and EpistemicBeliefEngine are deliberately ABSENT from this list.
// They left the optional surface by the §3 change policy and joined
// the runtime as opt-in services, which is why the tripwires that guard them now
// point the other way: see the opt-in assertions below.
const optionalRuntimeConstructors = [
    'MoralDissonanceEngine',
    'FunctionalPersonaSignatures',
    'WorldCounterfactualEngine',
    'FrontierValleySimulation'
];
for (const name of optionalRuntimeConstructors) {
    assert(!hasConstructor(runtimeSource, name), `Optional module is constructed by RuntimeSimulation: ${name}`);
}
console.log(`  * Optional world/research modules absent from RuntimeSimulation constructor (${optionalRuntimeConstructors.length}): PASS`);

// RELEASE-SURFACE §3 condition 4. The information-propagation module is now
// IN scope, so what must be proven inverts: constructing it is expected, and
// constructing it UNGATED is the defect. An unconditional `new` here would make a
// research system part of every session that never asked for it, while every
// existing test still passed.
assert(hasConstructor(runtimeSource, 'InformationPropagationEngine'),
    'InformationPropagationEngine is declared in scope but is constructed nowhere in RuntimeSimulation');
assert(/enableInformationPropagation\s*=\s*options\.enableInformationPropagation\s*\?\?\s*false/.test(runtimeSource),
    'InformationPropagationEngine no longer defaults to false, so it is not opt-in');
assert(/this\.informationPropagation\s*=\s*this\.enableInformationPropagation\s*\?\s*new InformationPropagationEngine/.test(runtimeSource),
    'InformationPropagationEngine is constructed outside its opt-in guard');
const optOut = new RuntimeSimulation({ seed: 91339 });
assert(optOut.informationPropagation === null,
    'A default RuntimeSimulation constructed the optional information-propagation service');
assert(optOut.enableInformationPropagation === false,
    'The information-propagation opt-in does not default to false');
const optIn = new RuntimeSimulation({ seed: 91339, enableInformationPropagation: true });
assert(optIn.informationPropagation !== null && optOut.informationPropagation !== optIn.informationPropagation,
    'The opt-in flag did not construct a distinct information-propagation service');
console.log('  * InformationPropagationEngine is opt-in only: absent by default, present (and distinct) when asked for: PASS');

// RELEASE-SURFACE §3 condition 4 for PackCoordinationEngine: promoted from §2.
assert(hasConstructor(runtimeSource, 'PackCoordinationEngine'),
    'PackCoordinationEngine is declared in scope but is constructed nowhere in RuntimeSimulation');
assert(/enablePackCoordination\s*=\s*options\.enablePackCoordination\s*\?\?\s*false/.test(runtimeSource),
    'PackCoordinationEngine no longer defaults to false, so it is not opt-in');
assert(/this\.packCoordination\s*=\s*this\.enablePackCoordination\s*\?\s*new PackCoordinationEngine/.test(runtimeSource),
    'PackCoordinationEngine is constructed outside its opt-in guard');
const packOptOut = new RuntimeSimulation({ seed: 91339 });
assert(packOptOut.packCoordination === null,
    'A default RuntimeSimulation constructed the optional pack-coordination service');
assert(packOptOut.enablePackCoordination === false,
    'The pack-coordination opt-in does not default to false');
const packOptIn = new RuntimeSimulation({ seed: 91339, enablePackCoordination: true });
assert(packOptIn.packCoordination !== null && packOptOut.packCoordination !== packOptIn.packCoordination,
    'The opt-in flag did not construct a distinct pack-coordination service');
console.log('  * PackCoordinationEngine is opt-in only: absent by default, present (and distinct) when asked for: PASS');

// RELEASE-SURFACE §3 condition 4 for EconomicFeedbackSystem: promoted from §2.
assert(hasConstructor(runtimeSource, 'EconomicFeedbackSystem'),
    'EconomicFeedbackSystem is declared in scope but is constructed nowhere in RuntimeSimulation');
assert(/enableEconomicFeedback\s*=\s*options\.enableEconomicFeedback\s*\?\?\s*false/.test(runtimeSource),
    'EconomicFeedbackSystem no longer defaults to false, so it is not opt-in');
assert(/this\.economicFeedback\s*=\s*this\.enableEconomicFeedback\s*\?\s*new EconomicFeedbackSystem/.test(runtimeSource),
    'EconomicFeedbackSystem is constructed outside its opt-in guard');
const econOptOut = new RuntimeSimulation({ seed: 91339 });
assert(econOptOut.economicFeedback === null,
    'A default RuntimeSimulation constructed the optional economic-feedback service');
assert(econOptOut.enableEconomicFeedback === false,
    'The economic-feedback opt-in does not default to false');
const econOptIn = new RuntimeSimulation({ seed: 91339, enableEconomicFeedback: true });
assert(econOptIn.economicFeedback !== null && econOptOut.economicFeedback !== econOptIn.economicFeedback,
    'The opt-in flag did not construct a distinct economic-feedback service');
console.log('  * EconomicFeedbackSystem is opt-in only: absent by default, present (and distinct) when asked for: PASS');

// RELEASE-SURFACE §3 condition 4 for SettlementMigrationSystem: promoted from §2.
assert(hasConstructor(runtimeSource, 'SettlementMigrationSystem'),
    'SettlementMigrationSystem is declared in scope but is constructed nowhere in RuntimeSimulation');
assert(/enableSettlementMigration\s*=\s*options\.enableSettlementMigration\s*\?\?\s*false/.test(runtimeSource),
    'SettlementMigrationSystem no longer defaults to false, so it is not opt-in');
assert(/this\.settlementMigration\s*=\s*this\.enableSettlementMigration\s*\?\s*new SettlementMigrationSystem/.test(runtimeSource),
    'SettlementMigrationSystem is constructed outside its opt-in guard');
const migOptOut = new RuntimeSimulation({ seed: 91339 });
assert(migOptOut.settlementMigration === null,
    'A default RuntimeSimulation constructed the optional settlement-migration service');
assert(migOptOut.enableSettlementMigration === false,
    'The settlement-migration opt-in does not default to false');
const migOptIn = new RuntimeSimulation({ seed: 91339, enableSettlementMigration: true });
assert(migOptIn.settlementMigration !== null && migOptOut.settlementMigration !== migOptIn.settlementMigration,
    'The opt-in flag did not construct a distinct settlement-migration service');
console.log('  * SettlementMigrationSystem is opt-in only: absent by default, present (and distinct) when asked for: PASS');

// RELEASE-SURFACE §3 condition 4 for EpistemicBeliefEngine: promoted from §2.
assert(hasConstructor(runtimeSource, 'EpistemicBeliefEngine'),
    'EpistemicBeliefEngine is declared in scope but is constructed nowhere in RuntimeSimulation');
assert(/enableEpistemicBelief\s*=\s*options\.enableEpistemicBelief\s*\?\?\s*false/.test(runtimeSource),
    'EpistemicBeliefEngine no longer defaults to false, so it is not opt-in');
assert(/this\.epistemicBelief\s*=\s*this\.enableEpistemicBelief\s*\?\s*new EpistemicBeliefEngine/.test(runtimeSource),
    'EpistemicBeliefEngine is constructed outside its opt-in guard');
const epistemicOptOut = new RuntimeSimulation({ seed: 91339 });
assert(epistemicOptOut.epistemicBelief === null,
    'A default RuntimeSimulation constructed the optional epistemic-belief service');
assert(epistemicOptOut.enableEpistemicBelief === false,
    'The epistemic-belief opt-in does not default to false');
assert(epistemicOptOut.agentEpistemicEngines === null,
    'The agent epistemic engines map is not null when disabled');
const epistemicOptIn = new RuntimeSimulation({ seed: 91339, enableEpistemicBelief: true });
assert(epistemicOptIn.epistemicBelief !== null && epistemicOptOut.epistemicBelief !== epistemicOptIn.epistemicBelief,
    'The opt-in flag did not construct a distinct epistemic-belief service');
assert(epistemicOptIn.agentEpistemicEngines instanceof Map,
    'The agent epistemic engines map was not constructed when opt-in enabled');
console.log('  * EpistemicBeliefEngine is opt-in only: absent by default, present (and distinct) when asked for: PASS');

// Verify that the optional systems have explicit direct entry points rather
// than being mistaken for implicit runtime services.
const cliEntryPoints = [
    ['PackCoordinationEngine', /new PackCoordinationEngine\b/],
    ['EconomicFeedbackSystem', /new EconomicFeedbackSystem\b/],
    ['SettlementMigrationSystem', /new SettlementMigrationSystem\b/],
    ['EpistemicBeliefEngine via MultiObserverEpistemicHarness', /new MultiObserverEpistemicHarness\b/],
    ['MoralDissonanceEngine', /new MoralDissonanceEngine\b/],
    ['FunctionalPersonaSignatures', /new FunctionalPersonaSignatures\b/],
    ['FrontierValleySimulation', /new FrontierValleySimulation\b/],
    ['WorldCounterfactualEngine', /WorldCounterfactualEngine\.runExperiment\b/]
];
for (const [name, pattern] of cliEntryPoints) {
    assert(pattern.test(cliSource), `CLI entry point is not present for optional module: ${name}`);
}
console.log(`  * Optional modules have explicit CLI/scenario entry points (${cliEntryPoints.length}): PASS`);

// Verify ownership and attachment boundaries at the two server surfaces.
const fearServer = new FearServer({ port: 0, seed: 91338 });
assert(fearServer.simulation instanceof RuntimeSimulation, 'FearServer does not own a RuntimeSimulation instance.');
assert(/this\.simulation\s*=\s*new RuntimeSimulation\b/.test(serverSource), 'FearServer constructor source no longer declares runtime ownership.');

const dashboard = new DesignerDashboardServer({ port: 0 });
assert(dashboard.sim === null, 'Dashboard unexpectedly auto-attached a simulation.');
assert(/attachSimulation\(sim\)/.test(dashboardSource), 'Dashboard has no explicit attachSimulation boundary.');
dashboard.attachSimulation(sim);
assert(dashboard.sim === sim, 'Dashboard explicit simulation attachment failed.');
console.log('  * FearServer ownership and explicit dashboard attachment boundary: PASS');

console.log('\nScope: this inventory proves current JavaScript wiring boundaries only.');
console.log('It does not certify optional module semantics, external engine adoption, or host integration.');
console.log('\nSUCCESS: Runtime wiring boundary verification passed.');
