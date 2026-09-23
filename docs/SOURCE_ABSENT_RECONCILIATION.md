# SOURCE_ABSENT reconciliation — manifest and dispositions

Contract: **RESP-SOURCE-ABSENT-RECONCILIATION-001** (2026-09-23).

Every completion-ledger row marked `SOURCE_ABSENT` cites files that are absent **from this
checkout**. The monorepo's untouched `master` branch carries the legacy JS tree under
`fear-ai-sim/`, so each citation was verified against `origin/master:fear-ai-sim/` and either
located (blob + sha256 pinned below) or confirmed absent in both trees. Rows stay
`SOURCE_ABSENT` — that is their *dispositioned* final form under the evidence rule:
locating a legacy file does not put it into the V8 design, and extracting one is a separate,
explicit decision (procedure at the bottom). **Re-opens executed 2026-09-23:** `Habituation`
and then `Hysteresis` left `SOURCE_ABSENT` through that procedure (byte-exact extraction +
V8 integration); the manifest below covers the remaining five rows' sources.

Method (head of `origin/master` at time of verification: `1e72d61`):

```sh
git rev-parse origin/master:fear-ai-sim/<file>          # blob id
git cat-file blob <blob-id> | sha256sum                 # content digest
git ls-tree -r origin/master --name-only | grep -i fearband   # 0 matches
```

## Manifest

| file | upstream blob | sha256 | presence | rows |
| --- | --- | --- | --- | --- |
| simulation.js | 2cc0c2dc991362fece0afea05150bcd988fe4cb2 | 3b91c4dc778efea806ed47e704e02c2ecc65ab016819d4cb08d608108bd90ef5 | PRESENT | Simulation/agents/combat |
| agent.js | f3815a84736b04afc592ee3fd8652464e898b148 | 5e208a01a8840af4976c7c3db2f48106a861115c049bc472b143a13e779d847c | PRESENT | Simulation/agents/combat |
| learningagent.js | 562faea5106f6cff3ccdc9cecb7b3dd7a0d2a7c6 | f06f44f3090879c41789300d98579515abd936f9933fd61d7b70bfa0e4915eb7 | PRESENT | Simulation/agents/combat |
| fearcore.js | 185494c831a6688a70aa4d143e18757a7cceb7eb | d5a94c963de945f054918004ecf0493789b1bccdac35879a040b6b65c10496ab | PRESENT | FearCore live transitions |
| brain.js | 163dfa7a184fda3e831b19ab7fa8cb65f02b3b1e | b35aa3952b2650492a2b9f4d025a7132c23c09a62a42835a3ed0b6fe1006d3d6 | PRESENT | FearCore live transitions,Brain scale cleanup |
| vrsystem.js | ac84c092aa94b5a32ed1bd2511974c7856e5f375 | d2a9c628874785178fe16b776dbd94fc2344ec29871151773de94bf7a8b4f4cd | PRESENT | VR/biofeedback |
| biofeedback.js | 050b8c4c8f72fe0c2d21919f73ab92e45c3fc4f4 | f39f795564d83a0039fb4b7b7fe1429daf5fa167ef5ce4ea066a9dafb63ab23a | PRESENT | VR/biofeedback |
| neuralfear.js | b521978dcb05a29569bd51a905143f2e61c7e0be | 9b397180b7aad56f29c0a2c7197d832229b5b9f16f23e1644be6086ed2e4504c | PRESENT | Neural fear |
| neuralnet.js | 3d320bb2f8fd6d23dd16c78bf785804cd418dc41 | 9218cbde832e30093cce32ac29246eab8acb8f15b48fb04249d25b511d924a63 | PRESENT | Neural fear |
| tests/fearcore.test.js | ABSENT | ABSENT | ABSENT_BOTH | FearCore live transitions |

- `upstream blob` = `git rev-parse origin/master:fear-ai-sim/<file>`; `sha256` = digest of
  `git cat-file blob <blob>`. Both are re-verified by `tests/source-absent-reconciliation.test.js`
  on every gate run (the CI workflow fetches with `fetch-depth: 0` so `origin/master` is present).
