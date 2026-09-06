# AUTONOMOUS HANDOFF

EVID-2026-09-05-E23-HIERARCHY (Lane B, unaccepted)

## E23 — layered allegiances and contested hierarchies: the stack holds (expansion)

- Gap (probed, not guessed): one order per town forced every secession conflict back to binary once the first deal existed — second shields had nowhere to stand and rival claimants forked nothing.
- Fix: ordered service stacks of at most two ACTIVE shields. Tribute follows rank 1 only (missing rank means 1, older saves read primary); defense sums ordered shields under an audited cap booked on the gate (autonomy half weight, vassalage full, junior discounted); rival claimants queue audited HIERARCHY_QUEUED events; lapse promotes the junior to primary with no gap; only rank 1 restrains takeovers.
- Fallout restaged honestly: E19/E22 replay entries migrated to the E23 text they target (allied weight, lapsed-deal exemption); one edit round ate the tax credit line and two helper definitions plus a barren continue (all caught by E13/E8/E22 pins, restored byte-exact against HEAD).
- Validation: 212/1521 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 84/84 (2 new E23 entries), coverage 120 rows.

## E22 — tribute lapse and renegotiation: dead ground pays nothing (expansion)

- Gap (probed, not guessed): tributary towns that emptied kept phantom deals forever — blocking verdicts and takeovers over nothing, with no lapse and no second chance.
- Fix: lapse streaks on the treaty record. Covered towns yielding zero levy count barren ticks in the tax loop; five running ends the deal (control stays, no verdicts ride along) while paying towns reset the clock. Lapsed deals — and only lapsed deals — stay renegotiable: repopulated towns seal anew and pay again; betrayed deals stay dead. Streaks persist across save/load.
- Fallout restaged honestly: none beyond new files — all 211 prior suites pass unmodified (no deals exist where tribute never flowed).
- Validation: 211/1515 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 82/82 (2 new E22 entries), coverage 119 rows.

## E21 — federation between polities and vassalage with teeth (expansion)

- Gap (probed, not guessed): kin polities stood alone (no mutual bond existed) and strong strangers had no shield to sell — suzerainty covered former-to-breakaway forbearance only.
- Fix: 7h2 vassalage (any strong stranger binds a weak polity: same tribute split, plus overlord weight on the walls; strong refuse once) and 7h3 federation (landheld kin at standing peace seal mutual restraint and mutual walls, no tribute). The shared deterrence book sums every standing shield for both contests; betrayal ends either bond; verdicts skip ordered towns.
- Wild proof: gate audits book allied weight a full point above bare defense; an overmatching storm holds only through the bond.
- Fallout restaged honestly: E20 refusal now weighs the own sword (borrowed weight defends but does not decide tribute) — behavior-neutral where no shields exist; all 210 prior suites pass unmodified.
- Validation: 210/1509 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 80/80 (2 new E21 entries), coverage 118 rows.

## E20 — autonomy, tribute, and negotiated orders: the middle holds (expansion)

- Gap (probed, not guessed): every secession conflict resolved binary — independence, return, or conquest — with no negotiated intermediate order anywhere in the ledger.
- Fix: step-7h suzerainty pass. Strong formers offer governed breakaways self-rule under 25% split tribute from age 60 (standing capacity, cold claims only — hot claims belong to verdicts, settled claims never renegotiate); weaker polities take it, stronger refuse once, poor overlords and failed states hear silence. The tax loop splits the levy at the source (one payment, two books); the town-scoped deal binds the overlord ahead of the blanket pact; verdicts skip honored deals; betrayal ends them; acceptance and reintegration close them.
- Doctrines hardened by probes: no town relief bump (rewards collapse); negotiation weighs capacity while battles weigh the till; stance — not bandit-poisoned trust — divides deals from verdicts.
- Fallout restaged honestly: one misplaced edit briefly ate the tax credit line (caught by E13/E8 pins, restored byte-exact); all 209 suites pass unmodified otherwise.
- Validation: 209/1500 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 78/78 (2 new E20 entries), coverage 117 rows.

## E19 — external patrons and guarantees: deterrence has books (expansion)

- Gap (probed, not guessed): guaranteed protection did not exist — polities faced reconquest alone, and no incumbent ever weighed another polity's survival as its own interest.
- Fix: step-7g patronage pass. Governed landheld polities ask their most-trusted unasked non-former incumbent from age 30 (evaluation always open; first contact audited once); a patron at power 3+ backing a polity at legitimacy 0.4+ seals a one-unit booked endowment (reserve never breached, absorption capped) plus full-weight deterrence through the shared book both the verdict and the contest read. Betrayal withdraws guarantees like recognition; binding pacts stand.
- Wild proof: an overmatching attack (5 vs 1+3 bare) holds only through patron weight, then recalculates into acceptance — fog declares, facts negotiate.
- Fallout restaged honestly: none beyond new files — all 208 prior suites pass unmodified (default caps sit below patron power, so the machinery stays silent in every earlier fixture).
- Validation: 208/1491 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 76/76 (2 new E19 entries), coverage 116 rows.

## E18 — reconquest and reintegration: claims get verdicts (expansion)

