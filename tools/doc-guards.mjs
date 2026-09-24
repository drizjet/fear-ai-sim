#!/usr/bin/env node
// The document invariants that outlive the campaign's test suites — each harvested from a suite the
// retirement loop removed. They live here rather than inside `gate-counts.mjs` because that tool owns
// one job (the counts the runner produces) and these are a different job: the documents' claims about
// this repository. `npm run gate:check` reports them alongside the counts, before `npm test`.
//
// The rules, each with the failure that created it:
//   ledgerCitations     a healthy completion-ledger row may only cite files that exist, and a
//                       SOURCE_ABSENT row may only cite absent ones — the absence IS its evidence.
//                       Harvested from the retired `completion-ledger-integrity` suite.
//   suiteReferences     no document may name a `.test.js` suite that is not on disk; a retired suite
//                       may be named only in `docs/SUITE_RETIREMENT_LOG.md`. That log's registry
//                       section lists the names the documents legitimately use that never existed in
//                       this checkout. Harvested from the retired `doc-integrity` suite, because one
//                       retirement left the README table citing a deleted suite for a whole batch.
//   provenanceHashes    every file in `legacy/PROVENANCE.md` must hash to the sha256 pinned beside
//                       it in that table. Harvested from the five re-open suites, which were the only
//                       thing verifying that the extracted legacy sources are what they claim to be:
//                       a drift here means the repository's evidence is no longer evidence.
//   hiddenTruthInert    no production module may name the route field `actualDanger`. The suites
//                       that carried this evidence were twin controls: they varied that field and
//                       asserted both arms agreed, which could never fail, because production never
//                       reads it. The scan is the evidence; the twins were a tripwire.
//   marketConservation  stock-and-flow must reconcile on both ledgers: a cross-market transfer
//                       leaves the world total unchanged, a loot movement is booked exactly once in
//                       the receiving market and once in the sending group's own ledger, and a trip
//                       that delivers, is lost, or is oversold books each of those exactly once.
//   timeOwnership       no production module may reference `Date.now(`, `Math.random(` or
//                       `performance.now(` — the world clock and the injected RNG own both — and a
//                       belief stamped while a world runs must carry that world's clock.
//   eventGraphIntegrity the event graph is the world's spine: ids unique, ticks from the clock, every
//                       action a child of its TURN, and duplicate ids, non-monotonic seqs and unknown
//                       parents rejected rather than absorbed.
//   factionLootConservation  a won engagement moves loot between factions, it does not mint it.
//   sourceAbsentRows    the manifest in `docs/SOURCE_ABSENT_RECONCILIATION.md` and the
//                       `SOURCE_ABSENT` rows of `completion-ledger.md` must name the same rows, no
//                       manifest source may have been extracted into this checkout, and — where
//                       `origin/master` is present to resolve it — each PRESENT row's blob+sha256
//                       must still re-resolve.
//   settlementResourceLedger  a settlement's resource gain is bounded by capacity with the excess
//                       recorded as overflow rather than minted, and consumption is bounded by what
//                       exists with the recovery budget accruing exactly from what was consumed.
//   autonomousDeploy    a faction must raise and deploy its OWN actors from its own production
//                       evaluation, not wait for a caller: a founder then descendants drawn off a
//                       living veteran, each deployed through the production `COMBAT_DEPLOY` tail,
//                       under a population bound, with the cohort surviving save/load and two
//                       identical seeded worlds reaching the same state.
//   nextResponsibility  the campaign state and the work ledger must select the same responsibility.
//   ciWiring            the CI workflow must still run the gate — and prove each rule can fail —
//                       before `npm test`; the package test script must keep the ESM flag the gate
//                       depends on and, now that the corpus is retired, `--passWithNoTests` (a bare
//                       jest exits 1 on an empty suite).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// `origin/master` carries the legacy monorepo the SOURCE_ABSENT manifest points at, and CI checks out
// with `fetch-depth: 0` so it resolves there. A shallow or offline checkout (and the temp tree the
// self-test builds) skips the blob re-resolution rather than failing the gate on a remote it never had.
const upstreamAvailable = () => spawnSync('git', ['rev-parse', '--verify', 'origin/master'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).status === 0;

// RESP-BELIEF-LOCALITY-001: hidden route truth must never reach a decision. Harvested in batch 9 from
// the retired `locality-causal`, `locality-graph-holdout`, `observation-hidden-truth-twin-audit` and
// `infrastructure-trust-calibration-negative` suites (plus batch 7's `...-trust-recovery` case). Naming
// the field at all is the violation, so this scans rather than parses — a comment is a cheap edit.
const PRODUCTION_MODULES = [
    'societycore.js', 'utilitycore.js', 'decisioncore.js', 'interactioncore.js',
    'advisorygate.js', 'socialcore.js', 'macrocore.js', 'randomcore.js',
];

const hiddenTruthInert = () => {
    const missing = PRODUCTION_MODULES.filter(file => !fs.existsSync(path.join(ROOT, file)));
    // A guard that cannot see the modules must fail, not pass.
    if (missing.length) return [`the hidden-truth scan cannot see ${missing.join(', ')} — this guard is blind`];
    return PRODUCTION_MODULES.filter(file => read(file).includes('actualDanger'))
        .map(file => `${file}: names the hidden-truth field \`actualDanger\` — production must never read it`);
};

// RESP-MARKET-CONSERVATION-001: the market ledger's own claim — "every mutation is recorded;
// conservation reconciles exactly via balanceSheet()" — is not visible to any single sheet when the
// break is a cross-market pair, and had no surviving owner at all. Batch 11 found it actually
// violated: a loot settlement booked the arrival twice, so a market with the right stock reconciled
// to `balanced: false`. Two scenarios, because the two retired owners were different mechanisms, and
// each must prove it moved goods or the sum would hold vacuously.
const marketConservation = () => {
    const society = new SocietyCore();
    society.routes.edges.push({ id: 'guard-route', available: true });
    const worldsTotal = () => society.markets.get('guard-a').stock.grain + society.markets.get('guard-b').stock.grain;
    society.addMarket('guard-a', new Market({ stock: { grain: 10 } }));
    society.addMarket('guard-b', new Market({ stock: { grain: 2 } }));
    const before = worldsTotal();
    const { moved } = society.transferQueueAwareEconomicSupply({ fromMarket: 'guard-a', toMarket: 'guard-b', quantity: 4, routeId: 'guard-route' });
    if (moved !== 4) return [`the conservation fixture moved ${moved} instead of 4 — the sums below would hold vacuously`];
    const problems = [];
    const drift = worldsTotal() - before;
    if (Math.abs(drift) > 1e-9) problems.push(`a queue-aware transfer of 4 shifted the world total by ${drift} — goods may leave a market only by arriving at another`);
    const town = new SocietyCore();
    town.addRoamingGroup('guard-group', { loot: 5 });
    town.addMarket('guard-town', new Market({ stock: { loot: 0 } }));
    town.tick({ actions: [{ kind: 'ROAMING_GROUP_LOOT_SETTLEMENT', group: 'guard-group', market: 'guard-town', quantity: 3 }] });
    const market = town.markets.get('guard-town');
    if (market.stock.loot !== 3) return [`the loot-settlement fixture moved ${market.stock.loot} instead of 3 — the reconciliation below would hold vacuously`];
    const sheet = market.balanceSheet().goods.loot;
    if (!market.balanceSheet().balanced) problems.push(`a market that received 3 loot reconciles to expected ${sheet.expected} against actual ${sheet.actual} — an arrival must be booked exactly once`);
    // The group's own ledger loses its last owning suite in batch 12; the same movement checks it here.
    const group = town.lootBalanceSheet(town.roamingGroups.get('guard-group'));
    if (!group.balanced) problems.push(`a group that transferred 3 loot reconciles to expected ${group.expected} against current ${group.current} — an exit must be booked exactly once`);
    // The trip path's last owning suites (`trips-causality`, `trip-ownership-holdout`) retire in the final batch.
    const trade = new SocietyCore();
    const north = trade.addMarket('guard-north', new Market({ stock: { grain: 10 } }));
    const south = trade.addMarket('guard-south', new Market({ stock: { grain: 2 } }));
    if (north.trade('grain', 100) !== null || north.stock.grain !== 10) problems.push('an oversell was accepted instead of refused — a rejected trade must not move stock');
    north.createTrip({ id: 'guard-trip', good: 'grain', quantity: 4, destination: 'guard-south' });
    north.settleTrip('guard-trip', 'DELIVERED', south);
    if (north.stock.grain + south.stock.grain !== 12) problems.push(`a delivered trip left the pair's total at ${north.stock.grain + south.stock.grain} instead of 12 — mass must survive the trip`);
    if (!north.balanceSheet().balanced || !south.balanceSheet().balanced) problems.push('a delivered trip left a market ledger unreconciled — every movement must be booked once');
    north.createTrip({ id: 'guard-loss', good: 'grain', quantity: 3, destination: 'guard-south' });
    north.settleTrip('guard-loss', 'LOST');
    const lost = north.balanceSheet().goods.grain;
    if (lost.destroyed !== 3) problems.push(`a lost trip booked ${lost.destroyed} destroyed instead of 3 — a declared loss must be explicit`);
    if (!north.balanceSheet().balanced) problems.push('a lost trip left its origin unreconciled');
    try { north.settleTrip('guard-loss', 'DELIVERED'); problems.push('a settled trip settled twice'); } catch { /* expected */ }
    return problems;
};

// RESP-TIME-OWNERSHIP-001: harvested from the retired `time-ownership` suite, whose structural half
// was already this exact scan. The wall clock and the global RNG are the two things a deterministic
// world may never reach for, and a belief stamped mid-run proves the clock is the one being read.
const timeOwnership = () => {
    const problems = PRODUCTION_MODULES.filter(file => /Date\.now\s*\(|Math\.random\s*\(|performance\.now\s*\(/.test(read(file)))
        .map(file => `${file}: references a wall-clock or global random source — the world clock and the injected RNG own both`);
    const society = new SocietyCore();
    society.tick();
    const [belief] = society.spreadRumor(society.rumors.publish({ claim: 'guard-claim' }), [{ sourceTrust: 1 }]);
    if (belief.lastUpdated !== society.now() || belief.evidence[0].timestamp !== society.now()) problems.push(`a belief stamped ${belief.lastUpdated}/${belief.evidence[0].timestamp} disagrees with the world clock ${society.now()}`);
    return problems;
};

// RESP-WORLD-TICK-001: harvested from the retired `world-tick` suite. The event graph is the spine
// every other invariant is stated against, so its own shape is checked rather than assumed.
const eventGraphIntegrity = () => {
    const society = new SocietyCore();
    society.addMarket('guard-market', new Market({ stock: { grain: 5 } }));
    society.tick({ actions: [{ kind: 'MARKET_TRADE', market: 'guard-market', good: 'grain', quantity: 1 }] });
    const problems = [];
    const ids = society.events.map(event => event.id);
    if (new Set(ids).size !== ids.length) problems.push('two committed events share an id — ids must stay unique across the run and across save/load');
    const turn = society.events[0];
    if (turn.type !== 'TURN' || turn.tick !== 1) problems.push(`a turn opened with ${turn.type} at tick ${turn.tick} instead of TURN at tick 1`);
    if (!society.events.slice(1).every(event => event.parentId === turn.id)) problems.push('an action event is not parented to the TURN that ran it');
    const stamped = society.commitEvent({ type: 'NOTE' });
    if (stamped.tick !== society.now()) problems.push(`a committed event carries tick ${stamped.tick} while the clock reads ${society.now()} — ticks come from the clock, not from array length`);
    // Each impostor isolates one guard: the duplicate carries a MONOTONIC seq, or the seq check would
    // be the one refusing it and the attempt would pass for the wrong reason.
    for (const [label, attempt] of [
        ['a duplicate event id', () => society.commitEvent({ id: society.events[0].id, seq: society.eventSeq + 1, type: 'GUARD' })],
        ['a non-monotonic seq', () => society.commitEvent({ type: 'GUARD', seq: 999 })],
        ['an unknown parent', () => society.allocateEvent({ type: 'GUARD', parent: 'evt-9999' })],
    ]) {
        try { attempt(); problems.push(`${label} was accepted — the event graph must reject impostors`); } catch { /* expected rejection */ }
    }
    return problems;
};

// RESP-COMBAT-LOOT-CONSERVATION-001: harvested from the retired `simulation-agents-combat-reopen`
// suite, the only place that asserted what a won engagement does to the two factions' ledgers.
const factionLootConservation = () => {
    const society = new SocietyCore({ seed: 21 });
    society.addFaction('guard-winner', { militaryConfidence: .5, supplySecurity: .5, anger: .2, loot: 40 });
    society.addFaction('guard-loser', { militaryConfidence: .5, supplySecurity: .5, anger: .2, loot: 40 });
    society.tick({ actions: [{ kind: 'COMBAT_DEPLOY', unit: 'guard-a1', faction: 'guard-winner' }, { kind: 'COMBAT_DEPLOY', unit: 'guard-b1', faction: 'guard-loser' }] });
    society.tick({ actions: [{ kind: 'COMBAT_ENGAGEMENT', engagementId: 'guard-e1', attacker: 'guard-a1', defender: 'guard-b1', force: 400, defense: 0 }] });
    const total = society.factions.get('guard-winner').loot + society.factions.get('guard-loser').loot;
    return total === 80 ? [] : [`a won engagement left the factions' loot total at ${total} from 80 — spoils transfer between owners, they are not minted`];
};

// RESP-AUTONOMOUS-COMBAT-DEPLOY-001: delivered after the corpus retired, so this rule IS its durable
// home rather than a harvest. A faction must RAISE AND DEPLOY its own actors from its own production
// evaluation and state instead of waiting for a caller: the first levy is the legacy FOUNDER
// (generation 1, no parent), a later one is drawn off a living veteran (generation 0, and the veteran
// records the child), each is deployed through the same `COMBAT_DEPLOY` tail, and a population bound
// caps the cohort so an untouched world cannot grow without limit. The contract's own two pins — save/load
// survival and same-seed determinism — are asserted here too.
const autonomousDeploy = () => {
    const problems = [];
    const world = new SocietyCore({ seed: 7 });
    for (const id of ['guard-north', 'guard-south']) world.addFaction(id, { loot: 40, legitimacy: .1, opportunity: 3, resourceNeed: 3, supplySecurity: .2 });
    for (let i = 0; i < 3; i += 1) world.tick({ actions: [{ kind: 'COMBAT_RECRUIT_TICK' }] });
    const units = world.combat.unitsOf('guard-north');
    if (!units.length) problems.push('a recruit tick raised nobody — a faction must levy its own actors without a caller deploy');
    const founder = world.combat.actor('guard-north-levy-1');
    if (!founder || founder.generation !== 1 || founder.parentId !== null) problems.push('the first levy is not a legacy FOUNDER — generation 1 with no parent');
    const descendant = world.combat.actor('guard-north-levy-2');
    if (!descendant || descendant.generation !== 0 || descendant.parentId !== founder?.id) problems.push('a later levy is not drawn off a living veteran — generation 0 naming it as parent');
    if (!founder?.children.includes('guard-north-levy-2')) problems.push('the veteran does not record the levy as its child — lineage is world state, not a name');
    const tickIds = new Set(world.events.filter(event => event.type === 'COMBAT_RECRUIT_TICK').map(event => event.id));
    const recruitIds = new Set(world.events.filter(event => event.type === 'COMBAT_RECRUIT').map(event => event.id));
    if (!world.events.filter(event => event.type === 'COMBAT_RECRUIT').every(event => tickIds.has(event.parentId))) problems.push('a recruit is not a child of the tick that raised it');
    if (!world.events.filter(event => event.type === 'COMBAT_ACTOR_DEPLOYED').every(event => recruitIds.has(event.parentId))) problems.push('a self-raised actor was not deployed through the recruit tail — the tick must run the production COMBAT_DEPLOY chain');
    if (!world.auditEventGraph().ok) problems.push('the self-raise chain does not audit clean');
    // The bound must hold however many ticks run.
    const bound = new SocietyCore({ seed: 7 });
    for (const id of ['guard-north', 'guard-south']) bound.addFaction(id, { loot: 40, legitimacy: .1, opportunity: 3, resourceNeed: 3, supplySecurity: .2 });
    for (let i = 0; i < 5; i += 1) bound.tick({ actions: [{ kind: 'COMBAT_RECRUIT_TICK', populationCap: 2 }] });
    if (bound.combat.unitsOf('guard-north').length !== 2) problems.push(`five recruit ticks at a cap of 2 left ${bound.combat.unitsOf('guard-north').length} actors — the cohort bound must hold`);
    // The production decision is load-bearing: a faction whose own evaluation says HOLD raises nothing.
    const content = new SocietyCore({ seed: 3 });
    for (const id of ['guard-calm', 'guard-other']) content.addFaction(id, { loot: 40, legitimacy: 1, opportunity: 0, resourceNeed: 0, supplySecurity: 1 });
    content.tick({ actions: [{ kind: 'COMBAT_RECRUIT_TICK' }] });
    if (!content.events.some(event => event.type === 'COMBAT_RECRUIT' && !event.raised && event.reason === 'DECLINED')) problems.push('a faction that evaluated HOLD still raised — the production decision must gate the levy');
    // The raised cohort is world state: it round-trips intact.
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(world.serialize())));
    if (JSON.stringify(restored.serialize().combat) !== JSON.stringify(world.serialize().combat)) problems.push('the self-raised population does not survive save/load');
    // Determinism: the other half of the contract — the same seed must reach the same cohort, so the
    // levy is a function of world state rather than of caller identity or wall-clock time.
    const twin = new SocietyCore({ seed: 7 });
    for (const id of ['guard-north', 'guard-south']) twin.addFaction(id, { loot: 40, legitimacy: .1, opportunity: 3, resourceNeed: 3, supplySecurity: .2 });
    for (let i = 0; i < 3; i += 1) twin.tick({ actions: [{ kind: 'COMBAT_RECRUIT_TICK' }] });
    if (JSON.stringify(twin.serialize()) !== JSON.stringify(world.serialize())) problems.push('two identical seeded worlds diverged across the same recruit ticks — a levy must be a function of world state, not of how the tick was called');
    return problems;
};

// RESP-SOURCE-ABSENT-RECONCILIATION-001: harvested from the retired `source-absent-reconciliation`
// suite. The document agreement and the re-open procedure's own designed tripwire are enforced: the
// manifest's rows and the ledger's `SOURCE_ABSENT` rows must name the same set in both directions,
// and no manifest source may appear in this checkout — extraction is an explicit, owned act that
// updates both in the same change. Only the blob+sha256 re-resolution is left out: it needs a fetched
// `origin/master`, so those rows are re-opened by hand, not on every gate run.
const sourceAbsentRows = () => {
    const manifestSection = read('docs/SOURCE_ABSENT_RECONCILIATION.md').split('## Manifest')[1]?.split('##')[0] ?? '';
    const manifestEntries = manifestSection.split('\n').filter(line => line.startsWith('|'))
        .map(line => line.split('|').map(cell => cell.trim()))
        .filter(cells => cells[1] && cells[1] !== 'file' && !/^[- ]+$/.test(cells[1]));
    const manifestRows = new Set(manifestEntries.flatMap(cells => (cells[5] ?? '').split(',').map(name => name.trim()))
        .filter(name => name && name !== 'rows' && !/^[- ]+$/.test(name)));
    const ledgerRows = new Set(read('completion-ledger.md').split('\n').filter(line => line.startsWith('|'))
        .map(line => line.split('|').map(cell => cell.trim()))
        .filter(cells => cells.includes('SOURCE_ABSENT'))
        .map(cells => cells[cells.indexOf('SOURCE_ABSENT') - 1]));
    if (!manifestRows.size || !ledgerRows.size) return ['the SOURCE_ABSENT row sets parsed empty — this guard is blind']; // a blind guard must fail, not pass
    return [
        ...[...ledgerRows].filter(row => !manifestRows.has(row)).map(row => `docs/SOURCE_ABSENT_RECONCILIATION.md does not cover the SOURCE_ABSENT row "${row}"`),
        ...[...manifestRows].filter(row => !ledgerRows.has(row)).map(row => `docs/SOURCE_ABSENT_RECONCILIATION.md covers "${row}", which is not a SOURCE_ABSENT row in completion-ledger.md`),
        ...manifestEntries.filter(cells => fs.existsSync(path.join(ROOT, cells[1])))
            .map(cells => `${cells[1]}: a manifest source exists in this checkout — extraction must update the manifest and ledger in the same change`),
        ...(upstreamAvailable() ? manifestEntries.filter(cells => cells[4] === 'PRESENT').flatMap(cells => {
            const [, file, blob, sha256] = cells;
            const rev = spawnSync('git', ['rev-parse', `origin/master:fear-ai-sim/${file}`], { cwd: ROOT, encoding: 'utf8' });
            if (rev.status !== 0 || rev.stdout.trim() !== blob) return [`docs/SOURCE_ABSENT_RECONCILIATION.md pins ${file} at blob ${blob}, which origin/master no longer resolves`];
            const digest = crypto.createHash('sha256').update(spawnSync('git', ['cat-file', 'blob', blob], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).stdout).digest('hex');
            return digest === sha256 ? [] : [`${file}: origin/master blob ${blob} hashes to ${digest}, but the manifest pins ${sha256}`];
        }) : []), // skipped, not failed, where origin/master is absent (a shallow or offline checkout)
    ];
};

// RESP-SETTLEMENT-RESOURCE-CAP-001 / RESP-SETTLEMENT-RESOURCE-RECOVERY-CONSUMER-001: harvested from
// the retired `settlement-resource-cap` and `settlement-resource-recovery-consumer` suites, the only
// owners of the settlement resource ledger.
const settlementResourceLedger = () => {
    const problems = [];
    const capped = new SocietyCore();
    capped.addSettlement('guard-cap', { resources: 4, resourceCapacity: 5, recoveryBudget: 0 });
    capped.addMarket('guard-south', new Market({ prices: { grain: 9 } }));
    capped.routes = new RouteNetwork([{ id: 'guard-road', travelTime: 2 }]);
    capped.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'guard-cap', destination: 'guard-south', good: 'grain', routes: capped.routes.edges, routeId: 'guard-road', resourceGain: 4 }] });
    const town = capped.settlements.get('guard-cap');
    if (town.resources !== 5 || town.resourceOverflow !== 3) problems.push(`a gain of 4 into capacity 5 left resources ${town.resources} and overflow ${town.resourceOverflow} instead of 5/3 — a gain may not exceed capacity, and the excess must be recorded, not minted`);
    const blocked = new SocietyCore();
    blocked.addSettlement('guard-blocked', { resources: 4, resourceCapacity: 5, recoveryBudget: 0 });
    blocked.addMarket('guard-south', new Market({ prices: { grain: 9 } }));
    blocked.routes = new RouteNetwork([{ id: 'guard-road', travelTime: 2, available: false }]);
    blocked.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'guard-blocked', destination: 'guard-south', good: 'grain', routes: blocked.routes.edges, routeId: 'guard-road', resourceGain: 100 }] });
    if (blocked.settlements.get('guard-blocked').resources !== 4) problems.push('an inaccessible route still paid the settlement — a refused route must create nothing');
    const fed = new SocietyCore();
    fed.addSettlement('guard-fed', { resources: 10, resourceCapacity: 20, recoveryBudget: 0 });
    fed.tick({ actions: [{ kind: 'SETTLEMENT_RESOURCE_CONSUMPTION', settlement: 'guard-fed', quantity: 4, recoveryRate: .5 }] });
    const eater = fed.settlements.get('guard-fed');
    if (eater.resources !== 6 || eater.recoveryBudget !== 2) problems.push(`consuming 4 at rate .5 left resources ${eater.resources} and budget ${eater.recoveryBudget} instead of 6/2 — the budget must accrue from exactly what was consumed`);
    const starved = new SocietyCore();
    starved.addSettlement('guard-starved', { resources: 2, recoveryBudget: 1 });
    starved.tick({ actions: [{ kind: 'SETTLEMENT_RESOURCE_CONSUMPTION', settlement: 'guard-starved', quantity: 10, recoveryRate: 1 }] });
    const short = starved.settlements.get('guard-starved');
    if (short.resources !== 0 || short.recoveryBudget !== 3) problems.push(`consuming 10 with 2 available left resources ${short.resources} and budget ${short.recoveryBudget} instead of 0/3 — consumption is bounded by what exists`);
    return problems;
};