- `ABSENT_BOTH` = the path exists in neither tree (the legacy fearcore test was never committed).
- **FearBand (Rust)**: `git ls-tree -r origin/master --name-only` has 0 paths matching
  `fearband|fear_band|fear-band` — absent workspace-wide *and* upstream.
- **Nothing in this manifest has been extracted into this checkout** — the guard asserts every
  manifest file still does not exist locally.

## Dispositions (per ledger row)

| row | disposition |
| --- | --- |
| Simulation/agents/combat | **SUPERSEDED_BY_V8_DESIGN** — all three files located upstream; the V8 society world's actors (societycore + DecisionCore) are the agent runtime. Re-open = implement-and-test pass, never a file landing. |
| FearCore live transitions | **OPEN_BY_ABSENCE + superseded primitive** — `fearcore.js`/`brain.js` blob-pinned upstream; the test exists in *neither* tree; V8 live fear is only `Personality.fearSensitivity()`. FearBand Rust has no source anywhere. |
| Brain scale cleanup | **SUPERSEDED_BY_DESIGN** — `brain.js` located upstream; V8 has no brain module to scale (deletes-by-design), so the cleanup claim is retracted rather than pending. |
| Habituation | **EXTRACTED_AND_REOPENED 2026-09-23** — first re-open: source extracted byte-exact to `legacy/habituation.js` (sha256 `df02134b…` verified every gate by `tests/habituation-reopen.test.js`), V8 integration `HabituationBook` + canonical `FEAR_HABITUATED` events; row is `IMPLEMENTED_AND_VERIFIED`. |
| Hysteresis | **EXTRACTED_AND_REOPENED 2026-09-23** — second re-open: source extracted byte-exact to `legacy/hysteresis.js` (sha256 `40e5cb26…` verified every gate by `tests/hysteresis-reopen.test.js`), V8 integration `HysteresisBook` (asymmetric thresholds, minimum-duration gate, seeded FREEZE roll, world-time records) + canonical `FEAR_STATE_TRANSITION` events; row is `IMPLEMENTED_AND_VERIFIED`. |
| VR/biofeedback | **DEFERRED_PRODUCT_SCOPE** — both located upstream; V8 scope excludes them; a product-scope decision reopens the row. |
| Neural fear | **OPEN_BY_ABSENCE (evidence corrected)** — `neuralfear.js`/`neuralnet.js` *do* exist upstream (the checkout-scoped glob-0 claim now says so explicitly); wire/defer decision has blob-pinned sources. |

## Re-open procedure (explicit extraction)

Extraction is an owned decision, never a side effect:

1. `git show origin/master:fear-ai-sim/<file> > <target>` and cite the blob id in the commit.
2. Implement/test the V8 integration (legacy files are evidence, not drop-in V8 modules).
3. Move the ledger row to `IMPLEMENTED_AND_VERIFIED` **and** update this manifest plus
   `tests/source-absent-reconciliation.test.js` — the guard's "not extracted" assertion failing
   is the designed tripwire for exactly this act.

**Executed twice:** `Habituation`, 2026-09-23 — step 1 → `legacy/habituation.js` (sha256
`df02134b9227043baca61698a1a4f7d3b0cf6ce477667acd511e04a8d812db27`, recorded in
`legacy/PROVENANCE.md`, `-text` in `.gitattributes`); step 2 → `HabituationBook` in
`socialcore.js` consumed by `FEAR_EVENT_RAISED`, pinned by `tests/habituation-reopen.test.js`;
step 3 → row `IMPLEMENTED_AND_VERIFIED`, manifest and both guards updated in the same change.

**Second:** `Hysteresis`, same day — step 1 → `legacy/hysteresis.js` (sha256
`40e5cb26595ff5c33b9ffc11c17816fdbcc1ff56615d20c334149abaf59a3da5`, blob
`208cbffc038a04a901b262024d5ad414b9dcdcd9`, recorded in `legacy/PROVENANCE.md`); step 2 →
`HysteresisBook` in `socialcore.js` consumed by `FEAR_EVENT_RAISED`, every real transition a
canonical `FEAR_STATE_TRANSITION` event, pinned by `tests/hysteresis-reopen.test.js`; step 3 →
row `IMPLEMENTED_AND_VERIFIED`, manifest and both guards updated in the same change.