- Gap (probed, not guessed): former rulers kept hot claims forever with no verdict machinery — no acceptance, no demand, no declaration, no withdrawal — while autonomous pacts made their towns untouchable without any legal way back to war.
- Fix: step-7f verdict pass (moved with 7e before the 7b contest so yields protect and declarations break pacts before this tick's fight; verdicts read post-tax, pre-spend books). Hot claims only (former stance WAR, cold claims silent — reconquest never automatic): overwhelming threat plus failing polity yields peace (demand -> reintegrate, no battle, no occupation, polity survives landless); affordable war over a worthwhile town declares (recognition and pacts terminate as casus belli, the existing contest decides — capped power fizzles honestly); poor towns are accepted (claim released, terminal). Betrayal (post-recognition HARM or executed raid) withdraws recognition; binding pacts stand.
- Wild proof: declaration, conquest, occupation, taxation, and revolt-back-to-the-polity close the full arc live in one fixture.
- Fallout restaged honestly: none beyond new files — all 207 prior suites pass unmodified (stance-gating plus age 50 keeps every earlier fixture silent).
- Validation: 207/1483 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 74/74 (2 new E18 entries), coverage 115 rows.

## E17 — recognition, claims, and secession diplomacy (expansion)

- Gap (probed, not guessed): newborn polities governed in a vacuum — incumbents never reacted, treaties never formed autonomously (no live formation caller existed), and the former-ruler claim had no political future.
- Fix: step-7e autonomous diplomacy pass. Incumbents observe each landholding polity from age 10: clean record plus legitimacy >= 0.5 grants a directed recognition treaty (parented to POLITY_FOUNDED, recognizer trust dividend via recordTrade), else one-shot RECOGNITION_REFUSED (grant stays open to reform). From age 15 an ACTIVE recognition unlocks a non-aggression pact parented to the recognition formation. The founding claim survives recognition (HARM on record, trust below pristine). Withdrawal and reconquest are E18 work.
- Wild proof: an unmodified war fixture now secedes, recognizes, pacts, and blocks newborn raids through autonomous pacts (12 TREATY_BLOCKED_RAID) — diplomacy bites live without staging.
- Fallout restaged honestly: treaty control case now scopes blocks to polity pacts (incumbent-incumbent treaty still absent); recognition direction lives in treaty terms (polities also grant to each other).
- Validation: 206/1475 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 72/72 (2 new E17 entries), coverage 114 rows.

## E16 — sovereign polity formation: secession founds a real authority (expansion)

- Gap (probed, not guessed): a seceded town sat at controlledBy null forever — politically inert, untaxable by anyone, invisible to diplomacy, with no path to governance or reconquest.
- Fix: the secession pass founds a sovereign polity from the SECESSION event (never a later global generator). Deterministic town-derived id, booked transfer of at most 1 resource from the former ruler (source decreases, nothing minted), provisional faction legitimacy with inherited town grievance, relationship pairs with every incumbent (former-ruler claim via the existing harm dimension), control to the polity, POLITY_FOUNDED parented to SECESSION. Legitimacy lookups prefer the controller so existing justice loops recognize the newborn; newborn confidence starts 0.3 (below the 0.4 escalation gate — it must earn observation).
- Deliberate doctrines: town justice scar is NOT doctored upward (relief would reward collapse — probed inversion); recovery follows control (Slice K restaged control-aware); no free patrols; re-conquest and recognition are E17/E18 work (maturity map updated).
- Fallout restaged honestly: E15 secession/tax pins and E14 free-town pin now expect polity control; perspective evaluator pin admits live factions; Slice K heals whoever rules.
- Validation: 205/1468 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 70/70 (2 new E16 entries, E15 transfer entry migrated), coverage 113 rows.

## E15 — secession: misrule has an exit even without conquest (expansion)

- Gap (probed, not guessed): a free town at legitimacy 0.00 and grievance 1.00 for dozens of ticks stayed loyal forever — flight was the only exit; no secession machinery existed anywhere.
- Fix: step-7d secession pass beside the revolt loop. Free towns (no occupation) at legitimacy < 0.3 with grievance > 0.7 declare independence (control null, SECESSION parented to town justice), sticky-absorbing with same-tick revolt grace. Occupied towns revolt first (ledger order); independents pay no tax and present no takeover target (re-conquest is later work).
- Loop closed: brutalized free towns secede exactly once and leave the tax base; content towns never qualify; occupied towns revolt before any secession; save/load identical.
- Fallout restaged honestly (production untouched except noted): E14 revolt test stops at the snap (post-restore cascade belongs to E15) and its free-town pin now secedes; live-perspective capability implication narrowed to recorded blocks (gateActive means poverty, not attempted war — secession cuts tax income so poverty sticks).
- Validation: 204/1457 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 68/68 (2 new E15 entries), coverage 112 rows.

## E14 — revolt: brutalized occupation snaps from within (expansion)

- Gap (probed, not guessed): an occupied town starved 99 ticks (pop 30->7, grievance pinned) never snapped — control held, zero revolt-type events anywhere. Flight existed; rebellion did not.
- Fix: step-7c revolt pass. Occupied towns (penalty > 0.02, pop > 0) reading legitimacy < 0.4 with grievance > 0.6 throw off the controller: control reverts to the recorded prior ruler (or null independence), the rising costs 20% of the town and the garrison 1 resource, the occupation closes (one snap per conquest), TOWN_REVOLT parents the TOWN_TAKEN chain. Deterministic thresholds, no new RNG. Takeover stamps priorControllerId (older saves revolt to independence).
- Loop closed: brutalized occupations revolt exactly once and restore the prior ruler; content occupations and brutalized free towns never qualify; save/load identical.
- Fallout restaged honestly (production untouched except noted): none — WAR-gated transitively (revolt needs conquest first), zero restaging (203/1454 green as-is).
- Validation: 203/1454 suite, 4/16 long-horizon, build green, authority CLEAN, replay 66/66 (2 new E14 entries; occupation-record retargeted to the priorControllerId line), coverage 111 rows. Lint pending at handoff time.

## E13 — taxation and garrison budgets: land funds rule (expansion)

- Gap (probed, not guessed): a pop-50 town and a pop-1 town funded their controller identically (22.00 both over 20 ticks) — faction income was purely exogenous refill, blind to the economy it ruled.
- Fix: step-7a budget pass before campaigns. Controllers tax living towns 0.02/head (scaled by occupation foot-dragging, so resistance discounts automatically), pay 0.15 per meaningfully occupied town, book net into capped floored resources, audit TAX_COLLECTED per faction per tick. Dead ground pays nothing.
- Loop closed: income spread equals audited tax spread exactly; garrison math audited; caps bind; dead towns yield zero; save/load identical.
- Fallout restaged honestly (production untouched except noted): faction-recovery window 260->600 (measured holdAt 442 — tax-funded chests fight ~3x longer past solved grievance, then still stand down); refill and E8 weaker-attacker pins read audited tax deltas instead of bare constants. Capability coherence documented (big maxResources downgrades staged WAR via the stance machine).
- Validation: 202/1450 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 64/64 (2 new E13 entries), coverage 110 rows.

## E12 — occupation costs: conquest must be administered (expansion)

- Gap (probed, not guessed): an E8-taken town was bit-identical to its untaken twin after 60 ticks (legitimacy 0.781, grievance 0.100, pop 13 both) — conquest changed the flag and nothing else.
- Fix: TOWN_TAKEN stamps town.occupation (plain JSON, refreshed on recapture); occupationPenalty 0.3 decaying 0.966/tick feeds justice resolve (same 0.15 bound/gating as lawPenalty), caps idle recovery at 0.9-penalty, audits on JUSTICE_RESOLVED, and scales production down up to 15% (foot-dragging). Existing migration/faction channels carry the rest with no new wiring.
- Loop closed: taken legitimacy trails then converges over the assimilation window (ceiling-shaped recovery documented); occupied production trails; reported crime judges occupiers harder; recapture refreshes; save/load identical; quiet control untouched.
- Fallout restaged honestly (production untouched except noted): none — WAR-gated like E8, zero restaging (201/1445 green as-is).
- Validation: 201/1445 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 62/62 (2 new E12 entries), coverage 109 rows.

## E11 — endogenous convoys: merchants buy protection (expansion)

- Gap (probed, not guessed): convoys auto-formed free with every guard on every materialized trip — no decision, no price, no locality; merchants never learned from live convoy ambushes (bridge read BANDIT_* only); convoy losses never touched E9 capital; raids were unmarked by E10 heat on the convoy path.
- Fix: decideConvoyEscort (pure, lawful beliefs only) hires local free guards when avoided expected loss beats fee (5/guard from E9 capital, exact-once at formation, CONVOY_DECISION why/why-not); bankrupt/underfunded/guardless/safe/overpriced refuse. Convoy ambushes mark heat (authoritative only), bleed members at origin quotes with top-level capitalDelta audit, and teach route beliefs via the canonical bridge (CONVOY_AMBUSH road-gated in canObserve). Bankrupt firms take no positions and get no restock (dead firms exit the goods economy).
- Loop closed: risky hires paid escort on real trips; fees exact-once per convoy; save/load identical; heat follows convoy raids; lone ambushes teach beliefs; 200-tick risky regime (2 hires, 8 ambushes, 16 deliveries, 1 terminal bankruptcy, dead firm sits empty, heat cools, no trade collapse).
- Fallout restaged honestly (production untouched except noted): convoy-wiring + event-parentage fixtures stage hire economics (free-convoy regime retired); law/storm Why pins compose heat additively with unchanged outcomes; merchant-capital halt test tops cargo (no free restock for the dead); E9 gate-cut mutant re-verified after the restock gate neutralized it. Guard location field reverted — it enlisted guards as territory intruders (0.009 trust phantom); home derives from faction.
- Validation: 200/1439 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 60/60 (2 new E11 entries), coverage 108 rows.

## E10 — bandit heat: raiding marks the raider (expansion)

- Gap (probed, not guessed): 30 successful raids left the bandit untouched (loot 0.7, no cost, no state) — predation was free on the predator side (only factions paid, via retaliation).
- Fix: raid heat on the bandit object (+0.2/raid, cap 1, 0.95/tick elapsed-tick cooling in tickBandit, clock anchored at marking). Heat raises patrol detection wherever the bandit goes (+0.3 at full heat), audited in enforcementWhy beside familiarity and lawfulness. Unknown attackers contribute 0.
- Loop closed: notoriety follows the bandit to fresh roads/patrols; caps at 1; cools below the marginal draw after 60 quiet ticks; per-bandit; save/load identical.
- Fallout restaged honestly (production untouched except noted): law-lawfulness unknown pin now detects via heat (isolation holds in the Why decomposition, not the outcome); storm Why pins compose heat additively with unchanged outcomes.
- Validation: 198/1427 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 58/58 (2 new E10 entries), coverage 106 rows.

## E9 — merchant capital: trade has a downside (expansion)

- Gap (probed, not guessed): a merchant stripped bare 40/40 ticks still shipped 40 trips with no balance sheet (capital undefined) — predation could never kill trade.
- Fix: working capital (100 start, plain number) with P&L at live quotes via bookMerchantCapital: E3 swap net, trip-delivery revenue (pre-landing price), raid loss at origin replacement price plus forced-sale salvage, encounter-ambush theft. Below zero the merchant holds its load and stops shipping (terminal), with exact-once MERCHANT_BANKRUPT and BANKRUPT deferrals. Partial markets price at 1 via marketQuotePrice instead of throwing.
- Loop closed: deliveries earn (exact stored x price pin); raids book loss+salvage; stripped merchants bankrupt once and halt; quiet 120-tick loops never dip below start; save/load identical.
- Validation: 197/1422 suite (1421 local + exact-credit pin; clone proves 1422), 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 56/56 (2 new E9 entries), coverage 105 rows.

## E8 — settlement takeover: WAR moves borders, raids do not (expansion)

- Gap (probed, not guessed): 500 raid-heavy ticks never changed town control (north-faction,south-faction -> identical) while stances peaked at HOSTILE — authorized force had no territorial consequence; E4 explicitly deferred this.
- Fix: step-7 takeover pass before the bandit-raid loop. A RAID faction with 2+ resources at WAR stance toward a rival takes one inhabited rival town per tick on winning a deterministic contest (resources vs resources + pop*0.1), preempting its bandit raid (one campaign per tick, 10-tick cooldown). Treaties block unwaivably, WAR is unwaivable by relationshipGate=false, husks/own/null towns never targets. Transfer reroutes existing justice channels with no new wiring; defender takes recordHarm trust debit.
- Loop closed: WAR winner takes + pays 2 with parented TOWN_TAKEN; weaker holds + pays 1 (TOWN_HELD); HOSTILE raids but never towns; treaty blocks; husks safe (raids proceed instead); taken towns tick on.
- Validation: 196/1416 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 54/54 (2 new E8 entries), coverage 104 rows.

## E7 — refugee camps: displacement stages before it settles (expansion)

- Gap (probed, not guessed): 8 war-displaced arrivals teleported +16 heads straight into town population for free — no camp entity (world.refugees undefined), no delay, no food cost at arrival.
- Fix: arrivals camp at the first live town (plain-JSON world.refugeeCamps, husk-skipping with first-town fallback); tickRefugeeCamps integrates one head/tick/camp (internal transfer, no ledger change); camped mouths join town food demand in the market step while producing nothing until integrated. Empty camps close with exactly one REFUGEE_INTEGRATED event.
- Loop closed: arrival holds town pop flat with camps countable and inflow still booked; trickle integrates 1/tick to exact-once close; camped demand prices mouths without production; towns+camps conserve against the ledger; save/load identical; arrivals skip abandoned ground.
- Validation: 195/1410 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 52/52 (2 new E7 entries; refugee-applied retargeted to the campId line), coverage 103 rows.

## E6 — patrols learn the roads they work (expansion)

- Gap (probed, not guessed): 20 staged attacks on a patrol road produced 0 detections with the rate frozen at 0.4 — patrols never adapted to plain bandit pressure (the lawfulness channel only moves for observed faction violators).
- Fix: per-road exposure memory (roadFamiliarity, plain JSON) on the patrol; every worked exposure counts after its roll toward a bounded bonus (10 exposures to full, +0.2), audited in enforcementWhy beside lawfulness. Familiarity is scoped to the deployed road (redeploy starts over); fresh roads and older saves contribute exactly 0.
- Loop closed: same-draw detection flips 0/8 to hits from attack 9; bonus caps at 0.2 with base/lawfulness channels intact; save/load identical. Default world ships no patrols, so long-horizon trajectories are untouched (194/1404 + 4/16 green, zero restaging).
- Validation: 194/1404 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 50/50 (1 new E6 entry), coverage 102 rows. (Lint needed the full reseed battery — canonical-trade-system.js bytes feed memory/observation/belief/diplomacy/justice/demography/ecology/territory/relationships receipts.)

## E5 — production chains: tools are forged from ore via metal (expansion)

- Gap (probed, not guessed): tools inflow was input-independent — a drought-starved twin forged exactly as many tools as the control (2.7 = 2.7), because market.produce added same-kind stock and deducted nothing.
- Fix: per-town recipes { metal: { ore: 1 }, tools: { metal: 1 } } (plain JSON, absent = legacy flat rate, no migration). Hoisted topo planning pass (alphabetical Kahn order — save/load alphabetizes keys, strict-resume depends on it) scales rates through drought/storm modifiers, gates outputs by input stocks, deducts inputs immediately so the same-tick cascade works from zero stock; the per-kind loop only books flows. Industrial use is booked as consumed on the input kind, so every mass identity holds unchanged (zero invariant restaging); inputsConsumed/inputShortfall memos say why.
- Loop closed: ore blockade collapses metal+tools (<50% control); tick-1 forge from zero stock; 1:1 chain identity (ore consumed = metal produced = tools consumed); cargo stays food/tools; save/load identical. Default rates match refining to forge demand exactly — legacy tools flows reproduce bit-for-bit until ore is cut.
- Fallout restaged honestly (production untouched except noted): prosperous-twin fixture owns the chain (forge without ore is blockade, not surplus), market-count tests count consumes UNION produces, coverage needles follow the refactor (produce(kind, gated), scaledRate, 4-good capacities), storm/drought replay mutants retargeted to the moved modifier lines.
- Validation: 193/1400 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 49/49 (2 new E5 entries). Alphabetical order is defense-in-depth (forward Kahn converges either way here); the verified order property is strict-resume via save-load-pending.

## E4 — settlement growth, decline, abandonment, recovery (expansion)

- Gap (probed, not guessed): integer demographic floors froze every sub-scale town (founded pop-1 husks at shortage 1.0 forever, never dying/growing); no abandonment, no takeover-free claim release, migration by shortage only, merchants serving ghost demand.
- Fix: fractional remainder buckets in demography (event identities stay exact); abandonTown (spoil-out booked, claim released, remainders cleared, exact-once per episode) hooked to inhabited-then-empty; settleAttempt revives husks (same travel/knowledge/cost gates) with tickSettlerGroups preferring known husks; pickDestination adds 40-tick attack-recency penalty and skips husks; merchants cut opportunity/selection/shipments to abandoned dests (ABANDONED_DESTINATION deferral).
- Loop closed: barren towns decline to zero and abandon; prosperous twins grow; husks go idle and re-found; raids divert migrants to safe towns; trade access lowers emigration (E3 link); drought exit-drain documented (pop 100->42, grievance pins moved to decision-lock).
- Fallout restaged honestly (production untouched except noted): 3 treaty tests pop-100 (E3 precedent), sensitivity to baseline-relative pins (max<100; E4 growth outruns shuttle at thin-surplus seeds), faction-recovery to RAID-lock, migration-immigration to vital-terms identity, SUSTAIN to food-balanced acute shock (1.0) with parallel-twin shock pin (kills the neutralized-shock mutant again), coverage needle to the new identity line.
- Validation: 192/1394 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 47/47 (4 new E4 entries). Takeover explicitly deferred to E8.

## E3 — endogenous tools trade and deficit relief (expansion)

- Gap (probed, not guessed): north tools deficit (produce 0.1, consume 0.2) with south surplus (0.3 vs 0.2), but merchant.cargoKind frozen at spawn, restock refilled the same kind exogenously, merchants never moved, and resolveBanditAttack hardcoded food/south. Trip/delivery/market/faction-wires were kind-generic; only selection, acquisition, movement, and the legacy attack debit terminated the chain.
- Fix: selectMerchantCargoKind (destShortage-localShortage per kind, margin 0.2, surplus>=1 gate, ties hold) + source-market exchange (sell hold via deliverCargo booked through deliveredThisTick, buy via consume capped at surplus) at commit when free to ship; merchant relocates on TRIP_ARRIVAL; attack debit generalized to kind/destinationTownId (default south preserves legacy). Live encounter-theft booking already kind-aware (verified, no duplicate added).
- Loop closed: food north->south, tools south->north from existing production numbers; north mean tools shortage 0.56 vs 1.0 no-trader control (pop 10, 60 ticks); invasion mean 99->10 across 5x500 seeds (worst seed 34 via chronic shortage, zero attacks: genuine threshold variance, not chaos).
- Fallout restaged honestly (production untouched): 3 treaty tests to pop 100 (deficit outruns shuttle; pact-party scoping for invasion counts) + sensitivity variance to absolute regime pins (mean<50, max<=40, spread>0) with measured base/E3 numbers. Selection-freeze kills 6 E3 detectors + the pacification pin; relocation-cut kills 5.
- Validation: 191/1384 suite, 4/16 long-horizon, lint exit 0, build green, authority CLEAN, replay 43/43 (2 new E3 entries).

## E2 — travel-driven relocation: roaming synthesis consumes traffic (expansion)

- Gap (probed, not guessed): relocateBanditViaRoaming ignored bandit.trafficBelief, and its beliefs never set lootOpportunity — leaving the RAID loot term (weight 0.8) dead at 0, so the path ran on resource/distance/danger crumbs (1 relocation / 5000 ticks). tickBandit's payoff path read traffic all along; the two paths could contradict.
- Fix: per-road lootOpportunity = max(staged loot prior, co-located traffic signal 0.15 x count x recency, capped), observedTick from lastDecayTick. Same lawful R1-gated source both paths consume. Staged-only behavior unchanged (uniform lift, differences preserved).
- Detectors: unit pull-to-observed (road-c), stale-trace stay, empty-prior stay, live 12-tick agreement ending road-c. Bridge-removal kills exactly the pull test (live agreement still passes via tickBandit — documented as agreement proof, not necessity).
- Validation: 190/1375 suite, 4/16 long-horizon, lint exit 0 (3555 rows), build green, authority CLEAN, replay 41/41 (new bridge entry).

## E1 — settler populations: dropped emigrants camp, then found (expansion)

- Source (lawful, existing): demography dropped transfers (0-pop dest, no dest) previously vanished into exogenous outflow (declared deletion). They now form persistent `world.settlerGroups` (plain JSON, save/load-free) via formSettlerGroup + SETTLER_GROUP_FORMED, with no outflow booked — the humans remain.
- Autonomous founding: reducer step 0.6 tickSettlerGroups surveys (`<camp>-landing`, collision-suffixed; SCOUT_OBSERVATION + belief the knowledge gate requires) one tick, founds via the unmodified settleAttempt operator the next (template pop = group size, cost 1). Founded groups absorb; bankrupt factions wait (live NO_RESOURCES). Chronic shortage founds serial towns — mechanism, not duplication.
- Conservation restated with reason (R3 precedent): MAT-005b outflow test now pins towns + settlers balance with 0 outflow for grouped headcount. Full suite shows zero collateral (drops are rare in existing fixtures).
- Validation: 189/1371 suite, 4/16 long-horizon, lint exit 0 (3320 rows), build green, authority CLEAN, replay 40/40 (2 new E1 entries).

## R9 — test hygiene (TM-VAC-01, TM-VAC-02, TM-TEMP-11)

- VAC-01: routing-merchant-base 8 tests. Tests 1-2 relabeled mapping-consistency (pass for any same-math fork, by design); ownership proven by toll + NEW weather fork detectors (routing-only terms vanish if routeCost() is inlined). Mutations: inline-legacy fork kills exactly the 2 detectors; const-base kills 6/8.
- VAC-02: classifier test 12 split into 12a-d boundary suite (default pin, identical-input branch, two near-miss boundaries) + docstring boundary contract. Mutations: default-swap kills 3, drop-identical kills 1, broaden-branch-2 kills exactly 12d. Lint exit 0 unaffected.
- TEMP-11: PresenceBreakDetector.update/detectPresenceBreak take injectable now (production default unchanged); the 2 phase3 timer tests use staged timestamps, no waits. Perf suite: every bench asserts a 100x catastrophic tripwire in default mode; memory test measures heap delta (was hardcoded arithmetic). Mutations: 1-byte bound fails, zero slack fails, ignored-now fails both timer tests.

## R10 — long-horizon oracles (A5-F1, A5-F3, A5-F5, A5-F7)

- F1: 5000tick gains activity floors (decisions/commitments/deliveries/ratio/relocation), delivery-ratio floor, max-tick tripwire, cross-seed variance assert, per-seed rate logs, and an agency-free contrast world (passes coherence, zeros agency). Bandit 0-attack stalemate documented as F5 input, not floored.
- F3: invariant-health test 1 gains a decisions>=400 stasis detector (frozen world scores 0, verified by probe); refill/demography explicitly NOT asserted (probe: both fire without agency). Mass-balance extended 30->500 ticks.
- F5: root-caused the RAID lock (chronic tools shortage 1.000, supply 0 — unmeetable deficit + food-only trade; NOT broken decay). New faction-recovery.test.js: unit zero-flow recovery flips HOLD in <=60 ticks; live relief (produces.tools fix) returns HOLD. Both decay mutations kill precisely.
- F7: multi-seed gains deliveredSpread>0 floor (single-stream fraud fails it); diversity gains logged within-regime ranges + directional trade assert (pd0.9 mean < pd0.0 mean; flatten-regimes fails it). Single-channel danger-blind does NOT kill direction (multi-channel by design, documented). 5000tick logs attacks/encounter + deliveries/commitment rates.

## R11 — wiring honesty (TM-HOLD-10, A5-F8)

- HOLD-10: scoped as operator-API (no live settler population, no radius reader, no travel-driven relocation). Corrected two doc overclaims (claimedRadius "already uses it", Slice-L live-bandit wiring). operator-api-scope.test.js pins absence-of-autonomy + channel visibility. Settlement liveness (founded towns tick) already proven, kept.
- F8: verified the ledger makes no Trip-lifecycle live claim (0 rows); maturity prose already bounds trade pending-trip vs Trip-class surfaces. Added TARGET_HAS_NO_FACTION boundary pin (unaffiliated raid authorizes with WHY audit; dropping the branch fails it). Relationships row now states the factionless boundary.
- Validation: 188/1367 suite, 4/16 long-horizon, lint exit 0 (3085 rows), build green, authority CLEAN, replay 38/38.

## R8 — encounter rate calibration + bandit initiative

- Refugee rate: refugee-group carries cooldownTicks 15 (1-3 refugees per firing vs floor(pop*0.01) births — uncooled it fired every grievance>0.3 tick and swamped births). Generic mechanism: world.encounterCooldowns (templateId -> last tick, JSON-safe), scheduler lists/fires only fireable templates, firing stamps the ledger. Detector: 60 pinned-grievance ticks yield 1-5 refugee groups.
- Bandit initiative: contact-starved bandits (locationAge >= 15, lootExpectation < 0.3 — own-state only, no distant truth) scout a neighboring road (shared-town topology) when the utility path says stay, recorded as reason starvation-scout. The 15-tick floor sits past the 10-tick relocation cooldown so utility moves on real beliefs go first. Detectors: idle bandit relocates within 40 ticks; fed bandit (loot 0.7) never scouts. A first temperature-only attempt failed structurally (switch-margin gate filters before softmax) — replaced with the topology scout, not stacked on top.
- Self-caught: a range edit dropped the instantiateEncounter call line (ReferenceError on first probe run); repaired and diff-audited the whole encounter block.
- Every change mutation-tested. Validation: 186/1358 suite, 4/15 long-horizon, lint exit 0 (2850 rows), build green, authority CLEAN, replay 38/38.

## R7 — fidelity and material edge cases (F3, F4, MAT-002/003/004)

- F3: the closed-world reducer no longer hands witnesses exact actualDanger. Observations carry ±0.1 encounter-stream noise (save/load exact, no merchant holds ground truth). Detector: 6 successive witnesses vary within [0.7, 0.9] around road-a truth 0.8.
- F4: chooseMerchantRouteDecision ranked entries carry belief snapshots, not live handles into merchant.routeBeliefs. Detector mutates ranked beliefs and asserts the store is untouched.
- MAT-002: tickPatrol intercepts CONVOY_AMBUSH as well as BANDIT_ATTACK (derived convoy views skipped — no loss to recover). Recovery splits evenly across memberIds with transitLoss reversal and per-member belief updates.
- MAT-003: one interception per opportunity via world.interceptedAttackIds (serialized Set): dual views sharing an id and two patrols on one road each recover exactly once. 4 detectors incl. derived-view skip.
- MAT-004: ARRIVED trips with no deliverable market reach terminal EXPIRED (consequence, trip, commitment, assignment all close with TRIP_EXPIRED event; expired trips prune like delivered). Arrival tick recorded. Success path untouched.
- Every fix mutation-tested (gate removal fails its detector, restore passes). Validation: 184/1355 suite, 4/15 long-horizon, lint exit 0 (2615 rows), build green, authority CLEAN, replay 38/38.

## R6 — gate hardening (authority + evidence rules + CI)

- Authority: --snapshot now requires --reason (refused without, exit 2) and records reason + diff vs previous baseline in the snapshot file. 4 CLI tests (refusal, reason/diff recording, drift still caught, clean pass). Verify semantics unchanged (old snapshots verify fine).
- Evidence rules: (a) F3 window exclusion — rows observed 2026-08-30..09-03 can never be admissible (WINDOWED status, fails gate; successors/invalidation still retire); (b) declared-vs-derived labels enforced with explicit allowlist (visualization BLOCKED only); (c) CONTRADICTED rows never retire via supersession naming or successors (invalidation path fixed too). 5 new linter detectors (22-26); all 26 green.
- Closure bound documented (F-GATE-03): depth-5 relative-only import closure stated as incomplete in receipt.mjs; seed authors must list non-import deps explicitly.
- CI: new gates job (evidence lint + build + authority) on every push/PR. Replay stays manual with written reason (transient source mutation, minutes-long — audit tool, not per-commit gate).
- The window rule forced a full post-window reseed (all live claims re-proved with post-window observations); lint exit 0 (2380 rows, 8 explained divergences).
- Validation: 180/1347 suite, 4/15 long-horizon, build green, authority CLEAN, replay 38/38 killed with clean restores.

## R5 — oracle strength (seeds, holdouts, recovery)

- Sensitivity seeds threaded: the 500-tick loops passed `seed` nowhere (5x identical worlds, spread measured a constant). Both loops now pass mulberry32 streams via encounterRng; measured spread 128-145 (12%, bounded and non-degenerate); stale 95-98 note replaced with measured values. Determinism (§121) still passes.
- Holdouts closed: shipment scaling (believedDanger/worldCaution volume) and condition travel time each have a live-tick detector in tests/materialization-scaling.test.js (both mutation-proven: neutralizing one fails only its own test). Replay +3 (shipment-scaling, travel-time, drought-recovery); 38/38 killed, clean restores.
- Drought SUSTAIN is control-relative: twin no-drought world; final distance to control must be smaller than drought-time distance. Overshoot (-1.1) accepted as legitimate rebound (convergence, not one-sidedness); drought neutralization kills SUSTAIN only.
- No production changes in this slice (tests + replay harness only): no reseed needed, lint unaffected.
- Validation: 179/1338 suite, 4/15 long-horizon, build green, authority CLEAN.

## R4 — replay scope + soundness (TM-BIAS-07 + TM-KILL-04)

- Harness now measures a green baseline per entry before mutating (BASELINE_RED verdict, fails the gate like SURVIVED). No production changes in this slice.
- Table 23 → 35: law-apportion/restitution/justice-penalty/lawfulness, wildlife-factor, condition-divisor (retargeted to the live routing.js surcharge — the canonical distanceCost is WHY-only since Slice AD, so the historical anchor was behaviorally void), market-theft/delivery-merge/exactonce-trip, chain-merchant (retargeted to the live re-parenting line — the call-site arg is masked by it), chain-migration, maturity-live-rows. 35/35 killed with clean restores.
- Dropped with reason: consequence-status-only exactonce (no independent effect given the trip guard), OBS fallback/locality (covered by R1 gate entries), event-template family (obsolete post-R2 allocator; covered by R2 entries), lint DEFAULT_ROOT (config), migration count-latency (test-classifier). Full mapping in the verdict handoff.
- Self-caught: two replay entries lost to a range collision (found by entry inventory vs expectation, restored); one crude mutation masked by redundant fixup led to removing the redundancy instead.
- Validation: replay 35/35 (baselines green throughout), full suite untouched by this slice (no prod/test changes), lint exit 0 (2145 rows).

## R3 — conservation closure (MAT-001 + MAT-005)

- MAT-001: resolveBanditAttack books {stored, overflow} into the cumulative market-flow ledger AT ATTACK TIME (direct, not deliveredThisTick — attacks resolve after the market loop merged and before the next reset, so a same-tick entry would be wiped unmerged; first implementation used the wrong plumbing and the detector caught it). Capacity-pressure detector proves residual holds.
- MAT-005: new world.exogenousPopulation {inflow, outflow} ledger (plain JSON, lazy-init). Refugee-group absorption books inflow; demography drops book outflow via a single recorded transferReceipt reused by the event emission (gate-time vs emission-time pops can disagree — one decision point). Dropped transfers emit truthful received-0 events with dropReason instead of the phantom +N the town never got (found while debugging: the emission loop invented immigration the apply loop refused).
- Enabling the refugee type (dead twice over: missing applied=true + Map.length check) restored a live population pump. Conservation equations restated with the booked terms (full identity incl. event-summed births/deaths where nonzero; massResidual pattern); production-mechanics fixtures isolate demography by per-tick grievance pin (their stated intent). 11 failing tests, each reasoned individually (one contaminated comment fixed on sight); no equation padded with slack. Fixture-control vs restatement rule: isolate when the test isn't about the confound, restate when it is.
- Detectors: tests/conservation-r3.test.js (3 tests, all red pre-fix). Replay +3 (bandit-delivery-booking, refugee-applied, demography-receipt); 23/23 killed, clean restores. Seed tooling: --needles-only fast mode added to the coverage seeder; dedup no longer lets FAILED proofs block green re-proofs (mid-repair mint poisoned ecology otherwise).
- Self-caught tooling errors: one edit ate the attackOpportunityId idempotency guard (restored verbatim, diff-audited); one mis-anchored insert duplicated a delivery block (removed); one seed-script range collision swapped out the markets consumer row (lint caught it via derived UNIT — restored, row-set diffed vs HEAD).
- Validation: 178/1336 suite, 4/15 long-horizon, build green, authority CLEAN, lint exit 0 (2145 rows, 8 explained divergences), full reseed campaign.
- Open follow-up (not this candidate): refugee encounter rate calibration (fires whenever grievance>0.3 with no cooldown — swamps births in quiet worlds; template rate never calibrated) and bandit distant-sensing initiative (R1 stalemate note stands).

## R2 — event parentage authority (F6 + re-audit round)

- Migrated all 9 bare world.events.push sites + 7 one-shot helpers to appendWorldEvent: CONVOY_AMBUSH (sibling-attack parent search, then simplified to always-root when the search proved unreachable-by-construction + merchantIds added), MERCHANT_RESPAWN (loss-event parent or EXOGENOUS_RESTOCK), SEASON_CHANGE (prior-season chain, template ids dropped), ENCOUNTER (candidate parent via new parentEventIds option + result.eventId wiring so the BANDIT_ATTACK child parents correctly), TREATY_FORMED/VIOLATED/TERMINATED (per-treaty chain), one-shot helpers (SCENARIO_SETUP roots). Only the allocator's internal push remains.
- Detectors: tests/event-parentage.test.js (6 tests, 5 red pre-fix). Re-audit FAIL found: rootless CANDIDATE head, dead sibling search (removed as theatre), ambush missing merchantIds (added + pinned), fragile [undefined] guard (normalized), plus non-blocking notes. All addressed; second review of the delta is folded into the R1/R2 re-audit passes (no live-tick leak constructible).
- Replay extended to 20 (season-chain, treaty-chain, encounter-parent + prior 17); one entry exposed a redundant post-hoc fixup masking the mutation — removed so the single parentage path stays honest. 20/20 killed, clean restores.
- Self-caught tooling error: a mis-anchored seed edit swapped out the markets LIVE_CONSUMER row (lint caught it: markets derived UNIT); restored + verified row-set equality vs HEAD. Lesson: diff row sets, not just counts, after seed-script edits.
- Validation: 177/1333 suite, 4/15 long-horizon, build green, authority CLEAN, lint exit 0 (1942 rows, 8 explained divergences), full reseed campaign.

## R1 — panopticon closure (F1/F2 + re-audit FAIL + R1b bypass round)

- Repair: tickMerchant learns bandit activity ONLY from canObserve-passing BANDIT_ATTACK/RELOCATION events ([tick-1, tick] fresh-evidence window) with perceptionAccuracy as the success flip; tickBandit learns ONLY co-located merchants (route === bandit.roadId), gate before the rng draw. canObserve imported into canonical-trade-system.js (no new cycle — the import already existed).
- Detectors: tests/observation-boundary.test.js — 9 new/pin tests (twin-belief identity, accuracy-0 blindness incl. 5-tick reducer pin, own-road learning, other-road exclusion, bandit co-location + accuracy-0, reducer elevation, fresh/stale window) + 6 restored pre-R1 oracles. 5 failed pre-fix for the right reasons.
- Restaged (oracle-aligned, each documented): bandit shortcut A-tests (co-located), WHY/noise tests (staged legal attacks), reroute chain (contact-required) + mechanism (5-tick horizon kept), all-systems + roaming (lawful traffic priors), causal-chain (accuracy 1 — the chain IS an observation chain), differentiation (fear joins metrics: without contact, danger moves only felt fear — the old pass was stream-contingent attacks).
- Scoped re-audit #1 verdict FAIL (correct): found the BeliefStore bridge, rumor teleport, 2.4 accuracy gap, 6 deleted oracles (observation-boundary.test.js existed in HEAD — overwritten unread), narrowed 5-tick, window time-travel, coarse replay. R1b closed all 9: oracles restored verbatim (15/15 green), rumor gated to same-town + exclusion detector (mutation-proven both directions), 2.4 gated on accuracy via encounter stream, mover/window semantics pinned, replay extended to 17 (history-window, canobserve-universal, formation-accuracy, rumor-locality). Re-audit #2: PASS, no live-tick leak constructible (live BeliefStore writers are exactly 2.4 + rumor).
- Validation: 176/1327 suite, 4/15 long-horizon, build green, authority CLEAN, lint exit 0 (1562 rows, 8 explained divergences), replay 17/17 killed with clean restores, full reseed campaign.
- Known follow-up P1 (NOT this candidate): default-world bandit initiative. With the leak closed, an idle bandit with no contact never acquires traffic beliefs (10-tick trace: zero attacks/relocations, frozen loot) — the hunt loop needs a lawful distant-sensing slice (bandit scout/rumor-carrier/exploration ignition). Integration tests use staged traffic priors until then; the stalemate is characterized, not hidden.
- Process notes: two range-collision syntax breaks from stale line numbers (caught by node --check, repaired by re-read); one false RESIDUE-WARNING from substring search (now sha-only); one overwritten test file (restored + merged); one surviving replay entry forced a decay-proof fractional-clamp unit test (retaliation-clamp detectors now escalation|invariant-health).

## V8 AUDIT — verdict REJECTED (3 P0, 23 P1, 16 P2; 42 findings)

- Candidate 79f287c frozen from fresh clone (remote==local, clean). All gates re-run raw (no shell pipes): suite 176/1316 exit 0, long-horizon 4/15 exit 0, build exit 0, authority CLEAN, lint exit 0 (1184 rows), replay 11/11 killed with clean restore. The historical PASS-text/Exit-1 conflict is resolved: PowerShell surfaces node stderr as NativeCommandError, poisoning wrapper codes; raw codes are the oracle (TEST_GREEN).
- Five read-only auditors (same-model scouts, clone-only, claims-untrusted) returned 40+ findings; manager re-verified the P0s + MAT-001 + TM-HOLD-08 + A5-F2 by direct read. Artifacts: docs/audit/v8-current/ (candidate, findings, receipts, mutation matrix, maturity reconciliation, causal contracts, long-horizon, limitations, verdict).
- P0 (reject): F1/F2 merchant/bandit panopticon reads bypassing canObserve; F6 live CONVOY_AMBUSH/MERCHANT_RESPAWN orphans. Perceived-reality claim is FALSE at candidate.
- P1 themes: conservation holes (MAT-001 bandit-path overflow, MAT-005 exogenous population), oracle strength (seed fraud in sensitivity-500tick, coherence-only 5000tick, recovery-vs-nothing, two unguarded materialization terms), replay scope bias + no baseline, gate mechanism gaps (unsigned snapshot refresh, unenforced window/labels/supersession-auth, depth-5 closure), CI gap.
- Statuses: DEVELOPMENT verdict REJECTED; supervisor NOT_ADMITTED; acceptedAuthority false. Artifacts commit AFTER the candidate (untracked at freeze); candidate SHA unchanged by this entry's commit.
- Next repair responsibility (bounded, §22 order): R1 gate panopticon reads behind canObserve + twin-world OBS-BOUNDARY detectors; R2 migrate orphan emissions to appendWorldEvent with parentage; R3 book bandit-path delivered/overflow + exogenous population; R4 thread sensitivity seeds, add recovery-vs-control + holdout detectors, expand replay scope with baselines; R5 harden gate mechanisms (snapshot auth, window rule, label enforcement, supersession auth, CI wiring). Each repair = new candidate + re-run of affected gates + fresh read-only audit of the touched scope.

## PRE-AUDIT 5 — mutation-kill replay script (11/11 killed, zero residue)

- New evidence/replay-mutations.mjs mechanically re-applies 11 sampled production mutations (storm pricing, bandit/patrol weather factors, storm production, scheduler cadence, wagon wear, investigation ratchet, routing base, stance gate, retaliation clamp, ledger content-match guard), runs the named detectors, requires exit-nonzero plus failed tests for the kill, restores each file, and verifies restoration by sha256 equality. Exit 0 iff all kill and all restore.
- Measured: 11/11 KILLED (31 detector failures total, each the mutation's own suite), 11/11 byte-identical restores, worktree clean after. Kill accounting is now re-runnable evidence, not testimony.
- Process note: the first run reported a false RESIDUE-WARNING on storm-pricing — the residue heuristic searched for the replacement string `? 0`, which occurs naturally. The restore was byte-perfect (verified by hash + status); the check is now sha-equality only. Same run also caught an edit-tool range collision that spliced the new finally block into the mutation table; repaired by re-reading and re-anchoring, verified by node --check and the clean rerun.

## PRE-AUDIT 4 — fresh-clone reproduction (line-ending determinism fixed)

- Fresh clone at 1ac7f07 reproduced the suite (176/1316), all 4 long-horizon suites (15 tests), and the build — but the evidence gate failed wholesale (0 admissible) and authority reported MODIFIED on frozen-mutants/V5_PROPOSED_MUTATION_MATRIX.json.
- Root cause (environmental, not code): no .gitattributes, so checkout bytes depend on core.autocrlf. The worktree carries LF in tool-written files and CRLF elsewhere; a fresh clone checks out CRLF everywhere (economy.js 7781 vs 7943 bytes, identical lines). Byte fingerprints cannot survive that. The authority snapshot likewise binds checkout bytes.
- Fix: repo-root .gitattributes (`* text=auto eol=lf`) plus `git add --renormalize` (89 files, 36315+/36315-, `git diff --ignore-cr-at-eol` EMPTY — pure normalization). One amend was needed: the first commit missed the untracked .gitattributes itself (caught by status check, amended pre-push).
- Authority snapshot refreshed via the checker's own --snapshot (explicit justification: normalization changed snapshot bytes with zero semantic change, proven by the empty non-whitespace diff; pre-normalization snapshot stays in git history; without refresh --verify compares LF worktree against CRLF snapshot). --verify CLEAN after.
- Full ledger re-proved against normalized bytes (all seeds + specified + coverage): lint exit 0, 949 rows, same 8 explained divergences as item 3. Fresh-clone re-verification (suite + build + lint + authority) runs after this commit pushes.
- Correction, same item: `git add --renormalize` normalizes the INDEX only — the worktree kept CRLF bytes (checkout-index -f also skipped the rewrite; only delete-plus-checkout honored eol=lf). The 949-row reseed above therefore bound CRLF bytes again and the re-clone still failed the gate. Diagnosed via recorded-vs-fresh hash comparison (economy.js 7781 vs 7943 bytes, identical lines). Fix: rm + checkout of the 89 CRLF files (0 CRLF remain of 448 tracked), full reseed once more: lint exit 0, 1184 rows, same 8 divergences. Lesson: after any renormalization, verify worktree bytes, not just the index.
- Verified 2026-09-03 on fresh clone of 7e8268c (C:/tmp/fear-fresh3, npm ci): 176 suites / 1316 tests green, all 4 long-horizon suites (15 tests) green, production build green, authority --verify CLEAN, evidence lint exit 0 (1184 rows, same 8 explained divergences). Item 4 complete.

## PRE-AUDIT 3 — roadmap honesty (37 divergences to 8 explained)

- Three mapping scouts (trade cluster, agent/world cluster, nearly-there; read-only, strict needle-verified output contract) mapped every under-evidenced domain to existing detector tests and production symbols. New evidence/seed-slice-coverage.mjs binds 100 rows with fail-fast needle verification — every needle held at seed time, zero aborts.
- 9 upgrades, all ledger-backed (derived already exceeded declared): belief/diplomacy/demography/trade to CROSS_DOMAIN_INTEGRATED; memory/observation/ecology/justice/territory to CONSEQUENCE_VERIFIED.
- 1 downgrade, scout-proven: refugees LIVE_PATH_INTEGRATED (basic) to UNIT_VERIFIED — no world.refugees array, no refugeeGroup type, no live consumer; immigrants absorb into town population. Two CODE/UNIT rows seed the immigration behavior that does exist.
- relationships needed one CONSEQUENCE row (escalation past TOLERANT) to complete its CROSS chain — added, now derives CROSS_DOMAIN_INTEGRATED as declared.
- Two hardcoded receipts found and rewritten: seed-territory.mjs and seed-relationships.mjs recorded exitCode 0 with August summaries and never ran their commands. Both now run every command live via runTestReceipt with real exit codes/digests through buildReceipt (same claimIds, so honest rows retire the hardcoded ones). No other seed had the disease (all others use runTestReceipt).
- REMAINING_WORK.md (2026-08-26, 24-suite world) stamped SUPERSEDED in place; handoff + maturity table + ledger are the authorities. seed-specified.mjs regex now accepts trailing text after the label (it had skipped 6 domains: factions, refugees, quests, replay, and 2 more).
- Remaining 8 divergences, all non-false: 7 ledger domains with proof but no doc row (bandits, merchants, patrol, market, long-horizon, runtime, statistical-validation — sub-domains of trade/runtime, extra proof claims nothing false); visualization BLOCKED (deliberate scope verdict, linter has no BLOCKED concept — SPECIFIED-derived is the closest true statement).
- Validation: lint exit 0 (714 rows, 0 errors); full suite 176/1316 green; ledger byte-identical across the run. No production code touched in this item.
- Process note: one coverage-seed insert overwrote the relationships-integration row (caught by row-count check, restored, rerun). Scouts delivered exact-substring needles; the seeder re-verified all of them.

## PRE-AUDIT 2 — evidence gate green (mechanism completed, ledger re-proved)

- Root cause of the permanent red: the fingerprint binds head + dirty + file hashes, so ANY commit staled every row, and the append-only ledger could never return to green — the gate demanded history be present-tense. The linter now implements the retirement semantics the audit trail always implied: (a) rows whose tracked files still hash as recorded are ADMISSIBLE across head-only drift; (b) EVIDENCE_SUPERSESSION.invalidatedClaimIds is honored (INVALIDATED); (c) a stale row with a live same-claim re-proof retires SUPERSEDED. A lone stale row with no current proof still fails — the MUT-EVID-002 pinned tests are untouched and green.
- Two mechanism bugs found en route, both fixed with detectors: buildReceipt never persisted fileHashes (content-match had nothing to compare — all reseeds went stale on the next dirty flip), fixed plus legacy-aware dedup so pre-fileHashes rows never block an enriched re-seed; maturityGate let retired placeholders without commandResults veto their live successors, fixed to tally live rows only (test 20). loadDomains never parsed backticked maturity labels, so declaredLabel never joined — fixed (test 21).
- Ledger work: all 10 seed scripts re-run (98 live claims re-proved, old rows auto-retired); new evidence/seed-specified.mjs re-proves the 25 SPECIFIED migration placeholders against the maturity doc itself (31 rows — the doc has 6 newer domains) with the full suite as shared receipt; one mass-invalidation supersession row retires the remaining 141 Jest-pollution rows (history preserved, 0 admissible). Ledger: 270 -> 529 rows.
- Validation: lint exits 0, 0 failing domains, 0 errors; full suite 176/1316 green with ledger byte-identical before/after (sha 65c91a61); 5000-tick covered by seed-long-horizon receipt. Authority CLEAN (item 1). 17 domains derive above SPECIFIED.
- Process notes: the edit tool echoed duplicated lines several times in the test-21 append (ranges drifted as the file changed); each caught by node --check and repaired by re-reading first. Mutation proof: content-match removal kills test 18; pre-change code fails new tests 16-18; maturity poison fix is covered by test 20.
- Explicitly NOT done here (item 3): 37 declared-vs-derived label divergences remain (e.g. factions/quests/refugees/replay have no rows at all; many LIVE_PATH_INTEGRATED declarations derive lower). The gate is green; the declarations are next.

## PRE-AUDIT 1 — skipped-suite enumeration (plus one real fix)

- The routine per-change gate runs non-long-horizon plus `long-horizon-5000tick`. The routinely-skipped set is exactly three suites: `long-horizon-invariant-health`, `scenario-differentiation-long-horizon`, `long-horizon-dynamics`. All three now run explicitly: scenario-differentiation 4/4 (~1.1s batch), dynamics 5/5, invariant-health 5/5 after the fix below.
- The enumeration caught a genuine regression hiding in the skipped set: invariant-health ALWAYS `faction.resources in [0, max]` failed at tick 213 (`north-faction resources -0.4 > max 2`). Cause: `escalation.js executeRetaliation` spent `resources - 1` unclamped — the only faction-resources write in the codebase without a `Math.max(0, …)` floor — so a faction entering with fractional resources (0.6, via restitution/trade paths) landed at -0.4. Fix: clamp the spend at zero, matching every other write site. The Slice H invariant test is the detector; the observed pre-fix failure is the mutation proof (unclamped gate fails, clamped gate passes); no test file was touched.
- Post-fix: non-long-horizon 176 suites / 1310 tests green (~39.8s), 5000-tick 3 seeds green (~17.7s). Authority-check `--verify` CLEAN. `lint:evidence` still exits 1 (270 rows, 0 admissible, all domains stale) — that is item 2, not this entry.
- Lesson for the audit: the skipped set is where regressions hide by construction. Item 5's replay script should include these three suites in its scope.

## SLICE AI — storms disrupt town production

- Weather gains its fourth live consumer in the step-4 market loop, beside the Slice D drought block: an active storm on any road incident to a town scales that town's per-good production by `(1 − 0.3 × severity)` — milder than drought's 0.6 by design (logistical disruption: labor and carts cannot move; the fields still yield). Unknown storm roads match no incident road and multiply by exactly 1; storm-free worlds are untouched.
- `tests/storm-production.test.js`: 6 tests cover the designed ratio (0.82 at severity 0.6), the market consequence (lower supply — shortage stays pinned at 0 under surplus-rate production, so the detector asserts supply rather than inventing a shortage), incident-only honesty, severity monotonicity (0.7 vs 0.94), recovery after the storm ends, and save/load equality.
- Mutation check: multiplier neutralized to 1 → 3/6 fail (ratio, supply, monotonicity); the drought suite stays green under the mutation; restored, zero residue.
- Process note: the shortage-first detector failed honestly (surplus production pins shortage at 0 in both worlds) and was rewritten to assert supply. Two range edits dropped the drought block's closing brace and the produce guard head (syntax errors, caught by `node --check`); both restored.
- Validation: non-long-horizon 176 suites / 1310 tests green, `long-horizon-5000tick` 3 seeds green (~20.0s, no regression), production build green.
- Remaining weather boundary: storms are scheduled, not seasonal/RNG-driven.

## AUDIT RESPONSE — F3 authority violation resolved by supervisor action

- The violation was genuine, not a false positive: `CURRENT_REALITY_MANIFEST.json` declares itself worker-authored (`createdAt 2026-08-30T22:30Z`, "Worker wrote this. Supervisor must verify independently.") and was committed post-snapshot (snapshot 20:08Z, single commit 47240c3 for the whole control dir). A worker writing a new control-plane file is exactly what the checker exists to detect.
- Resolution, authorized by the supervisor instruction to fix the remaining audit findings: the manifest was removed from the worktree via `git rm` (fully recoverable from history — no evidence destroyed), and the baseline was re-established with the checker's own `--snapshot`. The new snapshot covers the same `frozen-mutants` matrix hash as the old one (continuity), and `--verify` now reports CLEAN.
- Deliberately not done: adopting the manifest by re-snapshotting around it. Its content is irrecoverably stale as "current reality" (gitHead 63d76f9, 128/1095 worker-reported counts vs 175/1304 measured on this master, every field flagged reVerificationPending, mutation method "no disposable copy, no receipt"). Blessing it would have been the exact evidence-destroying act the audit warned against. Nothing in docs/tools/production referenced the file — only the prior handoff entry, which stands as history.
- Lane A consequence: the authority baseline is no longer known-bad. Acceptance claims bind to a clean baseline from this commit forward; the 2026-08-30→2026-09-03 window remains admitted violation period and claims dated inside it stay inadmissible.

## AUDIT RESPONSE — independent audit F1 (fixed) + F2 (contained, invariant added)

- The 2026-08-30 independent audit (fresh clone at 5350560) was verified finding-by-finding against current master. F1 and F2 were still live; both are now addressed. F3 still stands and was deliberately not touched (supervisor judgement required). F5 is fixed (has been for many slices: per-world monotonic `world.nextEventId` allocator plus `parentEventIds` on every event — the exact infrastructure the audit named as missing).
- F1 fix: `evidence/migrate.mjs`, `evidence/seed-relationships.mjs`, and `evidence/seed-territory.mjs` derived their root from the hardcoded author checkout. All three now use the `lint.mjs` pattern (`resolve(dirname(fileURLToPath(import.meta.url)), '..')`); `--root` override on migrate/lint still wins. `lint.mjs` itself was already fixed; `receipt.mjs` uses cwd (works from the package dir). The two test files the audit named carry cwd fallbacks and degrade gracefully.
- F2 containment: the runtime guard the audit asked for already exists — `buildReceipt` throws inside test processes without an explicit out-of-tree ledgerPath, and the helper suite proves byte-identical ledger across the blocked write. New `tests/evidence-ledger-isolation.test.js` (3 tests) is the separate invariant that reads the suite instead of exercising the writers: only the guard suite may name the canonical ledger path, maturity row-writer importers must not touch docs/evidence paths, and no test may name the ledger filename without tmpdir(). A planted violating probe file fails all 3 invariant tests; removed after.
- F2 closure proof: full non-long-horizon run (175 suites / 1304 tests) leaves the production ledger byte-identical (sha b01041d4, 270 rows before and after). The 144 historical `__receipt_test__` rows stay: they are committed history, the linter already quarantines them (0 admissible, all stale, own domain), and purging committed evidence to look cleaner is exactly the confidence-inflating edit pattern this audit criticizes. Linter verdict stands: exit 1 on stale fingerprints, 0 admissible — reported, not hidden.
- F3 status (read-only): `authority-check --verify` still reports AUTHORITY_VIOLATION on current master (one NEW_FILE: CURRENT_REALITY_MANIFEST.json postdates the snapshot). Not re-snapshotted — per the audit, that would destroy the drift evidence. Supervisor call.
- F4/F6 notes: manifest staleness not re-derived here; jest exit codes are always captured explicitly in this workflow (`Command exited with code` observed per run) rather than through pipes.
- Validation: non-long-horizon 175 suites / 1304 tests green, `long-horizon-5000tick` 3 seeds green (~23.1s), production build green.

## SLICE AH — opt-in storm scheduler

- Weather closes its injected-only gap: scenarios may declare `world.stormSchedule { everyTicks, durationTicks, severity, roadIds, nextRoadIndex? }` (plain JSON). On cadence ticks with no active storm, the reducer starts a storm on the next scheduled road, emits `STORM_STARTED` with `{scheduled: true, rootReason: 'STORM_SCHEDULE'}`, and wires `startEventId` so `STORM_ENDED` parentage keeps working. Rotation persists on `nextRoadIndex` (save/load cannot double-schedule); active storms are never stacked; malformed schedules (no cadence, no roads, unknown roads) are honest no-ops. Absent schedule means no storms — the default scenario stays storm-free and unscheduled worlds behave exactly as before.
- `tests/storm-scheduler.test.js`: 6 tests cover cadence shape (road, severity, duration, single start event with wired parent id), rotation with no-stacking (including long-storm/short-cadence overlap), the scheduled pricing lifecycle (storm prices from the tick after it starts — the scheduler runs after the pricing pass — and clears on end), malformed-schedule honesty, the unscheduled baseline over 20 ticks, and save/load rotation equality.
- Mutation check: cadence gated to never fire → 4/6 fail; the AE suite stays green under the mutation; restored, zero residue.
- Process note: the pricing test first assumed the tick-5 storm prices on tick 5, but the scheduler runs after the pricing pass — the detector now asserts tick-6 pricing explicitly. A range edit again dropped the countdown block's closing brace and the drought header (syntax error, caught by `node --check`); both restored.
- Validation: non-long-horizon 174 suites / 1301 tests green, `long-horizon-5000tick` 3 seeds green (~19.6s, no regression), production build green.
- Remaining weather boundary: storms are scheduled, not seasonal/RNG-driven; no storm effect on production.

## SLICE AG — storms blind patrol detection

- Weather gains its third live consumer with the same factor shape as the hunt: `tickPatrol` scales the whole effective detection rate (base + lawfulness bonus) by the deployed road's `distance / (distance + weatherCost)` (severity 1 halves it; calm roads factor exactly 1). The rate scales — no extra RNG draw — so encounter-stream alignment is untouched. `enforcementWhy` audits `{weatherCost, weatherFactor}` beside the Slice V lawfulness fields.
- `tests/storm-patrol-detection.test.js`: 6 tests cover the intercept-to-miss flip at a fixed rng boundary (0.4 base detects at 0.3 calm, misses at 0.2 stormed), the `enforcementWhy` audit, calm parity, unrelated-road neutrality, live reducer pricing (storm-world patrol events carry factor < 1), and save/load equality with identical follow-up outcomes.
- Staging note: the staged attack emits LAW_VIOLATED, which adds a Slice V lawfulness bonus (+0.5) that masks the weather scaling — the detectors strip town laws to isolate weather, documented in the fixture. The first run caught this honestly (storm still intercepted).
- Mutation check: weather scaling dropped from the rate → 2/6 fail (flip, audit); restored, zero residue.
- Validation: non-long-horizon 173 suites / 1295 tests green, `long-horizon-5000tick` 3 seeds green (~14.3s, no regression), production build green.
- Remaining weather boundary: no auto-scheduler; no storm effect on production.

## SLICE AF — storms suppress the bandit hunt

- Weather gains its second live consumer, mirroring the Slice AA wildlife pattern: `tickBandit` discounts route payoff by `weatherFactor = distance / (distance + weatherCost)` (severity 1 halves the payoff; calm roads carry `weatherCost: 0`, so the factor is exactly 1 and legacy behavior is preserved). The factor is audited on the scored rows next to `wildlifeFactor`; both discounts multiply, so a stormed, predator-crowded road pays for its danger twice over, honestly.
- `tests/storm-bandit-suppression.test.js`: 6 tests cover the stormed hold with calm control (traffic 3 vs 5 relocates calm, holds stormed), the factor-free calm payoff ratio (5:3) with the storm halving, unrelated-road neutrality, severity monotonicity (0.25 hunts, 1.0 holds), holder stability (the bandit on the stormed road stays while it is still the best hunt — the discount does not panic holders), and save/load equality with identical follow-up decisions.
- Mutation check: `* weatherFactor` dropped from the payoff → 3/6 fail (hold, halve, severe-monotonicity); wildlife suite unaffected (9/9 still green under the mutation); restored, zero residue.
- Validation: non-long-horizon 172 suites / 1289 tests green, `long-horizon-5000tick` 3 seeds green (~22.7s, no regression), production build green.
- Remaining weather boundary: no auto-scheduler; no storm effect on patrols or production.

## SLICE AE — storms price road risk through routing

- Weather leaves SPECIFIED by mirroring the Slice D drought contract: storms are transient scenario state (`world.storm { active, roadId, severity, remainingTicks, startedTick, startEventId }`, injected — no auto-scheduler). The reducer prices the storm road at `weatherCost = severity × distance` every tick; every other road resets to 0, so ended storms clear by construction and older saves migrate with zero weather and zero drift. The clock decrements and `STORM_ENDED` emits parented to `STORM_STARTED`.
- The consumer was already live: `routing.routeCost` has priced `weatherCost` since Slice Z, but nothing ever set it (a dormant term). Through the Slice AD wiring it now flows into every merchant's base score with no canonical-trade-system change — a severity-1 storm on road-a moves the live merchant to pristine road-c against a calm control that stays on road-a.
- `tests/storm-weather-routing.test.js`: 6 tests cover pricing (`0.5 × 5 = 2.5`, others 0), end/clear with parentage, the live reroute flip with pinned beliefs (`perceptionAccuracy: 0`, since the legal observation channel would otherwise rewrite mid-test beliefs), severity monotonicity (1.25 vs 3.75), save/load equality with identical follow-up pricing, and the calm baseline.
- Mutation check: weather assignment flattened to `0` → 3/6 fail (pricing, flip, monotonicity); restored, zero residue.
- Process note: the flip test first failed because the live topology has three roads from north — the stormed merchant takes pristine road-c, not road-b as assumed; the detector now asserts the refuge directly (verified by dumping live scores: road-c 0.45 < road-a 0.95 stormed). A range edit also dropped the maintenance loop's closing brace and the drought section header (syntax error, caught by `node --check`); both restored.
- Validation: non-long-horizon 171 suites / 1283 tests green, `long-horizon-5000tick` 3 seeds green (~16.6s, no regression), production build green.
- Doc honesty fix in the same pass: the ecology maturity row still claimed "no ecology system" while season/drought/demography have been live for slices; corrected to the real boundary (no regrowth stock, injected-not-scheduled droughts).
- Remaining weather boundary: no auto-scheduler; no storm effect on bandits, patrols, or production.

## SLICE AD — routing.js owns the merchant base cost

- Trade-routes leaves its split-brain state: `chooseMerchantRouteDecision` consumed a hand-rolled blend that duplicated `routing.routeCost` term-for-term (distance/condition, danger, cargo-at-risk, familiarity) while Slice Z had to patch condition handling in both places. The canonical decision now maps its identity/belief terms 1:1 onto a routing perception — `fearSensitivity: (1 − riskTolerance) * 40`, `expectedCargoLoss: cargoLossRisk / 10`, `routeFamiliarity: familiarityBonus * 10`, `confidence: 1` — and consumes `routeCost / 10` as the base score (routing prices distance in whole units, the decision scores in distance/10 units). The ranking is identical to the legacy blend by construction; market opportunity and trade-reliability adjustments layer on top (neither has a routing equivalent and both stay canonical).
- New live capability, not just a refactor: routing-only terms now steer merchants. A tolled road (`tollCost: 3`) loses to an otherwise identical free road by exactly 0.3 — the legacy blend tied and the index tiebreak kept the tolled road. Component fields (`distanceCost`, `dangerPenalty`, `familiarityBonus`) stay exact for the WHY audit, plus the new `routingBaseCost` field.
- `tests/routing-merchant-base.test.js`: 7 tests cover base reconstruction vs the legacy blend, ranking-order identity with routing, the danger flip, condition flow (degraded short loses to pristine long), opportunity layering (`score ≡ base − bonus`), `selectRoute` agreement, and toll steering.
- Mutation check: base recomputed as the legacy blend (routing bypassed) → toll test fails (`road-toll` chosen); restored, zero residue. The toll test is the discriminator — reconstruction/order tests pass under the mutation by design, since the mapping is algebraically identical.
- Process note: the first production edit dropped the `const beliefs` extraction (all 21 trade-routing tests failed with `beliefs is not defined`); restored immediately. The second dropped the `destinationTownId` head (syntax error, caught by `node --check` before any test ran). Both caught pre-commit.
- Validation: non-long-horizon 170 suites / 1277 tests green, `long-horizon-5000tick` 3 seeds green (~22.6s, no regression), production build green.
- Doc honesty fix in the same pass: the markets maturity row still claimed "no price elasticity" two slices after Slice N/O shipped `getElasticQuote`; corrected to the real boundary (no bidding/auction discovery).
- Remaining trade boundary: the real `trade.js` trip lifecycle (`startTrip`/`completeTrip`) is still unwired into the pending-trip system; `findRoutePath` multi-hop planning is unused (all live roads are direct edges).

## SLICE AC — wagon capacity prices road usage per shipment

- Logistics leaves SPECIFIED (the gap Slice Y named): `closed-world.js` owns `WAGON_CAPACITY = 12` — the established 12-unit shipment contract is exactly one wagon — with `wagonsForShipment` (`max(1, ceil(amount / 12))`). `schedulePendingTradeTrip` scales usage wear as `0.01 * wagons`: standard loads keep the legacy 0.01 exactly, over-capacity loads degrade the road faster, and the 0.5 floor plus maintenance recovery still bound travel time at 2x. `TRIP_COMMITMENT` audits `{wagons, roadCondition}` next to the pre-wear snapshot.
- Capacity prices the road, not the goods: cargo volume is untouched (a 20-unit trip still delivers 20), so §155 market conservation holds and the Slice Z route-choice/travel-time consumers react to heavier wear without any new currency or event type.
- Live-path note: merchants carry up to 20 units, so calm-world shipments (13–20 units) now take 2 wagons where they previously wore 0.01. This is the intended capacity signal, bounded by the same floor; default-danger shipments stay at 12 units / 1 wagon.
- `tests/logistics-wagon-capacity.test.js`: 6 tests cover wagon math (1/12→1, 13/24→2, 25→3), legacy 12-unit wear with wagon audit, 20-unit double wear, volume preservation, floor behavior, and save/load equality. The Slice Z migration detector was retargeted (not weakened): tick-1 roads assert wagon-exact wear from their own commitments (`1 − 0.01 * wagons`, unshipped roads exactly 1) instead of the flat 0.99 bound.
- Mutation check: wear flattened to `0.01` → 2 failures (20-unit wear, migration exactness); restored, zero residue.
- Validation: non-long-horizon 169 suites / 1270 tests green, `long-horizon-5000tick` 3 seeds green (~19.4s, no regression), production build green.
- Remaining logistics boundary: no multi-trip splitting (over-capacity loads travel as one trip with higher wear); no wagon upkeep in merchant/faction currency.

## SLICE AB — patrol coverage → town investigation quality → justice verdicts

- Crime leaves its placeholder state: towns carry plain-JSON `crime: { investigationQuality }` (default 0.4, the legacy fixed value; older saves migrate on tick). A patrol deployed on an incident road ratchets quality upward (+0.05/tick, cap 0.9); uncovered towns hold steady, so patrol-less worlds behave exactly as before (zero baseline drift by construction).
- `JusticeSystem.resolve` consumes the town's own quality (replacing the fixed 0.4) and `JUSTICE_RESOLVED` audits it. Patrolled towns keep higher legitimacy and lower grievance than bare controls under identical attacks, flowing to factions via Slice C and onward to migration pressure.
- `tests/crime-investigation.test.js`: 6 tests cover baseline with migration, upward ratchet with 0.9 cap, legitimacy/grievance split vs control, unrelated-road neutrality, event audit with bare-control contrast, and save/load equality with identical follow-up justice.
- Mutation checks (both gates): consumer fixed to 0.4 → 2/6 fail; evolution `+0.05` → `+0.0` → 3/6 fail; both restored, zero residue.
- Validation: non-long-horizon 168 suites / 1264 tests green, `long-horizon-5000tick` 3 seeds green (~25.0s, no regression), production build green.
- Process note: the new code first referenced the loop-head `town` binding, but a later Slice C `const town` in the same block shadows it into TDZ (`Cannot access 'town' before initialization`, failing all 6); fixed by routing the new reads through `townRef = world.towns.get(townId)`, plus a comment so the next worker does not repeat it. A follow-up edit then ate the adjacent `const corruption = 0.1` line (`corruption is not defined`); restored immediately. Both caught pre-commit by the new detectors.
- Remaining crime boundary: no unreported-crime modeling; ratchet-only by design (no decay without coverage).

## SLICE AA — wildlife predators compete with the bandit for roads

- Wildlife leaves SPECIFIED: `wildlife.js` owns `WildlifeGroup` (`{id,roadId,size,lastMoveTick}`, plain JSON) with `createWildlifeGroup`, `tickWildlifeGroup` (deterministic move toward the busiest merchant road when it leads by more than the threshold, ties hold, no RNG consumed), `wildlifePressureOnRoad` (total size per road), and `wildlifePayoffFactor` (`1 − min(0.8, size/10)`).
- `createClosedWorldScenario` seeds `wolves-1` (road-b, size 3); the reducer migrates legacy saves (absent array means no group, behavior preserved) and ticks groups in step 7.5 before the bandit scores, emitting sparse `WILDLIFE_RELOCATION` (root `FORAGE`) only on actual moves. `tickBandit` multiplies route payoff by the factor (absent groups factor exactly 1, so legacy worlds are untouched).
- Measured: size-10 group on road-b holds a road-a bandit (no relocation) where the empty control relocates; size-3 default dilutes 30% without freezing the cat-and-mouse (full suite green unchanged).
- `tests/wildlife-competition.test.js`: 6 tests cover deterministic tracking, no-traffic hold, crowded suppression with empty control, unrelated-road neutrality, exact factor values (1 / 0.7 / 0.2 cap), and save/load equality with sparse hold.
- Mutation check: payoff `* wildlifeFactor` removed → suppression test fails (crowded bandit relocates); restored, zero residue.
- Validation: non-long-horizon 167 suites / 1258 tests green, `long-horizon-5000tick` 3 seeds green (~20.8s, no regression), production build green.
- Remaining wildlife boundary: fixed size (no reproduction/mortality); no cargo consumption or patrol interaction.

## SLICE Z — road condition → route choice + travel time

- Infrastructure leaves SPECIFIED: routes carry plain-number `condition` (default 1, floored at 0.5). `createClosedWorldScenario` initializes it; the per-tick maintenance pass recovers +0.01 toward 1 (migrating legacy roads without the field); `schedulePendingTradeTrip` applies −0.01 wear per materialized shipment and audits the pre-wear snapshot as `roadCondition` on `TRIP_COMMITMENT`. No new event types — the existing commitment carries the audit.
- Two live consumers plus one shared primitive: merchant route scoring (`distanceCost = distance / (10 * condition)`), shipment travel time (`round(distance / condition)`, worst case 2x), and `routing.routeCost` (`distance * (1/condition − 1)` surcharge, exactly 0 when condition is absent). A degraded short road (5 @ 0.5 → 1.16) loses to a pristine long road (9 @ 1 → 1.06) at equal danger; `routeCost` stays 5 without condition and doubles to 10 at the floor.
- Wagon-capacity上限 was deliberately not built: capping shipment volume would break existing 12-unit shipment contracts. Wear-and-recovery models the same logistics pressure (busy roads degrade and slow down) without changing shipment volume semantics.
- `tests/road-condition.test.js`: 6 tests cover pristine init with legacy migration (1 minus at most one wear step, since maintenance runs before shipment wear on tick 1), wear with pre-wear snapshot, recovery with 0.5 floor, degraded reroute with pristine control, `routeCost` compatibility with floor doubling, and 50-tick boundedness with save/load equality.
- Mutation check: `distanceCost` condition divisor removed → reroute test fails (degraded short road wins again); restored, adjacent trade/pending suites 32/32 green.
- Validation: non-long-horizon 166 suites / 1252 tests green, `long-horizon-5000tick` 3 seeds green (~16.4s, faster than baseline — no regression), production build green.
- Remaining infrastructure boundary: no road upgrade investment or per-segment conditions; wear/recovery 0.01 rates are heuristic.

## SLICE Y — every violated town emits; sentence apportioned, total conserved

- Root cause: `checkLawCompliance` returned the first matching town, so a shared road (road-a incident to north+south) systematically starved later towns — south never emitted, never observed lawfulness, never fed its justice window. `law.js` adds `checkAllLawCompliance` (every match, insertion order); `checkLawCompliance` delegates to it (`[0] ?? null`, behavior unchanged).
- `closed-world.js` adds `apportionedLawShares`: executable towns (observer is a real faction distinct from the violator faction) split the sentence as `townPenalty / executableCount`; self-loops and non-faction violators yield an empty set. Both emission sites (direct + encounter) loop over all violations, each with its share. `observeLawViolation` takes `restitutionShare` (defaults to full penalty) and skips self-loop lawfulness observation (matching the treaty `observeTreatyViolation` rule that never records the violator observing itself).
- Conserved totals: default road-a attack emits north (executable, transfers 0.3, records lawfulness) + south self-loop (audit-only, south justice still sees it). Restitution total stays 0.3, faction budget stays zero-sum (south 1.7 / north 1.3 from 2.0/1.0). Single-scope worlds keep one event with the full sentence.
- `tests/law-apportionment.test.js`: 6 tests cover multi-town emission with legacy-API compatibility, conserved totals, self-loop audit-only (no self-observation/payment), starved-town justice response (south `lawViolationCount > 0`, `lawPenalty` 0.3), single-scope full sentence, and apportioned save/load equality. Three legacy suites were strengthened (not weakened) for the new emission count: violation count 1→2 with conserved total, lawfulness south-null, free-agent dual events, save/load dual events, north-pays-south on flipped bandit faction.
- Mutation check: `checkAllLawCompliance` → `slice(0, 1)` fails 4/11 apportionment+violation detectors; restored, law suites 29/29 green.
- Validation: non-long-horizon 165 suites / 1246 tests green, `long-horizon-5000tick` 3 seeds green (~23.7s, events ~95.3k vs ~93k from dual LAW emission, no behavior change), production build green.
- Deliberately deferred: `tradeFairness`/`honesty` get no consumer this slice — no non-overlapping minimal producer exists (price-deviation contradicts the opportunity bonus; delivery shortfall is already reliability). Inventing one would be decorative state. Next candidates: `logistics`/`wildlife`/`infrastructure` SPECIFIED gaps.

## SLICE X — LAW_VIOLATED penalty → faction resource restitution

- `closed-world.js` `observeLawViolation` now transfers `penalty` resource units (1:1) from the violator faction to the observer faction at violation time: `transferred = min(violator.resources, amount)`, violator floored at 0, observer capped at `maxResources` (same cap semantics as the per-tick refill). `LAW_VIOLATED` audits `restitution: {from,to,amount,transferred,credited,violatorBefore/After,observerBefore/After}` or `null` when honestly skipped (non-faction violator, missing observer, self-loop).
- Zero-sum by construction on the faction budget: single attack (south 2.0, north 1.0, penalty 0.3) lands south 1.7 / north 1.3, total 3.0 unchanged. The per-tick refill (+1, capped) can mask snapshots over multi-tick runs, so detectors assert direct-path immediacy plus tick-path ledger sums rather than capped snapshots.
- `tests/law-restitution.test.js`: 6 tests cover zero-sum transfer, empty-law neutrality, broke-violator floor (0.1 → 0 / +0.1), capped-observer honesty (debit still applies, credit 0), free-agent and self-loop skips, and tick-path audit (every LAW carries `amount: 0.3`, total transferred > 0, save/load `toEqual`).
- Mutation check: `Math.min(violatorBefore, amount)` → `0` fails 4/6 with assertion failures (not crashes); restored from backup, zero `MUTATION-TEST` residue, law suites 23/23 green. (An earlier edit-tool attempt at the same mutation clipped the neighboring `observerCap` line and produced a `ReferenceError`; the block was rebuilt and re-verified — recorded here so the next worker distrusts narrow range edits around that block.)
- Validation: non-long-horizon 164 suites / 1240 tests green, `long-horizon-5000tick` 3 seeds green (~38.6s, same order as ~28.9s baseline; no event-count change), production build green.
- Remaining law boundary after Slice Y: apportionment exists (every town emits, total conserved); `tradeFairness`/`honesty` dimensions remain consumer-less (deliberately deferred, see Slice Y).

## SLICE W — LAW_VIOLATED penalty → justice legitimacy → owning faction

- `justice.js`: `JusticeSystem.resolve` accepts optional `lawPenalty = 0` (backward compatible). Law-confirmed crime erodes legitimacy by `clamp(lawPenalty)*0.15`, applied only when `reportedCrime` is true; grievance is untouched so attack volume is not double-counted (volume already drives grievance via `reportedCrime`). Mean — not sum — carries severity while the event count drives grievance.
- `closed-world.js`: justice step queries `LAW_VIOLATED` in the same 5-tick per-town window as attacks (same-tick violations are observed by next tick's justice, lagging by construction), feeds the per-town mean penalty, audits `{lawPenalty,lawViolationCount}` on `JUSTICE_RESOLVED`, and parents the event to both attack and law events. The owning faction tracks the outcome through the existing Slice C 0.85/0.15 blend; the idle (`!reportedCrime`) recovery path is unchanged, so a hand-forged LAW without any attack cannot erode legitimacy.
- `tests/law-justice-penalty.test.js`: 6 tests cover law-vs-baseline legitimacy gap (>0.05 over 5 fixed attacks: 0.024 vs 0.204), faction tracking (0.556 vs 0.615), penalty monotonicity (0.77 erodes further, justice clamps at 0), event audit with LAW parentage, forged-LAW honesty (idle parity), and `resolve` backward compatibility (`lawPenalty: 0` ≡ default, grievance untouched).
- Mutation check: `* 0.15` → `* 0` fails 4/6 (gap, faction, monotonicity, unit); gate restored, law+justice 23/23 green.
- Validation: non-long-horizon 163 suites / 1234 tests green, `long-horizon-5000tick` 3 seeds green (~28.9s), production build green.
- Remaining law boundary after Slice Y: restitution exists (Slice X, now apportioned), apportionment exists; `tradeFairness`/`honesty` dimensions remain consumer-less (deliberately deferred, see Slice Y).

## SLICE V — LAW_VIOLATED → observer lawfulness → patrol attention

- `closed-world.js` adds internal `observeLawViolation`: each `LAW_VIOLATED` (both direct `resolveBanditAttack` and encounter `BANDIT_ATTACK` consequences) records `recordLawfulnessViolation` for the violated town's `controlledBy` faction against the violator faction (attacking bandit's `factionId` when known, else the raw actor id), with `reason: LAW_VIOLATED:<type>:<town>:<road>` and the law id as `treatyId` audit. The `LAW_VIOLATED` event now carries `{violatorFactionId, observerFactionId, lawfulness:{score,outcome}}` and remains parented to the attack.
- `BANDIT_ATTACK` from `resolveBanditAttack` now carries `factionId` when the attacking bandit has one; the key is omitted for legacy free-agent bandits so stable serialization of old shapes is unchanged. The encounter path needs no `encounters.js` change: the helper resolves the faction from `world.bandits`, and patrol already falls back to the bandit lookup.
- No new consumer was built: the existing Slice S patrol attention path consumes the new records directly (observed low lawfulness → capped detection bonus with `enforcementWhy`). Justice is intentionally untouched to avoid double-counting the same attack (`BANDIT_ATTACK` already drives `reportedCrime`).
- `tests/law-lawfulness-enforcement.test.js`: 6 tests cover observer-scoped recording with trade-reliability isolation, empty-law neutrality, live patrol attention shift at a fixed `rng: 0.45` boundary (observed `detections:1` vs unknown `0`), encounter-path faction identity, save/load enforcement identity (`toEqual` on `LAW_VIOLATED`, identical `effectiveDetectionRate`), and free-agent fallback (violation emitted, no invented faction).
- Mutation check: `if (observerFaction && violatorFactionId)` → `if (false && ...)` makes 3/6 new tests fail (`lawfulnessObserved: true` → `false`, no attention shift); gate restored, 11/11 law suites green.
- Validation: non-long-horizon 162 suites / 1228 tests green, `long-horizon-5000tick` 3 seeds green (~25.9s, no regression vs ~23.8s), production build green.
- Remaining law boundary: `LAW_VIOLATED.penalty` is not yet consumed by `JusticeSystem` (no legitimacy drift or fine collection); `tradeFairness`/`honesty` dimensions remain consumer-less.

EVID-2026-09-02-SLICE-U-LAW-VIOLATION (Lane B, unaccepted)

## SLICE U — town law → BANDIT_ATTACK violation

- `law.js` owns town-level prohibitions as plain JSON: `LAW_TYPES` (banditry/theft/trespass/smuggling), `createLaw`, `ensureTownLaws`, `isActionIllegal`, `checkLawCompliance`. Default `banditry` law (`prohibits:'BANDIT_ATTACK'`, `scope:'town-roads'`, `penalty:0.3`) is materialized per town in `createClosedWorldScenario` and migrated on load/tick for older saves.
- `closed-world.js` checks every `BANDIT_ATTACK` (direct `resolveBanditAttack` and encounter `BANDIT_ATTACK` consequences) against `town.laws` and emits `LAW_VIOLATED` parented to the attack with `{townId,lawId,lawType,prohibits,penalty,roadId,actorId,attackEventId}` (Slice V extends this with `{violatorFactionId,observerFactionId,lawfulness}`). Scope `town-roads` requires incident road, `global` matches any, array/exact string scope also supported; mismatch is honest (no violation).
- `tests/law-violation.test.js`: 5 tests cover direct violation, empty-law neutrality (mutation-sensitive), encounter-path enforcement via `tickClosedWorld({attackRoadId})`, scope-mismatch honesty (road-z vs global), and save/load persistence with custom penalty (0.77) surviving round-trip and deterministic replay.
- Law state is plain JSON (`town.laws` array) and survives `saveWorld`/`loadWorld` via the existing Map serialization; `ensureTownLaws` is called on creation, on tick start, and in `reattachPrototypes` for migration.
- Remaining law boundary after Slice V: `LAW_VIOLATED.penalty` is auditable and lawfulness now drives patrol, but `JusticeSystem` still does not consume the penalty (no legitimacy drift or fine collection).

EVID-2026-09-02-SLICE-T-EVENT-LEDGER-INDEX (Lane B, unaccepted)

## SLICE T — incremental event-ledger index for long-horizon health

- `closed-world.js` maintains a non-enumerable derived index keyed by event type and tick. `appendWorldEvent` indexes new allocator-owned events immediately; `synchronizeEventLedger` catches legacy direct `world.events.push(...)` producers before indexed reads, so the event array remains the sole persistence authority.
- `getWorldEvents` serves exact-tick and bounded-range queries in authoritative ledger order; `findLatestWorldEvent` replaces repeated reverse scans in the reducer, demography, and patrol paths. Full-ledger consumers such as causal auditing remain unchanged.
- `tests/event-ledger-index.test.js` covers typed/range ordering, legacy direct-push synchronization, latest-event lookup, allocator IDs, and save/load exclusion of the derived cache.
- Long-horizon result: `tests/long-horizon-5000tick.test.js` passes across 3 seeds in about 23.8 seconds (mean 1.54 ms/tick, 92.6k to 93.0k events per seed), down from the prior 207.7-second run without changing event counts or final summaries.
- Persistence boundary: the index is deliberately non-enumerable and rebuilt after load/fork. `world.events`, event IDs, parent IDs, and all queues remain serialized authoritative state.
- Remaining performance boundary: `causal-ledger.js` still intentionally builds graph-wide maps for explicit audits; profile that workload separately before introducing an audit-specific cache.

EVID-2026-09-02-SLICE-S-LAWFULNESS-PATROL-ENFORCEMENT (Lane B, unaccepted)

## SLICE S — treaty lawfulness → observer-scoped patrol enforcement

- `reputation.js` owns the bounded `lawfulness` dimension separately from violence memory and trade reliability. `treaty.js` records a violation for each participating faction that observed the breach, including treaty/reason metadata, while legacy hand-authored treaty records are normalized with a `violations` array before mutation.
- `canonical-trade-system.js` consumes only the patrol faction's own lawfulness record. Low observed lawfulness adds a capped detection-attention bonus; missing history and unrelated factions remain neutral. Every `PATROL_INTERCEPTION` and `PATROL_DETECTION_MISS` carries `enforcementWhy` with observer, base/effective rates, score, and bonus.
- `closed-world.js` routes territory passage breaches through the shared compliance path, so live territory and encounter violations update the same treaty history and lawfulness ledger. Save/load preserves the lawfulness state and does not eagerly materialize optional derived systems that were absent at the checkpoint.
- `tests/lawfulness-patrol-enforcement.test.js`: 4 tests cover treaty observation isolation, live detection effect, unrelated-observer neutrality, and deterministic save/load enforcement.
- Focused treaty, patrol, canonical trade, save/load, pending obligations, encounter RNG, and fork regression surface is green (51 tests including the new slice).
- Remaining reputation boundary: `tradeFairness` and `honesty` are declared dimensions but have no live consumer; lawfulness has no retraction/appeal policy for stale or disputed observations.

EVID-2026-09-02-SLICE-R-TRADE-RELIABILITY-REPUTATION (Lane B, unaccepted)

## SLICE R — independent trade reliability → merchant route choice

- `reputation.js` is the production owner for independent reputation dimensions. It keeps trade reliability separate from `escalation.js` violence memory, stores bounded destination-scoped observations, supports observer-trust weighting, and decays scores toward neutral by elapsed tick.
- `canonical-trade-system.js` retains `reputationByDimension` plus reliability weight/half-life identity fields. `chooseMerchantRouteDecision` applies a destination reliability penalty only when an observer has a real record; an unobserved destination remains neutral and receives no penalty.
- `closed-world.js` records the usable fraction of every materialized shipment at `PENDING_CARGO_DELIVERED`, including partial/failed capacity outcomes; the event carries the reputation score/outcome for auditability.
- `tests/trade-reliability-reputation.test.js`: 5 tests cover dimension isolation, observer weighting, live route influence, terminal failure recording, save/load persistence, and deterministic scoring.
- This slice expands reputation from violence-only cross-domain use to independent trade reliability consumed by live merchant decisions. Generic fairness/honesty/lawfulness dimensions remain available but are not yet wired to a consumer.

EVID-2026-09-02-SLICE-Q-REPUTATION-INVASION-TARGET (Lane B, unaccepted)

## SLICE Q — network reputation → live invasion target selection

- `escalation.js`: production `computeReputation(targetId, observers)` now aggregates bounded violence memory across the supplied observer network, including zero-memory observers.
- `closed-world.js`: retaliation target ranking keeps the actor faction's direct memory as the primary signal, then uses network reputation as a deterministic tie-breaker; `FACTION_ACTION_GATE` records the selected score and full ranked target evidence.
- `tests/reputation-aggregate.test.js`: the existing six aggregation checks now exercise the production helper rather than a test-local duplicate.
- `tests/targeted-retaliation.test.js`: live coverage proves reputation selects a tied-memory target and cannot override stronger direct personal memory.
- This slice moves reputation from `CODE_VERIFIED` to `CROSS_DOMAIN_INTEGRATED`; remaining work is additional reputation dimensions and trust/time weighting.

EVID-2026-09-01-SLICE-OP-ELASTIC-TRADE+STANCE-GATE (Lane B, unaccepted)

Test Suites: 156 passed, 159 total in the non-long-horizon regression run
Tests:       1204 passed, 1209 total in that run
Focused O/P + related regression: 6 suites, 27 tests passed
Elastic price drives merchant opportunity; structured stance now gates invasion
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible — 270 rows honest)
lane: B
supervisor admitted: no

Known broader baseline failures (not caused by the final Slice P amendment):
- closed-world-all-systems.test.js: 7/8 pass; the canonical runtime expectation still
  misses BANDIT_ATTACK and JUSTICE_RESOLVED in its first chain assertion.
- fork-independence.test.js: 2/4 pass, fork-api.test.js: 5/6 pass, and
  encounter-rng-persistence.test.js: 1/3 pass; persistent fork/save byte-identity
  remains an existing follow-up outside this gate slice.

## SLICE O+P — elastic price → trade bid curve + stance → invasion routing

### Slice O — elastic price into merchant opportunity (sustained > spike)
- canonical-trade-system.js:192 opportunityBonus now prefers `market.getElasticQuote`
  when available, falling back to `getQuote`. Sustained 0.8 over 5 ticks prices
  0.80 bonus vs brief spike 0.76 (+0.04 gap) proving EMA matters.
- economy.js:87 `getQuote` stays instant 1+shortage*2 for backward compat;
  `getElasticQuote` is history-dependent (blended 0.7 current + 0.3 EMA + momentum).
- Detectors: tests/elastic-price-trade-integration.test.js (2 tests): sustained > brief,
  getQuote not leaked.

### Slice P — structured chooseStance routes into invasion gate (faction → action)
The gate was raw `stance >= WATCHFUL`. Now it also evaluates the structured
`chooseStance({pressure, trust, militaryResources, informationConfidence, perceivedGroupSize, previousIncidentsCount})`
derived from the pair's directed state. When structured decision `to < WATCHFUL`
the gate blocks with `STRUCTURED_STANCE_BLOCKS_RAID`, else allows with
`STRUCTURED_STANCE_AUTHORIZES_ACTION:reason`. Low informationConfidence now
blocks raids even when raw stance meets threshold.
- closed-world.js:2460 structuredDecision built from pair.pressureFrom/trust,
  lastObservedGroupSizeFrom, intrusionCount; gate checks structuredAllows first.
- Detectors: tests/stance-invasion-gate.test.js (4 tests): low confidence blocks
  despite a raw hostile stance, directed trust/pressure blocks a stale hostile peak,
  supported evidence authorizes an invasion, and a non-aggression treaty has priority
  even when the relationship-gate override is disabled.
- The pre-existing directional detector was updated to assert the new structured
  reason and positive authorization contract rather than the superseded raw reason.
- Mutation check: removing `!structuredEvidenceBlocksAction` produced an unauthorized
  invasion in the Slice P detector; the guard was restored and the detector returned
  green.

## SLICE M+N — treaty → territory violation cost + market price elasticity
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible — 270 rows honest)
lane: B
supervisor admitted: no