const ledgerCitations = () => read('completion-ledger.md').split('\n')
    .filter(line => line.startsWith('| ') && !line.startsWith('|---') && !line.startsWith('| Area'))
    .map(line => line.split('|').map(cell => cell.trim()))
    .map(([, area, status, evidence]) => ({ area, status, citations: (evidence ?? '').match(/[\w./-]+\.(?:m?js|md|txt)\b/g) ?? [] }))
    .flatMap(row => row.citations
        .filter(citation => fs.existsSync(path.join(ROOT, citation)) === (row.status === 'SOURCE_ABSENT'))
        .map(citation => `completion-ledger.md: row "${row.area}" ${row.status === 'SOURCE_ABSENT' ? 'is SOURCE_ABSENT but cites the existing file' : 'cites the missing file'} ${citation}`));

const suiteReferences = () => {
    const registry = read('docs/SUITE_RETIREMENT_LOG.md')
        .split('## Registry of names used by the documents that never existed in this checkout')[1]?.split('##')[0] ?? '';
    const registered = new Set([...registry.matchAll(/[\w.-]+\.test\.js/g)].map(match => match[0]));
    const docs = ['README.md', 'completion-ledger.md', 'legacy/PROVENANCE.md', ...fs.readdirSync(path.join(ROOT, 'docs'))
        .filter(name => name.endsWith('.md') && name !== 'SUITE_RETIREMENT_LOG.md')
        .map(name => `docs/${name}`)];
    return docs.flatMap(doc => [...new Set([...read(doc).matchAll(/[\w.-]+\.test\.js/g)].map(match => match[0]))]
        .filter(name => !fs.existsSync(path.join(ROOT, 'tests', name)) && !registered.has(name))
        .map(name => `${doc}: cites ${name}, which is neither on disk nor registered in docs/SUITE_RETIREMENT_LOG.md`));
};

