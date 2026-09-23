# Legacy source extraction — provenance

Files in this directory are **byte-exact extractions** from the legacy monorepo tree on
`origin/master` (branch `master`, subtree `fear-ai-sim/`), extracted under
`RESP-SOURCE-ABSENT-RECONCILIATION-001`'s documented re-open procedure
(`docs/SOURCE_ABSENT_RECONCILIATION.md`). They are *evidence and reference* — V8 integrations
live in the production modules and are pinned by their own test suites; nothing here is
imported by production code.

| file | upstream path | blob | sha256 | extracted |
| --- | --- | --- | --- | --- |
| `legacy/habituation.js` | `origin/master:fear-ai-sim/` + `habituation.js` | `df69efd8bf62c1b7ac38161fcdb9e9909e764c5d` | `df02134b9227043baca61698a1a4f7d3b0cf6ce477667acd511e04a8d812db27` | 2026-09-23 |
| `legacy/hysteresis.js` | `origin/master:fear-ai-sim/` + `hysteresis.js` | `208cbffc038a04a901b262024d5ad414b9dcdcd9` | `40e5cb26595ff5c33b9ffc11c17816fdbcc1ff56615d20c334149abaf59a3da5` | 2026-09-23 |
| `legacy/neuralfear.js` | `origin/master:fear-ai-sim/` + `neuralfear.js` | `b521978dcb05a29569bd51a905143f2e61c7e0be` | `9b397180b7aad56f29c0a2c7197d832229b5b9f16f23e1644be6086ed2e4504c` | 2026-09-23 |
| `legacy/neuralnet.js` | `origin/master:fear-ai-sim/` + `neuralnet.js` | `3d320bb2f8fd6d23dd16c78bf785804cd418dc41` | `9218cbde832e30093cce32ac29246eab8acb8f15b48fb04249d25b511d924a63` | 2026-09-23 |
| `legacy/fearcore.js` | `origin/master:fear-ai-sim/` + `fearcore.js` | `185494c831a6688a70aa4d143e18757a7cceb7eb` | `d5a94c963de945f054918004ecf0493789b1bccdac35879a040b6b65c10496ab` | 2026-09-23 |
| `legacy/brain.js` | `origin/master:fear-ai-sim/` + `brain.js` | `163dfa7a184fda3e831b19ab7fa8cb65f02b3b1e` | `b35aa3952b2650492a2b9f4d025a7132c23c09a62a42835a3ed0b6fe1006d3d6` | 2026-09-23 |
| `legacy/simulation.js` | `origin/master:fear-ai-sim/` + `simulation.js` | `2cc0c2dc991362fece0afea05150bcd988fe4cb2` | `3b91c4dc778efea806ed47e704e02c2ecc65ab016819d4cb08d608108bd90ef5` | 2026-09-23 |
| `legacy/agent.js` | `origin/master:fear-ai-sim/` + `agent.js` | `f3815a84736b04afc592ee3fd8652464e898b148` | `5e208a01a8840af4976c7c3db2f48106a861115c049bc472b143a13e779d847c` | 2026-09-23 |
| `legacy/learningagent.js` | `origin/master:fear-ai-sim/` + `learningagent.js` | `562faea5106f6cff3ccdc9cecb7b3dd7a0d2a7c6` | `f06f44f3090879c41789300d98579515abd936f9933fd61d7b70bfa0e4915eb7` | 2026-09-23 |

Extraction command (reproduce and diff against the sha256 above):

```sh
git show origin/master:fear-ai-sim/habituation.js | sha256sum
git show origin/master:fear-ai-sim/hysteresis.js | sha256sum
git show origin/master:fear-ai-sim/neuralfear.js | sha256sum
git show origin/master:fear-ai-sim/neuralnet.js | sha256sum
git show origin/master:fear-ai-sim/fearcore.js | sha256sum
git show origin/master:fear-ai-sim/brain.js | sha256sum
git show origin/master:fear-ai-sim/simulation.js | sha256sum
git show origin/master:fear-ai-sim/agent.js | sha256sum
git show origin/master:fear-ai-sim/learningagent.js | sha256sum
```

Byte-exactness of every file in this directory is asserted on each gate run by
`tests/habituation-reopen.test.js`, `tests/hysteresis-reopen.test.js`,
`tests/neural-fear-reopen.test.js`, `tests/fearcore-reopen.test.js` and
`tests/simulation-agents-combat-reopen.test.js`
(and `.gitattributes` marks `legacy/**` as `-text` so no
line-ending conversion can ever touch the bytes).

Wall-clock note: the legacy sources use `Date.now()`; V8 integration replaces the wall clock
with the society's world time (`this.now()`), per the repository's no-wall-clock rule for
production modules.