## SLICE M+N — treaty → territory violation cost + market price elasticity

### Slice M — treaty violation cost (territory pass now debits trust)
The PASSAGE hook was decorative (flag only). Now it routes cost.
- closed-world.js:1190 territory pass now resolves passageTreaty via both
  `treaty.kind` and `terms.kind` (supports legacy test shape `kind:'PASSAGE'` +
  real `terms.kind:'passage'`). On scoped match (`terms.scope === intruderRoad`)
  or scope-free, it calls `pair.recordHarm({severity:0.15/0.10, fromFactionId})`
  debiting observer's trust by 0.015/0.01, emits `TREATY_VIOLATED` with
  `violationCost:true` + `trustDebit` on the INTRUSION context. Scoped
  mismatch → no debit, no violation (honest). Test proves mismatch keeps
  trust at 0.5 vs 0.485 with violation.
- Detectors: tests/treaty-territory-violation.test.js (5 tests): scoped hit
  debits trust + emits violation + violationCost flag, scoped mismatch does
  not debit, scope-free debits on any road, no treaty → no violation.

### Slice N — market price elasticity (history-dependent bid curve)
`getQuote` was instantaneous (1+shortage*2). Now an EMA path exists.
- economy.js:87 `getQuote` stays instantaneous for backward compat.
  New `getElasticQuote(kind)` blends current shortage 0.7 + EMA 0.3 and adds
  momentum 0.5*(shortage−prev). Sustained 0.8 over 5 ticks prices higher than
  a 1-tick spike to 0.8 (blended EMA 0.8 vs 0.24), recovery drops 40%+.
  `_priceMemory` serializes via `Market.serialize` so save/load preserves it.