const nextResponsibility = () => {
    const idOf = (text, heading) => text.split(heading)[1]?.match(/RESP-[\w-]+/)?.[0];
    const campaign = idOf(read('docs/CAMPAIGN_STATE.md'), '## Next responsibility');
    const selected = idOf(read('docs/FEAR_AI_GLOBAL_WORK_LEDGER.md'), '## Current selected responsibility');
    return campaign && selected && campaign === selected ? [] : [`the campaign state names ${campaign} as next while the work ledger selects ${selected}`];
};

const ciWiring = () => {
    const problems = [];
    if (!fs.existsSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'))) return ['.github/workflows/ci.yml is gone — CI no longer runs the gate these rules belong to'];
    const ci = read('.github/workflows/ci.yml');
    if (!ci.includes('npm run gate:check')) problems.push('.github/workflows/ci.yml no longer runs `npm run gate:check`');
    if (!ci.includes('npm run gate:prove')) problems.push('.github/workflows/ci.yml no longer proves the rules can fail (`npm run gate:prove`)');
    if (!ci.includes('npm test')) problems.push('.github/workflows/ci.yml no longer runs `npm test`');
    if (!JSON.parse(read('package.json')).scripts.test.includes('--experimental-vm-modules')) problems.push('package.json: the test script lost the ESM flag the CI gate depends on');
    if (!JSON.parse(read('package.json')).scripts.test.includes('--passWithNoTests')) problems.push('package.json: the test script lost `--passWithNoTests` — with the corpus retired, an unadorned jest exits 1 and CI goes red on a green tree');
    return problems;
};

const provenanceHashes = () => {
    const rows = [...read('legacy/PROVENANCE.md').matchAll(/\|\s*`(legacy\/[\w.-]+\.js)`\s*\|[^|]*\|\s*`([0-9a-f]{40})`\s*\|\s*`([0-9a-f]{64})`\s*\|/g)];
    if (!rows.length) return ['legacy/PROVENANCE.md: parsed no provenance rows — the table shape changed, so this guard is blind']; // a blind guard must fail, not pass
    return rows.flatMap(([, file, blob, sha256]) => {
        const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
        return actual === sha256 ? [] : [`${file}: hashes to ${actual}, but legacy/PROVENANCE.md pins ${sha256} (blob ${blob})`];
    });
};

export const docProblems = () => [...ledgerCitations(), ...suiteReferences(), ...provenanceHashes(), ...hiddenTruthInert(), ...marketConservation(), ...timeOwnership(), ...eventGraphIntegrity(), ...factionLootConservation(), ...settlementResourceLedger(), ...autonomousDeploy(), ...sourceAbsentRows(), ...nextResponsibility(), ...ciWiring()];