- Detectors: tests/market-price-elasticity.test.js (5 tests): backward compat,
  sustained > brief, recovery drops, serialize roundtrip, momentum premium.

## SLICE K+L — settlement network + roaming travel with scout (territory + movement)

### Slice K — settlement staking + territory staking (the §531 third-settlement frontier)
A town is now a fundable claim, not a static fixture.
- closed-world.js:3595 settleAttempt(world, group, locationId, {tick, cost, townTemplate}):
  • Requires group AT_LOCATION (IN_TRANSIT → IN_TRANSIT gate), not already a town (ALREADY_EXISTS),
    with knowledge (at location / adjacent via route / belief about location) else NO_KNOWLEDGE.
  • Deducts faction.resources (cost 1) → NO_RESOURCES gate, creates Market + town record
    (controlledBy, homeRadius/claimedRadius/contestedRadius, scarceResources), pushes
    connecting road, emits SETTLEMENT_FOUNDED. New town immediately participates in
    market/demography/territory (tests/settlement-staking.test.js:1 live tick).
- closed-world.js:3695 stakeTerritory(world, townId, {delta, maxRadius, tick}):
  • Increases claimedRadius (3→4→5), deducts 1 resource, emits TERRITORY_STAKED.
    Caps at maxRadius (AT_MAX_RADIUS), gates on NO_RESOURCES/NO_TOWN. The radius is
    authoritative for canObserveTerritory (territory-vertical-slice already proves it).
- Detectors: tests/settlement-staking.test.js (8 tests): NO_KNOWLEDGE gate, belief creates
  town+route+resource debit, ALREADY_EXISTS/IN_TRANSIT, adjacency without belief, NO_RESOURCES,
  live tick with new town, staking inc + resource debit, at-max + no-resources.

### Slice L — roaming travel is real movement, exposure → belief (not teleport)
Bandit roadId was instant before; now it travels and learns.
- roaming.js already had startTravel/advanceTravel (PHASE 11) with IN_TRANSIT
  (currentLocation unchanged until arrival, exposure mints belief via recordObservation).
  Slice L wires it into the live bandit: closed-world.js:3725 advanceRoamingTravel(group, ticks, {exposure, world, tick})
  wraps advanceTravel and emits SCOUT_OBSERVATION for the audit trail. The
  bandit's chooseRoamingDestination live-wire (relocateBanditViaRoaming) already
  synthesizes beliefs from lootExpectation; now travel exposure also grows
  bandit.beliefs via the same observation adapter (shareObservation/recordObservation).
- Mutation: comment out exposure belief, bandit never learns midway → destination choice unchanged.
- Detectors: tests/roaming-travel-exposure.test.js (5 tests): no teleport (road-a→road-b
  5 ticks with 3+2), exposure mints belief+event, scout makes unknown eligible
  (paradise 0→>0 wins), belief persists across ticks, idempotent while IN_TRANSIT.

## R3 — justice recovery drift (institution + faction heal together)
Frozen justiceState while faction healed was a time bomb: next crime pulled
stale-low justice via 0.15 blend, grievance stayed 1. Now both drift.
- closed-world.js:2045 justiceState recovers when !reportedCrime: legitimacy
  0.98→0.9 and grievance 0.98→0.1 lerp, not frozen. Faction already did;
  now they stay in sync (Δ<0.15 after 50 idle ticks).
- tests/justice-recovery.test.js (2 tests): scar then 50 idle ticks both
  recover >0.5 and stay in sync; grievance also drifts down when idle.
- Mutation: revert to frozen, recoveredJustice stays 0.12, test fails (Δ>0.15); restored.

## R3 — info quality + migration calibration (deep round)
Two deferred fidelity items from R2 now closed with detectors.
- beliefs.js:38 BeliefStore aliasing fixed — get returns deep copy, observe stores copy and returns deep copy, mutating returned belief/evidence no longer corrupts store (tests/info-quality.test.js:8).
- closed-world.js:2933 canObserve panopticon removed — town adjacency no longer grants free observation of all incident roads; only selectedRoute === roadId is observable. Merchant at north without route sees nothing, with road-a sees only road-a (tests/info-quality.test.js:33).
- canonical-trade-system.js:289 noisy observation — 0.7 ± 0.1 (rng() *0.2) so actualDanger not injected exactly; WHY shows observedDanger 0.6-0.8, not exact 0.7 (tests/info-quality.test.js:51).
- tests/migration-weight-calibration.test.js (2 tests): weight jitter ±0.05 still chooses east over starving south (stable, not knife-edge), and trust is decisive when shortage/danger/distance equal (east 0.9 vs west 0.1).
- Mutation: revert aliasing to shallow copy, alias test fails; revert canObserve to adjacency, panopticon test fails; set noise to 0, noise test fails (unique size 1); restored.

## SLICE J — patrol resource gating (faction resources → patrol cost → safety → market)
Trade profits fund security, security enables trade — closed loop, not decorative.
- canonical-trade-system.js:103 createPatrol now has factionId, tickPatrol gates on
  faction.resources <=0 → no detection/interception (canonical-trade-system.js:591).
- closed-world.js:289 schedulePendingTradeTrip deducts travelCost from faction
  resources (Math.min cap, Math.max 0) and emits PATROL_ASSIGNMENT_GATED when
  insufficient — trip still ships unescorted, audit trail honest.
- encounters.js:230 patrol toll now capped via Math.min(cap, resources+toll) so
  ALWAYS(resources ≤ max) holds; long-horizon-invariant-health caught uncapped 2→3.
- Detectors: tests/patrol-resource-gating.test.js (4 tests):
  1) patrol 0 resources cannot detect (gated) vs 2 resources can intercept
  2) scheduling trip with patrol deducts 1 and gates when empty (PATROL_ASSIGNMENT_GATED)
  3) toll restores but respects cap (0→2 ≤ max 2)
  4) tickClosedWorld interception gated via refill-aware 0/max 0 → 0 interceptions
- Mutation: remove resource gate, 0-resource test fails (still intercepts); restored.

## SLICE I — season→trade integration (ecology→market→trade closed loop)
Season already drove production, but trade loop was not proven end-to-end.
- tests/season-trade-integration.test.js (2 tests):
  1) winter shortage 1.0 price 3.0 vs summer 0 price 1.0, merchant at south choosing north vs east: winter opportunityBonus 1.0 vs 0 flips road-c vs road-east, WHY shows opportunityBonus diff
  2) winter+drought price >= winter alone (drought cannot lower winter price)
- Wiring was already via drought/season multiplier → marketFlows.produced → shortage → price → opportunityBonus (canonical-trade-system.js:176). No new production code — integration proof that existing wiring composes.
- Mutation: set opportunityBonus to 0, winter still prefers road-c test fails (ranked diff 0); restored.

## SLICE H — long-horizon invariant health (temporal contracts)
500 ticks is not a smoke test. Now it has temporal teeth.
- tests/long-horizon-invariant-health.test.js (5 tests):
  ALWAYS faction.resources ∈ [0, maxResources] caught an uncapped patrol toll
    (encounters.js:230 guardFaction.resources + toll without cap → north 2→3 > max 2 at tick 1).
    Fixed: Math.min(cap, resources + toll) with cap = maxResources.
  ALWAYS market mass-balance per tick holds (reuses §155 strict invariant over 30 ticks)
  ALWAYS event parentEventIds refer to earlier events or declared roots (100 ticks, checks future parents and missing parents)
  SUSTAIN drought recovery: 20-tick drought then 30-tick recovery, final supply > drought low and stays above
  EVENTUALLY every materialized TRIP_COMMITMENT reaches PENDING_CARGO_DELIVERED or stays IN_TRANSIT within 50 ticks (deferred commitments excluded)
- Fix: tests/encounter-apply-functions.test.js guard resources set to 0/max 5 so toll can increase within cap (was 2/2, would fail with cap fix).
- Mutation: remove cap on toll, ALWAYS test fails at tick 1 (3 > 2); remove deferred filter, EVENTUALLY fails on deferred commitments; restored.

## SLICE G — evidence linter gate fix (W1-EVIDENCE-TRUST-ROOT)
Vacuous green was worse than honest red. Now honest red.
- evidence/lint.mjs:18 DEFAULT_ROOT was hardcoded `C:/tools/...` which under WSL resolves to `/mnt/c/C:/...` and reads 0 rows → exit 0 vacuously. Fixed to `resolve(dirname(fileURLToPath(import.meta.url)), '..')` so root is the inner package where docs/evidence lives (evidence/lint.mjs:18). Now finds 270 rows, not 0.
- evidence/lint.mjs:174 hasInadmissible now excludes SUPERSESSION (`freshness !== 'ADMISSIBLE' && freshness !== 'SUPERSESSION' && dimension !== 'EVIDENCE_SUPERSESSION'`). Before, a ledger with 1 ADMISSIBLE + 1 SUPERSESSION exited 1 incorrectly. Now synthetic ADMISSIBLE+SUPERSESSION exits 0, STALE still exits 1. Mutation: revert each predicate, synthetic test fails → restored.
- Verified: `node ./evidence/lint.mjs` now reports 270 rows in  ~30s (was 0 in ~0.1s) and exits 1; `node ./evidence/lint.mjs --help` still fast; `evidence-linter.test.js` 15/15 green.

## SLICE F — merchant WHY inspector (route B vs A)
WHY that just said "chosen route" was decorative. Now it names the belief that mattered.
- canonical-trade-system.js:138 ranked now carries distanceCost, dangerPenalty, familiarityBonus, opportunityBonus, cargoLossRisk, perceivedDanger, confidence per route. TickMerchant captures WHY: observations (bandit road observations with rng draws), beliefSnapshotBefore/After, ranked with breakdown, threshold {switchingCost, ticksSinceSwitch, inertiaApplied}, chosenRoute/Score (canonical-trade-system.js:270, 352).
- MERCHANT_ROUTE_DECISION event now has `why` with observations, beliefSnapshot, ranked, threshold, rngDraws, rejected (closed-world.js via tickMerchant). Toggling one belief flips choice and WHY shows which belief (score breakdown diff).
- Detectors: tests/merchant-why-inspector.test.js (4 tests):
  1) toggle road-a 0.8→0.1 + road-b 0.1→0.8 flips road-b→road-a and WHY shows dangerPenalty diff
  2) WHY contains ranked breakdown, observations, beliefSnapshot, threshold, rngDraws
  3) inertia threshold captured (switchingCost 10, 1 tick ago → stays on road-b, WHY inertiaApplied true; cost 0 → flips)
  4) tickClosedWorld ledger populates WHY
- Mutation: set ranked dangerPenalty to 0 → toggle test fails (ranked diff 0); restored.

## SLICE E — encounter RNG persistence (W1-CONTINUITY-RNG)
W1-CONTINUITY-RNG CONFIRMED_CURRENT at re-anchor (4 production sites
closed-world.js:1271/2337/2434/2438) was a closure outside serializable
world — saveWorld dropped it, true restart diverged. Now persisted.
- world.rngStreams.encounter { algorithm:'xorshift32', state, draws } plain
  JSON, initialized in ensurePendingWorldState and createClosedWorldScenario
  (closed-world.js:40, 49, 607). nextEncounterRandom / makeEncounterRng
  (closed-world.js:197) replace tick-seeded deterministicRng at all 4 sites:
  tickCanonicalMerchant, encounter selection, tickBandit, tickPatrol.
  Custom encounterRng still overrides for tests but persistence is via the
  stream when null — real restart no longer needs the closure.
- Detectors: tests/encounter-rng-persistence.test.js (3 tests):
  1) 5-tick checkpoint → 10-tick resume WITHOUT custom rng is byte-identical
     (saveWorld equality, RNG state/draws equal)
  2) custom RNG still works but does not corrupt persistent stream
  3) drought + encounter stream both survive save/load
- Mutation: remove rngStreams.encounter init, resumed.rngStreams.encounter undefined → test fails; restored.
- Filed: statistical-validation-trade-loop still reuses closure for both twins
  (fake restart) — now documented, not blocking; real two-branch test above
  is the honest one.

## SLICE D — drought → production → shortage → migration cascade
Ecology now drives migration via a real stock change, not a flag.
- world.drought { active, severity, kind, townId, remainingTicks, startEventId } transient ecology modifier on food production for a single town. Severity [0,1] → production multiplier max(0.1, 1 - severity*0.6) clamped so 0.6 severity = 0.64x, 1.0 = 0.4x. Applied in step-4 market loop after season modifier (closed-world.js:1776). Plain JSON: save/load/fork safe.
- Tick lifecycle: decrements remainingTicks each tick in step 0.1, emits DROUGHT_ENDED parented to DROUGHT_STARTED when reaching 0 (closed-world.js:819).
- Detectors: tests/drought-shortage-migration.test.js (4 tests):
  1) drought produces 0.64x vs control and shortage 0→1 while non-drought town unaffected
  2) drought shortage drives demography emigration 414→496 over 30 ticks (north pop 100, south 100)
  3) mass conservation holds (no NaN, no negative, market mass-balance invariant still green)
  4) DROUGHT_STARTED → DROUGHT_ENDED parent chain correct
- Mutation: set drought multiplier to 1, ratio goes 0.64→1.00, shortage test fails — restored.
- Wiring: drought → perCapitaProduction → marketFlows.produced → shortage/price → demography emigration (POPULATION_CHANGE) and faction supplyShortage. One stock change consumed by a decision, per §11 Slice D.

EVID-2026-08-31-R2-W1-CAUSAL-DAG-AUTHORITY (V8 Supercampaign R2, Wave 1 lane C)

Test Suites: 145 passed, 145 total (was 144)
Tests:       1156 passed, 1156 total (+9)
1000-tick ledger probe: 15,814 events — ids UNIQUE and allocator-shaped
  (WORLD-EVENT-*), zero unknown parents, zero future parents, maxPendingTrips=1,
  no NaN (mass identity enforced by in-suite loss-sink tests, unchanged)
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## LANE C RESULT — one event-ID authority + protected parentage + causal linter
RESP-EVENT-ID-AUTHORITY-001. Re-anchored on 194f022 (clean tree): all claims
CONFIRMED_CURRENT — 4 template-ID emitters (canonical-trade-system.js
MERCHANT_ROUTE_DECISION/BANDIT_RELOCATION/PATROL_INTERCEPTION/PATROL_DETECTION_MISS,
two-roads-world.js benchmark MERCHANT_ROUTE_DECISION filed as benchmark scope),
~19 bare world.events.push sites in the reducer path, and the
MIGRATION_PRESSURE_EVALUATED orphan on stable-justice ticks.

Production changes:
- appendWorldEvent now the ONLY emission path for protected events in the
  canonical world: resolveBanditAttack, encounter-engine BANDIT_ATTACK,
  ROUTE_SELECTED/ROUTE_CHANGED (parented to the canonical
  MERCHANT_ROUTE_DECISION of the tick via decisionEventIds capture;
  legacy-only merchants declare rootReason LEGACY_AUDIT_TRAIL),
  CONVOY_FORMED (parent = TRIP_COMMITMENT) / CONVOY_DISBANDED,
  FACTION_REASSESSMENT, STANCE_TRANSITION, INTRUSION, BANDIT_RELOCATION,
  MARKET_TICK, REPORT_FILED.
- tickMerchant/tickBandit/tickPatrol emit through appendWorldEvent
  (allocator ids); PATROL_* events parent to the BANDIT_ATTACK they react
  to (rootReason PATROL_SWEEP when the attack id is not yet allocator-issued).
- MERCHANT_ROUTE_DECISION parents: this tick's BELIEF_UPDATE events, falling
  back to the merchant's most recent belief event (stale belief = legitimate
  causal parent), or explicit rootReason DECISION_FROM_BELIEFS.
- MIGRATION_PRESSURE_EVALUATED on stable-justice ticks now parents to the
  town's recent BANDIT_ATTACK events (the real causal inputs) instead of
  silent []; rootReason WORLD_CONDITIONS only when no attack exists.

New read-only causal-ledger.js linter (no deps, never mutates):
- EVENT-ID-001: duplicate ids, missing ids, template ids on protected types
- EVENT-PARENT-001: chain-connector types REQUIRE a parent; derivative types
  require parent OR explicit rootReason (the silent-[] orphan class)
- EVENT-PARENT-ORDER-001: future parents
- CHAIN-MERCHANT-001: decision->commitment->exposure->consequence in the
  parent/child graph (EVENTUALLY semantics: a consequence existing anywhere
  without any exposure->consequence path is a broken wire)
- CHAIN-MIGRATION-001: migration->decision->pressure evaluation

Detectors: tests/w1-causal-ledger.test.js (9 tests) — clean-lint smoke on
plain AND attack-driven worlds (which also prove real ENCOUNTER + MIGRATION
events), and mutations KILLED: MUT-EVENT-TEMPLATE-001 (TEMPLATE_EVENT_ID),
MUT-EVENT-DUP-001 (DUP_EVENT_ID), MUT-EVENT-UNKNOWN-PARENT-001
(UNKNOWN_PARENT), MUT-EVENT-FUTURE-PARENT-001 (FUTURE_PARENT),
MUT-EVENT-ORPHAN-001 (MISSING_PARENT), MUT-CHAIN-MERCHANT-001
(CHAIN_MERCHANT_DECISION), MUT-CHAIN-MIGRATION-001 (CHAIN_MIGRATION +
MISSING_PARENT).

Filed (benchmark scope): two-roads-world.js:365 MERCHANT_ROUTE_DECISION
still template-id (its own arena, exempt from closed-world linter).

EVID-2026-08-31-R2-W1-PARTIAL-OBSERVABILITY (V8 Subagent Supercampaign R2, Wave 1 lane B)

Test Suites: 144 passed, 144 total (superseded by 145/1156 above)
Tests:       1147 passed, 1147 total (+4)
1000-tick direct probe (organic default world): worst mass drift 3.55e-11,
  maxPendingTrips=1, no NaN / negative population; 932 food organically stolen
  and booked through the loss sink over the run (world alive under the fixes)
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## LANE B RESULT — hidden-truth reads killed (OBS-HIDDEN-001 / OBS-LOCALITY-001)
Re-anchored all §3.2 claims on the current tree (3e93a1f, clean). Three live
truth-reads CONFIRMED and closed; two fidelity items deferred (not truth reads):
1. closed-world.js (legacy route pass): missing belief fell back to
   `world.bandits.some(...) ? route.actualDanger : route.actualDanger*0.1` —
   hidden truth injected into merchant perception. Now NEUTRAL PRIOR 0.5.
2. Faction step: confirmedLoss / memoryOfLoss / per-target memory / pair harm
   counted ALL world attacks for EVERY faction (north learned south-only hits).
   Now scoped to attacks on roads incident to the faction's home town (helper
   `incidentRoadsByTown`); factions without a town keep the world aggregate;
   pair material signal scoped to the pair's towns. Canonical two-town world
   is unchanged (every road touches both towns) — zero behavior delta there.
3. Migration destination safety read live `world.bandits.some(...)` (binary
   0.7/0.2). Now derived from the origin town's merchants' routeBeliefs
   (legal observation/rumor surface; neutral prior 0.3 with no knowledge).
DEFERRED (fidelity, not omniscience — filed): exact actualDanger written into
legal OBSERVATION values without noise (closed-world.js belief wiring), and
the canObserve town-adjacency panopticon (closed-world.js canObserve). Both
are legal-observation quality issues; R2.1 accepts legal observation paths.

Detectors (tests/w1-observability-twin.test.js, 4 tests, hidden-vs-visible
twin worlds, identical RNG):
- OBS-HIDDEN route twin: bandit on road-a vs road-c → identical ROUTE_SELECTED
  (neutral-prior outcome road-a) + no belief minted from truth
- OBS-LOCALITY twin: road-a attack leaves the separate east faction untouched
  (memory 0 / grief 0 / no per-target entry) while road-ne attack reaches it;
  canonical two-town guard: both canonical factions still feel road-a
- OBS-HIDDEN migration twin: bandit present vs absent → identical safety-score
  vectors, pinned to the belief surface (south 0.2 / east 0.9)
Mutations KILLED (restored after each):
- MUT-OBS-FALLBACK-001 (restore truth fallback) → twin route ranking diverges
  road-a vs road-b
- MUT-OBS-LOCALITY-001 (global scope) → east faction absorbs road-a attack,
  memory 0.1 vs expected 0
- MUT-OBS-MIGRATION-001 (restore bandit truth) → twin safety arrays differ
Oracle update (truth-honest): migration-destination-utility 'safety avoids
bandit road' asserted omniscience (world with NO knowledge channel still
avoided a bandit it could not know about). The traveler now cannot; the test
seeds the north town's legal belief surface instead — same intent, legal path.

EVID-2026-08-31-R2-W1-MATERIAL-LOSS-SINK (V8 Subagent Supercampaign R2, Wave 1 lane A remainder)

Test Suites: 143 passed, 143 total (superseded by 144/1147 above)
Tests:       1143 passed, 1143 total
time (parallel, excl. long-horizon-5000tick): 27.6s
2000-tick direct probe (season cadence 700): mass residual 0.000000 across all ticks,
  maxPendingTrips=1, no NaN / negative inventory / negative population — loss ledger 1709
  food vs restock ledger 4220 food (auditable destruction vs declared injection)
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## R2 CAMPAIGN STATE (manager-owned; V8 Subagent Supercampaign R2)
Wave 0 re-anchor against master 566c343 (clean tree) — the R2 doc's §2 "reported
reality" (99e439a / 141 suites) was stale by two commits; claims re-anchored to
current symbols. Wave 1 lane classification:
- W1-MATERIAL-TRADE-CLOSURE: PARTIAL at re-anchor. Booking/delivery/trip sides
  CONFIRMED_DONE (schedulePendingTradeTrip caller closed-world.js:1334,
  deliveredThisTick bridge, cargoKind:'food' default, prune). LOSS SIDE was open:
  theft/toll/settling/restock were unbooked mass creation/destruction. CLOSED this
  lane (below). Remaining: trip LOST/CANCELLED terminal states only declarative.
- W1-PARTIAL-OBSERVABILITY: CONFIRMED_CURRENT at re-anchor (5 leaks + BeliefStore
  aliasing + bandit-all-merchants read). EXECUTED this lane (see LANE B RESULT
  above): 3 of the 5 leaks closed with twin-world detectors + triplet of killed
  mutations; remaining fidelity items (observation noise, canObserve breadth,
  BeliefStore reference aliasing, bandit-all-merchants topology read) filed for
  a later information-quality slice.
- W1-CAUSAL-DAG-AUTHORITY: CONFIRMED_CURRENT — ~25+ bare world.events.push sites
  (canonical-trade-system.js:375/521/581/592/604, closed-world.js:601/644/653/669/
  684/698/702/726/883/970/1059/1100/1423/1430/1460/1474/1539/1561/1718/2077,
  ecology.js:127, encounters.js:278/328, treaty.js:95/130/158/226, two-roads-world.js:
  588/630) + template eventIds (MERCHANT_ROUTE_DECISION-${tick}-${id}, BANDIT_RELOCATION-
  ${tick}-, PATROL_INTERCEPTION-${tick}-). Inventory done; execution pending.
- W1-CONTINUITY-RNG: CONFIRMED_CURRENT — encounterRng closure used at 4 production
  sites (closed-world.js:1271/2337/2434/2438), outside the serializable world;
  statistical-validation-trade-loop reuses the same closure after "load" (fake
  restart). Fix: persist rngStreams.encounter.{state,draws} or deprecate param.
- W1-EVIDENCE-TRUST-ROOT: CONFIRMED_CURRENT — lint.mjs DEFAULT_ROOT C:/ resolution,
  SUPERSESSION miscounted as inadmissible, EVIDENCE_LEDGER stale vs 566c343.
  Bounded lane; not started (world lanes get priority per campaign §23).

## What this tree now contains (Lane B, unaccepted)
- R2-W1 MATERIAL LOSS SINK + GLOBAL MASS IDENTITY (this lane):
  - world.transitLoss / world.exogenousInflow persistent ledgers (JSON-safe,
    save/load/fork covered; initialized in ensurePendingWorldState)
  - theft books at ALL debit sites: resolveBanditAttack, encounter bandit-ambush,
    convoy ambush (mutation branch), broken-caravan settling cost,
    patrol-checkpoint toll
  - patrol interception REVERSES the booking (cargo recovered, not destroyed)
  - MERCHANT_RESPAWN booked as declared exogenous inflow (was +20 from nowhere)
  - delivery overflow bookable into marketFlows as deliveryOverflow term
  - REAL BUG FIX: convoy ambush redistributed merchant cargo from a STALE
    formation-time snapshot (merchants ship/raid/restock every tick), fabricating
    or destroying whole cargo units; now syncs convoy.cargo to actual carried
    material before resolving the ambush. Global mass drifted ±1..3 units on
    ambush ticks before; 2000-tick residual is 0.000000 after.
  - detectors: tests/w1-material-loss-sink.test.js (4 tests) — theft booking,
    interception reversal, 40-tick production identity, exact-once terminal
  - mutations KILLED: MUT-MARKET-THEFT-001 (unbook resolveBanditAttack → 2 red),
    MUT-MARKET-THEFT-002 (unbook encounter path → 40-tick identity red),
    MUT-MARKET-EXACTONCE-001 (open consequence/trip closure → 2 red, incl. the
    production identity). All restored.
- parentEventIds chain on merchant path (MUT-CHAIN-001 detector)

## What this tree now contains (Lane B, unaccepted)
- parentEventIds chain on merchant path (MUT-CHAIN-001 detector)
- directional stance action gate (MUT-DIR-001)
- network reputation target tie-break in the live invasion selector (Slice Q)
- migration evaluation/decision/migration chain with FIRE iff MIGRATION (fixed: FIRE only when person can leave for real town, NO_POPULATION/NO_DESTINATION otherwise, per-town reportedCrime, no toTownId null, utility-driven destination)
- bandit recency elapsed-tick decay
- save/load pending obligations
- evidence staleness detector + Jest ledger write guard
- supersession rows for test-pollution history
- demography causal parentage honest (previous POP + recent FIRE decision, not same-tick impossible chain)
- migration fixtures keep sink town and inject via appendWorldEvent, conservation asserted, incidence at saturation ceiling
- production-default suite sharpened (named fear axis, no >=0)
- market material loop: deliverCargo→stock→price, BANDIT loss→price delta, conservation, opportunityBonus uses quote (Slice A)
- migration destination utility: food (shortage), safety (bandit), distance, faction trust (Slice B) — not lowestPop; WHY filled
- justice → faction legitimacy: JUSTICE_RESOLVED lowers owning faction legitimacy (0.85*old+0.15*justice), recovers 0.02/tick when no crime, legitimacy dampens raidScore 0.15*(1-legitimacy) (Slice C)

## Still false / still open
- 0/10 frozen core mutation kills
- evidence ledger stale (0 admissible, linter exit 1)
- market loop: Slice A done; pending-trip → market delivery WIRED via trip; drought cascade WIRED (Slice D)
- FearCore vs Brain dual-ownership parked
- runtime is DOM shim
- Lane A not operational
- historical relationshipGate:false isolations still in place
- build rollup native missing in WSL

## What was done 2026-08-31 Slice A+B+C (Lane B, unaccepted)
- Slice A (market): 8 tests market-material-loop — deliverCargo→price, BANDIT loss→price, conservation, opportunityBonus fallback to town.market (was decorative)
- Slice B (migration): 4 tests migration-destination-utility — utility beats lowestPop, bandit safety, 200-tick conservation (FIRE==MIG), WHY with utilities
  - Fix: closed-world.js destination utility `0.4*(1-shortage)+0.3*(1-danger)+0.2*(1/(1+dist/10))+0.1*trust`
- Slice C (justice): 3 tests justice-faction-legitimacy — JUSTICE_RESOLVED→owning faction legitimacy (blend 0.85/0.15, recover 0.02), legitimacy dampens raidScore `0.15*(1-legitimacy)`; production path crime→justice→faction differs, not unit-only
  - Fix: factioncore.js legitimacy field (default 0.9) + closed-world.js justice loop updates owning faction
- Slice A follow-up (pending-trip market loop): 3 tests pending-trip-market-conservation — schedule→TRIP_ARRIVAL→deliverCargo lands stock, price drops, §155 flows.delivered booked into marketFlows + MARKET_TICK; per-tick mass-balance holds with the +delivered term; a raid that strips merchant cargo blocks shipping so no delivery lands
  - Fix: closed-world.js canonical merchant wiring now calls schedulePendingTradeTrip (was decorative TRIP_COMMITMENT event only — cargo never traveled); world.deliveredThisTick bridges advancePendingWorldObligations → step-4 market loop tickFlow.delivered; default merchant gets cargoKind:'food' so opportunityBonus fires in production; delivered trips pruned from pendingTrips (was unbounded growth ~72/500 ticks → now 1)
  - Fix: mass-balance identity now `(produced-overflow) + delivered - consumed - spoiled` (was missing +delivered and violated by exactly the delivered amount on delivery ticks)
  - Production nuance: shipment volume scales with merchant's believed route danger and world perceivedDanger (dangerous worlds ship less), so §138 differentiation flows through delivered supply — updates to sensitivity-500tick (deliveredTotal axis) and scenario-differentiation-long-horizon (memoryOfLoss axis) are STRENGTHENINGS per audit law, tracked with the axes they measure

## Next 5
1. Wire trade fairness/lawfulness reputation into treaty or patrol decisions
2. Add observer-specific confidence calibration and outlier handling
3. Real pending-state fork + MUT-SAVE-001 held under two-branch identity
4. Ecology/season material loop full integration (drought done; next: season→trade→migration multi-season)
5. Evidence linter gate fix (SUPERSESSION + WSL DEFAULT_ROOT) — bounded, not another framework

Do not start another evidence-framework slice unless a P0 ledger write bug reappears.

## Repair notes 2026-08-31
- Probe before repair: FIRE 16, MIGRATION 1, FIRE without MIG 15, toTownId null, pop 0. After repair: one-town FIRE 0 MIG 0 pop 1; two-town FIRE 6 MIG 6 conserved, FIRE==MIG, all MIG have destination.
- Demography: previousPopChange chain fixed for immigration audit duplicate; immigration now parents to dest previous POP + recent FIRE decision (not same-tick impossible)
- Production-default: removed >=0 and OR-of-five, now asserts nervous fear > calm fear
- Tests patched for WSL path (brain-fearcore-authority, quarantine)
- Mutation: forced FIRE before population/destination guards; migration-pressure-contracts decision integrity test fails as expected; reverted.

## Verification 2026-08-31 Slice A follow-up (pending-trip market loop)
```
Test Suites: 142 passed, 142 total
Tests:       1139 passed, 1139 total
Time:        25.16s (parallel, all suites)
Focused pending-trip-market-conservation: 3 passed, 3 total
500-tick probe: 1.80 ms/tick; maxPendingTrips 72 -> 1 after prune fix; 71 deliveries; no NaN.
5000-tick direct probe (1 seed): crashed=false nan=false negInv=false pop=2 events=87132
  maxPending=1, 155s/seed (the 3-seed Jest suite is the known >600s WSL outlier).
```
FOCUSED_GREEN / FULL_GREEN (142/142)
DEVELOPMENT_VERIFIED_CURRENT_TREE
SUPERVISOR_ADMITTED = no
KNOWN_GAPS_PRESENT = yes
Mutation (kill): disabled the deliveredThisTick→tickFlow merge; pending-trip-market-conservation
+ market-mass-balance-invariant 4 tests go red (mass balance violates by exactly the delivered
amount); restored. Proves the booking fix is real, not decorative.

## Independent verification 2026-08-31 (post-audit)
An independent audit directive (FEAR-AI-TRUTH-CORRECTION) was issued against a
pre-repair tree state (HEAD 050d3db, branch co-author-removal, dirty worktree,
FIRE-without-MIGRATION, demography-causal-parentage red). Reproduction against
the CURRENT tree (HEAD 99e439a, master, clean except this doc) shows the audit's
P0-1/P0-2/P1-1/P1-3/P1-4 findings are already resolved by commits e85650d +
Slice A/B/C:
- Full Jest: 141 suites / 1136 tests GREEN (audit claimed FAIL — was true on pre-repair tree).
- One-town probe (audit §3.3): FIRE 0, MIGRATION 0, SUPPRESSED 25, population stays 1,
  0 null destinations. Audit's "FIRE 16 / MIG 1 / pop 0 / 15 FIRE-without-MIG / null dest"
  is no longer reproducible — fixed by e85650d.
- Two-town probe: initial 10 / final 10 (delta 0), FIRE 6 == MIGRATION 6, 0 null dest.
- demography-causal-parentage.test.js: 3/3 PASS (audit claimed red — fixed by e85650d).
- reportedCrime is per-town via recentAttacksByTown (roadId incident to townId), not global.
- migration-pressure-contracts incidence oracle asserts near-ceiling
  (highMigs >= eligibleOpportunities-1 AND <= eligibleOpportunities), not merely > 0.
- production-default test uses named-axis direction (nervous.factionFear > calm.factionFear),
  no vacuous >= 0.

One genuinely-open audit P0 was found and fixed this pass:
- P0-4 TEST_CHANGES self-approval: all 15 rows had reviewer="agent" reviewStatus="APPROVED"
  (implementer self-approving its own test changes). Downgraded to reviewStatus="PROPOSED"
  (implementer-asserted, supervisor admission still pending). Rows remain append-only.

lint:evidence: exit 1, 0 admissible, 267 stale, 0 errors — fingerprints stale against
HEAD movement; rebuild is a later evidence slice, not a code bug. Honest, not fixed here.
